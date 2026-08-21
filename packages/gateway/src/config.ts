import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TelemetryConfig, CameraCfg } from '@yondergate/protocol';
import type { SystemKind } from './system/index.js';
import type { RemoteAccessConfig, LteConfig, HotspotConfig } from './system/SystemManager.js';
import type { HwDepName } from './system/hwDeps.js';
import { HILINK_DEFAULT_HOST } from './system/hilink.js';
import { UPDATE_SOURCE_DEFAULT, type UpdateSource } from './system/update.js';
import type { ProxyCfg } from './transport/deviceProxy.js';
import type { KnownDevice } from './system/discovery.js';
import type { AlertRule } from './system/alerts.js';
import { defaultRules } from './system/alerts.js';
import { HOTSPOT_DEFAULTS } from './system/SystemManager.js';

/**
 * Config is env-defaulted and file-persisted. The on-Pi setup UI writes a small
 * JSON file of "persistent" fields; loadConfig() layers that over the env
 * defaults so the appliance keeps its settings across reboots. Env still wins for
 * host/port/system so docker + dev stay predictable.
 */
export interface GatewayConfig {
  /** What this installation is called — shows up in the UI and the banner. */
  siteName: string;
  host: string;
  port: number;
  /** Base URL of the go2rtc video server, or null for pure sim without video. */
  videoBaseUrl: string | null;
  /** 'sim' (default) or 'real' networking (Pi). */
  systemKind: SystemKind;
  /** LTE dial settings (APN, optional PIN/user/pass); auto-connected at boot if apn set. */
  lte: LteConfig;
  /** Remote access (Tailscale / ZeroTier / WireGuard); brought up at boot if kind≠none. */
  remoteAccess: RemoteAccessConfig;
  /** Onboarding hotspot settings (SSID, optional password). */
  hotspot: HotspotConfig;
  /** Huawei HiLink LTE stick (its own router; not a ModemManager modem). */
  hilink: HilinkSettings;
  /** Where "Software update" pulls from (remote name or URL + branch). */
  update: UpdateSource;
  /** Devices published on a local port, so they can be opened from anywhere. */
  proxies: ProxyCfg[];
  /** Devices the operator named, so a scan is not anonymous every time. */
  devices: KnownDevice[];
  /**
   * Optional shared secret. When set (non-empty), mutating setup-API calls and the
   * control WebSocket must present it (header `x-yondergate-secret` / `?secret=`).
   * null = OFF (default), so first-time connect/setup needs nothing.
   */
  apiSecret: string | null;
  /** Telemetry (sensors, coulomb counting, battery). */
  telemetry: TelemetryConfig;
  /** Cameras (graphical); generates go2rtc.yaml. */
  cameras: CameraCfg[];
  /** Everything the box writes at runtime (history, counters) — never the checkout. */
  stateDir: string;
  /** Where the sensor history is recorded (one CSV per month). */
  historyDir: string;
  /**
   * Recording is **off by default**. It is the only thing here that writes to the
   * card continuously, and an installation that wants maximum endurance should not
   * have to discover that it opted in by accident.
   */
  history: HistorySettings;
  /** Speaking up when something is wrong (ntfy). */
  alerts: AlertSettings;
  /** Mobile data allowance and where the counter comes from. */
  data: DataSettings;
  /** Time servers for systemd-timesyncd; empty = distribution default. */
  ntpServers: string[];
  /** Path of the generated go2rtc config. */
  go2rtcConfigPath: string;
  /** Detected H.264 encoder for generated camera sources (set at startup). */
  h264Encoder: string;
  /** Where the persistent config file lives. */
  configPath: string;
  /**
   * The version this gateway is running, read from the repo's package.json at
   * startup. Read rather than hardcoded: it is shown in the banner, in the setup
   * page's header and next to the update check, and three copies of a version
   * string are three chances for them to disagree.
   */
  version: string;
}

/**
 * A HiLink stick is reached by IP, never by interface name — see system/hilink.ts.
 * `proxyPort` null = the stick's own web UI is NOT exposed through the gateway.
 */
export interface HilinkSettings {
  host: string;
  proxyPort: number | null;
}

// The proxy is ON by default: a HiLink stick that can't be configured is a stick you
// have to unplug and carry to a laptop, and every other part of this gateway is
// browser-reachable. It answers 401 when an API secret is set — see hilinkProxy.ts.
export const HILINK_PROXY_PORT = 8081;
export const HILINK_SETTINGS_DEFAULT: HilinkSettings = { host: HILINK_DEFAULT_HOST, proxyPort: HILINK_PROXY_PORT };

export interface HistorySettings {
  enabled: boolean;
  /** How long to keep month files. */
  keepMonths: number;
  /** Minutes between disk writes — the SD-card wear knob. */
  flushMinutes: number;
}

export const HISTORY_DEFAULTS: HistorySettings = { enabled: false, keepMonths: 13, flushMinutes: 5 };

export interface AlertSettings {
  enabled: boolean;
  /** ntfy topic URL, e.g. https://ntfy.sh/your-secret-topic */
  ntfyUrl: string | null;
  /** Bearer token for a private ntfy server. */
  ntfyToken: string | null;
  rules: AlertRule[];
}

export interface DataSettings {
  /** 'hilink' (the stick's own counter) or 'interface' (the kernel's). */
  source: 'hilink' | 'interface';
  /** Which interface to count when source is 'interface'. */
  iface: string;
  /** Monthly allowance in GB; null = no cap, no warning. */
  capGb: number | null;
}

