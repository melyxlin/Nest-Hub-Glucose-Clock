#!/usr/bin/env python3
"""Serve a private Nest Hub glucose clock backed by Nightscout."""

from __future__ import annotations

import argparse
import hmac
import json
import mimetypes
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
WEB_ROOT = ROOT / "web"
DEFAULT_CONFIG_PATH = ROOT / "config.json"

DIRECTION_ARROWS = {
    "DoubleUp": "⇈",
    "SingleUp": "↑",
    "FortyFiveUp": "↗",
    "Flat": "→",
    "FortyFiveDown": "↘",
    "SingleDown": "↓",
    "DoubleDown": "⇊",
    "NOT COMPUTABLE": "",
    "RATE OUT OF RANGE": "",
    "NONE": "",
}


def load_config(path: Path) -> dict[str, Any]:
    if path.exists():
        with path.open("r", encoding="utf-8") as handle:
            config = json.load(handle)
    else:
        config = {}

    config.setdefault("nightscout_url", "")
    config.setdefault("nightscout_token", "")
    config.setdefault("auth_mode", "query")
    config.setdefault("low_threshold", 70)
    config.setdefault("high_threshold", 180)
    config.setdefault("stale_after_minutes", 10)
    config.setdefault("poll_seconds", 60)
    config.setdefault("units", "mg/dL")
    config.setdefault("low_alert_sound", True)
    config.setdefault("high_alert_sound", True)
    config.setdefault("demo_mode", False)

    env_settings: dict[str, tuple[str, Any]] = {
        "NIGHTSCOUT_URL": ("nightscout_url", str),
        "NIGHTSCOUT_TOKEN": ("nightscout_token", str),
        "AUTH_MODE": ("auth_mode", str),
        "LOW_THRESHOLD": ("low_threshold", float),
        "HIGH_THRESHOLD": ("high_threshold", float),
        "STALE_AFTER_MINUTES": ("stale_after_minutes", float),
        "POLL_SECONDS": ("poll_seconds", int),
        "UNITS": ("units", str),
        "DISPLAY_ACCESS_KEY": ("display_access_key", str),
    }
    for env_name, (config_name, convert) in env_settings.items():
        if env_name in os.environ:
            config[config_name] = convert(os.environ[env_name])

    for env_name, config_name in (
        ("LOW_ALERT_SOUND", "low_alert_sound"),
        ("HIGH_ALERT_SOUND", "high_alert_sound"),
        ("DEMO_MODE", "demo_mode"),
    ):
        if env_name in os.environ:
            config[config_name] = os.environ[env_name].strip().lower() in (
                "1",
                "true",
                "yes",
                "on",
            )
    return config


def range_for_glucose(value: float, low: float, high: float) -> str:
    if value < low:
        return "low"
    if value > high:
        return "high"
    return "in-range"


def entry_timestamp_ms(entry: dict[str, Any]) -> float | None:
    timestamp_ms = entry.get("date")
    if timestamp_ms is not None:
        return float(timestamp_ms)
    if entry.get("dateString"):
        from datetime import datetime

        return datetime.fromisoformat(
            str(entry["dateString"]).replace("Z", "+00:00")
        ).timestamp() * 1000
    return None


def select_previous_entry(
    entries: list[dict[str, Any]],
    min_gap_seconds: float = 2 * 60,
    max_gap_seconds: float = 10 * 60,
) -> dict[str, Any] | None:
    """Choose the prior CGM sample while skipping duplicate-source uploads."""
    if len(entries) < 2:
        return None

    current = entries[0]
    current_timestamp_ms = entry_timestamp_ms(current)
    if current_timestamp_ms is None:
        return None

    candidates: list[dict[str, Any]] = []
    for entry in entries[1:]:
        timestamp_ms = entry_timestamp_ms(entry)
        if timestamp_ms is None:
            continue
        gap_seconds = (current_timestamp_ms - timestamp_ms) / 1000
        if min_gap_seconds <= gap_seconds <= max_gap_seconds:
            candidates.append(entry)

    if not candidates:
        return None

    current_device = current.get("device")
    if current_device:
        same_device = [
            entry for entry in candidates if entry.get("device") == current_device
        ]
        if same_device:
            candidates = same_device

    return max(candidates, key=lambda entry: entry_timestamp_ms(entry) or 0)


