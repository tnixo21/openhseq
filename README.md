# OpenHSEQ — Reports & Analytics

A lightweight, **no-backend** HSEQ (Health, Safety, Environment & Quality) reporting and
analytics web app. Inspired by the workflow of Mellora's *HSEQ Reports* platform — file
incident reports, process them as cases, and analyse trends — but built as a single static
site you can open by double-clicking `index.html`. All data lives in your browser
(`localStorage`), so there is **no server, database, or API** to set up.

> Status: MVP / prototype. Data persists per-browser. Use **Data → Export JSON** as your backup.

---

## 🔐 Access control (logins & roles)

The app is locked behind a login. The **owner** account (`tnix@bws.dk`, full access) is
pre-created on first run with the password **`Bluewater.1`** — sign in and change it under
**Settings → Users & access → Reset password**. The owner adds/manages everyone else there.
Passwords are hashed (SHA‑256 + per‑user salt) in `localStorage`; the session lives in
`sessionStorage` (clears when the tab closes).

> ⚠️ This is **client-side access control**, not server security — it gates the UI and enforces
> roles, but a determined user with browser dev-tools can reach the underlying `localStorage`.
> There is no backend to enforce it server-side. Fine for internal, trusted-network use.

**Six access levels** (every level can raise reports, run audits, and view completed audits):

| Lvl | Raise reports | Build audit types | Reports they can view | Dashboards | Can hide reports |
|:--:|:--:|:--:|---|:--:|:--:|
| 1 | ✓ | — | — | — | — |
| 2 | ✓ | — | — | — | — |
| 3 | ✓ | — | assigned to / raised by them | — | — |
| 4 | ✓ | ✓ | assigned to / raised by them | ✓ | — |
| 5 | ✓ | ✓ | all **non-hidden** reports | ✓ | ✓ |
| 6 (owner) | ✓ | ✓ | **all** reports incl. hidden | ✓ | ✓ + manage users |

*(Everyone can **run** audits and view completed audit records; **creating/editing/deleting audit
types** is level 4+.)*

**Hidden reports**: level 5+ users get a *🔒 Hide this report* option when raising one. Hidden
reports are visible only to the owner (level 6) — they are filtered out of every list, dashboard,
and export for everyone else.

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

- **Close-out sign-off**: manager name + **drawn digital signature** captured when a case is closed.
- **Change history**: per-case timeline of every status change, action and edit.

### CAPA action register
- Attach **corrective/preventive actions** to any case — owner, due date, status.
- Dedicated **Action Register** view across all cases; **overdue** flagging throughout.
- **SLA target-close dates** auto-set by severity; overdue cases flagged on the table and dashboard.

### Audits (custom builder + scheduling)
- **Build your own audit/inspection types** — title, category, checklist questions (optionally comment-required).
- **Recurrence**: schedule audits (daily…quarterly) with a next-due date and a **"DUE"** badge + dashboard KPI.
- **Run** an audit (Pass/Fail/N·A + comments) → auto **pass-rate %** → saved record (view / PDF / delete).
- **Failed items can auto-create a linked Non-Conformance** report. Ships with 3 sample templates.

### Document Centre
- Upload **SOPs / SDS / policies**, optionally **linked to a report type**.
- Linked documents surface as **Reference documents** on matching cases.

### Analytics & reporting
- **KPI dashboard**: totals, open / in-progress / closed, **awaiting-triage**, **overdue cases**, high-risk-open, **open/overdue actions**, **audits due**, **average days-to-close**.
- **Charts** (Chart.js): by type, 12-month trend, status, H/S/E/Q, top locations, **root-cause Pareto**, **reports by severity**.
- **Risk matrix**: interactive 5×5 heatmap of triaged open reports — click a cell to drill in.
- **Safety pyramid** (Heinrich) and a **"days since last recordable incident"** board.
- **Report Builder**: filter by date range / type / **status** / location → summary → **print to PDF** or **export CSV**.
- **Cases**: saved filters and **multi-select bulk actions** (set status / delete / export).

### Admin & platform
- **Settings tab**: edit locations, departments, customers, root-causes, people and **report types**; set **org name + logo** (sidebar + PDFs).
- **Multi-language** UI (English / Español / 简体中文).
- **PWA**: installable, offline app-shell cache, **camera capture** on mobile, and **QR quick-raise** codes per location (scan → pre-filled report).
- **Backup/restore**: export & import all data as JSON.

---

## 🚀 Run it

No build step, no dependencies to install.

```text
1. Open index.html in any modern browser (double-click it), or
2. Serve the folder:  python -m http.server 8000   →   http://localhost:8000
```

On first run it auto-loads 42 demo reports so the dashboards aren't empty.
Clear them anytime under **Settings → Data → Clear all reports**.

> Chart.js loads from a CDN, so the charts need an internet connection on first load.
> The PWA (offline install) and QR images only work when **served over http(s)** — not from `file://`.

### Deploy (later)
Because it's fully static it drops straight onto **GitHub Pages**, Netlify, or Railway:
push the repo and point Pages at the root — no configuration needed.

---

## 🗂️ Project structure

```
openhseq/
├── index.html               # app shell + all views
├── manifest.webmanifest     # PWA manifest
├── sw.js                    # service worker (offline app-shell cache)
├── assets/
│   ├── icon.svg             # app / PWA icon
│   ├── css/styles.css       # styling, risk bands, matrix, print rules
│   └── js/
│       ├── storage.js       # localStorage data layer: reports, settings, CAPA, audits, docs
│       ├── i18n.js          # UI translations (en / es / zh)
│       ├── charts.js        # Chart.js dashboards + safety pyramid
│       ├── app.js           # hub: routing, reporting, cases, CAPA, matrix, report builder
│       ├── settings.js      # Settings tab: lists, report types, branding, QR, data tools
│       ├── docs.js          # Document Centre
│       └── audits.js        # custom audit builder, scheduling, failed→NCR
└── README.md
```

---

## 🧭 Roadmap (not built yet)

Deferred until it goes onto a live server:

- REST/JSON API + multi-user backend (e.g. Node + SQLite/Postgres) to replace localStorage.
- Authentication & roles (reporter / processor / admin).
- **Email sending** — the "email a copy to reporter" field is captured but not yet wired to a mail service.
- Larger attachment/document storage (localStorage is browser-limited).
- Server-side scheduled reminders for due audits and overdue actions.
- Power BI / CSV API export endpoints; integration with CargoWise / WMS.

---

## License

MIT — see [LICENSE](LICENSE).
