#!/usr/bin/env python3
"""Discover a Nest Hub and load the local glucose clock with DashCast."""

from __future__ import annotations

import argparse
import json
import socket
import time
from pathlib import Path

import pychromecast
from pychromecast.controllers.dashcast import DashCastController


ROOT = Path(__file__).resolve().parent.parent

def local_ip_for(remote_host: str) -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect((remote_host, 8009))
        return str(sock.getsockname()[0])
    finally:
        sock.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Cast the glucose clock to a Nest Hub")
    parser.add_argument(
        "device",
        nargs="?",
        help="Nest Hub name exactly as shown in Google Home; defaults to config.json",
    )
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--discovery-timeout", type=int, default=15)
    args = parser.parse_args()

    device = args.device
    if not device:
        try:
            with (ROOT / "config.json").open("r", encoding="utf-8") as handle:
                device = str(json.load(handle).get("nest_hub_name", "")).strip()
        except FileNotFoundError:
            device = ""
    if not device:
        raise SystemExit("Add nest_hub_name to config.json or pass the device name.")

    casts, browser = pychromecast.get_listed_chromecasts(
        friendly_names=[device], discovery_timeout=args.discovery_timeout
    )
    try:
        if not casts:
            raise SystemExit(
                f'Could not find "{device}". Confirm the name and that both devices use the same Wi-Fi.'
            )
        cast = casts[0]
        cast.wait()
        # A unique query value prevents the Nest Hub's Cast receiver from
        # reusing an older cached copy of the clock interface.
        clock_url = (
            f"http://{local_ip_for(cast.cast_info.host)}:{args.port}/"
            f"?reload={int(time.time())}"
        )
        controller = DashCastController()
        cast.register_handler(controller)
        controller.load_url(clock_url, force=True)
        time.sleep(5)
        print(f'Glucose clock sent to {cast.cast_info.friendly_name}: {clock_url}')
        cast.disconnect()
    finally:
        pychromecast.discovery.stop_discovery(browser)


if __name__ == "__main__":
    main()
