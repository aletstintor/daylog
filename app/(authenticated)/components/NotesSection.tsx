import NotesGrid from '@/app/partials/NotesGrid';
import { getNotes } from '@/app/(authenticated)/boards/[id]/notes/lib/actions';

export default async function NotesSection({
  showFav,
}: {
  showFav: boolean;
}) {
  const notes = await getNotes('created_desc', 20, null, showFav);

  return <NotesGrid notes={notes ?? []} showFav={showFav} />;
}
