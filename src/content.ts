const MAX_TEXT_LENGTH = 5000
const pageText = document.body.innerText.trim().slice(0, MAX_TEXT_LENGTH)

// ─── Form detection ──────────────────────────────────────────────────────────

interface PendingApplicationShape {
  user_offer_id: string
  offer: Record<string, unknown>
  cv_url: string | null
  cl_url: string | null
  cl_txt: string | null
  offer_tab_id: number | null
  application_tab_id: number | null
  saved_at: number
}

// ─── Storage proxy helpers ────────────────────────────────────────────────────
// Content scripts cannot reliably access chrome.storage.local in all contexts.
// Delegate all storage reads/writes to the background service worker instead.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeSendMessage(message: object): Promise<any> {
  return new Promise((resolve) => {
    // chrome.runtime.id throws synchronously when context is invalidated — check it first
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      chrome.runtime.id
    } catch {
      stopAll()
      resolve(null)
      return
    }
    try {
      chrome.runtime.sendMessage(message, (response) => {
        try {
          if (chrome.runtime?.lastError) {
            const err = chrome.runtime.lastError.message ?? ''
            if (err.includes('invalidated') || err.includes('disconnected') || err.includes('closed') || err.includes('Extension')) {
              stopAll()
            }
            resolve(null)
            return
          }
          resolve(response ?? null)
        } catch {
          stopAll()
          resolve(null)
        }
      })
    } catch {
      stopAll()
      resolve(null)
    }
  })
}

function getCurrentTabId(): Promise<number | null> {
  return safeSendMessage({ type: 'GET_CURRENT_TAB_ID' }) as Promise<number | null>
}

function getPendingApplication(): Promise<PendingApplicationShape | null> {
  return safeSendMessage({ type: 'GET_PENDING_APPLICATION' }) as Promise<PendingApplicationShape | null>
}

function setPendingApplication(data: PendingApplicationShape | null): Promise<void> {
  return safeSendMessage({ type: 'SET_PENDING_APPLICATION', data }).then(() => undefined)
}

// Suppress unused-variable warning — setPendingApplication is provided for future use.
void (setPendingApplication as unknown)

// ─── Form detection state ─────────────────────────────────────────────────────

let formDetected = false
let detecting = false
let invalidated = false
let observer: MutationObserver | null = null

function stopAll() {
  invalidated = true
  if (observer) {
    observer.disconnect()
    observer = null
  }
}

