# SKYWARD BASTION — Module Contract (v1)

Owner: **Kranz** (Lead / Architect). This document is the single source of truth for
interfaces between modules. Builders work in parallel from this contract only. If
something is ambiguous, pick the behavior that keeps every *other* module working as
written here, note it in your report, and record it via `squad_decide`. Changes to this
file require Kranz approval.

Stack: plain HTML/CSS/JS ES modules, static files, no build step, no dependencies, no
CDNs, no external fonts/images/sounds. Every module is an ES module using named
exports only (no default exports). Relative imports include the `.js` extension.

Original identity: SKYWARD BASTION is an original game. Never reference, name, or
imitate the classic arcade missile-defense game's title, art, sounds, colors or look.

---

## 1. File layout and ownership

| File | Owner | Purpose |
|---|---|---|
| `index.html` | Kranz | Static DOM: HUD, `#stage`, canvas, overlays, mute button (ids in §7) |
| `src/main.js` | Kranz | Bootstrap, wiring, rAF loop, event draining |
| `src/config.js` | Kranz | All tunable constants (named exports) |
| `docs/contract.md` | Kranz | This file |
| `src/game.js` | Lovell | Public game API (§4), state machine |
| `src/entities.js` | Lovell | Entity factories / per-entity update helpers (private to Lovell) |
| `src/waves.js` | Lovell | Wave composition / spawn schedule (private to Lovell) |
| `src/score.js` | Lovell | Multiplier, points, high-score persistence (§4.4) |
| `src/render.js` | Haise | Canvas renderer (§5) |
| `src/hud.js` | Haise | DOM HUD + overlays (§6) |
| `styles.css` | Haise | All styling (§8) |
| `src/input.js` | Swigert | Pointer + keyboard (§9) |
| `src/audio.js` | Swigert | Synthesized Web Audio (§10) |
| `README.md`, `docs/review.md` | Mattingly | Docs, review gate |

