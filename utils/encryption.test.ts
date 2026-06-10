import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateEncryptionSalt,
  deriveEncryptionKey,
  wrapKeyWithMaster,
  unwrapKeyWithMaster,
  encryptField,
  decryptField,
  isEncrypted,
  encryptBoardFields,
  decryptBoardFields,
  encryptNoteFields,
  decryptNoteFields,
  reEncryptAll,
} from './encryption';

// Provide a 64-char hex master key for tests
process.env.ENCRYPTION_MASTER_KEY = 'a'.repeat(64);

vi.mock('@/prisma/client', () => ({
  prisma: {
    board: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    note: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    noteChange: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    changeComment: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));

describe('generateEncryptionSalt', () => {
  it('returns a 64-char hex string', () => {
    const salt = generateEncryptionSalt();
    expect(salt).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(salt)).toBe(true);
  });

  it('returns a different value each call', () => {
    expect(generateEncryptionSalt()).not.toBe(generateEncryptionSalt());
  });
});

describe('deriveEncryptionKey', () => {
  it('returns a 32-byte Buffer', async () => {
    const salt = generateEncryptionSalt();
    const key = await deriveEncryptionKey('password', salt);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it('is deterministic for same password+salt', async () => {
    const salt = generateEncryptionSalt();
    const key1 = await deriveEncryptionKey('pw', salt);
    const key2 = await deriveEncryptionKey('pw', salt);
    expect(key1.equals(key2)).toBe(true);
  });

  it('differs for different passwords', async () => {
    const salt = generateEncryptionSalt();
    const key1 = await deriveEncryptionKey('pw1', salt);
    const key2 = await deriveEncryptionKey('pw2', salt);
    expect(key1.equals(key2)).toBe(false);
  });
});

describe('wrapKeyWithMaster / unwrapKeyWithMaster', () => {
  it('round-trips a key buffer', async () => {
    const salt = generateEncryptionSalt();
    const key = await deriveEncryptionKey('secret', salt);
    const wrapped = wrapKeyWithMaster(key);
    const unwrapped = unwrapKeyWithMaster(wrapped);
    expect(unwrapped.equals(key)).toBe(true);
  });

  it('wrapped format has three colon-separated parts', async () => {
    const salt = generateEncryptionSalt();
    const key = await deriveEncryptionKey('secret', salt);
    const wrapped = wrapKeyWithMaster(key);
    expect(wrapped.split(':').length).toBe(3);
  });
});

describe('encryptField / decryptField', () => {
  let key: Buffer;

  beforeEach(async () => {
    key = await deriveEncryptionKey('test-password', generateEncryptionSalt());
  });

  it('round-trips plaintext', () => {
    const plaintext = 'Hello, world!';
    const encrypted = encryptField(plaintext, key);
    expect(decryptField(encrypted, key)).toBe(plaintext);
  });

  it('produces different ciphertext on repeated calls (random IV)', () => {
    const c1 = encryptField('same text', key);
    const c2 = encryptField('same text', key);
    expect(c1).not.toBe(c2);
  });

  it('returns non-enc: values unchanged (passthrough)', () => {
    expect(decryptField('plain text', key)).toBe('plain text');
    expect(decryptField('', key)).toBe('');
  });

  it('encrypted value starts with enc:', () => {
    expect(encryptField('test', key)).toMatch(/^enc:/);
  });

  it('throws on tampered auth tag', () => {
    const encrypted = encryptField('test', key);
    // Replace the last 32 hex chars (the 16-byte auth tag) with zeros to break GCM auth
    const tampered = encrypted.slice(0, -32) + '0'.repeat(32);
    expect(() => decryptField(tampered, key)).toThrow();
  });
});

describe('isEncrypted', () => {
  it('returns true for enc: prefixed strings', () => {
    expect(isEncrypted('enc:abc:def:ghi')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(isEncrypted('plain')).toBe(false);
    expect(isEncrypted('')).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
  });
});

describe('encryptBoardFields / decryptBoardFields', () => {
  let key: Buffer;

  beforeEach(async () => {
    key = await deriveEncryptionKey('pw', generateEncryptionSalt());
  });

  it('encrypts title and description', () => {
    const board = { id: 1, title: 'My Board', description: 'A desc' };
    const enc = encryptBoardFields(board, key);
    expect(isEncrypted(enc.title)).toBe(true);
    expect(isEncrypted(enc.description!)).toBe(true);
  });

  it('leaves null description as null', () => {
    const board = { id: 1, title: 'My Board', description: null };
    const enc = encryptBoardFields(board, key);
    expect(enc.description).toBeNull();
  });

  it('round-trips title and description', () => {
    const board = { id: 1, title: 'My Board', description: 'A desc' };
    const result = decryptBoardFields(encryptBoardFields(board, key), key);
    expect(result.title).toBe('My Board');
    expect(result.description).toBe('A desc');
  });

  it('preserves non-encrypted fields through decrypt', () => {
    const board = { id: 1, title: 'plain', description: null };
    const dec = decryptBoardFields(board, key);
    expect(dec.title).toBe('plain');
    expect(dec.description).toBeNull();
  });
});

describe('encryptNoteFields / decryptNoteFields', () => {
  let key: Buffer;

  beforeEach(async () => {
    key = await deriveEncryptionKey('pw', generateEncryptionSalt());
  });

  it('encrypts title and content', () => {
    const note = { id: 1, title: 'Note', content: 'Content here' };
    const enc = encryptNoteFields(note, key);
    expect(isEncrypted(enc.title)).toBe(true);
    expect(isEncrypted(enc.content!)).toBe(true);
  });

  it('leaves null content as null', () => {
    const note = { id: 1, title: 'Note', content: null };
    expect(encryptNoteFields(note, key).content).toBeNull();
  });

  it('round-trips', () => {
    const note = { id: 1, title: 'Note', content: 'Body' };
    const result = decryptNoteFields(encryptNoteFields(note, key), key);
    expect(result.title).toBe('Note');
    expect(result.content).toBe('Body');
  });
});

describe('reEncryptAll', () => {
  it('calls update for all boards, notes, and noteChanges', async () => {
    const { prisma } = await import('@/prisma/client');

    const oldSalt = generateEncryptionSalt();
    const newSalt = generateEncryptionSalt();
    const oldKey = await deriveEncryptionKey('old-pw', oldSalt);
    const newKey = await deriveEncryptionKey('new-pw', newSalt);

    const encTitle = encryptField('Board One', oldKey);
    const encDesc = encryptField('Desc', oldKey);
    const encNoteTitle = encryptField('Note Title', oldKey);
    const encContent = encryptField('Note content', oldKey);
    const encPrevContent = encryptField('Previous content', oldKey);
    const encDiffPatch = encryptField('diff patch', oldKey);
    const encComment = encryptField('A comment', oldKey);

    vi.mocked(prisma.board.findMany).mockResolvedValue([
      { id: 1, title: encTitle, description: encDesc } as never,
    ]);
    vi.mocked(prisma.note.findMany).mockResolvedValue([
      { id: 10, title: encNoteTitle, content: encContent } as never,
    ]);
    vi.mocked(prisma.noteChange.findMany).mockResolvedValue([
      { id: 100, diffPatch: encDiffPatch, previousContent: encPrevContent } as never,
    ]);
    vi.mocked(prisma.changeComment.findMany).mockResolvedValue([
      { id: 200, content: encComment } as never,
    ]);
    vi.mocked(prisma.board.update).mockResolvedValue({} as never);
    vi.mocked(prisma.note.update).mockResolvedValue({} as never);
    vi.mocked(prisma.noteChange.update).mockResolvedValue({} as never);
    vi.mocked(prisma.changeComment.update).mockResolvedValue({} as never);

    await reEncryptAll(1, oldKey, newKey);

    expect(prisma.board.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    );
    expect(prisma.note.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 10 } }),
    );
    expect(prisma.noteChange.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 100 } }),
    );
    expect(prisma.changeComment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 200 } }),
    );

    // Verify the re-encrypted values are decryptable with the new key
    const boardUpdateCall = vi.mocked(prisma.board.update).mock.calls[0][0];
    expect(decryptField(boardUpdateCall.data.title as string, newKey)).toBe('Board One');

    const changeUpdateCall = vi.mocked(prisma.noteChange.update).mock.calls[0][0];
    expect(decryptField(changeUpdateCall.data.diffPatch as string, newKey)).toBe('diff patch');
    expect(decryptField(changeUpdateCall.data.previousContent as string, newKey)).toBe(
      'Previous content',
    );

    const commentUpdateCall = vi.mocked(prisma.changeComment.update).mock.calls[0][0];
    expect(decryptField(commentUpdateCall.data.content as string, newKey)).toBe('A comment');
  });
});
