# OpenHSEQ — Reports & Analytics

A lightweight, **no-backend** HSEQ (Health, Safety, Environment & Quality) reporting and
analytics web app. Inspired by the workflow of Mellora's *HSEQ Reports* platform — file
incident reports, process them as cases, and analyse trends — but built as a single static
site you can open by double-clicking `index.html`. All data lives in your browser
(`localStorage`), so there is **no server, database, or API** to set up.

> Status: MVP / prototype. Data persists per-browser. Use **Data → Export JSON** as your backup.

---

## ✨ Features

### Staged reporting workflow (built for the floor)
Reporting is deliberately split so warehouse staff only fill the basics, and the HSEQ
team adds the technical detail later:

| Stage | Who | Adds |
|---|---|---|
| **Raise (Open)** | Floor / warehouse | Type, category, title, description, **customer**, **how bad it was (severity)**, location, date, reporter, **attachments**, **email-a-copy** (placeholder) |
| **Triage → In Progress** | HSEQ | Likelihood, root cause, immediate action (this is when the risk score is calculated) |
| **Close** | HSEQ | Corrective action |

- **Six report types**: Non-Conformance, Accident, Near Miss, Observation, Improvement, Prevention — auto reference numbers (e.g. `NCR-2026-007`).
- **Attachments**: photos / PDFs attached at raise time, stored in-browser, preview + download from the case.
- **Customer** field, and an **email-to** field (wired as a placeholder — no sending yet).
- **Risk scoring**: 5×5 likelihood × consequence, auto Low/Medium/High/Extreme; un-triaged cases are flagged rather than scored.
- **Single-case PDF**: download/print any one report from its detail view.

### Audits (custom builder)
- **Build your own audit/inspection types** — title, category, and a checklist of questions (optionally comment-required).
- **Run** an audit (Pass/Fail/N·A + comments) → auto **pass-rate %** → saved to a record.
- **Completed audits** log with view / PDF / delete. Ships with 3 sample templates.

### Analytics & reporting
- **KPI dashboard**: totals, open / in-progress / closed, **awaiting-triage**, high-risk-open, **near-miss : accident ratio**, **average days-to-close**.
- **Charts** (Chart.js): by type, 12-month trend, status, H/S/E/Q, top locations, **root-cause Pareto**, **reports by severity**.
- **Risk matrix**: interactive 5×5 heatmap of triaged open reports — click a cell to drill in.
- **Safety pyramid** (Heinrich) and a **"days since last recordable incident"** board.
- **Report Builder**: filter by date range / type / **status** / location → summary → **print to PDF** or **export CSV**.
- **Backup/restore**: export & import all data as JSON.

---

## 🚀 Run it

No build step, no dependencies to install.

```text
1. Open index.html in any modern browser (double-click it), or
2. Serve the folder:  python -m http.server 8000   →   http://localhost:8000
```

On first run it auto-loads 42 demo reports so the dashboards aren't empty.
Clear them anytime under **Data → Clear all data**.

> Chart.js loads from a CDN, so the charts need an internet connection on first load.

### Deploy (later)
Because it's fully static it drops straight onto **GitHub Pages**, Netlify, or Railway:
push the repo and point Pages at the root — no configuration needed.

---

## 🗂️ Project structure

```
openhseq/
├── index.html              # app shell + all views
├── assets/
│   ├── css/styles.css       # styling, risk bands, matrix, print rules
│   └── js/
│       ├── storage.js       # localStorage data layer + demo seeding + risk helpers
│       ├── charts.js        # Chart.js dashboards + safety pyramid
│       └── app.js           # routing, forms, cases, matrix, report builder, export
└── README.md
```

Clean separation: **storage** (data) · **charts** (visuals) · **app** (UI/logic).

---

## 🧭 Roadmap (not built yet)

These were intentionally deferred (you asked to skip API/integration for now):

- REST/JSON API + multi-user backend (e.g. Node + SQLite/Postgres) to replace localStorage.
- Authentication & roles (reporter / processor / admin).
- **Email sending** — the "email a copy to reporter" field is captured but not yet wired to a mail service.
- Digital signatures; larger attachment storage (localStorage is browser-limited).
- Scheduled/automatic workflows and reminders (HSEQ Planner).
- Document Centre and timesheets modules.
- Power BI / CSV API export endpoints.

---

## License

MIT — see [LICENSE](LICENSE).
