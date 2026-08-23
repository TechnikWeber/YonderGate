import { hostname } from 'node:os';
import type {
  ActionResult,
  ScanResult,
  SubnetRouteState,
  HotspotResult,
  UpdateResult,
  HwDepInstallResult,
  HwDepStatus,
  LteConfig,
  LtePinChange,
  LteStatus,
  RemoteAccessConfig,
  RemoteAccessStatus,
  SystemManager,
  SystemStatus,
  TailscaleStatus,
  WifiStatus,
  WifiNetwork,
  HotspotConfig,
  CameraModuleStatus,
} from './SystemManager.js';
import { HW_DEPS, isHwDep, type HwDepName } from './hwDeps.js';
import {
  applyCameraModule,
  moduleById,
  moduleIdFor,
  parseBootConfig,
  validOverlayName,
  bootedStateChanged,
} from './bootConfig.js';
import { HOTSPOT_ADDRESS, isCountryCode, radioIsUsable, type WifiRadioStatus } from './wifi.js';
import { type HilinkStatus } from './hilink.js';
import { classifyChanges, describeCheck, type UpdateCheck } from './update.js';
import type { WatchdogAction } from './watchdog.js';
import { switchUrl, type PowerSwitch } from './power.js';
import { HEALTH_UNKNOWN, isTimezone, parseInterfaces, type Health, type NetInterface } from './health.js';
import { mergeDevices, mergeKnown, parseIpNeigh, parseSubnets, routableSubnets, type KnownDevice } from './discovery.js';

/**
 * Mock system: pretends to have an LTE modem and Tailscale so the entire setup
 * flow can be exercised without a Pi. State transitions mimic the real thing
 * (connect → connected, tailscale up → login URL then running).
 */
export class SimSystem implements SystemManager {
  readonly kind = 'sim';
  private lte: LteStatus = {
    kind: 'modemmanager',
    present: true,
    connected: false,
    operator: 'SimTel',
    signal: 68,
    apn: null,
    iface: 'wwan0',
    ip: null,
    state: 'registered',
    modemModel: 'SimModem LTE-1',
    pinRequired: false,
  };
  private tailscale: TailscaleStatus = {
    installed: true,
    running: false,
    ip: null,
    loginUrl: null,
    backendState: 'Stopped',
  };
  private wifi: WifiStatus = { mode: 'ap', ssid: 'YonderGate-setup', ip: '192.168.4.1' };
  /** Mock neighbourhood, so the WiFi panel is fully usable without a Pi. */
  private networks: WifiNetwork[] = [
    { ssid: 'Weber-Home', signal: 88, secured: true, active: false },
    { ssid: 'Weber-Home-5G', signal: 74, secured: true, active: false },
    { ssid: 'FRITZ!Box 7590', signal: 51, secured: true, active: false },
    { ssid: 'Gastnetz', signal: 33, secured: false, active: false },
  ];

  async status(): Promise<SystemStatus> {
    return {
      kind: this.kind,
      hostname: hostname(),
      tailscale: { ...this.tailscale },
      lte: { ...this.lte },
      wifi: { ...this.wifi },
    };
  }

  async wifiScan(): Promise<WifiNetwork[]> {
    return this.networks.map((n) => ({ ...n, active: n.ssid === this.wifi.ssid && this.wifi.mode === 'client' }));
  }

  async wifiConnect(ssid: string, password: string | null): Promise<ActionResult> {
    const net = this.networks.find((n) => n.ssid === ssid);
    if (net?.secured && !password) {
      return { ok: false, message: `"${ssid}" needs a password.` };
    }
    this.wifi = { mode: 'client', ssid, ip: '192.168.178.42' };
    return { ok: true, message: `Connected to "${ssid}" — 192.168.178.42 (simulated). The hotspot is closing.` };
  }

  /** Mock radio: healthy, but "enable" still works so the UI flow is exercisable. */
  private radio: WifiRadioStatus = {
    device: 'ready',
    softBlocked: false,
    hardBlocked: false,
    country: 'DE',
    suggestedCountry: 'DE',
  };

