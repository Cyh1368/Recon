from __future__ import annotations

import base64
import datetime as dt
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import ssl
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

try:
    import requests
except ImportError:  # pragma: no cover - exercised only on minimal installs
    requests = None


ROOT = Path(__file__).resolve().parent


def load_env_file() -> None:
    try:
        from dotenv import load_dotenv

        load_dotenv(ROOT / ".env")
        return
    except ImportError:
        pass

    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file()

HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))
SSL_CERT_FILE = os.getenv("SSL_CERT_FILE", "")
SSL_KEY_FILE = os.getenv("SSL_KEY_FILE", "")
DB_PATH = Path(os.getenv("RECON_DB_PATH", str(ROOT / "data" / "recon.sqlite3")))
if not DB_PATH.is_absolute():
    DB_PATH = ROOT / DB_PATH
MEDIA_DIR = Path(os.getenv("RECON_MEDIA_DIR", str(ROOT / "media")))
if not MEDIA_DIR.is_absolute():
    MEDIA_DIR = ROOT / MEDIA_DIR
AUDIO_DIR = MEDIA_DIR / "audio"
MAX_UPLOAD_BYTES = int(float(os.getenv("RECON_MAX_UPLOAD_MB", "25")) * 1024 * 1024)

APOLLO_BASE_URL = os.getenv("APOLLO_BASE_URL", "https://api.apollo.io/api/v1").rstrip("/")
APOLLO_API_KEY = os.getenv("APOLLO_API_KEY", "")
APOLLO_SEARCH_PER_PAGE = max(1, min(int(os.getenv("APOLLO_SEARCH_PER_PAGE", "10")), 25))
APOLLO_REQUEST_TIMEOUT = float(os.getenv("APOLLO_REQUEST_TIMEOUT", "45"))
APOLLO_RUN_WATERFALL_EMAIL = os.getenv("APOLLO_RUN_WATERFALL_EMAIL", "false").lower() == "true"

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_TRANSCRIPTION_URL = os.getenv(
    "OPENAI_TRANSCRIPTION_URL", "https://api.openai.com/v1/audio/transcriptions"
)
OPENAI_TRANSCRIPTION_MODEL = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "whisper-1")
OPENAI_TRANSCRIPTION_LANGUAGE = os.getenv("OPENAI_TRANSCRIPTION_LANGUAGE", "")

STATIC_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
}
MEDIA_TYPES = {
    ".webm": "audio/webm",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
}
STATIC_ROUTES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/styles.css": "styles.css",
    "/app.js": "app.js",
}
EVENT_COLORS = [
    "#47c2b1",
    "#f2c94c",
    "#ff6b6b",
    "#5aa9e6",
    "#b892ff",
    "#7bd88f",
    "#ffb86b",
    "#f06aa6",
]


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def today_local() -> str:
    return dt.date.today().isoformat()


def ensure_storage() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)


def resolve_optional_path(value: str) -> Path | None:
    if not value:
        return None
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


