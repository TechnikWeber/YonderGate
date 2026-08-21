import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GatewayConfig, PersistentConfig } from '../config.js';
import { loadPersisted, savePersisted, resetPersisted } from '../config.js';
import type { SystemManager } from '../system/index.js';
import type { TelemetryService } from '../sensors/TelemetryService.js';
import type { HistoryService } from '../sensors/HistoryService.js';
import type { AlertService } from '../system/AlertService.js';
import type { WatchdogService } from '../system/WatchdogService.js';
import { isProbeTarget, dayName } from '../system/watchdog.js';
import { switchId, validateSwitch, SWITCH_DEFAULT_CYCLE_S, type PowerSwitch } from '../system/power.js';
import { isNtfyUrl, maskNtfyUrl, unmaskNtfyUrl } from '../system/alerts.js';
import { isTimezone, parseNtpServers } from '../system/health.js';
import { usageOverview } from '../system/usage.js';
import { RANGES } from '../sensors/history.js';
import type { CameraCfg, TelemetryConfig } from '@yondergate/protocol';
import { safeStreamName } from '../video/cameraManager.js';
import { secretOk, readSecretFromReq, originAllowed, requestOrigin } from './auth.js';
import {
  HOTSPOT_DEFAULTS,
  redactRemoteConfig,
  normaliseWireguardConf,
  looksLikeWireguardConf,
  isZerotierNetworkId,
  type RemoteAccessConfig,
  type LteConfig,
} from '../system/SystemManager.js';
import { redactLteConfig, isValidPin } from '../system/lte.js';
import { HW_DEPS, isHwDep } from '../system/hwDeps.js';
import { isCountryCode } from '../system/wifi.js';
import { isIpv4 } from '../system/hilink.js';
import { isGitBranch, isGitSource, UPDATE_SOURCE_DEFAULT } from '../system/update.js';
import { isCidr } from '../system/tailscale.js';
import { nextListenPort, proxyId, validateProxy, type ProxyCfg } from './deviceProxy.js';
import { deviceKey, updateKnown, type KnownDevice } from '../system/discovery.js';

const SETUP_HTML = fileURLToPath(new URL('../setup/setup.html', import.meta.url));

export interface SetupContext {
  config: GatewayConfig;
  system: SystemManager;
  telemetry: TelemetryService;
  history: HistoryService;
  alerts: AlertService;
  watchdog: WatchdogService;
  applyCameras: (cams: CameraCfg[]) => Promise<void>;
  /** Re-read config.hilink: point the reader at the stick and (re)start its proxy. */
  applyHilink?: () => void;
  /** Restart every published device proxy from config.proxies. */
  applyProxies?: () => void;
  /** Called after config is persisted so the caller can note "restart needed". */
  onConfigSaved?: (patch: PersistentConfig) => void;
}

