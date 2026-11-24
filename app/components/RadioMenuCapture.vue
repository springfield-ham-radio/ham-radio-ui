<script setup lang="ts">
import DriverMemoryHexDiff from '~/components/driver/DriverMemoryHexDiff.vue';
import { requiredToggleGroupModel } from '~/utils/required-toggle-group-model';
import { loadMenuCaptureBaseline, loadMenuCaptureStepImage } from '~/utils/menu-capture-io';
import { savedRadioModelLabel } from '~/utils/saved-radios';

type WizardPhase = 'intro' | 'baseline' | 'change' | 'review' | 'more' | 'restore' | 'export';

const {
  session,
  loadingSession,
  captureBusy,
  canPersist,
  hasBaseline,
  isCaptureActive,
  savedRadio,
  cardRadio,
  activeConfig,
  wizardGate,
  configurations,
  startSession,
  readBaseline,
  readStepImage,
  commitStep,
  redoLastStep,
  restoreBaseline,
  exportCapture,
  discardSession,
  defaultCallsign,
  menuLookup,
  analyzeMenuCaptureStep,
  memoryMap,
  memoryConfig,
  ignoreEntries,
} = useMenuCapture();

const phase = ref<WizardPhase>('intro');
const menuNumber = ref<number | undefined>();
const menuName = ref('');
const menuNameSource = ref<'map' | 'operator'>('operator');
const changeFrom = ref('');
const changeTo = ref('');
const changeNote = ref('');
const callsign = ref('');
const operatorNotes = ref('');
const firmware = ref('');
const pendingBeforeImage = shallowRef<Uint8Array | undefined>();
const pendingAfterImage = shallowRef<Uint8Array | undefined>();
const pendingAnalysis = shallowRef<ReturnType<typeof analyzeMenuCaptureStep> | undefined>();
const reviewDecision = ref<'keep' | 'redo'>('keep');
const restoreConfirmed = ref(false);
const reviewDecisionModel = requiredToggleGroupModel(
  () => reviewDecision.value,
  (value) => {
    reviewDecision.value = value;
  },
);
const restoring = ref(false);

const stepperItems = [
  { title: 'Start', value: 'intro' },
  { title: 'Baseline', value: 'baseline' },
  { title: 'Capture', value: 'change' },
  { title: 'Restore', value: 'restore' },
  { title: 'Export', value: 'export' },
];

const menuPrefill = computed(() => {
  const number = menuNumber.value;

  if (number === undefined || !memoryMap.value) {
    return undefined;
  }

  return menuLookup(number);
});

watch(menuPrefill, (lookup) => {
  if (!lookup?.prefilledName) {
    menuNameSource.value = 'operator';
    return;
  }

  menuName.value = lookup.prefilledName;
  menuNameSource.value = 'map';
});

watch(
  session,
  (value) => {
    if (!value) {
      phase.value = 'intro';
      return;
    }

    if (!value.baselineByteLength) {
      phase.value = 'baseline';
      return;
    }

    if (value.restore?.matchesBaseline) {
      phase.value = 'export';
      return;
    }

    if (pendingAfterImage.value) {
      phase.value = 'review';
      return;
    }

    if (phase.value === 'intro' || phase.value === 'baseline') {
      phase.value = value.steps.length > 0 ? 'more' : 'change';
    }
  },
  { immediate: true },
);

onMounted(() => {
  callsign.value = defaultCallsign() ?? '';
});

async function onStart(): Promise<void> {
  await startSession();
  phase.value = 'baseline';
}

async function onReadBaseline(): Promise<void> {
  const ok = await readBaseline();

  if (ok) {
    phase.value = 'change';
  }
}

async function onReadStep(): Promise<void> {
  const number = menuNumber.value;
  const current = session.value;

  if (number === undefined || !current || !menuName.value.trim() || !changeFrom.value.trim() || !changeTo.value.trim()) {
    return;
  }

  const before =
    current.steps.length === 0
      ? await loadMenuCaptureBaseline(current.savedRadioId)
      : await loadMenuCaptureStepImage(current.savedRadioId, current.steps.at(-1)!.imageFileName);

  const after = await readStepImage();

  if (!after) {
    return;
  }

  pendingBeforeImage.value = before;
  pendingAfterImage.value = after;
  pendingAnalysis.value = analyzeMenuCaptureStep({
    before,
    after,
    memoryMap: memoryMap.value,
    memoryConfig: memoryConfig.value,
    ignore: ignoreEntries.value,
  });
  reviewDecision.value = 'keep';
  phase.value = 'review';
}

