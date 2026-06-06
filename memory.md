# Project Memory

> **Scope:** Long-term knowledge for the homo-digital-extension project — architecture decisions, Chrome API gotchas, patterns discovered during development, and technical learnings.
> **NOT for:** in-flight task state (use `current-task.md`), self-improvement rules (use `lessons.md`), or facts derivable from `SPEC.md` / `CLAUDE.md` / git history.
> **Organized by category, not chronology.** Each entry includes a date.
> **Last reviewed:** 2026-06-06

---

## 🏗️ Architecture Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-05 | Chrome Side Panel over popup | Persistent UI that stays open across page navigation — agents browse job listings without losing the panel state |
| 2026-06-05 | JWT stored in chrome.storage.local | Secure token storage; localStorage is readable by injected page scripts and accessible cross-origin |
| 2026-06-05 | Content script reads document.body.innerText | Non-destructive, does not modify the page; language detected via document.documentElement.lang with heuristic fallback |
| 2026-06-05 | chrome.runtime.sendMessage for content script → side panel | Standard MV3 message passing; side panel initiates the request when Generate CV is clicked |
| 2026-06-05 | agent_clients join table for access control | Many-to-many agents↔clients relationship; one agent can manage multiple clients, one client can have multiple agents |
| 2026-06-05 | PDF delivered as blob, downloaded via chrome.downloads.download | Backend renders HTML→PDF via Puppeteer; extension handles download without an intermediary URL |
| 2026-06-05 | Last selected client persisted in chrome.storage.local | Reduces friction — agents typically work with the same client repeatedly across sessions |
| 2026-06-05 | "Open PDF after download" persisted in chrome.storage.local | User preference that survives extension reloads; checked state maps to { open: true } in chrome.downloads.download |
| 2026-06-05 | Vite multi-entry build for side panel + content script | Side panel and content script are separate bundles with separate entry points; Vite handles the split cleanly |
| 2026-06-06 | Polling over SSE for sync progress (GET /v1/sync/status every 5s) | SSE (EventSource) drops connections on Railway after ~20 min; polling survives network hiccups silently — catch swallows errors and the interval keeps running. GET /v1/sync/progress SSE endpoint no longer used. |
| 2026-06-06 | No progress % in sync UI | Backend progress field unreliable during long syncs; replaced with static "Syncing… It may take a long time." — cleaner UX, no misleading numbers |
| 2026-06-06 | SyncResult includes total_offers_scanned | Three-branch success message: no offers scanned / scanned but no matches / scanned with matches — each branch tells a meaningfully different story to the agent |
| 2025-01-01 | Adopted 5-file scaffold as the standard deployment unit | Single-file monoliths grow unmanageable; separation of concerns enables independent versioning and focused context per session |
| 2025-01-01 | lessons.md added as the 5th file | memory.md is passive knowledge; lessons.md is active prevention — different jobs, different files |

---

## 🔍 Persona Design Patterns