export const DATA_DEFAULTS: DataSettings = { source: 'hilink', iface: 'eth1', capGb: null };

/** The subset the setup UI can edit and persist. */
export interface PersistentConfig {
  siteName?: string;
  videoBaseUrl?: string | null;
  /** @deprecated migrated into `lte.apn`; still read for backward compatibility. */
  apn?: string | null;
  lte?: LteConfig;
  apiSecret?: string | null;
  remoteAccess?: RemoteAccessConfig;
  /** Onboarding hotspot (open by default — see HotspotConfig). */
  hotspot?: HotspotConfig;
  hilink?: HilinkSettings;
  update?: UpdateSource;
  proxies?: ProxyCfg[];
  devices?: KnownDevice[];
  history?: Partial<HistorySettings>;
  alerts?: Partial<AlertSettings>;
  data?: Partial<DataSettings>;
  ntpServers?: string[];
  telemetry?: TelemetryConfig;
  cameras?: CameraCfg[];
  /**
   * Native driver modules installed from the setup UI. Only a record: they live in
   * node_modules, which `install.sh --omit=optional` prunes on every update — the
   * installer reads this list back and reinstalls them, so an update can't quietly
   * turn a configured gateway back into a simulator.
   */
  hardwareDeps?: HwDepName[];
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function publicHost(): string {
  return process.env.YGW_PUBLIC_HOST ?? 'localhost';
}

/** Version from the repo's own package.json; '' when it cannot be read. */
export function readVersion(): string {
  try {
    const pkg = readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8');
    return (JSON.parse(pkg) as { version?: string }).version ?? '';
  } catch {
    return '';
  }
}

export function loadPersisted(path: string): PersistentConfig {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as PersistentConfig;
  } catch {
    /* corrupt or unreadable — ignore, fall back to defaults */
  }
  return {};
}

export function savePersisted(path: string, patch: PersistentConfig): PersistentConfig {
  const merged = { ...loadPersisted(path), ...patch };
  writeFileSync(path, JSON.stringify(merged, null, 2));
  return merged;
}

/** Factory reset: empty the persisted file so the next start uses env/defaults. */
export function resetPersisted(path: string): void {
  writeFileSync(path, JSON.stringify({}, null, 2));
}

export function loadConfig(): GatewayConfig {
  const configPath = process.env.YGW_CONFIG ?? 'yondergate-config.json';
  const stateDir =
    process.env.YGW_STATE_DIR ?? fileURLToPath(new URL('../../../.runtime', import.meta.url));
  const p = loadPersisted(configPath);

  return {
    // Persistent fields: file overrides env-default.
    siteName: p.siteName ?? process.env.YGW_NAME ?? 'YonderGate',
    videoBaseUrl:
      p.videoBaseUrl !== undefined
        ? p.videoBaseUrl
        : process.env.YGW_VIDEO_URL === ''
          ? null
          : process.env.YGW_VIDEO_URL ?? `http://${publicHost()}:1984`,
    // Migrate the old flat `apn` into the richer lte config if present.
    lte: p.lte ?? { apn: p.apn ?? process.env.YGW_APN ?? null },
    apiSecret: (p.apiSecret ?? process.env.YGW_API_SECRET ?? null) || null,
    remoteAccess: p.remoteAccess ?? { kind: 'none' },
    hotspot: p.hotspot ?? { ...HOTSPOT_DEFAULTS },
    hilink: { ...HILINK_SETTINGS_DEFAULT, ...(p.hilink ?? {}) },
    update: { ...UPDATE_SOURCE_DEFAULT, ...(p.update ?? {}) },
    proxies: p.proxies ?? [],
    devices: p.devices ?? [],
    telemetry: p.telemetry ?? {
      enabled: true,
      source: 'sim',
      sampleHz: 10,
      voltages: [{ label: 'Voltage 1', kind: 'sim' }],
      currents: [{ label: 'Current 1', kind: 'sim' }],
      countCapacity: true,
      batteryCapacityMah: null,
      displayMode: 'remaining',
      percentSource: 'clamp',
      chargeSource: 'auto',
    },
    cameras: p.cameras ?? [{ name: 'test', type: 'sim', width: 1280, height: 720, fps: 25 }],
    stateDir,
    historyDir: process.env.YGW_HISTORY_DIR ?? join(stateDir, 'history'),
    history: { ...HISTORY_DEFAULTS, ...(p.history ?? {}) },
    alerts: {
      enabled: p.alerts?.enabled ?? false,
      ntfyUrl: p.alerts?.ntfyUrl ?? null,
      ntfyToken: p.alerts?.ntfyToken ?? null,
      rules: p.alerts?.rules ?? defaultRules(),
    },
    data: { ...DATA_DEFAULTS, ...(p.data ?? {}) },
    ntpServers: p.ntpServers ?? [],
    // Generated from the camera list, so it never belongs in the checkout: a file
    // the service rewrites at every start leaves the repo permanently modified and
    // blocks `git pull --ff-only`. systemd points this at /var/lib on a real box.
    go2rtcConfigPath:
      process.env.YGW_GO2RTC_CONFIG ??
      fileURLToPath(new URL('../../../.runtime/go2rtc.yaml', import.meta.url)),
    version: readVersion(),
    h264Encoder: 'libx264',

    // Env-only fields.
    host: process.env.YGW_HOST ?? '0.0.0.0',
    port: num('YGW_PORT', 8080),
    systemKind: (process.env.YGW_SYSTEM as SystemKind) ?? 'sim',
    configPath,
  };
}
