<template>
  <Select placeholder="Manufacturer" v-model="manufacturer" :options="manufacturers" />
  <Select placeholder="Model" v-model="model" :options="radioIds" :disabled="manufacturer == undefined" optionLabel="name" />
</template>

<script setup lang="ts">
import { useRadioStore } from '../stores/radios';
import { RadioId } from '@springfield/ham-radio-api';
import { computed, ref } from 'vue';
import { Select } from 'primevue';

const manufacturer = ref<string>();

const model = defineModel<RadioId>();
const radioStore = useRadioStore();

const manufacturers = computed(() => {
  const manufacturers = new Set<string>();

  for (const radio of radioStore.radiosById.values()) {
    manufacturers.add(radio.getId().manufacturer);
  }

  return Array.from(manufacturers);
});

const radioIds = computed(() => {
  return Array.from(radioStore.radiosById.values()).map(radio => radio.getId()).filter((radioId) => radioId.manufacturer === manufacturer.value);
});
</script>
