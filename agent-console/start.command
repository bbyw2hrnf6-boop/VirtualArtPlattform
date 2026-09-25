#!/bin/zsh
set -eu

script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$script_dir/.."
npm run agents:dashboard
