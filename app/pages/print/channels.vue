<script setup lang="ts">
import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import {
  clearChannelPrintDocument,
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

function closePrintWindow(): void {
  clearChannelPrintDocument();

  if (isTauriRuntime()) {
    void import('@tauri-apps/api/webviewWindow').then(({ WebviewWindow }) => {
      void WebviewWindow.getCurrent().close();
    });
    return;
  }

  window.close();
}

onMounted(async () => {
  const page = globalThis.document;
  page.documentElement.classList.remove('dark');
  page.documentElement.style.colorScheme = 'light';
  page.documentElement.style.backgroundColor = '#fff';
  page.body.style.backgroundColor = '#fff';
  page.body.style.color = '#000';

  if (!printDocument.value) {
    closePrintWindow();
    return;
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
    closePrintWindow();
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
    closePrintWindow();
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

    <table v-if="printDocument.layout === 'full'" class="selectable-print w-full border-collapse text-xs">
      <thead>
        <tr>
          <th
            v-for="column in printDocument.columns"
            :key="column.id"
            class="border border-black/30 px-2 py-1 text-left font-semibold"
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
            class="border border-black/20 px-2 py-1 align-top tabular-nums"
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

@page {
  margin: 0.5in;
}

@media print {
  .channel-print-page {
    padding: 0;
    background: #fff;
    color: #000;
  }
}
</style>
