<script setup lang="ts">
import type { StepperItem } from '@nuxt/ui';
import { HOME_STATION_ID, type StationDraft } from '~/utils/antenna-station';
import {
  completeOnboardingStep,
  finishOnboarding,
  firstPendingOnboardingStep,
  nextOnboardingStep,
  ONBOARDING_STEPS,
  onboardingHomeIsDone,
  onboardingLicensesAreDone,
  onboardingStepIsDone,
  onboardingStepperItems,
  previousOnboardingStep,
  skipOnboardingStep,
  type OnboardingStepId,
} from '~/utils/onboarding';

const { view, session, shellOpen, persisted, persistsEdits, applyEdit, close } = useOnboarding();
const { directory } = useOperatorLicense();
const { stations, saveStation } = useStationAntennas();

const active = ref<OnboardingStepId>('licenses');
const homeEditor = ref<{ save: () => boolean } | null>(null);

const state = computed(() => session.value ?? view.value);
const homeStation = computed(() => stations.value.find((station) => station.id === HOME_STATION_ID));
const placeholderSteps = computed(() => ONBOARDING_STEPS.filter((step) => step.id !== 'licenses' && step.id !== 'home'));

const items = computed<StepperItem[]>(() => {
  if (!state.value) {
    return [];
  }

  return onboardingStepperItems(state.value, active.value);
});

const completion = computed(() => ({
  licenses: onboardingLicensesAreDone(directory.value),
  home: onboardingHomeIsDone(stations.value),
}));

const isLast = computed(() => nextOnboardingStep(active.value) === undefined);
const canContinue = computed(() => onboardingStepIsDone(active.value, completion.value));
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
  saveStation(HOME_STATION_ID, draft);
}

function continueStep(): void {
  if (!state.value) {
    return;
  }

  if (active.value === 'home' && !homeEditor.value?.save()) {
    return;
  }

  if (!onboardingStepIsDone(active.value, completion.value)) {
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
          <div class="mt-4">
            <LicensePeoplePreference />
          </div>
        </template>
        <template #home>
          <div class="mt-4">
            <RadioStationEditor
              ref="homeEditor"
              embedded
              :open="true"
              :station="homeStation"
              @save="onHomeSave"
            />
          </div>
        </template>
        <template v-for="step in placeholderSteps" :key="step.id" #[step.id]>
          <UAlert
            class="mt-4"
            color="neutral"
            variant="subtle"
            icon="i-lucide-hammer"
            :title="step.title"
            :description="step.placeholder"
          />
        </template>
      </UStepper>
    </template>

    <template #footer>
      <div class="flex w-full flex-col gap-3">
        <p v-if="!persistsEdits" class="text-xs text-muted">
          This preview does not save which steps you finished, and a new install will not open it on its own yet. Licenses and a Home location you save here are kept.
        </p>
        <p v-else-if="persisted?.completedReason === 'existing-data'" class="text-xs text-muted">
          This install already has station data. The guide stays closed until you open it here. Skipping a step does not remove licenses, radios, or stations.
        </p>
        <div class="flex w-full items-center justify-between gap-2">
          <UButton label="Finish later" color="neutral" variant="ghost" @click="finishLater" />
          <div class="flex gap-2">
            <UButton label="Back" color="neutral" variant="outline" icon="i-lucide-arrow-left" :disabled="!canGoBack" @click="back" />
            <UButton label="Skip this step" color="neutral" variant="outline" @click="skip" />
            <UButton :label="continueLabel" color="primary" :disabled="!canContinue" @click="continueStep" />
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
