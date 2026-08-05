import { Prisma } from "@/prisma/generated/client";

type OrderBy = Prisma.NoteOrderByWithRelationInput | Prisma.BoardOrderByWithRelationInput;

export default function getSorting(sort: string): OrderBy[] {
    switch (sort) {
        case 'created_desc':
            return [{ createdAt: 'desc' }];
        case 'created_asc':
            return [{ createdAt: 'asc' }];
        case 'updated_desc':
            return [{ updatedAt: 'desc' }];
        case 'updated_asc':
            return [{ updatedAt: 'asc' }];
        case 'title_desc':
            return [{ title: 'desc' }];
        case 'title_asc':
            return [{ title: 'asc' }];
        case 'favorite_desc':
            return [{ favorite: 'desc' }, { createdAt: 'desc' }];
        default:
            return [{ createdAt: 'desc' }];
    }
}
