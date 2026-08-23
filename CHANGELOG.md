# Changelog

All notable changes to YonderGate. Entries are bilingual (English / Deutsch).

## v0.15.1
**English**
- **The READMEs have screenshots now** — they had none at all, which for a project whose
  whole surface is one page was an odd omission. Two, in both languages: the setup page
  with system status and the site-network panel, and the site-health readings.
- Both READMEs describe the **thermal clamp** next to under-voltage, and the **clean
  shutdown**; the TODO says so too. Taken with headless Chrome against the simulator, so
  they can be retaken the same way after the next change rather than depending on someone
  having hardware to hand.

**Deutsch**
- **Die READMEs haben jetzt Screenshots** — sie hatten gar keine, was für ein Projekt,
  dessen gesamte Oberfläche eine einzige Seite ist, eine merkwürdige Lücke war. Zwei
  Stück, in beiden Sprachen: die Setup-Seite mit Systemstatus und dem Panel „Site
  network", und die Zustandswerte des Standorts.
- Beide READMEs beschreiben die **thermische Drosselung** neben der Unterspannung und das
  **saubere Herunterfahren**; die TODO sagt es ebenfalls. Aufgenommen mit headless Chrome
  gegen den Simulator — sie lassen sich nach der nächsten Änderung also genauso neu
  erzeugen, statt davon abzuhängen, dass gerade jemand Hardware zur Hand hat.

## v0.15.0
**English**
- **Heat is now told apart from a sagging supply.** The firmware clamps the Pi's clock for
  two completely different reasons, and `parseThrottled` only ever read the two
  under-voltage bits. A box in a sealed enclosure in the sun — the normal case for this
  project — would have reported *supply: ok* while crawling at 600 MHz: the same slow,
  flaky behaviour, with a fix that has nothing to do with the battery. Bits 2 and 3 are
  read as well now, shown as their own **clock speed** row, and watched by their own alert
  rule (`health:thermal`, on by default for a new box).
- `explainClamp()` says which one it is in words that point somewhere: a sag at the battery
  under load, an undersized buck converter or a long thin run from the panel; heat at
  shade, a vent or a heatsink. The tests assert that the heat message never mentions the
  supply, because that is the whole point of separating them.
- **Shut down gateway** (Setup › System). Cutting power to a Pi mid-write is how an SD card
  in a box on a pole becomes a drive out there with a card reader. The warning is sized for
  a remote site: it does not come back on its own, and someone has to be at the box.

**Deutsch**
- **Hitze wird jetzt von einer einbrechenden Versorgung unterschieden.** Die Firmware
  drosselt den Takt des Pi aus zwei völlig verschiedenen Gründen, und `parseThrottled` las
  bisher nur die beiden Unterspannungs-Bits. Eine Box im geschlossenen Gehäuse in der Sonne
  — der Normalfall für dieses Projekt — hätte *supply: ok* gemeldet, während sie mit
  600 MHz kroch: dasselbe langsame, zickige Verhalten, mit einer Abhilfe, die nichts mit
  dem Akku zu tun hat. Bit 2 und 3 werden jetzt mitgelesen, als eigene Zeile **clock
  speed** angezeigt und von einer eigenen Alarmregel überwacht (`health:thermal`, bei einer
  neuen Box standardmäßig an).
- `explainClamp()` sagt, welcher der beiden Fälle vorliegt, und zwar in Worten, die
  irgendwohin zeigen: ein Einbruch auf den Akku unter Last, einen unterdimensionierten
  Wandler oder eine lange dünne Leitung vom Panel; Hitze auf Schatten, Belüftung oder
  Kühlkörper. Die Tests halten fest, dass die Hitze-Meldung die Versorgung **nie** erwähnt
  — genau dafür trennt man die beiden.
- **Shut down gateway** (Setup › System). Einem Pi mitten im Schreibvorgang den Strom zu
  nehmen ist der Weg, auf dem eine SD-Karte in einer Box am Mast zu einer Anfahrt mit
  Kartenleser wird. Die Warnung ist für einen entlegenen Standort formuliert: von allein
  kommt sie nicht zurück, es muss jemand an die Box.

## v0.14.3
**English**
- **Removed `scaleCamera`.** It came across with the fork and scaled a camera's resolution
  and bitrate for a quality level requested by a ground station — which this project does
  not have and is not going to have. Nothing outside the tests called it, so it was code
  that described a feature the gateway does not offer. Its three tests and their fixture
  went with it.

**Deutsch**
- **`scaleCamera` entfernt.** Es kam mit dem Fork mit und skalierte Auflösung und Bitrate
  einer Kamera auf eine von einer Bodenstation angeforderte Qualitätsstufe — die es hier
  nicht gibt und nicht geben wird. Außerhalb der Tests rief es niemand auf, es war also
  Code, der ein Feature beschrieb, das das Gateway nicht hat. Seine drei Tests und deren
  Fixture sind mitgegangen.

## v0.14.2
**English**
- **The camera row stopped talking about the IMX519 under every other sensor** — same
  fix as YonderRC v1.54.1, and the same bug, because the row was ported from there. The
  tuning-file placeholder and the note underneath were hardcoded, so an OV5647 was offered
  an Arducam's file path and told about an autofocus algorithm it has no motor for. Both
  now follow the selected CSI module.
- **Focus controls only where there is a lens to move.** A module naming one sensor
  without an actuator says so instead of offering a dropdown that does nothing;
  auto-detect and a custom overlay keep the controls, since either might turn up an
  IMX708. A focus value already stored stays visible and editable.
- The camera rows re-render when the module selection changes, so the two follow each
  other without a page reload.
- YonderRC's other fix of the day (v1.54.2, auto video quality freezing the picture) has
  **no counterpart here**: the gateway has no ground station, no WebRTC panel and no
  auto-quality controller. `scaleCamera` is inherited from the fork and currently has no
  caller outside the tests.

**Deutsch**
- **Die Kamerazeile redet nicht mehr unter jedem anderen Sensor von der IMX519** — derselbe
  Fix wie YonderRC v1.54.1 und derselbe Fehler, weil die Zeile von dort portiert wurde.
  Platzhalter für die Tuning-Datei und der Hinweis darunter waren hartkodiert: einer OV5647
  wurde der Dateipfad einer Arducam angeboten und von einem Autofokus-Algorithmus erzählt,
  für den sie keinen Motor hat. Beides folgt jetzt dem gewählten CSI-Modul.
- **Fokus-Bedienelemente nur dort, wo es eine Linse zu bewegen gibt.** Ein Modul, das genau
  einen Sensor ohne Aktuator benennt, sagt das, statt ein Dropdown anzubieten, das nichts
  tut; bei Auto-Detect und eigenem Overlay bleiben sie, weil dort eine IMX708 auftauchen
  kann. Ein bereits gespeicherter Fokuswert bleibt sichtbar und änderbar.
- Die Kamerazeilen werden neu gezeichnet, wenn die Modulauswahl wechselt.
- YonderRCs zweiter Fix des Tages (v1.54.2, Auto-Videoqualität fror das Bild ein) hat hier
  **kein Gegenstück**: das Gateway hat keine Bodenstation, kein WebRTC-Panel und keine
  Auto-Qualitätsregelung. `scaleCamera` stammt aus dem Fork und hat außerhalb der Tests
  derzeit keinen Aufrufer.

## v0.14.1
**English**
- **The update button no longer uninstalls the sensor driver.** `i2c-bus` is an
  optionalDependency, and the update runs `npm install --omit=optional`, which prunes it.
  `install.sh` puts it back from the recorded `hardwareDeps`; the in-app update never did,
  so pressing *Update & restart* silently dropped a configured gateway back to simulated
  sensors until someone reinstalled it by hand. `updateSteps` now appends a restore step
  after the pruning install, through the same allowlist as `hwDeps.ts`
  (`restorableHwDeps`) — the value comes from a config file and ends up in an npm command
  line, so it is never passed through unchecked.
- The gateway's allowlist is `i2c-bus` alone: it drives no servos and no SBUS, so
  YonderRC's `pigpio` and `serialport` are modules this box should never install, and the
  tests say so.
- Same fix as YonderRC v1.50.0, where it was found on real hardware after an update had
  quietly removed the PCA9685 driver.

**Deutsch**
- **Der Update-Knopf deinstalliert den Sensortreiber nicht mehr.** `i2c-bus` ist eine
  optionalDependency, und das Update führt `npm install --omit=optional` aus — das
  entfernt sie. `install.sh` stellt sie aus den gespeicherten `hardwareDeps` wieder her,
  das Update im UI aber nie: *Update & restart* hat ein konfiguriertes Gateway also
  stillschweigend auf simulierte Sensoren zurückfallen lassen, bis jemand von Hand
  nachinstalliert hat. `updateSteps` hängt jetzt nach dem aufräumenden Install einen
  Wiederherstellungsschritt an, über dieselbe Allowlist wie `hwDeps.ts`
  (`restorableHwDeps`) — der Wert kommt aus einer Konfigurationsdatei und landet in einer
  npm-Kommandozeile, wird also nie ungeprüft durchgereicht.
- Die Allowlist des Gateways ist ausschließlich `i2c-bus`: es treibt weder Servos noch
  SBUS, YonderRCs `pigpio` und `serialport` sind hier also Module, die diese Box nie
  installieren sollte — die Tests halten das fest.
- Derselbe Fix wie YonderRC v1.50.0, wo er an echter Hardware auffiel, nachdem ein Update
  den PCA9685-Treiber klammheimlich entfernt hatte.

## v0.14.0
**English**
- **Camera handling is now the same on both platforms**, ported from YonderRC
  v1.52.1–v1.54.0 and verified there on a Pi 4B.
- **Rotation and mirroring per camera**: 0° / 180° plus independent horizontal and
  vertical mirrors, for CSI and USB alike. A camera bolted under a roof edge upside down
  is the normal case for a site gateway. It is one transform, not three options — a 180°
  rotation *is* both mirrors, so all three settings collapse into two booleans before
  anything is emitted, and "180° and also mirrored" cancels on that axis instead of
  depending on the order a camera stack applies two flags in. CSI does it in the sensor
  and it is free; V4L2 gets an ffmpeg `-vf` filter written without spaces, because go2rtc
  splits an `exec:` line on whitespace. 90°/270° are deliberately absent: the sensor
  cannot do them and faking them would put a transcode back into the pipeline.
- **Switching camera module cleans up after the previous one.** A tuning file is a
  *sensor* calibration, so leaving an Arducam IMX519's on a Raspberry Pi OV5647 hands the
  new sensor another one's colour and exposure model — silently, with a picture that still
  looks plausible. `reconcileCameras` now runs on every module selection: it fills in the
  new module's tuning file, drops the previous module's, and clears a focus mode the new
  module has no actuator for. Only catalogue values are touched — a hand-entered path is
  the operator's and stays — and USB cameras are never touched.
- **The go2rtc reload log no longer lies.** go2rtc restarts *itself* on
  `POST /api/restart` and often drops the connection before answering, after which the
  gateway claimed the config had not been applied. It now asks which streams are actually
  being served before saying anything.
- **No camera is stated as a valid setup**, in the preview and in the startup banner,
  rather than reading like something is missing. The gateway's preview is a manual still
  frame, so it never had YonderRC's reconnect problem — nothing to fix there, only the
  wording.
- **Not verified on a gateway.** All of it was proven on the YonderRC vehicle — same Pi
  OS, same libcamera, same code — but no YonderGate box has run it.

**Deutsch**
- **Die Kamera-Behandlung ist jetzt auf beiden Plattformen gleich**, portiert aus YonderRC
  v1.52.1–v1.54.0 und dort an einem Pi 4B verifiziert.
- **Rotation und Spiegelung pro Kamera**: 0° / 180° plus unabhängige horizontale und
  vertikale Spiegelung, für CSI und USB gleichermaßen. Eine unter einer Dachkante über
  Kopf verschraubte Kamera ist bei einem Standort-Gateway der Normalfall. Es ist eine
  Transformation, nicht drei Optionen — eine 180°-Drehung *ist* beide Spiegelungen, also
  fallen alle drei Einstellungen in zwei Booleans zusammen, und „180° und zusätzlich
  gespiegelt" hebt sich auf dieser Achse auf, statt von der Reihenfolge abzuhängen, in der
  ein Kamera-Stack zwei Flags anwendet. CSI macht das im Sensor und kostet nichts; V4L2
  bekommt einen ffmpeg-`-vf`-Filter ohne Leerzeichen, weil go2rtc eine `exec:`-Zeile an
  Leerzeichen trennt. 90°/270° fehlen bewusst: der Sensor kann sie nicht, und sie
  nachzubilden hieße, einen Transcode in die Pipeline zurückzuholen.
