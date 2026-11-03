# Squad Decisions

## Active Decisions

### 2026-11-03: Game identity SKYWARD BASTION; static-only stack; audio starts muted (Squad)
**By:** Squad
**What:** Game identity SKYWARD BASTION; static-only stack; audio starts muted
**Why:** User approved the init proposal. Decisions:
1. Title is SKYWARD BASTION, tagline "Hold the line. Six cities. Three batteries. One sky." The game must never be named, described or styled after the classic arcade missile-defense game; use original terms (batteries, interceptors, flak bursts) and original art/sound.
2. Stack: plain HTML/CSS/JS ES modules, static files only: no build step, no dependencies, no CDNs.
3. Web Audio synthesized sound only; it starts muted with a visible mute toggle, and the AudioContext is created only after a user gesture.
4. Look: neo-brutalist in subtle teal #9fc9c2 / #3f7f78 / #1d3532, not neon. The canvas is absolutely positioned in its wrapper and sized from its own bounding box (DPR-aware).
5. Process: Kranz writes the contract first, specialists build in parallel, Mattingly runs the review gate, Scribe merges decisions. Conventional commits to main, no push.
Casting universe: Apollo 13 (Kranz, Lovell, Haise, Swigert, Mattingly).

### 2026-11-03: Module contract v1 for Skyward Bastion pinned in docs/contract.md (Kranz)
**By:** Kranz
**What:** Module contract v1 for Skyward Bastion pinned in docs/contract.md
**References:** docs/contract.md, Lovell, Haise, Swigert, Mattingly
**Why:** World is a fixed 960x600 (y down), ground at y=560, batteries x=[60,480,900], cities x=[150,240,330,630,720,810]. Renderer letterboxes with a uniform scale; Haise owns renderer.clientToWorld(clientX, clientY), which main passes to input. Lovell's game.js exports createGame, startGame, restart, update(state, dt), fireInterceptor(state, batteryIndex|null, x, y) -> bool, selectBattery, togglePause, skipTally. Firing with null uses the selected battery and falls back to the nearest battery with ammo. Firing with an explicit index (A/S/D) has no fallback. Events go to state.events (pinned types: gameStart, waveStart, select, fire, empty, burst, kill, warheadSplit, flyerSpawn, smartBombSpawn, cityDestroyed, batteryDestroyed, waveEnd, bonusTick, bonusCityEarned, bonusCity, pause, resume, gameOver). Main drains them to audio.handleEvent each frame. Game over is decided at wave end, after bonus-city rebuilds, and the rest of the wave's spawns are cancelled if every city falls mid-wave. Impact bursts are harmless; player and chain bursts kill. Input never reads phase; main routes clicks and Enter (start / skip tally / fire / resume). 1/2/3 only select; A/S/D select and fire at the last pointer position. Audio starts muted, and its AudioContext is created only in unlock(), which main calls from user gestures. HUD uses the DOM ids pinned in contract section 7. Overlays have pointer-events:none so clicks reach the canvas. The CSS custom properties are listed in section 8 and mirrored by PALETTE in config.js. High score is stored under localStorage key 'skyward-bastion-highscore', inside try/catch.

### 2026-11-03: Input/audio choices not pinned by contract §9/§10 (Swigert)
**By:** Swigert
**What:** Input/audio choices not pinned by contract §9/§10
**References:** docs/contract.md §9, docs/contract.md §10, src/input.js, src/audio.js
**Why:** Input (src/input.js):
- Game keys are preventDefault()ed even on auto-repeat (so held Space doesn't scroll), but callbacks fire only on non-repeat keydown.
- Keydown is ignored when the event target is an editable element (input/textarea/select/contentEditable). None exist today; future-proofing.
- Touch/pen: every pointerdown contact fires (multi-touch = multiple shots). Mouse requires button 0.
- If clientToWorld returns a non-finite point, the last known pointer is kept; pointerdown with no known position does nothing.
- 'Spacebar' (legacy key value) is treated like ' '.

Audio (src/audio.js):
- Master gain 0.45 -> DynamicsCompressor -> destination; mute ramps master to 0 over 30 ms and handleEvent also skips playback while muted.
- Global voice cap of 24 concurrent sounds plus per-type minimum intervals (burst 30 ms, bonusTick 35 ms, fire 25 ms, kill 30 ms, others 60-500 ms).
- handleEvent plays only when ctx.state === 'running'.
- Also gives short UI sounds to gameStart, select, pause, resume (contract only requires the 15 listed types; extras are harmless).
- One 1 s white-noise AudioBuffer generated at context creation, reused with random offsets through moving biquad filters.

### 2026-11-03: Gameplay details the contract left unpinned (splits, flyer drops, schedule timing, tally edge cases) (Lovell)
**By:** Lovell
**What:** Gameplay details the contract left unpinned (splits, flyer drops, schedule timing, tally edge cases)
**References:** docs/contract.md §11, Kranz
**Why:** Choices made in src/game.js / waves.js / entities.js where docs/contract.md v1 was silent:
1. Only sky-spawned scheduled warheads may split. Flyer drops and split children have canSplit=false (drops start at y up to 230, which is inside the SPLIT_Y range, so they would split right away). Non-splitting warheads get splitAtY = 0.
2. Flyers wait FLYER_DROP_INTERVAL/2 before their first drop. The drop timer only runs while the flyer's x is in [0, WORLD_W].
3. Schedule: warhead salvos start at t = WAVE_INTRO_TIME and repeat every spawnInterval. Flyer and smart-bomb spawn times are random within the salvo span (smart bombs start no earlier than 15% into it). The wave clock only advances while 'playing'.
4. Warheads and smart bombs aim at (target.x, GROUND_Y). An impact burst spawns at the target point for warheads and at (bomb.x, GROUND_Y) for smart bombs.
5. Chain bursts start at radius 0, so they begin destroying things on the next frame. A collision snapshot is taken each frame.
6. Smart-bomb evasion: each frame the bomb steers toward its target at SMART_SPEED and adds ±SMART_EVADE_SPEED of vx for each nearby player or chain burst. The sign comes from x relative to the burst centre (random if equal).
7. If the tally has nothing to count (0 ammo and 0 cities), counting finishes as soon as waveEnd is entered and then WAVE_END_HOLD runs. skipTally counts the remaining points without emitting bonusTick, but bonusCityEarned and bonusCity are still emitted.
8. In fireInterceptor, a non-numeric target counts as 0 before clamping.

### 2026-11-03: Renderer/HUD choices not pinned by contract v1 (Haise)
**By:** Haise
**What:** Renderer/HUD choices not pinned by contract v1
**References:** Kranz, docs/contract.md §5-§8
**Why:** 1) Title copy: index.html's title tagline differs from the spec tagline and has no controls hint. hud.js now, once at createHud, sets the first plain <p> in #overlay-title to "Hold the line. Six cities. Three batteries. One sky." (class overlay-tagline) and appends p.overlay-hint with a one-line controls summary. This is idempotent and does nothing if the markup is different. Better long-term fix: Kranz puts that copy in index.html, and the JS then has nothing to change.
2) computeView with a degenerate box (0 or NaN width/height) returns scale 1 and offsets 0, so clientToWorld never divides by zero.
3) clientToWorld recomputes the view from the fresh rect at call time, not only from the cached offsets, so it stays right if the box changed before the ResizeObserver fired.
4) draw() calls resize() when devicePixelRatio has changed since the last resize.
5) Canvas visuals: 40 wu sky grid; hard black offset shadows of 3 wu (no blur); burst fill is paper for player, tealLight for chain, tealMid for impact; ammo pips in rows of 5 under each battery; selected battery gets an accent chevron, which blinks when that battery is destroyed or empty (hidden on the title screen); interceptor trails are dashed tealMid.
6) #stage adds max-width: max(320px, calc((100vh - 220px) * 1.6)) on top of the pinned width, so the field fits on short viewports without changing its aspect ratio.

