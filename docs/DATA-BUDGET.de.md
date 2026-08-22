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

**B — Geweckt per SMS (nicht implementiert; das, was den Gedanken zu Ende bringt).**
Standby wie bei C, aber statt bis Sonntag zu warten, schickst du der SIM eine SMS: das
Gateway liest sie am Modem aus (`mmcli` oder die HiLink-SMS-API — SMS läuft über den
Signalisierungskanal und kostet kein Datenvolumen) und öffnet den Tunnel für eine
festgelegte Zahl Minuten. Damit wird aus „einmal die Woche live" ein „live, wann immer du
fragst", ohne Standby-Kosten.

Es braucht Sorgfalt, weil man sich damit eine Box bauen kann, die man nicht mehr erreicht:
eine Absender-Whitelist plus ein Secret im Nachrichtentext, damit keine falsche Nummer den
Tunnel öffnet — und das Fenster aus C darunter, damit ein still kaputter Weckpfad ein paar
Tage kostet statt einer Fahrt zum Standort.

**C wird ausgeliefert, B ist der nächste Schritt**; das Fenster ist bereits der Fallback,
den B brauchen wird.

## Tarifwahl

In der Reihenfolge, in der es wirklich zählt:

1. **Keine Abschaltung wegen Nichtnutzung.** Das ist die Falle, und sie ist genau
   andersherum als das, was Consumer-Prepaid macht: Eine SIM, die fast nichts verbraucht,
   wird abgeschaltet, weil sie fast nichts verbraucht — oder das Guthaben verfällt. Eine
   Box, die bewusst still ist, darf nicht auf einem Tarif liegen, der Stille bestraft.
2. **SMS ein- und ausgehend enthalten.** Ohne das ist Bauform B unmöglich. Nebenbei ein
   brauchbarer Notkanal „lebst du noch?", wenn Daten nicht gehen.
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

**IoT-Lifetime-Kontingent** (1NCE und Ähnliche: ein paar hundert MB plus SMS, ~10 Jahre
gültig, einmalig bezahlt, keine Monatsgebühr). Genau dafür gebaut: keine
Nichtnutzungsfalle, SMS dabei, nichts zum Nachladen. 500 MB auf zehn Jahre sind im Mittel
~4 MB im Monat — bequem für Alarme, einen Watchdog in vernünftigem Takt und das
gelegentliche Standbild; **nicht** genug für Livevideo oder die Gewohnheit, die Seite
offen zu lassen. Der stärkste Treffer auf die Anforderung, wie sie formuliert ist.

**Consumer-Prepaid** (Supermarktmarken und Verwandte). Am billigsten pro Gigabyte und hier
am schlechtesten: Guthaben verfällt, inaktive SIMs werden abgeschaltet, und du erbst ein
Jahresritual, das du nicht vergessen darfst, während die Box auf einer Wiese steht.

**M2M-/IoT-Vertrag beim Betreiber.** Kleine Monatsgebühr, MB-genaue oder gepoolte
Abrechnung, SMS verfügbar, keine Abschaltung wegen Stille, Verwaltungsportal. Die richtige
Antwort, wenn das Draufschalten zur Routine wird statt Ausnahme zu bleiben. Ausdrücklich
nach Rundung und nach SMS fragen.

**Ein normaler Handytarif in der Box.** Überdimensioniert und zu teuer für Standby — aber
die ehrliche Wahl, wenn du wirklich Livevideo schauen wirst.

### Die Empfehlung

**Mit einem IoT-Lifetime-Kontingent inklusive SMS anfangen.** Es passt auf die Anforderung
(Alarme, seltene Blicke), es kann nicht wegen Nichtnutzung sterben, und es ist der Tarif,
der die SMS-Weckvariante B später überhaupt möglich macht. Dazu: Watchdog auf 15–30
Minuten, `apt`-Timer aus, Standbilder statt Livevideo.

**Dann eine Woche messen und neu entscheiden.** Wenn Tailscales Leerlauf-Keepalives sich
als zig Megabyte im Monat herausstellen, hält dieses Kontingent in Bauform A keine zehn
Jahre — und genau diese Zahl sagt dir, ob sich Bauform B lohnt oder ob du einfach ein
Monatskontingent kaufst. Der Zähler steckt schon in der Seite; nutz ihn, bevor du Geld
ausgibst.

## Was nicht belegt ist

Die gemessenen Seiten- und API-Werte stammen vom laufenden Gateway. Die Zahlen zu
Watchdog, NTP, Alarm und Kamera sind aus Paketgrößen und Takten gerechnet, nicht auf einer
echten LTE-Strecke aufgezeichnet. Tailscales Leerlaufverbrauch ist überhaupt nicht
gemessen. Nichts davon lief bisher an einem echten Standort.
