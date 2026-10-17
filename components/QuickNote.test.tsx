import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QuickNote from './QuickNote';

vi.mock('@/app/(authenticated)/boards/[id]/notes/lib/actions', () => ({
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteImage: vi.fn(),
  saveImage: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn(), push: vi.fn() })),
}));

const boards = [{ id: 1, title: 'Inbox' }];

describe('QuickNote', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders nothing without boards', () => {
    const { container } = render(<QuickNote boards={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the create modal on Alt+N', () => {
    render(<QuickNote boards={boards} />);
    expect(screen.queryByText('Create note')).not.toBeInTheDocument();

    fireEvent.keyDown(document, { altKey: true, code: 'KeyN' });

    expect(screen.getByText('Create note')).toBeInTheDocument();
  });

  it('ignores Alt+N while typing in a field', () => {
    render(
      <>
        <input data-testid="field" />
        <QuickNote boards={boards} />
      </>,
    );

    fireEvent.keyDown(screen.getByTestId('field'), { altKey: true, code: 'KeyN' });

    expect(screen.queryByText('Create note')).not.toBeInTheDocument();
  });

  it('ignores Alt+N inside contenteditable content', () => {
    render(
      <>
        <div contentEditable="plaintext-only">
          <span data-testid="inner">text</span>
        </div>
        <QuickNote boards={boards} />
      </>,
    );
    // jsdom lacks isContentEditable; emulate the browser's inherited value.
    Object.defineProperty(screen.getByTestId('inner'), 'isContentEditable', {
      value: true,
    });

    fireEvent.keyDown(screen.getByTestId('inner'), { altKey: true, code: 'KeyN' });

    expect(screen.queryByText('Create note')).not.toBeInTheDocument();
  });
});
