# YonderGate — Hardware-Leitfaden

*Was man kauft, wie man es verdrahtet, und was es an Watt kostet. Geschrieben für den
Fall, für den das Projekt gebaut ist: ein Standort ohne Netzstrom und ohne kabelgebundenes
Internet, versorgt aus einer Batterie — geladen mit dem, was da ist, meistens Solar — wo
jedes Watt Hardware ist, die jemand hintragen musste.*

> **Vorweg:** keine der Zahlen unten wurde an einer YonderGate-Box gemessen. Die
> Software-Werte (Speicher, was transkodiert wird) stammen aus diesem Repository; die
> Leistungsangaben sind die veröffentlichten bzw. üblich gemessenen Werte der Bauteile.
> Nimm sie als Budget zum Auslegen und miss dann deinen eigenen Aufbau — genau dafür
> zeigt das Gateway seinen eigenen Verbrauch, sobald ein INA-Sensor verbaut ist.

## Die kurze Antwort

| | |
|---|---|
| **Board** | Raspberry Pi **Zero 2 W** (512 MB, ARMv8) |
| **OS** | Raspberry Pi OS **Lite 64-Bit** (Bookworm) |
| **Uplink** | Huawei **E3372h-320** HiLink-Stick + externe LTE-Antenne |
| **Kameras** | **IP-Kameras mit RTSP**, keine USB-Webcams |
| **Messen** | **INA228** in der Batterieleitung, DS18B20 oder TMP117 für Temperatur |
| **Uhr** | DS3231-RTC-Modul (optional, aber billig und rettet die Zeitstempel) |
| **Budget** | **ca. 2,5–4 W** dauerhaft → **60–95 Wh/Tag** |

Alles Weitere ist die Begründung dieser Liste.

## Welcher Raspberry Pi

**Zero 2 W — ja.** Das ist das empfohlene Board, und `provisioning/README.md` nennt es
bereits: er hat den Hardware-H.264-Encoder (den der **Pi 5 nicht hat**), er ist das
sparsamste Board, das noch ein 64-Bit-OS und aktuelles Node fährt, und das Gateway ist
kein schweres Programm. Der Dienst braucht im Sim-Modus **ca. 54 MB RSS**, 512 MB sind
also nicht die Grenze, für die man sie hält.

**Zero W / Zero WH (die erste Generation) — nein.** ARMv6, also kein 64-Bit-Raspberry-Pi-OS
und keine offiziellen Node-Builds. Nichts hiervon läuft darauf. Dafür nicht kaufen.

**Pi 3A+ — brauchbare Alternative.** 512 MB, eine echte USB-A-Buchse (kein OTG-Adapter),
Hardware-H.264, Leerlauf um 1,2 W. Kostet etwa ein halbes Watt mehr als der Zero 2 W und
gibt dafür einen richtigen USB-Port.

**Pi 4 — nur bei Ethernet-Bedarf oder mehr als drei Kamerastreams.** Er kostet dauerhaft
rund 2 W mehr. Übers Jahr sind das ~17 kWh — in einer kleinen Inselanlage eine
Entscheidung in Panel-Größe.

**Pi 5 — hier nicht.** Höherer Leerlaufverbrauch und kein Hardware-H.264-Encoder.

### Was der Zero 2 W kostet

Vier Einschränkungen, alle beherrschbar, wenn man sie vor der Bestellung kennt:

1. **512 MB RAM — und der kritische Moment ist `npm install`, nicht der Betrieb.** Der
   Dienst selbst ist klein; der Update-Pfad (`git pull` + `npm install`) läuft an die
   Speichergrenze. **`install.sh` erledigt das**: auf jedem Board unter 1,5 GB richtet er
   **zram** ein — komprimierter Swap im RAM, es wird also nichts zusätzlich auf die
   SD-Karte geschrieben — mit 60 % und zstd, und einen größeren Pi lässt er in Ruhe.
   Prüfen mit `swapon --show`: `/dev/zram0` soll eine höhere Priorität haben als die
   Swapdatei auf der Karte. Von Hand, falls du den Installer nicht nutzt:
   ```bash
   sudo apt install -y zram-tools
   printf 'ALGO=zstd\nPERCENT=60\nPRIORITY=100\n' | sudo tee -a /etc/default/zramswap
   sudo systemctl restart zramswap
   ```
