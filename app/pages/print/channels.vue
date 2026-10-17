<script setup lang="ts">
import {
  closeChannelPrintWindow,
  readChannelPrintDocument,
  reportChannelPrintError,
} from '~/utils/channel-print-window';

definePageMeta({
  layout: 'print',
});

useHead({
  title: 'Print channels',
  htmlAttrs: {
    style: 'color-scheme: light; background-color: #fff; color: #000',
  },
  bodyAttrs: {
    style: 'color-scheme: light; background-color: #fff; color: #000',
  },
});

const printDocument = computed(() => readChannelPrintDocument());

const PRINT_COLUMN_CLASS: Record<string, string> = {
  name: 'w-[14%]',
  callsign: 'w-[9%]',
  location: 'w-[16%]',
  band: 'w-[10%]',
  transmit: 'w-[8%]',
  receive: 'w-[8%]',
  txTone: 'w-[8%]',
  rxTone: 'w-[8%]',
  distance: 'w-[7%]',
  use: 'w-[6%]',
  onAir: 'w-[6%]',
  linked: 'w-[8%]',
  channelNumber: 'w-[4%]',
  toneType: 'w-[7%]',
};

function columnClass(id: string): string {
  return PRINT_COLUMN_CLASS[id] ?? '';
}

onMounted(async () => {
  const page = globalThis.document;
  page.documentElement.classList.remove('dark');
  page.documentElement.style.colorScheme = 'light';
  page.documentElement.style.backgroundColor = '#fff';
  page.body.style.backgroundColor = '#fff';
  page.body.style.color = '#000';

  if (!printDocument.value) {
    closeChannelPrintWindow();
    return;
  }

  const pageStyle = page.createElement('style');
  pageStyle.textContent =
    printDocument.value.layout === 'wallet'
      ? '@page { size: letter portrait; margin: 0.4in; }'
      : '@page { size: letter landscape; margin: 0.35in; }';
  page.head.append(pageStyle);
  page.documentElement.style.height = 'auto';
  page.documentElement.style.overflow = 'visible';
  page.body.style.height = 'auto';
  page.body.style.overflow = 'visible';
  const root = page.getElementById('__nuxt');

  if (root instanceof HTMLElement) {
    root.style.height = 'auto';
    root.style.overflow = 'visible';
  }

  if (page.fonts) {
    await page.fonts.ready;
  }

  await nextTick();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

  const finish = (): void => {
    closeChannelPrintWindow();
  };

  window.addEventListener('afterprint', finish, { once: true });

  try {
    window.print();
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : typeof cause === 'string'
          ? cause
          : 'Printing is not allowed in this window.';

    await reportChannelPrintError(message);
    window.removeEventListener('afterprint', finish);
    closeChannelPrintWindow();
  }
});
</script>

<template>
  <div v-if="printDocument" class="channel-print-page px-8 py-6 text-[11pt] text-black">
    <header class="mb-4 border-b border-black/20 pb-3">
      <h1 class="text-lg font-semibold">{{ printDocument.title }}</h1>
      <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <template v-for="line in printDocument.headerLines" :key="line.label">
          <dt class="font-medium">{{ line.label }}</dt>
          <dd>{{ line.value }}</dd>
        </template>
      </dl>
    </header>

    <table v-if="printDocument.layout === 'full'" class="selectable-print channel-print-table w-full border-collapse">
      <thead>
        <tr>
          <th
            v-for="column in printDocument.columns"
            :key="column.id"
            class="border border-black/30 px-1 py-0.5 text-left font-semibold"
            :class="columnClass(column.id)"
          >
            {{ column.header }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in printDocument.rows" :key="index">
          <td
            v-for="column in printDocument.columns"
            :key="column.id"
            class="border border-black/20 px-1 py-0.5 align-top tabular-nums"
            :class="columnClass(column.id)"
          >
            {{ row[column.id] ?? '' }}
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else class="wallet-columns selectable-print text-[8pt] leading-tight">
      <div v-for="(line, index) in printDocument.walletLines" :key="index" class="wallet-line mb-1">
        <span v-if="line.slot" class="tabular-nums">{{ line.slot }}</span>
        <span v-if="line.slot">&nbsp;</span>
        <span class="font-medium">{{ line.name }}</span>
        <span>&nbsp;{{ line.rx }}</span>
        <span>&nbsp;{{ line.offset }}</span>
        <span>&nbsp;{{ line.tone }}</span>
        <div v-if="line.notes" class="text-[7pt]">{{ line.notes }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.channel-print-page {
  color-scheme: light;
  background: #fff;
  color: #000;
}

.channel-print-table {
  table-layout: fixed;
  font-size: 8pt;
  line-height: 1.15;
}

.selectable-print {
  user-select: text;
}

.wallet-columns {
  column-count: 3;
  column-gap: 1rem;
}

.wallet-line {
  break-inside: avoid;
  page-break-inside: avoid;
}

@media print {
  .channel-print-page {
    padding: 0;
    background: #fff;
    color: #000;
  }
}
</style>