| Date | Pattern | Context |
|------|---------|---------|
| 2025-01-01 | Named proprietary methodologies outperform generic step lists | "The Signal-to-Settlement Protocol" feels expert; "Step 1: Analyze data" does not |
| 2025-01-01 | CoV challenge questions must target the domain's harshest critic | Generic self-check questions ("Did I answer the question?") add no value |
| 2025-01-01 | Voice mismatches destroy credibility faster than missing credentials | A quant who sounds like a life coach breaks the illusion immediately |
| 2025-01-01 | FAP should activate automatically on any failure/anomaly report | Personas that wait to be asked for root-cause analysis miss their highest-value use case |
| 2026-04-25 | Founder-as-costly-signal for B2B personas (Sutherland insight) | For a founder-led B2B product, the founder's identity IS the marketing — a competitor cannot fake a real practitioner with skin in the game. The persona's job is to amplify founder presence, not substitute for it. Reframes any B2B-product persona around buyer risk-aversion logic. |
| 2026-04-25 | External-thinker integration as a methodology lens (NOT credential decoration, NOT a parallel mode) | When merging an external thinker's worldview into a persona, naive merges create incoherence — especially when the thinker pushes against existing persona discipline. Pattern that works: (1) delegate proper research to a subagent BEFORE designing the integration; (2) integrate at structural points (credentials + ONE trait reframe + ONE CoV question + ONE methodology hook + voice); (3) ALWAYS add a Guardrail in the most-affected trait — "X is the corrective lens, not the operating system"; (4) ALWAYS add an explicit "Where this lens is misapplied" section to prevent drift; (5) ALWAYS add a Deployment Success Test targeting the new lens (verifies additive, not replacing). |
| 2026-05-05 | Hook enforcement vs CLAUDE.md instruction (PCP 7.7) | The CLAUDE.md FILE PROTOCOL is best-effort: the model reads "read these files" and may or may not comply under context pressure or skill-stack interference. The harness-executed SessionStart hook is guaranteed: it runs BEFORE the first turn and file contents land in `additionalContext` via `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}`. Pattern: instruction + enforcement, both. Per-project file list is customized at the script level; never include CLAUDE.md (auto-loaded already — would double-load). |
| 2026-05-05 | Terminology Discipline as mandatory PCP 4.6 sub-step | The BUILDER of a persona may not be the domain expert — a builder can get lost in their own creation's vocabulary. New rule: every persona ships explicit Terminology Discipline (5–10 named domain terms + plain-language equivalents), defaults to plain-language-first + explain-on-first-use + glossary-on-demand, escalates to expert vocabulary only on explicit signal. The model's path of least resistance is to talk like the domain it was trained on; without an explicit rule it drifts into vernacular every time. |
| 2026-04-30 | Nationality grounding as IDENTITY-vs-DECORATION call (PCP 4.4.1) | Nationality is a high-risk trait with two failure modes: stereotype reach (clichés like "Italian = passionate") and cultural-performance overhead (token weight on accent/idiom theater instead of expertise). Four-pronged grounding test — nationality is IDENTITY when it traces to (a) a school of thought (the nationality IS the lineage), (b) a regulatory/market context, (c) the working language the persona outputs in, or (d) the user's relational grounding. Otherwise it is DECORATION — and decoration is not neutral; it actively invites stereotype reach. The right question is never "more nationality emphasis?" but "does this nationality earn its weight, or is it cosmetic?" |
| 2026-05-08 | Cross-platform parallel-adversary scaffold — a separate-platform red-teamer paired with a builder persona | When a user wants a verifier/complainer alongside an existing builder persona, the right shape is a **separate-platform parallel persona** (complementary role, separate ledger) — NOT a sub-persona, NOT a mode-switch. **Patterns**: (a) full Petra discipline compresses into a single file when a platform demands single-file, without losing structure; (b) a read-only contract is mandatory — the adversary writes ONLY to its own ledger, never the builder's files (prevents two personas fighting over shared state); (c) the adversary's CoV must target the builder's structural blind spots, not generic skepticism; (d) day-zero discovery of *real* structural issues — not manufactured noise — is the proof the adversary earned its weight. |
| 2026-05-14 | 4-Pass Pre-Merge Review framework for software-engineering personas (PCP 4.7) | A 4-pass engineering review (Architecture & Data Flow / Code Quality & DRY / Tests / Performance & Scaling) with Author-vs-Reviewer split, a Failure Modes Registry pre-merge artifact (Codepath / Failure mode / Rescued? / User-visible? / Logged?), and a Completion Summary closing artifact. Decision: FUSE into CoV/OV slots for engineering personas (do NOT stack as a 5th protocol); auto-ship BOTH Author and Reviewer modes with runtime auto-selection; domain bindings MANDATORY under every Pass item (generic-only fails the persona). The CRITICAL GAP rule (Rescued=N + User-visible=silent BLOCKS merge) gives the framework its enforcement teeth. Counter-rule: explicit "writes only" / "reviews only" drops the unused mode. |

---

## 📚 Domain Learnings

