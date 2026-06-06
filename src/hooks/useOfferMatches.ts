import { API_BASE_URL } from '../config'
import { useAuth } from './useAuth'

interface OfferSalary {
  min: number
  max: number
  currency: string
  type: string
  delta: number
}

export interface OfferMatch {
  client_id: string
  first_name: string
  last_name: string
  claude_score: number | null
  claude_role_fit: string | null
  salary?: OfferSalary[]
  source?: string
}

type FetchMatchesResult = { matches: OfferMatch[] } | { error: string }

export function useOfferMatches() {
  const { getToken } = useAuth()

  async function fetchMatches(pageUrl: string): Promise<FetchMatchesResult> {
    if (!pageUrl) return { matches: [] }
    const token = await getToken()
    if (!token) return { error: 'Not authenticated.' }
    const cleanUrl = pageUrl.split('?')[0]
    try {
      const res = await fetch(
        `${API_BASE_URL}/v1/offer-matches?url=${encodeURIComponent(cleanUrl)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (res.status === 401) return { error: 'Session expired. Please log in again.' }
      if (!res.ok) return { error: `Failed to load matches (${res.status}).` }
      const data = await res.json() as { matches: OfferMatch[] }
      console.log('[useOfferMatches] raw matches:', JSON.stringify(data.matches))
      return { matches: data.matches ?? [] }
    } catch {
      return { error: 'Network error. Check your connection.' }
    }
  }

  return { fetchMatches }
}
