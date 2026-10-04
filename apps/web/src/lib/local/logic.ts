/* eslint-disable @typescript-eslint/no-explicit-any */
// Port of apps/api/app/services.py + perms.py: serializers, numbering, pricing and the waybill life-cycle.
import { etaMinutes, haversine, parseGps, type LL } from "./geo";
import { addDaysStr, getDB, iso, nextId, now, r2, todayStr, type R } from "./store";

export class E extends Error {
  constructor(public message: string, public status = 400) {
    super(message);
  }
}
export const bad = (code: string, status = 400): never => {
  throw new E(code, status);
};

export const ALL = [
  "dashboard", "waybills.read", "waybills.write", "waybills.all", "waybills.post", "waybills.cancel", "dispatch", "delivery", "tracking",
  "billing", "invoices.read", "invoices.write", "payments", "cod", "senders.read", "senders.write", "consignees.read", "consignees.write",
  "drivers.read", "drivers.write", "vehicles.read", "vehicles.write", "tariffs.read", "tariffs.write", "reports", "users", "settings", "audit", "jobs",
];
export const ROLE_PERMS: Record<string, string[]> = {
  admin: ALL,
  dispatcher: ["dashboard", "waybills.read", "waybills.write", "waybills.all", "waybills.post", "waybills.cancel", "dispatch", "delivery", "tracking", "senders.read", "senders.write", "consignees.read", "consignees.write", "drivers.read", "drivers.write", "vehicles.read", "vehicles.write", "tariffs.read", "reports"],
  finance: ["dashboard", "waybills.read", "waybills.all", "billing", "invoices.read", "invoices.write", "payments", "cod", "senders.read", "consignees.read", "drivers.read", "tariffs.read", "tariffs.write", "reports"],
  client: ["dashboard", "waybills.read", "waybills.write", "waybills.post", "waybills.cancel", "consignees.read", "consignees.write", "senders.read", "invoices.read", "tracking", "reports"],
  driver: ["jobs"],
};
export const VOCAB = {
  service_types: ["domestic", "international"], deliver_types: ["d2d", "d2h", "h2d", "h2h"], payment_modes: ["shipper", "recipient", "3rd_party"],
  invoice_types: ["credit", "cod", "foc", "pp"], insurance_types: ["none", "pp_cod"], collect_types: ["driver", "supervisor"], return_refs: ["wb", "dn", "st", "sg", "rr", "ot"],
  pkg_types: ["pallet", "box", "drum", "gallon", "gallon_15", "gallon_20", "gallon_25", "ftl", "container", "lorry", "dyna", "others"],
  materials: ["grease", "oil", "transmission_fluid", "brake_fluid", "mix", "spare_parts", "food", "electronics", "chemicals", "furniture", "documents"],
  vehicle_kinds: ["pickup", "van", "dyna", "lorry", "trailer"], priorities: ["normal", "urgent"],
  statuses: ["new", "post", "delivered", "verified", "invoiced", "cancelled"], stages: ["pending", "assigned", "accepted", "picked_up", "in_transit", "arrived", "delivered", "failed"],
};
const DELIVERY_STATUS: Record<string, number> = { pending: 0, assigned: 1, accepted: 1, failed: 1, picked_up: 2, in_transit: 2, arrived: 2, delivered: 3 };
const ORDER = ["pending", "assigned", "accepted", "picked_up", "in_transit", "arrived", "delivered"];
export const ACTIVE = ["accepted", "picked_up", "in_transit", "arrived"];

const D = () => getDB();
export const by = (t: string, id: any): R | undefined => D()[t].find((r) => r.id === id);
export const company = (): R => D().companies[0];

