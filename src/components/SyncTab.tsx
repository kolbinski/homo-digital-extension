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
  const [progress, setProgress] = useState(0);
  const [reconnectStatus, setReconnectStatus] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    onSyncingChange?.(syncState === 'syncing');
  }, [syncState]);

  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  async function handleSync() {
    setSyncState('syncing');
    setProgress(0);
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

      let reconnectAttempts = 0;
      const MAX_RECONNECTS = 20;

      function connectSSE(jobId: string, sseToken: string) {
        const es = new EventSource(
          `${API_BASE_URL}/v1/sync/progress?job_id=${jobId}&token=${sseToken}`,
        );
        esRef.current = es;

        es.onmessage = e => {
          console.log('[SyncTab] SSE message:', e.data);
          reconnectAttempts = 0;
          setReconnectStatus(null);
          const msg = JSON.parse(e.data) as {
            progress?: number;
            status?: string;
          } & Partial<SyncResult>;
          console.log('[SyncTab] progress:', msg.progress, 'status:', msg.status);
          console.log('[SyncTab] SSE done payload:', JSON.stringify(msg));
          if (msg.progress !== undefined) setProgress(msg.progress);
          if (msg.status === 'done') {
            es.close();
            esRef.current = null;
            setReconnectStatus(null);
            setResult(msg as SyncResult);
            setSyncState('done');
          } else if (msg.status === 'failed' || msg.status === 'error') {
            es.close();
            esRef.current = null;
            setError('Sync failed. Try again.');
            setSyncState('error');
          }
        };

        es.onerror = e => {
          console.error('[SyncTab] SSE error:', e);
          es.close();
          esRef.current = null;
          if (reconnectAttempts < MAX_RECONNECTS) {
            reconnectAttempts++;
            setReconnectStatus(`Reconnecting... (${reconnectAttempts}/${MAX_RECONNECTS})`);
            setTimeout(() => connectSSE(jobId, sseToken), 3000);
          } else {
            setError('Connection lost during sync. Check back later.');
            setSyncState('error');
          }
        };
      }

      connectSSE(data.job_id, token);
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
          <p className="text-sm text-gray-600">
            {reconnectStatus ?? `Syncing… ${progress}%`}
          </p>
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
