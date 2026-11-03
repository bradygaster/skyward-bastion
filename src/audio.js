// SKYWARD BASTION — synthesized Web Audio (owner: Swigert). Contract §10.
// Everything is generated at runtime: oscillators, gain envelopes and a noise buffer.
// No audio files. Starts muted. The AudioContext is created lazily inside unlock() only.
// Every Web Audio call is guarded; nothing here ever throws to the caller.

const MASTER_VOLUME = 0.45;
const MAX_VOICES = 24;        // concurrent sound voices across all events
const NOISE_SECONDS = 1.0;

// Minimum seconds between two sounds of the same type (dense events are throttled).
const MIN_INTERVAL = {
  fire: 0.025,
  burst: 0.03,
  kill: 0.03,
  empty: 0.12,
  warheadSplit: 0.06,
  flyerSpawn: 0.25,
  smartBombSpawn: 0.25,
  cityDestroyed: 0.08,
  batteryDestroyed: 0.08,
  waveStart: 0.3,
  waveEnd: 0.3,
  bonusTick: 0.035,
  bonusCity: 0.15,
  bonusCityEarned: 0.2,
  gameOver: 0.5,
  gameStart: 0.3,
  select: 0.04,
  pause: 0.08,
  resume: 0.08,
};

function getAudioContextCtor() {
  try {
    if (typeof globalThis === 'undefined') return null;
    return globalThis.AudioContext || globalThis.webkitAudioContext || null;
  } catch (_) {
    return null;
  }
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let unavailable = false;
  let muted = true;
  const lastPlayed = Object.create(null);
  let voiceEnds = []; // ctx times at which active voices finish

  function applyMasterGain() {
    if (!ctx || !master) return;
    try {
      const target = muted ? 0 : MASTER_VOLUME;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(target, t + 0.03);
    } catch (_) {
      try { master.gain.value = muted ? 0 : MASTER_VOLUME; } catch (__) { /* ignore */ }
    }
  }

  function buildGraph() {
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOLUME;
    let out = ctx.destination;
    try {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      comp.connect(out);
      out = comp;
    } catch (_) { /* compressor optional */ }
    master.connect(out);

    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * NOISE_SECONDS));
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (_) {
      noiseBuffer = null;
    }
  }

  function unlock() {
    if (unavailable) return;
    try {
      if (!ctx) {
        const Ctor = getAudioContextCtor();
        if (!Ctor) { unavailable = true; return; }
        ctx = new Ctor();
        buildGraph();
      }
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        const p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (_) {
      // Leave things in a safe, silent state.
      if (!master) { ctx = null; unavailable = true; }
    }
  }

  function setMuted(value) {
    muted = !!value;
    if (!muted) unlock();
    applyMasterGain();
  }

  function isMuted() {
    return muted;
  }

  function toggleMuted() {
    setMuted(!muted);
    return muted;
  }

  // ---- voice helpers -------------------------------------------------------

  function reserveVoice(now, duration) {
    if (voiceEnds.length >= MAX_VOICES) {
      voiceEnds = voiceEnds.filter((end) => end > now);
      if (voiceEnds.length >= MAX_VOICES) return false;
    }
    voiceEnds.push(now + duration);
    return true;
  }

  // Envelope gain node: quick attack, exponential-ish decay to silence.
  function envelope(t, attack, decay, peak) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(master);
    return g;
  }

  // Oscillator tone with a frequency sweep from f0 to f1.
  function tone({ type = 'sine', f0, f1 = f0, t, dur, peak = 0.3, attack = 0.005, detune = 0 }) {
    const g = envelope(t, attack, dur, peak);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + attack + dur);
    if (detune) o.detune.setValueAtTime(detune, t);
    o.connect(g);
    o.start(t);
    o.stop(t + attack + dur + 0.02);
  }

  // Filtered noise with a moving cutoff.
  function noise({ t, dur, peak = 0.3, attack = 0.004, filter = 'lowpass', c0 = 2000, c1 = 200, q = 0.8 }) {
    if (!noiseBuffer) return;
    const g = envelope(t, attack, dur, peak);
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(c0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, c1), t + attack + dur);
    f.connect(g);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.connect(f);
    const offset = Math.random() * Math.max(0, NOISE_SECONDS - dur - 0.1);
    src.start(t, offset);
    src.stop(t + attack + dur + 0.02);
  }

  // ---- sound designs (original) -------------------------------------------

  const SOUNDS = {
    // Interceptor launch: a short rising "thwip" with a breath of air; pitch varies by battery.
    fire(evt, t) {
      const base = [300, 340, 380][evt.batteryIndex] || 340;
      tone({ type: 'triangle', f0: base, f1: base * 3.2, t, dur: 0.09, peak: 0.22 });
      noise({ t, dur: 0.07, peak: 0.06, filter: 'highpass', c0: 3000, c1: 6000 });
      return 0.12;
    },
    // Flak burst: low filtered noise "whump"; chain bursts slightly brighter, impacts darker.
    burst(evt, t) {
      const src = evt.source;
      if (src === 'impact') {
        noise({ t, dur: 0.45, peak: 0.32, c0: 900, c1: 60 });
        tone({ type: 'sine', f0: 90, f1: 35, t, dur: 0.35, peak: 0.25 });
        return 0.5;
      }
      const bright = src === 'chain' ? 1.4 : 1;
      noise({ t, dur: 0.38, peak: src === 'chain' ? 0.2 : 0.28, c0: 1800 * bright, c1: 120 });
      tone({ type: 'sine', f0: 140 * bright, f1: 50, t, dur: 0.22, peak: 0.18 });
      return 0.42;
    },
    // Threat destroyed: a crisp two-step ping, pitched by threat kind.
    kill(evt, t) {
      const pitch = { warhead: 880, smart: 1175, bomber: 660, satellite: 1320 }[evt.kind] || 880;
      tone({ type: 'square', f0: pitch, t, dur: 0.05, peak: 0.07 });
      tone({ type: 'sine', f0: pitch * 1.5, t: t + 0.045, dur: 0.09, peak: 0.12 });
      return 0.16;
    },
    // Dry-fire: two dull low clicks.
    empty(evt, t) {
      tone({ type: 'square', f0: 120, f1: 90, t, dur: 0.05, peak: 0.12 });
      tone({ type: 'square', f0: 100, f1: 75, t: t + 0.08, dur: 0.05, peak: 0.1 });
      return 0.16;
    },
    // Warhead split: a quick descending glassy triple flick.
    warheadSplit(evt, t) {
      const n = Math.min(3, Math.max(2, evt.count | 0 || 2));
      for (let i = 0; i < n; i++) {
        tone({ type: 'triangle', f0: 1400 - i * 220, f1: 700 - i * 120, t: t + i * 0.035, dur: 0.06, peak: 0.1 });
      }
      return 0.06 + n * 0.035 + 0.04;
    },
    // Flyer entering: bomber = low detuned hum swell; satellite = soft telemetry chirps.
    flyerSpawn(evt, t) {
      if (evt.kind === 'satellite') {
        for (let i = 0; i < 3; i++) {
          tone({ type: 'sine', f0: 1600 + (i % 2) * 400, t: t + i * 0.09, dur: 0.05, peak: 0.08 });
        }
        return 0.32;
      }
      tone({ type: 'sawtooth', f0: 70, f1: 82, t, dur: 0.6, peak: 0.07, attack: 0.15 });
      tone({ type: 'sawtooth', f0: 70, f1: 82, t, dur: 0.6, peak: 0.07, attack: 0.15, detune: 14 });
      return 0.8;
    },
    // Smart bomb entering: an uneasy wavering two-tone warble.
    smartBombSpawn(evt, t) {
      tone({ type: 'triangle', f0: 520, f1: 780, t, dur: 0.14, peak: 0.12 });
      tone({ type: 'triangle', f0: 780, f1: 460, t: t + 0.15, dur: 0.18, peak: 0.12 });
      return 0.38;
    },
    // City lost: long rumble with a sinking low tone.
    cityDestroyed(evt, t) {
      noise({ t, dur: 0.9, peak: 0.4, c0: 1200, c1: 40, attack: 0.01 });
      tone({ type: 'sine', f0: 110, f1: 28, t, dur: 0.85, peak: 0.3 });
      return 0.95;
    },
    // Battery lost: harder metallic crunch.
    batteryDestroyed(evt, t) {
      noise({ t, dur: 0.6, peak: 0.36, filter: 'bandpass', c0: 1600, c1: 180, q: 1.6 });
      tone({ type: 'square', f0: 160, f1: 40, t, dur: 0.5, peak: 0.12 });
      return 0.65;
    },
    // Wave start: rising three-note fanfare (fourths), a touch higher at higher multipliers.
    waveStart(evt, t) {
      const m = Math.max(1, Math.min(6, evt.multiplier | 0 || 1));
      const root = 330 * Math.pow(2, (m - 1) / 12);
      [1, 4 / 3, 16 / 9].forEach((r, i) => {
        tone({ type: 'triangle', f0: root * r, t: t + i * 0.11, dur: 0.16, peak: 0.16 });
      });
      return 0.5;
    },
    // Wave cleared: open fifth chord settling.
    waveEnd(evt, t) {
      tone({ type: 'triangle', f0: 392, t, dur: 0.5, peak: 0.12, attack: 0.02 });
      tone({ type: 'triangle', f0: 587, t: t + 0.06, dur: 0.5, peak: 0.1, attack: 0.02 });
      return 0.6;
    },
    // Tally tick: tiny tick; ammo is high and short, city is lower and rounder.
    bonusTick(evt, t) {
      if (evt.kind === 'city') {
        tone({ type: 'sine', f0: 740, t, dur: 0.08, peak: 0.14 });
        return 0.1;
      }
      tone({ type: 'square', f0: 1760, t, dur: 0.02, peak: 0.05 });
      return 0.04;
    },
    // City rebuilt at wave end: bright upward sparkle.
    bonusCity(evt, t) {
      [523, 659, 784, 1047].forEach((f, i) => {
        tone({ type: 'sine', f0: f, t: t + i * 0.06, dur: 0.14, peak: 0.13 });
      });
      return 0.4;
    },
    // Bonus city earned mid-play: short two-note "ding-ding".
    bonusCityEarned(evt, t) {
      tone({ type: 'sine', f0: 988, t, dur: 0.12, peak: 0.14 });
      tone({ type: 'sine', f0: 1319, t: t + 0.1, dur: 0.2, peak: 0.14 });
      return 0.32;
    },
    // Game over: slow descending minor line with a low tail.
    gameOver(evt, t) {
      [440, 349, 294, 220].forEach((f, i) => {
        tone({ type: 'triangle', f0: f, t: t + i * 0.22, dur: 0.3, peak: 0.16 });
      });
      tone({ type: 'sine', f0: 110, f1: 55, t: t + 0.88, dur: 0.9, peak: 0.18 });
      return 1.8;
    },
    // Extras (not required by the contract, but cheap UI feedback).
    gameStart(evt, t) {
      tone({ type: 'triangle', f0: 262, f1: 523, t, dur: 0.12, peak: 0.12 });
      return 0.14;
    },
    select(evt, t) {
      const f = [600, 700, 800][evt.batteryIndex] || 700;
      tone({ type: 'square', f0: f, t, dur: 0.025, peak: 0.05 });
      return 0.04;
    },
    pause(evt, t) {
      tone({ type: 'sine', f0: 660, f1: 440, t, dur: 0.1, peak: 0.1 });
      return 0.12;
    },
    resume(evt, t) {
      tone({ type: 'sine', f0: 440, f1: 660, t, dur: 0.1, peak: 0.1 });
      return 0.12;
    },
  };

  function handleEvent(evt) {
    if (muted || !ctx || !master || !evt) return;
    const play = Object.prototype.hasOwnProperty.call(SOUNDS, evt.type) ? SOUNDS[evt.type] : null;
    if (!play) return;
    try {
      if (ctx.state !== 'running') return;
      const now = ctx.currentTime;
      const minGap = MIN_INTERVAL[evt.type] || 0.02;
      const prev = lastPlayed[evt.type];
      if (prev !== undefined && now - prev < minGap) return;
      // Reserve a voice slot (estimate ~0.5s; trimmed to actual duration below).
      if (!reserveVoice(now, 0.5)) return;
      lastPlayed[evt.type] = now;
      const dur = play(evt, now + 0.005);
      if (typeof dur === 'number') voiceEnds[voiceEnds.length - 1] = now + dur;
    } catch (_) {
      // Never let audio break the game loop.
    }
  }

  return { unlock, setMuted, isMuted, toggleMuted, handleEvent };
}
