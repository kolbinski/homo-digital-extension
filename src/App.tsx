import { useEffect, useState } from 'react';
import { Gear } from '@phosphor-icons/react';
import Spinner from './components/Spinner';
import LoginScreen from './components/LoginScreen';
import ClientView from './components/ClientView';
import TabBar, { type Tab } from './components/TabBar';
import ExploreTab from './components/ExploreTab';
import SyncTab from './components/SyncTab';
import SettingsDrawer from './components/SettingsDrawer';
import { useAuth } from './hooks/useAuth';
import { API_BASE_URL, SHOW_TABS } from './config';
import { generalSettingsStore } from './store/generalSettingsStore';

type AuthState = 'checking' | 'logged_out' | 'logged_in' | 'client';

function App() {
  const { getToken, getRole, logout } = useAuth();
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [activeTabId, setActiveTabId] = useState<number | undefined>();
  const [activeTab, setActiveTab] = useState<Tab>('explore');
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<{
    show_sync_tab_in_extension: boolean;
  }>({
    show_sync_tab_in_extension: false,
  });

  useEffect(() => {
    generalSettingsStore.fetch();
  }, []);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      setAuthState('logged_out');
      return;
    }
    Promise.all([getToken(), getRole()])
      .then(([token, role]) => {
        if (!token) setAuthState('logged_out');
        else if (role === 'client') setAuthState('client');
        else setAuthState('logged_in');
      })
      .catch(err => {
        console.error('[App] init auth error:', err);
        setAuthState('logged_out');
      });
  }, []);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;
    chrome.tabs.query({ active: true, currentWindow: true }, async tabs => {
      const tab = tabs[0];
      const tabId = tab?.id;
      if (tabId === undefined) return;
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js'],
        });
      } catch {
        // Already injected or page not injectable — continue
      }
      setActiveTabId(tabId);
      const rawUrl0 = tab.url ?? '';
      setCurrentUrl(
        rawUrl0.includes('justjoin.it') || rawUrl0.includes('nofluffjobs.com')
          ? rawUrl0.split('?')[0]
          : rawUrl0,
      );
    });
  }, []);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;

    function onActivated(activeInfo: { tabId: number }) {
      setActiveTabId(activeInfo.tabId);
      chrome.scripting
        .executeScript({
          target: { tabId: activeInfo.tabId },
          files: ['content.js'],
        })
        .catch(() => {});
      chrome.tabs.get(activeInfo.tabId, tab => {
        if (!chrome.runtime.lastError) {
          const rawUrl = tab.url ?? '';
          setCurrentUrl(
            rawUrl.includes('justjoin.it') || rawUrl.includes('nofluffjobs.com')
              ? rawUrl.split('?')[0]
              : rawUrl,
          );
        }
      });
    }

    function onUpdated(
      tabId: number,
      changeInfo: { status?: string },
      tab: { active?: boolean; url?: string },
    ) {
      if (changeInfo.status === 'complete' && tab.active) {
        setActiveTabId(tabId);
        chrome.scripting
          .executeScript({ target: { tabId }, files: ['content.js'] })
          .catch(() => {});
        const rawUrl = tab.url ?? '';
        setCurrentUrl(
          rawUrl.includes('justjoin.it') || rawUrl.includes('nofluffjobs.com')
            ? rawUrl.split('?')[0]
            : rawUrl,
        );
      }
    }

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  useEffect(() => {
    if (authState !== 'logged_in') return;
    getToken().then(token => {
      if (!token) return;
      fetch(`${API_BASE_URL}/v1/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(data => setSettings(data))
        .catch(() => {});
    });
  }, [authState]);

  useEffect(() => {
    if (!settings.show_sync_tab_in_extension && activeTab === 'sync') {
      setActiveTab('explore');
    }
  }, [settings.show_sync_tab_in_extension]);

  async function handleLogout() {
    try {
      await logout();
    } catch (err) {
      console.error('[App] logout error:', err);
    }
    setAuthState('logged_out');
  }

  function handleLogin(role: 'agent' | 'client') {
    setAuthState(role === 'client' ? 'client' : 'logged_in');
  }

  if (authState === 'checking') {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Spinner size={20} className="text-blue-500" />
      </div>
    );
  }

  if (authState === 'logged_out') {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (authState === 'client') {
    return (
      <ClientView
        onLogout={handleLogout}
        activeTabId={activeTabId}
        currentUrl={currentUrl}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <span />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSettingsOpen(v => !v)}
            className="text-gray-800 hover:text-gray-700 transition-colors"
            aria-label="Settings"
          >
            <Gear size={16} />
          </button>
        </div>
      </header>
      {settingsOpen && (
        <SettingsDrawer
          onClose={() => setSettingsOpen(false)}
          onLogout={handleLogout}
        />
      )}

      {SHOW_TABS && (
        <TabBar
          activeTab={activeTab}
          onChange={setActiveTab}
          isSyncing={isSyncing}
          showSync={settings.show_sync_tab_in_extension}
        />
      )}

      <div id="main-scroll" className="flex-1 overflow-y-auto">
        {SHOW_TABS ? (
          <>
            <div
              className="h-full"
              style={{ display: activeTab === 'explore' ? 'block' : 'none' }}
            >
              <ExploreTab
                onLogout={handleLogout}
                activeTabId={activeTabId}
                currentUrl={currentUrl}
              />
            </div>
            {settings.show_sync_tab_in_extension && (
              <div style={{ display: activeTab === 'sync' ? 'block' : 'none' }}>
                <SyncTab onSyncingChange={setIsSyncing} />
              </div>
            )}
          </>
        ) : (
          <ExploreTab
            onLogout={handleLogout}
            activeTabId={activeTabId}
            currentUrl={currentUrl}
          />
        )}
      </div>
    </div>
  );
}

export default App;
