import BoardsGrid from '@/app/partials/BoardsGrid';
import { getBoards } from '@/app/(authenticated)/boards/lib/actions';
import { Board } from '@/prisma/generated/client';

export default async function BoardsSection({
  showFav,
}: {
  showFav: boolean;
}) {
  const boards = await getBoards('created_desc', 7, showFav);

  const sortedBoards = showFav
    ? (boards ?? [])
    : [...(boards ?? [])].sort(
        (a: Board, b: Board) => +b.favorite - +a.favorite,
      );

  return <BoardsGrid boards={sortedBoards} showFav={showFav} />;
}