- **Ein Modulwechsel räumt hinter dem vorherigen auf.** Eine Tuning-Datei ist eine
  *Sensor*-Kalibrierung; die einer Arducam IMX519 auf einer Raspberry Pi OV5647 stehen zu
  lassen gibt dem neuen Sensor das Farb- und Belichtungsmodell eines fremden —
  stillschweigend, mit einem Bild, das plausibel aussieht. `reconcileCameras` läuft jetzt
  bei jeder Modulauswahl: es trägt die Tuning-Datei des neuen Moduls ein, entfernt die des
  vorherigen und löscht einen Fokusmodus, für den das neue Modul keinen Aktuator hat.
  Angefasst wird nur, was der Katalog gesetzt hat — ein von Hand eingetragener Pfad gehört
  dem Betreiber und bleibt —, USB-Kameras nie.
- **Das go2rtc-Reload-Log lügt nicht mehr.** go2rtc startet sich auf `POST /api/restart`
  selbst neu und legt oft die Verbindung, bevor es antwortet; das Gateway behauptete
  daraufhin, die Konfiguration sei nicht angewandt worden. Jetzt wird erst gefragt, welche
  Streams tatsächlich ausgeliefert werden.
- **Keine Kamera wird als gültige Betriebsart benannt**, im Preview wie im Start-Banner,
  statt zu klingen, als fehle etwas. Der Preview des Gateways ist ein manuelles Standbild
  und hatte YonderRCs Reconnect-Problem daher nie — dort war nichts zu reparieren, nur zu
  formulieren.
- **Auf einem Gateway nicht verifiziert.** Bewiesen ist alles am YonderRC-Fahrzeug —
  gleiches Pi OS, gleiches libcamera, gleicher Code —, aber keine YonderGate-Box hat es
  laufen lassen.

## v0.13.0
**English**
- **The Pi camera path never worked on current Raspberry Pi OS** — ported from YonderRC
  v1.47.0–v1.49.1, where all of this was found and fixed on a real Pi 4B with an Arducam
  16 MP IMX519. YonderGate inherited the same three bugs at the fork.
- **Wrong binary.** The generated go2rtc source called `libcamera-vid`; Bookworm renamed
  the tools to `rpicam-*` and dropped the old symlinks, so go2rtc logged `executable file
  not found in $PATH` and the stream never produced a frame. `detectRpicamBinary()` now
  resolves the real name at startup, `rpicam-vid` first, `libcamera-vid` for Bullseye.
- **A shell pipe that could never work.** The source was `libcamera-vid … -o - | ffmpeg …
  -f rtsp {output}`, but go2rtc runs `exec:` **without a shell** (`shell.QuoteSplit` +
  `exec.Command`), so the `|` and everything after it went to the camera binary as literal
  arguments — fixing the name alone would have changed nothing. Without `{output}` go2rtc
  reads the process stdout and sniffs the format itself, and raw H.264 Annex-B is exactly
  what `rpicam-vid` writes, so ffmpeg is gone from the `rpicam` path entirely: one process
  less, no transcode, less latency.
- **Setup › Cameras › CSI camera module** — pick the sensor instead of editing config.txt
  over SSH. Only the four official Raspberry Pi cameras are auto-detected; Arducam IMX519 /
  64MP Hawkeye / OV64A40 Owlsight / Pivariety each need their own `dtoverlay`. Selecting a
  module writes `camera_auto_detect` and `dtoverlay=` into `/boot/firmware/config.txt` and
  the panel says *Reboot required* until the box has booted with it, with a **Reboot now**
  button next to it. Nothing is rewritten blind: one backup as `config.txt.yondergate-bak`,
  competing lines commented out rather than deleted, our block marked and replaced whole,
  appended under its own `[all]`. A custom overlay name must pass a syntax check *and*
  exist as a `.dtbo` on that Pi.
