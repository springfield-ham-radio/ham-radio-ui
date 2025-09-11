import { defineStore } from 'pinia';
import { RadioModelId } from '@springfield/ham-radio-api';
import type { RegistryRadio } from '@springfield/ham-radio-registry/dist/types/radio-config.js';
import { ref } from 'vue';

export const useRadioStore = defineStore("radio-drivers", () => {
  const configurations = ref<RegistryRadio[]>([]);
  const manufacturers = ref<string[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const initialize = async () => {
    isLoading.value = true;
    error.value = null;
    
    try {
      // Load configurations
      const configResult = await window.registry.discoverConfigurations();
      if (!configResult.success) {
        throw new Error(configResult.error || 'Failed to load configurations');
      }
      configurations.value = configResult.data || [];

      // Load manufacturers
      const manufacturerResult = await window.registry.getManufacturers();
      if (!manufacturerResult.success) {
        throw new Error(manufacturerResult.error || 'Failed to load manufacturers');
      }
      manufacturers.value = manufacturerResult.data || [];
      
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load radio configurations';
      console.error('Failed to initialize radio store:', err);
    } finally {
      isLoading.value = false;
    }
  };

  const getModelsByManufacturer = async (manufacturer: string) => {
    try {
      const result = await window.registry.getModelsByManufacturer(manufacturer);
      if (!result.success) {
        throw new Error(result.error || 'Failed to load models');
      }
      return result.data || [];
    } catch (err) {
      console.error(`Failed to get models for manufacturer ${manufacturer}:`, err);
      return [];
    }
  };

  const getConfiguration = async (modelId: RadioModelId): Promise<RegistryRadio | undefined> => {
    try {
      const result = await window.registry.getConfiguration(modelId);
      if (!result.success) {
        console.error(`Failed to get configuration for ${modelId}:`, result.error);
        return undefined;
      }
      return result.data;
    } catch (err) {
      console.error(`Failed to get configuration for ${modelId}:`, err);
      return undefined;
    }
  };

  return { 
    configurations, 
    manufacturers, 
    isLoading, 
    error, 
    initialize, 
    getModelsByManufacturer, 
    getConfiguration
  };
});
