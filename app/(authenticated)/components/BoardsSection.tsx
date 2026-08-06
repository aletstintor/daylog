import BoardsGrid from '@/app/partials/BoardsGrid';
import { getBoards } from '@/app/(authenticated)/boards/lib/actions';

export default async function BoardsSection({
  showFav,
}: {
  showFav: boolean;
}) {
  const boards = await getBoards(
    showFav ? 'created_desc' : 'favorite_desc',
    7,
    showFav,
  );

  return <BoardsGrid boards={boards ?? []} showFav={showFav} />;
}
