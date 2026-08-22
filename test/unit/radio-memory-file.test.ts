import { describe, it } from 'node:test';
import { expect } from 'chai';
import { RadioModelId, type RadioId } from '@springfield/ham-radio-api';
import {
  defaultMemoryFileName,
  memoryFileDisplayName,
  parseRadioMemoryFile,
  serializeRadioMemoryFile,
  shouldPromptForSavePath,
  withJsonExtension,
} from '../../app/utils/radio-memory-file.ts';

const radioId: RadioId = {
  model: RadioModelId('baofeng-uv5r'),
  name: 'Baofeng UV-5R',
  manufacturer: 'Baofeng',
};

describe('serializeRadioMemoryFile', () => {
  it('writes a versioned JSON document with hex-encoded contents', () => {
    const json = serializeRadioMemoryFile(radioId, Uint8Array.from([0x00, 0xab, 0xff]));
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed.kind).to.equal('springfield-ham-radio-memory');
    expect(parsed.version).to.equal(1);
    expect(parsed.radioId).to.deep.equal({
      model: 'baofeng-uv5r',
      name: 'Baofeng UV-5R',
      manufacturer: 'Baofeng',
    });
    expect(parsed.contents).to.equal('00ABFF');
  });

  it('rejects empty memory', () => {
    expect(() => serializeRadioMemoryFile(radioId, new Uint8Array())).to.throw('Memory is empty');
  });
});

describe('parseRadioMemoryFile', () => {
  it('round-trips a serialized memory file', () => {
    const contents = Uint8Array.from([0x10, 0x20, 0x30, 0x40]);
    const json = serializeRadioMemoryFile(radioId, contents);
    const loaded = parseRadioMemoryFile(json);

    expect(loaded.radioId).to.deep.equal(radioId);
    expect(Array.from(loaded.contents)).to.deep.equal(Array.from(contents));
  });

  it('accepts lowercase and whitespace in the hex contents', () => {
    const json = JSON.stringify({
      kind: 'springfield-ham-radio-memory',
      version: 1,
      radioId,
      contents: '00 ab\nFF',
    });
    const loaded = parseRadioMemoryFile(json);

    expect(Array.from(loaded.contents)).to.deep.equal([0x00, 0xab, 0xff]);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseRadioMemoryFile('{')).to.throw('not valid JSON');
  });

  it('rejects files that are not radio memory documents', () => {
    expect(() => parseRadioMemoryFile(JSON.stringify({ version: 1 }))).to.throw('not a radio memory file');
  });

  it('rejects unsupported versions', () => {
    const json = JSON.stringify({
      kind: 'springfield-ham-radio-memory',
      version: 2,
      radioId,
      contents: '00',
    });

    expect(() => parseRadioMemoryFile(json)).to.throw('Unsupported radio memory file version');
  });

  it('rejects odd-length hex contents', () => {
    const json = JSON.stringify({
      kind: 'springfield-ham-radio-memory',
      version: 1,
      radioId,
      contents: 'ABC',
    });

    expect(() => parseRadioMemoryFile(json)).to.throw('even number of hex digits');
  });

  it('rejects non-hex contents', () => {
    const json = JSON.stringify({
      kind: 'springfield-ham-radio-memory',
      version: 1,
      radioId,
      contents: 'GG',
    });

    expect(() => parseRadioMemoryFile(json)).to.throw('hex');
  });

  it('rejects missing radio identity fields', () => {
    const json = JSON.stringify({
      kind: 'springfield-ham-radio-memory',
      version: 1,
      radioId: { model: 'baofeng-uv5r' },
      contents: '00',
    });

    expect(() => parseRadioMemoryFile(json)).to.throw('radio identity');
  });
});

describe('defaultMemoryFileName', () => {
  it('uses the radio model as the file name', () => {
    expect(defaultMemoryFileName(radioId)).to.equal('baofeng-uv5r.json');
  });
});

describe('memoryFileDisplayName', () => {
  it('returns the last path segment', () => {
    expect(memoryFileDisplayName('/Users/me/Radios/uv5r.json')).to.equal('uv5r.json');
  });

  it('handles Windows-style paths', () => {
    expect(memoryFileDisplayName('C:\\Radios\\uv5r.json')).to.equal('uv5r.json');
  });

  it('returns the original value when there is no separator', () => {
    expect(memoryFileDisplayName('uv5r.json')).to.equal('uv5r.json');
  });
});

describe('shouldPromptForSavePath', () => {
  it('reuses the current path for Save', () => {
    expect(shouldPromptForSavePath('/Radios/uv5r.json', false)).to.equal(false);
  });

  it('prompts when Save has no current path', () => {
    expect(shouldPromptForSavePath(undefined, false)).to.equal(true);
  });

  it('always prompts for Save As', () => {
    expect(shouldPromptForSavePath('/Radios/uv5r.json', true)).to.equal(true);
  });
});

describe('withJsonExtension', () => {
  it('leaves an existing .json suffix alone', () => {
    expect(withJsonExtension('/Radios/uv5r.json')).to.equal('/Radios/uv5r.json');
  });

  it('appends .json when the path has no extension', () => {
    expect(withJsonExtension('/Radios/uv5r')).to.equal('/Radios/uv5r.json');
  });
});
