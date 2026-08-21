/**
 * YonderGate test suite — run with `npm test` (tsx). Consolidates the checks we
 * built incrementally into one repeatable run so future hardware tweaks can't
 * silently regress the safety-critical logic.
 */
import * as C from '../packages/gateway/src/sensors/convert';
import { TelemetryService } from '../packages/gateway/src/sensors/TelemetryService';
import { cameraSource, scaleCamera } from '../packages/gateway/src/video/cameraManager';
import type { TelemetryConfig, CameraCfg } from '@yondergate/protocol';
import { readFileSync } from 'node:fs';

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
  ok('rpicam uses libcamera', cameraSource({ ...cam, type: 'rpicam' }).includes('libcamera-vid'));

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

  // ---- video quality scaling ----
  const big: CameraCfg = { name: 'c', type: 'sim', width: 1280, height: 720, fps: 30, bitrateKbps: 2500 };
  ok('quality high keeps size', scaleCamera(big, 'high').width === 1280);
  ok('quality low shrinks + caps bitrate', scaleCamera(big, 'low').width === 640 && scaleCamera(big, 'low').bitrateKbps === 600);
  ok('quality medium even dims', scaleCamera(big, 'medium').width % 2 === 0);


  // ---- native driver modules: allowlist, npm args, failure diagnosis ----
  // These sentences are the whole user-facing failure story on a vehicle that may
  // only be reachable from a phone, so they are pinned here.
  const { isHwDep, npmInstallArgs, explainNpmFailure, errorExcerpt, lastLines, HW_DEPS } = await import('../packages/gateway/src/system/hwDeps');
  ok('allowlist has exactly the one module we need', HW_DEPS.length === 1 && isHwDep('i2c-bus'));
  ok('allowlist rejects everything else', !isHwDep('rimraf') && !isHwDep('pigpio') && !isHwDep('i2c-bus; rm -rf /') && !isHwDep('') && !isHwDep(42));
  ok('npm args target the vehicle workspace', npmInstallArgs('i2c-bus').join(' ') === 'install i2c-bus -w @yondergate/gateway --no-audit --no-fund --foreground-scripts');
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
  ok('the vehicle reads its version from package.json', readVersion() === pkgVersion, `${readVersion()} vs ${pkgVersion}`);
  ok('no hardcoded version left in the vehicle banner', !/YonderGate vehicle service {2}v\d/.test(readFileSync('packages/gateway/src/index.ts', 'utf8')));

  // ---- generated video config lives outside the checkout ----
  // It used to be written into docker/go2rtc.yaml inside the repo, which left every
  // running vehicle with a modified checkout and blocked `git pull --ff-only`. The two
  // units must agree on the runtime path, or the vehicle writes a config go2rtc never
  // reads — a failure that is invisible until the cameras stay dark.
  const go2rtcUnit = readFileSync('provisioning/systemd/go2rtc.service', 'utf8');
  const vehicleUnit = readFileSync('provisioning/systemd/yondergate.service', 'utf8');
  const unitPath = go2rtcUnit.match(/-config\s+(\S+)/)?.[1] ?? '';
  const envPath = vehicleUnit.match(/YGW_GO2RTC_CONFIG=(\S+)/)?.[1] ?? '';
  ok('go2rtc reads a runtime path, not the checkout', unitPath === '/var/lib/yondergate/go2rtc.yaml', unitPath);
  ok('the vehicle writes exactly that path', envPath === unitPath, `${envPath} vs ${unitPath}`);
  ok('the installer creates the directory', readFileSync('provisioning/install.sh', 'utf8').includes('install -d -m 0755 /var/lib/yondergate'));

  // ---- self-update: what the vehicle would do, and in which order ----
  const U = await import('../packages/gateway/src/system/update');
  ok('clean tree recognised', U.parseWorkingTree('').clean === true);
  const dirty = U.parseWorkingTree(' M packages/gateway/src/index.ts\n?? scratch.txt');
  ok('local changes are listed', !dirty.clean && dirty.dirty.includes('packages/gateway/src/index.ts'));
  // Untracked files never block a fast-forward, and every running vehicle has some
  // (its own config, logs) — counting them made an ordinary vehicle "dirty".
  ok('untracked files do not block', dirty.dirty.every((f) => f !== 'scratch.txt'));
  ok('a vehicle with only untracked files is clean', U.parseWorkingTree('?? yondergate-config.json\n?? npm-debug.log').clean === true);
  // docker/go2rtc.yaml is tracked AND rewritten by the vehicle at every start, so it
  // is modified on every real vehicle — it must not be mistaken for someone's work.
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
  // this file reaches git only through the vehicle's own GIT_CONFIG_GLOBAL.
  ok('trailing slash and bare path both listed', sdc.includes('directory = /opt/yondergate\n') && sdc.includes('directory = /opt/yondergate/\n'));
  ok('wildcard as the last resort', sdc.includes('directory = *'));

  // The update source is a field, so a fork or a branch needs no code change.
  ok('a remote name is a source', U.isGitSource('origin') && U.isGitSource('upstream'));
  ok('an https URL is a source', U.isGitSource('https://github.com/you/YonderGate.git'));
  ok('nonsense is rejected', !U.isGitSource('') && !U.isGitSource('two words') && !U.isGitSource(42));
  ok('branch names validated', U.isGitBranch('main') && U.isGitBranch('feature/x') && !U.isGitBranch('') && !U.isGitBranch('a b'));
  const forkSteps = U.updateSteps({ deps: false, provisioning: false, service: true }, { source: 'https://example.com/x.git', branch: 'dev' });
  ok('the pull uses the configured source', forkSteps[0].args.join(' ') === 'pull --ff-only https://example.com/x.git dev');

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
  // permission problem sent a vehicle WITH internet on a wild goose chase.
  const dubious = U.explainGitFailure("fatal: detected dubious ownership in repository at '/opt/yondergate'");
  ok('dubious ownership is recognised, not called a network fault', dubious.cause.includes('belongs to a different user') && dubious.selfFixable === true);
  ok('no DNS is its own case', U.explainGitFailure('fatal: unable to access ...: Could not resolve host: github.com').cause.includes('resolve'));
  ok('unreachable remote is its own case', U.explainGitFailure('fatal: unable to access ...: Failed to connect to github.com port 443').cause.includes('reach'));
  ok('a VPN is not proof of internet', U.explainGitFailure('Failed to connect').fix.includes('Tailscale'));
  // Verbatim strings from a real git (with LC_ALL=C, which the vehicle forces —
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

  // The status panel said "no modem" while the vehicle was online through the stick.
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
  const P = await import('../packages/gateway/src/transport/hilinkProxy');
  ok('cookie parsed', P.cookieValue('a=1; ygw_hilink=s3cret; b=2', 'ygw_hilink') === 's3cret');
  ok('no secret configured → open', P.proxyAuth(null, null, undefined) === 'ok');
  ok('matching query earns a cookie', P.proxyAuth('s3cret', 's3cret', undefined) === 'set-cookie');
  ok('cookie is accepted afterwards', P.proxyAuth('s3cret', null, 'ygw_hilink=s3cret') === 'ok');
  ok('wrong secret denied', P.proxyAuth('s3cret', 'nope', 'ygw_hilink=nope') === 'denied');
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
  // the status row must not call the vehicle's own AP a client connection.
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

  // Captive portal: only when the vehicle has nothing to share.
  ok('no uplink → hijack DNS', W.shouldHijackDns(false) === true);
  ok('uplink present → leave DNS alone', W.shouldHijackDns(true) === false);
  ok('captive conf points every name at the vehicle', W.captivePortalConf() === 'address=/#/192.168.4.1\n');
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
  // The shipped default is "always" since v1.41.0 — a vehicle you can always walk up
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
