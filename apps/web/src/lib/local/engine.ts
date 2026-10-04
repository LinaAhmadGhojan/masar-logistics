/* eslint-disable @typescript-eslint/no-explicit-any */
// The whole API running inside the browser / APK (mirror of apps/api). Used when NEXT_PUBLIC_LOCAL=1.
import { fmtGps, haversine, parseGps, resolveLocation, route as geoRoute } from "./geo";
import {
  ACTIVE, ALL, E, ROLE_PERMS, VOCAB, addPayment, allowedDrivers, audit, bad, bulkDelivery, by, cancelWaybill, city, company, companyOut, computeCharge, consigneeOut,
  consumeNumber, createInvoices, driverOut, driverStep, driverUsers, formatNumber, getWaybill, invoiceOut, isDelayed, isLate, logEvent, normalizePackages, notify, packageTotals,
  postWaybill, registerPing, senderOut, senderUsers, setDriver, simulateTraffic, suggestTariff, tariffOut, userOut, usersWithRole, vehicleOut, verifyWaybill, visible, voidInvoice, wbOut,
} from "./logic";
import { addDaysStr, getDB, iso, nextId, now, r2, resetLocal, save, todayStr, type R } from "./store";

type Opts = { method?: string; body?: unknown; form?: FormData };
export { resetLocal };

const D = () => getDB();
const own = (t: string, id: number): R => by(t, id) ?? bad("not_found", 404);

function need(user: R, ...perms: string[]) {
  const mine = ROLE_PERMS[user.role] ?? [];
  if (!perms.some((p) => mine.includes(p))) bad("forbidden", 403);
}
const gpsOk = (v: any) => { if (v && !parseGps(v)) bad("gps_invalid"); };
const cityOk = (id: any) => { if (id && !by("cities", id)) bad("city_invalid"); };
const blank = (b: R): R => Object.fromEntries(Object.entries(b ?? {}).map(([k, v]) => [k, v === "" ? null : v]));
const lc = (s: any) => String(s ?? "").toLowerCase();

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

// ---------------------------------------------------------------- waybill edit
function applyWaybill(w: R, b: R, user: R, creating: boolean) {
  const c = company();
  const senderId = user.role === "client" ? user.sender_id : b.sender_id ?? (creating ? null : w.sender_id);
  const sender = senderId ? by("senders", senderId) : null;
  if (!sender) bad("sender_required");
  if (!creating && sender!.id !== w.sender_id) bad("sender_locked");
  if (creating && !sender!.status) bad("sender_inactive");
  const cons = b.consignee_id ? by("consignees", b.consignee_id) : null;
  if (!cons || cons.sender_id !== sender!.id) bad("consignee_required");
  const pick = (mine: any, theirs: any) => (mine !== null && mine !== undefined && mine !== "" ? mine : theirs);
  w.sender_id = sender!.id; w.consignee_id = cons!.id;
  w.from_city_id = pick(b.from_city_id, sender!.city_id); w.from_address = pick(b.from_address, sender!.address); w.from_gps = pick(b.from_gps, sender!.gps);
  w.from_mobile = pick(b.from_mobile, sender!.mobile); w.from_email = pick(b.from_email, sender!.email);
  w.to_name = pick(b.to_name, cons!.name); w.to_phone = pick(b.to_phone, cons!.phone); w.to_mobile = pick(b.to_mobile, cons!.mobile); w.to_email = pick(b.to_email, cons!.email);
  w.to_city_id = pick(b.to_city_id, cons!.city_id); w.to_address = pick(b.to_address, cons!.address); w.to_gps = pick(b.to_gps, cons!.gps); w.to_nad = pick(b.to_nad, cons!.nad); w.to_idno = pick(b.to_idno, cons!.idno);
  if (!w.to_address) bad("destination_required");
  gpsOk(w.from_gps); gpsOk(w.to_gps); cityOk(w.from_city_id); cityOk(w.to_city_id);
  if (c.require_refs && !(b.order_no && b.shipment_no && b.delivery_note)) bad("refs_required");
  Object.assign(w, { order_no: b.order_no ?? null, shipment_no: b.shipment_no ?? null, delivery_note: b.delivery_note ?? null, reference_no: b.reference_no ?? null, date: b.date || w.date || todayStr() });
  Object.assign(w, { shipment_det: b.shipment_det ?? null, remark: b.remark ?? null, service_type: b.service_type ?? "domestic", deliver_type: b.deliver_type ?? "d2d", material: b.material ?? null, priority: b.priority ?? "normal", return_refs: b.return_refs ?? [] });
  const pk = normalizePackages(b.packages ?? []);
  const tot = packageTotals(pk);
  w.packages = pk;
  w.qty = tot.qty > 0 ? tot.qty : b.qty || 0;
  w.weight = tot.weight > 0 ? tot.weight : b.weight || 0;
  w.volume_m3 = tot.volume_m3;
  w.total_qty = b.total_qty ?? w.qty;
  w.est_weight = b.est_weight ?? w.weight;
  Object.assign(w, { payment_mode: b.payment_mode ?? null, invoice_type: b.invoice_type ?? null, insurance_type: b.insurance_type ?? null, shipment_value: b.shipment_value || 0, cod_amount: b.cod_amount || 0, collect_type: b.collect_type ?? null });
  const a = parseGps(w.from_gps), z = parseGps(w.to_gps);
  if (b.distance_km != null) w.distance_km = r2(b.distance_km);
  else if (a && z && !w.distance_km) w.distance_km = r2(haversine(a, z) * c.distance_factor);
  w.duration_min = w.distance_km ? Math.round(w.distance_km) : 0;
  w.updated_by = user.id;
}

const SORTS: Record<string, string> = { date: "date", number: "number", status: "status", created: "id", sender: "sender_id", to: "to_name", distance: "distance_km" };

function newWaybillShell(user: R): R {
  return { id: nextId("waybills"), company_id: 1, number: "", date: todayStr(), sender_id: 0, consignee_id: null, from_city_id: null, from_address: null, from_gps: null, from_mobile: null, from_email: null, order_no: null, shipment_no: null, delivery_note: null, reference_no: null,
    to_name: null, to_phone: null, to_mobile: null, to_email: null, to_city_id: null, to_address: null, to_gps: null, to_nad: null, to_idno: null, shipment_det: null, remark: null, service_type: "domestic", deliver_type: "d2d", return_refs: [], packages: [], material: null,
    qty: 0, weight: 0, total_qty: 0, est_weight: 0, volume_m3: 0, priority: "normal", promised_at: null, payment_mode: null, invoice_type: null, insurance_type: null, service_charge: 0, shipment_value: 0, vat_amount: 0, cod_amount: 0, cod_collected: false, cod_settled: false,
    collect_type: null, collect_status: false, collected_at: null, driver_id: null, vehicle_id: null, vehicle_no: null, distance_km: 0, duration_min: 0, stage: "pending", delivery_status: 0, status: "new", delivered_at: null, received_by: null, receiver_mobile: null, receiver_id: null,
    otp: null, pod_signature: null, pod_photo: null, pod_note: null, failure_reason: null, attempts: 0, near_notified: false, tariff_id: null, invoice_id: null, created_by: user.id, updated_by: user.id, created_at: now(), updated_at: now() };
}

const bump = (w: R) => { w.updated_at = now(); };

// ------------------------------------------------------------------ analytics
const onTime = (rows: R[]) => {
  const done = rows.filter((w) => w.delivered_at && w.promised_at);
  return done.length ? Math.round((1000 * done.filter((w) => !isLate(w)).length) / done.length) / 10 : null;
};
const dayOf = (ts: string) => new Date(Date.parse(`${ts}Z`) + 3 * 3600000).toISOString().slice(0, 10);

