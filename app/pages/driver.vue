<script setup lang="ts">
useHead({ title: 'Driver' });

const { enabled } = useDeveloperMode();
const router = useRouter();

watch(
  enabled,
  (on) => {
    if (!on) {
      void router.replace('/');
    }
  },
  { immediate: true },
);
</script>

<template>
  <DriverEditor v-if="enabled" />
</template>