// ---------------------------------------------------------------- serializers
export const city = (id: any) => {
  const c = id ? by("cities", id) : null;
  return c ? { id: c.id, ar: c.name_ar, en: c.name_en, country: c.country } : null;
};
export const senderOut = (s: R) => ({
  id: s.id, name: s.name, contact_person: s.contact_person, mobile: s.mobile, email: s.email, city_id: s.city_id, city: city(s.city_id), address: s.address, gps: s.gps,
  national_address: s.national_address, vat_no: s.vat_no, credit_limit: s.credit_limit, payment_terms_days: s.payment_terms_days, status: s.status, locked: s.locked,
});
export const consigneeOut = (c: R) => ({ id: c.id, sender_id: c.sender_id, name: c.name, email: c.email, phone: c.phone, mobile: c.mobile, city_id: c.city_id, city: city(c.city_id), address: c.address, gps: c.gps, nad: c.nad, idno: c.idno, status: c.status });
const daysLeft = (d: string | null) => (d ? Math.round((new Date(`${d}T00:00:00Z`).getTime() - new Date(`${todayStr()}T00:00:00Z`).getTime()) / 86400000) : null);
export const vehicleOut = (v: R) => ({ id: v.id, plate: v.plate, kind: v.kind, capacity_kg: v.capacity_kg, capacity_pallets: v.capacity_pallets, status: v.status, insurance_expiry: v.insurance_expiry, registration_expiry: v.registration_expiry, last_service: v.last_service, odometer_km: v.odometer_km, notes: v.notes, insurance_days: daysLeft(v.insurance_expiry), registration_days: daysLeft(v.registration_expiry) });
export const driverOut = (d: R) => {
  const v = d.vehicle_id ? by("vehicles", d.vehicle_id) : null;
  return { id: d.id, name: d.name, mobile: d.mobile, email: d.email, doc_id: d.doc_id, license_no: d.license_no, license_expiry: d.license_expiry, license_days: daysLeft(d.license_expiry), vehicle_id: d.vehicle_id, vehicle_no: v?.plate ?? null, sender_ids: d.sender_ids ?? [], status: d.status, locked: d.locked, rating: d.rating, online: d.online, last_lat: d.last_lat, last_lng: d.last_lng, last_speed: d.last_speed, last_seen: iso(d.last_seen) };
};
export const tariffOut = (t: R) => ({ id: t.id, name: t.name, code: t.code, service_type: t.service_type, from_city_id: t.from_city_id, to_city_id: t.to_city_id, from_city: city(t.from_city_id), to_city: city(t.to_city_id), base: t.base, per_km: t.per_km, per_pallet: t.per_pallet, per_kg: t.per_kg, min_charge: t.min_charge, active: t.active });
export const userOut = (u: R) => ({ id: u.id, role: u.role, login: u.login, full_name: u.full_name, phone: u.phone, active: u.active, view_all: u.view_all, sender_id: u.sender_id, driver_id: u.driver_id, sender_name: u.sender_id ? by("senders", u.sender_id)?.name ?? null : null, driver_name: u.driver_id ? by("drivers", u.driver_id)?.name ?? null : null, perms: ROLE_PERMS[u.role] ?? [], last_login: iso(u.last_login) });
export const companyOut = (c: R) => ({ id: c.id, name: c.name, name_en: c.name_en, currency: c.currency, vat_rate: c.vat_rate, phone: c.phone, email: c.email, address: c.address, vat_no: c.vat_no, waybill_prefix: c.waybill_prefix, next_seq: c.next_seq, auto_number: c.auto_number, number_optional: c.number_optional, attachment_required: c.attachment_required, require_refs: c.require_refs, pod_required: c.pod_required, geofence_m: c.geofence_m, distance_factor: c.distance_factor, sla_hours: c.sla_hours });

export const isDelayed = (w: R) => !!(w.promised_at && ["new", "post"].includes(w.status) && w.stage !== "delivered" && now() > w.promised_at);
export const isLate = (w: R) => !!(w.promised_at && w.delivered_at && w.delivered_at > w.promised_at);

