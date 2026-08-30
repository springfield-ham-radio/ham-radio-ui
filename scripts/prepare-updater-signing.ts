import { appendFileSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUpdaterSigning } from './updater-signing-key.ts';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const tauriConfigPath = process.env.TAURI_CONF_PATH ?? resolve(repositoryRoot, 'src-tauri/tauri.conf.json');
const keyFilePath = process.env.UPDATER_KEY_PATH ?? resolve(repositoryRoot, 'src-tauri/.updater-signing.key');

const tauriConfig = readFileSync(tauriConfigPath, 'utf8');
const result = prepareUpdaterSigning({
  rawPrivateKey: process.env.TAURI_SIGNING_PRIVATE_KEY,
  rawPassword: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD,
  tauriConfig,
  keyFilePath,
});

if (result.tauriConfig !== tauriConfig) {
  writeFileSync(tauriConfigPath, result.tauriConfig);
}

if (result.privateKeyFileContents !== undefined && result.privateKeyPath !== undefined) {
  mkdirSync(dirname(result.privateKeyPath), { recursive: true });
  writeFileSync(result.privateKeyPath, result.privateKeyFileContents, { encoding: 'utf8', mode: 0o600 });
}

const githubOutput = process.env.GITHUB_OUTPUT;

if (githubOutput) {
  appendFileSync(githubOutput, result.githubOutput);
}

if (result.usable) {
  console.log(`Updater signing key is usable (${result.reason}).`);
} else {
  console.warn(`Updater signing key is not usable (${result.reason}). Disabled createUpdaterArtifacts so installers still publish.`);
}
