# SKYWARD BASTION

**Hold the line. Six cities. Three batteries. One sky.**

SKYWARD BASTION is an original missile-defense arcade game for the browser. Warheads
fall on six cities; you defend them from three ground batteries by launching
interceptors that burst into expanding flak clouds. Bursts grow, hold, shrink, and
chain: anything caught in one detonates into a new burst of its own.

It is plain HTML, CSS and JavaScript (ES modules). There is no build step, no
package manager, no dependencies, no CDNs and no external fonts, images or sounds.
Every sound is synthesized at runtime with the Web Audio API.

## Running it

ES modules do not load from `file://`, so serve the folder with any static server
and open it in a browser:

```sh
python3 -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000> (use the port your server prints).

## Controls

| Input | Action |
|---|---|
| Click / tap on the field | Fire an interceptor at that point from the selected battery (falls back to the nearest battery with ammo if the selected one is empty or destroyed) |
| `1` / `2` / `3` | Select the left / center / right battery |
| `A` / `S` / `D` | Select the left / center / right battery and fire it at the pointer position (no fallback) |
| `P` or `Esc` | Pause / resume |
| `R` | Restart the run |
| `M` or the **SOUND** button | Toggle sound |
| `Enter` or `Space` | Start, skip the wave-end tally, resume from pause |

Clicking also starts a game from the title or game-over screen and skips the
wave-end tally. Switching away from the tab pauses the game.

**Sound starts muted.** Press `M` or click **SOUND: OFF** to turn it on.

## Rules

- You defend **6 cities** with **3 batteries**. Each battery has **10 interceptors per
  wave**; batteries are rebuilt and refilled at the start of every wave. Cities are not.
- A warhead that reaches a city or battery destroys it.
- Later waves escalate: warheads get faster and more numerous; from wave 2 some
  warheads **split** into 2-3; from wave 3 **bombers** cross the sky dropping warheads
  (joined by **satellites** from wave 4); from wave 5 **smart bombs** dodge your bursts.
- The game ends at the end of a wave in which every city has been lost.

## Scoring

Points for each threat destroyed, times the wave multiplier:

| Threat | Base points |
|---|---|
| Warhead | 25 |
| Bomber | 100 |
| Satellite | 100 |
| Smart bomb | 125 |

| Waves | Multiplier |
|---|---|
| 1-2 | 1x |
| 3-4 | 2x |
| 5-6 | 3x |
| 7-8 | 4x |
| 9-10 | 5x |
| 11+ | 6x |

- **Wave bonus:** at the end of each wave, every unused interceptor scores 5 and every
  surviving city scores 100, both times the multiplier.
- **Bonus city:** every 10,000 points earns a bonus city; it rebuilds the leftmost
  destroyed city at the end of the wave (unused bonus cities carry over).
- **High score** is saved in your browser's `localStorage`.

## File layout

```
index.html        page markup: HUD, stage, canvas, overlays, controls legend
styles.css        neo-brutalist teal styling
src/main.js       bootstrap, input routing, animation loop
src/config.js     every tunable constant and the canvas palette
src/game.js       game state machine and public gameplay API
src/entities.js   entity factories and per-entity updates
src/waves.js      wave composition and spawn schedule
src/score.js      multiplier, points, high-score persistence
src/render.js     canvas renderer (DPR-aware, letterboxed)
src/hud.js        DOM HUD and overlays
src/input.js      pointer and keyboard input
src/audio.js      synthesized Web Audio sound effects
docs/contract.md  module interface contract
docs/review.md    review gate results
```
