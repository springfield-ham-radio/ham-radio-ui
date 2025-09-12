<template>
  <RadioImportDialog />
  <RadioProgressDialog />
  <RadioPage v-if="currentPage === 'radio'" />
  <SerialLogPage v-if="currentPage === 'serial-log'" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import RadioImportDialog from './components/RadioImportDialog.vue';
import RadioProgressDialog from './components/RadioProgressDialog.vue';
import RadioPage from './pages/RadioPage.vue';
import SerialLogPage from './pages/SerialLogPage.vue';

const currentPage = ref<'radio' | 'serial-log'>('radio');

const handleNavigation = (event: CustomEvent) => {
  console.log('Navigation event received:', event.type, event.detail);
  if (event.type === 'navigate-to-serial-log') {
    currentPage.value = 'serial-log';
  } else if (event.type === 'navigate-to-radio') {
    currentPage.value = 'radio';
  }
};

onMounted(() => {
  window.addEventListener('navigate-to-serial-log', handleNavigation as EventListener);
  window.addEventListener('navigate-to-radio', handleNavigation as EventListener);
});

onUnmounted(() => {
  window.removeEventListener('navigate-to-serial-log', handleNavigation as EventListener);
  window.removeEventListener('navigate-to-radio', handleNavigation as EventListener);
});
</script>
