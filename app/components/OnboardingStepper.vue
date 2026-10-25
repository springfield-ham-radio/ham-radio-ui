<script setup lang="ts">
import type { StepperItem } from '@nuxt/ui';
import { HOME_STATION_ID, type StationDraft } from '~/utils/antenna-station';
import type { OnboardingLicenseSessionDraft } from '~/utils/license-people';
import { defaultProgrammingBaudRate, programmingBaudRateSelectItems } from '~/utils/radio-baud-rate';
import { listRadioImageBackups } from '~/utils/radio-image-backup-io';
import { readRadioImageBackupSettings } from '~/utils/radio-image-backup';
import { radioDisplayName } from '~/utils/radio-module-listing';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import {
  completeOnboardingStep,
  finishOnboarding,
  firstPendingOnboardingStep,
  nextOnboardingStep,
  onboardingCableIsDone,
  onboardingDriversAreDone,
  onboardingHomeIsDone,
  onboardingLicensesAreDone,
  onboardingRadiosAreDone,
  onboardingReadContinue,
  onboardingReadIsDone,
  onboardingStationsAreDone,
  onboardingStepIsDone,
  onboardingStepperItems,
  planOnboardingCableRadios,
  previousOnboardingStep,
  skipOnboardingStep,
  withOwnedModuleIds,
  type OnboardingStepId,
} from '~/utils/onboarding';

const { view, session, shellOpen, persisted, persistsEdits, applyEdit, close } = useOnboarding();
const { directory } = useOperatorLicense();
const { stations, saveHomeStation } = useStationAntennas();
const { radios, addRadio } = useSavedRadios();
const { configurations, openReadFromRadio, progressOpen, readBackupSaved } = useRadio();
const router = useRouter();

const active = ref<OnboardingStepId>('licenses');
const homeEditor = ref<{ save: () => boolean } | null>(null);
const homeCanSave = ref(false);
const homeSessionDraft = ref<StationDraft | undefined>();
const licenseEditor = ref<{ save: () => boolean } | null>(null);
const licenseCanSave = ref(false);
const licenseSessionDraft = ref<OnboardingLicenseSessionDraft | undefined>();

const state = computed(() => session.value ?? view.value);
const homeStation = computed(() => stations.value.find((station) => station.id === HOME_STATION_ID));
const ownedModuleIds = computed(() => state.value?.ownedModuleIds ?? []);
const cableSelection = ref({ port: undefined as string | undefined, livePorts: [] as string[], loading: false });
const cableFieldError = ref<string | undefined>();
const readFileNames = ref<string[]>([]);
const readAttempted = ref(false);
const readModels = computed(() =>
  radios.value.map((radio) => ({
    id: radio.id,
    name: radio.name,
    manufacturer: radio.manufacturer,
    model: radio.model,
    serialPort: radio.serialPort,
    hasConfig: configurations.value.some((config) => String(config.id.model) === radio.model),
  })),
);
const readBackupNames = computed(() => {
  const names = [...readFileNames.value];
  const saved = readBackupSaved.value?.fileName;

  if (saved && !names.includes(saved)) {
    names.push(saved);
  }

  return names;
});
const readDecision = computed(() =>
  onboardingReadContinue({
    desktop: isTauriRuntime(),
    backupsEnabled: readRadioImageBackupSettings().enabled,
    hasBackup: onboardingReadIsDone({
      fileNames: readBackupNames.value,
      models: readModels.value.map((model) => ({ manufacturer: model.manufacturer, model: model.model })),
    }),
    models: readModels.value,
  }),
);

const items = computed<StepperItem[]>(() => {
  if (!state.value) {
    return [];
  }

  return onboardingStepperItems(state.value, active.value);
});

const completion = computed(() => ({
  licenses: onboardingLicensesAreDone(directory.value),
  home: onboardingHomeIsDone(stations.value),
  radios: onboardingRadiosAreDone({
    ownedModuleIds: ownedModuleIds.value,
    savedRadioCount: radios.value.length,
  }),
  drivers: onboardingDriversAreDone({
    ownedModuleIds: ownedModuleIds.value,
    installedModelIds: configurations.value.map((config) => String(config.id.model)),
    desktop: isTauriRuntime(),
  }),
  cable: onboardingCableIsDone({
    desktop: isTauriRuntime(),
    selectedPort: cableSelection.value.port,
    livePorts: cableSelection.value.livePorts,
  }),
  read: state.value?.steps.read === 'done' || readDecision.value.action === 'advance',
  stations: onboardingStationsAreDone(),
}));

