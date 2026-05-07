import Database from 'better-sqlite3';

import { schemaSql } from './schema.js';

export type SqliteDatabase = Database.Database;

export const createDatabase = (filename: string): SqliteDatabase => {
  const database = new Database(filename);
  database.pragma('foreign_keys = ON');
  database.exec(schemaSql);
  return database;
};
