// SKYWARD BASTION — tunable constants (owner: Kranz).
// All gameplay modules import from here. Units: world units (wu), seconds (s).
// Changing a value here must not require code changes elsewhere.

// ---------------------------------------------------------------- world
export const WORLD_W = 960;
export const WORLD_H = 600;
export const GROUND_Y = 560;          // y of the ground line (y grows downward)
export const SKY_TOP_SPAWN_Y = -10;   // warheads spawn just above the top edge
export const MIN_TARGET_CLEARANCE = 30; // aim points are clamped to y <= GROUND_Y - this

// 3 batteries (left / center / right) and 6 cities, all sitting on GROUND_Y.
export const BATTERY_XS = [60, 480, 900];
export const CITY_XS = [150, 240, 330, 630, 720, 810];
export const BATTERY_LAUNCH_HEIGHT = 22; // interceptors launch from (battery.x, GROUND_Y - this)
export const CITY_HALF_WIDTH = 28;       // for rendering + impact footprint
export const BATTERY_HALF_WIDTH = 32;

// ---------------------------------------------------------------- batteries / interceptors
export const AMMO_PER_BATTERY = 10;    // refilled at the start of every wave
export const INTERCEPTOR_SPEED = 520;  // wu/s, all batteries
export const BATTERY_KEYS_SELECT = ['1', '2', '3'];
export const BATTERY_KEYS_FIRE = ['a', 's', 'd'];

// ---------------------------------------------------------------- bursts (flak)
export const BURST_MAX_RADIUS = 38;    // player interceptor burst
export const CHAIN_BURST_MAX_RADIUS = 30; // burst spawned by a destroyed threat
export const IMPACT_BURST_MAX_RADIUS = 24; // harmless burst where a warhead hits ground/target
export const BURST_GROW_TIME = 0.45;
export const BURST_HOLD_TIME = 0.25;
export const BURST_SHRINK_TIME = 0.45;

// ---------------------------------------------------------------- warheads
export const WARHEAD_SPEED_BASE = 30;      // wave 1
export const WARHEAD_SPEED_PER_WAVE = 6;
export const WARHEAD_SPEED_MAX = 115;
export const WARHEAD_SPEED_JITTER = 0.15;  // +/- fraction applied per warhead
export const WARHEADS_BASE = 10;           // wave 1 count (excludes flyer drops / splits)
export const WARHEADS_PER_WAVE = 2;
export const WARHEADS_MAX = 32;
export const SPAWN_INTERVAL_BASE = 1.6;    // s between scheduled warhead spawns, wave 1
export const SPAWN_INTERVAL_PER_WAVE = -0.08;
export const SPAWN_INTERVAL_MIN = 0.5;
export const SALVO_MAX = 3;                // a spawn tick may launch 1..SALVO_MAX warheads
export const WAVE_INTRO_TIME = 1.5;        // s of "WAVE N" banner before spawns begin

// ---------------------------------------------------------------- splitting warheads
export const SPLIT_MIN_WAVE = 2;
export const SPLIT_CHANCE_BASE = 0.12;     // at SPLIT_MIN_WAVE
export const SPLIT_CHANCE_PER_WAVE = 0.04;
export const SPLIT_CHANCE_MAX = 0.4;
export const SPLIT_Y_MIN = 120;            // split happens when y crosses a random value in [min,max]
export const SPLIT_Y_MAX = 320;
export const SPLIT_COUNT_MIN = 2;          // original is removed and replaced by this many children
export const SPLIT_COUNT_MAX = 3;

// ---------------------------------------------------------------- flyers (bombers / satellites)
export const FLYER_MIN_WAVE = 3;
export const FLYERS_BASE = 1;              // count at FLYER_MIN_WAVE
export const FLYERS_PER_TWO_WAVES = 1;     // +1 every 2 waves after FLYER_MIN_WAVE
export const FLYERS_MAX = 4;
export const SATELLITE_MIN_WAVE = 4;       // before this every flyer is a bomber
export const BOMBER_SPEED = 70;
export const SATELLITE_SPEED = 100;
export const BOMBER_Y_RANGE = [150, 230];
export const SATELLITE_Y_RANGE = [70, 130];
export const FLYER_RADIUS = 14;
export const FLYER_DROPS = 3;              // warheads dropped per flyer
export const FLYER_DROP_INTERVAL = 2.2;    // s

// ---------------------------------------------------------------- smart bombs
export const SMART_MIN_WAVE = 5;
export const SMART_BASE = 1;               // count at SMART_MIN_WAVE
export const SMART_PER_WAVE = 1;
export const SMART_MAX = 6;
export const SMART_SPEED = 42;             // descent speed toward target, wu/s
export const SMART_EVADE_MARGIN = 40;      // evade when distance < burst.radius + this
export const SMART_EVADE_SPEED = 95;       // lateral dodge speed, wu/s
export const SMART_RADIUS = 7;

// ---------------------------------------------------------------- scoring
export const POINTS = {
  warhead: 25,
  smart: 125,
  bomber: 100,
  satellite: 100,
};
export const BONUS_PER_AMMO = 5;           // x multiplier
export const BONUS_PER_CITY = 100;         // x multiplier
export const BONUS_CITY_EVERY = 10000;     // points
// MULTIPLIER_TABLE[i] = { maxWave, mult }; first row with wave <= maxWave wins.
export const MULTIPLIER_TABLE = [
  { maxWave: 2, mult: 1 },
  { maxWave: 4, mult: 2 },
  { maxWave: 6, mult: 3 },
  { maxWave: 8, mult: 4 },
  { maxWave: 10, mult: 5 },
  { maxWave: Infinity, mult: 6 },
];

// ---------------------------------------------------------------- wave end tally
export const TALLY_TICK_INTERVAL = 0.08;   // s between 'bonusTick' events
export const WAVE_END_HOLD = 2.0;          // s to hold the finished tally before next wave

// ---------------------------------------------------------------- loop
export const MAX_DT = 0.05;                // main clamps frame dt (s) to this

// ---------------------------------------------------------------- persistence
export const HIGH_SCORE_KEY = 'skyward-bastion-highscore';

// ---------------------------------------------------------------- palette (canvas)
// Mirrors the CSS custom properties in styles.css (see docs/contract.md §8).
export const PALETTE = {
  tealLight: '#9fc9c2',
  tealMid: '#3f7f78',
  tealDark: '#1d3532',
  ink: '#0b1514',
  black: '#000000',
  paper: '#e6f0ee',
  accent: '#e0a43a',      // single subtle accent: smart bombs + selected battery marker only
  sky: '#9fc9c2',
  grid: 'rgba(11, 21, 20, 0.12)',
  ground: '#1d3532',
  city: '#3f7f78',
  cityDead: '#1d3532',
  battery: '#0b1514',
  warhead: '#0b1514',
  warheadTrail: '#1d3532',
  interceptor: '#e6f0ee',
  interceptorTrail: '#3f7f78',
  burstFill: '#e6f0ee',
  burstStroke: '#000000',
  flyer: '#0b1514',
  smart: '#e0a43a',
  letterbox: '#0b1514',
};
export const LINE_WIDTH = 3;               // canvas stroke width in world units
