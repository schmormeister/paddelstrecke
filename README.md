# Paddelstrecken Webapp

Lokale Webanwendung zur Erfassung von Paddelstrecken mit:

- Streckenverwaltung
- Gewässerverwaltung
- Berechnung von Zeit und Geschwindigkeit
- OpenStreetMap-Karte zur ausgewählten Strecke
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
  Track-Analyse mit Karte, Geschwindigkeitschart und Kennzahlen
- `GET /styles.css`
  Stylesheet
- `GET /app.js`
  Frontend-Logik

## API-Endpunkte

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

- [paddelstrecken.db](../yourDir/ki-test/paddelstrecken.db)

Beim ersten Start werden automatisch diese Tabellen angelegt:

- `waters`
- `routes`

Außerdem werden Standard-Gewässer angelegt, wenn die Tabelle leer ist:

- `Alster`
- `Steinhuder Meer`

## Dateistruktur

```text
ki-test/
├── app.js
├── index.html
├── paddelstrecken.db
├── README.md
├── server.py
└── styles.css
```

## Dateibeschreibung

- [server.py](../yourDir/ki-test/server.py)
  Lokaler HTTP-Server, statische Auslieferung, API und SQLite-Zugriffe

- [index.html](../yourDir/ki-test/index.html)
  HTML-Struktur der Weboberfläche

- [styles.css](../yourDir/ki-test/styles.css)
  Layout und Design

- [app.js](../yourDir/ki-test/app.js)
  Frontend-Logik für Formulare, Filter, API-Aufrufe und Karte

- [paddelstrecken.db](../yourDir/ki-test/paddelstrecken.db)
  SQLite-Datenbankdatei

## Hinweise

- Die Karte basiert auf `Leaflet` und `OpenStreetMap`.
- Die Positionssuche für Gewässer erfolgt über `Nominatim`.
- Zeit und Geschwindigkeit werden im Frontend berechnet und dann über die API gespeichert.
