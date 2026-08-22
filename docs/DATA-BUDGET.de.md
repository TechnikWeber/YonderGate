# Datenbudget — was diese Box auf einer getakteten SIM kostet

*Das Ziel, gegen das hier gerechnet wird: **eine Nachricht, wenn etwas nicht stimmt**, und
die Möglichkeit, sich **hin und wieder draufzuschalten** — kurz in die Kamera schauen,
sehen, wie voll die Batterie ist. Im Standby soll es so nah an null kosten, wie eine
verbundene Box es kann. Diese Seite klärt, ob das geht, wo es wie viel kostet, und welche
Art Tarif dazu passt.*

> Gemessene Werte unten stammen vom laufenden Gateway und sind als solche gekennzeichnet.
> Alles andere ist eine Größenordnung und sagt das auch. Das Gateway zählt seinen eigenen
> Verkehr (Setup › Mobile data, mit Monatskontingent und Warnung bei 80 %) — dieser Zähler
> entscheidet über den Tarif, nicht diese Seite.

## Zuerst der unangenehme Teil

**„Sofort erreichbar" und „verbraucht im Leerlauf nichts" stehen im Widerspruch**, und kein
Feintuning löst das auf. Ein dauerhafter Tunnel ist ein dauerhaftes Gespräch: Tailscale
hält einen Long-Poll zur Steuerebene, hält eine DERP-Relay-Verbindung offen und stanzt oft
genug durch das NAT, damit das CGNAT des Betreibers die Zuordnung nicht verwirft. Nichts
davon transportiert deine Daten, und alles davon kostet Bytes.

Die eigentliche Frage ist also nicht „wie komme ich auf null", sondern **welches von
beiden du willst** — und die Antwort darf eine andere sein als das, was die Box heute tut.
Drei Bauformen, weiter unten.

## Wo die Bytes hingehen

| Quelle | Takt | Größe | Pro Monat |
|---|---|---|---|
| **Tailscale, Leerlauf** | dauerhaft | Keepalives | **zig MB — die große Unbekannte, messen** |
| Watchdog-Probe | 2 Pings / 5 min (Standard) | ~0,35 kB | **~3 MB** |
| ntfy-Alarm | pro Alarm | ~5–10 kB inkl. TLS | ~0,2 MB bei 20 Alarmen |
| NTP | adaptiv, ≤ alle ~34 min | ~0,2 kB | < 0,2 MB |
| Setup-Seite, erster Aufruf | pro Besuch | **33 kB** (gemessen, gzip) | — |
| Setup-Seite, revalidiert | pro Besuch | **0 B Body** (304) | — |
| Setup-Seite, offener Tab | solange sichtbar | ~2 MB/Stunde (gemessen) | — |
| Kamera-Standbild | pro Blick | 50–200 kB | — |
| **Kamera, live H.264 1080p** | beim Zuschauen | **~15 MB pro Minute** | — |
| `apt` / unattended-upgrades | täglich, wenn aktiv | **MB pro Tag** | **kann alles andere überdecken** |
| Discovery, AP-Verkehr, Sensor-History | — | nur lokal | **0** |

Vier Dinge dazu gehören ausgesprochen.

**Der Watchdog ist nicht umsonst.** Zwei ICMP-Pings alle fünf Minuten sind rund 3 MB im
Monat — mehr als das gesamte Alarmbudget, das du dir vorgestellt hast. Er kauft etwas
Echtes (er ist der einzige ehrliche Test, ob Verkehr noch nach draußen kommt, und er ist
das, was die Box unbeaufsichtigt zurückholt), aber auf einer Lifetime-SIM lohnt sich der
Schritt auf 15 oder 30 Minuten. Ein Standort, der zwanzig statt fünf Minuten weg war, ist
meist verschmerzbar; eine SIM ohne Guthaben nicht.

**`apt` ist das, was niemand einplant.** Raspberry Pi OS aktualisiert täglich die
Paketlisten, und unattended-upgrades lädt echte Pakete. Auf einer getakteten Leitung kann
das eine Größenordnung mehr sein als alles, was das Gateway zusammen tut. Das ist eine
echte Abwägung — Sicherheitsupdates gegen Datenbudget — und nichts, was man still
abschaltet; der Installer lässt es deshalb in Ruhe. Wenn du dich dagegen entscheidest:
```bash
sudo systemctl disable --now apt-daily.timer apt-daily-upgrade.timer
sudo systemctl disable --now unattended-upgrades   # falls installiert
```
und dann bewusst aktualisieren, wenn du ohnehin hinsiehst, über den Update-Knopf.

