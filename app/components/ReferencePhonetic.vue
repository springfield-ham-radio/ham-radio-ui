<script setup lang="ts">
import { filterPhoneticEntries, type PhoneticEntry } from '~/utils/phonetic-alphabet';

const query = ref('');
const entries = computed(() => filterPhoneticEntries(query.value));
const letters = computed(() => entries.value.filter((entry) => entry.group === 'letter'));
const figures = computed(() => entries.value.filter((entry) => entry.group === 'figure'));

function columns(rows: PhoneticEntry[]): PhoneticEntry[][] {
  const half = Math.ceil(rows.length / 2);
  return [rows.slice(0, half), rows.slice(half)].filter((column) => column.length > 0);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <p class="max-w-3xl text-xs text-muted">
        ITU Radio Regulations Appendix 14. Spellings are Alfa and Juliett.
        The spoken column is the Regulation’s “spoken as” text. Stressed syllables are underlined in the original table and are not marked here.
        Figure code is for spelling digits and the decimal point. Everyday English numbers are not this code.
        Stations of one country may use another table their administration recognizes.
      </p>
      <div class="w-full sm:w-56">
        <label for="phonetic-search" class="mb-1 block text-xs font-medium text-highlighted">Search</label>
        <UInput id="phonetic-search" v-model="query" icon="i-lucide-search" placeholder="Letter, word, or digit" autocomplete="off" />
      </div>
    </div>

    <section v-if="letters.length > 0" aria-labelledby="phonetic-letters">
      <h3 id="phonetic-letters" class="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Letters</h3>
      <div class="grid gap-3 lg:grid-cols-2">
        <table v-for="(column, index) in columns(letters)" :key="index" class="w-full border-collapse text-sm">
          <thead>
            <tr class="border-b border-default text-left text-xs text-muted">
              <th scope="col" class="py-1 pr-3 font-medium">Letter</th>
              <th scope="col" class="py-1 pr-3 font-medium">Code word</th>
              <th scope="col" class="py-1 font-medium">Spoken as</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in column" :key="entry.symbol" class="border-b border-default/70">
              <th scope="row" class="py-1.5 pr-3 font-mono text-base font-semibold text-highlighted">{{ entry.symbol }}</th>
              <td class="py-1.5 pr-3 text-highlighted">{{ entry.word }}</td>
              <td class="py-1.5 font-mono text-xs text-muted">{{ entry.spoken }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="figures.length > 0" aria-labelledby="phonetic-figures">
      <h3 id="phonetic-figures" class="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Figures and marks</h3>
      <table class="w-full border-collapse text-sm sm:max-w-xl">
        <thead>
          <tr class="border-b border-default text-left text-xs text-muted">
            <th scope="col" class="py-1 pr-3 font-medium">Figure</th>
            <th scope="col" class="py-1 pr-3 font-medium">Code word</th>
            <th scope="col" class="py-1 font-medium">Spoken as</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in figures" :key="entry.symbol" class="border-b border-default/70">
            <th scope="row" class="py-1.5 pr-3 font-mono text-base font-semibold text-highlighted">{{ entry.symbol }}</th>
            <td class="py-1.5 pr-3 text-highlighted">{{ entry.word }}</td>
            <td class="py-1.5 font-mono text-xs text-muted">{{ entry.spoken }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <p v-if="entries.length === 0" class="text-sm text-muted">No matches.</p>
  </div>
</template>
