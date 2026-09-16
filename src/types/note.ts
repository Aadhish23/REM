export interface Note {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CreateNoteDTO {
  title: string;
  content?: string;
}

export interface UpdateNoteDTO {
  title?: string;
  content?: string;
}

export type NotesStackParamList = {
  NotesList: undefined;
  NoteView: { noteId: string };
  NoteEditor: { noteId?: string };
};
