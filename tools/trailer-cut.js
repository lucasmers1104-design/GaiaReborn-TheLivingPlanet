/* =============================================================================
 * Gaia Reborn — cut the trailer into an MP4
 * -----------------------------------------------------------------------------
 * Cuts the footage of tools/trailer-record.js (tmp/trailer/<shot>/) into
 * tmp/trailer/gaia-reborn-trailer-v2.mp4: 1920×1080, 30 fps, H.264 + AAC, with
 * the English overlays in the game's pixel font, music, Gaia's voice-over
 * (tmp/trailer/voice/gaia2.wav) and sound effects: the ones the game started
 * during each shot (its sfx.json) where the cut shows them, and the brush,
 * the launch and Gaia's magic as in the game: their WebAudio voices rendered
 * offline in headless Chrome, the brush from the frames logged while
 * recording shot 07 (log.json), kept in tmp/trailer/sounds/ for other cuts.
 *
 *   FFMPEG=<ffmpeg with libx264> node tools/trailer-cut.js
 * ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { CHROMES, ROOT, lock, launchChrome, connect, pathToUrl, sleep } = require('./fx-record');

const DIR = path.join(ROOT, 'tmp', 'trailer');
const OUT = path.join(DIR, 'gaia-reborn-trailer-v2.mp4');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FPS = 30;
const W = 1920;
const H = 1080;

/** The strike's frame in shot 08 (its log.json): the cut, the boom and the music turn on it. */
const IMPACT = JSON.parse(fs.readFileSync(path.join(DIR, '08-dino-fall', 'log.json'), 'utf8')).impact;

/**
 * The cut: a shot's source frames from…to at a speed, and the overlay over it ('line|small line'). Cuts of one shot
 * with adjacent frames run on without a seam: they only start an overlay mid-shot.
 */
const CUT = [
  { key: 'bang', shot: '01-bigbang', from: 15, to: 120, text: 'FORGE A PLANET.' },
  { key: 'planets', shot: '02-planets', from: 30, to: 72 },
  { key: 'clouds', shot: '02-clouds', from: 70, to: 170 },
  { key: 'sleep', shot: '03-gaia-wakes', from: 40, to: 150 },
  { key: 'magic', shot: '03-gaia-wakes', from: 151, to: 290, text: 'BRING IT TO LIFE.' },
  { key: 'africa', shot: '04-africa', from: 20, to: 99, text: 'WATCH IT GROW.' },
  { key: 'vines', shot: '04-africa-ui', from: 100, to: 170, text: 'WATCH IT GROW.' },
  { key: 'bloom', shot: '04-africa-ui', from: 171, to: 239 },
  { key: 'dolphins', shot: '05-dolphins', from: 6, to: 106, text: '136 SPECIES TO DISCOVER.' },
  { key: 'whale', shot: '05-whale', from: 20, to: 130, text: '136 SPECIES TO DISCOVER.' },
  { key: 'air', shot: '06-air', from: 0, to: 149 },
  { key: 'lift', shot: '07-terraform', from: 0, to: 89, text: 'SHAPE IT.' },
  { key: 'giants', shot: '08-dino-fall', from: 10, to: IMPACT - 1 },
  { key: 'fall', shot: '08-dino-fall', from: IMPACT, to: 250, text: 'OR SHATTER IT.' },
  { key: 'ages', shot: '09-ages', from: 0, to: 119, text: 'RAISE CIVILIZATIONS.' },
  { key: 'coast', shot: '10-coast', from: 0, to: 89 },
  { key: 'launch', shot: '11-launch', from: 0, to: 225, speed: 1.5, text: 'LAUNCH THEM TO THE STARS.' },
  { key: 'logo', shot: '12-logo', from: 20, to: 150, text: 'FROM STARDUST TO STARSHIP.|WISHLIST NOW ON STEAM' },
];
let LENGTH = 0;
for (const c of CUT) {
  c.speed = c.speed || 1;
  c.n = Math.round((c.to - c.from + 1) / c.speed);
  c.start = LENGTH;
  LENGTH += c.n / FPS;
}
/** Output seconds of a cut's source frame. */
function at(key, frame) {
  const c = CUT.find((x) => x.key === key);
  return c.start + (frame - c.from) / c.speed / FPS;
}

