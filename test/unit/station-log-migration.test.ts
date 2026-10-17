import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { readSqlMigrations } from './saved-channels-migration.test.ts';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): {
      all: (...args: unknown[]) => Array<Record<string, unknown>>;
    };
  };
};

function columnNames(database: InstanceType<typeof DatabaseSync>, table: string): string[] {
  return database
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => String(row.name));
}

describe('station log migrations', () => {
  const source = readFileSync(new URL('../../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const migrations = readSqlMigrations(source);

  it('adds nullable coordinate columns on station_log_qsos in migration 15', () => {
    const migration = migrations.find((entry) => entry.version === 15);

    expect(migration?.description).toBe('add_station_log_qso_coordinates');
    expect(migration?.sql).toContain('ADD COLUMN latitude REAL');
    expect(migration?.sql).toContain('ADD COLUMN longitude REAL');
    expect(migration?.sql).toContain('ADD COLUMN my_latitude REAL');
    expect(migration?.sql).toContain('ADD COLUMN my_longitude REAL');

    const database = new DatabaseSync(':memory:');

    for (const entry of migrations.filter((migrationEntry) => migrationEntry.version <= 15)) {
      database.exec(entry.sql);
    }

    const columns = columnNames(database, 'station_log_qsos');

    expect(columns).toEqual(
      expect.arrayContaining(['latitude', 'longitude', 'my_latitude', 'my_longitude']),
    );
  });
});
