import { loadConfig } from './config.js';
import { createSystem } from './system/index.js';
import { TelemetryService } from './sensors/TelemetryService.js';
import { applyCameras, detectH264Encoder } from './video/cameraManager.js';
import { startCaptivePortal } from './transport/captivePortal.js';
import { startHttpServer } from './transport/httpServer.js';

async function main() {
  const config = loadConfig();

  console.log('');
  console.log(`  YonderGate  v${config.version}`);
  console.log('  ──────────────────────');
  console.log(`  site      : ${config.siteName}`);
  console.log(`  telemetry : ${config.telemetry.source} · ${config.telemetry.enabled ? 'on' : 'off'}`);
  console.log(`  video     : ${config.videoBaseUrl ?? 'disabled'} · cams [${config.cameras.map((c) => c.name).join(', ')}]`);
  console.log('');

  const system = createSystem(config.systemKind);

  // Sensors (voltage / current / temperature). Sim by default, so a box without
  // hardware still shows a full, working page.
  const telemetry = new TelemetryService(config.telemetry);
  await telemetry.start();

  // Generate go2rtc.yaml from the camera list (best effort at boot).
  config.h264Encoder = await detectH264Encoder();
  await applyCameras(config.cameras, config.go2rtcConfigPath, config.videoBaseUrl, config.h264Encoder).catch(
    (e) => console.error('[video] initial camera generation failed:', (e as Error).message),
  );

  startHttpServer(config, system, telemetry);
  console.log(`  setup UI  : http://<gateway>:${config.port}/setup  (system: ${config.systemKind})`);

  // Captive portal for AP-mode onboarding (binds :80; skipped if not permitted).
  if (config.systemKind === 'real') startCaptivePortal(config.port);

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
