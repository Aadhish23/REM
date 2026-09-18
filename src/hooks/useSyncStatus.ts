import { useState, useEffect, useCallback } from 'react';
import { syncService } from '../services/syncService';
import { SyncStatus } from '../types/sync';

export function useSyncStatus(): {
  status: SyncStatus;
  syncNow: () => Promise<void>;
} {
  const [status, setStatus] = useState<SyncStatus>(syncService.getStatus());

  useEffect(() => {
    const unsubscribe = syncService.subscribe((nextStatus) => {
      setStatus(nextStatus);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const syncNow = useCallback(async () => {
    await syncService.syncNow();
  }, []);

  return { status, syncNow };
}
