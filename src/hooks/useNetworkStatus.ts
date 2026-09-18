import { useState, useEffect } from 'react';
import { networkService } from '../services/networkService';

export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(networkService.isOnline());

  useEffect(() => {
    const unsubscribe = networkService.subscribe((online) => {
      setIsOnline(online);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return isOnline;
}
