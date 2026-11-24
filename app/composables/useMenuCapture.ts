import { APP_VERSION } from '~/utils/app-version';
import {
  analyzeMenuCaptureStep,
  buildMenuCaptureZip,
  comparedToForStepIndex,
  imagesMatchExceptMenuCaptureIgnore,
  lookupMenuCaptureByNumber,
  menuCaptureStepImageFileName,
  removeLastMenuCaptureSessionStep,
  removeMenuCaptureSessionStepFrom,
  resolvedIgnoreForExport,
  resolveMenuCaptureIgnore,
  sha256Hex,
  type MenuCaptureDocument,
  type MenuCaptureSessionState,
  MENU_CAPTURE_FILE_EXTENSION,
} from '~/utils/menu-capture';
import {
  deleteMenuCaptureImages,
  discardMenuCaptureSession,
  loadMenuCaptureBaseline,
  loadMenuCaptureSession,
  loadMenuCaptureStepImage,
  saveBinaryFileWithPicker,
  saveMenuCaptureBaseline,
  saveMenuCaptureSession,
  saveMenuCaptureStepImage,
} from '~/utils/menu-capture-io';
import {
  canStartMenuCaptureSession,
  loadedRadioConfigForCardModel,
  menuCaptureMemoryMap,
  menuCaptureWizardGate,
} from '~/utils/menu-capture-catalog';
import { resolveMenuCaptureIgnoreForConfig } from '~/utils/menu-capture-module-config';
import type { LoadedRadioConfig } from '~/utils/radio-catalog-db';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import { backupFileSegment } from '~/utils/radio-image-backup';
import { radioCardIdKey } from '~/composables/radio-card-context';
import { soleAmateurIdentity, readLicenseDirectory } from '~/utils/license-people';

