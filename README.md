# SpendSmart — AI-Powered Student Expense Tracker

A responsive web application that helps students record expenses, manage a monthly budget, view spending statistics, and receive AI-powered budgeting suggestions.

Built as a course project for the **DSU AI-Powered Full Stack Development** curriculum.

---

## Project Overview

SpendSmart is a student-finance dashboard. Students can:

- Add, edit, and delete expenses
- Categorize expenses (Food, Transport, Shopping, Education, Entertainment, Other)
- Set a monthly budget
- See total spending and remaining balance at a glance
- Filter expenses by category and date
- View category-wise spending charts
- Receive AI-generated spending summaries and budgeting tips

## Objectives

- Practice the full-stack development lifecycle on a real, useful tool for students
- Master responsive UI design with CSS Grid and Flexbox
- Build REST APIs with Node.js and Express
- Store and query expense data in MongoDB
- Integrate an AI model for personalized budgeting advice
- Ship a deployable, tested product

## Current Status — Phases 1, 2 & 3 Complete

This repository currently contains the finished **HTML5 structure**, **CSS3 styling**, and **JavaScript ES6+ functionality** of the dashboard. It runs entirely in the browser with no build step and no server: open `index.html` and it works.

### Completed Features

| Feature | Status |
|---|---|
| Semantic, accessible HTML5 dashboard layout (header, nav, main, footer) | Done |
| Add Expense form with title, amount, category, date, and payment method | Done |
| Add, edit, and delete expenses with confirmation | Done |
| Set and update a monthly budget per calendar month | Done |
| Summary cards: Monthly Budget, Total Spending, Remaining Balance | Done |
| Budget warnings at 80% usage and when the budget is exceeded | Done |
| Expense history table with caption and column scope | Done |
| Filter expenses by category and by date range, with clear-filters | Done |
| Category-wise spending breakdown for the current month | Done |
| Expenses and budgets persisted in LocalStorage with safe parsing | Done |
| Validation for titles, amounts, categories, dates, and payment methods | Done |
| Duplicate-submission prevention | Done |
| Empty states for the table, insights, and budget | Done |
| Polished responsive styling with CSS variables, Grid, and Flexbox | Done |
| Desktop / tablet / mobile layouts with no horizontal page overflow | Done |
| Keyboard focus visibility, reduced-motion support, ARIA landmarks | Done |
| Reserved section for AI insights | Done (placeholder) |

### Screenshots

| Desktop (1280px) | Tablet (768px) | Mobile (375px) |
|---|---|---|
| ![Desktop](phase1-html/screenshots/screenshot-desktop.png) | ![Tablet](phase1-html/screenshots/screenshot-tablet.png) | ![Mobile](phase1-html/screenshots/screenshot-mobile.png) |

### Technology Stack

| Phase | Technology | Status |
|---|---|---|
| 1 | HTML5 | Completed |
| 2 | CSS3 (Grid, Flexbox, custom properties) | Completed |
| 3 | JavaScript ES6+ | Completed |
| 4 | Node.js + Express REST API | Completed (temporary in-memory storage; MongoDB connects in Phase 5) |
| 5 | MongoDB + Mongoose | Pending |
| 6 | React (Vite) | Pending |
| 7 | AI API integration | Pending |
| 8 | Testing, GitHub, deployment | In progress |

**Not yet implemented:** MongoDB, the React frontend, and AI integration are pending — the AI/insights section remains an intentional placeholder. The Phase 4 API runs on temporary in-memory storage, so backend data resets on server restart; the frontend still uses LocalStorage until the backend integration is verified. No API keys or credentials exist anywhere in this project yet; when the AI integration is added, keys will live in a server-side `.env` file and will never ship in the frontend.

## Getting Started

No installation needed for the app itself.

```
phase1-html/index.html  →  open directly in your browser
```

The page is plain HTML + CSS + JavaScript. Double-click it, or start any static server. Expenses and the monthly budget are stored in the browser's LocalStorage under `spendsmart.v1`.

### Running the tests

The repository includes two Playwright scripts: functional tests for the Phase 3 behaviour, and the responsive-layout check.

```
cd phase1-html/tools
npm install
npm test                 # Phase 3 functional tests (17 tests)
npm run test:viewports   # desktop / tablet / mobile overflow check
npm run test:all         # both
```

Expected viewport output (the Amount and Actions columns intentionally scroll *inside* the table on mobile — that is the designed behaviour, not a page-level overflow):

```
[desktop 1280x900] page overflow: false, table overflow: false
[tablet 768x1024]  page overflow: false, table overflow: false
[mobile 375x812]   page overflow: false, table overflow: true (internal table scroll — expected)
```

## Repository Structure

```
.
├── index.html          # dashboard page (Phase 1)
├── styles.css          # all styling (Phase 2)
├── app.js              # application logic (Phase 3)
├── screenshots/        # desktop / tablet / mobile captures
├── tools/
│   ├── test-phase3.js      # Playwright functional tests
│   ├── test-viewports.js   # Playwright responsive-layout check
│   ├── package.json
│   └── package-lock.json
└── backend/                # Phase 4 REST API
    ├── src/
    │   ├── config/         # env + shared constants
    │   ├── controllers/    # request handling + body validators
    │   ├── routes/         # Express routers (/api/expenses, /api/budget)
    │   ├── middleware/     # async wrapper, 404 + centralized error handler
    │   ├── services/       # domain logic + temporary in-memory store
    │   ├── utils/          # validation, errors, id helpers
    │   ├── app.js          # Express app factory
    │   └── server.js       # entry point
    ├── tests/api.test.js   # 32 automated API tests
    ├── demo.js             # scripted API walkthrough
    ├── package.json
    └── .env.example
```

## Backend quick start (Phase 4)

```bash
cd backend
npm install
copy .env.example .env    # optional; sensible defaults work without it
npm start                 # http://localhost:5000
npm run dev               # same, with auto-restart on file changes
npm test                  # 32 automated API tests
node demo.js              # scripted walkthrough of every endpoint
```

The API uses **temporary in-memory storage** until MongoDB is connected in Phase 5: data is lost on restart, and the server prints a banner stating this. The frontend keeps using LocalStorage for now.

## Development Roadmap

| Phase | What happens |
|---|---|
| 3 — JavaScript ES6+ | **Completed:** expense add/edit/delete with `localStorage`, budget calculations, category & date filters, live summary cards |
| 4 — Node.js + Express | **Completed:** REST API (`GET/POST/PUT/PATCH/DELETE /api/expenses`, `GET/PUT /api/budget`, `GET /api/health`), validation, CORS, centralized error handling, temporary in-memory storage, API tests, demo script |
| 5 — MongoDB + Mongoose | Expense and Budget schemas, API wired to MongoDB, history persistence |
| 6 — React (Vite) | Dashboard rebuilt in React: components, state management, API calls, charts |
| 7 — AI integration | Server-side AI endpoint (key kept in `.env`, never in frontend) producing spending summaries and budgeting suggestions |
| 8 — Testing & deployment | Unit/API tests, CI, deployment of the full stack |

## License

MIT — see [LICENSE](LICENSE).
