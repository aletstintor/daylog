'use client';

import SortSelector from '@/components/SortSelector';
import { setUserBoardsSort } from '../lib/actions';

export default function BoardSortSelector({
  sortingParam,
}: {
  sortingParam?: string;
}) {
  return (
    <SortSelector
      sortingParam={sortingParam}
      namespace="BoardsPage"
      basePath="/boards"
      onSortChange={setUserBoardsSort}
    />
  );
}
