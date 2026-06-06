import { useEffect, useState } from 'react'
import { useClients, type Client } from '../hooks/useClients'
import { useCvGenerate } from '../hooks/useCvGenerate'

interface Props {
  onLogout: () => void
  defaultLanguage?: string
}

const CV_LANGUAGES = ['English', 'Polish', 'German', 'French', 'Spanish', 'Dutch', 'Ukrainian']

function getPageText(): Promise<string> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.tabs) { resolve(''); return }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id
      if (tabId === undefined) { resolve(''); return }
      chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_DATA' }, (response: { text?: string }) => {
        if (chrome.runtime.lastError) { resolve(''); return }
        resolve(response?.text ?? '')
      })
    })
  })
}

export default function MainScreen({ onLogout, defaultLanguage = 'English' }: Props) {
  const { fetchClients } = useClients()
  const { generateCV } = useCvGenerate()

  const [selectedClient, setSelectedClient] = useState('')
  const [cvLanguage, setCvLanguage] = useState(defaultLanguage)
  const [openAfterDownload, setOpenAfterDownload] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const [clients, setClients] = useState<Client[]>([])
  const [isLoadingClients, setIsLoadingClients] = useState(true)
  const [clientsError, setClientsError] = useState<string | null>(null)

  useEffect(() => {
    setCvLanguage(defaultLanguage)
  }, [defaultLanguage])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const result = await fetchClients()
      if (cancelled) return
      setIsLoadingClients(false)
      if ('error' in result) {
        setClientsError(result.error)
        if (result.error === 'Session expired. Please log in again.') onLogout()
      } else {
        setClients(result.clients)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function handleGenerateCV() {
    const client = clients.find((c) => c.id === selectedClient)
    if (!client) return

    setIsGenerating(true)
    setStatus(null)

    const offerText = await getPageText()
    const result = await generateCV(client, offerText, cvLanguage, openAfterDownload)

    setIsGenerating(false)
    if (!result.success) {
      setStatus({ type: 'error', message: result.error })
    } else {
      setStatus({ type: 'success', message: 'CV ready — save as PDF in the print dialog' })
    }
  }

  const isGenerateDisabled = !selectedClient || isLoadingClients || isGenerating

  function clientLabel(c: Client) {
    return `${c.first_name} ${c.last_name} (${c.email})`
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <span className="text-sm font-semibold text-gray-900 tracking-tight">
          Homo Digital
        </span>
        <button
          type="button"
          onClick={onLogout}
          className="text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
        >
          Logout
        </button>
      </header>

      <main className="flex-1 px-4 py-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="client" className="text-sm font-medium text-gray-700">
            Client
          </label>
          {clientsError ? (
            <p className="text-sm text-red-600">{clientsError}</p>
          ) : (
            <select
              id="client"
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              disabled={isLoadingClients}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">{isLoadingClients ? 'Loading clients…' : 'Select client'}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{clientLabel(c)}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cv-language" className="text-sm font-medium text-gray-700">
            CV Language
          </label>
          <select
            id="cv-language"
            value={cvLanguage}
            onChange={(e) => setCvLanguage(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {CV_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={openAfterDownload}
            onChange={(e) => setOpenAfterDownload(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
          />
          <span className="text-sm text-gray-700">Open PDF after download</span>
        </label>

        <button
          type="button"
          onClick={handleGenerateCV}
          disabled={isGenerateDisabled}
          className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md text-sm transition-colors mt-1 flex items-center justify-center gap-2"
        >
          {isGenerating && (
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {isGenerating ? 'Generating…' : 'Generate CV'}
        </button>

        {status && (
          <div
            className={`text-sm px-3 py-2.5 rounded-md border ${
              status.type === 'success'
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {status.message}
          </div>
        )}
      </main>
    </div>
  )
}
