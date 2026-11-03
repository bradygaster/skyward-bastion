// SKYWARD BASTION — scoring and high-score persistence (owner: Lovell).
// Contract §4.4. Imports only config.js.

import { MULTIPLIER_TABLE, POINTS, HIGH_SCORE_KEY } from './config.js';

export function multiplierForWave(wave) {
  const w = Number(wave) || 1;
  for (let i = 0; i < MULTIPLIER_TABLE.length; i++) {
    if (w <= MULTIPLIER_TABLE[i].maxWave) return MULTIPLIER_TABLE[i].mult;
  }
  return MULTIPLIER_TABLE[MULTIPLIER_TABLE.length - 1].mult;
}

export function pointsFor(kind, multiplier) {
  const base = POINTS[kind] || 0;
  return base * (multiplier || 1);
}

function getStorage() {
  try {
    const s = globalThis.localStorage;
    return s && typeof s.getItem === 'function' ? s : null;
  } catch (err) {
    return null;
  }
}

export function loadHighScore() {
  try {
    const s = getStorage();
    if (!s) return 0;
    const raw = s.getItem(HIGH_SCORE_KEY);
    if (raw === null || raw === undefined) return 0;
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (err) {
    return 0;
  }
}

export function saveHighScore(value) {
  try {
    const s = getStorage();
    if (!s) return;
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 0) return;
    s.setItem(HIGH_SCORE_KEY, String(n));
  } catch (err) {
    // storage unavailable / quota / privacy mode: ignore
  }
}
