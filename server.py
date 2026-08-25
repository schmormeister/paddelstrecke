import json
import sqlite3
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "paddelstrecken.db"
HOST = "127.0.0.1"
PORT = 3000

STATIC_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/gpx-editor.html": "gpx-editor.html",
    "/track-analyse.html": "track-analyse.html",
    "/styles.css": "styles.css",
    "/app.js": "app.js",
}

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".gpx": "application/gpx+xml; charset=utf-8",
}

DEFAULT_WATERS = [
    {"name": "Alster", "country": "Deutschland", "type": "Fluss"},
    {"name": "Steinhuder Meer", "country": "Deutschland", "type": "See"},
]


def get_db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db():
    with get_db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS waters (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                country TEXT NOT NULL,
                type TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS routes (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                distance_km REAL NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                duration TEXT NOT NULL,
                speed TEXT NOT NULL,
                temperature_c REAL,
                water_body TEXT,
                weather TEXT NOT NULL,
                wind TEXT,
                FOREIGN KEY (water_body) REFERENCES waters(id) ON DELETE SET NULL
            );
            """
        )
        route_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(routes)").fetchall()
        }
        if "track_file" not in route_columns:
            connection.execute("ALTER TABLE routes ADD COLUMN track_file TEXT")

        water_count = connection.execute("SELECT COUNT(*) FROM waters").fetchone()[0]
        if water_count == 0:
            connection.executemany(
                "INSERT INTO waters (id, name, country, type) VALUES (?, ?, ?, ?)",
                [
                    (str(uuid.uuid4()), water["name"], water["country"], water["type"])
                    for water in DEFAULT_WATERS
                ],
            )


class PaddleRequestHandler(BaseHTTPRequestHandler):
    server_version = "PaddleServer/1.0"

    def do_HEAD(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            self.send_response(HTTPStatus.METHOD_NOT_ALLOWED)
            self.end_headers()
            return

        filename = STATIC_FILES.get(path)
        if not filename:
            self.send_error(HTTPStatus.NOT_FOUND, "Datei nicht gefunden")
            return

        file_path = BASE_DIR / filename
        if not file_path.exists():
            self.send_error(HTTPStatus.NOT_FOUND, "Datei nicht gefunden")
            return

        content = file_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", CONTENT_TYPES.get(file_path.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/tracks":
            tracks = [
                {
                    "name": track.name,
                    "url": f"/api/tracks/{track.name}",
                }
                for track in sorted((BASE_DIR / "daten").glob("*.gpx"), key=lambda item: item.name.lower())
                if track.is_file()
            ]
            self.send_json(tracks)
            return

        if path.startswith("/api/tracks/"):
            track_path = self.track_path(path.rsplit("/", 1)[-1])
            if not track_path:
                self.send_error(HTTPStatus.NOT_FOUND, "Track nicht gefunden")
                return
            content = track_path.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", CONTENT_TYPES[".gpx"])
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return

        if path == "/api/waters":
            with get_db() as connection:
                rows = connection.execute(
                    "SELECT id, name, country, type FROM waters ORDER BY name COLLATE NOCASE"
                ).fetchall()
            self.send_json([dict(row) for row in rows])
            return

        if path == "/api/routes":
            with get_db() as connection:
                rows = connection.execute(
                    """
                    SELECT id, name, distance_km, start_time, end_time, duration, speed,
                              temperature_c, water_body, weather, wind, track_file
                    FROM routes
                    ORDER BY start_time DESC, name COLLATE NOCASE
                    """
                ).fetchall()
            self.send_json([dict(row) for row in rows])
            return

        self.serve_static(path)

    def do_POST(self):
        self.handle_write("POST")

    def do_PUT(self):
        self.handle_write("PUT")

    def do_DELETE(self):
        self.handle_write("DELETE")

    def serve_static(self, path):
        filename = STATIC_FILES.get(path)
        if not filename:
            self.send_error(HTTPStatus.NOT_FOUND, "Datei nicht gefunden")
            return

        file_path = BASE_DIR / filename
        if not file_path.exists():
            self.send_error(HTTPStatus.NOT_FOUND, "Datei nicht gefunden")
            return

        content = file_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", CONTENT_TYPES.get(file_path.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def handle_write(self, method):
        path = urlparse(self.path).path
        payload = self.read_json_body() if method in {"POST", "PUT"} else None

        try:
            if path == "/api/waters" and method == "POST":
                water = self.create_water(payload)
                self.send_json(water, status=HTTPStatus.CREATED)
                return

            if path.startswith("/api/waters/"):
                water_id = path.rsplit("/", 1)[-1]
                if method == "PUT":
                    self.send_json(self.update_water(water_id, payload))
                    return
                if method == "DELETE":
                    self.delete_water(water_id)
                    self.send_json({"ok": True})
                    return

            if path == "/api/routes" and method == "POST":
                route = self.create_route(payload)
                self.send_json(route, status=HTTPStatus.CREATED)
                return

            if path.startswith("/api/routes/"):
                route_id = path.rsplit("/", 1)[-1]
                if method == "PUT":
                    self.send_json(self.update_route(route_id, payload))
                    return
                if method == "DELETE":
                    self.delete_route(route_id)
                    self.send_json({"ok": True})
                    return

            self.send_json({"error": "API-Endpunkt nicht gefunden"}, status=HTTPStatus.NOT_FOUND)
        except ValueError as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
        except LookupError as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.NOT_FOUND)

    def create_water(self, payload):
        water = {
            "id": str(uuid.uuid4()),
            "name": self.require_text(payload, "name"),
            "country": self.require_text(payload, "country"),
            "type": self.require_text(payload, "type"),
        }

        with get_db() as connection:
            connection.execute(
                "INSERT INTO waters (id, name, country, type) VALUES (?, ?, ?, ?)",
                (water["id"], water["name"], water["country"], water["type"]),
            )

        return water

    def update_water(self, water_id, payload):
        water = {
            "id": water_id,
            "name": self.require_text(payload, "name"),
            "country": self.require_text(payload, "country"),
            "type": self.require_text(payload, "type"),
        }

        with get_db() as connection:
            cursor = connection.execute(
                "UPDATE waters SET name = ?, country = ?, type = ? WHERE id = ?",
                (water["name"], water["country"], water["type"], water["id"]),
            )
            if cursor.rowcount == 0:
                raise LookupError("Gewässer nicht gefunden.")

        return water

    def delete_water(self, water_id):
        with get_db() as connection:
            cursor = connection.execute("DELETE FROM waters WHERE id = ?", (water_id,))
            if cursor.rowcount == 0:
                raise LookupError("Gewässer nicht gefunden.")

    def create_route(self, payload):
        route = self.validate_route_payload(payload)
        route["id"] = str(uuid.uuid4())

        with get_db() as connection:
            connection.execute(
                """
                INSERT INTO routes (
                    id, name, distance_km, start_time, end_time, duration, speed,
                    temperature_c, water_body, weather, wind, track_file
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    route["id"],
                    route["name"],
                    route["distance_km"],
                    route["start_time"],
                    route["end_time"],
                    route["duration"],
                    route["speed"],
                    route["temperature_c"],
                    route["water_body"],
                    route["weather"],
                    route["wind"],
                    route["track_file"],
                ),
            )

        return route

    def update_route(self, route_id, payload):
        route = self.validate_route_payload(payload)
        route["id"] = route_id

        with get_db() as connection:
            cursor = connection.execute(
                """
                UPDATE routes
                SET name = ?, distance_km = ?, start_time = ?, end_time = ?, duration = ?,
                    speed = ?, temperature_c = ?, water_body = ?, weather = ?, wind = ?
                    , track_file = ?
                WHERE id = ?
                """,
                (
                    route["name"],
                    route["distance_km"],
                    route["start_time"],
                    route["end_time"],
                    route["duration"],
                    route["speed"],
                    route["temperature_c"],
                    route["water_body"],
                    route["weather"],
                    route["wind"],
                    route["track_file"],
                    route["id"],
                ),
            )
            if cursor.rowcount == 0:
                raise LookupError("Strecke nicht gefunden.")

        return route

    def delete_route(self, route_id):
        with get_db() as connection:
            cursor = connection.execute("DELETE FROM routes WHERE id = ?", (route_id,))
            if cursor.rowcount == 0:
                raise LookupError("Strecke nicht gefunden.")

    def validate_route_payload(self, payload):
        route = {
            "name": self.require_text(payload, "name"),
            "distance_km": round(self.require_float(payload, "distance_km"), 1),
            "start_time": self.require_text(payload, "start_time"),
            "end_time": self.require_text(payload, "end_time"),
            "duration": self.require_text(payload, "duration"),
            "speed": self.require_text(payload, "speed"),
            "water_body": self.require_text(payload, "water_body"),
            "weather": self.require_text(payload, "weather"),
            "wind": str(payload.get("wind") or "").strip(),
            "track_file": str(payload.get("track_file") or "").strip() or None,
        }

        if route["track_file"] and (not self.track_path(route["track_file"])):
            raise ValueError("Der ausgewählte Track existiert nicht.")

        temperature = payload.get("temperature_c")
        route["temperature_c"] = float(temperature) if temperature not in (None, "", "null") else None

        with get_db() as connection:
            exists = connection.execute(
                "SELECT 1 FROM waters WHERE id = ?",
                (route["water_body"],),
            ).fetchone()

        if not exists:
            raise ValueError("Das ausgewählte Gewässer existiert nicht.")

        return route

    def track_path(self, file_name):
        file_name = unquote(file_name)
        if not file_name or Path(file_name).name != file_name or Path(file_name).suffix.lower() != ".gpx":
            return None
        track_path = BASE_DIR / "daten" / file_name
        return track_path if track_path.is_file() else None

    def require_text(self, payload, key):
        value = payload.get(key)
        if value is None:
            raise ValueError(f"Feld '{key}' fehlt.")
        text = str(value).strip()
        if not text:
            raise ValueError(f"Feld '{key}' darf nicht leer sein.")
        return text

    def require_float(self, payload, key):
        value = payload.get(key)
        try:
            number = float(value)
        except (TypeError, ValueError):
            raise ValueError(f"Feld '{key}' muss eine Zahl sein.") from None
        if number <= 0:
            raise ValueError(f"Feld '{key}' muss größer als 0 sein.")
        return number

    def read_json_body(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            return json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as error:
            raise ValueError("Ungültiger JSON-Body.") from error

    def send_json(self, payload, status=HTTPStatus.OK):
        content = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), PaddleRequestHandler)
    print(f"Server läuft auf http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
