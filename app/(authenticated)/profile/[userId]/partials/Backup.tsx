'use client';

import { ArrowDownTrayIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTranslations } from 'next-intl';

export default function Backup() {
  const t = useTranslations('Backup');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const handleExport = async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/v1/backup');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `daylog-export-${date}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'error' && (
          <Alert variant="destructive">
            <ExclamationTriangleIcon className="h-4 w-4" />
            <AlertDescription>{t('exportError')}</AlertDescription>
          </Alert>
        )}
        <Button
          onClick={handleExport}
          disabled={status === 'loading'}
          className="w-full sm:w-auto"
        >
          <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
          {status === 'loading' ? t('preparing') : t('download')}
        </Button>
      </CardContent>
    </Card>
  );
}
