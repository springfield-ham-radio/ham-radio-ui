<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-btn v-if="databaseConnected"
          flat
          dense
          round
          icon="menu"
          aria-label="Menu"
          @click="toggleLeftDrawer"
        />

        <q-toolbar-title> Ham Delux </q-toolbar-title>

        <div class="q-mr-md" v-if="!databaseConnected">
          <q-spinner size="2em" />
          Starting database...
        </div>
        <div>{{ "1.0.0" }}</div>
      </q-toolbar>
    </q-header>

    <q-drawer v-if="databaseConnected" v-model="leftDrawerOpen" show-if-above bordered>
      <q-list>
        <q-item clickable v-ripple v-for="route in routes" :key="route.path" :to="route.path">
          <q-item-section>{{ route.name }}</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view v-if="databaseConnected" />
      <div v-else>
        Connecting to database
      </div>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { RadioManufacturer, RadioModel } from '@springfield/ham-radio-api';
import { useRadioStore } from 'src/stores/radio-store';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

const leftDrawerOpen = ref(false);
const databaseConnected = ref(false);
const routes = useRouter().options.routes[0].children;

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value;
};

onMounted(() => {
  window.electronAPI.onDatabaseConnected(async (_event: unknown) => {
    databaseConnected.value = true;
  });

  window.electronAPI.onManufacturers((_event: unknown, value: RadioManufacturer[]) => {
    useRadioStore().manufacturers = value;
  });

  window.electronAPI.onModels((_event: unknown, value: RadioModel[]) => {
    useRadioStore().models = value;
  });

  window.db.startDatabase();
});
</script>
