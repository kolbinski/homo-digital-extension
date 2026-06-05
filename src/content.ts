const MAX_TEXT_LENGTH = 5000

const LANG_MAP: Record<string, string> = {
  pl: 'Polish',
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  nl: 'Dutch',
  uk: 'Ukrainian',
}

function detectLanguage(): string {
  const htmlLang = document.documentElement.lang?.trim().toLowerCase().slice(0, 2)
  if (htmlLang && LANG_MAP[htmlLang]) return LANG_MAP[htmlLang]

  const metaLang = document
    .querySelector<HTMLMetaElement>('meta[http-equiv="content-language"]')
    ?.content?.trim().toLowerCase().slice(0, 2)
  if (metaLang && LANG_MAP[metaLang]) return LANG_MAP[metaLang]

  return 'English'
}

const pageText = document.body.innerText.trim().slice(0, MAX_TEXT_LENGTH)
const detectedLanguage = detectLanguage()

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_PAGE_DATA') {
    sendResponse({ text: pageText, language: detectedLanguage })
  }
})
