import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NoteModalForm from './NoteModalForm';

const mocks = vi.hoisted(() => ({
  createNote: vi.fn(),
  saveImage: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/app/(authenticated)/boards/[id]/notes/lib/actions', () => ({
  createNote: mocks.createNote,
  updateNote: vi.fn(),
  deleteImage: vi.fn(),
  saveImage: mocks.saveImage,
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn(), push: mocks.push })),
}));

type ImageSectionStubProps = { onImageUrlChange: (url: string) => void };

// Stub: selecting a remote (Unsplash) image is a single click here.
vi.mock('@/components/ImageSection', () => ({
  default: ({ onImageUrlChange }: ImageSectionStubProps) => (
    <button type="button" onClick={() => onImageUrlChange('https://img.test/a.jpg')}>
      pick image
    </button>
  ),
}));

function fillAndSubmit() {
  fireEvent.change(screen.getByPlaceholderText('Your note title'), {
    target: { value: 'Draft title' },
  });
  fireEvent.click(screen.getByText('Create'));
}

describe('NoteModalForm create outcomes', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps the modal and draft when creation fails', async () => {
    mocks.createNote.mockResolvedValue(null);
    render(<NoteModalForm boardId={1} modalId="m" mode="create" open={true} />);

    fillAndSubmit();

    await waitFor(() => expect(mocks.createNote).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Create note')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Draft title')).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('opens the created note when the image upload fails', async () => {
    mocks.createNote.mockResolvedValue(5);
    mocks.saveImage.mockRejectedValue(new Error('upload failed'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<NoteModalForm boardId={1} modalId="m" mode="create" open={true} />);

    fireEvent.click(screen.getByText('pick image'));
    fillAndSubmit();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/boards/1/notes/5'),
    );
    expect(mocks.saveImage).toHaveBeenCalledWith(
      expect.objectContaining({ noteId: 5, imageUrl: 'https://img.test/a.jpg' }),
    );
    expect(mocks.createNote).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Create note')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });
});
