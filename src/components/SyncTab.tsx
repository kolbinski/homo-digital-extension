import { useEffect, useRef, useState } from 'react'
import { API_BASE_URL } from '../config'
import { useAuth } from '../hooks/useAuth'

interface SyncClientResult {
  client_id: string
  first_name: string
  last_name: string
  new_offers_count: number
  email_report?: string
}

interface SyncResult {
  total_new_offers: number
  clients: SyncClientResult[]
}

type SyncState = 'idle' | 'syncing' | 'done' | 'error'

function ClientReportAccordion({ client }: { client: SyncClientResult }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <span className="text-sm text-gray-800">
          {client.first_name} {client.last_name}
          <span className="ml-2 text-xs text-gray-500">— {client.new_offers_count} new offers</span>
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
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
  )
}

export default function SyncTab() {
  const { getToken } = useAuth()
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [jobId, setJobId] = useState<string | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!jobId) return
    intervalRef.current = setInterval(async () => {
      const token = await getToken()
      if (!token) return
      try {
        const res = await fetch(`${API_BASE_URL}/v1/sync/status?job_id=${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          setError(`Status check failed (${res.status}).`)
          setSyncState('error')
          if (intervalRef.current) clearInterval(intervalRef.current)
          return
        }
        const data = await res.json() as { status: string } & SyncResult
        if (data.status === 'done') {
          setResult(data)
          setSyncState('done')
          if (intervalRef.current) clearInterval(intervalRef.current)
        } else if (data.status === 'failed') {
          setError('Sync job failed on the server.')
          setSyncState('error')
          if (intervalRef.current) clearInterval(intervalRef.current)
        }
      } catch {
        setError('Network error while checking sync status.')
        setSyncState('error')
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    }, 3000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [jobId])

  async function handleSync() {
    setSyncState('syncing')
    setError(null)
    setResult(null)
    const token = await getToken()
    if (!token) { setError('Not authenticated.'); setSyncState('error'); return }
    try {
      const res = await fetch(`${API_BASE_URL}/v1/sync/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { setError(`Sync start failed (${res.status}).`); setSyncState('error'); return }
      const data = await res.json() as { job_id: string }
      setJobId(data.job_id)
    } catch {
      setError('Network error. Check your connection.')
      setSyncState('error')
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
          <svg className="animate-spin h-6 w-6 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-gray-600">Syncing… checking status</p>
        </div>
      )}

      {syncState === 'error' && (
        <>
          <div className="text-sm px-3 py-2.5 rounded-md border bg-red-50 text-red-700 border-red-200">
            {error}
          </div>
          <button
            type="button"
            onClick={() => { setSyncState('idle'); setJobId(null) }}
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
            {result.clients.map((client) => (
              <ClientReportAccordion key={client.client_id} client={client} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => { setSyncState('idle'); setJobId(null); setResult(null) }}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-md text-sm transition-colors"
          >
            Sync again
          </button>
        </>
      )}
    </div>
  )
}
