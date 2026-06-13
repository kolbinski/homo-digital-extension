chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId === undefined) return
  chrome.sidePanel.open({ windowId: tab.windowId })
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return
  if (!tab.url?.includes('upgrade=success')) return
  chrome.tabs.remove(tabId)
  chrome.storage.local.set({ upgrade_success: Date.now() })
})
