<script setup lang="ts">
import { openExternalUrl } from '~/utils/open-external-url';
import {
  amateurLicenseClassOptions,
  gmrsLocationLabel,
  previousLicenseLabel,
  trusteeLabel,
  type AmateurLicense,
  type GmrsLicenseRecord,
  type HeldLicense,
  type LicensePerson,
} from '~/utils/license-people';

const props = defineProps<{
  person: LicensePerson;
  licenses: HeldLicense[];
}>();

const emit = defineEmits<{
  remove: [];
}>();

const { renameLicensePerson, addAmateurLicense, addGmrsLicense, setManualLicenseClass, clearHeldLicense } = useOperatorLicense();

const name = shallowRef(props.person.name);
const amateurCallSign = shallowRef('');
const gmrsCallSign = shallowRef('');
const showAmateurLookup = shallowRef(false);
const showGmrsLookup = shallowRef(false);
const amateurLookupError = shallowRef<string | undefined>();
const gmrsLookupError = shallowRef<string | undefined>();
const lookingUpAmateur = shallowRef(false);
const lookingUpGmrs = shallowRef(false);

watch(
  () => props.person.name,
  (next) => {
    name.value = next;
  },
);

const amateurLicenses = computed(() => props.licenses.filter((license): license is AmateurLicense => license.kind === 'amateur'));
const gmrsLicenses = computed(() => props.licenses.filter((license): license is GmrsLicenseRecord => license.kind === 'gmrs'));

function commitName(): void {
  const trimmed = name.value.trim();

  if (!trimmed || trimmed === props.person.name) {
    name.value = props.person.name;
    return;
  }

  renameLicensePerson(props.person.id, trimmed);
}

async function onAmateurLookup(): Promise<void> {
  lookingUpAmateur.value = true;
  amateurLookupError.value = undefined;

  try {
    const error = await addAmateurLicense(props.person.id, amateurCallSign.value);
    amateurLookupError.value = error;

    if (!error) {
      amateurCallSign.value = '';
      showAmateurLookup.value = false;
    }
  } finally {
    lookingUpAmateur.value = false;
  }
}

async function onGmrsLookup(): Promise<void> {
  lookingUpGmrs.value = true;
  gmrsLookupError.value = undefined;

  try {
    const error = await addGmrsLicense(props.person.id, gmrsCallSign.value);
    gmrsLookupError.value = error;

    if (!error) {
      gmrsCallSign.value = '';
      showGmrsLookup.value = false;
    }
  } finally {
    lookingUpGmrs.value = false;
  }
}

function classFor(license: AmateurLicense): string | undefined {
  return license.licenseClassId;
}

function setClass(licenseId: string, licenseClassId: string | undefined): void {
  if (licenseClassId) {
    setManualLicenseClass(licenseId, licenseClassId);
  }
}

async function onOpenUls(event: Event, url: string | undefined): Promise<void> {
  event.preventDefault();

  if (!url) {
    return;
  }

  await openExternalUrl(url);
}
</script>

