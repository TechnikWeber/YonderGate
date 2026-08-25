/**
 * Regenerate the README screenshots (docs/screenshots/*).
 *
 * The whole product is one page, so a stale screenshot is a stale product description —
 * these went a whole redesign out of date. This is the recipe, not a one-off: it puts the
 * simulated gateway into a photogenic state, drives a headless Chrome over CDP and
 * captures at deviceScaleFactor 1.5 (GitHub lays a README image out at ~900 px, so 2x was
 * three times over).
 *
 * Run it with the sim service up:
 *     npm run dev        # gateway :8080/setup
 *     node scripts/screenshots.mjs
 *
 * Needs google-chrome on PATH. Node 22+ (global WebSocket, global fetch).
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots');
const GATEWAY = process.env.YGW_URL ?? 'http://localhost:8080';
// A random port per run, because a fixed one silently reuses a chrome left behind by a
// failed run — with ITS profile, so the shots come out carrying the last run's
// localStorage. That cost an afternoon: the hero shot kept showing a setting that had
// been removed from the script.
const PORT = 9000 + Math.floor(Math.random() * 900);
/**
 * Render scale. 2 was three times what GitHub ever displays (it lays a README image out
 * at ~900 px), so the five files came to 1.2 MB for no visible gain. 1.5 still has more
 * pixels than a retina reader can use and is a third of the weight.
 */
const DSF = 1.5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the gateway's state is half the picture ----
/** A scan, so the device list in the shot is a list and not "Not scanned yet." */
async function primeGateway() {
  await fetch(`${GATEWAY}/api/scan`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: false }),
  }).catch(() => {});
}

// ---- headless chrome over CDP ----
const profile = mkdtempSync(join(tmpdir(), 'yrc-shot-'));
const chrome = spawn('google-chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--window-size=1400,1000',
], { stdio: ['ignore', 'ignore', process.env.DEBUG ? 'inherit' : 'ignore'] });

async function browserWs() {
  for (let i = 0; i < 50; i++) {
    try {
      return (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl;
    } catch { await sleep(200); }
  }
  throw new Error('chrome did not come up');
}
const ws = new WebSocket(await browserWs());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 1;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  const p = msg.id && pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
};
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const id = nextId++;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

/**
 * One shot. `prep` is a list of JS expressions (numbers are pauses) run in the page;
 * `clip` returns a plain viewport-relative getBoundingClientRect to crop to.
 */
async function shot({ url, out, width = 1300, height = 860, dsf = DSF, mobile = false, prep = [], settle = 1500, clip = null }) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: dsf, mobile, screenWidth: width, screenHeight: height }, sessionId);
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
  await send('Page.navigate', { url }, sessionId);
  await sleep(2500);
  for (const step of prep) {
    if (typeof step === 'number') { await sleep(step); continue; }
    const r = await send('Runtime.evaluate', { expression: step, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(`${out}: ${r.exceptionDetails.text}`);
  }
  await sleep(settle);
  let params = { format: 'png', captureBeyondViewport: false };
  if (clip) {
    // Two traps: captureBeyondViewport re-lays-out the page and leaves everything below
    // the original fold unpainted, and window.scrollTo does nothing in the ground app —
    // `body` carries overflow-x, which makes IT the scroll container, not the document.
    const SCROLL_BY = (dy) => `(() => {
      const el = [document.scrollingElement, document.body, document.documentElement, document.getElementById('root')]
        .find((e) => e && e.scrollHeight > e.clientHeight + 4);
      if (el) el.scrollTop += ${dy};
      return el ? el.scrollTop : -1;
    })()`;
    const measure = async () => {
      const r = await send('Runtime.evaluate', { expression: clip, returnByValue: true }, sessionId);
      if (r.exceptionDetails || !r.result.value) throw new Error(`${out}: clip failed`);
      return r.result.value;
    };
    const r1 = await measure();
    await send('Runtime.evaluate', { expression: SCROLL_BY(Math.floor(r1.y) - 10) }, sessionId);
    await sleep(600);
    const r2 = await measure();
    const h = Math.min(r2.height, height - r2.y);
    if (h < r2.height - 2) console.warn(`  ! ${out}: cropped by ${Math.round(r2.height - h)}px — raise its viewport height`);
    params = { format: 'png', captureBeyondViewport: false, clip: { x: r2.x, y: r2.y, width: r2.width, height: h, scale: 1 } };
  }
  const { data } = await send('Page.captureScreenshot', params, sessionId);
  writeFileSync(join(OUT, out), Buffer.from(data, 'base64'));
  await send('Target.closeTarget', { targetId });
  console.log('  ✓', out);
}


const wrapClip = `(() => { const r = document.querySelector('.wrap').getBoundingClientRect();
  return { x: 0, y: 0, width: innerWidth, height: r.height + 20 }; })()`;
const panelAfterTabs = (tab) => `(() => {
  const nav = document.querySelector('.tabs').getBoundingClientRect();
  const shown = [...document.querySelectorAll('.panel[data-tab="${tab}"]')].filter((p) => !p.hidden);
  const last = shown[shown.length - 1].getBoundingClientRect();
  return { x: 0, y: nav.top - 8, width: innerWidth, height: (last.bottom - nav.top) + 24 };
})()`;

console.log('priming the gateway…');
await primeGateway();
console.log('capturing…');

// Overview: the tab strip and what the box says about itself.
await shot({
  url: `${GATEWAY}/setup#overview`, out: 'Status_and_Network.png', width: 1000, height: 1700,
  prep: [3000], clip: panelAfterTabs('overview'),
});
// The site's network: the reason this box exists — and the last-seen line per device.
await shot({
  url: `${GATEWAY}/setup#site`, out: 'SiteNetwork.png', width: 1000, height: 1700,
  prep: [`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Scan')?.click(), 'ok'`, 2500],
  clip: panelAfterTabs('site'),
});
// Health: the readings you open the page for when nothing is wrong.
await shot({
  url: `${GATEWAY}/setup#health`, out: 'SiteHealth.png', width: 1000, height: 1700,
  prep: [3000],
  clip: `(() => { const el = document.querySelector('#health-out').closest('.panel').getBoundingClientRect();
    return { x: el.x - 10, y: el.y - 10, width: el.width + 20, height: Math.min(el.height + 20, 900) }; })()`,
});

ws.close();
chrome.kill();
await optimise();
console.log('done — check the diff before committing, the sim numbers change every run');

/** Squeeze the files: flat UI is a few dozen colours pretending to be truecolour. */
async function optimise() {
  const run = (args) => new Promise((res) => {
    const p = spawn('magick', args, { stdio: 'ignore' });
    p.on('close', (code) => res(code === 0));
    p.on('error', () => res(false));
  });
  const at = (f) => join(OUT, f);
  if (!(await run(['-version']))) {
    console.warn('  ! ImageMagick not found — files left as captured');
    return;
  }
  for (const f of ['Status_and_Network.png', 'SiteNetwork.png', 'SiteHealth.png']) {
    await run([at(f), '-strip', '-colors', '256', '-define', 'png:compression-level=9', at(f)]);
  }
}
