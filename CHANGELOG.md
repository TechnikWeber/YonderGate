# Changelog

All notable changes to YonderGate. Entries are bilingual (English / Deutsch).

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
