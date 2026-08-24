import { prisma } from '@/prisma/client';
import { Attachment } from '@/prisma/generated/client';

// Checks whether the current user (owner or share recipient) may access a
// stored file reference (Note/Board cover, Picture or Attachment).
export async function canAccessFile(
  userId: number,
  fileRef: string,
): Promise<boolean> {
  const ownedBoard = await prisma.board.findFirst({
    where: {
      userId,
      OR: [
        { imageUrl: fileRef },
        { notes: { some: { imageUrl: fileRef } } },
      ],
    },
  });
  if (ownedBoard) return true;

  const ownedPicture = await prisma.picture.findFirst({
    where: { imageUrl: fileRef, notes: { boards: { userId } } },
  });
  if (ownedPicture) return true;

  const ownedAttachment = await prisma.attachment.findFirst({
    where: { fileUrl: fileRef, notes: { boards: { userId } } },
  });
  if (ownedAttachment) return true;

  const noteIds = await prisma.note
    .findMany({
      where: {
        OR: [{ imageUrl: fileRef }, { attachments: { some: { fileUrl: fileRef } } }],
      },
      select: { id: true },
    })
    .then((notes) => notes.map((n) => n.id));

  const boardIds = await prisma.board
    .findMany({ where: { imageUrl: fileRef }, select: { id: true } })
    .then((boards) => boards.map((b) => b.id));

  if (noteIds.length === 0 && boardIds.length === 0) return false;

  const shared = await prisma.share.findFirst({
    where: {
      scope: 'SPECIFIC',
      recipients: { some: { userId } },
      OR: [
        { entityType: 'NOTE', entityId: { in: noteIds } },
        { entityType: 'BOARD', entityId: { in: boardIds } },
      ],
    },
  });

  return !!shared;
}

export async function findAttachment(
  fileRef: string,
): Promise<Attachment | null> {
  return prisma.attachment.findFirst({ where: { fileUrl: fileRef } });
}

export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

// Generates a safe Content-Disposition filename (no path separators).
export function sanitizeDispositionFilename(fileName: string): string {
  return fileName.replace(/[\\/]/g, '_').replace(/[^\w.\- ]+/g, '');
}