- **Focus control** — `CameraCfg` gained `focus` (`off`/`manual`/`auto`/`continuous`),
  `lensPosition` in dioptres and `tuningFile`. Raspberry Pi's stock `imx519.json` has no
  `rpi.af` algorithm, so libcamera refuses every focus control and an Arducam 16 MP stays
  permanently soft; `provisioning/tuning/imx519-af.json` adds it, with a **measured** map
  (`[0.0, 597, 10.0, 1023]` — the actuator's rest position is not infinity).
  `install.sh` puts it in `/var/lib/yondergate/tuning/`, and selecting the module fills the
  path into the `rpicam` cameras that have none.
- **`Detect hardware` tells the truth about cameras now.** It ran the same hardcoded
  `libcamera-hello` and, finding nothing, listed every `/dev/video*` — on a Pi with no
  camera at all that is `video10`…`video31`, the V4L2 codec/ISP nodes. It now tries
  `rpicam-hello` first, counts only real capture nodes, and explains the boot config
  instead of always advising a `dtoverlay`.
- Reboot detection compares the effective configuration against what the system actually
  booted with, keyed by the kernel boot id, so switching away and back is silent.
  `SimSystem` keeps its own config.txt, so the whole panel works on a laptop.
- **Not verified on a gateway.** All of it was proven on the YonderRC vehicle — same Pi
  OS, same libcamera, same code — but no YonderGate box has run it.

**Deutsch**
- **Der Pi-Kamera-Pfad hat auf aktuellem Raspberry Pi OS nie funktioniert** — portiert aus
  YonderRC v1.47.0–v1.49.1, wo das alles an einem echten Pi 4B mit einer Arducam 16 MP
  IMX519 gefunden und behoben wurde. YonderGate hat dieselben drei Fehler beim Fork geerbt.
- **Falsches Binary.** Die erzeugte go2rtc-Quelle rief `libcamera-vid`; Bookworm hat die
  Tools nach `rpicam-*` umbenannt und die alten Symlinks entfernt, go2rtc protokollierte
  `executable file not found in $PATH`, und der Stream lieferte nie ein Bild.
  `detectRpicamBinary()` löst den echten Namen jetzt beim Start auf, `rpicam-vid` zuerst,
  `libcamera-vid` für Bullseye.
- **Eine Shell-Pipe, die nie funktionieren konnte.** Die Quelle war `libcamera-vid … -o -
  | ffmpeg … -f rtsp {output}`, aber go2rtc führt `exec:` **ohne Shell** aus
  (`shell.QuoteSplit` + `exec.Command`) — das `|` und alles danach landete als literales
  Argument beim Kamera-Binary, die Umbenennung allein hätte also nichts geändert. Ohne
  `{output}` liest go2rtc den stdout des Prozesses und erkennt das Format selbst, und rohes
  H.264 Annex-B ist genau das, was `rpicam-vid` schreibt — ffmpeg fliegt damit ganz aus dem
  `rpicam`-Pfad: ein Prozess weniger, kein Transcode, weniger Latenz.
- **Setup › Cameras › CSI camera module** — den Sensor auswählen, statt die config.txt über
  SSH zu editieren. Automatisch erkannt werden nur die vier offiziellen Raspberry-Pi-
  Kameras; Arducam IMX519 / 64MP Hawkeye / OV64A40 Owlsight / Pivariety brauchen je ein
  eigenes `dtoverlay`. Die Auswahl schreibt `camera_auto_detect` und `dtoverlay=` in
  `/boot/firmware/config.txt`, danach zeigt das Panel *Reboot required*, bis die Box damit
  gebootet hat — mit einem **Reboot now**-Knopf daneben. Es wird nichts blind
  überschrieben: ein Backup als `config.txt.yondergate-bak`, konkurrierende Zeilen
  auskommentiert statt gelöscht, unser Block markiert und als Ganzes ersetzt, unter einem
  eigenen `[all]` angehängt. Ein eigener Overlay-Name muss die Syntaxprüfung bestehen *und*
  als `.dtbo` auf diesem Pi existieren.
- **Fokussteuerung** — `CameraCfg` hat jetzt `focus` (`off`/`manual`/`auto`/`continuous`),
  `lensPosition` in Dioptrien und `tuningFile`. Raspberry Pis mitgelieferte `imx519.json`
  enthält keinen `rpi.af`-Algorithmus, libcamera lehnt daher jede Fokus-Steuerung ab und
  eine Arducam 16 MP bleibt dauerhaft unscharf; `provisioning/tuning/imx519-af.json` ergänzt
  ihn, mit einer **gemessenen** Abbildung (`[0.0, 597, 10.0, 1023]` — die Ruhelage des
  Aktuators ist nicht Unendlich). `install.sh` legt sie nach `/var/lib/yondergate/tuning/`,
  und die Modulauswahl trägt den Pfad in die `rpicam`-Kameras ein, die noch keinen haben.
- **`Detect hardware` sagt jetzt die Wahrheit über Kameras.** Es rief dasselbe
  hartkodierte `libcamera-hello` auf und listete mangels Treffer jedes `/dev/video*` — auf
  einem Pi ganz ohne Kamera sind das `video10`…`video31`, die V4L2-Codec/ISP-Knoten. Jetzt
  zuerst `rpicam-hello`, nur echte Capture-Knoten, und statt immer zu einem `dtoverlay` zu
  raten wird die Boot-Konfiguration erklärt.
- Die Reboot-Erkennung vergleicht die effektive Konfiguration mit der, mit der das System
  tatsächlich gebootet hat, über die Kernel-Boot-ID — hin und zurück schalten bleibt
  daher still. `SimSystem` führt eine eigene config.txt, das Panel ist also auf dem Laptop
  vollständig bedienbar.
- **Auf einem Gateway nicht verifiziert.** Bewiesen ist alles am YonderRC-Fahrzeug —
  gleiches Pi OS, gleiches libcamera, gleicher Code —, aber keine YonderGate-Box hat es
  laufen lassen.

## v0.12.12
**English**
- **`README.de.md`** — the German README, in full rather than a summary: every section,
  every TODO item, the tariff table and the two running budgets. Both files now carry the
  language switcher at the top, the same way YonderRC does, and the German one links the
  German docs (`HARDWARE.de.md`, `DATA-BUDGET.de.md`) rather than sending the reader back
  to English.
- **A test fails if the two drift apart.** Same sections, same number of TODO items, same
  ones ticked, and each pointing at the other. It cannot judge a translation, but it
  catches the thing that actually happens: a bullet added to one of them and forgotten in
  the other. Verified by breaking it on purpose before committing.
- **CLAUDE.md says the rule out loud**: both language versions are edited in the *same
  commit*, always. A translation that lags is worse than none — it states as current
  something the project stopped doing, and the reader has no way to tell which of the two
  is the lie.
- The same guard and the same wording went into **YonderRC** (v1.46.3), whose two READMEs
  already matched.

**Deutsch**
- **`README.de.md`** — die deutsche README, vollständig statt als Zusammenfassung: jeder
  Abschnitt, jeder TODO-Punkt, die Tariftabelle und die beiden Betriebsbudgets. Beide
  Dateien tragen jetzt oben den Sprachumschalter, so wie YonderRC es macht, und die
  deutsche verlinkt die deutschen Dokumente (`HARDWARE.de.md`, `DATA-BUDGET.de.md`), statt
  den Leser zurück ins Englische zu schicken.
- **Ein Test schlägt fehl, wenn die beiden auseinanderlaufen.** Dieselben Abschnitte,
  dieselbe Zahl an TODO-Punkten, dieselben abgehakt, und jede verweist auf die andere.
  Über die Qualität einer Übersetzung sagt das nichts, aber es fängt das, was wirklich
  passiert: ein Punkt, der in einer ergänzt und in der anderen vergessen wird. Vor dem
  Commit absichtlich kaputtgemacht und geprüft, dass er anschlägt.
- **CLAUDE.md sagt die Regel ausdrücklich**: Beide Sprachfassungen werden im *selben
  Commit* bearbeitet, immer. Eine hinterherhinkende Übersetzung ist schlechter als keine —
  sie behauptet als aktuell, was das Projekt nicht mehr tut, und der Leser kann nicht
  erkennen, welche der beiden lügt.
- Derselbe Wächter und derselbe Wortlaut sind in **YonderRC** gelandet (v1.46.3), dessen
  beide READMEs ohnehin schon zusammenpassten.

## v0.12.11
**English**
- **The 80 % warning now works for prepaid credit billed per megabyte, not just a monthly
  allowance.** Setup › Mobile data has both shapes: *a monthly allowance* as before, or
  *prepaid credit* — you enter what you last loaded onto the card and what a megabyte
  costs (3–5 ct on a German prepaid tariff), and the same warning fires at 80 % of the
  balance instead of 80 % of a bucket.
- **A card billed per MB has no month, so the counter does not have one either.** It runs
  from the **last top-up**, not from the 1st, with an *I topped it up* button that starts
  it again. The monthly figure keeps running alongside for anyone who still wants it.
- **It says how long the credit lasts** — "about 40 more days at 0.60 €/month" — computed
  from what was actually spent since the top-up. Under a day of history it refuses to
  project rather than dress a guess up as a number. On most German prepaid tariffs the
  top-up is also what stops the SIM being deactivated for inactivity, so that line doubles
  as the reminder for the next one.
- **Fixed while doing it: the monthly counter dropped one poll interval at every month
  boundary.** The reading that crossed midnight on the 1st used to be thrown away and
  taken as a new baseline. Invisible at a minute's resolution — but the credit total has
  no month, and would have lost that chunk every month for years. The reading now carries
  across; the test that encoded the old behaviour was updated rather than worked around.
- An existing `usage.json` from before this release loads unchanged; both new fields are
  optional and default to zero.
- **The README now says what this thing costs to run**, both budgets, with the measured
  figures: watts (≈2.5–4 W, and why the board is only the third biggest lever) and
  megabytes, plus a tariff table for private customers — per-MB prepaid at 25 ct–1 € a
  month against our own standby, an auto-renewing pack that doubles as the top-up, a
  monthly data tariff at ~2.99 €, and the pay-per-use IoT SIM at ten times the price. With
  the trap named: most providers count a top-up, not usage.

**Deutsch**
- **Die 80-%-Warnung funktioniert jetzt auch für Prepaid-Guthaben mit MB-Abrechnung**,
  nicht nur für ein Monatskontingent. Setup › Mobile data kennt beide Formen: *monatliches
  Kontingent* wie bisher, oder *Prepaid-Guthaben* — du trägst ein, was du zuletzt
  aufgeladen hast und was ein Megabyte kostet (3–5 ct in einem deutschen Prepaid-Tarif),
  und dieselbe Warnung kommt bei 80 % des Guthabens statt bei 80 % eines Eimers.
- **Eine Karte mit MB-Abrechnung hat keinen Monat, also hat der Zähler auch keinen.** Er
  läuft ab der **letzten Aufladung**, nicht ab dem Ersten, mit einem Knopf *I topped it
  up*, der ihn neu startet. Die Monatszahl läuft für alle, die sie mögen, daneben weiter.
- **Er sagt, wie lange das Guthaben reicht** — „noch etwa 40 Tage bei 0,60 €/Monat" —
  gerechnet aus dem, was seit der Aufladung tatsächlich ausgegeben wurde. Bei weniger als
  einem Tag Historie verweigert er die Hochrechnung, statt eine Vermutung als Zahl zu
  verkleiden. In den meisten deutschen Prepaid-Tarifen ist die Aufladung zugleich das, was
  die SIM vor der Abschaltung bewahrt — diese Zeile ist also auch die Erinnerung an die
  nächste.
- **Dabei behoben: der Monatszähler verlor an jeder Monatsgrenze ein Poll-Intervall.** Die
  Messung, die über Mitternacht des Ersten lief, wurde verworfen und als neue Basislinie
  genommen. Bei Minutenauflösung unsichtbar — aber das Guthabenkonto hat keinen Monat und
  hätte diesen Brocken jahrelang jeden Monat verloren. Die Messung wird jetzt übernommen;
  der Test, der das alte Verhalten festschrieb, wurde korrigiert statt umgangen.
- Eine bestehende `usage.json` von vor diesem Release lädt unverändert; beide neuen Felder
  sind optional und starten bei null.
- **Die README sagt jetzt, was der Betrieb kostet**, beide Budgets mit den gemessenen
  Zahlen: Watt (≈2,5–4 W, und warum das Board nur der drittgrößte Hebel ist) und Megabyte,
  dazu eine Tariftabelle für Privatkunden — Prepaid pro MB mit 25 ct–1 € im Monat gegen
  unseren eigenen Standby gerechnet, ein Auto-Paket, das zugleich die Aufladung ist, ein
  Monats-Datentarif ab ~2,99 €, und die Pay-per-use-IoT-SIM zum zehnfachen Preis. Mit der
  benannten Falle: die meisten Anbieter zählen eine Aufladung, nicht die Nutzung.

## v0.12.10
**English**
- **Prepaid: pack or per megabyte?** The data-budget doc now answers it with our own
  measurements instead of hand-waving. Per MB in an ordinary German tariff is **3–5 ct**
  (congstar ~5 ct, CallYa ~3 ct) — four to seven times cheaper than the pay-per-use IoT
  SIMs. Against the measured standby of 5–20 MB a month that is **25 ct to 1 € a month**;
  the watchdog at five minutes is ~15 ct, an hour with the page open ~10 ct.
- **The break-even is ~60–130 MB a month**, which is exactly where looking at cameras stops
  being rare. Two things decide it beyond the arithmetic: an **auto-renewing pack is also
  the top-up**, so it keeps the SIM alive by itself and there is no yearly ritual to forget;
  and **per MB has no ceiling except the credit** — a forgotten camera stream or a retry
  loop bills straight through, which on prepaid caps the damage but leaves the box offline
  until somebody notices.
- **The cheapest small data tariffs, with numbers** (August 2026, and they move): ~2.99 €
  for 3 GB monthly-cancellable in the o2 network is the cheapest on the market; ~2 € gets
  you congstar prepaid data in the **Telekom network**, dearer per GB and better where
  reach actually matters. Small packs are a trap — 3 GB usually costs less than 1 GB.
- **And the one that looks like the answer and is not:** GMX FreePhone advertises 3 GB for
  **0 €** and is **eSIM only**, which a HiLink stick cannot take. The price also holds only
  while you open their mail app ten days a month, is guaranteed for a year, and carries an
  auto-top-up. Written down so it gets rejected once rather than re-suggested forever.
- The recommendation is now two-stage: **start per MB, let the built-in counter tell you
  when you cross ~100 MB**, then switch to the smallest auto-renewing pack — which from
  that point is both cheaper and the thing that stops the SIM being deactivated.

**Deutsch**
- **Prepaid: Paket oder pro Megabyte?** Die Datenbudget-Doku beantwortet das jetzt mit
  unseren eigenen Messungen statt mit Gefühl. Pro MB sind es in einem normalen deutschen
  Tarif **3–5 ct** (congstar ~5 ct, CallYa ~3 ct) — vier- bis siebenmal billiger als die
  Pay-per-use-IoT-SIMs. Gegen den gemessenen Standby von 5–20 MB im Monat sind das **25 ct
  bis 1 € im Monat**; der Watchdog im Fünf-Minuten-Takt ~15 ct, eine Stunde mit offener
  Seite ~10 ct.
- **Der Break-even liegt bei ~60–130 MB im Monat**, also genau dort, wo Kamerablicke
  aufhören, selten zu sein. Zwei Dinge entscheiden über die Rechnung hinaus: Ein sich
  **automatisch verlängerndes Paket ist zugleich die Aufladung**, hält die SIM also von
  selbst am Leben, und es gibt kein Jahresritual zu vergessen; und **pro MB hat keine
  Obergrenze außer dem Guthaben** — ein vergessener Kamerastream oder eine Retry-Schleife
  wird durchgerechnet, was auf Prepaid den Schaden deckelt, die Box aber offline lässt, bis
  es jemand merkt.
- **Die günstigsten kleinen Datentarife, mit Zahlen** (Stand August 2026, und sie bewegen
  sich): ~2,99 € für 3 GB monatlich kündbar im o2-Netz ist das Günstigste am Markt; ~2 €
  bringen congstar Prepaid Daten im **Telekom-Netz**, teurer pro GB und besser da, wo
  Empfang wirklich zählt. Kleine Pakete sind eine Falle — 3 GB kosten meist weniger als
  1 GB.
- **Und das, was nach der Antwort aussieht und keine ist:** GMX FreePhone bewirbt 3 GB für
  **0 €** und gibt es **nur als eSIM**, was ein HiLink-Stick nicht kann. Der Preis gilt
  außerdem nur, solange man deren Mail-App an zehn Tagen im Monat öffnet, ist ein Jahr
  garantiert und hat eine Datenautomatik dran. Aufgeschrieben, damit es einmal verworfen
  wird statt ewig wieder vorgeschlagen.
- Die Empfehlung ist jetzt zweistufig: **pro MB anfangen, den eingebauten Zähler sagen
  lassen, wann du über ~100 MB kommst**, dann auf das kleinste sich automatisch
  verlängernde Paket wechseln — das ab da beides ist: billiger und das, was die SIM vor der
  Abschaltung bewahrt.

## v0.12.9
**English**
- **The SMS wake is decided against, and the reason is written down** rather than left as
  a TODO somebody re-proposes in three months. It failed on the tariff, not the code: the
  wake channel is only as reliable as the SIM's ability to receive an SMS, and the products
  a private customer can actually buy do not dependably come with a usable number — data-only
  M2M tariffs frequently have no MSISDN at all. A way in that works until the day you need
  it is worse than not having one.
- **The tariff advice was wrong and is corrected.** It recommended an "IoT lifetime bundle
  with SMS" — 1NCE and o2's *Easy IoT* are exactly the right shape for this box and **both
  are business-customer products**. Recommending something the reader cannot buy is worse
  than recommending nothing.
- **What a private customer actually has**, now in the doc with figures: a pay-per-use IoT
  SIM that keeps the shape but bills small users at the worst rate (~20 ct/MB once the
  under-5 MB surcharge applies), ordinary prepaid chosen for its inactivity rule, or a small
  monthly data tariff with no rule to track at all.
- **The inactivity rules are tabulated, and the trap is named.** They run from 90 days
  (Vodafone CallYa — unusable for a box meant to be quiet) to 24 months (Telekom). And the
  catch is not the one you would guess: **most providers count a top-up, not usage**, so a
  gateway quietly spending 5 MB a month can still be switched off for inactivity.
- The recommendation is now **coverage first**: at a remote plot the network that reaches
  the box decides more than the price, and a stick that has to transmit hard also burns
  watts. Then a prepaid SIM on the Telekom network, with the top-up date in a calendar.

**Deutsch**
- **Der SMS-Weckruf ist abgesagt, und der Grund steht geschrieben** statt als TODO
  liegenzubleiben, das in drei Monaten jemand erneut vorschlägt. Gescheitert ist er am
  Tarif, nicht am Code: Der Weckkanal ist nur so verlässlich wie die Fähigkeit der SIM,
  eine SMS zu empfangen — und die Produkte, die ein Privatkunde tatsächlich kaufen kann,
  kommen nicht zuverlässig mit einer brauchbaren Nummer; reine M2M-Datentarife haben oft
  gar keine MSISDN. Ein Weg hinein, der bis zu dem Tag funktioniert, an dem man ihn
  braucht, ist schlechter als keiner.
- **Der Tarifrat war falsch und ist korrigiert.** Empfohlen war ein „IoT-Lifetime-Kontingent
  mit SMS" — 1NCE und das o2-Gegenstück *Easy IoT* haben genau die richtige Form für diese
  Box und sind **beide Geschäftskundenprodukte**. Etwas zu empfehlen, das der Leser nicht
  kaufen kann, ist schlechter als gar nichts zu empfehlen.
- **Was ein Privatkunde wirklich hat**, jetzt mit Zahlen in der Doku: eine
  Pay-per-use-IoT-SIM, die die Form behält, aber kleine Verbraucher zum schlechtesten Satz
  abrechnet (~20 ct/MB, sobald der Aufschlag unter 5 MB greift), normales Prepaid, ausgewählt
  nach seiner Inaktivitätsregel, oder ein kleiner Monats-Datentarif ganz ohne Regel.
- **Die Inaktivitätsfristen stehen als Tabelle da, und die Falle ist benannt.** Sie reichen
  von 90 Tagen (Vodafone CallYa — für eine bewusst stille Box unbrauchbar) bis 24 Monate
  (Telekom). Und der Haken ist nicht der vermutete: **die meisten Anbieter zählen eine
  Aufladung, nicht die Nutzung** — ein Gateway, das still 5 MB im Monat verbraucht, kann
  also trotzdem wegen Inaktivität abgeschaltet werden.
- Die Empfehlung lautet jetzt **erst Empfang**: An einem abgelegenen Standort entscheidet
  das Netz, das die Box erreicht, mehr als der Preis, und ein Stick, der hart senden muss,
  verbrennt auch Watt. Danach eine Prepaid-Karte im Telekom-Netz, Aufladedatum in den
  Kalender.

## v0.12.8
**English**
- **The two button rows in the uplink panel were touching.** *Open now* and *Save mode* sat
  flush against each other with no air, which read as one control. Both rows now carry the
  same spacing the rest of the page uses.
- **"Back to the schedule" said nothing about what it does, and most of the time it did
  nothing at all.** It only ever cancelled a hand-opening, so with no override running it
  was a button that answered a press with silence. It is now hidden until there *is*
  something to cancel, and then labelled with what it ends: *"Cancel — close again instead
  of at 12:14"*.
- The paragraph above the buttons now says what *Open now* is for in the first place: it
  brings the tunnel up outside the window for half an hour, for when you need in today and
  the window is on Sunday.

**Deutsch**
- **Die beiden Button-Reihen im Uplink-Panel klebten aneinander.** *Open now* und *Save
  mode* standen ohne Luft direkt untereinander und lasen sich wie ein Bedienelement. Beide
  Reihen haben jetzt denselben Abstand wie der Rest der Seite.
- **„Back to the schedule" sagte nicht, was es tut — und meistens tat es gar nichts.** Der
  Knopf hat immer nur ein von Hand geöffnetes Fenster abgebrochen; ohne laufende
  Übersteuerung war er ein Button, der auf einen Druck mit Schweigen antwortet. Er ist
  jetzt versteckt, solange es nichts abzubrechen gibt, und trägt dann die Beschriftung
  dessen, was er beendet: *„Cancel — close again instead of at 12:14"*.
- Der Absatz über den Buttons sagt jetzt auch, wofür *Open now* überhaupt da ist: er holt
  den Tunnel außerhalb des Fensters für eine halbe Stunde hoch — für den Fall, dass du
  heute rein musst und das Fenster am Sonntag ist.

## v0.12.7
**English**
- **WireGuard can now be set up by hand, not only from a file.** Uploading the `.conf`
  is perfect when there is one — a FritzBox hands you a file. It is useless when there is
  not: a peer somebody set up for you, a provider that shows the values on a web page, a
  key you generated on the Pi. Then you had seven pieces of information and nowhere to
  type them. Setup › Remote access › WireGuard now offers both, on a radio button.
- **One stored representation either way.** The fields are turned into the `.conf` and
  that stays the source of truth — `wg-quick` reads a file regardless, and keeping a
  second parallel copy in the config would be a drift bug waiting for the day the two
  disagree. The form is filled by parsing the stored file back, which has the pleasant
  side effect that **a `.conf` you uploaded can afterwards be edited field by field**.
- **What the form cannot hold, it says so about** rather than dropping quietly: a second
  `[Peer]`, or directives like `MTU` and `PostUp`. The panel names them and tells you to
  stay on the file if you need them.
- **The two secrets never come back out of the box.** `/api/remote` answers without the
  API secret so the page always loads, and this box's onboarding hotspot is open by
  default — returning the private key there would hand anyone in Wi-Fi range the VPN.
  The form shows them as stored and leaves the boxes blank; blank means keep.
- **Every refusal names the fix**, because this is read on a phone: a missing private key
  says `wg genkey`, a bad endpoint says what host:port looks like, a stray preshared key
  says `wg genpsk`. A bare address like `10.0.0.2` is accepted and written as `/32`, since
  that is what people are told to type.
- **Keepalive defaults to 25 on purpose.** Behind carrier NAT a tunnel without it works
  until the first idle minute and then quietly stops carrying anything inbound.
- Identical in **YonderRC** (v1.46.2): same module, same endpoint, same panel — the two
  repositories differ only in the word they use for the box.
- 626 tests (33 new): key and endpoint shapes, the round trip through a conf and back, a
  foreign file with lower-case keys and comments, and the redaction.

**Deutsch**
- **WireGuard lässt sich jetzt auch von Hand einrichten, nicht nur per Datei.** Die
  `.conf` hochzuladen ist perfekt, wenn es eine gibt — eine FritzBox liefert eine Datei.
  Es hilft nichts, wenn es keine gibt: ein Peer, den jemand für dich eingerichtet hat, ein
  Anbieter, der die Werte auf einer Webseite anzeigt, ein Schlüssel, den du auf dem Pi
  erzeugt hast. Dann hatte man sieben Angaben und kein Feld dafür. Setup › Remote access ›
  WireGuard bietet jetzt beides, per Radiobutton.
- **Gespeichert wird in beiden Fällen dasselbe.** Aus den Feldern wird die `.conf`, und die
  bleibt die maßgebliche Fassung — `wg-quick` liest ohnehin eine Datei, und eine zweite
  parallele Kopie in der Konfiguration wäre ein Drift-Bug, der auf den Tag wartet, an dem
  beide sich widersprechen. Das Formular wird durch Zurücklesen der Datei gefüllt, mit dem
  angenehmen Nebeneffekt: **eine hochgeladene `.conf` lässt sich danach feldweise
  bearbeiten**.
- **Was das Formular nicht abbilden kann, sagt es** statt es still zu verlieren: ein
  zweiter `[Peer]` oder Direktiven wie `MTU` und `PostUp`. Das Panel benennt sie und rät,
  bei der Datei zu bleiben, wenn man sie braucht.
- **Die beiden Geheimnisse verlassen die Box nie.** `/api/remote` antwortet ohne
  API-Secret, damit die Seite immer lädt, und der Onboarding-Hotspot dieser Box ist
  standardmäßig offen — den privaten Schlüssel dort zurückzugeben hieße, jedem in
  WLAN-Reichweite das VPN zu schenken. Das Formular zeigt sie als gespeichert an und lässt
  die Felder leer; leer heißt behalten.
- **Jede Ablehnung nennt die Abhilfe**, weil das auf einem Handy gelesen wird: ein
  fehlender privater Schlüssel verweist auf `wg genkey`, ein falscher Endpoint zeigt die
  Form host:port, ein verirrter Preshared Key auf `wg genpsk`. Eine nackte Adresse wie
  `10.0.0.2` wird angenommen und als `/32` geschrieben — genau das tippen die Leute.
- **Keepalive steht absichtlich auf 25.** Hinter Carrier-NAT funktioniert ein Tunnel ohne
  das bis zur ersten Leerlaufminute und trägt danach still nichts mehr herein.
- In **YonderRC** identisch gelöst (v1.46.2): dasselbe Modul, derselbe Endpunkt, dasselbe
  Panel — die beiden Repositories unterscheiden sich nur im Wort für die Box.
- 626 Tests (33 neue): Schlüssel- und Endpoint-Formen, der Rundlauf durch eine conf und
  zurück, eine fremde Datei mit klein geschriebenen Schlüsseln und Kommentaren, und die
  Schwärzung.

## v0.12.6
**English**
- **Two modes for the tunnel, on a radio button** (Setup › Remote access). **Always live**
  is what the box has always done. **Only in a window** keeps it down and holds the alerts,
  then opens everything at once: default **Sundays 14:00–14:15**, with day, start, length
  and the post-restart grace all settable.
- **The alerts are held on disk, not in RAM.** A window can be a week away and the box may
  well reboot in between — an alert that only ever lived in memory would be exactly the one
  you never hear about. They go to `/var/lib/yondergate/alert-buffer.json`, survive a
  restart, and a flush that fails keeps them for the next attempt rather than dropping the
  only message of the week.
- **They arrive as one message, not forty.** A sensor that flapped for six days would
  otherwise empty itself into your phone the second the window opens. Grouped by what went
  wrong, with the count and the span: *"Voltage low — 12× between Mon 03:14 and Sat 21:00"*.
  One urgent thing makes the whole digest urgent.
- **It cannot be the reason nobody can reach the box.** That is the failure this feature
  could obviously cause, so there are four ways out: the tunnel stays up for ten minutes
  after **every restart** (you rebooted it — that is exactly when you want in), it is never
  taken down while somebody has the page open, *Open now for 30 min* overrides the schedule,
  and a failed bring-up is retried on the next tick instead of being swallowed.
- **A captive-portal probe does not count as "somebody is here".** Every request to this
  port used to; a phone on the hotspot checking for internet would then have held the tunnel
  open around the clock and quietly undone the whole mode — the worst way for it to fail,
  because the box looks configured and only the bill disagrees. Presence is now the setup
  page's own polling, which already stops when the tab is hidden.
- **It works for whichever VPN you picked** — the window drives `remoteUp`/`remoteDown`, not
  Tailscale directly, so ZeroTier and WireGuard get the same behaviour. The watchdog also
  learned to skip its `tailscale up` rung while the window is shut, instead of fighting the
  mode every time a probe fails.
- 593 tests (46 new): the schedule including a window that runs past midnight, every refusal
  to strand the operator, the buffer surviving a simulated reboot, the digest grouping, and
  the service actually calling down/up/flush in that order.

**Deutsch**
- **Zwei Modi für den Tunnel, per Radiobutton** (Setup › Remote access). **Always live** ist
  das, was die Box immer getan hat. **Only in a window** lässt ihn unten und hält die
  Alarme, dann geht alles auf einmal raus: Standard **sonntags 14:00–14:15**, Tag, Beginn,
  Länge und die Nachlaufzeit nach einem Neustart sind einstellbar.
- **Die Alarme liegen auf Platte, nicht im RAM.** Ein Fenster kann eine Woche entfernt sein,
  und die Box startet in der Zwischenzeit womöglich neu — ein Alarm, der nur im Speicher
  lebte, wäre genau der, von dem man nie erfährt. Sie liegen in
  `/var/lib/yondergate/alert-buffer.json`, überstehen einen Neustart, und ein
  fehlgeschlagenes Zustellen behält sie für den nächsten Versuch, statt die einzige
  Nachricht der Woche wegzuwerfen.
- **Sie kommen als eine Nachricht an, nicht als vierzig.** Ein Sensor, der sechs Tage
  geflattert hat, würde sich sonst in der Sekunde des Fensters ins Handy entleeren.
  Gruppiert nach dem, was kaputt war, mit Anzahl und Zeitraum: *„Voltage low — 12× zwischen
  Mo 03:14 und Sa 21:00"*. Eine dringende Sache macht die ganze Zusammenfassung dringend.
- **Es darf nicht der Grund sein, dass niemand mehr an die Box kommt.** Das ist der Fehler,
  den dieses Feature offensichtlich verursachen kann, also gibt es vier Auswege: der Tunnel
  bleibt nach **jedem Neustart** zehn Minuten oben (du hast neu gestartet — genau dann willst
  du rein), er wird nie abgebaut, während jemand die Seite offen hat, *Open now for 30 min*
  übersteuert den Zeitplan, und ein fehlgeschlagenes Hochfahren wird beim nächsten Takt
  erneut versucht statt verschluckt.
- **Ein Captive-Portal-Probe zählt nicht als „jemand ist da".** Bisher tat das jeder Request
  auf diesen Port; ein Handy im Hotspot, das nach Internet sucht, hätte den Tunnel rund um
  die Uhr offen gehalten und den Modus still ausgehebelt — die schlimmste Art zu scheitern,
  weil die Box konfiguriert aussieht und nur die Rechnung widerspricht. Anwesenheit ist
  jetzt das Polling der Setup-Seite selbst, das ohnehin stoppt, wenn der Tab verdeckt ist.
- **Es funktioniert mit dem VPN, das du gewählt hast** — das Fenster steuert
  `remoteUp`/`remoteDown` statt Tailscale direkt, ZeroTier und WireGuard verhalten sich also
  gleich. Der Watchdog überspringt außerdem seine `tailscale up`-Sprosse, solange das Fenster
  zu ist, statt den Modus bei jeder fehlgeschlagenen Probe zu bekämpfen.
- 593 Tests (46 neue): der Zeitplan inklusive eines Fensters über Mitternacht, jede
  Weigerung, den Betreiber auszusperren, der Puffer über einen simulierten Neustart hinweg,
  die Gruppierung der Zusammenfassung, und dass der Dienst tatsächlich down/up/flush in
  dieser Reihenfolge aufruft.

## v0.12.5
**English**
- **A data budget, because the SIM is the other thing this box runs on.** The requirement
  is modest — a message when something is wrong, plus the odd look at a camera or the
  battery — and it deserves an honest answer:
  [docs/DATA-BUDGET.md](docs/DATA-BUDGET.md) measures where the bytes go and works through
  which kind of tariff survives a box that is deliberately silent.
- **It starts with the part that cannot be tuned away**: "reachable instantly" and "uses
  no data while idle" are in tension, because a permanent tunnel is a permanent
  conversation. Three shapes are laid out — Tailscale always up (what ships), **alerts
  only with an SMS wake** (near-zero standby; SMS costs no data at all), and scheduled
  windows as the fallback that keeps the SMS path from being able to strand you.
- **Two measured wins, both shipped here.** The setup page went from **121.9 kB to
  33.1 kB** on the wire (gzip) and an unchanged page now answers **304 with no body** at
  all. Bodies under 512 bytes are left alone, where gzip is only noise, and the validator
  is over the content — a `git pull` that restores an identical page must not cost 120 kB.
- **The page stops polling when nobody is looking at it.** It polls system every 3 s,
  sensors every 5 s, health every 30 s: about **2 MB an hour**, so a tab forgotten
  overnight was ~17 MB — on an IoT SIM sold with 500 MB for its whole life, a real bite.
  Hiding the tab stops every poll; coming back refreshes at once, so nothing is quietly
  stale.
- **The watchdog now says what it costs**, next to the field where you set it: two pings
  every five minutes is ~3 MB a month, more than the alerting this box exists for, and the
  line suggests 15–30 min when the number gets big. A decision instead of a surprise.
- **`apt` is named as the item nobody budgets for** — daily package lists on a metered link
  can dwarf everything the gateway does. It is a real trade-off against security updates,
  so the installer still leaves it alone and the doc gives you the two commands.
- **The sensors are generic again.** Voltage, current and temperature are readings, not a
  solar feature: an off-grid battery is one thing to point them at, but the page must read
  just as well on a bench supply. CLAUDE.md and docs/CONCEPT.md say so now, so the next
  pass at that page does not build a solar dashboard.

**Deutsch**
- **Ein Datenbudget, weil die SIM das andere ist, wovon diese Box lebt.** Die Anforderung
  ist bescheiden — eine Nachricht, wenn etwas nicht stimmt, plus der gelegentliche Blick
  auf Kamera oder Batterie — und verdient eine ehrliche Antwort:
  [docs/DATA-BUDGET.de.md](docs/DATA-BUDGET.de.md) misst, wohin die Bytes gehen, und geht
  durch, welche Art Tarif eine bewusst stille Box überlebt.
- **Es beginnt mit dem, was sich nicht wegtunen lässt**: „sofort erreichbar" und
  „verbraucht im Leerlauf nichts" stehen im Widerspruch, denn ein dauerhafter Tunnel ist
  ein dauerhaftes Gespräch. Drei Bauformen stehen drin — Tailscale immer oben (das, was
  ausgeliefert wird), **nur Alarme mit SMS-Weckruf** (Beinahe-Null im Standby; SMS kostet
  überhaupt kein Volumen) und feste Zeitfenster als Fallback, damit der SMS-Pfad einen
  nicht aussperren kann.
- **Zwei gemessene Gewinne, beide hier drin.** Die Setup-Seite ging von **121,9 kB auf
  33,1 kB** über die Leitung (gzip), und eine unveränderte Seite antwortet jetzt mit
  **304 ganz ohne Body**. Bodies unter 512 Byte bleiben unangetastet, dort ist gzip nur
  Rauschen, und der Validator hängt am Inhalt — ein `git pull`, der eine identische Seite
  wiederherstellt, darf keine 120 kB kosten.
- **Die Seite pollt nicht mehr, wenn niemand hinsieht.** System alle 3 s, Sensoren alle
  5 s, Health alle 30 s: etwa **2 MB pro Stunde**, ein über Nacht vergessener Tab also
  ~17 MB — auf einer IoT-SIM mit 500 MB für ihr ganzes Leben ein echter Biss. Tab in den
  Hintergrund stoppt jeden Poll; zurück im Vordergrund wird sofort aktualisiert.
- **Der Watchdog sagt jetzt, was er kostet**, direkt neben dem Feld: zwei Pings alle fünf
  Minuten sind ~3 MB im Monat, mehr als die Alarme, für die es diese Box gibt — und die
  Zeile empfiehlt 15–30 min, wenn die Zahl groß wird. Eine Entscheidung statt einer
  Überraschung.
- **`apt` wird als der Posten benannt, den niemand einplant** — tägliche Paketlisten auf
  einer getakteten Leitung können alles überdecken, was das Gateway tut. Das ist eine echte
  Abwägung gegen Sicherheitsupdates, also lässt der Installer es weiter in Ruhe und die
  Doku gibt die zwei Befehle.
- **Die Sensoren sind wieder allgemein.** Spannung, Strom und Temperatur sind Messwerte,
  kein Solar-Feature: eine Inselbatterie ist eines von mehreren Dingen, auf die man sie
  richtet, aber die Seite muss an einem Labornetzteil genauso gut lesbar sein. CLAUDE.md
  und docs/CONCEPT.md sagen das jetzt, damit der nächste Durchgang kein Solar-Dashboard
  baut.

## v0.12.4
**English**
- **The installer now gives a small board swap before the step that needs it.** A Zero 2 W
  runs the service comfortably — it measures ~54 MB — but `npm install` during an *update*
  is a different load, and a gateway that runs out of memory mid-update is one somebody has
  to drive to. On any board under 1.5 GB, `install.sh` enables **zram**: zstd, 60 % of RAM,
  priority 100.
- **In RAM, deliberately, not a swapfile on the card.** This box lives on solar; the power
  can vanish mid-write, and the SD card is the thing that dies. Pi OS's own dphys-swapfile
  is left as it is — zram simply registers at a higher priority, so the kernel reaches for
  RAM before it reaches for the card.
- **It knows when to stay out of the way**: a Pi 4 or 5 is skipped with a line saying so,
  an existing zram setup is left alone, an unreadable `/proc/meminfo` skips rather than
  aborting provisioning, and a failed `apt-get` prints the cause and the fix instead of
  killing the install — the update path is the last thing that may become fragile.
- **Re-running the installer does not stack config**: the settings go into
  `/etc/default/zramswap` between markers that the next run replaces.
- Tests hold the two properties that actually matter (518 now): zram is set up **before**
  the `npm install` it protects, and it is gated on a memory check rather than forced onto
  every board. Docs updated — `docs/HARDWARE.md` and its German sibling described this as a
  manual step and a gap; it is neither any more.

**Deutsch**
- **Der Installer gibt einem kleinen Board jetzt Swap, bevor der Schritt kommt, der ihn
  braucht.** Ein Zero 2 W fährt den Dienst locker — er misst ~54 MB — aber `npm install`
  bei einem *Update* ist eine andere Last, und ein Gateway, dem mitten im Update der
  Speicher ausgeht, ist eines, zu dem jemand hinfahren muss. Auf jedem Board unter 1,5 GB
  richtet `install.sh` **zram** ein: zstd, 60 % des RAM, Priorität 100.
- **Bewusst im RAM, keine Swapdatei auf der Karte.** Diese Box hängt an Solar; der Strom
  kann mitten im Schreibvorgang weg sein, und die SD-Karte ist das, was dabei stirbt. Die
  dphys-swapfile von Pi OS bleibt, wie sie ist — zram meldet sich nur mit höherer
  Priorität an, der Kernel greift also erst ins RAM und dann auf die Karte.
- **Er weiß, wann er sich raushalten muss**: ein Pi 4 oder 5 wird mit einer Zeile
  übersprungen, ein vorhandenes zram-Setup bleibt unangetastet, ein unlesbares
  `/proc/meminfo` führt zum Überspringen statt zum Abbruch der Provisionierung, und ein
  fehlgeschlagenes `apt-get` nennt Ursache und Abhilfe, statt die Installation zu killen —
  ausgerechnet der Update-Pfad darf nicht fragil werden.
- **Ein erneuter Lauf stapelt keine Konfiguration**: die Einstellungen stehen in
  `/etc/default/zramswap` zwischen Markern, die der nächste Lauf ersetzt.
- Tests sichern die zwei Eigenschaften, auf die es ankommt (jetzt 518): zram wird **vor**
  dem `npm install` eingerichtet, das es schützt, und es hängt an einer Speicherprüfung
  statt jedem Board übergestülpt zu werden. Doku nachgezogen — `docs/HARDWARE.md` und die
  deutsche Fassung beschrieben das als Handarbeit und als Lücke; beides stimmt nicht mehr.

## v0.12.3
**English**
- **A hardware guide, because the first question about an off-grid box is "what do I buy
  and what does it cost me in watts?"** [docs/HARDWARE.md](docs/HARDWARE.md) answers both:
  a **Pi Zero 2 W** (the original Zero W is ARMv6 — no 64-bit OS, no Node, it will never
  run this), a HiLink stick with a real external antenna, **IP cameras rather than USB**,
  and an INA228 in the battery line.
- **The power budget it is designed against: ~2.5–4 W, i.e. 60–95 Wh/day.** With the part
  most people get wrong spelled out — the board is the *third* biggest lever. One
  always-on IP camera can cost more than the entire gateway, and a stick with a poor
  antenna transmits harder and burns watts doing it.
- **What the Zero 2 W actually costs you**, all four of them checked against this
  repository: 512 MB where the risky moment is `npm install` and not runtime (the service
  measures ~54 MB RSS), one 2.4 GHz radio that cannot do AP and uplink at once, one
  micro-USB data socket, no Ethernet.
- **Why an RTSP camera is free and a USB one is not** — the RTSP path is `-c copy`
  (`cameraManager.ts:107`), a USB camera is transcoded (`cameraManager.ts:112`). That is
  also why the Pi 5, with no H.264 encoder, is the wrong board here.
- **Brownout and the SD card**, the way off-grid Pis actually die: a 5 V buck with
  head-room, the LTE stick's spikes kept off the Pi's rail, the charge controller's
  low-voltage disconnect doing the cutting, and the `vcgencmd get_throttled` bit 16 the
  gateway already reads (`health.ts:82`) — under-voltage *since boot* is the one that
  catches a supply that sagged at 3 a.m. Whether a card survives a season of it is not
  something this repo can claim, and the guide says so.
- German sibling `docs/HARDWARE.de.md`, and the installer note now points at both. The
  guide also names a gap it does not fix: `install.sh` sets up no zram or swap, which a
  512 MB board wants before its first update.

**Deutsch**
- **Ein Hardware-Leitfaden, weil die erste Frage zu einer Inselbox lautet: „Was kaufe ich,
  und was kostet es an Watt?"** [docs/HARDWARE.de.md](docs/HARDWARE.de.md) beantwortet
  beides: ein **Pi Zero 2 W** (der ursprüngliche Zero W ist ARMv6 — kein 64-Bit-OS, kein
  Node, das läuft dort nie), ein HiLink-Stick mit echter externer Antenne, **IP- statt
  USB-Kameras** und ein INA228 in der Batterieleitung.
- **Das Budget, gegen das ausgelegt wird: ~2,5–4 W, also 60–95 Wh/Tag.** Inklusive dem,
  was die meisten falsch gewichten — das Board ist der *drittgrößte* Hebel. Eine
  dauerhaft laufende IP-Kamera kann mehr kosten als das ganze Gateway, und ein Stick mit
  schlechter Antenne sendet härter und verbrennt dabei Watt.
- **Was der Zero 2 W tatsächlich kostet**, alle vier Punkte gegen dieses Repository
  geprüft: 512 MB, wobei der kritische Moment `npm install` ist und nicht der Betrieb (der
  Dienst misst ~54 MB RSS), ein 2,4-GHz-Funkchip, der AP und Uplink nicht gleichzeitig
  kann, eine Micro-USB-Datenbuchse, kein Ethernet.
- **Warum eine RTSP-Kamera nichts kostet und eine USB-Kamera schon** — der RTSP-Pfad ist
  `-c copy` (`cameraManager.ts:107`), eine USB-Kamera wird transkodiert
  (`cameraManager.ts:112`). Genau deshalb ist der Pi 5 ohne H.264-Encoder hier das falsche
  Board.
- **Brownout und die SD-Karte**, so wie Insel-Pis wirklich sterben: ein 5-V-Buck mit
  Reserve, die Spitzen des LTE-Sticks weg von der Pi-Schiene, die Tiefentladeabschaltung
  des Ladereglers als das, was abschaltet, und Bit 16 aus `vcgencmd get_throttled`, das
  das Gateway ohnehin liest (`health.ts:82`) — Unterspannung *seit dem Boot* ist die, die
  eine um 3 Uhr eingebrochene Versorgung überhaupt sichtbar macht. Ob eine Karte eine
  Saison davon übersteht, kann dieses Repo nicht behaupten, und der Leitfaden sagt das.
- Deutsche Fassung als `docs/HARDWARE.de.md`, der Installer-Hinweis verweist auf beide.
  Der Leitfaden benennt auch eine Lücke, die er nicht schließt: `install.sh` richtet weder
  zram noch Swap ein — was ein 512-MB-Board vor seinem ersten Update haben will.

## v0.12.2
**English**
- **You can now enter the secret, not just set one.** After generating one there was
  nowhere obvious to type it again — the page only asked via a browser `prompt()`, in the
  middle of whatever you had just pressed. Setup › Security now has an **Unlock this tab**
  field that appears exactly when it is useful: a secret is set and this tab does not know
  it. A refused save points at that field instead of popping a dialog.
- The field is checked against the gateway (`POST /api/auth/check`, behind the same gate
  as every other write, so a wrong secret is refused by the real rule rather than by a
  second copy of it) — you find out immediately, not at the next save.
- The status line says which of the two states you are in: *no secret*, *set · this tab is
  unlocked*, or *set · this tab cannot change anything yet*.
- Worth being clear about what it is for here, since this project has no ground app: it is
  **not** needed to connect. Reading — the whole page, the sensors, the history — is always
  open. The secret gates **changes**, and the device proxy.

**Deutsch**
- **Man kann das Secret jetzt auch eingeben, nicht nur setzen.** Nach dem Erzeugen gab es
  keinen offensichtlichen Ort, es erneut einzutippen — die Seite fragte nur per Browser-
  `prompt()`, mitten in der Aktion, die man gerade angestoßen hatte. Setup › Security hat
  jetzt ein Feld **Unlock this tab**, das genau dann erscheint, wenn es nützlich ist: Ein
  Secret ist gesetzt und dieser Tab kennt es nicht. Eine abgewiesene Änderung zeigt auf
  dieses Feld, statt einen Dialog aufzumachen.
- Das Feld wird gegen das Gateway geprüft (`POST /api/auth/check`, hinter demselben Gate
  wie jeder andere Schreibzugriff — ein falsches Secret wird also von der echten Regel
  abgewiesen, nicht von einer zweiten Kopie davon). Man erfährt es sofort, nicht erst beim
  nächsten Speichern.
- Die Statuszeile sagt, in welchem der Zustände man ist: *kein Secret*, *gesetzt · dieser
  Tab ist entsperrt* oder *gesetzt · dieser Tab kann noch nichts ändern*.
- Und zur Klarheit, weil dieses Projekt keine Boden-App hat: Zum **Verbinden** braucht man
  es nicht. Lesen — die ganze Seite, Sensoren, Verlauf — ist immer offen. Das Secret
  schützt **Änderungen** und den Geräte-Proxy.

## v0.12.1
**English**
- **The API secret was in the setup page but nobody could find it.** It sits ten panels
  down, and nothing anywhere else mentioned whether the box had one. The **System status**
  block at the top now says so in one line — "API secret set", or a warning that links
  straight to the panel — because a lock nobody can see is a lock nobody sets, and this
  box sits unattended at a site for a year with relays behind it.
- The Security panel explains what it is actually for now (an open hotspot, a marina or
  campsite WiFi, a shared LAN — not a Tailscale-only box) and, just as importantly, what
  protects you *without* it: a page from the internet is refused whatever you do. Its old
  text still described the RC project's ground app, which does not exist here.

**Deutsch**
- **Das API-Secret war zwar in der Setup-Seite, aber niemand hat es gefunden.** Es sitzt
  zehn Blöcke weiter unten, und nirgends sonst stand, ob die Kiste überhaupt eins hat. Der
  Block **System status** ganz oben sagt es jetzt in einer Zeile — „API secret set" oder
  eine Warnung, die direkt zum Panel springt. Ein Schloss, das man nicht sieht, ist ein
  Schloss, das niemand zumacht — und dieses Gerät steht ein Jahr unbeaufsichtigt an einem
  Standort, mit Relais dahinter.
- Das Security-Panel erklärt jetzt, wofür es wirklich gedacht ist (offener Hotspot,
  Marina- oder Campingplatz-WLAN, geteiltes LAN — nicht für eine reine Tailscale-Kiste)
  und, genauso wichtig, was auch **ohne** Secret schützt: Eine Seite aus dem Internet wird
  in jedem Fall abgewiesen. Der alte Text beschrieb noch die Boden-App des RC-Projekts,
  die es hier gar nicht gibt.

## v0.12.0
The security fix from YonderRC's review, which applies here with sharper teeth: this box
switches relays.

**English**
- **A page from the internet can no longer act on the gateway.** The API secret is off by
  default, so any site the operator happened to open — on a phone joined to the gateway's
  own hotspot, which is open by default — could POST to the setup API (reboot, WiFi,
  factory reset) or push a request through the **device proxy** to whatever the devices
  behind it accept. A relay is switched by a plain URL, which is the sharp end: the page
  never needs to read the answer, making the browser fetch it *is* the attack, and an
  `<img>` tag does that without sending an `Origin` header at all.
- So the gateway judges a request by **what caused it**: `Sec-Fetch-Site: cross-site` —
  sent by current browsers on every request, including `<img>`, `<script>` and forms — is
  refused outright. Otherwise the `Origin` decides: none at all (curl, scripts, the
  tests), `file://`, a private, loopback, `.local` or Tailscale address, or the gateway's
  own address are accepted; the public internet is refused with **HTTP 403** unless it
  presents the API secret. Reads are untouched, so the setup page always opens.
- This also defeats DNS rebinding: the attacking page keeps its own origin even once its
  name resolves to 192.168.4.1.

**Deutsch**
- **Eine Seite aus dem Internet kann nicht mehr auf das Gateway wirken.** Das API-Secret
  ist standardmäßig aus — jede Seite, die der Bediener zufällig öffnet, während sein
  Handy am Hotspot des Gateways hängt (der standardmäßig offen ist), konnte an die
  Setup-API POSTen (Neustart, WLAN, Werksreset) oder über den **Geräte-Proxy** eine
  Anfrage an das durchreichen, was die Geräte dahinter akzeptieren. Ein Relais wird per
  simpler URL geschaltet — genau das ist die scharfe Kante: Die Seite muss die Antwort
  nie lesen, den Browser zum Abrufen zu bringen **ist** der Angriff, und ein `<img>`-Tag
  macht das ganz ohne `Origin`-Header.
- Das Gateway beurteilt eine Anfrage deshalb danach, **wodurch sie ausgelöst wurde**:
  `Sec-Fetch-Site: cross-site` — von aktuellen Browsern bei jeder Anfrage mitgeschickt,
  auch bei `<img>`, `<script>` und Formularen — wird direkt abgewiesen. Sonst entscheidet
  der `Origin`: gar keiner (curl, Skripte, die Tests), `file://`, eine private,
  Loopback-, `.local`- oder Tailscale-Adresse oder die eigene Adresse des Gateways werden
  angenommen; das öffentliche Internet wird mit **HTTP 403** abgewiesen, sofern kein
  API-Secret vorliegt. Lesende Zugriffe bleiben offen, die Setup-Seite geht also immer auf.
- Das entschärft auch DNS-Rebinding: Die angreifende Seite behält ihren eigenen Origin,
  auch wenn ihr Name plötzlich auf 192.168.4.1 zeigt.

## v0.11.0
A full review pass over the code and the concept, prompted by one question: *do devices
on the hotspot actually get internet when the LTE stick has it?* They do — the hotspot
is a NATed shared connection — but checking that turned up the reason they often would
not, and four more things worth fixing.

**English**
- **Fixed: the captive portal was decided once and never revisited.** In AP mode the Pi
  resolves every name to itself so a joining phone lands on the setup page. That choice
  was made when the hotspot started — which at a fresh site is the worst moment: the box
  boots with no LTE, the portal goes up, the stick registers a minute later, and from
  then on every device on the hotspot is NATed to a working uplink while DNS still points
  at the setup page. Internet that looks broken, until somebody drives out and restarts
  the hotspot. It is now re-decided every minute against the uplink of the moment.
- **Fixed: the ntfy topic was readable by anyone on the LAN or the open hotspot.** The
  status endpoint needs no secret, and it returned the topic URL in full. ntfy has no
  accounts on the public server, so the topic *is* the credential — the setup page even
  says to pick something unguessable. It is now shortened to `https://ntfy.sh/yg…4f2`,
  like the token, and typing over the shortened value is what changes it.
- **Fixed: the data counter wrote to the SD card every minute.** Recording sensor history
  is opt-in precisely to spare the card, and then the usage counter rewrote a file
  525 600 times a year anyway. It now reaches the card every quarter hour and on a clean
  shutdown; the total in memory stays exact.
- **Fixed: a sensor plugged in mid-month was silently not recorded.** A CSV has one
  header, so a channel with no column had nowhere to go and was dropped until the month
  rolled over — exactly when somebody is watching the page to see whether the sensor they
  just wired up works. The month now continues in a part file, and both are read back as
  one series.
- **A device scan can no longer hang on reverse DNS.** With no reachable DNS server each
  lookup sat out the resolver's full retry budget; 128 addresses of that turned a
  ten-second scan into a minute of apparently-frozen page. A name is now worth 1.5
  seconds, not more.
- **The update check is cached for ten minutes** (the Check button still forces a fresh
  one). It runs `git fetch`, it needs no secret, and on a metered SIM a browser left open
  on the page should not spend the allowance.
- Documented what the hotspot does with an uplink, and that traffic from hotspot clients
  comes out of the SIM like any other.

**Deutsch**
- **Behoben: das Captive-Portal wurde einmal entschieden und nie überprüft.** Im AP-Modus
  löst der Pi jeden Namen auf sich selbst auf, damit ein Handy beim Verbinden auf der
  Setup-Seite landet. Diese Entscheidung fiel beim Start des Hotspots — am neuen Standort
  der denkbar schlechteste Moment: Die Kiste bootet ohne LTE, das Portal geht hoch, der
  Stick bucht sich eine Minute später ein, und ab da hängt jedes Gerät am Hotspot per NAT
  an einem funktionierenden Uplink, während DNS weiter auf die Setup-Seite zeigt.
  Internet, das kaputt aussieht — bis jemand hinfährt und den Hotspot neu startet. Wird
  jetzt jede Minute neu entschieden.
- **Behoben: das ntfy-Topic war für jeden im LAN oder am offenen Hotspot lesbar.** Der
  Status-Endpunkt braucht kein Secret und lieferte die Topic-URL vollständig aus. Auf dem
  öffentlichen ntfy-Server gibt es keine Konten, das Topic **ist** also das Passwort — die
  Setup-Seite rät sogar dazu, etwas Unerratbares zu wählen. Es wird jetzt gekürzt
  angezeigt (`https://ntfy.sh/yg…4f2`), wie der Token; überschreiben ändert es.
- **Behoben: der Datenzähler schrieb jede Minute auf die SD-Karte.** Die Sensor-Aufzeichnung
  ist genau deshalb optional, um die Karte zu schonen — und dann hat der Verbrauchszähler
  trotzdem 525 600-mal im Jahr eine Datei neu geschrieben. Jetzt alle 15 Minuten und beim
  sauberen Herunterfahren; die Summe im Speicher bleibt exakt.
- **Behoben: ein mitten im Monat angesteckter Sensor wurde still nicht aufgezeichnet.** Eine
  CSV hat eine Kopfzeile; ein Kanal ohne Spalte hatte keinen Platz und fiel bis zum
  Monatswechsel weg — also genau dann, wenn jemand auf die Seite schaut, ob der eben
  verdrahtete Sensor funktioniert. Der Monat läuft jetzt in einer Teildatei weiter, gelesen
  wird beides als eine Reihe.
- **Ein Gerätescan kann nicht mehr am Reverse-DNS hängen.** Ohne erreichbaren DNS-Server
  wartete jede Abfrage die volle Wiederholungszeit ab; bei 128 Adressen wurde aus einem
  Zehn-Sekunden-Scan eine Minute scheinbar eingefrorener Seite. Ein Name ist jetzt 1,5
  Sekunden wert, nicht mehr.
- **Die Update-Prüfung wird zehn Minuten zwischengespeichert** (der Button erzwingt weiter
  eine frische). Sie macht ein `git fetch`, braucht kein Secret, und auf einer getakteten
  SIM soll ein offen gelassener Browser-Tab nicht das Volumen verbrauchen.
- Dokumentiert, was der Hotspot mit einem Uplink macht — und dass der Verkehr der
  Hotspot-Geräte genauso aus der SIM kommt wie jeder andere.

## v0.10.0
**English**
- **Fixed: the watchdog could have rebooted the box forever.** The failure counter lived
  in memory, so a reboot reset it — medium gone (a dead SIM, an unplugged stick, a router
  that is off) → eight failed probes → reboot → counter back to zero → forty minutes
  later, reboot again, and again, indefinitely. Nothing gets fixed, the card wears out,
  and anyone standing at the site watches the box die under them every forty minutes.
  Caught by the owner asking whether that could happen, before it ever ran on hardware.
- **The reboot budget is now written to disk** — the one piece of state a reboot must not
  clear. **At most two reboots a day, six hours apart.** The cheaper steps keep running:
  Tailscale and the network stack are still restarted on every escalation. Only the big
  hammer is rationed, and when the budget is spent the box says the useful thing —
  *"already rebooted 2× today and it did not help — the medium is probably gone, and
  another reboot will not conjure it back"*.
- **A reboot is skipped while somebody has the page open.** The uplink being down does
  not break local access: the hotspot, the LAN and the page all still work. Rebooting
  then would kick out the person who is standing there trying to fix it — including the
  weekly maintenance reboot.
- The panel now shows the limits rather than just the switch: failed probes, reboots
  today, and what the budget currently allows.

**Deutsch**
- **Behoben: der Watchdog hätte die Kiste endlos neu starten können.** Der Fehlerzähler
  lag im Arbeitsspeicher, ein Neustart setzte ihn also zurück — Medium weg (totes SIM,
  abgezogener Stick, ausgeschalteter Router) → acht fehlgeschlagene Prüfungen → Neustart
  → Zähler bei null → vierzig Minuten später wieder, und wieder, ohne Ende. Nichts wird
  repariert, die Karte verschleißt, und wer am Standort steht, sieht die Kiste alle
  vierzig Minuten unter sich wegsterben. Vom Besitzer erfragt, bevor das je auf Hardware
  lief.
- **Das Neustart-Budget steht jetzt auf der Platte** — der eine Zustand, den ein Neustart
  nicht löschen darf. **Höchstens zwei Neustarts pro Tag, sechs Stunden auseinander.** Die
  billigeren Stufen laufen weiter: Tailscale und Netzwerk-Stack werden bei jeder
  Eskalation weiterhin neu gestartet. Rationiert ist nur der große Hammer, und ist das
  Budget aufgebraucht, sagt die Kiste das Nützliche — *„heute schon 2× neu gestartet, es
  hat nicht geholfen — das Medium ist vermutlich weg, und ein weiterer Neustart zaubert
  es nicht herbei"*.
- **Kein Neustart, solange jemand die Seite offen hat.** Ein fehlender Uplink macht den
  lokalen Zugang nicht kaputt: Hotspot, LAN und diese Seite funktionieren weiter. Ein
  Neustart würde genau die Person hinauswerfen, die davorsteht und es reparieren will —
  das gilt auch für den wöchentlichen Wartungsneustart.
- Das Panel zeigt jetzt die Grenzen statt nur den Schalter: fehlgeschlagene Prüfungen,
  Neustarts heute und was das Budget gerade erlaubt.

## v0.9.1
**English**
- **Fixed within minutes of shipping it: an impossible GPIO pin was accepted.** The
  router clamped the number into range before validating it, so pin 99 became pin 27 and
  the switch was saved — a relay quietly wired to a line nobody chose. Pin, channel and
  off-time are now checked, not corrected. "Helpfully" fixing a value the operator typed
  is how a switch ends up controlling the wrong thing.

**Deutsch**
- **Minuten nach der Veröffentlichung gefunden: ein unmöglicher GPIO-Pin wurde
  angenommen.** Der Router hat die Zahl vor der Prüfung in den gültigen Bereich gebogen —
  aus Pin 99 wurde Pin 27, und der Schalter war gespeichert: ein Relais, still auf eine
  Leitung gelegt, die niemand gewählt hat. Pin, Kanal und Ausschaltdauer werden jetzt
  geprüft, nicht korrigiert. Einen eingegebenen Wert „hilfsbereit" zurechtzurücken ist
  genau der Weg, auf dem ein Schalter am Ende das Falsche schaltet.

## v0.9.0
**English**
- **Power switches.** A Shelly, a Tasmota plug, any pair of URLs, or a relay on the Pi's
  GPIO — on, off, or a proper power cycle from the page. This is the only thing in the
  box that can *act* on a fault instead of describing it: the camera that has stopped
  answering and would come back after a power cut is otherwise a two-hundred-kilometre
  drive.
- **And it can do it by itself.** Link a switch to a saved device and the gateway
  power-cycles that device when it stops answering — **once**, then an hour of quiet. A
  relay that clacks all night on a flapping link is worse than a device that is simply
  down, because it is also unrecoverable by hand.
- A cycle is *scheduled*, not awaited: the answer has to reach the browser before the
  thing the browser is talking through possibly loses power. And GPIO relays that switch
  on a LOW level are a checkbox, because getting that backwards is discovered from far
  away.
- **Hardware watchdog.** Everything else assumes this service is still running; if the
  kernel wedges, nothing in user space gets a turn and the box is gone until someone
  drives there. The Pi has a timer chip for exactly that — systemd pets it, and if it
  stops, the board resets. Off by default, because a machine that resets itself is not
  what everyone wants on a bench, and switched on from the page (`daemon-reexec`, not
  `daemon-reload` — the latter would leave the setting looking applied while doing
  nothing).
- `gpiod` is installed by the provisioner, so a relay works out of the box.
- **The Wi-Fi uplink case is documented.** Not every site is an LTE site: the README now
  spells out the three shapes (LTE stick, Wi-Fi client, Ethernet) and the one rule that
  actually bites — a Pi's built-in radio can *join* a network or *serve* a hotspot, never
  both, so a Wi-Fi uplink means the devices join that same Wi-Fi, or you add a second USB
  adapter for the hotspot.

**Deutsch**
- **Schaltbare Steckdosen und Relais.** Ein Shelly, eine Tasmota-Steckdose, ein beliebiges
  URL-Paar oder ein Relais am GPIO des Pi — ein, aus oder ein richtiger Stromstoß-Zyklus
  von der Seite aus. Das ist das Einzige in dieser Kiste, das auf eine Störung
  **handeln** statt sie zu beschreiben: die Kamera, die nicht mehr antwortet und nach
  einem Stromausfall wiederkäme, ist sonst eine Fahrt von 200 Kilometern.
- **Und sie kann es allein.** Verknüpfe einen Schalter mit einem gespeicherten Gerät, und
  das Gateway macht dieses Gerät stromlos, wenn es verstummt — **einmal**, dann eine
  Stunde Ruhe. Ein Relais, das bei einer flackernden Verbindung die ganze Nacht klackert,
  ist schlimmer als ein Gerät, das schlicht aus ist — es ist dann nämlich auch von Hand
  nicht mehr zu retten.
- Der Zyklus wird *geplant*, nicht abgewartet: Die Antwort muss den Browser erreichen,
  bevor das, worüber der Browser spricht, womöglich stromlos wird. Und Relais, die auf
  LOW schalten, sind ein Haken — das falsch herum zu haben, merkt man aus der Ferne.
- **Hardware-Watchdog.** Alles andere setzt voraus, dass dieser Dienst noch läuft; hängt
  der Kernel, kommt kein Userspace mehr dran, und die Kiste ist weg, bis jemand hinfährt.
  Der Pi hat genau dafür einen Timer-Chip — systemd füttert ihn, hört das auf, setzt der
  Chip die Platine zurück. Standardmäßig aus, denn eine Maschine, die sich selbst
  zurücksetzt, will nicht jeder auf der Werkbank, und über die Seite einschaltbar
  (`daemon-reexec`, nicht `daemon-reload` — Letzteres ließe die Einstellung angewendet
  aussehen, ohne etwas zu tun).
- `gpiod` installiert der Provisionierer mit, damit ein Relais ohne Nacharbeit
  funktioniert.
- **Der WLAN-Uplink ist dokumentiert.** Nicht jeder Standort ist ein LTE-Standort: Die
  README nennt jetzt die drei Formen (LTE-Stick, WLAN-Client, Ethernet) und die eine
  Regel, die wirklich weh tut — das eingebaute Funkmodul des Pi kann einem Netz
  *beitreten* oder einen Hotspot *bereitstellen*, nie beides. Ein WLAN-Uplink heißt also:
  die Geräte hängen im selben WLAN, oder ein zweiter USB-Adapter übernimmt den Hotspot.

## v0.8.0
**English**
- **Alert rules are made on the page now.** Pick a sensor reading (the list comes from
  the channels this site actually has), a saved device, or the box itself; set a limit
  and how long it has to hold. A sensor rule without a limit is refused rather than
  silently watching nothing.
- **There is a watchdog, and it was worth asking about.** Until now the only protection
  was `Restart=always`, which catches a process that *crashed* — and none of the failures
  that actually happen at a remote site: an LTE session that is up but carries nothing,
  a modem that answers but stopped routing, Tailscale logged out after a token expired.
  From the inside all of those look healthy. So the gateway probes whether traffic still
  reaches the outside and escalates **cheapest-first**: bring Tailscale up (2 failed
  probes), restart the network stack, which redials LTE (4), reboot (8, and only if
  allowed). Each step fires **once** at its threshold — repeating "restart the network"
  every five minutes helps nothing and hides whether the last attempt did anything.
- The probe target is an **address**, not a hostname: a broken DNS would otherwise read
  as a dead link and trigger a reboot that fixes nothing.
- **A weekly reboot, on by default (Sunday 04:00) — and yes, it is a good idea.** It is a
  crutch, and a cheap one: it clears leaked memory, wedged USB modems and drivers that
  quietly stopped, none of which anyone is there to notice. The guard that matters is the
  uptime check — without it a box that boots inside its own window reboots again, and a
  site you cannot reach is now in a loop.
- Every recovery step is announced **before** it runs, best-effort: the missing link is
  exactly why the message may not arrive, and that must never stop the recovery.
- Cameras moved above the sensors and both panels are collapsed — the page is read from
  the top, and those two are set once.

**Deutsch**
- **Alarmregeln entstehen jetzt auf der Seite.** Sensorwert wählen (die Liste kommt aus
  den Kanälen, die dieser Standort wirklich hat), gespeichertes Gerät oder die Kiste
  selbst; Grenze setzen und wie lange sie halten muss. Eine Sensorregel ohne Grenze wird
  abgelehnt, statt still nichts zu überwachen.
- **Einen Watchdog gibt es jetzt — die Frage war berechtigt.** Bisher schützte nur
  `Restart=always`, und das fängt einen *abgestürzten* Prozess: also keine der Störungen,
  die an einem entfernten Standort tatsächlich auftreten. Eine LTE-Sitzung, die steht und
  nichts transportiert; ein Modem, das antwortet, aber nicht mehr routet; ein Tailscale,
  das nach abgelaufenem Token ausgeloggt ist. Von innen sieht das alles gesund aus.
  Deshalb prüft das Gateway, ob Verkehr noch nach draußen kommt, und eskaliert
  **vom Billigsten zum Härtesten**: Tailscale neu hochfahren (2 Fehlversuche),
  Netzwerk-Stack neu starten, was LTE neu wählt (4), Neustart (8, und nur wenn erlaubt).
  Jede Stufe feuert **einmal** an ihrer Schwelle — „Netzwerk neu starten" alle fünf
  Minuten zu wiederholen hilft nicht und verdeckt, ob der letzte Versuch etwas bewirkt hat.
- Das Prüfziel ist eine **Adresse**, kein Hostname: ein kaputtes DNS würde sonst wie eine
  tote Leitung aussehen und einen Neustart auslösen, der nichts repariert.
- **Wöchentlicher Neustart, standardmäßig an (Sonntag 4 Uhr) — und ja, das ist eine gute
  Idee.** Es ist eine Krücke, aber eine billige: Sie räumt geleckten Speicher, verklemmte
  USB-Modems und still gestorbene Treiber weg, was sonst niemand bemerkt. Entscheidend
  ist die Laufzeitprüfung — ohne sie startet eine Kiste, die innerhalb ihres eigenen
  Fensters hochkommt, gleich wieder neu, und ein Standort, den du nicht erreichst, ist
  jetzt in einer Schleife.
- Jede Rettungsstufe wird **vorher** angekündigt, im Rahmen des Möglichen: Die fehlende
  Verbindung ist ja der Grund, warum die Meldung vielleicht nicht ankommt — aufhalten
  darf sie die Rettung deswegen nicht.
- Kameras sind über die Sensoren gewandert, beide Blöcke eingeklappt — die Seite wird von
  oben gelesen, und diese zwei richtet man einmal ein.

## v0.7.0
**English**
- **Fixed a layout bug with one cause and four symptoms.** `input { width: 100% }` — the
  rule that makes text fields fill their column — also applied to checkboxes, so each one
  stretched across the row and shoved its own label to the far edge. "Send alerts",
  "Record history", "Allow data roaming" and the coulomb-counting toggle all looked
  broken for the same reason; the subnet-route rows now line up as well.
- Headings had no space before the controls belonging to them, which is why *Site
  network* sat directly on its buttons.
- **The Sensors panel moved to the top and is collapsed**, since it is the thing you
  glance at and the rest is what you configure once.
- **Time is now answerable from the page**: the box's own clock and timezone are shown
  (so you can check them against your watch), the **servers actually in use** appear in
  the field instead of an empty box that looks unconfigured, and the timezone is
  settable. Synchronisation is on by default — that is systemd-timesyncd with the
  distribution's servers.
- **The DS3231 is a checkbox now.** Plug the clock onto the I²C pins, tick the box,
  reboot: the gateway writes `dtoverlay=i2c-rtc,ds3231` into `config.txt` itself. The
  edit is idempotent in both directions and touches nothing else, because that file also
  decides whether the Pi boots at all. What it buys: the site keeps time through a power
  cut on the clock's own battery, the kernel reads it at boot, and NTP corrects both once
  the network is back.
- **The interface for the data counter is a list, not a guess.** It is populated from the
  box, with each interface's addresses next to it — nobody should have to know their WiFi
  is called `wlp59s0`.
- **The allowance now reads as a plan**: used, left, days to go and what that leaves per
  day. A percentage alone does not tell you whether to keep a camera streaming.

**Deutsch**
- **Ein Layout-Fehler mit einer Ursache und vier Symptomen behoben.** `input { width:
  100% }` — die Regel, die Textfelder ihre Spalte füllen lässt — galt auch für
  Checkboxen: jede zog sich über die ganze Zeile und schob ihre eigene Beschriftung an
  den rechten Rand. „Send alerts", „Record history", „Allow data roaming" und der
  Coulomb-Zähler sahen aus demselben Grund kaputt aus; die Routen-Zeilen fluchten jetzt
  ebenfalls.
- Überschriften hatten keinen Abstand zu den Bedienelementen darunter — deshalb klebte
  *Site network* auf seinen Knöpfen.
- **Das Sensor-Panel ist nach oben gewandert und eingeklappt**, denn es ist das, worauf
  man schaut; der Rest wird einmal eingerichtet.
- **Die Zeit lässt sich jetzt auf der Seite kontrollieren**: Uhrzeit und Zeitzone der
  Kiste stehen da (zum Abgleich mit der eigenen Uhr), die **tatsächlich genutzten
  Server** stehen im Feld statt eines leeren Kastens, der unkonfiguriert aussieht, und
  die Zeitzone ist einstellbar. Zeitsynchronisation ist standardmäßig an — das ist
  systemd-timesyncd mit den Servern der Distribution.
- **Die DS3231 ist ein Haken.** Uhr auf die I²C-Pins stecken, Haken setzen, neu starten:
  das Gateway schreibt `dtoverlay=i2c-rtc,ds3231` selbst in die `config.txt`. Die
  Änderung ist in beide Richtungen idempotent und fasst sonst nichts an — diese Datei
  entscheidet schließlich auch, ob der Pi überhaupt bootet. Was sie bringt: Der Standort
  behält die Zeit über einen Stromausfall auf der eigenen Knopfzelle, der Kernel liest
  sie beim Booten, und sobald das Netz wieder da ist, korrigiert NTP beide.
- **Das Interface für den Datenzähler ist eine Liste, keine Rateübung.** Sie kommt aus
  der Kiste selbst, mit den Adressen daneben — niemand muss wissen, dass sein WLAN
  `wlp59s0` heißt.
- **Das Volumen liest sich jetzt wie ein Plan**: verbraucht, offen, verbleibende Tage und
  was das pro Tag bedeutet. Eine Prozentzahl allein beantwortet nicht, ob eine Kamera
  weiterlaufen darf.

## v0.6.0
**English**
- **Recording is now off by default.** It is the only thing here that writes to the card
  continuously, and an installation that wants maximum endurance should not have to
  discover that it opted in by accident. One checkbox in Setup › Sensors turns it on;
  retention and the write interval are settings rather than assumptions.
- **The gateway speaks up.** Alerts over **ntfy**: a sensor past a threshold, a saved
  device gone quiet, the supply sagging, the data allowance at 80 %. Each rule has to
  hold for a while before it counts and then stays quiet for six hours — the lesson from
  the sibling project, where a link that flapped every minute taught us what a voice that
  cries wolf is worth. Recovery is only announced for a problem that was announced.
- **A sensor nobody wired up is not an alarm.** This box is meant to run with whatever
  the operator happened to connect, so a missing reading is silence, never a breach.
- **Site health**: disk, CPU temperature, load, uptime, **undervoltage now and since
  boot** (the classic Pi-plus-LTE-stick failure that quietly eats SD cards), whether the
  **clock is synced**, and whether a hardware clock is fitted. Every one of them is
  `null` when it cannot be read — a box without `vcgencmd` is a normal box, and "unknown"
  must never render as a healthy zero.
- **Time is configurable from the page**: NTP servers are validated, written as a
  systemd-timesyncd drop-in and applied. A **DS3231 RTC** is detected when present and
  documented for sites that are offline for long stretches — deliberately not enabled by
  default.
- **Mobile data counter with an allowance.** Either the stick's own figure (what the
  carrier sees) or the kernel's interface counters (works for any uplink); the gateway
  keeps its own monthly total from the **differences**, so a stick reboot or a Pi reboot
  costs nothing. A counter that went backwards means "something restarted", not "we
  un-sent 4 GB" — and a warning goes out at 80 % of the cap.

