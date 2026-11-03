// SKYWARD BASTION — public game API and state machine (owner: Lovell).
// Contract §3, §4, §11. Pure logic: no DOM access.

import {
  WORLD_W, GROUND_Y, SKY_TOP_SPAWN_Y, MIN_TARGET_CLEARANCE,
  BATTERY_XS, CITY_XS, BATTERY_LAUNCH_HEIGHT,
  AMMO_PER_BATTERY, INTERCEPTOR_SPEED,
  BURST_MAX_RADIUS, CHAIN_BURST_MAX_RADIUS, IMPACT_BURST_MAX_RADIUS,
  WAVE_INTRO_TIME,
  SPLIT_Y_MIN, SPLIT_Y_MAX, SPLIT_COUNT_MIN, SPLIT_COUNT_MAX,
  FLYER_DROP_INTERVAL,
  SMART_SPEED, SMART_EVADE_MARGIN, SMART_EVADE_SPEED,
  BONUS_PER_AMMO, BONUS_PER_CITY, BONUS_CITY_EVERY,
  TALLY_TICK_INTERVAL, WAVE_END_HOLD,
} from './config.js';
import { multiplierForWave, pointsFor, loadHighScore, saveHighScore } from './score.js';
import { buildSchedule, warheadSpeed, splitChance } from './waves.js';
import {
  makeWarhead, makeInterceptor, makeBurst, updateBurst,
  makeFlyer, flyerOffscreen, flyerOnscreen, makeSmartBomb, aim,
} from './entities.js';

// ------------------------------------------------------------------ helpers

function nextId(state) {
  return state.nextId++;
}

function push(state, evt) {
  state.events.push(evt);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function makeCities() {
  return CITY_XS.map((x) => ({ x, y: GROUND_Y, alive: true }));
}

function makeBatteries() {
  return BATTERY_XS.map((x) => ({
    x, y: GROUND_Y, ammo: AMMO_PER_BATTERY, maxAmmo: AMMO_PER_BATTERY, alive: true,
  }));
}

function clearEntities(state) {
  state.warheads.length = 0;
  state.smartBombs.length = 0;
  state.flyers.length = 0;
  state.interceptors.length = 0;
  state.bursts.length = 0;
}

function aliveCityCount(state) {
  let n = 0;
  for (const c of state.cities) if (c.alive) n++;
  return n;
}

// Random alive city or battery; ground if none.
function pickTarget(state) {
  const rng = state._rng;
  const options = [];
  state.cities.forEach((c, i) => { if (c.alive) options.push({ type: 'city', i, x: c.x }); });
  state.batteries.forEach((b, i) => { if (b.alive) options.push({ type: 'battery', i, x: b.x }); });
  if (options.length === 0) {
    return { targetX: rng() * WORLD_W, targetY: GROUND_Y, targetType: 'ground', targetIndex: -1 };
  }
  const o = options[Math.floor(rng() * options.length) % options.length];
  return { targetX: o.x, targetY: GROUND_Y, targetType: o.type, targetIndex: o.i };
}

function addScore(state, pts) {
  if (!(pts > 0)) return;
  state.score += pts;
  while (state.score >= state.nextBonusAt) {
    state.pendingBonusCities++;
    state.nextBonusAt += BONUS_CITY_EVERY;
    push(state, { type: 'bonusCityEarned', score: state.score });
  }
  if (state.score > state.highScore) {
    state.highScore = state.score;
    state.newHighScore = true;
  }
}

function spawnBurst(state, x, y, source) {
  const max = source === 'player' ? BURST_MAX_RADIUS
    : source === 'chain' ? CHAIN_BURST_MAX_RADIUS : IMPACT_BURST_MAX_RADIUS;
  state.bursts.push(makeBurst(nextId(state), x, y, max, source));
  push(state, { type: 'burst', x, y, source });
}

function spawnWarhead(state, x, y, canSplitAllowed) {
  const rng = state._rng;
  const w = state.wave;
  const canSplit = canSplitAllowed && rng() < splitChance(w);
  const splitAtY = SPLIT_Y_MIN + rng() * (SPLIT_Y_MAX - SPLIT_Y_MIN);
  state.warheads.push(
    makeWarhead(nextId(state), x, y, pickTarget(state), warheadSpeed(w, rng), canSplit, splitAtY),
  );
}

function hitTarget(state, type, index) {
  if (type === 'city') {
    const c = state.cities[index];
    if (c && c.alive) {
      c.alive = false;
      push(state, { type: 'cityDestroyed', cityIndex: index, x: c.x });
      if (aliveCityCount(state) === 0) {
        // §11.7: cancel the remaining unspawned schedule.
        state._schedule.length = 0;
      }
    }
  } else if (type === 'battery') {
    const b = state.batteries[index];
    if (b && b.alive) {
      b.alive = false;
      b.ammo = 0;
      push(state, { type: 'batteryDestroyed', batteryIndex: index, x: b.x });
    }
  }
}

// ------------------------------------------------------------------ waves

function beginWave(state, wave) {
  state.wave = wave;
  state.multiplier = multiplierForWave(wave);
  state.waveBanner = WAVE_INTRO_TIME;
  state.tally = null;
  state.phase = 'playing';
  state.pausedFrom = null;
  for (const b of state.batteries) {
    b.alive = true;
    b.ammo = AMMO_PER_BATTERY;
    b.maxAmmo = AMMO_PER_BATTERY;
  }
  clearEntities(state);
  state._waveClock = 0;
  state._schedule = buildSchedule(wave, state._rng);
  state._tallyTimer = 0;
  state._holdTimer = 0;
  push(state, { type: 'waveStart', wave, multiplier: state.multiplier });
}

function processSchedule(state) {
  const sched = state._schedule;
  const rng = state._rng;
  while (sched.length > 0 && sched[0].t <= state._waveClock) {
    const e = sched.shift();
    if (e.type === 'warheads') {
      for (let i = 0; i < e.count; i++) {
        spawnWarhead(state, rng() * WORLD_W, SKY_TOP_SPAWN_Y, true);
      }
    } else if (e.type === 'flyer') {
      state.flyers.push(makeFlyer(nextId(state), e.kind, rng));
      push(state, { type: 'flyerSpawn', kind: e.kind });
    } else if (e.type === 'smart') {
      const x = rng() * WORLD_W;
      state.smartBombs.push(makeSmartBomb(nextId(state), x, pickTarget(state), SMART_SPEED));
      push(state, { type: 'smartBombSpawn', x });
    }
  }
}

function updateFlyers(state, dt) {
  const list = state.flyers;
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i];
    f.x += f.vx * dt;
    if (f.dropsLeft > 0 && flyerOnscreen(f)) {
      f.dropTimer -= dt;
      if (f.dropTimer <= 0) {
        f.dropsLeft--;
        f.dropTimer += FLYER_DROP_INTERVAL;
        spawnWarhead(state, f.x, f.y, false);
      }
    }
    if (flyerOffscreen(f)) list.splice(i, 1);
  }
}

