<template>
  <Dialog v-model:visible="showDialog" modal :closable=false :style="{ width: '600px' }" :header="errorMessage ? 'Import Error' : 'Import Progress'">
    <div v-if="errorMessage" class="p-4 bg-red-100 border border-red-400 text-red-700 rounded mb-4">
      <div class="font-semibold mb-2">An error occurred while reading from the radio:</div>
      <div>{{ errorMessage }}</div>
    </div>
    <ProgressBar v-else :value="progress" :show-value=false :pt:value:style="{ 'transition-duration': '0.25s' }"></ProgressBar>
    <template #footer>
      <div class="flex gap-2 justify-content-end">
        <Button v-if="errorMessage" label="Close" @click="closeDialog" />
        <Button v-else label="Cancel" @click="cancel" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Button, Dialog, ProgressBar } from 'primevue';

const showDialog = ref(false);
const progress = ref<number>(0);
const errorMessage = ref<string>('');

const cancel = () => {
  showDialog.value = false;
  window.radio.cancel();
};

const closeDialog = () => {
  showDialog.value = false;
  errorMessage.value = '';
};

onMounted(() => {
  // Listen for trigger from electron
  window.radio.onShowProgressDialog(() => {
    showDialog.value = true;
    errorMessage.value = '';
  });

  window.radio.onHideProgressDialog(() => {
    progress.value = 0;
    
    if (!errorMessage.value) {
      showDialog.value = false;
    }
  });

  // Listen for updates from the progress indicator
  window.radio.onRadioProgressIndicator((_event, value: number) => {
    progress.value = value * 100;
  });

  // Listen for errors from the radio read operation
  window.radio.onRadioError((_event, error: string) => {
    errorMessage.value = error;
  });
});
</script>