export function wbOut(w: R, detail = false, viewer = "admin"): R {
  const s = by("senders", w.sender_id);
  const d = w.driver_id ? by("drivers", w.driver_id) : null;
  const inv = w.invoice_id ? by("invoices", w.invoice_id) : null;
  const out: R = {
    id: w.id, number: w.number, date: w.date, status: w.status, stage: w.stage, delivery_status: w.delivery_status, priority: w.priority, sender_id: w.sender_id, sender_name: s?.name ?? null,
    consignee_id: w.consignee_id, to_name: w.to_name, to_mobile: w.to_mobile, to_phone: w.to_phone, from_city: city(w.from_city_id), to_city: city(w.to_city_id),
    from_address: w.from_address, to_address: w.to_address, from_gps: w.from_gps, to_gps: w.to_gps, driver_id: w.driver_id, driver_name: d?.name ?? null, driver_mobile: d?.mobile ?? null,
    vehicle_no: w.vehicle_no, packages: w.packages ?? [], material: w.material, qty: w.qty, weight: w.weight, total_qty: w.total_qty, est_weight: w.est_weight, volume_m3: w.volume_m3,
    service_type: w.service_type, deliver_type: w.deliver_type, payment_mode: w.payment_mode, invoice_type: w.invoice_type, service_charge: w.service_charge, vat_amount: w.vat_amount,
    total: r2(w.service_charge + w.vat_amount), cod_amount: w.cod_amount, cod_collected: w.cod_collected, cod_settled: w.cod_settled, distance_km: w.distance_km, duration_min: w.duration_min,
    order_no: w.order_no, shipment_no: w.shipment_no, delivery_note: w.delivery_note, promised_at: iso(w.promised_at), delivered_at: iso(w.delivered_at), created_at: iso(w.created_at),
    delayed: isDelayed(w), late: isLate(w), tariff_id: w.tariff_id, invoice: inv ? { id: inv.id, number: inv.number, status: inv.status } : null, collect_status: w.collect_status,
    received_by: w.received_by, receiver_id: w.receiver_id, receiver_mobile: w.receiver_mobile,
  };
  if (detail) {
    Object.assign(out, {
      from_mobile: w.from_mobile, from_email: w.from_email, reference_no: w.reference_no, to_email: w.to_email, to_nad: w.to_nad, to_idno: w.to_idno, shipment_det: w.shipment_det, remark: w.remark,
      return_refs: w.return_refs ?? [], insurance_type: w.insurance_type, shipment_value: w.shipment_value, collect_type: w.collect_type, collected_at: iso(w.collected_at), vehicle_id: w.vehicle_id,
      failure_reason: w.failure_reason, attempts: w.attempts, pod_note: w.pod_note, has_signature: !!w.pod_signature, has_photo: !!w.pod_photo, pod_signature: w.pod_signature, pod_photo: w.pod_photo, updated_at: iso(w.updated_at),
      events: D().events.filter((e) => e.waybill_id === w.id).sort((a, b) => a.id - b.id).map((e) => ({ id: e.id, at: iso(e.at), type: e.type, text: e.text, actor: e.actor_name, lat: e.lat, lng: e.lng })),
      attachments: D().attachments.filter((a) => a.waybill_id === w.id).map((a) => ({ id: a.id, kind: a.kind, filename: a.filename, size: a.size, url: a.url, created_at: iso(a.created_at) })),
      driver_position: null, otp: viewer === "driver" ? null : w.otp,
    });
    if (d && d.last_lat != null && ACTIVE.includes(w.stage)) {
      const ctx: R = { lat: d.last_lat, lng: d.last_lng, speed: d.last_speed, seen: iso(d.last_seen) };
      const dest = parseGps(w.to_gps);
      if (dest) {
        const [rem, eta] = etaMinutes([d.last_lat, d.last_lng], dest, d.last_speed, company().distance_factor);
        ctx.remaining_km = rem;
        ctx.eta_min = eta;
      }
      out.driver_position = ctx;
    }
  }
  return out;
}

// ------------------------------------------------------------------ helpers
export function audit(user: R | null, action: string, entity?: string, entity_id?: number | null, detail?: string) {
  D().audit.push({ id: nextId("audit"), company_id: 1, at: now(), user_id: user?.id ?? null, user_name: user?.full_name ?? null, action, entity: entity ?? null, entity_id: entity_id ?? null, detail: detail ?? null });
}
export function logEvent(w: R, type: string, actor: R | null = null, text: string | null = null, lat: number | null = null, lng: number | null = null) {
  D().events.push({ id: nextId("events"), waybill_id: w.id, at: now(), type, text, actor_id: actor?.id ?? null, actor_name: actor?.full_name ?? null, lat, lng });
}
export function notify(userIds: number[], kind: string, title: string, body: string | null = null, link: string | null = null) {
  for (const uid of new Set(userIds)) D().notifications.push({ id: nextId("notifications"), company_id: 1, user_id: uid, kind, title, body, link, seen: false, at: now() });
}
export const usersWithRole = (...roles: string[]) => D().users.filter((u) => roles.includes(u.role) && u.active).map((u) => u.id);
export const senderUsers = (sid: number) => D().users.filter((u) => u.sender_id === sid && u.active).map((u) => u.id);
export const driverUsers = (did: number) => D().users.filter((u) => u.driver_id === did && u.active).map((u) => u.id);

