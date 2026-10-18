import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RadioChannelId, RadioToneType } from '@springfield/ham-radio-api';
import { recordingSqlExecutor, type SqlStatement } from '~/utils/sql-transaction';
import { insertSavedChannelModels, updateSavedChannel, type SavedChannel } from '~/utils/saved-channels-db';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): { run: (...args: unknown[]) => unknown; get: (...args: unknown[]) => Record<string, unknown> | undefined };
  };
};

function sqlitePlaceholders(sql: string): string {
  return sql.replaceAll(/\$\d+/g, '?');
}

function runStatements(database: InstanceType<typeof DatabaseSync>, statements: readonly SqlStatement[]): void {
  for (const statement of statements) {
    database.prepare(sqlitePlaceholders(statement.sql)).run(...statement.values);
  }
}

function sampleChannel(id: string): SavedChannel {
  return {
    id: RadioChannelId(id),
    name: 'Monday Net',
    kind: 'channel',
    transmitFrequency: 146_520_000,
    receiveFrequency: 146_520_000,
    transmitTone: { tone: 0, type: RadioToneType.CTCSS },
    receiveTone: { tone: 0, type: RadioToneType.CTCSS },
    packChannelId: 'monday-net',
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('channel pack apply transaction', () => {
  it('rolls back queued channel writes when the batch fails', async () => {
    const statements: SqlStatement[] = [];
    const executor = recordingSqlExecutor(statements);
    await insertSavedChannelModels([sampleChannel('channel-1')], executor);
    await updateSavedChannel({ ...sampleChannel('channel-1'), name: 'Renamed' }, executor);

    const database = new DatabaseSync(':memory:');
    database.exec(
      `CREATE TABLE saved_channels (
        id TEXT PRIMARY KEY,
        name TEXT,
        kind TEXT,
        transmit_frequency INTEGER,
        receive_frequency INTEGER,
        transmit_tone INTEGER,
        transmit_tone_type TEXT,
        receive_tone INTEGER,
        receive_tone_type TEXT,
        notes TEXT,
        use_type TEXT,
        on_air INTEGER,
        callsign TEXT,
        latitude REAL,
        longitude REAL,
        allstar_node TEXT,
        echolink_node TEXT,
        irlp_node TEXT,
        wires_node TEXT,
        allstar_linked INTEGER,
        echolink_linked INTEGER,
        irlp_linked INTEGER,
        wires_linked INTEGER,
        source_key TEXT,
        source_format TEXT,
        city TEXT,
        county TEXT,
        state TEXT,
        country TEXT,
        landmark TEXT,
        modes TEXT,
        last_update TEXT,
        pack_channel_id TEXT,
        created_at INTEGER,
        updated_at INTEGER
      )`,
    );

    database.exec('BEGIN');

    expect(() => {
      runStatements(database, statements.slice(0, 1));
      throw new Error('disk full');
    }).toThrow(/disk full/);

    database.exec('ROLLBACK');

    const row = database.prepare('SELECT id FROM saved_channels WHERE id = ?').get('channel-1');
    expect(row).toBeUndefined();
  });

  it('keeps the sample pack free of RepeaterBook provenance', () => {
    const text = readFileSync(new URL('../../public/fixtures/sample-club.hpack', import.meta.url), 'utf8');
    expect(text).not.toMatch(/repeaterbook/i);
    expect(text).not.toMatch(/W5KA/);
    expect(text).toContain('N0CLB');
  });
});
