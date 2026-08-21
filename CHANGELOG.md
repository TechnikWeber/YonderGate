# Changelog

All notable changes to YonderGate. Entries are bilingual (English / Deutsch).

## v0.4.0
**English**
- **A scan is no longer anonymous.** Devices can be given a name and the port their web
  UI actually listens on, and both survive the next scan. Saved devices are keyed by
  **MAC**, not address: DHCP moves addresses around, and a camera that comes back on a
  different one is still the camera you named.
- **A saved device that stops answering stays in the list**, marked *not answering*,
  with the time it was last seen. That is the whole reason to save one: on a site you
  cannot walk to, "the camera I named is silent" is the most useful thing this page can
  tell you — dropping it from the list would hide exactly that.
- Publishing now uses the device's **configured port**, so a UI on 8080 or 8443 works
  like one on 80, and the published entry carries the name you gave it.
- **README explains the whole idea from scratch**: why a `192.168.x.x` address at a
  remote site is unreachable, why port forwarding does not help behind CGNAT, what
  Tailscale does about it — and then both ways through, step by step: subnet routes
  (reaches everything, needs one approval in the admin console, `--accept-routes` on
  Linux clients) and publishing a single device (no routing changes, survives an address
  collision with your home network). Including when to pick which.

**Deutsch**
- **Ein Scan ist nicht mehr anonym.** Geräte lassen sich benennen, samt dem Port, auf dem
  ihre Weboberfläche wirklich liegt — beides übersteht den nächsten Scan. Gespeichert wird
  nach **MAC**, nicht nach Adresse: DHCP schiebt Adressen herum, und eine Kamera, die
  unter einer anderen zurückkommt, ist immer noch die Kamera, die du benannt hast.
- **Ein gespeichertes Gerät, das nicht mehr antwortet, bleibt in der Liste**, markiert als
  *not answering*, mit dem Zeitpunkt der letzten Sichtung. Genau dafür speichert man es:
  An einem Ort, zu dem du nicht hinlaufen kannst, ist „die Kamera, die ich benannt habe,
  schweigt" die nützlichste Auskunft dieser Seite — sie aus der Liste zu werfen würde
  ausgerechnet das verbergen.
- Beim Veröffentlichen wird jetzt der **konfigurierte Port** benutzt, eine Oberfläche auf
  8080 oder 8443 funktioniert also wie eine auf 80, und der Eintrag trägt den Namen, den
  du vergeben hast.
- **Die README erklärt das Konzept von Grund auf**: warum eine `192.168.x.x`-Adresse an
  einem entfernten Ort unerreichbar ist, warum Portfreigaben hinter CGNAT nicht helfen,
  was Tailscale daran ändert — und dann beide Wege hindurch, Schritt für Schritt:
  Subnet-Routes (erreicht alles, braucht eine Freigabe in der Konsole,
  `--accept-routes` auf Linux-Clients) und das Veröffentlichen eines einzelnen Geräts
  (keine Routing-Änderung, übersteht eine Adresskollision mit dem Heimnetz). Inklusive der
  Frage, wann man welchen nimmt.

## v0.3.0
**English**
- **The RC wording is gone.** This box sits on a yacht, an allotment or a remote plot —
  it does not steer anything, and calling it "the vehicle" in 130 places was inherited
  clutter that would have shaped how the thing gets built. Comments, UI copy and docs now
  say gateway, site and operator.
- **You can see the cameras.** The camera panel shows a **still frame** per camera (proof
  it works) and an **Open stream ↗** link to go2rtc's own player. The gateway generates
  go2rtc's configuration but deliberately does not serve video itself — the page says so,
  including which address it is pointing at when no frame arrives.
- **`npm run dev:video` simulates the whole video path locally**: it fetches go2rtc once,
  runs it against the config the gateway just wrote, and the default camera is an ffmpeg
  test pattern — so the preview, the player and the WebRTC path can be tried without a
  camera, a Pi, or a site.
- **The generated go2rtc config left the checkout** — before it could repeat the mistake
  it caused in YonderRC. In development it lands in `.runtime/` (git-ignored), on a real
  box systemd points it at `/var/lib/yondergate/`. A file the service rewrites at every
  start must never live in the repository, or `git pull --ff-only` stops working.

**Deutsch**
- **Die RC-Sprache ist raus.** Diese Kiste steht auf einer Yacht, in einem Schrebergarten
  oder auf einem abgelegenen Grundstück — sie steuert nichts, und sie an 130 Stellen „das
  Fahrzeug" zu nennen war geerbter Ballast, der geprägt hätte, wie das Ding weitergebaut
  wird. Kommentare, Oberfläche und Doku sagen jetzt Gateway, Standort und Betreiber.
