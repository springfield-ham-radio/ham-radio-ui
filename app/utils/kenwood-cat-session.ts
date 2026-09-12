import {
  decodeKenwoodMode,
  decodeKenwoodPower,
  encodeKenwoodCatCommand,
  encodeKenwoodMode,
  encodeKenwoodPower,
  formatKenwoodFrequencyHz,
  parseKenwoodCatReply,
  parseKenwoodFrequencyHz,
  type KenwoodCatDialect,
  type KenwoodCatPower,
  type KenwoodCatReply,
} from '~/utils/kenwood-cat-control';

export interface CatTransport {
  write(bytes: Uint8Array): Promise<void>;
  readLine(timeoutMs: number): Promise<string>;
  close(): Promise<void>;
}

export interface CatVfo {
  band: 0 | 1;
  label: 'A' | 'B';
  frequencyHz: number;
  mode: string;
  power?: KenwoodCatPower;
}

export interface CatStatus {
  radioIdentity: string;
  dialect: KenwoodCatDialect;
  dualBand: boolean;
  controlBand: 0 | 1;
  transmitting: boolean;
  vfos: CatVfo[];
}

export interface KenwoodCatSessionOptions {
  transport: CatTransport;
  dialect: KenwoodCatDialect;
  timeoutMs?: number;
  delayMs?: number;
}

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

function bandLabel(band: 0 | 1): 'A' | 'B' {
  return band === 0 ? 'A' : 'B';
}

function asBand(value: number): 0 | 1 {
  return value === 1 ? 1 : 0;
}

/**
 * Live Kenwood CAT session: identify, poll VFO(s), QSY, mode, power, and PTT.
 *
 * TX keys microphone audio on the side that currently has PTT, not DATA-port audio.
 */
export class KenwoodCatSession {
  readonly dialect: KenwoodCatDialect;

  private readonly transport: CatTransport;
  private readonly timeoutMs: number;
  private readonly delayMs: number;
  private current?: CatStatus;
  private frequencyCommand: 'FQ' | 'FO' = 'FQ';
  private selectedBand: 0 | 1 = 0;

  constructor(options: KenwoodCatSessionOptions) {
    this.transport = options.transport;
    this.dialect = options.dialect;
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.delayMs = options.delayMs ?? 20;
  }

  get status(): CatStatus | undefined {
    return this.current;
  }

  async connect(): Promise<CatStatus> {
    await this.transport.write(Uint8Array.of(0x0d));
    await sleep(this.delayMs === 0 ? 0 : Math.max(this.delayMs, 150));

    const identity = await this.command('ID');
    const radioIdentity = identity.fields.join(' ') || identity.raw.replace(/^ID\s+/i, '') || 'Kenwood';
    const bandControl = await this.tryCommand('BC', [0]);

    this.selectedBand = 0;
    this.current = {
      radioIdentity,
      dialect: this.dialect,
      dualBand: Boolean(bandControl),
      controlBand: bandControl ? asBand(lastInteger(bandControl.fields)) : 0,
      transmitting: false,
      vfos: [],
    };

    return this.poll();
  }

  async poll(): Promise<CatStatus> {
    const status = this.requireStatus();

    if (status.dualBand) {
      const vfos: CatVfo[] = [];

      for (const band of [0, 1] as const) {
        await this.selectBand(band);
        vfos.push(await this.readVfo(band));
      }

      await this.selectBand(status.controlBand);
      this.current = { ...status, vfos };
      return this.current;
    }

    const frequency = await this.tryCommand('FQ');
    let reply = frequency;

    if (!frequency) {
      reply = await this.command('FO');
      this.frequencyCommand = 'FO';
    } else {
      this.frequencyCommand = 'FQ';
    }

    const vfo = await this.readVfo(0, reply);
    this.current = { ...status, vfos: [vfo] };
    return this.current;
  }

  async setFrequency(band: 0 | 1, frequencyHz: number): Promise<CatStatus> {
    const status = this.requireStatus();
    const formatted = formatKenwoodFrequencyHz(frequencyHz);

    if (status.dualBand) {
      await this.command('FQ', [formatted, band]);
    } else {
      await this.command(this.frequencyCommand, [formatted]);
    }

    return this.patchVfo(band, { frequencyHz });
  }

  async setMode(band: 0 | 1, mode: string): Promise<CatStatus> {
    const status = this.requireStatus();
    const code = encodeKenwoodMode(mode, this.dialect);

    if (code === undefined) {
      throw new Error(`Mode ${mode} is not supported on this radio`);
    }

    if (status.dualBand) {
      await this.command('MD', [band, code]);
    } else {
      await this.command('MD', [code]);
    }

    return this.patchVfo(band, { mode: decodeKenwoodMode(code, this.dialect) });
  }

  async setPower(band: 0 | 1, power: KenwoodCatPower): Promise<CatStatus> {
    const status = this.requireStatus();
    const code = encodeKenwoodPower(power);

    if (status.dualBand) {
      await this.command('PC', [band, code]);
    } else {
      await this.command('PC', [code]);
    }

    return this.patchVfo(band, { power });
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
    this.frequencyCommand = 'FQ';
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

  private async readVfo(band: 0 | 1, frequencyReply?: KenwoodCatReply): Promise<CatVfo> {
    const frequency = frequencyReply ?? (await this.command(this.frequencyCommand));
    const frequencyHz = frequencyFromReply(frequency);

    if (frequencyHz === undefined) {
      throw new Error('Radio did not return a frequency');
    }

    const modeReply = await this.command('MD');
    const powerReply = await this.tryCommand('PC');

    return {
      band,
      label: bandLabel(band),
      frequencyHz,
      mode: decodeKenwoodMode(lastInteger(modeReply.fields), this.dialect),
      power: powerReply ? decodeKenwoodPower(lastInteger(powerReply.fields)) : undefined,
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

  private async command(command: string, fields: Array<string | number> = []): Promise<KenwoodCatReply> {
    await this.transport.write(encodeKenwoodCatCommand(command, fields));
    await sleep(this.delayMs);
    const line = await this.transport.readLine(this.timeoutMs);
    const reply = parseKenwoodCatReply(line);

    if (!reply.ok) {
      throw new Error(command ? `Radio rejected ${command}` : 'Radio rejected CAT command');
    }

    return reply;
  }
}
