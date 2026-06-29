chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId === undefined) return
  chrome.sidePanel.open({ windowId: tab.windowId })
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return
  if (tab.url?.includes('upgrade=scan_package')) {
    chrome.tabs.remove(tabId)
    chrome.storage.local.set({ scan_package_purchased: Date.now() })
    return
  }
  if (tab.url?.includes('upgrade=cv_package')) {
    chrome.tabs.remove(tabId)
    chrome.storage.local.set({ cv_package_purchased: Date.now() })
    return
  }
  if (tab.url?.includes('upgrade=cl_package')) {
    chrome.tabs.remove(tabId)
    chrome.storage.local.set({ cl_package_purchased: Date.now() })
    return
  }
  if (tab.url?.includes('upgrade=profile_rematch_package')) {
    chrome.tabs.remove(tabId)
    chrome.storage.local.set({ profile_rematch_purchased: Date.now() })
    return
  }
  if (tab.url?.includes('upgrade=review_package')) {
    chrome.tabs.remove(tabId)
    chrome.storage.local.set({ review_package_purchased: Date.now() })
    return
  }
  if (tab.url?.includes('upgrade=cancelled')) {
    chrome.tabs.remove(tabId)
    chrome.storage.local.set({ upgrade_cancelled: Date.now() })
    return
  }
  if (!tab.url?.includes('upgrade=success')) return
  chrome.tabs.remove(tabId)
  chrome.storage.local.set({ upgrade_success: Date.now() })
})

// Detect form submission via navigation — most reliable for native + SPA forms.
// Fires when the application tab URL changes (redirect to Thank You page).
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return
  chrome.storage.local.get('pending_application', (result) => {
    const pending = result.pending_application as Record<string, unknown> & { application_tab_id?: number } | undefined
    if (pending?.application_tab_id !== tabId) return
    // Null out application_tab_id to prevent re-firing on subsequent navigations
    chrome.storage.local.set({ pending_application: { ...pending, application_tab_id: null } })
    chrome.runtime.sendMessage({ type: 'FORM_SUBMITTED' }, () => {
      if (chrome.runtime.lastError) { /* side panel not open */ }
    })
  })
})

// When a tab is opened from the offer page, pre-assign it as the application tab
// (covers the window before the content script loads and sends FORM_DETECTED)
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.openerTabId == null) return
  chrome.storage.local.get('pending_application', (result) => {
    const pending = result.pending_application as Record<string, unknown> | undefined
    if (pending && pending.application_tab_id == null && tab.id != null) {
      console.log('[appTab] SW setting application_tab_id:', tab.id, 'openerTabId:', tab.openerTabId)
      chrome.storage.local.set({
        pending_application: { ...pending, application_tab_id: tab.id },
      })
    }
  })
})

// Clear pending_application only when the application form tab itself is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get('pending_application', (result) => {
    const pending = result.pending_application as { application_tab_id?: number } | undefined
    if (pending?.application_tab_id === tabId) {
      chrome.storage.local.remove('pending_application')
    }
  })
})

// When content script detects an application form, record the sender tab ID
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FORM_DETECTED' && sender.tab?.id != null) {
    const tabId = sender.tab.id
    chrome.storage.local.get('pending_application', (result) => {
      const pending = result.pending_application as Record<string, unknown> | undefined
      if (pending) {
        chrome.storage.local.set({
          pending_application: { ...pending, application_tab_id: tabId },
        })
      }
    })
    return
  }
  if (message.type === 'GET_CURRENT_TAB_ID') {
    sendResponse(sender.tab?.id ?? null)
    return true
  }
  if (message.type === 'GET_PENDING_APPLICATION') {
    chrome.storage.local.get('pending_application', (result) => {
      sendResponse(result.pending_application ?? null)
    })
    return true
  }
  if (message.type === 'SET_PENDING_APPLICATION') {
    chrome.storage.local.set({ pending_application: message.data }, () => sendResponse())
    return true
  }
})
