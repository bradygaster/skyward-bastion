// SKYWARD BASTION — canvas renderer (owner: Haise).
// Contract: docs/contract.md §5. Reads state, never mutates it.
// Flat, blocky, neo-brutalist: solid fills, thick black strokes, hard offset
// shadows (never blurred), no glow.

import {
  WORLD_W,
  WORLD_H,
  GROUND_Y,
  BATTERY_LAUNCH_HEIGHT,
  CITY_HALF_WIDTH,
  BATTERY_HALF_WIDTH,
  FLYER_RADIUS,
  SMART_RADIUS,
  PALETTE,
  LINE_WIDTH,
} from './config.js';

const GRID_STEP = 40;      // world units between sky grid lines (24 x 15 cells)
const SHADOW_OFF = 3;      // hard offset shadow, world units
const EMPTY = [];

// ------------------------------------------------------------------ pure math

/**
 * Uniform letterboxed world -> CSS-pixel view for a canvas box of cssWidth x cssHeight.
 * scale is CSS px per world unit; offsets are CSS px. Degenerate boxes (0 / NaN)
 * fall back to scale 1 with zero offsets so callers never divide by zero.
 */
export function computeView(cssWidth, cssHeight, dpr) {
  const w = Number.isFinite(cssWidth) && cssWidth > 0 ? cssWidth : 0;
  const h = Number.isFinite(cssHeight) && cssHeight > 0 ? cssHeight : 0;
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  let scale = Math.min(w / WORLD_W, h / WORLD_H);
  if (!(scale > 0)) {
    return { scale: 1, offsetX: 0, offsetY: 0, dpr: d, cssWidth: w, cssHeight: h };
  }
  return {
    scale,
    offsetX: (w - WORLD_W * scale) / 2,
    offsetY: (h - WORLD_H * scale) / 2,
    dpr: d,
    cssWidth: w,
    cssHeight: h,
  };
}

function currentDpr() {
  return (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
}

// ------------------------------------------------------------------ renderer

export function createRenderer(canvas) {
  const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  let view = computeView(0, 0, 1);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = currentDpr();
    const bw = Math.max(1, Math.round(rect.width * dpr));
    const bh = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    view = computeView(rect.width, rect.height, dpr);
  }

  function clientToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const v = computeView(rect.width, rect.height, view.dpr);
    return {
      x: (clientX - rect.left - v.offsetX) / v.scale,
      y: (clientY - rect.top - v.offsetY) / v.scale,
    };
  }

  function getView() {
    return { ...view };
  }

  function draw(state, now) {
    if (!ctx) return;
    // Self-heal if the box or DPR changed without an observer callback.
    const dprNow = currentDpr();
    if (dprNow !== view.dpr) resize();
    const t = Number.isFinite(now) ? now : 0;
    const { scale, offsetX, offsetY, dpr } = view;

    // Letterbox (device pixels, identity transform).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PALETTE.letterbox;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // World space.
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WORLD_W, WORLD_H);
    ctx.clip();
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';

    drawSky(ctx);
    if (state) {
      drawInterceptorTrails(ctx, state.interceptors || EMPTY);
      drawWarheads(ctx, state.warheads || EMPTY);
      drawFlyers(ctx, state.flyers || EMPTY);
      drawSmartBombs(ctx, state.smartBombs || EMPTY, t);
      drawInterceptorHeads(ctx, state.interceptors || EMPTY, t);
    }
    drawGround(ctx);
    if (state) {
      drawCities(ctx, state.cities || EMPTY);
      drawBatteries(ctx, state.batteries || EMPTY, state.selectedBattery, state.phase, t);
      drawBursts(ctx, state.bursts || EMPTY);
    }

    ctx.restore();
  }

  if (canvas) {
    resize();
    if (typeof ResizeObserver !== 'undefined') {
      try {
        new ResizeObserver(() => resize()).observe(canvas);
      } catch (err) {
        /* ignore: window resize fallback below still applies */
      }
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', () => resize());
    }
  }

  return { resize, draw, clientToWorld, getView };
}

// ------------------------------------------------------------------ drawing helpers

