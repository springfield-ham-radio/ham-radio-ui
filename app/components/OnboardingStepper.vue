<script setup lang="ts">
import type { StepperItem } from '@nuxt/ui';
import { HOME_STATION_ID, type StationDraft } from '~/utils/antenna-station';
import type { OnboardingLicenseSessionDraft } from '~/utils/license-people';
import { defaultProgrammingBaudRate, programmingBaudRateSelectItems } from '~/utils/radio-baud-rate';
import { radioDisplayName } from '~/utils/radio-module-listing';
import {
  completeOnboardingStep,
  finishOnboarding,
  firstPendingOnboardingStep,
  nextOnboardingStep,
  onboardingHomeIsDone,
  onboardingLicensesAreDone,
  onboardingRadiosAreDone,
  onboardingStepIsDone,
  onboardingStepperItems,
  planOnboardingSavedRadios,
  previousOnboardingStep,
  skipOnboardingStep,
  type OnboardingStepId,
} from '~/utils/onboarding';

const { view, session, shellOpen, persisted, persistsEdits, applyEdit, close } = useOnboarding();
const { directory } = useOperatorLicense();
const { stations, saveHomeStation } = useStationAntennas();
const { radios, addRadio } = useSavedRadios();
const { configurations, openReadFromRadio } = useRadio();
const { cards, openCard } = useRadioBoard();
const router = useRouter();
const route = useRoute();

const active = ref<OnboardingStepId>('licenses');
const homeEditor = ref<{ save: () => Promise<boolean> } | null>(null);
const homeSessionDraft = ref<StationDraft | undefined>();
const licenseEditor = ref<{ save: () => Promise<boolean> } | null>(null);
const licenseSessionDraft = ref<OnboardingLicenseSessionDraft | undefined>();
const readEditor = ref<{ finishRead: () => string | undefined } | null>(null);
const radiosEditor = ref<{ continueRadios: () => Promise<boolean> } | null>(null);
const radiosInstalling = ref(false);

const state = computed(() => session.value ?? view.value);
const homeStation = computed(() => stations.value.find((station) => station.id === HOME_STATION_ID));
const ownedModuleIds = computed(() => state.value?.ownedModuleIds ?? []);
const pendingRadios = computed(() => state.value?.pendingRadios ?? []);
const readRadios = computed(() => {
  const savedModels = new Set(radios.value.map((radio) => radio.model));

  return [
    ...radios.value.map((radio) => ({
      id: radio.id,
      name: radio.name,
      serialPort: radio.serialPort,
      hasConfig: configurations.value.some((config) => String(config.id.model) === radio.model),
      canRead: true,
    })),
    ...pendingRadios.value
      .filter((radio) => !savedModels.has(radio.modelId))
      .map((radio) => ({
        id: radio.modelId,
        name: radio.name.trim() || radio.modelId,
        serialPort: radio.serialPort,
        hasConfig: configurations.value.some((config) => String(config.id.model) === radio.modelId),
        canRead: false,
      })),
  ];
});

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
  read: state.value?.steps.read === 'done',
}));

const isLast = computed(() => nextOnboardingStep(active.value) === undefined);
const canContinue = computed(() => {
  if (radiosInstalling.value) {
    return false;
  }

  if (active.value === 'licenses' || active.value === 'home' || active.value === 'read') {
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
});

function back(): void {
  const previous = previousOnboardingStep(active.value);

  if (previous) {
    active.value = previous;
  }
}

function setRadioPicks(picks: { ownedModuleIds: string[]; pendingRadios: { modelId: string; name: string; serialPort: string }[] }): void {
  if (!state.value) {
    return;
  }

  applyEdit({
    ...state.value,
    ownedModuleIds: picks.ownedModuleIds,
    pendingRadios: picks.pendingRadios,
  });
}

function materializePendingRadios(): void {
  const current = state.value;

  if (!current || current.pendingRadios.length === 0) {
    return;
  }

  const models = configurations.value.map((config) => ({
    id: String(config.id.model),
    manufacturer: String(config.id.manufacturer),
    displayName: radioDisplayName(String(config.id.manufacturer), config.id.name),
    baudRate: defaultProgrammingBaudRate(config.serialConfig),
    baudRates: programmingBaudRateSelectItems(config.serialConfig).map((item) => item.value),
  }));
  const { drafts } = planOnboardingSavedRadios({
    pending: current.pendingRadios,
    models,
    existing: radios.value.map((radio) => ({ name: radio.name, model: radio.model })),
  });
  const created: string[] = [];

  for (const draft of drafts) {
    const model = models.find((entry) => entry.id === draft.model);

    if (addRadio(draft, model?.baudRates)) {
      created.push(draft.model);
    }
  }

  if (created.length === 0 || !state.value) {
    return;
  }

  applyEdit({
    ...state.value,
    pendingRadios: state.value.pendingRadios.filter((radio) => !created.includes(radio.modelId)),
  });
}

watch([configurations, radios, pendingRadios], () => {
  materializePendingRadios();
}, { immediate: true });

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

async function continueStep(): Promise<void> {
  if (!state.value) {
    return;
  }

  if (active.value === 'licenses' && !(await licenseEditor.value?.save())) {
    return;
  }

  if (active.value === 'home' && !(await homeEditor.value?.save())) {
    return;
  }

  if (active.value === 'radios') {
    if (!onboardingStepIsDone('radios', completion.value) || !(await radiosEditor.value?.continueRadios())) {
      return;
    }
  }

  if (active.value === 'read') {
    const radioId = readEditor.value?.finishRead();

    applyEdit(finishOnboarding(completeOnboardingStep(state.value, 'read')));
    close();

    if (radioId) {
      openCard(radioId);
      const cardId = cards.value.find((card) => card.savedRadioId === radioId)?.id ?? radioId;
      openReadFromRadio(cardId);

      if (route.path !== '/') {
        void router.push('/');
      }
    }

    return;
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
    description="Skip a step, or finish later, and open this again from Preferences."
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
            />
          </div>
        </template>
        <template #radios>
          <OnboardingRadiosStep
            ref="radiosEditor"
            :owned-module-ids="ownedModuleIds"
            :pending-radios="pendingRadios"
            @update:picks="setRadioPicks"
            @update:installing="radiosInstalling = $event"
          />
        </template>
        <template #read>
          <OnboardingReadStep ref="readEditor" :radios="readRadios" />
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
            <UButton v-if="!isLast" label="Skip this step" color="neutral" variant="outline" :disabled="radiosInstalling" @click="skip" />
            <UButton :label="continueLabel" color="primary" :loading="radiosInstalling" :disabled="!canContinue" @click="continueStep" />
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
