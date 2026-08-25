# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A classic Tetris implementation in vanilla JavaScript using the HTML5 Canvas API. No frameworks, no dependencies, no build process, no package.json.

## Running the game

There is no build/lint/test tooling. To run the game, just open `index.html` in a browser, or serve the directory statically:

```bash
python3 -m http.server 8000   # or: npx serve .   /  php -S localhost:8000
```

Then visit `http://localhost:8000`. There are no automated tests; verify changes by playing the game in a browser.

## Architecture

The game is three files that cooperate directly via the DOM — no modules, no bundler:

- `index.html` — DOM structure: main `#board` canvas (300×600, 10×20 grid of 30px blocks), a `#next-canvas` preview, HUD spans (`#score`, `#lines`, `#level`), and a shared `#overlay` used for both PAUSE and GAME OVER states.
- `style.css` — dark/retro arcade visual styling.
- `game.js` — all game logic in one file, using module-level `let` state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.) rather than a class or state container.

### Core data model

- `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or an index `1–7` into `COLORS`/`PIECES` identifying which tetromino locked there.
- Pieces (`PIECES`) are square matrices; `current` and `next` are `{ type, shape, x, y }`.
- Rotation (`rotateCW`) is a transpose + row-reverse of the shape matrix — there is no per-piece rotation table.

### Game loop and flow

`init()` sets up a fresh `board`, spawns pieces, and starts `requestAnimationFrame(loop)`. `loop(ts)` accumulates elapsed time into `dropAccum`; once it exceeds `dropInterval`, the piece drops one row (or locks via `lockPiece` if it can't). `draw()` renders grid → locked board → ghost piece → current piece every frame.

Key functions and how they connect:
- `collide(shape, ox, oy)` — the single source of truth for both wall/floor bounds and overlap with locked cells; used by movement, rotation, ghost projection, and drop logic.
- `tryRotate()` — rotates and applies simple wall-kick offsets (`[0, -1, 1, -2, 2]` columns) via `collide` until one fits, else the rotation is discarded.
- `lockPiece()` → `merge()` (stamp piece into `board`) → `clearLines()` (scan bottom-up, splice completed rows, unshift empty rows, update score/level/`dropInterval`) → `spawn()` (promote `next` to `current`, generate new `next`; if the new `current` immediately collides, calls `endGame()`).
- `ghostY()` projects `current` straight down via `collide` to find landing row; used both for scoring hard drops and for the translucent ghost-piece render.

### Scoring/leveling constants (tunable, see README "Personalización" table)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES = [0,100,300,500,800]`, initial `dropInterval = 1000`. Level increases every 10 lines; drop speed is `max(100, 1000 - (level-1)*90)` ms. If `COLS`/`ROWS`/`BLOCK` change, the `#board` canvas `width`/`height` in `index.html` must be updated to match (`COLS×BLOCK`, `ROWS×BLOCK`).

### Input

All input is handled by a single `keydown` listener at the bottom of `game.js` (arrow keys move/rotate/soft-drop, `Space` hard-drops, `KeyP` toggles pause). Pause/game-over both reuse the same `#overlay` element, distinguished by setting `overlayTitle`/`overlayScore` text before unhiding it.
