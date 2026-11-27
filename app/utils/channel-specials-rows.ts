import type { RadioProgrammedChannel } from '@springfield/ham-radio-api';
import { RadioToneType } from '@springfield/ham-radio-api';
import type { ChannelRow } from '~/composables/useRadio';

function formatFrequency(frequency: number | undefined): string {
  if (frequency === undefined) {
    return '';
  }

  return (frequency / 1_000_000).toFixed(4);
}

function formatToneValue(tone: number | undefined, type: RadioToneType | undefined): string {
  if (!tone) {
    return '';
  }

  return type === RadioToneType.CTCSS ? (tone / 10).toFixed(1) : tone.toString();
}

function formatToneType(tone: number | undefined, type: RadioToneType | undefined): string {
  if (!tone) {
    return '';
  }

  return type === RadioToneType.CTCSS ? 'CTCSS' : 'DCS';
}

export function toChannelRowFromProgrammed(programmed: RadioProgrammedChannel): ChannelRow {
  if (typeof programmed.radioChannel === 'string') {
    return {
      channelNumber: programmed.channelNumber,
      name: programmed.radioChannel,
      transmit: '',
      receive: '',
      txTone: '',
      rxTone: '',
      toneType: '',
    };
  }

  const radioChannel = programmed.radioChannel;

  return {
    channelNumber: programmed.channelNumber,
    name: radioChannel.name ?? '',
    transmit: formatFrequency(radioChannel.transmitFrequency),
    receive: formatFrequency(radioChannel.receiveFrequency),
    txTone: formatToneValue(radioChannel.transmitTone?.tone, radioChannel.transmitTone?.type),
    rxTone: formatToneValue(radioChannel.receiveTone?.tone, radioChannel.receiveTone?.type),
    toneType: formatToneType(radioChannel.transmitTone?.tone, radioChannel.transmitTone?.type),
    transmitFrequencyHz: radioChannel.transmitFrequency,
    receiveFrequencyHz: radioChannel.receiveFrequency,
    settings: programmed.settings,
  };
}