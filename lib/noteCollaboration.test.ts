import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  eventsChannel,
  formatSSE,
  getAllPresence,
  getOrInitRoom,
  getRoomState,
  loadNoteRoomContent,
  publishEvent,
  removePresence,
  setPresence,
  updateRoomContent,
} from './noteCollaboration';

// ponytail: in-memory hash stub instead of ioredis-mock; swap it in if a test
// ever needs real Redis semantics (expiry, WATCH, pipelines).
const { store, fakeRedis } = vi.hoisted(() => {
  const store = new Map<string, Map<string, string>>();
  const hash = (key: string) => {
    const existing = store.get(key);
    if (existing) return existing;
    const created = new Map<string, string>();
    store.set(key, created);
    return created;
  };
  return {
    store,
    fakeRedis: {
      hgetall: vi.fn(async (key: string) =>
        Object.fromEntries(store.get(key) ?? new Map<string, string>()),
      ),
      hsetnx: vi.fn(async (key: string, field: string, value: string) => {
        const h = hash(key);
        if (h.has(field)) return 0;
        h.set(field, value);
        return 1;
      }),
      hset: vi.fn(async (key: string, ...args: string[]) => {
        const h = hash(key);
        for (let i = 0; i < args.length; i += 2) h.set(args[i], args[i + 1]);
        return args.length / 2;
      }),
      hdel: vi.fn(async (key: string, field: string) => {
        return hash(key).delete(field) ? 1 : 0;
      }),
      expire: vi.fn(async () => 1),
      publish: vi.fn(async () => 1),
    },
  };
});

vi.mock('./redis', () => ({ redis: fakeRedis, createSubscriber: vi.fn() }));
import {
  deriveEncryptionKey,
  encryptField,
  generateEncryptionSalt,
  wrapKeyWithMaster,
} from '@/utils/encryption';

// Provide a 64-char hex master key for tests
process.env.ENCRYPTION_MASTER_KEY = 'a'.repeat(64);

vi.mock('@/prisma/client', () => ({
  prisma: {
    note: {
      findUnique: vi.fn(),
    },
    share: {
      findFirst: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
    },
  },
}));

describe('loadNoteRoomContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns plaintext content unchanged', async () => {
    const { prisma } = await import('@/prisma/client');
    vi.mocked(prisma.note.findUnique).mockResolvedValue({
      content: 'plain content',
    } as never);

    expect(await loadNoteRoomContent(1, 'token')).toBe('plain content');
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  it('returns empty string when the note has no content', async () => {
    const { prisma } = await import('@/prisma/client');
    vi.mocked(prisma.note.findUnique).mockResolvedValue(null as never);

    expect(await loadNoteRoomContent(1, 'token')).toBe('');
  });

  it('decrypts encrypted content with the session key', async () => {
    const { prisma } = await import('@/prisma/client');
    const key = await deriveEncryptionKey('pw', generateEncryptionSalt());
    const encrypted = encryptField('secret note body', key);

    vi.mocked(prisma.note.findUnique).mockResolvedValue({
      content: encrypted,
    } as never);
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      encryptedKey: wrapKeyWithMaster(key),
    } as never);

    expect(await loadNoteRoomContent(1, 'token')).toBe('secret note body');
  });

  it('falls back to the share snapshot when no session key is available', async () => {
    const { prisma } = await import('@/prisma/client');
    const key = await deriveEncryptionKey('pw', generateEncryptionSalt());
    const encrypted = encryptField('secret note body', key);

    vi.mocked(prisma.note.findUnique).mockResolvedValue({
      content: encrypted,
    } as never);
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      encryptedKey: null,
    } as never);
    vi.mocked(prisma.share.findFirst).mockResolvedValue({
      snapshot: JSON.stringify({ title: 'T', content: 'snapshot body' }),
    } as never);

    expect(await loadNoteRoomContent(1, 'token')).toBe('snapshot body');
  });

  it('returns the raw ciphertext when neither key nor snapshot exist', async () => {
    const { prisma } = await import('@/prisma/client');
    const key = await deriveEncryptionKey('pw', generateEncryptionSalt());
    const encrypted = encryptField('secret note body', key);

    vi.mocked(prisma.note.findUnique).mockResolvedValue({
      content: encrypted,
    } as never);
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.share.findFirst).mockResolvedValue(null as never);

    expect(await loadNoteRoomContent(1, undefined)).toBe(encrypted);
  });
});

