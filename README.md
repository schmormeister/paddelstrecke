# Paddelstrecken Webapp

Lokale Webanwendung zur Erfassung von Paddelstrecken mit:

- Streckenverwaltung
- Gewässerverwaltung
- Berechnung von Zeit und Geschwindigkeit
- Import von GPX-Tracks aus dem Verzeichnis `daten/`
- Automatische Ermittlung von Startzeit, Endzeit, Distanz, Dauer und Geschwindigkeit aus einem Track
- Verknüpfung gespeicherter Strecken mit ihrer GPX-Datei
- OpenStreetMap-Karte zur ausgewählten Strecke
- Anzeige des passenden Trackpunkts auf der Karte beim Überfahren eines Chart-Punkts
- Speicherung in SQLite

## Voraussetzungen

- `python3`

Es werden keine zusätzlichen Python-Pakete benötigt. Der Server nutzt nur die Python-Standardbibliothek sowie `sqlite3`.

## Server starten

Im Projektverzeichnis:

```bash
python3 server.py
```

Danach ist die Anwendung erreichbar unter:

- Website: `http://localhost:3000`
- alternativ: `http://127.0.0.1:3000`

Zum Beenden:

```bash
Ctrl + C
```

## Website-Routen

Diese Routen liefert der lokale Webserver für das Frontend aus:

- `GET /`
  Startseite der Anwendung
- `GET /index.html`
  HTML-Datei der Anwendung
- `GET /gpx-editor.html`
  GPX-Zeit-Editor zum lokalen Entfernen von Trackpunkt-Zeiträumen
- `GET /track-analyse.html`
  Track-Analyse mit Karte, Geschwindigkeitschart und Kennzahlen. Ein gespeicherter Track kann über `?track=DATEINAME.gpx` direkt geöffnet werden.
- `GET /styles.css`
  Stylesheet
- `GET /app.js`
  Frontend-Logik

## API-Endpunkte

## Strecken erfassen

Beim Anlegen einer Strecke stehen zwei Erfassungsarten zur Verfügung:

- **Manuell:** Distanz, Startzeit und Endzeit werden eingegeben. Dauer und Geschwindigkeit werden automatisch berechnet.
- **Track:** Eine `.gpx`-Datei aus `daten/` wird ausgewählt. Startzeit, Endzeit, Distanz, Dauer und Geschwindigkeit werden aus den Trackpunkten übernommen.

Nach dem Speichern zeigt die Historie bei Track-Strecken einen Link zur Track-Analyse. Dort kann beim Überfahren eines Geschwindigkeitspunkts der zugehörige Punkt auf der Karte angezeigt werden.

### Gewässer

- `GET /api/waters`
  Liefert alle Gewässer

  Beispiel:
  ```bash
  curl http://127.0.0.1:3000/api/waters
  ```

- `POST /api/waters`
  Legt ein neues Gewässer an

  Beispiel:
  ```bash
  curl -X POST http://127.0.0.1:3000/api/waters \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Alster",
      "country": "Deutschland",
      "type": "Fluss"
    }'
  ```

  Beispiel-Body:
  ```json
  {
    "name": "Alster",
    "country": "Deutschland",
    "type": "Fluss"
  }
  ```

- `PUT /api/waters/:id`
  Aktualisiert ein vorhandenes Gewässer

  Beispiel:
  ```bash
  curl -X PUT http://127.0.0.1:3000/api/waters/WATER_ID \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Alster",
      "country": "Deutschland",
      "type": "Fluss"
    }'
  ```

  Beispiel-Body:
  ```json
  {
    "name": "Alster",
    "country": "Deutschland",
    "type": "Fluss"
  }
  ```

- `DELETE /api/waters/:id`
  Löscht ein Gewässer

  Beispiel:
  ```bash
  curl -X DELETE http://127.0.0.1:3000/api/waters/WATER_ID
  ```

### Strecken

- `GET /api/tracks`
  Liefert die verfügbaren GPX-Dateien aus `daten/`.

  Beispiel:
  ```bash
  curl http://127.0.0.1:3000/api/tracks
  ```

- `GET /api/tracks/:filename`
  Liefert eine einzelne GPX-Datei aus `daten/`.

  Beispiel:
  ```bash
  curl http://127.0.0.1:3000/api/tracks/TRK3-bearbeitet.gpx
  ```

- `GET /api/routes`
  Liefert alle Strecken

  Beispiel:
  ```bash
  curl http://127.0.0.1:3000/api/routes
  ```

