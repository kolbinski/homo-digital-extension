import { useEffect, useState } from 'react'
import LoginScreen from './components/LoginScreen'
import MainScreen from './components/MainScreen'
import { useAuth } from './hooks/useAuth'

type AuthState = 'checking' | 'logged_out' | 'logged_in'

function App() {
  const { getToken, logout } = useAuth()
  const [authState, setAuthState] = useState<AuthState>('checking')
  const [detectedLanguage, setDetectedLanguage] = useState('English')
  const [activeTabId, setActiveTabId] = useState<number | undefined>()
  const [currentUrl, setCurrentUrl] = useState('')

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
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0]
      const tabId = tab?.id
      if (tabId === undefined) return

      if (tab.url) setCurrentUrl(tab.url)

      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
      } catch {
        // Already injected or page not injectable (chrome:// etc.) — continue anyway
      }

      setActiveTabId(tabId)
      chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_DATA' }, (response: { language?: string }) => {
        if (chrome.runtime.lastError) return
        if (response?.language) setDetectedLanguage(response.language)
      })
    })
  }, [])

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return

    function onActivated(activeInfo: { tabId: number }) {
      setActiveTabId(activeInfo.tabId)
      chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (chrome.runtime.lastError) return
        if (tab.url) setCurrentUrl(tab.url)
      })
      chrome.scripting.executeScript({ target: { tabId: activeInfo.tabId }, files: ['content.js'] }).catch(() => {})
    }

    function onUpdated(tabId: number, changeInfo: { status?: string }, tab: { active?: boolean; url?: string }) {
      if (changeInfo.status === 'complete' && tab.active) {
        if (tab.url) setCurrentUrl(tab.url)
        setActiveTabId(tabId)
        chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {})
      }
    }

    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onUpdated.addListener(onUpdated)
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onUpdated.removeListener(onUpdated)
    }
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
          activeTabId={activeTabId}
          currentUrl={currentUrl}
        />
      ) : (
        <LoginScreen onLogin={() => setAuthState('logged_in')} />
      )}
    </div>
  )
}

export default App
