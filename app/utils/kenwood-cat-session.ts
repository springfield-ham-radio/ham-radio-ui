import {
  encodeKenwoodCatCommand,
  formatKenwoodFrequencyHz,
  kenwoodFoWithFrequency,
  kenwoodFoWithMode,
  parseKenwoodCatReply,
  parseKenwoodFoReply,
  parseKenwoodFrequencyHz,
  type KenwoodCatReply,
} from '~/utils/kenwood-cat-control';
import {
  labelAt,
  lookupCatCode,
  selectableModesForBand,
  type KenwoodCatProfile,
} from '~/utils/kenwood-cat-profile';

export interface CatTransport {
  write(bytes: Uint8Array): Promise<void>;
  readLine(timeoutMs: number): Promise<string>;
  discardBuffered(): void;
  close(): Promise<void>;
}

export interface CatVfo {
  band: 0 | 1;
  label: 'A' | 'B';
  frequencyHz: number;
  mode: string;
  power?: string;
  /** VFO / Memory / Call / DV from `VM` when the module declares it. */
  activity?: string;
  /** True when the band is not in VFO mode (editors disabled). */
  readOnly?: boolean;
  /** Mode names allowed on this band when `bandModes` is set. */
  modes?: string[];
}

export interface CatStatus {
  radioIdentity: string;
  dualBand: boolean;
  controlBand: 0 | 1;
  transmitting: boolean;
  vfos: CatVfo[];
  modes: string[];
  powers: string[];
}

export interface KenwoodCatSessionOptions {
  transport: CatTransport;
  profile: KenwoodCatProfile;
  timeoutMs?: number;
  delayMs?: number;
}