### 2026-11-03: Review gate: REJECT (1 blocking: title tagline/hint wrong in index.html, patched by hud.js) (Mattingly) (superseded by the re-review APPROVE)
**By:** Mattingly
**What:** Review gate: REJECT (1 blocking: title tagline/hint wrong in index.html, patched by hud.js)
**References:** Kranz, Haise, Lovell, Swigert, docs/review.md
**Why:** Verdict: REJECT. Full report in docs/review.md.

Blocking B1: index.html #overlay-title has the wrong tagline ("Hold the line. Burst the warheads...") and no controls hint. hud.js installTitleCopy() rewrites the DOM at startup to cover for it, which goes beyond contract section 6 (HUD writes only the pinned ids) and depends on a fragile selector. Fix: (1) Kranz updates index.html to use <p class="overlay-tagline">Hold the line. Six cities. Three batteries. One sky.</p> and adds a <p class="overlay-hint"> controls hint (include P/Esc and R). (2) Haise then removes installTitleCopy, its call and the TAGLINE/CONTROLS_HINT constants from hud.js.

Non-blocking: N1 favicon 404 (Kranz: add <link rel="icon" href="data:,">). N2 the high score is saved only at wave end and game over (Lovell, optional). N3 a click during waveEnd skips the tally right away; this conforms to the contract (Kranz, optional). N4 on short viewports #stage is narrower than the HUD and help bars (Haise, cosmetic). N5 the tally still shows when all cities are lost; this is contract behavior.

All other checks pass: node --check, static-only/no-URL greps, imports and exports, main.js call signatures, the 19 event types, the 31 DOM ids, gameplay features in a 12-wave simulation, the Node DOM-stub harness (no exceptions), headless Chrome load and screenshot (no console errors), and the originality grep.

### 2026-11-03: Review gate re-review: APPROVE (B1 and N1 resolved by Swigert's revision) (Mattingly)
**By:** Mattingly
**What:** Review gate re-review: APPROVE (B1 and N1 resolved by Swigert's revision)
**References:** Swigert, Kranz, Haise, Lovell, docs/review.md, c3d2e583-c9be-4dda-94ff-24a9a8e0f602
**Why:** Final verdict: APPROVE. This supersedes the earlier REJECT (decision c3d2e583). docs/review.md is updated.

B1 is resolved. index.html now has p.overlay-tagline "Hold the line. Six cities. Three batteries. One sky." and a p.overlay-hint controls line. hud.js no longer has installTitleCopy, TAGLINE or CONTROLS_HINT, so the HUD is back within contract section 6.

N1 is resolved: <link rel="icon" href="data:,"> was added and the favicon is no longer requested.

Re-verified with node --check on all src/*.js, greps (no patch left, no external URLs, originality clean) and a headless Chrome reload. All 12 resources returned 200, there were no console errors, the tagline and hint each render once, and the temporary server was killed with no listener left.

Still open (non-blocking): N2 the high score is saved only at wave end and game over (Lovell). N3 a click during waveEnd skips the tally; this conforms to the contract (Kranz). N4 on short viewports #stage is narrower than the HUD and help bars (Haise, cosmetic). N5 the tally still shows after all cities are lost; this is contract behavior (Lovell, UX note).

The revision (index.html, src/hud.js) is uncommitted in the working tree.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
