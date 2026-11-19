# SpendSmart — Submission Guide

Everything needed to submit, demo, and deploy the project. The README covers the product
itself; this file covers the submission logistics.

---

## 1. Test evidence (verified 20 Nov 2026)

| Suite | Command | Result |
|---|---|---|
| Backend API (in-memory store) | `cd backend && npm test` | 68/68 pass |
| — includes MongoDB path | (same run) | 8/8 pass (real MongoDB via `mongodb-memory-server`) |
| — includes AI narrator | (same run) | 11/11 pass (stubbed SDK, no key needed) |
| — includes insights + rate limit | (same run) | 17/17 pass |
| Phase 3 UI (vanilla JS demo) | `cd phase1-html/tools && npm test` | 17/17 pass |
| Phase 6 UI end-to-end | `node test-phase6.js` (servers running) | 23/23 pass |
| Phase 7 AI insights end-to-end | `node test-phase7.js` (servers running) | 10/10 pass |
| Browser audit (console, a11y, responsive) | `node test-submission-browser.js` | 13/13 pass |
| API edge-case battery | `cd backend && node tests/submission-edge-cases.js` (server running) | 39/39 pass |
| Frontend production build | `cd frontend && npm run build` | clean |
| Dependency vulnerabilities | `cd backend && npm audit` | 0 found |
| **Live AI call** | one-off script with a configured credential | passed — real Claude reply, ₹ amounts validated, no invented figures |

Edge cases covered by the battery: missing/zero/negative/string amounts, unknown categories
and payment methods, malformed and impossible dates, malformed JSON, unknown routes and
methods, nonexistent and malformed record ids (404), budget validation, insights month
validation, CORS allow-list enforcement (allowed origin passes, unknown origin is rejected).

A live AI narrative test was also run against the real Anthropic API with a configured
credential on this machine (model `claude-opus-5-5` via the `AI_MODEL` override, because the
credential could not resolve `claude-sonnet-5-5`). The reply used ₹ amounts correctly and
passed the no-invented-amounts guard. Set `AI_MODEL` if your key cannot resolve the default
model.

## 2. GitHub commit plan

The repository is already organized into one commit per phase — this is the history to
submit (do not squash; the per-phase commits are the audit trail):

| Commit | Contents |
|---|---|
| `984234a` Phase 1 & 2 | HTML dashboard + responsive CSS |
| `678cfcf` Phase 3 | Vanilla JS app logic + Playwright tests |
| `40e2972` Phase 4 | Express REST API + in-memory store + API tests |
| `4ef2696` Phase 5 | Mongoose models, MongoDB store, connection handling |
| `ccd7c59` Phase 5 verification | MongoDB-backed tests via `mongodb-memory-server` |
| `b5d805a` | SmartSpend-Intelligence design document |
| `64fd887` Phase 6 | React (Vite) frontend + E2E tests |
| `63794ab` Phase 7 | AI insights endpoint + React panel + tests |
| `20ddc7f` | AI insights panel screenshot |
| *(next)* | Submission guide, rate limiter, validator fix, audit scripts |

**Before pushing (you do this, not us):**

1. `git status` — confirm only expected files are staged. `.claude/` is untracked; add a
   `.gitignore` entry for it or leave it untracked.
2. Confirm `backend/.env` and `frontend/.env` are NOT tracked (`git ls-files | grep .env`
   must show only the two `.env.example` files — verified).
3. Never commit a real `ANTHROPIC_API_KEY`. If one was ever committed by accident, rotate
   it in the Anthropic Console before pushing.
4. Push: `git push origin main` (the branch is `main`).
5. Optional: add a `LICENSE` file (package.json declares MIT).

## 3. Deployment instructions

### Backend (Render free tier — or Railway/Fly.io)

1. Push the repo to GitHub.
2. In Render: **New → Web Service**, connect the repo.
3. Settings: **Root directory** `backend`; **Build command** `npm install`; **Start command**
   `npm start`; **Instance type** Free.
4. Environment variables:
   - `NODE_ENV=production`
   - `MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/spendsmart_db` (create a free
     Atlas cluster first; allow access from anywhere in Network Access for a demo)
   - `ANTHROPIC_API_KEY=[REDACTED] if you want the live AI narrative (optional)
   - `CORS_ORIGINS=https://<your-frontend>.vercel.app` (the deployed frontend origin)
5. Deploy. Verify `https://<service>.onrender.com/api/health` returns `{"success": true}`.

