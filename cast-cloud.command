#!/bin/zsh
set -e

cd "${0:A:h}"

if [[ ! -x .venv/bin/python3 ]]; then
  echo "Run setup.command first."
  exit 1
fi

.venv/bin/python3 server/cast_cloud.py