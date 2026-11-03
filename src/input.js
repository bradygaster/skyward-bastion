// SKYWARD BASTION — pointer + keyboard input (owner: Swigert). Contract §9.
// Input never inspects game state; it only translates DOM events into callbacks.
// All callbacks run synchronously inside the DOM event handler (audio unlock needs a gesture).

import { BATTERY_KEYS_SELECT, BATTERY_KEYS_FIRE } from './config.js';

function noop() {}

function isEditableTarget(target) {
  if (!target || typeof target !== 'object') return false;
  if (target.isContentEditable) return true;
  const tag = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function createInput({
  canvas,
  clientToWorld,
  onFire = noop,
  onSelectBattery = noop,
  onPause = noop,
  onRestart = noop,
  onToggleMute = noop,
  onStart = noop,
} = {}) {
  let pointer = null; // last known world position {x, y}

  function toWorld(evt) {
    try {
      const p = clientToWorld(evt.clientX, evt.clientY);
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        pointer = { x: p.x, y: p.y };
      }
    } catch (err) {
      console.error(err);
    }
    return pointer;
  }

  function handlePointerMove(evt) {
    toWorld(evt);
  }

  function handlePointerDown(evt) {
    const isMouse = evt.pointerType === 'mouse' || !evt.pointerType;
    if (isMouse && evt.button !== 0) return;
    // Touch/pen: every contact fires (multi-touch = multiple shots, by design).
    const p = toWorld(evt);
    evt.preventDefault();
    if (!p) return;
    onFire(p.x, p.y, null);
  }

  function handleContextMenu(evt) {
    evt.preventDefault();
  }

  function handleKeyDown(evt) {
    if (evt.ctrlKey || evt.metaKey || evt.altKey) return; // leave browser shortcuts alone
    if (isEditableTarget(evt.target)) return;
    const raw = evt.key;
    if (typeof raw !== 'string') return;
    const key = raw.length === 1 ? raw.toLowerCase() : raw;

    let idx = BATTERY_KEYS_SELECT.indexOf(key);
    if (idx !== -1) {
      evt.preventDefault();
      if (evt.repeat) return;
      onSelectBattery(idx);
      return;
    }

    idx = BATTERY_KEYS_FIRE.indexOf(key);
    if (idx !== -1) {
      evt.preventDefault();
      if (evt.repeat) return;
      onSelectBattery(idx);
      if (pointer) onFire(pointer.x, pointer.y, idx);
      return;
    }

    switch (key) {
      case 'p':
      case 'Escape':
        evt.preventDefault();
        if (!evt.repeat) onPause();
        return;
      case 'r':
        evt.preventDefault();
        if (!evt.repeat) onRestart();
        return;
      case 'm':
        evt.preventDefault();
        if (!evt.repeat) onToggleMute();
        return;
      case 'Enter':
      case ' ':
      case 'Spacebar':
        evt.preventDefault();
        if (!evt.repeat) onStart();
        return;
      default:
        return;
    }
  }

  const hasCanvas = canvas && typeof canvas.addEventListener === 'function';
  if (hasCanvas) {
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('contextmenu', handleContextMenu);
  }
  const win = typeof window !== 'undefined' ? window : null;
  if (win) win.addEventListener('keydown', handleKeyDown);

  return {
    destroy() {
      if (hasCanvas) {
        canvas.removeEventListener('pointermove', handlePointerMove);
        canvas.removeEventListener('pointerdown', handlePointerDown);
        canvas.removeEventListener('contextmenu', handleContextMenu);
      }
      if (win) win.removeEventListener('keydown', handleKeyDown);
    },
    getPointer() {
      return pointer ? { x: pointer.x, y: pointer.y } : null;
    },
  };
}
