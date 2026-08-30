import { Attachment, Board, Note } from '@/prisma/generated/client';
import { prismaMock } from '@/prisma/singleton';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteAttachment, getAttachments, saveAttachment } from './actions';

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  saveAndGetImageFile: vi.fn(),
  removeFile: vi.fn(),
  generateFileFromBase64: vi.fn(),
}));

vi.mock('@/app/login/lib/actions', () => ({
  getCurrentSession: mocks.getCurrentSession,
}));

vi.mock('@/utils/file', () => ({
  saveAndGetImageFile: mocks.saveAndGetImageFile,
}));

vi.mock('@/utils/storage', () => ({
  removeFile: mocks.removeFile,
  generateFileFromBase64: mocks.generateFileFromBase64,
}));

const PDF_DATA_URL = 'data:application/pdf;base64,QUJD';

function grantOwnerAccess(noteId = 1) {
  prismaMock.note.findUnique.mockResolvedValue({ id: noteId, boardsId: 1 } as Note);
  prismaMock.board.findFirst.mockResolvedValue({ id: 1 } as Board);
}

describe('Attachment actions', () => {
  const user = { id: 1 };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({ user });
    mocks.generateFileFromBase64.mockReturnValue({ contentLength: 10 });
    mocks.saveAndGetImageFile.mockResolvedValue('files/report.pdf');
  });

  describe('saveAttachment', () => {
    it('saves an allowed file and creates the attachment row', async () => {
      grantOwnerAccess();
      const attachment = { id: 5, fileName: 'report.pdf' } as Attachment;
      prismaMock.attachment.create.mockResolvedValue(attachment);

      const result = await saveAttachment({
        noteId: 1,
        fileName: 'report.pdf',
        fileDataUrl: PDF_DATA_URL,
      });

      expect(result).toEqual({ success: true, attachment });
      expect(prismaMock.attachment.create).toHaveBeenCalledWith({
        data: {
          notesId: 1,
          fileUrl: 'files/report.pdf',
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          size: 10,
        },
      });
    });

    it('rejects when not authenticated', async () => {
      mocks.getCurrentSession.mockResolvedValue({ user: null });

      const result = await saveAttachment({
        noteId: 1,
        fileName: 'report.pdf',
        fileDataUrl: PDF_DATA_URL,
      });

      expect(result).toEqual({ success: false, error: 'Not authenticated' });
    });

    it('rejects a non-base64 payload', async () => {
      const result = await saveAttachment({
        noteId: 1,
        fileName: 'report.pdf',
        fileDataUrl: 'https://example.com/report.pdf',
      });

      expect(result.success).toBe(false);
      expect(prismaMock.attachment.create).not.toHaveBeenCalled();
    });

    it('rejects a disallowed extension', async () => {
      const result = await saveAttachment({
        noteId: 1,
        fileName: 'evil.exe',
        fileDataUrl: 'data:application/octet-stream;base64,QUJD',
      });

      expect(result).toEqual({
        success: false,
        error: 'File extension ".exe" is not allowed.',
      });
      expect(mocks.saveAndGetImageFile).not.toHaveBeenCalled();
    });

    it('rejects a file over the size limit', async () => {
      mocks.generateFileFromBase64.mockReturnValue({
        contentLength: 128 * 1024 * 1024,
      });

      const result = await saveAttachment({
        noteId: 1,
        fileName: 'report.pdf',
        fileDataUrl: PDF_DATA_URL,
      });

      expect(result).toEqual({
        success: false,
        error: 'File exceeds the maximum allowed size.',
      });
    });

    it('rejects when the user has no access to the note', async () => {
      prismaMock.note.findUnique.mockResolvedValue({ id: 1, boardsId: 1 } as Note);
      prismaMock.board.findFirst.mockResolvedValue(null);
      prismaMock.share.findFirst.mockResolvedValue(null);

      const result = await saveAttachment({
        noteId: 1,
        fileName: 'report.pdf',
        fileDataUrl: PDF_DATA_URL,
      });

      expect(result).toEqual({ success: false, error: 'Note not found' });
    });

    it('reports failure when storage does not return a path', async () => {
      grantOwnerAccess();
      mocks.saveAndGetImageFile.mockResolvedValue(null);

      const result = await saveAttachment({
        noteId: 1,
        fileName: 'report.pdf',
        fileDataUrl: PDF_DATA_URL,
      });

      expect(result).toEqual({ success: false, error: 'Failed to save file' });
    });
  });

  describe('deleteAttachment', () => {
    it('removes the file then deletes the row', async () => {
      grantOwnerAccess();
      prismaMock.attachment.findFirst.mockResolvedValue({
        id: 5,
        fileUrl: 'files/report.pdf',
      } as Attachment);
      mocks.removeFile.mockReturnValue(true);

      await deleteAttachment(1, 5);

      expect(mocks.removeFile).toHaveBeenCalledWith('files/report.pdf');
      expect(prismaMock.attachment.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    });

    it('keeps the row when the file could not be removed', async () => {
      grantOwnerAccess();
      prismaMock.attachment.findFirst.mockResolvedValue({
        id: 5,
        fileUrl: 'files/report.pdf',
      } as Attachment);
      mocks.removeFile.mockReturnValue(false);

      await deleteAttachment(1, 5);

      expect(prismaMock.attachment.delete).not.toHaveBeenCalled();
    });

    it('does nothing without a user', async () => {
      mocks.getCurrentSession.mockResolvedValue({ user: null });

      await deleteAttachment(1, 5);

      expect(prismaMock.attachment.findFirst).not.toHaveBeenCalled();
    });

    it('swallows the error when the attachment is missing', async () => {
      grantOwnerAccess();
      prismaMock.attachment.findFirst.mockResolvedValue(null);

      await expect(deleteAttachment(1, 5)).resolves.toBeUndefined();
      expect(mocks.removeFile).not.toHaveBeenCalled();
    });
  });

  describe('getAttachments', () => {
    it('returns the note attachments newest first', async () => {
      grantOwnerAccess();
      const rows = [{ id: 2 }, { id: 1 }] as Attachment[];
      prismaMock.attachment.findMany.mockResolvedValue(rows);

      const result = await getAttachments(1);

      expect(result).toEqual(rows);
      expect(prismaMock.attachment.findMany).toHaveBeenCalledWith({
        where: { notesId: 1 },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns an empty list without a user', async () => {
      mocks.getCurrentSession.mockResolvedValue({ user: null });

      expect(await getAttachments(1)).toEqual([]);
    });

    it('returns an empty list when the note is not accessible', async () => {
      prismaMock.note.findUnique.mockResolvedValue(null);

      expect(await getAttachments(1)).toEqual([]);
    });
  });
});
