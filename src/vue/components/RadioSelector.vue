<template>
  <div class="flex flex-col gap-4">
    <div v-if="radioStore.error" class="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
      Error loading radio configurations: {{ radioStore.error }}
    </div>
    
    <div class="flex flex-col gap-2">
      <label for="manufacturer" class="text-sm font-medium">Manufacturer</label>
      <Select 
        id="manufacturer"
        placeholder="Select Manufacturer" 
        v-model="manufacturer" 
        :options="radioStore.manufacturers" 
        :loading="radioStore.isLoading"
        :disabled="radioStore.isLoading"
      />
    </div>
    
    <div class="flex flex-col gap-2">
      <label for="model" class="text-sm font-medium">Model</label>
      <Select 
        id="model"
        placeholder="Select Model" 
        v-model="selectedModel" 
        :options="radioModels" 
        :disabled="!manufacturer || radioStore.isLoading || modelsLoading" 
        :loading="modelsLoading"
        optionLabel="name" 
        optionValue="id"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRadioStore } from '../stores/radios';
import type { RadioId } from '@springfield/ham-radio-api';
import { ref, watch } from 'vue';
import { Select } from 'primevue';

const manufacturer = ref<string>();
const selectedModel = defineModel<RadioId>();
const radioModels = ref<{ id: RadioId; name: string; config: any }[]>([]);
const modelsLoading = ref(false);

const radioStore = useRadioStore();

// Watch for manufacturer changes and load models
watch(manufacturer, async (newManufacturer) => {
  selectedModel.value = undefined;
  radioModels.value = [];
  
  if (!newManufacturer) {
    return;
  }
  
  modelsLoading.value = true;
  try {
    radioModels.value = await radioStore.getModelsByManufacturer(newManufacturer);
  } catch (error) {
    console.error('Failed to load models:', error);
    radioModels.value = [];
  } finally {
    modelsLoading.value = false;
  }
});
</script>
