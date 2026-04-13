import { useState, useEffect } from 'react';
import { syncQueue } from '../services/api';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      // Attempt to sync queued offline requests
      try {
        const synced = await syncQueue();
        if (synced > 0) console.log(`Synced ${synced} queued requests`);
      } catch {
        // Silent fail
      }
    };

    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