def normalize_entry(
    entry: dict[str, Any],
    config: dict[str, Any],
    previous_entry: dict[str, Any] | None = None,
) -> dict[str, Any]:
    raw_value = entry.get("sgv", entry.get("mbg"))
    if raw_value is None:
        raise ValueError("Nightscout entry does not contain an sgv value")

    value = float(raw_value)
    timestamp_ms = entry_timestamp_ms(entry)
    if timestamp_ms is None:
        raise ValueError("Nightscout entry does not contain a timestamp")

    timestamp = float(timestamp_ms) / 1000
    age_seconds = max(0, time.time() - timestamp)
    stale_after_seconds = float(config["stale_after_minutes"]) * 60
    direction = str(entry.get("direction", "NONE"))

    delta: int | None = None
    if previous_entry is not None:
        previous_value = previous_entry.get("sgv", previous_entry.get("mbg"))
        previous_timestamp_ms = entry_timestamp_ms(previous_entry)
        if previous_value is not None and previous_timestamp_ms is not None:
            reading_gap_seconds = (float(timestamp_ms) - float(previous_timestamp_ms)) / 1000
            # A CGM delta is meaningful only when the prior sample is distinct and recent.
            if 0 < reading_gap_seconds <= 10 * 60:
                delta = round(value - float(previous_value))

    return {
        "value": round(value),
        "units": config["units"],
        "direction": direction,
        "arrow": DIRECTION_ARROWS.get(direction, ""),
        "delta": delta,
        "delta_display": None if delta is None else f"{delta:+d}",
        "timestamp": int(timestamp),
        "age_seconds": round(age_seconds),
        "stale": age_seconds > stale_after_seconds,
        "range": range_for_glucose(
            value,
            float(config["low_threshold"]),
            float(config["high_threshold"]),
        ),
        "poll_seconds": int(config["poll_seconds"]),
        "stale_after_minutes": int(config["stale_after_minutes"]),
        "low_alert_sound": bool(config.get("low_alert_sound", True)),
        "high_alert_sound": bool(config.get("high_alert_sound", True)),
    }