export const formatNumber = (c: R, seq: number) => `${c.waybill_prefix}-${todayStr().slice(0, 4)}-${String(seq).padStart(5, "0")}`;
export function consumeNumber(c: R): string {
  for (;;) {
    const n = formatNumber(c, c.next_seq);
    c.next_seq += 1;
    if (!D().waybills.some((w) => w.number === n)) return n;
  }
}

export function normalizePackages(items: any[]): any[] {
  return (items ?? []).filter((p) => VOCAB.pkg_types.includes(String(p.type))).map((p) => ({ type: p.type, ...Object.fromEntries(["qty", "weight", "height", "width", "length"].map((k) => [k, Math.round((Number(p[k]) || 0) * 1000) / 1000])) }));
}
export function packageTotals(pk: any[]) {
  const qty = pk.reduce((a, p) => a + p.qty, 0);
  return {
    qty: Math.round(qty * 1000) / 1000, weight: Math.round(pk.reduce((a, p) => a + p.weight, 0) * 1000) / 1000,
    volume_m3: Math.round((pk.reduce((a, p) => a + p.qty * p.height * p.width * p.length, 0) / 1e6) * 1000) / 1000, pallets: pk.filter((p) => p.type === "pallet").reduce((a, p) => a + p.qty, 0),
  };
}
export const computeCharge = (t: R, km: number, pallets: number, weight: number) => r2(Math.max(t.base + t.per_km * km + t.per_pallet * pallets + t.per_kg * weight, t.min_charge));
export function suggestTariff(w: R): R | null {
  let best: R | null = null;
  let score = -1;
  for (const t of D().tariffs.filter((x) => x.active)) {
    if (t.service_type && t.service_type !== w.service_type) continue;
    if (t.from_city_id && t.from_city_id !== w.from_city_id) continue;
    if (t.to_city_id && t.to_city_id !== w.to_city_id) continue;
    const s = (t.service_type ? 1 : 0) + (t.from_city_id ? 2 : 0) + (t.to_city_id ? 2 : 0);
    if (s > score) { best = t; score = s; }
  }
  return best;
}

export function visible(user: R): R[] {
  const all = D().waybills;
  if (user.role === "client") return all.filter((w) => user.sender_id && w.sender_id === user.sender_id);
  if (user.role === "driver") return all.filter((w) => user.driver_id && w.driver_id === user.driver_id && w.status !== "new");
  if (user.role !== "admin" && !user.view_all) return all.filter((w) => w.created_by === user.id);
  return all;
}
export const getWaybill = (user: R, id: number): R => visible(user).find((w) => w.id === id) ?? bad("not_found", 404);
export const allowedDrivers = (sid: number | null) => D().drivers.filter((d) => d.status && (!(d.sender_ids ?? []).length || (sid && d.sender_ids.includes(sid)))).sort((a, b) => a.name.localeCompare(b.name));

// --------------------------------------------------------------- life-cycle
const sync = (w: R) => { w.delivery_status = DELIVERY_STATUS[w.stage]; };
function freeVehicle(w: R) {
  if (!w.vehicle_id) return;
  const busy = D().waybills.some((x) => x.vehicle_id === w.vehicle_id && x.id !== w.id && x.status === "post" && ACTIVE.includes(x.stage));
  const v = by("vehicles", w.vehicle_id);
  if (v && !busy && v.status === "on_trip") v.status = "available";
}

export function setDriver(w: R, driverId: number | null, actor: R | null) {
  if (!["new", "post"].includes(w.status) || w.stage === "delivered") bad("waybill_locked");
  if (!driverId) {
    w.driver_id = w.vehicle_id = w.vehicle_no = null;
    if (w.status === "post") { w.stage = "pending"; sync(w); }
    return;
  }
  const d = by("drivers", driverId);
  if (!d || !d.status) bad("driver_not_available");
  if ((d!.sender_ids ?? []).length && !d!.sender_ids.includes(w.sender_id)) bad("driver_not_linked");
  const changed = w.driver_id !== d!.id;
  w.driver_id = d!.id;
  w.vehicle_id = d!.vehicle_id;
  w.vehicle_no = d!.vehicle_id ? by("vehicles", d!.vehicle_id)?.plate ?? null : null;
  if (w.status === "post" && ["pending", "failed"].includes(w.stage)) { w.stage = "assigned"; sync(w); }
  if (changed && w.status === "post") {
    logEvent(w, "assigned", actor, d!.name);
    notify(driverUsers(d!.id), "assigned", w.number, w.to_name, `/app/job?id=${w.id}`);
  }
}

