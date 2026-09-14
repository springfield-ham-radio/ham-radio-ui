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

    <div class="flex min-h-0 flex-1 flex-col bg-muted">
      <header class="flex h-11 shrink-0 items-center justify-center px-4">
        <h2 class="text-sm font-semibold text-highlighted">{{ activeSection.label }}</h2>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <div
          class="mx-auto flex w-full flex-col px-6 pt-2 pb-10"
          :class="currentSection === 'radios' || currentSection === 'stations' ? 'max-w-2xl' : 'max-w-xl'"
        >

        <section v-if="currentSection === 'appearance'" class="flex flex-col gap-4">
          <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
            <div class="flex items-center justify-between gap-4 px-4 py-3">
              <div class="min-w-0">
                <p class="text-sm font-medium text-highlighted">Theme</p>
                <p class="text-xs text-muted">Light, dark, or match the system appearance.</p>
              </div>
              <ThemeSelect />
            </div>
          </div>

          <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
            <div class="flex items-center justify-between gap-4 px-4 py-3">
              <div class="min-w-0">
                <p class="text-sm font-medium text-highlighted">Settings columns</p>
                <p class="text-xs text-muted">
                  How many fields to show per row on the Radio Settings tab and in channel editors.
                </p>
              </div>
              <SettingsColumnsSelect />
            </div>
          </div>
        </section>

        <section v-else-if="currentSection === 'updates'" class="flex flex-col gap-4">
          <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
            <div class="flex items-center justify-between gap-4 px-4 py-3">
              <div class="min-w-0">
                <p class="text-sm font-medium text-highlighted">Automatic updates</p>
                <p class="text-xs text-muted">
                  Check GitHub Releases on launch and every few hours, then download updates in the background.
                </p>
              </div>
              <USwitch
                :model-value="autoUpdateEnabled"
                @update:model-value="setAutoUpdateEnabled"
              />
            </div>
          </div>

          <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
            <div class="flex flex-col gap-4 px-4 py-4">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <p class="text-sm font-medium text-highlighted">Version</p>
                  <p class="text-xs text-muted">{{ versionLabel }}</p>
                </div>
                <UButton
                  label="Check now"
                  color="primary"
                  icon="i-lucide-refresh-cw"
                  :loading="status === 'checking' || status === 'downloading'"
                  :disabled="status === 'checking' || status === 'downloading'"
                  @click="checkForUpdate('manual')"
                />
              </div>

              <p class="text-sm" :class="status === 'error' ? 'text-error' : 'text-muted'">
                {{ updaterStatusLabel }}
              </p>

              <UProgress
                v-if="status === 'downloading'"
                :model-value="downloadPercent"
                :max="100"
                size="sm"
              />

              <div v-if="status === 'ready'" class="flex justify-end">
                <UButton
                  label="Restart to update"
                  color="primary"
                  icon="i-lucide-rotate-cw"
                  @click="applyUpdateAndRelaunch"
                />
              </div>
            </div>
          </div>
        </section>

        <section v-else-if="currentSection === 'licenses'" class="flex flex-col gap-4">
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

        <section v-else-if="currentSection === 'radios'">
          <RadioModulesPreference />
        </section>

        <section v-else-if="currentSection === 'stations'" class="flex flex-col gap-4">
          <RadioStationPreference />
        </section>

        <section v-else-if="currentSection === 'serial'" class="flex flex-col gap-4">
          <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
            <div class="flex items-center justify-between gap-4 px-4 py-3">
              <div class="min-w-0">
                <p class="text-sm font-medium text-highlighted">Hide common system ports</p>
                <p class="text-xs text-muted">
                  Skip Bluetooth Incoming, debug-console, and wlan-debug in Import, Write, and Sniffer. Programming cables stay in the list.
                </p>
              </div>
              <USwitch
                :model-value="filterCommonPorts"
                aria-label="Hide common system ports"
                @update:model-value="setFilterCommonPorts"
              />
            </div>
          </div>

          <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
            <div class="flex flex-col gap-3 px-4 py-4">
              <UFormField
                label="Hide named ports"
                description="Enter device names to omit from serial-port lists, for example BryansHeadphones. Press Return after each name."
                class="w-full"
              >
                <UInputTags
                  v-model="excludedPortNames"
                  placeholder="BryansHeadphones"
                  add-on-blur
                  add-on-tab
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>
        </section>

        <section v-else-if="currentSection === 'sniffer'" class="flex flex-col gap-4">
          <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
            <div class="flex flex-col gap-4 px-4 py-4">
              <div class="min-w-0">
                <p class="text-sm font-medium text-highlighted">Connection</p>
                <p class="text-xs text-muted">
                  Radio → Sniffer talks to this host over HTTP. Include a username if SSH needs one, for example pi@192.168.1.10.
                </p>
              </div>

              <div class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <UFormField label="Host" class="w-full">
                  <UInput
                    v-model="snifferHostInput"
                    placeholder="127.0.0.1"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Port" class="w-full">
                  <UInput
                    v-model.number="snifferPortInput"
                    type="number"
                    min="1"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <p v-if="snifferSettingsError" class="text-xs text-error">{{ snifferSettingsError }}</p>
            </div>
          </div>

          <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
            <div class="flex flex-col gap-4 px-4 py-4">
              <div class="min-w-0">
                <p class="text-sm font-medium text-highlighted">Sniffer process</p>
                <p class="text-xs text-muted">
                  {{ snifferProcessHint }}
                </p>
              </div>

              <UAlert
                v-if="!isDesktopSnifferSsh"
                color="neutral"
                variant="subtle"
                icon="i-lucide-monitor"
                title="Desktop app required"
                description="Install, start, and stop run only in the packaged Tauri app, where the bundled sniffer tree is available."
              />

              <UFormField label="Install directory" class="w-full">
                <UInput
                  v-model="snifferInstallDirectoryInput"
                  placeholder="~/ham-radio-sniffer"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Run command" class="w-full">
                <UInput
                  v-model="snifferStartCommandInput"
                  placeholder="yarn start"
                  class="w-full"
                />
              </UFormField>

              <UCheckbox
                v-model="snifferSshEnabledInput"
                label="Control over SSH"
                description="Run install, start, and stop on Host over SSH. Uses SSH keys or your agent only (no passwords)."
              />

              <div class="rounded-lg bg-muted px-3 py-3">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-xs font-medium text-highlighted">Status</p>
                  <UBadge
                    :color="remoteHostBadgeColor"
                    variant="subtle"
                    size="sm"
                  >
                    {{ remoteHostLabel }}
                  </UBadge>
                  <UBadge
                    :color="remoteInstallBadgeColor"
                    variant="subtle"
                    size="sm"
                  >
                    {{ remoteInstallLabel }}
                  </UBadge>
                </div>
                <p class="mt-2 text-xs text-muted">
                  {{ remoteStatusSummary }}
                </p>
              </div>

              <div class="flex flex-wrap items-center justify-between gap-3">
                <UButton
                  label="Install"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  icon="i-lucide-upload"
                  :loading="snifferSshBusy === 'install'"
                  :disabled="!canRunSnifferActions || snifferSshBusy !== undefined"
                  @click="onInstallRemoteSniffer"
                />
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-highlighted">Running</span>
                  <USwitch
                    size="sm"
                    aria-label="Sniffer process"
                    :model-value="remoteSnifferRunning"
                    :disabled="remoteSnifferToggleDisabled"
                    :loading="snifferSshBusy === 'start' || snifferSshBusy === 'stop'"
                    @update:model-value="onToggleRemoteSniffer"
                  />
                </div>
              </div>

              <UAlert
                v-if="snifferSshStatusLabel"
                :color="snifferSshError ? 'error' : 'success'"
                variant="subtle"
                :icon="snifferSshError ? 'i-lucide-circle-alert' : 'i-lucide-circle-check'"
                :title="snifferSshError ? 'Action failed' : 'Action succeeded'"
              >
                <template #description>
                  <p class="whitespace-pre-wrap break-words text-xs">{{ snifferSshStatusLabel }}</p>
                </template>
              </UAlert>
              <ul v-if="snifferSshCheckMessages.length > 0" class="list-disc space-y-1 pl-5 text-xs text-muted">
                <li v-for="(message, index) in snifferSshCheckMessages" :key="index">{{ message }}</li>
              </ul>
            </div>
          </div>
        </section>
        </div>
      </div>
    </div>
  </div>

