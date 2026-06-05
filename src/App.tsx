import { useState } from 'react'
import LoginScreen from './components/LoginScreen'
import MainScreen from './components/MainScreen'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  return (
    <div className="w-full">
      {isLoggedIn ? (
        <MainScreen
          onLogout={() => setIsLoggedIn(false)}
          detectedLanguage="English"
        />
      ) : (
        <LoginScreen onLogin={() => setIsLoggedIn(true)} />
      )}
    </div>
  )
}

export default App
