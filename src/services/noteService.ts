import { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Note, CreateNoteDTO, UpdateNoteDTO } from '../types/note';

function formatNoteError(error: any, defaultMessage: string): string {
  if (!error) return defaultMessage;
  console.warn('[NoteService Error Details]:', JSON.stringify(error, null, 2));

  const message = (error.message || '').toLowerCase();
  const details = (error.details || '').toLowerCase();

  if (message.includes('network') || message.includes('fetch') || message.includes('failed to connect')) {
    return 'Network connection issue. Please check your internet connection.';
  }
  if (message.includes('row-level security') || details.includes('row-level security') || message.includes('permission denied')) {
    return 'Permission denied by database security (RLS). Please verify your account session.';
  }
  if (message.includes('jwt expired') || message.includes('invalid claim')) {
    return 'Your session has expired. Please sign in again.';
  }

  // Return the actual PostgreSQL / Supabase message so the user gets actionable feedback
  return error.message || error.details || defaultMessage;
}

export const noteService = {
  /**
   * Fetches all notes for the authenticated user, sorted by updated_at DESC.
   */
  async getNotes(): Promise<{ data: Note[] | null; error: string | null }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let user: User | null | undefined = session?.user;

      if (!user) {
        const { data: { user: fetchedUser }, error: userError } = await supabase.auth.getUser();
        user = fetchedUser;
        if (userError || !user) {
          return { data: null, error: 'User is not authenticated.' };
        }
      }

      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) {
        return { data: null, error: formatNoteError(error, 'Failed to load notes. Please try again.') };
      }

      return { data: (data || []) as Note[], error: null };
    } catch (err) {
      return {
        data: null,
        error: formatNoteError(err, 'Failed to load notes. Please try again.'),
      };
    }
  },

  /**
   * Fetches a single note by ID for the authenticated user.
   */
  async getNote(id: string): Promise<{ data: Note | null; error: string | null }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let user: User | null | undefined = session?.user;

      if (!user) {
        const { data: { user: fetchedUser }, error: userError } = await supabase.auth.getUser();
        user = fetchedUser;
        if (userError || !user) {
          return { data: null, error: 'User is not authenticated.' };
        }
      }

      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('id', id);

      if (error) {
        return { data: null, error: formatNoteError(error, 'Note not found or unavailable.') };
      }

      if (!data || data.length === 0) {
        return { data: null, error: 'Note not found.' };
      }

      return { data: data[0] as Note, error: null };
    } catch (err) {
      return {
        data: null,
        error: formatNoteError(err, 'Failed to fetch note.'),
      };
    }
  },

  /**
   * Creates a new note. Title is required.
   */
  async createNote(dto: CreateNoteDTO): Promise<{ data: Note | null; error: string | null }> {
    const trimmedTitle = dto.title?.trim();
    if (!trimmedTitle) {
      return { data: null, error: 'Please enter a title.' };
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      let user: User | null | undefined = session?.user;

      if (!user) {
        const { data: { user: fetchedUser }, error: userError } = await supabase.auth.getUser();
        user = fetchedUser;
        if (userError || !user) {
          return { data: null, error: 'User is not authenticated. Please sign in again.' };
        }
      }

      const { data, error } = await supabase
        .from('notes')
        .insert({
          user_id: user.id,
          title: trimmedTitle,
          content: dto.content !== undefined ? dto.content : '',
        })
        .select();

      if (error) {
        return { data: null, error: formatNoteError(error, 'Unable to save note.') };
      }

      const createdNote = (data && data.length > 0) ? (data[0] as Note) : null;
      return { data: createdNote, error: null };
    } catch (err) {
      return {
        data: null,
        error: formatNoteError(err, 'Unable to save note. Please try again.'),
      };
    }
  },

  /**
   * Updates an existing note. If title is provided, it cannot be empty.
   */
  async updateNote(id: string, dto: UpdateNoteDTO): Promise<{ data: Note | null; error: string | null }> {
    const payload: Partial<Pick<Note, 'title' | 'content'>> = {};

    if (dto.title !== undefined) {
      const trimmedTitle = dto.title.trim();
      if (!trimmedTitle) {
        return { data: null, error: 'Please enter a title.' };
      }
      payload.title = trimmedTitle;
    }

    if (dto.content !== undefined) {
      payload.content = dto.content;
    }

    try {
      const { data, error } = await supabase
        .from('notes')
        .update(payload)
        .eq('id', id)
        .select();

      if (error) {
        return { data: null, error: formatNoteError(error, 'Unable to update note.') };
      }

      const updatedNote = (data && data.length > 0) ? (data[0] as Note) : null;
      return { data: updatedNote, error: null };
    } catch (err) {
      return {
        data: null,
        error: formatNoteError(err, 'Unable to update note. Please try again.'),
      };
    }
  },

  /**
   * Permanently deletes a note by ID.
   */
  async deleteNote(id: string): Promise<{ error: string | null }> {
    try {
      const { error } = await supabase.from('notes').delete().eq('id', id);

      if (error) {
        return { error: formatNoteError(error, 'Unable to delete note.') };
      }

      return { error: null };
    } catch (err) {
      return {
        error: formatNoteError(err, 'Unable to delete note. Please try again.'),
      };
    }
  },

  /**
   * Search notes matching query in title or content (case-insensitive).
   * If query is empty or only whitespace, returns all notes.
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
