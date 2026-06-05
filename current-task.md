# Current Task

## Status: 🟡 In Progress

**Task:** Implement SPEC.md V1 — homo-digital-extension
**Objective:** Build the complete Chrome extension as specified in SPEC.md V1 — authentication, side panel UI, content script, CV generation flow, and PDF download.
**Started:** 2026-06-05
**Last Updated:** 2026-06-05

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

## Next Action
Phase 7: Full verification in Chrome — load unpacked, walk happy path (login → select client → open job page → generate → download PDF), walk error paths, run CoV checklist.
