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
  /** Is the system clock synchronised, and by what? */
  clockSynced: boolean | null;
  ntpServer: string | null;
  /** Name of a hardware clock, e.g. "rtc-ds3231" — null when there is none. */
  rtc: string | null;
}

export const HEALTH_UNKNOWN: Health = {
  diskFreeMb: null, diskUsedPercent: null, cpuTempC: null, uptimeS: null, load1: null,
  undervoltage: null, undervoltageNow: null, clockSynced: null, ntpServer: null, rtc: null,
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

/** `/sys/class/thermal/thermal_zone0/temp` is millidegrees. */
export function parseCpuTemp(raw: string): number | null {
  const v = Number((raw ?? '').trim());
  if (!Number.isFinite(v)) return null;
  return Math.round((v / 1000) * 10) / 10;
}

/** `/proc/uptime` → seconds since boot. */
export function parseUptime(raw: string): number | null {
  const v = Number((raw ?? '').trim().split(/\s+/)[0]);
  return Number.isFinite(v) ? Math.round(v) : null;
}

/** `/proc/loadavg` → the 1-minute figure. */
export function parseLoad(raw: string): number | null {
  const v = Number((raw ?? '').trim().split(/\s+/)[0]);
  return Number.isFinite(v) ? v : null;
}

/**
 * `vcgencmd get_throttled` → `throttled=0x50005`. Bit 0 is under-voltage *now*,
 * bit 16 is under-voltage *since boot* — the second one is what catches a supply
 * that sags only when the LTE stick transmits, which is exactly the failure that
 * corrupts SD cards.
 */
export function parseThrottled(out: string): { now: boolean | null; since: boolean | null } {
  const m = (out ?? '').match(/throttled=0x([0-9a-fA-F]+)/);
  if (!m) return { now: null, since: null };
  const bits = parseInt(m[1], 16);
  return { now: (bits & 0x1) !== 0, since: (bits & 0x10000) !== 0 };
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