function updateWarheads(state, dt) {
  const list = state.warheads;
  const rng = state._rng;
  for (let i = list.length - 1; i >= 0; i--) {
    const h = list[i];
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    if (h.y >= h.targetY) {
      list.splice(i, 1);
      spawnBurst(state, h.targetX, h.targetY, 'impact');
      hitTarget(state, h.targetType, h.targetIndex);
      continue;
    }
    if (h.canSplit && h.y >= h.splitAtY) {
      list.splice(i, 1);
      const count = SPLIT_COUNT_MIN + Math.floor(rng() * (SPLIT_COUNT_MAX - SPLIT_COUNT_MIN + 1));
      for (let k = 0; k < count; k++) {
        // Children are pushed at the end; they are not re-processed this frame.
        list.push(makeWarhead(nextId(state), h.x, h.y, pickTarget(state), h.speed, false, 0));
      }
      push(state, { type: 'warheadSplit', x: h.x, y: h.y, count });
    }
  }
}

function updateSmartBombs(state, dt) {
  const list = state.smartBombs;
  const bursts = state.bursts;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    const v = aim(s.x, s.y, s.targetX, s.targetY, SMART_SPEED);
    let vx = v.vx;
    for (const b of bursts) {
      if (b.source === 'impact') continue;
      const d = Math.hypot(s.x - b.x, s.y - b.y);
      if (d < b.radius + SMART_EVADE_MARGIN) {
        let side = Math.sign(s.x - b.x);
        if (side === 0) side = state._rng() < 0.5 ? -1 : 1;
        vx += side * SMART_EVADE_SPEED;
      }
    }
    s.vx = vx;
    s.vy = v.vy;
    s.x = clamp(s.x + s.vx * dt, 0, WORLD_W);
    s.y += s.vy * dt;
    if (s.y >= s.targetY) {
      list.splice(i, 1);
      spawnBurst(state, s.x, s.targetY, 'impact');
      hitTarget(state, s.targetType, s.targetIndex);
    }
  }
}

function updateInterceptors(state, dt) {
  const list = state.interceptors;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    const remaining = Math.hypot(m.targetX - m.x, m.targetY - m.y);
    const step = m.speed * dt;
    if (step >= remaining) {
      list.splice(i, 1);
      spawnBurst(state, m.targetX, m.targetY, 'player');
    } else {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
    }
  }
}

function updateBursts(state, dt) {
  const list = state.bursts;
  for (let i = list.length - 1; i >= 0; i--) {
    if (!updateBurst(list[i], dt)) list.splice(i, 1);
  }
}