export function postWaybill(w: R, actor: R) {
  const c = company();
  if (w.status !== "new") bad("not_new");
  if (!w.to_name || !w.to_address) bad("destination_required");
  if (!(w.packages ?? []).length && !w.qty) bad("shipment_required");
  w.status = "post";
  w.otp = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  const hours = w.priority === "urgent" ? Math.max(Math.floor(c.sla_hours / 2), 4) : c.sla_hours;
  w.promised_at = new Date(Date.now() + hours * 3600000).toISOString().slice(0, 19);
  w.stage = w.driver_id ? "assigned" : "pending";
  sync(w);
  w.updated_by = actor.id;
  logEvent(w, "posted", actor);
  if (w.driver_id) {
    logEvent(w, "assigned", actor, w.vehicle_no);
    notify(driverUsers(w.driver_id), "assigned", w.number, w.to_name, `/app/job?id=${w.id}`);
  } else if (actor.role === "client") notify(usersWithRole("dispatcher"), "posted", w.number, w.to_name, `/app/waybill?id=${w.id}`);
}

export function cancelWaybill(w: R, actor: R, reason: string | null) {
  if (["cancelled", "verified", "invoiced"].includes(w.status) || w.stage === "delivered") bad("cannot_cancel");
  freeVehicle(w);
  w.status = "cancelled";
  w.stage = "pending";
  sync(w);
  w.collect_status = false;
  w.collected_at = null;
  w.updated_by = actor.id;
  logEvent(w, "cancelled", actor, reason);
  if (w.driver_id) notify(driverUsers(w.driver_id), "cancelled", w.number, reason, "/app/jobs");
}

export function driverStep(w: R, actor: R, driver: R, stage: string, data: R) {
  const c = company();
  if (w.status !== "post" || w.driver_id !== driver.id) bad("not_your_job", 403);
  if (!VOCAB.stages.includes(stage) || ["pending", "assigned"].includes(stage)) bad("bad_stage");
  const { lat, lng } = data;
  const cur = w.stage;
  if (stage === "failed") {
    if (!["picked_up", "in_transit", "arrived"].includes(cur)) bad("bad_stage");
    const reason = (data.reason ?? "").trim();
    if (!reason) bad("reason_required");
    w.stage = "failed"; w.failure_reason = reason; w.attempts += 1;
    sync(w);
    freeVehicle(w);
    logEvent(w, "failed", actor, reason, lat, lng);
    notify(usersWithRole("dispatcher"), "failed", w.number, reason, `/app/waybill?id=${w.id}`);
    return;
  }
  const base = cur === "failed" ? "assigned" : cur;
  if (!ORDER.includes(base) || ORDER.indexOf(stage) <= ORDER.indexOf(base)) bad("bad_stage");
  if (["in_transit", "arrived", "delivered"].includes(stage) && !["picked_up", "in_transit", "arrived"].includes(cur)) bad("bad_stage");
  if (stage === "delivered") {
    const receivedBy = (data.received_by ?? "").trim();
    if (!receivedBy) bad("receiver_required");
    const otp = (data.otp ?? "").trim();
    const otpOk = !!otp && otp === (w.otp ?? "");
    if (otp && !otpOk) bad("otp_invalid");
    if (c.pod_required && !(data.signature || data.photo || otpOk)) bad("pod_required");
    Object.assign(w, { received_by: receivedBy, receiver_mobile: data.receiver_mobile || null, receiver_id: data.receiver_id || null, pod_signature: data.signature || null, pod_photo: data.photo || null, pod_note: data.note || null });
    w.delivered_at = now();
    w.status = "delivered";
    if (w.cod_amount > 0) {
      w.cod_collected = data.cod_collected !== false;
      if (w.cod_collected) logEvent(w, "cod_collected", actor, String(w.cod_amount));
    }
    freeVehicle(w);
    notify([...senderUsers(w.sender_id), ...usersWithRole("dispatcher")], "delivered", w.number, w.received_by, `/app/waybill?id=${w.id}`);
  }
  if (stage === "picked_up") {
    w.collect_status = true;
    w.collected_at = now();
    const v = w.vehicle_id ? by("vehicles", w.vehicle_id) : null;
    if (v) v.status = "on_trip";
  }
  w.stage = stage;
  sync(w);
  w.updated_by = actor.id;
  logEvent(w, stage, actor, stage === "delivered" ? w.received_by : data.note || null, lat, lng);
}

