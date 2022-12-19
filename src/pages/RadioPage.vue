<template>
  <q-page class="">
    <h1>Radio</h1>
    <div class="q-pa-md q-gutter-sm">
      <radio-import-dialog />
    </div>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import RadioImportDialog from 'src/components/RadioImportDialog.vue';

export default defineComponent({
  name: 'ChannelsPage',
  components: { RadioImportDialog },
});
</script>