**Deutsch**
- **Die Aufzeichnung ist jetzt standardmäßig aus.** Sie ist das Einzige hier, das
  dauerhaft auf die Karte schreibt, und eine Installation, die maximale Lebensdauer will,
  soll das nicht versehentlich eingeschaltet haben. Ein Haken in Setup › Sensors
  aktiviert sie; Aufbewahrung und Schreibintervall sind Einstellungen statt Annahmen.
- **Das Gateway meldet sich.** Alarme über **ntfy**: ein Sensor jenseits der Schwelle,
  ein gespeichertes Gerät, das verstummt, sackende Versorgungsspannung, 80 % des
  Datenvolumens. Jede Regel muss erst eine Weile halten und schweigt danach sechs Stunden
  — die Lehre aus dem Schwesterprojekt, wo eine im Minutentakt flackernde Verbindung uns
  gezeigt hat, was eine Stimme wert ist, die zu oft ruft. Entwarnung gibt es nur für eine
  Meldung, die auch rausging.
- **Ein Sensor, den niemand angeschlossen hat, ist kein Alarm.** Diese Kiste soll mit dem
  laufen, was der Betreiber zufällig verkabelt hat — ein fehlender Messwert bedeutet
  Schweigen, nie eine Grenzverletzung.
- **Systemgesundheit**: Speicherplatz, CPU-Temperatur, Last, Laufzeit, **Unterspannung
  jetzt und seit dem Booten** (der klassische Pi-plus-LTE-Stick-Fehler, der still
  SD-Karten frisst), ob die **Uhr synchron** ist und ob eine Hardware-Uhr steckt. Jeder
  Wert ist `null`, wenn er nicht lesbar ist — eine Kiste ohne `vcgencmd` ist eine normale
  Kiste, und „unbekannt" darf nie als gesunde Null erscheinen.
