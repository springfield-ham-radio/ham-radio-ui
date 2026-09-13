import { describe, it } from 'node:test';
import { expect } from 'chai';
import { reactive } from 'vue';
import { getSettingAtPath, setSettingAtPath } from '../../app/utils/settings-path.ts';

describe('settings-path', () => {
  it('should read a nested setting by dot path', () => {
    const settings = {
      block1: { pcbaud: '9600', pwdon: true },
    };

    expect(getSettingAtPath(settings, 'block1.pcbaud')).to.equal('9600');
    expect(getSettingAtPath(settings, 'block1.pwdon')).to.equal(true);
  });

  it('should write a nested setting without mutating the original', () => {
    const settings = {
      block1: { pcbaud: '9600', pwdon: true },
    };

    const next = setSettingAtPath(settings, 'block1.pcbaud', '57600');

    expect(next.block1).to.deep.equal({ pcbaud: '57600', pwdon: true });
    expect(settings.block1).to.deep.equal({ pcbaud: '9600', pwdon: true });
  });

  it('should write through Vue reactive settings used by the form', () => {
    const settings = reactive({
      block1: { pcbaud: '9600', pwdon: true },
      powerOn: [{ pwron: 'HELLO !!' }],
    });

    const next = setSettingAtPath(settings, 'block1.pcbaud', '57600');

    expect(getSettingAtPath(next, 'block1.pcbaud')).to.equal('57600');
    expect(getSettingAtPath(next, 'powerOn.0.pwron')).to.equal('HELLO !!');
    expect(settings.block1.pcbaud).to.equal('9600');
  });

  it('should write an array element by numeric path segment', () => {
    const settings = {
      powerOn: [{ pwron: 'HELLO !!' }, { pwron: 'PM ONE' }],
    };

    const next = setSettingAtPath(settings, 'powerOn.0.pwron', 'HAMBENCH');

    expect(next.powerOn).to.deep.equal([{ pwron: 'HAMBENCH' }, { pwron: 'PM ONE' }]);
    expect(settings.powerOn[0]).to.deep.equal({ pwron: 'HELLO !!' });
  });
});
