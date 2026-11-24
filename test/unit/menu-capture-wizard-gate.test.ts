import { describe, expect, it } from 'vitest';
import type { LoadedRadioConfig } from '../../app/utils/radio-catalog-db.ts';
import {
  canStartMenuCaptureSession,
  loadedRadioConfigForCardModel,
  menuCaptureWizardGate,
  radioIdForMenuCaptureSession,
} from '../../app/utils/menu-capture-catalog.ts';
import { menuCaptureIgnoreFromConfig } from '../../app/utils/menu-capture-module-config.ts';

function thD74Config(): LoadedRadioConfig {
  return {
    id: { manufacturer: 'Kenwood', model: 'TH-D74', name: 'TH-D74' },
    version: '1.0.0',
    description: 'Test',
    settingsSchema: {},
    memoryConfig: { chunkSize: 256, addressSize: 2, addressEndianness: 'big', segments: {} },
    serialConfig: { baudRate: 57600 },
    readMemory: [{}],
    writeMemory: [{}],
    capture: { ignore: [{ address: '0x038C', length: 1 }] },
  } as LoadedRadioConfig;
}

describe('menu capture wizard without editor memory', () => {
  const configurations = [thD74Config()];

  it('resolves the catalog row from the saved card model like RadioReadDialog', () => {
    expect(loadedRadioConfigForCardModel('TH-D74', configurations)?.id.model).toBe('TH-D74');
    expect(loadedRadioConfigForCardModel('missing', configurations)).toBeUndefined();
  });

  it('shows the stepper for a fresh saved card with port and installed driver', () => {
    expect(
      menuCaptureWizardGate({
        canPersist: true,
        model: 'TH-D74',
        serialPort: '/dev/ttyUSB0',
        configurations,
      }),
    ).toBe('ready');
  });

  it('loads capture.ignore from the hydrated catalog config', () => {
    const config = loadedRadioConfigForCardModel('TH-D74', configurations);

    expect(menuCaptureIgnoreFromConfig(config)).toEqual([{ address: '0x038C', length: 1 }]);
  });

  it('allows starting a session without session.activeRadioId', () => {
    expect(
      canStartMenuCaptureSession({
        savedRadioId: 'radio-1',
        serialPort: '/dev/ttyUSB0',
        config: loadedRadioConfigForCardModel('TH-D74', configurations),
      }),
    ).toBe(true);
  });

  it('uses the catalog RadioId for capture reads when the editor has no memory loaded', () => {
    expect(
      radioIdForMenuCaptureSession(undefined, 'TH-D74', configurations)?.model,
    ).toBe('TH-D74');
  });

  it('shows driver not installed when the model is unknown to the catalog', () => {
    expect(
      menuCaptureWizardGate({
        canPersist: true,
        model: 'unknown-radio',
        serialPort: '/dev/ttyUSB0',
        configurations,
      }),
    ).toBe('driver-missing');
  });

  it('does not allow start when the driver is missing', () => {
    expect(
      canStartMenuCaptureSession({
        savedRadioId: 'radio-1',
        serialPort: '/dev/ttyUSB0',
        config: loadedRadioConfigForCardModel('unknown-radio', configurations),
      }),
    ).toBe(false);
  });
});