</template>

<script setup lang="ts">
import { openExternalUrl } from '~/utils/open-external-url';
import { readSerialPortSettings, writeSerialPortSettings } from '~/utils/serial-port-settings';
import { parseSnifferSettings, readSnifferSettings, snifferSshTarget, writeSnifferSettings } from '~/utils/sniffer-settings';
import {
  checkRemoteSnifferHost,
  installRemoteSniffer,
  remoteSnifferStatus,
  startRemoteSniffer,
  stopRemoteSniffer,
} from '~/utils/sniffer-remote';
import type { RemoteSnifferCheckResult } from '~/utils/sniffer-ssh';
import {
  remoteSnifferInstallBadgeColor,
  remoteSnifferInstallLabel,
} from '~/utils/sniffer-ssh';
import { APP_NAME } from '~/utils/app-name';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

useHead({
  title: 'Preferences',
});

type PreferenceSection = 'appearance' | 'updates' | 'licenses' | 'radios' | 'stations' | 'serial' | 'sniffer';

const sections = [
  {
    id: 'appearance' as const,
    label: 'Appearance',
    icon: 'i-lucide-palette',
    tileClass: 'bg-indigo-500',
  },
  {
    id: 'updates' as const,
    label: 'Updates',
    icon: 'i-lucide-refresh-cw',
    tileClass: 'bg-sky-500',
  },
  {
    id: 'licenses' as const,
    label: 'Licenses',
    icon: 'i-lucide-id-card',
    tileClass: 'bg-amber-500',
  },
  {
    id: 'radios' as const,
    label: 'Radios',
    icon: 'i-lucide-radio',
    tileClass: 'bg-emerald-500',
  },
  {
    id: 'stations' as const,
    label: 'Stations',
    icon: 'i-lucide-map-pin',
    tileClass: 'bg-teal-500',
  },
  {
    id: 'serial' as const,
    label: 'Serial ports',
    icon: 'i-lucide-usb',
    tileClass: 'bg-orange-500',
  },
  {
    id: 'sniffer' as const,
    label: 'Sniffer',
    icon: 'i-lucide-audio-lines',
    tileClass: 'bg-violet-500',
  },
];

