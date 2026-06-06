import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../config'
import { useAuth } from '../hooks/useAuth'
import { useClients, type Client } from '../hooks/useClients'

interface UserOffer {
  id: string
  title: string
  company_name: string
  url?: string
  salary_b2b_max?: number
  claude_role_fit?: string
  missing_skills?: string[]
}

interface Props {
  onLogout: () => void
}

function formatSalary(value?: number): string | null {
  if (!value) return null
  return `${value.toLocaleString()} PLN`
}

interface ClientAccordionProps {
  client: Client
}

function ClientAccordion({ client }: ClientAccordionProps) {
  const { getToken } = useAuth()

  const [isOpen, setIsOpen] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [applyOffers, setApplyOffers] = useState<UserOffer[]>([])
  const [levelUpOffers, setLevelUpOffers] = useState<UserOffer[]>([])
  const [applyOpen, setApplyOpen] = useState(true)
  const [levelUpOpen, setLevelUpOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState<number | null>(null)

  useEffect(() => {
    async function loadCount() {
      const token = await getToken()
      if (!token) return
      try {
        const params = new URLSearchParams({ client_id: client.id, status: 'pending_apply', count_only: 'true' })
        const res = await fetch(`${API_BASE_URL}/v1/user-offers?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json() as { count?: number; total?: number }
        setPendingCount(data.count ?? data.total ?? null)
      } catch {
        // badge is optional — silent fail
      }
    }
    loadCount()
  }, [client.id])

  async function fetchOffers(status: string, hasLearningGoals = false): Promise<UserOffer[]> {
    const token = await getToken()
    if (!token) return []
    const params = new URLSearchParams({ client_id: client.id, status })
    if (hasLearningGoals) params.append('has_learning_goals', 'true')
    try {
      const res = await fetch(`${API_BASE_URL}/v1/user-offers?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return []
      const data = await res.json() as { offers?: UserOffer[] } | UserOffer[]
      const offers = (Array.isArray(data) ? data : data.offers) ?? []
      if (offers.length > 0) console.log('[ExploreTab] offer:', JSON.stringify(offers[0]))
      return offers
    } catch {
      return []
    }
  }

  async function handleToggle() {
    const opening = !isOpen
    setIsOpen(opening)
    if (opening && !hasLoaded) {
      setIsLoading(true)
      const [pending, levelUp] = await Promise.all([
        fetchOffers('pending_apply'),
        fetchOffers('ai_rejected', true),
      ])
      setApplyOffers(pending)
      setLevelUpOffers(levelUp)
      setIsLoading(false)
      setHasLoaded(true)
    }
  }

  function openOffer(url: string) {
    if (typeof chrome !== 'undefined') {
      chrome.tabs.create({ url, active: true })
    } else {
      window.open(url, '_blank')
    }
  }

  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">
            {client.first_name} {client.last_name}
          </span>
          {pendingCount !== null && (
            <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
              {pendingCount}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="border-t border-gray-200">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <svg className="animate-spin h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : (
            <>
              {/* Apply now sub-section */}
              <div className="border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => setApplyOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    Apply now ({applyOffers.length})
                  </span>
                  <svg
                    className={`w-3.5 h-3.5 text-gray-400 transition-transform ${applyOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {applyOpen && (
                  <div className="divide-y divide-gray-100">
                    {applyOffers.length === 0 ? (
                      <p className="px-3 py-2.5 text-xs text-gray-400">No offers to apply to</p>
                    ) : (
                      applyOffers.map((offer) => (
                        <button
                          key={offer.id}
                          type="button"
                          onClick={() => offer.url && openOffer(offer.url)}
                          disabled={!offer.url}
                          className="w-full px-3 py-2.5 text-left hover:bg-indigo-50 transition-colors disabled:cursor-default group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium text-gray-900 group-hover:text-indigo-700 leading-snug">
                              {offer.title} @ {offer.company_name}
                            </span>
                            {offer.url && (
                              <svg className="w-3 h-3 text-gray-400 group-hover:text-indigo-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            )}
                          </div>
                          {formatSalary(offer.salary_b2b_max) && (
                            <span className="text-xs text-gray-500 mt-0.5 block">
                              {formatSalary(offer.salary_b2b_max)} b2b max
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Level up sub-section */}
              <div>
                <button
                  type="button"
                  onClick={() => setLevelUpOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                      Level up & earn more ({levelUpOffers.length})
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        console.log('[ExploreTab] send email for client', client.id)
                      }}
                      className="text-base leading-none hover:opacity-70 transition-opacity"
                      title="Send email report"
                    >
                      ✉️
                    </button>
                  </div>
                  <svg
                    className={`w-3.5 h-3.5 text-gray-400 transition-transform ${levelUpOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {levelUpOpen && (
                  <div className="divide-y divide-gray-100">
                    {levelUpOffers.length === 0 ? (
                      <p className="px-3 py-2.5 text-xs text-gray-400">No learning offers</p>
                    ) : (
                      levelUpOffers.map((offer) => (
                        <div key={offer.id} className="px-3 py-2.5 flex flex-col gap-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium text-gray-900 leading-snug">
                              {offer.title} @ {offer.company_name}
                            </span>
                          </div>
                          {formatSalary(offer.salary_b2b_max) && (
                            <span className="text-xs text-gray-500">{formatSalary(offer.salary_b2b_max)} b2b max</span>
                          )}
                          {offer.claude_role_fit && (
                            <p className="text-xs text-gray-600 leading-relaxed">{offer.claude_role_fit}</p>
                          )}
                          {offer.missing_skills && offer.missing_skills.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {offer.missing_skills.map((skill) => (
                                <span key={skill} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                  {skill}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function ExploreTab({ onLogout }: Props) {
  const { fetchClients } = useClients()
  const [clients, setClients] = useState<Client[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const result = await fetchClients()
      if (cancelled) return
      setIsLoading(false)
      if ('error' in result) {
        setError(result.error)
        if (result.error.includes('Session expired')) onLogout()
      } else {
        setClients(result.clients)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg className="animate-spin h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  if (error) {
    return <p className="px-4 py-5 text-sm text-red-600">{error}</p>
  }

  return (
    <div className="px-4 py-5 flex flex-col gap-3">
      {clients.length === 0 ? (
        <p className="text-sm text-gray-500">No clients found.</p>
      ) : (
        clients.map((client) => (
          <ClientAccordion key={client.id} client={client} />
        ))
      )}
    </div>
  )
}