const A = (f) => path.join(ROOT, 'assets', 'audio', f);
const VOICE = path.join(DIR, 'voice', 'gaia2.wav');
/**
 * Gaia's phrases in the voice file, [start, end] s, measured with silencedetect (no single pause length separates
 * them: she pauses inside the first line longer than between "Gaia Reborn." and "The Living Planet.").
 */
const PHRASES = [[0.55, 3.57], [4.74, 9.5], [10.74, 15.59], [16.41, 20.28], [21.44, 25.77], [26.91, 27.69],
  [28.95, 31.39], [32.57, 33.89], [35.11, 37.55], [38.68, 40.99], [42.13, 45.73]];
/** Where each phrase starts: stardust · slept · rock to green · song · breath · shape · giants · shatter · civilizations · stars · name. */
const LINES = [at('bang', 30), at('sleep', 49), at('africa', 32), at('dolphins', 12), at('air', 14), at('lift', 18),
  at('giants', 16), at('fall', IMPACT + 48), at('ages', 8), at('launch', 45), at('logo', 30)];

function music() {
  // Lumière du matin comes in as the first life does and is at 2:15, just before its drop, when the comet strikes.
  const enter = at('magic', 262);
  const strike = at('fall', IMPACT);
  const back = at('ages', 0) - 0.4;
  return [
    // The intro is cut to this track (src/intro.ts INTRO_CUES): from the bang it plays as in the game and fades at 27 s.
    { file: A('music/IntroMusic.mp3'), ss: 12.5, at: 0, dur: 18, vol: 0.9, fadeOut: 1.5 },
    { file: A('music/lumiere-du-matin.mp3'), ss: 135 - (strike - enter), at: enter, dur: strike - enter + 0.15, vol: 0.85, fadeIn: 1.5, fadeOut: 0.15 },
    // Silence after the strike; the track's second rise from 2:29 carries the civilizations to the end.
    { file: A('music/lumiere-du-matin.mp3'), ss: 149, at: back, dur: LENGTH - back, vol: 0.85, fadeIn: 0.8, fadeOut: 2.5 },
  ];
}

/** Wave crashes in ocean-waves.mp3 (s), cut short: the splash of a dolphin diving back in. */
const SPLASHES = [1.1, 4.4, 15.8, 19.7, 7.8];
/** Entry splashes of the pod in shot 05 (frames, from its recording). */
const DIVES = [36, 42, 51, 57, 59, 68, 73, 82, 89, 90];

/** `brush` is the press and release frame of shot 07's brush; game.* are the offline renders. */
function effects(game, brush) {
  const strike = at('fall', IMPACT);
  return [
    // The game's sounds louder than in play (chime +10 dB, brush voices +9 dB): here they share the room with music.
    { file: game.chime, at: at('magic', 266), vol: 3 },
    // Birdsong rises as the land greens.
    { file: A('ambient/birds-chirping-relaxing-nature-sounds.mp3'), ss: 5, at: at('africa', 60), dur: at('bloom', 239) - at('africa', 60) + 0.5, vol: 0.4, fadeIn: 4, fadeOut: 1 },
    { file: A('ambient/ocean-waves.mp3'), ss: 2, at: at('dolphins', 6), dur: at('whale', 130) - at('dolphins', 6) + 0.3, vol: 0.4, fadeIn: 0.5, fadeOut: 0.8 },
    ...DIVES.map((f, k) => ({ file: A('ambient/ocean-waves.mp3'), ss: SPLASHES[k % SPLASHES.length], at: at('dolphins', f), dur: 0.55, vol: 0.35, fadeIn: 0.02, fadeOut: 0.45 })),
    // The brush as in the game (src/terraformsound.ts): its voices over the bass rumble at TF_RUMBLE_LEVEL, held from press to release.
    { file: game.brush, at: at('lift', 0), vol: 2.8 },
    { file: A('sfx/rumble-bass.mp3'), at: at('lift', brush.down), dur: (brush.up - brush.down) / FPS + 0.5, vol: 1, fadeIn: 0.05, fadeOut: 0.5 },
    // The comet: a rumble swelling with its streak, then the strike, the ground shaking, the long tail into silence.
    { file: A('sfx/rumble-bass.mp3'), ss: 0.5, at: strike - 1.2, dur: 1.4, vol: 0.7, fadeIn: 1, fadeOut: 0.2 },
    { file: A('sfx/vulkan-explosion.mp3'), at: strike, dur: 6, vol: 1, fadeOut: 3 },
    { file: A('sfx/cracking-earthquake.mp3'), ss: 1.5, at: strike + 0.1, dur: 4, vol: 0.7, fadeOut: 2 },
    // The film's own sound from 2.5 s, sped up with the picture.
    { file: game.launch, ss: 2.5, at: at('launch', 0), dur: 7.5, tempo: 1.5, vol: 1 },
  ];
}