  /** Kept only so the sim honours the same interface as the real system. */
  setHilinkHost(_host: string): void {}

  /** A plausible stick, so the panel and the status page label can be seen without hardware. */
  async hilinkStatus(_opts: { force?: boolean } = {}): Promise<HilinkStatus> {
    return {
      present: true,
      iface: 'eth1',
      connected: true,
      state: 'connected',
      networkType: '4G (LTE)',
      operator: 'SimTel',
      signalPercent: 72,
      rsrp: -93,
      rsrq: -9,
      sinr: 12,
      model: 'E3372h-320 (simulated)',
      wanIp: '10.64.12.34',
      message: null,
    };
  }

  async wifiRadio(): Promise<WifiRadioStatus> {
    return { ...this.radio };
  }

  async wifiRadioEnable(country?: string | null): Promise<ActionResult & { radio: WifiRadioStatus }> {
    if (country != null && country !== '' && !isCountryCode(country)) {
      return { ok: false, message: `"${country}" is not a two-letter country code.`, radio: { ...this.radio } };
    }
    if (country) this.radio.country = country.toUpperCase();
    this.radio = { ...this.radio, device: 'ready', softBlocked: false, hardBlocked: false };
    return { ok: true, message: `WiFi radio enabled${country ? `, country ${this.radio.country}` : ''} (simulated).`, radio: { ...this.radio } };
  }

  async hotspotStart(cfg: HotspotConfig): Promise<HotspotResult> {
    if (!radioIsUsable(this.radio)) {
      return { ok: false, message: 'Hotspot not started — the WiFi radio is blocked (simulated).', fix: 'Press “Enable WiFi radio”.', radio: { ...this.radio } };
    }
    this.wifi = { mode: 'ap', ssid: cfg.ssid, ip: HOTSPOT_ADDRESS };
    const psk = cfg.password && cfg.password.length >= 8 ? cfg.password : null;
    return {
      ok: true,
      message: `Hotspot "${cfg.ssid}" is up (${psk ? `WPA2, key ${psk}` : 'open'}) — join it and open http://${HOTSPOT_ADDRESS}:8080/ (simulated).`,
      psk,
      radio: { ...this.radio },
    };
  }

  async syncCaptivePortal(): Promise<{ changed: boolean; captive: boolean; message: string }> {
    return { changed: false, captive: false, message: 'unchanged' };
  }

  async hotspotStop(): Promise<ActionResult> {
    this.wifi = { mode: 'unknown', ssid: null, ip: null };
    return { ok: true, message: 'Hotspot stopped (simulated).' };
  }

  async lteConnect(cfg: LteConfig): Promise<ActionResult> {
    const apn = cfg.apn ?? '';
    this.lte = { ...this.lte, connected: true, apn, ip: '10.64.12.34', state: 'connected' };
    this.wifi = { mode: 'client', ssid: null, ip: null };
    const extra = `${cfg.username ? ' (with auth)' : ''}${cfg.networkMode && cfg.networkMode !== 'auto' ? ` [${cfg.networkMode}]` : ''}${cfg.allowRoaming === false ? ' [home-only]' : ''}`;
    return { ok: true, message: `LTE connected on APN "${apn}"${extra} (simulated).` };
  }

  async lteDisconnect(): Promise<ActionResult> {
    this.lte = { ...this.lte, connected: false, ip: null, state: 'registered' };
    return { ok: true, message: 'LTE disconnected (simulated).' };
  }

  async lteSetPin(change: LtePinChange): Promise<ActionResult> {
    return { ok: true, message: change.action === 'disable' ? 'SIM PIN lock removed (simulated).' : 'SIM PIN changed (simulated).' };
  }

  async lteDiagnostics(): Promise<{ ok: boolean; output: string }> {
    return {
      ok: true,
      output: [
        'mmcli -L:',
        '    /org/freedesktop/ModemManager1/Modem/0 [SimModem] LTE-1',
        '',
        'mmcli -m 0:',
        '  Hardware |          model: SimModem LTE-1',
        '  Status   |          state: connected',
        '           | signal quality: 68% (recent)',
        '  3GPP     |  operator name: SimTel',
      ].join('\n'),
    };
  }

