import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { commitRequiredToggleGroupValue, requiredToggleGroupModel } from '../../app/utils/required-toggle-group-model.ts';

describe('required-toggle-group-model', () => {
  it('ignores empty selection updates', () => {
    const current = ref<'mi' | 'km'>('mi');
    const model = requiredToggleGroupModel(
      () => current.value,
      (value) => {
        current.value = value;
      },
    );

    model.value = '';
    expect(current.value).toBe('mi');

    commitRequiredToggleGroupValue(undefined, (value) => {
      current.value = value;
    });
    expect(current.value).toBe('mi');

    model.value = 'km';
    expect(current.value).toBe('km');
  });
});