**Livevideo spielt in einer anderen Einheit.** Eine Minute 1080p kostet mehr als ein Monat
von allem anderen. Die Standbildvorschau auf der Setup-Seite gibt es auch deswegen: in
eine Kamera schauen soll 100 kB kosten, ihr zusehen soll eine bewusste Entscheidung sein.

**Tailscale im Leerlauf ist die wichtigste Unbekannte.** Auf diesem Stand nicht gemessen,
und sehr wahrscheinlich der größte Dauerposten. Vor der Tarifentscheidung: eine Woche
laufen lassen und Setup › Mobile data ablesen.

## Was daran billiger wurde (v0.12.5)

Zwei gemessene Gewinne, beide in diesem Repository:

- **Die Seite wird komprimiert und revalidiert.** `/setup` ging von **121,9 kB auf 33,1 kB**
  über die Leitung, und eine unveränderte Seite antwortet jetzt mit **304 ohne Body**,
  statt die Kilobytes erneut zu schicken. `/api/health` halbiert (1,6 kB → 0,8 kB). Bodies
  unter 512 Byte bleiben unangetastet, dort ist gzip nur Rauschen.
- **Die Seite pollt nicht mehr, wenn niemand hinsieht.** Sie fragt `/api/system` alle 3 s,
  Sensoren alle 5 s und Health alle 30 s ab — etwa **2 MB pro Stunde**. Ein über Nacht
  vergessener Tab waren ~17 MB, auf einer SIM mit 500 MB für ihr ganzes Leben ein
  spürbarer Biss. Tab in den Hintergrund stoppt jetzt jeden Poll; zurück im Vordergrund
  wird sofort aktualisiert, damit nichts auf dem Bildschirm still veraltet.

## Drei Bauformen und was sie kosten

**A — Immer live (Standard).** In Sekunden erreichbar, nichts zu bedenken, und der Standby
kostet, was die Keepalives des Tunnels eben kosten. Richtig für einen Tarif mit
Monatskontingent.

**C — Zeitfenster (seit v0.12.6, Setup › Remote access).** Der Tunnel bleibt unten und
Alarme werden **auf Platte gepuffert**; wenn das Fenster aufgeht, kommen sie als eine
gruppierte Nachricht an, und die Box ist bis zum Schließen voll live. Standard **sonntags
14:00–14:15**, Tag, Uhrzeit und Länge sind einstellbar. Was es kostet, weiß man vorher;
was man aufgibt, ist zu erfahren, dass etwas kaputt ist, bevor das Fenster aufgeht.

Es ist so gebaut, dass es nicht der Grund sein kann, warum niemand mehr an die Box kommt:
der Tunnel bleibt nach **jedem Neustart** zehn Minuten oben, er wird nie abgebaut, während
jemand die Seite offen hat, und *Open now for 30 min* übersteuert ihn von der Seite aus.
Die gehaltenen Alarme liegen in `/var/lib/yondergate/alert-buffer.json` — ein Neustart am
Mittwoch verliert also den Alarm vom Dienstag nicht, und ein fehlgeschlagenes Zustellen
behält sie für den nächsten Versuch.

**B — Geweckt per SMS. Bewusst geparkt (22.08.2026).** Die Idee: statt bis Sonntag zu
warten, schickst du der SIM eine SMS, das Gateway liest sie am Modem aus (`mmcli` oder die
HiLink-SMS-API — SMS läuft über den Signalisierungskanal und kostet kein Datenvolumen) und
öffnet den Tunnel für eine festgelegte Zahl Minuten.

Gescheitert ist das am Tarif, nicht am Code. **Der Weckkanal ist nur so verlässlich wie die
Fähigkeit der SIM, eine SMS zu empfangen**, und die Produkte, die ein Privatkunde
tatsächlich kaufen kann (siehe unten), kommen nicht zuverlässig mit einer brauchbaren
Nummer — reine M2M-Datentarife haben oft gar keine MSISDN. Ein Weg hinein, der bis zu dem
Tag funktioniert, an dem man ihn braucht, ist schlechter als keiner. Also ist das Fenster
die Antwort, und B bleibt aufgeschrieben statt gebaut.

