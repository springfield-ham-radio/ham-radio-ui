import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RadioChannelId, RadioToneType } from '@springfield/ham-radio-api';
import { planLibraryImport, type LibraryImportPolicy } from '../../app/utils/library-import.ts';
import {
  importedRepeaterNotes,
  importedRepeaterToRadioChannel,
  parseRepeaterImportCsv,
  type ParsedRepeater,
} from '../../app/utils/repeater-import.ts';
import {
  radioChannelToSavedChannel,
  savedChannelRowToModel,
  toneTypeToDb,
  type SavedChannel,
  type SavedChannelRow,
} from '../../app/utils/saved-channels-db.ts';

const importedAt = '2026-10-10T19:00:00.000Z';

function toSaved(repeater: ParsedRepeater, notes?: string): SavedChannel {
  return radioChannelToSavedChannel(importedRepeaterToRadioChannel(repeater), {
    id: RadioChannelId(crypto.randomUUID()),
    notes: notes ?? importedRepeaterNotes(repeater),
    kind: 'repeater',
    use: repeater.use,
    onAir: repeater.onAir,
    callsign: repeater.callsign || undefined,
    latitude: repeater.latitude,
    longitude: repeater.longitude,
    allstarNode: repeater.allstarNode,
    echolinkNode: repeater.echolinkNode,
    irlpNode: repeater.irlpNode,
    wiresNode: repeater.wiresNode,
    allstar: repeater.allstar,
    echolink: repeater.echolink,
    irlp: repeater.irlp,
    wires: repeater.wires,
    sourceKey: repeater.sourceKey,
    sourceFormat: repeater.sourceFormat,
    city: repeater.city,
    county: repeater.county,
    state: repeater.state,
    country: repeater.country,
    landmark: repeater.landmark,
    modes: repeater.modes,
    lastUpdate: repeater.lastUpdate,
  });
}

function policyFor(csv: string): LibraryImportPolicy {
  const parsed = parseRepeaterImportCsv(csv);

  return {
    columns: parsed.recordColumns,
    replaceLinkedNodes: parsed.nodeColumnsPresent,
    replaceLinkedPresence: parsed.nodeColumnsPresent || parsed.linkedTextColumnsPresent,
    importedAt,
  };
}

