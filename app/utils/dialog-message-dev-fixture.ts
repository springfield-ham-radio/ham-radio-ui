import type { LoadedRadioConfig } from '~/utils/radio-catalog-db';
import { addToRadioFixtureConfig, addToRadioFixtureMemory } from '~/utils/add-to-radio-dev-radio';

/** Model id for `?fixture=dialog-message` (read/write setup alerts without a Kenwood driver). */
export const DIALOG_MESSAGE_FIXTURE_MODEL = 'dev-dialog-message';

export function dialogMessageFixtureConfig(): LoadedRadioConfig {
  const base = addToRadioFixtureConfig();

  return {
    ...base,
    id: {
      ...base.id,
      model: DIALOG_MESSAGE_FIXTURE_MODEL,
      name: 'Dialog message fixture',
    },
    minApiVersion: '18.0.1',
    readMessage: {
      title: 'Fixture read setup',
      body: 'Read setup line one.\nRead setup line two.',
      severity: 'info',
    },
    writeMessage: {
      title: 'Fixture write setup',
      body: 'Write setup line one.\nWrite setup line two.',
      severity: 'warning',
    },
  };
}

export function dialogMessageFixtureMemory(config: LoadedRadioConfig) {
  return addToRadioFixtureMemory(config);
}
