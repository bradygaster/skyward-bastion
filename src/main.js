// SKYWARD BASTION — bootstrap and loop wiring (owner: Kranz).
// Uses only the APIs pinned in docs/contract.md.

import { MAX_DT } from './config.js';
import {
  createGame,
  startGame,
  restart,
  update,
  fireInterceptor,
  selectBattery,
  togglePause,
  skipTally,
} from './game.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';

const canvas = document.getElementById('game-canvas');
const muteBtn = document.getElementById('mute-btn');

const state = createGame();
const renderer = createRenderer(canvas);
const hud = createHud(document);
const audio = createAudio();
state.muted = audio.isMuted();

function gesture() {
  // Called synchronously inside user-gesture handlers; lazily creates/resumes the AudioContext.
  try { audio.unlock(); } catch (err) { console.error(err); }
}

function drainEvents() {
  const events = state.events;
  for (let i = 0; i < events.length; i++) {
    try { audio.handleEvent(events[i]); } catch (err) { console.error(err); }
  }
  events.length = 0;
}

function startOrSkip() {
  switch (state.phase) {
    case 'title':
    case 'gameOver':
      startGame(state);
      return true;
    case 'waveEnd':
      skipTally(state);
      return true;
    default:
      return false;
  }
}

function toggleMute() {
  gesture();
  audio.toggleMuted();
  state.muted = audio.isMuted();
}

createInput({
  canvas,
  clientToWorld: renderer.clientToWorld,
  onFire(x, y, batteryIndex) {
    gesture();
    if (state.phase === 'playing') {
      fireInterceptor(state, batteryIndex, x, y);
    } else {
      startOrSkip();
    }
    drainEvents();
  },
  onSelectBattery(index) {
    gesture();
    selectBattery(state, index);
    drainEvents();
  },
  onPause() {
    gesture();
    togglePause(state);
    drainEvents();
  },
  onRestart() {
    gesture();
    if (state.phase !== 'title') restart(state);
    drainEvents();
  },
  onToggleMute() {
    toggleMute();
  },
  onStart() {
    gesture();
    if (state.phase === 'paused') {
      togglePause(state);
    } else {
      startOrSkip();
    }
    drainEvents();
  },
});

muteBtn.addEventListener('click', (evt) => {
  evt.preventDefault();
  toggleMute();
  muteBtn.blur(); // keep Space/Enter going to the game, not re-toggling the button
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.phase === 'playing') {
    togglePause(state);
    drainEvents();
  }
});

let last = null;

function frame(now) {
  try {
    let dt = last === null ? 0 : (now - last) / 1000;
    if (!(dt >= 0)) dt = 0;
    if (dt > MAX_DT) dt = MAX_DT;
    last = now;

    update(state, dt);
    drainEvents();
    renderer.draw(state, now);
    hud.update(state);
  } catch (err) {
    console.error(err);
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