/** Keep a number inside sane bounds, falling back rather than rejecting. */
function clampInt(v: unknown, fallback: number, lo: number, hi: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** Reading keys the site currently has, so a rule can be pointed at a real channel. */
function sensorKeysOf(m: unknown): { key: string; label: string }[] {
  const msg = m as { voltages?: { label: string }[]; currents?: { label: string }[]; temperatures?: { label: string }[] } | null;
  if (!msg) return [];
  const out: { key: string; label: string }[] = [];
  msg.voltages?.forEach((r, i) => out.push({ key: `v:${r.label || i}`, label: `Voltage · ${r.label}` }));
  msg.currents?.forEach((r, i) => out.push({ key: `c:${r.label || i}`, label: `Current · ${r.label}` }));
  msg.temperatures?.forEach((r, i) => out.push({ key: `t:${r.label || i}`, label: `Temperature · ${r.label}` }));
  out.push({ key: 'pct:battery', label: 'Battery percentage' });
  return out;
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

/**
 * Returns true if it handled the request. Mounted by the HTTP server before its
 * own routes. Covers GET /setup (page) and the /api/* setup endpoints.
 */
const UPDATE_CACHE_MS = 10 * 60_000;
let updateCache: { at: number; data: Awaited<ReturnType<SystemManager['updateCheck']>> } | null = null;

export async function handleSetup(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: SetupContext,
): Promise<boolean> {
  const url = (req.url ?? '').split('?')[0];
  const method = req.method ?? 'GET';

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    res.end();
    return true;
  }

  if (url === '/setup' && method === 'GET') {
    try {
      const html = await readFile(SETUP_HTML, 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(500);
      res.end('setup page missing');
    }
    return true;
  }

  // Auth gate: only MUTATING calls (POST) are protected, and only when a secret is
  // configured. GET status stays open (read-only) and the /setup page above is open
  // so the operator can always reach the UI to enter the secret. When no secret is
  // set this is a no-op — first-time connect/setup needs nothing.
  // Where the request came FROM. A secret that was configured AND presented — not
  // `secretOk`, which is deliberately true when the feature is off and would wave
  // every origin through.
  const secretProven = !!ctx.config.apiSecret && secretOk(ctx.config.apiSecret, readSecretFromReq(req));
  if (method === 'POST' && url.startsWith('/api/') && !originAllowed(requestOrigin(req, secretProven))) {
    console.warn(`[setup] refused ${url} from a foreign page (origin ${req.headers.origin ?? 'none'})`);
    json(res, 403, {
      ok: false,
      message:
        'Refused: this request came from a page outside this network. ' +
        'If that was you — a page hosted on the internet — set an API secret and send it with the request.',
    });
    return true;
  }

  if (method === 'POST' && url.startsWith('/api/') && !secretOk(ctx.config.apiSecret, readSecretFromReq(req))) {
    json(res, 401, { ok: false, message: 'Unauthorized — provide the API secret.' });
    return true;
  }

  // Somewhere to try a secret without changing anything. It sits behind the same
  // gate as every other mutating call, so a wrong one is answered by the gate — the
  // handler only ever runs when the secret was right.
  if (url === '/api/auth/check' && method === 'POST') {
    json(res, 200, { ok: true, required: !!ctx.config.apiSecret });
    return true;
  }

  if (url === '/api/system' && method === 'GET') {
    // authRequired rides along so the status block can say whether this box has a
    // lock on it — a setting nobody can see is a setting nobody sets.
    json(res, 200, { ...(await ctx.system.status()), version: ctx.config.version, authRequired: !!ctx.config.apiSecret });
    return true;
  }

  if (url === '/api/detect' && method === 'GET') {
    json(res, 200, await ctx.system.detectHardware());
    return true;
  }

  // ---- native driver modules (i2c-bus / pigpio / serialport) ----
  // The whole point is that a gateway you only reach from a phone never forces
  // the operator into an SSH session; see hwDeps.ts.
  if (url === '/api/hw-deps' && method === 'GET') {
    json(res, 200, { deps: await ctx.system.hwDeps() });
    return true;
  }

  if (url === '/api/hw-deps' && method === 'POST') {
    const body = (await readBody(req)) as { pkg?: unknown };
    if (!isHwDep(body.pkg)) {
      json(res, 400, {
        ok: false,
        message: `Unknown module. Installable: ${HW_DEPS.map((d) => d.name).join(', ')}.`,
      });
      return true;
    }
    const r = await ctx.system.hwDepInstall(body.pkg);
    if (r.ok) {
      // Remember what is ACTUALLY installed, not just what was asked for: npm reifies
      // the whole gateway package, so its sibling optional modules come along. Recording
      // only the requested one would have `install.sh` prune the others on the next
      // update — a driver that silently disappears is exactly what we set out to avoid.
      const known = new Set(loadPersisted(ctx.config.configPath).hardwareDeps ?? []);
      known.add(body.pkg);
      for (const d of await ctx.system.hwDeps()) if (d.installed) known.add(d.name);
      savePersisted(ctx.config.configPath, { hardwareDeps: [...known] });
      ctx.onConfigSaved?.({ hardwareDeps: [...known] });
    }
    json(res, r.ok ? 200 : 500, r);
    return true;
  }

  // ---- self-update (git pull + rebuild + restart, from the site) ----
  if (url === '/api/update' && method === 'GET') {
    // Cached, because a check is a `git fetch` and this endpoint needs no secret:
    // every page load would otherwise spend mobile data, and a browser left open on
    // the site would spend it all day. The Check button passes force=1.
    const force = (req.url ?? '').includes('force=1');
    const now = Date.now();
    if (!force && updateCache && now - updateCache.at < UPDATE_CACHE_MS) {
      json(res, 200, { ...updateCache.data, source: ctx.config.update, checkedAt: new Date(updateCache.at).toISOString(), cached: true });
      return true;
    }
    const data = await ctx.system.updateCheck(ctx.config.update);
    updateCache = { at: now, data };
    json(res, 200, { ...data, source: ctx.config.update, checkedAt: new Date(now).toISOString(), cached: false });
    return true;
  }

  if (url === '/api/update' && method === 'POST') {
    const r = await ctx.system.updateApply(ctx.config.update);
    json(res, r.ok ? 200 : 500, r);
    return true;
  }

  // Where updates come from. Default is the checkout's own origin/main; a fork or a
  // branch is a site, not a code change.
  if (url === '/api/update/source' && method === 'POST') {
    const body = (await readBody(req)) as { source?: unknown; branch?: unknown };
    const source = body.source === undefined || body.source === '' ? UPDATE_SOURCE_DEFAULT.source : body.source;
    const branch = body.branch === undefined || body.branch === '' ? UPDATE_SOURCE_DEFAULT.branch : body.branch;
    if (!isGitSource(source)) {
      json(res, 400, { ok: false, message: 'The source is a git remote name (e.g. origin) or a URL — no spaces.' });
      return true;
    }
    if (!isGitBranch(branch)) {
      json(res, 400, { ok: false, message: 'The branch is a git branch name (e.g. main).' });
      return true;
    }
    const update = { source: source.trim(), branch: branch.trim() };
    savePersisted(ctx.config.configPath, { update });
    ctx.config.update = update;
    ctx.onConfigSaved?.({ update });
    json(res, 200, { ok: true, message: `Updates now come from ${update.source} · ${update.branch}.`, source: update });
    return true;
  }

  if (url === '/api/restart' && method === 'POST') {
    json(res, 200, await ctx.system.restartService());
    return true;
  }

  if (url === '/api/config' && method === 'GET') {
    const c = ctx.config;
    json(res, 200, {
      siteName: c.siteName,
      cameras: c.cameras,
      videoBaseUrl: c.videoBaseUrl,
      apn: c.lte.apn,
      systemKind: c.systemKind,
      // Never return the secret itself — only whether one is required.
      authRequired: !!c.apiSecret,
    });
    return true;
  }

  if (url === '/api/config' && method === 'POST') {
    const patch = (await readBody(req)) as PersistentConfig;
    // Normalise an empty secret to null (= OFF) so clearing it is unambiguous.
    if (patch.apiSecret !== undefined) patch.apiSecret = patch.apiSecret || null;
    const saved = savePersisted(ctx.config.configPath, patch);
    // Apply the secret live so the gate takes effect immediately (no restart).
    if (patch.apiSecret !== undefined) ctx.config.apiSecret = patch.apiSecret;
    ctx.onConfigSaved?.(patch);
    // Don't echo the secret back in `saved`.
    const { apiSecret: _omit, ...safeSaved } = saved;
    json(res, 200, { ok: true, saved: safeSaved, note: 'Saved. Some changes apply after a restart.' });
    return true;
  }

  if (url === '/api/lte' && method === 'GET') {
    json(res, 200, { config: redactLteConfig(ctx.config.lte) });
    return true;
  }
  if (url === '/api/lte' && method === 'POST') {
    const body = (await readBody(req)) as Partial<LteConfig>;
    const cur = ctx.config.lte;
    // Merge onto the stored config so unspecified secrets (PIN, password) survive.
    const cfg: LteConfig = {
      apn: body.apn !== undefined ? body.apn || null : cur.apn,
      pin: body.pin !== undefined ? body.pin || null : cur.pin ?? null,
      username: body.username !== undefined ? body.username || null : cur.username ?? null,
      password: body.password !== undefined ? body.password || null : cur.password ?? null,
      networkMode: body.networkMode ?? cur.networkMode ?? 'auto',
      allowRoaming: body.allowRoaming !== undefined ? body.allowRoaming : cur.allowRoaming,
    };
    savePersisted(ctx.config.configPath, { lte: cfg });
    ctx.config.lte = cfg;
    json(res, 200, await ctx.system.lteConnect(cfg));
    return true;
  }
  if (url === '/api/lte/pin' && method === 'POST') {
    const body = (await readBody(req)) as { action?: 'change' | 'disable'; currentPin?: string; newPin?: string };
    if (!body.currentPin) {
      json(res, 400, { ok: false, message: 'Current PIN is required.' });
      return true;
    }
    if (body.action === 'change' && !(body.newPin && isValidPin(body.newPin))) {
      json(res, 400, { ok: false, message: 'New PIN must be 4–8 digits (or use Remove to disable the lock).' });
      return true;
    }
    json(res, 200, await ctx.system.lteSetPin({
      action: body.action === 'disable' ? 'disable' : 'change',
      currentPin: body.currentPin,
      newPin: body.newPin,
    }));
    return true;
  }
  if (url === '/api/lte/diagnostics' && method === 'POST') {
    json(res, 200, await ctx.system.lteDiagnostics());
    return true;
  }
  if (url === '/api/lte/disconnect' && method === 'POST') {
    json(res, 200, await ctx.system.lteDisconnect());
    return true;
  }

  // --- remote access (Tailscale / ZeroTier / WireGuard), one active at a time ---
  if (url === '/api/remote' && method === 'GET') {
    json(res, 200, {
      config: redactRemoteConfig(ctx.config.remoteAccess),
      status: await ctx.system.remoteStatus(ctx.config.remoteAccess),
    });
    return true;
  }
  if (url === '/api/remote' && method === 'POST') {
    const body = (await readBody(req)) as Partial<RemoteAccessConfig>;
    const cur = ctx.config.remoteAccess;
    // Merge onto the current config so unspecified secrets (auth key, WG conf) survive.
    const cfg: RemoteAccessConfig = {
      kind: body.kind ?? 'none',
      tailscaleAuthKey: body.tailscaleAuthKey !== undefined ? body.tailscaleAuthKey || null : cur.tailscaleAuthKey ?? null,
      zerotierNetworkId: body.zerotierNetworkId !== undefined ? body.zerotierNetworkId || null : cur.zerotierNetworkId ?? null,
      wireguardConf: body.wireguardConf !== undefined ? body.wireguardConf || null : cur.wireguardConf ?? null,
    };
    if (cfg.kind === 'zerotier' && !(cfg.zerotierNetworkId && isZerotierNetworkId(cfg.zerotierNetworkId))) {
      json(res, 400, { ok: false, message: 'ZeroTier needs a 16-hex network ID.' });
      return true;
    }
    if (cfg.kind === 'wireguard') {
      if (!cfg.wireguardConf) {
        json(res, 400, { ok: false, message: 'Upload a WireGuard .conf first.' });
        return true;
      }
      cfg.wireguardConf = normaliseWireguardConf(cfg.wireguardConf);
      if (!looksLikeWireguardConf(cfg.wireguardConf)) {
        json(res, 400, { ok: false, message: "That doesn't look like a WireGuard .conf ([Interface]/[Peer]/PrivateKey missing)." });
        return true;
      }
    }
    savePersisted(ctx.config.configPath, { remoteAccess: cfg });
    ctx.config.remoteAccess = cfg;
    const r = await ctx.system.remoteUp(cfg);
    json(res, r.ok ? 200 : 500, r);
    return true;
  }
  if (url === '/api/remote/down' && method === 'POST') {
    json(res, 200, await ctx.system.remoteDown(ctx.config.remoteAccess));
    return true;
  }

  // --- WiFi: join a network from the onboarding hotspot, and the hotspot itself ---
  // ---- how the box itself is doing, what the SIM has used, and speaking up ----
  if (url === '/api/health' && method === 'GET') {
    const snap = ctx.alerts.snapshot();
    json(res, 200, {
      health: await ctx.system.health(),
      usage: snap.usage,
      usageStatus: snap.status,
      usageOverview: usageOverview(snap.usage, ctx.config.data.capGb, Date.now()),
      interfaces: await ctx.system.interfaces(),
      data: ctx.config.data,
      ntpServers: ctx.config.ntpServers,
      history: ctx.config.history,
      // Neither the topic nor the token leaves the box: this endpoint is readable
      // by anyone on the LAN or the hotspot, and the topic URL is a credential.
      alerts: {
        ...ctx.config.alerts,
        ntfyUrl: maskNtfyUrl(ctx.config.alerts.ntfyUrl),
        ntfyToken: ctx.config.alerts.ntfyToken ? '(stored)' : null,
      },
      watchdog: { ...ctx.config.watchdog, ...ctx.watchdog.snapshot() },
      reboot: ctx.config.reboot,
      switches: ctx.config.switches,
      hardwareWatchdogSeconds: await ctx.system.hardwareWatchdogSeconds(),
      devices: ctx.config.devices,
      sensorKeys: sensorKeysOf(ctx.telemetry.message),
    });
    return true;
  }

  if (url === '/api/ntp' && method === 'POST') {
    const body = (await readBody(req)) as { servers?: unknown };
    const servers = parseNtpServers(String(body.servers ?? ''));
    savePersisted(ctx.config.configPath, { ntpServers: servers });
    ctx.config.ntpServers = servers;
    json(res, 200, await ctx.system.setNtpServers(servers));
    return true;
  }

  if (url === '/api/timezone' && method === 'POST') {
    const body = (await readBody(req)) as { timezone?: unknown };
    if (!isTimezone(body.timezone)) {
      json(res, 400, { ok: false, message: 'A timezone looks like Europe/Berlin.' });
      return true;
    }
    json(res, 200, await ctx.system.setTimezone(String(body.timezone)));
    return true;
  }

  if (url === '/api/rtc' && method === 'POST') {
    const body = (await readBody(req)) as { enabled?: unknown };
    json(res, 200, await ctx.system.setRtcOverlay(body.enabled === true));
    return true;
  }

  if (url === '/api/data' && method === 'POST') {
    const body = (await readBody(req)) as { source?: unknown; iface?: unknown; capGb?: unknown };
    const source = body.source === 'interface' ? 'interface' : 'hilink';
    const iface = String(body.iface ?? ctx.config.data.iface).trim() || 'eth1';
    const capRaw = body.capGb === '' || body.capGb === null || body.capGb === undefined ? null : Number(body.capGb);
    if (capRaw !== null && (!Number.isFinite(capRaw) || capRaw <= 0)) {
      json(res, 400, { ok: false, message: 'The allowance is a number of gigabytes, or empty for none.' });
      return true;
    }
    const data = { source: source as 'hilink' | 'interface', iface, capGb: capRaw };
    savePersisted(ctx.config.configPath, { data });
    ctx.config.data = data;
    json(res, 200, { ok: true, message: `Counting ${source === 'hilink' ? "the stick's own counter" : iface}${capRaw ? `, warning at 80% of ${capRaw} GB` : ', no allowance set'}.`, data });
    return true;
  }

  if (url === '/api/history/settings' && method === 'POST') {
    const body = (await readBody(req)) as { enabled?: unknown; keepMonths?: unknown; flushMinutes?: unknown };
    const history = {
      enabled: body.enabled === true,
      keepMonths: clampInt(body.keepMonths, ctx.config.history.keepMonths, 1, 60),
      flushMinutes: clampInt(body.flushMinutes, ctx.config.history.flushMinutes, 1, 60),
    };
    savePersisted(ctx.config.configPath, { history });
    ctx.config.history = history;
    json(res, 200, {
      ok: true,
      // Restart-gated on purpose: starting and stopping the recorder underneath a
      // running box is a good way to lose the minute it was in the middle of.
      message: `Saved. Recording ${history.enabled ? 'on' : 'off'} — restart the gateway to apply.`,
      history,
    });
    return true;
  }

  if (url === '/api/alerts' && method === 'POST') {
    const body = (await readBody(req)) as { enabled?: unknown; ntfyUrl?: unknown; ntfyToken?: unknown; rules?: unknown };
    const posted = body.ntfyUrl === '' || body.ntfyUrl === null ? null : String(body.ntfyUrl ?? '');
    // An unchanged topic arrives masked; never store the mask over the real one.
    const ntfyUrl = unmaskNtfyUrl(posted, ctx.config.alerts.ntfyUrl);
    if (ntfyUrl !== null && !isNtfyUrl(ntfyUrl)) {
      json(res, 400, { ok: false, message: 'That is not an ntfy topic URL — it looks like https://ntfy.sh/your-topic.' });
      return true;
    }
    const alerts = {
      enabled: body.enabled === true,
      ntfyUrl,
      // An unchanged token arrives as the placeholder; never overwrite a stored
      // secret with the word "(stored)".
      ntfyToken: body.ntfyToken === '(stored)' ? ctx.config.alerts.ntfyToken : (String(body.ntfyToken ?? '') || null),
      rules: Array.isArray(body.rules) ? (body.rules as typeof ctx.config.alerts.rules) : ctx.config.alerts.rules,
    };
    savePersisted(ctx.config.configPath, { alerts });
    ctx.config.alerts = alerts;
    json(res, 200, { ok: true, message: alerts.enabled ? 'Alerts are on.' : 'Alerts are off.', alerts: { ...alerts, ntfyUrl: maskNtfyUrl(alerts.ntfyUrl), ntfyToken: alerts.ntfyToken ? '(stored)' : null } });
    return true;
  }

  // Rules are edited here rather than in a config file: the thresholds that matter
  // are the ones for the sensors this particular site happens to have.
  if (url === '/api/alerts/rules' && method === 'POST') {
    const body = (await readBody(req)) as {
      remove?: unknown; id?: unknown; kind?: unknown; target?: unknown; label?: unknown;
      below?: unknown; above?: unknown; forMinutes?: unknown;
    };
    if (body.remove === true) {
      const rules = ctx.config.alerts.rules.filter((r) => r.id !== String(body.id ?? ''));
      const alerts = { ...ctx.config.alerts, rules };
      savePersisted(ctx.config.configPath, { alerts });
      ctx.config.alerts = alerts;
      json(res, 200, { ok: true, message: 'Rule removed.', rules });
      return true;
    }
    const kind = String(body.kind ?? '');
    if (!['sensor', 'device', 'health', 'usage'].includes(kind)) {
      json(res, 400, { ok: false, message: 'Pick what to watch.' });
      return true;
    }
    const target = String(body.target ?? '').trim();
    if (!target) {
      json(res, 400, { ok: false, message: 'Pick which reading or device to watch.' });
      return true;
    }
    const below = body.below === '' || body.below === undefined || body.below === null ? null : Number(body.below);
    const above = body.above === '' || body.above === undefined || body.above === null ? null : Number(body.above);
    if (kind === 'sensor' && below === null && above === null) {
      json(res, 400, { ok: false, message: 'A sensor rule needs a limit — below, above, or both.' });
      return true;
    }
    if ((below !== null && !Number.isFinite(below)) || (above !== null && !Number.isFinite(above))) {
      json(res, 400, { ok: false, message: 'A limit is a number.' });
      return true;
    }
    const forMinutes = clampInt(body.forMinutes, 5, 1, 1440);
    const rule = {
      id: `${kind}:${target}`,
      kind: kind as 'sensor' | 'device' | 'health' | 'usage',
      target,
      label: String(body.label ?? '').trim() || target,
      below,
      above,
      forMs: forMinutes * 60_000,
    };
    const rules = [...ctx.config.alerts.rules.filter((r) => r.id !== rule.id), rule];
    const alerts = { ...ctx.config.alerts, rules };
    savePersisted(ctx.config.configPath, { alerts });
    ctx.config.alerts = alerts;
    json(res, 200, { ok: true, message: `Watching ${rule.label}.`, rules });
    return true;
  }

  // Switching things off and on: the one thing this box can do about a device that
  // has stopped answering, rather than only reporting it.
  if (url === '/api/switches' && method === 'POST') {
    const body = (await readBody(req)) as Record<string, unknown>;
    if (body.remove === true) {
      const switches = ctx.config.switches.filter((x) => x.id !== String(body.id ?? ''));
      savePersisted(ctx.config.configPath, { switches });
      ctx.config.switches = switches;
      json(res, 200, { ok: true, message: 'Switch removed.', switches });
      return true;
    }
    const draft: Partial<PowerSwitch> = {
      label: String(body.label ?? '').trim(),
      kind: (String(body.kind ?? 'shelly') as PowerSwitch['kind']),
      host: body.host ? String(body.host).trim() : null,
      // NOT clamped: a pin of 99 must be refused, not quietly turned into 27 — the
      // "helpful" correction is how a relay ends up switching the wrong line.
      channel: body.channel === undefined || body.channel === '' ? 0 : Number(body.channel),
      pin: body.pin === undefined || body.pin === '' ? undefined : Number(body.pin),
      inverted: body.inverted === true,
      onUrl: body.onUrl ? String(body.onUrl).trim() : null,
      offUrl: body.offUrl ? String(body.offUrl).trim() : null,
      cycleSeconds: clampInt(body.cycleSeconds, SWITCH_DEFAULT_CYCLE_S, 1, 300),
      deviceId: body.deviceId ? String(body.deviceId) : null,
      autoCycle: body.autoCycle === true,
    };
    const problem = validateSwitch(draft);
    if (problem) {
      json(res, 400, { ok: false, message: problem });
      return true;
    }
    const sw = { ...draft, id: switchId(draft.label as string) } as PowerSwitch;
    const switches = [...ctx.config.switches.filter((x) => x.id !== sw.id), sw];
    savePersisted(ctx.config.configPath, { switches });
    ctx.config.switches = switches;
    json(res, 200, { ok: true, message: `Saved "${sw.label}".`, switches });
    return true;
  }

  if (url === '/api/switches/act' && method === 'POST') {
    const body = (await readBody(req)) as { id?: unknown; action?: unknown };
    const sw = ctx.config.switches.find((x) => x.id === String(body.id ?? ''));
    if (!sw) {
      json(res, 404, { ok: false, message: 'No such switch.' });
      return true;
    }
    const action = body.action === 'on' || body.action === 'off' ? body.action : 'cycle';
    json(res, 200, await ctx.system.setSwitch(sw, action));
    return true;
  }

  if (url === '/api/hardware-watchdog' && method === 'POST') {
    const body = (await readBody(req)) as { enabled?: unknown };
    json(res, 200, await ctx.system.setHardwareWatchdog(body.enabled === true));
    return true;
  }

  if (url === '/api/watchdog' && method === 'POST') {
    const body = (await readBody(req)) as {
      enabled?: unknown; target?: unknown; intervalMinutes?: unknown; allowReboot?: unknown;
      rebootEnabled?: unknown; rebootWeekday?: unknown; rebootHour?: unknown;
    };
    const target = String(body.target ?? ctx.config.watchdog.target).trim();
    if (!isProbeTarget(target)) {
      json(res, 400, { ok: false, message: 'The probe target is an IP address (a name would make a DNS failure look like a dead link).' });
      return true;
    }
    const watchdog = {
      ...ctx.config.watchdog,
      enabled: body.enabled === true,
      target,
      intervalMinutes: clampInt(body.intervalMinutes, ctx.config.watchdog.intervalMinutes, 1, 60),
      // 0 disables the reboot step; the ladder below it still runs.
      afterReboot: body.allowReboot === true ? ctx.config.watchdog.afterReboot || 8 : 0,
    };
    const reboot = {
      enabled: body.rebootEnabled === true,
      weekday: clampInt(body.rebootWeekday, ctx.config.reboot.weekday, 0, 6),
      hour: clampInt(body.rebootHour, ctx.config.reboot.hour, 0, 23),
    };
    savePersisted(ctx.config.configPath, { watchdog, reboot });
    ctx.config.watchdog = watchdog;
    ctx.config.reboot = reboot;
    json(res, 200, {
      ok: true,
      message:
        `Saved. Watchdog ${watchdog.enabled ? `probes ${watchdog.target} every ${watchdog.intervalMinutes} min` : 'off'}` +
        `, weekly reboot ${reboot.enabled ? `${dayName(reboot.weekday)} ${String(reboot.hour).padStart(2, '0')}:00` : 'off'}` +
        ' — restart the gateway to apply the interval.',
      watchdog,
      reboot,
    });
    return true;
  }

  if (url === '/api/alerts/test' && method === 'POST') {
    const r = await ctx.alerts.test();
    json(res, r.ok ? 200 : 500, r);
    return true;
  }

  // ---- the site's network: what is out there, and how to reach it ----
  if (url === '/api/scan' && method === 'POST') {
    const body = (await readBody(req)) as { active?: unknown };
    const result = await ctx.system.scanNetwork({ active: body.active === true, known: ctx.config.devices });
    // A scan is also the moment to learn where a saved device moved to: DHCP hands
    // out new addresses, and a name is worth nothing if it points at the old one.
    const devices = updateKnown(ctx.config.devices, result.devices.filter((d) => d.seen));
    if (JSON.stringify(devices) !== JSON.stringify(ctx.config.devices)) {
      savePersisted(ctx.config.configPath, { devices });
      ctx.config.devices = devices;
    }
    json(res, 200, result);
    return true;
  }

  // Naming a device (and saying which port its web UI is on) is what turns a list of
  // addresses into an inventory of the site.
  if (url === '/api/devices' && method === 'GET') {
    json(res, 200, { devices: ctx.config.devices });
    return true;
  }

  if (url === '/api/devices' && method === 'POST') {
    const body = (await readBody(req)) as { ip?: unknown; mac?: unknown; label?: unknown; port?: unknown; remove?: unknown };
    const ip = String(body.ip ?? '');
    const mac = typeof body.mac === 'string' && body.mac ? body.mac.toLowerCase() : null;
    if (!isIpv4(ip)) {
      json(res, 400, { ok: false, message: 'A device needs an IPv4 address.' });
      return true;
    }
    const id = deviceKey({ mac, ip });
    if (body.remove === true) {
      const devices = ctx.config.devices.filter((d) => d.id !== id);
      savePersisted(ctx.config.configPath, { devices });
      ctx.config.devices = devices;
      json(res, 200, { ok: true, message: 'Device forgotten.', devices });
      return true;
    }
    const port = body.port === undefined ? 80 : Number(body.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      json(res, 400, { ok: false, message: `Port ${String(body.port)} is out of range.` });
      return true;
    }
    const label = String(body.label ?? '').trim();
    if (!label) {
      json(res, 400, { ok: false, message: 'Give the device a name — that is the point of saving it.' });
      return true;
    }
    const existing = ctx.config.devices.find((d) => d.id === id);
    const entry: KnownDevice = { id, label, mac, ip, port, lastSeen: existing?.lastSeen ?? new Date().toISOString() };
    const devices = [...ctx.config.devices.filter((d) => d.id !== id), entry];
    savePersisted(ctx.config.configPath, { devices });
    ctx.config.devices = devices;
    json(res, 200, { ok: true, message: `Saved as "${label}".`, device: entry, devices });
    return true;
  }

  if (url === '/api/routes' && method === 'GET') {
    json(res, 200, await ctx.system.subnetRoutes());
    return true;
  }

  if (url === '/api/routes' && method === 'POST') {
    const body = (await readBody(req)) as { cidrs?: unknown };
    const cidrs = Array.isArray(body.cidrs) ? body.cidrs : [];
    const bad = cidrs.find((c) => !isCidr(c));
    if (bad !== undefined) {
      json(res, 400, { ok: false, message: `"${String(bad)}" is not an IPv4 network (e.g. 192.168.4.0/24).` });
      return true;
    }
    const r = await ctx.system.setSubnetRoutes(cidrs as string[]);
    json(res, r.ok ? 200 : 500, r);
    return true;
  }

  // Publishing a device on a port of its own — the fallback for when subnet routes
  // are not an option (or not approved yet).
  if (url === '/api/proxies' && method === 'GET') {
    json(res, 200, { proxies: ctx.config.proxies, hilink: ctx.config.hilink });
    return true;
  }

  if (url === '/api/proxies' && method === 'POST') {
    const body = (await readBody(req)) as { host?: unknown; port?: unknown; label?: unknown; remove?: unknown };
    const host = String(body.host ?? '');
    const port = Number(body.port ?? 80);
    const id = proxyId(host, port);

    if (body.remove === true) {
      const proxies = ctx.config.proxies.filter((p) => p.id !== id);
      savePersisted(ctx.config.configPath, { proxies });
      ctx.config.proxies = proxies;
      ctx.applyProxies?.();
      json(res, 200, { ok: true, message: `Stopped publishing ${id}.`, proxies });
      return true;
    }

    // Ports already spoken for: the control port, the stick's proxy, and every
    // device already published. Handing out a port twice would take one of them down.
    const taken = [
      ctx.config.port,
      ...(ctx.config.hilink.proxyPort ? [ctx.config.hilink.proxyPort] : []),
      ...ctx.config.proxies.map((p) => p.listen),
    ];
    const existing = ctx.config.proxies.find((p) => p.id === id);
    const cfg: ProxyCfg = {
      id,
      label: String(body.label ?? '').trim() || host,
      host,
      port,
      listen: existing?.listen ?? nextListenPort(taken),
    };
    const problem = validateProxy(cfg, existing ? taken.filter((t) => t !== existing.listen) : taken);
    if (problem) {
      json(res, 400, { ok: false, message: problem.message });
      return true;
    }
    const proxies = [...ctx.config.proxies.filter((p) => p.id !== id), cfg];
    savePersisted(ctx.config.configPath, { proxies });
    ctx.config.proxies = proxies;
    ctx.applyProxies?.();
    json(res, 200, {
      ok: true,
      message: `${cfg.label} is now reachable on port ${cfg.listen} of this gateway.`,
      proxy: cfg,
      proxies,
    });
    return true;
  }

  // ---- HiLink LTE stick (Huawei E3372h-320 & friends) ----
  if (url === '/api/hilink' && method === 'GET') {
    // The panel's Refresh button means "ask the stick now", not "show me the cache".
    json(res, 200, { status: await ctx.system.hilinkStatus({ force: true }), config: ctx.config.hilink });
    return true;
  }

  if (url === '/api/hilink' && method === 'POST') {
    const body = (await readBody(req)) as { host?: unknown; proxyPort?: unknown };
    const host = body.host === undefined ? ctx.config.hilink.host : body.host;
    if (!isIpv4(host)) {
      json(res, 400, { ok: false, message: 'The stick is addressed by IPv4 (default 192.168.8.1).' });
      return true;
    }
    let proxyPort = ctx.config.hilink.proxyPort;
    if (body.proxyPort !== undefined) {
      const p = body.proxyPort === null || body.proxyPort === '' ? null : Number(body.proxyPort);
      // Privileged ports are out (we may not be root forever) and so is the control
      // port itself — taking that one down would cut the gateway off while it runs.
      if (p !== null && (!Number.isInteger(p) || p < 1024 || p > 65535 || p === ctx.config.port)) {
        json(res, 400, { ok: false, message: `Pick a free port between 1024 and 65535 (not ${ctx.config.port}, that is the control port), or leave it empty to switch the proxy off.` });
        return true;
      }
      proxyPort = p;
    }
    const hilink = { host, proxyPort };
    savePersisted(ctx.config.configPath, { hilink });
    ctx.config.hilink = hilink;
    ctx.applyHilink?.();
    ctx.onConfigSaved?.({ hilink });
    json(res, 200, {
      ok: true,
      message: proxyPort
        ? `Saved. The stick's web UI is reachable at http://<this gateway>:${proxyPort}/`
        : 'Saved. The stick\'s web UI is not exposed.',
      config: hilink,
    });
    return true;
  }

  if (url === '/api/wifi' && method === 'GET') {
    const st = await ctx.system.status();
    json(res, 200, {
      wifi: st.wifi,
      // The radio state is what decides whether a hotspot can start at all — Pi OS
      // keeps it blocked until a WiFi country is set.
      radio: await ctx.system.wifiRadio(),
      hotspot: {
        ssid: ctx.config.hotspot.ssid,
        hasPassword: !!ctx.config.hotspot.password,
        mode: ctx.config.hotspot.mode ?? 'auto',
      },
    });
    return true;
  }
  if (url === '/api/wifi/scan' && method === 'POST') {
    json(res, 200, { networks: await ctx.system.wifiScan() });
    return true;
  }
  if (url === '/api/wifi/connect' && method === 'POST') {
    const body = (await readBody(req)) as { ssid?: string; password?: string | null };
    const ssid = (body.ssid ?? '').trim();
    if (!ssid) {
      json(res, 400, { ok: false, message: 'Pick a network first.' });
      return true;
    }
    // On a single-radio Pi this drops the hotspot mid-request, so the caller may
    // never see this response — the UI says so before it asks.
    const r = await ctx.system.wifiConnect(ssid, body.password?.trim() || null);
    json(res, r.ok ? 200 : 500, r);
    return true;
  }
  if (url === '/api/wifi/radio' && method === 'POST') {
    const body = (await readBody(req)) as { country?: unknown };
    const country = typeof body.country === 'string' ? body.country : null;
    if (country && !isCountryCode(country)) {
      json(res, 400, { ok: false, message: 'Pick a two-letter country code (e.g. DE).' });
      return true;
    }
    const r = await ctx.system.wifiRadioEnable(country);
    json(res, r.ok ? 200 : 500, r);
    return true;
  }

  if (url === '/api/wifi/hotspot' && method === 'POST') {
    const body = (await readBody(req)) as {
      ssid?: string;
      password?: string | null;
      mode?: 'auto' | 'always' | 'off';
      start?: boolean;
      stop?: boolean;
    };
    const password = body.password === undefined ? ctx.config.hotspot.password : body.password || null;
    if (password && password.length < 8) {
      json(res, 400, { ok: false, message: 'A WiFi password needs at least 8 characters — leave it empty for an open hotspot.' });
      return true;
    }
    const hotspot = {
      ssid: (body.ssid ?? ctx.config.hotspot.ssid).trim() || HOTSPOT_DEFAULTS.ssid,
      password,
      mode: body.mode ?? ctx.config.hotspot.mode ?? 'auto',
    };
    savePersisted(ctx.config.configPath, { hotspot });
    ctx.config.hotspot = hotspot;
    if (body.stop) {
      json(res, 200, await ctx.system.hotspotStop());
      return true;
    }
    if (body.start) {
      const r = await ctx.system.hotspotStart(hotspot);
      json(res, r.ok ? 200 : 500, r);
      return true;
    }
    const modeNote =
      hotspot.mode === 'always'
        ? ' It will also come up next to a working LTE link (but not while the Pi is a WiFi client — one radio).'
        : hotspot.mode === 'off'
          ? ' It will not start on its own any more.'
          : ' It starts on its own only when the Pi has no uplink.';
    json(res, 200, {
      ok: true,
      message: `Saved. ${password ? 'The hotspot will use the new password' : 'The hotspot will be open'} the next time it starts.${modeNote}`,
    });
    return true;
  }

  if (url === '/api/reboot' && method === 'POST') {
    json(res, 200, await ctx.system.reboot());
    return true;
  }

  if (url === '/api/factory-reset' && method === 'POST') {
    resetPersisted(ctx.config.configPath);
    // Drop the secret live so the operator isn't locked out after a reset; the rest
    // (driver, telemetry, cameras) reverts to defaults on the next restart.
    ctx.config.apiSecret = null;
    json(res, 200, { ok: true, message: 'Factory reset — restart the gateway to apply defaults.' });
    return true;
  }

  // --- telemetry ---
  if (url === '/api/telemetry' && method === 'GET') {
    json(res, 200, ctx.config.telemetry);
    return true;
  }
  if (url === '/api/telemetry' && method === 'POST') {
    const telemetry = (await readBody(req)) as PersistentConfig['telemetry'];
    savePersisted(ctx.config.configPath, { telemetry });
    // Keep the in-memory config in sync — GET /api/telemetry reads it, so without
    // this the setup page showed the pre-save values again after a reload.
    if (telemetry) ctx.config.telemetry = telemetry;
    ctx.onConfigSaved?.({ telemetry });
    // Apply live so battery %/mAh appears without a restart.
    let note = 'Telemetry applied.';
    try {
      await ctx.telemetry.reconfigure(telemetry as unknown as TelemetryConfig);
    } catch (e) {
      note = `Saved, but live apply failed (${(e as Error).message}). Restart to apply.`;
    }
    json(res, 200, { ok: true, note });
    return true;
  }
  if (url === '/api/telemetry/reset' && method === 'POST') {
    await ctx.telemetry.resetCapacity();
    json(res, 200, { ok: true, message: 'Coulomb counter reset.' });
    return true;
  }

  // The past, which is the question a live reading cannot answer.
  if (url.startsWith('/api/history') && method === 'GET') {
    const q = new URL(req.url ?? '/', 'http://gateway').searchParams;
    const span = RANGES[q.get('range') ?? 'day'] ?? RANGES.day;
    const to = Date.now();
    json(res, 200, { range: q.get('range') ?? 'day', from: to - span, to, ...ctx.history.range(to - span, to) });
    return true;
  }

  // Live one-shot sensor read for the "Sensors" panel.
  if (url === '/api/telemetry/live' && method === 'GET') {
    json(res, 200, ctx.telemetry.message ?? { ok: false, note: 'no telemetry yet' });
    return true;
  }
  // ---- cameras (graphical → generates go2rtc.yaml) ----
  if (url === '/api/cameras' && method === 'GET') {
    json(res, 200, { cameras: ctx.config.cameras });
    return true;
  }
  if (url === '/api/cameras' && method === 'POST') {
    const body = (await readBody(req)) as { cameras?: CameraCfg[] };
    // Normalise stream names on save so the stored config, the welcome message and
    // the generated go2rtc.yaml all agree on the same safe stream id.
    const cameras = (body.cameras ?? []).map((c) => ({ ...c, name: safeStreamName(c.name) }));
    savePersisted(ctx.config.configPath, { cameras });
    ctx.config.cameras = cameras;
    await ctx.applyCameras(cameras);
    json(res, 200, { ok: true, message: `Applied ${cameras.length} camera(s) and reloaded video.` });
    return true;
  }

  return false;
}
