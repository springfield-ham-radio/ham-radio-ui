<script setup lang="ts">
import { tokenizeJson, type JsonTokenKind } from '~/utils/json-highlight';

const props = defineProps<{
  code: string;
}>();

const tokens = computed(() => tokenizeJson(props.code));

const tokenClassNames: Record<JsonTokenKind, string> = {
  key: 'text-info',
  string: 'text-success',
  number: 'text-warning',
  literal: 'text-error',
  punctuation: 'text-muted',
  whitespace: '',
  text: 'text-highlighted',
};
</script>

<template>
  <pre class="px-4 py-3 font-mono text-xs leading-6"><span
    v-for="(token, index) in tokens"
    :key="index"
    :class="tokenClassNames[token.kind]"
  >{{ token.text }}</span></pre>
</template>
