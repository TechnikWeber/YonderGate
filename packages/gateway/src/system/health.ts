/**
 * Is the box itself healthy?
 *
 * A gateway at a remote site fails in mundane ways long before anything
 * interesting happens: the card fills up, the supply sags, the clock never got
 * set. None of that shows up in a sensor reading, and all of it makes the rest of
 * the page lie — a year of history is worthless if the timestamps came from a
 * machine that booted in 1970.
 *
 * Every reading here is optional. A box without a temperature sensor, without
 * `vcgencmd`, without an RTC is a normal box, not a broken one, so each field is
 * `null` when it cannot be known rather than zero or a guess.
 */

export interface Health {
  /** Free space on the filesystem holding the history, in MB. */
  diskFreeMb: number | null;
  diskUsedPercent: number | null;
  /** SoC temperature in °C. */
  cpuTempC: number | null;
  /** Seconds since boot. */
  uptimeS: number | null;
  /** Load average over 1 minute. */
  load1: number | null;
  /** True when the supply has sagged since boot (Raspberry Pi only). */
  undervoltage: boolean | null;
  /** True when the supply is sagging right now. */
  undervoltageNow: boolean | null;
  /** The firmware is clamping the clock right now (voltage or heat). */
  clockClampedNow: boolean | null;
  /** …and the clamp is a temperature limit, which is a different fix entirely. */
  thermalClampNow: boolean | null;
  /** Is the system clock synchronised, and by what? */
  clockSynced: boolean | null;
  ntpServer: string | null;
  /** Name of a hardware clock, e.g. "rtc-ds3231" — null when there is none. */
  rtc: string | null;
  /** The box's own idea of now, so the page can be checked against your watch. */
  time: string | null;
  timezone: string | null;
  /** Time servers actually configured (ours, or the distribution's default). */
  ntpServers: string[];
  /** Whether the DS3231 overlay is enabled in config.txt (needs a reboot to take). */
  rtcOverlay: boolean | null;
}

export const HEALTH_UNKNOWN: Health = {
  diskFreeMb: null, diskUsedPercent: null, cpuTempC: null, uptimeS: null, load1: null,
  undervoltage: null, undervoltageNow: null, clockClampedNow: null, thermalClampNow: null,
  clockSynced: null, ntpServer: null, rtc: null,
  time: null, timezone: null, ntpServers: [], rtcOverlay: null,
};

/** `df -P -m <path>` → free MB and used percent for that filesystem. */
export function parseDf(out: string): { freeMb: number | null; usedPercent: number | null } {
  const line = (out ?? '').split('\n')[1];
  if (!line) return { freeMb: null, usedPercent: null };
  const cols = line.trim().split(/\s+/);
  const free = Number(cols[3]);
  const used = Number((cols[4] ?? '').replace('%', ''));
  return {
    freeMb: Number.isFinite(free) ? free : null,
    usedPercent: Number.isFinite(used) ? used : null,
  };
}

/**
 * `Number('')` is 0, not NaN — so an unreadable sensor used to read as a healthy
 * 0 °C, an idle 0.00 load and a box that booted this instant. Empty is checked
 * before the conversion in all three.
 */
/** `/sys/class/thermal/thermal_zone0/temp` is millidegrees. */
export function parseCpuTemp(raw: string): number | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const v = Number(text);
  if (!Number.isFinite(v)) return null;
  return Math.round((v / 1000) * 10) / 10;
}

/** `/proc/uptime` → seconds since boot. */
export function parseUptime(raw: string): number | null {
  const first = (raw ?? '').trim().split(/\s+/)[0];
  if (!first) return null;
  const v = Number(first);
  return Number.isFinite(v) ? Math.round(v) : null;
}

/** `/proc/loadavg` → the 1-minute figure. */
export function parseLoad(raw: string): number | null {
  const first = (raw ?? '').trim().split(/\s+/)[0];
  if (!first) return null;
  const v = Number(first);
  return Number.isFinite(v) ? v : null;
}

/**
 * `vcgencmd get_throttled` → `throttled=0x50005`. Bit 0 is under-voltage *now*,
 * bit 16 is under-voltage *since boot* — the second one is what catches a supply
 * that sags only when the LTE stick transmits, which is exactly the failure that
 * corrupts SD cards.
 *
 * Bits 2 and 3 are the *other* reason the firmware clamps the clock: heat. A box in
 * a sealed enclosure in the sun is the normal case for this project, and until now it
 * would have reported "supply ok" while crawling at 600 MHz — the same slow, flaky
 * behaviour as a sagging rail, with a completely different fix. They are read
 * separately so the two can never be confused for one another.
 */
export function parseThrottled(out: string): {
  now: boolean | null;
  since: boolean | null;
  clampedNow: boolean | null;
  hotNow: boolean | null;
} {
  const m = (out ?? '').match(/throttled=0x([0-9a-fA-F]+)/);
  if (!m) return { now: null, since: null, clampedNow: null, hotNow: null };
  const bits = parseInt(m[1], 16);
  return {
    now: (bits & 0x1) !== 0,
    since: (bits & 0x10000) !== 0,
    clampedNow: (bits & 0x4) !== 0,
    hotNow: (bits & 0x8) !== 0,
  };
}

/**
 * Why the clock is being clamped, in words that point at a fix. Heat and voltage look
 * identical from the outside — a slow box — but one wants shade and airflow and the
 * other wants a bigger supply.
 */
