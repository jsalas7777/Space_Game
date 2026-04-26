"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

const SHIP_COLLISION_RADIUS = 18;
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function SpaceGame() {
  const canvasRef = useRef(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [score, setScore] = useState(0);

  useEffect(() => {
    if (!hasStarted) {
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

    const state = {
      width: 0,
      height: 0,
      shipX: 0,
      shipY: 0,
      shipAngle: 0,
      velocityX: 0,
      velocityY: 0,
      accelerateInput: 0,
      turnInput: 0,
      rocks: [],
      coins: [],
      animationFrame: 0,
      lastTime: 0,
      devicePixelRatio: 1,
      isDestroyed: false,
      flashUntil: 0,
    };

    const keyMap = {
      ArrowUp: { control: "accelerate", value: 1 },
      KeyW: { control: "accelerate", value: 1 },
      ArrowDown: { control: "accelerate", value: -1 },
      KeyS: { control: "accelerate", value: -1 },
      ArrowLeft: { control: "turn", value: -1 },
      KeyA: { control: "turn", value: -1 },
      ArrowRight: { control: "turn", value: 1 },
      KeyD: { control: "turn", value: 1 },
    };

    const createRock = ({ worldX, worldY, radius }) => ({
      worldX,
      worldY,
      radius,
      rotation: Math.random() * Math.PI * 2,
      points: Array.from({ length: 8 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 8;
        const variance = 0.68 + Math.random() * 0.45;

        return { angle, variance };
      }),
    });

    const resize = () => {
      state.width = window.innerWidth;
      state.height = window.innerHeight;
      state.devicePixelRatio = window.devicePixelRatio || 1;

      canvas.width = Math.floor(state.width * state.devicePixelRatio);
      canvas.height = Math.floor(state.height * state.devicePixelRatio);
      canvas.style.width = `${state.width}px`;
      canvas.style.height = `${state.height}px`;

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(state.devicePixelRatio, state.devicePixelRatio);

      state.shipX = state.width / 2;
      state.shipY = state.height * 0.72;
      state.shipAngle = -Math.PI / 2;

      if (state.rocks.length === 0) {
        state.rocks = ROCK_LAYOUT.map(createRock);
      }

      if (state.coins.length === 0) {
        state.coins = COIN_LAYOUT.map((coin) => ({ ...coin }));
      }
    };

    const setControls = (code, pressed) => {
      const binding = keyMap[code];

      if (!binding) {
        return;
      }

      if (binding.control === "turn") {
        state.turnInput = pressed ? binding.value : state.turnInput === binding.value ? 0 : state.turnInput;
      } else {
        state.accelerateInput =
          pressed ? binding.value : state.accelerateInput === binding.value ? 0 : state.accelerateInput;
      }
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

    const drawShip = () => {
      context.save();
      context.translate(state.shipX, state.shipY);
      context.rotate(state.shipAngle + Math.PI / 2);
      context.globalAlpha = state.isDestroyed ? 0.35 : 1;

      context.fillStyle = "#d9f6ff";
      context.strokeStyle = "#7ce1ff";
      context.lineWidth = 2;

      context.beginPath();
      context.moveTo(0, -24);
      context.lineTo(16, 18);
      context.lineTo(0, 10);
      context.lineTo(-16, 18);
      context.closePath();
      context.fill();
      context.stroke();

      context.fillStyle = "rgba(124, 225, 255, 0.45)";
      context.beginPath();
      context.arc(0, -4, 6, 0, Math.PI * 2);
      context.fill();

      if (state.accelerateInput > 0) {
        context.fillStyle = "rgba(255, 166, 77, 0.9)";
        context.beginPath();
        context.moveTo(-6, 18);
        context.lineTo(0, 30 + Math.random() * 10);
        context.lineTo(6, 18);
        context.closePath();
        context.fill();
      }

      if (state.accelerateInput < 0) {
        const brakePulse = Math.random() * 6;

        context.fillStyle = "rgba(118, 219, 255, 0.82)";
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

    const collectCoins = () => {
      if (state.isDestroyed) {
        return;
      }

      state.coins = state.coins.filter((coin) => {
        const coinX = coin.worldX * state.width;
        const coinY = coin.worldY * state.height;
        const dx = coinX - state.shipX;
        const dy = coinY - state.shipY;
        const collisionDistance = coin.radius + SHIP_COLLISION_RADIUS;

        if (dx * dx + dy * dy <= collisionDistance * collisionDistance) {
          setScore((currentScore) => currentScore + 1);
          return false;
        }

        return true;
      });
    };

    const detectCollisions = (time) => {
      if (state.isDestroyed) {
        return;
      }

      for (const rock of state.rocks) {
        const rockX = rock.worldX * state.width;
        const rockY = rock.worldY * state.height;
        const dx = rockX - state.shipX;
        const dy = rockY - state.shipY;
        const collisionDistance = rock.radius + SHIP_COLLISION_RADIUS;

        if (dx * dx + dy * dy <= collisionDistance * collisionDistance) {
          state.isDestroyed = true;
          state.turnInput = 0;
          state.accelerateInput = 0;
          state.velocityX = 0;
          state.velocityY = 0;
          state.flashUntil = time + 900;
          break;
        }
      }
    };

    const drawDestroyedOverlay = (time) => {
      if (!state.isDestroyed) {
        return;
      }

      if (time < state.flashUntil) {
        context.fillStyle = `rgba(255, 96, 96, ${0.1 + ((state.flashUntil - time) / 900) * 0.22})`;
        context.fillRect(0, 0, state.width, state.height);
      }

      context.fillStyle = "#ffb8b8";
      context.font = "700 34px var(--font-geist-sans)";
      context.textAlign = "center";
      context.fillText("Ship Destroyed", state.width / 2, state.height * 0.52);

      context.fillStyle = "rgba(244, 251, 255, 0.78)";
      context.font = "500 18px var(--font-geist-sans)";
      context.fillText("Refresh to fly again", state.width / 2, state.height * 0.57);
    };

    const render = (time) => {
      const delta = Math.min((time - state.lastTime) || 16, 32);
      state.lastTime = time;

      if (!state.isDestroyed) {
        state.shipAngle += state.turnInput * 0.0045 * delta;
        state.velocityX += Math.cos(state.shipAngle) * state.accelerateInput * 0.03 * delta;
        state.velocityY += Math.sin(state.shipAngle) * state.accelerateInput * 0.03 * delta;

        state.shipX = clamp(state.shipX + state.velocityX * 0.016, 48, state.width - 48);
        state.shipY = clamp(state.shipY + state.velocityY * 0.016, 64, state.height - 64);
      }

      drawBackground();
      drawRocks();
      drawCoins(time);
      collectCoins();
      detectCollisions(time);
      drawShip();
      drawDestroyedOverlay(time);

      state.animationFrame = window.requestAnimationFrame(render);
    };

    const handleKeyDown = (event) => {
      setControls(event.code, true);
    };

    const handleKeyUp = (event) => {
      setControls(event.code, false);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    state.animationFrame = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(state.animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [hasStarted]);

  if (!hasStarted) {
    return (
      <section className={styles.startScreen} aria-label="Start screen">
        <div className={styles.startCard}>
          <p className={styles.startEyebrow}>Sector A-01</p>
          <h2>Space Game Command</h2>
          <p className={styles.startCopy}>
            Pilot the ship with the arrow keys or WASD and avoid the asteroid
            field.
          </p>
          <button
            type="button"
            className={styles.startButton}
            onClick={() => {
              setScore(0);
              setHasStarted(true);
            }}
          >
            Start a New Game
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <canvas ref={canvasRef} aria-label="Space game canvas" />
      <div className={styles.scoreboardPanel}>
        <div className={styles.scoreboard} aria-label={`Score: ${score}`}>
          <span className={styles.scoreLabel}>Score</span>
          <strong className={styles.scoreValue}>{score}</strong>
        </div>
      </div>
    </>
  );
}