describe('planLibraryImport', () => {
  const original = `State ID,Rptr ID,Frequency,Input Freq,PL,TSQ,Nearest City,County,State,Callsign,Use,Operational Status,FM Analog,Lat,Long,Last Update
23,21812,146.92500,146.32500,103.5,,Lyman,York,Maine,WJ1L,OPEN,On-air,Yes,43.50,-70.72,2026-01-01
`;
  const retuned = `State ID,Rptr ID,Frequency,Input Freq,PL,TSQ,Nearest City,County,State,Callsign,Use,Operational Status,FM Analog,Modes,Lat,Long,Last Update
23,21812,146.92500,146.22500,100.0,100.0,Lyman,York,Maine,WJ1L,CLOSED,Off-air,Yes,FM EchoLink,,,2026-03-03
`;

  it('updates a matching source key in place and keeps the edited name and notes', () => {
    const parsed = parseRepeaterImportCsv(original);
    const existing = toSaved(parsed.repeaters[0]!);
    existing.name = 'Club machine';
    existing.notes = 'Operator note';

    const first = planLibraryImport([], [existing], policyFor(original));
    expect(first.added).toBe(1);
    expect(first.insert[0]?.lastUpdate).toBe('2026-01-01');

    const incoming = toSaved(parseRepeaterImportCsv(retuned).repeaters[0]!);
    const plan = planLibraryImport([existing], [incoming], policyFor(retuned));

    expect(plan.added).toBe(0);
    expect(plan.updated).toBe(1);
    expect(plan.unchanged).toBe(0);
    expect(plan.insert).toHaveLength(0);
    expect(plan.update).toHaveLength(1);

    const updated = plan.update[0]!;
    expect(updated.id).toBe(existing.id);
    expect(updated.name).toBe('Club machine');
    expect(updated.notes).toBe('Operator note');
    expect(updated.sourceKey).toBe('rb:23:21812');
    expect(updated.transmitFrequency).toBe(incoming.transmitFrequency);
    expect(updated.receiveFrequency).toBe(existing.receiveFrequency);
    expect(updated.transmitTone.tone).toBe(1000);
    expect(updated.receiveTone.tone).toBe(1000);
    expect(updated.use).toBe('closed');
    expect(updated.onAir).toBe(false);
    expect(updated.modes).toBe('FM');
    expect(updated.echolink).toBe(true);
    expect(updated.city).toBe('Lyman');
    expect(updated.state).toBe('Maine');
    expect(updated.latitude).toBeCloseTo(43.5);
    expect(updated.longitude).toBeCloseTo(-70.72);
    expect(updated.lastUpdate).toBe('2026-03-03');
  });

  it('does not duplicate an Austin website export and leaves an identical re-import unchanged', () => {
    const csv = readFileSync(new URL('../fixtures/austin-repeaters.csv', import.meta.url), 'utf8');
    const parsed = parseRepeaterImportCsv(csv);
    const models = parsed.repeaters.map((repeater) => toSaved(repeater));
    const policy = policyFor(csv);
    const first = planLibraryImport([], models, policy);
    const sourceKeys = new Set(models.map((model) => model.sourceKey));

    expect(first.added).toBe(sourceKeys.size);
    expect(first.insert).toHaveLength(sourceKeys.size);
    expect(new Set(first.insert.map((row) => row.sourceKey)).size).toBe(first.insert.length);
    expect(first.updated).toBe(0);
    expect(first.unchanged).toBe(0);
    expect(first.added).toBeLessThan(models.length);
    expect(first.insert.every((row) => row.latitude === undefined && row.longitude === undefined)).toBe(true);
    expect(first.insert.every((row) => row.lastUpdate === importedAt)).toBe(true);
    expect(first.insert.every((row) => !row.notes?.includes('Austin, Texas'))).toBe(true);

    const again = planLibraryImport(first.insert, models, policy);

    expect(again.added).toBe(0);
    expect(again.insert).toHaveLength(0);
    expect(again.update).toHaveLength(0);
    expect(again.updated).toBe(0);
    expect(again.unchanged).toBe(first.added);

    const reloaded = first.insert.map((channel) => {
      const row: SavedChannelRow = {
        id: String(channel.id),
        name: channel.name ?? null,
        kind: channel.kind,
        transmit_frequency: channel.transmitFrequency,
        receive_frequency: channel.receiveFrequency,
        transmit_tone: channel.transmitTone.tone,
        transmit_tone_type: toneTypeToDb(channel.transmitTone.type),
        receive_tone: channel.receiveTone.tone,
        receive_tone_type: toneTypeToDb(channel.receiveTone.type),
        notes: channel.notes ?? null,
        use_type: channel.use ?? null,
        on_air: channel.onAir === true ? 1 : channel.onAir === false ? 0 : null,
        callsign: channel.callsign ?? null,
        latitude: channel.latitude ?? null,
        longitude: channel.longitude ?? null,
        allstar_node: channel.allstarNode ?? null,
        echolink_node: channel.echolinkNode ?? null,
        irlp_node: channel.irlpNode ?? null,
        wires_node: channel.wiresNode ?? null,
        allstar_linked: channel.allstar ? 1 : 0,
        echolink_linked: channel.echolink ? 1 : 0,
        irlp_linked: channel.irlp ? 1 : 0,
        wires_linked: channel.wires ? 1 : 0,
        source_key: channel.sourceKey ?? null,
        source_format: channel.sourceFormat ?? null,
        city: channel.city ?? null,
        county: channel.county ?? null,
        state: channel.state ?? null,
        country: channel.country ?? null,
        landmark: channel.landmark ?? null,
        modes: channel.modes ?? null,
        last_update: channel.lastUpdate ?? null,
        created_at: channel.createdAt,
        updated_at: channel.updatedAt,
      };

      return savedChannelRowToModel(row);
    });
    const afterReload = planLibraryImport(reloaded, models, policy);
    const changed = afterReload.update.map((row) => row.sourceKey);

    expect(changed).toEqual([]);
    expect(afterReload.updated).toBe(0);
    expect(RadioToneType.DCS).toBe(RadioToneType.DCS);
  });

  it('keeps stored coordinates when the new row has none, and replaces them when it does', () => {
    const located = parseRepeaterImportCsv(original).repeaters[0]!;
    const existing = toSaved(located);
    const blank = parseRepeaterImportCsv(
      `Output Freq,Input Freq,Offset,Uplink Tone,Downlink Tone,Call,"Location",County,State,Modes
146.925000,146.32500,-,103.5,,WJ1L,"Lyman",York,Maine,FM
`,
    ).repeaters[0]!;
    blank.sourceKey = existing.sourceKey;
    const withoutCoordinates = toSaved(blank);
    const kept = planLibraryImport([existing], [withoutCoordinates], policyFor(
      `Output Freq,Input Freq,Call,"Location",State
146.925000,146.32500,WJ1L,"Lyman",Maine
`,
    ));

    expect(kept.updated).toBe(0);
    expect(kept.unchanged).toBe(1);

    const moved = toSaved({ ...located, latitude: 44, longitude: -69 });
    const replaced = planLibraryImport([existing], [moved], policyFor(original));

    expect(replaced.update[0]?.latitude).toBe(44);
    expect(replaced.update[0]?.longitude).toBe(-69);
  });

  it('stamps a source key onto a legacy row and then follows an offset change', () => {
    const parsed = parseRepeaterImportCsv(
      `Output Freq,Input Freq,Offset,Uplink Tone,Downlink Tone,Call,"Location",County,State,Modes
146.940000,146.34000,-,107.2,107.2,W5KA,"Austin",Travis,Texas,FM
`,
    );
    const incoming = toSaved(parsed.repeaters[0]!);
    const legacy = radioChannelToSavedChannel(importedRepeaterToRadioChannel(parsed.repeaters[0]!), {
      id: RadioChannelId('33333333-3333-3333-3333-333333333333'),
      kind: 'repeater',
      callsign: 'W5KA',
      notes: 'do not clobber',
    });
    legacy.name = 'My Austin';
    const policy = policyFor(
      `Output Freq,Input Freq,Call,"Location",State,Modes
146.940000,146.34000,W5KA,"Austin",Texas,FM
`,
    );
    const stamped = planLibraryImport([legacy], [incoming], policy);

    expect(stamped.added).toBe(0);
    expect(stamped.updated).toBe(1);
    expect(stamped.update[0]?.id).toBe(legacy.id);
    expect(stamped.update[0]?.name).toBe('My Austin');
    expect(stamped.update[0]?.notes).toBe('do not clobber');
    expect(stamped.update[0]?.sourceKey).toBe('rb:w5ka:146940000:austin');
    expect(stamped.update[0]?.city).toBe('Austin');
    expect(stamped.update[0]?.state).toBe('Texas');

    const shifted = toSaved(
      parseRepeaterImportCsv(
        `Output Freq,Input Freq,Offset,Uplink Tone,Downlink Tone,Call,"Location",County,State,Modes
146.940000,146.24000,-,110.9,110.9,W5KA,"Austin",Travis,Texas,FM DMR
`,
      ).repeaters[0]!,
    );
    const followed = planLibraryImport(stamped.update, [shifted], policyFor(
      `Output Freq,Input Freq,Call,"Location",State,Modes
146.940000,146.24000,W5KA,"Austin",Texas,FM DMR
`,
    ));

    expect(followed.added).toBe(0);
    expect(followed.updated).toBe(1);
    expect(followed.update[0]?.id).toBe(legacy.id);
    expect(followed.update[0]?.transmitFrequency).toBe(shifted.transmitFrequency);
    expect(followed.update[0]?.transmitTone.tone).toBe(1109);
    expect(followed.update[0]?.modes).toBe('FM DMR');
    expect(followed.update[0]?.notes).toBe('do not clobber');
  });
});
