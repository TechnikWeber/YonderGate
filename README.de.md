[English](README.md) · **Deutsch**

# YonderGate

Ein **Gateway für einen Standort ohne Netzanschluss**, auf einem Raspberry Pi: Es holt
einen abgelegenen Ort — ein Feriengrundstück mit Solar, eine Hütte, einen Bootsliegeplatz
— in dein Tailscale-Netz, funkt dort sein eigenes WLAN für die Geräte vor Ort, findet
diese Geräte und lässt dich zu ihnen durch.

> **Stand: früh, aber brauchbar.** Provisionierung, Fernzugriff, LTE, Kameras und Sensoren
> stammen aus [YonderRC](https://github.com/TechnikWeber/YonderRC); Gerätesuche,
> Subnetz-Routing und das Veröffentlichen einzelner Geräte sind drin. Siehe
> [docs/CONCEPT.md](docs/CONCEPT.md) für das Ziel,
> [docs/HARDWARE.de.md](docs/HARDWARE.de.md) für das, was man kauft und was es an Watt
> kostet, [docs/DATA-BUDGET.de.md](docs/DATA-BUDGET.de.md) für das, was es an Megabyte
> kostet und welche SIM hineingehört, und die **TODO** unten für das, was noch fehlt.
> Nichts davon lief bisher an einem echten Standort — die Hardware-Pfade (nmcli,
> Ping-Sweeps, Tailscale-Routing) sind nur auf dem Pi selbst überprüfbar.

![Setup-Seite von YonderGate: Systemstatus mit LTE, Fernzugriff und der Warnung zum offenen Hotspot, darunter das Panel „Site network" mit Gerätesuche und Tailscale-Subnetzrouten](docs/screenshots/Status_and_Network.png?v=1)

## Was heute funktioniert

- **Finden, was vor Ort ist**: *Scan* liest die Neighbour-Tabelle des Kernels (sofort),
  *Scan + sweep* pingt das ganze Subnetz für die Stillen ab. Die Liste zeigt Adresse,
  Hostname, Hersteller, was geantwortet hat, und eine einzeilige Vermutung, was das Gerät
  ist.
- **Diese Geräte auf zwei Wegen erreichen**: **Tailscale-Subnetz-Routen** — die Netze des
  Standorts bekanntgeben, und jedes Gerät ist von überall im Tailnet unter seiner echten
  Adresse erreichbar — oder **ein einzelnes Gerät veröffentlichen**, auf einem Port des
  Gateways, was überhaupt keine Routing-Änderung braucht.
- **Grafische Setup-Seite**, vom Pi ausgeliefert (`/setup`) — kein Bildschirm, kein SSH.
- **Onboarding per Access Point**: Der Pi macht seinen eigenen Hotspot auf
  (`YonderGate-setup`, standardmäßig offen) mit Captive Portal, damit ein Handy ihn ab
  Werk konfigurieren kann. Er repariert die klassische Raspberry-Pi-OS-Falle, bei der WLAN
  per rfkill blockiert bleibt, bis ein **WLAN-Land** gesetzt ist. **Geräte am Hotspot
  bekommen auch Internet**, sobald das Gateway einen Uplink hat — siehe unten.
- **LTE**: ModemManager-Modems (APN, SIM-PIN, Netzmodus, Roaming, Diagnose) **und
  HiLink-Sticks** (Huawei E3372h-320 und Verwandte) — über die Routing-Tabelle gefunden,
  mit ihrer eigenen Weboberfläche, durch das Gateway auf Port 8081 durchgereicht.
- **Fernzugriff**: Tailscale, ZeroTier oder WireGuard, beim Boot hochgeholt. WireGuard
  nimmt entweder die **hochgeladene `.conf`**, die dein Server exportiert hat, oder die
  **eingetippten Werte** (Schlüssel, Adresse, Endpoint, AllowedIPs) für einen Peer, der
  als Seite mit Einstellungen statt als Datei kam. Beides landet als dieselbe gespeicherte
  `.conf`, eine hochgeladene Datei lässt sich also danach feldweise bearbeiten.
- **Der Tunnel kann nach Zeitplan laufen**: **immer live**, oder **nur in einem Fenster**
  (Standard sonntags 14:00–14:15). Im Fenster-Modus bleibt der Tunnel unten und Alarme
  werden auf Platte gehalten, kommen dann als eine Nachricht an, wenn es aufgeht, und die
  Box ist bis zum Schließen voll live. Es kann dich nicht aussperren: Der Tunnel bleibt
  nach jedem Neustart zehn Minuten oben, wird nie abgebaut, während jemand die Seite offen
  hat, und es gibt einen *jetzt öffnen*-Knopf. Siehe
  [docs/DATA-BUDGET.de.md](docs/DATA-BUDGET.de.md).
- **Es kann Dinge aus- und wieder einschalten**: einen Shelly, eine Tasmota-Steckdose,
  irgendeine URL oder ein Relais am GPIO — von Hand oder automatisch, wenn das Gerät
  hinter diesem Schalter aufhört zu antworten. Es ist das Einzige hier, das auf einen
  Fehler *handeln* kann, statt ihn nur zu melden.
- **Es holt sich selbst zurück ins Netz.** Ein Watchdog prüft, ob Verkehr noch nach außen
  kommt — der einzige ehrliche Test, denn eine LTE-Sitzung kann „oben" sein und nichts
  tragen — und eskaliert vom Billigsten aufwärts: Tailscale hochholen, den Netzwerkstack
  neu starten (was LTE neu wählt), als letztes Mittel neu starten. **Es kann nicht in
  Schleife geraten**: Das Reboot-Budget liegt auf der Platte (zwei pro Tag, sechs Stunden
  auseinander), ein Neustart kann es also nicht zurücksetzen — und wenn ein Medium schlicht
  weg ist, greift die Box nicht mehr zum Hammer und sagt das. Ein Neustart wird außerdem
  übersprungen, solange jemand die Seite offen hat. Dazu optional ein wöchentlicher
  Neustart.
- **Es meldet sich, wenn etwas nicht stimmt** (ntfy-Push): Batterie unter einer Schwelle,
  ein gespeichertes Gerät verstummt, die Versorgung sackt ab, das Kontingent der SIM bei
  80 %. Jeder Alarm wartet, bis der Zustand angehalten hat, und bleibt danach sechs Stunden
  still — eine flatternde Verbindung darf keine Nacht voller Benachrichtigungen werden.
- **Zustand des Standorts**: Platte, CPU-Temperatur, Last, Laufzeit, **Unterspannung** (der
  klassische Pi-plus-LTE-Stick-Fehler, der SD-Karten frisst), ob der Pi seinen **Takt
  drosselt** — und wenn ja, ob es die Versorgung ist oder die Hitze, denn eine geschlossene
  Box in der Sonne sieht von außen genauso aus wie ein schwächelnder Akku, und die beiden
  Abhilfen haben nichts miteinander zu tun — und ob die **Uhr wirklich synchron** ist: ein
  Jahr Verlauf ist wertlos, wenn die Zeitstempel von einer Box kommen, die 1970 gebootet
  hat. NTP-Server werden auf der Seite gesetzt, eine DS3231-RTC wird erkannt, wenn du eine
  einbaust.

  ![Zustandswerte des Standorts: Laufzeit, Plattenplatz, CPU-Temperatur, Last, Versorgung, Taktrate, Uhrsynchronität und verbrauchtes Mobilfunkvolumen](docs/screenshots/SiteHealth.png?v=1)
- **Sauberes Herunterfahren von der Seite aus.** Einem Pi mitten im Schreibvorgang den
  Strom zu nehmen ist der Weg, auf dem eine SD-Karte in einer Box am Mast zu einer Anfahrt
  mit Kartenleser wird. *Shut down* fährt ihn vorher sauber herunter — mit der Warnung, die
  dazugehört, denn zurück bringt ihn nur jemand, der an der Box steht.
- **Mobilfunk-Datenzähler**, gegen ein **Monatskontingent oder Prepaid-Guthaben mit
  MB-Abrechnung** — die eigene Zahl des Sticks oder die Interface-Zähler des Kernels, als
  laufende Summe geführt, die es übersteht, wenn eine der beiden Seiten zurückgesetzt wird.
  Er warnt bei 80 % dessen, was gerade gilt, und beim Guthaben rechnet er hoch, wie lange
  es noch reicht — was zugleich die Erinnerung an die nächste Aufladung ist.
- **Sensoren mit Verlauf**: Spannung, Strom und Temperatur über I²C (INA2xx, ADS1115 und
  die üblichen Temperaturbausteine), oder simuliert, wenn keine Hardware dranhängt —
  einmal pro Minute aufgezeichnet und 13 Monate aufbewahrt, damit die Seite „und gestern?"
  genauso beantworten kann wie „und jetzt?". Diagramme für Stunde, Tag, Woche, Monat und
  Jahr, in der Seite selbst gezeichnet, damit sie ohne Internet am Standort funktionieren.
- **Kameras** über go2rtc, grafisch konfiguriert, mit Standbildvorschau und einem Link zum
  Live-Player direkt auf der Seite. `npm run dev:video` fährt das Ganze lokal gegen eine
  simulierte Kamera.
- **Update von der Seite aus**: erst sehen, was hereinkommt, dann pullen und neu starten —
  gebaut für einen Standort, den du nur über LTE erreichst.
- **Optionales API-Secret** (Setup › Security — dort erzeugen, oder `YGW_API_SECRET`
  setzen), das jeden verändernden Aufruf und die durchgereichten Geräte-Oberflächen
  schützt. Lesen ist nie gesperrt, damit die Seite immer lädt; das Secret gibst du in
  demselben Panel ein, um den Browser-Tab zu entsperren, und einmal als
  `…:PORT/?secret=…` für eine durchgereichte Geräteseite. Der Statusblock oben sagt, ob
  ein Secret gesetzt ist und ob dieser Tab es kennt. Statusendpunkte bleiben ohne es
  lesbar (damit die Seite immer aufgeht), was für einen Standort mit standardmäßig offenem
  Hotspot wissenswert ist: Die Geräteliste ist für jeden in WLAN-Reichweite sichtbar.
  Zugangsdaten nicht — ntfy-Topic und Token werden gekürzt angezeigt. Setz ein Secret und
  schalte den Hotspot ab, sobald die Box konfiguriert ist.
- **Eine Seite aus dem Internet kann am Standort nichts auslösen**, auch ohne gesetztes
  Secret. Der Browser ist der eine Angreifer, der schon im Netz ist: Eine Website, die der
  Betreiber öffnet, während sein Handy am Hotspot des Gateways hängt, könnte sonst die Box
  neu starten oder über den Geräte-Proxy ein Relais schalten — ein Relais wird per
  einfacher URL geschaltet, ein `<img>`-Tag reicht also. Das Gateway verweigert alles, was
  eine fremde Seite verursacht hat (`Sec-Fetch-Site: cross-site` oder ein `Origin` aus dem
  öffentlichen Internet), sofern es nicht das Secret mitbringt. Anfragen ohne Browser
  dahinter — curl, Skripte — sind nicht betroffen.

## Drei Wege, den Standort online zu bekommen

Dem Gateway ist es egal, welchen du nimmst — alles andere auf dieser Seite funktioniert
gleich — aber sie unterscheiden sich in einem Punkt, den man vor dem Hardwarekauf kennen
sollte.

| Uplink | Was es ist | Der Haken |
|---|---|---|
| **LTE-Stick** | Der klassische Inselfall: eine SIM in einem USB-Stick. | Getaktet, also Kontingent setzen. |
| **WLAN-Client** | Am Standort gibt es schon WLAN (Hütte, Nachbar, Marina). | **Ein Funkmodul, eine Aufgabe** — siehe unten. |
| **Ethernet** | Der Standort hat einen eigenen Router. | Nicht viel; das ist der einfache Fall. |

> **Die Ein-Funkmodul-Regel.** Das eingebaute WLAN eines Pi kann entweder einem Netz
> *beitreten* oder seinen eigenen Hotspot *aufmachen* — nie beides. Wenn du WLAN als
> Uplink nutzt, kann der Onboarding-Hotspot also nicht gleichzeitig laufen, und die Geräte
> am Standort müssen in dasselbe WLAN wie das Gateway. Drei Auswege: die Geräte in dieses
> WLAN hängen (meistens in Ordnung), einen **zweiten WLAN-Adapter per USB** für den Hotspot
> nachrüsten, oder das eingebaute Funkmodul frei halten, indem LTE oder Ethernet den Uplink
> machen. Das Gateway weigert sich bereits, den Hotspot zu starten, solange es
> WLAN-Client ist, statt sich die eigene Leitung abzuschneiden.

### Bekommen Geräte am Hotspot Internet?

**Ja — sobald das Gateway selbst welches hat.** Der Hotspot wird als *shared*-Verbindung
angelegt, das heißt: Der Pi verteilt Adressen, beantwortet DNS und NATet alles weiter durch
den Uplink, den er gerade hat — den LTE-Stick, den Router des Standorts oder WLAN. Ein
Handy oder Laptop an `YonderGate-setup` surft also normal, und eine Kamera am Hotspot
erreicht das Internet, wenn sie es braucht.

Zwei Dinge sind wissenswert:

- **Es kommt aus der SIM.** Verkehr von Hotspot-Clients ist Mobilfunkverkehr wie jeder
  andere und wird von der Datenseite mitgezählt. Ein Gast, der über die SIM des Standorts
  seine Fotobibliothek synchronisiert, ist eine sehr reale Art, ein Kontingent zu
  verbrennen — deshalb gibt es das Kontingent und die 80-%-Warnung, und deshalb lässt sich
  der Hotspot abschalten (Setup › Wi-Fi), sobald die Box konfiguriert ist.
- **Ohne Uplink ist es nur ein lokales Netz.** Das Captive Portal beantwortet dann jeden
  Namen mit der Setup-Seite, und genau das ist der Sinn: Ein Handy, das beitritt und kein
  Internet findet, soll auf der Seite landen, die erklärt warum, nicht auf einem
  Browserfehler. Sobald ein Uplink zurückkommt, merkt das Gateway es (binnen einer Minute)
  und nimmt die Umleitung weg, normales DNS läuft wieder — der Hotspot verbindet sich dabei
  kurz neu.

Mit WLAN oder Ethernet stellst du den Datenzähler auf **ein Interface** (oder lässt das
Kontingent leer — ein ungetakteter Uplink braucht keins), und die LTE-Panels bleiben
einfach leer.

## Wie du an deine Geräte kommst

Der eigentliche Zweck dieser Box, von vorne erklärt.

### Das Problem

Die Dinge an deinem Standort — eine Kamera, der Router, ein Wechselrichter — haben Adressen
wie `192.168.4.23`. Diese Adressen existieren **nur an diesem Standort**. Millionen Netze
benutzen dieselben Nummern, das Internet kann also nichts dorthin zustellen: Es gibt keine
Möglichkeit zu sagen, *welches* `192.168.4.23` gemeint ist.

Die klassische Antwort lautet „einen Port im Router freigeben". Auch das geht hier nicht:
Eine LTE-Verbindung gibt dir fast nie eine eigene öffentliche Adresse — du teilst sie dir
mit hunderten anderen Kunden (Carrier-Grade NAT). Es gibt keine Tür zum Öffnen.

### Die Idee: dein eigenes privates Netz

**Tailscale** baut ein privates Netz über deine Geräte hinweg, wo immer sie sind.
Installier es auf dem Gateway und auf Laptop und Handy, melde alle im selben Konto an, und
jedes bekommt eine feste Adresse wie `100.126.76.112`. Sie können direkt und verschlüsselt
miteinander reden, **ohne dass an irgendeinem Router etwas geöffnet wird**. Das
funktioniert hinter CGNAT, hinter einer Firewall, aus dem Hotel — weil beide Enten
hinauswählen.

Damit bist du schon **am Gateway selbst**: `http://yondergate:8080/setup` vom Sofa aus. An
alles *dahinter* zu kommen ist das, worum es in diesem Projekt geht, und dafür gibt es zwei
Wege.

### Weg 1 — Subnetz-Routen: alles erreichen, unter seiner echten Adresse

Du sagst deinem privaten Netz: *„Dieses Gateway erreicht auch 192.168.4.0/24."* Von da an
spricht dein Laptop direkt mit `192.168.4.23`, genau als stündest du am Standort. Eine
Einstellung, alle Geräte, auch die, die gar keine Webseiten sind — RTSP-Kameras, SSH, die
App eines Wechselrichters.

**So richtest du es ein**

1. Am Gateway: **Setup › Site network › Reach these networks over Tailscale**. Die Netze
   ankreuzen, die du willst (meist das, in dem deine Geräte hängen), und **Apply routes**
   drücken. Das Gateway schaltet IP-Forwarding für dich ein.
2. In der Tailscale-Admin-Konsole: **Machines → dein Gateway → ⋯ → Edit route settings →
   approve**. *Dieser Schritt ist nicht optional, und es ist der, den alle vergessen* —
   bis er freigegeben ist, existiert die Route und trägt nichts. Die Seite sagt dir, wenn
   sie darauf wartet.
3. Auf einem **Linux**-Client einmal Routen annehmen: `sudo tailscale up --accept-routes`.
   (macOS, iOS, Windows und Android nehmen sie standardmäßig an.)
4. Testen: `http://192.168.4.23/` auf dem Laptop öffnen, von überall.

**Wann das nicht der richtige Weg ist:** Wenn der Standort denselben Adressbereich benutzt
wie das Netz, in dem du gerade sitzt — beide `192.168.178.x` etwa — kann dein Laptop die
beiden nicht auseinanderhalten, und die Route kollidiert mit deinem eigenen LAN. Dann nimm
Weg 2.

### Weg 2 — Ein Gerät veröffentlichen: der Ausweg, der immer geht

Das Gateway bietet **die Weboberfläche eines Geräts auf einem seiner eigenen Ports** an. Du
sprichst immer nur mit dem Gateway, und dorthin bringt dich Tailscale ohnehin.

**So richtest du es ein**

1. **Setup › Site network → Scan**, das Gerät in der Liste finden.
2. Ihm einen Namen geben und, falls die Weboberfläche nicht auf Port 80 liegt, seinen Port.
   **Save**.
3. **Publish** drücken. Die Seite nennt dir den gewählten Port, z. B. `8100`.
4. `http://yondergate:8100/` von überall im Tailnet öffnen.

Keine Routing-Änderung, keine Freigabe, keine Adresskollisionen — und wenn ein API-Secret
gesetzt ist, fragt dieser Port es auch ab (einmal als `…:8100/?secret=DEIN_SECRET`
öffnen).

Die Grenzen sind wissenswert: Es reicht nur **HTTP(S)** durch, ein Gerät pro Port, und das
Gerät sieht das Gateway als Besucher, nicht dich.

### Welchen Weg nehmen

| | Subnetz-Routen | Gerät veröffentlichen |
|---|---|---|
| Erreicht | **jedes Gerät, jedes Protokoll** | die Webseite eines Geräts |
| Einrichtung | einmal, pro Netz | einmal, pro Gerät |
| Braucht Freigabe in der Admin-Konsole | **ja** | nein |
| Übersteht eine Adresskollision mit dem Heimnetz | nein | **ja** |
| Gut für | den Normalfall | eine Kamera, oder wenn Routing nicht geht |

Nimm Subnetz-Routen, wenn du kannst, und Veröffentlichen, wenn du musst — beides
gleichzeitig geht übrigens auch.

## Was der Betrieb kostet

Zwei Budgets entscheiden, ob so eine Box praktikabel ist, und keins davon hat mit dem Code
zu tun.

**Watt.** Ein **Pi Zero 2 W** plus HiLink-LTE-Stick sind **≈ 2,5–4 W, also 60–95 Wh/Tag**.
Das Board ist dabei nur der drittgrößte Hebel: Eine dauerhaft laufende IP-Kamera kann mehr
kosten als das ganze Gateway, und ein Stick mit schlechter Antenne sendet härter und
verbrennt dabei Watt. Teileliste, Verkabelung und der Brownout-Abschnitt:
[docs/HARDWARE.de.md](docs/HARDWARE.de.md) ([english](docs/HARDWARE.md)).

**Megabyte.** Am laufenden Gateway gemessen: Die Setup-Seite ist 33 kB gzip-komprimiert und
0 Byte, wenn sie unverändert ist; ein offener Tab kostet ~2 MB/Stunde (und hört auf, wenn du
ihn verdeckst); der Watchdog ~3 MB/Monat im Fünf-Minuten-Takt; ein Kamera-Standbild
50–200 kB — und eine Minute Live-1080p ~15 MB, mehr als ein Monat von allem anderen. Der
Posten, den niemand einplant, ist `apt`, das auf einer getakteten Leitung alles überdecken
kann.

### Welche SIM

Der Tarif entscheidet mehr als der Preis, und das Kriterium ist nicht das, mit dem die
meisten anfangen. Die vollständige Begründung steht in
[docs/DATA-BUDGET.de.md](docs/DATA-BUDGET.de.md) ([english](docs/DATA-BUDGET.md)); kurz:

- **Erst Empfang.** An einem abgelegenen Grundstück zählt das Netz, das die Box tatsächlich
  erreicht, mehr als ein Euro im Monat — und besserer Empfang kostet auch weniger Watt. Vor
  dem Kauf mit einem Handy testen, dort wo die Box stehen wird.
- **Die 1NCE-Form ist für dich zu.** 1NCE („10 € für 10 Jahre") und das o2-Gegenstück *Easy
  IoT* passen genau auf diese Box und sind **beide Geschäftskundenprodukte**.
- **Was für Privatkunden bleibt:**

| | Kosten | Aufpassen bei |
|---|---|---|
| **Prepaid, kein Paket, pro MB** | 3–5 ct/MB → **25 ct–1 €/Monat** bei unserem Standby | keine Obergrenze außer dem Guthaben; nach Session-Rundung fragen |
| **Prepaid + Auto-Paket** | ab ~2 €/Monat (congstar, Telekom-Netz) | das Paket *ist* die Aufladung, die SIM kann also nicht abgeschaltet werden |
| **Monats-Datentarif** | ~2,99 €/Monat für 3 GB (o2-Netz) | nichts zu verfolgen; auf zehn Jahre am teuersten |
| **Pay-per-use-IoT-SIM** (Things Mobile) | ~20 ct/MB für kleine Verbraucher | behält die „einmal zahlen"-Form, zum zehnfachen Preis |

- **Die Falle ist die Inaktivität, und sie ist andersherum als erwartet: die meisten
  Anbieter zählen eine Aufladung, nicht die Nutzung.** Ein Gateway, das still 5 MB im Monat
  verbraucht, kann trotzdem abgeschaltet werden. Die Fristen reichen von 90 Tagen (Vodafone
  CallYa — hier unbrauchbar) bis 24 Monate (Telekom).
- **Der Zähler ist eingebaut.** Setup › Mobile data führt entweder ein Monatskontingent oder
  **Prepaid-Guthaben mit MB-Abrechnung**, warnt bei 80 % dessen, was gilt, und rechnet hoch,
  wie lange das Guthaben reicht — was zugleich die Erinnerung an die nächste Aufladung ist.

## Schnellstart (Raspberry Pi OS Lite, Bookworm)

**Was man zuerst kauft:** einen **Pi Zero 2 W**, einen HiLink-LTE-Stick mit externer
Antenne, IP- statt USB-Kameras und einen INA228 in der Batterieleitung. Details oben.

```bash
curl -fsSL https://raw.githubusercontent.com/TechnikWeber/YonderGate/main/provisioning/bootstrap.sh | bash
```

Dann `http://<pi>:8080/setup` öffnen — oder dem Hotspot `YonderGate-setup` beitreten und
das Captive Portal die Seite aufmachen lassen.

## Entwicklung

```bash
npm install
npm test          # reine Logik: Sensoren, WLAN, LTE, Updater, Proxy-Auth
npm run dev       # der Dienst im Sim-Modus → http://localhost:8080/setup
```

Nichts davon braucht Hardware: Jeder Treiber und jeder Sensor hat eine simulierte
Umsetzung, und die Setup-Seite ist dagegen vollständig bedienbar.

## TODO

Die lebende Liste dessen, was offen ist. Abgehakte Punkte sind fertig und durch Tests
abgedeckt.

**Gateway-Kern**
- [x] Gerätesuche: Neighbour-Tabelle, optionaler Ping-Sweep, Hersteller- und Port-Erkennung
- [x] Tailscale-Subnetz-Routen inkl. IP-Forwarding, mit dem ausgeschriebenen Schritt „in
      der Admin-Konsole freigeben"
- [x] Ein einzelnes Gerät auf einem Gateway-Port veröffentlichen (der Weg ohne Routing)
- [ ] All das **auf dem echten Pi** verifizieren — Sweeps, `tailscale set`, Forwarding
- [x] Gefundene Geräte zwischen Scans merken: Namen, Ports, und ein gespeichertes Gerät,
      das aufhört zu antworten, bleibt mit dem Zeitpunkt des letzten Lebenszeichens in der
      Liste
- [ ] HTTPS-Geräte: Der Proxy spricht mit dem Ziel derzeit nur einfaches HTTP
- [ ] mDNS-/Avahi-Namen in der Geräteliste, nicht nur Reverse-DNS

**Standortüberwachung**
- [x] Sensorverlauf: ein gemittelter Wert pro Minute, 13 Monate aufbewahrt (~21 MB im
      Jahr), mit Min/Max pro Schritt und Ansichten von Stunde bis Jahr — **standardmäßig
      aus**, weil es das Einzige ist, das dauerhaft auf die Karte schreibt
- [x] **Alarme** über ntfy, mit Halte- und Ruhezeit, damit eine flatternde Verbindung nicht
      zu einer Nacht voller Benachrichtigungen wird
- [x] **Systemzustand**: Platte, Temperatur, Last, Laufzeit, Unterspannung, thermische
      Drosselung von einbrechender Versorgung unterschieden, Uhrsynchronität,
      RTC-Erkennung, NTP-Server von der Seite aus setzbar, sauberes Herunterfahren
- [x] **Mobilfunk-Datenzähler** mit Warnung bei 80 % — gegen ein Monatskontingent *oder*
      Prepaid-Guthaben mit MB-Abrechnung, samt Hochrechnung, wie lange das Guthaben reicht
- [ ] Alarm, wenn **der Uplink selbst** weg ist — braucht einen Weg, es im Nachhinein zu
      merken, denn eine Box ohne Verbindung kann nichts senden, solange sie unten ist
- [x] **Sparsam auf getakteter Leitung**: Die Seite wird gzip-komprimiert (121,9 kB →
      33,1 kB, gemessen) und per ETag revalidiert, und sie hört auf zu pollen, wenn der Tab
      nicht sichtbar ist — ein offener Tab kostete ~2 MB pro Stunde. Siehe
      [docs/DATA-BUDGET.de.md](docs/DATA-BUDGET.de.md)
- [ ] **Messen, was Tailscale im Leerlauf kostet.** Der größte Dauerposten im Datenbudget
      und der einzige, der noch geraten ist; der Zähler dafür steckt schon in der Seite
- [x] **Uplink-Fenster**: zwei Modi per Radiobutton — immer live, oder live nur in einem
      Fenster (Standard sonntags 14:00–14:15), mit Alarmen, die dazwischen auf Platte
      warten und beim Aufgehen als eine gruppierte Nachricht rausgehen
- ~~SMS-Weckruf~~ — **abgesagt, 22.08.2026.** Nicht am Code (die HiLink-Session-Behandlung
      ist da, und die Aktion ist `uplink.openFor()`), sondern am Tarif: Die SIMs, die ein
      Privatkunde kaufen kann, haben nicht verlässlich eine Nummer, die SMS empfängt. Ein
      Weg hinein, der bis zu dem Tag funktioniert, an dem man ihn braucht, ist schlechter
      als keiner. Das Fenster bleibt die Antwort; die Begründung steht in
      [docs/DATA-BUDGET.de.md](docs/DATA-BUDGET.de.md)
- [x] Zeit auf der Seite: aktuelle Uhrzeit, Zeitzone, die tatsächlich benutzten Server und
      eine **per Checkbox aktivierte DS3231-Hardwareuhr** statt einer SSH-Sitzung
- [x] Interface-Auswahl für den Datenzähler und eine Zeile „verbraucht / übrig / Tage noch"
- [x] Alarmregeln von der Seite aus anlegen, bearbeiten und löschen
- [ ] Einen Zeitraum des Verlaufs als CSV von der Seite aus exportieren
- [ ] Der Alarmzustand liegt im Speicher: Nach einem Neustart schickt eine noch laufende
      Überschreitung eine Nachricht mehr, als sie sollte
- [ ] Konfigurationssicherung / -wiederherstellung als eine Datei
- [x] Kameravorschau auf der Setup-Seite (Standbild + Link zum Player von go2rtc)

**Betrieb**
- [ ] Die Lizenz entscheiden, bevor das hier Mitwirkende bekommt (siehe docs/CONCEPT.md)
- [x] Zweisprachige Doku wie in YonderRC — `README.de.md` und `docs/HARDWARE.de.md` sind
      da, und ein Test schlägt fehl, wenn die beiden READMEs strukturell auseinanderlaufen
- [x] Ein Hardware-Leitfaden: welcher Pi, welcher LTE-Stick, Solar-/Ladereglerverkabelung
      und was das Ganze an Watt kostet — [docs/HARDWARE.de.md](docs/HARDWARE.de.md)
- [ ] Verhalten bei Brownout: im Hardware-Leitfaden beschrieben, aber **nicht auf Hardware
      verifiziert**