function getFieldContext(el: Element): string {
  const ariaLabel = el.getAttribute('aria-label') ?? ''
  const placeholder = el.getAttribute('placeholder') ?? ''
  const name = el.getAttribute('name') ?? ''
  const id = el.getAttribute('id') ?? ''
  const type = el.getAttribute('type') ?? ''

  // Only the label directly associated with this element — text nodes only to avoid
  // picking up nested input labels; fall back to full label text capped at 50 chars.
  let labelText = ''
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`)
    if (label) {
      labelText = Array.from(label.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent ?? '')
        .join(' ')
        .trim()
      if (!labelText) labelText = (label.textContent ?? '').slice(0, 50)
    }
  }

  const dataSid = el.getAttribute('data-sid') ?? ''

  // No parent container text — sibling field labels bleed in and cause false matches.
  return `${ariaLabel} ${placeholder} ${name} ${id} ${type} ${labelText} ${dataSid}`.toLowerCase()
}

function attachSubmitListener() {
  document.querySelectorAll('form').forEach((form) => {
    form.addEventListener('submit', () => {
      void safeSendMessage({ type: 'FORM_SUBMITTED' })
    }, { once: true })
  })

  // Fallback: submit button click — catches SPA forms that never fire the submit event
  document.querySelectorAll<HTMLElement>('button[type="submit"], input[type="submit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void safeSendMessage({ type: 'FORM_SUBMITTED' })
    }, { once: true })
  })
}

async function detectAndNotify() {
  if (invalidated) return
  if (typeof chrome === 'undefined' || !chrome?.runtime) return
  if (formDetected || detecting) return
  detecting = true
  try {
    // 1. Gate on tab ID — only run on the exact tab identified as the application form tab
    const [tabId, pa] = await Promise.all([getCurrentTabId(), getPendingApplication()])
    if (pa?.application_tab_id == null || tabId !== pa.application_tab_id) {
      return
    }

    // 2. Email field
    const EMAIL_SEL =
      'input[type="email"], input[name*="email" i], input[id*="email" i],' +
      'input[placeholder*="email" i], input[autocomplete="email"]'
    const emailInput = document.querySelector<HTMLInputElement>(EMAIL_SEL)

    // 3. Name field (broad multi-locale selectors)
    const nameInput =
      document.querySelector<HTMLInputElement>(
        'input[autocomplete="given-name"], input[autocomplete="family-name"], input[autocomplete="name"],' +
        'input[name*="first" i], input[name*="fname" i], input[id*="firstname" i],' +
        'input[name*="last" i], input[name*="lname" i], input[id*="lastname" i]',
      ) ??
      document.querySelector<HTMLInputElement>(
        'input[placeholder*="first name" i], input[placeholder*="last name" i],' +
        'input[placeholder*="full name" i], input[placeholder*="your name" i],' +
        'input[placeholder*="imię" i], input[placeholder*="nazwisko" i],' +
        'input[placeholder*="prénom" i], input[placeholder*="nombre" i]',
      )

    // 4. CL field detection — CL-hinted file input OR CL-hinted textarea
    const CL_HINT = /\b(cover.?letter|covering.?letter|motivation|bewerbungsschreiben|list.?motywacyjny)\b/i
    const allFileInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'))
    const allTextareas = Array.from(document.querySelectorAll('textarea'))
    const clFileInput = allFileInputs.find(inp => CL_HINT.test(getFieldContext(inp)))
    const clTextarea = allTextareas.find(ta => CL_HINT.test(getFieldContext(ta)))
    const hasCLField = clFileInput !== undefined || clTextarea !== undefined
    // 5. All conditions — pending_application + email + name (file/textarea optional)
    const allMet = emailInput !== null && nameInput !== null
    if (allMet) {
      formDetected = true
      void safeSendMessage({ type: 'FORM_DETECTED', offer: pa!.offer, hasCLField })
      attachSubmitListener()
    }
  } finally {
    detecting = false
  }
}

function init() {
  if (typeof chrome === 'undefined' || !chrome?.runtime) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    chrome.runtime.id
  } catch { return }

  detectAndNotify().catch(stopAll)

  observer = new MutationObserver(() => {
    if (invalidated || formDetected) { stopAll(); return }
    detectAndNotify().catch(stopAll)
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
} catch {
  // silent — chrome APIs not available on this page
}

// ─── Form filling ─────────────────────────────────────────────────────────────

function fillInput(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  if (!value) return
  input.focus()
  const proto =
    input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  input.blur()
}

function fillSelect(select: HTMLSelectElement, value: string) {
  if (!value) return
  const lower = value.toLowerCase()
  for (const option of select.options) {
    if (
      option.text.toLowerCase().includes(lower) ||
      option.value.toLowerCase().includes(lower)
    ) {
      select.value = option.value
      select.dispatchEvent(new Event('change', { bubbles: true }))
      return
    }
  }
}

async function uploadFile(
  input: HTMLInputElement,
  fileUrl: string,
  fileName: string,
): Promise<boolean> {
  try {
    const response = await fetch(fileUrl)
    if (!response.ok) return false
    const blob = await response.blob()
    const file = new File([blob], fileName, { type: 'application/pdf' })
    const dt = new DataTransfer()
    dt.items.add(file)
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  } catch {
    return false
  }
}

function matchesCV(ctx: string): boolean {
  return /\b(cv|resume|curriculum|lebenslauf|životopis|resum[eé])\b/i.test(ctx)
}

function matchesCL(ctx: string): boolean {
  return /\b(cover.?letter|covering.?letter|motivation|bewerbungsschreiben|list.?motywacyjny)\b/i.test(
    ctx,
  )
}

interface FillPayload {
  type: 'FILL_FORM'
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  linkedin?: string
  github?: string
  city?: string
  country_code?: string
  cv_url?: string | null
  cl_url?: string | null
  cl_txt?: string | null
}

type TextField = 'email' | 'first_name' | 'last_name' | 'full_name' | 'phone' | 'linkedin' | 'github' | 'city' | 'country'

function detectBySid(dataSid: string): TextField | null {
  const s = dataSid.toLowerCase()
  if (s === 'email') return 'email'
  if (s === 'firstname') return 'first_name'
  if (s === 'lastname') return 'last_name'
  if (s === 'mobile' || s === 'phone') return 'phone'
  if (s === 'linkedin') return 'linkedin'
  if (s === 'github') return 'github'
  return null
}

function detectTextFieldType(inputType: string, ac: string, ctx: string): TextField | null {
  if (inputType === 'email' || ac === 'email' || /\b(email|e-mail|mail)\b/.test(ctx)) return 'email'
  if (ac === 'given-name' || /\b(first.?name|firstname|vorname|imię|prénom|nombre|given.?name)\b/.test(ctx)) return 'first_name'
  if (ac === 'family-name' || /\b(last.?name|lastname|surname|nachname|nazwisko|apellido|family.?name)\b/.test(ctx)) return 'last_name'
  if (
    (ac === 'name' || /\b(full.?name|fullname|your.?name)\b/.test(ctx)) &&
    !ctx.includes('company') && !ctx.includes('user') && !ctx.includes('first') && !ctx.includes('last')
  ) return 'full_name'
  if (inputType === 'tel' || ac === 'tel' || /\b(phone|telefon|telephone|mobile|tel|handynummer)\b/.test(ctx)) return 'phone'
  if (/\blinkedin\b/.test(ctx)) return 'linkedin'
  if (/\bgithub\b/.test(ctx)) return 'github'
  if (ac === 'address-level2' || /\b(city|miasto|stadt|ville|ciudad)\b/.test(ctx)) return 'city'
  if (ac === 'country' || ac === 'country-name' || /\b(country|kraj|land|pays|país)\b/.test(ctx)) return 'country'
  return null
}

async function fillForm(payload: FillPayload) {
  const allInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input'),
  )
  const textInputs = allInputs.filter(
    (i) =>
      i.type !== 'file' &&
      i.type !== 'checkbox' &&
      i.type !== 'radio' &&
      i.type !== 'submit' &&
      i.type !== 'button' &&
      i.type !== 'reset' &&
      i.type !== 'hidden',
  )
  const fileInputs = allInputs.filter((i) => i.type === 'file')
  const checkboxes = allInputs.filter((i) => i.type === 'checkbox')
  const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea'))
  const selects = Array.from(document.querySelectorAll<HTMLSelectElement>('select'))

  // Scan both inputs and textareas for text fields — some forms use textarea for
  // name/email/phone etc. fillInput() already handles both element types.
  const textFields: (HTMLInputElement | HTMLTextAreaElement)[] = [
    ...textInputs,
    ...textareas.filter(ta => {
      const ctx = getFieldContext(ta)
      return !matchesCL(ctx)
    }),
  ]

  for (const input of textFields) {
    const ac = (input.getAttribute('autocomplete') ?? '').toLowerCase()
    const inputType = input instanceof HTMLInputElement ? input.type : 'textarea'
    const dataSid = input.getAttribute('data-sid') ?? ''
    // Attributes only (no label text) — checked first for reliable signal
    const attrCtx = [
      input.getAttribute('aria-label') ?? '',
      input.getAttribute('placeholder') ?? '',
      input.getAttribute('name') ?? '',
      input.getAttribute('id') ?? '',
      dataSid,
    ].join(' ').toLowerCase()
    // Full context including label text — used only as fallback
    const ctx = getFieldContext(input)

    // Priority: data-sid → type/autocomplete → name/id/placeholder/aria-label → label text
    const fieldType = detectBySid(dataSid) ?? detectTextFieldType(inputType, ac, attrCtx) ?? detectTextFieldType(inputType, ac, ctx)

    if (fieldType === 'email') {
      fillInput(input, payload.email ?? '')
    } else if (fieldType === 'first_name') {
      fillInput(input, payload.first_name ?? '')
    } else if (fieldType === 'last_name') {
      fillInput(input, payload.last_name ?? '')
    } else if (fieldType === 'full_name') {
      const fullName = `${payload.first_name ?? ''} ${payload.last_name ?? ''}`.trim()
      fillInput(input, fullName)
    } else if (fieldType === 'phone') {
      fillInput(input, payload.phone ?? '')
      if (input.getAttribute('data-mask')) {
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))
      }
    } else if (fieldType === 'linkedin') {
      fillInput(input, payload.linkedin ?? '')
    } else if (fieldType === 'github') {
      fillInput(input, payload.github ?? '')
    } else if (fieldType === 'city') {
      fillInput(input, payload.city ?? '')
    } else if (fieldType === 'country') {
      fillInput(input, payload.country_code ?? '')
    }
  }

  for (const select of selects) {
    const ctx = getFieldContext(select)
    if (/\b(country|kraj)\b/.test(ctx) && payload.country_code) {
      fillSelect(select, payload.country_code)
    }
  }

  if (payload.cl_txt) {
    for (const textarea of textareas) {
      const ctx = getFieldContext(textarea)
      if (matchesCL(ctx)) {
        fillInput(textarea, payload.cl_txt)
        break
      }
    }
  }

  for (const checkbox of checkboxes) {
    if (checkbox.checked) continue
    const ctx = getFieldContext(checkbox)
    if (/\b(gdpr|rodo|consent|zgadzam|agree|privacy|datenschutz)\b/i.test(ctx)) {
      checkbox.click()
    }
  }

  if (fileInputs.length === 1) {
    if (payload.cv_url) {
      await uploadFile(fileInputs[0], payload.cv_url, 'cv.pdf')
    }
  } else {
    for (const input of fileInputs) {
      const ctx = getFieldContext(input)
      if (matchesCV(ctx) && payload.cv_url) {
        await uploadFile(input, payload.cv_url, 'cv.pdf')
      } else if (matchesCL(ctx) && payload.cl_url) {
        await uploadFile(input, payload.cl_url, 'cover_letter.pdf')
      }
    }
  }
}

// ─── Message handler ──────────────────────────────────────────────────────────

try { chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  try {
    if (message.type === 'GET_PAGE_DATA') {
      sendResponse({ text: pageText })
    } else if (message.type === 'FILL_FORM') {
      // Async IIFE — reads pending_application via background (no direct storage access);
      // return true synchronously so Chrome keeps the sendResponse channel open.
      void (async () => {
        try {
          const pa = await getPendingApplication().catch(() => null)
          const payload = message as FillPayload
          await fillForm({
            ...payload,
            cv_url: pa?.cv_url ?? payload.cv_url,
            cl_url: pa?.cl_url ?? payload.cl_url,
            cl_txt: pa?.cl_txt ?? payload.cl_txt,
          })
          sendResponse({ ok: true })
        } catch {
          stopAll()
          sendResponse({ ok: false })
        }
      })()
      return true
    }
  } catch {
    stopAll()
  }
}) } catch { /* silent — chrome.runtime not available on this page */ }
