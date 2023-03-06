<template>
  <q-select class="col" outlined label="Manufacturer" v-model="manufacturer" :options="radioStore.manufacturers" option-label="name" />
  <q-select class="col" outlined label="Model" v-model="model" :options="radioStore.models" :disable="manufacturer == undefined" option-label="name" />
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRadioStore } from 'src/stores/radio-store';

const manufacturer = ref();
const model = ref();
const radioStore = useRadioStore();

const emit = defineEmits(['radioManufacturerSelected', 'radioModelSelected']);

onMounted(() => {
  radioStore.loadManufacturers();
});

watch(manufacturer, (value) => {
  model.value = undefined;
  radioStore.loadModels(value.moduleId);
  emit('radioManufacturerSelected', value.moduleId);
});

watch(model, (value) => {
  emit('radioModelSelected', value.name);
});

</script>
