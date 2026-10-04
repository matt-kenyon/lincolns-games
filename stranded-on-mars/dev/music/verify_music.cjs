// Decodes every home-*.mp3 in headless Chrome and WebKit (muted, nothing audible) and returns
// small windows of samples so verify_music.py can check length, offset and loop seams.
const { chromium, webkit } = require(require('path').join(__dirname, '..', 'node_modules', 'playwright'));
const fs = require('fs'), path = require('path');
const MUSIC = path.resolve(__dirname, '../../audio/music');
const OUT = path.join(__dirname, 'out');
const files = fs.readdirSync(MUSIC).filter(f => /^home-.*\.mp3$/.test(f));
const meta = {};
for (const f of fs.readdirSync(OUT).filter(f => /^home-[a-z0-9]+\.json$/.test(f))) { const j = JSON.parse(fs.readFileSync(path.join(OUT, f))); meta[j.song] = j; }
(async () => {
  const res = {};
  for (const [name, bt] of [['chrome', chromium], ['webkit', webkit]]) {
    const b = await bt.launch(name === 'chrome' ? { channel: 'chrome', headless: true, args: ['--mute-audio'] } : { headless: true });
    const p = await b.newPage();
    await p.route('http://m.local/**', r => { const f = decodeURIComponent(new URL(r.request().url()).pathname.slice(1)); if (!f) return r.fulfill({ contentType: 'text/html', body: '<html></html>' }); r.fulfill({ contentType: 'audio/mpeg', body: fs.readFileSync(path.join(MUSIC, f)) }); });
    await p.goto('http://m.local/');
    res[name] = {};
    for (const f of files) {
      const song = f.replace(/-[a-z]+\.mp3$/, '');
      const m = meta[song] || {};
      res[name][f] = await p.evaluate(async ([f, m]) => {
        const enc = a => { const u = new Uint8Array(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength)); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
        const ab = await (await fetch('/' + f)).arrayBuffer();
        const out = {};
        for (const rate of [44100, 48000]) {
          const buf = await new OfflineAudioContext(2, 1, rate).decodeAudioData(ab.slice(0));
          const d = buf.getChannelData(0), W = Math.round(0.05 * rate);
          const r = { len: buf.length, head: enc(d.subarray(Math.round(1.0 * rate), Math.round(1.0 * rate) + 4096)) };
          if (!m.once) {
            const ls = m.intro || m.pad, le = ls + m.loop;
            const a = Math.round(ls * rate), e = Math.round(le * rate);
            r.atStart = enc(d.subarray(a - W, a + W)); r.atEnd = enc(d.subarray(e - W, e + W));
            // play across the loop point with the real looping mechanism
            const oc = new OfflineAudioContext(2, Math.round(0.5 * rate), rate);
            const src = oc.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = ls; src.loopEnd = le;
            src.connect(oc.destination); src.start(0, le - 0.25);
            const ren = await oc.startRendering();
            r.played = enc(ren.getChannelData(0));
            r.expect = enc(new Float32Array([...d.subarray(e - Math.round(0.25 * rate), e), ...d.subarray(a, a + Math.round(0.25 * rate))]));
          }
          out[rate] = r;
        }
        return out;
      }, [f, m]);
      process.stderr.write(`${name} ${f} ok\n`);
    }
    await b.close();
  }
  fs.writeFileSync(path.join(OUT, 'verify.json'), JSON.stringify({ res, meta }));
})();