Der Vollständigkeit halber: das meiste davon wäre klein gewesen. Der Session-und-Token-Tanz
für HiLink ist bereits implementiert (`system/hilink.ts`), und die Aktion ist
`uplink.openFor()`, die mit C ausgeliefert wurde. Gefehlt hätten ein POST-Helfer, ein
SMS-Listen-Parser und ein Dienst.

**Ausgeliefert wird C.**

## Tarifwahl

In der Reihenfolge, in der es wirklich zählt:

1. **Keine Abschaltung wegen Nichtnutzung.** Das ist die Falle, und sie ist genau
   andersherum als das, was Consumer-Prepaid macht: Eine SIM, die fast nichts verbraucht,
   wird abgeschaltet, weil sie fast nichts verbraucht — oder das Guthaben verfällt. Eine
   Box, die bewusst still ist, darf nicht auf einem Tarif liegen, der Stille bestraft.
2. ~~**SMS ein- und ausgehend enthalten.**~~ Als Kriterium gestrichen (22.08.2026): Die
   Tarife, die ein Privatkunde tatsächlich kaufen kann, kommen nicht verlässlich mit einer
   Nummer, die SMS empfangen kann — deshalb ist auch Bauform B unten geparkt. Zahl nichts
   extra dafür.
3. **Wie abgerechnet wird.** Nach **Session-Rundung** fragen: Ein Tarif, der jede Session
   auf 10 oder 100 kB aufrundet, macht aus einer 350-Byte-Watchdog-Probe eine mit 100 kB
   und zerstört dieses ganze Konzept. Du willst kB-genaue oder gepoolte Abrechnung.
4. **Luft für die Kamera-Gewohnheit, die du tatsächlich haben wirst**, nicht die geplante.
5. **Empfang am Standort.** Vor dem Kauf mit einem Handy in diesem Netz testen, und zwar
   dort, wo die Box stehen wird. Ein Stick, der hart senden muss, verbrennt auch Watt
   ([docs/HARDWARE.de.md](HARDWARE.de.md)); Empfang ist genauso eine Strom- wie eine
   Datenentscheidung.
6. **Nicht nur NB-IoT / LTE-M.** Solche Tarife sehen für eine Sensorbox perfekt aus und
   können weder ein Kamerabild noch eine Tailscale-Sitzung tragen.
7. **CGNAT ist in Ordnung — zahl nicht für eine öffentliche IP.** Genau dafür gibt es
   Tailscale.
8. **EU-Roaming**, falls der Standort im Ausland liegt.

### Die Optionen als Kategorien

