#!/usr/bin/env python3
"""Load a hosted glucose clock URL on a Nest Hub."""

from __future__ import annotations

import argparse
import time
import urllib.parse

import pychromecast
from pychromecast.controllers.dashcast import DashCastController


def main() -> None:
    parser = argparse.ArgumentParser(description="Cast the hosted glucose clock")
    parser.add_argument("url", help="Full Cloud Run display URL, including its key")
    parser.add_argument("device", help="Nest Hub name exactly as shown in Google Home")
    parser.add_argument("--discovery-timeout", type=int, default=15)
    args = parser.parse_args()

    parsed = urllib.parse.urlsplit(args.url)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query.append(("reload", str(int(time.time()))))
    clock_url = urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(query)))

    casts, browser = pychromecast.get_listed_chromecasts(
        friendly_names=[args.device], discovery_timeout=args.discovery_timeout
    )
    try:
        if not casts:
            raise SystemExit(
                f'Could not find "{args.device}". Confirm that the Mac and Hub use the same Wi-Fi.'
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