Import rules (no cycles):
- `config.js` imports nothing.
- `score.js`, `waves.js`, `entities.js` import only `config.js` (and each other inside Lovell's set).
- `game.js` imports `config.js` + Lovell's modules.
- `render.js`, `hud.js` import only `config.js`. They **read** state, never mutate it.
- `input.js`, `audio.js` import only `config.js`. They never touch game state.
- `main.js` imports `game.js`, `render.js`, `hud.js`, `input.js`, `audio.js`, `config.js`.

---

## 2. World coordinates

- Fixed logical world: `WORLD_W = 960`, `WORLD_H = 600` (world units, "wu").
- Origin top-left, **x right, y down**.
- Ground line `GROUND_Y = 560`. Everything below it (560..600) is ground.
- Batteries (index 0 = left, 1 = center, 2 = right) at `x = BATTERY_XS = [60, 480, 900]`, `y = GROUND_Y`.
- Cities (index 0..5, left to right) at `x = CITY_XS = [150, 240, 330, 630, 720, 810]`, `y = GROUND_Y`.
- Interceptors launch from `(battery.x, GROUND_Y - BATTERY_LAUNCH_HEIGHT)`.
- Aim points are clamped by the game: `x ∈ [0, WORLD_W]`, `y ∈ [0, GROUND_Y - MIN_TARGET_CLEARANCE]`.
- All simulation is in world units; time is in **seconds**. Speeds are wu/s.
- The renderer maps world → canvas with a **uniform letterboxed scale** (§5). Input
  converts client (CSS pixel) coordinates to world coordinates via
  **`renderer.clientToWorld(clientX, clientY)`**, owned by **Haise**, passed to input by main.

---

## 3. Shared game state

One mutable object created by `createGame()`. Only `game.js` (Lovell) mutates it, with
two exceptions owned by main: `state.muted` (main writes it to mirror audio) and
`state.events` (main empties it after draining). Fields starting with `_` are private to
Lovell; nobody else may read them.

```js
state = {
  phase: 'title',        // 'title' | 'playing' | 'paused' | 'waveEnd' | 'gameOver'
  pausedFrom: null,      // phase to return to on resume ('playing') or null
  time: 0,               // seconds of simulated play time (advances only while 'playing' or 'waveEnd')
  wave: 0,               // 0 on title; 1-based once started
  waveBanner: 0,         // seconds remaining of the "WAVE N" intro banner (>0 => show it)
  score: 0,
  highScore: 0,          // loaded from localStorage in createGame(); raised live when score exceeds it
  newHighScore: false,   // true once this run's score exceeded the stored high score
  multiplier: 1,         // multiplier of the current (or just-finished) wave
  nextBonusAt: 10000,    // score threshold for the next bonus city
  pendingBonusCities: 0, // earned but not yet rebuilt

  cities: [              // always length 6, index matches CITY_XS
    { x: 150, y: 560, alive: true },
  ],
  batteries: [           // always length 3, index matches BATTERY_XS
    { x: 60, y: 560, ammo: 10, maxAmmo: 10, alive: true },
  ],
  selectedBattery: 1,    // 0 | 1 | 2 (default center)

  warheads: [            // descending enemy warheads (incl. split children and flyer drops)
    { id, x, y, startX, startY, targetX, targetY, vx, vy, speed,
      targetType: 'city' | 'battery' | 'ground', targetIndex /* -1 for ground */,
      canSplit: bool, splitAtY: number }
  ],
  smartBombs: [          // evasive bombs (wave >= 5)
    { id, x, y, vx, vy, targetX, targetY, targetType, targetIndex, radius }
  ],
  flyers: [              // horizontal fliers that drop warheads (wave >= 3)
    { id, kind: 'bomber' | 'satellite', x, y, vx, dir: 1 | -1, dropsLeft, dropTimer, radius }
  ],
  interceptors: [        // player shots in flight
    { id, batteryIndex, x, y, startX, startY, targetX, targetY, vx, vy, speed }
  ],
  bursts: [              // flak explosions
    { id, x, y, radius, maxRadius, age, stage: 'grow' | 'hold' | 'shrink',
      source: 'player' | 'chain' | 'impact' }
  ],

  tally: null | {        // non-null only during phase 'waveEnd'
    wave,                // the wave just completed
    multiplier,
    ammoLeft,            // total unused ammo across alive batteries at wave end
    citiesLeft,          // alive cities at wave end
    ammoCounted,         // 0..ammoLeft, advances one per TALLY_TICK_INTERVAL
    citiesCounted,       // 0..citiesLeft, advances after ammo finishes
    ammoPoints,          // ammoCounted * BONUS_PER_AMMO * multiplier
    cityPoints,          // citiesCounted * BONUS_PER_CITY * multiplier
    total,               // ammoPoints + cityPoints
    bonusCitiesRebuilt,  // number of cities rebuilt this wave end (set when counting is done)
    done: false,         // true when all ticks are counted (then WAVE_END_HOLD runs)
  },

  muted: true,           // mirrors audio.isMuted(); written by main only
  events: [],            // per-frame event queue (§4.3); game pushes, main drains + clears

  nextId: 1,             // monotonically increasing id source for all entities
  // _private fields (spawn queue, wave clock, rng, ...) allowed with '_' prefix
}
```

Trails: renderers draw a warhead trail as a line from `(startX, startY)` to `(x, y)`;
split children get `startX/startY` = split point. Interceptor trail likewise from
`(startX, startY)`. Smart bombs and flyers have no trail.

---

## 4. Lovell — gameplay API

### 4.1 `src/game.js` exports

```js
export function createGame(options = {}) -> state
```
Returns a fresh state in phase `'title'`, `wave = 0`, all 6 cities alive, 3 batteries
alive with full ammo, empty entity arrays, `highScore = loadHighScore()`, `muted = true`.
`options.rng` (optional `() => number` in [0,1)) defaults to `Math.random`.

```js
export function startGame(state) -> void
```
Valid from any phase. Resets the run in place (same object; keep `highScore`, `muted`):
score 0, all cities alive, batteries refilled, entities cleared, `nextBonusAt =
BONUS_CITY_EVERY`, `pendingBonusCities = 0`, `newHighScore = false`, `selectedBattery = 1`,
then begins wave 1. Pushes `{type:'gameStart'}` then `{type:'waveStart', ...}`.

```js
export function restart(state) -> void
```
Identical to `startGame(state)`. (Main calls it for R; ignored by main in `'title'`.)

```js
export function update(state, dt) -> void
```
Advances the simulation by `dt` seconds (main guarantees `0 <= dt <= MAX_DT`).
- `'title'`, `'paused'`, `'gameOver'`: no-op (no time advance).
- `'playing'`: full simulation (§11).
- `'waveEnd'`: advances the tally; when `tally.done` and `WAVE_END_HOLD` elapsed, starts the
  next wave or ends the game (§11.7).

```js
export function fireInterceptor(state, batteryIndex, targetX, targetY) -> boolean
```
Only acts in `'playing'` (returns false otherwise, no event).
- `batteryIndex === null`: use `state.selectedBattery`; if that battery is destroyed or
  out of ammo, **fall back** to the alive battery with ammo whose `x` is nearest to
  `targetX` (ties → lower index).
- `batteryIndex` = 0|1|2 (explicit, from A/S/D): use exactly that battery, **no fallback**.
- If no usable battery: push `{type:'empty', batteryIndex}` (the requested index, or
  `state.selectedBattery` when null) and return false.
- Otherwise: clamp the target (§2), decrement ammo, spawn an interceptor, push
  `{type:'fire', batteryIndex: usedIndex, x: targetX, y: targetY}` (clamped values), return true.
- Firing does not change `selectedBattery`.

```js
export function selectBattery(state, index) -> void
```
`index` ∈ {0,1,2} (others ignored). Sets `selectedBattery` even if that battery is
destroyed/empty (fallback handles it). Valid in `'playing'` and `'paused'`; ignored
elsewhere. Pushes `{type:'select', batteryIndex: index}` when it changes.

```js
export function togglePause(state) -> void
```
`'playing'` → `'paused'` (sets `pausedFrom = 'playing'`, pushes `{type:'pause'}`);
`'paused'` → `pausedFrom` (pushes `{type:'resume'}`). Ignored in other phases.

```js
export function skipTally(state) -> void
```
Only in `'waveEnd'`: instantly finishes counting (adds remaining bonus points, no further
`bonusTick` events), performs bonus-city rebuilds, and immediately advances to the next
wave or game over (exactly as §11.7 would). Ignored elsewhere.

### 4.2 Phase machine

```
title --startGame--> playing <--togglePause--> paused
playing --wave cleared--> waveEnd --tally+hold or skipTally--> playing (next wave)
                                                           \--> gameOver (no cities)
gameOver --startGame/restart--> playing
any (except title) --restart--> playing
```

### 4.3 Event queue

`state.events` is an array of plain objects `{ type, ...payload }`. The game pushes;
main drains every frame **after** `update` (and also drains events produced by input
callbacks in that same frame) by passing each to `audio.handleEvent(evt)`, then sets
`state.events.length = 0`. Consumers must ignore unknown types and extra fields.
Pinned types (exact strings) and payloads:

| type | payload | when |
|---|---|---|
| `gameStart` | — | `startGame`/`restart` |
| `waveStart` | `wave, multiplier` | each wave begins (banner starts) |
| `select` | `batteryIndex` | selected battery changed |
| `fire` | `batteryIndex, x, y` | interceptor launched |
| `empty` | `batteryIndex` | fire attempted with no usable battery |
| `burst` | `x, y, source` (`'player'\|'chain'\|'impact'`) | any burst created |
| `kill` | `kind` (`'warhead'\|'smart'\|'bomber'\|'satellite'`), `points, x, y` | threat destroyed by a burst |
| `warheadSplit` | `x, y, count` | a warhead split |
| `flyerSpawn` | `kind` (`'bomber'\|'satellite'`) | flyer entered |
| `smartBombSpawn` | `x` | smart bomb entered |
| `cityDestroyed` | `cityIndex, x` | an alive city was hit |
| `batteryDestroyed` | `batteryIndex, x` | an alive battery was hit |
| `waveEnd` | `wave` | wave cleared, entering `'waveEnd'` |
| `bonusTick` | `kind` (`'ammo'\|'city'`), `points` | one tally step counted |
| `bonusCityEarned` | `score` | score crossed `nextBonusAt` |
| `bonusCity` | `cityIndex` | a destroyed city was rebuilt at wave end |
| `pause` | — | entered `'paused'` |
| `resume` | — | left `'paused'` |
| `gameOver` | `score, highScore, newHigh` | entering `'gameOver'` |

### 4.4 `src/score.js` exports

```js
export function multiplierForWave(wave) -> number      // per MULTIPLIER_TABLE: 1x w1-2, 2x w3-4, 3x w5-6, 4x w7-8, 5x w9-10, 6x w11+
export function pointsFor(kind, multiplier) -> number  // POINTS[kind] * multiplier
export function loadHighScore() -> number              // localStorage HIGH_SCORE_KEY, try/catch, 0 on any failure / NaN
export function saveHighScore(value) -> void           // try/catch, silently ignore failures
```

`entities.js` and `waves.js` exports are Lovell-private (no other module imports them).

---

## 5. Haise — renderer (`src/render.js`)

```js
export function createRenderer(canvas) -> {
  resize(),                          // re-measure and resize backing store
  draw(state, now),                  // now = rAF timestamp in ms (for blinking/cosmetic anim)
  clientToWorld(clientX, clientY),   // -> { x, y } world coords (may be outside world; caller/game clamps)
  getView(),                         // -> { scale, offsetX, offsetY, dpr, cssWidth, cssHeight }
}
export function computeView(cssWidth, cssHeight, dpr) -> { scale, offsetX, offsetY, dpr, cssWidth, cssHeight }
```

- `resize()`: `rect = canvas.getBoundingClientRect()`; `dpr = window.devicePixelRatio || 1`;
  `canvas.width = Math.max(1, Math.round(rect.width * dpr))`, same for height; recompute view.
  `scale = min(rect.width / WORLD_W, rect.height / WORLD_H)` (CSS px per wu);
  `offsetX = (rect.width - WORLD_W*scale)/2`, `offsetY = (rect.height - WORLD_H*scale)/2` (CSS px).
  Draw transform: `ctx.setTransform(dpr*scale, 0, 0, dpr*scale, dpr*offsetX, dpr*offsetY)`.
- `createRenderer` calls `resize()` once and installs a `ResizeObserver` on the canvas that
  calls `resize()`; also listens to `window` `resize` as a DPR-change fallback. Main never
  needs to call `resize()` but may.
- `clientToWorld`: uses a fresh `canvas.getBoundingClientRect()` at call time:
  `x = (clientX - rect.left - offsetX) / scale`, `y = (clientY - rect.top - offsetY) / scale`.
- `draw` fills the letterbox with `PALETTE.letterbox`, then draws in world space: sky with a
  visible grid, ground, cities (alive/destroyed), batteries (alive/destroyed, ammo pips,
  selected-battery marker), warhead trails + heads, smart bombs, flyers, interceptor
  trails + target crosshair "X" at target, bursts (filled disc + thick black stroke),
  and the aim reticle is NOT drawn by the renderer (the CSS cursor is `crosshair`).
  Neo-brutalist: flat fills, thick black strokes (`LINE_WIDTH`), no glow, no shadows blur.
- `draw` must work in every phase (title shows the world with cities/batteries).
- Reads only documented state fields; never mutates state.

---

## 6. Haise — HUD (`src/hud.js`)

```js
export function createHud(root = document) -> { update(state) }
```
`update(state)` is called every frame; it must only write to the DOM when a value changes
(cache last values). It looks up elements by the ids in §7 via `root.getElementById`.
Responsibilities:
- `#hud-score`, `#hud-high`, `#hud-wave`, `#hud-mult` (e.g. `"2x"`), `#hud-cities` (alive count).
- Per battery `i`: `#battery-${i}` gets classes `is-selected` (i === selectedBattery),
  `is-empty` (alive && ammo === 0), `is-destroyed` (!alive); `#battery-${i}-ammo` text = ammo.
- `#mute-btn`: text `"SOUND: OFF"` when `state.muted`, else `"SOUND: ON"`;
  `aria-pressed = String(state.muted)`; `data-muted = String(state.muted)`.
- Overlays: exactly one visible at a time via the `hidden` attribute:
  `'title'` → `#overlay-title`; `'paused'` → `#overlay-paused`; `'waveEnd'` → `#overlay-waveend`;
  `'gameOver'` → `#overlay-gameover`; `'playing'` → none.
- `#wave-banner`: visible (`hidden` removed) iff `phase === 'playing' && waveBanner > 0`;
  text `` `WAVE ${wave} · ${multiplier}x` ``.
- Title: `#title-high` = highScore.
- Wave-end: `#tally-wave` (tally.wave), `#tally-mult` (`${tally.multiplier}x`),
  `#tally-ammo` (`${ammoCounted} / ${ammoLeft}`), `#tally-ammo-points`, `#tally-cities`
  (`${citiesCounted} / ${citiesLeft}`), `#tally-city-points`, `#tally-total`,
  `#tally-bonus-city` (shown when `bonusCitiesRebuilt > 0`, text `"+N CITY REBUILT"`).
- Game over: `#final-score`, `#final-high`, `#final-wave`, `#new-high` (shown iff `newHighScore`).
- Numbers formatted with `toLocaleString('en-US')`.
- HUD never attaches event listeners (main wires `#mute-btn`).

---

## 7. DOM ids provided by `index.html` (pinned)

```
#app                       root wrapper
  #hud                     top bar
    #hud-score  #hud-high  #hud-wave  #hud-mult  #hud-cities
    #batteries             container
      #battery-0 / #battery-1 / #battery-2   (class "battery-panel"; data-index)
        #battery-0-ammo / #battery-1-ammo / #battery-2-ammo
    #mute-btn              <button type="button" aria-pressed="true" data-muted="true">SOUND: OFF</button>
  #stage                   position:relative wrapper with aspect-ratio 960/600
    #game-canvas           <canvas> position:absolute; inset:0; width:100%; height:100%
    #wave-banner           (hidden)
    #overlay-title         class "overlay"  — contains #title-high
    #overlay-paused        class "overlay" (hidden)
    #overlay-waveend       class "overlay" (hidden) — #tally-wave #tally-mult #tally-ammo
                           #tally-ammo-points #tally-cities #tally-city-points
                           #tally-total #tally-bonus-city
    #overlay-gameover      class "overlay" (hidden) — #final-score #final-high #final-wave #new-high
  #help                    static controls legend
```
Overlays and `#wave-banner` sit above the canvas inside `#stage` and **must have
`pointer-events: none`** so clicks reach the canvas (click-to-start relies on it).

---

## 8. Visual identity (Haise, `styles.css`)

Neo-brutalist, flat, not neon, no glow, no blur. Required CSS custom properties on `:root`:

| Property | Value |
|---|---|
| `--teal-light` | `#9fc9c2` |
| `--teal-mid` | `#3f7f78` |
| `--teal-dark` | `#1d3532` |
| `--ink` | `#0b1514` |
| `--black` | `#000` |
| `--paper` | `#e6f0ee` |
| `--accent` | `#e0a43a` (subtle; selected battery / new-high badge only) |
| `--border-w` | `4px` |
| `--shadow` | `6px 6px 0 #000` |
| `--shadow-sm` | `3px 3px 0 #000` |
| `--font` | `system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` |
| `--grid-size` | `24px` |

- Page background: `--teal-light` with a visible grid (two `linear-gradient`s, `--grid-size`).
- Panels/buttons/overlay cards: `var(--border-w) solid var(--black)`, `box-shadow: var(--shadow)`,
  no border-radius (or ≤ 2px), font weights 800–900, uppercase labels.
- `#stage`: `position: relative; aspect-ratio: 960 / 600; width: min(100%, 1200px)`
  (height derived), border + shadow. `#game-canvas`: `position:absolute; inset:0;
  width:100%; height:100%; display:block; cursor: crosshair; touch-action: none`.
- `[hidden] { display: none !important; }`.
- Canvas colors come from `PALETTE` in `config.js`, which mirrors these values.

---

## 9. Swigert — input (`src/input.js`)

```js
export function createInput({
  canvas,                 // HTMLCanvasElement
  clientToWorld,          // (clientX, clientY) -> {x, y}   (renderer.clientToWorld)
  onFire,                 // (x, y, batteryIndex /* 0|1|2 or null */) -> void
  onSelectBattery,        // (index) -> void
  onPause,                // () -> void
  onRestart,              // () -> void
  onToggleMute,           // () -> void
  onStart,                // () -> void
}) -> { destroy(), getPointer() /* -> {x,y} world or null */ }
```

Bindings (keyboard on `window`, `keydown`, ignore `event.repeat`, match `event.key`
case-insensitively; ignore when a modifier Ctrl/Meta/Alt is held):
- `1`/`2`/`3` → `onSelectBattery(0|1|2)` (select only).
- `a`/`s`/`d` → `onSelectBattery(i)` **then** `onFire(p.x, p.y, i)` at the last known pointer
  world position `p`; if no pointer position is known yet, select only.
- `p`, `Escape` → `onPause()`.
- `r` → `onRestart()`.
- `m` → `onToggleMute()`.
- `Enter`, ` ` (Space) → `onStart()`; `preventDefault()` for Space.
- Pointer: `pointermove` on canvas updates last pointer world position.
  `pointerdown` on canvas with primary button (`event.button === 0`, or any touch/pen) →
  update position, `preventDefault()`, then `onFire(x, y, null)`.
- `contextmenu` on canvas is prevented.
- Input never inspects game phase; **main routes** (click in title starts the game, etc.).
- All callbacks are invoked **synchronously inside the DOM event handler** (so audio can
  unlock in a user gesture).

---

## 10. Swigert — audio (`src/audio.js`)

```js
export function createAudio() -> {
  unlock(),          // call from a user gesture: lazily creates AudioContext on first call, resume()s if suspended
  setMuted(bool),    // unmuting also calls unlock()
  isMuted() -> bool,
  toggleMuted() -> bool,   // returns new muted value
  handleEvent(evt),  // plays a sound for known event types; no-op if muted / no context; ignores unknown
}
```
- **Starts muted** (`isMuted() === true`). Never creates an `AudioContext` at import or in
  `createAudio()`; only inside `unlock()` (which main calls only from user-gesture callbacks).
- All sounds synthesized (oscillators, gain envelopes, generated noise `AudioBuffer`s). No
  audio files. Master gain node; muting sets master gain to 0 (or skips playback).
- Must handle at least: `fire`, `burst`, `kill`, `empty`, `warheadSplit`, `flyerSpawn`,
  `smartBombSpawn`, `cityDestroyed`, `batteryDestroyed`, `waveStart`, `waveEnd`,
  `bonusTick`, `bonusCity`, `bonusCityEarned`, `gameOver`. Rate-limit dense events
  (e.g. ≤ 1 `burst` sound per 30 ms). Wrap Web Audio calls in try/catch; never throw.

---

## 11. Gameplay rules (Lovell)

### 11.1 Waves
- Wave `w` warhead count: `min(WARHEADS_BASE + WARHEADS_PER_WAVE*(w-1), WARHEADS_MAX)`.
- Warhead speed: `min(WARHEAD_SPEED_BASE + WARHEAD_SPEED_PER_WAVE*(w-1), WARHEAD_SPEED_MAX)`
  ± `WARHEAD_SPEED_JITTER`.
- Spawns start after `WAVE_INTRO_TIME` (`waveBanner` counts down from it). Spawn interval
  `max(SPAWN_INTERVAL_BASE + SPAWN_INTERVAL_PER_WAVE*(w-1), SPAWN_INTERVAL_MIN)`, 1..`SALVO_MAX`
  per tick.
- Warheads spawn at random `x ∈ [0, WORLD_W]`, `y = SKY_TOP_SPAWN_Y`, aimed at a random
  **alive** city or alive battery (if none alive, at ground `targetType 'ground'`, random x).
- At the start of each wave: all batteries `alive = true`, `ammo = maxAmmo = AMMO_PER_BATTERY`.
  Cities stay as they are. `multiplier = multiplierForWave(wave)`.

### 11.2 Interceptors and bursts
- Interceptors fly straight at `INTERCEPTOR_SPEED`; on reaching the target they are removed
  and spawn a `'player'` burst (`maxRadius = BURST_MAX_RADIUS`) at the target.
- Burst lifecycle: `grow` 0 → `maxRadius` over `BURST_GROW_TIME`, `hold` for
  `BURST_HOLD_TIME`, `shrink` → 0 over `BURST_SHRINK_TIME`, then removed.
- Any warhead, smart bomb, or flyer whose position is within a `'player'` or `'chain'`
  burst (`dist <= burst.radius + entityRadius`; warhead radius 0) is destroyed, awards
  `pointsFor(kind, multiplier)`, pushes `kill`, and spawns a `'chain'` burst
  (`CHAIN_BURST_MAX_RADIUS`) at its position (**chain reactions**).
- `'impact'` bursts (`IMPACT_BURST_MAX_RADIUS`) are cosmetic: they never destroy anything.
- Interceptors are never destroyed by bursts.

### 11.3 Impacts
- A warhead/smart bomb reaching `y >= targetY` is removed and spawns an `'impact'` burst.
  If its target city/battery is still alive it is destroyed (`alive = false`; battery
  `ammo = 0`) and `cityDestroyed` / `batteryDestroyed` is pushed. If the selected battery
  is destroyed, `selectedBattery` is unchanged (fallback handles firing).

### 11.4 Splitting warheads (wave ≥ `SPLIT_MIN_WAVE`)
- Each spawned warhead has `canSplit` with chance
  `min(SPLIT_CHANCE_BASE + SPLIT_CHANCE_PER_WAVE*(w-SPLIT_MIN_WAVE), SPLIT_CHANCE_MAX)` and a
  random `splitAtY ∈ [SPLIT_Y_MIN, SPLIT_Y_MAX]`. On crossing it, the warhead is replaced by
  `SPLIT_COUNT_MIN..SPLIT_COUNT_MAX` children (each `canSplit = false`, new random alive target,
  same speed, `startX/startY` = split point). Push `warheadSplit`. Children count as warheads.

### 11.5 Flyers (wave ≥ `FLYER_MIN_WAVE`)
- Count `min(FLYERS_BASE + floor((w-FLYER_MIN_WAVE)/2)*FLYERS_PER_TWO_WAVES, FLYERS_MAX)`,
  scheduled at random times within the wave. Bombers only before `SATELLITE_MIN_WAVE`,
  then 50/50. Enter from a random side, fly horizontally (`BOMBER_SPEED`/`SATELLITE_SPEED`,
  y in the kind's range), drop `FLYER_DROPS` warheads every `FLYER_DROP_INTERVAL` while on
  screen (drops start at the flyer position), removed when fully off-screen. Push `flyerSpawn`.

### 11.6 Smart bombs (wave ≥ `SMART_MIN_WAVE`)
- Count `min(SMART_BASE + SMART_PER_WAVE*(w-SMART_MIN_WAVE), SMART_MAX)`, scheduled within
  the wave. Descend toward target at `SMART_SPEED`. Each frame, for every non-impact burst
  with `dist < burst.radius + SMART_EVADE_MARGIN`, add lateral velocity
  `SMART_EVADE_SPEED` away from the burst center (x clamped to world). They can still be
  caught by a fast-growing burst or a chain. Push `smartBombSpawn`.

### 11.7 Wave end, bonus, game over
- If all cities are destroyed mid-wave, the remaining unspawned schedule is cancelled.
- The wave is cleared when the schedule is exhausted and there are no warheads, smart
  bombs, flyers, interceptors, or bursts. Then: phase `'waveEnd'`, push `waveEnd`, build
  `tally`. Every `TALLY_TICK_INTERVAL`: count one ammo (then, after ammo, one city), add
  `BONUS_PER_AMMO*multiplier` / `BONUS_PER_CITY*multiplier` to score, push `bonusTick`.
- Score increases anywhere check `score >= nextBonusAt` → `pendingBonusCities++`,
  `nextBonusAt += BONUS_CITY_EVERY`, push `bonusCityEarned` (loop for multiple crossings).
  Score increases also update `highScore`/`newHighScore` live.
- When counting is done: while `pendingBonusCities > 0` and a destroyed city exists, rebuild
  the **leftmost** destroyed city, decrement, push `bonusCity` (unused pending carry over).
  Set `tally.bonusCitiesRebuilt`, `tally.done = true`, call `saveHighScore(highScore)`.
- After `WAVE_END_HOLD` (or `skipTally`): **game over is decided here, at wave end** — if no
  city is alive → phase `'gameOver'`, `saveHighScore`, push `gameOver`. Otherwise `wave++`,
  `tally = null`, phase `'playing'`, push `waveStart`.

---

## 12. `src/main.js` wiring (Kranz, reference)

```js
const state = createGame();
const renderer = createRenderer(canvas);
const hud = createHud(document);
const audio = createAudio();
createInput({ canvas, clientToWorld: renderer.clientToWorld, onFire, onSelectBattery,
              onPause, onRestart, onToggleMute, onStart });
```
Routing (every input callback and the `#mute-btn` click first call `audio.unlock()`, which
is idempotent and cheap after the first call; the context may exist while muted, it just
stays silent):
- `onFire(x, y, i)`: `'title'`/`'gameOver'` → `startGame`; `'waveEnd'` → `skipTally`;
  `'playing'` → `fireInterceptor(state, i, x, y)`; `'paused'` → ignore.
- `onStart()`: `'title'`/`'gameOver'` → `startGame`; `'waveEnd'` → `skipTally`;
  `'paused'` → `togglePause`.
- `onSelectBattery(i)` → `selectBattery`. `onPause()` → `togglePause`.
- `onRestart()` → `restart` unless `'title'`.
- `onToggleMute()` and `#mute-btn` click → `audio.toggleMuted()`; `state.muted = audio.isMuted()`.
- Tab hidden while `'playing'` → `togglePause`.
- Loop: `dt = min((now - last)/1000, MAX_DT)` (and `>= 0`); `update(state, dt)`; drain events
  to `audio.handleEvent`; clear; `renderer.draw(state, now)`; `hud.update(state)`.
- Errors in one frame are caught and logged so the loop keeps running.