export function useMenuCapture() {
  const toast = useToast();
  const injectedCardId = inject(radioCardIdKey);
  const {
    savedRadio,
    cardRadio,
    settingsMemoryMap,
    configurations,
    transferInFlight,
    readRadioImageForMenuCapture,
    writeRadioImageForMenuCapture,
    refreshCardMemoryFromVerifiedCapture,
    setMenuCapturePortHold,
    menuCaptureActive,
  } = useRadio();

  const cardId = computed(() => injectedCardId?.value);
  const session = ref<MenuCaptureSessionState | undefined>();
  const loadingSession = ref(false);
  const working = ref(false);
  const ignoreEntries = ref<Awaited<ReturnType<typeof resolveMenuCaptureIgnoreForConfig>>>([]);

  const activeConfig = computed(() =>
    loadedRadioConfigForCardModel(cardRadio.value?.model, configurations.value),
  );

  const catalogRadioId = computed(() => activeConfig.value?.id);
  const wizardGate = computed(() =>
    menuCaptureWizardGate({
      canPersist: canPersist.value,
      model: cardRadio.value?.model,
      serialPort: savedRadio.value?.serialPort,
      configurations: configurations.value,
    }),
  );

  const memoryConfig = computed(() => activeConfig.value?.memoryConfig);
  const memoryMap = computed(() => menuCaptureMemoryMap(settingsMemoryMap.value, activeConfig.value));
  const canPersist = computed(() => Boolean(savedRadio.value?.id && isTauriRuntime()));
  const captureBusy = computed(() => Boolean(cardId.value && (transferInFlight.value || working.value)));
  const hasBaseline = computed(() => Boolean(session.value?.baselineByteLength));

  async function refreshIgnoreList(): Promise<void> {
    ignoreEntries.value = await resolveMenuCaptureIgnoreForConfig(activeConfig.value);
  }

  async function loadPersistedSession(): Promise<void> {
    const savedRadioId = savedRadio.value?.id;

    if (!savedRadioId || !isTauriRuntime()) {
      session.value = undefined;
      return;
    }

    loadingSession.value = true;

    try {
      await refreshIgnoreList();
      const stored = await loadMenuCaptureSession(savedRadioId);

      if (!stored) {
        session.value = undefined;
        setMenuCapturePortHold(savedRadioId, undefined);
        return;
      }

      session.value = stored;

      if (stored.serialPort) {
        setMenuCapturePortHold(savedRadioId, stored.serialPort);
      }
    } catch (cause) {
      session.value = undefined;
      setMenuCapturePortHold(savedRadioId, undefined);
      toast.add({
        title: 'Could not load menu capture',
        description: cause instanceof Error ? cause.message : 'The saved session is unavailable.',
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
    } finally {
      loadingSession.value = false;
    }
  }

  async function persistSession(next: MenuCaptureSessionState): Promise<void> {
    const savedRadioId = savedRadio.value?.id;

    if (!savedRadioId) {
      session.value = next;
      return;
    }

    session.value = next;
    await saveMenuCaptureSession(savedRadioId, next);
  }

  async function startSession(): Promise<void> {
    const savedRadioId = savedRadio.value?.id;
    const port = savedRadio.value?.serialPort;

    if (!canStartMenuCaptureSession({ savedRadioId, serialPort: port, config: activeConfig.value })) {
      toast.add({
        title: 'Radio not ready',
        description: !port
          ? 'Save this radio with a programming port before starting menu capture.'
          : !activeConfig.value
            ? 'Install the driver for this radio under Preferences → Drivers.'
            : 'This radio cannot be restored from HamBench because its driver has no memory write.',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      });
      return;
    }

    await refreshIgnoreList();
    const now = new Date().toISOString();
    const next: MenuCaptureSessionState = {
      sessionId: crypto.randomUUID(),
      savedRadioId,
      createdAt: now,
      updatedAt: now,
      baselineReadAt: '',
      baselineSha256: '',
      baselineByteLength: 0,
      serialPort: port,
      baudRate: savedRadio.value.baudRate,
      steps: [],
    };

    await persistSession(next);
    setMenuCapturePortHold(savedRadioId, port);
  }

  async function readBaseline(): Promise<boolean> {
    const id = cardId.value;
    const savedRadioId = savedRadio.value?.id;
    const port = session.value?.serialPort ?? savedRadio.value?.serialPort;

    if (!id || !savedRadioId || !port || !session.value) {
      return false;
    }

    working.value = true;

    try {
      const image = await readRadioImageForMenuCapture(id, port, session.value.baudRate);

      if (!image) {
        return false;
      }

      let stored = image;

      try {
        await saveMenuCaptureBaseline(savedRadioId, image);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);

        if (!message.includes('already has a baseline')) {
          throw cause;
        }

        stored = await loadMenuCaptureBaseline(savedRadioId);
        toast.add({
          title: 'Baseline already saved',
          description: 'HamBench kept the original baseline image for this session.',
          color: 'neutral',
          icon: 'i-lucide-info',
        });
      }

      const hash = await sha256Hex(stored);
      await persistSession({
        ...session.value,
        updatedAt: new Date().toISOString(),
        baselineReadAt: session.value.baselineReadAt || new Date().toISOString(),
        baselineSha256: hash,
        baselineByteLength: stored.length,
      });
      setMenuCapturePortHold(savedRadioId, port);
      return true;
    } finally {
      working.value = false;
    }
  }

  async function readStepImage(): Promise<Uint8Array | undefined> {
    const id = cardId.value;
    const port = session.value?.serialPort;

    if (!id || !port) {
      return undefined;
    }

    working.value = true;

    try {
      return await readRadioImageForMenuCapture(id, port, session.value?.baudRate);
    } finally {
      working.value = false;
    }
  }

  async function recordCapturedStep(input: {
    menuNumber: number;
    menuName: string;
    nameSource: 'map' | 'operator';
    menuCode?: string;
    from: string;
    to: string;
    note?: string;
    afterImage: Uint8Array;
    analyzed: ReturnType<typeof analyzeMenuCaptureStep>;
  }): Promise<void> {
    const savedRadioId = savedRadio.value?.id;
    const current = session.value;

    if (!savedRadioId || !current) {
      return;
    }

    const stepIndex = current.steps.length + 1;
    const fileName = menuCaptureStepImageFileName(stepIndex);
    const comparedTo = comparedToForStepIndex(stepIndex);

    await saveMenuCaptureStepImage(savedRadioId, fileName, input.afterImage);
    const sha = await sha256Hex(input.afterImage);
    const nextStep: MenuCaptureSessionState['steps'][number] = {
      index: stepIndex,
      readAt: new Date().toISOString(),
      comparedTo,
      menu: {
        number: input.menuNumber,
        name: input.menuName,
        ...(input.menuCode ? { code: input.menuCode } : {}),
        nameSource: input.nameSource,
      },
      change: {
        from: input.from,
        to: input.to,
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      },
      flags: input.analyzed.flags,
      diff: input.analyzed.diff,
      imageFileName: fileName,
      imageSha256: sha,
      imageByteLength: input.afterImage.length,
    };

    await persistSession({
      ...current,
      updatedAt: new Date().toISOString(),
      steps: [...current.steps, nextStep],
    });
  }

  async function patchLastCapturedStep(input: {
    menuNumber: number;
    menuName: string;
    nameSource: 'map' | 'operator';
    menuCode?: string;
    from: string;
    to: string;
    note?: string;
  }): Promise<void> {
    const current = session.value;
    const last = current?.steps.at(-1);

    if (!current || !last) {
      return;
    }

    const updated: MenuCaptureSessionState['steps'][number] = {
      ...last,
      menu: {
        number: input.menuNumber,
        name: input.menuName,
        ...(input.menuCode ? { code: input.menuCode } : {}),
        nameSource: input.nameSource,
      },
      change: {
        from: input.from,
        to: input.to,
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      },
    };

    await persistSession({
      ...current,
      updatedAt: new Date().toISOString(),
      steps: [...current.steps.slice(0, -1), updated],
    });
  }

  async function redoLastStep(): Promise<void> {
    const savedRadioId = savedRadio.value?.id;
    const current = session.value;

    if (!savedRadioId || !current || current.steps.length === 0) {
      return;
    }

    const removed = current.steps.at(-1)!;
    await deleteMenuCaptureImages(savedRadioId, [removed.imageFileName]);
    await persistSession(removeLastMenuCaptureSessionStep(current));
  }

  async function redoFromStep(stepIndex: number): Promise<void> {
    const savedRadioId = savedRadio.value?.id;
    const current = session.value;

    if (!savedRadioId || !current) {
      return;
    }

    const removed = current.steps.filter((step) => step.index >= stepIndex).map((step) => step.imageFileName);
    await deleteMenuCaptureImages(savedRadioId, removed);
    await persistSession(removeMenuCaptureSessionStepFrom(current, stepIndex));
  }

  async function restoreBaseline(): Promise<{ verified: boolean }> {
    const id = cardId.value;
    const savedRadioId = savedRadio.value?.id;
    const current = session.value;
    const port = current?.serialPort;

    if (!id || !savedRadioId || !current || !port) {
      return { verified: false };
    }

    working.value = true;
    const writtenAt = new Date().toISOString();

    try {
      const baseline = await loadMenuCaptureBaseline(savedRadioId);
      const wrote = await writeRadioImageForMenuCapture(id, port, baseline, current.baudRate);

      if (!wrote) {
        return { verified: false };
      }

      const verifyImage = await readRadioImageForMenuCapture(id, port, current.baudRate);

      if (!verifyImage) {
        await persistSession({
          ...current,
          updatedAt: new Date().toISOString(),
          restore: { writtenAt, matchesBaseline: false },
        });
        return { verified: false };
      }

      const verifiedAt = new Date().toISOString();
      const { matches } = imagesMatchExceptMenuCaptureIgnore(
        baseline,
        verifyImage,
        ignoreEntries.value,
        memoryConfig.value,
      );

      await persistSession({
        ...current,
        updatedAt: new Date().toISOString(),
        restore: { writtenAt, verifiedAt, matchesBaseline: matches },
      });

      if (matches) {
        await refreshCardMemoryFromVerifiedCapture(id, verifyImage, port);
      }

      return { verified: matches };
    } finally {
      working.value = false;
    }
  }

  async function exportCapture(input: { callsign?: string; notes?: string; firmware?: string | null }): Promise<string | undefined> {
    const savedRadioId = savedRadio.value?.id;
    const current = session.value;
    const radioId = catalogRadioId.value;
    const config = activeConfig.value;

    if (!savedRadioId || !current || !radioId || !config || current.baselineByteLength === 0) {
      return undefined;
    }

    const baseline = await loadMenuCaptureBaseline(savedRadioId);
    const images: Record<string, Uint8Array> = { 'baseline.img': baseline };
    const resolved = resolveMenuCaptureIgnore(ignoreEntries.value, memoryConfig.value, baseline.length);
    const document: MenuCaptureDocument = {
      schemaVersion: 1,
      kind: 'ham-radio-menu-capture',
      exportedAt: new Date().toISOString(),
      app: { name: 'HamBench', version: APP_VERSION },
      operator: {
        ...(input.callsign?.trim() ? { callsign: input.callsign.trim().toUpperCase() } : {}),
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      },
      radio: {
        manufacturer: radioId.manufacturer,
        model: String(radioId.model),
        name: savedRadio.value?.name,
        moduleId: config.metadata?.moduleId,
        moduleVersion: config.metadata?.moduleVersion,
        memoryMapVersion: memoryMap.value?.version,
        firmware: input.firmware ?? current.firmware ?? null,
      },
      ignore: resolvedIgnoreForExport(resolved),
      baseline: {
        file: 'images/baseline.img',
        byteLength: baseline.length,
        sha256: current.baselineSha256,
        readAt: current.baselineReadAt,
      },
      steps: current.steps.map((step) => ({
        index: step.index,
        readAt: step.readAt,
        comparedTo: step.comparedTo,
        menu: step.menu,
        change: step.change,
        image: {
          file: `images/${step.imageFileName}`,
          byteLength: step.imageByteLength,
          sha256: step.imageSha256,
        },
        flags: step.flags,
        diff: step.diff,
      })),
      ...(current.restore ? { restore: current.restore } : {}),
    };

    for (const step of current.steps) {
      images[step.imageFileName] = await loadMenuCaptureStepImage(savedRadioId, step.imageFileName);
    }

    const zip = buildMenuCaptureZip(document, images);
    const vendor = backupFileSegment(radioId.manufacturer);
    const model = backupFileSegment(String(radioId.model));
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    const defaultPath = `${vendor}_${model}_${stamp}.${MENU_CAPTURE_FILE_EXTENSION}`;

    const savedPath = await saveBinaryFileWithPicker(zip, defaultPath, 'Save menu capture');

    if (savedPath) {
      setMenuCapturePortHold(savedRadioId, undefined);
    }

    return savedPath;
  }

  async function discardSession(): Promise<void> {
    const savedRadioId = savedRadio.value?.id;

    if (!savedRadioId) {
      session.value = undefined;
      return;
    }

    await discardMenuCaptureSession(savedRadioId);
    session.value = undefined;
    setMenuCapturePortHold(savedRadioId, undefined);
  }

  function defaultCallsign(): string | undefined {
    return soleAmateurIdentity(readLicenseDirectory()).callSign;
  }

  function menuLookup(menuNumber: number) {
    if (!memoryMap.value) {
      return lookupMenuCaptureByNumber({ version: '0', structs: [] }, menuNumber);
    }

    return lookupMenuCaptureByNumber(memoryMap.value, menuNumber);
  }

  watch(
    () => savedRadio.value?.id,
    () => {
      void loadPersistedSession();
    },
    { immediate: true },
  );

  watch(
    () => [cardRadio.value?.model, configurations.value.length] as const,
    () => {
      void refreshIgnoreList();
    },
  );

  return {
    session,
    loadingSession,
    captureBusy,
    canPersist,
    hasBaseline,
    isCaptureActive: computed(() => menuCaptureActive(cardId.value)),
    cardId,
    savedRadio,
    cardRadio,
    catalogRadioId,
    wizardGate,
    configurations,
    activeConfig: activeConfig as ComputedRef<LoadedRadioConfig | undefined>,
    ignoreEntries,
    startSession,
    readBaseline,
    readStepImage,
    recordCapturedStep,
    patchLastCapturedStep,
    redoLastStep,
    redoFromStep,
    restoreBaseline,
    exportCapture,
    discardSession,
    defaultCallsign,
    menuLookup,
    analyzeMenuCaptureStep,
    memoryMap,
    memoryConfig,
  };
}