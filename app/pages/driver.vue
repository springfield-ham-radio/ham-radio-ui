<script setup lang="ts">
useHead({ title: 'Driver' });

const { panels } = useDeveloperPanels();
const router = useRouter();

watch(
  () => panels.value.driverDevelopment,
  (on) => {
    if (!on) {
      void router.replace('/');
    }
  },
  { immediate: true },
);
</script>

<template>
  <DriverEditor v-if="panels.driverDevelopment" />
</template>