2. **Ein Funkchip, nur 2,4 GHz.** Access Point *und* WLAN-Uplink gleichzeitig ist auf dem
   Broadcom-Chip nicht zuverlässig (gilt auch für den Pi 4). Mit LTE-Stick als Uplink —
   Einsatzform 1 in `docs/CONCEPT.md` — ist das egal, weil das Funkmodul dann nur AP
   macht. Form 2 (hinter einer FritzBox) will Ethernet, am Zero also einen USB-Adapter
   und damit einen Hub.
3. **Eine einzige Micro-USB-Datenbuchse (OTG).** Der LTE-Stick braucht einen
   Micro-USB-OTG-Adapter, alles darüber hinaus einen Hub. Strom immer über die
   **PWR**-Buchse, nie über die Datenbuchse.
4. **Kein Ethernet.** Siehe Punkt 2.

## Strombudget

Feldwerte für eine Box ohne Bildschirm, hier nicht nachgemessen:

| Teil | Dauerhaft | Anmerkung |
|---|---|---|
| Pi Zero 2 W, Leerlauf | 0,4–0,7 W | headless, kein HDMI |
| Pi Zero 2 W, AP + Dienst + Sensoren | 1,0–1,5 W | der realistische Wert für dieses Projekt |
| Pi 3A+ | ~1,2–1,8 W | |
| Pi 4B | 2,5–3 W Leerlauf, 4–5 W unter Last | |
| LTE-Stick (E3372) | 1,5–2,5 W | **mehr bei schlechtem Empfang** — er sendet dann härter |
| DS3231 RTC | vernachlässigbar | µA aus der eigenen Zelle |
| INA228 & Co. | vernachlässigbar | |
| IP-Kamera (typisch, 12 V ohne PoE) | 3–5 W **pro Stück** | meist der größte Einzelposten |

**Zero 2 W plus LTE-Stick landet bei etwa 2,5–4 W, also 60–95 Wh/Tag.** Batterie nach dem
oberen Wert und nach der schlechtesten erwarteten Schlechtwetterperiode auslegen, nicht
nach dem Mittel.

### Was wirklich Strom spart

Absteigend nach Wirkung — und das ist *nicht* die Reihenfolge, in der man es üblicherweise
versucht:

1. **Kameras nicht durchlaufen lassen.** Eine dauerhaft laufende IP-Kamera kann mehr
   kosten als das gesamte Gateway. Wenn sie nur im Ereignisfall zählt: über einen der
   Schaltausgänge des Gateways versorgen (Shelly / Tasmota / GPIO-Relais) und einschalten,
   wenn du hinsiehst.
2. **Dem LTE-Stick eine richtige externe Antenne geben.** Ein Stick, der schreien muss,
   verbrennt dauerhaft Watt. Besserer Empfang ist billiger als ein größeres Panel.
3. **Das kleinere Board nehmen.** Zero 2 W statt Pi 4 sind ~2 W — real, aber weniger als
   die beiden Punkte darüber.
4. **Abschalten, was das Board nicht braucht:** HDMI (`video=HDMI-A-1:d` in
   `/boot/firmware/cmdline.txt`), die Onboard-LED, Bluetooth (`dtoverlay=disable-bt`),
   falls ungenutzt. Das sind zig Milliwatt. Mitnehmen, aber nichts davon erwarten.
5. **Die ganze Box im Takt schlafen zu legen ist verlockend und meistens falsch.** Ein
   Gateway, das man nicht erreicht, wenn man will, ist kein Gateway. Wenn die Batterie
   wirklich knapp ist, ist die ehrliche Lösung ein größeres Panel — keine Box, die genau
   dann schläft, wenn du sie brauchst.

