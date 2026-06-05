import { useEffect, useState } from 'react'
import LoginScreen from './components/LoginScreen'
import MainScreen from './components/MainScreen'
import { useAuth } from './hooks/useAuth'

type AuthState = 'checking' | 'logged_out' | 'logged_in'

function App() {
  const { getToken, logout } = useAuth()
  const [authState, setAuthState] = useState<AuthState>('checking')
  const [detectedLanguage, setDetectedLanguage] = useState('English')

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      setAuthState('logged_out')
      return
    }
    getToken()
      .then((token) => { setAuthState(token ? 'logged_in' : 'logged_out') })
      .catch((err) => {
        console.error('[App] getToken error:', err)
        setAuthState('logged_out')
      })
  }, [])

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id
      if (tabId === undefined) return
      chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_DATA' }, (response: { language?: string }) => {
        if (chrome.runtime.lastError) return
        if (response?.language) setDetectedLanguage(response.language)
      })
    })
  }, [])

  async function handleLogout() {
    try {
      await logout()
    } catch (err) {
      console.error('[App] logout error:', err)
    }
    setAuthState('logged_out')
  }

  if (authState === 'checking') return null

  return (
    <div className="w-full">
      {authState === 'logged_in' ? (
        <MainScreen
          onLogout={handleLogout}
          defaultLanguage={detectedLanguage}
        />
      ) : (
        <LoginScreen onLogin={() => setAuthState('logged_in')} />
      )}
    </div>
  )
}

export default App