- **Man sieht die Kameras.** Das Kamera-Panel zeigt pro Kamera ein **Standbild** (der
  Beweis, dass sie läuft) und einen **Open stream ↗**-Link auf den Player von go2rtc. Das
  Gateway erzeugt die go2rtc-Konfiguration, liefert das Video aber bewusst nicht selbst —
  die Seite sagt das, samt der Adresse, an die sie sich wendet, wenn kein Bild kommt.
- **`npm run dev:video` simuliert die ganze Videostrecke lokal**: holt go2rtc einmalig,
  startet es mit der gerade geschriebenen Konfiguration, und die Standardkamera ist ein
  ffmpeg-Testbild — Vorschau, Player und WebRTC lassen sich damit ohne Kamera, ohne Pi und
  ohne Standort ausprobieren.
- **Die generierte go2rtc-Konfiguration ist aus dem Checkout ausgezogen**, bevor sie den
  Fehler aus YonderRC wiederholen konnte. In der Entwicklung landet sie in `.runtime/`
  (git-ignoriert), auf einer echten Kiste zeigt systemd auf `/var/lib/yondergate/`. Eine
  Datei, die der Dienst bei jedem Start neu schreibt, darf nie im Repository liegen —
  sonst funktioniert `git pull --ff-only` irgendwann nicht mehr.

## v0.2.1
**English**
- **Fixed while running it for the first time: the VPN was offered as a network to
  advertise.** A laptop's `tailscale0` carries a `/32`, and it turned up in the list of
  subnets the gateway could route — advertising the tailnet's own address back into the
  tailnet is a loop, not a route. `tailscale*`, `wg*` and `zt*` interfaces are skipped
  now, and a `/32` is never offered as a network.

**Deutsch**
- **Beim ersten echten Lauf gefunden: das VPN wurde als ankündbares Netz angeboten.**
  Das `tailscale0` eines Laptops trägt ein `/32`, und es tauchte in der Liste der
  Subnetze auf, die das Gateway routen könnte — die eigene Tailnet-Adresse zurück ins
  Tailnet anzukündigen ist eine Schleife, keine Route. `tailscale*`, `wg*` und
  `zt*`-Interfaces werden jetzt übersprungen, und ein `/32` wird nie als Netz angeboten.

## v0.2.0
**English**
- **The gateway can now see the site.** *Scan* reads the kernel's neighbour table —
  instant, and it already knows everything that has spoken recently — while *Scan +
  sweep* pings every address in the subnet for the quiet ones. The list shows address,
  MAC, vendor, reverse-DNS name, which of a handful of ports answered, and a one-line
  guess at what the thing is. A guess is phrased as one: an RTSP port is a strong hint
  at a camera, not proof.
- **Two ways through to those devices, and they are not equivalent.**
  **Tailscale subnet routes** are the native answer: advertise `192.168.4.0/24` and
  every device is reachable at its real address from anywhere on your tailnet, no
  per-device setup. The gateway enables IP forwarding for it (as a sysctl drop-in, so
  it survives a reboot) and says the part everyone forgets — **the route must be
  approved once in the tailnet admin console**, and until then it exists and carries
  nothing.
  **Publishing a single device** on a gateway port is the fallback when routing is not
  an option: one button on the device list, and its web UI answers on
  `http://<gateway>:8100/`, guarded by the API secret like everything else.
- Safeguards that come from having built this before: a sweep wider than /22 is refused
  with a reason rather than silently truncated (a /16 is 65k pings, that is a nuisance,
  not a scan); `FAILED` neighbour entries are not devices (the kernel remembering that
  something did *not* answer is the opposite of a find); a publish port is never handed
  out twice, because the second one would take down the first — possibly this very page.
- 31 new tests cover the parsers, the subnet maths, the vendor lookup, route arguments
  and the port allocation. **None of it has run on a real site yet**: sweeps,
  `tailscale set` and `sysctl` are only provable on the Pi.

**Deutsch**
- **Das Gateway sieht jetzt, was am Standort ist.** *Scan* liest die Nachbartabelle des
  Kernels — sofort da, und sie kennt bereits alles, was kürzlich gesprochen hat —
  *Scan + sweep* pingt zusätzlich jede Adresse im Subnetz für die Stillen. Die Liste
  zeigt Adresse, MAC, Hersteller, Reverse-DNS-Namen, welche der geprüften Ports
  geantwortet haben und eine einzeilige Vermutung, was das Gerät ist. Eine Vermutung
  wird auch als solche formuliert: ein RTSP-Port ist ein starker Hinweis auf eine
  Kamera, kein Beweis.
