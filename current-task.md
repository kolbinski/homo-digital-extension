# Current Task

## Status: 🟡 In Progress

**Task:** Application form detection + form filling flow
**Objective:** Detect application form tab, fill fields from pending_application, detect submission and update offer status.
**Started:** 2026-06-05
**Last Updated:** 2026-06-29

---

## Plan

### Phase 1: Extension Scaffold ✅
- [x] Initialize Vite + React + TypeScript project (create-vite v9, react-ts template)
- [x] Install and configure Tailwind CSS v3 (tailwind.config.js + postcss.config.js, content paths set, directives in index.css)
- [x] Configure Vite for Chrome extension multi-entry build (side panel + content script)
- [x] Write manifest.json (MV3 — sidePanel, storage, activeTab, downloads permissions) in public/
- [x] Create src/content.ts placeholder
- [x] npm run build — succeeded, no errors

### Phase 2: Side Panel UI — Login Screen ✅
- [x] Build LoginScreen component (email input + password input + Login button + error div hidden by default)
- [x] Implement POST /v1/auth/agent/login API call (useAuth hook)
- [x] Store JWT in chrome.storage.local on successful login
- [x] Handle invalid credentials error display + loading spinner

### Phase 3: Side Panel UI — Main Screen ✅
- [x] Build MainScreen component (header + logout + client select + CV language select + checkbox + generate button + status area)
- [x] Generate CV button disabled when no client selected
- [x] Implement GET /v1/clients to populate client dropdown (useClients hook, JWT-authenticated)
- [ ] Persist last selected client in chrome.storage.local
- [ ] Persist "Open PDF after download" checkbox state in chrome.storage.local
- [x] Implement Logout (clear JWT from storage → return to login screen via App.tsx handleLogout)

### Phase 4: Content Script ✅
- [x] Write content script (runs on every page, reads document.body.innerText)
- [x] Implement language detection (document.documentElement.lang → meta fallback → English)
- [x] Respond to GET_PAGE_DATA message from side panel with { text, language }
- [x] Side panel useEffect requests page data on mount; guards chrome.runtime.lastError

### Phase 5+6: CV Generation + PDF Download ✅
- [x] Wire "Generate CV" button — fetches page text via GET_PAGE_DATA before calling API
- [x] POST /v1/cv/generate (client_id + offer_text + cv_language → PDF blob) in useCvGenerate hook
- [x] Loading spinner on Generate CV button; button disabled during generation
- [x] Handle API errors (401, non-ok, network) with user-visible status message
- [x] Download PDF blob via chrome.downloads.download with slugified filename
- [x] If "Open PDF after download" checked → chrome.downloads.open(downloadId)
- [x] "CV downloaded!" success message in status area

### Phase 7: Verification
- [ ] Load unpacked in Chrome — verify no manifest errors
- [ ] Walk full happy path: login → select client → open job page → generate → download PDF
- [ ] Walk error paths: wrong password, no client selected, no network, backend 500
- [ ] Run CoV checklist from PERSONA.md (all 5 questions)
- [ ] Check all devtools: side panel, service worker, content script console
- [ ] Verify chrome.storage.local state at each phase transition

**Plan verified with user:** No (pending)

---

## Progress
- [x] Phase 1 complete — Vite + React + TS scaffold, Tailwind v3, manifest.json, content.ts placeholder, build passes
- [x] Phase 2+3 static UI complete — LoginScreen + MainScreen + App.tsx state routing, build passes
- [x] Phase 4 complete — content script, Vite multi-entry build, manifest updated, build passes
- [x] Phase 2+3 logic complete — useAuth (login/logout/getToken), useClients (fetchClients), App.tsx 3-state auth, build passes
- [x] Phase 5+6 complete — useCvGenerate (POST /v1/cv/generate → blob → downloads), MainScreen wired, build passes
- [x] SyncTab iterations complete (2026-06-06):
  - SSE → polling: GET /v1/sync/status every 5s, network errors swallowed silently, interval cleared on done/error/unmount
  - Progress % removed; static "Syncing… It may take a long time." shown instead
  - SyncResult extended with total_offers_scanned; three-branch success message implemented

---

## Verification
- [ ] Extension loads in Chrome without manifest errors
- [ ] Full happy path tested manually in Chrome
- [ ] All error states tested
- [ ] CoV checklist: all 5 questions pass
- [ ] chrome.storage.local state verified at key points

---

## Blockers
- Backend endpoints (POST /v1/auth/agent/login, GET /v1/clients, POST /v1/cv/generate) need to be confirmed available in job-matcher-api before Phase 5 integration
- agents and agent_clients tables are backend scope — assume available when integration begins

---

## Notes
- SPEC.md V1 is the source of truth for all feature requirements
- Backend schema (agents table, agent_clients table) is out of scope for this extension build
- CV Language is auto-detected from content script but the user can override it in the text input
- "Open PDF after download" and last client selection are the two user preferences persisted in chrome.storage.local

---

## Application Form Flow — Current State (2026-06-29)

### Content Script (`src/content.ts`)
- All chrome.storage.local calls removed — proxied through background SW via safeSendMessage
- safeSendMessage probes chrome.runtime.id before every send; calls stopAll() on invalidated context
- detectAndNotify() gates on exact tab ID match (pa.application_tab_id === currentTabId)
- MutationObserver stops once formDetected = true or context invalidates
- attachSubmitListener() listens for form submit + submit button click
- Background SW also detects submission via chrome.tabs.onUpdated URL change

### Background SW (`src/background.ts`)
- onCreated: pre-assigns application_tab_id + form_url_set: false when new tab opened with an opener and pa has no tab yet
- onUpdated (URL change): first URL change sets form_url_set: true (form loading, ignored); subsequent URL change = submission → nulls application_tab_id + sends FORM_SUBMITTED
- onRemoved: clears pending_application when application tab closes
- FORM_DETECTED message: records sender tab ID as application_tab_id

### ExploreTab.tsx (`src/components/ExploreTab.tsx`)
- applicationTabId state: null = not on form tab, number = current tab is the application form tab
- handleStorageChange for pending_application:
  - Clears applicationTabId immediately when pa is cleared or application_tab_id becomes null
  - Does NOT set applicationTabId when application_tab_id is written — deferred to activeTabId useEffect
- activeTabId useEffect: reads storage on every tab switch, sets applicationTabId only if tab matches
- "Form detected" green badge shown in "Offer on this page" section header when applicationTabId !== null

### Key design decision
onCreated fires when background SW writes application_tab_id — at that moment activeTabIdRef.current
still points to the offer tab, not the new form tab. So handleStorageChange must NOT attempt the
activeTabIdRef check when application_tab_id is set. The activeTabId useEffect reconciles on the
next tab switch (when the user actually navigates to the form tab).

## Next Action
Test end-to-end in Chrome:
1. Open a job offer → click Apply (opens new tab) → switch to new tab
2. Confirm "Form detected" badge appears in side panel
3. Click "Fill form fields" — verify fields populated correctly
4. Submit form — confirm offer status updates to Applied