function strokeBox(ctx, x, y, w, h, fill, shadow = true) {
  if (shadow) {
    ctx.fillStyle = PALETTE.black;
    ctx.fillRect(x + SHADOW_OFF, y + SHADOW_OFF, w, h);
  }
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.lineWidth = LINE_WIDTH;
  ctx.strokeStyle = PALETTE.black;
  ctx.strokeRect(x, y, w, h);
}

function polygon(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

function fillStrokePoly(ctx, pts, fill, shadow = true) {
  if (shadow) {
    ctx.save();
    ctx.translate(SHADOW_OFF, SHADOW_OFF);
    polygon(ctx, pts);
    ctx.fillStyle = PALETTE.black;
    ctx.fill();
    ctx.restore();
  }
  polygon(ctx, pts);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = LINE_WIDTH;
  ctx.strokeStyle = PALETTE.black;
  ctx.stroke();
}

function drawSky(ctx) {
  ctx.fillStyle = PALETTE.sky;
  ctx.fillRect(0, 0, WORLD_W, GROUND_Y);
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = GRID_STEP; x < WORLD_W; x += GRID_STEP) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, GROUND_Y);
  }
  for (let y = GRID_STEP; y < GROUND_Y; y += GRID_STEP) {
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_W, y);
  }
  ctx.stroke();
}

function drawGround(ctx) {
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(0, GROUND_Y, WORLD_W, WORLD_H - GROUND_Y);
  // Hatched strata: short blocky dashes, flat.
  ctx.fillStyle = PALETTE.ink;
  for (let x = 8; x < WORLD_W; x += 32) {
    ctx.fillRect(x, GROUND_Y + 26, 14, 4);
  }
  ctx.strokeStyle = PALETTE.black;
  ctx.lineWidth = LINE_WIDTH * 1.5;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(WORLD_W, GROUND_Y);
  ctx.stroke();
}

// Deterministic skyline per city slot: [dx, width, height] relative to city center.
const SKYLINES = [
  [[-26, 14, 22], [-12, 16, 38], [4, 12, 28], [16, 10, 16]],
  [[-26, 12, 18], [-14, 14, 30], [0, 16, 44], [16, 10, 24]],
  [[-26, 16, 30], [-10, 12, 20], [2, 14, 36], [16, 10, 14]],
  [[-26, 10, 16], [-16, 16, 34], [0, 12, 24], [12, 14, 40]],
  [[-26, 14, 26], [-12, 12, 40], [0, 14, 18], [14, 12, 30]],
  [[-26, 12, 34], [-14, 16, 22], [2, 12, 42], [14, 12, 20]],
];

function drawCities(ctx, cities) {
  for (let i = 0; i < cities.length; i++) {
    const c = cities[i];
    if (!c) continue;
    const blocks = SKYLINES[i % SKYLINES.length];
    const s = CITY_HALF_WIDTH / 28;
    if (c.alive) {
      for (const [dx, w, h] of blocks) {
        const x = c.x + dx * s;
        const y = GROUND_Y - h;
        strokeBox(ctx, x, y, w * s, h, PALETTE.city);
        // windows: flat paper squares
        ctx.fillStyle = PALETTE.paper;
        for (let wy = y + 5; wy < GROUND_Y - 6; wy += 9) {
          ctx.fillRect(x + 3, wy, 3, 3);
          if (w * s > 11) ctx.fillRect(x + w * s - 6, wy, 3, 3);
        }
      }
    } else {
      // Rubble: low broken slabs.
      const rubble = [
        [-24, 12, 6], [-12, 10, 10], [-2, 14, 5], [12, 12, 8],
      ];
      for (const [dx, w, h] of rubble) {
        strokeBox(ctx, c.x + dx * s, GROUND_Y - h, w * s, h, PALETTE.cityDead, false);
      }
    }
  }
}