async function onConfirmReview(): Promise<void> {
  const image = pendingAfterImage.value;
  const number = menuNumber.value;

  if (!image || number === undefined) {
    return;
  }

  if (reviewDecision.value === 'redo') {
    pendingBeforeImage.value = undefined;
    pendingAfterImage.value = undefined;
    pendingAnalysis.value = undefined;
    phase.value = 'change';
    return;
  }

  await commitStep({
    menuNumber: number,
    menuName: menuName.value.trim(),
    nameSource: menuNameSource.value,
    menuCode: menuPrefill.value?.fields.find((field) => field.code)?.code,
    from: changeFrom.value.trim(),
    to: changeTo.value.trim(),
    note: changeNote.value,
    afterImage: image,
  });

  pendingBeforeImage.value = undefined;
  pendingAfterImage.value = undefined;
  pendingAnalysis.value = undefined;
  menuNumber.value = undefined;
  menuName.value = '';
  changeFrom.value = '';
  changeTo.value = '';
  changeNote.value = '';
  phase.value = 'more';
}

async function onRestore(): Promise<void> {
  if (!restoreConfirmed.value) {
    return;
  }

  restoring.value = true;

  try {
    const result = await restoreBaseline();

    if (result.verified) {
      phase.value = 'export';
    } else {
      phase.value = 'restore';
    }
  } finally {
    restoring.value = false;
  }
}