Die Sensor-History ist **kein** Stromthema: eine Zeile pro Minute sind rund 40 Bytes, ein
volles Jahr also ~21 MB (`packages/gateway/src/sensors/history.ts`).

## Versorgung und Brownout

Hier sterben Insel-Pis tatsächlich, deshalb ein eigener Abschnitt.

- **Den Pi aus einem ordentlichen 5-V-Buck-Wandler** an der Batterie speisen, ausgelegt
  auf mindestens 3 A, auch wenn der Pi das nie zieht. Die Reserve ist das, was die
  Sendespitzen des LTE-Sticks überlebt.
- **Den LTE-Stick möglichst nicht über den Pi versorgen.** Seine Stromspitzen ziehen die
  5-V-Schiene des Pi herunter; das ist der klassische „Pi plus LTE-Stick"-Fehler, der
  SD-Karten zerlegt. Ein aktiver Hub oder ein zweiter Buck-Ausgang trennt die beiden.
- **Auf das Unterspannungs-Flag achten.** Das Gateway liest `vcgencmd get_throttled`
  (`packages/gateway/src/system/health.ts:82`): Bit 0 ist Unterspannung *jetzt*, Bit 16
  Unterspannung *seit dem Boot*. Das zweite ist das nützliche — es fängt die Versorgung,
  die um 3 Uhr nachts eingebrochen ist, als niemand hinsah. Beide stehen auf der
  Setup-Seite, und `undervoltage` kann eine Alarmregel sein: dann sagt es die Box, bevor
  es die Karte sagt.
- **Die Tiefentladeabschaltung des Ladereglers nutzen.** Ein sauberer Schnitt bei einer
  vernünftigen Schwelle ist deutlich freundlicher, als die Schiene langsam durch den
  Brown-out-Bereich des Pi absacken zu lassen.
- **Damit rechnen, dass es unsaubere Abschaltungen gibt** und das Risiko klein halten:
  gute A2-Karte, **kein Swap auf der SD-Karte** (zram liegt im RAM, deshalb oben die
  Empfehlung), und die Sensor-History nur einschalten, wenn du sie willst — sie ist das
  Einzige, was dauerhaft schreibt, und genau deshalb standardmäßig aus.
- **Nicht belegt:** ob eine SD-Karte eine Saison Brownouts in diesem Aufbau übersteht,
  kann dieses Repository nicht behaupten. Wenn der Standort schwer erreichbar ist:
  Ersatzkarte mit fertigem Image in die Box legen.

## Der Uplink

**HiLink-Sticks (Huawei E3372h-320, E8372, …)** sind der erprobte Weg. Der Stick meldet
sich als Netzwerkgerät mit eigenem Router unter `192.168.8.1`, und das Gateway proxyt
seine Weboberfläche auf Port 8081. Wichtig, wie er gefunden wird: über
`ip route get <host>` (`packages/gateway/src/system/hilink.ts`), **nie** über den
Interface-Namen — ein LAN an einem anderen `eth*` darf nicht mit ihm verwechselt werden.

**ModemManager-Modems** (APN, SIM-PIN, Netzmodus, Roaming) sind die zweite unterstützte
Form. Beides geht; der HiLink ist der einfacher zu kaufende.

**Die Antenne zählt mehr als der Stick.** Zwei TS-9-Pigtails an eine Richtantenne, auf die
Zelle ausgerichtet, die du tatsächlich bekommst — das ist in dieser Liste das beste
Verhältnis aus Strom und Zuverlässigkeit.

**Mobilfunkbetreiber nutzen CGNAT**, deshalb ist Tailscale der Weg hinein und keine
Portweiterleitung.

## Sensoren

Die Umrechner des Gateways decken ab, und der Knopf *Detect hardware* auf der Setup-Seite
sucht nach:

- **Strom/Spannung:** INA219, INA226, INA260, **INA228** (empfohlen: 20 Bit, 85 V Bus,
  und er zählt die Ladung im Chip, ein Neustart des Pi verliert den Zähler also nicht),
  INA237/INA238 (gleiches 85-V-Frontend, Ladung wird stattdessen auf dem Pi integriert).
