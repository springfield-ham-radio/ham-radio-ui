# First-run onboarding stepper

**Status:** accepted  
**Date:** 2026-10-25  
**Related:** [#173](https://github.com/springfield-ham-radio/ham-radio-ui/issues/173), [0001](./0001-location-model.md), [0009](./0009-per-radio-modules.md)

## Context

A new HamBench operator has to discover Preferences on their own: licenses, the Home station that centers the map and repeater distance sort, the radios they own, the modules those radios need, a programming cable, a first read that backs up the radio before edits, and any other stations. Nothing in the app walks through that order.

The pieces already exist. Preferences (`/preferences`, opened with Command-comma) is the settings screen. It embeds one component per area, and each area already has a composable and a storage key. There is no Pinia store.

| Step | Existing UI | State |
| --- | --- | --- |
| Licenses | `LicensePeoplePreference` and `LicensePersonCard` | `useOperatorLicense` → localStorage `ham-radio-license-directory` (legacy keys `ham-radio-operator-license`, `ham-radio-gmrs-license`) |
| Home location | `RadioStationEditor` on the station `station-home` | `useStationAntennas` → localStorage `ham-radio-station-antennas`. `hasStationLocation` is the located check. `applyLicenseGridToHomeIfEmpty` copies the sole amateur grid onto Home when Home has no location. Map trip start and the Channels distance sort use that Home point via `defaultDistanceStartId`. |
| Radios | `SavedRadiosPreference` and `SavedRadioEditor` | `useSavedRadios` → localStorage `ham-radio-saved-radios` |
| Drivers | `RadioModulesPreference` and `RadioModulesInstallDialog` | `useRadioModuleCatalog`, `installOfficialModule`, SQLite `radio_models` |
| Cable and port | Port list inside `RadioPortDialog` and `SavedRadioEditor` | `useRadioConnectionForm`, `SerialPort.available_ports()`, `serialPortSelectItems` plus `ham-radio-serial-ports` filters |
| First radio read | `RadioReadDialog` → `useRadio().readFromRadio` → `RadioProgressDialog` | Successful read calls `saveRadioImageBackup(..., 'read')`. Files live under app data `backups/`. Defaults in `ham-radio-image-backups` keep backups on. |
| Stations | `RadioStationPreference` and `AntennaStationPreference` | Same station store. A default Home row is created for every profile. |

`SavedRadioEditor` only lists manufacturers and models from installed `configurations`, and `savedRadioDraftIssues` requires a non-empty serial port. A radio row cannot be saved before its module is installed and a port is chosen. Today, `useRadio().initialize` opens `RadioModulesInstallDialog` ("Install radios") with `required` whenever the catalog is empty, including a brand-new profile and an existing profile whose modules were removed.

That required dialog should not outlive the guide. It blocks the app, and the guide's Radios and Drivers steps plus Preferences → Drivers (the radio-module list) are enough. The shell slice cannot delete it: those steps are still placeholders, and new profiles are not started, so they would have no way to install a module.

Units stay on Preferences → Channels (`DistanceUnitPreference`, `ham-radio-distance-unit`). This stepper does not include them.

Nuxt UI in this repo is `@nuxt/ui` 4.12.0. The stepper component is not used yet.

## Decision

Add a first-run stepper that embeds those screens. Do not build a second license form, station form, module installer, port scanner, or read path.

### Shell

Mount `OnboardingStepper` from `app.vue` beside the radio dialogs so a read still uses `RadioReadDialog` and `RadioProgressDialog`.

Use standard Nuxt UI only:

- `UModal` as the shell. Overlay click and Escape do not discard progress.
- `UStepper` for the seven steps, horizontal, controlled with `v-model`. Items use `StepperItem` fields `title`, `description`, `icon`, `value`, `slot`, and `disabled`. Do not set `linear`: a skipped step must not block the next one. Steps the operator has not reached stay `disabled`.
- `UButton` for Back, Skip this step, and Continue.
- `UAlert` for an empty port list, a missing driver, a desktop-only step in the browser, and a failed read.
- Lucide icons already used on the matching Preferences rows (`i-lucide-id-card`, `i-lucide-house`, `i-lucide-radio`, `i-lucide-cpu`, `i-lucide-usb`, `i-lucide-archive`, `i-lucide-map-pin`).

Footer order is Back, Skip this step, Continue. Continue is enabled only when that step’s done check passes. Skip is always enabled, including on the last step. Finish on the last step writes `completed` / `finished` and closes the modal. Close, and “Finish later”, leave `status: 'active'` and reopen at the first `pending` step on the next launch.

Preferences gains one card in the page header, not a new section: “Set up HamBench” with an Open setup guide button. That sets the shell open again and does not clear step statuses or saved data. Deep links stay `?section=` as they are today.

### First run, and who is not forced through it

Persist one document at localStorage `ham-radio-onboarding` (version 1):

- `status`: `active` or `completed`
- `completedReason`: `finished` or `existing-data` when completed
- `steps`: each id is `pending`, `done`, or `skipped`
- `ownedModuleIds`: catalog entry ids chosen on the Radios step before a `SavedRadio` can exist

Step ids, in order: `licenses`, `home`, `radios`, `drivers`, `cable`, `read`, `stations`.

On launch, after `useRadio().initialize()` and a count of `saved_channels` and `station_log_qsos`:

1. If the onboarding key is `completed`, do not open the shell.
2. If the key is missing and `onboardingHasExistingData` is true, write `completed` / `existing-data` and do not open the shell.
3. If the key is missing and that check is false, write `active` with every step `pending` and open the shell.
4. If the key is `active`, open the shell.

`onboardingHasExistingData` is a pure function so it can be unit tested without Tauri. It is true when any of these hold:

- The license directory has a person or a license, or either legacy license key is present.
- `ham-radio-saved-radios` has at least one radio.
- The station store has a station other than Home, any antenna, or a Home row for which `hasStationLocation` is true.
- SQLite has at least one installed `radio_models` row, one `saved_channels` row, or one `station_log_qsos` row.
- The backup directory lists at least one image.

The default empty Home station is not existing data. Appearance, distance unit, developer mode, and serial-port filter preferences are not existing data either. A profile that already has data is marked completed before the modal can paint, including someone who only has a license, only has channels, or only has a located Home.

### Startup module install

Remove the startup "Install radios" dialog. Do not remove it in the shell slice (#175). That slice keeps `ONBOARDING_LAUNCH_NEW_PROFILES` false, so a new profile is not written `active` and the guide does not open on launch. The required dialog stays the install path until the guide can install modules for real.

The slice that sets `ONBOARDING_LAUNCH_NEW_PROFILES` to true is the last slice (cable, first read, and stations). It may land only after the Radios and Drivers steps are real install paths. That same slice removes the dialog:

- `useRadio().initialize` no longer sets `modulesInstallOpen` or `modulesInstallRequired` because the catalog is empty. Delete that startup branch. Do not keep a second modal behind a flag.
- A new profile starts the guide. Modules are installed from the Radios step (models they own) and the Drivers step (`RadioModulesPreference` / `installOfficialModule`).
- Preferences → Drivers stays the radio-module list (`/preferences?section=drivers`). It is the same installer, not a new one.
- After that slice, those are the only install paths. There is no startup module-install dialog.

An existing profile with an empty catalog does not get the guide and does not get a required dialog. Show a non-blocking banner under the header, in the same stack as the driver-update alert. It says no radio modules are installed. Its action, "Install drivers", routes to `/preferences?section=drivers`. Dismiss hides it until the next launch. It returns on the next launch while the catalog is still empty, and it disappears once any module is installed. Hide it while the setup guide is open. Do not show it to a new profile whose guide is `active`; that profile uses the Drivers step.

Do not open the guide on the Drivers step for that existing profile. The profile is already `completed` / `existing-data`. Opening the stepper would walk them through licenses, home, and radios they already have. The missing piece is the module list under Preferences → Drivers.

Until the flag slice, an empty catalog still opens today's required dialog, including for an existing profile. The shell slice may skip that dialog only while a stored document is already `active`. Reopening the guide from Preferences does not turn the dialog on.

### Steps

Each step renders the existing component inside the stepper slot. Preferences stays the place those components edit the same records later.

**Licenses.** Embed `LicensePeoplePreference`. Done when the directory has at least one amateur or GMRS license (lookup or manual class). A person with no license is not done. Skip leaves the directory as it is.

**Home location.** Embed `RadioStationEditor` for `HOME_STATION_ID` and save through `useStationAntennas().saveStation`. The editor stays the only grid and DMS form (`location-format` and `stationDraftErrors`). Done when `hasStationLocation` is true for Home. A license grid copied by `applyLicenseGridToHomeIfEmpty` counts as done and stays editable, because that grid is a starting point, not the shack. Skip leaves Home unlocated. Map centering and repeater distance then keep their current fallback until a station has a point.

**Radios.** This step cannot mount `SavedRadioEditor` yet: that editor only lists installed drivers and refuses a draft with no port. The step reuses the official catalog already loaded by `useRadioModuleCatalog` (`fetchOfficialModuleCatalog`) and the manufacturer groups from the Drivers screen. The operator checks the models they own. The choice is stored as `ownedModuleIds` plus a display name, not as `SavedRadio` rows. Done when `ownedModuleIds` is non-empty or `useSavedRadios().radios` is already non-empty. Skip clears nothing already saved; it leaves `ownedModuleIds` empty. On a later reopen, if saved radios exist, this step also shows `SavedRadiosPreference`.

**Drivers.** Embed `RadioModulesPreference`. Add an optional `entryIds` prop. When `ownedModuleIds` is non-empty, the list is those entries and the existing Install buttons call `installOfficialModule` for each. When the Radios step was skipped, the prop is omitted and the full Preferences list is shown. Do not copy the install, beta, or local-file flows. Done when every owned id is present in `configurations`. If nothing was owned, done when at least one module is installed. A catalog fetch failure uses the existing `officialCatalogFailureFromCause` alert; Skip stays available. Browser builds keep the current “install from the desktop app” message and cannot reach done.

**Cable and port.** Reuse `useRadioConnectionForm` and `serialPortSelectItems` (the same filter and refresh behavior as `RadioPortDialog`). Do not open a second modal. Done when the operator selects a port that `SerialPort.available_ports()` just returned and that the serial-port filters did not hide. A remembered path or a “saved” fallback row does not count. On done, for each owned id that now has an installed config and does not already have a saved radio, call `useSavedRadios().addRadio` with the model’s display name (disambiguated if the name is taken), `defaultProgrammingBaudRate`, and that port. `savedRadioDraftIssues` is unchanged. If the draft is rejected, the step stays not done and the field error is shown.

**First radio read.** When at least one saved radio has an installed config and a selected port, Continue calls the existing `openReadFromRadio` / `readFromRadio` path for the first such radio. Progress, cancel, and errors stay in `RadioProgressDialog`. Done when that read’s `saveRadioImageBackup(..., 'read')` returns saved, or `listRadioImageBackups` already shows a `read` or `prewrite` file for one of the operator’s models. Backups default on; if the operator has turned them off, the step explains that Preferences → Backups must be on before this step can be done, and Skip remains available. A read that only fills the editor does not count. A failed or canceled read leaves the step `pending`.

**Stations.** Embed `RadioStationPreference`. Done when there is a station other than Home, or any antenna in the store. The default Home row alone is not done (Home was the previous step). Skip is the expected path for an operator with one site and no antennas yet.

### No radio connected

The cable step and the read step stay skippable. They never invent a port and never start a write.

- No listed port (cable unplugged, only filtered system ports, or `available_ports()` failed with no saved fallback): `UAlert` tells the operator to plug in the programming cable and press the same Refresh control the port dialog uses. Continue stays disabled. Skip does not create a saved radio.
- Not the desktop app (`isTauriRuntime()` is false): the cable and read steps show that serial ports and module installs need the HamBench desktop app. Continue stays disabled. Skip works.
- Owned models with no installed module, or no saved radio: the read step shows `UAlert` and does not call `readFromRadio`. The same copy Preferences already uses applies (“Install the … driver under Preferences → Drivers”).
- Read error or empty image: the existing progress dialog and toast stay in front of the stepper. The step remains `pending` so the operator can retry or skip. Later writes keep today’s pre-write backup behavior.

Skipping the cable or read step does not block Stations or normal use of the app. The next launch, or Open setup guide, returns to the first step that is still `pending`.

## Consequences

- New profiles see the stepper instead of the required module dialog, once `ONBOARDING_LAUNCH_NEW_PROFILES` is true. Profiles with any signal in `onboardingHasExistingData` never see the stepper unless they open it from Preferences.
- An existing profile whose module catalog is empty sees a dismissible banner to Preferences → Drivers, not the guide and not a required dialog. That banner ships in the same slice as the dialog removal.
- No SQLite migration and no rewrite of license, radio, station, channel, log, or backup documents. The only new key is `ham-radio-onboarding`. Marking an existing profile `existing-data` does not change those documents.
- `SavedRadio` still requires an installed model and a serial port. Owned models live in the onboarding document until the cable step can call `addRadio`.
- `RadioModulesPreference` gains an optional `entryIds` filter. Callers that omit it keep the full list.
- The shell slice may skip `modulesInstallOpen` while a stored document is `active`. The flag slice deletes the startup open entirely.
- Units, appearance, updates, backups retention, and the sniffer stay out of the stepper.
- Follow-on work is the implementation slices below. The shell slice does not remove the Install radios dialog.

### Breaking changes

None for stored data or for callers of the license, station, saved-radio, or backup helpers.

Breaking, in the slice that sets `ONBOARDING_LAUNCH_NEW_PROFILES` to true: the startup module-install dialog is removed, and the Radios + Drivers steps plus Preferences → Radio modules become the only install paths. Preferences → Radio modules is the Drivers section (`/preferences?section=drivers`, `RadioModulesPreference`). An existing profile with an empty catalog gets the dismissible banner to that section instead of a required dialog. The shell slice does not make this change.

### Suggested pull requests

1. **State and shell.** `onboarding.ts`, `useOnboarding`, the modal plus `UStepper`, the Preferences button, the existing-data write, and the `modulesInstallOpen` guard. Step slots can be short descriptions. `ONBOARDING_LAUNCH_NEW_PROFILES` stays false. Keep the required Install radios dialog. Unit tests for the pure gate and for done/skip transitions.
2. **Licenses and Home.** Embed `LicensePeoplePreference` and `RadioStationEditor`. Tests for the done checks, including a license grid that already filled Home.
3. **Radios and drivers.** Catalog multi-select, `ownedModuleIds`, and the `entryIds` filter on `RadioModulesPreference`. Do not set the launch flag and do not remove the startup dialog. New profiles are not in the guide yet, so the dialog is still their install path.
4. **Cable, first read, and stations.** This slice sets `ONBOARDING_LAUNCH_NEW_PROFILES` to true. It also removes the startup Install radios dialog and adds the dismissible empty-catalog banner for existing profiles. Port selection, `addRadio` when a port exists, the existing read/backup path, and `RadioStationPreference`. Cover the no-port and no-desktop alerts in component tests.

Each slice stays behind the same onboarding key so a half-shipped step can still be skipped. Do not set `ONBOARDING_LAUNCH_NEW_PROFILES` or remove the startup dialog until slice 4. Earlier slices must keep new profiles from becoming `active`, or they would see a guide that cannot install a module or finish setup.
