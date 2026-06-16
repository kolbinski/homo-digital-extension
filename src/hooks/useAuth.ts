import { API_BASE_URL } from '../config'

const JWT_KEY = 'jwt'
const ROLE_KEY = 'role'
const OAUTH_DATA_KEY = 'oauth_data'

export interface OAuthData {
  oauth_first_name: string | null
  oauth_last_name: string | null
  oauth_photo_url: string | null
  oauth_email: string
}

type LoginResult = { success: true } | { success: false; error: string }

function storageAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage
}

function getToken(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!storageAvailable()) { resolve(null); return }
    chrome.storage.local.get(JWT_KEY, (result) => {
      if (chrome.runtime.lastError) {
        resolve(null)
        return
      }
      resolve((result[JWT_KEY] as string | undefined) ?? null)
    })
  })
}

function setToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    if (!storageAvailable()) { resolve(); return }
    chrome.storage.local.set({ [JWT_KEY]: token }, () => {
      if (chrome.runtime.lastError) {
      }
      resolve()
    })
  })
}

function removeToken(): Promise<void> {
  return new Promise((resolve) => {
    if (!storageAvailable()) { resolve(); return }
    chrome.storage.local.remove(JWT_KEY, () => {
      if (chrome.runtime.lastError) {
      }
      resolve()
    })
  })
}


function setRole(role: string): Promise<void> {
  return new Promise((resolve) => {
    if (!storageAvailable()) { resolve(); return }
    chrome.storage.local.set({ [ROLE_KEY]: role }, () => {
      if (chrome.runtime.lastError) {
      }
      resolve()
    })
  })
}

function getRole(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!storageAvailable()) { resolve(null); return }
    chrome.storage.local.get(ROLE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        resolve(null)
        return
      }
      resolve((result[ROLE_KEY] as string | undefined) ?? null)
    })
  })
}

function removeRole(): Promise<void> {
  return new Promise((resolve) => {
    if (!storageAvailable()) { resolve(); return }
    chrome.storage.local.remove(ROLE_KEY, () => {
      if (chrome.runtime.lastError) {
      }
      resolve()
    })
  })
}

function setOAuthData(data: OAuthData): Promise<void> {
  return new Promise((resolve) => {
    if (!storageAvailable()) { resolve(); return }
    chrome.storage.local.set({ [OAUTH_DATA_KEY]: data }, () => {
      if (chrome.runtime.lastError) {
      }
      resolve()
    })
  })
}

function getOAuthData(): Promise<OAuthData | null> {
  return new Promise((resolve) => {
    if (!storageAvailable()) { resolve(null); return }
    chrome.storage.local.get(OAUTH_DATA_KEY, (result) => {
      if (chrome.runtime.lastError) {
        resolve(null)
        return
      }
      resolve((result[OAUTH_DATA_KEY] as OAuthData | undefined) ?? null)
    })
  })
}

function removeOAuthData(): Promise<void> {
  return new Promise((resolve) => {
    if (!storageAvailable()) { resolve(); return }
    chrome.storage.local.remove(OAUTH_DATA_KEY, () => {
      if (chrome.runtime.lastError) {
      }
      resolve()
    })
  })
}

async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/auth/agent/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (res.status === 401) return { success: false, error: 'Invalid credentials.' }
    if (!res.ok) return { success: false, error: 'Login failed. Please try again.' }
    const data = await res.json() as { token: string }
    await setToken(data.token)
    return { success: true }
  } catch {
    return { success: false, error: 'Network error. Check your connection.' }
  }
}

async function logout(): Promise<void> {
  await Promise.all([removeToken(), removeRole(), removeOAuthData()])
}

export function useAuth() {
  return { login, logout, getToken, setToken, getRole, setRole, getOAuthData, setOAuthData }
}
