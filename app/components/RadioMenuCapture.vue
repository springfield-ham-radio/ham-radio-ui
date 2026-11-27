<script setup lang="ts">
import { loadMenuCaptureBaseline, loadMenuCaptureStepImage } from '~/utils/menu-capture-io';
import type { MenuCaptureStepDiff } from '~/utils/menu-capture';
import { menuCaptureReviewHasVisibleDiff } from '~/utils/menu-capture-review';
import {
  menuCaptureRestoreAllowsExport,
  menuCaptureRestoreIsVerified,
  menuCaptureWizardResumePhase,
} from '~/utils/menu-capture-restore';
import { savedRadioModelLabel } from '~/utils/saved-radios';

type WizardPhase = 'intro' | 'baseline' | 'change' | 'review' | 'more' | 'restore' | 'export';

const emit = defineEmits<{
  close: [];
}>();

const toast = useToast();
const { cancelTransfer } = useRadio();

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
  recordCapturedStep,
  patchLastCapturedStep,
  redoLastStep,
  restoreBaseline,
  verifyRestoredBaseline,
  exportCapture,
  completeExportedSession,
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
const restoreConfirmed = ref(false);
const restoring = ref(false);
const verifying = ref(false);
const exportSavedPath = ref<string | undefined>();
const exportCompleted = ref(false);
const discardConfirmOpen = ref(false);
const exporting = ref(false);

const stepperItems = [
  { title: 'Start', value: 'intro' },
  { title: 'Baseline', value: 'baseline' },
  { title: 'Capture', value: 'change' },
  { title: 'Restore', value: 'restore' },
  { title: 'Export', value: 'export' },
];

const phaseInstructions: Record<WizardPhase, string | undefined> = {
  intro:
    'HamBench will read a baseline image, you change one front-panel menu at a time, then HamBench writes the original image back. Save the capture file and send it to your driver maintainer. Nothing is uploaded.',
  baseline: 'Put the radio in clone mode. Do not change any menus. When you are ready, read the baseline image.',
  change:
    'On the radio, change exactly one menu and save it on the radio (use the confirm key if the manual requires it). Enter the menu number and what changed, then read the radio.',
  review: 'Check the memory diff and mapped fields. Keep and continue, or redo this step after fixing the radio.',
  more: 'Capture more menus or restore the baseline image when you are finished.',
  restore:
    'HamBench writes the saved baseline back to the radio and reads it again to verify. Your card editor memory refreshes only when verification succeeds.',
  export: 'Save the capture file locally and send it yourself. HamBench does not upload it.',
};

const activePhaseInstruction = computed(() => {
  const resolved = phase.value === 'more' ? 'more' : phase.value === 'review' ? 'review' : phase.value;

  return phaseInstructions[resolved];
});

/** Prefer the step row just persisted on disk so review matches session.json. */
const reviewDiff = computed((): MenuCaptureStepDiff | undefined => {
  const persisted = session.value?.steps.at(-1)?.diff;
  const pending = pendingAnalysis.value?.diff;

  if (persisted && menuCaptureReviewHasVisibleDiff(persisted)) {
    return persisted;
  }

  return pending;
});

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

const canContinueToExport = computed(
  () =>
    Boolean(session.value && menuCaptureRestoreAllowsExport(session.value)) &&
    !verifying.value &&
    !restoring.value &&
    !captureBusy.value,
);

const showVerifyAgain = computed(() => {
  const restore = session.value?.restore;
  if (!restore?.writtenAt) {
    return false;
  }

  if (restore.status === 'read-failed' || restore.status === 'mismatch') {
    return true;
  }

  return restore.matchesBaseline === false && !restore.status;
});

watch(
  session,
  (value) => {
    if (!value) {
      phase.value = 'intro';
      return;
    }

    if (value.completedAt) {
      phase.value = 'export';
      exportCompleted.value = true;
      exportSavedPath.value = value.export?.path;
      return;
    }

    if (pendingAfterImage.value) {
      phase.value = 'review';
      return;
    }

    const resume = menuCaptureWizardResumePhase(value);

    if (resume === 'restore' || resume === 'export' || resume === 'baseline') {
      phase.value = resume;
      return;
    }

    if (phase.value === 'intro' || phase.value === 'baseline') {
      phase.value = resume;
    }
  },
  { immediate: true },
);

onMounted(() => {
  callsign.value = defaultCallsign() ?? '';
});

