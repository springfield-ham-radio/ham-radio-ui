import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): {
      get: (...args: unknown[]) => Record<string, unknown> | undefined;
      all: (...args: unknown[]) => Array<Record<string, unknown>>;
      run: (...args: unknown[]) => unknown;
    };
  };
};

interface SqlMigration {
  version: number;
  description: string;
  sql: string;
}

/**
 * Read the Tauri SQL migrations from lib.rs so the test runs the same statements the app runs.
 */
export function readSqlMigrations(source: string): SqlMigration[] {
  const pattern =
    /version:\s*(\d+),\s*description:\s*"([^"]+)",\s*sql:\s*(?:r#"([\s\S]*?)"#|"([^"]*)")/g;
  const migrations: SqlMigration[] = [];

  for (const match of source.matchAll(pattern)) {
    migrations.push({
      version: Number(match[1]),
      description: match[2] ?? '',
      sql: (match[3] ?? match[4] ?? '').trim(),
    });
  }

  return migrations;
}

function columnNames(database: InstanceType<typeof DatabaseSync>, table: string): string[] {
  return database
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => String(row.name));
}

describe('saved channel migrations', () => {
  const source = readFileSync(new URL('../../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const migrations = readSqlMigrations(source);

  it('numbers migrations 1 through 16 and stores repeater records without new coordinate columns', () => {
    expect(migrations.map((migration) => migration.version)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);

    const record = migrations.find((migration) => migration.version === 14);
    expect(record?.description).toBe('add_saved_channel_repeater_record');
    expect(record?.sql).toContain('ADD COLUMN source_key');
    expect(record?.sql).toContain('ADD COLUMN source_format');
    expect(record?.sql).toContain('ADD COLUMN city');
    expect(record?.sql).toContain('ADD COLUMN county');
    expect(record?.sql).toContain('ADD COLUMN state');
    expect(record?.sql).toContain('ADD COLUMN country');
    expect(record?.sql).toContain('ADD COLUMN landmark');
    expect(record?.sql).toContain('ADD COLUMN modes');
    expect(record?.sql).toContain('ADD COLUMN last_update');
    expect(record?.sql).not.toMatch(/ADD COLUMN latitude/i);
    expect(record?.sql).not.toMatch(/ADD COLUMN longitude/i);
    expect(record?.sql).not.toMatch(/UPDATE\s+saved_channels\s+SET\s+notes/i);

    const database = new DatabaseSync(':memory:');

    for (const migration of migrations.filter((entry) => entry.version < 13)) {
      database.exec(migration.sql);
    }

    database.prepare(
      `INSERT INTO saved_channels (
         id, name, transmit_frequency, receive_frequency, transmit_tone, transmit_tone_type,
         receive_tone, receive_tone_type, notes, created_at, updated_at, kind, latitude, longitude
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'austin',
      'W5KA',
      146_340_000,
      146_940_000,
      0,
      'CTCSS',
      0,
      'CTCSS',
      'Austin, Texas · FM AllStar EchoLink · Digital access 293',
      1,
      1,
      'repeater',
      0,
      0,
    );

    database.exec(migrations.find((migration) => migration.version === 13)!.sql);

    const cleared = database.prepare('SELECT latitude, longitude, notes FROM saved_channels WHERE id = ?').get('austin');
    expect(cleared?.latitude).toBeNull();
    expect(cleared?.longitude).toBeNull();
    expect(cleared?.notes).toBe('Austin, Texas · FM AllStar EchoLink · Digital access 293');

    database.exec(migrations.find((migration) => migration.version === 14)!.sql);

    const columns = columnNames(database, 'saved_channels');
    expect(columns.filter((name) => name === 'latitude')).toEqual(['latitude']);
    expect(columns.filter((name) => name === 'longitude')).toEqual(['longitude']);
    expect(columns).toEqual(expect.arrayContaining([
      'source_key',
      'source_format',
      'city',
      'county',
      'state',
      'country',
      'landmark',
      'modes',
      'last_update',
    ]));

    const stored = database
      .prepare(
        `SELECT notes, source_key, source_format, city, county, state, country, landmark, modes, last_update
         FROM saved_channels WHERE id = ?`,
      )
      .get('austin');

    expect(stored).toEqual({
      notes: 'Austin, Texas · FM AllStar EchoLink · Digital access 293',
      source_key: null,
      source_format: null,
      city: null,
      county: null,
      state: null,
      country: null,
      landmark: null,
      modes: null,
      last_update: null,
    });
  });

  it('adds channel pack metadata columns in migration 16', () => {
    const migration = migrations.find((entry) => entry.version === 16);
    expect(migration?.description).toBe('add_channel_pack_metadata');
    expect(migration?.sql).toContain('ADD COLUMN pack_id');
    expect(migration?.sql).toContain('ADD COLUMN pack_channel_id');

    const database = new DatabaseSync(':memory:');

    for (const entry of migrations.filter((migrationEntry) => migrationEntry.version <= 16)) {
      database.exec(entry.sql);
    }

    expect(columnNames(database, 'channel_groups')).toEqual(
      expect.arrayContaining(['pack_id', 'description', 'author', 'pack_version', 'pack_updated', 'pack_source_url']),
    );
    expect(columnNames(database, 'saved_channels')).toContain('pack_channel_id');
  });
});
