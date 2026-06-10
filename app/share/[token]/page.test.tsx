import { Board, Note, Share, ShareRecipient } from '@/prisma/generated/client';
import { prismaMock } from '@/prisma/singleton';
import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublicSharePage from './page';

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  trackView: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  cookieGet: vi.fn(),
  isEncrypted: vi.fn((value: unknown) => typeof value === 'string' && value.startsWith('enc:')),
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookieGet })),
}));

vi.mock('@/app/login/lib/actions', () => ({
  getCurrentSession: mocks.getCurrentSession,
}));

vi.mock('@/app/(authenticated)/shared/lib/actions', () => ({
  trackView: mocks.trackView,
}));

vi.mock('@/utils/encryption', () => ({
  isEncrypted: mocks.isEncrypted,
}));

vi.mock('./components/PasswordEntry', () => ({
  default: ({ token }: { token: string }) => (
    <div data-testid="password-entry">{token}</div>
  ),
}));

vi.mock('./components/SharedNoteView', () => ({
  default: ({ note }: { note: { title: string } }) => (
    <div data-testid="shared-note-view">{note.title}</div>
  ),
}));

vi.mock('./components/SharedBoardView', () => ({
  default: ({ board }: { board: { title: string } }) => (
    <div data-testid="shared-board-view">{board.title}</div>
  ),
}));

async function renderPage(token = 's1') {
  const page = await PublicSharePage({
    params: Promise.resolve({ token }),
  });
  return render(page);
}

const baseShare = {
  id: 's1',
  entityType: 'NOTE',
  entityId: 101,
  password: null,
  expiresAt: null,
  oneTime: false,
  viewCount: 0,
  scope: 'PUBLIC',
  canEdit: false,
  snapshot: null,
};

describe('PublicSharePage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.getCurrentSession.mockResolvedValue({ user: null });
  });

  it('shows the expired view when the share does not exist', async () => {
    prismaMock.share.findUnique.mockResolvedValue(null);

    await renderPage();

    expect(screen.getByText('Link Expired')).toBeInTheDocument();
  });

  it('shows the expired view when the share expiration date passed', async () => {
    prismaMock.share.findUnique.mockResolvedValue({
      ...baseShare,
      expiresAt: new Date(Date.now() - 1000),
    } as Share);

    await renderPage();

    expect(screen.getByText('Link Expired')).toBeInTheDocument();
  });

  it('asks for a password when the share is protected', async () => {
    prismaMock.share.findUnique.mockResolvedValue({
      ...baseShare,
      password: 'hashed',
    } as Share);

    await renderPage();

    expect(screen.getByTestId('password-entry')).toHaveTextContent('s1');
  });

  it('renders a shared note from its snapshot and tracks the view', async () => {
    prismaMock.share.findUnique.mockResolvedValue({
      ...baseShare,
      snapshot: JSON.stringify({ title: 'Snapshot note' }),
    } as Share);

    await renderPage();

    expect(screen.getByTestId('shared-note-view')).toHaveTextContent(
      'Snapshot note',
    );
    expect(mocks.trackView).toHaveBeenCalledWith('s1');
  });

  it('renders a shared board from live data with encrypted fields masked', async () => {
    prismaMock.share.findUnique.mockResolvedValue({
      ...baseShare,
      entityType: 'BOARD',
      entityId: 5,
    } as Share);
    prismaMock.board.findUnique.mockResolvedValue({
      id: 5,
      title: 'enc:secret-title',
      user: { name: 'John' },
      notes: [],
    } as unknown as Board);

    await renderPage();

    expect(screen.getByTestId('shared-board-view')).toHaveTextContent(
      '[Encrypted content — not available in shared view]',
    );
  });

  it('returns not found when the live entity is missing', async () => {
    prismaMock.share.findUnique.mockResolvedValue({ ...baseShare } as Share);
    prismaMock.note.findUnique.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('allows the first view of a one-time share', async () => {
    prismaMock.share.findUnique.mockResolvedValue({
      ...baseShare,
      oneTime: true,
      snapshot: JSON.stringify({ title: 'One-time note' }),
    } as Share);
    prismaMock.share.updateMany.mockResolvedValue({ count: 1 });

    await renderPage();

    expect(screen.getByTestId('shared-note-view')).toBeInTheDocument();
    expect(prismaMock.share.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', viewCount: 0 },
      data: { viewCount: 1 },
    });
  });

  it('expires a one-time share that was already viewed', async () => {
    prismaMock.share.findUnique.mockResolvedValue({
      ...baseShare,
      oneTime: true,
      viewCount: 1,
      snapshot: JSON.stringify({ title: 'One-time note' }),
    } as Share);

    await renderPage();

    expect(screen.getByText('Link Expired')).toBeInTheDocument();
    expect(mocks.trackView).not.toHaveBeenCalled();
  });

  it('expires a one-time share lost to a concurrent first view', async () => {
    prismaMock.share.findUnique.mockResolvedValue({
      ...baseShare,
      oneTime: true,
      snapshot: JSON.stringify({ title: 'One-time note' }),
    } as Share);
    prismaMock.share.updateMany.mockResolvedValue({ count: 0 });

    await renderPage();

    expect(screen.getByText('Link Expired')).toBeInTheDocument();
  });

  it('redirects edit-share recipients to the note editor', async () => {
    prismaMock.share.findUnique.mockResolvedValue({
      ...baseShare,
      canEdit: true,
      scope: 'SPECIFIC',
    } as Share);
    mocks.getCurrentSession.mockResolvedValue({ user: { id: 7 } });
    prismaMock.shareRecipient.findFirst.mockResolvedValue({
      id: 1,
    } as ShareRecipient);
    prismaMock.note.findUnique.mockResolvedValue({ boardsId: 3 } as Note);

    await expect(renderPage()).rejects.toThrow(
      'NEXT_REDIRECT:/boards/3/notes/101?ref=community',
    );
  });
});
