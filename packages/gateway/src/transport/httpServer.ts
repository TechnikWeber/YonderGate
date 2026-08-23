import { createServer, type Server } from 'node:http';
import type { GatewayConfig } from '../config.js';
import type { SystemManager } from '../system/index.js';
import type { TelemetryService } from '../sensors/TelemetryService.js';
import type { HistoryService } from '../sensors/HistoryService.js';
import type { AlertService } from '../system/AlertService.js';
import type { WatchdogService } from '../system/WatchdogService.js';
import type { UplinkService } from '../system/UplinkService.js';
import { countsAsPresence } from '../system/uplink.js';
import { handleSetup, type SetupContext } from './setupRouter.js';
import { startDeviceProxy, type DeviceProxyHandle } from './deviceProxy.js';
import { applyCameras } from '../video/cameraManager.js';

/**
 * The gateway's only listener: the setup/management UI and its API.
 *
 * There is deliberately no control socket here. This box does not steer anything —
 * it provisions itself, watches a few sensors and hands you a way through to the
 * devices behind it. Everything a browser needs is HTTP.
 */
/**
 * Last time a browser talked to this box.
 *
 * Two clocks, because the two users of this want different things. `lastRequestAt` is
 * "anything at all touched the HTTP port" — right for the watchdog, where a false
 * positive only means it does not reboot. `lastApiAt` is "the setup page is open and
 * visible", which is what the uplink window needs: a captive-portal probe from a phone
 * on the hotspot must not be enough to hold the tunnel open all week.
 */
export const activity: { lastRequestAt: number | null; lastApiAt: number | null } = {
  lastRequestAt: null,
  lastApiAt: null,
};

export function startHttpServer(
  config: GatewayConfig,
  system: SystemManager,
  telemetry: TelemetryService,
  history: HistoryService,
  alerts: AlertService,
  watchdog: WatchdogService,
  uplink: UplinkService,
): Server {
  // Every device the gateway publishes: the LTE stick's own UI, plus whatever the
  // operator added from the device list. Restarted as one fleet, because a changed
  // API secret has to take effect on all of them at once.
  let proxies: DeviceProxyHandle[] = [];
  const applyProxies = () => {
    for (const p of proxies) p.close();
    proxies = [];
    system.setHilinkHost(config.hilink.host);
    const wanted = [
      ...(config.hilink.proxyPort
        ? [{ listen: config.hilink.proxyPort, host: config.hilink.host, port: 80, label: 'LTE stick' }]
        : []),
      ...config.proxies.map((p) => ({ listen: p.listen, host: p.host, port: p.port, label: p.label })),
    ];
    for (const w of wanted) {
      proxies.push(
        startDeviceProxy({
          port: w.listen,
          host: w.host,
          targetPort: w.port,
          secret: config.apiSecret,
          log: (m) => console.log(`${m}  (${w.label})`),
        }),
      );
    }
  };
  applyProxies();

  const ctx: SetupContext = {
    config,
    system,
    telemetry,
    history,
    alerts,
    watchdog,
    uplink,
    applyCameras: (cams) =>
      applyCameras(cams, config.go2rtcConfigPath, config.videoBaseUrl, config.h264Encoder, config.rpicamBin),
    applyHilink: applyProxies,
    applyProxies,
    onConfigSaved: (patch) => console.log('[setup] config saved:', Object.keys(patch).join(', ')),
  };

  const server = createServer((req, res) => {
    activity.lastRequestAt = Date.now();
    if (countsAsPresence(req.url)) activity.lastApiAt = Date.now();
    void handleSetup(req, res, ctx).then((handled) => {
      if (handled) return;
      // Everything else is the setup page: this box has exactly one UI.
      res.writeHead(302, { location: '/setup' });
      res.end();
    });
  });
  // Without this, a busy port raises an unhandled 'error' event and the gateway dies
  // with a stack trace — under systemd that is a restart loop with no explanation in
  // it. The port is the one thing the operator can actually change.
  server.on('error', (err) => {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'EADDRINUSE') {
      console.error(`[gateway] port ${config.port} is already in use — another gateway is probably still running.`);
      console.error('[gateway] stop it, or start this one with YGW_PORT=<other port>.');
    } else if (e.code === 'EACCES') {
      console.error(`[gateway] not allowed to bind port ${config.port} — ports below 1024 need root.`);
    } else {
      console.error(`[gateway] could not listen on ${config.host}:${config.port}: ${e.message}`);
    }
    process.exit(1);
  });
  server.listen(config.port, config.host);
  return server;
}
