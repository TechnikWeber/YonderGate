import { loadConfig } from './config.js';
import { createSystem } from './system/index.js';
import { TelemetryService } from './sensors/TelemetryService.js';
import { HistoryService } from './sensors/HistoryService.js';
import { AlertService } from './system/AlertService.js';
import { WatchdogService } from './system/WatchdogService.js';
import { UplinkService } from './system/UplinkService.js';
import { describeWindow } from './system/uplink.js';
import { applyCameras, detectH264Encoder, detectRpicamBinary } from './video/cameraManager.js';
import { startCaptivePortal } from './transport/captivePortal.js';
import { activity, startHttpServer } from './transport/httpServer.js';

async function main() {
  const config = loadConfig();

  console.log('');
  console.log(`  YonderGate  v${config.version}`);
  console.log('  ──────────────────────');
  console.log(`  site      : ${config.siteName}`);
  console.log(`  telemetry : ${config.telemetry.source} · ${config.telemetry.enabled ? 'on' : 'off'}`);
  console.log(
    `  video     : ${config.videoBaseUrl ?? 'disabled'} · ` +
      (config.cameras.length
        ? `cams [${config.cameras.map((c) => c.name).join(', ')}]`
        : 'no cameras (a valid setup — the preview just stays empty)'),
  );
  console.log('');

  const system = createSystem(config.systemKind);
  system.setStateDir?.(config.stateDir);

  // Sensors (voltage / current / temperature). Sim by default, so a box without
  // hardware still shows a full, working page.
  const telemetry = new TelemetryService(config.telemetry);
  await telemetry.start();

  // Recording is opt-in: it is the one thing that writes to the card continuously.
  const history = new HistoryService(config.historyDir, telemetry, {
    keepMonths: config.history.keepMonths,
    flushMs: config.history.flushMinutes * 60_000,
  });
  if (config.history.enabled) {
    history.start();
    console.log(`  history   : ${config.historyDir} (every minute, flushed every ${config.history.flushMinutes} min)`);
  } else {
    console.log('  history   : off (enable it in Setup › Sensors)');
  }

  // Watches the site and speaks up; also keeps the mobile-data counter, which is
  // useful whether or not anyone wants push messages.
  const alerts = new AlertService(config, system, telemetry);
  alerts.start();

  // Whether the tunnel is up all the time or only in a window — and, when it is a
  // window, what happens to the alerts in between.
  const uplink = new UplinkService(config, system, alerts, activity);
  alerts.setHoldGate(() => uplink.holdsAlerts());
  uplink.start();
  console.log(
    `  uplink    : ${config.uplink.mode === 'always' ? 'always live' : `window · ${describeWindow(config.uplink)}`}`,
  );

  // Nobody is there to notice a link that is up but carries nothing.
  const watchdog = new WatchdogService(config, system, alerts, activity, () => uplink.snapshot().up);
  watchdog.start();
  console.log(
    `  watchdog  : ${config.watchdog.enabled ? `probing ${config.watchdog.target} every ${config.watchdog.intervalMinutes} min` : 'off'}` +
      ` · reboot ${config.reboot.enabled ? `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][config.reboot.weekday]} ${String(config.reboot.hour).padStart(2, '0')}:00` : 'off'}`,
  );

  // Generate go2rtc.yaml from the camera list (best effort at boot).
  config.h264Encoder = await detectH264Encoder();
  config.rpicamBin = await detectRpicamBinary();
  await applyCameras(
    config.cameras,
    config.go2rtcConfigPath,
    config.videoBaseUrl,
    config.h264Encoder,
    config.rpicamBin,
  ).catch(
    (e) => console.error('[video] initial camera generation failed:', (e as Error).message),
  );

  startHttpServer(config, system, telemetry, history, alerts, watchdog, uplink);
  console.log(`  setup UI  : http://<gateway>:${config.port}/setup  (system: ${config.systemKind})`);

  // The internet switches are firewall rules, and a firewall rule does not survive a
  // reboot. Re-applying at every start is what makes "off" mean off — including after
  // the power cut that an off-grid box has every few weeks.
  system
    .setInternetPassthrough(config.internet)
    .then((r) => {
      if (r.blocked.length || !r.ok) console.log(`[internet] ${r.message}`);
    })
    .catch((e) => console.warn(`[internet] could not apply: ${(e as Error).message}`));

  // Captive portal for AP-mode onboarding (binds :80; skipped if not permitted).
  if (config.systemKind === 'real') startCaptivePortal(config.port);

  // …and kept in step with the uplink. On a fresh site the box boots with no LTE,
  // starts the portal, and the stick registers a minute later — without this, every
  // device on the hotspot would keep landing on the setup page instead of the
  // internet the gateway is by then perfectly able to share.
  const captiveTimer = setInterval(() => {
    void system.syncCaptivePortal().catch(() => undefined);
  }, 60_000);

  if (config.lte.apn) {
    system.lteConnect(config.lte).then((r) => console.log(`[lte] ${r.message}`));
  }
  if (config.remoteAccess.kind !== 'none') {
    system
      .remoteUp(config.remoteAccess)
      .then((r) => console.log(`[remote] ${config.remoteAccess.kind}: ${r.message}`))
      .catch((e) => console.warn(`[remote] up failed: ${(e as Error).message}`));
  }

  const shutdown = async () => {
    console.log('\n[gateway] shutting down…');
    clearInterval(captiveTimer);
    watchdog.stop();
    alerts.stop();
    await history.stop();
    await telemetry.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
