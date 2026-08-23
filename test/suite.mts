/**
 * YonderGate test suite — run with `npm test` (tsx). Consolidates the checks we
 * built incrementally into one repeatable run so future hardware tweaks can't
 * silently regress the safety-critical logic.
 */
import * as C from '../packages/gateway/src/sensors/convert';
import { TelemetryService } from '../packages/gateway/src/sensors/TelemetryService';
import { cameraSource } from '../packages/gateway/src/video/cameraManager';
import type { TelemetryConfig, CameraCfg } from '@yondergate/protocol';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

let pass = 0;
let fail = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, extra = '') => {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`${name} ${extra}`);
  }
};
const near = (a: number, b: number, t = 1e-6) => Math.abs(a - b) < t;

async function main() {
  // ---- device discovery: parsing, subnet maths, vendor lookup ----
  const D = await import('../packages/gateway/src/system/discovery');
  const subnets = D.parseSubnets([
    '1: lo    inet 127.0.0.1/8 scope host lo\\       valid_lft forever',
    '2: eth0    inet 192.168.178.42/24 brd 192.168.178.255 scope global eth0\\       valid_lft forever',
    '3: wlan0    inet 192.168.4.1/24 brd 192.168.4.255 scope global wlan0\\       valid_lft forever',
  ].join('\n'));
  ok('subnets parsed, loopback dropped', subnets.length === 2 && !subnets.some((n) => n.iface === 'lo'));
  // Found by running it on a laptop: the VPN's own /32 was offered as a network to
  // advertise. Routing the tailnet back into the tailnet is a loop, not a route.
  const withVpn = D.parseSubnets([
    '2: eth0    inet 192.168.178.42/24 scope global eth0\\       valid_lft forever',
    '5: tailscale0    inet 100.114.166.118/32 scope global tailscale0\\       valid_lft forever',
    '6: wg0    inet 10.9.0.2/32 scope global wg0\\       valid_lft forever',
  ].join('\n'));
  ok('the VPN interfaces are not networks of ours', withVpn.length === 1 && withVpn[0].iface === 'eth0');
  ok('a single-address network is not offered as a route', D.routableSubnets([
    { iface: 'x', address: '10.0.0.1', prefix: 32, cidr: '10.0.0.1/32' },
    { iface: 'y', address: '192.168.4.1', prefix: 24, cidr: '192.168.4.0/24' },
  ]).length === 1);
  ok('network address derived', subnets[0].cidr === '192.168.178.0/24' && subnets[1].cidr === '192.168.4.0/24');
  ok('gateway address kept', subnets[1].address === '192.168.4.1');

  const sweep = D.sweepTargets(subnets[1]);
  ok('a /24 sweeps 253 hosts (no network, broadcast or self)', sweep.targets.length === 253 && !sweep.targets.includes('192.168.4.1'));
  ok('and never the network or broadcast address', !sweep.targets.includes('192.168.4.0') && !sweep.targets.includes('192.168.4.255'));
  // A /16 is 65k pings — that is not a scan, it is a nuisance. It must be refused
  // with a reason rather than silently truncated.
  const huge = D.sweepTargets({ iface: 'eth0', address: '10.0.0.5', prefix: 16, cidr: '10.0.0.0/16' });
  ok('an oversized subnet is refused, with a reason', huge.targets.length === 0 && (huge.skipped || '').includes('too large'));

  const neigh = D.parseIpNeigh([
    '192.168.4.23 dev wlan0 lladdr ec:71:db:aa:bb:cc REACHABLE',
    '192.168.4.45 dev wlan0 lladdr 98:da:c4:de:ad:be STALE',
    '192.168.4.99 dev wlan0  FAILED',
    '192.168.4.98 dev wlan0 lladdr 00:00:00:00:00:00 INCOMPLETE',
    'fe80::1 dev wlan0 lladdr aa:bb:cc:dd:ee:ff router REACHABLE',
  ].join('\n'));
  ok('neighbours parsed', neigh.length === 2 && neigh[0].ip === '192.168.4.23');
  // FAILED means the kernel remembers something did NOT answer — the opposite of a find.
  ok('failed and incomplete entries are not devices', !neigh.some((n) => ['192.168.4.99', '192.168.4.98'].includes(n.ip)));
  ok('macs normalised to lowercase', neigh[0].mac === 'ec:71:db:aa:bb:cc');

  ok('known vendor recognised', D.macVendor('b8:27:eb:11:22:33') === 'Raspberry Pi' && D.macVendor('3c:a6:2f:00:00:01') === 'AVM (FritzBox)');
  ok('an unknown prefix stays unknown, never a guess', D.macVendor('12:34:56:78:9a:bc') === null && D.macVendor(null) === null);

  const devs = D.mergeDevices(neigh, {
    selfAddresses: ['192.168.4.1'],
    hostnames: { '192.168.4.23': 'cam-shed' },
    ports: { '192.168.4.23': [80, 554], '192.168.4.45': [] },
  });
  ok('devices merged and sorted by address', devs.length === 2 && devs[0].ip === '192.168.4.23');
  ok('hostname and vendor attached', devs[0].hostname === 'cam-shed' && devs[0].vendor === 'Reolink');
  ok('a web UI is offered when something answers on 80', D.deviceUrl(devs[0]) === 'http://192.168.4.23/');
  ok('nothing is offered when no web port answered', D.deviceUrl(devs[1]) === null);
  ok('RTSP reads as a camera, phrased as a guess', D.describeDevice(devs[0]).includes('looks like a camera'));
  ok('a silent device says so honestly', D.describeDevice(devs[1]).includes('no open ports'));

  // ---- named devices survive a scan (and a DHCP lease) ----
  // Keyed by MAC, because addresses move: a camera that comes back on a different
  // address is still the camera you named.
  ok('mac wins as the key', D.deviceKey({ mac: 'AA:BB:CC:11:22:33', ip: '192.168.4.9' }) === 'mac:aa:bb:cc:11:22:33');
  ok('no mac falls back to the address', D.deviceKey({ mac: null, ip: '192.168.4.9' }) === 'ip:192.168.4.9');

  const knownList = [
    { id: 'mac:ec:71:db:aa:bb:cc', label: 'shed camera', mac: 'ec:71:db:aa:bb:cc', ip: '192.168.4.23', port: 8080, lastSeen: '2026-08-01T10:00:00.000Z' },
    { id: 'mac:98:da:c4:de:ad:be', label: 'pv meter', mac: '98:da:c4:de:ad:be', ip: '192.168.4.45', port: 80, lastSeen: '2026-08-01T10:00:00.000Z' },
  ];
  const foundNow = D.mergeDevices(
    D.parseIpNeigh('192.168.4.99 dev wlan0 lladdr ec:71:db:aa:bb:cc REACHABLE'),
    { selfAddresses: [], ports: { '192.168.4.99': [8080] } },
  );
  const merged = D.mergeKnown(foundNow, knownList, '2026-08-21T18:00:00.000Z');
  const knownCam = merged.find((d) => d.mac === 'ec:71:db:aa:bb:cc');
  ok('a saved device keeps its name across a new address', knownCam?.label === 'shed camera' && knownCam?.ip === '192.168.4.99');
  ok('and its configured port, not just 80', knownCam?.port === 8080);
  // The whole reason to save a device: being told when it stops answering.
  const gone = merged.find((d) => d.label === 'pv meter');
  ok('a saved device that did not answer is still listed', !!gone && gone.seen === false);
  ok('with the time it was last seen', gone?.lastSeen === '2026-08-01T10:00:00.000Z');
  ok('while the one that answered is marked seen', knownCam?.seen === true && knownCam?.known === true);

  const rolled = D.updateKnown(knownList, foundNow, '2026-08-21T18:00:00.000Z');
  ok('a scan moves the saved address along', rolled[0].ip === '192.168.4.99' && rolled[0].lastSeen === '2026-08-21T18:00:00.000Z');
  ok('and leaves the silent one untouched', rolled[1].ip === '192.168.4.45' && rolled[1].lastSeen === '2026-08-01T10:00:00.000Z');

  // ---- subnet routes: the native way through to those devices ----
  const TS = await import('../packages/gateway/src/system/tailscale');
  ok('routes are advertised as one list', TS.advertiseRoutesArgs(['192.168.4.0/24', '192.168.178.0/24']).join(' ') === 'set --advertise-routes=192.168.4.0/24,192.168.178.0/24');
  ok('an empty list clears them', TS.advertiseRoutesArgs([]).join(' ') === 'set --advertise-routes=');
  ok('cidrs validated', TS.isCidr('192.168.4.0/24') && !TS.isCidr('192.168.4.0') && !TS.isCidr('192.168.4.0/99') && !TS.isCidr('nope'));
  ok('advertised routes read from prefs', TS.parseAdvertisedRoutes('{"AdvertiseRoutes":["192.168.4.0/24"]}')[0] === '192.168.4.0/24');
  // Advertised but not approved is the single most common reason subnet routing
  // "does not work" — the two lists have to stay distinguishable.
  ok('approved routes come from the status, separately', TS.parseApprovedRoutes('{"Self":{"PrimaryRoutes":["192.168.4.0/24"]}}')[0] === '192.168.4.0/24');
  ok('missing routes are an empty list, not a crash', TS.parseAdvertisedRoutes('{}').length === 0 && TS.parseApprovedRoutes('nonsense').length === 0);
  ok('forwarding sysctl covers v4 and v6', TS.forwardingSysctl().includes('net.ipv4.ip_forward = 1') && TS.forwardingSysctl().includes('forwarding = 1'));

  // ---- publishing a device on its own port ----
  const DP = await import('../packages/gateway/src/transport/deviceProxy');
  ok('ports are handed out from the base upwards', DP.nextListenPort([]) === 8100 && DP.nextListenPort([8100, 8101]) === 8102);
  // Handing out a port twice would take down whatever already had it — including
  // the gateway's own UI.
  ok('a port in use is never handed out again', DP.nextListenPort([8100, 8102]) === 8101);
  const okCfg = { id: '192.168.4.23:80', label: 'cam', host: '192.168.4.23', port: 80, listen: 8100 };
  ok('a sane proxy passes', DP.validateProxy(okCfg, [8080]) === null);
  ok('a taken publish port is refused', (DP.validateProxy({ ...okCfg, listen: 8080 }, [8080]) || {}).message?.includes('already in use'));
  ok('a non-address target is refused', (DP.validateProxy({ ...okCfg, host: 'evil.example' }, []) || {}).message?.includes('not an IPv4'));
  ok('a privileged publish port is refused', (DP.validateProxy({ ...okCfg, listen: 80 }, []) || {}).message?.includes('between 1024'));
  ok('the id is one entry per host:port', DP.proxyId('192.168.4.23', 80) === '192.168.4.23:80');

  // ---- getting back online with nobody there ----
  const WD = await import('../packages/gateway/src/system/watchdog');
  const wd = { ...WD.WATCHDOG_DEFAULTS, enabled: true };
  ok('a single failed probe does nothing', WD.nextWatchdogAction(1, wd) === 'none');
  ok('two failures bring Tailscale up', WD.nextWatchdogAction(2, wd) === 'tailscale');
  ok('four restart the network', WD.nextWatchdogAction(4, wd) === 'network');
  ok('eight reboot', WD.nextWatchdogAction(8, wd) === 'reboot');
  // Steps fire once at their threshold: repeating "restart the network" every five
  // minutes helps nothing and hides whether the previous attempt did anything.
  ok('a step does not repeat past its threshold', WD.nextWatchdogAction(5, wd) === 'none' && WD.nextWatchdogAction(9, wd) === 'none');
  ok('the reboot step can be switched off entirely', WD.nextWatchdogAction(8, { ...wd, afterReboot: 0 }) === 'none');
  ok('a disabled watchdog never acts', WD.nextWatchdogAction(99, { ...wd, enabled: false }) === 'none');
  ok('the action explains itself in minutes', WD.describeAction('network', 4, wd).includes('20 minutes'));
  // A hostname would make a broken DNS look like a dead link.
  ok('the probe target is an address', WD.isProbeTarget('1.1.1.1') && !WD.isProbeTarget('one.one.one.one'));

  const sunday4 = new Date(2026, 7, 23, 4, 30); // a Sunday
  ok('the weekly reboot fires in its window', WD.dueForReboot(sunday4, WD.REBOOT_DEFAULTS, 86_400).due === true);
  ok('and not outside it', WD.dueForReboot(new Date(2026, 7, 23, 5, 30), WD.REBOOT_DEFAULTS, 86_400).due === false);
  ok('nor on another day', WD.dueForReboot(new Date(2026, 7, 24, 4, 30), WD.REBOOT_DEFAULTS, 86_400).due === false);
  // Without this guard a box that boots inside its own window reboots again, and a
  // site nobody can reach is now in a loop.
  const loop = WD.dueForReboot(sunday4, WD.REBOOT_DEFAULTS, 600);
  ok('a box that just booted does not reboot again', loop.due === false && loop.reason.includes('just booted'));
  ok('and it can be switched off', WD.dueForReboot(sunday4, { ...WD.REBOOT_DEFAULTS, enabled: false }, 86_400).due === false);

  // ---- the reboot loop this nearly had ----
  // The failure counter lives in memory, so a reboot resets it: medium gone → eight
  // failed probes → reboot → counter at zero → forty minutes later, reboot again,
  // forever. The budget is written to disk precisely so a reboot cannot clear it.
  const T = 10_000_000;
  let budget = { ...WD.REBOOT_BUDGET_EMPTY };
  ok('the first reboot is allowed', WD.canReboot(budget, T).allowed === true);
  budget = WD.recordReboot(budget, T);
  ok('and is remembered', budget.count === 1 && budget.lastRebootAt === T);
  const soon = WD.canReboot(budget, T + 40 * 60_000);
  ok('another one forty minutes later is refused', soon.allowed === false && soon.reason.includes('not again'));
  budget = WD.recordReboot(budget, T + WD.REBOOT_MIN_INTERVAL_MS);
  const spent = WD.canReboot(budget, T + 2 * WD.REBOOT_MIN_INTERVAL_MS);
  ok('two in a day is the limit', spent.allowed === false && budget.count === 2);
  // And the message says the useful thing rather than "denied".
  ok('and it says why more would be pointless', spent.reason.includes('the medium is probably gone'));
  ok('a new day restores the budget', WD.canReboot(budget, T + WD.REBOOT_WINDOW_MS + WD.REBOOT_MIN_INTERVAL_MS).allowed === true);

  // A missing uplink does not break local access, so it must not kick out whoever
  // is standing there with the page open.
  ok('someone on the page counts as present', WD.someoneIsHere(T, T + 60_000) === true);
  ok('and stops counting after the grace', WD.someoneIsHere(T, T + WD.LOCAL_ACTIVITY_GRACE_MS) === false);
  ok('nobody ever there is not present', WD.someoneIsHere(null, T) === false);

  // ---- switching things off and on from far away ----
  const PW = await import('../packages/gateway/src/system/power');
  const shelly = { id: 'sw:cam', label: 'Cam plug', kind: 'shelly' as const, host: '192.168.4.60', channel: 0, cycleSeconds: 8 };
  ok('shelly on/off differ in exactly the state', PW.switchUrl(shelly, true) === 'http://192.168.4.60/relay/0?turn=on' && PW.switchUrl(shelly, false)!.endsWith('turn=off'));
  ok('tasmota uses its own numbering', PW.switchUrl({ ...shelly, kind: 'tasmota' }, true) === 'http://192.168.4.60/cm?cmnd=Power1%20On');
  ok('a custom switch fills in {state}', PW.switchUrl({ ...shelly, kind: 'url', onUrl: 'http://x/set?p={state}', offUrl: 'http://x/set?p={state}' }, false) === 'http://x/set?p=off');
  ok('a gpio switch has no url', PW.switchUrl({ ...shelly, kind: 'gpio', pin: 17 }, true) === null);
  // Many relay boards switch on a LOW level; getting that backwards is discovered
  // from 200 km away.
  ok('a normal relay drives the pin high for on', PW.gpioArgs({ ...shelly, kind: 'gpio', pin: 17 }, true).join(' ').includes('17=1'));
  ok('an inverted one drives it low', PW.gpioArgs({ ...shelly, kind: 'gpio', pin: 17, inverted: true }, true).join(' ').includes('17=0'));

  ok('a switch needs a name', PW.validateSwitch({ kind: 'shelly', host: 'x' })?.includes('name'));
  ok('an http switch needs an address', PW.validateSwitch({ label: 'a', kind: 'shelly' })?.includes('address'));
  ok('a gpio switch needs a valid pin', PW.validateSwitch({ label: 'a', kind: 'gpio', pin: 99 })?.includes('BCM pin'));
  ok('a custom switch needs both urls', PW.validateSwitch({ label: 'a', kind: 'url', onUrl: 'http://x' })?.includes('on and an off'));
  ok('a good one passes', PW.validateSwitch({ label: 'Cam', kind: 'shelly', host: '192.168.4.60' }) === null);
  // Found by trying it: an out-of-range pin was silently clamped to a valid one, so
  // the switch would have driven a line nobody chose.
  ok('an out-of-range pin is refused, not clamped', PW.validateSwitch({ label: 'a', kind: 'gpio', pin: 99 }) !== null);
  ok('so is an impossible channel', PW.validateSwitch({ label: 'a', kind: 'shelly', host: 'x', channel: 99 })?.includes('channel'));
  ok('and an absurd off-time', PW.validateSwitch({ label: 'a', kind: 'shelly', host: 'x', cycleSeconds: 9999 })?.includes('off-time'));

  // Cycling once and then waiting is the difference between a rescue and a relay
  // that clacks all night on a flapping link.
  const autoSw = { ...shelly, deviceId: 'mac:aa', autoCycle: true };
  ok('an unreachable device is cycled', PW.shouldAutoCycle(autoSw, true, null, 1000) === true);
  ok('but not again inside the cooldown', PW.shouldAutoCycle(autoSw, true, 1000, 1000 + PW.AUTO_CYCLE_COOLDOWN_MS - 1) === false);
  ok('and again after it', PW.shouldAutoCycle(autoSw, true, 1000, 1000 + PW.AUTO_CYCLE_COOLDOWN_MS) === true);
  ok('a reachable device is never cycled', PW.shouldAutoCycle(autoSw, false, null, 1000) === false);
  ok('nor is one without the option', PW.shouldAutoCycle({ ...autoSw, autoCycle: false }, true, null, 1000) === false);

  // The kernel's own watchdog: the one the software cannot replace.
  ok('the systemd drop-in sets both timers', WD.systemdWatchdogConf(15).includes('RuntimeWatchdogSec=15') && WD.systemdWatchdogConf().includes('RebootWatchdogSec'));
  ok('its state is read back in seconds', WD.parseRuntimeWatchdog('RuntimeWatchdogUSec=15s') === 15 && WD.parseRuntimeWatchdog('RuntimeWatchdogUSec=0') === 0);
  ok('microseconds are converted too', WD.parseRuntimeWatchdog('RuntimeWatchdogUSec=15000000us') === 15);
  ok('and an unknown answer stays unknown', WD.parseRuntimeWatchdog('') === null);

  // ---- speaking up, without becoming noise ----
  const A = await import('../packages/gateway/src/system/alerts');

  // ---- where a request came FROM ----
  // The secret is off by default, and a relay is switched by a plain URL: a page
  // that only manages to make the browser fetch something has already switched the
  // power. So the gateway judges requests by where the page itself came from.
  const AUTH = await import('../packages/gateway/src/transport/auth');
  ok('the gateway\'s own page is local', AUTH.isLocalOrigin('http://192.168.4.1:8080') === true);
  ok('a laptop at the site is local', AUTH.isLocalOrigin('http://192.168.1.50:5173') === true);
  ok('a tailnet address is local', AUTH.isLocalOrigin('http://100.101.102.103:8080') === true);
  ok('a .local name is local', AUTH.isLocalOrigin('http://yondergate.local') === true);
  ok('localhost and ::1 are local', AUTH.isLocalOrigin('http://localhost:5173') === true && AUTH.isLocalOrigin('http://[::1]:8080') === true);
  ok('a page from the internet is not', AUTH.isLocalOrigin('https://evil.example') === false);
  ok('nor a sandboxed frame', AUTH.isLocalOrigin('null') === false);
  ok('no Origin at all → not a browser → allowed', AUTH.originAllowed({}) === true);
  ok('a foreign origin is refused', AUTH.originAllowed({ origin: 'https://evil.example' }) === false);
  ok('unless it proves intent with the secret', AUTH.originAllowed({ origin: 'https://evil.example', secretMatched: true }) === true);
  // The page the gateway served itself is allowed whatever its address — otherwise a
  // box reached over a public hostname would refuse its own setup page.
  ok('same host is allowed', AUTH.originAllowed({ origin: 'https://my-site.example', host: 'my-site.example' }) === true);
  ok('and across ports on that host', AUTH.originAllowed({ origin: 'http://192.168.1.50:5173', host: '192.168.1.50:8080' }) === true);
  // The one that actually protects the relays: an <img> or a <script> carries no
  // Origin at all, so Origin alone would wave it through. Sec-Fetch-Site does not.
  ok('a cross-site <img> is refused even with no Origin', AUTH.originAllowed({ secFetchSite: 'cross-site' }) === false);
  ok('a same-origin fetch is fine', AUTH.originAllowed({ secFetchSite: 'same-origin' }) === true);
  ok('typing the address in is fine', AUTH.originAllowed({ secFetchSite: 'none' }) === true);
  ok('another port of this box is fine', AUTH.originAllowed({ secFetchSite: 'same-site' }) === true);

  // ---- the captive portal has to be re-decided ----
  // Boot order at a real site: hotspot first, LTE a minute later. Deciding once
  // meant hijacked DNS for every device on the AP until someone restarted it.
  const WIFI2 = await import('../packages/gateway/src/system/wifi');
  ok('no uplink, no conf yet → put the portal up', WIFI2.captiveChange(true, false, false) === 'enable');
  ok('uplink arrives while the portal is up → take it down', WIFI2.captiveChange(true, true, true) === 'disable');
  ok('uplink and no portal is already right', WIFI2.captiveChange(true, true, false) === 'none');
  ok('no uplink and a portal is already right', WIFI2.captiveChange(true, false, true) === 'none');
  // Without an AP there is no dnsmasq of ours to reconfigure, and bouncing a Wi-Fi
  // client connection to change a file nobody reads would be worse than useless.
  ok('a client-mode Pi is left alone', WIFI2.captiveChange(false, true, true) === 'none');

  // ---- the ntfy topic is a credential ----
  // No accounts on the public server: the topic URL alone lets anyone read this
  // site's alerts and post fake ones. /api/health is readable by anyone on the LAN
  // or the open hotspot, so the topic must not be in it.
  const topic = 'https://ntfy.sh/yg-tegernsee-4f2a';
  const masked = A.maskNtfyUrl(topic)!;
  ok('the mask keeps the server visible', masked.startsWith('https://ntfy.sh/'));
  ok('but not the topic', !masked.includes('tegernsee'));
  ok('enough is left to recognise it', masked.includes('…'));
  ok('nothing configured stays nothing', A.maskNtfyUrl(null) === null);
  // A short topic gives nothing away at all rather than most of itself.
  ok('a short topic is not half-published', A.maskNtfyUrl('https://ntfy.sh/abcd') === 'https://ntfy.sh/ab…');
  // And saving the page back must not store the mask over the real topic.
  ok('an untouched field keeps the stored topic', A.unmaskNtfyUrl(masked, topic) === topic);
  ok('a retyped one replaces it', A.unmaskNtfyUrl('https://ntfy.sh/other', topic) === 'https://ntfy.sh/other');
  ok('and clearing it still clears it', A.unmaskNtfyUrl(null, topic) === null);

  const rule = { id: 'v', kind: 'sensor' as const, target: 'v:Battery', label: 'Battery voltage', below: 11.8, forMs: 300_000 };
  const T0 = 1_000_000;
  // A threshold that flaps must not turn into a night of notifications.
  let st = { since: null as number | null, firedAt: null as number | null };
  let step = A.evaluateRule(rule, true, 'low', st, T0);
  ok('a fresh breach waits', step.alert === null && step.next.since === T0);
  step = A.evaluateRule(rule, true, 'low', step.next, T0 + 299_000);
  ok('and keeps waiting inside its window', step.alert === null);
  step = A.evaluateRule(rule, true, '11.2 is below 11.8', step.next, T0 + 300_000);
  ok('then fires once', step.alert?.priority === 'high' && step.alert?.message.includes('11.2'));
  const fired = step.next;
  ok('and stays quiet afterwards', A.evaluateRule(rule, true, 'low', fired, T0 + 400_000).alert === null);
  ok('for the whole cooldown', A.evaluateRule(rule, true, 'low', fired, T0 + A.ALERT_COOLDOWN_MS - 1).alert === null);
  const recovered = A.evaluateRule(rule, false, 'back to 12.6', fired, T0 + 500_000);
  ok('recovery is announced for an announced problem', recovered.alert?.priority === 'default');
  ok('and clears the state', recovered.next.since === null && recovered.next.firedAt === null);
  // A blip that never got announced must not produce a lone "all clear".
  const blip = A.evaluateRule(rule, false, 'fine', { since: T0, firedAt: null }, T0 + 1000);
  ok('a blip produces no all-clear', blip.alert === null);

  // A sensor nobody wired up is not an alarm.
  ok('a missing reading is not a breach', A.sensorBreached(rule, null).breached === false);
  ok('below the line is', A.sensorBreached(rule, 11.4).breached === true);
  ok('above it is not', A.sensorBreached(rule, 12.9).breached === false);
  ok('an upper limit works too', A.sensorBreached({ ...rule, below: null, above: 60 }, 71).breached === true);

  ok('an ntfy topic is a URL with a topic', A.isNtfyUrl('https://ntfy.sh/my-topic') && !A.isNtfyUrl('ntfy.sh') && !A.isNtfyUrl('https://ntfy.sh/'));
  const req = A.ntfyRequest({ url: 'https://ntfy.sh/t' }, { id: 'x', title: 'Battery low', message: '11.2 V', priority: 'high', tags: ['warning'] }, 'Allotment');
  ok('the site is named in the title', req.headers.Title === 'Allotment: Battery low');
  ok('urgency travels as a header', req.headers.Priority === 'high' && req.body === '11.2 V');

  // ---- mobile data: counters that reset must not invent traffic ----
  const USE = await import('../packages/gateway/src/system/usage');
  let usage = USE.emptyUsage(USE.billingMonth(T0));
  usage = USE.accumulate(usage, 1_000_000, T0);
  ok('the first reading only sets a baseline', usage.bytes === 0);
  usage = USE.accumulate(usage, 3_000_000, T0 + 60_000);
  ok('the difference counts', usage.bytes === 2_000_000);
  // The stick rebooting is not 3 MB of un-sent traffic.
  usage = USE.accumulate(usage, 500_000, T0 + 120_000);
  ok('a counter that went backwards starts a new baseline', usage.bytes === 2_000_000 && usage.lastCounter === 500_000);
  usage = USE.accumulate(usage, 1_500_000, T0 + 180_000);
  ok('and counting resumes from there', usage.bytes === 3_000_000);
  // Changed deliberately in v0.12.11: the counter reading carries across the month
  // boundary. It used to be dropped, which started every month by silently losing one
  // poll interval of traffic — invisible at a minute's resolution, but the credit total
  // (which has no month) would have lost that chunk every month for years.
  const nextMonth = USE.accumulate(usage, 9_000_000, Date.UTC(2027, 0, 2));
  ok('a new month starts the monthly figure again', nextMonth.month === '2027-01');
  ok('and the traffic across the boundary is not lost', nextMonth.bytes === 7_500_000, String(nextMonth.bytes));

  ok('interface counters are read from /proc', USE.parseProcNetDev('Inter-|   Receive\n face |bytes\n  eth1: 1000 0 0 0 0 0 0 0 2000 0\n', 'eth1') === 3000);
  ok('an interface that is not there is null', USE.parseProcNetDev('  eth0: 1 2\n', 'eth1') === null);
  ok('hilink totals are up plus down', USE.parseHilinkTraffic({ TotalUpload: '100', TotalDownload: '900' }) === 1000);
  const status = USE.usageStatus({ month: '2026-08', bytes: 4.2e9, lastCounter: 0, updated: null }, 5);
  ok('80% of the allowance warns', status.warn === true && status.over === false && status.percent === 84);
  ok('no allowance means no warning', USE.usageStatus({ month: '2026-08', bytes: 9e12, lastCounter: 0, updated: null }, null).warn === false);

  // ---- the box's own vitals, all of them optional ----
  const HL = await import('../packages/gateway/src/system/health');
  ok('disk parsed', HL.parseDf('Filesystem 1M-blocks Used Available Use% Mounted\n/dev/root 30000 6000 22000 23% /').freeMb === 22000);
  ok('cpu temperature is millidegrees', HL.parseCpuTemp('47212\n') === 47.2);
  ok('uptime and load', HL.parseUptime('280054.32 1.2') === 280054 && HL.parseLoad('0.14 0.20 0.19') === 0.14);
  // Bit 0 is sagging now, bit 16 is "it has sagged since boot" — the one that
  // catches a supply that only dips when the LTE stick transmits.
  const thr = HL.parseThrottled('throttled=0x50005');
  ok('undervoltage now and since boot are different facts', thr.now === true && thr.since === true);
  ok('a clean supply reads as clean', HL.parseThrottled('throttled=0x0').since === false);
  ok('no vcgencmd means unknown, not fine', HL.parseThrottled('').now === null);
  ok('clock sync is read from timedatectl', HL.parseTimedatectl('NTP=yes\nNTPSynchronized=no\n').synced === false);
  ok('and the server in use', HL.parseTimesyncServer('       Server: 162.159.200.1 (time.cloudflare.com)') === '162.159.200.1');
  ok('ntp servers are validated, not trusted', HL.parseNtpServers('time.cloudflare.com, pool.ntp.org; rm -rf /').join() === 'time.cloudflare.com,pool.ntp.org,rm');
  ok('and capped in number', HL.parseNtpServers('a b c d e f g h').length === 5);

  // ---- fitting a hardware clock must not require an SSH session ----
  const cfgTxt = 'dtparam=audio=on\ndtoverlay=vc4-kms-v3d\n';
  const withRtc = HL.configTxtWithRtc(cfgTxt, true);
  ok('the overlay is added', HL.configTxtHasRtc(withRtc) && withRtc.includes('dtparam=audio=on'));
  // config.txt also decides whether the Pi boots at all, so the edit must be
  // idempotent in both directions and touch nothing else.
  ok('adding twice changes nothing', HL.configTxtWithRtc(withRtc, true) === withRtc);
  ok('removing it restores the file', HL.configTxtWithRtc(withRtc, false).trim() === cfgTxt.trim());
  ok('and removing when absent is a no-op', HL.configTxtHasRtc(HL.configTxtWithRtc(cfgTxt, false)) === false);

  ok('a timezone is Region/City', HL.isTimezone('Europe/Berlin') && HL.isTimezone('America/Argentina/Salta'));
  ok('and nothing else', !HL.isTimezone('Berlin') && !HL.isTimezone('../etc/passwd') && !HL.isTimezone(''));
  ok('timezone read from timedatectl', HL.parseTimezone('Timezone=Europe/Berlin\nNTP=yes\n') === 'Europe/Berlin');
  // The field should show what is actually in use, not look unconfigured.
  ok('distribution servers are found', HL.parseTimesyncdConf('[Time]\nNTP=a.pool.ntp.org b.pool.ntp.org\n').length === 2);
  ok('and the commented-out fallbacks too', HL.parseFallbackNtp('#FallbackNTP=0.debian.pool.ntp.org 1.debian.pool.ntp.org\n').length === 2);

  const ifaces = HL.parseInterfaces(
    '1: lo: <LOOPBACK,UP> mtu 65536 state UNKNOWN\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP\n3: wlan0: <BROADCAST> mtu 1500 state DOWN\n',
    '2: eth0    inet 192.168.178.42/24 brd 192.168.178.255 scope global eth0\n',
  );
  ok('interfaces are offered with their addresses', ifaces.length === 2 && ifaces[0].name === 'eth0' && ifaces[0].addresses[0] === '192.168.178.42');
  ok('one without an address is still offered', ifaces[1].name === 'wlan0' && ifaces[1].addresses.length === 0);
  ok('loopback is not a choice', !ifaces.some((i) => i.name === 'lo'));

  const ov = USE.usageOverview({ month: '2026-08', bytes: 3.1e9, lastCounter: 0, updated: null }, 5, Date.UTC(2026, 7, 22, 12));
  ok('the month is summed up as used / left / days', ov.leftBytes === 1.9e9 && ov.daysLeft === 10);
  ok('with a per-day budget for what is left', ov.perDayLeft === Math.round(1.9e9 / 10));
  ok('and no allowance means no budget', USE.usageOverview({ month: '2026-08', bytes: 1e9, lastCounter: 0, updated: null }, null, Date.now()).leftBytes === null);

  // ---- sensor history: recording what happened while nobody looked ----
  const HIST = await import('../packages/gateway/src/sensors/history');
  const mk = (t: number, v: number, c: number) => ({ t, values: { 'v:Battery': v, 'c:Battery': c } });
  ok('averages ignore the moments a channel was silent',
    HIST.averageSamples([mk(0, 12.8, -2), { t: 1, values: { 'v:Battery': 12.6, 'c:Battery': null } }])['c:Battery'] === -2);
  ok('an all-null channel averages to null', HIST.averageSamples([{ t: 0, values: { x: null } }]).x === null);

  const row = HIST.csvRow(1_700_000_000_000, { a: 12.3456, b: null }, ['a', 'b']);
  ok('csv rounds and leaves gaps empty', row === '1700000000,12.346,\n');
  const parsed = HIST.parseHistoryCsv('t,a,b\n1700000000,12.3,\n1700000060,12.4,3.2\n');
  ok('csv round-trips', parsed.keys.join() === 'a,b' && parsed.points.length === 2 && parsed.points[0].values.b === null);
  // A power cut mid-write leaves a half line; a year of measurements must not die of it.
  const damaged = HIST.parseHistoryCsv('t,a,b\n1700000000,12.3,1.0\ngarbage\n17000000');
  ok('a damaged line costs one minute, not the file', damaged.points.length === 1);

  ok('one file per month', HIST.monthFile(Date.UTC(2026, 7, 21)) === '2026-08.csv');
  ok('a range spans its months', HIST.filesForRange(Date.UTC(2026, 6, 30), Date.UTC(2026, 8, 2)).join() === '2026-07.csv,2026-08.csv,2026-09.csv');
  // 13 months, so "same month last year" still works on the last day of a month.
  // A channel plugged in mid-month cannot shift an existing file's columns, so the
  // month continues in a part file — and both are read back as one series.
  const names = ['2026-07.csv', '2026-08.csv', '2026-08.p2.csv', 'notes.txt'];
  ok('a part file names its month', HIST.fileMonth('2026-08.p2.csv') === '2026-08' && HIST.fileMonth('notes.txt') === null);
  ok('the first part is just the month', HIST.partFile(Date.UTC(2026, 7, 3), 1) === '2026-08.csv');
  ok('later parts are suffixed', HIST.partFile(Date.UTC(2026, 7, 3), 2) === '2026-08.p2.csv');
  ok(
    'a range picks up the parts too',
    HIST.filesForRange(Date.UTC(2026, 7, 1), Date.UTC(2026, 7, 31), names).join() === '2026-08.csv,2026-08.p2.csv',
  );
  ok('and still guesses plain months without a listing', HIST.filesForRange(Date.UTC(2026, 7, 1), Date.UTC(2026, 7, 31)).join() === '2026-08.csv');
  ok('parts expire with their month', HIST.expiredFiles(['2025-06.p2.csv'], Date.UTC(2026, 7, 21)).length === 1);

  const old = HIST.expiredFiles(['2025-06.csv', '2025-08.csv', '2026-08.csv', 'notes.txt'], Date.UTC(2026, 7, 21));
  ok('files past the retention window are named', old.includes('2025-06.csv') && !old.includes('2025-08.csv'));
  ok('and nothing else in the folder is touched', !old.includes('notes.txt') && !old.includes('2026-08.csv'));

  const series = [mk(0, 12.9, 1), mk(30_000, 12.5, -3), mk(61_000, 12.7, 0)];
  const buckets = HIST.bucketize(series, 60_000);
  ok('points are averaged into buckets', buckets.length === 2 && buckets[0].values['v:Battery'] === 12.7);
  // The dip under load is exactly what an average hides, so min/max travel with it.
  ok('extremes survive the averaging', buckets[0].min['c:Battery'] === -3 && buckets[0].max['c:Battery'] === 1);
  ok('a bucket width keeps a year readable', HIST.bucketFor(HIST.RANGES.year) >= 3_600_000 && HIST.bucketFor(HIST.RANGES.hour) === 60_000);

  // ---- sensor conversion math ----
  ok('ina219 bus 12V', near(C.ina219BusVolts(3000 << 3), 12));
  ok('ina219 amps', near(C.ina219Amps(2000, 0.01), 2));
  ok('ina226 bus 12V', near(C.ina226BusVolts(9600), 12));
  ok('ina260 amps 5A', near(C.ina260Amps(4000), 5));

  // INA228: 20-bit registers are left-aligned in 24 bits, so every raw value here
  // is the datasheet code << 4.
  ok('ina228 bus 12V', near(C.ina228BusVolts(Math.round(12 / 195.3125e-6) << 4), 12, 1e-4));
  ok('ina228 shunt 10 mV', near(C.ina228ShuntVolts(Math.round(0.01 / 312.5e-9) << 4), 0.01, 1e-9));
  ok('ina228 low range 4x finer', near(C.ina228ShuntVolts(0x10 << 4, true), 16 * 78.125e-9, 1e-12));
  ok('ina228 negative shunt', C.ina228ShuntVolts(0xfffff << 4) < 0);
  ok('ina228 10A over 1 mΩ', near(C.ina228Amps(Math.round(0.01 / 312.5e-9) << 4, 0.001), 10, 1e-6));
  const lsb228 = C.ina228CurrentLsb(50); // 50 A / 2^19
  ok('ina228 current LSB', near(lsb228, 50 / 524288));
  // SHUNT_CAL = 13107.2e6 × LSB × R  → 50 A, 1 mΩ: 13107.2e6 × 9.5367e-5 × 0.001
  ok('ina228 shunt cal', C.ina228ShuntCal(lsb228, 0.001) === 1250);
  ok('ina228 shunt cal x4 in low range', C.ina228ShuntCal(lsb228, 0.001, true) === 5000);
  ok('ina228 shunt cal clamps to 15 bit', C.ina228ShuntCal(lsb228, 1) === 0x7fff);
  // 1 A for 1 h = 3600 C = 1000 mAh; charge counts in CURRENT_LSB steps.
  ok('ina228 charge 1000 mAh', near(C.ina228ChargeMah(Math.round(3600 / lsb228), lsb228), 1000, 0.01));
  ok('ina228 charge signed (regen)', C.ina228ChargeMah(0xffffffffff, lsb228) < 0);
  // ENERGY LSB = 16 × 3.2 × CURRENT_LSB joules; 3600 J = 1 Wh.
  ok('ina228 energy 1 Wh', near(C.ina228EnergyWh(Math.round(3600 / (16 * 3.2 * lsb228)), lsb228), 1, 0.01));
  ok('ina228 die temp', near(C.ina228TempC(0x0800), 16, 1e-9));

  // INA237/238: same registers, 16-bit, no charge counter.
  ok('ina238 bus 12V', near(C.ina238BusVolts(3840), 12));
  ok('ina238 shunt 10 mV', near(C.ina238ShuntVolts(2000), 0.01, 1e-9));
  ok('ina238 low range', near(C.ina238ShuntVolts(2000, true), 0.0025, 1e-9));
  ok('ina238 10A over 1 mΩ', near(C.ina238Amps(2000, 0.001), 10, 1e-6));
  const lsb238 = C.ina238CurrentLsb(50);
  ok('ina238 current LSB', near(lsb238, 50 / 32768));
  ok('ina238 shunt cal', C.ina238ShuntCal(lsb238, 0.001) === 1250);
  // INA238 keeps its 12-bit temperature in bits 15:4 → 128 codes × 125 m°C = 16 °C.
  ok('ina238 die temp', near(C.ina238TempC(128 << 4), 16, 1e-9));
  ok('ina238 die temp negative', C.ina238TempC(0xf800) < 0);

  // ---- temperature sensors ----
  ok('pi thermal 47.8 °C', near(C.piThermalC('47774\n')!, 47.774));
  ok('pi thermal garbage → null', C.piThermalC('n/a') === null);
  ok('ds18b20 parses t=', near(C.ds18b20C('aa bb : crc=5c YES\n aa bb t=23125')!, 23.125));
  ok('ds18b20 bad crc → null', C.ds18b20C('aa bb : crc=5c NO\n aa bb t=23125') === null);
  ok('ds18b20 power-on 85 °C → null', C.ds18b20C('crc=5c YES t=85000') === null);
  ok('ds18b20 negative', near(C.ds18b20C('crc=aa YES t=-10625')!, -10.625));
  ok('mcp9808 +25.25', near(C.mcp9808C(0x0194), 25.25));
  ok('mcp9808 negative', near(C.mcp9808C(0x1f9c), -6.25)); // 13-bit two's complement
  ok('tmp102 +25', near(C.tmp102C(0x1900), 25));
  ok('tmp102 negative', C.tmp102C(0xe700) < 0);
  ok('tmp117 +25', near(C.tmp117C(3200), 25));
  // BMP280 datasheet worked example: adc_T 519888 with T1..T3 = 27504/26435/-1000.
  ok('bmp280 compensation', Math.abs(C.bmp280TempC(519888, 27504, 26435, -1000) - 25.08) < 0.05);
  ok('max6675 +25', near(C.max6675C(100 << 3)!, 25));
  ok('max6675 open thermocouple → null', C.max6675C((100 << 3) | 0x04) === null);
  ok('max31855 +25', near(C.max31855C(100 << 18)!, 25));
  ok('max31855 fault → null', C.max31855C((100 << 18) | 0x00010000) === null);
  ok('max31855 cold junction', near(C.max31855ColdJunctionC(400 << 4), 25));
  ok('max31856 +25', near(C.max31856C((25 / 0.0078125) << 5), 25));
  ok('max31865 ratio → ohms', near(C.max31865Ohms(16384 << 1, 430)!, 215));
  ok('max31865 fault → null', C.max31865Ohms((16384 << 1) | 1, 430) === null);
  // PT100: 100 Ω = 0 °C, 138.51 Ω = 100 °C, 80.31 Ω = −50 °C.
  ok('pt100 at 0 °C', Math.abs(C.rtdTempC(100, 100)) < 0.01);
  ok('pt100 at 100 °C', Math.abs(C.rtdTempC(138.5055, 100) - 100) < 0.05);
  ok('pt100 sub-zero', Math.abs(C.rtdTempC(80.31, 100) + 50) < 0.1);
  ok('pt1000 scales', Math.abs(C.rtdTempC(1385.055, 1000) - 100) < 0.05);
  // NTC: at R25 the beta equation must return exactly 25 °C.
  ok('ntc at r25 = 25 °C', Math.abs(C.ntcTempC(10000)! - 25) < 1e-9);
  ok('ntc hotter = lower R', C.ntcTempC(4000)! > 25 && C.ntcTempC(20000)! < 25);
  ok('ntc nonsense → null', C.ntcTempC(0) === null);
  // Divider: probe to GND, half the excitation ⇒ probe equals the series resistor.
  ok('divider half = series', near(C.dividerOhms(1.65, 3.3, 10000)!, 10000));
  ok('divider high side', near(C.dividerOhms(1.65, 3.3, 10000, false)!, 10000));
  ok('divider out of range → null', C.dividerOhms(3.3, 3.3, 10000) === null);

  // ---- which channel drives the battery maths ----
  const { primaryIndex, primaryVoltage, primaryCurrent, readingKey } = await import('../packages/protocol/src/telemetry');
  ok('no flag → first channel', primaryIndex([{}, {}]) === 0);
  ok('flag wins', primaryIndex([{}, { primary: true }, {}]) === 1);
  ok('empty list → 0', primaryIndex([]) === 0);
  const tm2 = {
    type: 'telemetry', source: 'sim', ok: true,
    voltages: [{ label: 'BEC', value: 5.1 }, { label: 'Pack', value: 16.4 }],
    currents: [{ label: 'I1', value: 9 }],
    primaryVoltage: 1, mah: 0, wh: 0, capacityMah: null, batteryPercent: null, displayMode: 'remaining',
  } as import('@yondergate/protocol').TelemetryMessage;
  ok('message points at the pack', primaryVoltage(tm2)?.value === 16.4);
  ok('current falls back to index 0', primaryCurrent(tm2)?.label === 'I1');
  ok('no channels → null', primaryVoltage({ ...tm2, voltages: [] }) === null);
  ok('reading key uses the label', readingKey('t', 'Motor', 3) === 't:Motor');
  ok('reading key falls back to the index', readingKey('v', '  ', 2) === 'v:2');

  // Who counts the charge: only the INA228 has the hardware accumulator.
  ok('ina228 has a counter', C.hasHardwareCounter('ina228'));
  ok('ina238 has none', !C.hasHardwareCounter('ina238') && !C.hasHardwareCounter('ina226'));
  ok('auto uses the sensor when present', C.resolveChargeSource('auto', true) === 'sensor');
  ok('auto falls back to the Pi', C.resolveChargeSource('auto', false) === 'pi');
  ok('sensor request degrades to Pi', C.resolveChargeSource('sensor', false) === 'pi');
  ok('pi stays on the Pi', C.resolveChargeSource('pi', true) === 'pi');
  ok('undefined behaves like auto', C.resolveChargeSource(undefined, true) === 'sensor');
  ok('ads1115 half-scale', near(C.ads1115Volts(16384, 4.096), 2.048, 1e-4));
  ok('mcp3208 half', near(C.mcp3208Volts(2048, 3.3), 1.65, 2e-3));
  ok('acs712 5A', near(C.acsAmps(2.83, 2.5, 66), 5, 1e-2));

  // ---- coulomb counting precision ----
  let mah = 0;
  for (let i = 0; i < 3600; i++) mah = C.accumulateMah(mah, 10, 0.1);
  ok('coulomb 10A·360s = 1000mAh', near(mah, 1000, 1e-3), `=${mah}`);

  // ---- battery %: voltage sanity clamp ----
  ok('no voltage curve → coulomb unchanged', C.batteryPercentWithVoltage(100, 3.7, null, null) === 100);
  ok('voltage clamps coulomb down', near(C.batteryPercentWithVoltage(100, 3.75, 4.2, 3.3)!, 50, 0.5), `=${C.batteryPercentWithVoltage(100, 3.75, 4.2, 3.3)}`);
  ok('no coulomb → voltage estimate', C.batteryPercentWithVoltage(null, 4.2, 4.2, 3.3) === 100);
  ok('voltage never inflates coulomb', C.batteryPercentWithVoltage(50, 4.5, 4.2, 3.3) === 50);
  ok('invalid curve (full<=empty) ignored', C.batteryPercentWithVoltage(80, 3.5, 3.3, 3.3) === 80);
  // explicit % source selection + reported source
  ok('mode coulomb uses coulomb', (() => { const r = C.computeBatteryPercent('coulomb', 90, 3.7, 4.2, 3.3); return r.pct === 90 && r.source === 'coulomb'; })());
  ok('mode voltage uses voltage', (() => { const r = C.computeBatteryPercent('voltage', 90, 3.75, 4.2, 3.3); return near(r.pct!, 50, 0.5) && r.source === 'voltage'; })());
  ok('mode voltage w/o curve → null', C.computeBatteryPercent('voltage', 90, 3.7, null, null).pct === null);
  ok('mode clamp reports clamp source', (() => { const r = C.computeBatteryPercent('clamp', 90, 3.75, 4.2, 3.3); return r.source === 'clamp' && near(r.pct!, 50, 0.5); })());
  ok('mode clamp falls back to coulomb', (() => { const r = C.computeBatteryPercent('clamp', 90, 3.7, null, null); return r.pct === 90 && r.source === 'coulomb'; })());

  // ---- sim telemetry service ----
  const tcfg: TelemetryConfig = {
    enabled: true, source: 'sim', sampleHz: 50,
    voltages: [{ label: 'V1', kind: 'sim' }], currents: [{ label: 'I1', kind: 'sim' }],
    countCapacity: true, batteryCapacityMah: 2200, displayMode: 'remaining',
  };
  const svc = new TelemetryService(tcfg);
  await svc.start();
  await new Promise((r) => setTimeout(r, 300));
  const tm = svc.message!;
  ok('telemetry sim source+ok', tm.source === 'sim' && tm.ok === true);
  ok('telemetry battery %', tm.batteryPercent !== null && tm.batteryPercent > 90);
  await svc.stop();

  // ---- INA228: the sensor counts, the service only reads it ----
  // The sim reader emulates the chip's CHARGE/ENERGY registers, so the whole
  // service path (auto → sensor, reset clears it) runs without hardware. The I²C
  // register access itself can only be proven on a Pi.
  const hwCfg: TelemetryConfig = {
    ...tcfg,
    currents: [{ label: 'I1', kind: 'ina228', shuntOhms: 0.001, maxCurrentA: 50 }],
    chargeSource: 'auto',
  };
  const hwSvc = new TelemetryService(hwCfg);
  await hwSvc.start();
  await new Promise((r) => setTimeout(r, 300));
  const hm = hwSvc.message!;
  ok('ina228 → charge from the sensor', hm.chargeFrom === 'sensor');
  ok('sensor counter accumulates', hm.mah > 0, `=${hm.mah}`);
  await hwSvc.resetCapacity();
  await new Promise((r) => setTimeout(r, 120));
  ok('reset clears the sensor counter', hwSvc.message!.mah < hm.mah, `=${hwSvc.message!.mah}`);
  await hwSvc.stop();

  // ---- primary channel + temperatures end-to-end through the service ----
  const multiCfg: TelemetryConfig = {
    ...tcfg,
    // The sim puts the pack on index 0 and a half-voltage rail on index 1, so
    // flagging the rail is a clean discriminator: the % must follow the flag.
    voltages: [{ label: 'Pack', kind: 'sim' }, { label: 'BEC', kind: 'sim', primary: true }],
    currents: [{ label: 'I1', kind: 'sim' }],
    temperatures: [{ label: 'Motor', kind: 'sim' }, { label: 'ESC', kind: 'sim' }],
    percentSource: 'voltage',
    voltageFullV: 16.8,
    voltageEmptyV: 13.2,
  };
  const multi = new TelemetryService(multiCfg);
  await multi.start();
  await new Promise((r) => setTimeout(r, 200));
  const mm = multi.message!;
  ok('primary index is reported', mm.primaryVoltage === 1 && mm.primaryCurrent === 0);
  ok('battery % follows the flag (rail → empty)', mm.batteryPercent === 0, `=${mm.batteryPercent}`);
  ok('temperatures are reported with labels', mm.temperatures?.length === 2 && mm.temperatures[0].label === 'Motor');
  ok('temperatures are plausible', (mm.temperatures?.[0].value ?? 0) > 20 && (mm.temperatures?.[0].value ?? 0) < 90);
  await multi.stop();
  // Same pack, flag moved back to the real pack channel → a full battery again.
  const packPrimary = new TelemetryService({
    ...multiCfg,
    voltages: [{ label: 'Pack', kind: 'sim', primary: true }, { label: 'BEC', kind: 'sim' }],
  });
  await packPrimary.start();
  await new Promise((r) => setTimeout(r, 200));
  ok('flag on the pack → full', (packPrimary.message!.batteryPercent ?? 0) > 50, `=${packPrimary.message!.batteryPercent}`);
  await packPrimary.stop();

  // Same config forced onto the Pi, and a chip without a counter.
  const piSvc = new TelemetryService({ ...hwCfg, chargeSource: 'pi' });
  await piSvc.start();
  await new Promise((r) => setTimeout(r, 200));
  ok('forced pi integration', piSvc.message!.chargeFrom === 'pi' && piSvc.message!.mah > 0);
  await piSvc.stop();
  const noCounter = new TelemetryService({ ...hwCfg, currents: [{ label: 'I1', kind: 'ina238', shuntOhms: 0.001 }], chargeSource: 'sensor' });
  await noCounter.start();
  await new Promise((r) => setTimeout(r, 200));
  ok('ina238 falls back to pi counting', noCounter.message!.chargeFrom === 'pi' && noCounter.message!.mah > 0);
  await noCounter.stop();

  // ---- real telemetry with no sensor → NO DATA (no sim substitution) ----
  const rcfg: TelemetryConfig = { ...tcfg, source: 'real', voltages: [{ label: 'V1', kind: 'ina226' }], currents: [{ label: 'I1', kind: 'ina226', shuntOhms: 0.001 }] };
  const rsvc = new TelemetryService(rcfg);
  await rsvc.start();
  await new Promise((r) => setTimeout(r, 200));
  const rm = rsvc.message!;
  ok('real w/o sensor → ok:false', rm.source === 'real' && rm.ok === false);
  await rsvc.stop();

  // ---- optional shared secret (off by default, exact match when set) ----
  const { secretOk, readSecretFromUrl } = await import('../packages/gateway/src/transport/auth');
  ok('secret off (null) → allow', secretOk(null, undefined) === true);
  ok('secret off (empty) → allow', secretOk('', 'whatever') === true);
  ok('secret set + match → allow', secretOk('s3cr3t', 's3cr3t') === true);
  ok('secret set + wrong → deny', secretOk('s3cr3t', 'nope') === false);
  ok('secret set + missing → deny', secretOk('s3cr3t', undefined) === false);
  ok('readSecretFromUrl parses query', readSecretFromUrl('/?secret=abc') === 'abc');
  ok('readSecretFromUrl none → null', readSecretFromUrl('/') === null);

  // ---- remote access: pure validators + redaction + sim transitions ----
  const RA = await import('../packages/gateway/src/system/SystemManager');
  ok('zerotier id valid', RA.isZerotierNetworkId('8056c2e21c000001') === true);
  ok('zerotier id rejects junk', RA.isZerotierNetworkId('nope') === false);
  const wgConf = '[Interface]\nPrivateKey = abc=\nAddress = 192.168.178.2/24\n[Peer]\nPublicKey = def=\nEndpoint = home.myfritz.net:51820\nAllowedIPs = 0.0.0.0/0';
  ok('wg conf recognised', RA.looksLikeWireguardConf(wgConf) === true);
  ok('wg conf rejects non-conf', RA.looksLikeWireguardConf('hello world') === false);
  ok('wg conf normalises CRLF', RA.normaliseWireguardConf('a\r\nb\r\n') === 'a\nb\n');
  const red = RA.redactRemoteConfig({ kind: 'wireguard', wireguardConf: 'secret', tailscaleAuthKey: 'tskey', zerotierNetworkId: '8056c2e21c000001' });
  ok('redact hides secrets', !('wireguardConf' in red) && !('tailscaleAuthKey' in red) && red.hasWireguardConf === true && red.hasTailscaleAuthKey === true && red.zerotierNetworkId === '8056c2e21c000001');
  const { SimSystem } = await import('../packages/gateway/src/system/SimSystem');
  const sys = new SimSystem();
  const ztUp = await sys.remoteUp({ kind: 'zerotier', zerotierNetworkId: '8056c2e21c000001' });
  ok('sim zerotier up ok', ztUp.ok === true);
  const ztSt = await sys.remoteStatus({ kind: 'zerotier', zerotierNetworkId: '8056c2e21c000001' });
  ok('sim zerotier running', ztSt.kind === 'zerotier' && ztSt.running === true && ztSt.address !== null);
  const wgUp = await sys.remoteUp({ kind: 'wireguard', wireguardConf: wgConf });
  ok('sim wireguard up ok', wgUp.ok === true);
  ok('sim wireguard needs conf', (await sys.remoteUp({ kind: 'wireguard' })).ok === false);
  const ztDown = await sys.remoteDown({ kind: 'zerotier', zerotierNetworkId: '8056c2e21c000001' });
  ok('sim remote down ok', ztDown.ok === true);

  // ---- LTE: mmcli parsing + secret redaction + sim dial ----
  const LTE = await import('../packages/gateway/src/system/lte');
  const mmA = [
    '  Hardware |          model: Quectel EG25-G',
    '  Status   |          state: registered',
    '           |    power state: on',
    '           | signal quality: 71% (recent)',
    '  3GPP     |  operator name: Telekom.de',
  ].join('\n');
  const iA = LTE.parseModemInfo(mmA);
  ok('mmcli state parsed (not power state)', iA.state === 'registered', `=${iA.state}`);
  ok('mmcli operator parsed', iA.operator === 'Telekom.de', `=${iA.operator}`);
  ok('mmcli signal parsed', iA.signal === 71);
  ok('mmcli model parsed', iA.model === 'Quectel EG25-G', `=${iA.model}`);
  ok('mmcli no pin needed', iA.pinRequired === false);
  const mmB = '  Status   |          state: locked\n           | unlock required: sim-pin';
  ok('mmcli pin required', LTE.parseModemInfo(mmB).pinRequired === true);
  ok('mmcli modem id', LTE.parseModemId('  /org/freedesktop/ModemManager1/Modem/2 [Quectel]') === '2');
  const rl = LTE.redactLteConfig({ apn: 'internet', pin: '1234', username: 'u', password: 'p' });
  ok('lte redact hides pin+pass', !('pin' in rl) && !('password' in rl) && rl.hasPin === true && rl.hasPassword === true && rl.apn === 'internet' && rl.username === 'u');
  const lteUp = await sys.lteConnect({ apn: 'internet', pin: '1234' });
  ok('sim lte connect ok', lteUp.ok === true);
  ok('sim lte 4g-only mode', (await sys.lteConnect({ apn: 'i', networkMode: '4g' })).message.includes('[4g]'));
  ok('sim lte home-only', (await sys.lteConnect({ apn: 'i', allowRoaming: false })).message.includes('home-only'));
  ok('parse sim id', LTE.parseSimId('  System | primary sim path: /org/freedesktop/ModemManager1/SIM/0') === '0');
  ok('valid pin 4-8 digits', LTE.isValidPin('1234') === true && LTE.isValidPin('12') === false && LTE.isValidPin('abcd') === false);
  ok('redact includes mode+roaming', (() => { const r = LTE.redactLteConfig({ apn: 'i', networkMode: '4g', allowRoaming: false }); return r.networkMode === '4g' && r.allowRoaming === false; })());
  ok('sim pin change ok', (await sys.lteSetPin({ action: 'change', currentPin: '1234', newPin: '4321' })).ok === true);
  ok('sim pin remove ok', (await sys.lteSetPin({ action: 'disable', currentPin: '1234' })).message.toLowerCase().includes('removed'));
  ok('sim lte diagnostics', (await sys.lteDiagnostics()).output.includes('mmcli -m 0'));

  // ---- link signal (WiFi dBm → quality) + hardware detection parsing ----
  const SIG = await import('../packages/gateway/src/system/signal');
  ok('wifi dbm parsed', SIG.parseWifiSignalDbm('  signal: -58 dBm\n  rx bitrate: 65 MBit/s') === -58);
  ok('wifi dbm none', SIG.parseWifiSignalDbm('Not connected.') === null);
  ok('dbm→quality mid', SIG.dbmToQualityPct(-75) === 50);
  ok('dbm→quality clamp hi', SIG.dbmToQualityPct(-40) === 100);
  ok('dbm→quality clamp lo', SIG.dbmToQualityPct(-120) === 0);
  const link = await sys.linkSignal();
  ok('sim link signal has label+quality', typeof link.label === 'string' && (link.quality === null || typeof link.quality === 'number'));
  const DET = await import('../packages/gateway/src/system/detect');
  const i2cSample = [
    '     0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f',
    '00:                         -- -- -- -- -- -- -- --',
    '40: 40 41 -- -- -- -- -- -- 48 -- -- -- -- -- -- --',
    '70: -- -- -- -- -- -- -- --',
  ].join('\n');
  const addrs = DET.parseI2cAddresses(i2cSample);
  ok('i2c addresses parsed', addrs.length === 3 && addrs[0] === 0x40 && addrs[1] === 0x41 && addrs[2] === 0x48, `=${addrs.map((a) => a.toString(16))}`);
  const sugg = DET.suggestI2c(addrs);
  ok('i2c suggest PCA9685 @0x40', sugg[0].address === '0x40' && /PCA9685/.test(sugg[0].hint));
  ok('i2c suggest ADS @0x48', sugg[2].hint.includes('ADS'));
  ok('sim detect finds 0x40', (await sys.detectHardware()).i2c.some((x) => x.address === '0x40'));
  ok('sim detect lists serial', (await sys.detectHardware()).serial.length > 0);

  // ---- camera source per encoder ----
  const cam: CameraCfg = { name: 'test', type: 'sim', width: 640, height: 480, fps: 20 };
  ok('libx264 source', cameraSource(cam, 'libx264').includes('-c:v libx264'));
  ok('libopenh264 source', cameraSource(cam, 'libopenh264').includes('libopenh264'));
  const rpi = cameraSource({ ...cam, type: 'rpicam' });
  ok('rpicam uses rpicam-vid by default', rpi.includes('rpicam-vid'));
  // go2rtc runs exec: without a shell — a pipe would be a literal argv, and the
  // stream dies before the first frame. This is what shipped broken until v1.47.0.
  ok('rpicam source has no shell pipe', !rpi.includes('|'));
  ok('rpicam source has no {output}', !rpi.includes('{output}'));
  ok('rpicam writes to stdout', rpi.trimEnd().endsWith('-o -'));
  ok('rpicam honours legacy binary', cameraSource({ ...cam, type: 'rpicam' }, 'libx264', 'libcamera-vid').includes('libcamera-vid'));
  ok(
    'rpicam binary sanitised',
    cameraSource({ ...cam, type: 'rpicam' }, 'libx264', 'rm -rf /').includes('exec:rpicam-vid '),
  );
  ok(
    'rpicam bitrate in bits',
    cameraSource({ ...cam, type: 'rpicam', bitrateKbps: 3000 }).includes('--bitrate 3000000'),
  );

  // ---- mounting orientation ----
  const cm = await import('../packages/gateway/src/video/cameraManager');
  const plainCam: CameraCfg = { name: 'c', type: 'rpicam', width: 640, height: 480, fps: 20 };
  ok('no transform by default', cm.orientationArgs(plainCam) === '' && cm.orientationFilter(plainCam) === null);
  // 180° IS both mirrors, so it collapses to the same two booleans rather than being a
  // third, separately-ordered option.
  const upside = cm.orientationOf({ ...plainCam, rotation: 180 });
  ok('180 is both mirrors', upside.hflip && upside.vflip);
  ok('180 on rpicam', cm.orientationArgs({ ...plainCam, rotation: 180 }) === ' --hflip --vflip');
  ok('hflip alone', cm.orientationArgs({ ...plainCam, hflip: true }) === ' --hflip');
  // …which also makes "upside down, but the lens is mirrored" behave as expected.
  ok('180 + hflip cancels on that axis', cm.orientationArgs({ ...plainCam, rotation: 180, hflip: true }) === ' --vflip');
  ok('180 + both flips is a no-op', cm.orientationArgs({ ...plainCam, rotation: 180, hflip: true, vflip: true }) === '');
  ok('rpicam source carries the flags', cm.cameraSource({ ...plainCam, rotation: 180 }).includes('--hflip --vflip'));

  const usbCam: CameraCfg = { name: 'u', type: 'usb', device: '/dev/video0', width: 640, height: 480, fps: 30 };
  ok('usb filter for 180', cm.orientationFilter({ ...usbCam, rotation: 180 }) === 'hflip,vflip');
  // go2rtc splits exec: on whitespace, so the filter must stay a single argument.
  ok('usb filter has no spaces', !cm.orientationFilter({ ...usbCam, rotation: 180 })!.includes(' '));
  const usbSrc = cm.cameraSource({ ...usbCam, vflip: true }, 'libx264');
  ok('usb source carries -vf', usbSrc.includes('-vf vflip '));
  ok('-vf sits before the encoder', usbSrc.indexOf('-vf ') < usbSrc.indexOf('-c:v'));
  ok('no -vf when there is nothing to do', !cm.cameraSource(usbCam, 'libx264').includes('-vf'));

  // ---- rpicam focus / tuning file ----
  const rpiBase: CameraCfg = { ...cam, type: 'rpicam' };
  ok('focus off emits nothing', !cameraSource(rpiBase).includes('--autofocus-mode'));
  ok(
    'focus continuous',
    cameraSource({ ...rpiBase, focus: 'continuous' }).includes('--autofocus-mode continuous'),
  );
  const man = cameraSource({ ...rpiBase, focus: 'manual', lensPosition: 3.5 });
  ok('focus manual carries lens position', man.includes('--autofocus-mode manual --lens-position 3.5'));
  ok(
    'lens position clamped',
    cameraSource({ ...rpiBase, focus: 'manual', lensPosition: -4 }).includes('--lens-position 0'),
  );
  ok(
    'manual without position → infinity',
    cameraSource({ ...rpiBase, focus: 'manual' }).includes('--lens-position 0'),
  );
  ok(
    'tuning file passed through',
    cameraSource({ ...rpiBase, tuningFile: '/var/lib/yondergate/tuning/imx519-af.json' }).includes(
      '--tuning-file /var/lib/yondergate/tuning/imx519-af.json',
    ),
  );
  // go2rtc splits exec: on whitespace, so a path with a space would become two args.
  ok(
    'tuning file with space rejected',
    !cameraSource({ ...rpiBase, tuningFile: '/etc/my tuning.json' }).includes('--tuning-file'),
  );
  ok(
    'relative / traversing tuning file rejected',
    !cameraSource({ ...rpiBase, tuningFile: '/var/../etc/shadow.json' }).includes('--tuning-file'),
  );
  ok(
    'non-json tuning file rejected',
    !cameraSource({ ...rpiBase, tuningFile: '/tmp/evil.sh' }).includes('--tuning-file'),
  );
  ok('focus only on rpicam', !cameraSource({ ...cam, type: 'sim', focus: 'auto' }).includes('--autofocus-mode'));

  // ---- CSI camera module (config.txt, pure part) ----
  const bc = await import('../packages/gateway/src/system/bootConfig');
  const PI_CONFIG = [
    '# Some comments',
    'dtparam=i2c_arm=on',
    'camera_auto_detect=1',
    'dtoverlay=vc4-kms-v3d',
    'max_framebuffers=2',
    '[cm5]',
    'dtoverlay=dwc2,dr_mode=host',
    '[all]',
    'enable_uart=1',
    '',
  ].join('\n');

  ok('parse default is auto-detect', bc.parseBootConfig(PI_CONFIG).autoDetect === true);
  ok('parse finds no camera overlay', bc.parseBootConfig(PI_CONFIG).overlay === null);
  ok('parse maps to the auto module', bc.moduleIdFor(bc.parseBootConfig(PI_CONFIG)) === 'auto');

  const withImx = bc.applyCameraModule(PI_CONFIG, 'imx519');
  ok('apply turns auto-detect off', /\ncamera_auto_detect=0/.test(withImx));
  ok('apply writes the overlay', /\ndtoverlay=imx519\n/.test(withImx));
  ok('apply comments the old auto-detect', withImx.includes('# camera_auto_detect=1  # (replaced by YonderGate)'));
  // The block must land in [all], not in whatever conditional section the file ended in.
  ok('apply opens an [all] section', withImx.slice(withImx.indexOf('--- YonderGate')).includes('[all]'));
  ok('apply leaves foreign overlays alone', withImx.includes('\ndtoverlay=vc4-kms-v3d') && withImx.includes('\ndtoverlay=dwc2,dr_mode=host'));
  ok('round-trip reads back the module', bc.moduleIdFor(bc.parseBootConfig(withImx)) === 'imx519');

  // Switching modules must not stack blocks up.
  const switched = bc.applyCameraModule(withImx, 'arducam-64mp');
  ok('switch leaves one managed block', switched.split('--- YonderGate camera module').length === 2);
  ok('switch drops the old overlay', !/\ndtoverlay=imx519\n/.test(switched));
  ok('switch reads back', bc.moduleIdFor(bc.parseBootConfig(switched)) === 'arducam-64mp');

  const backToAuto = bc.applyCameraModule(switched, null);
  ok('back to auto sets 1', /\ncamera_auto_detect=1/.test(backToAuto));
  ok('back to auto writes no overlay', bc.parseBootConfig(backToAuto).overlay === null);
  ok('back to auto is the auto module', bc.moduleIdFor(bc.parseBootConfig(backToAuto)) === 'auto');
  ok('apply is idempotent', bc.applyCameraModule(backToAuto, null) === backToAuto);

  ok('overlay name accepted', bc.validOverlayName('imx296'));
  ok('overlay with params accepted', bc.validOverlayName('imx519,cam0'));
  ok('overlay with assignment accepted', bc.validOverlayName('imx477,rotation=180'));
  ok('overlay newline rejected', !bc.validOverlayName('imx296\nenable_uart=0'));
  ok('overlay space rejected', !bc.validOverlayName('imx296 foo'));
  ok('overlay shell chars rejected', !bc.validOverlayName('imx296;reboot'));
  ok('overlay base name', bc.overlayBaseName('imx519,cam0') === 'imx519');

  ok('boot record current while boot id unchanged', bc.recordIsCurrent({ bootId: 'abc', booted: { autoDetect: true, overlay: null } }, 'abc'));
  ok('boot record stale after a reboot', !bc.recordIsCurrent({ bootId: 'abc', booted: { autoDetect: true, overlay: null } }, 'def'));
  ok('no record is never current', !bc.recordIsCurrent(null, 'abc'));
  ok('reboot due when the overlay changed', bc.bootedStateChanged({ autoDetect: true, overlay: null }, { autoDetect: false, overlay: 'imx519' }));
  // auto → imx519 → auto rewrites the file but changes nothing the firmware cares about.
  ok('no reboot when the effective state is unchanged', !bc.bootedStateChanged({ autoDetect: true, overlay: null }, bc.parseBootConfig(bc.applyCameraModule(bc.applyCameraModule(PI_CONFIG, 'imx519'), null))));
  ok('reboot due when only auto-detect flipped', bc.bootedStateChanged({ autoDetect: true, overlay: null }, { autoDetect: false, overlay: null }));

  ok('explain: overlay set but nothing bound', (bc.explainBootConfig({ autoDetect: false, overlay: 'imx519' }, 0) || '').includes('ribbon cable'));
  ok('explain: auto-detect found nothing', (bc.explainBootConfig({ autoDetect: true, overlay: null }, 0) || '').includes('CSI camera module'));
  ok('explain: auto off and no overlay', (bc.explainBootConfig({ autoDetect: false, overlay: null }, 0) || '').includes('never looks'));
  ok('explain: silent when a camera is there', bc.explainBootConfig({ autoDetect: true, overlay: null }, 1) === null);
  ok('catalogue has the arducam 16MP with a tuning file', !!bc.moduleById('imx519')?.tuningFile);

  // ---- switching module reconciles the camera settings ----
  const imx = bc.moduleById('imx519')!;
  const ovMod = bc.moduleById('ov5647')!;
  const rpiCam = { name: 'cam1', type: 'rpicam', width: 1280, height: 720, fps: 25 } as Record<string, unknown>;
  const withImxTuning = bc.reconcileCameras([{ ...rpiCam }], imx);
  ok('module with a tuning file fills it in', withImxTuning[0].tuningFile === imx.tuningFile);
  // The trap: an IMX519 tuning file is a *sensor* calibration; leaving it on an OV5647
  // silently gives that sensor the wrong colour and exposure model.
  const swapped = bc.reconcileCameras([{ ...rpiCam, tuningFile: imx.tuningFile, focus: 'manual', lensPosition: 0 }], ovMod);
  ok('switching sensors drops the old tuning file', swapped[0].tuningFile === undefined);
  ok('and the focus mode a fixed-focus sensor cannot use', swapped[0].focus === undefined && swapped[0].lensPosition === undefined);
  const handEntered = bc.reconcileCameras([{ ...rpiCam, tuningFile: '/home/pi/mine.json' }], ovMod);
  ok('a hand-entered tuning path is left alone', handEntered[0].tuningFile === '/home/pi/mine.json');
  const usb = bc.reconcileCameras([{ name: 'u', type: 'usb', width: 640, height: 480, fps: 30, tuningFile: imx.tuningFile } as Record<string, unknown>], ovMod);
  ok('usb cameras are untouched', usb[0].tuningFile === imx.tuningFile);
  ok('idempotent', JSON.stringify(bc.reconcileCameras(swapped, ovMod)) === JSON.stringify(swapped));

  // ---- CSI camera detection (pure part) ----
  const { parseCameraList, captureNodes, explainNoCamera } = await import(
    '../packages/gateway/src/system/cameras'
  );
  ok(
    'parseCameraList reads rpicam-hello',
    parseCameraList('Available cameras\n-----------------\n0 : imx519 [4656x3496] (/base/soc/i2c0mux/i2c@1/imx519@1a)')[0].startsWith(
      'imx519',
    ),
  );
  ok('parseCameraList empty on none', parseCameraList('No cameras available!').length === 0);
  ok(
    'captureNodes drops codec nodes',
    captureNodes(['/dev/video0', '/dev/video10', '/dev/video31']).join() === '/dev/video0',
  );
  ok('explainNoCamera names dtoverlay', explainNoCamera(true).includes('dtoverlay'));
  ok('explainNoCamera names rpicam-apps', explainNoCamera(false).includes('rpicam-apps'));


  // ---- camera name / device sanitisation (no YAML break, no shell injection) ----
  const { safeStreamName, generateGo2rtcYaml } = await import('../packages/gateway/src/video/cameraManager');
  ok('safeStreamName charset only', /^[A-Za-z0-9_-]+$/.test(safeStreamName('cam 1: $(reboot)')));
  ok('safeStreamName empty → cam', safeStreamName('') === 'cam');
  const evilCam: CameraCfg = { name: 'bad name!', type: 'usb', device: '/dev/video0; rm -rf /', width: 1281, height: 721, fps: 30 };
  const evilSrc = cameraSource(evilCam, 'libx264');
  ok('device injection neutralised', !evilSrc.includes('rm -rf') && evilSrc.includes('-i /dev/video0 '));
  const dims = evilSrc.match(/-video_size (\d+)x(\d+)/);
  ok('usb dims coerced even', !!dims && Number(dims[1]) % 2 === 0 && Number(dims[2]) % 2 === 0);
  ok('yaml stream key sanitised', /\n {2}bad_name:/.test(generateGo2rtcYaml([{ name: 'bad name!', type: 'sim', width: 320, height: 240, fps: 10 }], 'libx264')));

  // ---- throttling: heat and voltage must never be confused ----
  {
    const H = await import('../packages/gateway/src/system/health');
    // The mask measured on a real Pi with a sagging supply.
    const sag = H.parseThrottled('throttled=0x50005');
    ok('under-voltage now', sag.now === true && sag.since === true);
    ok('and the clock is clamped', sag.clampedNow === true);
    ok('but not because of heat', sag.hotNow === false);

    // A sealed box in the sun: clamped, hot, supply perfectly fine.
    const hot = H.parseThrottled('throttled=0xC');
    ok('thermal clamp is seen', hot.clampedNow === true && hot.hotNow === true);
    ok('and does not claim a supply problem', hot.now === false && hot.since === false);

    ok('a healthy box is quiet', JSON.stringify(H.parseThrottled('throttled=0x0')) === JSON.stringify({ now: false, since: false, clampedNow: false, hotNow: false }));
    ok('an unreadable answer is unknown, not healthy', H.parseThrottled('command not found').now === null);

    const base = { undervoltageNow: false, undervoltage: false, thermalClampNow: false, clockClampedNow: false };
    ok('nothing to explain when all is well', H.explainClamp(base) === null);
    // The fixes are not interchangeable, so the words must not be either.
    ok('a sag points at the battery and the converter', /battery|buck|panel/.test(H.explainClamp({ ...base, undervoltageNow: true }) ?? ''));
    ok('heat points at shade and airflow', /shade|vent|heatsink/.test(H.explainClamp({ ...base, thermalClampNow: true, clockClampedNow: true }) ?? ''));
    ok('and never at the supply', !/battery|buck/.test(H.explainClamp({ ...base, thermalClampNow: true, clockClampedNow: true }) ?? ''));
    ok('a clamp with no heat is a supply problem', /supply|rail/.test(H.explainClamp({ ...base, clockClampedNow: true }) ?? ''));
    ok('a past sag is still worth saying', /headroom|sagged/.test(H.explainClamp({ ...base, undervoltage: true }) ?? ''));

    const { defaultRules } = await import('../packages/gateway/src/system/alerts');
    ok('a new box watches heat too', defaultRules().some((r) => r.target === 'thermal'));
  }

  // ---- native driver modules: allowlist, npm args, failure diagnosis ----
  // These sentences are the whole user-facing failure story on a gateway that may
  // only be reachable from a phone, so they are pinned here.
  const { isHwDep, npmInstallArgs, explainNpmFailure, errorExcerpt, lastLines, HW_DEPS } = await import('../packages/gateway/src/system/hwDeps');
  ok('allowlist has exactly the one module we need', HW_DEPS.length === 1 && isHwDep('i2c-bus'));
  ok('allowlist rejects everything else', !isHwDep('rimraf') && !isHwDep('pigpio') && !isHwDep('i2c-bus; rm -rf /') && !isHwDep('') && !isHwDep(42));
  ok('npm args target the gateway workspace', npmInstallArgs('i2c-bus').join(' ') === 'install i2c-bus -w @yondergate/gateway --no-audit --no-fund --foreground-scripts');
  // Without --foreground-scripts npm hides the build output of an optional dependency,
  // which is where the reason for a failed install lives.
  ok('npm args show the build output', npmInstallArgs('i2c-bus').includes('--foreground-scripts'));
  ok('npm args carry no shell syntax', npmInstallArgs('i2c-bus').every((a) => !/[;&|$`<>]/.test(a)));

  const netFail = explainNpmFailure('npm error code ENOTFOUND\nnpm error network request to https://registry.npmjs.org/i2c-bus failed');
  ok('no internet is named as such', /internet|registry/.test(netFail.cause) && /WiFi|LTE/.test(netFail.fix));
  // Regression: a node-gyp stack trace mentions the identifier `eNotFound`, which a
  // case-insensitive ENOTFOUND match read as "the Pi has no internet" — on a log whose
  // real cause was a broken Python. Error codes are matched case-sensitively now.
  const camelTrap = explainNpmFailure(
    'gyp ERR! stack at getNotFoundError (/opt/yondergate/node_modules/which/which.js:13:12)\n' +
      "ModuleNotFoundError: No module named 'distutils'",
    { dep: 'i2c-bus', silentDrop: true },
  );
  ok('camelCase identifier is not read as a network error', !/internet|registry/.test(camelTrap.cause));
  ok('the real cause (python/distutils) wins', camelTrap.cause.includes('distutils') && camelTrap.fix.includes('python3-setuptools'));
  ok('a real ENOTFOUND is still caught', explainNpmFailure('npm error code ENOTFOUND').cause.includes('internet'));
  // npm exits 0 when an optionalDependency fails to build: that must never read as success.
  const silent = explainNpmFailure('up to date in 2s', { dep: 'i2c-bus', silentDrop: true });
  ok('a silently dropped module is explained', silent.cause.includes('optional dependency') && silent.fix.includes('build-essential'));
  const excerpt = errorExcerpt('n1\nn2\nn3\nn4\nfatal error: pigpio.h: No such file\ndetail\nboilerplate', 3);
  ok('excerpt starts just before the error, not at the end', excerpt === 'n3\nn4\nfatal error: pigpio.h: No such file', excerpt);
  ok('excerpt without an error keeps the tail', errorExcerpt('a\nb\nc', 2) === 'b\nc');

  const gypFail = explainNpmFailure('npm error gyp ERR! stack Error: not found: make\nnpm error gyp ERR! stack at getNotFoundError');
  ok('missing compiler points at build-essential', gypFail.fix.includes('sudo apt install -y build-essential'));
  ok('missing python is its own case', explainNpmFailure('npm error gyp ERR! find Python').fix.includes('python3'));
  ok('timeout has its own explanation', explainNpmFailure('', { timedOut: true }).cause.includes('too long'));
  ok('full disk is recognised', explainNpmFailure('npm error ENOSPC: no space left on device').cause.includes('full'));
  ok('permission trouble suggests chown', explainNpmFailure('npm error EACCES: permission denied, mkdir').fix.includes('chown'));
  const unknown = explainNpmFailure('something nobody anticipated');
  ok('an unknown failure still says something useful', unknown.cause.length > 0 && unknown.fix.length > 0);
  ok('log tail keeps the end', lastLines('a\nb\nc\nd', 2) === 'c\nd');
  ok('log tail drops blank lines', lastLines('a\n\n\nb', 5) === 'a\nb');

  // The sim system runs the same flow end to end on a dev machine (`sys` above).
  const simSys = sys;
  ok('sim: nothing installed initially', (await simSys.hwDeps()).every((d) => !d.installed));
  const simOk = await simSys.hwDepInstall('i2c-bus');
  ok('sim: install succeeds and sticks', simOk.ok && (await simSys.hwDeps()).some((d) => d.name === 'i2c-bus' && d.installed));
  ok('sim: install asks for a service restart', simOk.restartRequired === true);

  // ---- WiFi scan parsing + hotspot arguments ----
  const { parseWifiScan, HOTSPOT_DEFAULTS } = await import('../packages/gateway/src/system/SystemManager');
  const scan = parseWifiScan(
    [
      '*:88:WPA2:Weber-Home',
      ' :74:WPA2:Weber-Home-5G',
      ' :51:WPA1 WPA2:FRITZ\\!Box 7590',
      ' :33::Gastnetz', // open network → empty SECURITY
      ' :20:WPA2:', // hidden SSID → dropped
      ' :44:WPA2:Weber-Home', // same SSID on another band → keep the strongest
      ' :12:WPA2:Cafe\\: Central', // escaped colon inside the SSID
    ].join('\n'),
  );
  ok('scan drops hidden networks', !scan.some((n) => n.ssid === ''));
  ok('scan dedupes by ssid', scan.filter((n) => n.ssid === 'Weber-Home').length === 1);
  ok('scan keeps the strongest', scan.find((n) => n.ssid === 'Weber-Home')?.signal === 88);
  ok('scan sorts strongest first', scan[0].ssid === 'Weber-Home' && scan[scan.length - 1].signal <= scan[0].signal);
  ok('scan marks the active network', scan.find((n) => n.ssid === 'Weber-Home')?.active === true);
  ok('scan detects open networks', scan.find((n) => n.ssid === 'Gastnetz')?.secured === false);
  ok('scan keeps secured flag', scan.find((n) => n.ssid === 'Weber-Home-5G')?.secured === true);
  ok('scan unescapes colons', scan.some((n) => n.ssid === 'Cafe: Central'), scan.map((n) => n.ssid).join('|'));
  ok('scan of nothing is empty', parseWifiScan('').length === 0);

  ok('hotspot default is open', HOTSPOT_DEFAULTS.password === null);

  // ---- one version, three places ----
  // The banner, the setup header and the update check all show it; a hardcoded copy
  // in the service was one more thing to forget on release day.
  const { readVersion } = await import('../packages/gateway/src/config');
  const pkgVersion = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
  ok('the gateway reads its version from package.json', readVersion() === pkgVersion, `${readVersion()} vs ${pkgVersion}`);
  ok('no hardcoded version left in the gateway banner', !/YonderGate gateway service {2}v\d/.test(readFileSync('packages/gateway/src/index.ts', 'utf8')));

  // ---- the two READMEs must not drift apart ----
  // A translation that lags is worse than none: it states as current something the
  // project stopped doing, and the reader cannot tell which of the two is the lie. This
  // will not catch a bad translation, but it catches the case that actually happens —
  // a section or a TODO item added to one of them and not the other.
  {
    const en = readFileSync('README.md', 'utf8');
    const de = readFileSync('README.de.md', 'utf8');
    const heads = (t: string) => (t.match(/^#{2,3} /gm) ?? []).length;
    const items = (t: string) => (t.match(/^- \[[ x]\] /gm) ?? []).length;
    const done = (t: string) => (t.match(/^- \[x\] /gm) ?? []).length;
    ok('both READMEs exist', en.length > 0 && de.length > 0);
    ok('each points at the other', en.includes('[Deutsch](README.de.md)') && de.includes('[English](README.md)'));
    ok('the same sections in both', heads(en) === heads(de), `${heads(en)} vs ${heads(de)}`);
    ok('the same TODO items in both', items(en) === items(de), `${items(en)} vs ${items(de)}`);
    ok('and the same ones ticked', done(en) === done(de), `${done(en)} vs ${done(de)}`);
    // The German one links the German docs, or it sends the reader back to English.
    ok('the German README links the German docs',
      de.includes('docs/HARDWARE.de.md') && de.includes('docs/DATA-BUDGET.de.md'));
    ok('and CLAUDE.md says both are edited together',
      readFileSync('CLAUDE.md', 'utf8').includes('Both language versions are edited in the same commit'));
  }

  // ---- the 80 % warning for a card billed per megabyte ----
  // The monthly allowance answers "how much of this month's bucket is gone". A prepaid
  // card billed per MB has no bucket and no month — what runs out is the balance.
  const U2 = await import('../packages/gateway/src/system/usage');
  const t0 = Date.UTC(2026, 0, 10);
  let u = U2.emptyUsage(U2.billingMonth(t0));
  u = U2.recordTopUp(u, t0);
  // 100 MB at 5 ct/MB = 5 € of a 10 € card.
  u = U2.accumulate(u, 0, t0);
  u = U2.accumulate(u, 100e6, t0 + 3600_000);
  ok('the credit total tracks the bytes', u.sinceTopUp === 100e6, String(u.sinceTopUp));
  let c = U2.creditStatus(u, 10, 5);
  ok('spent is bytes times price', Math.abs((c.spentEur ?? 0) - 5) < 0.001, String(c.spentEur));
  ok('and half the card is left', Math.abs((c.leftEur ?? 0) - 5) < 0.001);
  ok('50 % does not warn', c.percent === 50 && !c.warn && !c.over);
  u = U2.accumulate(u, 170e6, t0 + 7200_000);
  c = U2.creditStatus(u, 10, 5);
  ok('80 % of the credit warns', c.warn && !c.over, String(c.percent));
  u = U2.accumulate(u, 220e6, t0 + 10800_000);
  ok('and an empty card is over', U2.creditStatus(u, 10, 5).over);
  ok('no credit configured means no warning', !U2.creditStatus(u, null, 5).warn && U2.creditStatus(u, null, 5).percent === null);

  // The billing month must reset the monthly figure and leave the credit alone: the
  // two answer different questions and only one of them owns a calendar.
  const creditNextMonth = Date.UTC(2026, 1, 2);
  const creditRolled = U2.accumulate(u, 260e6, creditNextMonth);
  ok('a new month zeroes the monthly total', creditRolled.bytes === 40e6, String(creditRolled.bytes));
  ok('but not the credit total', creditRolled.sinceTopUp === 260e6, String(creditRolled.sinceTopUp));
  ok('a top-up starts the credit again', U2.recordTopUp(creditRolled, creditNextMonth).sinceTopUp === 0);
  ok('and records when', (U2.recordTopUp(creditRolled, creditNextMonth).topUpAt ?? '').startsWith('2026-02-02'));

  // "lasts about 40 more days" is what says whether the next top-up is a diary entry
  // or a problem. Under a day of history it must refuse to guess.
  const f = U2.creditForecast(creditRolled, 20, 5, creditNextMonth);
  ok('the forecast projects from what was actually spent', (f.daysLeft ?? 0) > 0, JSON.stringify(f));
  ok('a fresh top-up is not projected from', U2.creditForecast(U2.recordTopUp(creditRolled, creditNextMonth), 20, 5, creditNextMonth).daysLeft === null);

  // One status for both shapes, so the alert rule does not branch on the tariff.
  const credited = U2.dataStatus(u, { plan: 'credit', capGb: null, creditEur: 10, pricePerMbCents: 5 });
  ok('the credit plan reports its own arithmetic', credited.over && credited.detail.includes('€'), credited.detail);
  const monthly = U2.dataStatus(u, { plan: 'monthly', capGb: 1, creditEur: null, pricePerMbCents: null });
  ok('the monthly plan is unchanged', monthly.detail.includes('GB'), monthly.detail);
  // An old usage.json predates both fields; it must load rather than produce NaN.
  const legacy = { month: '2026-01', bytes: 5e6, lastCounter: 5e6, updated: null };
  ok('a counter file from before this feature still works',
    U2.accumulate(legacy, 6e6, t0).sinceTopUp === 1e6 && U2.creditStatus(legacy, 10, 5).spentEur === 0);

  // ---- WireGuard set up by hand ----
  // The upload path stays; this is the other half, for a peer that came as a page of
  // values rather than a file. One stored representation (the .conf) either way, so the
  // two cannot drift apart.
  const WG = await import('../packages/gateway/src/system/wireguard');
  // Real-shaped keys: 32 bytes of base64, which is 43 characters and a '='.
  const KEY_A = '4k9IqqA4sX3r013U7WoG3R/clIqSHynjMP0qj/w/stw=';
  const KEY_B = 'KpcpI1RB/6lURHP/5Tb84x7wx3H7+iI65kz/cqjvACI=';
  ok('a WireGuard key is recognised', WG.isWireguardKey(KEY_A) && WG.isWireguardKey(KEY_B));
  ok('a truncated key is not', !WG.isWireguardKey(KEY_A.slice(0, 20)));
  ok('an unpadded key is not', !WG.isWireguardKey(KEY_A.slice(0, 43) + 'x'));
  ok('a name endpoint is fine', WG.isEndpoint('vpn.example.org:51820'));
  ok('so is an address', WG.isEndpoint('203.0.113.9:51820'));
  ok('so is a bracketed v6 one', WG.isEndpoint('[2001:db8::1]:51820'));
  ok('a missing port is not', !WG.isEndpoint('vpn.example.org'));
  ok('an impossible port is not', !WG.isEndpoint('vpn.example.org:70000'));
  // People type what their server told them, which is often a bare address.
  ok('a bare v4 address becomes a host route', WG.normaliseCidrList('10.0.0.2') === '10.0.0.2/32');
  ok('a bare v6 address too', WG.normaliseCidrList('fd00::2') === 'fd00::2/128');
  ok('a list keeps its prefixes', WG.normaliseCidrList('0.0.0.0/0, ::/0') === '0.0.0.0/0, ::/0');

  const wgGood = {
    ...WG.WIREGUARD_DEFAULTS,
    privateKey: KEY_A, address: '10.0.0.2/32', peerPublicKey: KEY_B, endpoint: 'vpn.example.org:51820',
  };
  ok('a complete set validates', WG.validateWireguardFields(wgGood) === null, String(WG.validateWireguardFields(wgGood)));
  // Every message has to say what to do about it — this is read on a phone.
  const missingKey = WG.validateWireguardFields({ ...wgGood, privateKey: '' }) ?? '';
  ok('a missing private key names the fix', missingKey.includes('wg genkey'), missingKey);
  ok('but not when one is already stored', WG.validateWireguardFields({ ...wgGood, privateKey: '' }, { keyStored: true }) === null);
  ok('a bad peer key is caught', (WG.validateWireguardFields({ ...wgGood, peerPublicKey: 'nope' }) ?? '').includes('public key'));
  ok('a bad endpoint names the shape', (WG.validateWireguardFields({ ...wgGood, endpoint: 'vpn.example.org' }) ?? '').includes('host:port'));
  ok('a missing address is caught', (WG.validateWireguardFields({ ...wgGood, address: '' }) ?? '').includes('inside the tunnel'));
  ok('a stray preshared key is caught', (WG.validateWireguardFields({ ...wgGood, presharedKey: 'x' }) ?? '').includes('genpsk'));

  const built = WG.buildWireguardConf(wgGood);
  ok('what it builds is a WireGuard conf', WG.looksLikeWireguardConf(built), built);
  ok('the optional lines stay out when empty', !built.includes('DNS') && !built.includes('ListenPort') && !built.includes('PresharedKey'));
  // Behind CGNAT a tunnel without keepalive works until the first idle minute.
  ok('keepalive is there by default', built.includes('PersistentKeepalive = 25'));

  // The round trip is what lets an uploaded file be edited field by field afterwards.
  const back = WG.parseWireguardConf(built);
  ok('a built conf parses back to the same values',
    back.privateKey === KEY_A && back.peerPublicKey === KEY_B && back.endpoint === 'vpn.example.org:51820' && back.address === '10.0.0.2/32',
    JSON.stringify(back));
  // Base64 ends in '=', so splitting a line on every '=' truncates every key in the file.
  ok('a key is not cut at its own padding', back.privateKey.endsWith('='));

  const foreign = [
    '# exported by something else', '[Interface]', 'privatekey=' + KEY_A, 'Address = 10.0.0.9/24',
    'DNS = 10.0.0.1', 'MTU = 1412', '', '[Peer]', 'PublicKey   =   ' + KEY_B,
    'AllowedIPs = 192.168.178.0/24', 'Endpoint = fritz.box:51820', 'PersistentKeepalive = 25',
  ].join('\n');
  const wgParsed = WG.parseWireguardConf(foreign);
  ok('a foreign file parses too', wgParsed.address === '10.0.0.9/24' && wgParsed.dns === '10.0.0.1' && wgParsed.endpoint === 'fritz.box:51820', JSON.stringify(wgParsed));
  ok('lower-case and loose spacing are fine', wgParsed.privateKey === KEY_A && wgParsed.peerPublicKey === KEY_B);
  ok('comments are ignored', !wgParsed.address.includes('#'));
  // Rebuilding that file from the form would drop MTU — say so rather than find out later.
  ok('what the form cannot hold is named', WG.unsupportedWireguardKeys(foreign).includes('MTU'), WG.unsupportedWireguardKeys(foreign).join(','));
  ok('and what it can hold is not', !WG.unsupportedWireguardKeys(foreign).includes('Address'));
  ok('one peer is not several', !WG.hasMultiplePeers(foreign));
  ok('two peers are', WG.hasMultiplePeers(foreign + '\n[Peer]\nPublicKey = ' + KEY_A));

  // The page may fill in everything except the two secrets: /api/remote answers without
  // the API secret, and this box's onboarding hotspot is open by default.
  const pub = WG.redactWireguardFields(wgGood);
  ok('the private key never leaves the box', !('privateKey' in pub) && pub.hasPrivateKey === true);
  ok('nor does a preshared key', !('presharedKey' in pub) && pub.hasPresharedKey === false);
  ok('the rest is there to fill the form', pub.endpoint === 'vpn.example.org:51820' && pub.address === '10.0.0.2/32');

  // ---- when the tunnel is allowed to be up ----
  // The mode that saves the most data is also the one that can lock you out of a box
  // in a field, so most of these are about the ways it must refuse to do that.
  const UP = await import('../packages/gateway/src/system/uplink');
  const win = { ...UP.UPLINK_DEFAULTS, mode: 'window' as const }; // Sundays 14:00, 15 min
  const sun = (h: number, m: number) => new Date(2026, 7, 23, h, m); // 2026-08-23 is a Sunday
  const mon = (h: number, m: number) => new Date(2026, 7, 24, h, m);

  ok('inside the window', UP.inWindow(sun(14, 5), win));
  ok('the last minute still counts', UP.inWindow(sun(14, 14), win));
  ok('one minute before is not open yet', !UP.inWindow(sun(13, 59), win));
  ok('it closes on time', !UP.inWindow(sun(14, 15), win));
  ok('the wrong day is closed', !UP.inWindow(mon(14, 5), win));

  // A window that runs past midnight must not silently close at 00:00 — the second
  // half of it belongs to a date whose weekday no longer matches.
  const late = { ...win, hour: 23, minute: 50, durationMinutes: 30 };
  ok('a window over midnight stays open before midnight', UP.inWindow(sun(23, 55), late));
  ok('and after it', UP.inWindow(mon(0, 10), late));
  ok('and closes at the right time', !UP.inWindow(mon(0, 25), late));

  ok('the next window is the coming Sunday', UP.nextWindowStart(mon(9, 0), win).getDay() === 0);
  ok('an open window points at the next one, not itself',
    UP.nextWindowStart(sun(14, 5), win).getTime() === new Date(2026, 7, 30, 14, 0).getTime());
  ok('the window reads as people write it', UP.describeWindow(win) === 'Sundays 14:00–14:15', UP.describeWindow(win));
  ok('a window over midnight reads correctly', UP.describeWindow(late) === 'Sundays 23:50–00:20', UP.describeWindow(late));

  const base = { cfg: win, startedAt: new Date(2026, 7, 20).getTime(), someoneIsHere: false };
  ok('always-live is always up', UP.shouldBeUp({ ...base, cfg: UP.UPLINK_DEFAULTS, now: mon(9, 0) }).up);
  ok('outside the window it comes down', !UP.shouldBeUp({ ...base, now: mon(9, 0) }).up);
  ok('inside the window it is up', UP.shouldBeUp({ ...base, now: sun(14, 5) }).up);
  // Three refusals to strand the operator:
  ok('a fresh restart stays reachable',
    UP.shouldBeUp({ ...base, now: mon(9, 0), startedAt: mon(8, 55).getTime() }).up);
  ok('and says for how long',
    UP.shouldBeUp({ ...base, now: mon(9, 0), startedAt: mon(8, 55).getTime() }).reason.includes('another 5 min'));
  ok('somebody on the page keeps it up',
    UP.shouldBeUp({ ...base, now: mon(9, 0), someoneIsHere: true }).up);
  ok('opening it by hand keeps it up',
    UP.shouldBeUp({ ...base, now: mon(9, 0), openUntil: mon(9, 30).getTime() }).up);
  ok('and an expired hand-open does not',
    !UP.shouldBeUp({ ...base, now: mon(9, 31), openUntil: mon(9, 30).getTime() }).up);
  ok('the reason names the next window', UP.shouldBeUp({ ...base, now: mon(9, 0) }).reason.includes('Sundays 14:00'));

  // A phone on the hotspot probing for a captive portal must not read as "somebody is
  // here" — that would hold the tunnel open all week and quietly undo the mode.
  ok('the page polling counts as presence', UP.countsAsPresence('/api/system'));
  ok('so does any other api call', UP.countsAsPresence('/api/health'));
  ok('a captive-portal probe does not', !UP.countsAsPresence('/generate_204'));
  ok('nor does loading the page itself', !UP.countsAsPresence('/setup'));
  ok('nor a bare request', !UP.countsAsPresence('/') && !UP.countsAsPresence(undefined));

  // Buffering: a week of a flapping sensor must not eat the disk, and must not arrive
  // as forty notifications the second the window opens.
  const mkAlert = (id: string, title: string, priority: 'default' | 'high' = 'default') =>
    ({ id, title, message: `${title} body`, priority, tags: [] });
  let buf: import('../packages/gateway/src/system/uplink').BufferedAlert[] = [];
  for (let i = 0; i < 250; i += 1) buf = UP.addBuffered(buf, mkAlert('v:low', 'Voltage low'), mon(1, 0).getTime() + i);
  ok('the buffer is capped', buf.length === UP.MAX_BUFFERED, String(buf.length));
  ok('the newest are the ones kept', buf[buf.length - 1].at === mon(1, 0).getTime() + 249);

  ok('nothing buffered means nothing to send', UP.digestBuffered([]) === null);
  let two = UP.addBuffered([], mkAlert('v:low', 'Voltage low'), mon(1, 0).getTime());
  two = UP.addBuffered(two, mkAlert('v:low', 'Voltage low'), mon(5, 0).getTime());
  two = UP.addBuffered(two, mkAlert('dev:gone', 'Camera gone', 'high'), mon(6, 0).getTime());
  const digest = UP.digestBuffered(two, 'Hütte')!;
  ok('one message for everything', digest.id === 'uplink:digest');
  ok('grouped by what went wrong, with a count', digest.message.includes('2× between'), digest.message);
  ok('a one-off keeps its timestamp instead of a count', digest.message.includes('Camera gone — '));
  ok('the site is named', digest.title.includes('Hütte'));
  ok('one urgent thing makes the digest urgent', digest.priority === 'high');
  ok('two things are counted as two', digest.title.startsWith('2 things'), digest.title);

  // ---- holding alerts until the window opens ----
  // The pure parts are above; this is the thin IO around them, and it is worth a real
  // test because it is where the promise of the feature actually lives: an alert that
  // happens on Tuesday has to survive until Sunday, including a reboot in between.
  {
    const AS = await import('../packages/gateway/src/system/AlertService');
    const dir = mkdtempSync(join(tmpdir(), 'ygw-alerts-'));
    const received: string[] = [];
    const srv = createServer((rq, rs) => {
      let body = '';
      rq.on('data', (c) => { body += c; });
      rq.on('end', () => { received.push(body); rs.writeHead(200); rs.end('ok'); });
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const port = (srv.address() as { port: number }).port;
    const cfg = {
      siteName: 'Hütte',
      stateDir: dir,
      alerts: { enabled: true, ntfyUrl: `http://127.0.0.1:${port}/ygw`, ntfyToken: null, rules: [] },
      data: { capGb: 0 },
    } as unknown as Parameters<typeof AS.AlertService.prototype.constructor>[0];
    const mkService = () =>
      new AS.AlertService(cfg as never, {} as never, {} as never);

    const alerts = mkService();
    let holding = true;
    alerts.setHoldGate(() => holding);
    const a = (id: string, title: string, priority: 'default' | 'high' = 'default') =>
      ({ id, title, message: `${title} body`, priority, tags: [] });

    await alerts.notify(a('v:low', 'Voltage low'));
    await alerts.notify(a('v:low', 'Voltage low'));
    await alerts.notify(a('cam:gone', 'Camera gone', 'high'));
    ok('nothing goes out while the window is shut', received.length === 0, String(received.length));
    ok('they are counted for the page', alerts.bufferedCount() === 3, String(alerts.bufferedCount()));
    // The whole point of writing them down: the box may well reboot before Sunday.
    ok('they are on disk, not just in RAM', existsSync(join(dir, 'alert-buffer.json')));
    const afterReboot = mkService();
    afterReboot.setHoldGate(() => holding);
    ok('a restart does not lose them', afterReboot.bufferedCount() === 3, String(afterReboot.bufferedCount()));

    // A test message is the operator standing there asking "does this work" — it must
    // not be filed away until Sunday.
    await afterReboot.test();
    ok('a test message goes out anyway', received.length === 1, String(received.length));

    holding = false;
    const flushed = await afterReboot.flushBuffered();
    ok('the window sends what was held', flushed.ok && received.length === 2, JSON.stringify(flushed));
    ok('as one message, not three', received.filter((r) => r.includes('2× between')).length === 1, received[1]);
    ok('the buffer is empty afterwards', afterReboot.bufferedCount() === 0);
    ok('and stays empty across a restart', mkService().bufferedCount() === 0);
    ok('once open, alerts go straight out', (await afterReboot.notify(a('v:low', 'Voltage low'))).ok && received.length === 3);

    // ntfy blinking must not throw away the one message of the week.
    holding = true;
    await afterReboot.notify(a('v:low', 'Voltage low'));
    await new Promise<void>((r) => srv.close(() => r()));
    holding = false;
    const failedFlush = await afterReboot.flushBuffered();
    ok('a failed flush keeps the alerts', !failedFlush.ok && afterReboot.bufferedCount() === 1, JSON.stringify(failedFlush));
  }

  // ---- the service that acts on all that ----
  // The pure decision is tested above; this checks that the two side effects actually
  // happen, in the right order: the tunnel first, the held alerts only once it is up.
  {
    const US = await import('../packages/gateway/src/system/UplinkService');
    const calls: string[] = [];
    // remoteUp/remoteDown, not the Tailscale calls: the window has to work for
    // whichever of the three remote-access methods the owner picked.
    const sys = {
      remoteUp: async () => { calls.push('up'); return { ok: true, message: 'up' }; },
      remoteDown: async () => { calls.push('down'); return { ok: true, message: 'down' }; },
    };
    let flushes = 0;
    const alertStub = { bufferedCount: () => 2, flushBuffered: async () => { flushes += 1; calls.push('flush'); return { ok: true, message: '' }; } };
    const cfg = { uplink: { ...UP.UPLINK_DEFAULTS, mode: 'window' as const, bootGraceMinutes: 0 }, remoteAccess: { kind: 'tailscale' } };
    const act = { lastApiAt: null as number | null };
    const svc = new US.UplinkService(cfg as never, sys as never, alertStub as never, act);
    const settle = () => new Promise<void>((r) => setTimeout(r, 20));

    svc.start(3_600_000);
    await settle();
    ok('outside the window the tunnel is taken down', calls.join(',') === 'down', calls.join(','));
    ok('and alerts are held', svc.holdsAlerts());

    svc.openFor(30);
    await settle();
    ok('opening it by hand brings the tunnel up', calls.join(',') === 'down,up,flush', calls.join(','));
    ok('the held alerts go out only after it is up', calls.indexOf('flush') > calls.indexOf('up'));
    ok('and are no longer held', !svc.holdsAlerts());
    ok('the page can see what is going on', svc.snapshot().up && svc.snapshot().buffered === 2);

    svc.closeNow();
    await settle();
    ok('closing it by hand puts the schedule back in charge', calls.join(',') === 'down,up,flush,down', calls.join(','));
    ok('nothing is flushed twice', flushes === 1);

    // 'always' must not touch a tunnel the operator brought up by hand.
    const always = new US.UplinkService({ uplink: UP.UPLINK_DEFAULTS, remoteAccess: { kind: 'tailscale' } } as never, sys as never, alertStub as never, act);
    const before = calls.length;
    always.start(3_600_000);
    await settle();
    ok('always-live never moves the tunnel', calls.length === before, calls.slice(before).join(','));
    ok('and never holds an alert', !always.holdsAlerts());
    svc.stop();
    always.stop();
  }

  // ---- the page on a metered link ----
  // This gateway is reached over LTE on a tariff bought for alerts, not for browsing.
  // Two things pay for themselves there: not sending 120 kB of unchanged page, and not
  // polling a tab nobody is looking at.
  const M = await import('../packages/gateway/src/transport/metered');
  ok('gzip is accepted when offered', M.acceptsGzip('gzip, deflate, br'));
  ok('a client that refuses gzip is believed', !M.acceptsGzip('gzip;q=0, deflate'));
  ok('no header means no gzip', !M.acceptsGzip(undefined));
  ok('a wildcard counts', M.acceptsGzip('*'));
  ok('tiny bodies are left alone', !M.worthCompressing(400) && M.worthCompressing(2000));

  const pageLike = 'x'.repeat(50) + JSON.stringify({ a: 1 }).repeat(400);
  const gz = M.encodeBody(pageLike, 'text/html', 'gzip');
  const plain = M.encodeBody(pageLike, 'text/html', undefined);
  ok('compression actually shrinks the page', gz.body.length < plain.body.length / 2, `${gz.body.length} vs ${plain.body.length}`);
  ok('the encoding is declared', gz.headers['content-encoding'] === 'gzip' && !plain.headers['content-encoding']);
  ok('content-length matches the bytes sent', Number(gz.headers['content-length']) === gz.body.length);
  // A cache that hands a gzipped copy to a client which asked for plain is a page that
  // never loads, and the only way to see it is standing at the site.
  ok('both answers vary on accept-encoding', gz.headers['vary'] === 'accept-encoding' && plain.headers['vary'] === 'accept-encoding');
  ok('a small body is not compressed even when gzip is offered', !M.encodeBody('{"ok":true}', 'application/json', 'gzip').headers['content-encoding']);

  // The validator is over the content: `git pull` can restore a byte-identical page
  // with a fresh mtime, and re-sending 120 kB for that is the cost this avoids.
  ok('same content, same etag', M.etagFor('hello') === M.etagFor('hello'));
  ok('changed content, changed etag', M.etagFor('hello') !== M.etagFor('hello!'));
  ok('a held copy is recognised', M.etagMatches(M.etagFor('hello'), M.etagFor('hello')));
  ok('a list of validators is handled', M.etagMatches(`W/"other", ${M.etagFor('hello')}`, M.etagFor('hello')));
  ok('a stale validator is not', !M.etagMatches('W/"stale"', M.etagFor('hello')));

  const page = readFileSync('packages/gateway/src/setup/setup.html', 'utf8');
  ok('the page stops polling when nobody is looking', page.includes("addEventListener('visibilitychange'"));
  ok('no status poll runs outside that scheduler', !/setInterval\((refresh|loadHealth|loadSensorsNow)/.test(page));
  ok('coming back refreshes at once', /if \(visible\) for \(const p of polls\)/.test(page));
  // The watchdog is the largest recurring cost after the tunnel itself; the page says so
  // next to the field rather than leaving it to be discovered on the bill.
  ok('the watchdog interval shows what it costs in data', page.includes("MB a month of mobile data"));
  // A button that silently does nothing most of the time cannot be guessed at, so the
  // cancel only exists while there is a hand-opening to cancel.
  ok('the cancel button is hidden until there is something to cancel',
    /\$\('up-cancel'\)\.style\.display = openUntil \? '' : 'none'/.test(page));
  ok('and says what it ends', page.includes('close again instead of at'));

  // ---- generated video config lives outside the checkout ----
  // It used to be written into docker/go2rtc.yaml inside the repo, which left every
  // running gateway with a modified checkout and blocked `git pull --ff-only`. The two
  // units must agree on the runtime path, or the gateway writes a config go2rtc never
  // reads — a failure that is invisible until the cameras stay dark.
  const go2rtcUnit = readFileSync('provisioning/systemd/go2rtc.service', 'utf8');
  const vehicleUnit = readFileSync('provisioning/systemd/yondergate.service', 'utf8');
  const unitPath = go2rtcUnit.match(/-config\s+(\S+)/)?.[1] ?? '';
  const envPath = vehicleUnit.match(/YGW_GO2RTC_CONFIG=(\S+)/)?.[1] ?? '';
  ok('go2rtc reads a runtime path, not the checkout', unitPath === '/var/lib/yondergate/go2rtc.yaml', unitPath);
  ok('the gateway writes exactly that path', envPath === unitPath, `${envPath} vs ${unitPath}`);
  const installer = readFileSync('provisioning/install.sh', 'utf8');
  ok('the installer creates the directory', installer.includes('install -d -m 0755 /var/lib/yondergate'));

  // ---- zram on a 512 MB board ----
  // The service is small (~54 MB), but `npm install` during an update is not, and a
  // gateway that dies mid-update is one somebody has to drive to. Two things must hold:
  // the swap has to exist *before* the install that needs it, and a box with plenty of
  // RAM must not have zram forced on it.
  ok('the installer sets up zram', installer.includes('apt-get install -y zram-tools'));
  ok('zram is in RAM, not on the card', /PERCENT=\d+/.test(installer) && !/dphys-swapfile\s+setup/.test(installer));
  ok('zram is guarded by a memory check', /MemTotal/.test(installer) && installer.includes('1572864'));
  ok('zram comes before the npm install it protects',
    installer.indexOf('zram-tools') < installer.indexOf('npm install --omit=optional'),
    'swap must exist before the step that needs it');
  ok('re-running the installer does not stack zram config', installer.includes(">>> yondergate") && installer.includes('/# >>> yondergate/,/# <<< yondergate/d'));

  // ---- self-update: what the gateway would do, and in which order ----
  const U = await import('../packages/gateway/src/system/update');
  ok('clean tree recognised', U.parseWorkingTree('').clean === true);
  const dirty = U.parseWorkingTree(' M packages/gateway/src/index.ts\n?? scratch.txt');
  ok('local changes are listed', !dirty.clean && dirty.dirty.includes('packages/gateway/src/index.ts'));
  // Untracked files never block a fast-forward, and every running gateway has some
  // (its own config, logs) — counting them made an ordinary gateway "dirty".
  ok('untracked files do not block', dirty.dirty.every((f) => f !== 'scratch.txt'));
  ok('a gateway with only untracked files is clean', U.parseWorkingTree('?? yondergate-config.json\n?? npm-debug.log').clean === true);
  // docker/go2rtc.yaml is tracked AND rewritten by the gateway at every start, so it
  // is modified on every real gateway — it must not be mistaken for someone's work.
  const gen = U.parseWorkingTree(' M docker/go2rtc.yaml');
  ok('a generated file does not block the update', gen.clean === true && gen.generated.includes('docker/go2rtc.yaml'));
  ok('but it is still noticed', gen.dirty.length === 0 && U.GENERATED_PATHS.includes('docker/go2rtc.yaml'));
  const genSteps = U.updateSteps({ deps: false, provisioning: false, service: true }, U.UPDATE_SOURCE_DEFAULT, ['docker/go2rtc.yaml']);
  ok('generated files are discarded before pulling', genSteps[0].args.join(' ') === 'checkout -- docker/go2rtc.yaml' && genSteps[1].args[0] === 'pull');
  ok('and nothing is discarded when nothing was generated', U.updateSteps({ deps: false, provisioning: false, service: true })[0].args[0] === 'pull');
  const commits = U.parseCommits('7aa5354 v1.42.0 — setup page fits a phone\n651e485 v1.41.2 — no more stale message');
  ok('commits parsed', commits.length === 2 && commits[0].hash === '7aa5354' && commits[0].subject.startsWith('v1.42.0'));
  ok('version read from a package.json blob', U.parseVersion('{"name":"x","version":"1.42.0"}') === '1.42.0');
  ok('broken package.json is null, not a crash', U.parseVersion('{oops') === null);

  // The installer clones as `pi` and the service runs as root, so git refuses with
  // "dubious ownership" unless every call carries this. A global config write was the
  // first attempt and did nothing — a systemd service has no guaranteed $HOME.
  const ga = U.gitArgs('/opt/yondergate', ['fetch', '--quiet', 'origin', 'main']);
  ok('git runs inside the checkout', ga.slice(0, 2).join(' ') === '-C /opt/yondergate');
  ok('the subcommand follows unchanged', ga.slice(-4).join(' ') === 'fetch --quiet origin main');
  // …and the ownership exception is NOT a command-line flag: git only honours
  // safe.directory from protected (system/global) config, which is why the `-c`
  // version silently changed nothing on the Pi.
  ok('no -c safe.directory on the command line', !ga.includes('-c'));
  const sdc = U.safeDirectoryConfig('/opt/yondergate/');
  ok('the exception is a global-config file instead', sdc.includes('[safe]'));
  // The repo root comes from a URL and carries a trailing slash; git compares the
  // value literally, so both spellings go in — and `*`, which is harmless because
  // this file reaches git only through the gateway's own GIT_CONFIG_GLOBAL.
  ok('trailing slash and bare path both listed', sdc.includes('directory = /opt/yondergate\n') && sdc.includes('directory = /opt/yondergate/\n'));
  ok('wildcard as the last resort', sdc.includes('directory = *'));

  // The update source is a site, so a fork or a branch needs no code change.
  ok('a remote name is a source', U.isGitSource('origin') && U.isGitSource('upstream'));
  ok('an https URL is a source', U.isGitSource('https://github.com/you/YonderGate.git'));
  ok('nonsense is rejected', !U.isGitSource('') && !U.isGitSource('two words') && !U.isGitSource(42));
  ok('branch names validated', U.isGitBranch('main') && U.isGitBranch('feature/x') && !U.isGitBranch('') && !U.isGitBranch('a b'));
  const forkSteps = U.updateSteps({ deps: false, provisioning: false, service: true }, { source: 'https://example.com/x.git', branch: 'dev' });
  ok('the pull uses the configured source', forkSteps[0].args.join(' ') === 'pull --ff-only https://example.com/x.git dev');

  // ---- an update must not uninstall the operator's native driver modules ----
  ok('restorable keeps the allowlisted', U.restorableHwDeps(['i2c-bus']).join() === 'i2c-bus');
  // A gateway drives no servos, so its allowlist is i2c-bus alone — YonderRC's pigpio and
  // serialport are not modules this box should ever install.
  ok('restorable drops anything else', U.restorableHwDeps(['i2c-bus', 'pigpio', 'rm -rf /']).join() === 'i2c-bus');
  ok('restorable dedupes', U.restorableHwDeps(['i2c-bus', 'i2c-bus']).join() === 'i2c-bus');
  const depSteps = U.updateSteps({ deps: true, provisioning: false, service: true }, U.UPDATE_SOURCE_DEFAULT, [], ['i2c-bus']);
  ok(
    'update reinstalls the recorded module',
    depSteps.some((st) => st.cmd === 'npm' && st.args.join(' ') === 'install i2c-bus -w @yondergate/gateway --no-audit --no-fund'),
  );
  ok(
    'restore runs after the pruning install',
    depSteps.findIndex((st) => st.args.includes('--omit=optional')) < depSteps.findIndex((st) => st.args.includes('i2c-bus')),
  );
  const noDepSteps = U.updateSteps({ deps: false, provisioning: false, service: true }, U.UPDATE_SOURCE_DEFAULT, [], ['i2c-bus']);
  ok('no restore when nothing was pruned', !noDepSteps.some((st) => st.args.includes('i2c-bus')));

  const impact = U.classifyChanges(['packages/gateway/src/index.ts', 'package.json', 'provisioning/install.sh']);
  ok('changed files classified', impact.service && impact.deps && impact.provisioning);
  ok('a service-only change is just a pull', U.classifyChanges(['packages/gateway/src/index.ts']).deps === false);

  // Order matters: dependencies before the build (vite needs its platform binaries),
  // and the restart happens after both — the setup page IS the service being restarted.
  const stepsAll = U.updateSteps({ deps: true, provisioning: false, service: true }).map((st) => `${st.cmd} ${st.args.join(' ')}`);
  ok('pull comes first, from origin/main by default', stepsAll[0] === 'git pull --ff-only origin main');
    ok('changed dependencies are installed', stepsAll.some((x) => x.includes('--omit=optional')));
  const stepsSmall = U.updateSteps({ deps: false, provisioning: false, service: true }).map((st) => st.cmd);
  ok('a service-only update is just a pull', stepsSmall.length === 1 && stepsSmall[0] === 'git');

  const clean = { clean: true, dirty: [], generated: [] };
  const noConflict: string[] = [];
  const upToDate = U.describeCheck({ ok: true, current: '1.42.0', available: '1.42.0', behind: 0, commits: [], impact: U.classifyChanges([]), tree: clean, conflicts: noConflict });
  ok('up to date says so', upToDate.message.startsWith('Up to date') && upToDate.note === null);
  const behind = U.describeCheck({ ok: true, current: '1.41.0', available: '1.42.0', behind: 3, commits: [], impact: U.classifyChanges(['packages/gateway/src/index.ts']), tree: clean, conflicts: noConflict });
  ok('behind names the versions', behind.message.includes('3 commits behind') && behind.message.includes('v1.42.0'));
    const prov = U.describeCheck({ ok: true, current: '1', available: '2', behind: 1, commits: [], impact: U.classifyChanges(['provisioning/install.sh']), tree: clean, conflicts: noConflict });
  ok('installer changes send you to the full installer', (prov.note || '').includes('install.sh'));
  const dirtyCheck = U.describeCheck({ ok: true, current: '1', available: '2', behind: 1, commits: [], impact: U.classifyChanges([]), tree: { clean: false, dirty: ['a.ts'], generated: [] }, conflicts: ['a.ts'] });
  ok('an overlapping local change blocks, with the reason', dirtyCheck.message.includes('local changes') && (dirtyCheck.note || '').includes('a.ts'));
  // git fast-forwards past local changes it does not touch, so refusing there was
  // stricter than git itself.
  const untouched = U.describeCheck({ ok: true, current: '1', available: '2', behind: 1, commits: [], impact: U.classifyChanges(['README.md']), tree: { clean: false, dirty: ['notes.txt'], generated: [] }, conflicts: [] });
  ok('a local change the update ignores does not block', !untouched.message.includes('will not fast-forward'));
  ok('but it is mentioned', (untouched.note || '').includes('notes.txt'));
  // A failed check must repeat git's own reason. Reporting "needs internet" for a
  // permission problem sent a gateway WITH internet on a wild goose chase.
  const dubious = U.explainGitFailure("fatal: detected dubious ownership in repository at '/opt/yondergate'");
  ok('dubious ownership is recognised, not called a network fault', dubious.cause.includes('belongs to a different user') && dubious.selfFixable === true);
  ok('no DNS is its own case', U.explainGitFailure('fatal: unable to access ...: Could not resolve host: github.com').cause.includes('resolve'));
  ok('unreachable remote is its own case', U.explainGitFailure('fatal: unable to access ...: Failed to connect to github.com port 443').cause.includes('reach'));
  ok('a VPN is not proof of internet', U.explainGitFailure('Failed to connect').fix.includes('Tailscale'));
  // Verbatim strings from a real git (with LC_ALL=C, which the gateway forces —
  // a localised git says "Schwerwiegend: Kein Git-Repository" and matches nothing).
  ok('a zip install is told it cannot update', U.explainGitFailure('fatal: not a git repository (or any parent up to mount point /)').cause.includes('not installed from git'));
  ok('real "could not resolve host" wording', U.explainGitFailure("fatal: unable to access 'https://github.com/x.git/': Could not resolve host: github.com").cause.includes('resolve'));
  ok('real "couldn\'t find remote ref" wording', U.explainGitFailure('fatal: couldn\'t find remote ref main').cause.includes('does not exist'));
  ok('credential prompts are explained', U.explainGitFailure('fatal: Authentication failed for ...').fix.includes('remote set-url'));
  const failed = U.describeCheck({
    ok: false, current: '1', available: null, behind: 0, commits: [], impact: U.classifyChanges([]), tree: clean, conflicts: [],
    detail: "fatal: detected dubious ownership in repository at '/opt/yondergate'",
  });
  ok('the check surfaces the real cause', failed.message.includes('different user'), failed.message);
  ok('and offers the self-repair', (failed.note || '').includes('fix this itself'));

  // ---- Tailscale status: the pending login URL ----
  // A real Pi sat at "down · NeedsLogin" with nothing to click, because the login URL
  // was scraped from `tailscale up --timeout=1s` (too early) and the status parser
  // hardcoded loginUrl to null. The daemon publishes it as AuthURL.
  const { parseTailscaleStatus } = await import('../packages/gateway/src/system/tailscale');
  const needsLogin = parseTailscaleStatus(JSON.stringify({
    BackendState: 'NeedsLogin',
    AuthURL: 'https://login.tailscale.com/a/1234deadbeef',
    Self: { TailscaleIPs: [] },
  }));
  ok('pending login url is surfaced', needsLogin.authUrl === 'https://login.tailscale.com/a/1234deadbeef');
  ok('needs-login is not running', !needsLogin.running && needsLogin.backendState === 'NeedsLogin');
  const tsUp = parseTailscaleStatus(JSON.stringify({
    BackendState: 'Running',
    Self: { TailscaleIPs: ['100.101.102.103', 'fd7a:115c:a1e0::1'] },
  }));
  ok('running state detected', tsUp.running && tsUp.backendState === 'Running');
  ok('tailnet IPv4 picked from the status', tsUp.ip === '100.101.102.103');
  ok('no pending login when authorised', tsUp.authUrl === null);
  ok('empty AuthURL counts as none', parseTailscaleStatus(JSON.stringify({ BackendState: 'Stopped', AuthURL: '' })).authUrl === null);
  ok('garbage status degrades quietly', parseTailscaleStatus('not json').backendState === 'Unknown');

  // ---- HiLink LTE stick (Huawei E3372h-320 & friends) ----
  const H = await import('../packages/gateway/src/system/hilink');
  ok('ipv4 accepted', H.isIpv4('192.168.8.1'));
  ok('non-ipv4 refused (it becomes a proxy target)', !H.isIpv4('192.168.8.1; reboot') && !H.isIpv4('999.1.1.1') && !H.isIpv4('stick.local'));
  ok('xml flattened', H.parseHilinkXml('<response><A>1</A><B> x </B></response>').B === 'x');
  ok('no error is null', H.hilinkError('<response><A>1</A></response>') === null);
  ok('error 100003 is explained', (H.hilinkError('<error><code>100003</code></error>') || '').includes('session'));
  ok('unknown error keeps its code', (H.hilinkError('<error><code>424242</code></error>') || '').includes('424242'));
  ok('LTE recognised', H.networkTypeLabel('101') === '4G (LTE)' && H.networkTypeLabel('19') === '4G (LTE)');
  ok('HSPA+ recognised as 3G', (H.networkTypeLabel('9') || '').startsWith('3G'));
  ok('unknown network type admits it', (H.networkTypeLabel('777') || '').includes('777'));
  ok('901 is connected', H.connectionStatusLabel('901').connected === true);
  ok('908 names the SIM PIN', H.connectionStatusLabel('908').label.includes('PIN') && !H.connectionStatusLabel('908').connected);
  ok('dbm value parsed', H.dbmValue('-93dBm') === -93 && H.dbmValue('') === null);
  ok('rsrp → percent', H.signalPercent({ rsrp: -93 }) === 72);
  ok('rsrp clamped', H.signalPercent({ rsrp: -160 }) === 0 && H.signalPercent({ rsrp: -40 }) === 100);
  ok('bar icon is the fallback', H.signalPercent({ signalIcon: '3' }) === 60);
  ok('no signal info stays null', H.signalPercent({}) === null);
  // The interface comes from the routing table — never from a name like "eth1", or a
  // FritzBox LAN on the other eth would eventually be reported as the LTE link.
  ok('route dev parsed', H.parseRouteDev('192.168.8.1 dev eth1 src 192.168.8.100 uid 1000') === 'eth1');
  ok('no route → null', H.parseRouteDev('RTNETLINK answers: Network is unreachable') === null);

  const XML = {
    ses: '<response><SesInfo>SessionID=abc123</SesInfo><TokInfo>tok987</TokInfo></response>',
    status: '<response><ConnectionStatus>901</ConnectionStatus><SignalIcon>4</SignalIcon><CurrentNetworkType>19</CurrentNetworkType><CurrentNetworkTypeEx>101</CurrentNetworkTypeEx></response>',
    signal: '<response><rsrp>-93dBm</rsrp><rsrq>-9dB</rsrq><sinr>12dB</sinr></response>',
    plmn: '<response><State>0</State><FullName>Telekom.de</FullName><ShortName>TDG</ShortName></response>',
    info: '<response><DeviceName>E3372h-320</DeviceName><WanIPAddress>10.64.12.34</WanIPAddress></response>',
  };
  const seen: { path: string; headers: Record<string, string> }[] = [];
  const fakeGet = async (path: string, headers: Record<string, string>) => {
    seen.push({ path, headers });
    const body =
      path.includes('SesTokInfo') ? XML.ses :
      path.includes('monitoring/status') ? XML.status :
      path.includes('device/signal') ? XML.signal :
      path.includes('current-plmn') ? XML.plmn :
      path.includes('device/information') ? XML.info : '';
    return { ok: !!body, status: body ? 200 : 404, text: body, cookie: null };
  };
  const hi = await H.readHilink(fakeGet, 'eth1');
  ok('stick read: connected', hi.present && hi.connected && hi.state === 'connected');
  ok('stick read: model + operator', hi.model === 'E3372h-320' && hi.operator === 'Telekom.de');
  ok('stick read: 4G and signal', hi.networkType === '4G (LTE)' && hi.signalPercent === 72 && hi.rsrp === -93);
  ok('stick read: interface passed through', hi.iface === 'eth1');
  ok('session token is sent with the API calls', seen.slice(1).every((c) => c.headers.cookie === 'SessionID=abc123' && c.headers.__RequestVerificationToken === 'tok987'), JSON.stringify(seen[1]?.headers));
  // "LTE 72% · 4G (LTE)" says LTE twice; a 2G/3G fallback however must be visible,
  // because that is the moment video stops working.
  ok('osd label on 4G is just LTE + percent', H.hilinkOsdLabel(hi) === 'LTE 72%');
  ok('osd label spells out a 3G fallback', H.hilinkOsdLabel({ ...hi, networkType: '3G (HSPA+)' }) === '3G (HSPA+) 72%');
  ok('osd label survives a missing percent', H.hilinkOsdLabel({ ...hi, signalPercent: null }) === 'LTE');

  // The status panel said "no modem" while the gateway was online through the stick.
  const asLte = H.hilinkAsLte(hi);
  ok('stick fills the LTE status row', asLte.present && asLte.connected && asLte.kind === 'hilink');
  ok('stick model is marked as HiLink', (asLte.modemModel || '').includes('HiLink'));
  ok('stick carries operator, signal and WAN IP', asLte.operator === 'Telekom.de' && asLte.signal === 72 && asLte.ip === '10.64.12.34');
  ok('APN stays null (it lives in the stick)', asLte.apn === null);
  ok('a PIN-locked stick is flagged', H.hilinkAsLte({ ...hi, state: 'SIM PIN required', connected: false }).pinRequired === true);

  const dead = await H.readHilink(async () => ({ ok: false, status: 0, text: '', cookie: null }), 'eth1');
  ok('unreachable stick is not "present"', !dead.present && (dead.message || '').includes('did not answer'));
  const denied = await H.readHilink(
    async (path) => ({ ok: true, status: 200, text: path.includes('SesTokInfo') ? XML.ses : '<error><code>100003</code></error>', cookie: null }),
    'eth1',
  );
  ok('an API error is reported, not swallowed', denied.present && (denied.message || '').includes('session'));

  // Proxy gate for the stick's admin UI.
  const P = await import('../packages/gateway/src/transport/deviceProxy');
  ok('cookie parsed', P.cookieValue('a=1; ygw_hilink=s3cret; b=2', 'ygw_hilink') === 's3cret');
  ok('no secret configured → open', P.proxyAuth(null, null, undefined) === 'ok');
  ok('matching query earns a cookie', P.proxyAuth('s3cret', 's3cret', undefined) === 'set-cookie');
  ok('cookie is accepted afterwards', P.proxyAuth('s3cret', null, 'ygw_proxy=s3cret') === 'ok');
  ok('wrong secret denied', P.proxyAuth('s3cret', 'nope', 'ygw_proxy=nope') === 'denied');
  ok('no credentials denied', P.proxyAuth('s3cret', null, undefined) === 'denied');

  // ---- hotspot profile + WiFi radio ----
  const W = await import('../packages/gateway/src/system/wifi');
  const openCmds = W.hotspotCommands({ ssid: 'YonderGate-setup', password: null });
  const openFlat = openCmds.map((c) => c.args.join(' ')).join(' | ');
  // `nmcli device wifi hotspot` ALWAYS secures the AP ("If not provided, nmcli will
  // generate a password"), so the documented OPEN hotspot has to be an explicit
  // profile. This is the assertion that keeps it open.
  ok('open hotspot carries no security at all', !/wifi-sec|psk|password/.test(openFlat), openFlat);
  ok('open hotspot is an AP profile', openFlat.includes('802-11-wireless.mode ap'));
  ok('hotspot pins the documented address', openFlat.includes('ipv4.addresses 192.168.4.1/24') && openFlat.includes('ipv4.method shared'));
  ok('a stale profile is deleted first, and may fail', openCmds[0].args.join(' ') === 'connection delete Hotspot' && openCmds[0].optional === true);
  ok('the profile is brought up last', openCmds[openCmds.length - 1].args.join(' ') === 'connection up Hotspot');
  const secFlat = W.hotspotCommands({ ssid: 'X', password: 'longenough' }).map((c) => c.args.join(' ')).join(' | ');
  ok('secured hotspot sets WPA2 and the key', secFlat.includes('wifi-sec.key-mgmt wpa-psk') && secFlat.includes('wifi-sec.psk longenough'));
  ok('a too short key stays open', !W.hotspotCommands({ ssid: 'X', password: 'short' }).some((c) => c.args.includes('wifi-sec.psk')));
  ok('hotspot honours the interface', W.hotspotCommands({ ssid: 'X', password: null }, 'wlan1').some((c) => c.args.includes('wlan1')));
  ok('an SSID with spaces/semicolons stays one argument', W.hotspotCommands({ ssid: 'My Car; reboot', password: null })[1].args.includes('My Car; reboot'));

  ok('rfkill soft block detected', W.parseRfkill('1: phy0: Wireless LAN\n\tSoft blocked: yes\n\tHard blocked: no').softBlocked === true);
  ok('rfkill hard block detected', W.parseRfkill('\tSoft blocked: no\n\tHard blocked: yes').hardBlocked === true);
  ok('no rfkill output blocks nothing', W.parseRfkill('').softBlocked === false);
  ok('regulatory country parsed', W.parseWifiCountry('global\ncountry DE: DFS-ETSI') === 'DE');
  ok('world domain counts as unset', W.parseWifiCountry('country 00: DFS-UNSET') === null);
  ok('unavailable wlan0 detected', W.parseWifiDeviceState('eth0:ethernet:connected\nwlan0:wifi:unavailable') === 'unavailable');
  ok('ready wlan0 detected', W.parseWifiDeviceState('wlan0:wifi:disconnected') === 'ready');
  ok('a Pi without wlan0', W.parseWifiDeviceState('eth0:ethernet:connected') === 'missing');
  // Serving the hotspot and being joined to a network both read as "connected" —
  // the status row must not call the gateway's own AP a client connection.
  ok('own hotspot is reported as ap', W.parseWifiMode('wlan0:connected:Hotspot') === 'ap');
  ok('a joined network is a client', W.parseWifiMode('wlan0:connected:Weber-Home') === 'client');
  ok('disconnected wifi is unknown', W.parseWifiMode('wlan0:disconnected:') === 'unknown');
  ok('other interfaces are ignored', W.parseWifiMode('eth0:connected:Wired connection 1') === 'unknown');
  ok('country guessed from the locale', W.guessWifiCountry({ locale: 'de_DE.UTF-8' }) === 'DE');
  ok('country guessed from the timezone', W.guessWifiCountry({ timezone: 'Europe/Vienna' }) === 'AT');
  ok('no guess stays null', W.guessWifiCountry({}) === null);
  ok('locale file parsed', W.parseLocaleFile('LC_ALL=\nLANG="de_DE.UTF-8"\n') === 'de_DE.UTF-8');
  ok('country code validated', W.isCountryCode('DE') && !W.isCountryCode('D') && !W.isCountryCode('DE; reboot'));
  ok('country args are fixed and upper-cased', W.wifiCountryArgs('de').join(' ') === 'nonint do_wifi_country DE');

  // Captive portal: only when the gateway has nothing to share.
  ok('no uplink → hijack DNS', W.shouldHijackDns(false) === true);
  ok('uplink present → leave DNS alone', W.shouldHijackDns(true) === false);
  ok('captive conf points every name at the gateway', W.captivePortalConf() === 'address=/#/192.168.4.1\n');
  ok('captive conf lives where NM reads it for shared connections', W.CAPTIVE_CONF_PATH.includes('/NetworkManager/dnsmasq-shared.d/'));

  const blockedRadio = { device: 'unavailable' as const, softBlocked: true, hardBlocked: false, country: null, suggestedCountry: 'DE' };
  ok('a blocked radio is not usable', !W.radioIsUsable(blockedRadio));
  // The exact message a real Pi produced when the radio was blocked.
  const wf = W.explainWifiFailure(
    "Error: Failed to setup a Wi-Fi hotspot: Connection 'Hotspot' is not available on device wlan0 because device is not available",
    blockedRadio,
  );
  ok('the nmcli message becomes a real explanation', wf.cause.includes('country') && wf.fixableHere === true, wf.cause);
  ok('and it points at the button and the country', wf.fix.includes('Enable WiFi radio') && wf.fix.includes('DE'));
  ok('a hardware switch is not offered a software fix', W.explainWifiFailure('', { ...blockedRadio, hardBlocked: true }).fixableHere === false);
  ok('a missing device is not offered a fix', W.explainWifiFailure('', { device: 'missing', softBlocked: false, hardBlocked: false, country: 'DE', suggestedCountry: 'DE' }).fixableHere === false);
  ok('a wrong key is explained as a key problem', W.explainWifiFailure('Error: Secrets were required, but not provided', { ...blockedRadio, device: 'ready', softBlocked: false }).cause.includes('password'));

  // When the boot-time onboarding starts the hotspot (mirrored in onboard.sh).
  const { shouldStartHotspot } = await import('../packages/gateway/src/system/SystemManager');
  ok('auto: no uplink → start', shouldStartHotspot('auto', false, false).start === true);
  ok('auto: uplink → skip', shouldStartHotspot('auto', true, false).start === false);
  // The shipped default is "always" since v1.41.0 — a gateway you can always walk up
  // to beats one that is only reachable while its uplink works.
  ok('default is always', HOTSPOT_DEFAULTS.mode === 'always');
  ok('unset mode follows the shipped default', shouldStartHotspot(undefined, true, false).start === true);
  ok('unset mode still yields to a WiFi client', shouldStartHotspot(undefined, true, true).start === false);
  ok('always: starts next to LTE', shouldStartHotspot('always', true, false).start === true);
  ok('off: never starts', shouldStartHotspot('off', false, false).start === false);
  // One radio: an active WiFi client connection beats every mode.
  ok('wifi client blocks always', shouldStartHotspot('always', true, true).start === false);
  ok('wifi client blocks auto', shouldStartHotspot('auto', false, true).start === false);
  ok('and it says why', shouldStartHotspot('always', true, true).reason.includes('one radio'));

  console.log('='.repeat(40));
  console.log(`YonderGate test suite: ${pass} passed, ${fail} failed`);
  if (fail) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  ✗ ${f}`);
  }
  console.log('='.repeat(40));
  process.exit(fail ? 1 : 0);
}

void main();
