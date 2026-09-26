<script setup lang="ts">
import { insertNodeAt, removeNode, useSortable } from '@vueuse/integrations/useSortable';
import { DRIVER_PLACEHOLDERS, createDriverToken, type DriverToken, type DriverTokenKind } from '~/utils/driver-draft';

const props = defineProps<{
  tokens: DriverToken[];
  label: string;
  description?: string;
  error?: string;
  /** Keep the existing tokens. Used for a single delimiter byte. */
  fixed?: boolean;
  /** The parent section already shows the label. */
  hideLabel?: boolean;
}>();

const emit = defineEmits<{
  'update:tokens': [tokens: DriverToken[]];
}>();

const kindItems = [
  { label: 'Hex', value: 'hex' },
  { label: 'ASCII', value: 'ascii' },
  { label: 'Placeholder', value: 'placeholder' },
];

const placeholderItems = DRIVER_PLACEHOLDERS.map((item) => ({
  label: item.label,
  value: item.value,
}));

const knownPlaceholders = new Set<string>(DRIVER_PLACEHOLDERS.map((item) => item.value));

function replace(index: number, token: DriverToken): void {
  const next = props.tokens.slice();
  next[index] = token;
  emit('update:tokens', next);
}

function isKind(value: unknown): value is DriverTokenKind {
  return value === 'hex' || value === 'ascii' || value === 'placeholder';
}

function setKind(index: number, value: unknown): void {
  const current = props.tokens[index];

  if (!current || !isKind(value) || current.kind === value) {
    return;
  }

  replace(index, {
    ...current,
    kind: value,
    value: value === 'placeholder' ? '$address' : '',
  });
}

function setValue(index: number, value: string): void {
  const current = props.tokens[index];

  if (!current) {
    return;
  }

  if (current.kind === 'hex') {
    replace(index, {
      ...current,
      value: value.replace(/^0x/i, '').replace(/[^0-9a-fA-F]/g, '').slice(0, 2).toUpperCase(),
    });
    return;
  }

  if (current.kind === 'ascii') {
    replace(index, { ...current, value: [...value].slice(0, 1).join('') });
    return;
  }

  replace(index, { ...current, value });
}

function remove(index: number): void {
  emit(
    'update:tokens',
    props.tokens.filter((_, itemIndex) => itemIndex !== index),
  );
}

function add(kind: DriverTokenKind): void {
  emit('update:tokens', [...props.tokens, createDriverToken(kind, kind === 'placeholder' ? '$address' : '')]);
}

const tokenList = useTemplateRef<HTMLElement>('tokenList');
const sortableTokens = shallowRef<DriverToken[]>([]);

watch(
  () => props.tokens,
  (tokens) => {
    sortableTokens.value = [...tokens];
  },
  { immediate: true },
);

useSortable(tokenList, sortableTokens, {
  animation: 150,
  handle: '.token-drag-handle',
  draggable: '.token-row',
  ghostClass: 'token-row-ghost',
  forceFallback: true,
  onUpdate(event) {
    const fromIndex = event.oldIndex;
    const toIndex = event.newIndex;

    if (fromIndex === undefined || toIndex === undefined || fromIndex === toIndex) {
      return;
    }

    if (event.item && event.from) {
      removeNode(event.item);
      insertNodeAt(event.from, event.item, fromIndex);
    }

    const next = props.tokens.slice();
    const [item] = next.splice(fromIndex, 1);

    if (!item) {
      return;
    }

    next.splice(toIndex, 0, item);
    sortableTokens.value = next;
    emit('update:tokens', next);
  },
});
</script>

<template>
  <UFormField
    :label="label"
    :error="error"
    :ui="hideLabel ? { label: 'sr-only' } : undefined"
  >
    <template v-if="description && !hideLabel" #hint>
      <HelpTooltip :text="description" />
    </template>
    <div class="flex w-full flex-col gap-2">
      <div v-if="tokens.length === 0" class="text-xs text-muted">No bytes yet.</div>
      <div v-else ref="tokenList" class="flex w-full flex-col gap-2">
      <div v-for="(token, index) in tokens" :key="token.id" class="token-row flex w-full flex-wrap items-center gap-1.5">
        <span
          v-if="!fixed && tokens.length > 1"
          class="token-drag-handle inline-flex cursor-grab text-muted active:cursor-grabbing"
          role="button"
          tabindex="0"
          :aria-label="`Drag ${label} token ${index + 1}`"
        >
          <UIcon name="i-lucide-grip-vertical" class="pointer-events-none size-4" />
        </span>
        <USelect
          :model-value="token.kind"
          :items="kindItems"
          value-key="value"
          class="w-36"
          :aria-label="`${label} token ${index + 1} kind`"
          @update:model-value="setKind(index, $event)"
        />
        <USelect
          v-if="token.kind === 'placeholder' && knownPlaceholders.has(token.value)"
          :model-value="token.value"
          :items="placeholderItems"
          value-key="value"
          class="w-40"
          :aria-label="`${label} token ${index + 1} placeholder`"
          @update:model-value="setValue(index, String($event ?? ''))"
        />
        <UInput
          v-else
          :model-value="token.value"
          class="w-28 font-mono"
          :placeholder="token.kind === 'hex' ? '06' : 'S'"
          :aria-label="`${label} token ${index + 1} value`"
          @update:model-value="setValue(index, String($event ?? ''))"
        />
        <UButton
          v-if="!fixed"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="`Remove ${label} token ${index + 1}`"
          @click="remove(index)"
        />
      </div>
      </div>
      <div v-if="!fixed" class="flex flex-wrap gap-1.5">
        <UButton label="Hex" color="neutral" variant="outline" size="xs" icon="i-lucide-plus" @click="add('hex')" />
        <UButton label="ASCII" color="neutral" variant="outline" size="xs" icon="i-lucide-plus" @click="add('ascii')" />
        <UButton
          label="Placeholder"
          color="neutral"
          variant="outline"
          size="xs"
          icon="i-lucide-plus"
          @click="add('placeholder')"
        />
      </div>
    </div>
  </UFormField>
</template>

<style>
.token-row-ghost {
  opacity: 0.45;
}
</style>