describe('room state', () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it('initialises a room from the loader when it does not exist', async () => {
    const loader = vi.fn().mockResolvedValue('from db');

    expect(await getOrInitRoom(7, loader)).toEqual({ content: 'from db', revision: 0 });
    expect(loader).toHaveBeenCalledOnce();
    expect(fakeRedis.expire).toHaveBeenCalledWith('collab:room:7', 7 * 24 * 60 * 60);
  });

  it('returns the existing room without calling the loader', async () => {
    store.set(
      'collab:room:7',
      new Map([
        ['content', 'live'],
        ['revision', '42'],
      ]),
    );
    const loader = vi.fn();

    expect(await getOrInitRoom(7, loader)).toEqual({ content: 'live', revision: 42 });
    expect(loader).not.toHaveBeenCalled();
  });

  it('reads the winner state when another instance initialises first', async () => {
    // The loader is slow; meanwhile another instance writes the room.
    const loader = vi.fn(async () => {
      store.set(
        'collab:room:7',
        new Map([
          ['content', 'winner'],
          ['revision', '3'],
        ]),
      );
      return 'loser';
    });

    expect(await getOrInitRoom(7, loader)).toEqual({ content: 'winner', revision: 3 });
  });

  it('getRoomState returns null for an unknown room', async () => {
    expect(await getRoomState(99)).toBeNull();
  });

  it('updateRoomContent stores content and revision', async () => {
    await updateRoomContent(7, 'edited', 5);

    expect(await getRoomState(7)).toEqual({ content: 'edited', revision: 5 });
  });
});

describe('presence', () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it('stores and reads back a presence entry', async () => {
    await setPresence(7, 2, 'Bob', 10);

    const all = await getAllPresence(7);
    expect(all['2']).toMatchObject({ userId: 2, userName: 'Bob', line: 10 });
    expect(all['2'].updatedAt).toBeTypeOf('number');
  });

  it('overwrites the entry of an existing user', async () => {
    await setPresence(7, 2, 'Bob', 10);
    await setPresence(7, 2, 'Bob', 25);

    expect(Object.keys(await getAllPresence(7))).toEqual(['2']);
    expect((await getAllPresence(7))['2'].line).toBe(25);
  });

  it('removes a presence entry', async () => {
    await setPresence(7, 2, 'Bob', 10);
    await setPresence(7, 3, 'Carol', 1);
    await removePresence(7, 2);

    expect(Object.keys(await getAllPresence(7))).toEqual(['3']);
  });

  it('skips malformed entries instead of throwing', async () => {
    await setPresence(7, 2, 'Bob', 10);
    store.get('collab:presence:7')?.set('9', 'not json');

    expect(Object.keys(await getAllPresence(7))).toEqual(['2']);
  });

  it('returns an empty map for a room with no presence', async () => {
    expect(await getAllPresence(7)).toEqual({});
  });
});

describe('events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes an event to the note channel', async () => {
    await publishEvent(7, { type: 'content', data: { revision: 2 } });

    expect(fakeRedis.publish).toHaveBeenCalledWith(
      eventsChannel(7),
      '{"type":"content","data":{"revision":2}}',
    );
  });

  it('formats an SSE frame with a trailing blank line', () => {
    expect(formatSSE('presence', { userId: 2 })).toBe(
      'event: presence\ndata: {"userId":2}\n\n',
    );
  });
});
