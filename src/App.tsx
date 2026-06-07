import { useEffect, useState } from 'react'
import LoginScreen from './components/LoginScreen'
import TabBar, { type Tab } from './components/TabBar'
import ExploreTab from './components/ExploreTab'
import SyncTab from './components/SyncTab'
import { useAuth } from './hooks/useAuth'

type AuthState = 'checking' | 'logged_out' | 'logged_in'

function App() {
  const { getToken, logout } = useAuth()
  const [authState, setAuthState] = useState<AuthState>('checking')
  const [activeTabId, setActiveTabId] = useState<number | undefined>()
  const [activeTab, setActiveTab] = useState<Tab>('explore')
  const [currentUrl, setCurrentUrl] = useState<string>('')
  const [isSyncing, setIsSyncing] = useState(false)

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
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
      } catch {
        // Already injected or page not injectable — continue
      }
      setActiveTabId(tabId)
      setCurrentUrl(tab.url?.split('?')[0] ?? '')
    })
  }, [])

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return

    function onActivated(activeInfo: { tabId: number }) {
      setActiveTabId(activeInfo.tabId)
      chrome.scripting.executeScript({ target: { tabId: activeInfo.tabId }, files: ['content.js'] }).catch(() => {})
      chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (!chrome.runtime.lastError) setCurrentUrl(tab.url?.split('?')[0] ?? '')
      })
    }

    function onUpdated(tabId: number, changeInfo: { status?: string }, tab: { active?: boolean; url?: string }) {
      if (changeInfo.status === 'complete' && tab.active) {
        setActiveTabId(tabId)
        chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {})
        setCurrentUrl(tab.url?.split('?')[0] ?? '')
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

  if (authState !== 'logged_in') {
    return <LoginScreen onLogin={() => setAuthState('logged_in')} />
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <span className="text-sm font-semibold text-gray-900 tracking-tight">Homo Digital</span>
        <button
          type="button"
          onClick={handleLogout}
          className="text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
        >
          Logout
        </button>
      </header>

      <TabBar activeTab={activeTab} onChange={setActiveTab} isSyncing={isSyncing} />

      <div className="flex-1 overflow-y-auto">
        <div style={{ display: activeTab === 'explore' ? 'block' : 'none' }}>
          <ExploreTab onLogout={handleLogout} activeTabId={activeTabId} currentUrl={currentUrl} />
        </div>
        <div style={{ display: activeTab === 'sync' ? 'block' : 'none' }}>
          <SyncTab onSyncingChange={setIsSyncing} />
        </div>
      </div>
    </div>
  )
}

export default App
