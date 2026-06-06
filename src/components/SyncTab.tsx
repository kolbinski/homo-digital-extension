import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../config';
import { useAuth } from '../hooks/useAuth';

interface SyncResult {
  total_new_offers: number;
  total_clients: number;
}

type SyncState = 'idle' | 'syncing' | 'done' | 'error';

interface SyncTabProps {
  onSyncingChange?: (isSyncing: boolean) => void;
}

export default function SyncTab({ onSyncingChange }: SyncTabProps) {
  const { getToken } = useAuth();
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    onSyncingChange?.(syncState === 'syncing');
  }, [syncState]);

  useEffect(() => {
    return () => {
      if (pollRef.current !== null) clearInterval(pollRef.current);
    };
  }, []);

  async function handleSync() {
    setSyncState('syncing');
    setError(null);
    setResult(null);

    const token = await getToken();
    if (!token) {
      setError('Not authenticated.');
      setSyncState('error');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/v1/sync/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError(`Sync start failed (${res.status}).`);
        setSyncState('error');
        return;
      }
      const data = (await res.json()) as { job_id: string };
      const jobId = data.job_id;

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(
            `${API_BASE_URL}/v1/sync/status?job_id=${jobId}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const statusData = (await statusRes.json()) as {
            status?: string;
          } & Partial<SyncResult>;

          console.log('[SyncTab] poll:', statusData.status);

          if (statusData.status === 'done') {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setResult(statusData as SyncResult);
            setSyncState('done');
          } else if (statusData.status === 'error' || statusData.status === 'failed') {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setError('Sync failed. Try again.');
            setSyncState('error');
          }
        } catch (err) {
          console.warn('[SyncTab] poll error, retrying:', err);
        }
      }, 5000);
    } catch {
      setError('Network error. Check your connection.');
      setSyncState('error');
    }
  }

  return (
    <div className="px-4 py-5 flex flex-col gap-4">
      {syncState === 'idle' && (
        <button
          type="button"
          onClick={handleSync}
          className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium py-2 px-4 rounded-md text-sm transition-colors"
        >
          Sync job offers & send report to client
        </button>
      )}

      {syncState === 'syncing' && (
        <div className="flex flex-col items-center gap-3 py-6">
          <svg
            className="animate-spin h-6 w-6 text-indigo-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="text-sm text-gray-600">Syncing… It may take a long time.</p>
        </div>
      )}

      {syncState === 'error' && (
        <>
          <div className="text-sm px-3 py-2.5 rounded-md border bg-red-50 text-red-700 border-red-200">
            {error}
          </div>
          <button
            type="button"
            onClick={() => setSyncState('idle')}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-md text-sm transition-colors"
          >
            Try again
          </button>
        </>
      )}

      {syncState === 'done' && result && (
        <>
          <div className="text-sm px-3 py-2.5 rounded-md border bg-green-50 text-green-700 border-green-200">
            {result.total_new_offers > 0
              ? `Sync completed. Created ${result.total_new_offers} new matches across ${result.total_clients} clients.`
              : 'Sync completed. No new matches found.'}
          </div>
          <button
            type="button"
            onClick={() => {
              setSyncState('idle');
              setResult(null);
            }}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-md text-sm transition-colors"
          >
            Sync again
          </button>
        </>
      )}
    </div>
  );
}
