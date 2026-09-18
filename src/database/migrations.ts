import { SQLiteDatabase } from 'expo-sqlite';
import {
  CREATE_TASKS_TABLE,
  CREATE_RECURRING_TASKS_TABLE,
  CREATE_RECURRING_TASK_EXCEPTIONS_TABLE,
  CREATE_NOTES_TABLE,
  CREATE_DOCUMENTS_TABLE,
  CREATE_DOCUMENT_TEMPLATES_TABLE,
  CREATE_DOCUMENT_TEMPLATE_FIELDS_TABLE,
  CREATE_SYNC_QUEUE_TABLE,
  CREATE_SYNC_METADATA_TABLE,
} from './schema';

export const CURRENT_DB_VERSION = 1;

export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  // Enable Write-Ahead Logging (WAL) for high concurrency and performance
  await db.execAsync(`PRAGMA journal_mode = WAL;`);

  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = result?.user_version ?? 0;

  if (currentVersion >= CURRENT_DB_VERSION) {
    return;
  }

  if (currentVersion === 0) {
    await db.execAsync(`
      ${CREATE_TASKS_TABLE}
      ${CREATE_RECURRING_TASKS_TABLE}
      ${CREATE_RECURRING_TASK_EXCEPTIONS_TABLE}
      ${CREATE_NOTES_TABLE}
      ${CREATE_DOCUMENTS_TABLE}
      ${CREATE_DOCUMENT_TEMPLATES_TABLE}
      ${CREATE_DOCUMENT_TEMPLATE_FIELDS_TABLE}
      ${CREATE_SYNC_QUEUE_TABLE}
      ${CREATE_SYNC_METADATA_TABLE}
    `);
  }

  // Future schema modifications are registered here:
  // if (currentVersion === 1) {
  //   await db.execAsync(`ALTER TABLE ...`);
  // }

  await db.execAsync(`PRAGMA user_version = ${CURRENT_DB_VERSION};`);
}