  async tailscaleUp(authKey?: string): Promise<ActionResult> {
    if (authKey) {
      this.tailscale = {
        installed: true,
        running: true,
        ip: '100.101.102.103',
        loginUrl: null,
        backendState: 'Running',
      };
      return { ok: true, message: 'Tailscale up with auth key (simulated).' };
    }
    // Interactive: hand back a login URL; a real user would open it.
    const loginUrl = 'https://login.tailscale.com/a/simulated1234';
    this.tailscale = { ...this.tailscale, loginUrl, backendState: 'NeedsLogin' };
    // Simulate the user completing login shortly after.
    setTimeout(() => {
      this.tailscale = {
        installed: true,
        running: true,
        ip: '100.101.102.103',
        loginUrl: null,
        backendState: 'Running',
      };
    }, 4000);
    return { ok: true, message: 'Open the login URL to finish (simulated).', loginUrl };
  }

  async tailscaleDown(): Promise<ActionResult> {
    this.tailscale = { installed: true, running: false, ip: null, loginUrl: null, backendState: 'Stopped' };
    return { ok: true, message: 'Tailscale stopped (simulated).' };
  }

  // --- generic remote access (mock) ---
  private remote: RemoteAccessStatus = { kind: 'none', running: false, address: null, detail: 'off' };

  async remoteUp(cfg: RemoteAccessConfig): Promise<ActionResult> {
    if (cfg.kind === 'tailscale') {
      const r = await this.tailscaleUp(cfg.tailscaleAuthKey ?? undefined);
      this.remote = { kind: 'tailscale', running: this.tailscale.running, address: this.tailscale.ip, detail: this.tailscale.backendState, loginUrl: r.loginUrl ?? null };
      return r;
    }
    if (cfg.kind === 'zerotier') {
      if (!cfg.zerotierNetworkId) return { ok: false, message: 'ZeroTier network ID required.' };
      this.remote = { kind: 'zerotier', running: true, address: '10.147.20.42', detail: `joined ${cfg.zerotierNetworkId}`, loginUrl: null };
      return { ok: true, message: `Joined ZeroTier network ${cfg.zerotierNetworkId} (simulated).` };
    }
    if (cfg.kind === 'wireguard') {
      if (!cfg.wireguardConf) return { ok: false, message: 'Upload a WireGuard .conf first.' };
      this.remote = { kind: 'wireguard', running: true, address: '192.168.178.120', detail: 'handshake ok', loginUrl: null };
      return { ok: true, message: 'WireGuard up (simulated).' };
    }
    this.remote = { kind: 'none', running: false, address: null, detail: 'off' };
    return { ok: true, message: 'Remote access off.' };
  }

  async remoteDown(cfg: RemoteAccessConfig): Promise<ActionResult> {
    if (cfg.kind === 'tailscale') await this.tailscaleDown();
    this.remote = { kind: cfg.kind, running: false, address: null, detail: 'stopped' };
    return { ok: true, message: 'Remote access stopped (simulated).' };
  }

  async remoteStatus(cfg: RemoteAccessConfig): Promise<RemoteAccessStatus> {
    if (cfg.kind === 'tailscale') {
      return { kind: 'tailscale', running: this.tailscale.running, address: this.tailscale.ip, detail: this.tailscale.backendState, loginUrl: this.tailscale.loginUrl };
    }
    // Reflect the last mock action if it matches the requested kind, else "off".
    return this.remote.kind === cfg.kind ? { ...this.remote } : { kind: cfg.kind, running: false, address: null, detail: 'off' };
  }

  async linkSignal() {
    if (this.lte.connected && this.lte.signal != null) {
      return { kind: 'lte' as const, quality: this.lte.signal, label: `LTE ${this.lte.signal}%` };
    }
    return { kind: 'wifi' as const, quality: 82, label: 'WiFi −52 dBm' };
  }