function drawBatteries(ctx, batteries, selected, phase, t) {
  const hw = BATTERY_HALF_WIDTH;
  for (let i = 0; i < batteries.length; i++) {
    const b = batteries[i];
    if (!b) continue;
    const x = b.x;
    const isSel = i === selected && phase !== 'title';

    if (b.alive) {
      // Stepped bunker: wide plinth, narrower turret, launcher stub.
      fillStrokePoly(ctx, [
        x - hw, GROUND_Y,
        x - hw + 8, GROUND_Y - 10,
        x + hw - 8, GROUND_Y - 10,
        x + hw, GROUND_Y,
      ], PALETTE.tealMid);
      strokeBox(ctx, x - 14, GROUND_Y - 18, 28, 8, PALETTE.battery);
      strokeBox(ctx, x - 4, GROUND_Y - BATTERY_LAUNCH_HEIGHT - 2, 8, 6, PALETTE.paper, false);
    } else {
      fillStrokePoly(ctx, [
        x - hw, GROUND_Y,
        x - hw + 10, GROUND_Y - 5,
        x - 4, GROUND_Y - 8,
        x + 6, GROUND_Y - 4,
        x + hw - 6, GROUND_Y - 6,
        x + hw, GROUND_Y,
      ], PALETTE.cityDead, false);
      ctx.strokeStyle = PALETTE.black;
      ctx.lineWidth = LINE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(x - 8, GROUND_Y + 8); ctx.lineTo(x + 8, GROUND_Y + 22);
      ctx.moveTo(x + 8, GROUND_Y + 8); ctx.lineTo(x - 8, GROUND_Y + 22);
      ctx.stroke();
    }

    // Ammo pips under the battery, two rows of up to 5 (wrap for larger maxAmmo).
    if (b.alive) {
      const max = Math.max(0, b.maxAmmo | 0);
      const ammo = Math.max(0, Math.min(max, b.ammo | 0));
      const perRow = 5;
      const pip = 6;
      const gap = 3;
      const rowW = perRow * pip + (perRow - 1) * gap;
      for (let k = 0; k < max; k++) {
        const col = k % perRow;
        const row = Math.floor(k / perRow);
        const px = x - rowW / 2 + col * (pip + gap);
        const py = GROUND_Y + 6 + row * (pip + gap);
        if (py + pip > WORLD_H) break;
        ctx.fillStyle = k < ammo ? PALETTE.paper : PALETTE.ground;
        ctx.fillRect(px, py, pip, pip);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = PALETTE.black;
        ctx.strokeRect(px, py, pip, pip);
      }
    }

    // Selected marker: accent chevron above the turret, gentle blink when unusable.
    if (isSel) {
      const unusable = !b.alive || (b.ammo | 0) === 0;
      const visible = !unusable || Math.floor(t / 250) % 2 === 0;
      if (visible) {
        const top = GROUND_Y - BATTERY_LAUNCH_HEIGHT - 20;
        fillStrokePoly(ctx, [
          x - 10, top,
          x + 10, top,
          x, top + 10,
        ], PALETTE.accent, false);
      }
    }
  }
}

function drawWarheads(ctx, warheads) {
  ctx.lineCap = 'butt';
  ctx.strokeStyle = PALETTE.warheadTrail;
  ctx.lineWidth = LINE_WIDTH * 0.8;
  ctx.beginPath();
  for (const w of warheads) {
    if (!w) continue;
    ctx.moveTo(w.startX, w.startY);
    ctx.lineTo(w.x, w.y);
  }
  ctx.stroke();
  for (const w of warheads) {
    if (!w) continue;
    ctx.fillStyle = PALETTE.warhead;
    ctx.fillRect(w.x - 3.5, w.y - 3.5, 7, 7);
    ctx.fillStyle = PALETTE.paper;
    ctx.fillRect(w.x - 1.5, w.y - 1.5, 3, 3);
  }
}

