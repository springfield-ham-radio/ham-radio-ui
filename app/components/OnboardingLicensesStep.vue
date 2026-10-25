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
}>();

const { directory, lookupAmateurLicense, lookupGmrsLicense, saveOnboardingLicense } = useOperatorLicense();

const state = reactive<OnboardingLicenseForm>({
  name: '',
  callSign: '',
  licenseClassId: '',
});
const lookedUp = ref<HeldLicense | undefined>();
const personId = ref<string | undefined>();
const licenseId = ref<string | undefined>();
const editingExisting = ref(false);
const lookupError = ref<string | undefined>();
const lookingUp = ref(false);
const restoredSession = ref(false);
const form = ref<{ validate: () => Promise<unknown> } | null>(null);

function currentDraft(): OnboardingLicenseSessionDraft {
  return {
    name: state.name,
    callSign: state.callSign,
    licenseClassId: state.licenseClassId,
    lookedUp: lookedUp.value,
  };
}

function validateLicense(values: Partial<OnboardingLicenseForm>): { name: string; message: string }[] {
  const errors = onboardingLicenseFieldErrors({
    name: values.name ?? '',
    callSign: values.callSign ?? '',
    licenseClassId: values.licenseClassId ?? '',
  });

  if (!errors) {
    return [];
  }

  return [
    errors.name ? { name: 'name', message: errors.name } : undefined,
    errors.callSign ? { name: 'callSign', message: errors.callSign } : undefined,
    errors.licenseClassId ? { name: 'licenseClassId', message: errors.licenseClassId } : undefined,
  ].filter((error): error is { name: string; message: string } => error !== undefined);
}

function applySession(draft: OnboardingLicenseSessionDraft): void {
  state.name = draft.name;
  state.callSign = draft.callSign;
  state.licenseClassId = draft.licenseClassId;
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
  [() => state.name, () => state.callSign, () => state.licenseClassId, lookedUp],
  () => {
    const normalized = state.callSign.trim().toUpperCase();
    const pending = lookedUp.value;

    if (pending && pending.callSign.trim().toUpperCase() !== normalized) {
      lookedUp.value = undefined;
      return;
    }

    if (pending && onboardingLicenseClassIsGmrs(state.licenseClassId) !== (pending.kind === 'gmrs')) {
      lookedUp.value = undefined;
      return;
    }

    emit('draft', currentDraft());
  },
);

async function onLookup(): Promise<void> {
  const entered = state.callSign.trim();

  if (!entered || lookingUp.value) {
    return;
  }

  lookingUp.value = true;
  lookupError.value = undefined;

  try {
    const result = onboardingLicenseClassIsGmrs(state.licenseClassId)
      ? await lookupGmrsLicense(entered)
      : await lookupAmateurLicense(entered);

    lookupError.value = result.error;

    if (!result.license) {
      return;
    }

    lookedUp.value = result.license;
    state.callSign = result.license.callSign;

    if (!state.name.trim() && result.license.name) {
      state.name = result.license.name;
    }

    if (result.license.kind === 'gmrs') {
      const gmrs = onboardingLicenseClassOptions.find((option) => onboardingLicenseClassIsGmrs(option.value));

      if (gmrs) {
        state.licenseClassId = gmrs.value;
      }
    } else if (result.license.licenseClassId) {
      state.licenseClassId = result.license.licenseClassId;
    }
  } finally {
    lookingUp.value = false;
  }
}

async function save(): Promise<boolean> {
  if (!form.value) {
    return false;
  }

  try {
    await form.value.validate();
  } catch {
    return false;
  }

  if (!onboardingLicenseFormCanSave(state)) {
    return false;
  }

  return saveOnboardingLicense({
    form: state,
    personId: personId.value,
    licenseId: licenseId.value,
    lookedUp: lookedUp.value,
  });
}

defineExpose({ save });
</script>

<template>
  <UForm
    ref="form"
    :state="state"
    :validate="validateLicense"
    :loading-auto="false"
    class="mt-4 flex max-w-lg flex-col gap-4"
    @submit.prevent
  >
    <p class="text-sm text-muted">Name, call sign, and license class for one operator.</p>
    <p v-if="editingExisting" class="text-sm text-muted">More people and licenses can be managed in Preferences.</p>
    <UFormField name="name" label="Name" required>
      <UInput v-model="state.name" class="w-full" placeholder="Name" />
    </UFormField>
    <UFormField name="callSign" label="Call sign" required>
      <div class="flex gap-2">
        <UInput
          v-model="state.callSign"
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
          :disabled="lookingUp || !state.callSign.trim()"
          @click="onLookup"
        />
      </div>
    </UFormField>
    <p v-if="lookupError" class="text-xs text-error">{{ lookupError }}</p>
    <UFormField name="licenseClassId" label="License class" required>
      <USelectMenu
        v-model="state.licenseClassId"
        :items="onboardingLicenseClassOptions"
        value-key="value"
        placeholder="Select license class"
        color="neutral"
        :search-input="false"
        class="w-full"
      />
    </UFormField>
  </UForm>
</template>
