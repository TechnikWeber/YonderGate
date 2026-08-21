import { createServer, type Server } from 'node:http';
import type { GatewayConfig } from '../config.js';
import type { SystemManager } from '../system/index.js';
import type { TelemetryService } from '../sensors/TelemetryService.js';
import type { HistoryService } from '../sensors/HistoryService.js';
import type { AlertService } from '../system/AlertService.js';
import type { WatchdogService } from '../system/WatchdogService.js';
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
/** Last time a browser talked to this box; the watchdog checks it before rebooting. */
export const activity: { lastRequestAt: number | null } = { lastRequestAt: null };

export function startHttpServer(
  config: GatewayConfig,
  system: SystemManager,
  telemetry: TelemetryService,
  history: HistoryService,
  alerts: AlertService,
  watchdog: WatchdogService,
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
    applyCameras: (cams) => applyCameras(cams, config.go2rtcConfigPath, config.videoBaseUrl, config.h264Encoder),
    applyHilink: applyProxies,
    applyProxies,
    onConfigSaved: (patch) => console.log('[setup] config saved:', Object.keys(patch).join(', ')),
  };

  const server = createServer((req, res) => {
    activity.lastRequestAt = Date.now();
    void handleSetup(req, res, ctx).then((handled) => {
      if (handled) return;
      // Everything else is the setup page: this box has exactly one UI.
      res.writeHead(302, { location: '/setup' });
      res.end();
    });
  });
  server.listen(config.port, config.host);
  return server;
}
