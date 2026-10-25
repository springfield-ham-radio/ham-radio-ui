# First-run onboarding stepper

**Status:** accepted  
**Date:** 2026-10-25  
**Related:** [#173](https://github.com/springfield-ham-radio/ham-radio-ui/issues/173), [0001](./0001-location-model.md), [0009](./0009-per-radio-modules.md)

## Context

A new HamBench operator has to discover Preferences on their own: licenses, the Home station that centers the map and repeater distance sort, the radios they own, the modules those radios need, a programming cable, and a first read that backs up the radio before edits. Other stations stay in Preferences. Nothing in the app walks through that order.

The pieces already exist. Preferences (`/preferences`, opened with Command-comma) is the settings screen. It embeds one component per area, and each area already has a composable and a storage key. There is no Pinia store.

| Step | Existing UI | State |
| --- | --- | --- |
| Licenses | `LicensePeoplePreference` and `LicensePersonCard` | `useOperatorLicense` → localStorage `ham-radio-license-directory` (legacy keys `ham-radio-operator-license`, `ham-radio-gmrs-license`) |
| Home location | `RadioStationEditor` on the station `station-home` | `useStationAntennas` → localStorage `ham-radio-station-antennas`. `hasStationLocation` is the located check. `applyLicenseGridToHomeIfEmpty` copies the sole amateur grid onto Home when Home has no location. Map trip start and the Channels distance sort use that Home point via `defaultDistanceStartId`. |
| Radios | `SavedRadiosPreference` and `SavedRadioEditor` | `useSavedRadios` → localStorage `ham-radio-saved-radios` |
| Drivers | `RadioModulesPreference` and `RadioModulesInstallDialog` | `useRadioModuleCatalog`, `installOfficialModule`, SQLite `radio_models` |
| Cable and port | Port list inside `RadioPortDialog` and `SavedRadioEditor` | `useRadioConnectionForm`, `SerialPort.available_ports()`, `serialPortSelectItems` plus `ham-radio-serial-ports` filters |
| First radio read | `RadioReadDialog` → `useRadio().readFromRadio` → `RadioProgressDialog` | Successful read calls `saveRadioImageBackup(..., 'read')`. Files live under app data `backups/`. Defaults in `ham-radio-image-backups` keep backups on. |
| Stations | `RadioStationEditor` and `AntennaStationEditor` | Same station store. A default Home row is created for every profile. Home alone finishes the step. |

`SavedRadioEditor` only lists manufacturers and models from installed `configurations`, and `savedRadioDraftIssues` requires a non-empty serial port. A radio row cannot be saved before its module is installed and a port is chosen. Until slice 2, `useRadio().initialize` opened `RadioModulesInstallDialog` ("Install radios") with `required` whenever the catalog is empty, including a brand-new profile and an existing profile whose modules were removed.

That required dialog blocks the app. Preferences → Drivers (`RadioModulesPreference`, including "Install from file…") is enough to install a module before the Radios and Drivers steps exist. Slice 2 removes the startup open and adds the empty-catalog banner. Slice 4 sets `ONBOARDING_LAUNCH_NEW_PROFILES` to true.

Units stay on Preferences → Channels (`DistanceUnitPreference`, `ham-radio-distance-unit`). This stepper does not include them.

Nuxt UI in this repo is `@nuxt/ui` 4.12.0. The stepper component is not used yet.

## Decision

Add a first-run stepper. Home, drivers, cable, and the first read reuse the existing editors and dialogs. The licenses step is one inline form for one person and one license; Preferences keeps the multi-person license editor. Do not build a second station form, module installer, port scanner, or read path.

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

Step ids, in order: `licenses`, `home`, `radios`, `drivers`, `cable`, `read`. A stored document may still contain `steps.stations` from an earlier guide. Reading it drops that step. When the document is `active` and every remaining step is already `done` or `skipped`, the read marks it `completed` / `finished` and writes the document back. Other stations and antennas stay in Preferences → Stations.

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

Remove the startup "Install radios" dialog in slice 2 (Licenses and Home), not when the launch flag turns on. The shell slice (#175, merged as #178) kept the dialog because the guide was still placeholders. Slice 2 removes the startup open. Slice 4 sets `ONBOARDING_LAUNCH_NEW_PROFILES` to true, so a profile with no existing data opens the guide on first launch and persists step progress. Preferences → Drivers remains an install path, and the Drivers step installs the models picked on Radios.

- `useRadio().initialize` no longer sets `modulesInstallOpen` or `modulesInstallRequired` because the catalog is empty. Do not keep a second modal behind a flag.
- `RadioModulesInstallDialog` stays mounted. The radio workspace can still open it, and Preferences → Drivers (`/preferences?section=drivers`, `RadioModulesPreference`) keeps Install and "Install from file…".
- With the launch flag true, a new profile starts the guide. Modules are installed from the Drivers step (`installOfficialModule`) for the models chosen on Radios, and from Preferences → Drivers.

A profile with an empty catalog does not get a required dialog. Show a non-blocking `UAlert` under the header, in the same stack as the driver-update alert. It says no radio modules are installed. Its action, "Install drivers", routes to `/preferences?section=drivers`. Dismiss writes `ham-radio-empty-catalog-banner-dismissed` in this profile's localStorage and stays dismissed across launches while the catalog is empty. Installing any module clears that dismissal, so a later empty catalog shows the banner again. The banner disappears once any module is installed. Hide it while the setup guide is open. Do not show it when the stored onboarding status is `active`; that profile uses the Drivers step.

Do not open the guide on the Drivers step for an existing profile. The profile is already `completed` / `existing-data`. Opening the stepper would walk them through licenses, home, and radios they already have. The missing piece is the module list under Preferences → Drivers.

Reopening the guide from Preferences does not open the Install radios dialog. While the guide is open, the empty-catalog banner stays hidden.

### Steps

Each step edits the same records Preferences uses later. The licenses step is a short form; the other steps render the existing component inside the stepper slot.

**Licenses.** One inline form: name, call sign, and license class, plus Lookup. Lookup uses Callook unless the class is GMRS, and it only fills the form. There is no person list, no Add person or Add license button, and no Save button on this step. Continue validates, then creates or updates the first person and that person's first license, and advances. A looked-up grant keeps its FCC details when the call sign and kind still match. Other people and licenses are left in place. When the directory already has a license, the form is filled from that first grant and says more people and licenses can be managed in Preferences. Continue stays disabled until name, call sign, and class are set; those errors show on the fields. Skip does not write the directory. Edits stay in the guide session when the operator leaves the step and comes back. Done when the directory has at least one amateur or GMRS license (lookup or manual class). A person with no license is not done. Preferences keeps `LicensePeoplePreference`.

**Home location.** Embed `RadioStationEditor` for `HOME_STATION_ID`. Onboarding passes `hideSave`, so the form’s Save button stays on the Preferences slideover only. Continue validates the nickname, grid, and coordinates, calls `saveHomeStation` (update Home, or create it when the row is missing), and then advances. Continue stays disabled while the nickname is empty or a coordinate is invalid; those errors show on the fields. An empty location is allowed. Skip does not write Home. Edits stay in the guide session when the operator leaves the step and comes back. `hasStationLocation` still describes a located Home for map centering. A license grid copied by `applyLicenseGridToHomeIfEmpty` remains a starting point and stays editable.

**Radios.** One list titled “Which radios do you have?”, grouped by manufacturer from the official catalog (`groupCatalogRadiosByManufacturer` / `useRadioModuleCatalog`). Each model is a checkbox. Checking a model stores its catalog id in `ownedModuleIds` so the Drivers step can install it. It does not create a `SavedRadio`. A model that already has a saved radio is shown checked, with that radio’s name, port, and baud inline, plus the existing edit and delete actions. Unchecking removes the id from `ownedModuleIds` and does not delete the saved radio, so the row stays checked while the radio exists. Once that model’s driver is installed and a serial port exists, a model with no saved radio offers “Name it / set port”, which opens `SavedRadioEditor`. Antennas and the Radio-page card copy stay on Preferences → Radios. Done when `ownedModuleIds` is non-empty or `useSavedRadios().radios` is already non-empty. Skip clears nothing already saved; it leaves `ownedModuleIds` empty.

**Drivers.** Embed `RadioModulesPreference`. Add an optional `entryIds` prop. When `ownedModuleIds` is non-empty, the list is those entries and the existing Install buttons call `installOfficialModule` for each. When the Radios step was skipped, the prop is omitted and the full Preferences list is shown. Do not copy the install, beta, or local-file flows. Done when every owned id is present in `configurations`. If nothing was owned, done when at least one module is installed. A catalog fetch failure uses the existing `officialCatalogFailureFromCause` alert; Skip stays available. Browser builds keep the current “install from the desktop app” message and cannot reach done.

**Cable and port.** Reuse `useRadioConnectionForm` and `serialPortSelectItems` (the same filter and refresh behavior as `RadioPortDialog`). Do not open a second modal. Done when the operator selects a port that `SerialPort.available_ports()` just returned and that the serial-port filters did not hide. A remembered path or a “saved” fallback row does not count. On done, for each owned id that now has an installed config and does not already have a saved radio, call `useSavedRadios().addRadio` with the model’s display name (disambiguated if the name is taken), `defaultProgrammingBaudRate`, and that port. `savedRadioDraftIssues` is unchanged. If the draft is rejected, the step stays not done and the field error is shown.

**First radio read.** This is the last step. The footer is Finish later, Back, and Finish. Skip this step is omitted. Finish completes the guide: when a backup is already saved it marks the step `done`, and when it is not, the step stays `pending`. Either way `status` becomes `completed` / `finished` and the guide closes. Finish later closes without completing. Read radio, on the step, calls the existing `openReadFromRadio` / `readFromRadio` path for the first saved radio that has an installed config and a selected port. `RadioReadDialog` and `RadioProgressDialog` are mounted before this guide, so their panels use `z-50` and paint above the guide instead of opening underneath it. If the desktop app, backups, a driver, or a port is missing, the step shows a `UAlert` and a way back to Drivers, Cable, or Preferences → Backups. It does not return without a message. Progress, cancel, and errors stay in `RadioProgressDialog`. The progress dialog closes after `saveRadioImageBackup(..., 'read')` returns, and that return marks this step `done` when the status is `saved`. The backup list is refreshed after that write. A file already on disk also marks the step ready to finish. Names look like `Baofeng_baofeng-uv5r_20261024-215009_read.img`: vendor segment, module id, local timestamp, then `_read` or `_prewrite`. The match is case-insensitive. Backups default on. A read that only fills the editor does not count. A failed or canceled read, or a backup that was not saved, leaves the step `pending`. Finish still closes the guide.

### No radio connected

The cable step stays skippable. The read step is last: Finish closes the guide without requiring a backup, and Finish later leaves it open for next time. Neither step invents a port or starts a write.

- No listed port (cable unplugged, only filtered system ports, or `available_ports()` failed with no saved fallback): `UAlert` tells the operator to plug in the programming cable and press the same Refresh control the port dialog uses. Continue stays disabled. Skip does not create a saved radio.
- Not the desktop app (`isTauriRuntime()` is false): the cable and read steps show that serial ports and module installs need the HamBench desktop app. Cable Continue stays disabled. Read radio repeats that alert. Finish still closes the guide.
- Owned models with no installed module, or no saved radio: the read step shows `UAlert` and does not call `readFromRadio`. The same copy Preferences already uses applies (“Install the … driver under Preferences → Drivers”).
- Read error or empty image: the existing progress dialog and toast stay in front of the stepper. The step remains `pending` so the operator can retry. Finish still closes the guide. Later writes keep today’s pre-write backup behavior.

Skipping the cable step, or finishing the read step without a backup, does not block normal use of the app. Other stations stay in Preferences. The next launch, or Open setup guide, returns to the first step that is still `pending` while the document is `active`. A finished guide stays closed until it is opened from Preferences.

## Consequences

- New profiles see the stepper on first launch, because `ONBOARDING_LAUNCH_NEW_PROFILES` is true. That launch writes `ham-radio-onboarding` as `active`, and later Skip / Continue edits persist. Profiles with any signal in `onboardingHasExistingData` are marked `completed` / `existing-data` and never see the stepper unless they open it from Preferences.
- Slice 2 removes the startup Install radios dialog. A profile whose module catalog is empty sees a dismissible banner to Preferences → Drivers, not a required dialog. Dismissal is stored per profile in `ham-radio-empty-catalog-banner-dismissed`.
- No SQLite migration and no rewrite of license, radio, station, channel, log, or backup documents. New localStorage keys are `ham-radio-onboarding` and `ham-radio-empty-catalog-banner-dismissed`. Marking an existing profile `existing-data` does not change those documents.
- `SavedRadio` still requires an installed model and a serial port. Owned models live in the onboarding document until the cable step can call `addRadio`.
- `RadioModulesPreference` gains an optional `entryIds` filter. Callers that omit it keep the full list.
- Slice 2 deletes the startup open. The guide can still hide a manually opened installer while it is open.
- Units, appearance, updates, backups retention, and the sniffer stay out of the stepper.
- Slice 4 sets the launch flag and replaces the cable and first-read placeholders. The Stations step is not part of the guide. A stored `steps.stations` value is dropped on read.

### Breaking changes

None for stored data or for callers of the license, station, saved-radio, or backup helpers.

Breaking, in slice 2: the startup module-install dialog is removed. An empty catalog no longer opens "Install radios" on launch. Preferences → Drivers (`/preferences?section=drivers`, `RadioModulesPreference`), including "Install from file…", stays an install path, and the radio workspace can still open `RadioModulesInstallDialog`. An empty catalog gets the dismissible Install drivers banner instead of a required dialog. Dismissal persists per profile.

Breaking, in slice 4: a profile with no existing station data opens the setup guide on first launch and stores `ham-radio-onboarding` as `active`. Step progress persists. A profile that already has a license, a saved radio, a located Home, another station, an antenna, an installed module, a channel, a log row, or a backup is marked `completed` / `existing-data` and the guide stays closed.

### Suggested pull requests

1. **State and shell.** `onboarding.ts`, `useOnboarding`, the modal plus `UStepper`, the Preferences button, the existing-data write, and the `modulesInstallOpen` guard. Step slots can be short descriptions. `ONBOARDING_LAUNCH_NEW_PROFILES` stays false. Keep the required Install radios dialog. Unit tests for the pure gate and for done/skip transitions.
2. **Licenses and Home.** Embed `LicensePeoplePreference` and `RadioStationEditor`. Tests for the done checks, including a license grid that already filled Home. This slice also removes the startup Install radios dialog and adds the dismissible empty-catalog banner. `ONBOARDING_LAUNCH_NEW_PROFILES` stays false.
3. **Radios and drivers.** Catalog multi-select, `ownedModuleIds`, and the `entryIds` filter on `RadioModulesPreference`. The startup dialog is already gone; Preferences → Drivers remains the install path.
4. **Cable and first read.** This slice sets `ONBOARDING_LAUNCH_NEW_PROFILES` to true. Port selection, `addRadio` when a port exists, and the existing read/backup path. First read is the last step: Finish later, Back, and Finish. It lands on the same pull request as slice 3 once the Radios and Drivers steps are in place. Cover the no-port and no-desktop alerts. The Stations step was removed after review; other stations stay in Preferences.

Each slice stays behind the same onboarding key so a half-shipped step can still be skipped. Slice 4 is the first slice that writes `active` for a new profile.