const VFO_ACTIVITY_EDITABLE_CODE = 0;

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function lastInteger(fields: string[]): number {
  for (let index = fields.length - 1; index >= 0; index--) {
    const parsed = Number.parseInt(fields[index] ?? '', 10);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function frequencyFromReply(reply: KenwoodCatReply): number | undefined {
  for (const field of reply.fields) {
    const frequencyHz = parseKenwoodFrequencyHz(field);

    if (frequencyHz !== undefined) {
      return frequencyHz;
    }
  }

  return undefined;
}

function modeLabelFromReply(profile: KenwoodCatProfile, fields: string[]): string {
  const code = lastInteger(fields);
  return labelAt(profile.modes, code) ?? `Mode ${code}`;
}

function bandLabel(band: 0 | 1): 'A' | 'B' {
  return band === 0 ? 'A' : 'B';
}

function asBand(value: number): 0 | 1 {
  return value === 1 ? 1 : 0;
}

function vfoBands(count: number): Array<0 | 1> {
  return count > 1 ? [0, 1] : [0];
}

function activityFromVm(profile: KenwoodCatProfile, fields: string[]): { activity?: string; readOnly: boolean } {
  const code = lastInteger(fields);
  const label = profile.vfoModes?.[code];

  if (code === VFO_ACTIVITY_EDITABLE_CODE) {
    return { ...(label ? { activity: label } : {}), readOnly: false };
  }

  return {
    ...(label ? { activity: label } : {}),
    readOnly: true,
  };
}

function assertVfoWritable(status: CatStatus, band: 0 | 1): CatVfo {
  const vfo = status.vfos.find((item) => item.band === band);

  if (vfo?.readOnly) {
    throw new Error(`VFO ${vfo.label} is not in VFO mode`);
  }

  return vfo ?? { band, label: bandLabel(band), frequencyHz: 0, mode: 'FM' };
}

function minimumReplyFields(command: string, sentFields: Array<string | number>, profile: KenwoodCatProfile): number {
  if (command === 'ID') {
    return 1;
  }

  if (profile.bandControl && command === 'BC') {
    return 1;
  }

  if (profile.vfoChannel && command === profile.frequencyCommands[0] && sentFields.length <= 1) {
    return 13;
  }

  if (profile.bandIndexed) {
    const modeCommand = profile.modeCommand ?? 'MD';

    if (
      (command === profile.frequencyCommands[0] || command === modeCommand || command === 'PC') &&
      sentFields.length === 1
    ) {
      return 2;
    }
  }

  if (profile.powerBandIndex && command === 'PC' && sentFields.length === 1) {
    return 2;
  }

  return 0;
}

/**
 * Live Kenwood CAT session driven by the radio module `cat` profile.
 *
 * TX keys microphone audio on the side that currently has PTT, not DATA-port audio.
 */
export class KenwoodCatSession {
  readonly profile: KenwoodCatProfile;

  private readonly transport: CatTransport;
  private readonly timeoutMs: number;
  private readonly delayMs: number;
  private current?: CatStatus;
  private frequencyCommand: string;
  private selectedBand: 0 | 1 = 0;

  constructor(options: KenwoodCatSessionOptions) {
    this.transport = options.transport;
    this.profile = options.profile;
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.delayMs = options.delayMs ?? 20;
    this.frequencyCommand = options.profile.frequencyCommands[0] ?? 'FQ';
  }

  get status(): CatStatus | undefined {
    return this.current;
  }

  async connect(): Promise<CatStatus> {
    if (this.profile.wakeCr) {
      await this.transport.write(Uint8Array.of(0x0d));
      await sleep(this.delayMs === 0 ? 0 : Math.max(this.delayMs, 150));
      this.transport.discardBuffered();
    }

    const identity = await this.command('ID');
    const radioIdentity = identity.fields.join(' ') || identity.raw.replace(/^ID\s+/i, '') || 'Kenwood';

    this.selectedBand = 0;
    this.current = {
      radioIdentity,
      dualBand: this.profile.vfoCount > 1,
      controlBand: 0,
      transmitting: false,
      vfos: [],
      modes: [...this.profile.modes],
      powers: [...this.profile.powers],
    };

    return this.poll();
  }

  async poll(): Promise<CatStatus> {
    const status = this.requireStatus();
    let controlBand = status.controlBand;

    if (this.profile.bandControl) {
      const bandControl =
        this.profile.vfoChannel || this.profile.bandIndexed
          ? await this.command('BC')
          : await this.tryCommand('BC');

      if (bandControl) {
        controlBand = asBand(Number.parseInt(bandControl.fields[0] ?? '0', 10));
      }
    }

    const vfos: CatVfo[] = [];

    for (const band of vfoBands(this.profile.vfoCount)) {
      try {
        if (!this.profile.vfoChannel && !this.profile.bandIndexed && status.dualBand) {
          await this.selectBand(band);
        }

        vfos.push(await this.readVfo(band));
      } catch (error) {
        if (band === 0 || vfos.length === 0) {
          throw error;
        }
      }
    }

    if (!this.profile.vfoChannel && !this.profile.bandIndexed && status.dualBand) {
      await this.selectBand(controlBand);
    }

    this.current = { ...status, controlBand, dualBand: vfos.length > 1, vfos };
    return this.current;
  }

  async setFrequency(band: 0 | 1, frequencyHz: number): Promise<CatStatus> {
    assertVfoWritable(this.requireStatus(), band);

    if (this.profile.vfoChannel) {
      const channel = parseKenwoodFoReply(await this.command(this.frequencyCommand, [band]), this.profile.modes);
      await this.command(
        this.frequencyCommand,
        kenwoodFoWithFrequency(channel, frequencyHz, this.profile.frequencyWidth),
      );
      return this.patchVfo(band, { frequencyHz });
    }

    const formatted = formatKenwoodFrequencyHz(frequencyHz, this.profile.frequencyWidth);

    if (this.profile.bandIndexed) {
      await this.command(this.frequencyCommand, [band, formatted]);
    } else if (this.requireStatus().dualBand) {
      await this.command(this.frequencyCommand, [formatted, band]);
    } else {
      await this.command(this.frequencyCommand, [formatted]);
    }

    return this.patchVfo(band, { frequencyHz });
  }

  async setMode(band: 0 | 1, mode: string): Promise<CatStatus> {
    assertVfoWritable(this.requireStatus(), band);

    const selectable = selectableModesForBand(this.profile, band);

    if (lookupCatCode(selectable, mode) === undefined) {
      throw new Error(`Mode ${mode} is not supported on VFO ${bandLabel(band)}`);
    }

    const code = lookupCatCode(this.profile.modes, mode);

    if (code === undefined) {
      throw new Error(`Mode ${mode} is not supported on this radio`);
    }

    const label = labelAt(this.profile.modes, code) ?? mode;

    if (this.profile.vfoChannel) {
      const channel = parseKenwoodFoReply(await this.command(this.frequencyCommand, [band]), this.profile.modes);
      await this.command(this.frequencyCommand, kenwoodFoWithMode(channel, code));
      return this.patchVfo(band, { mode: label });
    }

    const command = this.profile.modeCommand ?? 'MD';

    if (this.profile.bandIndexed || this.requireStatus().dualBand) {
      await this.command(command, [band, code]);
    } else {
      await this.command(command, [code]);
    }

    return this.patchVfo(band, { mode: label });
  }

  async setPower(band: 0 | 1, power: string): Promise<CatStatus> {
    assertVfoWritable(this.requireStatus(), band);

    const code = lookupCatCode(this.profile.powers, power);

    if (code === undefined) {
      throw new Error(`Power ${power} is not supported on this radio`);
    }

    const label = labelAt(this.profile.powers, code) ?? power;

    if (this.profile.powerBandIndex) {
      await this.command('PC', [band, code]);
    } else {
      await this.command('PC', [code]);
    }

    return this.patchVfo(band, { power: label });
  }

  async setTransmit(transmit: boolean): Promise<CatStatus> {
    const status = this.requireStatus();
    await this.command(transmit ? 'TX' : 'RX');
    this.current = { ...status, transmitting: transmit, vfos: [...status.vfos] };
    return this.current;
  }

  async disconnect(): Promise<void> {
    if (this.current?.transmitting) {
      try {
        await this.command('RX');
      } catch {
        // Best-effort unkey before closing the port.
      }
    }

    this.current = undefined;
    this.selectedBand = 0;
    this.frequencyCommand = this.profile.frequencyCommands[0] ?? 'FQ';
    await this.transport.close();
  }

  private async selectBand(band: 0 | 1): Promise<void> {
    if (!this.current?.dualBand || this.selectedBand === band) {
      return;
    }

    await this.command('BC', [band]);
    this.selectedBand = band;
  }

  private requireStatus(): CatStatus {
    if (!this.current) {
      throw new Error('CAT session is not connected');
    }

    return this.current;
  }

  private async readVfo(band: 0 | 1): Promise<CatVfo> {
    const selectableModes = [...selectableModesForBand(this.profile, band)];

    if (this.profile.vfoChannel) {
      const channel = parseKenwoodFoReply(await this.command(this.frequencyCommand, [band]), this.profile.modes);
      const powerReply = this.profile.powerBandIndex
        ? await this.tryCommand('PC', [band])
        : await this.tryCommand('PC');

      return {
        band,
        label: bandLabel(band),
        frequencyHz: channel.frequencyHz,
        mode: channel.mode,
        power: powerReply ? labelAt(this.profile.powers, lastInteger(powerReply.fields)) : undefined,
        modes: selectableModes,
      };
    }

    if (this.profile.bandIndexed) {
      const frequency = await this.command(this.frequencyCommand, [band]);
      const frequencyHz = frequencyFromReply(frequency);

      if (frequencyHz === undefined) {
        throw new Error('Radio did not return a frequency');
      }

      const modeCommand = this.profile.modeCommand ?? 'MD';
      const modeReply = await this.command(modeCommand, [band]);
      const powerReply = this.profile.powerBandIndex ? await this.tryCommand('PC', [band]) : await this.tryCommand('PC');
      const vmReply = this.profile.vfoModeCommand
        ? await this.tryCommand(this.profile.vfoModeCommand, [band])
        : undefined;
      const vmState = vmReply ? activityFromVm(this.profile, vmReply.fields) : { readOnly: false as const };

      return {
        band,
        label: bandLabel(band),
        frequencyHz,
        mode: modeLabelFromReply(this.profile, modeReply.fields),
        power: powerReply ? labelAt(this.profile.powers, lastInteger(powerReply.fields)) : undefined,
        modes: selectableModes,
        ...(vmState.activity ? { activity: vmState.activity } : {}),
        readOnly: vmState.readOnly,
      };
    }

    let frequency = await this.tryCommand(this.frequencyCommand);

    if (!frequency) {
      for (const command of this.profile.frequencyCommands.slice(1)) {
        frequency = await this.tryCommand(command);

        if (frequency) {
          this.frequencyCommand = command;
          break;
        }
      }
    }

    if (!frequency) {
      frequency = await this.command(this.profile.frequencyCommands.at(-1) ?? this.frequencyCommand);
    }

    const frequencyHz = frequencyFromReply(frequency);

    if (frequencyHz === undefined) {
      throw new Error('Radio did not return a frequency');
    }

    const modeCommand = this.profile.modeCommand ?? 'MD';
    const modeReply = await this.command(modeCommand);
    const powerReply = this.profile.powerBandIndex
      ? await this.tryCommand('PC', [band])
      : await this.tryCommand('PC');

    return {
      band,
      label: bandLabel(band),
      frequencyHz,
      mode: modeLabelFromReply(this.profile, modeReply.fields),
      power: powerReply ? labelAt(this.profile.powers, lastInteger(powerReply.fields)) : undefined,
      modes: selectableModes,
    };
  }

  private patchVfo(band: 0 | 1, patch: Partial<CatVfo>): CatStatus {
    const status = this.requireStatus();
    const vfos = status.vfos.map((vfo) => (vfo.band === band ? { ...vfo, ...patch } : vfo));
    this.current = { ...status, vfos };
    return this.current;
  }

  private async tryCommand(command: string, fields: Array<string | number> = []): Promise<KenwoodCatReply | undefined> {
    try {
      return await this.command(command, fields);
    } catch {
      return undefined;
    }
  }

  private async readReply(): Promise<KenwoodCatReply> {
    for (;;) {
      const line = await this.transport.readLine(this.timeoutMs);

      if (line.trim().length === 0) {
        continue;
      }

      return parseKenwoodCatReply(line);
    }
  }

  private async command(command: string, fields: Array<string | number> = []): Promise<KenwoodCatReply> {
    await this.transport.write(encodeKenwoodCatCommand(command, fields));
    await sleep(this.delayMs);
    let reply = await this.readReply();
    const minimumFields = minimumReplyFields(command, fields, this.profile);

    if (reply.ok && reply.fields.length < minimumFields) {
      reply = await this.readReply();
    }

    if (!reply.ok) {
      throw new Error(command ? `Radio rejected ${command}` : 'Radio rejected CAT command');
    }

    return reply;
  }
}