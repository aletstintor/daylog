'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { DocumentTextIcon, Squares2X2Icon, GlobeAltIcon, UsersIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { AlertOctagon } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { getImageUrlOrFile } from '@/utils/image';
import type { CommunityShare } from '@/app/(authenticated)/shared/lib/actions';
import { leaveShare } from '@/app/(authenticated)/shared/lib/actions';

interface CommunityFeedProps {
  allShares: CommunityShare[];
  sharedWithMe: CommunityShare[];
  activeTab: 'all' | 'withMe';
}

function formatRelative(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ShareCard({
  share,
  removable,
  t,
}: {
  share: CommunityShare;
  removable?: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const [open, setOpen] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await leaveShare(share.id);
      setOpen(false);
      router.refresh();
    } catch {
      setRemoving(false);
    }
  };

  const coverUrl = share.imageUrl ? getImageUrlOrFile(share.imageUrl) : null;

  return (
    <div className="group flex flex-col rounded-[20px] border border-border bg-background hover:shadow-sm transition-all duration-300 overflow-hidden">
      {/* Cover image */}
      {coverUrl ? (
        <div className="relative aspect-video w-full overflow-hidden">
          <Image
            src={coverUrl}
            alt={share.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <span className="absolute bottom-2 left-3 text-[10px] uppercase tracking-widest font-black text-white/80">
            {share.entityType === 'NOTE' ? t('typeNote') : t('typeBoard')}
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-center aspect-video w-full bg-muted/50 border-b border-border">
          {share.entityType === 'NOTE' ? (
            <DocumentTextIcon className="h-10 w-10 text-muted-foreground/30" />
          ) : (
            <Squares2X2Icon className="h-10 w-10 text-muted-foreground/30" />
          )}
        </div>
      )}

      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-black text-sm tracking-tight truncate">{share.title}</p>
            {!coverUrl && (
              <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mt-0.5">
                {share.entityType === 'NOTE' ? t('typeNote') : t('typeBoard')}
              </p>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground font-medium shrink-0 mt-0.5">
            {formatRelative(share.createdAt)}
          </span>
        </div>

        {share.creatorName && (
          <p className="text-[11px] text-muted-foreground font-medium">
            {t('sharedBy', { name: share.creatorName })}
          </p>
        )}

      <div className="flex gap-2">
        <Button
          asChild
          variant={share.canEdit ? 'default' : 'outline'}
          className="h-9 rounded-xl text-[11px] font-black uppercase tracking-widest flex-1"
        >
          {share.canEdit ? (
            <Link href={`/share/${share.id}`}>
              {t('editButton')}
            </Link>
          ) : (
            <Link href={`/share/${share.id}`} target="_blank" rel="noopener noreferrer">
              {t('viewButton')}
            </Link>
          )}
        </Button>

        {removable && (
          <Dialog open={open} onOpenChange={setOpen}>

            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                disabled={removing}
                title={t('removeButton')}
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="p-10 max-w-[480px]">
              <DialogHeader className="mb-6">
                <Label className="text-destructive">{t('removeSecurity')}</Label>
                <DialogTitle>{t('removeConfirm')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-8">
                <p className="text-sm text-muted-foreground leading-relaxed antialiased">
                  {t('removeDescription', { title: share.title })}
                </p>
                <div className="p-4 bg-[var(--color-accent-red)] rounded-[12px] border border-destructive/20">
                  <p className="text-[12px] text-destructive font-medium leading-normal flex gap-2">
                    <AlertOctagon className="h-4 w-4 flex-shrink-0" />
                    {t('removeWarning')}
                  </p>
                </div>
              </div>
              <DialogFooter className="mt-8">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  className="rounded-[12px] text-muted-foreground font-bold hover:bg-secondary/10"
                  disabled={removing}
                >
                  {t('removeCancel')}
                </Button>
                <Button
                  variant="danger"
                  onClick={handleRemove}
                  disabled={removing}
                  className="font-bold px-8 shadow-none"
                >
                  {removing ? t('removeRemoving') : t('removeConfirmButton')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      </div>
    </div>
  );
}

export default function CommunityFeed({ allShares, sharedWithMe, activeTab }: CommunityFeedProps) {
  const t = useTranslations('CommunityPage');

  const items = activeTab === 'all' ? allShares : sharedWithMe;
  const isEmpty = items.length === 0;

  return (
    <div className="space-y-6">
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            {activeTab === 'all' ? (
              <GlobeAltIcon className="h-8 w-8 text-muted-foreground" />
            ) : (
              <UsersIcon className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <p className="font-black text-lg tracking-tight">
            {activeTab === 'all' ? t('emptyAll') : t('emptySharedWithMe')}
          </p>
          <p className="text-sm text-muted-foreground mt-2 max-w-xs">
            {activeTab === 'all' ? t('emptyAllDescription') : t('emptySharedWithMeDescription')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((share) => (
            <ShareCard
              key={share.id}
              share={share}
              removable={activeTab === 'withMe'}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}
