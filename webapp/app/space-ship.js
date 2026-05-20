import * as tf from "@tensorflow/tfjs";

export const SHIP_COLLISION_RADIUS = 18;
export const AI_INPUT_SIZE = 16;
export const AI_OUTPUT_SIZE = 3;

const TRAIL_LIMIT = 180;
const DECISION_INTERVAL_MIN = 70;
const DECISION_INTERVAL_VARIANCE = 50;
const COIN_SCORE_VALUE = 100;
const ROCK_HIT_PENALTY = 1000;
const ROCK_HIT_COOLDOWN_MS = 900;
const IDLE_MOVEMENT_THRESHOLD = 6;
const IDLE_GRACE_MS = 1200;
const IDLE_PENALTY = 1;
const IDLE_PENALTY_INTERVAL_MS = 1000;
const MUTATION_APPLY_RATE = 0.18;

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeDistance(dx, dy, width, height) {
  return [dx / Math.max(width, 1), dy / Math.max(height, 1)];
}

function getClosestRelativeTargets(targets, count, ship, width, height) {
  return [...targets]
    .map((target) => {
      const x = target.worldX * width;
      const y = target.worldY * height;
      const dx = x - ship.x;
      const dy = y - ship.y;

      return { dx, dy, distance: Math.hypot(dx, dy) };
    })
    .sort((left, right) => left.distance - right.distance)
    .slice(0, count)
    .flatMap((target) => normalizeDistance(target.dx, target.dy, width, height))
    .concat(Array(Math.max(0, count * 2 - Math.min(targets.length, count) * 2)).fill(0));
}

function createRandomizedModel() {
  const model = tf.sequential();

  model.add(
    tf.layers.dense({
      inputShape: [AI_INPUT_SIZE],
      units: 12,
      activation: "tanh",
      useBias: true,
    })
  );
  model.add(
    tf.layers.dense({
      units: 8,
      activation: "tanh",
      useBias: true,
    })
  );
  model.add(
    tf.layers.dense({
      units: AI_OUTPUT_SIZE,
      activation: "sigmoid",
      useBias: true,
    })
  );

  const weightShapes = model.getWeights().map((weight) => weight.shape);
  const variance = 0.28 + Math.random() * 0.5;
  const randomizedWeights = weightShapes.map((shape, index) =>
    index % 2 === 0
      ? tf.randomNormal(shape, 0, variance)
      : tf.randomUniform(shape, -0.35, 0.35)
  );

  model.setWeights(randomizedWeights);
  randomizedWeights.forEach((weight) => weight.dispose());

  return model;
}

function cloneWeights(model) {
  return model.getWeights().map((weight) => weight.clone());
}

function disposeWeights(weights) {
  weights.forEach((weight) => weight.dispose());
}

function createMutatedWeights(sourceWeights, mutationScale = 0.12) {
  return sourceWeights.map((weight, index) =>
    tf.tidy(() => {
      const mutationMask = tf
        .randomUniform(weight.shape)
        .less(tf.fill(weight.shape, MUTATION_APPLY_RATE))
        .cast("float32");

      if (index % 2 === 1) {
        const biasNoise = tf.randomUniform(weight.shape, -mutationScale, mutationScale);
        return weight.add(biasNoise.mul(mutationMask));
      }

      const weightNoise = tf.randomNormal(weight.shape, 0, mutationScale);
      return weight.add(weightNoise.mul(mutationMask));
    })
  );
}

export class SpaceShip {
  constructor({
    id,
    bodyColor = "#d9f6ff",
    accentColor = "#7ce1ff",
    thrusterColor = "rgba(255, 166, 77, 0.9)",
    brakeColor = "rgba(118, 219, 255, 0.82)",
  }) {
    this.id = id;
    this.bodyColor = bodyColor;
    this.accentColor = accentColor;
    this.thrusterColor = thrusterColor;
    this.brakeColor = brakeColor;
    this.score = 0;
    this.reset({ x: 0, y: 0 });
  }

  reset({ x, y, angle = -Math.PI / 2, preserveScore = false, score }) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.velocityX = 0;
    this.velocityY = 0;
    this.accelerateInput = 0;
    this.turnInput = 0;
    this.trail = [];
    this.lastTrailSpawn = 0;
    this.lastTrailX = x;
    this.lastTrailY = y;
    this.isDestroyed = false;
    this.flashUntil = 0;
    this.rockCollisionCooldownUntil = 0;
    this.idleAnchorX = x;
    this.idleAnchorY = y;
    this.idleStartedAt = 0;
    this.lastIdlePenaltyAt = 0;
    this.nextDecisionAt = 0;

