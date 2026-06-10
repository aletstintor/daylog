'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

type AuthErrorAlertProps = {
  title: string;
  message?: string;
};

export default function AuthErrorAlert({ title, message }: AuthErrorAlertProps) {
  if (!message) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0, y: -10 }}
      animate={{ opacity: 1, height: 'auto', y: 0 }}
      exit={{ opacity: 0, height: 0, y: -10 }}
    >
      <Alert variant="destructive" className="glass-card">
        <ExclamationTriangleIcon className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    </motion.div>
  );
}
