#!/bin/zsh
set -e

cd "${0:A:h}"

PYTHON="$(brew --prefix python@3.13)/bin/python3.13"

if [[ ! -x "$PYTHON" ]]; then
  echo "Python 3.13 was not found."
  echo "Install it with: brew install python@3.13"
  exit 1
fi

echo "Using: $("$PYTHON" --version)"

rm -rf .venv

"$PYTHON" -m venv .venv

.venv/bin/python3 -m pip install --upgrade pip
.venv/bin/python3 -m pip install -r requirements.txt

echo
echo "Setup complete."
echo "Run ./cast.command to cast the display."
