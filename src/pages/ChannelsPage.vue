<template>
  <q-page class="">
    <h1>Under Construction</h1>
    <p>This page will allow you to manage channel definitions that can be reused across any radio.</p>
    {{ radioStore.dbUri }}
  </q-page>
</template>

<script setup lang="ts">
import { useRadioStore } from 'src/stores/radio-store';

const radioStore = useRadioStore();

</script>
