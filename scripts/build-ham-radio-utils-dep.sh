#!/bin/sh
# GitHub-sourced @springfield/ham-radio-utils ships source only; build dist when missing.
set -eu

pkg_root="$(cd "$(dirname "$0")/.." && pwd)"
utils_pkg="$pkg_root/node_modules/@springfield/ham-radio-utils"

if [ -f "$utils_pkg/dist/index.js" ]; then
  exit 0
fi

api_pkg="$pkg_root/node_modules/@springfield/ham-radio-api"
if [ ! -f "$api_pkg/dist/index.js" ]; then
  sh "$pkg_root/scripts/build-ham-radio-api-dep.sh"
fi

ref="${HAM_RADIO_UTILS_GIT_REF:-cursor/channel-bindings-specials-schema-b897}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

git clone --depth 1 --branch "$ref" https://github.com/springfield-ham-radio/ham-radio-utils.git "$tmp_dir"

(
  cd "$tmp_dir"
  corepack enable 2>/dev/null || true
  HUSKY=0 YARN_ENABLE_SCRIPTS=false yarn install
  yarn build
)

mkdir -p "$utils_pkg/dist"
cp -R "$tmp_dir/dist/." "$utils_pkg/dist/"
# Source is already linked from the GitHub install; schemas/db must match dist.
if [ ! -d "$utils_pkg/dist/db" ]; then
  mkdir -p "$utils_pkg/dist/db" "$utils_pkg/dist/schemas"
  cp -R "$tmp_dir/dist/db/." "$utils_pkg/dist/db/"
  cp -R "$tmp_dir/dist/schemas/." "$utils_pkg/dist/schemas/"
fi