<script setup lang="ts">
import type { ProtocolDisplayMessage, ProtocolDisplayStep, ProtocolDisplayToken } from '~/utils/protocol-display';

const props = defineProps<{
  steps: ProtocolDisplayStep[];
  serialSummary?: string;
  /** When set, that step is highlighted and steps can be chosen. Omit it for a read-only diagram. */
  selectedIndex?: number;
  emptyLabel?: string;
}>();

const emit = defineEmits<{
  select: [index: number];
}>();

const scroller = useTemplateRef<HTMLElement>('scroller');
const stepElements: HTMLElement[] = [];

const selectable = computed(() => props.selectedIndex !== undefined);

function setStepElement(element: Element | ComponentPublicInstance | null, index: number): void {
  if (element instanceof HTMLElement) {
    stepElements[index] = element;
    return;
  }

  delete stepElements[index];
}

function onSelect(index: number): void {
  if (!selectable.value) {
    return;
  }

  emit('select', index);
}

function scrollSelectedIntoView(index: number | undefined): void {
  const container = scroller.value;
  const target = index === undefined ? undefined : stepElements[index];

  if (!container || !target) {
    return;
  }

  const delta = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
  container.scrollTop += delta - 12;
}

watch(
  () => props.selectedIndex,
  (index) => {
    void nextTick(() => {
      scrollSelectedIntoView(index);
    });
  },
  { immediate: true },
);

const tokenClassNames: Record<ProtocolDisplayToken['kind'], string> = {
  hex: 'bg-elevated text-highlighted ring-default',
  ascii: 'bg-info/10 text-info ring-info/20',
  control: 'bg-warning/10 text-warning ring-warning/20',
  placeholder: 'bg-primary/10 text-primary ring-primary/25',
  length: 'bg-success/10 text-success ring-success/20',
  delimiter: 'bg-success/10 text-success ring-success/20',
};

function tokenClass(token: ProtocolDisplayToken): string {
  return `inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] leading-4 ring-1 ${tokenClassNames[token.kind]}`;
}

function messageLabel(message: ProtocolDisplayMessage): string {
  const tokens = message.tokens.map((token) => token.label).join(' ');
  const annotation = message.annotation ? ` (${message.annotation})` : '';

  if (message.direction === 'send') {
    return `Computer to radio: ${tokens}${annotation}`;
  }

  return `Radio to computer: ${tokens}${annotation}`;
}
</script>

<template>
  <div ref="scroller" class="relative min-h-0 flex-1 overflow-auto">
    <div class="mx-auto w-full max-w-3xl px-2 py-3">
      <p v-if="serialSummary" class="mb-3 text-center text-xs text-muted">{{ serialSummary }}</p>

      <div class="pb-4">
        <div class="mb-4 flex">
          <div class="flex w-1/2 justify-center">
            <div class="rounded-lg bg-default px-3 py-1.5 text-xs font-semibold text-highlighted shadow-sm ring-1 ring-default">
              Computer
            </div>
          </div>
          <div class="flex w-1/2 justify-center">
            <div class="rounded-lg bg-default px-3 py-1.5 text-xs font-semibold text-highlighted shadow-sm ring-1 ring-default">
              Radio
            </div>
          </div>
        </div>

        <div class="relative @container">
          <div class="pointer-events-none absolute inset-y-0 left-1/4 w-px bg-accented" />
          <div class="pointer-events-none absolute inset-y-0 left-3/4 w-px bg-accented" />

          <p v-if="steps.length === 0" class="relative py-8 text-center text-sm text-muted">
            {{ emptyLabel ?? 'This radio has no protocol steps to display.' }}
          </p>

          <section
            v-for="(step, stepIndex) in steps"
            :key="`${step.kind}-${stepIndex}`"
            :ref="(element) => setStepElement(element, stepIndex)"
            class="relative mb-5 rounded-lg"
            :class="
              selectedIndex === stepIndex
                ? 'bg-primary/10 py-2 ring-2 ring-primary'
                : selectable
                  ? 'cursor-pointer'
                  : ''
            "
            :aria-current="selectedIndex === stepIndex ? 'step' : undefined"
            @click="onSelect(stepIndex)"
          >
          <div class="mb-2 flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1">
            <h3 class="text-sm font-medium text-highlighted">{{ step.title }}</h3>
            <span v-for="note in step.notes" :key="note" class="text-[11px] text-muted">{{ note }}</span>
          </div>

          <div class="grid grid-cols-[1fr_auto_1fr] py-2">
            <div
              v-if="step.loop"
              class="col-start-2 row-start-1 row-span-2 min-w-[min(100cqw,calc(50cqw+2.5rem))] max-w-full rounded-lg border border-dashed border-primary/30 bg-primary/5"
            />
            <p
              v-if="step.loop"
              class="relative z-10 col-start-2 row-start-1 mb-1 flex w-fit max-w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 self-start px-3 pt-2 text-center text-[11px] text-primary"
            >
              <UIcon name="i-lucide-repeat" class="size-3.5 shrink-0" />
              <span class="font-medium">{{ step.loop.label }}</span>
              <span class="text-toned">· {{ step.loop.detail }}</span>
            </p>

            <div class="relative z-10 col-start-1 col-span-3" :class="step.loop ? 'row-start-2 pb-2' : ''">
            <div
              v-for="(message, messageIndex) in step.messages"
              :key="`${stepIndex}-${messageIndex}`"
              class="relative py-2.5"
              :aria-label="messageLabel(message)"
            >
              <div
                class="absolute top-1/2 left-1/4 right-1/4 h-px -translate-y-1/2"
                :class="message.direction === 'send' ? 'bg-warning' : 'bg-success'"
              />
              <UIcon
                :name="message.direction === 'send' ? 'i-lucide-chevron-right' : 'i-lucide-chevron-left'"
                class="absolute top-1/2 size-4 -translate-y-1/2"
                :class="message.direction === 'send' ? 'right-[calc(25%-0.5rem)] text-warning' : 'left-[calc(25%-0.5rem)] text-success'"
              />
              <div class="relative flex justify-center">
                <div class="flex max-w-[70%] flex-wrap items-center justify-center gap-1 rounded-md bg-default px-2 py-0.5">
                  <template v-for="(token, tokenIndex) in message.tokens" :key="`${messageIndex}-${tokenIndex}-${token.label}`">
                    <UTooltip v-if="token.title" :text="token.title" :delay-duration="200">
                      <span :class="tokenClass(token)">{{ token.label }}</span>
                    </UTooltip>
                    <span v-else :class="tokenClass(token)">{{ token.label }}</span>
                  </template>
                </div>
              </div>
            </div>
            </div>
          </div>
          </section>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-center gap-3 border-t border-default pt-3 text-[11px] text-muted">
        <span class="inline-flex items-center gap-1">
          <span class="inline-block size-2 rounded-sm bg-warning" />
          Computer → radio
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="inline-block size-2 rounded-sm bg-success" />
          Radio → computer
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="rounded-sm bg-primary/10 px-1 font-mono text-primary ring-1 ring-primary/25">$data</span>
          Placeholder
        </span>
      </div>
    </div>
  </div>
</template>