  async detectHardware() {
    return {
      i2c: [
        { address: '0x40', hint: 'INA2xx current sensor (219/226/228/237/238) — or a PCA9685' },
        { address: '0x41', hint: 'INA2xx current sensor (219/226/228/237/238/3221)' },
      ],
      modemPresent: this.lte.present,
      cameras: ['/dev/video0 (simulated)'],
      serial: ['/dev/ttyAMA0 (simulated)'],
      notes: ['Simulated detection — real probe runs on the Pi.'],
    };
  }

  /** Mock state: nothing installed until the setup UI "installs" it. */
  private installedDeps = new Set<HwDepName>();

  async hwDeps(): Promise<HwDepStatus[]> {
    return HW_DEPS.map((d) => ({
      name: d.name,
      installed: this.installedDeps.has(d.name),
      version: this.installedDeps.has(d.name) ? '0.0.0-sim' : null,
      needFor: d.needFor,
    }));
  }

  /** Simulated install — always succeeds; the real failure paths live in hwDeps.ts. */
  async hwDepInstall(name: HwDepName): Promise<HwDepInstallResult> {
    if (!isHwDep(name)) return { ok: false, message: `Refused: "${String(name)}" is not a known driver module.`, output: '' };
    this.installedDeps.add(name);
    return {
      ok: true,
      message: `${name} installed (simulated) — restart the gateway service to use it.`,
      output: `added 1 package in 12s (simulated)`,
      restartRequired: true,
    };
  }

  async restartService(): Promise<ActionResult> {
    return { ok: true, message: 'Gateway service restart requested (simulated — no-op).' };
  }

  /** A pretend update, so the panel and both outcomes can be tried without a Pi. */
  private simBehind = 2;



  /** A healthy-looking box, with one deliberate wart so the warnings are visible. */
  async health(): Promise<Health> {
    return {
      ...HEALTH_UNKNOWN,
      diskFreeMb: 11_800,
      diskUsedPercent: 23,
      cpuTempC: 47.2,
      uptimeS: 86_400 * 3 + 3600,
      load1: 0.12,
      undervoltage: true, // seen once since boot — the classic Pi + LTE stick symptom
      undervoltageNow: false,
      clockSynced: true,
      ntpServer: 'time.cloudflare.com',
      rtc: this.rtcOverlay ? 'rtc-ds3231' : null,
      time: new Date().toISOString(),
      timezone: 'Europe/Berlin',
      ntpServers: this.ntpServers.length ? this.ntpServers : ['0.debian.pool.ntp.org', '1.debian.pool.ntp.org'],
      rtcOverlay: this.rtcOverlay,
    };
  }

  private rtcOverlay = false;
  private ntpServers: string[] = [];

  async setSwitch(sw: PowerSwitch, action: 'on' | 'off' | 'cycle'): Promise<ActionResult> {
    const where = sw.kind === 'gpio' ? `GPIO ${sw.pin}` : switchUrl(sw, action !== 'off') ?? 'nowhere';
    return { ok: true, message: `${sw.label}: ${action} via ${where} (simulated).` };
  }

  private hwWatchdog = 0;
  async setHardwareWatchdog(enabled: boolean): Promise<ActionResult> {
    this.hwWatchdog = enabled ? 15 : 0;
    return { ok: true, message: enabled ? 'Hardware watchdog on (simulated).' : 'Hardware watchdog off (simulated).' };
  }

  async hardwareWatchdogSeconds(): Promise<number | null> {
    return this.hwWatchdog;
  }

  /** The simulated site is always reachable, so the watchdog stays quiet. */
  async reachable(): Promise<boolean> {
    return true;
  }

  async recover(action: WatchdogAction): Promise<ActionResult> {
    return { ok: true, message: `Would ${action} (simulated).` };
  }

