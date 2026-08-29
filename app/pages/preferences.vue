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

        <section v-else-if="currentSection === 'radios'" class="flex flex-col gap-4">
          <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
            <div class="flex flex-col gap-4 px-4 py-4">
              <div class="min-w-0">
                <p class="text-sm font-medium text-highlighted">Installed radios</p>
                <p class="text-xs text-muted">
                  Official modules are verified. Local files are marked Unverified and are not updated from the catalog.
                </p>
              </div>

              <ul v-if="catalogRecords.length > 0" class="divide-y divide-default rounded-lg bg-muted">
                <li
                  v-for="record in catalogRecords"
                  :key="record.modelId"
                  class="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                >
                  <div class="min-w-0">
                    <p class="truncate font-medium text-highlighted">
                      {{ record.manufacturer }} {{ record.name }}
                    </p>
                    <p class="truncate text-xs text-muted">v{{ record.version }} · {{ record.modelId }}</p>
                  </div>
                  <div class="flex shrink-0 items-center gap-2">
                    <UBadge
                      :label="record.source === 'user' ? 'Unverified' : record.source === 'installed' ? 'Official' : 'Bundled'"
                      :color="record.source === 'user' ? 'warning' : 'success'"
                      variant="subtle"
                      size="sm"
                    />
                    <UButton
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-trash-2"
                      size="xs"
                      aria-label="Remove radio"
                      :disabled="removingModelId === record.modelId"
                      @click="requestRemoveRadio(record)"
                    />
                  </div>
                </li>
              </ul>
              <p v-else class="text-sm text-muted">No radios installed yet.</p>

              <div>
                <UButton
                  label="Install radios…"
                  color="primary"
                  icon="i-lucide-download"
                  @click="openModulesInstall()"
                />
              </div>
            </div>
          </div>
        </section>

        <section v-else-if="currentSection === 'sniffer'" class="flex flex-col gap-4">
          <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
            <div class="flex flex-col gap-4 px-4 py-4">
              <div class="min-w-0">
                <p class="text-sm font-medium text-highlighted">Connection</p>
                <p class="text-xs text-muted">
                  Sniffer URL is enough for normal use. Install and run ham-radio-sniffer yourself, then point the app at its HTTP origin.
                </p>
              </div>

              <UFormField label="Sniffer URL" class="w-full">
                <UInput
                  v-model="snifferBaseUrlInput"
                  placeholder="http://127.0.0.1:3010"
                  class="w-full"
                  @keydown.enter.prevent="saveSnifferSettings"
                />
              </UFormField>

              <div class="flex justify-end">
                <UButton
                  label="Save"
                  color="primary"
                  :disabled="snifferBaseUrlInput.trim() === ''"
                  @click="saveSnifferSettings"
                />
              </div>

              <p v-if="snifferSettingsError" class="text-xs text-error">{{ snifferSettingsError }}</p>
              <p v-else-if="snifferSettingsSaved" class="text-xs text-muted">Saved. The Sniffer page reconnects automatically.</p>
            </div>
          </div>

          <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
            <div class="flex flex-col gap-4 px-4 py-4">
              <div class="min-w-0">
                <p class="text-sm font-medium text-highlighted">Remote SSH (optional)</p>
                <p class="text-xs text-muted">
                  Leave the host blank to keep SSH disabled. When set, the desktop app can check Node on the host, upload the bundled sniffer sources, build them remotely, and start the process with a local port forward. Uses SSH keys or your agent only (no passwords). The app never installs Node for you.
                </p>
              </div>

              <UAlert
                v-if="!isDesktopSnifferSsh"
                color="neutral"
                variant="subtle"
                icon="i-lucide-monitor"
                title="Desktop app required"
                description="Check, install, start, and stop run only in the packaged Tauri app, where the bundled sniffer tree and local ssh/scp are available."
              />

              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <UFormField label="SSH host" class="w-full sm:col-span-2">
                  <UInput
                    v-model="snifferSshHostInput"
                    placeholder="pi@raspberrypi.local"
                    class="w-full"
                    @keydown.enter.prevent="saveSnifferSettings"
                  />
                </UFormField>

                <UFormField label="SSH port" class="w-full">
                  <UInput
                    v-model.number="snifferSshPortInput"
                    type="number"
                    min="1"
                    class="w-full"
                    @keydown.enter.prevent="saveSnifferSettings"
                  />
                </UFormField>

                <UFormField label="Remote directory" class="w-full">
                  <UInput
                    v-model="snifferRemoteDirectoryInput"
                    placeholder="~/ham-radio-sniffer"
                    class="w-full"
                    @keydown.enter.prevent="saveSnifferSettings"
                  />
                </UFormField>

                <UFormField label="Remote start command" class="w-full sm:col-span-2">
                  <UInput
                    v-model="snifferRemoteStartCommandInput"
                    placeholder="yarn start"
                    class="w-full"
                    @keydown.enter.prevent="saveSnifferSettings"
                  />
                </UFormField>

                <UFormField label="Local forward port" class="w-full">
                  <UInput
                    v-model.number="snifferLocalPortInput"
                    type="number"
                    min="1"
                    class="w-full"
                    @keydown.enter.prevent="saveSnifferSettings"
                  />
                </UFormField>

                <UFormField label="Remote sniffer port" class="w-full">
                  <UInput
                    v-model.number="snifferRemotePortInput"
                    type="number"
                    min="1"
                    class="w-full"
                    @keydown.enter.prevent="saveSnifferSettings"
                  />
                </UFormField>
              </div>

              <div class="flex flex-wrap justify-end gap-2">
                <UButton
                  label="Save"
                  color="neutral"
                  variant="outline"
                  @click="saveSnifferSettings"
                />
                <UButton
                  label="Check host"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-shield-check"
                  :loading="snifferSshBusy === 'check'"
                  :disabled="!canRunSnifferSshActions || snifferSshBusy !== undefined"
                  @click="onCheckRemoteSniffer"
                />
                <UButton
                  label="Install / update"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-upload"
                  :loading="snifferSshBusy === 'install'"
                  :disabled="!canRunSnifferSshActions || snifferSshBusy !== undefined"
                  @click="onInstallRemoteSniffer"
                />
                <UButton
                  label="Start remote"
                  color="primary"
                  icon="i-lucide-play"
                  :loading="snifferSshBusy === 'start'"
                  :disabled="!canRunSnifferSshActions || snifferSshBusy !== undefined"
                  @click="onStartRemoteSniffer"
                />
                <UButton
                  label="Stop remote"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-square"
                  :loading="snifferSshBusy === 'stop'"
                  :disabled="!isDesktopSnifferSsh || snifferSshBusy !== undefined"
                  @click="onStopRemoteSniffer"
                />
              </div>

              <p v-if="snifferSshStatusLabel" class="text-xs" :class="snifferSshError ? 'text-error' : 'text-muted'">
                {{ snifferSshStatusLabel }}
              </p>
              <ul v-if="snifferSshCheckMessages.length > 0" class="list-disc space-y-1 pl-5 text-xs text-muted">
                <li v-for="(message, index) in snifferSshCheckMessages" :key="index">{{ message }}</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>

  <UModal v-model:open="removeConfirmOpen" :ui="{ content: 'sm:max-w-md' }">
    <template #content>
      <div class="flex flex-col gap-4 p-5">
        <div>
          <h2 class="text-lg font-semibold text-highlighted">Remove radio?</h2>
          <p class="mt-2 text-sm text-muted">
            {{ removeConfirmMessage }}
          </p>
        </div>
        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="cancelRemoveRadio" />
          <UButton
            label="Remove"
            color="error"
            :loading="removingModelId !== undefined"
            @click="confirmRemoveRadio"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { RadioCatalogRecord } from '~/utils/radio-catalog-db';