def connect() -> sqlite3.Connection:
    ensure_storage()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                event_date TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT '#47c2b1',
                position INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS people (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                met_date TEXT NOT NULL,
                email TEXT NOT NULL DEFAULT '',
                linkedin TEXT NOT NULL DEFAULT '',
                instagram TEXT NOT NULL DEFAULT '',
                discord TEXT NOT NULL DEFAULT '',
                phone TEXT NOT NULL DEFAULT '',
                audio_filename TEXT,
                audio_mime TEXT,
                transcript TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS person_events (
                person_id TEXT NOT NULL,
                event_id TEXT NOT NULL,
                PRIMARY KEY (person_id, event_id),
                FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
                FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
            );
            """
        )
        ensure_event_columns(conn)
        ensure_person_columns(conn)


def ensure_event_columns(conn: sqlite3.Connection) -> None:
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(events)").fetchall()}
    if "event_date" not in columns:
        conn.execute("ALTER TABLE events ADD COLUMN event_date TEXT NOT NULL DEFAULT ''")
    if "position" not in columns:
        conn.execute("ALTER TABLE events ADD COLUMN position INTEGER NOT NULL DEFAULT 0")
    if "color" not in columns:
        conn.execute("ALTER TABLE events ADD COLUMN color TEXT NOT NULL DEFAULT ''")
    conn.execute(
        """
        UPDATE events
        SET event_date = CASE
            WHEN created_at LIKE '____-__-__%' THEN substr(created_at, 1, 10)
            ELSE ?
        END
        WHERE event_date = ''
        """,
        (today_local(),),
    )
    positioned = conn.execute("SELECT COUNT(*) AS count FROM events WHERE position != 0").fetchone()["count"]
    if positioned == 0:
        rows = conn.execute("SELECT id FROM events ORDER BY event_date DESC, created_at, lower(name)").fetchall()
        conn.executemany(
            "UPDATE events SET position = ? WHERE id = ?",
            [(index + 1, row["id"]) for index, row in enumerate(rows)],
        )
    rows = conn.execute("SELECT id FROM events WHERE color = '' OR color IS NULL ORDER BY position").fetchall()
    conn.executemany(
        "UPDATE events SET color = ? WHERE id = ?",
        [(EVENT_COLORS[index % len(EVENT_COLORS)], row["id"]) for index, row in enumerate(rows)],
    )


def ensure_person_columns(conn: sqlite3.Connection) -> None:
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(people)").fetchall()}
    if "discord" not in columns:
        conn.execute("ALTER TABLE people ADD COLUMN discord TEXT NOT NULL DEFAULT ''")
    if "phone" not in columns:
        conn.execute("ALTER TABLE people ADD COLUMN phone TEXT NOT NULL DEFAULT ''")


def clean_text(value: Any, limit: int | None = None) -> str:
    text = "" if value is None else str(value).strip()
    if limit is not None:
        return text[:limit]
    return text


def clean_date(value: Any) -> str:
    text = clean_text(value)
    if not text:
        return today_local()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        raise ValueError("Date must use YYYY-MM-DD format.")
    return text


def clean_color(value: Any) -> str:
    text = clean_text(value)
    if not text:
        return secrets.choice(EVENT_COLORS)
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", text):
        raise ValueError("Color must use #RRGGBB format.")
    return text.lower()


def normalize_url(value: Any, kind: str) -> str:
    text = clean_text(value, 500)
    if not text:
        return ""
    if kind == "email":
        return text
    if kind == "instagram" and not text.startswith(("http://", "https://")):
        handle = text.lstrip("@")
        return f"https://instagram.com/{handle}"
    if kind == "linkedin" and not text.startswith(("http://", "https://")):
        handle = text.removeprefix("linkedin.com/").removeprefix("www.linkedin.com/").lstrip("/")
        if not handle.startswith(("in/", "company/", "pub/", "school/")):
            handle = f"in/{handle}"
        return f"https://www.linkedin.com/{handle}"
    return text


def domain_from_url(value: Any) -> str:
    text = clean_text(value, 300)
    if not text:
        return ""
    if "://" not in text:
        text = f"https://{text}"
    parsed = urlparse(text)
    host = parsed.netloc or parsed.path
    return host.removeprefix("www.").split("/")[0]


def event_payload(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "event_date": row["event_date"],
        "color": row["color"],
        "position": row["position"],
        "created_at": row["created_at"],
        "people_count": row["people_count"] if "people_count" in row.keys() else 0,
    }


def fetch_events_for_person(conn: sqlite3.Connection, person_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT e.id, e.name, e.event_date, e.color, e.position, e.created_at, 0 AS people_count
        FROM events e
        JOIN person_events pe ON pe.event_id = e.id
        WHERE pe.person_id = ?
        ORDER BY e.position, e.event_date DESC, lower(e.name)
        """,
        (person_id,),
    ).fetchall()
    return [event_payload(row) for row in rows]


