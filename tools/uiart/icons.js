/* =============================================================================
 * Gaia Reborn — rail, status-bar and control icons
 * -----------------------------------------------------------------------------
 * Hand-pixelled glyphs for the living interface (concept: left-toolbar.png,
 * top-bar.png), bold enough to read at 2× (28 CSS px on the rail).
 *   rail icons  14 × 14, drawn once in semantic characters and coloured per
 *               frame: 0 dark ink with warm wood lights for the parchment
 *               button, 1 pale yellow-green for the deep green selected one
 *   status bar  12 × 12, in colour with a dark selective outline, on parchment
 *   Planet menu 12 × 12, in colour, read on the flyout's dark wood: bright fills
 *               with a lit upper-left edge, a dark rim only where needed
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

/* --------------------------------------------------- tool options ---- */

/**
 * The altitude brush's two choices, 18 × 16, in colour with a dark outline,
 * read on the dock's wood tile and on its deep green selected one: a snowy
 * mountain under a gold arrow up, a green valley with a river under a gold
 * arrow down. Light from the upper left: the slopes facing it are lit.
 */
const OPT = {
  raise: [
    ['..kk..............',
      '.kAak.............',
      'kAAaak............',
      'kkAakk..kk........',
      '.kAak..kWwk.......',
      '.kkkk.kWWwwk......',
      '.....kWWWWwwk.....',
      '....kLRWRWwdwk....',
      '...kLRRrRRddxdk...',
      '..kLRRrRRRRdxddk..',
      '.kLRRrRRRrRddxddk.',
      'kLRRrRRRrRRRddxddk',
      'kGGGgRRrRRRRdddmmk',
      'kGGGGGggRRrddgmmmk',
      'kGGGGGGGgggggggmmk',
      'kkkkkkkkkkkkkkkkkk'],
    { k: 'ink0', A: 'gold5', a: 'gold3', W: 'white0', w: 'ice2', L: 'rock4', R: 'rock3', r: 'rock2', d: 'rock1', x: 'rock0', G: 'meadow3', g: 'meadow2', m: 'meadow1' },
  ],
  lower: [
    ['.......kkkk.......',
      '.......kAak.......',
      '......kkAakk......',
      'kkk...kAAaak...kkk',
      'kGGk...kAak...kGGk',
      'kggmk...kk...kGggk',
      'kgggmk......kGgggk',
      'kggggmk....kGggggk',
      'kggggmk....kGggggk',
      'kggggmkBWBBkGggggk',
      'kgggggmkbbkGgggggk',
      'kggggggmkkGggggggk',
      'kSSSSSSSSSSSSSSSSk',
      'ksssspssssssssspsk',
      'ksssssssspsssssssk',
      'kkkkkkkkkkkkkkkkkk'],
    { k: 'ink0', A: 'gold5', a: 'gold3', G: 'meadow3', g: 'meadow2', m: 'meadow1', W: 'water7', B: 'water5', b: 'water3', S: 'soil3', s: 'soil2', p: 'soil1' },
  ],
};

const opt = (name) => () => K.grid(OPT[name][0], OPT[name][1]);

/* ----------------------------------------------------- Planet menu ---- */

/**
 * The Planet flyout's rows, 12 × 12, in colour, read on its dark wood plank,
 * the lit hover row and the green checked one: on dark wood an ink rim
 * vanishes, so each motif carries its silhouette in bright fills with a lit
 * upper-left edge and a dark rim only where it meets the wood in shade.
 */