import { listRadioCatalogRecords } from '~/utils/radio-catalog-db';
import { isModuleInstallPath } from '~/utils/radio-module-install';
import { openExternalUrl } from '~/utils/open-external-url';
import { parseSnifferSettings, readSnifferSettings, snifferLocalForwardBaseUrl, writeSnifferSettings } from '~/utils/sniffer-settings';
import {
  checkRemoteSnifferHost,
  installRemoteSniffer,
  startRemoteSniffer,
  stopRemoteSniffer,
} from '~/utils/sniffer-remote';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

useHead({
  title: 'Preferences',
});

type PreferenceSection = 'appearance' | 'updates' | 'licenses' | 'radios' | 'sniffer';

const sections = [
  {
    id: 'appearance' as const,
    label: 'Appearance',
    description: 'Choose how Ham Radio looks on this computer.',
    icon: 'i-lucide-palette',
    tileClass: 'bg-indigo-500',
  },
  {
    id: 'updates' as const,
    label: 'Updates',
    description: 'Keep Ham Radio current with signed releases from GitHub.',
    icon: 'i-lucide-refresh-cw',
    tileClass: 'bg-sky-500',
  },
  {
    id: 'licenses' as const,
    label: 'Licenses',
    description: 'Look up amateur and GMRS licenses used for transmit privilege checks.',
    icon: 'i-lucide-id-card',
    tileClass: 'bg-amber-500',
  },
  {
    id: 'radios' as const,
    label: 'Radios',
    description: 'Install official radio modules or add unverified modules from a local file.',
    icon: 'i-lucide-radio',
    tileClass: 'bg-emerald-500',
  },
  {
    id: 'sniffer' as const,
    label: 'Sniffer',
    description: 'Point Ham Radio at a sniffer URL, or optionally install and start one over SSH.',
    icon: 'i-lucide-audio-lines',
    tileClass: 'bg-violet-500',
  },
];

