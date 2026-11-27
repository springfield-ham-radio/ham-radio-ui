<script setup lang="ts">
const menuNumber = defineModel<number | undefined>('menuNumber');
const menuName = defineModel<string>('menuName', { default: '' });
const changeFrom = defineModel<string>('changeFrom', { default: '' });
const changeTo = defineModel<string>('changeTo', { default: '' });
const changeNote = defineModel<string>('changeNote', { default: '' });

defineProps<{
  menuPrefillHint?: string;
  readOnly?: boolean;
}>();
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2">
    <UFormField label="Menu number">
      <UInput
        v-model.number="menuNumber"
        type="number"
        min="0"
        class="w-full"
        :readonly="readOnly"
        :disabled="readOnly"
      />
    </UFormField>
    <UFormField label="Menu name">
      <UInput v-model="menuName" class="w-full" :placeholder="menuPrefillHint ?? 'Menu name'" :readonly="readOnly" :disabled="readOnly" />
    </UFormField>
    <UFormField label="Original value">
      <UInput v-model="changeFrom" class="w-full font-mono" :readonly="readOnly" :disabled="readOnly" />
    </UFormField>
    <UFormField label="New value">
      <UInput v-model="changeTo" class="w-full font-mono" :readonly="readOnly" :disabled="readOnly" />
    </UFormField>
  </div>
  <UFormField label="Notes">
    <UTextarea v-model="changeNote" :rows="2" class="w-full" :readonly="readOnly" :disabled="readOnly" />
  </UFormField>
</template>