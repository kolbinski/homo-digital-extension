import { useEffect, useState } from 'react'

interface Props {
  onLogout: () => void
  defaultLanguage?: string
}

const PLACEHOLDER_CLIENTS = [
  { id: '1', name: 'Client A' },
  { id: '2', name: 'Client B' },
]

const CV_LANGUAGES = ['English', 'Polish', 'German', 'French', 'Spanish', 'Dutch', 'Ukrainian']

export default function MainScreen({ onLogout, defaultLanguage = 'English' }: Props) {
  const [selectedClient, setSelectedClient] = useState('')
  const [cvLanguage, setCvLanguage] = useState(defaultLanguage)

  useEffect(() => {
    setCvLanguage(defaultLanguage)
  }, [defaultLanguage])
  const [openAfterDownload, setOpenAfterDownload] = useState(false)
  const [status] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const isGenerateDisabled = !selectedClient

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
          <select
            id="client"
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="">Select client</option>
            {PLACEHOLDER_CLIENTS.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
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
          disabled={isGenerateDisabled}
          className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md text-sm transition-colors mt-1"
        >
          Generate CV
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
