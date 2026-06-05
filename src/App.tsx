import { useEffect, useState } from 'react'
import LoginScreen from './components/LoginScreen'
import MainScreen from './components/MainScreen'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [detectedLanguage, setDetectedLanguage] = useState('English')

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

  return (
    <div className="w-full">
      {isLoggedIn ? (
        <MainScreen
          onLogout={() => setIsLoggedIn(false)}
          defaultLanguage={detectedLanguage}
        />
      ) : (
        <LoginScreen onLogin={() => setIsLoggedIn(true)} />
      )}
    </div>
  )
}

export default App
