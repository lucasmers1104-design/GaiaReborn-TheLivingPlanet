/* =============================================================================
 * Gaia Reborn — rail, status-bar and control icons
 * -----------------------------------------------------------------------------
 * Hand-pixelled glyphs for the living interface (concept: left-toolbar.png,
 * top-bar.png), bold enough to read at 2× (28 CSS px on the rail).
 *   rail icons  14 × 14, drawn once in semantic characters and coloured per
 *               frame: 0 dark ink with warm wood lights for the parchment
 *               button, 1 pale yellow-green for the deep green selected one
 *   status bar  12 × 12, in colour with a dark selective outline, on parchment
 *   controls    10 × 10: 0 dark ink, 1 lit gold with a dark rim, same shape
 *   ctl_pip     4 × 6 speed pip: 0 an empty leaf outline, 1 a filled green leaf
 * Light from the upper left throughout.
 * ========================================================================== */
'use strict';

const K = require('./kit');

/* ------------------------------------------------------------ rail ---- */

/**
 * Rail glyph characters: '#' body, '+' lit edge, 'o' shaded edge, '=' a part
 * that lies behind or is drawn finer (text lines, the back strand, a midrib,
 * soil), '*' a glint.
 * Frame 0 is ink on parchment, frame 1 light green on the deep green button.
 */
const RAIL = [
  { '#': 'ink1', '+': 'wood3', o: 'ink0', '=': 'wood3', '*': 'parch5' },
  { '#': 'vine5', '+': 'vine6', o: 'vine4', '=': 'vine3', '*': 'vine6' },
];

const GLYPHS = {
  examine: [
    '..............',
    '...##+##......',
    '..#+#####.....',
    '.#+#.*.###....',
    '.#+.*...##....',
    '.##.....##....',
    '.##.....#o....',
    '.###...##o....',
    '..#######o....',
    '...#####+#....',
    '........#+#...',
    '.........#+#..',
    '..........#+#.',
    '...........##.',
  ],
  move: [
    '......+#......',
    '...+#.##.+#...',
    '...##.##.##...',
    '...##.##.##.+#',
    '...##.##.##.##',
    '+..##.##.##.##',
    '#+.##.##.##.##',
    '.#############',
    '..############',
    '..###########o',
    '...##########.',
    '....########o.',
    '.....######o..',
    '.....######o..',
  ],
  altitude: [
    '...........#..',
    '..........###.',
    '.........#####',
    '...........#..',
    '....#......#..',
    '...#*#.....#..',
    '...#**o....#..',
    '..#*#*#o.#####',
    '..+#####..###.',
    '.+#######..#..',
    '.+#######o....',
    '+##########o..',
    '+############.',
    '##############',
  ],
  // Unequal leaves on a leaning stem, soil in the finer tone: two mirrored
  // leaves on a straight stem over a foot read as a goblet at 2×.
  plant: [
    '..............',
    '...........++#',
    '.........++##o',
    '........+##=#o',
    '.++#...+##=#o.',
    '#+###..+#=##o.',
    '.+####.+=#oo..',
    '.#o###++#o....',
    '...#oo+o......',
    '......+o......',
    '.....+o.......',
    '...+++#+=.....',
    '..+=======o...',
    '.+=========o..',
  ],
  life: [
    '...+#....+#...',
    '..+###..+###..',
    '..####..####..',
    '...##....##...',
    '.+..........+.',
    '+##........+##',
    '###........###',
    '.#...+##...#..',
    '....+####.....',
    '...+######....',
    '..+########o..',
    '..##########..',
    '..#########o..',
    '...###..###...',
  ],
  event: [
    '.......+#####.',
    '......+#####..',
    '.....+#####...',
    '....+#####....',
    '...+#####.....',
    '..+#########..',
    '..#########o..',
    '......####o...',
    '.....+###o....',
    '.....###o.....',
    '....+##o......',
    '....##o.......',
    '...+#o........',
    '...#..........',
  ],
  evolution: [
    '.+#........##.',
    '..+#======##..',
    '...+#....##...',
    '.....==##.....',
    '.....##==.....',
    '...+#....##...',
    '..+#======##..',
    '.+#........##.',
    '..+#======##..',
    '...+#....##...',
    '.....==##.....',
    '.....##==.....',
    '...+#....##...',
    '..+#======##..',
  ],
  planet: [
    '....#####.....',
    '..+#..#..##...',
    '.+..#.#.#..#..',
    '.+.#..#..#.#..',
    '+..#..#..#..#.',
    '+..#..#..#..#.',
    '#############.',
    '#..#..#..#..#.',
    '#..#..#..#..#o',
    '.#.#..#..#.#o.',
    '.#..#.#.#..#o.',
    '..##..#..##o..',
    '....#####oo...',
    '......ooo.....',
  ],
  windows: [
    '..............',
    '..............',
    '.+##......##o.',
    '+...##..##...o',
    '+.....##.....o',
    '+.==..##.==..o',
    '+.....##.....o',
    '+.==..##.==..o',
    '+.....##.....o',
    '+.==..##.==..o',
    '+.....##.....o',
    '###...##...ooo',
    '...###..###...',
    '......##......',
  ],
};

