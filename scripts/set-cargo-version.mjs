import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const version = process.argv[2]
if (!version) {
  console.error('Usage: node scripts/set-cargo-version.mjs <version>')
  process.exit(1)
}

const cargoPath = resolve(dirname(fileURLToPath(import.meta.url)), '../src-tauri/Cargo.toml')
const content = readFileSync(cargoPath, 'utf8')

if (!/^version\s*=\s*"[^"]+"/m.test(content)) {
  console.error('Failed to find version field in Cargo.toml')
  process.exit(1)
}

const updated = content.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`)
writeFileSync(cargoPath, updated)
console.log(`Updated Cargo.toml version to ${version}`)
