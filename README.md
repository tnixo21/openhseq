# OpenHSEQ — Reports & Analytics

A lightweight, **no-backend** HSEQ (Health, Safety, Environment & Quality) reporting and
analytics web app. Inspired by the workflow of Mellora's *HSEQ Reports* platform — file
incident reports, process them as cases, and analyse trends — but built as a single static
site you can open by double-clicking `index.html`. All data lives in your browser
(`localStorage`), so there is **no server, database, or API** to set up.

> Status: MVP / prototype. Data persists per-browser. Use **Data → Export JSON** as your backup.

---

## ✨ Features

### Reporting (the Mellora-style core)
- **Six Quick-Report types**: Non-Conformance, Accident, Near Miss, Observation, Improvement, Prevention — each with an auto-generated reference number (e.g. `NCR-2026-007`).
- **Case management**: every report becomes a case you can search, filter, edit, re-assign and move through `Open → In Progress → Closed`.
- **Risk scoring**: 5×5 likelihood × consequence with automatic Low/Medium/High/Extreme banding.
- **HSEQ categorisation**: Health / Safety / Environment / Quality, root-cause, immediate & corrective actions, cost.

### Analytics & reporting (the value-add layer)
- **KPI dashboard**: totals, open/closed, high-risk-open, **near-miss : accident ratio** (leading indicator), **average days-to-close**, estimated cost.
- **Charts** (Chart.js): reports by type, 12-month trend, status split, H/S/E/Q split, top locations, **root-cause Pareto** (with cumulative %), and **cost by month**.
- **Risk matrix**: interactive 5×5 heatmap of *open* reports — click a cell to list those cases.
- **Safety pyramid** (Heinrich triangle): accidents → non-conformances → near-misses → proactive.
- **"Days since last recordable incident"** safety board.
- **Report Builder**: filter by date range / type / location → on-screen summary → **print to PDF** or **export CSV**.
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
- Photo & file attachments, digital signatures.
- Email notifications and scheduled/automatic workflows (HSEQ Planner).
- Document Centre, checklists/audits and timesheets modules.
- Power BI / CSV API export endpoints.

---

## License

MIT — see [LICENSE](LICENSE).