  async setTimezone(tz: string): Promise<ActionResult> {
    return isTimezone(tz)
      ? { ok: true, message: `Timezone set to ${tz} (simulated).` }
      : { ok: false, message: `"${tz}" is not a timezone like Europe/Berlin.` };
  }

  async setRtcOverlay(enabled: boolean): Promise<ActionResult> {
    this.rtcOverlay = enabled;
    return { ok: true, message: enabled ? 'Hardware clock enabled — reboot to load it (simulated).' : 'Hardware clock disabled (simulated).' };
  }

  async interfaces(): Promise<NetInterface[]> {
    return parseInterfaces(
      '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP\n3: wlan0: <BROADCAST,MULTICAST,UP> mtu 1500 state UP\n4: eth1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP\n',
      '2: eth0    inet 192.168.178.42/24 brd 192.168.178.255 scope global eth0\n3: wlan0    inet 192.168.4.1/24 brd 192.168.4.255 scope global wlan0\n4: eth1    inet 192.168.8.100/24 brd 192.168.8.255 scope global eth1\n',
    );
  }

  async setNtpServers(servers: string[]): Promise<ActionResult> {
    this.ntpServers = servers;
    return { ok: true, message: servers.length ? `Time servers set to ${servers.join(', ')} (simulated).` : 'Back to the default time servers (simulated).' };
  }

  private simCounter = 4.2e9;
  async dataCounter(): Promise<number | null> {
    // Creeps upwards like a real counter, so the monthly total actually moves.
    this.simCounter += 12e6;
    return this.simCounter;
  }

  async probeDevices(devices: KnownDevice[]): Promise<Record<string, boolean>> {
    // Everything answers except a device explicitly named to be missing, so the
    // "device is gone" alert can be tried without unplugging anything.
    return Object.fromEntries(devices.map((d) => [d.id, !/offline|missing/i.test(d.label)]));
  }

  /**
   * A plausible site: the router upstream, a camera and a sensor on the AP, plus a
   * laptop that answers nothing. Enough to exercise the list, the links and the
   * proxy buttons without a network.
   */
  async scanNetwork(opts: { active?: boolean; known?: KnownDevice[] } = {}): Promise<ScanResult> {
    const subnets = parseSubnets(
      [
        '2: eth0    inet 192.168.178.42/24 brd 192.168.178.255 scope global eth0\\       valid_lft forever',
        '3: wlan0    inet 192.168.4.1/24 brd 192.168.4.255 scope global wlan0\\       valid_lft forever',
      ].join('\n'),
    );
    const neighbours = parseIpNeigh(
      [
        '192.168.178.1 dev eth0 lladdr 3c:a6:2f:11:22:33 REACHABLE',
        '192.168.4.23 dev wlan0 lladdr ec:71:db:aa:bb:cc REACHABLE',
        '192.168.4.45 dev wlan0 lladdr 98:da:c4:de:ad:be STALE',
        '192.168.4.77 dev wlan0 lladdr 00:11:22:33:44:55 REACHABLE',
      ].join('\n'),
    );
    const devices = mergeDevices([...neighbours, ...subnets.map((n) => ({ ip: n.address, mac: null, iface: n.iface, state: 'SELF' }))], {
      selfAddresses: subnets.map((n) => n.address),
      hostnames: { '192.168.178.1': 'fritz.box', '192.168.4.23': 'cam-shed', '192.168.4.45': 'shelly-pv' },
      ports: {
        '192.168.178.1': [80, 443],
        '192.168.4.23': [80, 554],
        '192.168.4.45': [80],
        '192.168.4.77': [],
        '192.168.4.1': [80],
        '192.168.178.42': [80],
      },
    });
    return {
      subnets,
      devices: mergeKnown(devices, opts.known ?? []),
      active: !!opts.active,
      notes: ['Simulated network — the real scan runs on the Pi.'],
    };
  }

  private routes: string[] = [];

  async subnetRoutes(): Promise<SubnetRouteState> {
    const { subnets } = await this.scanNetwork();
    return { available: routableSubnets(subnets), advertised: [...this.routes], approved: [...this.routes], forwarding: this.routes.length > 0 };
  }

