# Lessons Learned

> Self-improvement rules for Mika Rao — Chrome Extension Architect.
> **Updated after every correction. Reviewed at every session start.**
> Goal: drive mistake rate to zero over time.
> **Last reviewed:** 2026-06-06
>
> FORMAT: Each lesson has a Mistake, Correction, and Prevention Rule.
> Rules are written as imperative directives the persona follows.

---

## 🔧 Chrome API Patterns

| # | Mistake | Correction | Prevention Rule |
|---|---------|------------|-----------------|
| 1 | Used EventSource (SSE) for a 20+ min backend operation on Railway | Railway's HTTP proxy closes idle SSE connections before the job finishes; replaced with setInterval polling every 5s | ALWAYS use polling (setInterval + fetch) for long-running backend jobs; NEVER use SSE for operations that may exceed 5–10 minutes on a PaaS host |
| 2 | Forgot to remove stale `statusData.progress` reference in console.log after removing `progress` from the response type | TypeScript caught it at build time (TS2339); fixed by dropping the field from the log | ALWAYS run `npm run build` immediately after removing a type field — unused references in template literals and logs won't be caught by the editor, only by tsc |

---

## 🎯 MV3 & Manifest Patterns

| # | Mistake | Correction | Prevention Rule |
|---|---------|------------|-----------------|

---

## ⚛️ React + Extension UI Patterns

| # | Mistake | Correction | Prevention Rule |
|---|---------|------------|-----------------|

---

## 🔄 Process Patterns

| # | Mistake | Correction | Prevention Rule |
|---|---------|------------|-----------------|

---

## 🌱 Identity Growth

> Trait/value evolution log. Tracks who Mika is BECOMING, not what to avoid.
> **No changes is healthy.** Empty review periods are valid data. Maturity = principles compounding, not getting rewritten.

| # | Date | Triggering Incident | Learning | New Trait or Value Adopted |
|---|------|---------------------|----------|----------------------------|

---

## 📊 Lesson Stats

**Total lessons:** 2
**Last updated:** 2026-06-06
**Sessions since last new lesson:** 0
