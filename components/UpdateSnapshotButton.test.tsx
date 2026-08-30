import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/utils/test/renderWithIntl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UpdateSnapshotButton from './UpdateSnapshotButton';

const mocks = vi.hoisted(() => ({
  createOrUpdateSnapshot: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/app/(authenticated)/shared/lib/actions', () => ({
  createOrUpdateSnapshot: mocks.createOrUpdateSnapshot,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

describe('UpdateSnapshotButton', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.createOrUpdateSnapshot.mockResolvedValue(undefined);
  });

  it('updates the snapshot and refreshes the route on click', async () => {
    renderWithIntl(<UpdateSnapshotButton shareId="share-1" />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByText('Updated!')).toBeInTheDocument());
    expect(mocks.createOrUpdateSnapshot).toHaveBeenCalledWith('share-1');
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('disables the button while the update is in flight', async () => {
    let finish: () => void = () => {};
    mocks.createOrUpdateSnapshot.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    renderWithIntl(<UpdateSnapshotButton shareId="share-1" />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());

    finish();
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('keeps the button usable when the action fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.createOrUpdateSnapshot.mockRejectedValue(new Error('boom'));
    renderWithIntl(<UpdateSnapshotButton shareId="share-1" />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(screen.queryByText('Updated!')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toBeEnabled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('shows the formatted snapshot date when provided', () => {
    const date = new Date('2026-03-04T10:30:00Z');
    renderWithIntl(<UpdateSnapshotButton shareId="share-1" snapshotUpdatedAt={date} />);

    const expected = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
    expect(screen.getByText(`Snapshot: ${expected}`)).toBeInTheDocument();
  });

  it('omits the snapshot date when there is none', () => {
    renderWithIntl(<UpdateSnapshotButton shareId="share-1" />);

    expect(screen.queryByText(/^Snapshot:/)).not.toBeInTheDocument();
  });

  it('renders the table variant as an icon-only button', () => {
    renderWithIntl(<UpdateSnapshotButton shareId="share-1" variant="table" />);

    expect(screen.getByTitle('Update')).toBeInTheDocument();
    // No visible label: the title attribute is the only accessible name.
    expect(screen.queryByText('Update')).not.toBeInTheDocument();
  });
});
