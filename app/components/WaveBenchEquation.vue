<script setup lang="ts">
import 'katex/dist/katex.min.css';
import { renderEquationHtml } from '~/utils/wavebench-math';

const props = defineProps<{
  expression: string;
}>();

const root = ref<HTMLElement | null>(null);
const html = computed(() => renderEquationHtml(props.expression));

function fitEquation(): void {
  const container = root.value;
  const math = container?.querySelector('.katex');

  if (!(container instanceof HTMLElement) || !(math instanceof HTMLElement)) {
    return;
  }

  math.style.fontSize = '1.05em';
  const availableWidth = container.clientWidth;
  const neededWidth = math.scrollWidth;

  if (availableWidth > 0 && neededWidth > availableWidth) {
    math.style.fontSize = `${1.05 * (availableWidth / neededWidth)}em`;
  }
}

watch(html, async () => {
  await nextTick();
  fitEquation();
});

let observer: ResizeObserver | undefined;

onMounted(() => {
  fitEquation();
  observer = new ResizeObserver(() => fitEquation());

  if (root.value) {
    observer.observe(root.value);
  }
});

onUnmounted(() => {
  observer?.disconnect();
});
</script>

<template>
  <div ref="root" class="wavebench-equation min-w-0 text-highlighted" v-html="html" />
</template>

<style scoped>
.wavebench-equation {
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 0.75rem;
  scrollbar-width: thin;
}

.wavebench-equation :deep(.katex-display) {
  margin: 0;
  text-align: left;
}

.wavebench-equation :deep(.katex-display > .katex) {
  text-align: left;
  white-space: nowrap;
}

.wavebench-equation :deep(.katex) {
  color: inherit;
  font-size: 1.05em;
}
</style>