const route = useRoute();
const router = useRouter();
const {
  status,
  autoUpdateEnabled,
  currentVersion,
  availableVersion,
  downloadPercent,
  lastError,
  lastCheckAt,
  isPackagedDesktopApp,
  checkForUpdate,
  applyUpdateAndRelaunch,
  setAutoUpdateEnabled,
} = useAppUpdater();
const initialSerialPortSettings = readSerialPortSettings();
const filterCommonPorts = ref(initialSerialPortSettings.filterCommonPorts);
const excludedPortNames = ref([...initialSerialPortSettings.excludedPortNames]);
const initialSnifferSettings = readSnifferSettings();
const snifferHostInput = ref(initialSnifferSettings.host);
const snifferPortInput = ref(initialSnifferSettings.port);
const snifferInstallDirectoryInput = ref(initialSnifferSettings.installDirectory);
const snifferStartCommandInput = ref(initialSnifferSettings.startCommand);
const snifferSshEnabledInput = ref(initialSnifferSettings.sshEnabled);
const snifferSettingsError = ref('');
const snifferSshBusy = ref<'install' | 'start' | 'stop'>();
const snifferSshStatusLabel = ref('');
const snifferSshError = ref(false);
const snifferSshCheckMessages = ref<string[]>([]);
const remoteHostCheck = ref<RemoteSnifferCheckResult>();
const remoteSnifferRunning = ref(false);
const snifferProbeBusy = ref(false);

