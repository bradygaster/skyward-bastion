// SKYWARD BASTION — DOM HUD + overlays (owner: Haise).
// Contract: docs/contract.md §6/§7. Reads state, never mutates it; writes to the
// DOM only when a value changes; attaches no event listeners.

const OVERLAY_FOR_PHASE = {
  title: 'overlay-title',
  paused: 'overlay-paused',
  waveEnd: 'overlay-waveend',
  gameOver: 'overlay-gameover',
};
const OVERLAY_IDS = ['overlay-title', 'overlay-paused', 'overlay-waveend', 'overlay-gameover'];

function fmt(n) {
  const v = Number(n);
  return (Number.isFinite(v) ? v : 0).toLocaleString('en-US');
}

export function createHud(root = document) {
  const get = (id) => (root && typeof root.getElementById === 'function' ? root.getElementById(id) : null);
  const cache = new Map();

  function changed(key, value) {
    if (cache.has(key) && cache.get(key) === value) return false;
    cache.set(key, value);
    return true;
  }

  function setText(id, value) {
    const el = get(id);
    if (!el) return;
    const text = String(value);
    if (changed(`t:${id}`, text)) el.textContent = text;
  }

  function setHidden(id, hidden) {
    const el = get(id);
    if (!el) return;
    if (changed(`h:${id}`, hidden)) el.hidden = hidden;
  }

  function setClass(id, cls, on) {
    const el = get(id);
    if (!el) return;
    if (changed(`c:${id}:${cls}`, on)) el.classList.toggle(cls, on);
  }

  function setAttr(id, name, value) {
    const el = get(id);
    if (!el) return;
    if (changed(`a:${id}:${name}`, value)) el.setAttribute(name, value);
  }

  function update(state) {
    if (!state) return;
    const phase = state.phase;

    setText('hud-score', fmt(state.score));
    setText('hud-high', fmt(state.highScore));
    setText('hud-wave', fmt(state.wave));
    setText('hud-mult', `${state.multiplier}x`);
    const cities = state.cities || [];
    let alive = 0;
    for (const c of cities) if (c && c.alive) alive++;
    setText('hud-cities', fmt(alive));

    const batteries = state.batteries || [];
    for (let i = 0; i < 3; i++) {
      const b = batteries[i];
      const id = `battery-${i}`;
      const isAlive = !!(b && b.alive);
      const ammo = b ? b.ammo | 0 : 0;
      setClass(id, 'is-selected', i === state.selectedBattery);
      setClass(id, 'is-empty', isAlive && ammo === 0);
      setClass(id, 'is-destroyed', !isAlive);
      setText(`${id}-ammo`, fmt(ammo));
    }

    const muted = !!state.muted;
    setText('mute-btn', muted ? 'SOUND: OFF' : 'SOUND: ON');
    setAttr('mute-btn', 'aria-pressed', String(muted));
    setAttr('mute-btn', 'data-muted', String(muted));

    const visible = OVERLAY_FOR_PHASE[phase] || null;
    for (const id of OVERLAY_IDS) setHidden(id, id !== visible);

    const showBanner = phase === 'playing' && state.waveBanner > 0;
    setHidden('wave-banner', !showBanner);
    if (showBanner) setText('wave-banner', `WAVE ${state.wave} · ${state.multiplier}x`);

    if (phase === 'title') setText('title-high', fmt(state.highScore));

    const tally = state.tally;
    if (phase === 'waveEnd' && tally) {
      setText('tally-wave', fmt(tally.wave));
      setText('tally-mult', `${tally.multiplier}x`);
      setText('tally-ammo', `${tally.ammoCounted} / ${tally.ammoLeft}`);
      setText('tally-ammo-points', fmt(tally.ammoPoints));
      setText('tally-cities', `${tally.citiesCounted} / ${tally.citiesLeft}`);
      setText('tally-city-points', fmt(tally.cityPoints));
      setText('tally-total', fmt(tally.total));
      const rebuilt = tally.bonusCitiesRebuilt | 0;
      setHidden('tally-bonus-city', !(rebuilt > 0));
      if (rebuilt > 0) setText('tally-bonus-city', `+${rebuilt} CITY REBUILT`);
    } else if (phase !== 'waveEnd') {
      setHidden('tally-bonus-city', true);
    }

    if (phase === 'gameOver') {
      setText('final-score', fmt(state.score));
      setText('final-high', fmt(state.highScore));
      setText('final-wave', fmt(state.wave));
      setHidden('new-high', !state.newHighScore);
    }
  }

  return { update };
}