def person_payload(conn: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
    audio_filename = row["audio_filename"]
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "met_date": row["met_date"],
        "email": row["email"],
        "linkedin": row["linkedin"],
        "instagram": row["instagram"],
        "discord": row["discord"],
        "phone": row["phone"],
        "audio_url": f"/media/audio/{audio_filename}" if audio_filename else "",
        "audio_mime": row["audio_mime"] or "",
        "transcript": row["transcript"],
        "events": fetch_events_for_person(conn, row["id"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def list_people() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute("SELECT * FROM people ORDER BY met_date DESC, created_at DESC").fetchall()
        return [person_payload(conn, row) for row in rows]


def get_person(person_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM people WHERE id = ?", (person_id,)).fetchone()
        return person_payload(conn, row) if row else None


def list_events() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT e.id, e.name, e.event_date, e.color, e.position, e.created_at, COUNT(pe.person_id) AS people_count
            FROM events e
            LEFT JOIN person_events pe ON pe.event_id = e.id
            GROUP BY e.id
            ORDER BY e.position, e.event_date DESC, lower(e.name)
            """
        ).fetchall()
        return [event_payload(row) for row in rows]


def next_event_position(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT COALESCE(MAX(position), 0) + 1 AS position FROM events").fetchone()
    return int(row["position"])


def set_person_events(conn: sqlite3.Connection, person_id: str, event_ids: list[Any]) -> None:
    valid_ids = [clean_text(event_id, 80) for event_id in event_ids if clean_text(event_id, 80)]
    if valid_ids:
        placeholders = ",".join("?" for _ in valid_ids)
        rows = conn.execute(f"SELECT id FROM events WHERE id IN ({placeholders})", valid_ids).fetchall()
        valid_ids = [row["id"] for row in rows]
    conn.execute("DELETE FROM person_events WHERE person_id = ?", (person_id,))
    conn.executemany(
        "INSERT OR IGNORE INTO person_events (person_id, event_id) VALUES (?, ?)",
        [(person_id, event_id) for event_id in valid_ids],
    )


def audio_extension(mime_type: str) -> str:
    return {
        "audio/webm": ".webm",
        "audio/mp4": ".m4a",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/ogg": ".ogg",
    }.get(mime_type.split(";")[0].lower(), ".webm")


def store_audio(audio: dict[str, Any] | None, person_id: str) -> tuple[str | None, str | None]:
    if not audio:
        return None, None
    data_url = clean_text(audio.get("data_url"))
    if not data_url:
        return None, None
    match = re.fullmatch(r"data:([^;,]+)(?:;[^,]*)?;base64,(.*)", data_url, re.DOTALL)
    if not match:
        raise ValueError("Audio must be a base64 data URL.")
    mime_type = clean_text(audio.get("mime_type")) or match.group(1)
    raw = base64.b64decode(match.group(2), validate=True)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ValueError("Audio upload is larger than RECON_MAX_UPLOAD_MB.")
    filename = f"{person_id}-{uuid.uuid4().hex}{audio_extension(mime_type)}"
    (AUDIO_DIR / filename).write_bytes(raw)
    return filename, mime_type


def create_person(payload: dict[str, Any]) -> dict[str, Any]:
    name = clean_text(payload.get("name"), 160)
    if not name:
        raise ValueError("Name is required.")
    person_id = str(uuid.uuid4())
    audio_filename, audio_mime = store_audio(payload.get("audio"), person_id)
    now = utc_now()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO people (
                id, name, description, met_date, email, linkedin, instagram, discord, phone,
                audio_filename, audio_mime, transcript, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                person_id,
                name,
                clean_text(payload.get("description"), 12000),
                clean_date(payload.get("met_date")),
                normalize_url(payload.get("email"), "email"),
                normalize_url(payload.get("linkedin"), "linkedin"),
                normalize_url(payload.get("instagram"), "instagram"),
                clean_text(payload.get("discord"), 500),
                clean_text(payload.get("phone"), 80),
                audio_filename,
                audio_mime,
                clean_text(payload.get("transcript"), 12000),
                now,
                now,
            ),
        )
        set_person_events(conn, person_id, payload.get("event_ids") or [])
        row = conn.execute("SELECT * FROM people WHERE id = ?", (person_id,)).fetchone()
        return person_payload(conn, row)


def update_person(person_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    field_map = {
        "name": lambda value: clean_text(value, 160),
        "description": lambda value: clean_text(value, 12000),
        "met_date": clean_date,
        "email": lambda value: normalize_url(value, "email"),
        "linkedin": lambda value: normalize_url(value, "linkedin"),
        "instagram": lambda value: normalize_url(value, "instagram"),
        "discord": lambda value: clean_text(value, 500),
        "phone": lambda value: clean_text(value, 80),
        "transcript": lambda value: clean_text(value, 12000),
    }
    updates: list[str] = []
    values: list[Any] = []
    for key, normalizer in field_map.items():
        if key not in payload:
            continue
        value = normalizer(payload[key])
        if key == "name" and not value:
            raise ValueError("Name is required.")
        updates.append(f"{key} = ?")
        values.append(value)
    updates.append("updated_at = ?")
    values.append(utc_now())

    old_audio_filename = None
    with connect() as conn:
        row = conn.execute("SELECT * FROM people WHERE id = ?", (person_id,)).fetchone()
        if not row:
            raise KeyError("Person not found.")
        if "audio" in payload:
            audio_filename, audio_mime = store_audio(payload.get("audio"), person_id)
            if audio_filename:
                old_audio_filename = row["audio_filename"]
                updates.extend(["audio_filename = ?", "audio_mime = ?"])
                values.extend([audio_filename, audio_mime])
        values.append(person_id)
        conn.execute(f"UPDATE people SET {', '.join(updates)} WHERE id = ?", values)
        if "event_ids" in payload:
            set_person_events(conn, person_id, payload.get("event_ids") or [])
        row = conn.execute("SELECT * FROM people WHERE id = ?", (person_id,)).fetchone()
        person = person_payload(conn, row)
    if old_audio_filename:
        try:
            (AUDIO_DIR / old_audio_filename).unlink()
        except FileNotFoundError:
            pass
    return person


def delete_person(person_id: str) -> None:
    with connect() as conn:
        row = conn.execute("SELECT audio_filename FROM people WHERE id = ?", (person_id,)).fetchone()
        if not row:
            raise KeyError("Person not found.")
        conn.execute("DELETE FROM people WHERE id = ?", (person_id,))
    if row["audio_filename"]:
        try:
            (AUDIO_DIR / row["audio_filename"]).unlink()
        except FileNotFoundError:
            pass


def create_event(payload: dict[str, Any]) -> dict[str, Any]:
    name = clean_text(payload.get("name"), 120)
    if not name:
        raise ValueError("Event name is required.")
    event_id = str(uuid.uuid4())
    with connect() as conn:
        try:
            conn.execute(
                "INSERT INTO events (id, name, event_date, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    event_id,
                    name,
                    clean_date(payload.get("event_date")),
                    clean_color(payload.get("color")),
                    next_event_position(conn),
                    utc_now(),
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise ValueError("Event already exists.") from exc
        row = conn.execute(
            "SELECT id, name, event_date, color, position, created_at, 0 AS people_count FROM events WHERE id = ?",
            (event_id,),
        ).fetchone()
        return event_payload(row)


def update_event(event_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    field_map = {
        "name": lambda value: clean_text(value, 120),
        "event_date": clean_date,
        "color": clean_color,
    }
    updates: list[str] = []
    values: list[Any] = []
    for key, normalizer in field_map.items():
        if key not in payload:
            continue
        value = normalizer(payload[key])
        if key == "name" and not value:
            raise ValueError("Event name is required.")
        updates.append(f"{key} = ?")
        values.append(value)
    if not updates:
        raise ValueError("No event fields to update.")
    values.append(event_id)
    with connect() as conn:
        try:
            result = conn.execute(f"UPDATE events SET {', '.join(updates)} WHERE id = ?", values)
        except sqlite3.IntegrityError as exc:
            raise ValueError("Event already exists.") from exc
        if result.rowcount == 0:
            raise KeyError("Event not found.")
        row = conn.execute(
            """
            SELECT e.id, e.name, e.event_date, e.color, e.position, e.created_at, COUNT(pe.person_id) AS people_count
            FROM events e
            LEFT JOIN person_events pe ON pe.event_id = e.id
            WHERE e.id = ?
            GROUP BY e.id
            """,
            (event_id,),
        ).fetchone()
        return event_payload(row)


def reorder_events(event_ids: list[Any]) -> list[dict[str, Any]]:
    ids = [clean_text(event_id, 80) for event_id in event_ids if clean_text(event_id, 80)]
    if not ids:
        raise ValueError("Event order is required.")
    with connect() as conn:
        rows = conn.execute("SELECT id FROM events ORDER BY position, event_date DESC, lower(name)").fetchall()
        known = [row["id"] for row in rows]
        known_set = set(known)
        ordered = [event_id for event_id in ids if event_id in known_set]
        ordered.extend(event_id for event_id in known if event_id not in set(ordered))
        conn.executemany(
            "UPDATE events SET position = ? WHERE id = ?",
            [(index + 1, event_id) for index, event_id in enumerate(ordered)],
        )
    return list_events()


def delete_event(event_id: str) -> None:
    with connect() as conn:
        result = conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
        if result.rowcount == 0:
            raise KeyError("Event not found.")


def request_json(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("Content-Length", "0"))
    if length > MAX_UPLOAD_BYTES + 1024 * 1024:
        raise OverflowError("Request body is too large.")
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Expected a JSON object.")
    return data


def require_requests() -> Any:
    if requests is None:
        raise RuntimeError("The requests package is required for external API calls. Run pip install -r requirements.txt.")
    return requests


def apollo_headers() -> dict[str, str]:
    if not APOLLO_API_KEY:
        raise RuntimeError("APOLLO_API_KEY is not set.")
    return {
        "Cache-Control": "no-cache",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "x-api-key": APOLLO_API_KEY,
    }


def apollo_post(path: str, params: dict[str, Any]) -> dict[str, Any]:
    http = require_requests()
    response = http.post(
        f"{APOLLO_BASE_URL}{path}",
        headers=apollo_headers(),
        params=params,
        timeout=APOLLO_REQUEST_TIMEOUT,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Apollo request failed: {response.status_code} {response.text[:300]}")
    return response.json()


def flatten_person_name(person: dict[str, Any]) -> str:
    full = clean_text(person.get("name"))
    if full:
        return full
    parts = [
        clean_text(person.get("first_name")),
        clean_text(person.get("last_name") or person.get("last_name_obfuscated")),
    ]
    return " ".join(part for part in parts if part)


def organization_from_person(person: dict[str, Any]) -> dict[str, Any]:
    org = person.get("organization") or person.get("account") or {}
    return org if isinstance(org, dict) else {}


def normalize_apollo_candidate(person: dict[str, Any]) -> dict[str, Any]:
    org = organization_from_person(person)
    location = ", ".join(
        item
        for item in [
            clean_text(person.get("city")),
            clean_text(person.get("state")),
            clean_text(person.get("country")),
        ]
        if item
    )
    last_name = clean_text(person.get("last_name"))
    return {
        "id": clean_text(person.get("id")),
        "name": flatten_person_name(person),
        "first_name": clean_text(person.get("first_name")),
        "last_name": last_name,
        "title": clean_text(person.get("title")),
        "organization_name": clean_text(org.get("name")),
        "organization_domain": domain_from_url(org.get("primary_domain") or org.get("website_url")),
        "linkedin": clean_text(person.get("linkedin_url")),
        "location": location,
        "has_email": bool(person.get("has_email")),
    }


def apollo_search(name: str) -> list[dict[str, Any]]:
    name = clean_text(name, 160)
    if not name:
        raise ValueError("Name is required for Apollo search.")
    data = apollo_post(
        "/mixed_people/api_search",
        {"q_keywords": name, "page": 1, "per_page": APOLLO_SEARCH_PER_PAGE},
    )
    people = data.get("people") or []
    return [normalize_apollo_candidate(person) for person in people if isinstance(person, dict)]


def apollo_enrich(payload: dict[str, Any]) -> dict[str, str]:
    params: dict[str, Any] = {}
    candidate = payload.get("candidate") or payload
    if not isinstance(candidate, dict):
        candidate = {}
    for source_key, target_key in [
        ("id", "id"),
        ("name", "name"),
        ("first_name", "first_name"),
        ("last_name", "last_name"),
        ("organization_name", "organization_name"),
        ("organization_domain", "domain"),
        ("linkedin", "linkedin_url"),
    ]:
        value = clean_text(candidate.get(source_key), 300)
        if value:
            params[target_key] = value
    if not params:
        raise ValueError("Apollo enrichment needs a selected candidate.")
    if APOLLO_RUN_WATERFALL_EMAIL:
        params["run_waterfall_email"] = "true"
    data = apollo_post("/people/match", params)
    person = data.get("person") or data.get("contact") or data
    if not isinstance(person, dict):
        person = {}
    email = clean_text(person.get("email"))
    linkedin = clean_text(person.get("linkedin_url") or candidate.get("linkedin"))
    return {
        "email": email,
        "linkedin": linkedin,
        "name": flatten_person_name(person) or clean_text(candidate.get("name")),
    }


def transcribe_person_audio(person_id: str) -> dict[str, str]:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set.")
    http = require_requests()
    with connect() as conn:
        row = conn.execute("SELECT audio_filename, audio_mime FROM people WHERE id = ?", (person_id,)).fetchone()
        if not row:
            raise KeyError("Person not found.")
        if not row["audio_filename"]:
            raise ValueError("This person does not have audio.")
        path = AUDIO_DIR / row["audio_filename"]
        if not path.exists():
            raise ValueError("Audio file is missing.")
        data = {"model": OPENAI_TRANSCRIPTION_MODEL}
        if OPENAI_TRANSCRIPTION_LANGUAGE:
            data["language"] = OPENAI_TRANSCRIPTION_LANGUAGE
        with path.open("rb") as audio_file:
            response = http.post(
                OPENAI_TRANSCRIPTION_URL,
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                data=data,
                files={"file": (path.name, audio_file, row["audio_mime"] or "audio/webm")},
                timeout=180,
            )
        if response.status_code >= 400:
            raise RuntimeError(f"Transcription request failed: {response.status_code} {response.text[:300]}")
        payload = response.json()
        transcript = clean_text(payload.get("text"), 12000)
        if not transcript:
            raise RuntimeError("Transcription response did not include text.")
        conn.execute(
            "UPDATE people SET transcript = ?, updated_at = ? WHERE id = ?",
            (transcript, utc_now(), person_id),
        )
        return {"transcript": transcript}


class Handler(BaseHTTPRequestHandler):
    def do_HEAD(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/media/audio/"):
            self.serve_audio(parsed.path.removeprefix("/media/audio/"), include_body=False)
            return
        self.serve_static(parsed.path, include_body=False)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/people":
            self.send_json({"people": list_people()})
            return
        if parsed.path == "/api/events":
            self.send_json({"events": list_events()})
            return
        if parsed.path.startswith("/media/audio/"):
            self.serve_audio(parsed.path.removeprefix("/media/audio/"))
            return
        self.serve_static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/people":
                self.send_json({"person": create_person(request_json(self))}, HTTPStatus.CREATED)
                return
            if parsed.path == "/api/events":
                self.send_json({"event": create_event(request_json(self))}, HTTPStatus.CREATED)
                return
            match = re.fullmatch(r"/api/people/([^/]+)/transcribe", parsed.path)
            if match:
                self.send_json(transcribe_person_audio(unquote(match.group(1))))
                return
            if parsed.path == "/api/apollo/search":
                payload = request_json(self)
                self.send_json({"candidates": apollo_search(clean_text(payload.get("name")))})
                return
            if parsed.path == "/api/apollo/enrich":
                self.send_json(apollo_enrich(request_json(self)))
                return
            self.send_json({"error": "Not found."}, HTTPStatus.NOT_FOUND)
        except Exception as exc:
            self.send_exception(exc)

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/events/order":
                payload = request_json(self)
                self.send_json({"events": reorder_events(payload.get("event_ids") or [])})
                return
            match = re.fullmatch(r"/api/people/([^/]+)", parsed.path)
            if match:
                self.send_json({"person": update_person(unquote(match.group(1)), request_json(self))})
                return
            event_match = re.fullmatch(r"/api/events/([^/]+)", parsed.path)
            if event_match:
                self.send_json({"event": update_event(unquote(event_match.group(1)), request_json(self))})
                return
            self.send_json({"error": "Not found."}, HTTPStatus.NOT_FOUND)
        except Exception as exc:
            self.send_exception(exc)

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        try:
            people_match = re.fullmatch(r"/api/people/([^/]+)", parsed.path)
            if people_match:
                delete_person(unquote(people_match.group(1)))
                self.send_json({"ok": True})
                return
            event_match = re.fullmatch(r"/api/events/([^/]+)", parsed.path)
            if event_match:
                delete_event(unquote(event_match.group(1)))
                self.send_json({"ok": True})
                return
            self.send_json({"error": "Not found."}, HTTPStatus.NOT_FOUND)
        except Exception as exc:
            self.send_exception(exc)

    def serve_static(self, path: str, include_body: bool = True) -> None:
        route = STATIC_ROUTES.get(path)
        if not route:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        target = (ROOT / route).resolve()
        if not target.exists() or not target.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content_type = STATIC_TYPES.get(target.suffix) or mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        body = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if include_body:
            self.wfile.write(body)

    def serve_audio(self, raw_name: str, include_body: bool = True) -> None:
        filename = Path(unquote(raw_name)).name
        target = (AUDIO_DIR / filename).resolve()
        if AUDIO_DIR.resolve() not in target.parents:
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        if not target.exists() or not target.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        body = target.read_bytes()
        content_type = MEDIA_TYPES.get(target.suffix.lower()) or mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if include_body:
            self.wfile.write(body)

    def send_exception(self, exc: Exception) -> None:
        if isinstance(exc, KeyError):
            status = HTTPStatus.NOT_FOUND
        elif isinstance(exc, (ValueError, json.JSONDecodeError)):
            status = HTTPStatus.BAD_REQUEST
        elif isinstance(exc, OverflowError):
            status = HTTPStatus.REQUEST_ENTITY_TOO_LARGE
        else:
            status = HTTPStatus.INTERNAL_SERVER_ERROR
        self.send_json({"error": str(exc)}, status)

    def send_json(self, data: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(data, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"{self.address_string()} - {fmt % args}")


def main() -> None:
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    cert_file = resolve_optional_path(SSL_CERT_FILE)
    key_file = resolve_optional_path(SSL_KEY_FILE)
    scheme = "http"
    if cert_file or key_file:
        if not cert_file or not key_file:
            raise RuntimeError("SSL_CERT_FILE and SSL_KEY_FILE must both be set to enable HTTPS.")
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert_file, key_file)
        server.socket = context.wrap_socket(server.socket, server_side=True)
        scheme = "https"
    print(f"Recon running at {scheme}://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
