// SKYWARD BASTION — entity factories and per-entity helpers (owner: Lovell, private).
// Imports only config.js.

import {
  WORLD_W, BURST_GROW_TIME, BURST_HOLD_TIME, BURST_SHRINK_TIME,
  BOMBER_SPEED, SATELLITE_SPEED, BOMBER_Y_RANGE, SATELLITE_Y_RANGE,
  FLYER_RADIUS, FLYER_DROPS, FLYER_DROP_INTERVAL, SMART_RADIUS, SKY_TOP_SPAWN_Y,
} from './config.js';

function aim(x, y, tx, ty, speed) {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9) return { vx: 0, vy: speed };
  return { vx: (dx / d) * speed, vy: (dy / d) * speed };
}

// target = { targetX, targetY, targetType, targetIndex }
export function makeWarhead(id, x, y, target, speed, canSplit, splitAtY) {
  const v = aim(x, y, target.targetX, target.targetY, speed);
  return {
    id, x, y, startX: x, startY: y,
    targetX: target.targetX, targetY: target.targetY,
    vx: v.vx, vy: v.vy, speed,
    targetType: target.targetType, targetIndex: target.targetIndex,
    canSplit: !!canSplit, splitAtY: canSplit ? splitAtY : 0,
  };
}

export function makeInterceptor(id, batteryIndex, x, y, targetX, targetY, speed) {
  const v = aim(x, y, targetX, targetY, speed);
  return {
    id, batteryIndex, x, y, startX: x, startY: y, targetX, targetY,
    vx: v.vx, vy: v.vy, speed,
  };
}

export function makeBurst(id, x, y, maxRadius, source) {
  return { id, x, y, radius: 0, maxRadius, age: 0, stage: 'grow', source };
}

// Advances a burst; returns false when it has finished and should be removed.
export function updateBurst(b, dt) {
  b.age += dt;
  const a = b.age;
  if (a < BURST_GROW_TIME) {
    b.stage = 'grow';
    b.radius = b.maxRadius * (a / BURST_GROW_TIME);
  } else if (a < BURST_GROW_TIME + BURST_HOLD_TIME) {
    b.stage = 'hold';
    b.radius = b.maxRadius;
  } else if (a < BURST_GROW_TIME + BURST_HOLD_TIME + BURST_SHRINK_TIME) {
    b.stage = 'shrink';
    const s = (a - BURST_GROW_TIME - BURST_HOLD_TIME) / BURST_SHRINK_TIME;
    b.radius = b.maxRadius * (1 - s);
  } else {
    b.stage = 'shrink';
    b.radius = 0;
    return false;
  }
  return true;
}

export function makeFlyer(id, kind, rng) {
  const dir = rng() < 0.5 ? 1 : -1;
  const range = kind === 'satellite' ? SATELLITE_Y_RANGE : BOMBER_Y_RANGE;
  const speed = kind === 'satellite' ? SATELLITE_SPEED : BOMBER_SPEED;
  const radius = FLYER_RADIUS;
  return {
    id, kind,
    x: dir === 1 ? -radius : WORLD_W + radius,
    y: range[0] + rng() * (range[1] - range[0]),
    vx: dir * speed, dir,
    dropsLeft: FLYER_DROPS,
    dropTimer: FLYER_DROP_INTERVAL * 0.5,
    radius,
  };
}

export function flyerOffscreen(f) {
  return f.dir === 1 ? f.x - f.radius > WORLD_W : f.x + f.radius < 0;
}

export function flyerOnscreen(f) {
  return f.x >= 0 && f.x <= WORLD_W;
}

export function makeSmartBomb(id, x, target, speed) {
  const v = aim(x, SKY_TOP_SPAWN_Y, target.targetX, target.targetY, speed);
  return {
    id, x, y: SKY_TOP_SPAWN_Y, vx: v.vx, vy: v.vy,
    targetX: target.targetX, targetY: target.targetY,
    targetType: target.targetType, targetIndex: target.targetIndex,
    radius: SMART_RADIUS,
  };
}

export { aim };
