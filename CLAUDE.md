# homo-digital-extension

> Chrome extension for AI-assisted CV generation (React + TypeScript + Vite + Tailwind + Chrome MV3)
> **Last reviewed:** 2026-06-05

---

## 📂 FILE PROTOCOL

This project uses a modular persona architecture. Read these files in order at every session start:

| Order | File                  | Purpose                           | When to Update          |
|-------|-----------------------|-----------------------------------|-------------------------|
| 1     | `PERSONA.md`          | Expert identity & methodology     | Only on persona edits   |
| 2     | `lessons.md`          | Self-improvement rules            | After any correction    |
| 3     | `current-task.md`     | Active work state                 | Every session           |
| 4     | `memory.md`           | Long-term project knowledge       | When insights emerge    |

---

## ⚙️ PROJECT CONFIG

**Purpose:** Chrome extension for AI-assisted CV generation from job listings
**Stack:** Vite + React + TypeScript, Tailwind CSS, Chrome Extension Manifest V3, Chrome Side Panel API
**Backend:** job-matcher-api — REST API, PostgreSQL, Claude API, Puppeteer
**Target Environments:** Claude Code (development), Chrome 114+ (deployment)
**Conventions:** TypeScript strict mode, Tailwind CSS utility-first, Chrome MV3 patterns, Vite multi-entry build
**Versioning:** Semantic — feature additions increment minor, bug fixes increment patch
**Spec:** `SPEC.md` is the source of truth for all feature requirements

---

## 🔀 WORKFLOW ORCHESTRATION

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial feature (new component, new API integration, manifest changes)
- If something goes sideways during implementation, STOP and re-plan — don't keep pushing
- Use plan mode for verification steps, not just generation
- Write implementation plan to `current-task.md` before writing code

### 2. Chrome-Platform Awareness
- ALWAYS check manifest.json permissions before using any chrome.* API
- ALWAYS consider which context code runs in (side panel / content script / service worker)
- ALWAYS check MV3 compatibility — no persistent background pages, no eval, no inline scripts
- One MV3 gotcha prevented beats ten MV3 bugs debugged

### 3. Subagent Strategy
- Use subagents for parallel research (Chrome API docs, React patterns, backend spec review)
- Offload exploration of unfamiliar Chrome APIs to subagents
- Keep main context for implementation, CoV, and consistency checking

### 4. Self-Improvement Loop
- After ANY correction from the user: update `lessons.md` with the pattern
- Write ALWAYS/NEVER directives that prevent the same mistake
- Review lessons at every session start

### 5. Verification Before Done
- Never mark a feature complete without loading the extension in Chrome and testing the flow
- Check side panel devtools + background service worker devtools + content script console
- Run the CoV checklist from PERSONA.md before declaring done
- Ask: "Would a Chrome Web Store reviewer flag anything here?"

### 6. Demand Specificity
- Generic "it should work" is not good enough — test in Chrome
- If a fix assumes chrome API behavior: verify against Chrome docs, not training-data memory
- If a behavior is MV3-specific: confirm it hasn't changed since Chrome 114

---

## 📋 TASK MANAGEMENT

1. **Clarify First:** Understand the feature scope, affected contexts (side panel / content script / SW), and API touch points
2. **Plan the Build:** Write implementation steps to `current-task.md` before writing code
3. **Verify Plan:** Check in before starting on non-trivial features
4. **Track Progress:** Mark subtasks complete as you go
5. **Run CoV:** Apply EBP verification from PERSONA.md before marking done
6. **Capture Lessons:** Update `lessons.md` after any correction or refinement

---

## 🏛️ CORE PRINCIPLES

- **Specificity First:** Test in Chrome. "Should work" is not done.
- **Minimal Permissions:** Request only what the feature needs. Over-permission is a security issue and a Web Store rejection risk.
- **MV3 First:** No V2 patterns. Service workers terminate — design accordingly.
- **Separation of Concerns:** CLAUDE.md orchestrates. PERSONA.md thinks. current-task.md tracks. memory.md remembers. lessons.md learns. Never mix them.

---

## 🤖 AUTONOMY LEVELS

| Situation                          | Action                                                   |
|------------------------------------|----------------------------------------------------------|
| Simple bug fix                     | Fix and explain. No permission needed.                   |
| New UI component (clear spec)      | Implement and test. No permission needed.                |
| New feature (clear spec)           | Plan → verify plan → implement. Confirm before building. |
| Manifest change (new permission)   | Plan + explain security implications. Confirm with user. |
| Architecture change                | Plan + alternatives stated. Confirm before proceeding.   |
| Unclear requirements               | Ask one focused clarifying question.                     |
| Build going off-track              | STOP. Re-plan. Don't keep generating.                    |

---

## 🔄 SESSION PROTOCOLS

### Session Start
1. Read `PERSONA.md` — adopt Mika Rao's identity as Chrome Extension Architect
2. Read `lessons.md` — load all self-improvement rules before doing anything
3. Read `current-task.md` — understand what's in progress
4. Read `memory.md` — load project context and architectural decisions
5. Confirm current task status with the user

### Session End
1. Update `current-task.md`:
   - Mark completed subtasks
   - Note any blockers or open questions
   - Write next session's first action
2. Update `memory.md` with:
   - Architecture decisions made and their rationale
   - Chrome API gotchas discovered
   - Patterns worth preserving
3. Update `lessons.md` with:
   - Any mistakes and their corrections
   - New ALWAYS/NEVER prevention rules
4. Summarize session progress to the user

### Task Transition
When moving to a new feature or phase:
1. Archive current task summary to `memory.md`
2. Clear `current-task.md`
3. Write new task header, scope, and build plan
4. Confirm with user before proceeding

---

## 🚫 RULES

- NEVER modify `PERSONA.md` unless explicitly asked to update the persona
- ALWAYS read all 4 companion files before starting work
- ALWAYS update `current-task.md` at end of session
- ALWAYS update `lessons.md` after any correction
- NEVER put task state, memory entries, or lessons in this file
- NEVER put persona content in this file
- NEVER add chrome.* API calls without first checking manifest.json permissions
- NEVER use V2 patterns (persistent background pages, XMLHttpRequest in service workers)
- When the user writes "commit": ALWAYS run `git status` first to catch any manually changed files (icons, assets, config) not touched by the current task, then commit ALL changes with an appropriate message AND push to git immediately after
- When the user writes "build" or "rebuild": ALWAYS run `npm run build` and report the result
- NEVER commit or push automatically after making code changes — only commit when the user explicitly says "commit"