  async setSubnetRoutes(cidrs: string[]): Promise<ActionResult & { state: SubnetRouteState }> {
    this.routes = [...cidrs];
    return {
      ok: true,
      message: cidrs.length ? `Advertising ${cidrs.join(', ')} (simulated).` : 'Stopped advertising subnet routes (simulated).',
      state: await this.subnetRoutes(),
    };
  }

  async updateCheck(_src?: unknown): Promise<UpdateCheck> {
    const impact = classifyChanges(this.simBehind ? ['packages/gateway/src/index.ts', 'packages/ground/src/App.tsx'] : []);
    const base = {
      ok: true,
      current: '1.0.0-sim',
      available: this.simBehind ? '1.0.1-sim' : '1.0.0-sim',
      behind: this.simBehind,
      commits: this.simBehind
        ? [
            { hash: 'a1b2c3d', subject: 'v1.0.1-sim — simulated change' },
            { hash: 'e4f5a6b', subject: 'docs: simulated note' },
          ].slice(0, this.simBehind)
        : [],
      impact,
      tree: { clean: true, dirty: [], generated: [] },
      conflicts: [],
    };
    return { ...base, ...describeCheck(base) };
  }

  async updateApply(_src?: unknown, _hardwareDeps?: string[]): Promise<UpdateResult> {
    if (!this.simBehind) return { ok: true, message: 'Up to date (simulated).', output: '', steps: [] };
    this.simBehind = 0;
    return {
      ok: true,
      message: 'Updated to v1.0.1-sim — restarting now (simulated).',
      output: '$ git pull --ff-only origin main\nFast-forward (simulated)',
      steps: [
        { label: 'Fetching and applying the update', ok: true },
        { label: 'Rebuilding the control app', ok: true },
      ],
      restarting: true,
    };
  }

  /**
   * A config.txt the simulator can edit, so the camera-module panel is fully usable
   * without a Pi — including the "reboot required" state, which clears on a simulated
   * reboot the same way a real one clears it.
   */
  private bootConfig = ['# Simulated Raspberry Pi firmware config', 'camera_auto_detect=1', ''].join('\n');
  /** What the simulated system "booted" with — a simulated reboot catches this up. */
  private bootedConfig = this.bootConfig;

  async cameraModule(): Promise<CameraModuleStatus> {
    const state = parseBootConfig(this.bootConfig);
    return {
      available: true,
      configPath: '(simulated) /boot/firmware/config.txt',
      moduleId: moduleIdFor(state),
      overlay: state.overlay,
      autoDetect: state.autoDetect,
      rebootRequired: bootedStateChanged(parseBootConfig(this.bootedConfig), state),
      message: null,
    };
  }

  async setCameraModule(id: string, customOverlay?: string | null): Promise<ActionResult & { rebootRequired: boolean }> {
    const mod = moduleById(id);
    if (!mod) return { ok: false, message: `Unknown camera module "${id}".`, rebootRequired: false };
    let overlay = mod.overlay;
    if (id === 'custom') {
      // Same syntax gate as the real system — an unvalidated name would be a genuine
      // config.txt injection there, so the simulator must not pretend it is fine.
      const want = (customOverlay ?? '').trim();
      if (!validOverlayName(want)) {
        return { ok: false, message: `"${want}" is not a valid overlay name.`, rebootRequired: (await this.cameraModule()).rebootRequired };
      }
      overlay = want;
    }
    this.bootConfig = applyCameraModule(this.bootConfig, overlay);
    const pending = (await this.cameraModule()).rebootRequired;
    return {
      ok: true,
      message: pending
        ? `${mod.label} selected (simulated). Reboot to apply.`
        : `${mod.label} selected — that is what the Pi already booted with, so no reboot is needed.`,
      rebootRequired: pending,
    };
  }

  async reboot(): Promise<ActionResult> {
    this.bootedConfig = this.bootConfig;
    return { ok: true, message: 'Reboot requested (simulated — no-op).' };
  }
}