const MENU = {
  // A grey cone over layered ground: lava welling from the crater runs down its front, magma rises through the strata.
  geo: [
    ['.....yo.....',
      '....LYYk....',
      '....LlYd....',
      '...LllYdk...',
      '...LllYdk...',
      '..LlllyYdk..',
      '.LlllldoYdk.',
      'LlllldddoYrk',
      'sssssrrsssss',
      'aaaaarraaaaA',
      'SSSSrooSSSSS',
      'AAAroyyoAAAA'],
    { L: 'rock4', l: 'rock3', d: 'rock2', k: 'rock0', Y: 'petalY3', y: 'petalY2', o: 'orange0', r: 'red1', s: 'sand3', S: 'sand1', a: 'laterite3', A: 'laterite1' },
  ],
  // The sun in a gold rim with orange rays, a white cloud drifting in front of its lower left.
  atmo: [
    ['....o..oo...',
      '......kkkk.o',
      '.....kWYyyk.',
      '.....kYyyygk',
      '....BBByygGk',
      '...BCCCBgGk.',
      '.BBBCcccBkko',
      'BCCBccccccB.',
      'BCccccccccsB',
      'Bcccccccsss.',
      '.BsssssssB..',
      '..BBBBBBB...'],
    { k: 'gold1', W: 'petalY3', Y: 'petalY3', y: 'petalY2', g: 'gold3', G: 'gold2', o: 'orange0', B: 'ice0', C: 'ice4', c: 'ice3', s: 'ice2' },
  ],
  // A round leafy crown on a brown trunk, standing on a grassy hill.
  bio: [
    ['....kkkk....',
      '..kkLlmmkk..',
      '.kLllmmmmdk.',
      '.kLlmmmdmdk.',
      '.klmmdmmmdk.',
      '.kmmmmmmddk.',
      '..kdmmdddk..',
      '...kkTtkk...',
      '.....Tt.....',
      '..GGgTtggg..',
      '.GGggggggggh',
      'Ggggggggghhh'],
    { k: 'vine1', L: 'vine6', l: 'vine5', m: 'vine4', d: 'vine3', T: 'wood4', t: 'wood2', G: 'meadow3', g: 'meadow2', h: 'meadow1' },
  ],
  // A cream cottage under a red gable, a lit window and a door; grey smoke from the chimney.
  civ: [
    ['.........SSs',
      '........Sss.',
      '.....OR.Cc..',
      '....ORRrCc..',
      '...ORRRrrr..',
      '..ORRRRrrrr.',
      '.ORRRRRrrrrr',
      '..WwwwwwwwS.',
      '..WDdwwYyws.',
      '..WDdwwyyws.',
      '..WDdwwwwws.',
      '..WDdwwwwws.'],
    { O: 'orange0', R: 'red1', r: 'red0', C: 'rock3', c: 'rock1', S: 'rock4', s: 'rock3', W: 'parch4', w: 'parch3', D: 'wood3', d: 'wood2', Y: 'petalY3', y: 'petalY1' },
  ],
  // Two gusts of wind curling at their ends, an O₂ bubble and a CO₂ bubble carried along.
  air: [
    ['.kk.....WW..',
      'kWlk...WwwWw',
      'klbk...w..Ww',
      '.kk..WWWWWw.',
      '.....wwwww..',
      '............',
      '...WWWWWWW..',
      '...wwwwwwwWw',
      '.gg....W..Ww',
      'gGsg...wWWw.',
      'gssg....ww..',
      '.gg.........'],
    { k: 'water2', W: 'ice4', l: 'ice3', b: 'ice1', w: 'ice1', g: 'rock1', G: 'rock4', s: 'rock3' },
  ],
  // A pie chart in habitat colours: ice, desert and sea, the forest quarter pulled out to the upper right.
  biomes: [
    ['......FFF...',
      '...II.Fffff.',
      '..IIj.Fffff.',
      '.Iiij.Fffffg',
      'IIiij.Ffffgg',
      'Wwwij.g.....',
      'WwwwwwSSSSs.',
      'Wwwwwwsssst.',
      'WWwwwwssstt.',
      '.wwwwwssst..',
      '..wwwwstt...',
      '...vvvtt....'],
    { F: 'vine4', f: 'vine3', g: 'vine2', S: 'sand3', s: 'sand2', t: 'sand1', W: 'water5', w: 'water4', v: 'water3', I: 'ice4', i: 'ice3', j: 'ice2' },
  ],
  // An orange fish swimming right past a tall strand of seaweed, a tuft below it.
  life: [
    ['............',
      '.G..........',
      '.Gg....rr...',
      '.Ggr..YYYY..',
      'Gg.rrYYOOOO.',
      'Gg..rOOOOeOk',
      '.Gg.rOOOOOOk',
      '.Ggrroooook.',
      'Gg.r..kkk...',
      'Gg..........',
      '.Gg.....Gg..',
      '.Gg....Gg...'],
    { G: 'vine4', g: 'vine2', k: 'red0', r: 'red1', Y: 'petalY2', O: 'orange0', o: 'laterite2', e: 'ink0' },
  ],
  // A brass cog, lit on its upper left, with a teal spark flashing at its upper right.
  tech: [
    ['..........T.',
      '.........TWT',
      '....AA....T.',
      '.AA.Aa.aa...',
      '.AAaaaaaa...',
      '..aaGGaad...',
      'AAaG..gadd..',
      'Aaag..gddd..',
      '..aagggd....',
      '.aaaaaddd...',
      '.aa.dd.dd...',
      '....dd......'],
    { A: 'gold5', a: 'gold4', G: 'gold2', g: 'gold5', d: 'gold2', T: 'glowT3', W: 'glowT5' },
  ],
};

const menu = (name) => () => K.grid(MENU[name][0], MENU[name][1]);

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
    opt_raise: opt('raise'),
    opt_lower: opt('lower'),
    menu_geo: menu('geo'),
    menu_atmo: menu('atmo'),
    menu_bio: menu('bio'),
    menu_civ: menu('civ'),
    menu_air: menu('air'),
    menu_biomes: menu('biomes'),
    menu_life: menu('life'),
    menu_tech: menu('tech'),
    ctl_play: control('play'),
    ctl_pause: control('pause'),
    ctl_gear: control('gear'),
    ctl_pip: pip,
  },
};
