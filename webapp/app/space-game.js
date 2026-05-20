"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";
import {
  AISpaceShip,
  SpaceShip,
  clamp,
  disposeWeightSnapshot,
} from "./space-ship";

const ROCK_LAYOUT = [
  { worldX: 0.2, worldY: 0.2, radius: 28 },
  { worldX: 0.36, worldY: 0.48, radius: 22 },
  { worldX: 0.48, worldY: 0.28, radius: 30 },
  { worldX: 0.58, worldY: 0.62, radius: 24 },
  { worldX: 0.7, worldY: 0.38, radius: 26 },
  { worldX: 0.8, worldY: 0.18, radius: 20 },
  { worldX: 0.84, worldY: 0.7, radius: 32 },
];
const COIN_LAYOUT = [
  { worldX: 0.16, worldY: 0.34, radius: 12 },
  { worldX: 0.3, worldY: 0.72, radius: 12 },
  { worldX: 0.46, worldY: 0.16, radius: 12 },
  { worldX: 0.62, worldY: 0.46, radius: 12 },
  { worldX: 0.74, worldY: 0.8, radius: 12 },
  { worldX: 0.88, worldY: 0.26, radius: 12 },
];
const AI_SHIP_COLORS = [
  ["#eef5ff", "#78daff"],
  ["#ffeccf", "#ffb15f"],
  ["#fce1ff", "#ff7ed4"],
  ["#ddffd8", "#71e28b"],
  ["#dff7ff", "#4ec7d8"],
  ["#f5ddff", "#ba7fff"],
  ["#fff7de", "#ffd24d"],
  ["#ebffef", "#7de6b0"],
  ["#ffe3e3", "#ff8c8c"],
  ["#e4f0ff", "#7ca7ff"],
  ["#f0ffe4", "#91d85f"],
  ["#fff0f0", "#f29d6f"],
];
const AI_SHIP_COUNT = 12;
const AI_ROUND_DURATION_MS = 60000;

function getShipFitness(ship) {
  return ship.score * 1000 - (ship.isDestroyed ? 0 : 1) + ship.y * 0.001;
}

function createRock({ worldX, worldY, radius }) {
  return {
    worldX,
    worldY,
    radius,
    rotation: Math.random() * Math.PI * 2,
    points: Array.from({ length: 8 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 8;
      const variance = 0.68 + Math.random() * 0.45;

      return { angle, variance };
    }),
  };
}

function getHudState(mode, ships) {
  if (mode === "ai") {
    const bestShip = ships.reduce((best, ship) => {
      if (!best) {
        return ship;
      }

      return getShipFitness(ship) > getShipFitness(best) ? ship : best;
    }, null);

    return {
      score: 0,
      bestScore: bestShip?.score ?? 0,
      aliveCount: ships.filter((ship) => !ship.isDestroyed).length,
      totalShips: ships.length,
    };
  }

  return {
    score: ships[0]?.score ?? 0,
    bestScore: 0,
    aliveCount: 0,
    totalShips: 0,
  };
}

