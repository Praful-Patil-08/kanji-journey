import { useEffect } from 'react';
import { WifiOff, Wifi, CloudUpload } from 'lucide-react';
import { useOfflineStatus } from '@/lib/offline/useOfflineStatus';
import { initOfflineSync } from '@/lib/offline/sync';
import { getQueue } from '@/lib/offline/queue';
import { toast } from 'sonner';

export function OfflineIndicator() {
  const { isOffline } = useOfflineStatus();

  useEffect(() => {
    const cleanup = initOfflineSync((result) => {
      if (result.succeeded > 0) {
        toast.success(`Synced ${result.succeeded} offline ${result.succeeded === 1 ? 'item' : 'items'}`, {
          description: result.failed > 0 ? `${result.failed} failed, will retry` : undefined,
        });
      }
    });
    return cleanup;
  }, []);

  if (!isOffline) {
    const pending = getQueue().length;
    if (pending > 0) {
      return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 backdrop-blur-md text-amber-200 text-xs font-bold">
          <CloudUpload size={14} />
          <span>{pending} offline {pending === 1 ? 'change' : 'changes'} pending — will sync when online</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="fixed top-0 inset-x-0 z-[90] flex items-center justify-center gap-2 py-2 bg-amber-500/90 text-black text-xs font-black uppercase tracking-[0.12em] backdrop-blur-md">
      <WifiOff size={14} />
      <span>Offline — using cached data • changes will sync when back online</span>
      <Wifi size={14} className="opacity-50" />
    </div>
  );
}
