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
  console.log('background: upgrade_success set')
})
