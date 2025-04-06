<template>
  <Dialog v-model:visible="showDialog" modal :closable=false :style="{ width: '600px' }" header="Import Progress">
    <ProgressBar :value="progress" :show-value=false :pt:value:style="{ 'transition-duration': '0.25s' }"></ProgressBar>
    <template #footer>
      <div class="flex gap-2 justify-content-end">
        <Button label="Cancel" @click="cancel" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Button, Dialog, ProgressBar } from 'primevue';

const showDialog = ref(false);
const progress = ref<number>(0);

const cancel = () => {
  showDialog.value = false;
  window.radio.cancel();
};

onMounted(() => {
  // Listen for trigger from electron
  window.radio.onShowProgressDialog(() => {
    showDialog.value = true;
  });

  window.radio.onHideProgressDialog(() => {
    progress.value = 0;
    showDialog.value = false;
  });

  // Listen for updates from the progress indicator
  window.radio.onRadioProgressIndicator((_event, value: number) => {
    progress.value = value * 100;
  });
});
</script>