const SNIFFER_AUTOSAVE_MS = 300;
const SNIFFER_PROBE_MS = 700;
const SNIFFER_STATUS_POLL_MS = 8000;
let snifferAutosaveTimer: ReturnType<typeof setTimeout> | undefined;
let snifferProbeTimer: ReturnType<typeof setTimeout> | undefined;
let snifferStatusPollTimer: ReturnType<typeof setInterval> | undefined;
let snifferProbeSeq = 0;
let applyingSnifferSettings = false;

const isDesktopSnifferSsh = computed(() => isTauriRuntime());

const canRunSnifferActions = computed(() => {
  if (!isDesktopSnifferSsh.value || snifferInstallDirectoryInput.value.trim().length === 0) {
    return false;
  }

  const target = snifferSshTarget(draftSnifferSettings());

  if (!target) {
    return false;
  }

  return !snifferSshEnabledInput.value || target.sshHost.length > 0;
});

const snifferProcessHint = computed(() => {
  if (snifferSshEnabledInput.value) {
    return 'Install, start, and stop run over SSH on Host. The app never installs Node for you.';
  }

  return 'Install, start, and stop run on this computer. The app never installs Node for you.';
});

const remoteHostLabel = computed(() => {
  if (!remoteHostCheck.value) {
    return snifferProbeBusy.value ? 'Checking' : 'Host unknown';
  }

  return remoteHostCheck.value.ok ? 'Host ready' : 'Host not ready';
});

const remoteHostBadgeColor = computed(() => {
  if (!remoteHostCheck.value) {
    return 'neutral';
  }

  return remoteHostCheck.value.ok ? 'success' : 'error';
});

const remoteInstallLabel = computed(() => {
  if (!remoteHostCheck.value) {
    return snifferProbeBusy.value ? 'Checking' : 'Install unknown';
  }

  return remoteSnifferInstallLabel(remoteHostCheck.value);
});

const remoteInstallBadgeColor = computed(() => {
  if (!remoteHostCheck.value) {
    return 'neutral';
  }

  return remoteSnifferInstallBadgeColor(remoteHostCheck.value);
});

const remoteSnifferReadyToStart = computed(() => {
  return Boolean(remoteHostCheck.value?.sourcesPresent && remoteHostCheck.value?.buildPresent);
});

const remoteSnifferToggleDisabled = computed(() => {
  if (!isDesktopSnifferSsh.value || snifferSshBusy.value !== undefined) {
    return true;
  }

  if (remoteSnifferRunning.value) {
    return false;
  }

  return !canRunSnifferActions.value || !remoteSnifferReadyToStart.value;
});

