import { useEffect, useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { tdrApi, aseApi } from '../services/api';
import { getPendingQueue, removeFromPending, getPendingCount } from '../utils/offlineQueue';

export function useOfflineSync() {
  const [isOnline, setIsOnline]         = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing]           = useState(false);

  const refreshCount = useCallback(async () => {
    setPendingCount(await getPendingCount());
  }, []);

  const sync = useCallback(async () => {
    if (!navigator.onLine || syncing) return;
    const queue = await getPendingQueue();
    if (queue.length === 0) return;
    setSyncing(true);
    let synced = 0; let failed = 0;
    for (const item of queue) {
      try {
        if      (item.type === 'agent')       await tdrApi.createAgent(item.data as any);
        else if (item.type === 'visit')       await tdrApi.createVisit(item.data as any);
        else if (item.type === 'prospect')    await tdrApi.createProspect(item.data as any);
        else if (item.type === 'float_issue')  await tdrApi.createFloatIssue(item.data as any);
        else if (item.type === 'reactivation') await tdrApi.createReactivation(item.data as any);
        else if (item.type === 'site_focus') {
          const d = item.data as any;
          if (d._op === 'update' && d._id) {
            const { _op, _id, ...payload } = d;
            await aseApi.updateSiteFocus(_id, payload);
          } else {
            const { _op, _id, ...payload } = d;
            await aseApi.saveSiteFocus(payload);
          }
        }
        await removeFromPending(item.id);
        synced++;
      } catch { failed++; }
    }
    setSyncing(false);
    await refreshCount();
    if (synced > 0) {
      toast.success(`✅ ${synced} offline record${synced > 1 ? 's' : ''} synced!`, { duration: 5000 });
      window.dispatchEvent(new CustomEvent('zamtel-offline-synced'));
    }
    if (failed > 0) toast.error(`${failed} record${failed > 1 ? 's' : ''} failed to sync — will retry`);
  }, [syncing, refreshCount]);

  useEffect(() => {
    refreshCount();
    const onOnline  = () => { setIsOnline(true);  toast.loading('📡 Back online — syncing...', { id: 'sync', duration: 2000 }); setTimeout(() => sync(), 1500); };
    const onOffline = () => { setIsOnline(false); toast.error('📵 Offline — data saved locally', { id: 'offline', duration: 4000 }); };
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    if (navigator.onLine) sync();
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [sync, refreshCount]);

  return { isOnline, pendingCount, syncing, sync };
}