function dashboard(user: R) {
  const today = todayStr();
  const since30 = addDaysStr(today, -30);
  if (user.role === "driver") {
    const mine = D().waybills.filter((w) => w.driver_id === user.driver_id);
    const d = by("drivers", user.driver_id);
    const done = mine.filter((w) => w.stage === "delivered");
    return { role: "driver", driver: d?.name, rating: d?.rating, kpis: { active: mine.filter((w) => w.status === "post" && w.stage !== "delivered").length, delivered_today: done.filter((w) => w.delivered_at && dayOf(w.delivered_at) === today).length, delivered_30d: done.filter((w) => w.date >= since30).length, distance_30d: r2(done.filter((w) => w.date >= since30).reduce((a, w) => a + w.distance_km, 0)), on_time_rate: onTime(done.filter((w) => w.date >= since30)), cod_in_hand: r2(mine.filter((w) => w.cod_collected && !w.cod_settled).reduce((a, w) => a + w.cod_amount, 0)) } };
  }
  const scope = visible(user).filter((w) => w.date >= addDaysStr(today, -180));
  const last30 = scope.filter((w) => w.date >= since30 && w.status !== "cancelled");
  const created: Record<string, number> = {}, delivered: Record<string, number> = {};
  for (const w of scope) { created[w.date] = (created[w.date] ?? 0) + 1; if (w.delivered_at) { const k = dayOf(w.delivered_at); delivered[k] = (delivered[k] ?? 0) + 1; } }
  const series = Array.from({ length: 14 }, (_, i) => addDaysStr(today, i - 13)).map((d) => ({ date: d, created: created[d] ?? 0, delivered: delivered[d] ?? 0 }));
  const by_status: Record<string, number> = {};
  for (const w of scope) if (w.date >= since30) by_status[w.status] = (by_status[w.status] ?? 0) + 1;
  const senders: Record<number, R> = {};
  const routes: Record<string, number> = {};
  for (const w of last30) {
    const s = (senders[w.sender_id] ??= { id: w.sender_id, name: by("senders", w.sender_id)?.name ?? "-", count: 0, revenue: 0 });
    s.count++; s.revenue = r2(s.revenue + (["verified", "invoiced"].includes(w.status) ? w.service_charge : 0));
    const k = `${w.from_city_id}|${w.to_city_id}`; routes[k] = (routes[k] ?? 0) + 1;
  }
  const top_routes = Object.entries(routes).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, count]) => { const [a, b] = k.split("|"); return { from: city(Number(a)), to: city(Number(b)), count }; });
  const invs = D().invoices.filter((i) => user.role !== "client" || i.sender_id === user.sender_id);
  const live = invs.filter((i) => ["issued", "partial", "paid"].includes(i.status));
  const open = invs.filter((i) => ["issued", "partial"].includes(i.status));
  const kpis: R = {
    total_30d: last30.length, new: scope.filter((w) => w.status === "new").length, unassigned: scope.filter((w) => w.status === "post" && !w.driver_id).length,
    in_transit: scope.filter((w) => w.status === "post" && ACTIVE.includes(w.stage)).length, delivered_today: scope.filter((w) => w.delivered_at && dayOf(w.delivered_at) === today).length,
    delayed: scope.filter(isDelayed).length, on_time_rate: onTime(scope.filter((w) => w.date >= since30)), to_verify: scope.filter((w) => w.status === "delivered").length,
    to_invoice: scope.filter((w) => w.status === "verified" && !w.invoice_id).length, revenue_30d: r2(live.filter((i) => i.issue_date >= since30).reduce((a, i) => a + i.total, 0)),
    receivables: r2(open.reduce((a, i) => a + i.total - i.paid, 0)), overdue_amount: r2(open.filter((i) => i.due_date && i.due_date < today).reduce((a, i) => a + i.total - i.paid, 0)),
    cod_pending: r2(scope.filter((w) => w.cod_collected && !w.cod_settled).reduce((a, w) => a + w.cod_amount, 0)),
  };
  const out: R = { role: user.role, kpis, series, by_status, top_senders: Object.values(senders).sort((a, b) => b.count - a.count).slice(0, 5), top_routes, recent: [...scope].sort((a, b) => b.id - a.id).slice(0, 6).map((w) => wbOut(w)) };
  if (user.role === "client") {
    const done = last30.filter((w) => w.delivered_at);
    const hours = done.map((w) => (Date.parse(`${w.delivered_at}Z`) - Date.parse(`${w.created_at}Z`)) / 3600000);
    kpis.avg_hours = hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : null;
    kpis.active = scope.filter((w) => w.status === "post" && w.stage !== "delivered").length;
    return out;
  }
  const months: string[] = [];
  let cur = today.slice(0, 7) + "-01";
  for (let i = 0; i < 6; i++) { months.unshift(cur.slice(0, 7)); cur = addDaysStr(cur, -1).slice(0, 7) + "-01"; }
  out.revenue_series = months.map((mo) => ({ month: mo, total: r2(live.filter((i) => i.issue_date.startsWith(mo)).reduce((a, i) => a + i.total, 0)) }));
  const leaders: Record<number, R> = {};
  for (const w of scope.filter((x) => x.stage === "delivered" && x.date >= since30 && x.driver_id)) {
    const d = (leaders[w.driver_id] ??= { id: w.driver_id, name: by("drivers", w.driver_id)?.name ?? "-", delivered: 0, late: 0, km: 0 });
    d.delivered++; d.late += isLate(w) ? 1 : 0; d.km = r2(d.km + w.distance_km);
  }
  out.drivers = Object.values(leaders).sort((a, b) => b.delivered - a.delivered).slice(0, 5);
  const vs = D().vehicles;
  out.fleet = { total: vs.length, available: vs.filter((v) => v.status === "available").length, on_trip: vs.filter((v) => v.status === "on_trip").length, maintenance: vs.filter((v) => v.status === "maintenance").length, drivers_online: D().drivers.filter((d) => d.online).length };
  const alerts: R[] = [];
  if (kpis.delayed) alerts.push({ type: "delayed", severity: "high", count: kpis.delayed, link: "/app/waybills?delayed=1" });
  if (kpis.unassigned) alerts.push({ type: "unassigned", severity: "mid", count: kpis.unassigned, link: "/app/dispatch" });
  if (kpis.to_verify) alerts.push({ type: "to_verify", severity: "low", count: kpis.to_verify, link: "/app/billing" });
  const overdue = open.filter((i) => i.due_date && i.due_date < today);
  if (overdue.length) alerts.push({ type: "overdue", severity: "high", count: overdue.length, link: "/app/invoices?overdue=1" });
  const left = (d: string | null) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  for (const d of D().drivers) if (d.license_expiry && left(d.license_expiry) <= 30) alerts.push({ type: "license", severity: "mid", name: d.name, days: left(d.license_expiry), link: `/app/driver?id=${d.id}` });
  for (const v of vs) for (const [kind, dt] of [["insurance", v.insurance_expiry], ["registration", v.registration_expiry]] as const) if (dt && left(dt) <= 30) alerts.push({ type: kind, severity: "mid", name: v.plate, days: left(dt), link: "/app/vehicles" });
  out.alerts = alerts;
  return out;
}

function reportScope(user: R, p: URLSearchParams, withCancelled = false): R[] {
  let rows = visible(user).filter((w) => withCancelled || w.status !== "cancelled");
  const f = p.get("date_from"), t = p.get("date_to");
  if (f) rows = rows.filter((w) => w.date >= f);
  if (t) rows = rows.filter((w) => w.date <= t);
  for (const k of ["from_city_id", "to_city_id", "sender_id", "driver_id"]) if (p.get(k)) rows = rows.filter((w) => String(w[k]) === p.get(k));
  return rows.sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
}
const sum = (rows: R[], k: string) => r2(rows.reduce((a, r) => a + (r[k] || 0), 0));
const financeOnly = (u: R) => { if (!["admin", "finance"].includes(u.role)) bad("forbidden", 403); };