const remoteStatusSummary = computed(() => {
  if (!canRunSnifferActions.value) {
    return 'Set a host, port, and install directory to check status.';
  }

  if (snifferSshBusy.value === 'install') {
    return 'Copying sources and running yarn install/build. This can take several minutes.';
  }

  if (snifferSshBusy.value === 'start') {
    return 'Starting the sniffer…';
  }

  if (snifferSshBusy.value === 'stop') {
    return 'Stopping the sniffer…';
  }

  if (!remoteHostCheck.value) {
    return snifferProbeBusy.value
      ? 'Checking whether the sniffer is installed and running…'
      : 'Waiting to check whether the sniffer is installed and running.';
  }

  if (remoteSnifferRunning.value) {
    return 'Sniffer is running. Radio → Sniffer uses Host and Port above.';
  }

  if (remoteHostCheck.value.sourcesPresent && remoteHostCheck.value.buildPresent && remoteHostCheck.value.versionMatch === false) {
    const installed = remoteHostCheck.value.installedVersion ?? 'unknown';
    const expected = remoteHostCheck.value.expectedVersion ?? 'the bundled copy';
    return `Sniffer ${installed} is installed; this app ships ${expected}. Run Install to update.`;
  }

  if (remoteHostCheck.value.sourcesPresent && remoteHostCheck.value.buildPresent) {
    return remoteHostCheck.value.installedVersion
      ? `Sniffer ${remoteHostCheck.value.installedVersion} is installed and built. Turn on Running when you are ready.`
      : 'Sniffer is installed and built. Turn on Running when you are ready.';
  }

  if (remoteHostCheck.value.sourcesPresent) {
    return 'Sources are present, but the build is missing. Run Install to finish setup.';
  }

  if (remoteHostCheck.value.ok) {
    return 'Prerequisites look good. Run Install to copy and build the sniffer.';
  }

  return 'Fix the issues listed below before installing.';
});

function draftSnifferSettings() {
  return parseSnifferSettings(
    JSON.stringify({
      host: snifferHostInput.value,
      port: snifferPortInput.value,
      installDirectory: snifferInstallDirectoryInput.value,
      startCommand: snifferStartCommandInput.value,
      sshEnabled: snifferSshEnabledInput.value,
    }),
  );
}

/**
 * Persist sniffer preferences when host and port are valid.
 *
 * Invalid drafts are rejected without writing so a mid-edit value cannot wipe a
 * previously saved origin. Returns whether storage was updated.
 */
function saveSnifferSettings(): boolean {
  const parsed = draftSnifferSettings();
  const enteredHost = snifferHostInput.value.trim();
  const enteredPort = snifferPortInput.value;

  if (!enteredHost || parsed.host !== enteredHost || !Number.isInteger(enteredPort) || enteredPort <= 0) {
    snifferSettingsError.value = 'Enter a host and port, for example 127.0.0.1 and 3010';
    return false;
  }

  applyingSnifferSettings = true;

  try {
    writeSnifferSettings(parsed);
    snifferHostInput.value = parsed.host;
    snifferPortInput.value = parsed.port;
    snifferInstallDirectoryInput.value = parsed.installDirectory;
    snifferStartCommandInput.value = parsed.startCommand;
    snifferSshEnabledInput.value = parsed.sshEnabled;
    snifferSettingsError.value = '';
  } finally {
    applyingSnifferSettings = false;
  }

  return true;
}

function flushSnifferAutosave(): void {
  if (snifferAutosaveTimer) {
    clearTimeout(snifferAutosaveTimer);
    snifferAutosaveTimer = undefined;
  }

  saveSnifferSettings();
}

function scheduleSnifferAutosave(): void {
  if (applyingSnifferSettings) {
    return;
  }

  if (snifferAutosaveTimer) {
    clearTimeout(snifferAutosaveTimer);
  }

  snifferAutosaveTimer = setTimeout(() => {
    snifferAutosaveTimer = undefined;
    saveSnifferSettings();
  }, SNIFFER_AUTOSAVE_MS);
}

watch(
  [
    snifferHostInput,
    snifferPortInput,
    snifferInstallDirectoryInput,
    snifferStartCommandInput,
    snifferSshEnabledInput,
  ],
  () => {
    scheduleSnifferAutosave();

    if (!applyingSnifferSettings) {
      scheduleSnifferProbe();
    }
  },
);

onBeforeUnmount(() => {
  flushSnifferAutosave();
  stopSnifferStatusPoll();
  snifferProbeSeq += 1;
  if (snifferProbeTimer) {
    clearTimeout(snifferProbeTimer);
    snifferProbeTimer = undefined;
  }
});

function remoteActionError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function applyHostCheck(result: RemoteSnifferCheckResult): void {
  remoteHostCheck.value = result;
  snifferSshCheckMessages.value = result.messages;
}

