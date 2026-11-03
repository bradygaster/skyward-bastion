# SKYWARD BASTION — Review Gate

Reviewer: **Mattingly** (Tester / Reviewer) · Date: 2026-11-03 · Against: `docs/contract.md` v1 + project spec

## Verdict: APPROVE (re-review)

The first review (same day) returned **REJECT** on one blocking finding, B1. B1 and N1
were revised by Swigert, because the original owners were locked out of their own
revisions. The revision is uncommitted in the working tree and has been re-verified. With
B1 resolved, nothing blocks: the game loads, runs and plays correctly across all waves,
every module honors its contract signatures, and the identity is original. The remaining
non-blocking findings stay open for their owners.

## Blocking findings

None open.

### B1 — RESOLVED: title tagline and controls hint now live in the markup

- **Original finding:** `#overlay-title` in `index.html` had the wrong tagline ("Hold the
  line. Burst the warheads before they reach your cities.") and no controls hint.
  `hud.js` `installTitleCopy()` patched the DOM at startup to cover for it, which went
  beyond contract §6 (the HUD writes only the pinned ids) and depended on a fragile
  `p:not([class]):not([id])` selector.
- **Revision (Swigert):** `index.html` now has
  `<p class="overlay-tagline">Hold the line. Six cities. Three batteries. One sky.</p>`
  and a `<p class="overlay-hint">` controls line (Click/tap, 1/2/3, A/S/D, P/Esc, R, M,
  Enter/Space). `src/hud.js` no longer has `installTitleCopy()`, its call, or the
  `TAGLINE` / `CONTROLS_HINT` constants.
- **Re-verification:**
  - `node --check` passes on all `src/*.js`.
  - `hud.js` has no `createElement`, `querySelector` or title-copy code left.
  - The `.overlay-tagline` and `.overlay-hint` selectors now match the static markup.
  - In headless Chrome, the rendered DOM has exactly one tagline and one hint (no
    duplication), with no console errors.

## Non-blocking open findings

| # | File | Owner | Finding | Suggested fix |
|---|---|---|---|---|
| N1 | `index.html` | Kranz | **RESOLVED.** Browsers requested `/favicon.ico` and got a 404. Swigert added `<link rel="icon" href="data:,">`; on re-run the server log shows no favicon request. | Done. |
| N2 | `src/game.js` | Lovell | The high score is only written to `localStorage` at wave end and on game over. If a player beats the high score and then closes the tab mid-wave, the new high is lost. | Optionally call `saveHighScore(state.highScore)` in `startGame` (covers R) and/or from main on `visibilitychange`/`pagehide`. |
| N3 | `src/main.js` | Kranz | Per contract §12, a click in `'waveEnd'` calls `skipTally`. Clicks still landing from the final volley of a wave can skip the tally before the player sees it. Conforms to the contract. | Optional: ignore click-to-skip for ~0.5 s after `waveEnd`, or skip only on Enter/Space. Needs a contract note. |
| N4 | `styles.css` | Haise | On short viewports `#stage` is capped by `max-width: calc((100vh - 220px) * 1.6)` and becomes narrower than the HUD and help bars (visible at 1280x900). Cosmetic; aspect ratio and canvas mapping stay correct. | Optional: cap `#hud` / `#help` to the same width, or accept. |
| N5 | `src/game.js` | Lovell | When every city falls mid-wave, play continues until the remaining threats clear, and the tally (ammo bonus only) is shown before BASTION FALLEN. This is contract §11.7 behavior; flagged only as a UX note. | None required. |

## Checks performed

| Check | Result |
|---|---|
| `node --check` on all 10 `src/*.js` files | PASS |
| Static only: no `package.json`, `node_modules`, build config, CDN, `http(s)://` URL, `@import`, `url()` or dynamic `import()` in `index.html`, `styles.css`, `src/` | PASS |
| ES modules, named exports only, relative imports with `.js` (no `export default`) | PASS |
| Import graph matches contract §1 rules (no cycles; render/hud/input/audio import only `config.js`) | PASS |
| Every import resolves to a real export (verified by loading all modules in Node and in Chrome) | PASS |
| `main.js` calls match callee signatures and return shapes (`createGame`, `startGame`, `restart`, `update`, `fireInterceptor(state, i, x, y)`, `selectBattery`, `togglePause`, `skipTally`, `createRenderer(canvas)` → `{resize, draw, clientToWorld, getView}`, `createHud(document)` → `{update}`, `createInput({...})`, `createAudio()` → `{unlock, setMuted, isMuted, toggleMuted, handleEvent}`) | PASS |
| Event names: all 19 pinned types pushed by `game.js` match §4.3 exactly; `audio.js` handles all 15 required types plus `gameStart`, `select`, `pause`, `resume`; unknown types ignored | PASS |
| DOM ids used by `hud.js` / `main.js` all exist in `index.html` (31 ids) and match contract §7 | PASS |
| CSS id selectors match markup; class selectors match markup | PASS (after the B1 revision, `.overlay-tagline` / `.overlay-hint` match the static markup) |
| Six cities, three batteries, 10 ammo per battery per wave, refilled each wave | PASS |
| Click to aim; `1/2/3` select; `A/S/D` select and fire with no fallback; null battery falls back to nearest usable | PASS (sim: fallback to battery 0, explicit empty battery returns false + `empty`, target clamped to 960/530) |
| Bursts grow → hold → shrink and chain (`'chain'` bursts from kills; `'impact'` bursts harmless) | PASS (radius always within `[0, maxRadius]`; chain bursts observed) |
| Escalation: splits from wave 2, bombers wave 3, satellites wave 4, smart bombs wave 5 | PASS (12-wave simulation: first `warheadSplit` w2, `flyerSpawn:bomber` w3, `flyerSpawn:satellite` w4, `smartBombSpawn` w5) |
| Wave bonus for unused ammo + surviving cities, × multiplier; `skipTally` | PASS |
| Multiplier table 1,1,2,2,3,3,4,4,5,5,6,6 for waves 1-12 | PASS |
| Bonus city every 10,000 (`bonusCityEarned` at 10,000, leftmost destroyed city rebuilt, `nextBonusAt` 20,000) | PASS |
| High score persisted in `localStorage` under `skyward-bastion-highscore`, try/catch guarded | PASS (see N2) |
| Pause `P`/`Esc`, resume, Enter resumes, tab-hidden pauses, `R` restart, Space restarts from game over | PASS |
| Audio: no `AudioContext` at import or in `createAudio()`; starts muted; visible `#mute-btn` toggle (`SOUND: OFF`, `aria-pressed`, `data-muted`); runs cleanly with no `AudioContext` present | PASS |
| Neo-brutalist look: required `:root` custom properties exactly match §8; 4px black borders, hard offset shadows, 800-900 weights, uppercase, visible grid page background and canvas grid; no glow, blur, `text-shadow`, or border radius; teal `#9fc9c2/#3f7f78/#1d3532` | PASS (verified in a headless Chrome screenshot) |
| Canvas `position:absolute; inset:0` inside `#stage` (`position:relative`, `aspect-ratio: 960/600`); sized from its own `getBoundingClientRect()`, DPR-aware, `ResizeObserver` + window resize | PASS (Node stub at DPR 2 → 1920x1200 backing store; Chrome → 941x585 at DPR 1) |
| Overlays and `#wave-banner` have `pointer-events: none` (click-to-start reaches the canvas) | PASS |
| Originality: case-insensitive grep of all shipped files for the classic game's title, its maker, and "missile" | PASS (only hit is the contract's own originality rule; title, art, palette and sounds are original) |

