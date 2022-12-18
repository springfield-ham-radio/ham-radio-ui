<template>
  <q-page class="">
    <h1>Radio</h1>
    <div class="q-pa-md q-gutter-sm">
      <q-btn round color="primary" icon="input">
        <q-tooltip>
          Import from radio
        </q-tooltip>
      </q-btn>
      <suspense>
        <serial-port-selector />
      </suspense>
    </div>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import SerialPortSelector from 'components/SerialPortSelector.vue';

export default defineComponent({
  name: 'ChannelsPage',
  components: { SerialPortSelector },
});
</script>
