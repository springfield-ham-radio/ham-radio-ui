<template>
  <q-select class="col" outlined label="Manufacturer" v-model="manufacturer" :options="radioStore.manufacturers" option-label="name" />
  <q-select class="col" outlined label="Model" v-model="model" :options="filteredModels" option-label="modelName" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRadioStore } from 'stores/radios-store';
import { emit } from 'process';

const manufacturer = ref();
const model = ref();
const radioStore = useRadioStore();

const emit = defineEmits(['radioSelected']);

const filteredModels = computed(() => {
  if (manufacturer.value == undefined) {
    return [];
  }

  return radioStore.models.filter((model) => model.manufacturerId == manufacturer.value.id);
});

watch(manufacturer, () => {
  model.value = undefined;
});

watch(model, (value) => {
  emit('radioSelected', value);
});

</script>
