import { API_BASE_URL } from '../config'
import { useAuth } from './useAuth'

export interface Client {
  id: string
  first_name: string
  last_name: string
  email: string
  photo_url?: string | null
  profile?: Record<string, unknown>
}

type FetchClientsResult = { clients: Client[] } | { error: string }

export function useClients() {
  const { getToken } = useAuth()

  async function fetchClients(): Promise<FetchClientsResult> {
    const token = await getToken()
    if (!token) return { error: 'Not authenticated.' }

    try {
      const res = await fetch(`${API_BASE_URL}/v1/clients`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) return { error: 'Session expired. Please log in again.' }
      if (!res.ok) return { error: 'Failed to load clients. Please try again.' }
      const data = await res.json() as Client[]
      return { clients: data }
    } catch (err) {
      console.error('[useClients] fetchClients network error:', err)
      return { error: 'Network error. Check your connection.' }
    }
  }

  return { fetchClients }
}