function killAt(state, kind, x, y) {
  const points = pointsFor(kind, state.multiplier);
  addScore(state, points);
  push(state, { type: 'kill', kind, points, x, y });
  spawnBurst(state, x, y, 'chain');
}

function resolveCollisions(state) {
  // Snapshot: chain bursts spawned here start at radius 0 and act from the next frame.
  const bursts = state.bursts.filter((b) => b.source !== 'impact' && b.radius > 0);
  if (bursts.length === 0) return;
  const inside = (x, y, r) => {
    for (const b of bursts) {
      if (Math.hypot(x - b.x, y - b.y) <= b.radius + r) return true;
    }
    return false;
  };
  const wh = state.warheads;
  for (let i = wh.length - 1; i >= 0; i--) {
    const h = wh[i];
    if (inside(h.x, h.y, 0)) { wh.splice(i, 1); killAt(state, 'warhead', h.x, h.y); }
  }
  const sb = state.smartBombs;
  for (let i = sb.length - 1; i >= 0; i--) {
    const s = sb[i];
    if (inside(s.x, s.y, s.radius)) { sb.splice(i, 1); killAt(state, 'smart', s.x, s.y); }
  }
  const fl = state.flyers;
  for (let i = fl.length - 1; i >= 0; i--) {
    const f = fl[i];
    if (inside(f.x, f.y, f.radius)) { fl.splice(i, 1); killAt(state, f.kind, f.x, f.y); }
  }
}

function waveCleared(state) {
  return state._schedule.length === 0
    && state.warheads.length === 0
    && state.smartBombs.length === 0
    && state.flyers.length === 0
    && state.interceptors.length === 0
    && state.bursts.length === 0;
}

// ------------------------------------------------------------------ wave end / tally

function enterWaveEnd(state) {
  let ammoLeft = 0;
  for (const b of state.batteries) if (b.alive) ammoLeft += b.ammo;
  state.phase = 'waveEnd';
  state.waveBanner = 0;
  state.tally = {
    wave: state.wave,
    multiplier: state.multiplier,
    ammoLeft,
    citiesLeft: aliveCityCount(state),
    ammoCounted: 0,
    citiesCounted: 0,
    ammoPoints: 0,
    cityPoints: 0,
    total: 0,
    bonusCitiesRebuilt: 0,
    done: false,
  };
  state._tallyTimer = 0;
  state._holdTimer = 0;
  push(state, { type: 'waveEnd', wave: state.wave });
  if (countingComplete(state.tally)) finishCounting(state);
}

function countingComplete(t) {
  return t.ammoCounted >= t.ammoLeft && t.citiesCounted >= t.citiesLeft;
}

// Counts one step; returns false if nothing was left to count.
function tallyStep(state, emit) {
  const t = state.tally;
  let kind;
  let points;
  if (t.ammoCounted < t.ammoLeft) {
    kind = 'ammo';
    points = BONUS_PER_AMMO * t.multiplier;
    t.ammoCounted++;
    t.ammoPoints = t.ammoCounted * BONUS_PER_AMMO * t.multiplier;
  } else if (t.citiesCounted < t.citiesLeft) {
    kind = 'city';
    points = BONUS_PER_CITY * t.multiplier;
    t.citiesCounted++;
    t.cityPoints = t.citiesCounted * BONUS_PER_CITY * t.multiplier;
  } else {
    return false;
  }
  t.total = t.ammoPoints + t.cityPoints;
  addScore(state, points);
  if (emit) push(state, { type: 'bonusTick', kind, points });
  return true;
}

function finishCounting(state) {
  const t = state.tally;
  let rebuilt = 0;
  while (state.pendingBonusCities > 0) {
    const idx = state.cities.findIndex((c) => !c.alive);
    if (idx < 0) break;
    state.cities[idx].alive = true;
    state.pendingBonusCities--;
    rebuilt++;
    push(state, { type: 'bonusCity', cityIndex: idx });
  }
  t.bonusCitiesRebuilt = rebuilt;
  t.done = true;
  saveHighScore(state.highScore);
}

function leaveWaveEnd(state) {
  if (aliveCityCount(state) === 0) {
    state.phase = 'gameOver';
    state.tally = null;
    state.pausedFrom = null;
    saveHighScore(state.highScore);
    push(state, {
      type: 'gameOver', score: state.score, highScore: state.highScore, newHigh: state.newHighScore,
    });
  } else {
    beginWave(state, state.wave + 1);
  }
}

