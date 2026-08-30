import { describe, it } from 'node:test';
import { expect } from 'chai';
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
      expect(normalizeUpdaterSigningKey(undefined)).to.deep.equal({
        usable: false,
        privateKey: undefined,
        reason: 'signing key is empty',
      });
      expect(normalizeUpdaterSigningKey('')).to.deep.equal({
        usable: false,
        privateKey: undefined,
        reason: 'signing key is empty',
      });
      expect(normalizeUpdaterSigningKey('   \n')).to.deep.equal({
        usable: false,
        privateKey: undefined,
        reason: 'signing key is empty',
      });
    });

    it('should accept a raw minisign secret key file', () => {
      const normalized = normalizeUpdaterSigningKey(SAMPLE_SECRET_KEY);

      expect(normalized.usable).to.be.true;
      expect(normalized.privateKey).to.equal(SAMPLE_SECRET_KEY);
      expect(normalized.reason).to.equal('normalized minisign secret key');
    });

    it('should accept a secret stored with literal newline escapes', () => {
      const escaped = SAMPLE_SECRET_KEY.trim().replace(/\n/g, '\\n');
      const normalized = normalizeUpdaterSigningKey(escaped);

      expect(normalized.usable).to.be.true;
      expect(normalized.privateKey).to.equal(SAMPLE_SECRET_KEY);
    });

    it('should accept a base64-encoded minisign secret key file', () => {
      const encoded = Buffer.from(SAMPLE_SECRET_KEY, 'utf8').toString('base64');
      const normalized = normalizeUpdaterSigningKey(encoded);

      expect(normalized.usable).to.be.true;
      expect(normalized.privateKey).to.equal(SAMPLE_SECRET_KEY);
    });

    it('should reject a key that is not minisign formatted', () => {
      expect(normalizeUpdaterSigningKey('not-a-minisign-key')).to.deep.equal({
        usable: false,
        privateKey: undefined,
        reason: 'signing key is missing the minisign comment header',
      });
    });
  });

  describe('setCreateUpdaterArtifacts', () => {
    it('should disable updater artifacts without rewriting unrelated fields', () => {
      const updated = setCreateUpdaterArtifacts(SAMPLE_TAURI_CONFIG, false);

      expect(updated).to.include('"createUpdaterArtifacts": false');
      expect(updated).to.include('"targets": "all"');
      expect(updated).to.not.include('"createUpdaterArtifacts": true');
    });

    it('should throw when the Tauri config is missing the flag', () => {
      expect(() => setCreateUpdaterArtifacts('{"bundle":{}}', false)).to.throw(
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

      expect(result.usable).to.be.true;
      expect(result.tauriConfig).to.equal(SAMPLE_TAURI_CONFIG);
      expect(result.privateKeyFileContents).to.equal(SAMPLE_SECRET_KEY);
      expect(result.privateKeyPath).to.equal('/tmp/ham-radio-ui.key');
      expect(result.password).to.equal('secret');
      expect(result.githubOutput).to.equal(
        formatGitHubOutput({
          usable: 'true',
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

      expect(result.usable).to.be.false;
      expect(result.reason).to.equal('signing key is empty');
      expect(result.tauriConfig).to.include('"createUpdaterArtifacts": false');
      expect(result.privateKeyFileContents).to.equal(undefined);
      expect(result.privateKeyPath).to.equal(undefined);
      expect(result.password).to.equal('');
      expect(result.githubOutput).to.equal(
        formatGitHubOutput({
          usable: 'false',
          private_key_path: '',
          private_key_password: '',
        }),
      );
    });
  });
});