- **Zwei Wege zu diesen Geräten, und sie sind nicht gleichwertig.**
  **Tailscale-Subnet-Routes** sind die eigentliche Antwort: `192.168.4.0/24`
  ankündigen, und jedes Gerät ist von überall im Tailnet unter seiner echten Adresse
  erreichbar, ganz ohne Einrichtung pro Gerät. Das Gateway schaltet dafür IP-Forwarding
  ein (als sysctl-Datei, damit es einen Reboot übersteht) und nennt den Punkt, den alle
  vergessen: **die Route muss einmal in der Tailnet-Konsole freigegeben werden** —
  vorher existiert sie und transportiert nichts.
  **Ein einzelnes Gerät veröffentlichen** ist der Rückfall, wenn Routing nicht in Frage
  kommt: ein Knopf in der Geräteliste, und seine Weboberfläche antwortet unter
  `http://<Gateway>:8100/`, abgesichert durch das API-Secret wie alles andere.
- Absicherungen aus früherer Erfahrung: ein Sweep breiter als /22 wird mit Begründung
  abgelehnt statt still gekürzt (ein /16 sind 65.000 Pings — das ist kein Scan, das ist
  eine Belästigung); `FAILED`-Einträge der Nachbartabelle sind keine Geräte (der Kernel
  erinnert sich dort daran, dass etwas *nicht* geantwortet hat); ein Veröffentlichungs-
  Port wird nie zweimal vergeben, denn der zweite würde den ersten abschießen —
  womöglich genau diese Seite.
- 31 neue Tests decken Parser, Subnetz-Mathematik, Herstellererkennung,
  Routen-Argumente und Portvergabe ab. **Auf einem echten Standort lief davon noch
  nichts**: Sweeps, `tailscale set` und `sysctl` sind nur auf dem Pi beweisbar.

## v0.1.1
**English**
- The **WiFi country stays editable** after it has been set: the field used to appear
  only while the radio was broken, so correcting a wrong country needed SSH. It decides
  channels and transmit power — for a box that may be installed anywhere, that has to be
  a field on the page. No built-in default; the suggestion comes from the Pi's locale or
  timezone.

**Deutsch**
- Das **WLAN-Land bleibt änderbar**, nachdem es gesetzt wurde: Das Feld erschien bisher
  nur, solange das Funkmodul kaputt war — ein falsches Land ließ sich also nur per SSH
  korrigieren. Es bestimmt Kanäle und Sendeleistung; bei einer Kiste, die überall stehen
  kann, gehört das auf die Seite. Kein eingebauter Standard, der Vorschlag kommt aus
  Locale oder Zeitzone des Pi.

## v0.1.0
**English**
- Initial import, forked from YonderRC v1.45.2 for its setup UI and provisioning:
  AP onboarding with captive portal, WiFi country/rfkill repair, LTE incl. HiLink
  sticks and their proxied web UI, Tailscale/ZeroTier/WireGuard remote access, the
  self-update button, I²C sensors and go2rtc cameras.
- Everything RC-specific removed: control channels, PWM/SBUS drivers, arming and
  failsafe, the ground control app, stick bindings, OSD and GPS. The service now
  serves exactly one thing — the setup/status page — and carries no control socket.
- No build step any more: the gateway runs TypeScript directly, so an update is a
  pull and a restart.

**Deutsch**
- Erstimport, abgeleitet von YonderRC v1.45.2 wegen Setup-Oberfläche und
  Provisionierung: AP-Onboarding mit Captive Portal, WLAN-Land/rfkill-Reparatur,
  LTE inklusive HiLink-Sticks samt durchgereichter Weboberfläche,
  Tailscale/ZeroTier/WireGuard, Update-Knopf, I²C-Sensorik und go2rtc-Kameras.
- Alles RC-Spezifische entfernt: Steuerkanäle, PWM/SBUS-Treiber, Arming und
  Failsafe, Boden-App, Stick-Bindings, OSD und GPS. Der Dienst liefert genau eine
  Sache aus — die Setup-/Statusseite — und hat keinen Steuer-Socket mehr.
- Kein Build-Schritt mehr: Das Gateway führt TypeScript direkt aus, ein Update ist
  ein Pull plus Neustart.
