import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../config';
import { useAuth } from '../hooks/useAuth';

interface SyncClientResult {
  client_id: string;
  first_name: string;
  last_name: string;
  new_offers_count: number;
  stretch_offers_count: number;
  email_report?: string;
}

interface SyncResult {
  total_new_offers: number;
  clients: SyncClientResult[];
}

type SyncState = 'idle' | 'syncing' | 'done' | 'error';

function ClientReportAccordion({ client }: { client: SyncClientResult }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-800">
            {client.first_name} {client.last_name}
          </span>
          {client.new_offers_count > 0 && (
            <span className="text-xs font-medium bg-green-100 text-green-800 px-1.5 py-0.5 rounded">
              {client.new_offers_count}
            </span>
          )}
          {client.stretch_offers_count > 0 && (
            <span className="text-xs font-medium bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
              {client.stretch_offers_count}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isOpen && client.email_report && (
        <div className="border-t border-gray-200 px-3 py-3 max-h-[400px] overflow-y-auto">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">
            {client.email_report}
          </pre>
        </div>
      )}
      {isOpen && !client.email_report && (
        <div className="border-t border-gray-200 px-3 py-3">
          <p className="text-xs text-gray-400">No report available.</p>
        </div>
      )}
    </div>
  );
}

export default function SyncTab() {
  const { getToken } = useAuth();
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

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
      const MAX_RECONNECTS = 5;

      function connectSSE(jobId: string, sseToken: string) {
        const es = new EventSource(
          `${API_BASE_URL}/v1/sync/progress?job_id=${jobId}&token=${sseToken}`,
        );
        esRef.current = es;

        es.onmessage = e => {
          console.log('[SyncTab] SSE message:', e.data);
          reconnectAttempts = 0;
          const msg = JSON.parse(e.data) as {
            progress?: number;
            status?: string;
          } & Partial<SyncResult>;
          console.log(
            '[SyncTab] progress:',
            msg.progress,
            'status:',
            msg.status,
          );
          console.log('[SyncTab] clients:', JSON.stringify(msg.clients));
          if (msg.progress !== undefined) setProgress(msg.progress);
          if (msg.status === 'done') {
            es.close();
            esRef.current = null;
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
            setTimeout(() => connectSSE(jobId, sseToken), 2000);
          } else {
            setError('Connection lost during sync.');
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
          Sync job offers
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
          <p className="text-sm text-gray-600">Syncing… {progress}%</p>
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
            {result.total_new_offers} new offers found
          </div>
          <div className="flex flex-col gap-2">
            {result.clients
              .filter(c => c.new_offers_count > 0 || c.stretch_offers_count > 0)
              .map(client => (
                <ClientReportAccordion key={client.client_id} client={client} />
              ))}
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
