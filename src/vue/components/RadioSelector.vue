<template>
  <Select placeholder="Manufacturer" v-model="manufacturer" :options="manufacturers" />
  <Select placeholder="Model" v-model="model" :options="radioModels" :disabled="manufacturer == undefined" optionLabel="name" />
</template>

<script setup lang="ts">
import { useRadioStore } from '../stores/radios';
import { RadioModel } from '@springfield/ham-radio-api';
import { computed, ref } from 'vue';
import { Select } from 'primevue';

const manufacturer = ref<string>();

const model = defineModel<RadioModel>();
const radioStore = useRadioStore();

const manufacturers = computed(() => {
  const manufacturers = new Set<string>();

  for (const model of radioStore.models) {
    manufacturers.add(model.manufacturer);
  }

  return Array.from(manufacturers);
});

const radioModels = computed(() => {
  return radioStore.models.filter((model) => model.manufacturer === manufacturer.value);
});
</script>
