<template>
  <div class="flex h-full min-h-0">
    <nav class="flex w-56 shrink-0 flex-col gap-0.5 border-r border-default bg-elevated p-3">
      <button
        v-for="section in sections"
        :key="section.id"
        type="button"
        class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm font-medium transition-colors"
        :class="
          currentSection === section.id
            ? 'bg-primary text-inverted'
            : 'text-highlighted hover:bg-default/80'
        "
        :aria-current="currentSection === section.id ? 'page' : undefined"
        @click="selectSection(section.id)"
      >
        <span
          class="flex size-6 shrink-0 items-center justify-center rounded-md text-white"
          :class="section.tileClass"
        >
          <UIcon :name="section.icon" class="size-3.5" />
        </span>
        {{ section.label }}
      </button>
    </nav>

    <div class="min-h-0 flex-1 overflow-y-auto bg-muted">
      <div class="mx-auto flex w-full max-w-xl flex-col px-6 py-10">
        <header class="mb-8 flex flex-col items-center text-center">
          <span
            class="mb-3 flex size-16 items-center justify-center rounded-2xl text-white shadow-sm"
            :class="activeSection.tileClass"
          >
            <UIcon :name="activeSection.icon" class="size-8" />
          </span>
          <h2 class="text-xl font-semibold text-highlighted">{{ activeSection.label }}</h2>
          <p class="mt-1 max-w-md text-sm text-muted">{{ activeSection.description }}</p>
        </header>

        <section v-if="currentSection === 'appearance'">
          <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
            <div class="flex items-center justify-between gap-4 px-4 py-3">
              <div class="min-w-0">
                <p class="text-sm font-medium text-highlighted">Theme</p>
                <p class="text-xs text-muted">Light, dark, or match the system appearance.</p>
              </div>
              <ThemeSelect />
            </div>
          </div>
        </section>

        <section v-else class="flex flex-col gap-4">
          <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
            <div class="flex flex-col gap-4 px-4 py-4">
              <div class="min-w-0">
                <p class="text-sm font-medium text-highlighted">Amateur</p>
                <p class="text-xs text-muted">Look up your US amateur license to flag channels outside your privileges.</p>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <UInput
                  v-model="callSignInput"
                  placeholder="W1AW"
                  class="min-w-40 flex-1 uppercase"
                  :disabled="isLookingUp"
                  @keydown.enter.prevent="onLookup"
                />
                <UButton
                  label="Lookup"
                  color="primary"
                  :loading="isLookingUp"
                  :disabled="isLookingUp"
                  @click="onLookup"
                />
                <UButton
                  v-if="license"
                  label="Clear"
                  color="neutral"
                  variant="ghost"
                  :disabled="isLookingUp"
                  @click="clearLicense"
                />
              </div>

              <p v-if="lookupError" class="text-xs text-error">{{ lookupError }}</p>

              <div v-if="license" class="rounded-lg bg-muted px-3 py-3 text-sm">
                <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
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

                  <template v-if="previousLicenseLabel">
                    <dt class="text-muted">Previous</dt>
                    <dd class="font-medium text-highlighted">{{ previousLicenseLabel }}</dd>
                  </template>

                  <template v-if="trusteeLabel">
                    <dt class="text-muted">Trustee</dt>
                    <dd class="font-medium text-highlighted">{{ trusteeLabel }}</dd>
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
                        @click="onOpenUls"
                      >
                        View on ULS
                      </a>
                    </dd>
                  </template>
                </dl>
              </div>

              <div v-if="needsManualClass" class="flex flex-col gap-2 rounded-lg bg-muted px-3 py-3">
                <p class="text-xs text-muted">
                  This call sign has no personal operator class (for example a club license). Choose the class to use for privilege checks.
                </p>
                <USelectMenu
                  v-model="selectedManualClass"
                  :items="amateurLicenseClassOptions"
                  value-key="value"
                  placeholder="Select license class"
                  color="neutral"
                  :search-input="false"
                  class="w-full"
                />
              </div>
            </div>
          </div>

          <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
            <div class="flex flex-col gap-4 px-4 py-4">
              <div class="min-w-0">
                <p class="text-sm font-medium text-highlighted">GMRS</p>
                <p class="text-xs text-muted">Look up your GMRS call sign. An active grant covers FRS/GMRS channels for this household.</p>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <UInput
                  v-model="gmrsCallSignInput"
                  placeholder="WRKP365"
                  class="min-w-40 flex-1 uppercase"
                  :disabled="isLookingUpGmrs"
                  @keydown.enter.prevent="onGmrsLookup"
                />
                <UButton
                  label="Lookup"
                  color="primary"
                  :loading="isLookingUpGmrs"
                  :disabled="isLookingUpGmrs"
                  @click="onGmrsLookup"
                />
                <UButton
                  v-if="gmrsLicense"
                  label="Clear"
                  color="neutral"
                  variant="ghost"
                  :disabled="isLookingUpGmrs"
                  @click="clearGmrsLicense"
                />
              </div>

              <p v-if="gmrsLookupError" class="text-xs text-error">{{ gmrsLookupError }}</p>

              <div v-if="gmrsLicense" class="rounded-lg bg-muted px-3 py-3 text-sm">
                <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                  <dt class="text-muted">Call sign</dt>
                  <dd class="font-medium text-highlighted">{{ gmrsLicense.callSign }}</dd>

                  <template v-if="gmrsLicense.name">
                    <dt class="text-muted">Name</dt>
                    <dd class="font-medium text-highlighted">{{ gmrsLicense.name }}</dd>
                  </template>

                  <dt class="text-muted">Status</dt>
                  <dd class="font-medium text-highlighted">{{ gmrsLicense.status === 'VALID' ? 'Active' : 'Inactive' }}</dd>

                  <template v-if="gmrsLocationLabel">
                    <dt class="text-muted">Location</dt>
                    <dd class="font-medium text-highlighted">{{ gmrsLocationLabel }}</dd>
                  </template>

                  <dt class="text-muted">Granted</dt>
                  <dd class="font-medium text-highlighted">{{ gmrsLicense.grantDate || 'Unknown' }}</dd>

                  <dt class="text-muted">Expires</dt>
                  <dd class="font-medium text-highlighted">{{ gmrsLicense.expiryDate || 'Unknown' }}</dd>

                  <dt class="text-muted">Last action</dt>
                  <dd class="font-medium text-highlighted">{{ gmrsLicense.lastActionDate || 'Unknown' }}</dd>

                  <template v-if="gmrsLicense.ulsUrl">
                    <dt class="text-muted">FCC</dt>
                    <dd>
                      <a
                        :href="gmrsLicense.ulsUrl"
                        class="font-medium text-primary underline-offset-2 hover:underline"
                        @click="onOpenGmrsUls"
                      >
                        View on ULS
                      </a>
                    </dd>
                  </template>
                </dl>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { openExternalUrl } from '~/utils/open-external-url';

