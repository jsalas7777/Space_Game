# Space Game

Space Game is a browser-based spaceship simulation built with Next.js, React, and TensorFlow.js. It includes two play modes:

- `Pilot mode`: a human-controlled ship using keyboard input.
- `AI mode`: a population of ships that learns to survive, collect coins, and avoid rocks over repeated generations.

The project is a compact experiment in reinforcement-by-selection: multiple AI ships run at once, the best performer is selected at the end of each round, and its neural-network weights are cloned and mutated to seed the next generation.

Blog post: [AI Learns to Play Spaceship](https://www.eridutechnologies.com/projects/ai-learns-to-play-spaceship)

## How It Was Built

The app lives in [`webapp`](./webapp) and uses:

- `Next.js 16` with the App Router for the web application shell.
- `React 19` for the client-side game UI.
- `HTML canvas` for rendering the ships, rocks, coins, and effects.
- `TensorFlow.js` for the AI ship neural-network models and weight mutation logic.

Core implementation details:

- [`webapp/app/space-game.js`](./webapp/app/space-game.js) manages the game loop, rendering, HUD state, AI rounds, and generation lifecycle.
- [`webapp/app/space-ship.js`](./webapp/app/space-ship.js) defines ship physics, scoring rules, collision handling, and the TensorFlow.js model logic used by AI ships.
- [`webapp/app/page.js`](./webapp/app/page.js) mounts the game and links to the blog page.

The AI uses a small dense neural network fed with normalized spatial inputs. Each generation runs for a fixed round duration, the highest-fitness ship is selected as the champion, and mutated copies of its weights are used to produce the next wave of AI ships.

## Running Locally

From the `webapp` directory:

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Controls

- `W` / `ArrowUp`: accelerate
- `S` / `ArrowDown`: brake / reverse thrust
- `A` / `ArrowLeft`: turn left
- `D` / `ArrowRight`: turn right

## Project Structure

```text
.
├── README.md
└── webapp
    ├── app
    │   ├── page.js
    │   ├── space-game.js
    │   └── space-ship.js
    └── package.json
```
