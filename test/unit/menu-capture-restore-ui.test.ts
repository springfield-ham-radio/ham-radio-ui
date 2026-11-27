import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const wizard = readFileSync(new URL('../../app/components/RadioMenuCapture.vue', import.meta.url), 'utf8');
const useMenuCapture = readFileSync(new URL('../../app/composables/useMenuCapture.ts', import.meta.url), 'utf8');

describe('menu capture restore wizard UI', () => {
  it('exposes one global Discard session control', () => {
    expect(wizard.match(/@click="discardConfirmOpen = true"/g) ?? []).toHaveLength(1);
    expect(wizard).not.toMatch(/phase === 'intro'[\s\S]*discardConfirmOpen = true/);
    expect(wizard).not.toMatch(/phase === 'export'[\s\S]*@click="discardConfirmOpen = true"/);
  });

  it('offers Verify again without rewrite on Restore', () => {
    expect(wizard).toContain('label="Verify again"');
    expect(wizard).toContain('verifyRestoredBaseline');
    expect(wizard).toContain('label="Continue to export"');
    expect(wizard).not.toMatch(/onVerifyAgain[\s\S]*writeRadioImageForMenuCapture/);
    expect(useMenuCapture).toContain('async function verifyRestoredBaseline');
    expect(useMenuCapture).toContain('waitForCloneRestart: true');
    expect(useMenuCapture).not.toMatch(/verifyRestoredBaseline[\s\S]*writeRadioImageForMenuCapture/);
  });

  it('cancels in-flight verify on unmount and disables export while verifying', () => {
    expect(wizard).toContain('onBeforeUnmount');
    expect(wizard).toContain('cancelTransfer');
    expect(wizard).toMatch(/canContinueToExport[\s\S]*!verifying\.value/);
    expect(wizard).toContain('matchesBaseline === false && !session?.restore?.status');
  });

  it('surfaces read-failed copy separately from mismatch', () => {
    expect(wizard).toContain("session?.restore?.status === 'read-failed'");
    expect(wizard).toContain("session?.restore?.status === 'mismatch'");
    expect(wizard).toContain('session.restore.readError');
  });
});