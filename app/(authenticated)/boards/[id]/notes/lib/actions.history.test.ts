import {
  Board,
  ChangeComment,
  Note,
  NoteChange,
  Share,
  User,
} from '@/prisma/generated/client';
import { prismaMock } from '@/prisma/singleton';
import { decryptField, encryptField } from '@/utils/encryption';
import { randomBytes } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addChangeComment,
  clearNoteHistory,
  deleteChangeComment,
  deleteNoteChange,
  getEditShareForNote,
  getNoteChanges,
  getNoteForRecipient,
  restoreToVersion,
  setUserNotesSort,
  updateNote,
} from './actions';

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getCurrentSessionKey: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/app/login/lib/actions', () => ({
  getCurrentSession: mocks.getCurrentSession,
}));

vi.mock('@/app/(authenticated)/lib/encryptionKey', () => ({
  getCurrentSessionKey: mocks.getCurrentSessionKey,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

type ChangeWithNote = NoteChange & { note: Note };
type ChangeWithBoardsId = NoteChange & { note: { boardsId: number } };
type CommentWithChange = ChangeComment & { change: ChangeWithNote };

describe('Note sorting and sharing actions', () => {
  const user = { id: 1 };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({ user });
  });

  it('persists the user notes sort preference', async () => {
    prismaMock.user.update.mockResolvedValue({} as User);

    await setUserNotesSort('title_asc');

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { sortNotesBy: 'title_asc' },
    });
  });

  it('does not persist sort preference without a user', async () => {
    mocks.getCurrentSession.mockResolvedValue({ user: null });

    await setUserNotesSort('title_asc');

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('returns the edit share id for a note shared with the user', async () => {
    prismaMock.share.findFirst.mockResolvedValue({ id: 'share-1' } as Share);

    const result = await getEditShareForNote(1);

    expect(result).toEqual({ shareId: 'share-1' });
  });

  it('returns null when the note has no edit share', async () => {
    prismaMock.share.findFirst.mockResolvedValue(null);

    const result = await getEditShareForNote(1);

    expect(result).toBeNull();
  });

  it('returns null edit share without a user', async () => {
    mocks.getCurrentSession.mockResolvedValue({ user: null });

    const result = await getEditShareForNote(1);

    expect(result).toBeNull();
  });

  it('returns the note with snapshot data for a recipient', async () => {
    const snapshot = JSON.stringify({ title: 'Snap title', content: 'Snap content' });
    prismaMock.share.findFirst.mockResolvedValue({ snapshot } as Share);
    prismaMock.note.findUnique.mockResolvedValue({
      id: 1,
      title: 'Encrypted title',
      content: 'Encrypted content',
    } as Note);

    const result = await getNoteForRecipient(1);

    expect(result).toMatchObject({
      id: 1,
      title: 'Snap title',
      content: 'Snap content',
    });
  });

  it('returns the raw note when the snapshot is invalid JSON', async () => {
    prismaMock.share.findFirst.mockResolvedValue({ snapshot: '{invalid' } as Share);
    prismaMock.note.findUnique.mockResolvedValue({
      id: 1,
      title: 'Raw title',
    } as Note);

    const result = await getNoteForRecipient(1);

    expect(result).toMatchObject({ id: 1, title: 'Raw title' });
  });

  it('returns null for a recipient without a share', async () => {
    prismaMock.share.findFirst.mockResolvedValue(null);

    const result = await getNoteForRecipient(1);

    expect(result).toBeNull();
  });

  it('returns null for a recipient when the note no longer exists', async () => {
    prismaMock.share.findFirst.mockResolvedValue({ snapshot: null } as Share);
    prismaMock.note.findUnique.mockResolvedValue(null);

    const result = await getNoteForRecipient(1);

    expect(result).toBeNull();
  });

  it('allows a recipient with an edit share to update a note', async () => {
    const note: Partial<Note> = { id: 1, title: 'Title', content: 'New content' };
    // Not the owner, but has an edit share with a plaintext snapshot
    prismaMock.note.findFirst.mockResolvedValue(null);
    prismaMock.share.findFirst.mockResolvedValue({
      id: 'share-1',
      snapshot: JSON.stringify({ content: 'Old content' }),
    } as Share);
    prismaMock.note.findUnique.mockResolvedValue({
      id: 1,
      content: 'Old content',
    } as Note);
    prismaMock.note.update.mockResolvedValue(note as Note);
    prismaMock.noteChange.create.mockResolvedValue({} as NoteChange);
    prismaMock.share.update.mockResolvedValue({} as Share);

    const result = await updateNote(note as Note);

    expect(result).toEqual(note);
    expect(prismaMock.noteChange.create).toHaveBeenCalled();
    expect(prismaMock.share.update).toHaveBeenCalledWith({
      where: { id: 'share-1' },
      data: {
        snapshot: JSON.stringify({ content: 'New content', title: 'Title' }),
        snapshotUpdatedAt: expect.any(Date),
      },
    });
  });

  it('rejects updates from users without ownership or edit share', async () => {
    prismaMock.note.findFirst.mockResolvedValue(null);
    prismaMock.share.findFirst.mockResolvedValue(null);

    const result = await updateNote({ id: 1, content: 'New' } as Note);

    expect(result).toBeNull();
    expect(prismaMock.note.update).not.toHaveBeenCalled();
  });

  it('tracks a change when the owner updates note content', async () => {
    const note: Partial<Note> = { id: 1, content: 'New content', boardsId: 2 };
    prismaMock.note.findFirst.mockResolvedValue({ id: 1 } as Note);
    prismaMock.note.findUnique.mockResolvedValue({
      id: 1,
      content: 'Old content',
    } as Note);
    prismaMock.note.update.mockResolvedValue(note as Note);
    prismaMock.noteChange.create.mockResolvedValue({} as NoteChange);
    prismaMock.share.findFirst.mockResolvedValueOnce(null);

    await updateNote(note as Note);

    expect(prismaMock.noteChange.create).toHaveBeenCalledWith({
      data: {
        noteId: 1,
        userId: user.id,
        diffPatch: expect.any(String),
        previousContent: 'Old content',
      },
    });
  });
});

describe('Note change history actions', () => {
  const user = { id: 1 };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({ user });
  });

  const givenNoteAccess = () => {
    prismaMock.note.findUnique.mockResolvedValue({ id: 1, boardsId: 2 } as Note);
    prismaMock.board.findFirst.mockResolvedValue({ id: 2 } as Board);
  };

  it('returns the changes for an accessible note', async () => {
    givenNoteAccess();
    const changes = [{ id: 10, noteId: 1 }] as NoteChange[];
    prismaMock.noteChange.findMany.mockResolvedValue(changes);

    const result = await getNoteChanges(1);

    expect(result).toEqual(changes);
    expect(prismaMock.noteChange.findMany).toHaveBeenCalledWith({
      where: { noteId: 1 },
      include: { user: true, comments: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns no changes without a user', async () => {
    mocks.getCurrentSession.mockResolvedValue({ user: null });

    const result = await getNoteChanges(1);

    expect(result).toEqual([]);
  });

  it('returns no changes when the note is not accessible', async () => {
    prismaMock.note.findUnique.mockResolvedValue(null);

    const result = await getNoteChanges(1);

    expect(result).toEqual([]);
  });

  it('deletes a change owned by the user', async () => {
    prismaMock.noteChange.findUnique.mockResolvedValue({
      id: 10,
      noteId: 1,
      note: { id: 1 },
    } as ChangeWithNote);
    prismaMock.note.findFirst.mockResolvedValue({ id: 1, boardsId: 2 } as Note);
    prismaMock.noteChange.delete.mockResolvedValue({} as NoteChange);

    const result = await deleteNoteChange(10);

    expect(result).toBe(true);
    expect(prismaMock.noteChange.delete).toHaveBeenCalledWith({
      where: { id: 10 },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/boards/2/notes/1');
  });

  it('does not delete a missing change', async () => {
    prismaMock.noteChange.findUnique.mockResolvedValue(null);

    const result = await deleteNoteChange(10);

    expect(result).toBe(false);
    expect(prismaMock.noteChange.delete).not.toHaveBeenCalled();
  });

  it('does not delete a change from a note the user cannot access', async () => {
    prismaMock.noteChange.findUnique.mockResolvedValue({
      id: 10,
      noteId: 1,
      note: { id: 1 },
    } as ChangeWithNote);
    prismaMock.note.findFirst.mockResolvedValue(null);

    const result = await deleteNoteChange(10);

    expect(result).toBe(false);
    expect(prismaMock.noteChange.delete).not.toHaveBeenCalled();
  });

  it('clears the history of an owned note', async () => {
    prismaMock.note.findFirst.mockResolvedValue({ id: 1, boardsId: 2 } as Note);
    prismaMock.noteChange.deleteMany.mockResolvedValue({ count: 3 });

    const result = await clearNoteHistory(1);

    expect(result).toBe(true);
    expect(prismaMock.noteChange.deleteMany).toHaveBeenCalledWith({
      where: { noteId: 1 },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/boards/2/notes/1');
  });

  it('does not clear history of an inaccessible note', async () => {
    prismaMock.note.findFirst.mockResolvedValue(null);

    const result = await clearNoteHistory(1);

    expect(result).toBe(false);
    expect(prismaMock.noteChange.deleteMany).not.toHaveBeenCalled();
  });

  it('restores a note to a previous version', async () => {
    prismaMock.note.findUnique.mockResolvedValue({
      id: 1,
      boardsId: 2,
      content: 'Current content',
    } as Note);
    prismaMock.board.findFirst.mockResolvedValue({ id: 2 } as Board);
    prismaMock.noteChange.findUnique.mockResolvedValue({
      id: 10,
      noteId: 1,
      previousContent: 'Old content',
    } as NoteChange);
    prismaMock.noteChange.create.mockResolvedValue({} as NoteChange);
    prismaMock.note.update.mockResolvedValue({} as Note);

    const result = await restoreToVersion(1, 10);

    expect(result).toEqual({ success: true });
    expect(prismaMock.noteChange.create).toHaveBeenCalledWith({
      data: {
        noteId: 1,
        userId: user.id,
        diffPatch: expect.any(String),
        previousContent: 'Current content',
      },
    });
    expect(prismaMock.note.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { content: 'Old content' },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/boards/2/notes/1');
  });

  it('does nothing when restoring to an identical version', async () => {
    prismaMock.note.findUnique.mockResolvedValue({
      id: 1,
      boardsId: 2,
      content: 'Same content',
    } as Note);
    prismaMock.board.findFirst.mockResolvedValue({ id: 2 } as Board);
    prismaMock.noteChange.findUnique.mockResolvedValue({
      id: 10,
      noteId: 1,
      previousContent: 'Same content',
    } as NoteChange);

    const result = await restoreToVersion(1, 10);

    expect(result).toEqual({ success: true });
    expect(prismaMock.note.update).not.toHaveBeenCalled();
  });

  it('fails to restore when the change belongs to another note', async () => {
    prismaMock.note.findUnique.mockResolvedValue({ id: 1, boardsId: 2 } as Note);
    prismaMock.board.findFirst.mockResolvedValue({ id: 2 } as Board);
    prismaMock.noteChange.findUnique.mockResolvedValue({
      id: 10,
      noteId: 99,
    } as NoteChange);

    const result = await restoreToVersion(1, 10);

    expect(result).toEqual({ success: false, error: 'Change not found' });
  });

  it('fails to restore without a user', async () => {
    mocks.getCurrentSession.mockResolvedValue({ user: null });

    const result = await restoreToVersion(1, 10);

    expect(result).toEqual({ success: false, error: 'User not authenticated' });
  });

  it('fails to restore an inaccessible note', async () => {
    prismaMock.note.findUnique.mockResolvedValue(null);

    const result = await restoreToVersion(1, 10);

    expect(result).toEqual({ success: false, error: 'Note not found' });
  });

  it('adds a comment to an accessible change', async () => {
    prismaMock.noteChange.findUnique.mockResolvedValue({
      id: 10,
      noteId: 1,
      note: { boardsId: 2 },
    } as ChangeWithBoardsId);
    givenNoteAccess();
    const comment = { id: 5, changeId: 10, content: 'A comment' } as ChangeComment;
    prismaMock.changeComment.create.mockResolvedValue(comment);

    const result = await addChangeComment(10, 'A comment');

    expect(result).toEqual(comment);
    expect(prismaMock.changeComment.create).toHaveBeenCalledWith({
      data: { changeId: 10, userId: user.id, content: 'A comment' },
      include: { user: true },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/boards/2/notes/1');
  });

  it('does not add a comment to a missing change', async () => {
    prismaMock.noteChange.findUnique.mockResolvedValue(null);

    const result = await addChangeComment(10, 'A comment');

    expect(result).toBeNull();
    expect(prismaMock.changeComment.create).not.toHaveBeenCalled();
  });

  it('deletes a comment owned by the user', async () => {
    prismaMock.changeComment.findUnique.mockResolvedValue({
      id: 5,
      userId: user.id,
      change: { noteId: 1, note: { boardsId: 2 } },
    } as CommentWithChange);
    prismaMock.changeComment.delete.mockResolvedValue({} as ChangeComment);

    const result = await deleteChangeComment(5);

    expect(result).toBe(true);
    expect(prismaMock.changeComment.delete).toHaveBeenCalledWith({
      where: { id: 5 },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/boards/2/notes/1');
  });

  it('does not delete comments from other users', async () => {
    prismaMock.changeComment.findUnique.mockResolvedValue({
      id: 5,
      userId: 99,
      change: { noteId: 1, note: { boardsId: 2 } },
    } as CommentWithChange);

    const result = await deleteChangeComment(5);

    expect(result).toBe(false);
    expect(prismaMock.changeComment.delete).not.toHaveBeenCalled();
  });

  it('does not delete a missing comment', async () => {
    prismaMock.changeComment.findUnique.mockResolvedValue(null);

    const result = await deleteChangeComment(5);

    expect(result).toBe(false);
  });
});

describe('Encrypted note history', () => {
  const key = randomBytes(32);
  const user = { id: 1, encryptionEnabled: true };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({ user });
    mocks.getCurrentSessionKey.mockResolvedValue(key);
  });

  it('stores an encrypted diff patch and previous content on owner edits', async () => {
    const note: Partial<Note> = { id: 1, title: 'T', content: 'New content', boardsId: 2 };
    prismaMock.note.findFirst.mockResolvedValue({ id: 1 } as Note);
    prismaMock.note.findUnique.mockResolvedValue({
      id: 1,
      content: encryptField('Old content', key),
    } as Note);
    prismaMock.note.update.mockResolvedValue(note as Note);
    prismaMock.noteChange.create.mockResolvedValue({} as NoteChange);
    prismaMock.share.findFirst.mockResolvedValue(null);

    await updateNote(note as Note);

    const { data } = prismaMock.noteChange.create.mock.calls[0][0] as {
      data: { diffPatch: string; previousContent: string };
    };
    expect(data.diffPatch.startsWith('enc:')).toBe(true);
    expect(decryptField(data.previousContent, key)).toBe('Old content');
  });

  it('decrypts history entries and comments for the owner', async () => {
    prismaMock.note.findUnique.mockResolvedValue({ id: 1, boardsId: 2 } as Note);
    prismaMock.board.findFirst.mockResolvedValue({ id: 2 } as Board);
    prismaMock.noteChange.findMany.mockResolvedValue([
      {
        id: 10,
        noteId: 1,
        diffPatch: encryptField('patch', key),
        previousContent: encryptField('previous', key),
        comments: [
          { id: 5, content: encryptField('a comment', key) },
          { id: 6, content: 'plaintext comment from a recipient' },
        ],
      } as never,
    ]);

    const result = await getNoteChanges(1);

    expect(result[0].diffPatch).toBe('patch');
    expect(result[0].previousContent).toBe('previous');
    expect(result[0].comments[0].content).toBe('a comment');
    expect(result[0].comments[1].content).toBe('plaintext comment from a recipient');
  });

  it('encrypts comments added by the note owner and returns plaintext', async () => {
    prismaMock.noteChange.findUnique.mockResolvedValue({
      id: 10,
      noteId: 1,
      note: { boardsId: 2 },
    } as ChangeWithBoardsId);
    prismaMock.note.findUnique.mockResolvedValue({ id: 1, boardsId: 2 } as Note);
    prismaMock.board.findFirst.mockResolvedValue({ id: 2 } as Board);
    prismaMock.note.findFirst.mockResolvedValue({ id: 1 } as Note);
    prismaMock.changeComment.create.mockResolvedValue({
      id: 5,
      content: 'stored',
    } as ChangeComment);

    const result = await addChangeComment(10, 'secret comment');

    const { data } = prismaMock.changeComment.create.mock.calls[0][0] as {
      data: { content: string };
    };
    expect(decryptField(data.content, key)).toBe('secret comment');
    expect(result?.content).toBe('secret comment');
  });

  it('stores plaintext comments when a recipient comments on a shared note', async () => {
    prismaMock.noteChange.findUnique.mockResolvedValue({
      id: 10,
      noteId: 1,
      note: { boardsId: 2 },
    } as ChangeWithBoardsId);
    // Not the owner: access comes from an edit share
    prismaMock.note.findUnique.mockResolvedValue({ id: 1, boardsId: 2 } as Note);
    prismaMock.board.findFirst.mockResolvedValue(null);
    prismaMock.share.findFirst.mockResolvedValue({ id: 'share-1' } as Share);
    prismaMock.note.findFirst.mockResolvedValue(null);
    prismaMock.changeComment.create.mockResolvedValue({
      id: 5,
      content: 'a recipient comment',
    } as ChangeComment);

    await addChangeComment(10, 'a recipient comment');

    expect(prismaMock.changeComment.create).toHaveBeenCalledWith({
      data: { changeId: 10, userId: user.id, content: 'a recipient comment' },
      include: { user: true },
    });
  });

  it('encrypts the restore history entry for the owner', async () => {
    prismaMock.note.findUnique.mockResolvedValue({
      id: 1,
      boardsId: 2,
      content: encryptField('Current content', key),
    } as Note);
    prismaMock.board.findFirst.mockResolvedValue({ id: 2 } as Board);
    prismaMock.noteChange.findUnique.mockResolvedValue({
      id: 10,
      noteId: 1,
      previousContent: encryptField('Old content', key),
    } as NoteChange);
    prismaMock.noteChange.create.mockResolvedValue({} as NoteChange);
    prismaMock.note.update.mockResolvedValue({} as Note);

    const result = await restoreToVersion(1, 10);

    expect(result).toEqual({ success: true });
    const { data } = prismaMock.noteChange.create.mock.calls[0][0] as {
      data: { diffPatch: string; previousContent: string };
    };
    expect(data.diffPatch.startsWith('enc:')).toBe(true);
    expect(decryptField(data.previousContent, key)).toBe('Current content');

    const updateCall = prismaMock.note.update.mock.calls[0][0] as {
      data: { content: string };
    };
    expect(decryptField(updateCall.data.content, key)).toBe('Old content');
  });
});
