# Changelog

All notable changes to YonderGate. Entries are bilingual (English / Deutsch).

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
