import { API_BASE_URL } from '../config'
import { useAuth } from './useAuth'

export interface OfferMatch {
  client_id: string
  first_name: string
  last_name: string
  score: number
  claude_role_fit: string
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
      const data = await res.json() as { matches: Array<Omit<OfferMatch, 'score'> & { claude_score: number }> }
      console.log('[useOfferMatches] raw matches:', JSON.stringify(data.matches))
      const matches = (data.matches ?? []).map((m) => ({ ...m, score: m.claude_score }))
      return { matches }
    } catch {
      return { error: 'Network error. Check your connection.' }
    }
  }

  return { fetchMatches }
}
