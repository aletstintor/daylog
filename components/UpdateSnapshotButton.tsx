'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowPathIcon, CheckIcon } from '@heroicons/react/24/outline';
import { createOrUpdateSnapshot } from '@/app/(authenticated)/shared/lib/actions';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface UpdateSnapshotButtonProps {
  shareId: string;
  snapshotUpdatedAt?: Date | string | null;
  variant?: 'header' | 'table';
}

export default function UpdateSnapshotButton({
  shareId,
  snapshotUpdatedAt,
  variant = 'header',
}: UpdateSnapshotButtonProps) {
  const t = useTranslations('UpdateSnapshot');
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleUpdate = async () => {
    setLoading(true);
    try {
      await createOrUpdateSnapshot(shareId);
      setDone(true);
      router.refresh();
      setTimeout(() => setDone(false), 2500);
    } catch (e) {
      console.error('Failed to update snapshot:', e);
    } finally {
      setLoading(false);
    }
  };

  if (variant === 'table') {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleUpdate}
        disabled={loading}
        className={`h-9 w-9 rounded-xl transition-all ${done ? 'bg-emerald-500/10 text-emerald-500' : 'hover:bg-primary/10 hover:text-primary'}`}
        title={done ? t('updated') : t('update')}
      >
        {done ? (
          <CheckIcon className="h-4 w-4" />
        ) : (
          <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        )}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        onClick={handleUpdate}
        disabled={loading}
        className="h-12 w-12 sm:w-auto px-0 sm:px-4 rounded-xl gap-2 bg-background/50 backdrop-blur-sm border-border hover:bg-muted transition-all shrink-0 font-bold text-[10px] uppercase tracking-widest shadow-sm"
        title={done ? t('updated') : t('update')}
      >
        {done ? (
          <CheckIcon className="h-4 w-4 text-emerald-500 shrink-0" />
        ) : (
          <ArrowPathIcon className={`h-4 w-4 text-foreground/70 shrink-0 ${loading ? 'animate-spin' : ''}`} />
        )}
        <span className="hidden sm:block">{done ? t('updated') : t('update')}</span>
      </Button>
      {snapshotUpdatedAt && (
        <span className="hidden lg:block text-[10px] font-medium text-muted-foreground/50 uppercase tracking-widest">
          {t('lastUpdated', {
            date: new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(
              new Date(snapshotUpdatedAt),
            ),
          })}
        </span>
      )}
    </div>
  );
}
