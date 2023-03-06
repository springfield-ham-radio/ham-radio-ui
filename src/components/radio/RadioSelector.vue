<template>
  <q-select class="col" outlined label="Manufacturer" v-model="manufacturer" :options="radioStore.manufacturers" option-label="name" />
  <q-select class="col" outlined label="Model" v-model="model" :options="models" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRadioStore } from 'src/stores/radio-store';

const manufacturer = ref();
const model = ref();
const radioStore = useRadioStore();

const emit = defineEmits(['radioManufacturerSelected', 'radioModelSelected']);

const models = computed(() => {
  if (manufacturer.value == undefined) {
    return [];
  }

  return manufacturer.value.models;
});

watch(manufacturer, (value) => {
  model.value = undefined;
  emit('radioManufacturerSelected', value.id);
});

watch(model, (value) => {
  emit('radioModelSelected', value);
});

</script>