- `POST /api/routes`
  Legt eine neue Strecke an

  Beispiel:
  ```bash
  curl -X POST http://127.0.0.1:3000/api/routes \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Morgentour",
      "distance_km": "12.5",
      "start_time": "2026-04-18T08:00",
      "end_time": "2026-04-18T10:30",
      "duration": "02:30 h",
      "speed": "5.00 km/h",
      "temperature_c": "14.0",
      "water_body": "WATER_ID",
      "weather": "Sonne",
      "wind": "8 km/h",
      "track_file": "TRK3-bearbeitet.gpx"
    }'
  ```

  Beispiel-Body:
  ```json
  {
    "name": "Morgentour",
    "distance_km": "12.5",
    "start_time": "2026-04-18T08:00",
    "end_time": "2026-04-18T10:30",
    "duration": "02:30 h",
    "speed": "5.00 km/h",
    "temperature_c": "14.0",
    "water_body": "WATER_ID",
    "weather": "Sonne",
    "wind": "8 km/h",
    "track_file": "TRK3-bearbeitet.gpx"
  }
  ```

- `PUT /api/routes/:id`
  Aktualisiert eine vorhandene Strecke

  Beispiel:
  ```bash
  curl -X PUT http://127.0.0.1:3000/api/routes/ROUTE_ID \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Morgentour",
      "distance_km": "12.5",
      "start_time": "2026-04-18T08:00",
      "end_time": "2026-04-18T10:30",
      "duration": "02:30 h",
      "speed": "5.00 km/h",
      "temperature_c": "14.0",
      "water_body": "WATER_ID",
      "weather": "Sonne",
      "wind": "8 km/h"
    }'
  ```

  Beispiel-Body:
  ```json
  {
    "name": "Morgentour",
    "distance_km": "12.5",
    "start_time": "2026-04-18T08:00",
    "end_time": "2026-04-18T10:30",
    "duration": "02:30 h",
    "speed": "5.00 km/h",
    "temperature_c": "14.0",
    "water_body": "WATER_ID",
    "weather": "Sonne",
    "wind": "8 km/h"
  }
  ```

- `DELETE /api/routes/:id`
  Löscht eine Strecke

  Beispiel:
  ```bash
  curl -X DELETE http://127.0.0.1:3000/api/routes/ROUTE_ID
  ```

## Datenbank

Die Anwendung speichert ihre Daten in:

- [paddelstrecken.db](paddelstrecken.db)

Beim ersten Start werden automatisch diese Tabellen angelegt:

- `waters`
- `routes`

Die Tabelle `routes` enthält zusätzlich die optionale Spalte `track_file`. Sie speichert den Namen der verknüpften GPX-Datei aus `daten/`.

Außerdem werden Standard-Gewässer angelegt, wenn die Tabelle leer ist:

- `Alster`
- `Steinhuder Meer`

## Dateistruktur

```text
projektverzeichnis/
├── app.js
├── daten/
│   └── TRK3-bearbeitet.gpx
├── gpx-editor.html
├── index.html
├── LICENSE
├── paddelstrecken.db
├── README.md
├── server.py
├── styles.css
└── track-analyse.html
```

## Dateibeschreibung

- [server.py](server.py)
  Lokaler HTTP-Server, statische Auslieferung, API und SQLite-Zugriffe

- [index.html](index.html)
  HTML-Struktur der Weboberfläche

- [styles.css](styles.css)
  Layout und Design

- [app.js](app.js)
  Frontend-Logik für Formulare, Filter, API-Aufrufe und Karte

- [gpx-editor.html](gpx-editor.html)
  Lokaler Editor zum Entfernen von Zeitbereichen aus GPX-Dateien

- [track-analyse.html](track-analyse.html)
  Analyse von GPX-Tracks mit Karte, Kennzahlen und Geschwindigkeitschart

- [daten/](daten/)
  GPX-Dateien, die in der Streckenerfassung ausgewählt werden können

- [paddelstrecken.db](paddelstrecken.db)
  SQLite-Datenbankdatei

## Hinweise

- Die Karte basiert auf `Leaflet` und `OpenStreetMap`.
- Die Positionssuche für Gewässer erfolgt über `Nominatim`.
- `track_file` ist optional. Ohne dieses Feld wird die Strecke manuell erfasst.
- GPX-Zeitstempel werden in der Track-Analyse als UTC angezeigt.
- Neue GPX-Dateien müssen als `.gpx` in `daten/` abgelegt werden. Der Server erkennt sie beim nächsten Laden der Startseite.