- **Die Zeit ist über die Seite einstellbar**: NTP-Server werden geprüft, als
  systemd-timesyncd-Datei geschrieben und angewendet. Eine **DS3231-RTC** wird erkannt,
  wenn sie steckt, und für Standorte dokumentiert, die lange offline sind — bewusst nicht
  standardmäßig aktiv.
- **Datenzähler mit Volumengrenze.** Wahlweise der Zähler des Sticks (was der Anbieter
  sieht) oder die Interface-Zähler des Kernels (funktioniert bei jedem Uplink); das
  Gateway führt seinen eigenen Monatswert aus den **Differenzen**, ein Neustart von Stick
  oder Pi kostet also nichts. Ein rückwärts gelaufener Zähler heißt „etwas wurde neu
  gestartet", nicht „wir haben 4 GB ungesendet" — und bei 80 % des Volumens geht eine
  Meldung raus.

## v0.5.0
**English**
- **The sensors have a memory.** One averaged value per minute is recorded and kept for
  13 months, with hour / day / week / month / year views drawn in the page itself — no
  charting library, because a site with a flaky uplink cannot fetch one. The band behind
  each line is the **minimum and maximum** inside every averaged step: on a battery the
  dip under load is precisely what a mean hides.
- **The sizing decided the design.** A minute row with a handful of channels is ~40
  bytes, so a year is about **21 MB — 0.13 % of a 16 GB card**. That removes the usual
  reason for tiers of ever-coarser data: full minute resolution is kept for the whole
  window and longer views are averaged **when you ask**, so nothing is lost to a
  downsampling pass that already ran.