const rail = (name) => (f) => K.grid(GLYPHS[name], RAIL[f]);

/* ------------------------------------------------------ status bar ---- */

const HUD = {
  // Sun: a warm disc in a dark gold rim, orange rays with red tips.
  energy: [
    ['.....rr.....',
      '.r...oo...r.',
      '..o......o..',
      '....kkkk....',
      '...kWYyyk...',
      'ro.kYyyyk.or',
      'ro.kyyygk.or',
      '...kyygGk...',
      '....kkkk....',
      '..o......o..',
      '.r...oo...r.',
      '.....rr.....'],
    { k: 'gold1', W: 'petalY3', Y: 'petalY3', y: 'petalY2', g: 'gold3', G: 'gold2', o: 'orange0', r: 'red1' },
  ],
  // Violet DNA: two shaded strands with light rungs, a dark violet rim.
  ep: [
    ['.LD......LD.',
      '..LDrrrrLD..',
      '...LD..LD...',
      '.....LD.....',
      '...LD..LD...',
      '..LD....LD..',
      '.LDrrrrrrLD.',
      '..LD....LD..',
      '...LD..LD...',
      '.....LD.....',
      '...LD..LD...',
      '..LDrrrrLD..'],
    { L: 'glowV3', D: 'glowV0', r: 'glowV2' },
  ],
  // A fresh leaf, stalk at the lower left, tip at the upper right, a light midrib.
  life: [
    ['........kkk.',
      '......kkLLk.',
      '....kkLLLlk.',
      '...kLLLLlmk.',
      '..kLLLlmldk.',
      '..kLLlmlddk.',
      '.kLLmlldddk.',
      '.kLmlldddk..',
      '.kmllddkk...',
      '.kmkkkk.....',
      'kmk.........',
      'kk..........'],
    { k: 'vine0', L: 'vine5', l: 'vine4', m: 'vine6', d: 'vine3' },
  ],
  // Air bubbles rising: a big one, a small one and a tiny one, each with a glint.
  air: [
    ['.......kkk..',
      '......kWlk..',
      '.kkkk.klbk..',
      'kWWllk.kk...',
      'kWllllk.....',
      'kllllbk.....',
      'kllllbk.kkk.',
      '.klbbk.kWlbk',
      '..kkk..klllk',
      '.......klbbk',
      '........kkk.',
      '............'],
    { k: 'water2', W: 'ice4', l: 'ice3', b: 'ice1' },
  ],
  // Three waves, each a light crest running into deep blue.
  sea: [
    ['.WW....WW...',
      'LbbL..LbbL..',
      'b..bLLb..bLL',
      '....bb....bb',
      '.WW....WW...',
      'LbbL..LbbL..',
      'b..bLLb..bLL',
      '....bb....bb',
      '.WW....WW...',
      'LbbL..LbbL..',
      'b..bLLb..bLL',
      '....bb....bb'],
    { W: 'water7', L: 'water5', b: 'water2' },
  ],
  // A grey cloud: a small puff notched off a tall one, lit on the upper left, belly in shade.
  co2: [
    ['............',
      '............',
      '......kkk...',
      '.....kWWWk..',
      '..kk.kWlllk.',
      '.kWWkWlllllk',
      'kWllWllllllk',
      'kWllllllllsk',
      'kllllllllssk',
      '.kssssssssk.',
      '..kkkkkkkk..',
      '............'],
    { k: 'rock0', W: 'rock4', l: 'rock3', s: 'rock2' },
  ],
  // A thermometer: glass tube with a red column into a round bulb, scale ticks.
  temp: [
    ['....kkk.....',
      '...kWgsk.t..',
      '...kWgsk....',
      '...kWrsk.t..',
      '...kWrsk....',
      '...kRrsk.t..',
      '...kRrsk....',
      '..kRRrrsk...',
      '.kRWRrrrsk..',
      '.kRRrrrdsk..',
      '..kRrrddk...',
      '...kkkkk....'],
    { k: 'ink1', W: 'white0', g: 'ice3', s: 'rock3', r: 'red1', R: 'orange0', d: 'red0', t: 'wood3' },
  ],
  // An hourglass in a wooden frame, sand running, a leaf sprouting from its top.
  time: [
    ['..........k.',
      'kkkkkkkkkkLk',
      'kWWWWWWWkLlk',
      '.kgggggk.kk.',
      '..ksssk.....',
      '...ksk......',
      '...ksk......',
      '..kgsgk.....',
      '.kggsggk....',
      '.ksssssk....',
      'kWWWWWWWk...',
      'kkkkkkkkk...'],
    { k: 'wood1', W: 'wood4', g: 'ice3', s: 'sand3', L: 'vine5', l: 'vine3' },
  ],
};

