<script setup lang="ts">
import {
  onboardingLicenseClassIsGmrs,
  onboardingLicenseClassOptions,
  onboardingLicenseFieldErrors,
  onboardingLicenseFormCanSave,
  onboardingLicensePrefill,
  type HeldLicense,
  type OnboardingLicenseForm,
  type OnboardingLicenseSessionDraft,
} from '~/utils/license-people';

const props = defineProps<{
  /** Unsaved license edits kept by the guide while the step is not on screen. */
  sessionDraft?: OnboardingLicenseSessionDraft;
}>();

const emit = defineEmits<{
  draft: [draft: OnboardingLicenseSessionDraft];
  'can-save': [canSave: boolean];
}>();

const { directory, lookupAmateurLicense, lookupGmrsLicense, saveOnboardingLicense } = useOperatorLicense();

const name = ref('');
const callSign = ref('');
const licenseClassId = ref('');
const lookedUp = ref<HeldLicense | undefined>();
const personId = ref<string | undefined>();
const licenseId = ref<string | undefined>();
const editingExisting = ref(false);
const nameError = ref<string | undefined>();
const callSignError = ref<string | undefined>();
const classError = ref<string | undefined>();
const lookupError = ref<string | undefined>();
const lookingUp = ref(false);
const restoredSession = ref(false);

function currentForm(): OnboardingLicenseForm {
  return {
    name: name.value,
    callSign: callSign.value,
    licenseClassId: licenseClassId.value,
  };
}

function currentDraft(): OnboardingLicenseSessionDraft {
  return {
    ...currentForm(),
    lookedUp: lookedUp.value,
  };
}

function showFieldErrors(): void {
  const errors = onboardingLicenseFieldErrors(currentForm());

  nameError.value = errors?.name;
  callSignError.value = errors?.callSign;
  classError.value = errors?.licenseClassId;
}

function applySession(draft: OnboardingLicenseSessionDraft): void {
  name.value = draft.name;
  callSign.value = draft.callSign;
  licenseClassId.value = draft.licenseClassId;
  lookedUp.value = draft.lookedUp;
  lookupError.value = undefined;
}

watch(
  directory,
  (next) => {
    if (restoredSession.value) {
      return;
    }

    restoredSession.value = true;
    const prefill = onboardingLicensePrefill(next);

    personId.value = prefill.personId;
    licenseId.value = prefill.licenseId;
    editingExisting.value = prefill.editingExisting;
    applySession(
      props.sessionDraft ?? {
        name: prefill.name,
        callSign: prefill.callSign,
        licenseClassId: prefill.licenseClassId,
      },
    );
  },
  { immediate: true },
);

watch(
  [name, callSign, licenseClassId, lookedUp],
  () => {
    const normalized = callSign.value.trim().toUpperCase();
    const pending = lookedUp.value;

    if (pending && pending.callSign.trim().toUpperCase() !== normalized) {
      lookedUp.value = undefined;
      return;
    }

    if (pending && onboardingLicenseClassIsGmrs(licenseClassId.value) !== (pending.kind === 'gmrs')) {
      lookedUp.value = undefined;
      return;
    }

    showFieldErrors();
    emit('draft', currentDraft());
    emit('can-save', onboardingLicenseFormCanSave(currentForm()));
  },
  { immediate: true },
);

async function onLookup(): Promise<void> {
  const entered = callSign.value.trim();

  if (!entered || lookingUp.value) {
    return;
  }

  lookingUp.value = true;
  lookupError.value = undefined;

  try {
    const result = onboardingLicenseClassIsGmrs(licenseClassId.value)
      ? await lookupGmrsLicense(entered)
      : await lookupAmateurLicense(entered);

    lookupError.value = result.error;

    if (!result.license) {
      return;
    }

    lookedUp.value = result.license;
    callSign.value = result.license.callSign;

    if (!name.value.trim() && result.license.name) {
      name.value = result.license.name;
    }

    if (result.license.kind === 'gmrs') {
      const gmrs = onboardingLicenseClassOptions.find((option) => onboardingLicenseClassIsGmrs(option.value));

      if (gmrs) {
        licenseClassId.value = gmrs.value;
      }
    } else if (result.license.licenseClassId) {
      licenseClassId.value = result.license.licenseClassId;
    }
  } finally {
    lookingUp.value = false;
  }
}

function save(): boolean {
  showFieldErrors();

  if (!onboardingLicenseFormCanSave(currentForm())) {
    return false;
  }

  return saveOnboardingLicense({
    form: currentForm(),
    personId: personId.value,
    licenseId: licenseId.value,
    lookedUp: lookedUp.value,
  });
}

defineExpose({ save });
</script>

<template>
  <div class="mt-4 flex max-w-lg flex-col gap-4">
    <p class="text-sm text-muted">Name, call sign, and license class for one operator.</p>
    <p v-if="editingExisting" class="text-sm text-muted">More people and licenses can be managed in Preferences.</p>
    <UFormField label="Name" required :error="nameError">
      <UInput v-model="name" class="w-full" placeholder="Name" />
    </UFormField>
    <UFormField label="Call sign" required :error="callSignError">
      <div class="flex gap-2">
        <UInput
          v-model="callSign"
          class="min-w-0 flex-1 uppercase"
          placeholder="W1AW"
          :disabled="lookingUp"
          @keydown.enter.prevent="onLookup"
        />
        <UButton
          label="Lookup"
          color="neutral"
          variant="soft"
          :loading="lookingUp"
          :disabled="lookingUp || !callSign.trim()"
          @click="onLookup"
        />
      </div>
    </UFormField>
    <p v-if="lookupError" class="text-xs text-error">{{ lookupError }}</p>
    <UFormField label="License class" required :error="classError">
      <USelectMenu
        v-model="licenseClassId"
        :items="onboardingLicenseClassOptions"
        value-key="value"
        placeholder="Select license class"
        color="neutral"
        :search-input="false"
        class="w-full"
      />
    </UFormField>
  </div>
</template>
