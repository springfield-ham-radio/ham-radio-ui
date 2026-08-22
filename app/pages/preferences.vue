<script setup lang="ts">
useHead({
  title: 'Preferences',
});
</script>

<template>
  <div class="h-full overflow-y-auto bg-muted">
    <div class="mx-auto flex max-w-xl flex-col gap-8 px-6 py-10">
      <section class="flex flex-col gap-2">
        <h2 class="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Appearance</h2>
        <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
          <div class="flex items-center justify-between gap-4 px-4 py-3">
            <div class="min-w-0">
              <p class="text-sm font-medium text-highlighted">Theme</p>
              <p class="text-xs text-muted">Use light, dark, or match the system appearance.</p>
            </div>
            <ThemeSelect />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
