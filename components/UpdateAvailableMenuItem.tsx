'use client';

import type { AvailableUpdate } from '@/app/(authenticated)/lib/version';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { ArrowUpCircleIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';

export function UpdateBadge() {
  return (
    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground ring-2 ring-background">
      1
    </span>
  );
}

export default function UpdateAvailableMenuItem({
  update,
}: {
  update: AvailableUpdate;
}) {
  const t = useTranslations('UpdateAvailable');

  return (
    <DropdownMenuItem asChild>
      <a
        href={update.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex cursor-pointer items-center py-2.5"
      >
        <ArrowUpCircleIcon className="mr-3 h-4 w-4 shrink-0" />
        <span className="flex flex-col">
          <span className="font-medium">{t('title')}</span>
          <span className="text-xs text-muted-foreground">
            {t('description', { version: update.version })}
          </span>
        </span>
      </a>
    </DropdownMenuItem>
  );
}