function drawInterceptorTrails(ctx, interceptors) {
  if (!interceptors.length) return;
  ctx.strokeStyle = PALETTE.interceptorTrail;
  ctx.lineWidth = LINE_WIDTH;
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  for (const m of interceptors) {
    if (!m) continue;
    ctx.moveTo(m.startX, m.startY);
    ctx.lineTo(m.x, m.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawInterceptorHeads(ctx, interceptors, t) {
  const blink = Math.floor(t / 180) % 2 === 0;
  for (const m of interceptors) {
    if (!m) continue;
    // Target "X"
    const s = 7;
    ctx.strokeStyle = PALETTE.black;
    ctx.lineWidth = LINE_WIDTH + (blink ? 0.5 : 0);
    ctx.beginPath();
    ctx.moveTo(m.targetX - s, m.targetY - s); ctx.lineTo(m.targetX + s, m.targetY + s);
    ctx.moveTo(m.targetX + s, m.targetY - s); ctx.lineTo(m.targetX - s, m.targetY + s);
    ctx.stroke();
    // Head
    ctx.fillStyle = PALETTE.interceptor;
    ctx.fillRect(m.x - 3.5, m.y - 3.5, 7, 7);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(m.x - 3.5, m.y - 3.5, 7, 7);
  }
}

function drawFlyers(ctx, flyers) {
  for (const f of flyers) {
    if (!f) continue;
    const r = f.radius > 0 ? f.radius : FLYER_RADIUS;
    const d = f.dir === -1 ? -1 : 1;
    if (f.kind === 'satellite') {
      // Square core, two slatted panels, mast.
      const c = r * 0.5;
      strokeBox(ctx, f.x - c, f.y - c, c * 2, c * 2, PALETTE.flyer);
      const pw = r * 0.85;
      const ph = r * 0.7;
      strokeBox(ctx, f.x - c - pw - 2, f.y - ph / 2, pw, ph, PALETTE.tealMid);
      strokeBox(ctx, f.x + c + 2, f.y - ph / 2, pw, ph, PALETTE.tealMid);
      ctx.strokeStyle = PALETTE.black;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(f.x - c - pw / 2 - 2, f.y - ph / 2); ctx.lineTo(f.x - c - pw / 2 - 2, f.y + ph / 2);
      ctx.moveTo(f.x + c + pw / 2 + 2, f.y - ph / 2); ctx.lineTo(f.x + c + pw / 2 + 2, f.y + ph / 2);
      ctx.moveTo(f.x, f.y - c); ctx.lineTo(f.x, f.y - c - 6);
      ctx.stroke();
      ctx.fillStyle = PALETTE.paper;
      ctx.fillRect(f.x - 2, f.y - 2, 4, 4);
    } else {
      // Bomber: blunt chevron hull pointing in its direction of travel, tail fin.
      fillStrokePoly(ctx, [
        f.x + d * r, f.y,
        f.x + d * r * 0.2, f.y - r * 0.55,
        f.x - d * r, f.y - r * 0.55,
        f.x - d * r * 0.6, f.y,
        f.x - d * r, f.y + r * 0.55,
        f.x + d * r * 0.2, f.y + r * 0.55,
      ], PALETTE.flyer);
      fillStrokePoly(ctx, [
        f.x - d * r * 0.7, f.y - r * 0.55,
        f.x - d * r * 0.95, f.y - r * 1.0,
        f.x - d * r * 0.45, f.y - r * 0.55,
      ], PALETTE.tealMid, false);
      ctx.fillStyle = PALETTE.paper;
      ctx.fillRect(f.x + d * r * 0.25 - 2, f.y - 2, 4, 4);
    }
  }
}

function drawSmartBombs(ctx, bombs, t) {
  for (const b of bombs) {
    if (!b) continue;
    const r = (b.radius > 0 ? b.radius : SMART_RADIUS) + 2;
    fillStrokePoly(ctx, [
      b.x, b.y - r,
      b.x + r, b.y,
      b.x, b.y + r,
      b.x - r, b.y,
    ], PALETTE.smart);
    const on = Math.floor(t / 200) % 2 === 0;
    ctx.fillStyle = on ? PALETTE.black : PALETTE.paper;
    ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
  }
}

function drawBursts(ctx, bursts) {
  for (const b of bursts) {
    if (!b) continue;
    const r = b.radius;
    if (!(r > 0.5)) continue;
    const fill = b.source === 'impact' ? PALETTE.tealMid
      : b.source === 'chain' ? PALETTE.tealLight
        : PALETTE.burstFill;
    // Hard offset shadow (no blur).
    ctx.beginPath();
    ctx.arc(b.x + SHADOW_OFF, b.y + SHADOW_OFF, r, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.black;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = LINE_WIDTH;
    ctx.strokeStyle = PALETTE.burstStroke;
    ctx.stroke();
    // Inner ring for a flat, graphic "flak" read.
    if (r > 8) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * 0.5, 0, Math.PI * 2);
      ctx.lineWidth = LINE_WIDTH * 0.6;
      ctx.stroke();
    }
  }
}
