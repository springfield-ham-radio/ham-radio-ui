import { describe, expect, it } from 'vitest';
import {
  formatGitHubOutput,
  normalizeUpdaterSigningKey,
  prepareUpdaterSigning,
  setCreateUpdaterArtifacts,
} from '../../scripts/updater-signing-key.ts';

const SAMPLE_SECRET_KEY = `untrusted comment: minisign encrypted secret key
RWRTY0IyzFakeSecretKeyPayloadForTestsOnly+=
`;

const SAMPLE_TAURI_CONFIG = `{
  "bundle": {
    "active": true,
    "createUpdaterArtifacts": true,
    "targets": "all"
  }
}
`;

describe('updater signing key', () => {
  describe('normalizeUpdaterSigningKey', () => {
    it('should reject an empty signing key', () => {
      expect(normalizeUpdaterSigningKey(undefined)).toEqual({
        usable: false,
        privateKey: undefined,
        reason: 'signing key is empty',
      });
      expect(normalizeUpdaterSigningKey('')).toEqual({
        usable: false,
        privateKey: undefined,
        reason: 'signing key is empty',
      });
      expect(normalizeUpdaterSigningKey('   \n')).toEqual({
        usable: false,
        privateKey: undefined,
        reason: 'signing key is empty',
      });
    });

    it('should accept a raw minisign secret key file', () => {
      const normalized = normalizeUpdaterSigningKey(SAMPLE_SECRET_KEY);

      expect(normalized.usable).toBe(true);
      expect(normalized.privateKey).toBe(SAMPLE_SECRET_KEY);
      expect(normalized.reason).toBe('normalized minisign secret key');
    });

    it('should accept a secret stored with literal newline escapes', () => {
      const escaped = SAMPLE_SECRET_KEY.trim().replace(/\n/g, '\\n');
      const normalized = normalizeUpdaterSigningKey(escaped);

      expect(normalized.usable).toBe(true);
      expect(normalized.privateKey).toBe(SAMPLE_SECRET_KEY);
    });

    it('should accept a base64-encoded minisign secret key file', () => {
      const encoded = Buffer.from(SAMPLE_SECRET_KEY, 'utf8').toString('base64');
      const normalized = normalizeUpdaterSigningKey(encoded);

      expect(normalized.usable).toBe(true);
      expect(normalized.privateKey).toBe(SAMPLE_SECRET_KEY);
    });

    it('should reject a key that is not minisign formatted', () => {
      expect(normalizeUpdaterSigningKey('not-a-minisign-key')).toEqual({
        usable: false,
        privateKey: undefined,
        reason: 'signing key is missing the minisign comment header',
      });
    });
  });

  describe('setCreateUpdaterArtifacts', () => {
    it('should disable updater artifacts without rewriting unrelated fields', () => {
      const updated = setCreateUpdaterArtifacts(SAMPLE_TAURI_CONFIG, false);

      expect(updated).toContain('"createUpdaterArtifacts": false');
      expect(updated).toContain('"targets": "all"');
      expect(updated).not.toContain('"createUpdaterArtifacts": true');
    });

    it('should throw when the Tauri config is missing the flag', () => {
      expect(() => setCreateUpdaterArtifacts('{"bundle":{}}', false)).toThrow(
        'tauri.conf.json is missing createUpdaterArtifacts',
      );
    });
  });

  describe('prepareUpdaterSigning', () => {
    it('should keep updater artifacts when the signing key is usable', () => {
      const result = prepareUpdaterSigning({
        rawPrivateKey: SAMPLE_SECRET_KEY,
        rawPassword: 'secret',
        tauriConfig: SAMPLE_TAURI_CONFIG,
        keyFilePath: '/tmp/ham-radio-ui.key',
      });

      expect(result.usable).toBe(true);
      expect(result.tauriConfig).toBe(SAMPLE_TAURI_CONFIG);
      expect(result.privateKeyFileContents).toBe(SAMPLE_SECRET_KEY);
      expect(result.privateKeyPath).toBe('/tmp/ham-radio-ui.key');
      expect(result.privateKeyForTauri).toBe(Buffer.from(SAMPLE_SECRET_KEY, 'utf8').toString('base64'));
      expect(result.password).toBe('secret');
      expect(result.githubOutput).toBe(
        formatGitHubOutput({
          usable: 'true',
          private_key: result.privateKeyForTauri,
          private_key_path: '/tmp/ham-radio-ui.key',
          private_key_password: 'secret',
        }),
      );
    });

    it('should disable updater artifacts when the signing key is missing', () => {
      const result = prepareUpdaterSigning({
        rawPrivateKey: '',
        rawPassword: 'unused',
        tauriConfig: SAMPLE_TAURI_CONFIG,
        keyFilePath: '/tmp/ham-radio-ui.key',
      });

      expect(result.usable).toBe(false);
      expect(result.reason).toBe('signing key is empty');
      expect(result.tauriConfig).toContain('"createUpdaterArtifacts": false');
      expect(result.privateKeyFileContents).toBe(undefined);
      expect(result.privateKeyPath).toBe(undefined);
      expect(result.privateKeyForTauri).toBe('');
      expect(result.password).toBe('');
      expect(result.githubOutput).toBe(
        formatGitHubOutput({
          usable: 'false',
          private_key: '',
          private_key_path: '',
          private_key_password: '',
        }),
      );
    });
  });
});