function clearSnifferProbeState(): void {
  remoteHostCheck.value = undefined;
  remoteSnifferRunning.value = false;
  snifferSshCheckMessages.value = [];
  snifferProbeBusy.value = false;
}

function stopSnifferStatusPoll(): void {
  if (snifferStatusPollTimer) {
    clearInterval(snifferStatusPollTimer);
    snifferStatusPollTimer = undefined;
  }
}

function startSnifferStatusPoll(): void {
  stopSnifferStatusPoll();

  if (!isDesktopSnifferSsh.value) {
    return;
  }

  snifferStatusPollTimer = setInterval(() => {
    void refreshRemoteSnifferStatus();
  }, SNIFFER_STATUS_POLL_MS);
}

async function refreshRemoteSnifferStatus(): Promise<void> {
  if (!canRunSnifferActions.value || currentSection.value !== 'sniffer') {
    remoteSnifferRunning.value = false;
    return;
  }

  if (snifferSshBusy.value === 'start' || snifferSshBusy.value === 'stop') {
    return;
  }

  try {
    const status = await remoteSnifferStatus(draftSnifferSettings());
    remoteSnifferRunning.value = status.running;
  } catch {
    remoteSnifferRunning.value = false;
  }
}

async function probeSnifferHost(): Promise<void> {
  if (currentSection.value !== 'sniffer' || !isDesktopSnifferSsh.value) {
    return;
  }

  if (!canRunSnifferActions.value) {
    clearSnifferProbeState();
    return;
  }

  if (snifferSshBusy.value !== undefined) {
    return;
  }

  const seq = ++snifferProbeSeq;
  snifferProbeBusy.value = true;

  try {
    const settings = draftSnifferSettings();
    const [check, status] = await Promise.all([
      checkRemoteSnifferHost(settings),
      remoteSnifferStatus(settings).catch(() => ({ running: false })),
    ]);

    if (seq !== snifferProbeSeq) {
      return;
    }

    applyHostCheck(check);
    remoteSnifferRunning.value = status.running;
  } catch (error) {
    if (seq !== snifferProbeSeq) {
      return;
    }

    remoteHostCheck.value = undefined;
    remoteSnifferRunning.value = false;
    snifferSshCheckMessages.value = [remoteActionError(error)];
  } finally {
    if (seq === snifferProbeSeq) {
      snifferProbeBusy.value = false;
    }
  }
}

function scheduleSnifferProbe(delayMs = SNIFFER_PROBE_MS): void {
  if (snifferProbeTimer) {
    clearTimeout(snifferProbeTimer);
  }

  snifferProbeSeq += 1;
  snifferProbeTimer = setTimeout(() => {
    snifferProbeTimer = undefined;
    void probeSnifferHost();
  }, delayMs);
}

async function onInstallRemoteSniffer(): Promise<void> {
  flushSnifferAutosave();
  snifferProbeSeq += 1;
  snifferSshBusy.value = 'install';
  snifferSshError.value = false;
  snifferSshStatusLabel.value = 'Uploading and building on the remote host…';

  try {
    const result = await installRemoteSniffer(draftSnifferSettings());
    snifferSshError.value = !result.ok;
    snifferSshStatusLabel.value = result.message;

    const check = await checkRemoteSnifferHost(draftSnifferSettings());
    applyHostCheck(check);
    await refreshRemoteSnifferStatus();
  } catch (error) {
    snifferSshError.value = true;
    snifferSshStatusLabel.value = remoteActionError(error);
  } finally {
    snifferSshBusy.value = undefined;
  }
}

async function onStartRemoteSniffer(): Promise<void> {
  flushSnifferAutosave();
  snifferProbeSeq += 1;
  snifferSshBusy.value = 'start';
  snifferSshError.value = false;
  snifferSshStatusLabel.value = '';

  try {
    const result = await startRemoteSniffer(draftSnifferSettings());
    snifferSshError.value = !result.ok;
    snifferSshStatusLabel.value = result.message;
    await refreshRemoteSnifferStatus();
  } catch (error) {
    snifferSshError.value = true;
    snifferSshStatusLabel.value = remoteActionError(error);
    await refreshRemoteSnifferStatus();
  } finally {
    snifferSshBusy.value = undefined;
  }
}