    if (typeof score === "number") {
      this.score = score;
    } else if (!preserveScore) {
      this.score = 0;
    }
  }

  scalePosition(scaleX, scaleY) {
    this.x *= scaleX;
    this.y *= scaleY;
    this.lastTrailX *= scaleX;
    this.lastTrailY *= scaleY;
    this.idleAnchorX *= scaleX;
    this.idleAnchorY *= scaleY;
    this.trail = this.trail.map((marker) => ({
      ...marker,
      x: marker.x * scaleX,
      y: marker.y * scaleY,
    }));
  }

  setControls({ accelerateInput = this.accelerateInput, turnInput = this.turnInput }) {
    this.accelerateInput = clamp(accelerateInput, -1, 1);
    this.turnInput = clamp(turnInput, -1, 1);
  }

  updateMotion(delta, bounds) {
    if (this.isDestroyed) {
      return;
    }

    this.angle += this.turnInput * 0.0045 * delta;
    this.velocityX += Math.cos(this.angle) * this.accelerateInput * 0.03 * delta;
    this.velocityY += Math.sin(this.angle) * this.accelerateInput * 0.03 * delta;

    this.x = clamp(this.x + this.velocityX * 0.016, 48, bounds.width - 48);
    this.y = clamp(this.y + this.velocityY * 0.016, 64, bounds.height - 64);
  }

  updateTrail(delta, time) {
    this.trail = this.trail
      .map((marker) => ({
        ...marker,
        age: marker.age + delta,
      }))
      .filter((marker) => marker.age < marker.life);

    if (this.isDestroyed) {
      return;
    }

    const speed = Math.hypot(this.velocityX, this.velocityY);
    const thrusterOffsetX = -Math.cos(this.angle) * 18;
    const thrusterOffsetY = -Math.sin(this.angle) * 18;
    const trailX = this.x + thrusterOffsetX;
    const trailY = this.y + thrusterOffsetY;
    const distanceSinceLastMarker = Math.hypot(
      trailX - this.lastTrailX,
      trailY - this.lastTrailY
    );

    if (speed < 0.16 || time - this.lastTrailSpawn < 55 || distanceSinceLastMarker < 16) {
      return;
    }

    this.lastTrailSpawn = time;
    this.lastTrailX = trailX;
    this.lastTrailY = trailY;

    this.trail.push({
      x: trailX,
      y: trailY,
      age: 0,
      life: 10000 + Math.random() * 600,
      radius: 4 + Math.min(speed * 2.2, 5),
    });

    if (this.trail.length > TRAIL_LIMIT) {
      this.trail.splice(0, this.trail.length - TRAIL_LIMIT);
    }
  }

  applyIdlePenalty(time) {
    if (this.isDestroyed) {
      return false;
    }

    const distanceFromIdleAnchor = Math.hypot(
      this.x - this.idleAnchorX,
      this.y - this.idleAnchorY
    );

    if (distanceFromIdleAnchor >= IDLE_MOVEMENT_THRESHOLD) {
      this.idleAnchorX = this.x;
      this.idleAnchorY = this.y;
      this.idleStartedAt = time;
      this.lastIdlePenaltyAt = time;
      return false;
    }

    if (this.idleStartedAt === 0) {
      this.idleStartedAt = time;
      this.lastIdlePenaltyAt = time;
      return false;
    }

    if (
      time - this.idleStartedAt >= IDLE_GRACE_MS &&
      time - this.lastIdlePenaltyAt >= IDLE_PENALTY_INTERVAL_MS
    ) {
      this.score -= IDLE_PENALTY;
      this.lastIdlePenaltyAt = time;
      return true;
    }

    return false;
  }

  collectCoins(coins, bounds) {
    if (this.isDestroyed) {
      return { coins, collected: 0 };
    }

    let collected = 0;

    const remainingCoins = coins.filter((coin) => {
      const coinX = coin.worldX * bounds.width;
      const coinY = coin.worldY * bounds.height;
      const dx = coinX - this.x;
      const dy = coinY - this.y;
      const collisionDistance = coin.radius + SHIP_COLLISION_RADIUS;

      if (dx * dx + dy * dy <= collisionDistance * collisionDistance) {
        collected += 1;
        return false;
      }

      return true;
    });

    this.score += collected * COIN_SCORE_VALUE;

    return { coins: remainingCoins, collected };
  }

  detectRockCollision(rocks, bounds, time) {
    if (this.isDestroyed || time < this.rockCollisionCooldownUntil) {
      return false;
    }

    for (const rock of rocks) {
      const rockX = rock.worldX * bounds.width;
      const rockY = rock.worldY * bounds.height;
      const dx = rockX - this.x;
      const dy = rockY - this.y;
      const collisionDistance = rock.radius + SHIP_COLLISION_RADIUS;

      if (dx * dx + dy * dy <= collisionDistance * collisionDistance) {
        this.score -= ROCK_HIT_PENALTY;
        this.flashUntil = time + ROCK_HIT_COOLDOWN_MS;
        this.rockCollisionCooldownUntil = time + ROCK_HIT_COOLDOWN_MS;
        return true;
      }
    }

    return false;
  }

  drawTrail(context) {
    for (const marker of this.trail) {
      const progress = marker.age / marker.life;
      const alpha = Math.pow(1 - progress, 1.35) * 0.4;
      const growth = Math.exp(progress * 1.35);
      const radius = marker.radius * growth;

      context.save();
      context.globalAlpha = alpha;
      context.fillStyle = progress < 0.45 ? this.accentColor : "#6c90b2";
      context.beginPath();
      context.arc(marker.x, marker.y, radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  drawImpact(context, time) {
    if (time >= this.flashUntil) {
      return;
    }

    context.save();
    context.strokeStyle = `rgba(255, 96, 96, ${0.25 + ((this.flashUntil - time) / ROCK_HIT_COOLDOWN_MS) * 0.35})`;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(this.x, this.y, 30, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  draw(context) {
    context.save();
    context.translate(this.x, this.y);
    context.rotate(this.angle + Math.PI / 2);
    context.globalAlpha = this.isDestroyed ? 0.3 : 1;

    context.fillStyle = this.bodyColor;
    context.strokeStyle = this.accentColor;
    context.lineWidth = 2;

    context.beginPath();
    context.moveTo(0, -24);
    context.lineTo(16, 18);
    context.lineTo(0, 10);
    context.lineTo(-16, 18);
    context.closePath();
    context.fill();
    context.stroke();

    context.fillStyle = "rgba(255, 255, 255, 0.45)";
    context.beginPath();
    context.arc(0, -4, 6, 0, Math.PI * 2);
    context.fill();

    if (this.accelerateInput > 0) {
      context.fillStyle = this.thrusterColor;
      context.beginPath();
      context.moveTo(-6, 18);
      context.lineTo(0, 30 + Math.random() * 10);
      context.lineTo(6, 18);
      context.closePath();
      context.fill();
    }

    if (this.accelerateInput < 0) {
      const brakePulse = Math.random() * 6;

      context.fillStyle = this.brakeColor;
      context.beginPath();
      context.moveTo(-4, -10);
      context.lineTo(-14 - brakePulse, -4);
      context.lineTo(-4, 0);
      context.closePath();
      context.fill();

      context.beginPath();
      context.moveTo(4, -10);
      context.lineTo(14 + brakePulse, -4);
      context.lineTo(4, 0);
      context.closePath();
      context.fill();
    }

    context.restore();
  }

  drawScoreLabel(context) {
    context.save();
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.font = "700 14px var(--font-geist-sans)";
    context.lineWidth = 4;
    context.strokeStyle = "rgba(7, 14, 24, 0.82)";
    context.fillStyle = this.accentColor;
    context.strokeText(String(this.score), this.x, this.y - 30);
    context.fillText(String(this.score), this.x, this.y - 30);
    context.restore();
  }
}

export class AISpaceShip extends SpaceShip {
  constructor(options) {
    super(options);
    this.model = createRandomizedModel();
    this.decisionInterval =
      DECISION_INTERVAL_MIN + Math.random() * DECISION_INTERVAL_VARIANCE;
  }

  buildInputs({ coins, rocks, width, height }) {
    const coinInputs = getClosestRelativeTargets(coins, 3, this, width, height);
    const rockInputs = getClosestRelativeTargets(rocks, 3, this, width, height);
    const headingInputs = [Math.cos(this.angle), Math.sin(this.angle)];
    const velocityInputs = normalizeDistance(this.velocityX, this.velocityY, width, height);

    return [...coinInputs, ...rockInputs, ...headingInputs, ...velocityInputs];
  }

  decide(environment, time) {
    if (this.isDestroyed || time < this.nextDecisionAt) {
      return;
    }

    this.nextDecisionAt = time + this.decisionInterval;

    const [accelerateOutput, rotateLeftOutput, rotateRightOutput] = tf.tidy(() => {
      const inputTensor = tf.tensor2d([this.buildInputs(environment)]);
      const outputTensor = this.model.predict(inputTensor);

      return Array.from(outputTensor.dataSync());
    });

    const turnInput =
      rotateLeftOutput > rotateRightOutput && rotateLeftOutput > 0.5
        ? -1
        : rotateRightOutput > rotateLeftOutput && rotateRightOutput > 0.5
          ? 1
          : 0;

    this.setControls({
      accelerateInput: accelerateOutput > 0.5 ? 1 : 0,
      turnInput,
    });
  }

  getWeightSnapshot() {
    return cloneWeights(this.model);
  }

  setWeights(weights) {
    this.model.setWeights(weights);
  }

  inheritFrom(weights, { mutate = true, mutationScale = 0.12 } = {}) {
    const nextWeights = mutate ? createMutatedWeights(weights, mutationScale) : cloneWeights({ getWeights: () => weights });

    this.model.setWeights(nextWeights);
    disposeWeights(nextWeights);
  }

  dispose() {
    this.model.dispose();
  }
}

export function cloneWeightSnapshot(weights) {
  return weights.map((weight) => weight.clone());
}

export function disposeWeightSnapshot(weights) {
  disposeWeights(weights);
}
