# Phase 8 Technical Specification: Offline-First Local Persistence & Supabase Synchronization

**Application:** REM (Personal Memory System)  
**Platform:** React Native / Expo SDK 57 (Android Target) / TypeScript / Supabase  
**Author:** Antigravity AI  
**Date:** 2026-09-18  

---

## 1. Overview & Architecture

REM transitions from a cloud-direct architecture to a local-first architecture where the device's local SQLite database is the primary source of truth for all screens and interactions. All mutations (create, edit, delete, complete) are applied immediately to SQLite within an atomic transaction alongside a record in a local `sync_queue`. Supabase functions as the asynchronous cloud synchronization and multi-device backup layer.

```text
                     REM Android UI
                           │
                           ▼
                 Local Domain Services
              (Tasks, Notes, Documents, Templates)
                           │
                           ▼
                  Local SQLite Database
               (rem_user_<userId>.db)
                           │
                    Offline Mutations
                           │
                           ▼
                      Sync Queue
                           │
                      Sync Manager
             (Push, Pull, Conflict, Retry)
                           │
                     Network Layer
                 (@react-native-community/netinfo)
                           │
                           ▼
                   Supabase Cloud (PostgreSQL)
                           │
                    Tombstones Table
                (Automatic DELETE tracking)
```

---

## 2. Core Subsystems

### 2.1 Local SQLite Database (`expo-sqlite`)
*   **Engine:** `expo-sqlite` (modern async API with `openDatabaseAsync` and `withTransactionAsync`).
*   **Isolation Strategy:** Databases are partitioned per user (`rem_user_${userId}.db`). When User A logs out and User B logs in, User B attaches to `rem_user_${userBId}.db`. User A's un-synced data is preserved on disk but never loaded into memory or rendered to User B.
*   **Versioned Migrations:** SQLite versioning is managed via `PRAGMA user_version`. Schema changes apply sequentially without dropping tables or destroying local data.

### 2.2 Local Tables & Schemas
1.  **`tasks`**: `id`, `user_id`, `recurring_task_id`, `title`, `description`, `task_date`, `task_time`, `completed`, `created_at`, `updated_at`.
2.  **`recurring_tasks`**: `id`, `user_id`, `title`, `description`, `frequency`, `week_day`, `week_days`, `task_time`, `start_date`, `active`, `created_at`, `updated_at`.
3.  **`recurring_task_exceptions`**: `id`, `recurring_task_id`, `user_id`, `occurrence_date`, `created_at`.
4.  **`notes`**: `id`, `user_id`, `title`, `content`, `created_at`, `updated_at`.
5.  **`documents`**: `id`, `user_id`, `document_type`, `template_id`, `document_data` (JSON string), `created_at`, `updated_at`.
6.  **`document_templates`**: `id`, `user_id`, `name`, `description`, `is_system_template`, `created_at`, `updated_at`.
7.  **`document_template_fields`**: `id`, `template_id`, `user_id`, `field_key`, `field_label`, `field_type`, `required`, `sensitive`, `mask_enabled`, `display_order`, `created_at`, `updated_at`.
8.  **`sync_queue`**: `id`, `user_id`, `entity_type`, `entity_id`, `operation`, `payload` (JSON string), `created_at`, `retry_count`, `last_error`.
9.  **`sync_metadata`**: `key` (PRIMARY KEY), `value`.

### 2.3 Atomic Local Mutation Pattern
Every write operation uses `db.withTransactionAsync`:
```typescript
await db.withTransactionAsync(async () => {
  // 1. Mutate local table
  await db.runAsync('INSERT INTO ...');
  // 2. Insert into sync_queue
  await db.runAsync('INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count) VALUES (...)');
});
```
If either step fails, the transaction is rolled back, guaranteeing that local state and synchronization queue never diverge.

### 2.4 Cloud Tombstone Architecture (`public.tombstones`)
To support cross-device deletion synchronization without mutating existing tables or altering unique constraints:
*   A new table `public.tombstones` is added to Supabase:
    ```sql
    CREATE TABLE IF NOT EXISTS public.tombstones (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id UUID NOT NULL,
      deleted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
    );
    ```
*   `AFTER DELETE` triggers on `tasks`, `notes`, `documents`, `document_templates`, and `recurring_tasks` automatically log the deletion.
*   Device pulls fetch tombstones since `last_pulled_at` and remove deleted entities from SQLite.

### 2.5 Conflict Resolution: Last-Write-Wins
*   Both local and remote records maintain `updated_at` timestamps.
*   On synchronization:
    *   If remote `updated_at` > local `updated_at`, remote wins.
    *   If local `updated_at` > remote `updated_at`, local changes are pushed.
    *   An older local change will never overwrite a newer remote record.

### 2.6 Retry Strategy & Backoff
*   On network failure, items remain in `sync_queue`.
*   Retry delay is calculated using exponential backoff:
    *   Attempt 1: 30 seconds
    *   Attempt 2: 1 minute
    *   Attempt 3: 2 minutes
    *   Subsequent: progressive backoff capped at 15 minutes.
*   Permanent validation errors (e.g. 400 Bad Request) are logged safely and unqueued to avoid infinite loops.

---

## 3. Security & Privacy Constraints

1.  **No Plaintext AsyncStorage for Sensitive Records:** Document Vault data (Aadhaar, PAN, DL, custom fields) and Private Notes are stored solely in SQLite.
2.  **No Auth/Cloud Credentials in SQLite:** User passwords, email passwords, and service-role keys are never stored in SQLite. Session tokens remain secured in `expo-secure-store`.
3.  **Zero Sensitive Logging:** `console.log` statements are sanitized to log only metadata (e.g., `Queue length: 3`, `Entity: task`, `Op: update`). Payload content, document numbers, and note contents are never logged.
4.  **Local Database Security Posture:** SQLite is not claimed to be encrypted at rest in Phase 8; this limitation is acknowledged for future encryption hardening.