function ffmpeg(args, quiet = true) {
  const r = spawnSync(FFMPEG, ['-hide_banner', ...args], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', quiet ? 'pipe' : 'inherit'] });
  if (r.error) throw new Error(`no ffmpeg at ${FFMPEG} (set FFMPEG): ${r.error.message}`);
  return r;
}

/**
 * Sounds the game started while a shot was recorded (its sfx.json), laid where the cut shows them: file → gain and
 * seconds. Files missing here (clicks, loops, effects without a licence entry) stay out.
 */
const GAME_SFX = {
  'sfx/vulkan-explosion.mp3': [0.9, 3.4],
  'sfx/cracking-earthquake.mp3': [0.6, 3],
  'sfx/tornado.mp3': [0.7, 4],
  // The call's core is the loudest sound in the trailer at full gain.
  'sfx/animals/whale-sound.mp3': [0.6, 4.1],
  'sfx/animals/dolphin-whistling-in-water.mp3': [0.8, 2.8],
};
function logged() {
  const out = [];
  for (const c of CUT) {
    const file = path.join(DIR, c.shot, 'sfx.json');
    if (!fs.existsSync(file)) continue;
    for (const [frame, name, , , offset] of JSON.parse(fs.readFileSync(file, 'utf8'))) {
      const rule = GAME_SFX[name];
      if (!rule || frame < c.from || frame > c.to) continue;
      out.push({ file: A(name), ss: offset || 0, at: at(c.key, frame), dur: rule[1], vol: rule[0], fadeOut: 0.6 });
    }
  }
  return out;
}

/** In the game's page: the brush (replaying shot 09's log), the launch film and the magic chime, rendered offline as WAV (base64). */
const RENDER = (log) => `(async () => {
  SE.SFX.volume = () => 1;
  const SR = 48000;
  const wav = (buf) => {
    const n = buf.length, ch = buf.numberOfChannels, view = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const str = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); view.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVEfmt '); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, ch, true); view.setUint32(24, SR, true); view.setUint32(28, SR * ch * 2, true);
    view.setUint16(32, ch * 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, n * ch * 2, true);
    const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
    for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < ch; c++, o += 2) view.setInt16(o, Math.max(-1, Math.min(1, data[c][i])) * 0x7fff, true);
    const bytes = new Uint8Array(view.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };

  const log = ${JSON.stringify(log)};
  const last = log[log.length - 1][0];
  const bc = new OfflineAudioContext(2, Math.ceil(SR * (last + ${FPS}) / ${FPS}), SR);
  const brush = new SE.TerraformSound(bc);
  // Each logged frame's calls when the render reaches that frame: the sound reads its time off the context.
  for (const f of new Set(log.map((e) => e[0]))) {
    bc.suspend(f / ${FPS}).then(() => {
      for (const [g, m, args] of log) if (g === f) brush[m](...args);
      bc.resume();
    });
  }

  const lc = new OfflineAudioContext(2, SR * 12.5, SR);
  const launch = new SE.LaunchSound(lc);
  for (let k = 0; k <= 12 * 60; k++) launch.update(k / 60, 1, false, k / 60);

  // The chime makes its own context on first use (src/gaiamagic.ts playMagicChime): it gets the offline one.
  const cc = new OfflineAudioContext(2, SR * 4, SR);
  const Real = window.AudioContext;
  window.AudioContext = function () { return cc; };
  try { SE.app.gaiaMagic.chime({ e: { spontaneous: false }, chimed: false }); } finally { window.AudioContext = Real; }

  return { brush: wav(await bc.startRendering()), launch: wav(await lc.startRendering()), chime: wav(await cc.startRendering()) };
})()`;

const OVERLAY_PAGE = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@font-face { font-family: "Pixelify Sans"; src: url("../../assets/fonts/pixelify-sans.woff2") format("woff2"); }
html, body { margin: 0; width: ${W}px; height: ${H}px; background: transparent; overflow: hidden; }
.o { position: absolute; left: 0; right: 0; bottom: 151px; text-align: center; color: #fff; font: 80px/1.25 "Pixelify Sans", sans-serif;
  letter-spacing: 3px; text-shadow: 0 10px 0 #0b1a22, 7px 0 0 #0b1a22, -7px 0 0 #0b1a22, 0 -5px 0 #0b1a22, 0 16px 40px rgba(0, 0, 0, 0.6); }
.o small { display: block; font-size: 44px; color: #9ff3e6; margin-top: 12px; }
</style></head><body><div class="o"></div></body></html>`;

/** Overlay runs: one per stretch of cuts with the same text. */
function overlays() {
  const runs = [];
  for (const c of CUT) {
    if (!c.text) continue;
    const prev = runs[runs.length - 1];
    if (prev && prev.text === c.text && Math.abs(prev.end - c.start) < 1e-6) prev.end = c.start + c.n / FPS;
    else runs.push({ text: c.text, start: c.start, end: c.start + c.n / FPS });
  }
  return runs;
}

/** Game sounds and overlay pictures, from one headless Chrome. */
async function renderInChrome(work, runs) {
  const log = JSON.parse(fs.readFileSync(path.join(DIR, '07-terraform', 'log.json'), 'utf8'));
  const page = path.join(DIR, '_overlay.html');
  fs.writeFileSync(page, OVERLAY_PAGE);
  const release = await lock();
  const proc = launchChrome(CHROMES.find((c) => fs.existsSync(c)), work, W, H);
  try {
    const { ws, cdp } = await connect(work, W, H);
    await cdp.send('Page.navigate', { url: `${pathToUrl(path.join(ROOT, 'index.html'))}?sim=direct` });
    for (let k = 0; ; k++) {
      await sleep(250);
      try { if (await cdp.eval('!!(window.SE && SE.app)')) break; } catch { /* still loading */ }
      if (k === 240) throw new Error('the game never started');
    }
    const sounds = await cdp.eval(RENDER(log));
    const game = {};
    fs.mkdirSync(path.join(DIR, 'sounds'), { recursive: true });
    for (const [name, b64] of Object.entries(sounds)) {
      game[name] = path.join(DIR, 'sounds', `${name}.wav`);
      fs.writeFileSync(game[name], Buffer.from(b64, 'base64'));
    }
    await cdp.send('Page.navigate', { url: pathToUrl(page) });
    await sleep(500);
    await cdp.eval('document.fonts.ready.then(() => true)');
    await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    for (const [k, run] of runs.entries()) {
      const [line, sub] = run.text.split('|');
      await cdp.eval(`document.querySelector('.o').innerHTML = ${JSON.stringify(line + (sub ? `<small>${sub}</small>` : ''))}; true`);
      await sleep(100);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      run.file = path.join(work, `overlay-${k}.png`);
      fs.writeFileSync(run.file, Buffer.from(shot.data, 'base64'));
    }
    ws.close();
    const down = log.find((e) => e[1] === 'start')[0];
    const up = log.find((e) => e[1] === 'stop')[0];
    return { game, brush: { down, up } };
  } finally {
    proc.kill();
    release();
    fs.rmSync(page, { force: true });
  }
}

/** Every output frame as work/seq/00000.png …: hard links to the shots' frames. */
function sequence(work) {
  const seq = path.join(work, 'seq');
  fs.mkdirSync(seq);
  let n = 0;
  for (const c of CUT) {
    for (let i = 0; i < c.n; i++) {
      const frame = Math.min(c.to, c.from + Math.round(i * c.speed));
      const src = path.join(DIR, c.shot, `${String(frame).padStart(4, '0')}.png`);
      const dst = path.join(seq, `${String(n++).padStart(5, '0')}.png`);
      try { fs.linkSync(src, dst); } catch { fs.copyFileSync(src, dst); }
    }
  }
  return path.join(seq, '%05d.png');
}

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gaia-cut-'));
  try {
    const runs = overlays();
    const { game, brush } = await renderInChrome(work, runs);
    const voice = PHRASES.map(([from, to], k) => ({ file: VOICE, ss: from, dur: to - from + 0.15, at: LINES[k], vol: 1.6, fadeOut: 0.1 }));
    const tracks = { m: music(), s: [...effects(game, brush), ...logged()], vo: voice };

    // Picture, sound and the mux in three runs: one graph with both runs out of memory in a 32-bit ffmpeg.
    const run = (name, args, graph) => {
      const script = path.join(work, `${name}.txt`);
      fs.writeFileSync(script, graph.join(';\n'));
      const r = ffmpeg(['-y', '-loglevel', 'error', '-stats', ...args.flatMap((a) => (a === '{graph}' ? ['-filter_complex_script', script] : [a]))], false);
      if (r.status !== 0) throw new Error(`ffmpeg failed on the ${name} (${r.status})`);
    };

    // Each overlay is burnt into its own frames first, one small run each: as inputs of the main graph they are
    // buffered until their time and run a 32-bit ffmpeg out of memory. The links to the shots' frames are replaced,
    // never written through.
    const seq = sequence(work);
    const burnt = path.join(work, 'burnt');
    fs.mkdirSync(burnt);
    for (const [k, o] of runs.entries()) {
      const first = Math.round(o.start * FPS);
      const count = Math.round((o.end - o.start) * FPS);
      const len = count / FPS;
      run(`overlay-${k}`, ['-start_number', String(first), '-framerate', String(FPS), '-i', seq, '-loop', '1', '-framerate', String(FPS), '-i', o.file, '{graph}',
        '-map', '[v]', '-frames:v', String(count), '-start_number', String(first), path.join(burnt, '%05d.png')],
      [`[1:v]format=rgba,fade=t=in:st=0:d=0.2:alpha=1,fade=t=out:st=${(len - 0.25).toFixed(3)}:d=0.25:alpha=1[o]`, '[0:v][o]overlay=shortest=1[v]']);
      for (let n = first; n < first + count; n++) {
        const name = `${String(n).padStart(5, '0')}.png`;
        fs.unlinkSync(path.join(path.dirname(seq), name));
        fs.renameSync(path.join(burnt, name), path.join(path.dirname(seq), name));
      }
    }
    const video = ['-framerate', String(FPS), '-i', seq];
    const vgraph = [`[0:v]fade=t=in:st=0:d=0.3,fade=t=out:st=${(LENGTH - 0.8).toFixed(3)}:d=0.8,format=yuv420p[v]`];
    const picture = path.join(work, 'picture.mp4');
    // Four encoder threads: x264's default (one per core and a half) runs a 32-bit ffmpeg out of memory.
    run('picture', [...video, '{graph}', '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-tune', 'animation', '-threads', '4', '-r', String(FPS), picture], vgraph);

    const args = [];
    const graph = [];
    let input = 0;
    const bus = {};
    for (const [name, list] of Object.entries(tracks)) {
      bus[name] = list.map((a, k) => {
        // `lavfi`: a sound made by ffmpeg's own generators (e.g. a splash from filtered noise) instead of a file.
        if (a.lavfi) {
          args.push('-f', 'lavfi', '-t', a.dur.toFixed(3), '-i', a.lavfi);
        } else {
          if (a.ss) args.push('-ss', a.ss.toFixed(3));
          if (a.dur) args.push('-t', a.dur.toFixed(3));
          args.push('-i', a.file);
        }
        const len = (a.dur || 0) / (a.tempo || 1);
        const chain = ['aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo'];
        if (a.tempo) chain.push(`atempo=${a.tempo}`);
        chain.push(`volume=${a.vol}`);
        if (a.fadeIn) chain.push(`afade=t=in:st=0:d=${a.fadeIn}`);
        if (a.fadeOut) chain.push(`afade=t=out:st=${(len - a.fadeOut).toFixed(3)}:d=${a.fadeOut}`);
        chain.push(`adelay=${Math.round(a.at * 1000)}:all=1`);
        graph.push(`[${input++}:a]${chain.join(',')}[${name}${k}]`);
        return `[${name}${k}]`;
      });
      graph.push(`${bus[name].join('')}amix=inputs=${bus[name].length}:normalize=0:duration=longest[${name}]`);
    }
    // The music ducks under Gaia's voice; one loudness for the whole trailer.
    graph.push('[vo]asplit=2[voice][key]');
    graph.push('[m][key]sidechaincompress=threshold=0.02:ratio=6:attack=40:release=600[duck]');
    graph.push(`[duck][s][voice]amix=inputs=3:normalize=0:duration=longest,atrim=0:${LENGTH.toFixed(3)},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`);

    const sound = path.join(work, 'sound.wav');
    run('sound', [...args, '{graph}', '-map', '[a]', '-c:a', 'pcm_s16le', sound], graph);

    run('mux', ['-i', picture, '-i', sound, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart', '-t', LENGTH.toFixed(3), OUT], []);
    console.log(`${OUT}: ${LENGTH.toFixed(1)} s`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error(`trailer-cut: ${e.stack || e.message}`); process.exit(1); });
