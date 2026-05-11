import Database from 'better-sqlite3';
import { schemaSql } from './schema.js';
const ensureColumn = (database, table, column, definition) => {
    const rows = database.prepare(`PRAGMA table_info(${table})`).all();
    if (!rows.some((row) => row.name === column)) {
        database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
};
const runMigrations = (database) => {
    ensureColumn(database, 'personal_profile', 'subscription_account_months', 'INTEGER');
    ensureColumn(database, 'personal_profile', 'subscription_payment_count', 'INTEGER');
};
export const createDatabase = (filename) => {
    const database = new Database(filename);
    database.pragma('foreign_keys = ON');
    database.exec(schemaSql);
    runMigrations(database);
    return database;
};