const isLast = computed(() => nextOnboardingStep(active.value) === undefined);
const canContinue = computed(() => {
  if (active.value === 'licenses') {
    return licenseCanSave.value;
  }

  if (active.value === 'home') {
    return homeCanSave.value;
  }

  if (active.value === 'read' || active.value === 'stations') {
    return true;
  }

  return onboardingStepIsDone(active.value, completion.value);
});
const canGoBack = computed(() => previousOnboardingStep(active.value) !== undefined);
const continueLabel = computed(() => (isLast.value ? 'Finish' : 'Continue'));

watch(shellOpen, (open) => {
  if (!open) {
    session.value = undefined;
    return;
  }

  if (session.value) {
    active.value = firstPendingOnboardingStep(session.value);
  }

  if (active.value === 'read') {
    void refreshReadBackups();
  }
});

watch(active, (step) => {
  if (step !== 'read') {
    return;
  }

  readAttempted.value = false;
  void refreshReadBackups();
});

watch(progressOpen, (open) => {
  if (!open && active.value === 'read') {
    void refreshReadBackups();
  }
});

watch(readBackupSaved, (saved) => {
  if (!saved || state.value?.status !== 'active' || state.value.steps.read !== 'pending') {
    return;
  }

  applyEdit(completeOnboardingStep(state.value, 'read'));
  void refreshReadBackups();
});

function back(): void {
  const previous = previousOnboardingStep(active.value);

  if (previous) {
    active.value = previous;
  }
}

function setOwnedModuleIds(ids: string[]): void {
  if (!state.value) {
    return;
  }

  applyEdit(withOwnedModuleIds(state.value, ids));
}

function skip(): void {
  if (!state.value) {
    return;
  }

  const nextState = skipOnboardingStep(state.value, active.value);
  const following = nextOnboardingStep(active.value);

  if (!following) {
    applyEdit(nextState.status === 'active' ? finishOnboarding(nextState) : nextState);
    close();
    return;
  }

  applyEdit(nextState);

  if (following) {
    active.value = following;
  }
}

function onHomeSave(draft: StationDraft): void {
  saveHomeStation(draft);
  homeSessionDraft.value = draft;
}

function onHomeDraft(draft: StationDraft): void {
  homeSessionDraft.value = draft;
}

function onCableSelection(next: { port: string | undefined; livePorts: string[]; loading: boolean }): void {
  cableSelection.value = next;
  cableFieldError.value = undefined;
}

async function refreshReadBackups(): Promise<void> {
  if (!isTauriRuntime()) {
    readFileNames.value = [];
    return;
  }

  const saved = readBackupSaved.value?.fileName;

  try {
    const listed = await listRadioImageBackups();
    const names = listed.map((entry) => entry.fileName);

    if (saved && !names.includes(saved)) {
      names.push(saved);
    }

    readFileNames.value = names;
  } catch {
    readFileNames.value = saved ? [saved] : [];
  }
}

function goToStep(step: 'drivers' | 'cable'): void {
  readAttempted.value = false;
  active.value = step;
}

function openBackups(): void {
  close();
  void router.push('/preferences?section=backups');
}

function saveCableRadios(): boolean {
  const port = cableSelection.value.port;

  if (!port) {
    return false;
  }

  const models = configurations.value.map((config) => ({
    id: String(config.id.model),
    manufacturer: String(config.id.manufacturer),
    displayName: radioDisplayName(String(config.id.manufacturer), config.id.name),
    baudRate: defaultProgrammingBaudRate(config.serialConfig),
    baudRates: programmingBaudRateSelectItems(config.serialConfig).map((item) => item.value),
  }));
  const plan = planOnboardingCableRadios({
    ownedModuleIds: ownedModuleIds.value,
    models,
    existing: radios.value.map((radio) => ({ name: radio.name, model: radio.model })),
    serialPort: port,
  });

  if (plan.error) {
    cableFieldError.value = plan.error;
    return false;
  }

  for (const draft of plan.drafts) {
    const model = models.find((entry) => entry.id === draft.model);

    if (!addRadio(draft, model?.baudRates)) {
      cableFieldError.value = 'That radio could not be saved.';
      return false;
    }
  }

  return true;
}

