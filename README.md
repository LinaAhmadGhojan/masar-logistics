<div align="center">

<img src="docs/screenshots/desktop/02-dashboard.png" alt="Masar dashboard" width="860">

# Masar — Transport & Logistics Platform

**From waybill to invoice, in one place.**
Waybills · dispatch board · live GPS tracking · proof of delivery · COD cash · tariffs & invoices · reports — as a **web app** and an **Android APK**, in **Arabic (RTL) and English**.

[العربية](README.ar.md) · [Analysis of the original system](docs/ANALYSIS.md) · [**Download the APK**](releases/masar-logistics-v1.0.apk)

![Next.js](https://img.shields.io/badge/Next.js_16-000?logo=nextdotjs) ![React](https://img.shields.io/badge/React_19-087ea4?logo=react&logoColor=white) ![Tailwind](https://img.shields.io/badge/Tailwind_4-0f172a?logo=tailwindcss) ![FastAPI](https://img.shields.io/badge/FastAPI-059669?logo=fastapi&logoColor=white) ![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy_2-b91c1c) ![Capacitor](https://img.shields.io/badge/Capacitor_6-119eff?logo=capacitor&logoColor=white) ![Tests](https://img.shields.io/badge/API_tests-31_passing-16a34a) ![i18n](https://img.shields.io/badge/AR_%2B_EN-RTL_ready-2aa57c)

</div>

---

## What it is

Masar is a complete operations system for a road-transport company. It started as a deep reading of an existing **Laravel / Bagisto ERP logistics module** (waybill policies, drivers, consignees, delivery management, verification → sales order → invoice, two reports, QR printing, and an unfinished live-tracking idea). Masar re-imagines that whole flow as a stand-alone product with a **FastAPI** back end and a **Next.js** front end, and fills every gap the original left open — see [docs/ANALYSIS.md](docs/ANALYSIS.md).

One codebase, three ways to run it:

| Mode | What runs | Use it for |
|---|---|---|
| **Server mode** | Next.js static site → **FastAPI** + SQLite/PostgreSQL | The real system |
| **Local mode** (`NEXT_PUBLIC_LOCAL=1`) | The whole API re-implemented in the browser, data in `localStorage` | Portfolio hosting, offline trials — no server |
| **Android APK** | Local mode wrapped by Capacitor (GPS, camera, share, offline queue) | Phones — works with no server at all |

## Screens

<table>
<tr>
<td width="50%"><img src="docs/screenshots/desktop/04-waybill-in-transit.png"><br><sub><b>Waybill</b> — stage stepper, live truck on the map, ETA, OTP & share link, timeline</sub></td>
<td width="50%"><img src="docs/screenshots/desktop/09-live-tracking.png"><br><sub><b>Live tracking</b> — every truck on the road, ETA and remaining km</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/desktop/08-dispatch-board.png"><br><sub><b>Dispatch board</b> — drag a card onto a driver (only drivers linked to that client are allowed)</sub></td>
<td><img src="docs/screenshots/desktop/06-waybill-form.png"><br><sub><b>New waybill</b> — auto-fill from sender/consignee, packages with totals, Google-link / Plus-Code → GPS</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/desktop/11-billing-verify.png"><br><sub><b>Verify & price</b> — suggested tariff and live price preview, then invoice</sub></td>
<td><img src="docs/screenshots/desktop/13-invoice.png"><br><sub><b>Tax invoice</b> — VAT, payments, QR, print-ready</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/desktop/07-waybill-print.png"><br><sub><b>Printed waybill</b> with QR to the public tracking page</sub></td>
<td><img src="docs/screenshots/desktop/22-public-tracking.png"><br><sub><b>Public tracking</b> — no login: number + last 4 digits of the receiver's phone (or the OTP)</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/desktop/15-reports-trip-sheet.png"><br><sub><b>Reports</b> — trip sheet, shipment status, drivers, revenue, receivables ageing · CSV for Excel</sub></td>
<td><img src="docs/screenshots/desktop/10-delivery-grid.png"><br><sub><b>Delivery management</b> — bulk-edit status, driver, GPS, distance, receiver</sub></td>
</tr>
</table>

### The driver app (APK)

<table>
<tr>
<td align="center"><img src="docs/screenshots/mobile/02-driver-jobs.png" width="200"><br><sub>My jobs + share location</sub></td>
<td align="center"><img src="docs/screenshots/mobile/03-driver-job.png" width="200"><br><sub>Job: navigate, call, next step</sub></td>
<td align="center"><img src="docs/screenshots/mobile/04-driver-proof-of-delivery.png" width="200"><br><sub>Proof of delivery: signature, photo, OTP, COD</sub></td>
<td align="center"><img src="docs/screenshots/mobile/08-live-tracking.png" width="200"><br><sub>Live map on the phone</sub></td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/mobile/05-client-dashboard.png" width="200"><br><sub>Client portal</sub></td>
<td align="center"><img src="docs/screenshots/mobile/07-dispatch.png" width="200"><br><sub>Dispatch on mobile</sub></td>
<td align="center"><img src="docs/screenshots/desktop/25-english-dashboard.png" width="200"><br><sub>English / LTR</sub></td>
<td align="center"><img src="docs/screenshots/desktop/27-dark-dashboard.png" width="200"><br><sub>Dark theme</sub></td>
</tr>
</table>

<details><summary>More screens</summary>

| | | |
|---|---|---|
| ![](docs/screenshots/desktop/05-waybill-delivered-pod.png) | ![](docs/screenshots/desktop/12-invoices.png) | ![](docs/screenshots/desktop/14-cod-cash.png) |
| ![](docs/screenshots/desktop/16-senders.png) | ![](docs/screenshots/desktop/17-drivers.png) | ![](docs/screenshots/desktop/18-vehicles.png) |
| ![](docs/screenshots/desktop/19-tariffs.png) | ![](docs/screenshots/desktop/20-users.png) | ![](docs/screenshots/desktop/21-settings.png) |
| ![](docs/screenshots/desktop/23-client-portal.png) | ![](docs/screenshots/desktop/24-client-waybills.png) | ![](docs/screenshots/desktop/01-login.png) |

</details>

## Features

**Five roles, enforced on the server** (not by hiding menus)

| Role | Does |
|---|---|
| **Administrator** | Everything + users, company rules, audit log |
| **Dispatcher** | Waybills, dispatch board, delivery grid, live tracking, masters, operational reports |
| **Finance** | Verify & price, invoices, payments, COD cash settlement, tariffs, revenue / ageing / statements |
| **Client** | Own portal: create & post waybills, track, invoices, own reports — sees only its own company |
| **Driver** | Mobile app: jobs, step buttons, GPS sharing, signature / photo / OTP proof, offline queue |

**Waybill life-cycle** — `new → posted → delivered → verified → invoiced` (or `cancelled`), with a finer *delivery stage* underneath:

```mermaid
stateDiagram-v2
    direction LR
    [*] --> new
    new --> post: post (OTP + SLA clock)
    post --> delivered: driver proves delivery
    delivered --> verified: tariff applied
    verified --> invoiced: invoice created
    new --> cancelled
    post --> cancelled
    invoiced --> verified: invoice voided
    state post {
        direction LR
        pending --> assigned: dispatcher
        assigned --> accepted
        accepted --> picked_up
        picked_up --> in_transit: moves >300 m
        in_transit --> arrived: inside geofence
        arrived --> delivered_
        in_transit --> failed
        failed --> assigned: re-assign
    }
```

**Highlights**
- **Auto waybill numbering** with the original rules: automatic / optional manual override / manual only; number is only consumed after a successful save; manual numbers are skipped.
- **GPS everywhere**: paste `lat,lng`, a **Google Maps link** (also `!3d…!4d…`, `?q=`, `@`), or a **Plus Code** (full and short, with city reference) — a correct Open Location Code decoder. Pick on a map, or use the phone's location.
- **Distance & ETA**: OSRM road distance when reachable, haversine × factor otherwise; ETA from the truck's live speed.
- **Drivers linked to clients** — a waybill may only use a driver linked to its sender (or open to all), exactly like the original `JSON_CONTAINS` rule; also enforced when assigning in bulk.
- **Live tracking + geofence**: the phone streams its position; entering the destination radius auto-marks *arrived* and notifies the client and dispatch.
- **Proof of delivery**: receiver name + signature *or* photo *or* the 4-digit OTP the consignee holds; failed attempts need a reason and go back to dispatch.
- **COD cash**: drivers collect cash on delivery; finance settles it driver by driver.
- **Pricing**: tariffs (base + per km + per pallet + per kg, minimum charge) with route-specific overrides; the most specific tariff is suggested and the price previewed before verifying.
- **Billing**: invoices grouped per client, VAT, payments (partial / full), void with rollback, statements and **receivables ageing**.
- **Public tracking page** + printable waybill with a QR code.
- **Reports** with CSV export (UTF-8 BOM so Excel shows Arabic): the original *Waybill list (trip sheet)* and *Shipment status*, plus driver performance, revenue, ageing, statement.
- **Offline-first driver app**: steps taken without signal are queued on the phone and replayed in order when the connection returns.
- **Dashboard & alerts**: KPIs, on-time rate, delayed / unassigned, monthly revenue, top clients, fleet status, expiring licences / insurance / registration.
- **Audit log**, notifications (in-app), per-role dashboards, light / dark theme, Arabic RTL + English LTR.

## Architecture

```mermaid
flowchart LR
  subgraph Client["Next.js 16 · React 19 · Tailwind 4 (static export)"]
    UI[Pages & components]
    API[api.ts]
    LOC[(Local engine<br/>+ localStorage)]
    UI --> API
    API -- "server mode" --> NET
    API -- "local mode" --> LOC
  end
  APK[Capacitor 6 · Android<br/>GPS · camera · share · files] --- Client
  NET{{HTTPS · Bearer JWT}} --> FAST
  subgraph Server["FastAPI"]
    FAST[Routers] --> SVC[Services:<br/>numbering · pricing · workflow ·<br/>geo · notifications]
    SVC --> ORM[SQLAlchemy 2]
  end
  ORM --> DB[(SQLite / PostgreSQL)]
  FAST --- OSRM[(OSRM routing)]
```

```mermaid
erDiagram
  COMPANY ||--o{ USER : has
  COMPANY ||--o{ SENDER : serves
  SENDER ||--o{ CONSIGNEE : has
  SENDER ||--o{ WAYBILL : ships
  CONSIGNEE ||--o{ WAYBILL : receives
  DRIVER }o--o{ SENDER : "linked to"
  DRIVER ||--o{ WAYBILL : delivers
  VEHICLE ||--o| DRIVER : drives
  WAYBILL ||--o{ WAYBILL_EVENT : timeline
  WAYBILL ||--o{ ATTACHMENT : files
  TARIFF ||--o{ WAYBILL : prices
  INVOICE ||--o{ INVOICE_LINE : lines
  WAYBILL ||--o| INVOICE_LINE : billed
  INVOICE ||--o{ PAYMENT : paid_by
  DRIVER ||--o{ PING : positions
```

| Layer | Choice |
|---|---|
| Front end | Next.js 16 (App Router, `output: "export"`), React 19, Tailwind CSS 4, Leaflet + OpenStreetMap, lucide icons, Tajawal font |
| Mobile | Capacitor 6 (Android) + Geolocation / Filesystem / Share plugins |
| Back end | Python 3.12, FastAPI, SQLAlchemy 2, Pydantic 2 |
| Database | SQLite for development, PostgreSQL for production (`DATABASE_URL`) |
| Auth | JWT (PyJWT) + bcrypt, permissions checked on the server |
| i18n | Own dictionary (AR / EN), RTL/LTR switch at runtime, Latin digits |

## Quick start

Requirements: Node 20+, Python 3.12.

**1 · API**
```bash
cd apps/api
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt        # Linux/macOS: .venv/bin/pip
.venv/Scripts/python scripts/seed_data.py             # sample company, 110+ waybills, invoices, trucks on the road
.venv/Scripts/python -m uvicorn app.main:app --port 8020
```
Interactive docs: <http://localhost:8020/docs>

**2 · Web**
```bash
cd apps/web
npm install
cp .env.example .env.local        # NEXT_PUBLIC_API_URL=http://localhost:8020
npm run dev                       # http://localhost:3020
```

**3 · Or skip the server entirely**
```bash
npm run dev:local                 # http://localhost:3021 — whole system in the browser
```

### Test accounts

The login page shows one card per role — click it and you are in.

| Role | Login | Password |
|---|---|---|
| Administrator | `admin@masar.local` | `admin1234` |
| Dispatcher | `dispatch@masar.app` | `demo1234` |
| Finance | `finance@masar.app` | `demo1234` |
| Client | `client@gulf.app` | `demo1234` |
| Driver | `driver1@masar.app` | `demo1234` |

> Test data only. Change `ADMIN_PASSWORD` and `JWT_SECRET` before any real deployment.

## Build the Android APK

A ready, debug-signed APK is in [`releases/masar-logistics-v1.0.apk`](releases/masar-logistics-v1.0.apk) (6 MB, runs on the built-in local engine — no server needed; allow "install unknown apps").

To build it yourself (Android Studio's JDK 17 + Android SDK):
```bash
cd apps/web
npm run build:local                 # static site on the local engine  (or set NEXT_PUBLIC_API_URL + build for server mode)
npx cap sync android
python scripts/make-icons.py        # launcher icons + splash (first time only)
cd android
echo "sdk.dir=C\:/Users/<you>/AppData/Local/Android/Sdk" > local.properties
JAVA_HOME="<Android Studio>/jbr" ./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```
For server mode use a public **HTTPS** API address (not `localhost`) in `NEXT_PUBLIC_API_URL`, and add its origin to `CORS_ORIGINS` (`https://localhost` is the Capacitor origin). A release build needs your own signing key.

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | API | default SQLite; e.g. `postgresql+psycopg://user:pass@host/db` |
| `JWT_SECRET` | API | **required in production** |
| `ADMIN_LOGIN` / `ADMIN_PASSWORD` | API | owner account created on first run |
| `CORS_ORIGINS` | API | allowed web origins (includes the APK's `https://localhost`) |
| `TZ_OFFSET` | API | hours added to UTC to decide "today" |
| `OSRM_ENABLED` | API | `0` = never call the public OSRM server |
| `UPLOAD_DIR` | API | where waybill attachments are stored |
| `NEXT_PUBLIC_API_URL` | Web | API base URL at build time |
| `NEXT_PUBLIC_LOCAL` | Web | `1` = run on the in-browser engine |
| `NEXT_PUBLIC_BASE_PATH` | Web | serve from a sub-folder (e.g. a portfolio) |

Company rules (numbering, required references, attachment/POD rules, SLA, geofence radius, VAT) are editable in **Settings**.

## API at a glance

| Area | Main routes |
|---|---|
| Auth | `POST /auth/login` · `GET /auth/me` · `POST /auth/password` |
| Waybills | `GET/POST /waybills` · `GET/PUT/DELETE /waybills/{id}` · `…/post` · `…/assign` · `…/cancel` · `…/duplicate` · `…/attachments` · `GET /waybills/next-number` |
| Operations | `GET /dispatch/board` · `GET/POST /delivery[/update]` · `GET /jobs` · `POST /jobs/{id}/step` · `POST /tracking/ping` · `GET /tracking/live` · `GET /public/track` |
| Geo | `POST /geo/resolve` (link / Plus Code / coordinates) · `POST /geo/distance` |
| Billing | `GET /billing/unverified` · `POST /billing/verify` · `GET/POST /invoices` · `…/issue` · `…/pay` · `…/void` · `GET /cod` · `POST /cod/settle` |
| Masters | `/senders` · `/consignees` · `/drivers` · `/vehicles` · `/tariffs` · `/users` · `/settings` |
| Insights | `GET /dashboard` · `/reports/{waybill-list,shipment-status,drivers,revenue,receivables,statement/{id}}` |

Full, try-it-out documentation at `/docs`.

## Tests

```bash
cd apps/api && .venv/Scripts/python -m pytest -q        # 31 tests
```
They cover the whole life of a waybill (create → post → assign → driver steps → proof of delivery → verify → invoice → pay → void), numbering rules, validation, role walls, client / company isolation, the *view-all* permission, COD settlement, failed deliveries, geofence arrival, public tracking, GPS / Plus-Code decoding, dashboards, reports and settings. The in-browser engine mirrors the API and was checked with a 22-step end-to-end scenario.

## Project structure

```
apps/
  api/                    FastAPI
    app/
      models.py           tables and vocabularies
      services.py         numbering, pricing, life-cycle, tracking, invoices
      geo.py              GPS parsing, Plus Codes, OSRM, ETA
      routers/            core · masters · waybills · ops · billing · insights
      seed.py             sample company with 110+ waybills
    scripts/              seed_data.py · export_local_seed.py
    tests/                31 integration tests
  web/                    Next.js (+ Capacitor in android/)
    src/app/              login · track · app/* (all screens)
    src/components/       ui kit, Master CRUD, map, signature pad, shell
    src/lib/              api client, i18n dictionaries, local engine, offline queue, native bridge
    scripts/              screenshots · make-icons · dev-local · build-local · check-i18n
docs/                     ANALYSIS.md · screenshots/
releases/                 masar-logistics-v1.0.apk
```

## Honest limits

- The APK is **debug-signed** and has been built and inspected, but **not yet run on a physical phone** (GPS / camera behaviour on real devices still to verify).
- Local mode keeps data in the browser/phone only; use server mode for shared data.
- Distances in local mode are estimates (no routing server); server mode uses OSRM when reachable.
- Attachments in local mode are limited to ~1.5 MB (stored in `localStorage`).
- Not built yet: push notifications, e-invoicing (ZATCA / XML), payment gateway, multi-branch, WebSocket streaming (live map polls every few seconds).

## License

MIT — see [LICENSE](LICENSE).