const hud = (name) => () => K.grid(HUD[name][0], HUD[name][1]);

/* -------------------------------------------------------- controls ---- */

/** Control characters: 'k' rim, '#' body, '+' light; frame 0 ink, frame 1 gold. */
const CTL = [
  { k: 'ink0', '#': 'ink1', '+': 'wood3' },
  { k: 'gold0', '#': 'gold3', '+': 'gold5' },
];

const CONTROLS = {
  play: [
    '..........',
    '.kk.......',
    '.k+kk.....',
    '.k++#kk...',
    '.k+####kk.',
    '.k#####kk.',
    '.k###kk...',
    '.k#kk.....',
    '.kk.......',
    '..........',
  ],
  pause: [
    '..........',
    '.kkk..kkk.',
    '.k+k..k+k.',
    '.k+k..k+k.',
    '.k+k..k+k.',
    '.k#k..k#k.',
    '.k#k..k#k.',
    '.k#k..k#k.',
    '.kkk..kkk.',
    '..........',
  ],
  gear: [
    '....kk....',
    '.k.kkkk.k.',
    '..k++##k..',
    '.k+#kk##k.',
    'k+#k..k##k',
    'k##k..k##k',
    '.k##kk##k.',
    '..k####k..',
    '.k.kkkk.k.',
    '....kk....',
  ],
};

const control = (name) => (f) => K.grid(CONTROLS[name], CTL[f]);

/** Speed pip: an empty leaf outline (off) or a filled leaf (on). */
function pip(f) {
  const rows = ['..kk', '.k+k', 'k++k', 'k+#k', '.kk.', 'k...'];
  return f === 0
    ? K.grid(rows.map((r) => r.replace(/[+#]/g, '.')), { k: 'wood2' })
    : K.grid(rows, { k: 'vine1', '+': 'vine5', '#': 'vine3' });
}

module.exports = {
  sprites: {
    ico_examine: rail('examine'),
    ico_move: rail('move'),
    ico_altitude: rail('altitude'),
    ico_plant: rail('plant'),
    ico_life: rail('life'),
    ico_event: rail('event'),
    ico_evolution: rail('evolution'),
    ico_planet: rail('planet'),
    ico_windows: rail('windows'),
    hud_energy: hud('energy'),
    hud_ep: hud('ep'),
    hud_life: hud('life'),
    hud_air: hud('air'),
    hud_sea: hud('sea'),
    hud_co2: hud('co2'),
    hud_temp: hud('temp'),
    hud_time: hud('time'),
    ctl_play: control('play'),
    ctl_pause: control('pause'),
    ctl_gear: control('gear'),
    ctl_pip: pip,
  },
};
