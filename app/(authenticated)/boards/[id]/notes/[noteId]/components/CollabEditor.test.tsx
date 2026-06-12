import { cleanup, waitFor, act } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { Note } from '@/prisma/generated/client';
import CollabEditor from './CollabEditor';
import { renderWithIntl } from '@/utils/test/renderWithIntl';

// ---------- Controllable EventSource mock ----------

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onerror: ((e: Event) => void) | null = null;
  close = vi.fn();

  private _handlers = new Map<string, ((e: { data: string }) => void)[]>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: (e: { data: string }) => void) {
    const bucket = this._handlers.get(type) ?? [];
    this._handlers.set(type, [...bucket, fn]);
  }

  emit(type: string, payload: unknown) {
    (this._handlers.get(type) ?? []).forEach((h) =>
      h({ data: JSON.stringify(payload) }),
    );
  }

  simulateError() {
    this.onerror?.(new Event('error'));
  }
}

// ---------- Hoisted mocks ----------

const mocks = vi.hoisted(() => ({
  Editor: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('./Editor', () => ({ default: mocks.Editor }));

// Prevent real server actions (which call Next.js cookies()) from running in tests.
vi.mock('../../lib/actions', () => ({
  updateNote: vi.fn(),
  getPictures: vi.fn(),
  deleteImage: vi.fn(),
  savePicture: vi.fn(),
  deletePicture: vi.fn(),
  getNoteChanges: vi.fn(),
  clearNoteHistory: vi.fn(),
  restoreToVersion: vi.fn(),
}));

// ---------- Helpers ----------

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 42,
    content: 'Hello world',
    boardsId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Note;
}

type EditorCallProps = Record<string, unknown>;

function lastEditorProps(): EditorCallProps {
  const calls = mocks.Editor.mock.calls;
  return calls[calls.length - 1][0] as EditorCallProps;
}

type InitPayload = {
  revision?: number;
  content?: string;
  presence?: Record<string, { userId: number; userName: string; line: number }>;
};

function fireInit(es: MockEventSource, opts: InitPayload = {}) {
  act(() => {
    es.emit('init', {
      revision: opts.revision ?? 1,
      content: opts.content ?? 'Hello world',
      presence: opts.presence ?? {},
    });
  });
}

function latestES(): MockEventSource {
  return MockEventSource.instances[MockEventSource.instances.length - 1];
}

const CURRENT_USER_ID = 1;
const DEFAULT_COLLAB_PROPS = {
  currentUserId: CURRENT_USER_ID,
  currentUserName: 'Alice',
  enableCollab: true,
} as const;

// ---------- Setup ----------

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.Editor.mockReturnValue(null);
  mocks.fetch.mockResolvedValue({
    json: () => Promise.resolve({ ok: true, revision: 2 }),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers(); // drain pending fake timers before restoring real ones
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------- Tests ----------

describe('CollabEditor', () => {
  describe('when enableCollab is false', () => {
    it('does not create an EventSource', () => {
      renderWithIntl(
        <CollabEditor
          {...DEFAULT_COLLAB_PROPS}
          enableCollab={false}
          note={makeNote()}
        />,
      );
      expect(MockEventSource.instances).toHaveLength(0);
    });

    it('passes null remoteContent and undefined collab callbacks to Editor', () => {
      renderWithIntl(
        <CollabEditor
          {...DEFAULT_COLLAB_PROPS}
          enableCollab={false}
          note={makeNote()}
        />,
      );
      const props = lastEditorProps();
      expect(props.remoteContent).toBeNull();
      expect(props.onContentChange).toBeUndefined();
      expect(props.onCursorLineChange).toBeUndefined();
      expect(props.presenceUsers).toBeUndefined();
    });
  });

  describe('when enableCollab is true', () => {
    it('creates an EventSource pointing to the note stream URL', () => {
      renderWithIntl(
        <CollabEditor {...DEFAULT_COLLAB_PROPS} note={makeNote({ id: 99 })} />,
      );
      expect(MockEventSource.instances).toHaveLength(1);
      expect(MockEventSource.instances[0].url).toBe(
        '/api/v1/notes/99/stream',
      );
    });

    it('closes the EventSource on unmount', () => {
      const { unmount } = renderWithIntl(
        <CollabEditor {...DEFAULT_COLLAB_PROPS} note={makeNote()} />,
      );
      const es = latestES();
      unmount();
      expect(es.close).toHaveBeenCalledOnce();
    });

    it('presenceUsers is undefined before receiving the init event', () => {
      renderWithIntl(
        <CollabEditor {...DEFAULT_COLLAB_PROPS} note={makeNote()} />,
      );
      expect(lastEditorProps().presenceUsers).toBeUndefined();
    });
  });

  describe('on init event', () => {
    it('transitions to CONNECTED and exposes an empty presenceUsers array', () => {
      renderWithIntl(
        <CollabEditor {...DEFAULT_COLLAB_PROPS} note={makeNote()} />,
      );
      fireInit(latestES());
      expect(lastEditorProps().presenceUsers).toEqual([]);
    });

    it('does not update remoteContent when server content matches local', () => {
      renderWithIntl(
        <CollabEditor
          {...DEFAULT_COLLAB_PROPS}
          note={makeNote({ content: 'Hello world' })}
        />,
      );
      fireInit(latestES(), { content: 'Hello world' });
      expect(lastEditorProps().remoteContent).toBeNull();
    });

    it('sets remoteContent to the merged result when server content differs', () => {
      renderWithIntl(
        <CollabEditor
          {...DEFAULT_COLLAB_PROPS}
          note={makeNote({ content: 'base' })}
        />,
      );
      fireInit(latestES(), { content: 'base + server edit' });
      // local === base, so merge applies the server patch cleanly
      expect(lastEditorProps().remoteContent).toBe('base + server edit');
    });

    it('builds the presence map from init data, excluding the current user', () => {
      renderWithIntl(
        <CollabEditor {...DEFAULT_COLLAB_PROPS} note={makeNote()} />,
      );
      fireInit(latestES(), {
        presence: {
          '1': { userId: CURRENT_USER_ID, userName: 'Alice', line: 1 },
          '2': { userId: 2, userName: 'Bob', line: 3 },
        },
      });

      const presenceUsers = lastEditorProps()
        .presenceUsers as { userId: number; userName: string }[];
      expect(presenceUsers).toHaveLength(1);
      expect(presenceUsers[0]).toMatchObject({ userId: 2, userName: 'Bob' });
    });

    it('assigns a hex color to each presence entry', () => {
      renderWithIntl(
        <CollabEditor {...DEFAULT_COLLAB_PROPS} note={makeNote()} />,
      );
      fireInit(latestES(), {
        presence: { '2': { userId: 2, userName: 'Bob', line: 1 } },
      });

      const presenceUsers = lastEditorProps().presenceUsers as { color: string }[];
      expect(presenceUsers[0].color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('schedules a patch flush for edits accumulated before init', () => {
      vi.useFakeTimers({ toFake: ['setTimeout'], shouldAdvanceTime: true });
      renderWithIntl(
        <CollabEditor
          {...DEFAULT_COLLAB_PROPS}
          note={makeNote({ content: 'base' })}
        />,
      );
      const es = latestES();

      // User types before CONNECTED
      act(() => {
        (lastEditorProps().onContentChange as (v: string) => void)?.(
          'base + local edit',
        );
      });

      // Init arrives with the original content (no server changes yet)
      fireInit(es, { content: 'base' });

      // The component detects local !== server and fires schedulePatch
      act(() => { vi.advanceTimersByTime(200); });

      expect(mocks.fetch).toHaveBeenCalledWith(
        '/api/v1/notes/42/sync',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('on content event', () => {
    it('applies the three-way merge and sets remoteContent', () => {
      renderWithIntl(
        <CollabEditor
          {...DEFAULT_COLLAB_PROPS}
          note={makeNote({ content: 'Hello' })}
        />,
      );
      const es = latestES();
      fireInit(es, { content: 'Hello' });

      act(() => {
        es.emit('content', {
          revision: 2,
          content: 'Hello world',
          patch: '',
          authorId: 99,
        });
      });

      expect(lastEditorProps().remoteContent).toBe('Hello world');
    });

    it('ignores content events authored by the current user', () => {
      renderWithIntl(
        <CollabEditor
          {...DEFAULT_COLLAB_PROPS}
          note={makeNote({ content: 'Hello' })}
        />,
      );
      const es = latestES();
      fireInit(es, { content: 'Hello' });

      act(() => {
        es.emit('content', {
          revision: 2,
          content: 'Hello world',
          patch: '',
          authorId: CURRENT_USER_ID,
        });
      });

      expect(lastEditorProps().remoteContent).toBeNull();
    });
  });

  describe('on presence event', () => {
    it('adds a remote user to the presence map', () => {
      renderWithIntl(
        <CollabEditor {...DEFAULT_COLLAB_PROPS} note={makeNote()} />,
      );
      const es = latestES();
      fireInit(es);

      act(() => {
        es.emit('presence', { userId: 3, userName: 'Carol', line: 5 });
      });

      const presenceUsers = lastEditorProps().presenceUsers as {
        userId: number;
        line: number;
      }[];
      expect(presenceUsers).toHaveLength(1);
      expect(presenceUsers[0]).toMatchObject({ userId: 3, userName: 'Carol', line: 5 });
    });

    it('updates the line number for an already-present user', () => {
      renderWithIntl(
        <CollabEditor {...DEFAULT_COLLAB_PROPS} note={makeNote()} />,
      );
      const es = latestES();
      fireInit(es, {
        presence: { '2': { userId: 2, userName: 'Bob', line: 1 } },
      });

      act(() => {
        es.emit('presence', { userId: 2, userName: 'Bob', line: 10 });
      });

      const presenceUsers = lastEditorProps().presenceUsers as { line: number }[];
      expect(presenceUsers).toHaveLength(1);
      expect(presenceUsers[0].line).toBe(10);
    });

    it('ignores presence events from the current user', () => {
      renderWithIntl(
        <CollabEditor {...DEFAULT_COLLAB_PROPS} note={makeNote()} />,
      );
      const es = latestES();
      fireInit(es);

      act(() => {
        es.emit('presence', { userId: CURRENT_USER_ID, userName: 'Alice', line: 2 });
      });

      expect(
        (lastEditorProps().presenceUsers as unknown[]),
      ).toHaveLength(0);
    });
  });

  describe('on leave event', () => {
    it('removes the departed user from the presence map', () => {
      renderWithIntl(
        <CollabEditor {...DEFAULT_COLLAB_PROPS} note={makeNote()} />,
      );
      const es = latestES();
      fireInit(es, {
        presence: {
          '2': { userId: 2, userName: 'Bob', line: 1 },
          '3': { userId: 3, userName: 'Carol', line: 2 },
        },
      });

      act(() => {
        es.emit('leave', { userId: 2 });
      });

      const presenceUsers = lastEditorProps().presenceUsers as { userId: number }[];
      expect(presenceUsers).toHaveLength(1);
      expect(presenceUsers[0].userId).toBe(3);
    });
  });

  describe('on connection error', () => {
    it('closes the broken EventSource and reconnects', () => {
      vi.useFakeTimers({ toFake: ['setTimeout'], shouldAdvanceTime: true });
      renderWithIntl(
        <CollabEditor {...DEFAULT_COLLAB_PROPS} note={makeNote()} />,
      );
      const firstES = latestES();

      act(() => { firstES.simulateError(); });

      expect(firstES.close).toHaveBeenCalled();

      act(() => { vi.advanceTimersByTime(1500); });

      expect(MockEventSource.instances).toHaveLength(2);
    });

    it('applies exponential backoff: the second reconnect waits longer than the first', () => {
      vi.useFakeTimers({ toFake: ['setTimeout'], shouldAdvanceTime: true });
      renderWithIntl(
        <CollabEditor {...DEFAULT_COLLAB_PROPS} note={makeNote()} />,
      );

      // First error → ~1s delay
      act(() => { latestES().simulateError(); });
      act(() => { vi.advanceTimersByTime(1500); });
      expect(MockEventSource.instances).toHaveLength(2);

      // Second error → ~2s delay
      act(() => { latestES().simulateError(); });
      // 1.5s is not enough for the ~2s backoff
      act(() => { vi.advanceTimersByTime(1500); });
      expect(MockEventSource.instances).toHaveLength(2);

      // Advance remaining time
      act(() => { vi.advanceTimersByTime(1000); });
      expect(MockEventSource.instances).toHaveLength(3);
    });
  });

  describe('handleContentChange — patch debounce', () => {
    it('does not send a patch before the 100 ms debounce elapses', () => {
      vi.useFakeTimers({ toFake: ['setTimeout'], shouldAdvanceTime: true });
      renderWithIntl(
        <CollabEditor
          {...DEFAULT_COLLAB_PROPS}
          note={makeNote({ content: 'Hello' })}
        />,
      );
      const es = latestES();
      fireInit(es, { content: 'Hello' });

      act(() => {
        (lastEditorProps().onContentChange as (v: string) => void)?.(
          'Hello world',
        );
      });

      act(() => { vi.advanceTimersByTime(50); });
      expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it('sends a content patch to the sync endpoint after 100 ms', () => {
      vi.useFakeTimers({ toFake: ['setTimeout'], shouldAdvanceTime: true });
      renderWithIntl(
        <CollabEditor
          {...DEFAULT_COLLAB_PROPS}
          note={makeNote({ content: 'Hello' })}
        />,
      );
      const es = latestES();
      fireInit(es, { content: 'Hello' });

      act(() => {
        (lastEditorProps().onContentChange as (v: string) => void)?.(
          'Hello world',
        );
      });
      act(() => { vi.advanceTimersByTime(150); });

      expect(mocks.fetch).toHaveBeenCalledWith(
        '/api/v1/notes/42/sync',
        expect.objectContaining({ method: 'POST' }),
      );
      const body = JSON.parse(
        mocks.fetch.mock.calls[0][1].body as string,
      ) as { type: string; patch: string };
      expect(body.type).toBe('content');
      expect(body.patch).toBeTruthy();
    });

    it('batches rapid keystrokes into a single fetch call', () => {
      vi.useFakeTimers({ toFake: ['setTimeout'], shouldAdvanceTime: true });
      renderWithIntl(
        <CollabEditor
          {...DEFAULT_COLLAB_PROPS}
          note={makeNote({ content: 'Hello' })}
        />,
      );
      const es = latestES();
      fireInit(es, { content: 'Hello' });

      const onChange = lastEditorProps()
        .onContentChange as (v: string) => void;
      act(() => {
        onChange('Hello w');
        onChange('Hello wo');
        onChange('Hello wor');
        onChange('Hello world');
      });
      act(() => { vi.advanceTimersByTime(200); });

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });

    it('does not send a patch when the state is not CONNECTED', () => {
      vi.useFakeTimers({ toFake: ['setTimeout'], shouldAdvanceTime: true });
      renderWithIntl(
        <CollabEditor {...DEFAULT_COLLAB_PROPS} note={makeNote()} />,
      );
      // No init → state remains CONNECTING

      act(() => {
        (lastEditorProps().onContentChange as (v: string) => void)?.(
          'some new content',
        );
      });
      act(() => { vi.advanceTimersByTime(200); });

      expect(mocks.fetch).not.toHaveBeenCalled();
    });
  });

  describe('flushPatch — server response handling', () => {
    it('uses the server-returned revision as baseRevision for the next patch', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'], shouldAdvanceTime: true });
      mocks.fetch.mockResolvedValue({
        json: () => Promise.resolve({ ok: true, revision: 7 }),
      });

      renderWithIntl(
        <CollabEditor
          {...DEFAULT_COLLAB_PROPS}
          note={makeNote({ content: 'Hello' })}
        />,
      );
      const es = latestES();
      fireInit(es, { content: 'Hello', revision: 1 });

      const onChange = lastEditorProps()
        .onContentChange as (v: string) => void;

      // First patch
      act(() => { onChange('Hello world'); });
      act(() => { vi.advanceTimersByTime(200); });
      await act(async () => { /* flush fetch promise */ });

      // Second patch — baseRevision should be 7 (from server response)
      act(() => { onChange('Hello world!'); });
      act(() => { vi.advanceTimersByTime(200); });

      const secondBody = JSON.parse(
        mocks.fetch.mock.calls[1][1].body as string,
      ) as { baseRevision: number };
      expect(secondBody.baseRevision).toBe(7);
    });

    it('resets local content to the authoritative value on hard resync (ok: false)', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'], shouldAdvanceTime: true });
      mocks.fetch.mockResolvedValue({
        json: () =>
          Promise.resolve({
            ok: false,
            revision: 10,
            content: 'Authoritative content',
          }),
      });

      renderWithIntl(
        <CollabEditor
          {...DEFAULT_COLLAB_PROPS}
          note={makeNote({ content: 'Hello' })}
        />,
      );
      const es = latestES();
      fireInit(es, { content: 'Hello' });

      act(() => {
        (lastEditorProps().onContentChange as (v: string) => void)?.(
          'My diverged content',
        );
      });
      act(() => { vi.advanceTimersByTime(200); });
      await act(async () => { /* flush fetch promise chain */ });

      await waitFor(() => {
        expect(lastEditorProps().remoteContent).toBe('Authoritative content');
      });
    });
  });

  describe('handleCursorLineChange — presence debounce', () => {
    it('sends a presence update after 300 ms', () => {
      vi.useFakeTimers({ toFake: ['setTimeout'], shouldAdvanceTime: true });
      renderWithIntl(
        <CollabEditor {...DEFAULT_COLLAB_PROPS} note={makeNote()} />,
      );
      const es = latestES();
      fireInit(es);

      act(() => {
        (lastEditorProps().onCursorLineChange as (line: number) => void)?.(7);
      });

      act(() => { vi.advanceTimersByTime(200); });
      expect(mocks.fetch).not.toHaveBeenCalled();

      act(() => { vi.advanceTimersByTime(150); });
      expect(mocks.fetch).toHaveBeenCalledWith(
        '/api/v1/notes/42/sync',
        expect.objectContaining({ method: 'POST' }),
      );
      const body = JSON.parse(
        mocks.fetch.mock.calls[0][1].body as string,
      ) as { type: string; line: number };
      expect(body.type).toBe('presence');
      expect(body.line).toBe(7);
    });

    it('sends only the latest cursor line when the cursor moves rapidly', () => {
      vi.useFakeTimers({ toFake: ['setTimeout'], shouldAdvanceTime: true });
      renderWithIntl(
        <CollabEditor {...DEFAULT_COLLAB_PROPS} note={makeNote()} />,
      );
      const es = latestES();
      fireInit(es);

      const onCursorLineChange = lastEditorProps()
        .onCursorLineChange as (line: number) => void;
      act(() => {
        onCursorLineChange(1);
        onCursorLineChange(5);
        onCursorLineChange(15);
      });
      act(() => { vi.advanceTimersByTime(400); });

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(
        mocks.fetch.mock.calls[0][1].body as string,
      ) as { line: number };
      expect(body.line).toBe(15);
    });

    it('does not send a presence update when not CONNECTED', () => {
      vi.useFakeTimers({ toFake: ['setTimeout'], shouldAdvanceTime: true });
      renderWithIntl(
        <CollabEditor {...DEFAULT_COLLAB_PROPS} note={makeNote()} />,
      );
      // No init → not CONNECTED

      act(() => {
        (lastEditorProps().onCursorLineChange as (line: number) => void)?.(5);
      });
      act(() => { vi.advanceTimersByTime(400); });

      expect(mocks.fetch).not.toHaveBeenCalled();
    });
  });
});
