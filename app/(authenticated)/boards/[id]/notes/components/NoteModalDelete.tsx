'use client';

import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import { Note } from '@/prisma/generated/client';
import { deleteNote } from '../lib/actions';

type NoteModalDeleteType = {
  note: Note;
};

export default function NoteModalDelete({ note }: NoteModalDeleteType) {
  return (
    <ConfirmDeleteModal
      namespace="NoteDelete"
      entityTitle={note.title}
      onDelete={() => deleteNote(note)}
    />
  );
}
