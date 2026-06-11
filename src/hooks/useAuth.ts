import { API_BASE_URL } from '../config'

const JWT_KEY = 'jwt'

type LoginResult = { success: true } | { success: false; error: string }

function storageAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage
}

function getToken(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!storageAvailable()) { resolve(null); return }
    chrome.storage.local.get(JWT_KEY, (result) => {
      if (chrome.runtime.lastError) {
        console.error('[useAuth] getToken:', chrome.runtime.lastError.message)
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
        console.error('[useAuth] setToken:', chrome.runtime.lastError.message)
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
        console.error('[useAuth] removeToken:', chrome.runtime.lastError.message)
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
  } catch (err) {
    console.error('[useAuth] login network error:', err)
    return { success: false, error: 'Network error. Check your connection.' }
  }
}

async function logout(): Promise<void> {
  await removeToken()
}

export function useAuth() {
  return { login, logout, getToken, setToken }
}