export function explainClamp(h: Pick<Health, 'undervoltageNow' | 'undervoltage' | 'thermalClampNow' | 'clockClampedNow'>): string | null {
  if (h.undervoltageNow) {
    return 'The 5 V rail is below spec right now. On an off-grid box that is usually the battery under load, an undersized buck converter, or a long thin run from the panel — measure at the Pi, not at the controller.';
  }
  if (h.thermalClampNow) {
    return 'The Pi is clamping its clock to cool down. A sealed enclosure in the sun does this — shade it, add a vent or a heatsink. Nothing is wrong with the supply.';
  }
  if (h.clockClampedNow) {
    return 'The clock is clamped without a temperature limit, so treat it as a supply problem and measure the rail.';
  }
  if (h.undervoltage) {
    return 'The supply has sagged at least once since boot. It is not sagging this second, but there is no headroom — worth fixing before the box is left alone.';
  }
  return null;
}

/**
 * `timedatectl show` (key=value). A box that has been offline since boot reports
 * `NTPSynchronized=no`, and every timestamp it writes is fiction until that flips.
 */
export function parseTimedatectl(out: string): { synced: boolean | null; ntpEnabled: boolean | null } {
  const map = new Map(
    (out ?? '')
      .split('\n')
      .map((l) => l.split('='))
      .filter((p) => p.length === 2)
      .map(([k, v]) => [k.trim(), v.trim()]),
  );
  const synced = map.get('NTPSynchronized');
  const enabled = map.get('NTP');
  return {
    synced: synced === undefined ? null : synced === 'yes',
    ntpEnabled: enabled === undefined ? null : enabled === 'yes',
  };
}

/** `timedatectl timesync-status` → the server actually in use. */
export function parseTimesyncServer(out: string): string | null {
  const m = (out ?? '').match(/Server:\s*([^\s(]+)/);
  return m ? m[1] : null;
}

/** NTP servers accepted for systemd-timesyncd: hostnames or addresses, no shell metacharacters. */
export function parseNtpServers(input: string): string[] {
  return (input ?? '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    // Hostname- or address-shaped only, and it may not start or end in punctuation:
    // this value is written into a config file that a system service then reads.
    .filter((s) => /^[A-Za-z0-9]([A-Za-z0-9.:_-]*[A-Za-z0-9])?$/.test(s))
    .slice(0, 5);
}

/** The drop-in systemd-timesyncd reads. Empty list = back to the distribution default. */
export const TIMESYNCD_CONF_PATH = '/etc/systemd/timesyncd.conf.d/99-yondergate.conf';
export function timesyncdConf(servers: string[]): string {
  return `[Time]\nNTP=${servers.join(' ')}\n`;
}

/** `timedatectl show` → the configured timezone. */
export function parseTimezone(out: string): string | null {
  const m = (out ?? '').match(/^Timezone=(.+)$/m);
  return m ? m[1].trim() : null;
}

/** Region/City, as `timedatectl list-timezones` prints them. */
export function isTimezone(tz: unknown): tz is string {
  return typeof tz === 'string' && /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){1,2}$/.test(tz.trim());
}

/** Servers from a timesyncd config file (ours or the distribution's). */
export function parseTimesyncdConf(text: string): string[] {
  const m = (text ?? '').match(/^\s*NTP=(.*)$/m);
  return m ? parseNtpServers(m[1]) : [];
}

/** Fallback servers systemd-timesyncd uses when nothing else is configured. */
export function parseFallbackNtp(text: string): string[] {
  const m = (text ?? '').match(/^\s*#?\s*FallbackNTP=(.*)$/m);
  return m ? parseNtpServers(m[1]) : [];
}

/**
 * The DS3231 line for `/boot/firmware/config.txt`.
 *
 * Fitting the clock should be a plug and a checkbox, not an SSH session — so the
 * gateway edits this file itself. It is idempotent in both directions and touches
 * nothing else in a file that also decides whether the Pi boots at all.
 */
export const RTC_OVERLAY = 'dtoverlay=i2c-rtc,ds3231';

/** The comment we write above the overlay, removed with it so it cannot pile up. */
const RTC_MARKER = '# YonderGate: hardware clock, so the site keeps time without a network';

export function configTxtWithRtc(text: string, enabled: boolean): string {
  const without = (text ?? '')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return t !== RTC_OVERLAY && t !== `#${RTC_OVERLAY}` && t !== RTC_MARKER;
    })
    .join('\n')
    .replace(/\n+$/, '');
  return enabled ? `${without}\n\n${RTC_MARKER}\n${RTC_OVERLAY}\n` : `${without}\n`;
}

export function configTxtHasRtc(text: string): boolean {
  return (text ?? '').split('\n').some((l) => l.trim() === RTC_OVERLAY);
}

export interface NetInterface {
  name: string;
  addresses: string[];
  up: boolean;
}

/**
 * Interfaces to choose from, so nobody has to know that their WiFi is called
 * `wlp59s0`. Built from `ip -o link` (everything, including the ones with no
 * address yet) plus `ip -o -f inet addr` for the addresses.
 */
export function parseInterfaces(linkOut: string, addrOut: string): NetInterface[] {
  const addrs = new Map<string, string[]>();
  for (const line of (addrOut ?? '').split('\n')) {
    const m = line.match(/^\d+:\s+(\S+)\s+inet\s+(\d+\.\d+\.\d+\.\d+)\/\d+/);
    if (!m) continue;
    addrs.set(m[1], [...(addrs.get(m[1]) ?? []), m[2]]);
  }
  const out: NetInterface[] = [];
  for (const line of (linkOut ?? '').split('\n')) {
    const m = line.match(/^\d+:\s+([^:@]+)[:@]/);
    if (!m) continue;
    const name = m[1].trim();
    if (name === 'lo') continue;
    out.push({ name, addresses: addrs.get(name) ?? [], up: /state UP/.test(line) || /[<,]UP[,>]/.test(line) });
  }
  return out;
}