export function bulkDelivery(w: R, actor: R, ds: number) {
  if (!["post", "delivered"].includes(w.status)) bad("waybill_locked");
  let target = ({ 0: "pending", 1: "assigned", 2: "picked_up", 3: "delivered" } as Record<number, string>)[ds];
  if (!target) bad("bad_stage");
  if (target === "assigned" && !w.driver_id) target = "pending";
  w.stage = target;
  sync(w);
  if (target === "delivered") { w.status = "delivered"; w.delivered_at = w.delivered_at ?? now(); freeVehicle(w); } else { w.status = "post"; w.delivered_at = null; }
  if (["picked_up", "delivered"].includes(target) && !w.collect_status) { w.collect_status = true; w.collected_at = now(); }
  logEvent(w, target, actor, "grid");
}

export function verifyWaybill(w: R, actor: R, tariffId: number, km: number | null) {
  if (w.status !== "delivered") bad("not_delivered");
  const t = by("tariffs", tariffId);
  if (!t || !t.active) bad("tariff_invalid");
  if (km != null) w.distance_km = r2(km);
  const charge = computeCharge(t!, w.distance_km, packageTotals(normalizePackages(w.packages)).pallets, w.weight || packageTotals(normalizePackages(w.packages)).weight);
  w.tariff_id = t!.id;
  w.service_charge = charge;
  w.vat_amount = r2((charge * company().vat_rate) / 100);
  w.status = "verified";
  w.updated_by = actor.id;
  logEvent(w, "verified", actor, `${t!.name} · ${charge}`);
}

export function createInvoices(actor: R, ids: number[], issue: boolean): R[] {
  const c = company();
  const wbs = D().waybills.filter((w) => ids.includes(w.id));
  if (!wbs.length) bad("nothing_to_invoice");
  if (wbs.some((w) => w.status !== "verified" || w.invoice_id)) bad("not_verified");
  const groups = new Map<number, R[]>();
  for (const w of wbs) groups.set(w.sender_id, [...(groups.get(w.sender_id) ?? []), w]);
  const out: R[] = [];
  const today = todayStr();
  for (const [sid, group] of groups) {
    const s = by("senders", sid)!;
    const inv: R = { id: nextId("invoices"), company_id: 1, number: `INV-${today.slice(0, 4)}-${String(c.next_invoice_seq).padStart(5, "0")}`, sender_id: sid, issue_date: today, due_date: addDaysStr(today, s.payment_terms_days || 0), status: issue ? "issued" : "draft", subtotal: 0, vat: 0, total: 0, paid: 0, note: null, created_by: actor.id, created_at: now() };
    c.next_invoice_seq += 1;
    D().invoices.push(inv);
    let sub = 0, vat = 0;
    for (const w of group.sort((a, b) => a.id - b.id)) {
      const fc = by("cities", w.from_city_id), tc = by("cities", w.to_city_id);
      D().invoice_lines.push({ id: nextId("invoice_lines"), invoice_id: inv.id, waybill_id: w.id, description: `${w.number} · ${fc?.name_en ?? "-"} → ${tc?.name_en ?? "-"}`, qty: 1, unit_price: w.service_charge, amount: w.service_charge, vat: w.vat_amount });
      sub += w.service_charge; vat += w.vat_amount;
      w.invoice_id = inv.id; w.status = "invoiced";
      logEvent(w, "invoiced", actor, inv.number);
    }
    inv.subtotal = r2(sub); inv.vat = r2(vat); inv.total = r2(sub + vat);
    if (issue) notify(senderUsers(sid), "invoice", inv.number, String(inv.total), `/app/invoice?id=${inv.id}`);
    out.push(inv);
  }
  return out;
}

export function invoiceOut(i: R, detail = false): R {
  const s = by("senders", i.sender_id);
  const lines = D().invoice_lines.filter((l) => l.invoice_id === i.id);
  const out: R = { id: i.id, number: i.number, sender_id: i.sender_id, sender_name: s?.name ?? null, issue_date: i.issue_date, due_date: i.due_date, status: i.status, subtotal: i.subtotal, vat: i.vat, total: i.total, paid: i.paid, balance: r2(i.total - i.paid), overdue: !!(i.due_date && ["issued", "partial"].includes(i.status) && i.due_date < todayStr()), lines_count: lines.length };
  if (detail) Object.assign(out, { note: i.note, sender: s ? senderOut(s) : null, lines: lines.map((l) => ({ ...l })), payments: D().payments.filter((p) => p.invoice_id === i.id).map((p) => ({ id: p.id, date: p.date, amount: p.amount, method: p.method, ref: p.ref })) });
  return out;
}