**IoT-Lifetime-Kontingente sind für Privatkunden zu.** Das gehört vorweg, bevor man
danach sucht: 1NCE („10 Euro für 10 Jahre", 500 MB plus 250 SMS im Telekom-Netz) und das
o2-Gegenstück *Easy IoT* (11,90 € für zehn Jahre, je nach Region 750–1500 MB) sind
**Geschäftskundenprodukte**. Beide haben genau die richtige Form für diese Box, und beide
verkaufen nicht an Privatpersonen. Wer ohnehin ein Kleingewerbe hat, dem stehen sie offen
— das ist eine Tatsache über die Produkte, kein Ratschlag zur Papierlage.

Für Privatkunden bleiben drei Formen:

**Eine Pay-per-use-IoT-SIM, die man tatsächlich kaufen kann** — Things Mobile behält die
*Form* von 1NCE: keine Grundgebühr, Guthaben ohne Verfall, von Privatpersonen bestellbar.
Der Haken ist der Preis. Abgerechnet wird mit rund 10 ct pro MB, und ein Verbrauch **unter
5 MB im Monat kostet nochmal 10 ct extra pro MB** — eine Box, die bewusst leise ist, wird
also zum schlechtesten Tarif abgerechnet, etwa 20 ct pro MB. Bei 5 MB im Monat sind das
~1 € im Monat, das geht; bei 100 MB sind es 20 €, das geht nicht. Im teltarif-Test kam die
Karte außerdem nur mit HSPA ins Vodafone-Netz statt mit dem beworbenen LTE. Richtige Form,
falscher Preis, mittelmäßiges Netz.

**Normales Consumer-Prepaid, ausgewählt nach der Inaktivitätsregel statt nach dem Preis.**
Die Regel ist die ganze Entscheidung, und die Fristen gehen weit auseinander:

| | Abschaltung nach | Anmerkung |
|---|---|---|
| Telekom Prepaid | **24 Monate** | längste Frist, bestes Netz am abgelegenen Standort |
| congstar (Telekom-Netz) | 15 Monate | günstiger, gleiches Netz |
| Aldi Talk | 4–24 Monate | skaliert mit der Aufladung: 5 € → 4 Monate, 30 € → 2 Jahre |
| Lidl Connect | 6–12 Monate | nach Aufladungshöhe |
| o2 Prepaid | 6 Monate | kurz |
| Vodafone CallYa | **90 Tage** | für eine bewusst stille Box unbrauchbar |

**Die Falle steht im Kleingedruckten, und es ist nicht die, die man vermutet: die meisten
Anbieter zählen eine Aufladung, nicht die Nutzung.** Ein Gateway, das still 5 MB im Monat
verbraucht, kann trotzdem wegen Inaktivität abgeschaltet werden, weil nichts *bezahlt*
wurde. Das Kriterium heißt also nicht „verbraucht sie Daten", sondern „wann muss ich das
nächste Mal Geld draufladen" — und das ist eine Kalendererinnerung, die man nicht verlieren
darf, während die Box auf einer Wiese steht.

**Ein kleiner Monats-Datentarif, monatlich kündbar.** Für etwa drei Euro im Monat gibt es
bei den günstigen SIM-only-Marken ein paar GB. Langweilig, planbar, überhaupt keine
Inaktivitätsregel zu verfolgen, und so viel Luft, dass ein Blick in die Kamera aufhört,
eine Entscheidung zu sein. Auf zehn Jahre gerechnet weit teurer als alles darüber — aber
niemand plant zehn Jahre Feriengrundstück.

### Die Empfehlung

**Erst Empfang, dann Tarif.** An einem abgelegenen Standort entscheidet das Netz, das die
Box tatsächlich erreicht, mehr als der Preis — und ein Stick, der hart senden muss,
verbrennt auch Watt ([docs/HARDWARE.de.md](HARDWARE.de.md)). Vor dem Kauf mit einem Handy
testen, und zwar dort, wo die Box stehen wird.

Auf dieser Grundlage passt **eine Prepaid-Karte im Telekom-Netz — congstar, oder die
Telekom selbst bei knappem Empfang** — am besten auf „Alarme plus der gelegentliche
Blick": gute Reichweite, eine 15- bzw. 24-Monats-Frist, die eine Aufladung im Jahr
erfüllt, und GB-Preise eine Größenordnung unter den Pay-per-use-IoT-SIMs. Das
Aufladedatum am Tag der Installation in den Kalender.

**Nimm stattdessen Things Mobile, wenn du genau dieses Jahresritual vermeiden willst** und
dich auf ein paar MB im Monat beschränken kannst. Es ist das einzige Privatkundenprodukt
mit dem „einmal zahlen und vergessen"-Gefühl, und du bezahlst es ungefähr zehnfach.

**Dann eine Woche messen und neu entscheiden.** Wenn Tailscales Leerlauf-Keepalives sich
als zig Megabyte im Monat herausstellen, hört das billige Ende dieser Liste auf, billig zu
sein — und das Zeitfenster (Setup › Remote access) ist die Antwort, weil es genau diesen
Posten auf null bringt. Der Zähler steckt schon in der Seite; nutz ihn, bevor du Geld
ausgibst.

## Was nicht belegt ist

Die gemessenen Seiten- und API-Werte stammen vom laufenden Gateway. Die Zahlen zu
Watchdog, NTP, Alarm und Kamera sind aus Paketgrößen und Takten gerechnet, nicht auf einer
echten LTE-Strecke aufgezeichnet. Tailscales Leerlaufverbrauch ist überhaupt nicht
gemessen. Nichts davon lief bisher an einem echten Standort.
