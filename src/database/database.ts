import * as SQLite from 'expo-sqlite';
import { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from './migrations';

let activeDatabase: SQLiteDatabase | null = null;
let activeUserId: string | null = null;

/**
 * Derives a sanitized database filename specific to the authenticated user.
 * Guarantees physical file separation between users on the device.
 */
function getDatabaseName(userId: string): string {
  const sanitized = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `rem_user_${sanitized}.db`;
}

/**
 * Initializes and migrates the SQLite database for the specified user.
 * Closes any previously active database connection for another user.
 */
export async function initDatabaseForUser(userId: string): Promise<SQLiteDatabase> {
  if (activeDatabase && activeUserId === userId) {
    return activeDatabase;
  }

  if (activeDatabase) {
    try {
      await activeDatabase.closeAsync();
    } catch {
      // Ignore close error on switch
    }
    activeDatabase = null;
    activeUserId = null;
  }

  const dbName = getDatabaseName(userId);
  const db = await SQLite.openDatabaseAsync(dbName);

  // Execute schema migrations safely
  await migrateDbIfNeeded(db);

  activeDatabase = db;
  activeUserId = userId;

  return db;
}

/**
 * Returns the currently active SQLite database instance.
 * Throws an error if no user database is initialized.
 */
export function getDatabase(): SQLiteDatabase {
  if (!activeDatabase) {
    throw new Error('Local SQLite database is not initialized. Please sign in.');
  }
  return activeDatabase;
}

/**
 * Returns the ID of the user whose database is currently open.
 */
export function getActiveUserId(): string | null {
  return activeUserId;
}

/**
 * Closes the active SQLite database connection (used on sign out).
 */
export async function closeDatabase(): Promise<void> {
  if (activeDatabase) {
    try {
      await activeDatabase.closeAsync();
    } catch {
      // Ignore close error
    }
    activeDatabase = null;
    activeUserId = null;
  }
}

/**
 * Helper to execute operations atomically inside a database transaction.
 * Automatically rolls back if an error occurs.
 */
export async function withTransaction<T>(
  callback: (db: SQLiteDatabase) => Promise<T>
): Promise<T> {
  const db = getDatabase();
  let result: T;

  await db.withTransactionAsync(async () => {
    result = await callback(db);
  });

  return result!;
}