export function addPayment(inv: R, actor: R, amount: number, method: string, ref: string | null, when?: string) {
  if (!["issued", "partial"].includes(inv.status)) bad("invoice_not_payable");
  amount = r2(amount);
  if (amount <= 0 || amount > r2(inv.total - inv.paid) + 0.001) bad("amount_invalid");
  D().payments.push({ id: nextId("payments"), invoice_id: inv.id, date: when || todayStr(), amount, method, ref, created_by: actor.id });
  inv.paid = r2(inv.paid + amount);
  inv.status = inv.paid + 0.001 >= inv.total ? "paid" : "partial";
}

export function voidInvoice(inv: R, actor: R) {
  if (["void", "paid", "partial"].includes(inv.status) || D().payments.some((p) => p.invoice_id === inv.id)) bad("cannot_void");
  for (const l of D().invoice_lines.filter((x) => x.invoice_id === inv.id)) {
    const w = l.waybill_id ? by("waybills", l.waybill_id) : null;
    if (w && w.invoice_id === inv.id) { w.invoice_id = null; w.status = "verified"; logEvent(w, "invoice_void", actor, inv.number); }
  }
  inv.status = "void";
}

export function registerPing(driver: R, lat: number, lng: number, speed: number | null) {
  const c = company();
  const t = now();
  const moved = driver.last_lat != null ? haversine([driver.last_lat, driver.last_lng], [lat, lng]) : 99;
  const lastSeen = driver.last_seen;
  Object.assign(driver, { last_lat: lat, last_lng: lng, last_speed: speed, last_seen: t, online: true });
  const active = D().waybills.filter((w) => w.driver_id === driver.id && w.status === "post" && ACTIVE.includes(w.stage)).sort((a, b) => a.id - b.id);
  if (!lastSeen || (Date.parse(`${t}Z`) - Date.parse(`${lastSeen}Z`)) / 1000 >= 15 || moved >= 0.03)
    D().pings.push({ id: nextId("pings"), driver_id: driver.id, waybill_id: active[0]?.id ?? null, lat, lng, speed, at: t });
  const near: number[] = [];
  for (const w of active) {
    if (w.stage === "picked_up") {
      const o = parseGps(w.from_gps);
      if (o && haversine(o, [lat, lng]) > 0.3) { w.stage = "in_transit"; sync(w); logEvent(w, "in_transit", null, null, lat, lng); }
    }
    const dest = parseGps(w.to_gps);
    if (dest && ["picked_up", "in_transit"].includes(w.stage) && !w.near_notified && haversine(dest, [lat, lng]) * 1000 <= c.geofence_m) {
      w.near_notified = true; w.stage = "arrived"; sync(w);
      logEvent(w, "near_destination", null, null, lat, lng);
      notify([...senderUsers(w.sender_id), ...usersWithRole("dispatcher")], "near", w.number, w.to_name, `/app/waybill?id=${w.id}`);
      near.push(w.id);
    }
  }
  return { ok: true, near, active: active.map((w) => w.id) };
}

/** Local mode only: nudges every truck on the road toward its destination so the live map visibly moves. */
export function simulateTraffic() {
  const t = now();
  for (const w of D().waybills.filter((x) => x.status === "post" && ["picked_up", "in_transit"].includes(x.stage) && x.driver_id)) {
    const d = by("drivers", w.driver_id);
    const dest = parseGps(w.to_gps);
    if (!d || d.last_lat == null || !dest) continue;
    const dist = haversine([d.last_lat, d.last_lng], dest);
    if (dist < 0.4) continue;
    const step = Math.min(0.012, 1.2 / Math.max(dist, 1));
    d.last_lat += (dest[0] - d.last_lat) * step;
    d.last_lng += (dest[1] - d.last_lng) * step;
    d.last_seen = t;
    d.online = true;
    d.last_speed = 62 + Math.round(Math.random() * 25);
    D().pings.push({ id: nextId("pings"), driver_id: d.id, waybill_id: w.id, lat: d.last_lat, lng: d.last_lng, speed: d.last_speed, at: t });
  }
}
export type { LL };