- **ADC:** ADS1115 / ADS1015, für alles, was nur ein Spannungsteiler ist.
- **Temperatur:** DS18B20 (1-Wire), MCP9808, TMP102, TMP117.
- **Uhr:** DS3231. Per Checkbox auf der Setup-Seite aktivieren statt per SSH-Sitzung. Ohne
  sie stempelt eine Box, die ohne Verbindung bootet, ihre History auf 1970 — und macht
  damit ein Jahr Messwerte wertlos.

Den INA228 **in die Batterieleitung** setzen, damit das Vorzeichen des Stroms Laden von
Entladen unterscheidet — erst das macht eine Ladezustandsanzeige überhaupt möglich. Sein
85-V-Bereich heißt: 12 V oder 24 V brauchen keinen Teiler.

## Kameras

**IP-Kameras mit RTSP.** Die reicht das Gateway direkt durch
(`ffmpeg … -c copy`, `packages/gateway/src/video/cameraManager.ts:107`), die CPU-Last ist
nahe null und selbst ein Zero 2 W schafft mehrere.

**USB-Webcams werden transkodiert** (`cameraManager.ts:112`). Auf dem Zero 2 W heißt das:
Hardware-Encoder (`h264_v4l2m2m`), eine Kamera, moderate Auflösung — und genau deshalb ist
der Pi 5 ohne H.264-Encoder hier das falsche Board. Wenn du die Wahl hast: IP-Kameras
kaufen und nie wieder darüber nachdenken.

**Eine CSI-Kamera am Flachbandanschluss des Pi** geht ebenfalls (Typ `rpicam`).
Automatisch erkannt werden nur die offiziellen Raspberry-Pi-Sensoren; eine Arducam braucht
`camera_auto_detect=0` plus ein explizites `dtoverlay=` — das schreibt **Setup › Cameras ›
CSI camera module** für dich in `/boot/firmware/config.txt`: ein Backup bleibt als
`config.txt.yondergate-bak` liegen, konkurrierende Zeilen werden auskommentiert statt
gelöscht, und das Panel zeigt *Reboot required*, bis der Pi damit gebootet hat. Der Fokus
ist eine eigene Falle: Raspberry Pis Tuning-Datei `imx519.json` enthält keinen
Autofokus-Algorithmus, eine Arducam 16 MP bleibt also dauerhaft unscharf, egal was man
einstellt. Die Modulauswahl trägt die Tuning-Datei
`/var/lib/yondergate/tuning/imx519-af.json` ein, die das behebt; danach einen
**Focus**-Modus wählen — an einer fest montierten Kamera ist `manual` auf 0 Dioptrien
besser als `continuous`, das bei jedem Szenenwechsel neu sucht.

Video ist ausdrücklich nicht das Thema dieses Projekts, siehe `docs/CONCEPT.md`.

## Verdrahtungsskizze

```
 Solarpanel
     │
     ▼
 Laderegler ──── Tiefentladeabschaltung
     │
     ├──────────────► Batterie (12 V)
     │
     ▼  Lastausgang
  [ INA228-Shunt in diese Leitung ]
     │
     ├──► 5-V-Buck (≥3 A) ──► Pi (PWR-Buchse)
     │                          │  Micro-USB-OTG
     │                          └──► LTE-Stick   ← aktiver Hub oder eigener Buck,
     │                                              wenn die Schiene einbricht
     └──► 12 V ──► IP-Kamera(s), geschaltet über Shelly/Tasmota/GPIO-Relais
```

## Was nicht belegt ist

Alles in dieser Datei ist Auslegungshilfe. Nichts davon lief bisher an einem echten
Standort; die Hardware-Pfade (I²C, nmcli, mmcli, rfkill, Ping-Sweeps, `tailscale set`)
sind nur auf dem Pi selbst beweisbar. Wenn du eine Box baust, sind die Zahlen auf der
Sensorseite das Erste, was sich gegen dieses Budget prüfen lässt.