function continueStep(): void {
  if (!state.value) {
    return;
  }

  if (active.value === 'licenses' && !licenseEditor.value?.save()) {
    return;
  }

  if (active.value === 'home' && !homeEditor.value?.save()) {
    return;
  }

  if (active.value === 'cable' && !saveCableRadios()) {
    return;
  }

  if (active.value === 'read' && state.value.steps.read !== 'done') {
    const decision = readDecision.value;

    if (decision.action === 'read') {
      readAttempted.value = false;
      openReadFromRadio(decision.radioId);
      return;
    }

    if (decision.action === 'blocked') {
      readAttempted.value = true;
      return;
    }
  }

  if (active.value !== 'home' && active.value !== 'licenses' && !onboardingStepIsDone(active.value, completion.value)) {
    return;
  }

  const marked = completeOnboardingStep(state.value, active.value);
  const following = nextOnboardingStep(active.value);

  if (!following) {
    applyEdit(finishOnboarding(marked));
    close();
    return;
  }

  applyEdit(marked);
  active.value = following;
}

function finishLater(): void {
  close();
}
</script>

<template>
  <UModal
    v-model:open="shellOpen"
    title="Set up HamBench"
    description="You can skip any step and open this again from Preferences."
    :dismissible="false"
    :ui="{ content: 'sm:max-w-5xl' }"
  >
    <template #body>
      <UStepper
        v-if="state"
        v-model="active"
        :items="items"
        :linear="false"
        size="xs"
        class="w-full"
      >
        <template #licenses>
          <OnboardingLicensesStep
            ref="licenseEditor"
            :session-draft="licenseSessionDraft"
            @draft="licenseSessionDraft = $event"
            @can-save="licenseCanSave = $event"
          />
        </template>
        <template #home>
          <div class="mt-4">
            <RadioStationEditor
              ref="homeEditor"
              embedded
              hide-save
              :open="true"
              :station="homeStation"
              :session-draft="homeSessionDraft"
              @save="onHomeSave"
              @draft="onHomeDraft"
              @can-save="homeCanSave = $event"
            />
          </div>
        </template>
        <template #radios>
          <OnboardingRadiosStep
            :owned-module-ids="ownedModuleIds"
            @update:owned-module-ids="setOwnedModuleIds"
          />
        </template>
        <template #drivers>
          <div class="mt-4">
            <RadioModulesPreference :entry-ids="ownedModuleIds.length > 0 ? ownedModuleIds : undefined" />
          </div>
        </template>
        <template #cable>
          <OnboardingCableStep :field-error="cableFieldError" @selection="onCableSelection" />
        </template>
        <template #read>
          <OnboardingReadStep :decision="readDecision" :attempted="readAttempted" @go-to="goToStep" @backups="openBackups" />
        </template>
        <template #stations>
          <OnboardingStationsStep />
        </template>
      </UStepper>
    </template>

    <template #footer>
      <div class="flex w-full flex-col gap-3">
        <p v-if="!persistsEdits" class="text-xs text-muted">
          HamBench is still checking this install, so setup progress is not saved yet. Licenses, a Home location, and any driver you install are kept.
        </p>
        <p v-else-if="persisted?.completedReason === 'existing-data'" class="text-xs text-muted">
          This install already has station data. The guide stays closed until you open it here. Skipping a step does not remove licenses, radios, or stations.
        </p>
        <div class="flex w-full items-center justify-between gap-2">
          <UButton label="Finish later" color="neutral" variant="ghost" @click="finishLater" />
          <div class="flex gap-2">
            <UButton label="Back" color="neutral" variant="outline" icon="i-lucide-arrow-left" :disabled="!canGoBack" @click="back" />
            <UButton v-if="!isLast" label="Skip this step" color="neutral" variant="outline" @click="skip" />
            <UButton :label="continueLabel" color="primary" :disabled="!canContinue" @click="continueStep" />
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
