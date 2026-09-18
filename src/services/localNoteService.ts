import { getDatabase, withTransaction, getActiveUserId } from '../database/database';
import { Note, CreateNoteDTO, UpdateNoteDTO } from '../types/note';
import { generateUUID } from '../utils/uuid';
import { syncService } from './syncService';

export const localNoteService = {
  /**
   * Retrieves all notes for the active user, sorted by updated_at DESC.
   */
  async getNotes(): Promise<{ data: Note[]; error: string | null }> {
    try {
      const db = getDatabase();
      const userId = getActiveUserId();
      if (!userId) {
        return { data: [], error: 'User is not authenticated.' };
      }

      const rows = await db.getAllAsync<any>(
        'SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC',
        [userId]
      );

      const notes: Note[] = rows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        title: r.title,
        content: r.content || '',
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));

      return { data: notes, error: null };
    } catch (err: any) {
      return { data: [], error: err?.message || 'Failed to load local notes.' };
    }
  },

  /**
   * Retrieves a single note by ID.
   */
  async getNote(id: string): Promise<{ data: Note | null; error: string | null }> {
    try {
      const db = getDatabase();
      const row = await db.getFirstAsync<any>('SELECT * FROM notes WHERE id = ?', [id]);
      if (!row) {
        return { data: null, error: 'Note not found.' };
      }

      const note: Note = {
        id: row.id,
        user_id: row.user_id,
        title: row.title,
        content: row.content || '',
        created_at: row.created_at,
        updated_at: row.updated_at,
      };

      return { data: note, error: null };
    } catch (err: any) {
      return { data: null, error: err?.message || 'Failed to fetch note.' };
    }
  },

  /**
   * Atomically saves a new note in SQLite and enqueues create operation.
   */
  async createNote(dto: CreateNoteDTO): Promise<{ data: Note | null; error: string | null }> {
    const trimmedTitle = dto.title?.trim();
    if (!trimmedTitle) {
      return { data: null, error: 'Please enter a title.' };
    }

    try {
      const userId = getActiveUserId();
      if (!userId) {
        return { data: null, error: 'User is not authenticated.' };
      }

      const id = generateUUID();
      const now = new Date().toISOString();
      const newNote: Note = {
        id,
        user_id: userId,
        title: trimmedTitle,
        content: dto.content !== undefined ? dto.content : '',
        created_at: now,
        updated_at: now,
      };

      await withTransaction(async (db) => {
        // 1. Insert into local SQLite
        await db.runAsync(
          'INSERT INTO notes (id, user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [newNote.id, newNote.user_id, newNote.title, newNote.content, newNote.created_at, newNote.updated_at]
        );

        // 2. Enqueue create operation
        await db.runAsync(
          `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
           VALUES (?, ?, 'note', ?, 'create', ?, ?, 0)`,
          [generateUUID(), userId, newNote.id, JSON.stringify(newNote), now]
        );
      });

      // 3. Trigger cloud sync
      syncService.syncNow().catch(() => {});

      return { data: newNote, error: null };
    } catch (err: any) {
      return { data: null, error: err?.message || 'Failed to create note.' };
    }
  },

  /**
   * Atomically updates an existing note in SQLite and enqueues update operation.
   */
  async updateNote(id: string, dto: UpdateNoteDTO): Promise<{ data: Note | null; error: string | null }> {
    try {
      const db = getDatabase();
      const existing = await db.getFirstAsync<any>('SELECT * FROM notes WHERE id = ?', [id]);
      if (!existing) {
        return { data: null, error: 'Note not found.' };
      }

      let title = existing.title;
      if (dto.title !== undefined) {
        const trimmed = dto.title.trim();
        if (!trimmed) {
          return { data: null, error: 'Please enter a title.' };
        }
        title = trimmed;
      }

      const content = dto.content !== undefined ? dto.content : existing.content;
      const now = new Date().toISOString();

      const updatedNote: Note = {
        id: existing.id,
        user_id: existing.user_id,
        title,
        content,
        created_at: existing.created_at,
        updated_at: now,
      };

      await withTransaction(async (tx) => {
        // 1. Update SQLite
        await tx.runAsync(
          'UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?',
          [updatedNote.title, updatedNote.content, updatedNote.updated_at, id]
        );

        // 2. Enqueue or update pending queue
        const pendingCreate = await tx.getFirstAsync<any>(
          `SELECT id FROM sync_queue WHERE entity_id = ? AND operation = 'create'`,
          [id]
        );

        if (pendingCreate) {
          await tx.runAsync('UPDATE sync_queue SET payload = ? WHERE id = ?', [
            JSON.stringify(updatedNote),
            pendingCreate.id,
          ]);
        } else {
          await tx.runAsync(
            `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
             VALUES (?, ?, 'note', ?, 'update', ?, ?, 0)`,
            [generateUUID(), updatedNote.user_id, id, JSON.stringify(updatedNote), now]
          );
        }
      });

      syncService.syncNow().catch(() => {});
      return { data: updatedNote, error: null };
    } catch (err: any) {
      return { data: null, error: err?.message || 'Failed to update note.' };
    }
  },

  /**
   * Atomically deletes a note from SQLite and enqueues delete operation.
   */
  async deleteNote(id: string): Promise<{ error: string | null }> {
    try {
      const db = getDatabase();
      const existing = await db.getFirstAsync<any>('SELECT * FROM notes WHERE id = ?', [id]);
      if (!existing) {
        return { error: null };
      }

      const userId = existing.user_id;
      const now = new Date().toISOString();

      await withTransaction(async (tx) => {
        // 1. Remove from SQLite
        await tx.runAsync('DELETE FROM notes WHERE id = ?', [id]);

        // 2. Handle sync queue
        const pendingCreate = await tx.getFirstAsync<any>(
          `SELECT id FROM sync_queue WHERE entity_id = ? AND operation = 'create'`,
          [id]
        );

        if (pendingCreate) {
          await tx.runAsync('DELETE FROM sync_queue WHERE entity_id = ?', [id]);
        } else {
          await tx.runAsync(`DELETE FROM sync_queue WHERE entity_id = ? AND operation = 'update'`, [id]);
          await tx.runAsync(
            `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
             VALUES (?, ?, 'note', ?, 'delete', NULL, ?, 0)`,
            [generateUUID(), userId, id, now]
          );
        }
      });

      syncService.syncNow().catch(() => {});
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Failed to delete note.' };
    }
  },

  /**
   * Search notes matching query in title or content.
   */
  searchNotes(query: string, notes: Note[]): Note[] {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return notes;
    }

    return notes.filter((note) => {
      const titleMatch = (note.title || '').toLowerCase().includes(trimmed);
      const contentMatch = (note.content || '').toLowerCase().includes(trimmed);
      return titleMatch || contentMatch;
    });
  },
};
