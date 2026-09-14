#!/usr/bin/env python3
"""Load a hosted glucose clock URL on a Nest Hub."""

from __future__ import annotations

import argparse
import json
import time
import urllib.parse
from pathlib import Path

import pychromecast
from pychromecast.controllers.dashcast import DashCastController


ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config.json"


def load_cast_config() -> tuple[str, str]:
    if not CONFIG_PATH.exists():
        raise SystemExit(
            "config.json was not found. Add display_url and cast_device first."
        )

    with CONFIG_PATH.open("r", encoding="utf-8") as file:
        config = json.load(file)

    display_url = str(config.get("display_url", "")).strip()
    cast_device = str(config.get("cast_device", "")).strip()

    if not display_url:
        raise SystemExit('config.json is missing "display_url".')

    if not cast_device:
        raise SystemExit('config.json is missing "cast_device".')

    return display_url, cast_device


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Cast the hosted glucose clock")
    parser.add_argument("--discovery-timeout", type=int, default=15)
    args = parser.parse_args()

    display_url, cast_device = load_cast_config()

    parsed = urllib.parse.urlsplit(display_url)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query.append(("reload", str(int(time.time()))))
    clock_url = urllib.parse.urlunsplit(
        parsed._replace(query=urllib.parse.urlencode(query))
    )

    casts, browser = pychromecast.get_listed_chromecasts(
        friendly_names=[cast_device],
        discovery_timeout=args.discovery_timeout,
    )

    try:
        if not casts:
            raise SystemExit(
                f'Could not find "{cast_device}". '
                "Confirm that the Mac and Hub use the same Wi-Fi."
            )

        cast = casts[0]
        cast.wait()

        controller = DashCastController()
        cast.register_handler(controller)
        controller.load_url(clock_url, force=True)

        time.sleep(5)

        print(f"Hosted glucose clock sent to {cast.cast_info.friendly_name}")
        cast.disconnect()

    finally:
        pychromecast.discovery.stop_discovery(browser)


if __name__ == "__main__":
    main()
