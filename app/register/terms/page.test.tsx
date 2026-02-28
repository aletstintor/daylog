import type React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Page from './page';

vi.mock('framer-motion', async () => {
  const actual =
    await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    motion: {
      ...actual.motion,
      div: ({ children, ...props }: React.ComponentProps<'div'>) => {
        // filter out framer-motion props
        const domProps = { ...props };
        delete (domProps as Record<string, unknown>).initial;
        delete (domProps as Record<string, unknown>).animate;
        delete (domProps as Record<string, unknown>).transition;
        return <div {...domProps}>{children}</div>;
      },
    },
  };
});

// Avoid IntersectionObserver errors if any
const mockIntersectionObserver = vi.fn();
mockIntersectionObserver.mockReturnValue({
  observe: () => null,
  unobserve: () => null,
  disconnect: () => null,
});
window.IntersectionObserver = mockIntersectionObserver;

describe('Terms of Service Page', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the "Terms of Service" heading', () => {
    render(<Page />);
    const heading = screen.getByRole('heading', {
      name: /Terms of Service/i,
      level: 1,
    });
    expect(heading).toBeInTheDocument();
  });

  it('renders "Back to Registration" links', () => {
    render(<Page />);
    const backLinks = screen.getAllByRole('link', {
      name: /Back to Registration/i,
    });
    expect(backLinks.length).toBeGreaterThan(0);
    expect(backLinks[0]).toHaveAttribute('href', '/register');
  });

  it('renders the external license link', () => {
    render(<Page />);
    const externalLink = screen.getByRole('link', {
      name: /View License Detail/i,
    });
    expect(externalLink).toBeInTheDocument();
    expect(externalLink).toHaveAttribute(
      'href',
      'https://www.apache.org/licenses/LICENSE-2.0',
    );
  });

  it('renders the sections properly', () => {
    render(<Page />);
    expect(screen.getByText('Introduction')).toBeInTheDocument();
    expect(
      screen.getByText(/By registering for an account on our platform/),
    ).toBeInTheDocument();
    expect(screen.getByText('Your Account')).toBeInTheDocument();
    expect(screen.getByText('Acceptable Use')).toBeInTheDocument();
    expect(screen.getByText('License and Property')).toBeInTheDocument();
    expect(screen.getByText('Limitation of Liability')).toBeInTheDocument();
    expect(screen.getByText('Termination')).toBeInTheDocument();
    expect(screen.getByText('Changes to Terms')).toBeInTheDocument();
  });

  it('renders "I understand, take me back" link', () => {
    render(<Page />);
    const understandLink = screen.getByRole('link', {
      name: /I understand, take me back/i,
    });
    expect(understandLink).toBeInTheDocument();
    expect(understandLink).toHaveAttribute('href', '/register');
  });
});