onBeforeUnmount(() => {
  if (restoring.value || verifying.value) {
    cancelTransfer();
  }
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

  if (number === undefined || !current) {
    return;
  }

  if (!menuName.value.trim() || !changeFrom.value.trim() || !changeTo.value.trim()) {
    toast.add({
      title: 'Describe the menu change',
      description: 'Enter the menu number, name, original value, and new value before reading the radio.',
      color: 'warning',
      icon: 'i-lucide-triangle-alert',
    });
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
  const analyzed = analyzeMenuCaptureStep({
    before,
    after,
    memoryMap: memoryMap.value,
    memoryConfig: memoryConfig.value,
    ignore: ignoreEntries.value,
  });

  pendingBeforeImage.value = before;
  pendingAfterImage.value = after;
  pendingAnalysis.value = analyzed;

  await recordCapturedStep({
    menuNumber: number,
    menuName: menuName.value.trim(),
    nameSource: menuNameSource.value,
    menuCode: menuPrefill.value?.fields.find((field) => field.code)?.code,
    from: changeFrom.value.trim(),
    to: changeTo.value.trim(),
    note: changeNote.value,
    afterImage: after,
    analyzed,
  });

  phase.value = 'review';
}

async function onKeepAndContinueReview(): Promise<void> {
  const image = pendingAfterImage.value;
  const number = menuNumber.value;

  if (!image || number === undefined) {
    return;
  }

  await patchLastCapturedStep({
    menuNumber: number,
    menuName: menuName.value.trim(),
    nameSource: menuNameSource.value,
    menuCode: menuPrefill.value?.fields.find((field) => field.code)?.code,
    from: changeFrom.value.trim(),
    to: changeTo.value.trim(),
    note: changeNote.value,
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

async function onRedoReviewStep(): Promise<void> {
  await redoLastStep();
  pendingBeforeImage.value = undefined;
  pendingAfterImage.value = undefined;
  pendingAnalysis.value = undefined;
  phase.value = 'change';
}

async function onVerifyAgain(): Promise<void> {
  verifying.value = true;

  try {
    const result = await verifyRestoredBaseline();

    if (result.verified) {
      phase.value = 'export';
    }
  } finally {
    verifying.value = false;
  }
}

function onContinueToExport(): void {
  phase.value = 'export';
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
  exporting.value = true;

  try {
    const path = await exportCapture({
      callsign: callsign.value,
      notes: operatorNotes.value,
      firmware: firmware.value.trim() || null,
    });

    if (path) {
      exportSavedPath.value = path;
      exportCompleted.value = true;
    }
  } finally {
    exporting.value = false;
  }
}

async function onStartNewCapture(): Promise<void> {
  await completeExportedSession();
  exportSavedPath.value = undefined;
  exportCompleted.value = false;
  operatorNotes.value = '';
  firmware.value = '';
  phase.value = 'intro';
}

async function onDone(): Promise<void> {
  await discardSession();
  exportSavedPath.value = undefined;
  exportCompleted.value = false;
  operatorNotes.value = '';
  firmware.value = '';
  phase.value = 'intro';
  emit('close');
}

async function onConfirmDiscardSession(): Promise<void> {
  discardConfirmOpen.value = false;
  await discardSession();
  exportSavedPath.value = undefined;
  exportCompleted.value = false;
  phase.value = 'intro';
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

      <div v-if="session" class="flex flex-wrap gap-2">
        <UButton
          label="Discard session"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="captureBusy || restoring || verifying"
          @click="discardConfirmOpen = true"
        />
      </div>

      <UStepper
        :items="stepperItems"
        :model-value="phase === 'more' || phase === 'review' ? 'change' : phase"
        size="xs"
        :linear="true"
        class="w-full"
      />

      <p v-if="activePhaseInstruction" class="text-sm text-muted">
        {{ activePhaseInstruction }}
      </p>

      <section v-if="phase === 'intro'" class="space-y-3">
        <div class="flex flex-wrap gap-2">
          <UButton v-if="!session" label="Start menu capture" color="primary" :disabled="captureBusy" @click="onStart" />
          <UButton
            v-else
            label="Resume session"
            color="primary"
            variant="outline"
            @click="phase = hasBaseline ? 'change' : 'baseline'"
          />
        </div>
      </section>

      <section v-else-if="phase === 'baseline'" class="space-y-3">
        <UButton label="Read baseline" icon="i-hambench-radio-read" color="primary" :loading="captureBusy" @click="onReadBaseline" />
      </section>

      <section v-else-if="phase === 'change'" class="space-y-3">
        <MenuCaptureStepFields
          v-model:menu-number="menuNumber"
          v-model:menu-name="menuName"
          v-model:change-from="changeFrom"
          v-model:change-to="changeTo"
          v-model:change-note="changeNote"
          :menu-prefill-hint="menuPrefill?.prefilledName"
        />
        <p v-if="menuPrefill && menuPrefill.fields.length > 1" class="text-xs text-muted">
          Menu {{ menuPrefill.menuNumber }} also maps to: {{ menuPrefill.fields.map((field) => field.label).join(', ') }}.
        </p>
        <UButton label="Read after change" icon="i-hambench-radio-read" color="primary" :loading="captureBusy" @click="onReadStep" />
      </section>

      <section v-else-if="phase === 'review' && pendingAnalysis && pendingBeforeImage && pendingAfterImage" class="space-y-3">
        <MenuCaptureStepFields
          v-model:menu-number="menuNumber"
          v-model:menu-name="menuName"
          v-model:change-from="changeFrom"
          v-model:change-to="changeTo"
          v-model:change-note="changeNote"
          :menu-prefill-hint="menuPrefill?.prefilledName"
        />
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
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          description="Changes in more than one memory region. That is fine if one menu stores data in several places; otherwise redo this step."
        />
        <p class="text-sm text-muted">
          {{ pendingAnalysis.diff.byteCount }} byte{{ pendingAnalysis.diff.byteCount === 1 ? '' : 's' }} changed in
          {{ pendingAnalysis.diff.runCount }} run{{ pendingAnalysis.diff.runCount === 1 ? '' : 's' }}
          <span v-if="pendingAnalysis.diff.ignoredByteCount > 0">
            ({{ pendingAnalysis.diff.ignoredByteCount }} ignored)
          </span>
        </p>
        <MenuCaptureDiffRuns
          v-if="reviewDiff && reviewDiff.runCount > 0"
          :key="`${session?.steps.length ?? 0}-${reviewDiff.byteCount}`"
          :diff="reviewDiff"
          :menu-number="menuNumber"
          before-label="Previous read"
          after-label="This read"
        />
        <div class="flex flex-wrap gap-2">
          <UButton label="Keep and continue" color="primary" @click="onKeepAndContinueReview" />
          <UButton label="Redo this step" color="neutral" variant="outline" @click="onRedoReviewStep" />
        </div>
      </section>

      <section v-else-if="phase === 'more'" class="space-y-3">
        <p class="text-sm font-medium text-toned">
          {{ session?.steps.length ?? 0 }} menu{{ (session?.steps.length ?? 0) === 1 ? '' : 's' }} captured.
        </p>
        <MenuCaptureCapturedStepsList v-if="session?.steps.length" :steps="session.steps" />
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
        <div v-if="showVerifyAgain || canContinueToExport" class="flex flex-wrap gap-2">
          <UButton
            v-if="showVerifyAgain"
            label="Verify again"
            icon="i-hambench-radio-read"
            color="primary"
            variant="outline"
            :loading="verifying || captureBusy"
            @click="onVerifyAgain"
          />
          <UButton
            v-if="canContinueToExport"
            label="Continue to export"
            color="neutral"
            variant="outline"
            @click="onContinueToExport"
          />
        </div>
        <p v-if="session?.restore?.status === 'read-failed'" class="text-sm text-error">
          Verification read failed: {{ session.restore.readError ?? 'Could not read the radio.' }}
        </p>
        <p v-else-if="session?.restore?.status === 'mismatch'" class="text-sm text-error">
          Verification read completed, but bytes outside the driver ignore list differ from the baseline. Try Verify again or
          export the capture for your maintainer.
        </p>
        <p v-else-if="session?.restore?.status === 'write-failed'" class="text-sm text-error">
          The baseline image was not written. Confirm the checkbox and use Write original image to radio, or discard the session.
        </p>
        <p
          v-else-if="session?.restore?.matchesBaseline === false && !session?.restore?.status"
          class="text-sm text-error"
        >
          Verification read did not match the baseline, or the read failed before this build recorded a status. Use Verify
          again or export the capture for your maintainer.
        </p>
        <p v-else-if="menuCaptureRestoreIsVerified(session?.restore)" class="text-sm text-success">
          Radio matches the baseline read.
        </p>
      </section>

      <section v-else-if="phase === 'export'" class="space-y-3">
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Callsign">
            <UInput v-model="callsign" class="w-full uppercase" />
          </UFormField>
          <UFormField label="Firmware (optional)">
            <UInput v-model="firmware" class="w-full font-mono" placeholder="If you know it" />
          </UFormField>
        </div>
        <UFormField label="Notes for the driver maintainer">
          <UTextarea v-model="operatorNotes" :rows="3" class="w-full" :readonly="exportCompleted" :disabled="exportCompleted" />
        </UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="!exportCompleted"
            label="Save capture file"
            icon="i-lucide-download"
            color="primary"
            :loading="exporting"
            @click="onExport"
          />
          <UButton v-else label="Start new capture" color="primary" @click="onStartNewCapture" />
          <UButton label="Done" color="neutral" variant="outline" :disabled="!exportCompleted" @click="onDone" />
        </div>
        <UAlert
          v-if="exportSavedPath"
          color="success"
          variant="subtle"
          icon="i-lucide-circle-check"
          title="Capture saved"
          :description="exportSavedPath"
        />
      </section>
    </template>

    <UModal v-model:open="discardConfirmOpen" :ui="{ content: 'sm:max-w-md' }">
      <template #content>
        <div class="space-y-4 p-4">
          <p class="text-sm text-toned">
            Discard this menu capture session? Baseline and step images on this card will be deleted and the programming port will be released.
          </p>
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" @click="discardConfirmOpen = false" />
            <UButton label="Discard session" color="error" @click="onConfirmDiscardSession" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>