// ----------------------------------------------------------------------- main
export async function localApi(path: string, opts: Opts, token: string | null): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 60));
  const method = (opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET")).toUpperCase();
  const b = blank((opts.body ?? {}) as R);
  const [clean, query = ""] = path.split("?");
  const p = new URLSearchParams(query);
  const db = D();

  if (clean === "/auth/login" && method === "POST") {
    const u = db.users.find((x) => lc(x.login) === lc(b.login));
    const pw = (db as any).passwords?.[u?.id] ?? (u?.role === "admin" ? "admin1234" : "demo1234");
    if (!u || !u.active || pw !== b.password) bad("bad_credentials", 401);
    u!.last_login = now();
    save();
    return { token: `local-${u!.id}`, user: userOut(u!) };
  }
  const user = token?.startsWith("local-") ? by("users", Number(token.slice(6))) : undefined;
  if (!user || !user.active) bad("unauthorized", 401);
  const U = user!;
  const wbCompany = company();
  let m: RegExpMatchArray | null;
  const done = <T,>(v: T): T => (save(), v);

  // ---- core
  if (clean === "/auth/me") return userOut(U);
  if (clean === "/auth/password") {
    const cur = (db as any).passwords?.[U.id] ?? (U.role === "admin" ? "admin1234" : "demo1234");
    if (cur !== b.old) bad("wrong_password");
    ((db as any).passwords ??= {})[U.id] = b.new;
    audit(U, "password_change", "user", U.id);
    return done({ ok: true });
  }
  if (clean === "/meta") return { ...VOCAB, cities: db.cities.map((c) => ({ id: c.id, ar: c.name_ar, en: c.name_en, country: c.country, lat: c.lat, lng: c.lng })).sort((a, b) => a.en.localeCompare(b.en)), company: companyOut(wbCompany) };
  if (clean === "/settings") {
    if (method === "PUT") {
      need(U, "settings");
      for (const [k, v] of Object.entries(b)) if (k in companyOut(wbCompany) && !["id", "waybill_prefix_"].includes(k)) {
        if (k === "vat_rate" && (Number(v) < 0 || Number(v) > 100)) bad("invalid");
        wbCompany[k] = v;
      }
      audit(U, "settings", "company", 1);
      return done(companyOut(wbCompany));
    }
    return companyOut(wbCompany);
  }
  if (clean === "/notifications" && method === "GET") {
    const mine = db.notifications.filter((n) => n.user_id === U.id).sort((a, b) => b.id - a.id);
    const items = (p.get("unseen") === "true" ? mine.filter((n) => !n.seen) : mine).slice(0, Math.min(Number(p.get("limit") ?? 40), 200));
    return { unseen: mine.filter((n) => !n.seen).length, items: items.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, seen: n.seen, at: iso(n.at) })) };
  }
  if (clean === "/notifications/seen") { db.notifications.filter((n) => n.user_id === U.id).forEach((n) => (n.seen = true)); return done({ ok: true }); }
  if (clean === "/audit") { need(U, "audit"); return [...db.audit].sort((a, b) => b.id - a.id).slice(0, Math.min(Number(p.get("limit") ?? 100), 500)).map((a) => ({ id: a.id, at: iso(a.at), user: a.user_name, action: a.action, entity: a.entity, entity_id: a.entity_id, detail: a.detail })); }

  // ---- users
  if (clean === "/users" && method === "GET") { need(U, "users"); return [...db.users].sort((a, b) => a.role.localeCompare(b.role) || a.full_name.localeCompare(b.full_name)).map(userOut); }
  if (clean === "/users" && method === "POST") {
    need(U, "users");
    if (!b.password) bad("password_required");
    if (db.users.some((x) => lc(x.login) === lc(b.login))) bad("login_taken");
    if (b.role === "client" && !by("senders", b.sender_id)) bad("sender_required");
    if (b.role === "driver" && !by("drivers", b.driver_id)) bad("driver_required");
    const u: R = { id: nextId("users"), company_id: 1, role: b.role, login: b.login, full_name: b.full_name, phone: b.phone ?? null, active: b.active !== false, view_all: b.view_all !== false, sender_id: b.role === "client" ? b.sender_id : null, driver_id: b.role === "driver" ? b.driver_id : null, created_at: now(), last_login: null };
    db.users.push(u);
    ((db as any).passwords ??= {})[u.id] = b.password;
    audit(U, "user_create", "user", u.id, `${u.login} (${u.role})`);
    return done(userOut(u));
  }
  if ((m = clean.match(/^\/users\/(\d+)$/))) {
    need(U, "users");
    const u = own("users", Number(m[1]));
    if (method === "PUT") {
      if (db.users.some((x) => lc(x.login) === lc(b.login) && x.id !== u.id)) bad("login_taken");
      if (u.id === U.id && (b.role !== u.role || b.active === false)) bad("cannot_demote_self");
      if (b.role === "client" && !by("senders", b.sender_id)) bad("sender_required");
      if (b.role === "driver" && !by("drivers", b.driver_id)) bad("driver_required");
      Object.assign(u, { role: b.role, login: b.login, full_name: b.full_name, phone: b.phone ?? null, active: b.active !== false, view_all: b.view_all !== false, sender_id: b.role === "client" ? b.sender_id : null, driver_id: b.role === "driver" ? b.driver_id : null });
      if (b.password) ((db as any).passwords ??= {})[u.id] = b.password;
      audit(U, "user_update", "user", u.id);
      return done(userOut(u));
    }
    if (method === "DELETE") { if (u.id === U.id) bad("cannot_demote_self"); u.active = false; audit(U, "user_disable", "user", u.id, u.login); return done(undefined); }
  }

  // ---- senders / consignees
  if (clean === "/senders" && method === "GET") {
    need(U, "senders.read");
    let rows = db.senders.filter((s) => U.role !== "client" || s.id === U.sender_id);
    const q = lc(p.get("q"));
    if (q) rows = rows.filter((s) => lc(s.name).includes(q));
    return rows.sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ ...senderOut(s), waybills: db.waybills.filter((w) => w.sender_id === s.id).length }));
  }
  if (clean === "/senders" && method === "POST") {
    need(U, "senders.write"); gpsOk(b.gps); cityOk(b.city_id);
    const s: R = { id: nextId("senders"), company_id: 1, name: b.name, contact_person: b.contact_person ?? null, mobile: b.mobile ?? null, email: b.email ?? null, city_id: b.city_id ?? null, address: b.address ?? null, gps: b.gps ?? null, national_address: b.national_address ?? null, vat_no: b.vat_no ?? null, credit_limit: b.credit_limit ?? 0, payment_terms_days: b.payment_terms_days ?? 30, status: b.status !== false, locked: false };
    db.senders.push(s); audit(U, "sender_create", "sender", s.id, s.name);
    return done(senderOut(s));
  }
  if ((m = clean.match(/^\/senders\/(\d+)$/))) {
    need(U, "senders.read");
    const s = own("senders", Number(m[1]));
    if (method === "GET") { if (U.role === "client" && s.id !== U.sender_id) bad("forbidden", 403); return { ...senderOut(s), consignees: db.consignees.filter((c) => c.sender_id === s.id).sort((a, b) => a.name.localeCompare(b.name)).map(consigneeOut) }; }
    need(U, "senders.write");
    if (method === "PUT") { gpsOk(b.gps); cityOk(b.city_id); Object.assign(s, { name: b.name, contact_person: b.contact_person ?? null, mobile: b.mobile ?? null, email: b.email ?? null, city_id: b.city_id ?? null, address: b.address ?? null, gps: b.gps ?? null, national_address: b.national_address ?? null, vat_no: b.vat_no ?? null, credit_limit: b.credit_limit ?? 0, payment_terms_days: b.payment_terms_days ?? 30, status: b.status !== false }); audit(U, "sender_update", "sender", s.id, s.name); return done(senderOut(s)); }
    if (method === "DELETE") { s.status = false; audit(U, "sender_archive", "sender", s.id, s.name); return done(undefined); }
  }
  if (clean === "/consignees" && method === "GET") {
    need(U, "consignees.read");
    let rows = db.consignees.slice();
    const sid = U.role === "client" ? U.sender_id : Number(p.get("sender_id")) || 0;
    if (sid) rows = rows.filter((c) => c.sender_id === sid);
    if (p.get("active") !== null) rows = rows.filter((c) => c.status === (p.get("active") === "true"));
    const q = lc(p.get("q"));
    if (q) rows = rows.filter((c) => lc(c.name).includes(q));
    return rows.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 500).map((c) => ({ ...consigneeOut(c), sender_name: by("senders", c.sender_id)?.name ?? null }));
  }
  if (clean === "/consignees" && method === "POST") {
    need(U, "consignees.write");
    const sid = U.role === "client" ? U.sender_id : b.sender_id;
    if (!sid || !by("senders", sid)) bad("sender_required");
    gpsOk(b.gps); cityOk(b.city_id);
    if (db.consignees.some((c) => c.sender_id === sid && lc(c.name) === lc(b.name))) bad("duplicate_consignee");
    const c: R = { id: nextId("consignees"), company_id: 1, sender_id: sid, name: b.name, email: b.email ?? null, phone: b.phone ?? null, mobile: b.mobile ?? null, city_id: b.city_id ?? null, address: b.address ?? null, gps: b.gps ?? null, nad: b.nad ?? null, idno: b.idno ?? null, status: b.status !== false };
    db.consignees.push(c); audit(U, "consignee_create", "consignee", c.id, c.name);
    return done(consigneeOut(c));
  }
  if ((m = clean.match(/^\/consignees\/(\d+)$/))) {
    need(U, "consignees.write");
    const c = own("consignees", Number(m[1]));
    if (U.role === "client" && c.sender_id !== U.sender_id) bad("forbidden", 403);
    if (method === "PUT") { gpsOk(b.gps); cityOk(b.city_id); Object.assign(c, { name: b.name, email: b.email ?? null, phone: b.phone ?? null, mobile: b.mobile ?? null, city_id: b.city_id ?? null, address: b.address ?? null, gps: b.gps ?? null, nad: b.nad ?? null, idno: b.idno ?? null, status: b.status !== false }); return done(consigneeOut(c)); }
    if (method === "DELETE") { if (db.waybills.some((w) => w.consignee_id === c.id)) c.status = false; else db.consignees.splice(db.consignees.indexOf(c), 1); return done(undefined); }
  }

  // ---- drivers / vehicles / tariffs
  if (clean === "/drivers" && method === "GET") {
    need(U, "drivers.read");
    let rows = p.get("for_sender") ? allowedDrivers(Number(p.get("for_sender"))) : [...db.drivers].sort((a, b) => a.name.localeCompare(b.name));
    if (p.get("online") !== null) rows = rows.filter((d) => d.online === (p.get("online") === "true"));
    return rows.map(driverOut);
  }
  if ((m = clean.match(/^\/drivers-for\/(\d+)$/))) { need(U, "waybills.write"); return allowedDrivers(Number(m[1])).map(driverOut); }
  if (clean === "/drivers" && method === "POST") {
    need(U, "drivers.write");
    const d: R = { id: nextId("drivers"), company_id: 1, name: b.name, mobile: b.mobile ?? null, email: b.email ?? null, doc_id: b.doc_id ?? null, license_no: b.license_no ?? null, license_expiry: b.license_expiry ?? null, vehicle_id: b.vehicle_id ?? null, sender_ids: b.sender_ids ?? [], status: b.status !== false, locked: false, rating: 5, online: false, last_lat: null, last_lng: null, last_speed: null, last_seen: null };
    db.drivers.push(d); audit(U, "driver_create", "driver", d.id, d.name);
    return done(driverOut(d));
  }
  if ((m = clean.match(/^\/drivers\/(\d+)$/))) {
    need(U, "drivers.read");
    const d = own("drivers", Number(m[1]));
    if (method === "GET") { const done_ = db.waybills.filter((w) => w.driver_id === d.id && w.stage === "delivered"); return { ...driverOut(d), delivered: done_.length, distance_km: Math.round(done_.reduce((a, w) => a + w.distance_km, 0) * 10) / 10 }; }
    need(U, "drivers.write");
    if (method === "PUT") { Object.assign(d, { name: b.name, mobile: b.mobile ?? null, email: b.email ?? null, doc_id: b.doc_id ?? null, license_no: b.license_no ?? null, license_expiry: b.license_expiry ?? null, vehicle_id: b.vehicle_id ?? null, sender_ids: b.sender_ids ?? [], status: b.status !== false }); audit(U, "driver_update", "driver", d.id, d.name); return done(driverOut(d)); }
    if (method === "DELETE") { if (db.waybills.some((w) => w.driver_id === d.id && w.status === "post" && w.stage !== "delivered")) bad("driver_busy"); d.status = false; return done(undefined); }
  }
  if (clean === "/vehicles" && method === "GET") { need(U, "vehicles.read"); const names = Object.fromEntries(db.drivers.filter((d) => d.vehicle_id).map((d) => [d.vehicle_id, d.name])); return [...db.vehicles].sort((a, b) => a.plate.localeCompare(b.plate)).map((v) => ({ ...vehicleOut(v), driver_name: names[v.id] ?? null })); }
  if (clean === "/vehicles" && method === "POST") {
    need(U, "vehicles.write");
    if (db.vehicles.some((v) => lc(v.plate) === lc(b.plate))) bad("plate_taken");
    const v: R = { id: nextId("vehicles"), company_id: 1, plate: b.plate, kind: b.kind ?? "dyna", capacity_kg: b.capacity_kg ?? 0, capacity_pallets: b.capacity_pallets ?? 0, status: b.status ?? "available", insurance_expiry: b.insurance_expiry ?? null, registration_expiry: b.registration_expiry ?? null, last_service: b.last_service ?? null, odometer_km: b.odometer_km ?? 0, notes: b.notes ?? null };
    db.vehicles.push(v); return done(vehicleOut(v));
  }
  if ((m = clean.match(/^\/vehicles\/(\d+)$/))) {
    need(U, "vehicles.write");
    const v = own("vehicles", Number(m[1]));
    if (method === "PUT") { if (db.vehicles.some((x) => lc(x.plate) === lc(b.plate) && x.id !== v.id)) bad("plate_taken"); Object.assign(v, { plate: b.plate, kind: b.kind, capacity_kg: b.capacity_kg ?? 0, capacity_pallets: b.capacity_pallets ?? 0, status: b.status, insurance_expiry: b.insurance_expiry ?? null, registration_expiry: b.registration_expiry ?? null, last_service: b.last_service ?? null, odometer_km: b.odometer_km ?? 0, notes: b.notes ?? null }); return done(vehicleOut(v)); }
    if (method === "DELETE") { if (db.drivers.some((d) => d.vehicle_id === v.id) || db.waybills.some((w) => w.vehicle_id === v.id)) bad("in_use"); db.vehicles.splice(db.vehicles.indexOf(v), 1); return done(undefined); }
  }
  if (clean === "/tariffs" && method === "GET") { need(U, "tariffs.read"); let rows = [...db.tariffs].sort((a, b) => a.name.localeCompare(b.name)); if (p.get("active") !== null) rows = rows.filter((t) => t.active === (p.get("active") === "true")); return rows.map(tariffOut); }
  if (clean === "/tariffs" && method === "POST") {
    need(U, "tariffs.write"); cityOk(b.from_city_id); cityOk(b.to_city_id);
    const t: R = { id: nextId("tariffs"), company_id: 1, name: b.name, code: b.code ?? "", service_type: b.service_type ?? null, from_city_id: b.from_city_id ?? null, to_city_id: b.to_city_id ?? null, base: b.base ?? 0, per_km: b.per_km ?? 0, per_pallet: b.per_pallet ?? 0, per_kg: b.per_kg ?? 0, min_charge: b.min_charge ?? 0, active: b.active !== false };
    db.tariffs.push(t); return done(tariffOut(t));
  }
  if ((m = clean.match(/^\/tariffs\/(\d+)$/))) {
    need(U, "tariffs.write");
    const t = own("tariffs", Number(m[1]));
    if (method === "PUT") { Object.assign(t, { name: b.name, code: b.code ?? "", service_type: b.service_type ?? null, from_city_id: b.from_city_id ?? null, to_city_id: b.to_city_id ?? null, base: b.base ?? 0, per_km: b.per_km ?? 0, per_pallet: b.per_pallet ?? 0, per_kg: b.per_kg ?? 0, min_charge: b.min_charge ?? 0, active: b.active !== false }); return done(tariffOut(t)); }
    if (method === "DELETE") { if (db.waybills.some((w) => w.tariff_id === t.id)) t.active = false; else db.tariffs.splice(db.tariffs.indexOf(t), 1); return done(undefined); }
  }

  // ---- geo
  if (clean === "/geo/resolve") {
    const c = b.ref_city_id ? by("cities", b.ref_city_id) : null;
    const got = resolveLocation(String(b.text ?? ""), c ? [c.lat, c.lng] : null);
    if (!got) bad("gps_unresolved", 422);
    return got;
  }
  if (clean === "/geo/distance") { const a = parseGps(b.from_gps), z = parseGps(b.to_gps); if (!a || !z) bad("gps_invalid"); return geoRoute(a!, z!, wbCompany.distance_factor); }

  // ---- waybills
  if (clean === "/waybills/next-number") { need(U, "waybills.write"); return { number: formatNumber(wbCompany, wbCompany.next_seq), auto: wbCompany.auto_number, optional: wbCompany.number_optional }; }
  if (clean === "/waybills" && method === "GET") {
    need(U, "waybills.read", "jobs");
    const scope = visible(U);
    const counts: Record<string, number> = {};
    for (const w of scope) counts[w.status] = (counts[w.status] ?? 0) + 1;
    let rows = scope.slice();
    const q = lc(p.get("q"));
    if (q) rows = rows.filter((w) => [w.number, w.to_name, w.order_no, w.shipment_no, w.delivery_note, by("senders", w.sender_id)?.name].some((x) => lc(x).includes(q)));
    if (p.get("status")) rows = rows.filter((w) => p.get("status")!.split(",").includes(w.status));
    if (p.get("stage")) rows = rows.filter((w) => p.get("stage")!.split(",").includes(w.stage));
    if (p.get("delivery_status") !== null && p.get("delivery_status") !== "") rows = rows.filter((w) => w.delivery_status === Number(p.get("delivery_status")));
    if (p.get("sender_id") && U.role !== "client") rows = rows.filter((w) => String(w.sender_id) === p.get("sender_id"));
    for (const k of ["driver_id", "from_city_id", "to_city_id", "priority"]) if (p.get(k)) rows = rows.filter((w) => String(w[k]) === p.get(k));
    if (p.get("date_from")) rows = rows.filter((w) => w.date >= p.get("date_from")!);
    if (p.get("date_to")) rows = rows.filter((w) => w.date <= p.get("date_to")!);
    if (p.get("delayed")) rows = rows.filter(isDelayed);
    if (p.get("unassigned")) rows = rows.filter((w) => w.status === "post" && !w.driver_id);
    const sort = p.get("sort") ?? "-created";
    const col = SORTS[sort.replace("-", "")] ?? "id";
    const dir = sort.startsWith("-") ? -1 : 1;
    rows.sort((a, b) => (a[col] > b[col] ? dir : a[col] < b[col] ? -dir : b.id - a.id));
    const size = Math.max(1, Math.min(Number(p.get("size") ?? 20), 200));
    const page = Math.max(Number(p.get("page") ?? 1), 1);
    return { items: rows.slice((page - 1) * size, page * size).map((w) => wbOut(w, false, U.role)), total: rows.length, page, size, counts };
  }
  if (clean === "/waybills" && method === "POST") {
    need(U, "waybills.write");
    const w = newWaybillShell(U);
    applyWaybill(w, b, U, true);
    const manual = b.number && (!wbCompany.auto_number || wbCompany.number_optional);
    if (manual) { if (db.waybills.some((x) => x.number === b.number)) bad("number_taken"); w.number = b.number; }
    else { if (!wbCompany.auto_number) bad("number_required"); w.number = consumeNumber(wbCompany); }
    db.waybills.push(w);
    if (b.driver_id) setDriver(w, b.driver_id, U);
    logEvent(w, "created", U); audit(U, "waybill_create", "waybill", w.id, w.number);
    return done(wbOut(w, true, U.role));
  }
  if ((m = clean.match(/^\/waybills\/(\d+)$/))) {
    need(U, "waybills.read", "jobs");
    const w = getWaybill(U, Number(m[1]));
    if (method === "GET") return wbOut(w, true, U.role);
    need(U, "waybills.write");
    if (method === "PUT") {
      if (!(w.status === "new" || (w.status === "post" && ["admin", "dispatcher"].includes(U.role)))) bad("waybill_locked");
      applyWaybill(w, b, U, false);
      if (b.number && b.number !== w.number && !wbCompany.auto_number) { if (db.waybills.some((x) => x.number === b.number && x.id !== w.id)) bad("number_taken"); w.number = b.number; }
      if ((b.driver_id ?? null) !== w.driver_id) setDriver(w, b.driver_id ?? null, U);
      logEvent(w, "updated", U); bump(w);
      return done(wbOut(w, true, U.role));
    }
    if (method === "DELETE") { if (w.status !== "new") bad("waybill_locked"); db.events = db.events.filter((e) => e.waybill_id !== w.id); db.waybills.splice(db.waybills.indexOf(w), 1); audit(U, "waybill_delete", "waybill", w.id, w.number); return done(undefined); }
  }
  if ((m = clean.match(/^\/waybills\/(\d+)\/(duplicate|post|assign|cancel|comment|attachments)$/)) && method === "POST") {
    const w = getWaybill(U, Number(m[1]));
    const act = m[2];
    if (act === "duplicate") {
      need(U, "waybills.write");
      const keep = ["sender_id", "consignee_id", "from_city_id", "from_address", "from_gps", "from_mobile", "from_email", "order_no", "shipment_no", "delivery_note", "to_name", "to_phone", "to_mobile", "to_email", "to_city_id", "to_address", "to_gps", "to_nad", "to_idno", "shipment_det", "remark", "service_type", "deliver_type", "return_refs", "packages", "material", "qty", "weight", "total_qty", "est_weight", "volume_m3", "priority", "payment_mode", "invoice_type", "insurance_type", "shipment_value", "cod_amount", "collect_type", "distance_km", "duration_min"];
      const c = newWaybillShell(U);
      for (const k of keep) c[k] = JSON.parse(JSON.stringify(w[k] ?? null));
      c.number = consumeNumber(wbCompany);
      db.waybills.push(c); logEvent(c, "created", U, `copy of ${w.number}`);
      return done(wbOut(c, true, U.role));
    }
    if (act === "post") {
      need(U, "waybills.post");
      if (wbCompany.attachment_required && !db.attachments.some((a) => a.waybill_id === w.id && a.kind === "from")) bad("attachment_required");
      postWaybill(w, U); audit(U, "waybill_post", "waybill", w.id, w.number); bump(w);
      return done(wbOut(w, true, U.role));
    }
    if (act === "assign") { need(U, "dispatch"); setDriver(w, b.driver_id ?? null, U); if (w.status === "new") logEvent(w, b.driver_id ? "driver_set" : "driver_cleared", U, w.vehicle_no); bump(w); return done(wbOut(w, true, U.role)); }
    if (act === "cancel") {
      need(U, "waybills.cancel");
      if (U.role === "client" && w.status !== "new" && !["pending", "assigned"].includes(w.stage)) bad("cannot_cancel");
      cancelWaybill(w, U, b.reason ?? null); audit(U, "waybill_cancel", "waybill", w.id, w.number); bump(w);
      return done(wbOut(w, true, U.role));
    }
    if (act === "comment") { if (!b.reason) bad("text_required"); logEvent(w, "comment", U, String(b.reason).slice(0, 300)); return done({ ok: true }); }
    if (act === "attachments") {
      need(U, "waybills.write");
      const file = opts.form?.get("file") as File | null;
      const kind = String(opts.form?.get("kind") ?? "policy");
      if (!file) bad("invalid");
      if (!["from", "policy"].includes(kind)) bad("bad_kind");
      const ext = (file!.name.split(".").pop() ?? "").toLowerCase();
      if (!["pdf", "jpg", "jpeg", "png", "gif", "doc", "docx", "xls", "xlsx", "zip"].includes(ext)) bad("file_type");
      if (file!.size > 1_500_000) bad("file_too_large", 413);
      if (kind === "from") db.attachments = db.attachments.filter((a) => !(a.waybill_id === w.id && a.kind === "from"));
      const a: R = { id: nextId("attachments"), waybill_id: w.id, kind, filename: file!.name, url: await fileToDataUrl(file!), size: file!.size, created_at: now() };
      db.attachments.push(a); logEvent(w, "attachment", U, a.filename);
      return done({ id: a.id, kind: a.kind, filename: a.filename, size: a.size, url: a.url, created_at: iso(a.created_at) });
    }
  }
  if ((m = clean.match(/^\/waybills\/(\d+)\/attachments\/(\d+)$/)) && method === "DELETE") { need(U, "waybills.write"); getWaybill(U, Number(m[1])); db.attachments = db.attachments.filter((a) => a.id !== Number(m![2])); return done(undefined); }

  // ---- dispatch / delivery
  if (clean === "/dispatch/board") {
    need(U, "dispatch");
    const since = new Date(Date.now() - 36 * 3600000).toISOString().slice(0, 19);
    const rows = db.waybills.filter((w) => w.status === "post" || (w.status === "delivered" && w.delivered_at >= since)).sort((a, b) => (a.priority < b.priority ? 1 : a.priority > b.priority ? -1 : (a.promised_at ?? "") < (b.promised_at ?? "") ? -1 : 1));
    const cols: Record<string, R[]> = { unassigned: [], assigned: [], in_progress: [], delivered: [] };
    for (const w of rows) {
      const it = wbOut(w);
      if (w.stage === "delivered") cols.delivered.push(it); else if (["picked_up", "in_transit", "arrived"].includes(w.stage)) cols.in_progress.push(it); else if (w.driver_id) cols.assigned.push(it); else cols.unassigned.push(it);
    }
    const act: Record<number, number> = {};
    for (const w of rows) if (w.driver_id && w.stage !== "delivered") act[w.driver_id] = (act[w.driver_id] ?? 0) + 1;
    const drivers = db.drivers.filter((d) => d.status).map((d) => ({ ...driverOut(d), active: act[d.id] ?? 0 })).sort((a, b) => a.active - b.active || a.name.localeCompare(b.name));
    return { columns: cols, drivers };
  }
  if (clean === "/delivery" && method === "GET") {
    need(U, "delivery");
    let rows = db.waybills.filter((w) => ["post", "delivered"].includes(w.status) && w.from_gps);
    const ds = p.get("delivery_status") === null ? 0 : Number(p.get("delivery_status"));
    rows = rows.filter((w) => w.delivery_status === ds);
    if (p.get("date_from")) rows = rows.filter((w) => w.date >= p.get("date_from")!);
    if (p.get("date_to")) rows = rows.filter((w) => w.date <= p.get("date_to")!);
    return rows.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, 300).map((w) => wbOut(w));
  }
  if (clean === "/delivery/update") {
    need(U, "delivery");
    if (!(b.rows ?? []).length) bad("no_updates");
    let n = 0;
    for (const row of b.rows) {
      const w = getWaybill(U, row.id);
      if (!["post", "delivered"].includes(w.status)) continue;
      if (row.to_gps) { if (!parseGps(row.to_gps)) bad("gps_invalid"); w.to_gps = row.to_gps; }
      if (row.distance_km != null) w.distance_km = Math.round(row.distance_km * 100) / 100;
      for (const f of ["received_by", "receiver_mobile", "receiver_id"]) if (f in row) w[f] = row[f];
      if ("driver_id" in row && (row.driver_id ?? null) !== w.driver_id && w.stage !== "delivered") setDriver(w, row.driver_id ?? null, U);
      if (row.delivery_status != null && row.delivery_status !== w.delivery_status) bulkDelivery(w, U, row.delivery_status);
      w.updated_by = U.id; bump(w); n++;
    }
    return done({ updated: n });
  }

  // ---- driver app / tracking
  const driverOf = (): R => (U.driver_id ? by("drivers", U.driver_id) : null) ?? bad("not_a_driver", 403);
  if (clean === "/jobs") {
    need(U, "jobs");
    const d = driverOf();
    const since = new Date(Date.now() - 24 * 3600000).toISOString().slice(0, 19);
    const items = db.waybills.filter((w) => w.driver_id === d.id && (w.status === "post" || (w.stage === "delivered" && w.delivered_at >= since))).sort((a, b) => (a.priority < b.priority ? 1 : a.priority > b.priority ? -1 : (a.promised_at ?? "") < (b.promised_at ?? "") ? -1 : 1)).map((w) => wbOut(w, false, "driver"));
    return { driver: driverOut(d), active: items.filter((i) => i.stage !== "delivered"), done: items.filter((i) => i.stage === "delivered") };
  }
  if ((m = clean.match(/^\/jobs\/(\d+)\/step$/))) {
    need(U, "jobs");
    const d = driverOf();
    const w = getWaybill(U, Number(m[1]));
    driverStep(w, U, d, b.stage, b);
    if (b.lat != null && b.lng != null) registerPing(d, b.lat, b.lng, null);
    bump(w);
    return done(wbOut(w, true, "driver"));
  }
  if (clean === "/tracking/ping") { need(U, "jobs"); if (Math.abs(b.lat) > 90 || Math.abs(b.lng) > 180) bad("invalid"); return done(registerPing(driverOf(), b.lat, b.lng, b.speed ?? null)); }
  if (clean === "/tracking/offline") { need(U, "jobs"); driverOf().online = false; return done({ ok: true }); }
  if (clean === "/tracking/live") {
    need(U, "tracking");
    simulateTraffic();
    save();
    const items = visible(U).filter((w) => w.status === "post" && ACTIVE.includes(w.stage)).sort((a, b) => b.id - a.id).map((w) => { const o = wbOut(w, true, U.role); for (const k of ["events", "attachments", "pod_signature", "pod_photo"]) delete o[k]; return o; });
    const cutoff = new Date(Date.now() - 30 * 60000).toISOString().slice(0, 19);
    const drivers = ["client", "driver"].includes(U.role) ? [] : db.drivers.filter((d) => d.last_lat != null && d.last_seen && d.last_seen >= cutoff).map(driverOut);
    return { waybills: items, drivers, at: iso(now()) };
  }
  if ((m = clean.match(/^\/tracking\/waybill\/(\d+)\/trail$/))) {
    need(U, "tracking", "jobs");
    const w = getWaybill(U, Number(m[1]));
    if (!w.driver_id) return [];
    const start = w.collected_at ?? new Date(Date.now() - 12 * 3600000).toISOString().slice(0, 19);
    const end = w.delivered_at ?? now();
    return db.pings.filter((x) => x.driver_id === w.driver_id && x.at >= start && x.at <= end).slice(-1500).map((x) => ({ lat: x.lat, lng: x.lng, at: iso(x.at) }));
  }
  if (clean === "/public/track") {
    const num = (p.get("number") ?? "").trim().toUpperCase();
    const code = (p.get("code") ?? "").trim();
    const w = db.waybills.find((x) => x.number.toUpperCase() === num);
    const digits = (s: any) => String(s ?? "").replace(/\D/g, "");
    const ok = !!w && (([digits(w.to_mobile), digits(w.to_phone)].some((ph) => ph && digits(code).length >= 4 && ph.endsWith(digits(code).slice(-4)))) || (!!w.otp && code === w.otp));
    if (!w || !ok || w.status === "new") bad("track_not_found", 404);
    const d = w!.driver_id ? by("drivers", w!.driver_id) : null;
    let pos: R | null = null;
    if (d && d.last_lat != null && ACTIVE.includes(w!.stage)) {
      pos = { lat: d.last_lat, lng: d.last_lng, seen: iso(d.last_seen) };
      const dest = parseGps(w!.to_gps);
      if (dest) { const rem = haversine([d.last_lat, d.last_lng], dest) * wbCompany.distance_factor; pos.remaining_km = Math.round(rem * 100) / 100; pos.eta_min = Math.round((rem / (d.last_speed >= 15 ? d.last_speed : 45)) * 60); }
    }
    const s = by("senders", w!.sender_id);
    const PUB = ["created", "posted", "assigned", "accepted", "picked_up", "in_transit", "near_destination", "arrived", "delivered", "failed", "cancelled"];
    return { number: w!.number, status: w!.status, stage: w!.stage, company: wbCompany.name, company_en: wbCompany.name_en, sender: s?.name ?? null, from_city: city(w!.from_city_id), to_city: city(w!.to_city_id), to_gps: w!.to_gps, from_gps: w!.from_gps, promised_at: iso(w!.promised_at), delivered_at: iso(w!.delivered_at), received_by: w!.received_by, driver_name: d && ACTIVE.includes(w!.stage) ? d.name : null, vehicle_no: ACTIVE.includes(w!.stage) ? w!.vehicle_no : null, position: pos, timeline: db.events.filter((e) => e.waybill_id === w!.id && PUB.includes(e.type)).sort((a, b) => a.id - b.id).map((e) => ({ at: iso(e.at), type: e.type })) };
  }

  // ---- billing
  if (clean === "/billing/unverified") {
    need(U, "billing");
    let rows = db.waybills.filter((w) => w.status === "delivered");
    if (p.get("date_from")) rows = rows.filter((w) => w.date >= p.get("date_from")!);
    if (p.get("date_to")) rows = rows.filter((w) => w.date <= p.get("date_to")!);
    if (p.get("sender_id")) rows = rows.filter((w) => String(w.sender_id) === p.get("sender_id"));
    return rows.sort((a, b) => ((a.delivered_at ?? "") < (b.delivered_at ?? "") ? -1 : 1)).slice(0, 300).map((w) => {
      const it = wbOut(w);
      const t = suggestTariff(w);
      it.suggested_tariff_id = t?.id ?? null;
      if (t) { const c = computeCharge(t, w.distance_km, packageTotals(normalizePackages(w.packages)).pallets, w.weight); it.suggested_charge = c; it.suggested_vat = r2((c * wbCompany.vat_rate) / 100); }
      return it;
    });
  }
  if (clean === "/billing/verify") {
    need(U, "billing");
    if (!(b.rows ?? []).length) bad("no_updates");
    const snapshot = JSON.stringify(db);
    try { for (const r of b.rows) { const w = own("waybills", r.id); verifyWaybill(w, U, r.tariff_id, r.distance_km ?? null); audit(U, "waybill_verify", "waybill", w.id, w.number); } } catch (e) { Object.assign(db, JSON.parse(snapshot)); throw e; }
    return done({ verified: b.rows.length });
  }
  if (clean === "/billing/ready") { need(U, "billing", "invoices.write"); let rows = db.waybills.filter((w) => w.status === "verified" && !w.invoice_id); if (p.get("sender_id")) rows = rows.filter((w) => String(w.sender_id) === p.get("sender_id")); return rows.sort((a, b) => a.sender_id - b.sender_id || a.id - b.id).slice(0, 500).map((w) => wbOut(w)); }
  if (clean === "/invoices" && method === "GET") {
    need(U, "invoices.read");
    let rows = db.invoices.filter((i) => U.role !== "client" || (i.sender_id === U.sender_id && i.status !== "draft"));
    if (p.get("sender_id") && U.role !== "client") rows = rows.filter((i) => String(i.sender_id) === p.get("sender_id"));
    if (p.get("status")) rows = rows.filter((i) => p.get("status")!.split(",").includes(i.status));
    let out = rows.sort((a, b) => b.id - a.id).slice(0, 500).map((i) => invoiceOut(i));
    if (p.get("overdue")) out = out.filter((i) => i.overdue);
    return out;
  }
  if (clean === "/invoices" && method === "POST") { need(U, "invoices.write"); const invs = createInvoices(U, b.waybill_ids ?? [], !!b.issue); invs.forEach((i) => audit(U, "invoice_create", "invoice", i.id, i.number)); return done(invs.map((i) => invoiceOut(i))); }
  if ((m = clean.match(/^\/invoices\/(\d+)(?:\/(issue|void|pay))?$/))) {
    need(U, "invoices.read");
    const i = own("invoices", Number(m[1]));
    if (U.role === "client" && (i.sender_id !== U.sender_id || i.status === "draft")) bad("not_found", 404);
    if (!m[2]) return { ...invoiceOut(i, true), company: { name: wbCompany.name, name_en: wbCompany.name_en, vat_no: wbCompany.vat_no, address: wbCompany.address, phone: wbCompany.phone, email: wbCompany.email, currency: wbCompany.currency, vat_rate: wbCompany.vat_rate } };
    if (m[2] === "issue") {
      need(U, "invoices.write");
      if (i.status !== "draft") bad("not_draft");
      i.status = "issued"; i.issue_date = todayStr();
      i.due_date = addDaysStr(i.issue_date, by("senders", i.sender_id)?.payment_terms_days ?? 0);
      notify(senderUsers(i.sender_id), "invoice", i.number, String(i.total), `/app/invoice?id=${i.id}`);
      audit(U, "invoice_issue", "invoice", i.id, i.number);
      return done(invoiceOut(i, true));
    }
    if (m[2] === "void") { need(U, "invoices.write"); voidInvoice(i, U); audit(U, "invoice_void", "invoice", i.id, i.number); return done(invoiceOut(i, true)); }
    if (m[2] === "pay") { need(U, "payments"); addPayment(i, U, b.amount, b.method ?? "bank", b.ref ?? null, b.date); audit(U, "payment", "invoice", i.id, `${i.number} · ${b.amount}`); return done(invoiceOut(i, true)); }
  }
  if (clean === "/cod" && method === "GET") {
    need(U, "cod");
    const groups: Record<number, R> = {};
    for (const w of db.waybills.filter((x) => x.cod_collected && !x.cod_settled).sort((a, b) => ((a.delivered_at ?? "") < (b.delivered_at ?? "") ? -1 : 1))) {
      const k = w.driver_id ?? 0;
      const g = (groups[k] ??= { driver_id: w.driver_id, driver_name: w.driver_id ? by("drivers", w.driver_id)?.name ?? "-" : "-", total: 0, items: [] });
      g.total = r2(g.total + w.cod_amount); g.items.push(wbOut(w));
    }
    return { total: r2(Object.values(groups).reduce((a, g) => a + g.total, 0)), groups: Object.values(groups) };
  }
  if (clean === "/cod/settle") {
    need(U, "cod");
    let n = 0;
    for (const w of db.waybills.filter((x) => (b.waybill_ids ?? []).includes(x.id) && x.cod_collected && !x.cod_settled)) { w.cod_settled = true; logEvent(w, "cod_settled", U, String(w.cod_amount)); n++; }
    if (!n) bad("nothing_to_settle");
    audit(U, "cod_settle", "waybill", null, `${n} waybills`);
    return done({ settled: n });
  }

  // ---- dashboard & reports
  if (clean === "/dashboard") { need(U, "dashboard", "jobs"); return dashboard(U); }
  if (clean === "/reports/shipment-status") {
    need(U, "reports");
    let rows = reportScope(U, p, true);
    if (p.get("to_city_id")) rows = rows.filter((w) => String(w.to_city_id) === p.get("to_city_id"));
    const st = p.get("status");
    if (st) rows = rows.filter((w) => (st === "post" ? ["post", "delivered"].includes(w.status) : w.status === st));
    if (p.get("delivery_status") !== null && p.get("delivery_status") !== "") rows = rows.filter((w) => w.delivery_status === Number(p.get("delivery_status")));
    if (p.get("delivered_from")) rows = rows.filter((w) => w.delivered_at && w.delivered_at.slice(0, 10) >= p.get("delivered_from")!);
    if (p.get("delivered_to")) rows = rows.filter((w) => w.delivered_at && w.delivered_at.slice(0, 10) <= p.get("delivered_to")!);
    const out = rows.slice(0, 2000).map((w) => { const cr = by("users", w.created_by); return { id: w.id, number: w.number, date: w.date, sender: by("senders", w.sender_id)?.name ?? "-", user: cr?.full_name ?? "-", user_email: cr?.login ?? "-", to_name: w.to_name, to_city: city(w.to_city_id), service: w.tariff_id ? by("tariffs", w.tariff_id)?.name ?? null : null, service_charge: w.service_charge, status: w.status, delivery_status: w.delivery_status, driver: w.driver_id ? by("drivers", w.driver_id)?.name ?? null : null, delivered_at: w.delivered_at ? w.delivered_at.slice(0, 16).replace("T", " ") : null }; });
    return { rows: out, totals: { count: out.length, service_charge: sum(out, "service_charge") } };
  }
  if (clean === "/reports/waybill-list") {
    need(U, "reports");
    const q2 = new URLSearchParams(p);
    if (!q2.get("date_from")) q2.set("date_from", addDaysStr(todayStr(), -30));
    if (!q2.get("date_to")) q2.set("date_to", todayStr());
    if (U.role === "client") q2.delete("sender_id");
    const inv = Object.fromEntries(db.invoices.map((i) => [i.id, i.number]));
    const rows = reportScope(U, q2).slice(0, 2000).map((w) => {
      const pallets = packageTotals(normalizePackages(w.packages)).pallets;
      return { id: w.id, date: w.date, invoice: inv[w.invoice_id] ?? null, order_no: w.order_no, to_name: w.to_name, from_city: city(w.from_city_id), delivery_note: w.delivery_note, number: w.number, vehicle_no: w.vehicle_no, driver: w.driver_id ? by("drivers", w.driver_id)?.name ?? null : null, sender: by("senders", w.sender_id)?.name ?? null, to_city: city(w.to_city_id), to_gps: w.to_gps, distance_km: w.distance_km, pallets: pallets || null, material: w.material, total_qty: w.total_qty, est_weight: w.est_weight, amount_without_vat: w.service_charge || null, amount_with_vat: w.service_charge ? r2(w.service_charge + w.vat_amount) : null };
    });
    const tot = (k: string) => r2(rows.reduce((a: number, r: R) => a + (r[k] || 0), 0));
    return { rows, totals: { count: rows.length, distance_km: tot("distance_km"), pallets: tot("pallets"), total_qty: tot("total_qty"), est_weight: tot("est_weight"), amount_without_vat: tot("amount_without_vat"), amount_with_vat: tot("amount_with_vat") } };
  }
  if (clean === "/reports/drivers") {
    need(U, "reports");
    if (U.role === "client") bad("forbidden", 403);
    const q2 = new URLSearchParams(p);
    if (!q2.get("date_from")) q2.set("date_from", addDaysStr(todayStr(), -30));
    if (!q2.get("date_to")) q2.set("date_to", todayStr());
    const out: Record<number, R> = {};
    for (const w of reportScope(U, q2).filter((x) => x.driver_id)) {
      const d = (out[w.driver_id] ??= { driver_id: w.driver_id, driver: by("drivers", w.driver_id)?.name ?? "-", assigned: 0, delivered: 0, failed: 0, late: 0, km: 0, hours: [], cod: 0 });
      d.assigned++; d.failed += w.stage === "failed" ? 1 : 0;
      if (w.stage === "delivered") { d.delivered++; d.late += isLate(w) ? 1 : 0; d.km += w.distance_km; if (w.collected_at && w.delivered_at) d.hours.push((Date.parse(`${w.delivered_at}Z`) - Date.parse(`${w.collected_at}Z`)) / 3600000); d.cod += w.cod_collected ? w.cod_amount : 0; }
    }
    return { rows: Object.values(out).map((d) => ({ driver_id: d.driver_id, driver: d.driver, assigned: d.assigned, delivered: d.delivered, failed: d.failed, late: d.late, km: r2(d.km), cod: r2(d.cod), on_time_rate: d.delivered ? Math.round((1000 * (d.delivered - d.late)) / d.delivered) / 10 : null, avg_hours: d.hours.length ? Math.round((d.hours.reduce((a: number, b: number) => a + b, 0) / d.hours.length) * 10) / 10 : null })).sort((a, b) => b.delivered - a.delivered) };
  }
  if (clean === "/reports/revenue") {
    need(U, "reports"); financeOnly(U);
    const months = Number(p.get("months") ?? 6);
    const start = addDaysStr(todayStr().slice(0, 7) + "-01", -31 * (months - 1)).slice(0, 7) + "-01";
    const invs = db.invoices.filter((i) => ["issued", "partial", "paid"].includes(i.status) && i.issue_date >= start);
    const bm: Record<string, R> = {}, bs: Record<number, R> = {};
    for (const i of invs) {
      const mm = (bm[i.issue_date.slice(0, 7)] ??= { subtotal: 0, vat: 0, total: 0, paid: 0, count: 0 });
      mm.subtotal += i.subtotal; mm.vat += i.vat; mm.total += i.total; mm.paid += i.paid; mm.count++;
      const ss = (bs[i.sender_id] ??= { total: 0, paid: 0, count: 0 });
      ss.total += i.total; ss.paid += i.paid; ss.count++;
    }
    const fx = (v: R) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "count" ? x : r2(x as number)]));
    return { months: Object.entries(bm).sort().map(([month, v]) => ({ month, ...fx(v) })), senders: Object.entries(bs).map(([k, v]) => ({ sender_id: Number(k), sender: by("senders", Number(k))?.name ?? "-", ...fx(v) })).sort((a: any, b: any) => b.total - a.total), totals: { total: r2(invs.reduce((a, i) => a + i.total, 0)), paid: r2(invs.reduce((a, i) => a + i.paid, 0)), count: invs.length } };
  }
  if (clean === "/reports/receivables") {
    need(U, "reports"); financeOnly(U);
    const today = todayStr();
    const out: Record<number, R> = {};
    for (const i of db.invoices.filter((x) => ["issued", "partial"].includes(x.status))) {
      const bal = i.total - i.paid;
      const late = i.due_date ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${i.due_date}T00:00:00Z`)) / 86400000) : 0;
      const bk = late <= 0 ? "current" : late <= 30 ? "d1_30" : late <= 60 ? "d31_60" : late <= 90 ? "d61_90" : "d90";
      const r = (out[i.sender_id] ??= { sender_id: i.sender_id, sender: by("senders", i.sender_id)?.name ?? "-", current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0, total: 0 });
      r[bk] = r2(r[bk] + bal); r.total = r2(r.total + bal);
    }
    const rows = Object.values(out).sort((a, b) => b.total - a.total);
    return { rows, totals: Object.fromEntries(["current", "d1_30", "d31_60", "d61_90", "d90", "total"].map((k) => [k, r2(rows.reduce((a, r) => a + r[k], 0))])) };
  }
  if ((m = clean.match(/^\/reports\/statement\/(\d+)$/))) {
    need(U, "reports", "invoices.read");
    let sid = Number(m[1]);
    if (U.role === "client") sid = U.sender_id ?? -1; else if (!["admin", "finance"].includes(U.role)) bad("forbidden", 403);
    const s = own("senders", sid);
    const entries: R[] = [];
    for (const i of db.invoices.filter((x) => x.sender_id === sid && ["issued", "partial", "paid"].includes(x.status))) {
      entries.push({ date: i.issue_date, kind: "invoice", ref: i.number, debit: i.total, credit: 0, invoice_id: i.id });
      for (const pay of db.payments.filter((x) => x.invoice_id === i.id)) entries.push({ date: pay.date, kind: "payment", ref: pay.ref ?? i.number, debit: 0, credit: pay.amount, invoice_id: i.id });
    }
    entries.sort((a, b) => (a.date === b.date ? (a.kind === "invoice" ? -1 : 1) : a.date < b.date ? -1 : 1));
    let bal = 0;
    for (const e of entries) { bal = r2(bal + e.debit - e.credit); e.balance = bal; }
    return { sender: { id: s.id, name: s.name, vat_no: s.vat_no, address: s.address }, entries, totals: { debit: sum(entries, "debit"), credit: sum(entries, "credit"), balance: bal } };
  }

  throw new E("not_found", 404);
}
export { ALL as _ALL, driverUsers as _du, usersWithRole as _ur, fmtGps as _fg, notify as _n };
