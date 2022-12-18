<template>
  Radio Selector
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { useRadiosStore } from 'stores/radios-store';

export default defineComponent({
  name: 'RadioSelector',

  setup () {
    return { ...useRadiosStore() };
  },
});
</script>
