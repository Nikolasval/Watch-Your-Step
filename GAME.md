# Shoe Run

An endless-runner where a running shoe has to avoid stepping in it. Jump over poop piles,
duck under (or hop) flies, and survive as long as possible while the pace keeps ramping up.

## How to play

- **Space / ArrowUp / W / Enter** — jump (tap again while airborne to queue a jump input)
- **ArrowDown / S** — duck (also fast-falls you back to the ground while airborne)
- **Ctrl** (held) — boost: doubles scroll speed and score gain, raises the speed cap
- **M** — mute
- **Touch/mouse** — tap the top of the canvas to jump, tap the bottom strip to duck
- On the start/game-over screen, jump input restarts the run

Two sliders above the canvas (`Flies` / `Piles`) scale how often each obstacle type spawns,
0.1x–3x. Score converts to a day/night cycle every 700 points, and there's a localStorage
high score (`shoeRunHi`).

## Running it

- **Browser**: open [index.html](index.html) directly, or serve the folder statically.
- **Desktop app**: `npm start` runs it inside Electron ([main.js](main.js) creates the
  window, [preload.js](preload.js) is currently empty/unused).
- **Build installer**: `npm run build` (electron-builder → NSIS + portable .exe, output
  lands in [dist/](dist/), which is a build artifact and not meant to be edited or committed).

## Code layout

- [index.html](index.html) — page shell, the two obstacle-mix sliders, and the on-screen
  control hints. Loads **[js/game.js](js/game.js)**, which is the actual game.
- [js/game.js](js/game.js) — the whole game in one IIFE: canvas setup, tuning constants,
  procedural pixel-art sprites (shoe, poop pile, fly, background skeleton graveyard),
  input handling, the update loop (physics/spawning/collision), and the render loop.
- [css/style.css](css/style.css) — page/canvas/slider styling.
- [game.js](game.js) (repo root) and [skeleton_ground.html](skeleton_ground.html) — earlier
  prototype/scratch versions kept around for reference. **Not loaded by `index.html`** — if
  you're changing gameplay, edit `js/game.js`, not the root one.

## How the game works (for continuing development)

Everything lives in `js/game.js` as one big self-invoking function with no build step or
dependencies — just plain canvas 2D drawing.

- **Game loop**: a single `requestAnimationFrame` loop (`frame()`) calls `update(dt)` then
  `render()` every frame, with `dt` clamped to 0.05s so a backgrounded/stalled tab can't
  cause a huge catch-up jump. `paused` (set on window blur / tab hidden) freezes `update`
  but keeps rendering.
- **State machine**: `state` is one of `READY → PLAYING → OVER`, driven by `startOrJump()`.
- **Player physics**: gravity + jump velocity constants near the top of the file
  (`GRAVITY`, `JUMP_V`, etc.) control feel. Includes jump buffering (`BUFFER`, press jump
  slightly before landing) and coyote time (`COYOTE`, jump slightly after leaving ground),
  plus early-release jump cutting (`JUMP_CUT`) and fast-fall while ducking mid-air.
- **Obstacles**: `spawn()` randomly creates a `fly` (three height bands: must-duck,
  must-jump, or optional) or a `pile` (1–3 stacked pile segments, random big/small).
  Spawn gap scales with current speed so jumps stay makeable, and the `pile`/`fly` sliders
  (`pileMult`/`flyMult`) bias spawn frequency and gap.
- **Collision**: `playerBoxes()` / `obstacleBoxes()` return small hitboxes (not full
  sprite bounds) that are checked with simple AABB `overlap()`; any hit calls `die()`.
- **Difficulty ramp**: `speed` accelerates over time up to `MAX_SPEED` (doubled while
  boosting), and `score` is derived from distance traveled.
- **Day/night**: `night` (0–1) eases toward a target that flips every `NIGHT_EVERY` score
  points, and is used to `mix()` between `DAY`/`NIGHT` color palettes for sky, ground, and
  sprite colors.
- **Sprites**: the shoe, its duck pose, and background skeletons are drawn from ASCII
  bitmap maps (`SHOE_BODY`, `DUCK_BODY`, etc.) via `drawMap()`, scaled up by `PX`. Piles,
  flies, clouds, and the moon are drawn with plain canvas arcs/ellipses instead.
- **Audio**: `beep()` is a tiny WebAudio oscillator helper used for jump/score/death sounds,
  no audio files involved.

To tweak difficulty or feel, start with the tuning constants block near the top of the file
(`GRAVITY` through `NIGHT_EVERY`) before touching the update/render logic.
