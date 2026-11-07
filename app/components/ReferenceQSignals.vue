<script setup lang="ts">
import { filterQSignals } from '~/utils/q-signals';

const query = ref('');
const signals = computed(() => filterQSignals(query.value));
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <p class="max-w-3xl text-xs text-muted">
        These are the ITU question and the ITU statement from Recommendation ITU-R M.1172.
        On CW, a question mark after the group makes it the question. On phone, RQ does that.
        Without the question mark, the group is the statement or advice.
        C or NO (Charlie or NO) affirms or negates a group.
        An “On the air” note is amateur custom, not a second official meaning.
        QST is an ARRL bulletin prefix, not an ITU Q code, so it is not listed.
      </p>
      <div class="w-full sm:w-56">
        <label for="q-search" class="mb-1 block text-xs font-medium text-highlighted">Search</label>
        <UInput id="q-search" v-model="query" icon="i-lucide-search" placeholder="QTH, fading, power" autocomplete="off" />
      </div>
    </div>

    <div class="overflow-x-auto rounded-lg border border-default">
      <table class="w-full min-w-[40rem] border-collapse text-sm">
        <thead class="bg-elevated text-left text-xs text-muted">
          <tr>
            <th scope="col" class="px-3 py-2 font-medium">Group</th>
            <th scope="col" class="px-3 py-2 font-medium">Question</th>
            <th scope="col" class="px-3 py-2 font-medium">Statement or advice</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="signal in signals" :key="signal.code" class="border-t border-default align-top">
            <th scope="row" class="px-3 py-2 font-mono text-highlighted">{{ signal.code }}</th>
            <td class="px-3 py-2">{{ signal.question }}</td>
            <td class="px-3 py-2">
              <p>{{ signal.statement }}</p>
              <p v-if="signal.operatingNote" class="mt-1 text-xs text-muted">
                On the air: {{ signal.operatingNote }}
              </p>
            </td>
          </tr>
          <tr v-if="signals.length === 0">
            <td colspan="3" class="px-3 py-4 text-sm text-muted">No matches.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