async function onStopRemoteSniffer(): Promise<void> {
  snifferProbeSeq += 1;
  snifferSshBusy.value = 'stop';
  snifferSshError.value = false;
  snifferSshStatusLabel.value = '';

  try {
    const result = await stopRemoteSniffer(draftSnifferSettings());
    snifferSshError.value = !result.ok;
    snifferSshStatusLabel.value = result.message;
    await refreshRemoteSnifferStatus();
  } catch (error) {
    snifferSshError.value = true;
    snifferSshStatusLabel.value = remoteActionError(error);
    await refreshRemoteSnifferStatus();
  } finally {
    snifferSshBusy.value = undefined;
  }
}

async function onToggleRemoteSniffer(enabled: boolean): Promise<void> {
  if (enabled === remoteSnifferRunning.value) {
    return;
  }

  if (enabled) {
    if (!remoteSnifferReadyToStart.value) {
      return;
    }

    await onStartRemoteSniffer();
    return;
  }

  await onStopRemoteSniffer();
}

const currentSection = computed<PreferenceSection>(() => {
  const value = route.query.section;
  const section = Array.isArray(value) ? value[0] : value;

  if (section === 'stations' || section === 'antennas') {
    return 'stations';
  }

  if (
    section === 'licenses' ||
    section === 'radios' ||
    section === 'serial' ||
    section === 'updates' ||
    section === 'sniffer'
  ) {
    return section;
  }

  return 'appearance';
});

const activeSection = computed(() => {
  return sections.find((section) => section.id === currentSection.value) ?? sections[0];
});

function persistSerialPortSettings(): void {
  // Write storage only. Replacing `excludedPortNames` with a newly normalized
  // array retriggers Reka UI TagsInput's deep v-model and freezes the app
  // after the names have already been saved.
  writeSerialPortSettings({
    filterCommonPorts: filterCommonPorts.value,
    excludedPortNames: excludedPortNames.value,
  });
}

function setFilterCommonPorts(enabled: boolean): void {
  filterCommonPorts.value = enabled;
  persistSerialPortSettings();
}

watch(
  excludedPortNames,
  () => {
    persistSerialPortSettings();
  },
  { deep: true },
);

function selectSection(section: PreferenceSection): void {
  if (section === 'appearance') {
    void router.replace({ path: '/preferences' });
    return;
  }

  void router.replace({ path: '/preferences', query: { section } });
}

const versionLabel = computed(() => {
  if (currentVersion.value) {
    return `${APP_NAME} ${currentVersion.value}`;
  }

  return 'Version is shown in packaged desktop builds.';
});

const updaterStatusLabel = computed(() => {
  if (status.value === 'checking') {
    return 'Checking for updates…';
  }

  if (status.value === 'downloading') {
    return `Downloading update… ${downloadPercent.value}%`;
  }

  if (status.value === 'ready' && availableVersion.value) {
    return `Version ${availableVersion.value} is downloaded. Restart to finish installing.`;
  }

  if (status.value === 'error') {
    return lastError.value ?? 'Update check failed.';
  }

  if (!isPackagedDesktopApp()) {
    return 'Automatic updates run in packaged desktop builds.';
  }

  if (lastCheckAt.value) {
    return `Last checked ${new Date(lastCheckAt.value).toLocaleString()}.`;
  }

  return 'Not checked yet.';
});

watch(
  currentSection,
  (section) => {
    if (section === 'sniffer') {
      scheduleSnifferProbe(0);
      startSnifferStatusPoll();
      return;
    }

    stopSnifferStatusPoll();
  },
  { immediate: true },
);

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