class NightscoutClient:
    def __init__(self, config: dict[str, Any]) -> None:
        self.config = config
        self._lock = threading.Lock()
        self._cached_at = 0.0
        self._cached_result: dict[str, Any] | None = None

    def latest(self) -> dict[str, Any]:
        if self.config.get("demo_mode"):
            now = int(time.time())
            phase = (now // 60) % 3
            values = (112, 196, 64)
            directions = ("Flat", "FortyFiveUp", "SingleDown")
            return normalize_entry(
                {
                    "sgv": values[phase],
                    "direction": directions[phase],
                    "date": (now - 75) * 1000,
                },
                self.config,
                {
                    "sgv": values[(phase - 1) % len(values)],
                    "date": (now - 75 - 5 * 60) * 1000,
                },
            )

        with self._lock:
            cache_seconds = min(45, max(10, int(self.config["poll_seconds"]) - 5))
            if self._cached_result and time.time() - self._cached_at < cache_seconds:
                result = dict(self._cached_result)
                result["age_seconds"] = max(
                    0, round(time.time() - float(result["timestamp"]))
                )
                result["stale"] = result["age_seconds"] > (
                    float(self.config["stale_after_minutes"]) * 60
                )
                return result

            result = self._fetch()
            self._cached_at = time.time()
            self._cached_result = dict(result)
            return result

    def _fetch(self) -> dict[str, Any]:
        base_url = str(self.config["nightscout_url"]).strip().rstrip("/")
        if not base_url:
            raise RuntimeError("nightscout_url is missing from config.json")

        token = str(self.config.get("nightscout_token", "")).strip()
        # Fetch enough history to step past duplicate uploads from integrations
        # such as Dexcom and share2, which often publish the same sample twice.
        params = {"count": "12"}
        headers = {"Accept": "application/json", "User-Agent": "NestHubGlucoseClock/1.0"}

        if token and self.config.get("auth_mode") == "header":
            headers["Authorization"] = f"Bearer {token}"
        elif token:
            params["token"] = token

        endpoint = f"{base_url}/api/v1/entries/sgv.json?{urllib.parse.urlencode(params)}"
        request = urllib.request.Request(endpoint, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                payload = json.load(response)
        except urllib.error.HTTPError as error:
            if error.code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN):
                raise RuntimeError("Nightscout rejected the access token") from error
            raise RuntimeError(f"Nightscout returned HTTP {error.code}") from error
        except urllib.error.URLError as error:
            raise RuntimeError("Could not connect to Nightscout") from error

        if not isinstance(payload, list) or not payload:
            raise RuntimeError("Nightscout returned no glucose entries")
        previous_entry = select_previous_entry(payload)
        return normalize_entry(payload[0], self.config, previous_entry)


class ClockRequestHandler(BaseHTTPRequestHandler):
    server_version = "NestHubGlucoseClock/1.0"

    @property
    def app(self) -> "ClockServer":
        return self.server  # type: ignore[return-value]

    def do_GET(self) -> None:
        path = urllib.parse.urlsplit(self.path).path
        if path == "/health":
            self._send_json({"ok": True})
            return
        if not self._authorized():
            self.send_error(HTTPStatus.FORBIDDEN, "Invalid display access key")
            return
        if path == "/api/glucose":
            self._serve_glucose()
            return
        if path in ("/", "/index.html"):
            self._serve_file(WEB_ROOT / "index.html")
            return
        if path in ("/audio/test.wav", "/audio/high.wav", "/audio/low.wav"):
            self._serve_file(WEB_ROOT / path.lstrip("/"))
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def _authorized(self) -> bool:
        expected = str(self.app.config.get("display_access_key", "")).strip()
        if not expected:
            return True
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        supplied = query.get("key", [""])[0]
        return hmac.compare_digest(expected, supplied)

    def _serve_glucose(self) -> None:
        try:
            result = self.app.client.latest()
            self._send_json({"ok": True, **result})
        except Exception as error:  # Return a safe display state, not a traceback.
            self._send_json(
                {
                    "ok": False,
                    "error": str(error),
                    "poll_seconds": int(self.app.config["poll_seconds"]),
                },
                status=HTTPStatus.SERVICE_UNAVAILABLE,
            )

    def _serve_file(self, path: Path) -> None:
        try:
            payload = path.read_bytes()
        except FileNotFoundError:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mimetypes.guess_type(path.name)[0] or "text/plain")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.end_headers()
        self.wfile.write(payload)

    def _send_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format: str, *args: Any) -> None:
        if self.path.startswith("/api/"):
            return
        super().log_message(format, *args)


class ClockServer(ThreadingHTTPServer):
    def __init__(self, address: tuple[str, int], config: dict[str, Any]) -> None:
        super().__init__(address, ClockRequestHandler)
        self.config = config
        self.client = NightscoutClient(config)


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the Nest Hub glucose clock")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8765")))
    args = parser.parse_args()

    if not args.config.exists() and not os.environ.get("NIGHTSCOUT_URL"):
        raise SystemExit(
            "Missing configuration. Set NIGHTSCOUT_URL or provide config.json."
        )

    config = load_config(args.config)
    server = ClockServer((args.host, args.port), config)
    print(f"Glucose clock running at http://localhost:{args.port}")
    print("Press Control-C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
