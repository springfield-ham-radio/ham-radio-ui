import { EventEmitter } from './event-emitter';

export class ByteLengthParser extends EventEmitter {
  private readonly frameLength: number;
  private buffer: Buffer = Buffer.alloc(0);

  constructor(options: { length: number }) {
    super();
    this.frameLength = options.length;
  }

  write(chunk: Buffer): boolean {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= this.frameLength) {
      const frame = this.buffer.subarray(0, this.frameLength);
      this.buffer = this.buffer.subarray(this.frameLength);
      this.emit('data', frame);
    }

    return true;
  }
}
