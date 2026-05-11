import Database from 'better-sqlite3';

import { schemaSql } from './schema.js';

export type SqliteDatabase = Database.Database;

const ensureColumn = (database: SqliteDatabase, table: string, column: string, definition: string): void => {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

const runMigrations = (database: SqliteDatabase): void => {
  ensureColumn(database, 'personal_profile', 'subscription_account_months', 'INTEGER');
  ensureColumn(database, 'personal_profile', 'subscription_payment_count', 'INTEGER');
};

export const createDatabase = (filename: string): SqliteDatabase => {
  const database = new Database(filename);
  database.pragma('foreign_keys = ON');
  database.exec(schemaSql);
  runMigrations(database);
  return database;
};
