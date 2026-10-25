## [2.0.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.30.0...v2.0.0) (2026-10-25)

### ⚠ BREAKING CHANGES

* **ui:** The startup Install radios dialog no longer opens when the module catalog is empty. Install modules from Preferences → Drivers, including Install from file…. An empty catalog shows a dismissible Install drivers banner instead. Dismissal is stored per profile.

Co-authored-by: Bryan Hunt <BryanHunt@users.noreply.github.com>

### Features

* **ui:** add license and home onboarding steps for [#173](https://github.com/springfield-ham-radio/ham-radio-ui/issues/173) ([#179](https://github.com/springfield-ham-radio/ham-radio-ui/issues/179)) ([209ce63](https://github.com/springfield-ham-radio/ham-radio-ui/commit/209ce63beae817877abeed1203ced693e46e9072))

## [1.30.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.29.2...v1.30.0) (2026-10-25)

### Features

* **ui:** add onboarding stepper shell for [#173](https://github.com/springfield-ham-radio/ham-radio-ui/issues/173) ([#178](https://github.com/springfield-ham-radio/ham-radio-ui/issues/178)) ([92c5282](https://github.com/springfield-ham-radio/ham-radio-ui/commit/92c52821688734bf43fe1602499f9e19e95bc8dc))

### Bug Fixes

* **deps:** bump fast-uri from 3.1.8 to 3.1.9 ([#176](https://github.com/springfield-ham-radio/ham-radio-ui/issues/176)) ([8d60725](https://github.com/springfield-ham-radio/ham-radio-ui/commit/8d60725c3092345c73b7034bfe86c05269f8e55e))
* **deps:** bump serialize-javascript from 7.1.0 to 7.1.4 ([#177](https://github.com/springfield-ham-radio/ham-radio-ui/issues/177)) ([53fe094](https://github.com/springfield-ham-radio/ham-radio-ui/commit/53fe09479e450ba1d4711b802e796ad372614cc2))

## [1.29.2](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.29.1...v1.29.2) (2026-10-24)

### Bug Fixes

* **deps:** bump ham-radio-utils to 4.16.1 ([#172](https://github.com/springfield-ham-radio/ham-radio-ui/issues/172)) ([da7f0a2](https://github.com/springfield-ham-radio/ham-radio-ui/commit/da7f0a215cf4c518039103c4adbbe1e894a00323))

## [1.29.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.29.0...v1.29.1) (2026-10-23)

### Bug Fixes

* **deps:** bump ham-radio-driver to 3.8.0 ([#171](https://github.com/springfield-ham-radio/ham-radio-ui/issues/171)) ([f162f19](https://github.com/springfield-ham-radio/ham-radio-ui/commit/f162f1951c45f7aa7d4adc01bb73d9b9ceb0c75a))

## [1.29.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.28.0...v1.29.0) (2026-10-23)

### Features

* **radio:** mark channels that differ from the radio ([#169](https://github.com/springfield-ham-radio/ham-radio-ui/issues/169)) ([0fd0d4d](https://github.com/springfield-ham-radio/ham-radio-ui/commit/0fd0d4d7d250349912234077f5e9b7e2e92c0189))

### Bug Fixes

* **settings:** bundle lucide icons named by radio modules ([#170](https://github.com/springfield-ham-radio/ham-radio-ui/issues/170)) ([2246b36](https://github.com/springfield-ham-radio/ham-radio-ui/commit/2246b36f186cc0b5c6e933d84ba1cc230066b59d))

## [1.28.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.27.0...v1.28.0) (2026-10-22)

### Features

* **ui:** dismissible driver update banner ([#168](https://github.com/springfield-ham-radio/ham-radio-ui/issues/168)) ([1a2f3c8](https://github.com/springfield-ham-radio/ham-radio-ui/commit/1a2f3c849a0778e59caa01afd807fa9471b64ca9)), closes [#167](https://github.com/springfield-ham-radio/ham-radio-ui/issues/167)

### Bug Fixes

* **serial:** wait for TH-D74 port after clone read reboot ([#166](https://github.com/springfield-ham-radio/ham-radio-ui/issues/166)) ([41d8101](https://github.com/springfield-ham-radio/ham-radio-ui/commit/41d8101cb0fc1f0034252aef3078fa5d1f3d1150))

## [1.27.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.26.1...v1.27.0) (2026-10-22)

### Features

* **radio:** persist last focused saved radio on the board ([#165](https://github.com/springfield-ham-radio/ham-radio-ui/issues/165)) ([6dbb59c](https://github.com/springfield-ham-radio/ham-radio-ui/commit/6dbb59ca82c3b25df0340dd6703d64babde99be9)), closes [#163](https://github.com/springfield-ham-radio/ham-radio-ui/issues/163)

## [1.26.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.26.0...v1.26.1) (2026-10-22)

### Bug Fixes

* **deps:** clear Dependabot alerts for vite and simple-git ([#164](https://github.com/springfield-ham-radio/ham-radio-ui/issues/164)) ([d54105b](https://github.com/springfield-ham-radio/ham-radio-ui/commit/d54105bd0e4792df0614fe270a55f15ace1fafcd))

## [1.26.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.25.1...v1.26.0) (2026-10-22)

### Features

* **radio:** adopt protocol onError cleanup (API 18.3.0) ([#162](https://github.com/springfield-ham-radio/ham-radio-ui/issues/162)) ([da035f0](https://github.com/springfield-ham-radio/ham-radio-ui/commit/da035f04570a2bf487fcfa89dca42922c4f88287))

### Bug Fixes

* **deps:** bump launch-editor from 2.14.1 to 2.14.2 ([#161](https://github.com/springfield-ham-radio/ham-radio-ui/issues/161)) ([8ce0d20](https://github.com/springfield-ham-radio/ham-radio-ui/commit/8ce0d202e7168ce9a424d09db07510c5aa440b6c))

## [1.25.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.25.0...v1.25.1) (2026-10-21)

### Bug Fixes

* **deps:** bump the production-npm group with 10 updates ([#158](https://github.com/springfield-ham-radio/ham-radio-ui/issues/158)) ([e16d327](https://github.com/springfield-ham-radio/ham-radio-ui/commit/e16d327755bfe453efe662dd1b3846bf88548a6d))
* **deps:** bump the rust-crates group in /src-tauri with 10 updates ([#156](https://github.com/springfield-ham-radio/ham-radio-ui/issues/156)) ([2f9f072](https://github.com/springfield-ham-radio/ham-radio-ui/commit/2f9f0728a0e5a61a3b094ee04c234626d999fb1d))

## [1.25.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.24.3...v1.25.0) (2026-10-19)

### Features

* **channels:** import channel pack from URL ([#154](https://github.com/springfield-ham-radio/ham-radio-ui/issues/154)) ([7130607](https://github.com/springfield-ham-radio/ham-radio-ui/commit/713060732703081806517f82982f66aec682d4f2))

## [1.24.3](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.24.2...v1.24.3) (2026-10-18)

### Bug Fixes

* **radio:** add write-failed dev fixture and serial log tests for [#107](https://github.com/springfield-ham-radio/ham-radio-ui/issues/107) ([#153](https://github.com/springfield-ham-radio/ham-radio-ui/issues/153)) ([eebd275](https://github.com/springfield-ham-radio/ham-radio-ui/commit/eebd275f35cb38b2e52224d5aa4b79fe70cb7333))

## [1.24.2](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.24.1...v1.24.2) (2026-10-18)

### Bug Fixes

* **deps:** patch vulnerable transitive dependencies ([#152](https://github.com/springfield-ham-radio/ham-radio-ui/issues/152)) ([4e8acc2](https://github.com/springfield-ham-radio/ham-radio-ui/commit/4e8acc2ac685b0994704f3905df0fcfdd70f6307))

## [1.24.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.24.0...v1.24.1) (2026-10-17)

### Bug Fixes

* **channels:** format channel pack updated date in the import preview ([#151](https://github.com/springfield-ham-radio/ham-radio-ui/issues/151)) ([386004d](https://github.com/springfield-ham-radio/ham-radio-ui/commit/386004db819e05c98dadf815b037b72dd5467b6e))
* shift-click a range of channels in the library ([#150](https://github.com/springfield-ham-radio/ham-radio-ui/issues/150)) ([e2e9290](https://github.com/springfield-ham-radio/ham-radio-ui/commit/e2e929001623e5aba9282648b76bbea432518cd4)), closes [#149](https://github.com/springfield-ham-radio/ham-radio-ui/issues/149)

## [1.24.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.23.0...v1.24.0) (2026-10-17)

### Features

* **channels:** channel pack import and export UI (closes [#66](https://github.com/springfield-ham-radio/ham-radio-ui/issues/66)) ([#148](https://github.com/springfield-ham-radio/ham-radio-ui/issues/148)) ([799ddcd](https://github.com/springfield-ham-radio/ham-radio-ui/commit/799ddcd5da825175f3d727e6315a617290eaa382))

## [1.23.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.22.0...v1.23.0) (2026-10-17)

### Features

* **print:** channel card print for radio and library ([#145](https://github.com/springfield-ham-radio/ham-radio-ui/issues/145)) ([fb8fe8d](https://github.com/springfield-ham-radio/ham-radio-ui/commit/fb8fe8d51c62d73fda8d38183cfea80de1fc3a9d)), closes [#62](https://github.com/springfield-ham-radio/ham-radio-ui/issues/62)

## [1.22.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.21.0...v1.22.0) (2026-10-17)

### Features

* **channels:** channel pack format and import planner (PR 1 of [#66](https://github.com/springfield-ham-radio/ham-radio-ui/issues/66)) ([#146](https://github.com/springfield-ham-radio/ham-radio-ui/issues/146)) ([226ae57](https://github.com/springfield-ham-radio/ham-radio-ui/commit/226ae57b7324d5882db17d39f3c2e00df770dd39))

## [1.21.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.20.0...v1.21.0) (2026-10-17)

### Features

* **radio:** enrich error reports with context and copy details ([#144](https://github.com/springfield-ham-radio/ham-radio-ui/issues/144)) ([087d638](https://github.com/springfield-ham-radio/ham-radio-ui/commit/087d638fd36e839149cd3c6cde14343694dd9fe2)), closes [#139](https://github.com/springfield-ham-radio/ham-radio-ui/issues/139)

## [1.20.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.19.0...v1.20.0) (2026-10-17)

### Features

* **radio:** show config read/write setup messages in dialogs ([#143](https://github.com/springfield-ham-radio/ham-radio-ui/issues/143)) ([57f36c6](https://github.com/springfield-ham-radio/ham-radio-ui/commit/57f36c62d1d705389828e95dd90ec47a39667c3b)), closes [springfield-ham-radio/ham-radio-api#24](https://github.com/springfield-ham-radio/ham-radio-api/issues/24)

## [1.19.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.18.0...v1.19.0) (2026-10-17)

### Features

* **radio:** show target card on read and write dialogs ([#142](https://github.com/springfield-ham-radio/ham-radio-ui/issues/142)) ([9fbe61e](https://github.com/springfield-ham-radio/ham-radio-ui/commit/9fbe61e38ec8c2cfa7d4e080651be75b3e527814))

## [1.18.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.17.0...v1.18.0) (2026-10-17)

### Features

* **radio:** memory undo shortcuts and Radio menu (closes [#64](https://github.com/springfield-ham-radio/ham-radio-ui/issues/64)) ([#141](https://github.com/springfield-ham-radio/ham-radio-ui/issues/141)) ([20b94a1](https://github.com/springfield-ham-radio/ham-radio-ui/commit/20b94a139a2d93bf6228603c33e3847c1b32dc24))

## [1.17.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.16.0...v1.17.0) (2026-10-17)

### Features

* **radio:** memory undo and redo (PR 1) ([#137](https://github.com/springfield-ham-radio/ham-radio-ui/issues/137)) ([ae916e1](https://github.com/springfield-ham-radio/ham-radio-ui/commit/ae916e109685510bdadfcbebdfc61e257dc8ecb0))

## [1.16.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.15.0...v1.16.0) (2026-10-17)

### Features

* **channels:** unified Import / Export dialog ([#136](https://github.com/springfield-ham-radio/ham-radio-ui/issues/136)) ([4444ccc](https://github.com/springfield-ham-radio/ham-radio-ui/commit/4444cccc68857d6871d14f3e4bb407e94b9d78cb))

## [1.15.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.14.0...v1.15.0) (2026-10-17)

### Features

* **channels:** CHIRP CSV export ([#135](https://github.com/springfield-ham-radio/ham-radio-ui/issues/135)) ([e182603](https://github.com/springfield-ham-radio/ham-radio-ui/commit/e18260322764d398cced4ed1d8231ee502143678))

## [1.14.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.13.0...v1.14.0) (2026-10-17)

### Features

* **log:** plot QSO coordinates on log and Map tab ([#134](https://github.com/springfield-ham-radio/ham-radio-ui/issues/134)) ([3696a3e](https://github.com/springfield-ham-radio/ham-radio-ui/commit/3696a3eedca7cb089969613a30203a06ed40e352))

## [1.13.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.12.0...v1.13.0) (2026-10-17)

### Features

* **log:** store QSO coordinates and ADIF LAT/LON (part 2 of [#81](https://github.com/springfield-ham-radio/ham-radio-ui/issues/81)) ([#132](https://github.com/springfield-ham-radio/ham-radio-ui/issues/132)) ([90186a5](https://github.com/springfield-ham-radio/ham-radio-ui/commit/90186a5992220228e462b3e1a6135e23122fb894))

## [1.12.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.11.0...v1.12.0) (2026-10-17)

### Features

* **log:** ADIF LAT/LON location parse and format (part 1 of [#81](https://github.com/springfield-ham-radio/ham-radio-ui/issues/81)) ([#131](https://github.com/springfield-ham-radio/ham-radio-ui/issues/131)) ([dfadb56](https://github.com/springfield-ham-radio/ham-radio-ui/commit/dfadb5675bfd70e641cb554583420466829e416a))

## [1.11.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.10.0...v1.11.0) (2026-10-16)

### Features

* install beta radio drivers from a local zip (docs[#22](https://github.com/springfield-ham-radio/ham-radio-ui/issues/22)) ([#129](https://github.com/springfield-ham-radio/ham-radio-ui/issues/129)) ([9fd73df](https://github.com/springfield-ham-radio/ham-radio-ui/commit/9fd73df2f862c9544bf2f690e1a8b5471a101c89))

## [1.10.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.9.0...v1.10.0) (2026-10-16)

### Features

* summarize channel checks before Write ([#61](https://github.com/springfield-ham-radio/ham-radio-ui/issues/61)) ([#128](https://github.com/springfield-ham-radio/ham-radio-ui/issues/128)) ([c5f2bb2](https://github.com/springfield-ham-radio/ham-radio-ui/commit/c5f2bb217e536aa4c7c2fbaef26e15e600741d21))

## [1.9.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.8.0...v1.9.0) (2026-10-16)

### Features

* show channel checks in Add to radio ([#61](https://github.com/springfield-ham-radio/ham-radio-ui/issues/61)) ([#127](https://github.com/springfield-ham-radio/ham-radio-ui/issues/127)) ([3e703af](https://github.com/springfield-ham-radio/ham-radio-ui/commit/3e703afc0651026ec1e3de011376a1a5d21298d1))

## [1.8.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.7.0...v1.8.0) (2026-10-15)

### Features

* validate channels against radio capabilities ([#61](https://github.com/springfield-ham-radio/ham-radio-ui/issues/61)) ([#126](https://github.com/springfield-ham-radio/ham-radio-ui/issues/126)) ([3fb66b5](https://github.com/springfield-ham-radio/ham-radio-ui/commit/3fb66b5233529e588336795ead72ff4ea00eda03))

## [1.7.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.6.0...v1.7.0) (2026-10-15)

### Features

* draw trip lines on the Map tab ([#83](https://github.com/springfield-ham-radio/ham-radio-ui/issues/83)) ([#125](https://github.com/springfield-ham-radio/ham-radio-ui/issues/125)) ([2dd19b6](https://github.com/springfield-ham-radio/ham-radio-ui/commit/2dd19b6fb970f70720b115107b0e5d83c958550e))

## [1.6.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.5.0...v1.6.0) (2026-10-15)

### Features

* show stations on the Map tab ([#83](https://github.com/springfield-ham-radio/ham-radio-ui/issues/83)) ([#124](https://github.com/springfield-ham-radio/ham-radio-ui/issues/124)) ([74e2ffc](https://github.com/springfield-ham-radio/ham-radio-ui/commit/74e2ffc071f8fe5f5a2b2f1196ea8042396ba4a8))

## [1.5.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.4.0...v1.5.0) (2026-10-15)

### Features

* plot station-log contacts on the Map tab ([#83](https://github.com/springfield-ham-radio/ham-radio-ui/issues/83)) ([#123](https://github.com/springfield-ham-radio/ham-radio-ui/issues/123)) ([7c35fa6](https://github.com/springfield-ham-radio/ham-radio-ui/commit/7c35fa6ea7c2501167e72003cd7ac30e12953687))

## [1.4.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.3.0...v1.4.0) (2026-10-15)

### Features

* add an ordinary-channel layer to the Map tab ([#83](https://github.com/springfield-ham-radio/ham-radio-ui/issues/83)) ([#122](https://github.com/springfield-ham-radio/ham-radio-ui/issues/122)) ([ac14313](https://github.com/springfield-ham-radio/ham-radio-ui/commit/ac143138f4e05cc8f2dc84516ace2ee4ab1860b9))

## [1.3.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.2.0...v1.3.0) (2026-10-15)

### Features

* add a Map tab that plots repeaters ([#83](https://github.com/springfield-ham-radio/ham-radio-ui/issues/83)) ([#121](https://github.com/springfield-ham-radio/ham-radio-ui/issues/121)) ([0819242](https://github.com/springfield-ham-radio/ham-radio-ui/commit/08192424663735360ee927fe4cf8aa4708e7ca66))

## [1.2.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.1.1...v1.2.0) (2026-10-15)

### Features

* allow a custom MapLibre style URL for the basemap ([#83](https://github.com/springfield-ham-radio/ham-radio-ui/issues/83)) ([#120](https://github.com/springfield-ham-radio/ham-radio-ui/issues/120)) ([cc5ef2c](https://github.com/springfield-ham-radio/ham-radio-ui/commit/cc5ef2c46bed1a846fcce84024515e7992c601fc))

## [1.1.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.1.0...v1.1.1) (2026-10-14)

### Bug Fixes

* **deps:** bump zip from 8.6.0 to 9.0.0 in /src-tauri ([#110](https://github.com/springfield-ham-radio/ham-radio-ui/issues/110)) ([0413c42](https://github.com/springfield-ham-radio/ham-radio-ui/commit/0413c42ca6191059ce3fe300325087ec8383481c))

## [1.1.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v1.0.0...v1.1.0) (2026-10-13)

### Features

* switch unverified drivers to verified catalog versions ([#119](https://github.com/springfield-ham-radio/ham-radio-ui/issues/119)) ([6bfe69e](https://github.com/springfield-ham-radio/ham-radio-ui/commit/6bfe69eb95df4e6f0badd2ec536a920badacc371))

## [1.0.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.61.4...v1.0.0) (2026-10-13)

### ⚠ BREAKING CHANGES

* requires catalog schema v3; legacy bundled kenwood/baofeng modules are removed on first launch and must be reinstalled per radio. Implements ADR 0009. Fixes #116.

### Features

* per-radio radio modules ([#117](https://github.com/springfield-ham-radio/ham-radio-ui/issues/117)) ([c226cd0](https://github.com/springfield-ham-radio/ham-radio-ui/commit/c226cd01117232007f78eca7a68b16e2163a3f95))

## [0.61.4](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.61.3...v0.61.4) (2026-10-12)

### Bug Fixes

* clear removed channel rows and place gap drops in empty slots (Fixes [#113](https://github.com/springfield-ham-radio/ham-radio-ui/issues/113)) ([#114](https://github.com/springfield-ham-radio/ham-radio-ui/issues/114)) ([f2fec03](https://github.com/springfield-ham-radio/ham-radio-ui/commit/f2fec038fecb0de81abc618e46ecfe83b9721fc8)), closes [#103](https://github.com/springfield-ham-radio/ham-radio-ui/issues/103)

## [0.61.3](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.61.2...v0.61.3) (2026-10-12)

### Bug Fixes

* channel add order and per-card drag reorder (Fixes [#103](https://github.com/springfield-ham-radio/ham-radio-ui/issues/103)) ([#104](https://github.com/springfield-ham-radio/ham-radio-ui/issues/104)) ([0b7e1a7](https://github.com/springfield-ham-radio/ham-radio-ui/commit/0b7e1a753707b188944247994c3d975639b2d81a))
* **deps:** bump ham-radio-driver to 3.5.4 for TH-F6 writes ([#112](https://github.com/springfield-ham-radio/ham-radio-ui/issues/112)) ([0ccb49f](https://github.com/springfield-ham-radio/ham-radio-ui/commit/0ccb49fcb37a27f09062fbb8c513fd9146f5d37f))

## [0.61.2](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.61.1...v0.61.2) (2026-10-12)

### Bug Fixes

* TH-F6 write port race and serial log on failure ([#108](https://github.com/springfield-ham-radio/ham-radio-ui/issues/108), [#107](https://github.com/springfield-ham-radio/ham-radio-ui/issues/107)) ([#109](https://github.com/springfield-ham-radio/ham-radio-ui/issues/109)) ([5c0d2bc](https://github.com/springfield-ham-radio/ham-radio-ui/commit/5c0d2bcebe01c2b2a39ae9dca60475e70469fcd0))

## [0.61.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.61.0...v0.61.1) (2026-10-11)

### Bug Fixes

* **serial:** implement TauriNodeSerialPort.update for clone baud switches ([#106](https://github.com/springfield-ham-radio/ham-radio-ui/issues/106)) ([548910f](https://github.com/springfield-ham-radio/ham-radio-ui/commit/548910fcc02bcae6a829fbbb5768c74d9233af69)), closes [#105](https://github.com/springfield-ham-radio/ham-radio-ui/issues/105)

## [0.61.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.60.5...v0.61.0) (2026-10-11)

### Features

* add a collapsible repeater map on Channels ([#101](https://github.com/springfield-ham-radio/ham-radio-ui/issues/101)) ([bf1078b](https://github.com/springfield-ham-radio/ham-radio-ui/commit/bf1078b83a9c7c26e0f5988b5edbb754382f5deb)), closes [#83](https://github.com/springfield-ham-radio/ham-radio-ui/issues/83)

## [0.60.5](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.60.4...v0.60.5) (2026-10-11)

### Bug Fixes

* **release:** restore Windows builds on Tauri 2.12 and fix latest-release step ([#99](https://github.com/springfield-ham-radio/ham-radio-ui/issues/99)) ([78923a6](https://github.com/springfield-ham-radio/ham-radio-ui/commit/78923a68ec3dfd254b61470f14ea5109c23e98e9))

## [0.60.4](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.60.3...v0.60.4) (2026-10-11)

### Bug Fixes

* **deps:** update Tauri to 2.12 (Rust and JS together) ([#97](https://github.com/springfield-ham-radio/ham-radio-ui/issues/97)) ([ba62a38](https://github.com/springfield-ham-radio/ham-radio-ui/commit/ba62a38afb90519694f2e449a2358c66913d70a9))

## [0.60.3](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.60.2...v0.60.3) (2026-10-11)

### Bug Fixes

* **deps:** bump zip from 4.6.1 to 8.6.0 in /src-tauri ([#32](https://github.com/springfield-ham-radio/ham-radio-ui/issues/32)) ([605a25d](https://github.com/springfield-ham-radio/ham-radio-ui/commit/605a25d54e3d9e2772ca9abb7342d2385e524fad))

## [0.60.2](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.60.1...v0.60.2) (2026-10-11)

### Bug Fixes

* **deps:** bump rustls from 0.23.43 to 0.23.45 in /src-tauri ([#89](https://github.com/springfield-ham-radio/ham-radio-ui/issues/89)) ([adf7636](https://github.com/springfield-ham-radio/ham-radio-ui/commit/adf763663840816e57bf975c36e1b1ded3b5dd7f))

## [0.60.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.60.0...v0.60.1) (2026-10-11)

### Bug Fixes

* **deps:** bump postcss-selector-parser from 7.1.5 to 7.1.6 ([#90](https://github.com/springfield-ham-radio/ham-radio-ui/issues/90)) ([b1b35ff](https://github.com/springfield-ham-radio/ham-radio-ui/commit/b1b35ffa71fdc2dc29a34c54edf4daa3d50f7568))
* **release:** pin conventional-changelog-conventionalcommits to 9.3.1 ([#95](https://github.com/springfield-ham-radio/ham-radio-ui/issues/95)) ([78a7aac](https://github.com/springfield-ham-radio/ham-radio-ui/commit/78a7aacd92370b8a2ae16f61179a5e0049f6fef8))

## [0.60.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.59.5...v0.60.0) (2026-10-11)

### Features

* remember window size and position between launches ([#91](https://github.com/springfield-ham-radio/ham-radio-ui/issues/91)) ([15a8f4a](https://github.com/springfield-ham-radio/ham-radio-ui/commit/15a8f4a7e200000f995ed0c7e236f271078fcf86)), closes [#88](https://github.com/springfield-ham-radio/ham-radio-ui/issues/88)

## [0.59.5](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.59.4...v0.59.5) (2026-10-11)

### Bug Fixes

* **deps:** bump shell-quote from 1.10.0 to 1.12.0 ([#76](https://github.com/springfield-ham-radio/ham-radio-ui/issues/76)) ([c895bed](https://github.com/springfield-ham-radio/ham-radio-ui/commit/c895bed9c865517024993eaa523a65e218252e6a))

## [0.59.4](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.59.3...v0.59.4) (2026-10-11)

### Bug Fixes

* **deps:** bump source-map-js from 1.2.1 to 1.2.2 ([#77](https://github.com/springfield-ham-radio/ham-radio-ui/issues/77)) ([e939d6c](https://github.com/springfield-ham-radio/ham-radio-ui/commit/e939d6c91a0cf3bb128ab25e6c51986a4607e4aa))

## [0.59.3](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.59.2...v0.59.3) (2026-10-11)

### Bug Fixes

* **deps:** bump seroval from 1.6.2 to 1.6.9 ([#78](https://github.com/springfield-ham-radio/ham-radio-ui/issues/78)) ([feea791](https://github.com/springfield-ham-radio/ham-radio-ui/commit/feea791f232bf864ccadae91fc09f07277cd7869))

## [0.59.2](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.59.1...v0.59.2) (2026-10-11)

### Bug Fixes

* **deps:** bump handlebars from 4.7.9 to 4.7.10 ([#79](https://github.com/springfield-ham-radio/ham-radio-ui/issues/79)) ([b3af149](https://github.com/springfield-ham-radio/ham-radio-ui/commit/b3af149e08059f5e64414fd7184993268605ad68))

## [0.59.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.59.0...v0.59.1) (2026-10-11)

### Bug Fixes

* derive the ham-radio-api version from the installed package ([#86](https://github.com/springfield-ham-radio/ham-radio-ui/issues/86)) ([b2f67c3](https://github.com/springfield-ham-radio/ham-radio-ui/commit/b2f67c33108d22ed77ff2ac1da657ee5f906820c))

## [0.59.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.58.0...v0.59.0) (2026-10-10)

### Features

* **location:** shared location-format module over GeoPoint ([d339837](https://github.com/springfield-ham-radio/ham-radio-ui/commit/d3398371f02918d44738cb69621b5e66a3f5208e))

## [0.58.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.57.0...v0.58.0) (2026-10-10)

### Features

* **channels:** store repeater records and update them on re-import ([#85](https://github.com/springfield-ham-radio/ham-radio-ui/issues/85)) ([75b1331](https://github.com/springfield-ham-radio/ham-radio-ui/commit/75b13314aa7cfb2825bf1cd17b5186cc7ebdd048))

## [0.57.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.56.0...v0.57.0) (2026-10-10)

### Features

* **channels:** sort the library by distance from a station ([#82](https://github.com/springfield-ham-radio/ham-radio-ui/issues/82)) ([da501a0](https://github.com/springfield-ham-radio/ham-radio-ui/commit/da501a0ebcac738666b3dd9ba6f99eea59d2385b))

## [0.56.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.55.0...v0.56.0) (2026-10-10)

### Features

* **channels:** show linked-system nodes on repeaters ([#71](https://github.com/springfield-ham-radio/ham-radio-ui/issues/71)) ([5e7a0a3](https://github.com/springfield-ham-radio/ham-radio-ui/commit/5e7a0a31d60201ca120899e90d58e4852539375c))

## [0.55.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.54.0...v0.55.0) (2026-10-10)

### Features

* **channels:** trip lists from an imported route export ([#70](https://github.com/springfield-ham-radio/ham-radio-ui/issues/70)) ([79e375a](https://github.com/springfield-ham-radio/ham-radio-ui/commit/79e375a0c54a28ceb0a7ab6ebd3e2729b6ace83f))

## [0.54.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.53.2...v0.54.0) (2026-10-04)

### Features

* **ui:** review channel and setting changes before writing to a radio ([#69](https://github.com/springfield-ham-radio/ham-radio-ui/issues/69)) ([6a72a9a](https://github.com/springfield-ham-radio/ham-radio-ui/commit/6a72a9a4f4e1da660708844ad7fd15a6c8621eac))

## [0.53.2](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.53.1...v0.53.2) (2026-10-04)

### Bug Fixes

* **deps:** upgrade to ham-radio-api 18 and latest in-house packages ([#56](https://github.com/springfield-ham-radio/ham-radio-ui/issues/56)) ([f913ac4](https://github.com/springfield-ham-radio/ham-radio-ui/commit/f913ac48d5a45a6922044d784d1db6006f63ab53))

## [0.53.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.53.0...v0.53.1) (2026-10-04)

### Bug Fixes

* use ARRL band offsets and a RepeaterBook User-Agent ([#55](https://github.com/springfield-ham-radio/ham-radio-ui/issues/55)) ([68da7f7](https://github.com/springfield-ham-radio/ham-radio-ui/commit/68da7f7f2757d69f136592b9dbc16311cadd4329))

## [0.53.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.52.0...v0.53.0) (2026-10-03)

### Features

* **ui:** custom radio read/write icons, warning write confirm, bundled icons ([#51](https://github.com/springfield-ham-radio/ham-radio-ui/issues/51)) ([795d954](https://github.com/springfield-ham-radio/ham-radio-ui/commit/795d95455fe3bba72bc868a0c6c3fdba1d9cafae))

## [0.52.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.51.1...v0.52.0) (2026-10-03)

### Features

* **menu:** add Radio menu and rename Import from Radio to Read from Radio ([#50](https://github.com/springfield-ham-radio/ham-radio-ui/issues/50)) ([5f8b0de](https://github.com/springfield-ham-radio/ham-radio-ui/commit/5f8b0de52a0c873568e2d11a51e31738ca6afe95))

## [0.51.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.51.0...v0.51.1) (2026-10-03)

### Bug Fixes

* **deps:** bump brace-expansion from 2.1.4 to 2.1.7 ([#47](https://github.com/springfield-ham-radio/ham-radio-ui/issues/47)) ([50a8163](https://github.com/springfield-ham-radio/ham-radio-ui/commit/50a81634c682602d0817e7ddd7a13fd4feb10a8c))
* **deps:** bump devalue from 5.9.1 to 5.9.4 ([#45](https://github.com/springfield-ham-radio/ham-radio-ui/issues/45)) ([379642a](https://github.com/springfield-ham-radio/ham-radio-ui/commit/379642afe291ad88e40d7452d434c9e24a785773))
* **deps:** bump fast-uri from 3.1.7 to 3.1.8 ([#46](https://github.com/springfield-ham-radio/ham-radio-ui/issues/46)) ([778fbb0](https://github.com/springfield-ham-radio/ham-radio-ui/commit/778fbb08cf7686a89659cc5094f6e5887b2404d7))
* **deps:** bump ip-address from 10.7.0 to 10.7.3 ([#44](https://github.com/springfield-ham-radio/ham-radio-ui/issues/44)) ([213443e](https://github.com/springfield-ham-radio/ham-radio-ui/commit/213443ec30d68c7025d9cd30c04f54b9164c5134))
* **deps:** bump the production-npm group across 1 directory with 2 updates ([#40](https://github.com/springfield-ham-radio/ham-radio-ui/issues/40)) ([abf84fe](https://github.com/springfield-ham-radio/ham-radio-ui/commit/abf84fea114d16215e5521338ecf4499d880715e))
* **deps:** bump undici from 6.28.0 to 6.29.0 ([#43](https://github.com/springfield-ham-radio/ham-radio-ui/issues/43)) ([1c1e1f2](https://github.com/springfield-ham-radio/ham-radio-ui/commit/1c1e1f2c7a37f23f4e0f28993f20cd1c82b83f2b))

## [0.51.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.50.0...v0.51.0) (2026-10-03)

### Features

* **antennas:** mount whips on a radio and record maker and model ([6c2d873](https://github.com/springfield-ham-radio/ham-radio-ui/commit/6c2d873eef3db675d207ac2ba99a21c8955078db))

## [0.50.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.49.0...v0.50.0) (2026-10-03)

### Features

* **log:** require a frequency and fill power from the selected radio ([6139a20](https://github.com/springfield-ham-radio/ham-radio-ui/commit/6139a2098fd369cea24a09751a395cdda3d6c45a))

## [0.49.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.48.0...v0.49.0) (2026-10-03)

### Features

* **appearance:** let the operator choose the log map style ([86c49ea](https://github.com/springfield-ham-radio/ham-radio-ui/commit/86c49ead5f8c9c459567eadb935fe73c98bb7470))
* **log:** record the radio and antenna and fill the license place ([4dc693c](https://github.com/springfield-ham-radio/ham-radio-ui/commit/4dc693cff9756f11dea0f744f18d2cc623b61bec))

## [0.48.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.47.0...v0.48.0) (2026-10-03)

### Features

* **log:** summarize contacts and show the missing table columns ([76313ec](https://github.com/springfield-ham-radio/ham-radio-ui/commit/76313ec6658564ed19160d3a3fee92241bb0fe75))

## [0.47.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.46.1...v0.47.0) (2026-10-02)

### Features

* **log:** show configured stations on the map ([93a3cfa](https://github.com/springfield-ham-radio/ham-radio-ui/commit/93a3cfac287a200b905cf65e45dbefef25bbbadb))

## [0.46.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.46.0...v0.46.1) (2026-09-27)

### Bug Fixes

* **log:** load the map worker in the desktop build ([d041188](https://github.com/springfield-ham-radio/ham-radio-ui/commit/d04118892caffe3b8a00ab6de9ad213dd6a0d952))

## [0.46.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.45.0...v0.46.0) (2026-09-27)

### Features

* **log:** show contacts on a resizable world map ([07de790](https://github.com/springfield-ham-radio/ham-radio-ui/commit/07de7903392b6b5fcf61cbd5e1cb7db7f79ddd58))

## [0.45.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.44.0...v0.45.0) (2026-09-27)

### Features

* **channels:** show built-in groups with switches on by default ([44de9e6](https://github.com/springfield-ham-radio/ham-radio-ui/commit/44de9e6cfcabc13fac86f6ea20fa35fc783b600c))

## [0.44.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.43.1...v0.44.0) (2026-09-27)

### Features

* **sniffer:** install and run the Rust sniffer binary ([e7c23bf](https://github.com/springfield-ham-radio/ham-radio-ui/commit/e7c23bfdc8ffd9773c8a3edab6cc212188d5cd15))

### Bug Fixes

* **sniffer:** reload frames the live stream missed ([9adcedc](https://github.com/springfield-ham-radio/ham-radio-ui/commit/9adcedc56b9853fe7e8e97fcc053ab7ebca951d2))

## [0.43.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.43.0...v0.43.1) (2026-09-26)

### Bug Fixes

* **release:** install xdg-utils so the ARM AppImage can bundle ([aee046d](https://github.com/springfield-ham-radio/ham-radio-ui/commit/aee046d386e0dac3558726e99c76b8bfe1ec89d1))

## [0.43.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.42.6...v0.43.0) (2026-09-26)

### Features

* **release:** build Linux ARM64 installers for Raspberry Pi ([34261cb](https://github.com/springfield-ham-radio/ham-radio-ui/commit/34261cbaf876849c7ed8e74fdd79c24a650d6d3d))

## [0.42.6](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.42.5...v0.42.6) (2026-09-26)

### Bug Fixes

* **radio:** keep the transfer progress fill inside the track ([f71cf03](https://github.com/springfield-ham-radio/ham-radio-ui/commit/f71cf03e8669a20b4786db2a1ea634b489b69307))

## [0.42.5](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.42.4...v0.42.5) (2026-09-26)

### Bug Fixes

* **deps:** align tauri-plugin-updater with the npm package ([2b4135f](https://github.com/springfield-ham-radio/ham-radio-ui/commit/2b4135f50e2ffaaf7566d7153f56ae3299d0cb6c))

## [0.42.4](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.42.3...v0.42.4) (2026-09-26)

### Bug Fixes

* **serial:** settle the port before the first handshake ([e679ad6](https://github.com/springfield-ham-radio/ham-radio-ui/commit/e679ad63b721192033e121803ec1f4ce6ef96808))

## [0.42.3](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.42.2...v0.42.3) (2026-09-26)

### Bug Fixes

* **radio:** show memory after importing with no saved radio ([30a2068](https://github.com/springfield-ham-radio/ham-radio-ui/commit/30a20682af9c5e024b10244f9c3b5d6fc3da6a2a))

## [0.42.2](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.42.1...v0.42.2) (2026-09-26)

### Bug Fixes

* **deps:** bump the production-npm group across 1 directory with 2 updates ([09cd435](https://github.com/springfield-ham-radio/ham-radio-ui/commit/09cd4359188339e6cf66fbecfc4e3aed619ba573))

## [0.42.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.42.0...v0.42.1) (2026-09-26)

### Bug Fixes

* **driver:** accept channel as a per-channel group ([afbb937](https://github.com/springfield-ham-radio/ham-radio-ui/commit/afbb9379e712da560346b12124c3b36f066740c4))

## [0.42.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.41.1...v0.42.0) (2026-09-26)

### Features

* **view:** add zoom in, out, and 100% ([7fc33cb](https://github.com/springfield-ham-radio/ham-radio-ui/commit/7fc33cb815fb3ed651a831286a83ef1e5bb58e86))

## [0.41.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.41.0...v0.41.1) (2026-09-26)

### Bug Fixes

* **channels:** keep the selected group tab underline visible ([625d646](https://github.com/springfield-ham-radio/ham-radio-ui/commit/625d646807ceddad2df5107f3749aabf560e16a0))

## [0.41.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.40.0...v0.41.0) (2026-09-26)

### Features

* **radio:** show open radios in tabs and clone without saving one ([b7fdc36](https://github.com/springfield-ham-radio/ham-radio-ui/commit/b7fdc36f2582d7912c234f67c070ce252d9f67ce))

## [0.40.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.39.1...v0.40.0) (2026-09-26)

### Features

* **driver:** add a channel schema tab ([4a5de3b](https://github.com/springfield-ham-radio/ham-radio-ui/commit/4a5de3be6edc7b10d4618a39b9b5167e473b9667))
* **driver:** add a debug tab to locate a field in memory ([df4d362](https://github.com/springfield-ham-radio/ham-radio-ui/commit/df4d362b69c7efd0e3ea8fd937002d2451a25ecb))
* **driver:** add a developer-mode protocol editor ([d5c360b](https://github.com/springfield-ham-radio/ham-radio-ui/commit/d5c360b3822e9231c03c969fd4dbf18a14776fec))
* **driver:** add a memory map tab ([951baf5](https://github.com/springfield-ham-radio/ham-radio-ui/commit/951baf5ce267398dc799e6c68b850e99aa695fb8))
* **driver:** add settings groups to the memory map ([681dd86](https://github.com/springfield-ham-radio/ham-radio-ui/commit/681dd860f9d21cf343cdbc063db3274fc0ea7d81))
* **driver:** drop the settings schema path from setup ([ec260c9](https://github.com/springfield-ham-radio/ham-radio-ui/commit/ec260c949c462a5a98ea15ef18a1d88f5e125411))
* **driver:** edit settings by group and load installed maps ([56b71a5](https://github.com/springfield-ham-radio/ham-radio-ui/commit/56b71a58c4f40ef7bcde01db955d7258c545d1fb))
* **driver:** group setup fields and choose baud rates ([3453f0f](https://github.com/springfield-ham-radio/ham-radio-ui/commit/3453f0f707ebf497f8df6590f1e0ed37a8244e20))
* **driver:** lay out the protocol editor in sections ([4ee07e6](https://github.com/springfield-ham-radio/ham-radio-ui/commit/4ee07e62c82a458c78a3c30e19014c500187dc47))
* **driver:** warn that the protocol editor is advanced ([0902edf](https://github.com/springfield-ham-radio/ham-radio-ui/commit/0902edfb5e066744e00299ab81f4046aae7b3856))

### Bug Fixes

* **driver:** show each installed radio once in the load menu ([cd271ac](https://github.com/springfield-ham-radio/ham-radio-ui/commit/cd271ac77b8e413aeaa394d755cb8ffb88e059e7))

## [0.39.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.39.0...v0.39.1) (2026-09-25)

### Bug Fixes

* show each installed radio's driver version ([43b6110](https://github.com/springfield-ham-radio/ham-radio-ui/commit/43b6110dbacd7e7e9a9f87b213b29f8e404654c4))

## [0.39.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.38.0...v0.39.0) (2026-09-25)

### Features

* highlight JSON in the driver view ([8cbc35b](https://github.com/springfield-ham-radio/ham-radio-ui/commit/8cbc35b665a902b37ed798e9f7d231eb07ec98b3))

## [0.38.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.37.0...v0.38.0) (2026-09-25)

### Features

* name serial ports in preferences ([814d584](https://github.com/springfield-ham-radio/ham-radio-ui/commit/814d584a158ffd5ea7d32e2c5723d1b0b3106564))

## [0.37.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.36.0...v0.37.0) (2026-09-25)

### Features

* update the app icon and macOS window details ([49f2fc4](https://github.com/springfield-ham-radio/ham-radio-ui/commit/49f2fc460b118d95bc093bd717e309b053f124b4))

## [0.36.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.35.0...v0.36.0) (2026-09-25)

### Features

* add hideable Weather, FRS, and GMRS channel groups ([1f8a09e](https://github.com/springfield-ham-radio/ham-radio-ui/commit/1f8a09e745afd73d4a3b2baf652459d2f4072378))

## [0.35.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.34.0...v0.35.0) (2026-09-25)

### Features

* choose a radio for library channels and check privileges per person ([cfef0a9](https://github.com/springfield-ham-radio/ham-radio-ui/commit/cfef0a9ec2b999b690a801b93a494d15b5e58e3d))

## [0.34.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.33.4...v0.34.0) (2026-09-25)

### Features

* open several radios and replace a memory from the library ([78ad32f](https://github.com/springfield-ham-radio/ham-radio-ui/commit/78ad32ff1fe9ad27cdfbc01df57ae20009dce534))

## [0.33.4](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.33.3...v0.33.4) (2026-09-25)

### Bug Fixes

* update @springfield/ham-radio-api to 17.12.0, @springfield/ham-radio-utils to 4.15.0, and @springfield/ham-radio-driver to 3.5.0 ([94a42fa](https://github.com/springfield-ham-radio/ham-radio-ui/commit/94a42fa4ff278675b6f54d2d59243d9fc3621fff))

## [0.33.3](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.33.2...v0.33.3) (2026-09-25)

### Bug Fixes

* **macos:** register the Window menu for half-screen tiling ([78233cf](https://github.com/springfield-ham-radio/ham-radio-ui/commit/78233cf0f375423de55f545c42745b02b1338c8d))

## [0.33.2](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.33.1...v0.33.2) (2026-09-24)

### Bug Fixes

* update @springfield/ham-radio-driver to 3.4.2 and @springfield/ham-radio-registry to 1.6.6 ([f21ff86](https://github.com/springfield-ham-radio/ham-radio-ui/commit/f21ff86a3cd0127c94a87b36f522dad65e6797dd))

## [0.33.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.33.0...v0.33.1) (2026-09-24)

### Bug Fixes

* update @springfield/ham-radio-utils to 4.14.0 ([d2c6897](https://github.com/springfield-ham-radio/ham-radio-ui/commit/d2c6897b2e513af7baa527ab493d490880cc38ee))

## [0.33.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.32.0...v0.33.0) (2026-09-24)

### Features

* organize the channel library into groups ([65225e8](https://github.com/springfield-ham-radio/ham-radio-ui/commit/65225e8a410ed25d13987b5ff63f0a0e07eb4bed))

## [0.32.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.31.9...v0.32.0) (2026-09-24)

### Features

* show radio menu number and range in settings tooltips ([a232270](https://github.com/springfield-ham-radio/ham-radio-ui/commit/a23227026ba05d9e9d739330f38add6b9fd3e681))

## [0.31.9](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.31.8...v0.31.9) (2026-09-15)

### Bug Fixes

* bump sha2 from 0.10 to 0.11 ([b3eacd5](https://github.com/springfield-ham-radio/ham-radio-ui/commit/b3eacd5cf9a17c323ac8ce264f97c61e0595e072))

## [0.31.8](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.31.7...v0.31.8) (2026-09-15)

### Bug Fixes

* update [@springfield](https://github.com/springfield) packages to API 17.10.0, utils 4.12.4, driver 3.4.1, and registry 1.6.5 ([7b8cf23](https://github.com/springfield-ham-radio/ham-radio-ui/commit/7b8cf23f82d764b5444bed4947cc4ca66a6661a6))

## [0.31.7](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.31.6...v0.31.7) (2026-09-15)

### Bug Fixes

* bump tauri-plugin-mcp-bridge from 0.8 to 0.13.0 ([7554631](https://github.com/springfield-ham-radio/ham-radio-ui/commit/7554631d269af55df8b26eb56d20c45abef665ea))

## [0.31.6](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.31.5...v0.31.6) (2026-09-15)

### Bug Fixes

* bump zip crate from 2 to 4.6.1 ([1b65279](https://github.com/springfield-ham-radio/ham-radio-ui/commit/1b6527959f6eb9467cf2daab8834b5c16b6a4866))

## [0.31.5](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.31.4...v0.31.5) (2026-09-15)

### Bug Fixes

* migrate tauri-plugin-serialplugin to 3.0.7 ([a12f587](https://github.com/springfield-ham-radio/ham-radio-ui/commit/a12f587103ad2c05fe16995de509391041ac6bc6))

## [0.31.4](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.31.3...v0.31.4) (2026-09-14)

### Bug Fixes

* update [@springfield](https://github.com/springfield) packages to API 17.9.3, utils 4.12.3, driver 3.3.5, and registry 1.6.4 ([c248263](https://github.com/springfield-ham-radio/ham-radio-ui/commit/c248263f9df8ced4d76eda31cb83795deb3d28f8))

## [0.31.3](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.31.2...v0.31.3) (2026-09-14)

### Bug Fixes

* update [@springfield](https://github.com/springfield) packages to API 17.9.2, utils 4.12.2, driver 3.3.4, and registry 1.6.3 ([1050ed8](https://github.com/springfield-ham-radio/ham-radio-ui/commit/1050ed8a31de95462926ad3685e70d5f76ae3739))

## [0.31.2](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.31.1...v0.31.2) (2026-09-14)

### Bug Fixes

* update Springfield packages, Nuxt UI 4, and nested dependency patches ([5b7f1aa](https://github.com/springfield-ham-radio/ham-radio-ui/commit/5b7f1aa9facd5b703efa565b2f39310f9c5e66d1))

## [0.31.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.31.0...v0.31.1) (2026-09-14)

### Bug Fixes

* update [@springfield](https://github.com/springfield) packages to driver 3.3.2 and registry 1.6.1 ([187c0e0](https://github.com/springfield-ham-radio/ham-radio-ui/commit/187c0e035e7a12c55587d8228091e45db944ca12))

## [0.31.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.30.0...v0.31.0) (2026-09-14)

### Features

* add stations and owned antennas for Propagation ([d39dd3f](https://github.com/springfield-ham-radio/ham-radio-ui/commit/d39dd3f0a3c4ec28dd2072765e00728a035c6b46))
* nest antennas under each station in Preferences ([429b7ac](https://github.com/springfield-ham-radio/ham-radio-ui/commit/429b7ac3be8dbcaf923e4fc330a2a89d5ae40ce8))

### Bug Fixes

* update @springfield/ham-radio-api to ^17.9.0 and @springfield/ham-radio-utils to ^4.12.0 ([8ed31d1](https://github.com/springfield-ham-radio/ham-radio-ui/commit/8ed31d191395124dd630c7e5767ff4aa29013e73))

## [0.30.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.29.0...v0.30.0) (2026-09-14)

### Features

* show the app version as a badge next to the brand ([d193209](https://github.com/springfield-ham-radio/ham-radio-ui/commit/d19320996981b28ccac03ceb23172ee5854ff585))

## [0.29.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.28.0...v0.29.0) (2026-09-14)

### Features

* add Propagation dashboard with NOAA solar indices ([ef96969](https://github.com/springfield-ham-radio/ham-radio-ui/commit/ef9696908350594f30854f4b7a7c59c05cb02985))

## [0.28.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.27.0...v0.28.0) (2026-09-13)

### Features

* add WaveBench AM and FM experiments on a reusable CRT ([8dd0e58](https://github.com/springfield-ham-radio/ham-radio-ui/commit/8dd0e584b52be792e7b86b3787d044731e928704))

## [0.27.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.26.2...v0.27.0) (2026-09-13)

### Features

* keep WaveBench plots in a shared on-screen viewport ([fe241a2](https://github.com/springfield-ham-radio/ham-radio-ui/commit/fe241a209fb139908a8c5715cd923a91f3dd7d45))

### Bug Fixes

* connect WaveBench schematics and typeset equations with KaTeX ([ffe9dd5](https://github.com/springfield-ham-radio/ham-radio-ui/commit/ffe9dd5994edf81588f803d02c3cde1e7381c2ae))

## [0.26.2](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.26.1...v0.26.2) (2026-09-13)

### Bug Fixes

* stop Preferences from hanging when ignoring a serial port ([e6e38f9](https://github.com/springfield-ham-radio/ham-radio-ui/commit/e6e38f9b2359747f3b7a000a0ac5456afbbf7a8a))

## [0.26.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.26.0...v0.26.1) (2026-09-13)

### Bug Fixes

* update [@springfield](https://github.com/springfield) packages to API 17.8.0, utils 4.11.0, driver 3.3.1, and registry 1.6.0 ([dbf5b9a](https://github.com/springfield-ham-radio/ham-radio-ui/commit/dbf5b9a60d871da547fccbee896a8ed4045f3bb2))

## [0.26.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.25.0...v0.26.0) (2026-09-13)

### Features

* group official radios by manufacturer in Preferences ([6991d93](https://github.com/springfield-ham-radio/ham-radio-ui/commit/6991d936db3fa9ad2513f0af5e0426f1d6a3325a))

## [0.25.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.24.0...v0.25.0) (2026-09-13)

### Features

* add appearance setting for settings column count ([36aefa2](https://github.com/springfield-ham-radio/ham-radio-ui/commit/36aefa2f9db35156df16a115d72d6da51973f0c5))

## [0.24.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.23.0...v0.24.0) (2026-09-13)

### Features

* tighten Settings field layout with help tooltips and inline switches ([84e2d97](https://github.com/springfield-ham-radio/ham-radio-ui/commit/84e2d9762fb6786a16a994b4724510482e547399))

## [0.23.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.22.0...v0.23.0) (2026-09-13)

### Features

* show driver-defined settings groups in the Settings tab ([8083f77](https://github.com/springfield-ham-radio/ham-radio-ui/commit/8083f770899047ec9dbc3966da9061ebd8430f44))

## [0.22.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.21.0...v0.22.0) (2026-09-12)

### Features

* add a CAT debug capture switch so live sessions do not fill memory ([d43bca0](https://github.com/springfield-ham-radio/ham-radio-ui/commit/d43bca044ed6a3a5cd95626c318cfe2cb42e9ea5))
* allow dismissing the CAT transmit microphone warning ([d507672](https://github.com/springfield-ham-radio/ham-radio-ui/commit/d5076720b7602b6ab6bbcc84ba39f23e6c860772))

## [0.21.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.20.0...v0.21.0) (2026-09-12)

### Features

* allow concurrent CAT sessions on separate serial ports ([0bf9b45](https://github.com/springfield-ham-radio/ham-radio-ui/commit/0bf9b4544d9e5aa2c0a872e32b2197c7e02fc225))

## [0.20.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.19.1...v0.20.0) (2026-09-12)

### Features

* disable import and write while CAT is connected ([0fa41c9](https://github.com/springfield-ham-radio/ham-radio-ui/commit/0fa41c969522865b32644174a847bf74ecb5aa7c))

## [0.19.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.19.0...v0.19.1) (2026-09-12)

### Bug Fixes

* update @springfield/ham-radio-registry to ^1.5.0 ([dcca55d](https://github.com/springfield-ham-radio/ham-radio-ui/commit/dcca55df8e3df33322724d463652ed35ad0e2642))

## [0.19.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.18.0...v0.19.0) (2026-09-12)

### Features

* drive Kenwood CAT from the radio module profile ([b8e9d3d](https://github.com/springfield-ham-radio/ham-radio-ui/commit/b8e9d3dfe46c11a260239e36e5fcfa89914154a1))

## [0.18.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.17.0...v0.18.0) (2026-09-12)

### Features

* add a Kenwood CAT page for live VFO control ([c54cc75](https://github.com/springfield-ham-radio/ham-radio-ui/commit/c54cc752f145508549563e5338d3a3f36ad72270))

## [0.17.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.16.1...v0.17.0) (2026-09-12)

### Features

* move the radio badge next to save and import ([36a0eb2](https://github.com/springfield-ham-radio/ham-radio-ui/commit/36a0eb25a24276d865c1354cc8a62eabba8cc49b))

## [0.16.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.16.0...v0.16.1) (2026-09-12)

### Bug Fixes

* update @springfield/ham-radio-utils to ^4.10.2 ([b1c347b](https://github.com/springfield-ham-radio/ham-radio-ui/commit/b1c347bc60e718fed4713a0a1814c4d5cdf5593b))

## [0.16.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.15.0...v0.16.0) (2026-09-12)

### Features

* move radio memory actions onto the Radio page ([06e49ad](https://github.com/springfield-ham-radio/ham-radio-ui/commit/06e49adac33278c4031f391262b9b0ba2ebfd5a8))
* remember last radio and serial port across restarts ([8bf5046](https://github.com/springfield-ham-radio/ham-radio-ui/commit/8bf50463ee632c152a2502daede76cd42796ff60))

### Bug Fixes

* show Weather Radio for WX8–WX10 channels ([948c078](https://github.com/springfield-ham-radio/ham-radio-ui/commit/948c078f3396fb317557a7c62afba91b85420240))

## [0.15.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.14.0...v0.15.0) (2026-09-12)

### Features

* add WaveBench lumped filter design bench ([8b702b4](https://github.com/springfield-ham-radio/ham-radio-ui/commit/8b702b43277287c802b85ec2e67e26b5d08f4164))
* import RepeaterBook and CHIRP CSV into the channel library ([8503020](https://github.com/springfield-ham-radio/ham-radio-ui/commit/850302009dfb355fe2088518baadd1103f5b910d))

## [0.14.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.13.1...v0.14.0) (2026-09-11)

### Features

* drag radio channels to reorder occupied memory slots ([1b4e79c](https://github.com/springfield-ham-radio/ham-radio-ui/commit/1b4e79c65cba9e6d093bd81cb49a90f2e4e7beae))

## [0.13.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.13.0...v0.13.1) (2026-09-11)

### Bug Fixes

* update [@springfield](https://github.com/springfield) packages to API 17.6.0 and utils 4.10.1 ([e4b1e91](https://github.com/springfield-ham-radio/ham-radio-ui/commit/e4b1e910d9bddbcb5c888ef1d17b2e7414924fca))

## [0.13.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.12.0...v0.13.0) (2026-09-11)

### Features

* add and remove radio memory channels from the editor and library ([54a422d](https://github.com/springfield-ham-radio/ham-radio-ui/commit/54a422d9526f41bd9ebea3565e44cb822bcde250))

## [0.12.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.11.0...v0.12.0) (2026-09-11)

### Features

* let import and write pick a programming baud rate ([ea8822e](https://github.com/springfield-ham-radio/ham-radio-ui/commit/ea8822e4a66ac6efc9c0ca0b5190cb9a09f2d7f3))

### Bug Fixes

* apply settings form edits on Vue reactive state ([d3ab63a](https://github.com/springfield-ham-radio/ham-radio-ui/commit/d3ab63ac359dfb7154feaf10c6e896b62a3916c7))

## [0.11.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.10.1...v0.11.0) (2026-09-11)

### Features

* add a serial port filter preference ([25cdc2c](https://github.com/springfield-ham-radio/ham-radio-ui/commit/25cdc2cc15fcaf42b8e945c29911dcc237ee9014))

## [0.10.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.10.0...v0.10.1) (2026-09-11)

### Bug Fixes

* show amateur band names instead of Kenwood band codes ([786f21e](https://github.com/springfield-ham-radio/ham-radio-ui/commit/786f21e02100687bef267997781790d2138c5f90))

## [0.10.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.9.1...v0.10.0) (2026-09-11)

### Features

* switch radio settings from accordion sections to a left nav ([1295bb7](https://github.com/springfield-ham-radio/ham-radio-ui/commit/1295bb73e4698dda4c381a15068aab7580ec5bf3))

### Bug Fixes

* format integer VFO frequencies and offsets as MHz ([9db3f2b](https://github.com/springfield-ham-radio/ham-radio-ui/commit/9db3f2b19f283bfc4362ca4ade115e418b9b28b3))

## [0.9.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.9.0...v0.9.1) (2026-09-08)

### Bug Fixes

* pass the updater signing key as base64 to tauri build ([018aca1](https://github.com/springfield-ham-radio/ham-radio-ui/commit/018aca1b50e67967ff25cfedf79d4ec049701e8d))
* update [@springfield](https://github.com/springfield) packages to API 17.5.0, utils 4.9.0, and driver 3.3.0 ([6714c2c](https://github.com/springfield-ham-radio/ham-radio-ui/commit/6714c2ce46d70d614968f035c0e47603307d33b1))

## [0.9.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.8.0...v0.9.0) (2026-09-08)

### Features

* add a Radio Driver tab for protocol and memory-map inspection ([9507ff8](https://github.com/springfield-ham-radio/ham-radio-ui/commit/9507ff817154f859c6837c87c65981f4505229eb))
* split Hex Dump with an interactive memory map ([127e103](https://github.com/springfield-ham-radio/ham-radio-ui/commit/127e103a203ae31e52ba66a726ff0d1e58c6509e))

## [0.8.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.7.1...v0.8.0) (2026-09-07)

### Features

* fold sniffer into Radio and simplify host process controls ([23528a1](https://github.com/springfield-ham-radio/ham-radio-ui/commit/23528a18f2020085ead9b93e9185fb126935eef7))

## [0.7.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.7.0...v0.7.1) (2026-08-30)

### Bug Fixes

* publish installers when the updater signing key is missing ([#2](https://github.com/springfield-ham-radio/ham-radio-ui/issues/2)) ([a616590](https://github.com/springfield-ham-radio/ham-radio-ui/commit/a6165903eaa96a55d01aa9151cb5ccce56c4f596))

## [0.7.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.6.0...v0.7.0) (2026-08-29)

### Features

* add a SQLite station log with ADIF import and export ([2581e5b](https://github.com/springfield-ham-radio/ham-radio-ui/commit/2581e5bbefe2e5f60ea4f79c96c6fa17bf10041d))

## [0.6.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.5.0...v0.6.0) (2026-08-29)

### Features

* rename the desktop app to HamBench ([1da76ef](https://github.com/springfield-ham-radio/ham-radio-ui/commit/1da76efc0ed1814a69ca67e4ea3f59131c4ca965))

## [0.5.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.4.0...v0.5.0) (2026-08-29)

### Features

* polish sniffer UX and remote SSH assist ([a2cba7f](https://github.com/springfield-ham-radio/ham-radio-ui/commit/a2cba7f8817d36740c71ec482482e688f5add5b4))

### Bug Fixes

* compact preferences headers and use a remote sniffer switch ([654ae07](https://github.com/springfield-ham-radio/ham-radio-ui/commit/654ae0757a7261ed1975adf5522527dc33bed73d))

## [0.4.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.3.1...v0.4.0) (2026-08-29)

### Features

* add sniffer tab with optional remote SSH assist ([310c80a](https://github.com/springfield-ham-radio/ham-radio-ui/commit/310c80a82357645b1f28a4b58abc7115f5bd4217))

## [0.3.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.3.0...v0.3.1) (2026-08-28)

### Bug Fixes

* update @springfield/ham-radio-utils to ^4.8.0 ([55a9270](https://github.com/springfield-ham-radio/ham-radio-ui/commit/55a9270a6e0e6d1b7451b4c7d1b07d232b5db77a))

## [0.3.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.2.0...v0.3.0) (2026-08-28)

### Features

* add automatic app updates and radio module uninstall ([3936034](https://github.com/springfield-ham-radio/ham-radio-ui/commit/3936034a3dfe473cb11605b84e9d680a3ec07095))

## [0.2.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.1.2...v0.2.0) (2026-08-27)

### Features

* install official radio modules from catalog or local files ([6022436](https://github.com/springfield-ham-radio/ham-radio-ui/commit/6022436f65a3387ecfffe3ac9ece809d9c5c9c81))

## [0.1.2](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.1.1...v0.1.2) (2026-08-23)

### Bug Fixes

* install libudev-dev for Linux Tauri builds ([e1dee1b](https://github.com/springfield-ham-radio/ham-radio-ui/commit/e1dee1b6ba120e8212569aa591a564c5c909adff))

## [0.1.1](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.1.0...v0.1.1) (2026-08-23)

### Bug Fixes

* chain Tauri installer builds from the CI release job ([56d45af](https://github.com/springfield-ham-radio/ham-radio-ui/commit/56d45af4f567b13ed09fd58cda7846548091d396))

## [0.1.0](https://github.com/springfield-ham-radio/ham-radio-ui/compare/v0.0.0...v0.1.0) (2026-08-23)

### Features

* publish Tauri installers from GitHub Actions ([93797e4](https://github.com/springfield-ham-radio/ham-radio-ui/commit/93797e4a4d840d329efc7aeb5c84254f7a40753e))

### Bug Fixes

* add conventional-changelog-conventionalcommits for semantic-release ([bb51c6e](https://github.com/springfield-ham-radio/ham-radio-ui/commit/bb51c6e59ca75df8d1ead008e7a1a7ef8cc90321))
