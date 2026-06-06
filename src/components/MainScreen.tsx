import { useEffect, useState } from 'react'
import MatchList from './MatchList'
import { useOfferMatches, type OfferMatch } from '../hooks/useOfferMatches'
import { useCvGenerate } from '../hooks/useCvGenerate'

interface Props {
  onLogout: () => void
  defaultLanguage?: string
  activeTabId?: number
  currentUrl?: string
}

function getPageText(tabId: number): Promise<string> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined') { resolve(''); return }
    chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_DATA' }, (response: { text?: string }) => {
      if (chrome.runtime.lastError) {
        console.error('[getPageText] sendMessage error:', chrome.runtime.lastError.message)
        resolve('')
        return
      }
      console.log('[getPageText] response text length:', response?.text?.length ?? 0)
      resolve(response?.text ?? '')
    })
  })
}

export default function MainScreen({ onLogout, defaultLanguage = 'English', activeTabId, currentUrl = '' }: Props) {
  const { fetchMatches } = useOfferMatches()
  const { generateCV } = useCvGenerate()

  const [matches, setMatches] = useState<OfferMatch[]>([])
  const [isLoadingMatches, setIsLoadingMatches] = useState(false)
  const [matchesError, setMatchesError] = useState<string | null>(null)

  useEffect(() => {
    if (!currentUrl) return
    let cancelled = false
    async function load() {
      setIsLoadingMatches(true)
      setMatchesError(null)
      const result = await fetchMatches(currentUrl)
      if (cancelled) return
      setIsLoadingMatches(false)
      if ('error' in result) {
        setMatchesError(result.error)
        if (result.error.includes('Session expired')) onLogout()
      } else {
        setMatches(result.matches)
      }
    }
    load()
    return () => { cancelled = true }
  }, [currentUrl])

  async function handleGenerateCV(
    clientId: string,
    cvLanguage: string,
    signal: AbortSignal,
  ): Promise<{ success: true } | { success: false; error: string }> {
    if (activeTabId === undefined) {
      return { success: false, error: 'Could not read page content. Make sure you are on a job offer page.' }
    }
    const offerText = await getPageText(activeTabId)
    if (!offerText.trim()) {
      return { success: false, error: 'Could not read page content. Make sure you are on a job offer page.' }
    }
    return generateCV(clientId, offerText, cvLanguage, signal)
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

      <main className="flex-1 px-4 py-5">
        <MatchList
          matches={matches}
          isLoading={isLoadingMatches}
          error={matchesError}
          defaultLanguage={defaultLanguage}
          onGenerateCV={handleGenerateCV}
        />
      </main>
    </div>
  )
}
