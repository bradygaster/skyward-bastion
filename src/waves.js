// SKYWARD BASTION — wave composition and spawn schedule (owner: Lovell, private).
// Contract §11.1, §11.4-11.6. Imports only config.js.

import {
  WARHEADS_BASE, WARHEADS_PER_WAVE, WARHEADS_MAX,
  WARHEAD_SPEED_BASE, WARHEAD_SPEED_PER_WAVE, WARHEAD_SPEED_MAX, WARHEAD_SPEED_JITTER,
  SPAWN_INTERVAL_BASE, SPAWN_INTERVAL_PER_WAVE, SPAWN_INTERVAL_MIN, SALVO_MAX,
  WAVE_INTRO_TIME,
  SPLIT_MIN_WAVE, SPLIT_CHANCE_BASE, SPLIT_CHANCE_PER_WAVE, SPLIT_CHANCE_MAX,
  FLYER_MIN_WAVE, FLYERS_BASE, FLYERS_PER_TWO_WAVES, FLYERS_MAX, SATELLITE_MIN_WAVE,
  SMART_MIN_WAVE, SMART_BASE, SMART_PER_WAVE, SMART_MAX,
} from './config.js';

export function warheadCount(w) {
  return Math.min(WARHEADS_BASE + WARHEADS_PER_WAVE * (w - 1), WARHEADS_MAX);
}

export function warheadBaseSpeed(w) {
  return Math.min(WARHEAD_SPEED_BASE + WARHEAD_SPEED_PER_WAVE * (w - 1), WARHEAD_SPEED_MAX);
}

export function warheadSpeed(w, rng) {
  return warheadBaseSpeed(w) * (1 + (rng() * 2 - 1) * WARHEAD_SPEED_JITTER);
}

export function spawnInterval(w) {
  return Math.max(SPAWN_INTERVAL_BASE + SPAWN_INTERVAL_PER_WAVE * (w - 1), SPAWN_INTERVAL_MIN);
}

export function splitChance(w) {
  if (w < SPLIT_MIN_WAVE) return 0;
  return Math.min(SPLIT_CHANCE_BASE + SPLIT_CHANCE_PER_WAVE * (w - SPLIT_MIN_WAVE), SPLIT_CHANCE_MAX);
}

export function flyerCount(w) {
  if (w < FLYER_MIN_WAVE) return 0;
  return Math.min(
    FLYERS_BASE + Math.floor((w - FLYER_MIN_WAVE) / 2) * FLYERS_PER_TWO_WAVES,
    FLYERS_MAX,
  );
}

export function smartCount(w) {
  if (w < SMART_MIN_WAVE) return 0;
  return Math.min(SMART_BASE + SMART_PER_WAVE * (w - SMART_MIN_WAVE), SMART_MAX);
}

function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// Returns a time-sorted array of spawn entries; times are seconds since wave start.
//   { t, type: 'warheads', count } | { t, type: 'flyer', kind } | { t, type: 'smart' }
export function buildSchedule(w, rng) {
  const out = [];
  const interval = spawnInterval(w);
  let remaining = warheadCount(w);
  let t = WAVE_INTRO_TIME;
  while (remaining > 0) {
    const count = Math.min(remaining, randInt(rng, 1, SALVO_MAX));
    out.push({ t, type: 'warheads', count });
    remaining -= count;
    t += interval;
  }
  const span = Math.max(t - interval - WAVE_INTRO_TIME, interval);

  const flyers = flyerCount(w);
  for (let i = 0; i < flyers; i++) {
    const kind = w < SATELLITE_MIN_WAVE ? 'bomber' : (rng() < 0.5 ? 'bomber' : 'satellite');
    out.push({ t: WAVE_INTRO_TIME + rng() * span, type: 'flyer', kind });
  }
  const smarts = smartCount(w);
  for (let i = 0; i < smarts; i++) {
    out.push({ t: WAVE_INTRO_TIME + span * (0.15 + 0.85 * rng()), type: 'smart' });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}
