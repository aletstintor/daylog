import type { CommunityShare } from '@/app/(authenticated)/shared/lib/actions';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CommunityFeed from './CommunityFeed';

const mocks = vi.hoisted(() => ({
  leaveShare: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/app/(authenticated)/shared/lib/actions', () => ({
  leaveShare: mocks.leaveShare,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('@/utils/image', () => ({
  getImageUrlOrFile: vi.fn((url: string) => url),
}));

function buildShare(overrides: Partial<CommunityShare> = {}): CommunityShare {
  return {
    id: 's1',
    entityType: 'NOTE',
    entityId: 101,
    title: 'A shared note',
    imageUrl: null,
    creatorName: 'Jane',
    createdAt: new Date(),
    canEdit: false,
    ...overrides,
  };
}

describe('CommunityFeed', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the empty state for the public tab', () => {
    render(<CommunityFeed allShares={[]} sharedWithMe={[]} activeTab="all" />);

    expect(screen.getByText('No public content yet')).toBeInTheDocument();
  });

  it('shows the empty state for the shared-with-me tab', () => {
    render(
      <CommunityFeed allShares={[]} sharedWithMe={[]} activeTab="withMe" />,
    );

    expect(screen.getByText('Nothing shared with you yet')).toBeInTheDocument();
  });

  it('renders public shares with a view link', () => {
    render(
      <CommunityFeed
        allShares={[buildShare()]}
        sharedWithMe={[]}
        activeTab="all"
      />,
    );

    expect(screen.getByText('A shared note')).toBeInTheDocument();
    expect(screen.getByText('Shared by Jane')).toBeInTheDocument();
    expect(screen.getByText('just now')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'View' });
    expect(link).toHaveAttribute('href', '/share/s1');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders an edit link for editable shares', () => {
    render(
      <CommunityFeed
        allShares={[]}
        sharedWithMe={[buildShare({ canEdit: true })]}
        activeTab="withMe"
      />,
    );

    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/share/s1',
    );
  });

  it('renders a board share with its cover image', () => {
    render(
      <CommunityFeed
        allShares={[
          buildShare({
            entityType: 'BOARD',
            title: 'A board',
            imageUrl: '/cover.png',
          }),
        ]}
        sharedWithMe={[]}
        activeTab="all"
      />,
    );

    expect(screen.getByAltText('A board')).toBeInTheDocument();
    expect(screen.getByText('Board')).toBeInTheDocument();
  });

  it('formats older share dates as relative time', () => {
    const minutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const hoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const daysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    render(
      <CommunityFeed
        allShares={[
          buildShare({ id: 's1', createdAt: minutesAgo }),
          buildShare({ id: 's2', createdAt: hoursAgo }),
          buildShare({ id: 's3', createdAt: daysAgo }),
        ]}
        sharedWithMe={[]}
        activeTab="all"
      />,
    );

    expect(screen.getByText('5m ago')).toBeInTheDocument();
    expect(screen.getByText('3h ago')).toBeInTheDocument();
    expect(screen.getByText('2d ago')).toBeInTheDocument();
  });

  it('lets a recipient leave a share after confirming', async () => {
    mocks.leaveShare.mockResolvedValue(undefined);

    render(
      <CommunityFeed
        allShares={[]}
        sharedWithMe={[buildShare()]}
        activeTab="withMe"
      />,
    );

    fireEvent.click(screen.getByTitle('Remove'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Remove' }));

    await waitFor(() => {
      expect(mocks.leaveShare).toHaveBeenCalledWith('s1');
      expect(mocks.refresh).toHaveBeenCalled();
    });
  });

  it('keeps the dialog usable when leaving the share fails', async () => {
    mocks.leaveShare.mockRejectedValue(new Error('network'));

    render(
      <CommunityFeed
        allShares={[]}
        sharedWithMe={[buildShare()]}
        activeTab="withMe"
      />,
    );

    fireEvent.click(screen.getByTitle('Remove'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Remove' }));

    await waitFor(() => {
      expect(mocks.leaveShare).toHaveBeenCalledWith('s1');
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Confirm Remove' }),
    ).toBeEnabled();
  });
});
