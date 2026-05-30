import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Backup from './Backup';

const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();

Object.defineProperty(globalThis, 'URL', {
  value: {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  },
  writable: true,
});

describe('Backup', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the backup card', () => {
    render(<Backup />);

    expect(screen.getByText('Backup')).toBeDefined();
    expect(screen.getByText(/Export all your boards/i)).toBeDefined();
    expect(screen.getByText(/Download ZIP/i)).toBeDefined();
  });

  it('shows preparing state while export is in progress', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );

    render(<Backup />);
    fireEvent.click(screen.getByText(/Download ZIP/i));

    await waitFor(() => {
      expect(screen.getByText(/Preparing export/i)).toBeDefined();
    });

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('triggers download when export succeeds', async () => {
    const mockBlob = new Blob(['zip content'], { type: 'application/zip' });
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, blob: () => Promise.resolve(mockBlob) }),
      ),
    );

    const anchorClick = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        const el = originalCreateElement('a');
        el.click = anchorClick;
        return el;
      }
      return originalCreateElement(tag);
    });

    render(<Backup />);
    fireEvent.click(screen.getByText(/Download ZIP/i));

    await waitFor(() => {
      expect(anchorClick).toHaveBeenCalled();
    });

    expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('shows error when export fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false })),
    );

    render(<Backup />);
    fireEvent.click(screen.getByText(/Download ZIP/i));

    await waitFor(() => {
      expect(screen.getByText(/Export failed/i)).toBeDefined();
    });
  });

  it('resets to idle after successful download', async () => {
    const mockBlob = new Blob(['zip content'], { type: 'application/zip' });
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, blob: () => Promise.resolve(mockBlob) }),
      ),
    );

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') el.click = vi.fn();
      return el;
    });

    render(<Backup />);
    fireEvent.click(screen.getByText(/Download ZIP/i));

    await waitFor(() => {
      expect(screen.getByText(/Download ZIP/i)).toBeDefined();
    });

    const button = screen.getByRole('button');
    expect(button).not.toBeDisabled();
  });
});