function updateWaveEnd(state, dt) {
  const t = state.tally;
  if (!t) { leaveWaveEnd(state); return; }
  if (!t.done) {
    state._tallyTimer += dt;
    while (!t.done && state._tallyTimer >= TALLY_TICK_INTERVAL) {
      state._tallyTimer -= TALLY_TICK_INTERVAL;
      tallyStep(state, true);
      if (countingComplete(t)) finishCounting(state);
    }
    return;
  }
  state._holdTimer += dt;
  if (state._holdTimer >= WAVE_END_HOLD) leaveWaveEnd(state);
}

// ------------------------------------------------------------------ public API

export function createGame(options = {}) {
  const rng = typeof options.rng === 'function' ? options.rng : Math.random;
  return {
    phase: 'title',
    pausedFrom: null,
    time: 0,
    wave: 0,
    waveBanner: 0,
    score: 0,
    highScore: loadHighScore(),
    newHighScore: false,
    multiplier: 1,
    nextBonusAt: BONUS_CITY_EVERY,
    pendingBonusCities: 0,
    cities: makeCities(),
    batteries: makeBatteries(),
    selectedBattery: 1,
    warheads: [],
    smartBombs: [],
    flyers: [],
    interceptors: [],
    bursts: [],
    tally: null,
    muted: true,
    events: [],
    nextId: 1,
    _rng: rng,
    _schedule: [],
    _waveClock: 0,
    _tallyTimer: 0,
    _holdTimer: 0,
  };
}

export function startGame(state) {
  state.score = 0;
  state.time = 0;
  state.newHighScore = false;
  state.nextBonusAt = BONUS_CITY_EVERY;
  state.pendingBonusCities = 0;
  state.selectedBattery = 1;
  state.cities = makeCities();
  state.batteries = makeBatteries();
  state.tally = null;
  state.pausedFrom = null;
  clearEntities(state);
  push(state, { type: 'gameStart' });
  beginWave(state, 1);
}

export function restart(state) {
  startGame(state);
}

export function update(state, dt) {
  if (!(dt > 0)) return;
  if (state.phase === 'playing') {
    state.time += dt;
    state._waveClock += dt;
    if (state.waveBanner > 0) state.waveBanner = Math.max(0, state.waveBanner - dt);
    processSchedule(state);
    updateFlyers(state, dt);
    updateWarheads(state, dt);
    updateSmartBombs(state, dt);
    updateInterceptors(state, dt);
    updateBursts(state, dt);
    resolveCollisions(state);
    if (waveCleared(state)) enterWaveEnd(state);
  } else if (state.phase === 'waveEnd') {
    state.time += dt;
    updateWaveEnd(state, dt);
  }
}

function usable(b) {
  return b && b.alive && b.ammo > 0;
}

export function fireInterceptor(state, batteryIndex, targetX, targetY) {
  if (state.phase !== 'playing') return false;
  let used = -1;
  if (batteryIndex === null || batteryIndex === undefined) {
    if (usable(state.batteries[state.selectedBattery])) {
      used = state.selectedBattery;
    } else {
      let best = Infinity;
      state.batteries.forEach((b, i) => {
        if (!usable(b)) return;
        const d = Math.abs(b.x - targetX);
        if (d < best) { best = d; used = i; }
      });
    }
  } else if (usable(state.batteries[batteryIndex])) {
    used = batteryIndex;
  }
  if (used < 0) {
    const req = batteryIndex === null || batteryIndex === undefined ? state.selectedBattery : batteryIndex;
    push(state, { type: 'empty', batteryIndex: req });
    return false;
  }
  const tx = clamp(Number(targetX) || 0, 0, WORLD_W);
  const ty = clamp(Number(targetY) || 0, 0, GROUND_Y - MIN_TARGET_CLEARANCE);
  const b = state.batteries[used];
  b.ammo--;
  state.interceptors.push(makeInterceptor(
    nextId(state), used, b.x, GROUND_Y - BATTERY_LAUNCH_HEIGHT, tx, ty, INTERCEPTOR_SPEED,
  ));
  push(state, { type: 'fire', batteryIndex: used, x: tx, y: ty });
  return true;
}

export function selectBattery(state, index) {
  if (index !== 0 && index !== 1 && index !== 2) return;
  if (state.phase !== 'playing' && state.phase !== 'paused') return;
  if (state.selectedBattery === index) return;
  state.selectedBattery = index;
  push(state, { type: 'select', batteryIndex: index });
}

export function togglePause(state) {
  if (state.phase === 'playing') {
    state.phase = 'paused';
    state.pausedFrom = 'playing';
    push(state, { type: 'pause' });
  } else if (state.phase === 'paused') {
    state.phase = state.pausedFrom || 'playing';
    state.pausedFrom = null;
    push(state, { type: 'resume' });
  }
}

export function skipTally(state) {
  if (state.phase !== 'waveEnd' || !state.tally) return;
  if (!state.tally.done) {
    while (tallyStep(state, false)) { /* count the rest silently */ }
    finishCounting(state);
  }
  leaveWaveEnd(state);
}