useHead({
  title: 'Preferences',
});

type PreferenceSection = 'appearance' | 'licenses';

const sections = [
  {
    id: 'appearance' as const,
    label: 'Appearance',
    description: 'Choose how Ham Radio looks on this computer.',
    icon: 'i-lucide-palette',
    tileClass: 'bg-indigo-500',
  },
  {
    id: 'licenses' as const,
    label: 'Licenses',
    description: 'Look up amateur and GMRS licenses used for transmit privilege checks.',
    icon: 'i-lucide-id-card',
    tileClass: 'bg-amber-500',
  },
];

const route = useRoute();
const router = useRouter();

const currentSection = computed<PreferenceSection>(() => {
  const value = route.query.section;
  const section = Array.isArray(value) ? value[0] : value;

  return section === 'licenses' ? 'licenses' : 'appearance';
});

const activeSection = computed(() => {
  return sections.find((section) => section.id === currentSection.value) ?? sections[0];
});

function selectSection(section: PreferenceSection): void {
  if (section === 'appearance') {
    void router.replace({ path: '/preferences' });
    return;
  }

  void router.replace({ path: '/preferences', query: { section } });
}

const {
  license,
  callSignInput,
  isLookingUp,
  lookupError,
  needsManualClass,
  amateurLicenseClassOptions,
  lookupCallSign,
  setManualLicenseClass,
  clearLicense,
  gmrsLicense,
  gmrsCallSignInput,
  isLookingUpGmrs,
  gmrsLookupError,
  lookupGmrsCallSign,
  clearGmrsLicense,
} = useOperatorLicense();

const selectedManualClass = computed({
  get: () => license.value?.licenseClassId ?? undefined,
  set: (value: string | undefined) => {
    if (value) {
      setManualLicenseClass(value);
    }
  },
});

const previousLicenseLabel = computed(() => {
  if (!license.value?.previousCallSign) {
    return undefined;
  }

  if (license.value.previousOperatorClass) {
    return `${license.value.previousCallSign} (${license.value.previousOperatorClass})`;
  }

  return license.value.previousCallSign;
});

const trusteeLabel = computed(() => {
  if (!license.value?.trusteeCallSign && !license.value?.trusteeName) {
    return undefined;
  }

  if (license.value.trusteeCallSign && license.value.trusteeName) {
    return `${license.value.trusteeName} (${license.value.trusteeCallSign})`;
  }

  return license.value.trusteeName || license.value.trusteeCallSign;
});

const gmrsLocationLabel = computed(() => {
  if (!gmrsLicense.value) {
    return undefined;
  }

  const parts = [gmrsLicense.value.city, gmrsLicense.value.state].filter(Boolean);

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join(', ');
});

async function onLookup(): Promise<void> {
  await lookupCallSign();
}

async function onGmrsLookup(): Promise<void> {
  await lookupGmrsCallSign();
}

async function onOpenUls(event: Event): Promise<void> {
  event.preventDefault();

  if (!license.value?.ulsUrl) {
    return;
  }

  await openExternalUrl(license.value.ulsUrl);
}

async function onOpenGmrsUls(event: Event): Promise<void> {
  event.preventDefault();

  if (!gmrsLicense.value?.ulsUrl) {
    return;
  }

  await openExternalUrl(gmrsLicense.value.ulsUrl);
}
</script>
