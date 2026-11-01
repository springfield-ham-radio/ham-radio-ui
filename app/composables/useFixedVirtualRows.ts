import { computed, toValue, type MaybeRefOrGetter, type Ref } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';

/** Extra rows mounted above and below the viewport. */
export const VIRTUAL_ROW_OVERSCAN = 16;

/**
 * Fixed-height row window backed by `@tanstack/vue-virtual` (the same
 * virtualizer Nuxt UI tables use). Rows stay in normal flow, with padding
 * standing in for the off-screen rows, so horizontal overflow still works.
 */
export function useFixedVirtualRows(
  count: MaybeRefOrGetter<number>,
  scrollElement: Ref<HTMLElement | null | undefined>,
  rowHeight: number,
  padding = 0,
) {
  const virtualizer = useVirtualizer(
    computed(() => ({
      count: toValue(count),
      getScrollElement: () => scrollElement.value ?? null,
      estimateSize: () => rowHeight,
      overscan: VIRTUAL_ROW_OVERSCAN,
      paddingStart: padding,
      paddingEnd: padding,
    })),
  );

  const virtualRows = computed(() => virtualizer.value.getVirtualItems());

  const paddingTop = computed(() => virtualRows.value[0]?.start ?? 0);

  const paddingBottom = computed(() => {
    const rows = virtualRows.value;
    const last = rows[rows.length - 1];

    if (!last) {
      return 0;
    }

    return Math.max(0, virtualizer.value.getTotalSize() - last.end);
  });

  function scrollToIndex(index: number, align: 'auto' | 'center' | 'start' | 'end' = 'auto'): void {
    virtualizer.value.scrollToIndex(index, { align });
  }

  return { virtualizer, virtualRows, paddingTop, paddingBottom, scrollToIndex };
}