- Written as plain CSV, one file per month. A half-written line after a power cut costs
  one minute, not the file, and a year of measurements can still be read with `tail` over
  SSH. Recording never takes the gateway down: a full card costs history, not the page
  that would tell you about it.
- Samples are buffered and flushed every five minutes — a few hundred SD-card writes a
  day instead of tens of thousands. The trade is stated plainly: a power cut loses up to
  five minutes.
- Found while running it: for the first few minutes of a fresh box the API returned data
  points with **no channel names**, because names were only read from files that did not
  exist yet — the page had numbers and nothing to draw them under.

**Deutsch**
- **Die Sensorik hat ein Gedächtnis.** Ein gemittelter Wert pro Minute wird
  aufgezeichnet und 13 Monate aufbewahrt, mit Ansichten für Stunde / Tag / Woche / Monat
  / Jahr, gezeichnet in der Seite selbst — ohne Diagramm-Bibliothek, denn ein Standort
  mit wackligem Uplink kann keine nachladen. Das Band hinter jeder Linie ist das
  **Minimum und Maximum** innerhalb jedes gemittelten Schritts: Bei einer Batterie ist
  der Einbruch unter Last genau das, was ein Mittelwert verschluckt.
- **Die Größenrechnung hat das Design bestimmt.** Eine Minutenzeile mit einer Handvoll
  Kanäle sind ~40 Byte, ein Jahr also etwa **21 MB — 0,13 % einer 16-GB-Karte**. Damit
  entfällt der übliche Grund für Stufen immer gröberer Daten: volle Minutenauflösung
  bleibt über den ganzen Zeitraum erhalten, längere Ansichten werden **beim Abruf**
  gemittelt. Nichts geht durch einen Verdichtungslauf verloren, der schon gelaufen ist.
- Gespeichert als schlichtes CSV, eine Datei pro Monat. Eine halb geschriebene Zeile nach
  einem Stromausfall kostet eine Minute, nicht die Datei, und ein Jahr Messwerte lässt
  sich per SSH mit `tail` lesen. Das Aufzeichnen legt das Gateway nie lahm: eine volle
  Karte kostet Verlauf, nicht die Seite, die davon berichten würde.
- Messwerte werden gepuffert und alle fünf Minuten geschrieben — ein paar hundert
  SD-Karten-Schreibvorgänge am Tag statt Zehntausender. Der Preis steht klar dabei: ein
  Stromausfall kostet bis zu fünf Minuten.
- Beim Laufenlassen gefunden: In den ersten Minuten einer frischen Kiste lieferte die API
  Messpunkte **ohne Kanalnamen**, weil die Namen nur aus Dateien gelesen wurden, die es
  noch gar nicht gab — die Seite hatte Zahlen und nichts, worunter sie sie zeichnen
  konnte.

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
