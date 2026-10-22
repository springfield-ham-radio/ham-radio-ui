<script setup lang="ts">
const { draft } = useDriverDraft();

const onErrorSummary = computed(() => {
  const read = draft.value.onErrorReadSteps.length;
  const write = draft.value.onErrorWriteSteps.length;

  if (read === 0 && write === 0) {
    return undefined;
  }

  const parts: string[] = [];

  if (read > 0) {
    parts.push(`${read} read cleanup step${read === 1 ? '' : 's'}`);
  }

  if (write > 0) {
    parts.push(`${write} write cleanup step${write === 1 ? '' : 's'}`);
  }

  return parts.join(', ');
});
</script>

<template>
  <div class="flex w-full flex-col gap-4">
    <DriverFormSection title="Identity">
      <DriverIdentityForm />
    </DriverFormSection>
    <DriverFormSection title="Serial">
      <DriverSerialForm />
    </DriverFormSection>
    <DriverFormSection title="Memory">
      <DriverMemoryForm />
    </DriverFormSection>
    <DriverFormSection v-if="onErrorSummary" title="Error cleanup">
      <p class="text-sm text-muted">
        {{ onErrorSummary }}. These exchange-only steps run after a failed or cancelled transfer. Edit them in the
        exported JSON until the driver editor supports them directly.
      </p>
    </DriverFormSection>
  </div>
</template>