const route = useRoute();
const router = useRouter();
const { openModulesInstall, uninstallRadio, configurations } = useRadio();
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
const catalogRecords = ref<RadioCatalogRecord[]>([]);
const removeConfirmOpen = ref(false);
const pendingRemoveRecord = ref<RadioCatalogRecord | undefined>();
const removingModelId = ref<string | undefined>();
const initialSnifferSettings = readSnifferSettings();
const snifferBaseUrlInput = ref(initialSnifferSettings.baseUrl);
const snifferSshHostInput = ref(initialSnifferSettings.sshHost);
const snifferSshPortInput = ref(initialSnifferSettings.sshPort);
const snifferRemoteDirectoryInput = ref(initialSnifferSettings.remoteDirectory);
const snifferRemoteStartCommandInput = ref(initialSnifferSettings.remoteStartCommand);
const snifferLocalPortInput = ref(initialSnifferSettings.localPort);
const snifferRemotePortInput = ref(initialSnifferSettings.remotePort);
const snifferSettingsError = ref('');
const snifferSettingsSaved = ref(false);
const snifferSshBusy = ref<'check' | 'install' | 'start' | 'stop'>();
const snifferSshStatusLabel = ref('');
const snifferSshError = ref(false);
const snifferSshCheckMessages = ref<string[]>([]);

const isDesktopSnifferSsh = computed(() => isTauriRuntime());

const canRunSnifferSshActions = computed(() => {
  return isDesktopSnifferSsh.value && snifferSshHostInput.value.trim().length > 0;
});

function draftSnifferSettings() {
  return parseSnifferSettings(
    JSON.stringify({
      baseUrl: snifferBaseUrlInput.value,
      sshHost: snifferSshHostInput.value,
      sshPort: snifferSshPortInput.value,
      remoteDirectory: snifferRemoteDirectoryInput.value,
      remoteStartCommand: snifferRemoteStartCommandInput.value,
      localPort: snifferLocalPortInput.value,
      remotePort: snifferRemotePortInput.value,
    }),
  );
}

function saveSnifferSettings(): void {
  const parsed = draftSnifferSettings();
  const normalized = parsed.baseUrl;
  const entered = snifferBaseUrlInput.value.trim().replace(/\/+$/, '');

  if (entered && entered !== normalized) {
    snifferSettingsError.value = 'Enter an http or https URL, for example http://127.0.0.1:3010';
    snifferSettingsSaved.value = false;
    return;
  }

  writeSnifferSettings(parsed);
  snifferBaseUrlInput.value = parsed.baseUrl;
  snifferSshHostInput.value = parsed.sshHost;
  snifferSshPortInput.value = parsed.sshPort;
  snifferRemoteDirectoryInput.value = parsed.remoteDirectory;
  snifferRemoteStartCommandInput.value = parsed.remoteStartCommand;
  snifferLocalPortInput.value = parsed.localPort;
  snifferRemotePortInput.value = parsed.remotePort;
  snifferSettingsError.value = '';
  snifferSettingsSaved.value = true;
}

function remoteActionError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function onCheckRemoteSniffer(): Promise<void> {
  saveSnifferSettings();
  snifferSshBusy.value = 'check';
  snifferSshCheckMessages.value = [];
  snifferSshError.value = false;

  try {
    const result = await checkRemoteSnifferHost(draftSnifferSettings());
    snifferSshCheckMessages.value = result.messages;
    snifferSshError.value = !result.ok;
    snifferSshStatusLabel.value = result.ok
      ? 'Remote host looks ready for install or start.'
      : 'Remote host check failed. Fix the issues below, then try again.';
  } catch (error) {
    snifferSshError.value = true;
    snifferSshStatusLabel.value = remoteActionError(error);
  } finally {
    snifferSshBusy.value = undefined;
  }
}

