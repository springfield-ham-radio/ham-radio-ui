#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

tauri_linux_apt_packages=(
  libwebkit2gtk-4.1-dev
  libgtk-3-dev
  libayatana-appindicator3-dev
  librsvg2-dev
  libudev-dev
  libxdo-dev
  pkg-config
  build-essential
  libssl-dev
)

if command -v apt-get >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
  if ! sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${tauri_linux_apt_packages[@]}"; then
    echo "apt-get install reported an error; verifying Tauri pkg-config modules..." >&2
  fi
  missing=0
  for module in 'webkit2gtk-4.1' 'gdk-3.0 >= 3.22'; do
    if ! pkg-config --exists "$module"; then
      echo "Missing pkg-config module: $module" >&2
      missing=1
    fi
  done
  if [ "$missing" -ne 0 ]; then
    exit 1
  fi
fi

(cd src-tauri && rustup toolchain install)
rustup show
yarn install