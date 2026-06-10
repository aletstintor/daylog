'use client';

import SortSelector from '@/components/SortSelector';
import { setUserNotesSort } from '../lib/actions';

export default function NoteSortSelector({
  sortingParam,
  boardId,
}: {
  sortingParam?: string;
  boardId: number;
}) {
  return (
    <SortSelector
      sortingParam={sortingParam}
      namespace="NotesPage"
      basePath={`/boards/${boardId}/notes`}
      onSortChange={setUserNotesSort}
    />
  );
}