async function onInstallRemoteSniffer(): Promise<void> {
  saveSnifferSettings();
  snifferSshBusy.value = 'install';
  snifferSshError.value = false;

  try {
    const result = await installRemoteSniffer(draftSnifferSettings());
    snifferSshError.value = !result.ok;
    snifferSshStatusLabel.value = result.message;
  } catch (error) {
    snifferSshError.value = true;
    snifferSshStatusLabel.value = remoteActionError(error);
  } finally {
    snifferSshBusy.value = undefined;
  }
}

async function onStartRemoteSniffer(): Promise<void> {
  saveSnifferSettings();
  snifferSshBusy.value = 'start';
  snifferSshError.value = false;

  try {
    const settings = draftSnifferSettings();
    const result = await startRemoteSniffer(settings);
    snifferSshError.value = !result.ok;
    snifferSshStatusLabel.value = result.message;

    if (result.ok) {
      const forwardUrl = snifferLocalForwardBaseUrl(settings.localPort);
      writeSnifferSettings({ ...settings, baseUrl: forwardUrl });
      snifferBaseUrlInput.value = forwardUrl;
      snifferSettingsSaved.value = true;
    }
  } catch (error) {
    snifferSshError.value = true;
    snifferSshStatusLabel.value = remoteActionError(error);
  } finally {
    snifferSshBusy.value = undefined;
  }
}

async function onStopRemoteSniffer(): Promise<void> {
  snifferSshBusy.value = 'stop';
  snifferSshError.value = false;

  try {
    const result = await stopRemoteSniffer();
    snifferSshError.value = !result.ok;
    snifferSshStatusLabel.value = result.message;
  } catch (error) {
    snifferSshError.value = true;
    snifferSshStatusLabel.value = remoteActionError(error);
  } finally {
    snifferSshBusy.value = undefined;
  }
}

const removeConfirmMessage = computed(() => {
  const record = pendingRemoveRecord.value;

  if (!record) {
    return '';
  }

  if (record.sourcePath && (record.source === 'installed' || isModuleInstallPath(record.sourcePath))) {
    const related = catalogRecords.value.filter((candidate) => candidate.sourcePath === record.sourcePath);
    const names = related.map((candidate) => `${candidate.manufacturer} ${candidate.name}`).join(', ');

    if (related.length > 1) {
      return `Remove the installed module and delete ${names} from your catalog? This also removes the module files from this computer.`;
    }

    return `Remove ${record.manufacturer} ${record.name} from your catalog? This also deletes the installed module files from this computer.`;
  }

  return `Remove ${record.manufacturer} ${record.name} from your catalog? The original file on disk is not deleted.`;
});

function requestRemoveRadio(record: RadioCatalogRecord): void {
  pendingRemoveRecord.value = record;
  removeConfirmOpen.value = true;
}

function cancelRemoveRadio(): void {
  removeConfirmOpen.value = false;
  pendingRemoveRecord.value = undefined;
}

async function confirmRemoveRadio(): Promise<void> {
  const record = pendingRemoveRecord.value;

  if (!record) {
    return;
  }

  removingModelId.value = record.modelId;
  removeConfirmOpen.value = false;

  try {
    await uninstallRadio(record);
    await refreshInstalledRadios();
  } finally {
    removingModelId.value = undefined;
    pendingRemoveRecord.value = undefined;
  }
}

const currentSection = computed<PreferenceSection>(() => {
  const value = route.query.section;
  const section = Array.isArray(value) ? value[0] : value;

  if (section === 'licenses' || section === 'radios' || section === 'updates' || section === 'sniffer') {
    return section;
  }

  return 'appearance';
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

const versionLabel = computed(() => {
  if (currentVersion.value) {
    return `Ham Radio ${currentVersion.value}`;
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

async function refreshInstalledRadios(): Promise<void> {
  try {
    catalogRecords.value = await listRadioCatalogRecords();
  } catch {
    catalogRecords.value = [];
  }
}

watch(
  currentSection,
  (section) => {
    if (section === 'radios') {
      void refreshInstalledRadios();
    }
  },
  { immediate: true },
);

watch(
  configurations,
  () => {
    if (currentSection.value === 'radios') {
      void refreshInstalledRadios();
    }
  },
  { deep: true },
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
