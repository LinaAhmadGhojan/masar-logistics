# Analysis of the original module, and what Masar adds

This document records how the source system (`E:\erp\logistics`, a Laravel / Bagisto package named *Amwal Logistics*) was read, what it does, where it stops, and the ideas that became Masar.

## 1. What the original module does

| Area | Original behaviour (from the code) |
|---|---|
| **Waybill** (`logistics_policy`) | Header (auto/manual number, date, branch) · *From* (client sender, order / shipment / delivery-note numbers, GPS, one "original" attachment) · *To* (consignee, address, GPS, national address) · *Shipment* (several package types, each with qty / weight / H×W×L; material from a fixed list; totals; delivery type d2d / d2h / h2d / h2h; return-POD documents) · *Payment* (payment mode, invoice type credit / COD / FOC / PP, insurance, charge, declared value, VAT) · *Collect* · *Delivered by* (driver, vehicle, distance) |
| **Status flow** | `new → post → delivered → verified` (+ `cancelled`, `close`). `delivery_status` 0 pending · 1 assigned · 2 in progress · 3 delivered |
| **Masters** | `logistics_users` (the *senders*), `logistics_consignees` (per sender, with a quick-add popup in the waybill form), `logistics_drivers` (linked to **zero, one or many senders** through a JSON column; empty = serves all) |
| **Numbering** | System rule `logistics_waybill_auto_code`: automatic and not optional (field locked) · automatic and optional (manual override, must be unique) · off (manual, required, unique). The sequence is only consumed after a successful save |
| **Posting** | Creates a *booking request* in the Booking package (provider = the driver's employee). Booking events (`request.post`, `booking.start`, `booking.post`, `…cancel`, `…update`) feed back to set `delivery_status`, `collect_*`, `delivered_at` |
| **Delivery management** | A tabular grid of posted waybills: edit delivery status, destination GPS, distance, receiver, product — saved in bulk; a modal uploads the sender attachment |
| **Verification screen** | Delivered, not yet verified, no sales order → pick the product / service and distance → creates an **MS sales order** → `verified`. A separate action creates the **invoice** and closes |
| **Reports** | *Shipment status* and *Waybill list* (the trip sheet: date, invoice, order no., consignee, from city, DN, waybill no., vehicle, driver, pick-up, to city, Google location, km, pallets, material, quantity, est. kg, amount with / without VAT) |
| **Printing** | A configurable `PrintWaybill` data-report with a QR code to the waybill |
| **Location tools** | `resolveGpsFromGoogleLink` (short links, `@lat,lng`, Plus Codes), Nominatim geocoding, OSRM distance (`/delivery/distance`) |
| **Permissions** | Per-screen `show` / `crud`, and `logistics.policy.to-all` ("view all waybills" — otherwise only the waybills you created) |
| **Tracking guide** | `DELIVERY_TRACKING_GUIDE.md` + `delivery-tracker.js`: a sketch of live GPS updates, remaining distance and ETA with a "next steps" list (WebSocket, saving distance, arrival alerts) that was never finished |

## 2. Gaps found

- The tracking idea was a stub: `updateLocation()` stored nothing and had no consumer.
- No proof of delivery beyond free-text "received by"; the OTP column existed but nothing used it.
- Billing depended entirely on the host ERP (Sales Order / Invoice / catalog products); no standalone pricing.
- The Plus-Code decoder in `helpers.php` / `WaybillController` was hand-rolled and inconsistent between the two copies.
- Driver ↔ client link existed only as a select2 filter, not as a server rule.
- No COD cash reconciliation, no SLA / delay detection, no vehicle or licence expiry control, no client portal, no mobile app, no offline handling, no public tracking page.
- Company scoping relied on the host application's `company_id` helpers; there was no audit trail.

## 3. What Masar keeps, changes and adds

| Original | Masar |
|---|---|
| Numbering rules | **Kept exactly**, plus manual numbers are skipped when the sequence advances |
| Statuses | Kept and extended: `invoiced`; a fine *stage* under `post` (accepted → picked up → in transit → arrived → failed) |
| Driver–sender link | Kept (empty = all) and **enforced on the server** in create / edit / assign / bulk grid |
| Delivery grid, verify screen | Kept as *Delivery management* and *Verify & price* |
| MS sales order / invoice | Replaced by a **built-in pricing + invoicing** module (tariffs, VAT, partial payments, void, statements, ageing) |
| Booking package | Replaced by the **dispatch board** and a **driver job flow** with the same events |
| Trip-sheet and status reports | Kept with identical columns; added driver performance, revenue, receivables ageing, client statement |
| Tracking sketch | Became real: ping API, live map, ETA, geofence arrival, trail, public page |
| "To-all" permission | Kept as the per-user *view all waybills* flag |
| Print + QR | Kept; the QR now opens the public tracking page |

New ideas implemented: five roles with server-side walls · client portal · proof of delivery (signature / photo / OTP) · failed-attempt loop · COD cash settlement · SLA and urgent priority · expiring licence / insurance / registration alerts · audit log · notifications · offline queue for drivers · bilingual RTL/LTR UI · light/dark theme · three run modes (server, in-browser, APK).

## 4. User stories

**Dispatcher** — I see every waybill waiting for a driver, drag it to a driver who is allowed to serve that client, and watch it move on a live map. I get alerted when something is late.
**Driver** — I open the app, see my jobs, tap *Accept → Picked up → Start trip → Arrived*, then collect a signature / photo / the customer's code and any COD cash. If there is no signal my taps are kept and sent later.
**Client** — I create a waybill from my saved consignees, post it, share a tracking link with my customer, and later see my invoices and statement.
**Finance** — I verify delivered waybills with the suggested tariff, issue invoices per client, record payments, and receive COD cash from each driver.
**Consignee** — Without an account I enter the waybill number and the last four digits of my phone and see where my shipment is and when it arrives.
**Owner** — I manage users and company rules (numbering, required documents, SLA, geofence, VAT) and read an audit log of every sensitive change.

## 5. Exporting

| What | How |
|---|---|
| Any list or report → Excel | **CSV** with a UTF-8 BOM (Arabic displays correctly); on Android it is written to the cache and handed to the share sheet |
| Waybill / invoice → paper or PDF | Print-ready sheets (`window.print()`), with QR codes |
| The whole app → phone | **Android APK** (Capacitor), local engine inside or pointing at a server |
| The whole app → website | Static export (`output: "export"`) hostable anywhere, optionally under a sub-folder |

## 6. Ideas for later

Push notifications · WebSocket / SSE live stream · ZATCA e-invoicing (XML + QR) · route optimisation and multi-stop trips · multi-branch · customer self-service rate quotes · driver earnings and fuel logs · vehicle maintenance schedule · temperature / telematics integrations · barcode scanning of delivery notes · PostgreSQL migrations with Alembic.
