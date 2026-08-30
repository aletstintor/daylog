import { cleanup, screen } from '@testing-library/react';
import { renderWithIntl } from '@/utils/test/renderWithIntl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';
import UpdateAvailableMenuItem, { UpdateBadge } from './UpdateAvailableMenuItem';

// DropdownMenuItem needs a Radix menu context, so render its child directly.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({ children }: PropsWithChildren<{ asChild?: boolean }>) => children,
}));

const update = { version: 'v1.2.3', url: 'https://example.com/releases/v1.2.3' };

describe('UpdateAvailableMenuItem', () => {
  beforeEach(cleanup);

  it('links to the release url in a new tab', () => {
    renderWithIntl(<UpdateAvailableMenuItem update={update} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', update.url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows the title and the available version', () => {
    renderWithIntl(<UpdateAvailableMenuItem update={update} />);

    expect(screen.getByText('New version available')).toBeInTheDocument();
    expect(screen.getByText('daylog v1.2.3 is available.')).toBeInTheDocument();
  });

  it('UpdateBadge renders a single-item counter', () => {
    renderWithIntl(<UpdateBadge />);

    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
