export interface NormalizedUpdaterSigningKey {
  usable: boolean;
  privateKey: string | undefined;
  reason: string;
}

export interface PrepareUpdaterSigningInput {
  rawPrivateKey: string | undefined;
  rawPassword: string | undefined;
  tauriConfig: string;
  keyFilePath: string;
}

export interface PrepareUpdaterSigningResult {
  usable: boolean;
  reason: string;
  tauriConfig: string;
  privateKeyFileContents: string | undefined;
  privateKeyPath: string | undefined;
  password: string;
  githubOutput: string;
}

const SECRET_KEY_COMMENT_PREFIX = 'untrusted comment:';

/**
 * GitHub secrets often store a minisign private key as the raw two-line file,
 * as that file with literal `\n` escapes, or as base64 of the whole file (the
 * same encoding used for `plugins.updater.pubkey`).
 *
 * Tauri fails the whole installer build with "Missing comment in secret key"
 * when the secret is empty or not in minisign format. Normalize first so a
 * well-formed key still signs, and report unusable keys so CI can skip updater
 * artifacts instead of failing after the bundles are already built.
 */
export function normalizeUpdaterSigningKey(raw: string | undefined): NormalizedUpdaterSigningKey {
  if (raw === undefined || raw.trim() === '') {
    return {
      usable: false,
      privateKey: undefined,
      reason: 'signing key is empty',
    };
  }

  const candidates = expandSigningKeyCandidates(raw);

  for (const candidate of candidates) {
    if (isMinisignSecretKey(candidate)) {
      return {
        usable: true,
        privateKey: candidate,
        reason: 'normalized minisign secret key',
      };
    }
  }

  return {
    usable: false,
    privateKey: undefined,
    reason: 'signing key is missing the minisign comment header',
  };
}

/**
 * Toggle `bundle.createUpdaterArtifacts` without rewriting the rest of the
 * Tauri config. CI uses this to keep publishing installers when the signing
 * secret is missing.
 */
export function setCreateUpdaterArtifacts(configJson: string, enabled: boolean): string {
  if (!/"createUpdaterArtifacts"\s*:\s*(true|false)/.test(configJson)) {
    throw new Error('tauri.conf.json is missing createUpdaterArtifacts');
  }

  return configJson.replace(/"createUpdaterArtifacts"\s*:\s*(true|false)/, `"createUpdaterArtifacts": ${enabled}`);
}

/**
 * Decide whether this CI run can sign updater artifacts. A usable key is
 * written to `keyFilePath` by the caller; an unusable key disables updater
 * artifacts so `tauri build` still uploads installers.
 */
export function prepareUpdaterSigning(input: PrepareUpdaterSigningInput): PrepareUpdaterSigningResult {
  const prepared = normalizeUpdaterSigningKey(input.rawPrivateKey);

  if (prepared.usable && prepared.privateKey !== undefined) {
    return {
      usable: true,
      reason: prepared.reason,
      tauriConfig: input.tauriConfig,
      privateKeyFileContents: prepared.privateKey,
      privateKeyPath: input.keyFilePath,
      password: input.rawPassword ?? '',
      githubOutput: formatGitHubOutput({
        usable: 'true',
        private_key_path: input.keyFilePath,
        private_key_password: input.rawPassword ?? '',
      }),
    };
  }

  return {
    usable: false,
    reason: prepared.reason,
    tauriConfig: setCreateUpdaterArtifacts(input.tauriConfig, false),
    privateKeyFileContents: undefined,
    privateKeyPath: undefined,
    password: '',
    githubOutput: formatGitHubOutput({
      usable: 'false',
      private_key_path: '',
      private_key_password: '',
    }),
  };
}

export function formatGitHubOutput(values: Record<string, string>): string {
  return `${Object.entries(values)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')}\n`;
}

function expandSigningKeyCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  const unescaped = unescapeNewlines(trimmed);
  const candidates = [normalizeNewlines(trimmed), normalizeNewlines(unescaped)];

  for (const value of [trimmed, unescaped]) {
    const compact = value.replace(/\s/g, '');

    if (!isBase64(compact)) {
      continue;
    }

    const decoded = Buffer.from(compact, 'base64').toString('utf8');
    candidates.push(normalizeNewlines(decoded));
    candidates.push(normalizeNewlines(unescapeNewlines(decoded)));
  }

  return uniqueNonEmpty(candidates);
}

function isMinisignSecretKey(value: string): boolean {
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines[0]?.startsWith(SECRET_KEY_COMMENT_PREFIX) === true && (lines[1]?.length ?? 0) > 20;
}

function unescapeNewlines(value: string): string {
  return value.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
}

function normalizeNewlines(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  if (normalized === '') {
    return '';
  }

  return `${normalized}\n`;
}

function isBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