### What was executed

1. `node --check` on every `src/*.js` file.
2. **Node DOM-stub harness** (throwaway, under `.squad/scratch/`, deleted afterwards).
   It stubbed `document`, `window`, a canvas with a no-op 2D context Proxy,
   `getBoundingClientRect`, `ResizeObserver`, a manually stepped `requestAnimationFrame`
   and `localStorage`, with no `AudioContext`. It imported `src/main.js` and stepped
   about 4,000 frames plus a full game until game over. Through the registered listeners
   it simulated click-to-start, 200 clicks, pointer moves, `A/S/D`, `1/2/3`, `P`, `Esc`,
   `M`, the mute button click, `R`, `visibilitychange`, `Enter` and `Space`. Result: zero
   exceptions and zero `console.error`. HUD text, overlays, the wave banner
   (`WAVE 1 · 1x`), the mute label and attributes, and high-score persistence all behaved
   correctly.
3. **Direct `game.js` simulations** with a seeded RNG: a normal run to game over, and a
   12-wave run with an auto-aimer and cities forced alive to reach late-wave content.
   Edge cases covered: all cities lost → `waveEnd` → `skipTally` → `gameOver`; the bonus
   city at 10,000; battery fallback and empty fire; target clamping.
4. **Headless Chrome** (locally installed Google Chrome, nothing downloaded). A
   short-lived `python3 -m http.server` on 127.0.0.1:8765 served the game, and Chrome
   ran `--dump-dom` and `--screenshot`. All 12 game resources returned 200; the only 404 was the
   favicon (N1). There were no JS console errors, the canvas was sized, and the title
   screen rendered correctly. The server was killed by PID after each run.
5. **Re-review of the B1/N1 revision:**
   - `node --check` passes on all `src/*.js`.
   - Grep: no title-copy patch left in `hud.js`; no external URLs; originality grep
     still clean.
   - Headless Chrome re-run against a short-lived `python3 -m http.server` on
     127.0.0.1:8765, killed by PID afterwards with no listener left:
     - All 12 game resources returned 200, and the favicon is no longer requested.
     - There were no console errors, and the canvas was sized at 941x585.
     - The title card renders the correct tagline and hint once each.