export default function SpaceGame() {
  const canvasRef = useRef(null);
  const [mode, setMode] = useState(null);
  const [hud, setHud] = useState({
    score: 0,
    bestScore: 0,
    aliveCount: 0,
    totalShips: 0,
    generation: 0,
    timeLeft: AI_ROUND_DURATION_MS / 1000,
  });

  useEffect(() => {
    if (!mode) {
      return undefined;
    }

    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return undefined;
    }

    const isAiMode = mode === "ai";
    const ships = isAiMode
      ? AI_SHIP_COLORS.map(([bodyColor, accentColor], index) => {
          const hueOffset = 15 + index * 12;

          return new AISpaceShip({
            id: `ai-${index + 1}`,
            bodyColor,
            accentColor,
            thrusterColor: `hsla(${hueOffset}, 96%, 64%, 0.92)`,
            brakeColor: `hsla(${180 + hueOffset}, 92%, 72%, 0.82)`,
          });
        })
      : [
          new SpaceShip({
            id: "pilot",
            bodyColor: "#d9f6ff",
            accentColor: "#7ce1ff",
          }),
        ];

    const state = {
      width: 0,
      height: 0,
      rocks: [],
      coins: [],
      animationFrame: 0,
      lastTime: 0,
      devicePixelRatio: 1,
      ships,
      keyState: {
        accelerateInput: 0,
        turnInput: 0,
      },
      generation: isAiMode ? 1 : 0,
      roundStartTime: 0,
      roundDeadline: AI_ROUND_DURATION_MS,
      nextGenerationScheduled: false,
      championWeights: null,
      championScore: 0,
      lastReportedTimeLeft: AI_ROUND_DURATION_MS / 1000,
    };

    const keyMap = {
      ArrowUp: { control: "accelerateInput", value: 1 },
      KeyW: { control: "accelerateInput", value: 1 },
      ArrowDown: { control: "accelerateInput", value: -1 },
      KeyS: { control: "accelerateInput", value: -1 },
      ArrowLeft: { control: "turnInput", value: -1 },
      KeyA: { control: "turnInput", value: -1 },
      ArrowRight: { control: "turnInput", value: 1 },
      KeyD: { control: "turnInput", value: 1 },
    };

    const syncHud = () => {
      const baseHud = getHudState(mode, state.ships);

      setHud({
        ...baseHud,
        generation: state.generation,
        timeLeft: isAiMode
          ? Math.max(0, Math.ceil((state.roundDeadline - state.lastTime) / 1000))
          : 0,
      });
      state.lastReportedTimeLeft = isAiMode
        ? Math.max(0, Math.ceil((state.roundDeadline - state.lastTime) / 1000))
        : 0;
    };

    const selectBestShip = () =>
      state.ships.reduce((best, ship) => {
        if (!best) {
          return ship;
        }

        return getShipFitness(ship) > getShipFitness(best) ? ship : best;
      }, null);

    const createCoinWave = () =>
      COIN_LAYOUT.map((coin) => {
        const marginX = 0.08;
        const marginY = 0.1;
        const referenceShip = state.ships[0];
        const shipWorldX = state.width === 0 ? 0.5 : referenceShip.x / state.width;
        const shipWorldY = state.height === 0 ? 0.72 : referenceShip.y / state.height;
        let worldX = coin.worldX;
        let worldY = coin.worldY;
        let attempts = 0;

        while (attempts < 40) {
          const candidateX = clamp(
            coin.worldX + (Math.random() - 0.5) * 0.22,
            marginX,
            1 - marginX
          );
          const candidateY = clamp(
            coin.worldY + (Math.random() - 0.5) * 0.22,
            marginY,
            1 - marginY
          );
          const isNearShip =
            Math.hypot(candidateX - shipWorldX, candidateY - shipWorldY) < 0.12;
          const overlapsRock = state.rocks.some((rock) => {
            const dx = (candidateX - rock.worldX) * state.width;
            const dy = (candidateY - rock.worldY) * state.height;
            const minDistance = coin.radius + rock.radius + 18;

            return dx * dx + dy * dy < minDistance * minDistance;
          });

          if (!isNearShip && !overlapsRock) {
            worldX = candidateX;
            worldY = candidateY;
            break;
          }

          attempts += 1;
        }

        return {
          ...coin,
          worldX,
          worldY,
        };
      });

    const resize = () => {
      const previousWidth = state.width || window.innerWidth;
      const previousHeight = state.height || window.innerHeight;

      state.width = window.innerWidth;
      state.height = window.innerHeight;
      state.devicePixelRatio = window.devicePixelRatio || 1;

      canvas.width = Math.floor(state.width * state.devicePixelRatio);
      canvas.height = Math.floor(state.height * state.devicePixelRatio);
      canvas.style.width = `${state.width}px`;
      canvas.style.height = `${state.height}px`;

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(state.devicePixelRatio, state.devicePixelRatio);

      if (state.rocks.length === 0) {
        state.rocks = ROCK_LAYOUT.map(createRock);
      }

      if (state.ships[0].x === 0 && state.ships[0].y === 0) {
        resetRound(false);
      } else {
        const scaleX = state.width / previousWidth;
        const scaleY = state.height / previousHeight;

        state.ships.forEach((ship) => ship.scalePosition(scaleX, scaleY));
      }

      if (state.coins.length === 0) {
        state.coins = createCoinWave();
      }
    };

    const applyGenerationWeights = () => {
      if (!isAiMode) {
        return;
      }

      if (!state.championWeights) {
        state.championWeights = state.ships[0].getWeightSnapshot();
        state.championScore = state.ships[0].score;
        return;
      }

      state.ships.forEach((ship, index) => {
        if (index === 0) {
          ship.inheritFrom(state.championWeights, { mutate: false });
          return;
        }

        ship.inheritFrom(state.championWeights, {
          mutate: true,
          mutationScale: 0.04 + Math.random() * 0.07,
        });
      });
    };

    function resetRound(incrementGeneration) {
      const spawnCenterX = state.width / 2;
      const spawnBaseY = state.height * 0.72;

      if (isAiMode) {
        applyGenerationWeights();
      }

      state.ships.forEach((ship, index) => {
        if (isAiMode) {
          const row = Math.floor(index / 4);
          const column = index % 4;
          const spawnX = spawnCenterX + (column - 1.5) * 84 + (Math.random() - 0.5) * 28;
          const spawnY = spawnBaseY + row * 56 + (Math.random() - 0.5) * 24;

          ship.reset({
            x: spawnX,
            y: spawnY,
            angle: -Math.PI / 2 + (Math.random() - 0.5) * 0.45,
            score: state.championScore,
          });
        } else {
          ship.reset({
            x: spawnCenterX,
            y: spawnBaseY,
            angle: -Math.PI / 2,
          });
        }
      });

      state.coins = createCoinWave();
      state.nextGenerationScheduled = false;

      if (isAiMode) {
        if (incrementGeneration) {
          state.generation += 1;
        }

        state.roundStartTime = state.lastTime;
        state.roundDeadline = state.lastTime + AI_ROUND_DURATION_MS;
        state.lastReportedTimeLeft = AI_ROUND_DURATION_MS / 1000;
      }
    }

    const advanceGeneration = () => {
      if (!isAiMode || state.nextGenerationScheduled) {
        return;
      }

      state.nextGenerationScheduled = true;

      const bestShip = selectBestShip();

      if (bestShip) {
        if (state.championWeights) {
          disposeWeightSnapshot(state.championWeights);
        }

        state.championWeights = bestShip.getWeightSnapshot();
        state.championScore = bestShip.score;
      }

      resetRound(true);
      syncHud();
    };

    const setControls = (code, pressed) => {
      const binding = keyMap[code];

      if (!binding || isAiMode) {
        return;
      }

      state.keyState[binding.control] = pressed
        ? binding.value
        : state.keyState[binding.control] === binding.value
          ? 0
          : state.keyState[binding.control];
    };

    const drawBackground = () => {
      const gradient = context.createLinearGradient(0, 0, 0, state.height);
      gradient.addColorStop(0, "#050816");
      gradient.addColorStop(0.55, "#09172b");
      gradient.addColorStop(1, "#1a0f2e");

      context.fillStyle = gradient;
      context.fillRect(0, 0, state.width, state.height);

      const glow = context.createRadialGradient(
        state.width * 0.5,
        state.height * 0.28,
        10,
        state.width * 0.5,
        state.height * 0.28,
        state.width * 0.5
      );
      glow.addColorStop(0, "rgba(110, 198, 255, 0.22)");
      glow.addColorStop(1, "rgba(110, 198, 255, 0)");

      context.fillStyle = glow;
      context.fillRect(0, 0, state.width, state.height);
    };

    const drawRocks = () => {
      for (const rock of state.rocks) {
        const x = rock.worldX * state.width;
        const y = rock.worldY * state.height;

        context.save();
        context.translate(x, y);
        context.rotate(rock.rotation);

        context.fillStyle = "#556579";
        context.strokeStyle = "rgba(202, 223, 255, 0.28)";
        context.lineWidth = 2;
        context.beginPath();

        rock.points.forEach((point, index) => {
          const px = Math.cos(point.angle) * rock.radius * point.variance;
          const py = Math.sin(point.angle) * rock.radius * point.variance;

          if (index === 0) {
            context.moveTo(px, py);
          } else {
            context.lineTo(px, py);
          }
        });

        context.closePath();
        context.fill();
        context.stroke();

        context.fillStyle = "rgba(255, 255, 255, 0.08)";
        context.beginPath();
        context.arc(-rock.radius * 0.18, -rock.radius * 0.22, rock.radius * 0.26, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    };

    const drawCoins = (time) => {
      for (const coin of state.coins) {
        const x = coin.worldX * state.width;
        const y = coin.worldY * state.height;
        const pulse = 1 + Math.sin(time * 0.006 + coin.worldX * 10) * 0.08;

        context.save();
        context.translate(x, y);
        context.scale(pulse, pulse);

        context.fillStyle = "#ffd35a";
        context.strokeStyle = "#fff1b2";
        context.lineWidth = 2;
        context.beginPath();
        context.arc(0, 0, coin.radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();

        context.fillStyle = "rgba(255, 244, 196, 0.7)";
        context.beginPath();
        context.arc(-coin.radius * 0.25, -coin.radius * 0.28, coin.radius * 0.35, 0, Math.PI * 2);
        context.fill();

        context.restore();
      }
    };

    const drawDestroyedOverlay = () => {
      const ship = state.ships[0];

      if (isAiMode || !ship.isDestroyed) {
        return;
      }

      context.fillStyle = "#ffb8b8";
      context.font = "700 34px var(--font-geist-sans)";
      context.textAlign = "center";
      context.fillText("Ship Destroyed", state.width / 2, state.height * 0.52);

      context.fillStyle = "rgba(244, 251, 255, 0.78)";
      context.font = "500 18px var(--font-geist-sans)";
      context.fillText("Choose a mode to fly again", state.width / 2, state.height * 0.57);
    };

    const render = (time) => {
      const delta = Math.min((time - state.lastTime) || 16, 32);
      state.lastTime = time;

      if (!isAiMode) {
        state.ships[0].setControls(state.keyState);
      }

      for (const ship of state.ships) {
        if (isAiMode && ship instanceof AISpaceShip) {
          ship.decide(
            {
              coins: state.coins,
              rocks: state.rocks,
              width: state.width,
              height: state.height,
            },
            time
          );
        }

        ship.updateMotion(delta, {
          width: state.width,
          height: state.height,
        });
        ship.updateTrail(delta, time);
      }

      let hudNeedsSync = false;

      for (const ship of state.ships) {
        if (ship.applyIdlePenalty(time)) {
          hudNeedsSync = true;
        }

        const result = ship.collectCoins(state.coins, {
          width: state.width,
          height: state.height,
        });

        if (result.collected > 0) {
          state.coins = result.coins;
          hudNeedsSync = true;
        }

        if (
          ship.detectRockCollision(
            state.rocks,
            {
              width: state.width,
              height: state.height,
            },
            time
          )
        ) {
          hudNeedsSync = true;
        }
      }

      if (state.coins.length === 0) {
        state.coins = createCoinWave();
        hudNeedsSync = true;
      }

      if (isAiMode) {
        const aliveCount = state.ships.filter((ship) => !ship.isDestroyed).length;
        const timeExpired = time >= state.roundDeadline;
        const nextTimeLeft = Math.max(0, Math.ceil((state.roundDeadline - time) / 1000));

        if (aliveCount === 0 || timeExpired) {
          advanceGeneration();
          hudNeedsSync = false;
        } else if (nextTimeLeft !== state.lastReportedTimeLeft) {
          hudNeedsSync = true;
        }
      }

      drawBackground();

      for (const ship of state.ships) {
        ship.drawTrail(context);
      }

      drawRocks();
      drawCoins(time);

      for (const ship of state.ships) {
        ship.drawImpact(context, time);
        ship.draw(context);
        ship.drawScoreLabel(context);
      }

      drawDestroyedOverlay();

      if (hudNeedsSync) {
        syncHud();
      }

      state.animationFrame = window.requestAnimationFrame(render);
    };

    const handleKeyDown = (event) => {
      setControls(event.code, true);
    };

    const handleKeyUp = (event) => {
      setControls(event.code, false);
    };

    resize();
    syncHud();
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    state.animationFrame = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(state.animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      state.ships.forEach((ship) => {
        if (ship instanceof AISpaceShip) {
          ship.dispose();
        }
      });
      if (state.championWeights) {
        disposeWeightSnapshot(state.championWeights);
      }
    };
  }, [mode]);

  if (!mode) {
    return (
      <section className={styles.startScreen} aria-label="Start screen">
        <div className={styles.startCard}>
          <p className={styles.startEyebrow}>Sector A-01</p>
          <h2>Space Game Command</h2>
          <p className={styles.startCopy}>
            Pilot manually with the arrow keys or WASD, or launch twelve randomized
            TensorFlow.js ships and watch how each one reacts to rocks and coins.
          </p>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.startButton}
              onClick={() => {
              setHud({
                score: 0,
                bestScore: 0,
                aliveCount: 0,
                totalShips: 0,
                generation: 0,
                timeLeft: 0,
              });
              setMode("player");
            }}
            >
              Start a New Game
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                setHud({
                  score: 0,
                  bestScore: 0,
                  aliveCount: AI_SHIP_COUNT,
                  totalShips: AI_SHIP_COUNT,
                  generation: 1,
                  timeLeft: AI_ROUND_DURATION_MS / 1000,
                });
                setMode("ai");
              }}
            >
              Train AI
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <canvas ref={canvasRef} aria-label="Space game canvas" />
      <div className={styles.scoreboardPanel}>
        {mode === "ai" ? (
          <div className={styles.hudGrid} aria-label="AI training dashboard">
            <div className={styles.scoreboard}>
              <span className={styles.scoreLabel}>Generation</span>
              <strong className={styles.scoreValue}>{hud.generation}</strong>
            </div>
            <div className={styles.scoreboard}>
              <span className={styles.scoreLabel}>Mode</span>
              <strong className={styles.scoreValue}>AI</strong>
            </div>
            <div className={styles.scoreboard}>
              <span className={styles.scoreLabel}>Timer</span>
              <strong className={styles.scoreValue}>{hud.timeLeft}s</strong>
            </div>
            <div className={styles.scoreboard}>
              <span className={styles.scoreLabel}>Alive</span>
              <strong className={styles.scoreValue}>
                {hud.aliveCount}/{hud.totalShips}
              </strong>
            </div>
            <div className={styles.scoreboard}>
              <span className={styles.scoreLabel}>Best Score</span>
              <strong className={styles.scoreValue}>{hud.bestScore}</strong>
            </div>
          </div>
        ) : (
          <div className={styles.scoreboard} aria-label={`Score: ${hud.score}`}>
            <span className={styles.scoreLabel}>Score</span>
            <strong className={styles.scoreValue}>{hud.score}</strong>
          </div>
        )}
      </div>
      <div className={styles.controlsPanel}>
        <button
          type="button"
          className={styles.ghostButton}
          onClick={() => {
            setMode(null);
            setHud({
              score: 0,
              bestScore: 0,
              aliveCount: 0,
              totalShips: 0,
              generation: 0,
              timeLeft: 0,
            });
          }}
        >
          Exit
        </button>
      </div>
    </>
  );
}
