const MAX_TEXT_LENGTH = 5000

const pageText = document.body.innerText.trim().slice(0, MAX_TEXT_LENGTH)

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_PAGE_DATA') {
    sendResponse({ text: pageText })
  }
})