### Frontend (Vercel free tier — or Netlify)

1. In Vercel: **Add New → Project**, connect the same repo.
2. Settings: **Root directory** `frontend`; framework preset **Vite** (build `npm run build`,
   output `dist`).
3. Environment variable: `VITE_API_URL=https://<your-backend>.onrender.com`.
4. Deploy. Then update the backend's `CORS_ORIGINS` with the final Vercel URL and redeploy
   the backend.

**Notes:** the free Render tier sleeps after inactivity (first request takes ~30s to wake —
mention this during the demo). MongoDB Atlas free tier is persistent and sufficient. The
frontend is a static build; no server-side secrets exist in it by design.

## 4. Faculty demo checklist

Preparation (the day before):

- [ ] `cd backend && npm install && npm test` — 68/68 pass
- [ ] `cd frontend && npm install && npm run build` — clean build
- [ ] MongoDB running locally (or Atlas URI in `backend/.env`), `MONGODB_URI` set
- [ ] `ANTHROPIC_API_KEY` set in `backend/.env` if demoing the live AI narrative
- [ ] Start backend: `cd backend && npm start` — banner shows "Storage: MongoDB"
- [ ] Start frontend: `cd frontend && npm run dev` — open http://localhost:5173
- [ ] Browser zoom 100%, window ~1280px wide

Demo script (~8 minutes):

1. **Dashboard overview** (1 min): summary cards, empty states, responsive layout (drag
   window narrow — table scrolls inside its wrapper on mobile, no page overflow).
2. **Add expenses** (2 min): add 3–4 expenses across categories (e.g. canteen ₹150 Food,
   movie ₹450 Entertainment, bus pass ₹200 Transport, headphones ₹999 Shopping). Show
   validation live: submit an empty/negative form first and point out the field errors.
3. **Budget** (1 min): set budget ₹2,000; show remaining balance and the 80% warning /
   over-budget alert as spending changes.
4. **Edit & filter** (1.5 min): edit an amount, filter by category and date range, clear
   filters, delete one expense with confirmation.
5. **Charts** (1 min): category breakdown bars update after every operation.
6. **AI insights** (1.5 min): click "Get AI Insights" — show the verified-numbers grid,
   the summary, patterns, suggestions, the source badge, and the disclaimer. Explain: every
   number is computed by the app; the AI only writes the prose; without an API key the same
   panel shows a labelled offline summary (demo this by removing the key and restarting).
7. **Persistence** (30s): restart the backend server, reload the page — data is still there
   (MongoDB). Mention the 68 automated tests and the per-phase commit history.

## 5. Known limitations (state these honestly in the demo)

1. **Single user, no authentication.** The API is open to anyone who can reach it; this is a
   course demo, not a multi-user product. Adding auth (e.g. JWT) is future work.
2. **In-memory fallback resets on restart.** Without `MONGODB_URI` the data is ephemeral —
   always demo with MongoDB configured.
3. **No deployment yet** unless you complete Section 3; local demo runs on localhost.
4. **AI narrative is interpretive only.** Suggestions are general guidance, not financial
   advice; the UI says so. The AI cannot create or change records.
5. **AI costs and availability.** Each "Get AI Insights" click costs a small amount of API
   credit; the endpoint is rate-limited to one call per 10 seconds, and failures fall back
   to the offline summary.
6. **Insights cover the current month and the previous month only.** Multi-month trends and
   end-of-month prediction (described in `SmartSpend-Intelligence.md`) are designed but not
   implemented.
7. **Dates are handled in UTC.** An expense entered late at night (past midnight IST) lands
   on the previous UTC date.
8. **The Phase 1–3 vanilla JS version** (`phase1-html/`) is kept as a course milestone; the
   React app is the current product. The two share design, not code.

## 6. Pre-submission checklist (exact steps for you)

1. Review this file and the README once more.
2. `git status` → stage the remaining changes (`git add -A` except `.claude/`, or add
   `.claude/` to `.gitignore`) and commit with a message like
   `Submission prep: audit fixes, rate limiting, submission guide`.
3. `git push origin main` (only after you've confirmed no secrets are staged — Section 2).
4. Optional but recommended: complete the Render + Vercel deployment (Section 3) so the
   submission includes a live URL.
5. If you add an `ANTHROPIC_API_KEY` for the demo, put it only in `backend/.env` on the
   machine doing the demo — never in the repo, never in `frontend/.env`.