<template>
  <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
    <div class="flex flex-col gap-4 px-4 py-4">
      <div class="flex items-start gap-2">
        <UFormField label="Name" class="min-w-0 flex-1">
          <UInput
            v-model="name"
            placeholder="Name"
            class="w-full"
            @blur="commitName"
            @keydown.enter.prevent="commitName"
          />
        </UFormField>
        <UButton
          class="mt-6"
          color="neutral"
          variant="ghost"
          icon="i-lucide-trash-2"
          aria-label="Remove person"
          @click="emit('remove')"
        />
      </div>

      <p v-if="licenses.length === 0" class="text-xs text-muted">
        No license on file. This person may transmit on FRS.
      </p>

      <div v-for="license in amateurLicenses" :key="license.id" class="flex flex-col gap-3 rounded-lg bg-muted px-3 py-3">
        <div class="flex items-start justify-between gap-2">
          <p class="text-sm font-medium text-highlighted">Amateur · {{ license.callSign }}</p>
          <UButton
            label="Remove"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="clearHeldLicense(license.id)"
          />
        </div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt class="text-muted">Call sign</dt>
          <dd class="font-medium text-highlighted">{{ license.callSign }}</dd>
          <template v-if="license.name">
            <dt class="text-muted">Name</dt>
            <dd class="font-medium text-highlighted">{{ license.name }}</dd>
          </template>
          <dt class="text-muted">Class</dt>
          <dd class="font-medium text-highlighted">{{ license.licenseClassName || license.operatorClass || 'Not available' }}</dd>
          <dt class="text-muted">Type</dt>
          <dd class="font-medium text-highlighted">{{ license.lookupType || 'Unknown' }}</dd>
          <dt class="text-muted">Status</dt>
          <dd class="font-medium text-highlighted">{{ license.status }}</dd>
          <dt class="text-muted">Granted</dt>
          <dd class="font-medium text-highlighted">{{ license.grantDate || 'Unknown' }}</dd>
          <dt class="text-muted">Expires</dt>
          <dd class="font-medium text-highlighted">{{ license.expiryDate || 'Unknown' }}</dd>
          <dt class="text-muted">Last action</dt>
          <dd class="font-medium text-highlighted">{{ license.lastActionDate || 'Unknown' }}</dd>
          <template v-if="previousLicenseLabel(license)">
            <dt class="text-muted">Previous</dt>
            <dd class="font-medium text-highlighted">{{ previousLicenseLabel(license) }}</dd>
          </template>
          <template v-if="trusteeLabel(license)">
            <dt class="text-muted">Trustee</dt>
            <dd class="font-medium text-highlighted">{{ trusteeLabel(license) }}</dd>
          </template>
          <template v-if="license.gridsquare">
            <dt class="text-muted">Grid</dt>
            <dd class="font-medium text-highlighted">{{ license.gridsquare }}</dd>
          </template>
          <template v-if="license.ulsUrl">
            <dt class="text-muted">FCC</dt>
            <dd>
              <a
                :href="license.ulsUrl"
                class="font-medium text-primary underline-offset-2 hover:underline"
                @click="onOpenUls($event, license.ulsUrl)"
              >
                View on ULS
              </a>
            </dd>
          </template>
        </dl>
        <div v-if="license.status === 'VALID' && !license.licenseClassId" class="flex flex-col gap-2">
          <p class="text-xs text-muted">
            This call sign has no personal operator class (for example a club license). Choose the class to use for privilege checks.
          </p>
          <USelectMenu
            :model-value="classFor(license)"
            :items="amateurLicenseClassOptions"
            value-key="value"
            placeholder="Select license class"
            color="neutral"
            :search-input="false"
            class="w-full"
            @update:model-value="setClass(license.id, $event)"
          />
        </div>
      </div>

      <div v-for="license in gmrsLicenses" :key="license.id" class="flex flex-col gap-3 rounded-lg bg-muted px-3 py-3">
        <div class="flex items-start justify-between gap-2">
          <p class="text-sm font-medium text-highlighted">GMRS · {{ license.callSign }}</p>
          <UButton
            label="Remove"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="clearHeldLicense(license.id)"
          />
        </div>
        <p v-if="license.status !== 'VALID'" class="text-xs text-error">
          This GMRS license is not active and will not be used for privilege checks.
        </p>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt class="text-muted">Call sign</dt>
          <dd class="font-medium text-highlighted">{{ license.callSign }}</dd>
          <template v-if="license.name">
            <dt class="text-muted">Name</dt>
            <dd class="font-medium text-highlighted">{{ license.name }}</dd>
          </template>
          <dt class="text-muted">Status</dt>
          <dd class="font-medium text-highlighted">{{ license.status === 'VALID' ? 'Active' : 'Inactive' }}</dd>
          <template v-if="gmrsLocationLabel(license)">
            <dt class="text-muted">Location</dt>
            <dd class="font-medium text-highlighted">{{ gmrsLocationLabel(license) }}</dd>
          </template>
          <dt class="text-muted">Granted</dt>
          <dd class="font-medium text-highlighted">{{ license.grantDate || 'Unknown' }}</dd>
          <dt class="text-muted">Expires</dt>
          <dd class="font-medium text-highlighted">{{ license.expiryDate || 'Unknown' }}</dd>
          <dt class="text-muted">Last action</dt>
          <dd class="font-medium text-highlighted">{{ license.lastActionDate || 'Unknown' }}</dd>
          <template v-if="license.ulsUrl">
            <dt class="text-muted">FCC</dt>
            <dd>
              <a
                :href="license.ulsUrl"
                class="font-medium text-primary underline-offset-2 hover:underline"
                @click="onOpenUls($event, license.ulsUrl)"
              >
                View on ULS
              </a>
            </dd>
          </template>
        </dl>
      </div>

      <div v-if="showAmateurLookup" class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="amateurCallSign"
            placeholder="W1AW"
            class="min-w-40 flex-1 uppercase"
            :disabled="lookingUpAmateur"
            @keydown.enter.prevent="onAmateurLookup"
          />
          <UButton
            label="Lookup"
            color="primary"
            :loading="lookingUpAmateur"
            :disabled="lookingUpAmateur"
            @click="onAmateurLookup"
          />
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            :disabled="lookingUpAmateur"
            @click="showAmateurLookup = false"
          />
        </div>
        <p v-if="amateurLookupError" class="text-xs text-error">{{ amateurLookupError }}</p>
      </div>

      <div v-if="showGmrsLookup" class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="gmrsCallSign"
            placeholder="WRKP365"
            class="min-w-40 flex-1 uppercase"
            :disabled="lookingUpGmrs"
            @keydown.enter.prevent="onGmrsLookup"
          />
          <UButton
            label="Lookup"
            color="primary"
            :loading="lookingUpGmrs"
            :disabled="lookingUpGmrs"
            @click="onGmrsLookup"
          />
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            :disabled="lookingUpGmrs"
            @click="showGmrsLookup = false"
          />
        </div>
        <p v-if="gmrsLookupError" class="text-xs text-error">{{ gmrsLookupError }}</p>
      </div>

      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="!showAmateurLookup"
          label="Add amateur license"
          color="neutral"
          variant="soft"
          size="xs"
          icon="i-lucide-plus"
          @click="showAmateurLookup = true"
        />
        <UButton
          v-if="!showGmrsLookup"
          label="Add GMRS license"
          color="neutral"
          variant="soft"
          size="xs"
          icon="i-lucide-plus"
          @click="showGmrsLookup = true"
        />
      </div>
    </div>
  </div>
</template>