async function onExport(): Promise<void> {
  const path = await exportCapture({
    callsign: callsign.value,
    notes: operatorNotes.value,
    firmware: firmware.value.trim() || null,
  });

  if (path) {
    operatorNotes.value = operatorNotes.value.trim()
      ? `${operatorNotes.value.trim()}\nSaved ${path}`
      : `Saved ${path}`;
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3">
    <UAlert
      v-if="!canPersist"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Desktop app required"
      description="Menu capture saves images under your HamBench app data folder. Use the desktop app on a saved radio card."
    />

    <UAlert
      v-else-if="wizardGate === 'driver-missing'"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Driver not installed"
      :description="`Install the ${savedRadioModelLabel(cardRadio!, configurations)} driver under Preferences → Drivers.`"
    />

    <UAlert
      v-else-if="wizardGate === 'port-missing'"
      color="warning"
      variant="subtle"
      icon="i-lucide-unplug"
      title="Choose a programming port"
      description="Set a serial port on this saved radio before you start menu capture."
    />

    <template v-else-if="wizardGate === 'ready' && !loadingSession">
      <p v-if="isCaptureActive" class="text-xs text-muted">
        This programming port stays reserved for menu capture until you restore the radio and export, or discard the session.
        Read and Write on this card are paused.
      </p>

      <UStepper
        :items="stepperItems"
        :model-value="phase === 'more' || phase === 'review' ? 'change' : phase"
        size="xs"
        :linear="true"
        class="w-full"
      />

      <section v-if="phase === 'intro'" class="space-y-3">
        <p class="text-sm text-muted">
          HamBench will read a baseline image, you change one front-panel menu at a time, then HamBench writes the original image back.
          Save the capture file and send it to your driver maintainer. Nothing is uploaded.
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton v-if="!session" label="Start menu capture" color="primary" :disabled="captureBusy" @click="onStart" />
          <UButton
            v-else
            label="Resume session"
            color="primary"
            variant="outline"
            @click="phase = hasBaseline ? 'change' : 'baseline'"
          />
          <UButton v-if="session" label="Discard session" color="neutral" variant="ghost" @click="discardSession" />
        </div>
      </section>

      <section v-else-if="phase === 'baseline'" class="space-y-3">
        <p class="text-sm text-muted">
          Put the radio in clone mode. Do not change any menus. When you are ready, read the baseline image.
        </p>
        <UButton label="Read baseline" icon="i-hambench-radio-read" color="primary" :loading="captureBusy" @click="onReadBaseline" />
      </section>

      <section v-else-if="phase === 'change'" class="space-y-3">
        <p class="text-sm text-muted">
          On the radio, change exactly one menu and save it on the radio (use the confirm key if the manual requires it). Then describe the change here.
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Menu number">
            <UInput v-model.number="menuNumber" type="number" min="0" class="w-full" />
          </UFormField>
          <UFormField label="Menu name">
            <UInput v-model="menuName" class="w-full" :placeholder="menuPrefill?.prefilledName ?? 'Menu name'" />
          </UFormField>
          <UFormField label="Original value">
            <UInput v-model="changeFrom" class="w-full font-mono" />
          </UFormField>
          <UFormField label="New value">
            <UInput v-model="changeTo" class="w-full font-mono" />
          </UFormField>
        </div>
        <UFormField label="Notes (optional)">
          <UTextarea v-model="changeNote" :rows="2" class="w-full" />
        </UFormField>
        <p v-if="menuPrefill && menuPrefill.fields.length > 1" class="text-xs text-muted">
          Menu {{ menuPrefill.menuNumber }} also maps to: {{ menuPrefill.fields.map((field) => field.label).join(', ') }}.
        </p>
        <UButton label="Read after change" icon="i-hambench-radio-read" color="primary" :loading="captureBusy" @click="onReadStep" />
      </section>

      <section v-else-if="phase === 'review' && pendingAnalysis && pendingBeforeImage && pendingAfterImage" class="space-y-3">
        <UAlert
          v-if="pendingAnalysis.flags.includes('empty')"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="No byte changes"
          description="The radio may not have stored your menu change yet. Use the radio's confirm key, then choose Redo this step."
        />
        <UAlert
          v-if="pendingAnalysis.flags.includes('wide')"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Wide diff"
          description="More than one memory region changed. Change only one menu, or redo this step."
        />
        <p class="text-sm text-muted">
          {{ pendingAnalysis.diff.byteCount }} byte{{ pendingAnalysis.diff.byteCount === 1 ? '' : 's' }} changed in
          {{ pendingAnalysis.diff.runCount }} run{{ pendingAnalysis.diff.runCount === 1 ? '' : 's' }}
          <span v-if="pendingAnalysis.diff.ignoredByteCount > 0">
            ({{ pendingAnalysis.diff.ignoredByteCount }} ignored)
          </span>
        </p>
        <UToggleGroup
          v-model="reviewDecisionModel"
          type="single"
          :items="[
            { label: 'Keep this step', value: 'keep' },
            { label: 'Redo this step', value: 'redo' },
          ]"
          class="w-full"
        />
        <DriverMemoryHexDiff
          v-if="pendingAnalysis.diff.runCount > 0"
          :before="pendingBeforeImage"
          :after="pendingAfterImage"
          before-label="Previous read"
          after-label="This read"
        />
        <UButton label="Continue" color="primary" @click="onConfirmReview" />
      </section>

      <section v-else-if="phase === 'more'" class="space-y-3">
        <p class="text-sm text-muted">
          {{ session?.steps.length ?? 0 }} menu{{ (session?.steps.length ?? 0) === 1 ? '' : 's' }} captured.
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton label="Capture another menu" color="primary" @click="phase = 'change'" />
          <UButton label="Restore original radio image" color="neutral" variant="outline" @click="phase = 'restore'" />
          <UButton label="Redo last step" color="neutral" variant="ghost" :disabled="!session?.steps.length" @click="redoLastStep" />
        </div>
      </section>

      <section v-else-if="phase === 'restore'" class="space-y-3">
        <UAlert
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="This writes the baseline image"
          :description="`HamBench will write the baseline read from ${session?.baselineReadAt ?? 'this session'} back to the radio. Every menu you changed on the radio will be reverted.`"
        />
        <UCheckbox v-model="restoreConfirmed" label="I understand. Write the original baseline image to the radio." />
        <UButton
          label="Write original image to radio"
          icon="i-hambench-radio-write"
          color="primary"
          :disabled="!restoreConfirmed"
          :loading="restoring || captureBusy"
          @click="onRestore"
        />
        <p v-if="session?.restore?.matchesBaseline === false" class="text-sm text-error">
          Verification read did not match the baseline. Check the cable and try another verification read from the Restore step.
        </p>
        <p v-else-if="session?.restore?.matchesBaseline" class="text-sm text-success">
          Radio matches the baseline read.
        </p>
      </section>

      <section v-else-if="phase === 'export'" class="space-y-3">
        <p class="text-sm text-muted">Save the capture file and send it yourself. HamBench does not upload it.</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Callsign">
            <UInput v-model="callsign" class="w-full uppercase" />
          </UFormField>
          <UFormField label="Firmware (optional)">
            <UInput v-model="firmware" class="w-full font-mono" placeholder="If you know it" />
          </UFormField>
        </div>
        <UFormField label="Notes for the driver maintainer">
          <UTextarea v-model="operatorNotes" :rows="3" class="w-full" />
        </UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton label="Save capture file" icon="i-lucide-download" color="primary" @click="onExport" />
          <UButton label="Discard session" color="neutral" variant="ghost" @click="discardSession" />
        </div>
      </section>
    </template>
  </div>
</template>