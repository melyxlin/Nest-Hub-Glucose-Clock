#!/bin/zsh
set -e
cd "${0:A:h}"

if [[ ! -f config.json ]]; then
  cp config.example.json config.json
  chmod 600 config.json
  echo "Created config.json. Open it, add your Nightscout details, and run this file again."
  open -e config.json
  exit 0
fi

caffeinate -i python3 server.py
