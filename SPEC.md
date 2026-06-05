# homo-digital-extension — Specification V1

## Stack
- Vite + React + TypeScript
- Tailwind CSS
- Chrome Extension Manifest V3
- Chrome Side Panel API (chrome.sidePanel — available from Chrome 114+)

## UI Architecture
The extension uses Chrome's native Side Panel (not a popup).
- Opens when agent clicks the extension icon in the Chrome toolbar
- Appears as a fixed panel on the right side of the browser window
- Chrome automatically reduces the page viewport to accommodate the panel
- Page content scrolls normally in the remaining viewport
- Panel height = full browser window height (managed by Chrome)
- Panel width = resizable by agent (Chrome default ~400px)
- Panel stays open while browsing — does not close on page navigation

## Authentication
- Side panel shows login screen (email + password)
- After login, JWT stored in chrome.storage.local
- Extension stays logged in until Logout is clicked
- Backend: new table `agents` in job-matcher-api (id, email, password_hash, created_at)
- New endpoint: POST /v1/auth/agent/login → returns JWT

## Main Screen (after login)
- Select with agent's client list (GET /v1/clients)
- Last selected client saved in chrome.storage.local
- Field: CV Language (text input, auto-prefilled based on offer language detected by content script)
- Checkbox: "Open PDF after download" — state saved in chrome.storage.local
- Button: Generate CV
- Button: Logout

## Content Script
- Runs on every page, reads document.body.innerText
- Detects page language (document.documentElement.lang or heuristic)
- Sends to side panel via chrome.runtime.sendMessage

## CV Generation Flow
1. Agent selects client, sets CV language, clicks "Generate CV"
2. Side panel requests innerText of active tab via content script
3. POST /v1/cv/generate with payload: { client_id, offer_text, cv_language }
4. Backend: Claude API generates CV HTML based on client profile + offer text
5. Backend: Puppeteer renders HTML → PDF
6. Response: PDF blob
7. Extension downloads PDF via chrome.downloads.download
8. If "Open PDF after download" checkbox is checked → PDF opens automatically in OS

## Backend (job-matcher-api)
- New table: agents (id, email, password_hash, created_at)
- New table: agent_clients (agent_id, user_id) — agent↔clients relationship
- POST /v1/auth/agent/login
- GET /v1/clients — returns clients for authenticated agent
- POST /v1/cv/generate

## UI States
- Logged out: login form (email + password)
- Logged in, no client selected: select prompt
- Logged in, client selected: main screen with Generate CV button
- Generating: loading spinner on button
- Done: success message + PDF downloaded

## UI Layout

### Login Screen
- Email input
- Password input
- Login button
- Error message (invalid credentials)

### Main Screen
- Header: "Homo Digital" logo + Logout button (top right)
- Select: "Select client" — dropdown with client list, prefilled with last selected
- Input: "CV Language" — text field, auto-detected from offer page (e.g. "English", "Polish")
- Checkbox: "Open PDF after download" — persisted in chrome.storage.local
- Button: "Generate CV" — disabled when no client selected, shows spinner when generating
- Status message area — success/error feedback after generation

### Dimensions
- Width: managed by Chrome (default ~400px, resizable by agent)
- Height: full browser window height (managed by Chrome)
