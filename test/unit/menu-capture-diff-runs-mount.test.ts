// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { MenuCaptureStepDiff } from '../../app/utils/menu-capture.ts';
import MenuCaptureDiffRuns from '../../app/components/MenuCaptureDiffRuns.vue';

const diff: MenuCaptureStepDiff = {
  byteCount: 1,
  runCount: 1,
  ignoredByteCount: 0,
  runs: [
    {
      offset: 0x1028,
      address: '0x1028',
      before: '01',
      after: '03',
      unmapped: false,
      fields: [
        {
          structId: 'ledControl',
          fieldId: 'fmRadio',
          label: 'LED Control',
          reserved: false,
          menu: { number: 181, code: 'FM Radio' },
          bitOffset: 1,
          bitWidth: 2,
        },
      ],
      context: [
        {
          address: '0x1020',
          before: '00 00 00 00 00 00 00 00  00 01 00 00 00 00 00 00',
          after: '00 00 00 00 00 00 00 00  00 03 00 00 00 00 00 00',
        },
      ],
    },
  ],
};

describe('MenuCaptureDiffRuns', () => {
  it('renders a hex context row and a mapped field label', () => {
    const wrapper = mount(MenuCaptureDiffRuns, {
      props: { diff, menuNumber: 181 },
    });

    const text = wrapper.text();
    expect(text).toContain('0x1020');
    expect(text).toContain('Previous read');
    expect(text).toContain('Menu 181');
    expect(text).toContain('LED Control');
    expect(text).toContain('FM Radio');
    expect(text).toContain('03');
  });
});