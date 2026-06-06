import { useEffect, useRef, useState } from 'react'
import type { OfferMatch } from '../hooks/useOfferMatches'

const CV_LANGUAGES = ['English', 'Polish', 'German', 'French', 'Spanish', 'Dutch', 'Ukrainian']

type GenerateCVResult = { success: true } | { success: false; error: string }

interface MatchItemProps {
  match: OfferMatch
  defaultLanguage: string
  onGenerateCV: (clientId: string, cvLanguage: string, signal: AbortSignal) => Promise<GenerateCVResult>
}

function providerIcon(source?: string): string | null {
  if (!source) return null
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return null
  return chrome.runtime.getURL(`icons/${source}.png`)
}

function scoreBadgeClass(score: number): string {
  if (score >= 80) return 'bg-green-100 text-green-700 border border-green-200'
  if (score >= 60) return 'bg-amber-100 text-amber-700 border border-amber-200'
  return 'bg-red-100 text-red-700 border border-red-200'
}

function formatNum(n: number): string {
  const sign = n < 0 ? '-' : ''
  return sign + Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function MatchItem({ match, defaultLanguage, onGenerateCV }: MatchItemProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [cvLanguage, setCvLanguage] = useState(defaultLanguage)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setCvLanguage(defaultLanguage)
  }, [defaultLanguage])

  async function handleGenerate() {
    const controller = new AbortController()
    abortRef.current = controller
    setIsGenerating(true)
    setStatus(null)
    const result = await onGenerateCV(match.client_id, cvLanguage, controller.signal)
    setIsGenerating(false)
    if (!result.success) {
      if (result.error) setStatus({ type: 'error', message: result.error })
    } else {
      setStatus({ type: 'success', message: 'CV ready — save as PDF in the print dialog' })
    }
  }

  function handleAbort() {
    abortRef.current?.abort()
    setIsGenerating(false)
    setStatus(null)
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
          {providerIcon(match.source) && (
            <img src={providerIcon(match.source)!} width={16} height={16} className="shrink-0" />
          )}
          {match.first_name} {match.last_name}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {match.claude_score !== null && (
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${scoreBadgeClass(match.claude_score)}`}>
              {match.claude_score}%
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-gray-100">
          {match.salary && match.salary.length > 0 && (
            <div className="flex flex-col gap-0.5 pt-2">
              {match.salary.map((s, i) => (
                <span key={i} className="text-xs text-gray-500">
                  💰 {formatNum(s.min)} – {formatNum(s.max)} {s.currency} ({s.type}) {s.delta >= 0 ? '+' : ''}{formatNum(s.delta)} {s.currency}
                </span>
              ))}
            </div>
          )}
          {match.claude_role_fit && (
            <p className="text-xs text-gray-600 leading-relaxed pt-2">
              <span className="font-medium">Role fit:</span> {match.claude_role_fit}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-700">CV Language</label>
            <select
              value={cvLanguage}
              onChange={(e) => setCvLanguage(e.target.value)}
              disabled={isGenerating}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
            >
              {CV_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>

          {isGenerating ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled
                className="flex-1 bg-indigo-400 cursor-not-allowed text-white font-medium py-2 px-3 rounded-md text-sm flex items-center justify-center gap-2"
              >
                <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating…
              </button>
              <button
                type="button"
                onClick={handleAbort}
                className="flex-1 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-medium py-2 px-3 rounded-md text-sm transition-colors"
              >
                Abort
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGenerate}
              className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium py-2 px-3 rounded-md text-sm transition-colors flex items-center justify-center"
            >
              Generate CV
            </button>
          )}

          {status && (
            <div className={`text-xs px-2.5 py-2 rounded-md border ${
              status.type === 'success'
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              {status.message}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface MatchListProps {
  matches: OfferMatch[]
  isLoading?: boolean
  error?: string | null
  defaultLanguage?: string
  onGenerateCV: (clientId: string, cvLanguage: string, signal: AbortSignal) => Promise<GenerateCVResult>
}

export default function MatchList({ matches, isLoading, error, defaultLanguage = 'English', onGenerateCV }: MatchListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <svg className="animate-spin h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>
  }

  if (matches.length === 0) {
    return <p className="text-sm text-gray-500">No pending matches for this offer</p>
  }

  return (
    <div className="flex flex-col divide-y divide-gray-200 border border-gray-200 rounded-md overflow-hidden">
      {matches.map((match) => (
        <MatchItem
          key={match.client_id}
          match={match}
          defaultLanguage={defaultLanguage}
          onGenerateCV={onGenerateCV}
        />
      ))}
    </div>
  )
}