| Date | Learning | Source |
|------|----------|--------|
| 2025-01-01 | Trading personas need an explicit signal-vs-execution failure distinction in FAP | Mixing them obscures root cause |
| 2025-01-01 | Claude Projects consolidate PERSONA.md and CLAUDE.md into one instructions file | Platform constraint, not a design choice — document as a known tradeoff |
| 2025-01-01 | lessons.md rules must be imperative directives, not observations | "I noticed X" doesn't change behavior; "ALWAYS do Y" does |
| 2026-05-08 | A persona for a sensitive personal-stakes domain shapes its structural defaults around the worst-fear failure mode | "Wrong direction" worst-fear → Sacred Trust forces a ranked, cost-of-missing-weighted output; a secondary fear earns a dedicated CoV question. Two-tier failure-mode design holds across domains. |

---

## ⚠️ Gotchas & Pitfalls

| Date | Gotcha | Resolution |
|------|--------|------------|
| 2025-01-01 | CLAUDE.md that contains persona content causes context bleed | Strict rule: CLAUDE.md orchestrates only — persona content always goes in PERSONA.md |
| 2025-01-01 | Memory.md organized chronologically becomes unsearchable | Always organize by category, not by date — dates are metadata, not structure |
| 2025-01-01 | Personas without specific credentials default to generic assistant behavior | Specificity (real schools, certs, years) is the forcing function for expert-level output |
| 2026-05-23 | A public methodology repo accumulating private deployment notes is a data-leak risk | Keep the public repo's `memory.md`/`current-task.md` GENERIC. Real deployment records (client names, personal data, paths) live in the private per-project scaffolds, never here. |
| 2026-06-06 | Railway closes idle SSE connections on long-running jobs (20+ min) | Root cause: Railway's HTTP proxy has an idle timeout shorter than the sync duration. No keepalive workaround was reliable — polling is the correct fix for operations of this length. |

---

## 📈 Project Evolution

| Date | Milestone | Notes |
|------|-----------|-------|
| 2025-01-01 | v1: 3-file scaffold (CLAUDE.md, PERSONA.md, current-task.md) | Original architecture — no persistent memory, no self-improvement |
| 2025-01-01 | v2: 4-file scaffold — memory.md added | Enabled knowledge persistence across sessions |
| 2025-01-01 | v3: 5-file scaffold — lessons.md added | Added the self-improvement loop; memory for knowledge, lessons for prevention rules |
| 2025-01-01 | v3.1: Mandatory CoV, FAP, OV | Moved from "recommended" to "structural requirement" after consistent omissions |
| 2025-01-01 | v3.2: Workflow Orchestration added to CLAUDE.md template | Plan mode, subagent strategy, autonomy levels, demand-elegance rule |
| 2026-04-25 | v3.3: Minimum Viable Brief gate + Sacred Trust + Trait Grounding + Soul-vs-Method tagging | Added Sacred Trust as a mandatory PERSONA.md section, Trait Grounding (PCP 4.4), Soul-vs-Method tagging (PCP 4.5), Identity Growth lessons category, one-file-diff refinement default, alternatives-stated-explicitly, and Deployment Success Tests as mandatory. |
| 2026-04-30 | v3.4: Nationality Grounding (PCP 4.4.1) | Nationality must trace to school / regulatory context / working language / relational grounding — or be tagged cosmetic. Step 8 consistency check enforces it at assembly time. |
| 2026-05-05 | v3.5: Terminology Discipline (PCP 4.6) | Every persona declares 5–10 domain terms + plain-language defaults + explain-on-first-use; escalates to expert vocabulary only on explicit signal. Reframes PCP 1.3 USER CONTEXT from gate to modifier. |
| 2026-05-05 | v3.6: Scaffold loader hook (PCP 7.7) | Step 7 expands from 5 files to 5 + `.claude/{load-scaffold.sh, settings.json}`. The bash loader concatenates scaffold files with `=== <filename> ===` separators and emits JSON via `jq -n --arg ctx`. Excludes CLAUDE.md (auto-loaded — would double-load). Merge alongside any existing SessionStart hook, never replace. Pipe-test mandatory before claiming wired. |
| 2026-05-14 | v3.7: 4-Pass Pre-Merge Review framework injection (PCP 4.7) | Software-engineering personas auto-ship the 4-pass review FUSED into CoV/OV, with a Failure Modes Registry (CRITICAL GAP rule) and a Completion Summary. Both Author and Reviewer modes ship, auto-selected per session. Does not touch Sacred Trust / FAP / Deployment Tests / Terminology Discipline. |
