import { describe, expectTypeOf, it } from 'vitest';
import type { useOperatorLicense } from '../../app/composables/useOperatorLicense.ts';

type OperatorLicense = ReturnType<typeof useOperatorLicense>;

describe('useOperatorLicense', () => {
  it('exposes directory and amateur call sign options for print dialogs', () => {
    expectTypeOf<OperatorLicense>().toHaveProperty('directory');
    expectTypeOf<OperatorLicense>().toHaveProperty('amateurCallSignOptions');
    expectTypeOf<OperatorLicense>().toHaveProperty('identityFor');
  });
});
