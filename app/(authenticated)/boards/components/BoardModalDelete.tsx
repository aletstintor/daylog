'use client';

import { deleteBoard } from '@/app/(authenticated)/boards/lib/actions';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import { Board } from '@/prisma/generated/client';

type BoardModalDeleteType = {
  board: Board;
};

export default function BoardModalDelete({ board }: BoardModalDeleteType) {
  return (
    <ConfirmDeleteModal
      namespace="BoardDelete"
      entityTitle={board.title}
      onDelete={() => deleteBoard(board)}
      triggerClassName="h-8 w-8 text-white hover:text-white hover:bg-white/10"
      triggerIconClassName="h-5 w-5"
    />
  );
}
