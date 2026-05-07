import Database from 'better-sqlite3';
import { schemaSql } from './schema.js';
export const createDatabase = (filename) => {
    const database = new Database(filename);
    database.pragma('foreign_keys = ON');
    database.exec(schemaSql);
    return database;
};
