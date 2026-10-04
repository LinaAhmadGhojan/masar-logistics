"""Business rules: numbering, pricing, timeline events, notifications and the waybill life-cycle."""
from __future__ import annotations

import random
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import geo
from .clock import iso, iso_date, local_today, now
from .models import (
    DELIVERY_STATUS, PKG_TYPES, STAGES, Attachment, AuditLog, City, Company, Consignee, Driver, Invoice, InvoiceLine,
    Notification, Payment, Sender, Tariff, User, Vehicle, Waybill, WaybillEvent,
)

STAGE_ORDER = ["pending", "assigned", "accepted", "picked_up", "in_transit", "arrived", "delivered"]
ACTIVE_STAGES = ("accepted", "picked_up", "in_transit", "arrived")


def bad(code: str, status: int = 400):
    """Business-rule errors carry a stable code; the web app translates it."""
    raise HTTPException(status, code)


def r2(x: float | int | None) -> float:
    return round(float(x or 0), 2)


# ---------------------------------------------------------------- lookups ---
class Lookups:
    """Small per-request caches so list endpoints do not run N+1 queries."""

    def __init__(self, db: Session, company_id: int):
        self.db = db
        self.company_id = company_id
        self.cities = {c.id: c for c in db.scalars(select(City))}
        self.senders = {s.id: s for s in db.scalars(select(Sender).where(Sender.company_id == company_id))}
        self.drivers = {d.id: d for d in db.scalars(select(Driver).where(Driver.company_id == company_id))}
        self.vehicles = {v.id: v for v in db.scalars(select(Vehicle).where(Vehicle.company_id == company_id))}
        self.tariffs = {t.id: t for t in db.scalars(select(Tariff).where(Tariff.company_id == company_id))}
        self.invoices: dict[int, Invoice] = {}

    def city(self, cid: int | None):
        c = self.cities.get(cid) if cid else None
        return {"id": c.id, "ar": c.name_ar, "en": c.name_en, "country": c.country} if c else None

    def invoice(self, iid: int | None):
        if not iid:
            return None
        if iid not in self.invoices:
            self.invoices[iid] = self.db.get(Invoice, iid)  # type: ignore[assignment]
        i = self.invoices[iid]
        return {"id": i.id, "number": i.number, "status": i.status} if i else None


def company_of(db: Session, user: User) -> Company:
    return db.get(Company, user.company_id)  # type: ignore[return-value]


# -------------------------------------------------------------- serializers ---
def sender_out(s: Sender, L: Lookups | None = None) -> dict:
    return {
        "id": s.id, "name": s.name, "contact_person": s.contact_person, "mobile": s.mobile, "email": s.email,
        "city_id": s.city_id, "city": L.city(s.city_id) if L else None, "address": s.address, "gps": s.gps,
        "national_address": s.national_address, "vat_no": s.vat_no, "credit_limit": s.credit_limit,
        "payment_terms_days": s.payment_terms_days, "status": s.status, "locked": s.locked,
    }


def consignee_out(c: Consignee, L: Lookups | None = None) -> dict:
    return {
        "id": c.id, "sender_id": c.sender_id, "name": c.name, "email": c.email, "phone": c.phone, "mobile": c.mobile,
        "city_id": c.city_id, "city": L.city(c.city_id) if L else None, "address": c.address, "gps": c.gps,
        "nad": c.nad, "idno": c.idno, "status": c.status,
    }


def vehicle_out(v: Vehicle) -> dict:
    today = local_today()

    def left(d):
        return (d - today).days if d else None

    return {
        "id": v.id, "plate": v.plate, "kind": v.kind, "capacity_kg": v.capacity_kg, "capacity_pallets": v.capacity_pallets,
        "status": v.status, "insurance_expiry": iso_date(v.insurance_expiry), "registration_expiry": iso_date(v.registration_expiry),
        "last_service": iso_date(v.last_service), "odometer_km": v.odometer_km, "notes": v.notes,
        "insurance_days": left(v.insurance_expiry), "registration_days": left(v.registration_expiry),
    }


def driver_out(d: Driver, L: Lookups | None = None) -> dict:
    v = L.vehicles.get(d.vehicle_id) if (L and d.vehicle_id) else None
    today = local_today()
    return {
        "id": d.id, "name": d.name, "mobile": d.mobile, "email": d.email, "doc_id": d.doc_id, "license_no": d.license_no,
        "license_expiry": iso_date(d.license_expiry), "license_days": (d.license_expiry - today).days if d.license_expiry else None,
        "vehicle_id": d.vehicle_id, "vehicle_no": v.plate if v else None, "sender_ids": d.sender_ids or [], "status": d.status,
        "locked": d.locked, "rating": d.rating, "online": d.online, "last_lat": d.last_lat, "last_lng": d.last_lng,
        "last_speed": d.last_speed, "last_seen": iso(d.last_seen),
    }


def tariff_out(t: Tariff, L: Lookups | None = None) -> dict:
    return {
        "id": t.id, "name": t.name, "code": t.code, "service_type": t.service_type, "from_city_id": t.from_city_id,
        "to_city_id": t.to_city_id, "from_city": L.city(t.from_city_id) if L else None, "to_city": L.city(t.to_city_id) if L else None,
        "base": t.base, "per_km": t.per_km, "per_pallet": t.per_pallet, "per_kg": t.per_kg, "min_charge": t.min_charge, "active": t.active,
    }


def user_out(u: User, db: Session | None = None) -> dict:
    from .perms import perms_of

    sender = db.get(Sender, u.sender_id) if (db and u.sender_id) else None
    driver = db.get(Driver, u.driver_id) if (db and u.driver_id) else None
    return {
        "id": u.id, "role": u.role, "login": u.login, "full_name": u.full_name, "phone": u.phone, "active": u.active,
        "view_all": u.view_all, "sender_id": u.sender_id, "driver_id": u.driver_id,
        "sender_name": sender.name if sender else None, "driver_name": driver.name if driver else None,
        "perms": perms_of(u.role), "last_login": iso(u.last_login),
    }


def company_out(c: Company) -> dict:
    return {
        "id": c.id, "name": c.name, "name_en": c.name_en, "currency": c.currency, "vat_rate": c.vat_rate, "phone": c.phone,
        "email": c.email, "address": c.address, "vat_no": c.vat_no, "waybill_prefix": c.waybill_prefix, "next_seq": c.next_seq,
        "auto_number": c.auto_number, "number_optional": c.number_optional, "attachment_required": c.attachment_required,
        "require_refs": c.require_refs, "pod_required": c.pod_required, "geofence_m": c.geofence_m,
        "distance_factor": c.distance_factor, "sla_hours": c.sla_hours,
    }


def is_delayed(w: Waybill) -> bool:
    return bool(w.promised_at and w.status in ("new", "post") and w.stage != "delivered" and now() > w.promised_at)


def is_late(w: Waybill) -> bool:
    return bool(w.promised_at and w.delivered_at and w.delivered_at > w.promised_at)


def wb_out(w: Waybill, L: Lookups, detail: bool = False, viewer_role: str = "admin") -> dict:
    sender = L.senders.get(w.sender_id)
    driver = L.drivers.get(w.driver_id) if w.driver_id else None
    out = {
        "id": w.id, "number": w.number, "date": iso_date(w.date), "status": w.status, "stage": w.stage,
        "delivery_status": w.delivery_status, "priority": w.priority,
        "sender_id": w.sender_id, "sender_name": sender.name if sender else None,
        "consignee_id": w.consignee_id, "to_name": w.to_name, "to_mobile": w.to_mobile, "to_phone": w.to_phone,
        "from_city": L.city(w.from_city_id), "to_city": L.city(w.to_city_id),
        "from_address": w.from_address, "to_address": w.to_address, "from_gps": w.from_gps, "to_gps": w.to_gps,
        "driver_id": w.driver_id, "driver_name": driver.name if driver else None, "driver_mobile": driver.mobile if driver else None,
        "vehicle_no": w.vehicle_no, "packages": w.packages or [], "material": w.material, "qty": w.qty, "weight": w.weight,
        "total_qty": w.total_qty, "est_weight": w.est_weight, "volume_m3": w.volume_m3,
        "service_type": w.service_type, "deliver_type": w.deliver_type, "payment_mode": w.payment_mode,
        "invoice_type": w.invoice_type, "service_charge": w.service_charge, "vat_amount": w.vat_amount,
        "total": r2(w.service_charge + w.vat_amount), "cod_amount": w.cod_amount, "cod_collected": w.cod_collected,
        "cod_settled": w.cod_settled, "distance_km": w.distance_km, "duration_min": w.duration_min,
        "order_no": w.order_no, "shipment_no": w.shipment_no, "delivery_note": w.delivery_note,
        "promised_at": iso(w.promised_at), "delivered_at": iso(w.delivered_at), "created_at": iso(w.created_at),
        "delayed": is_delayed(w), "late": is_late(w), "tariff_id": w.tariff_id, "invoice": L.invoice(w.invoice_id),
        "collect_status": w.collect_status, "received_by": w.received_by, "receiver_id": w.receiver_id,
        "receiver_mobile": w.receiver_mobile,
    }
    if detail:
        out.update({
            "from_mobile": w.from_mobile, "from_email": w.from_email, "reference_no": w.reference_no,
            "to_email": w.to_email, "to_nad": w.to_nad, "to_idno": w.to_idno, "shipment_det": w.shipment_det,
            "remark": w.remark, "deliver_type": w.deliver_type, "return_refs": w.return_refs or [],
            "insurance_type": w.insurance_type, "shipment_value": w.shipment_value, "collect_type": w.collect_type,
            "collected_at": iso(w.collected_at), "vehicle_id": w.vehicle_id, "failure_reason": w.failure_reason,
            "attempts": w.attempts, "pod_note": w.pod_note, "has_signature": bool(w.pod_signature),
            "has_photo": bool(w.pod_photo), "pod_signature": w.pod_signature, "pod_photo": w.pod_photo,
            "updated_at": iso(w.updated_at),
            "events": [
                {"id": e.id, "at": iso(e.at), "type": e.type, "text": e.text, "actor": e.actor_name, "lat": e.lat, "lng": e.lng}
                for e in w.events
            ],
            "attachments": [
                {"id": a.id, "kind": a.kind, "filename": a.filename, "size": a.size, "url": f"/uploads/{a.path}", "created_at": iso(a.created_at)}
                for a in w.attachments
            ],
            "driver_position": None,
        })
        # the OTP is shown to staff and the sender so they can hand it to the consignee; never to the driver
        out["otp"] = w.otp if viewer_role != "driver" else None
        if driver and driver.last_lat is not None and w.stage in ACTIVE_STAGES:
            pos = (driver.last_lat, driver.last_lng)
            dest = geo.parse_gps(w.to_gps)
            ctx = {"lat": pos[0], "lng": pos[1], "speed": driver.last_speed, "seen": iso(driver.last_seen)}
            if dest:
                rem, eta = geo.eta_minutes(pos, dest, driver.last_speed)
                ctx.update({"remaining_km": rem, "eta_min": eta})
            out["driver_position"] = ctx
    return out


# -------------------------------------------------------------- audit / log ---
def audit(db: Session, user: User | None, action: str, entity: str | None = None, entity_id: int | None = None, detail: str | None = None):
    db.add(AuditLog(company_id=user.company_id if user else 0, user_id=user.id if user else None,
                    user_name=user.full_name if user else None, action=action, entity=entity, entity_id=entity_id, detail=detail))


def log_event(db: Session, w: Waybill, type: str, actor: User | None = None, text: str | None = None, lat: float | None = None, lng: float | None = None):
    db.add(WaybillEvent(waybill_id=w.id, type=type, text=text, actor_id=actor.id if actor else None,
                        actor_name=actor.full_name if actor else None, lat=lat, lng=lng))


def notify(db: Session, company_id: int, user_ids, kind: str, title: str, body: str | None = None, link: str | None = None):
    for uid in set(user_ids):
        db.add(Notification(company_id=company_id, user_id=uid, kind=kind, title=title, body=body, link=link))


def users_with_role(db: Session, company_id: int, *roles: str) -> list[int]:
    return list(db.scalars(select(User.id).where(User.company_id == company_id, User.role.in_(roles), User.active.is_(True))))


def sender_user_ids(db: Session, sender_id: int) -> list[int]:
    return list(db.scalars(select(User.id).where(User.sender_id == sender_id, User.active.is_(True))))


def driver_user_ids(db: Session, driver_id: int) -> list[int]:
    return list(db.scalars(select(User.id).where(User.driver_id == driver_id, User.active.is_(True))))


# ---------------------------------------------------------------- numbering ---
def format_number(c: Company, seq: int, year: int | None = None) -> str:
    return f"{c.waybill_prefix}-{year or local_today().year}-{seq:05d}"


def preview_number(c: Company) -> str:
    return format_number(c, c.next_seq)


def consume_number(db: Session, c: Company) -> str:
    """Take the next sequence number (never reused, skips numbers typed in by hand)."""
    while True:
        n = format_number(c, c.next_seq)
        c.next_seq += 1
        if not db.scalar(select(Waybill.id).where(Waybill.company_id == c.id, Waybill.number == n)):
            return n


# ------------------------------------------------------------------ pricing ---
def normalize_packages(items) -> list[dict]:
    out = []
    for p in items or []:
        t = str(p.get("type", "")).strip()
        if t not in PKG_TYPES:
            continue
        out.append({"type": t, **{k: round(float(p.get(k) or 0), 3) for k in ("qty", "weight", "height", "width", "length")}})
    return out


def package_totals(pkgs: list[dict]) -> dict:
    qty = sum(p["qty"] for p in pkgs)
    weight = sum(p["weight"] for p in pkgs)
    volume = sum(p["qty"] * p["height"] * p["width"] * p["length"] for p in pkgs) / 1_000_000
    pallets = sum(p["qty"] for p in pkgs if p["type"] == "pallet")
    return {"qty": round(qty, 3), "weight": round(weight, 3), "volume_m3": round(volume, 3), "pallets": pallets}


def compute_charge(t: Tariff, distance_km: float, pallets: float, weight: float) -> float:
    raw = t.base + t.per_km * distance_km + t.per_pallet * pallets + t.per_kg * weight
    return r2(max(raw, t.min_charge))


def suggest_tariff(db: Session, company_id: int, w: Waybill) -> Tariff | None:
    best, score = None, -1
    for t in db.scalars(select(Tariff).where(Tariff.company_id == company_id, Tariff.active.is_(True))):
        if t.service_type and t.service_type != w.service_type:
            continue
        if t.from_city_id and t.from_city_id != w.from_city_id:
            continue
        if t.to_city_id and t.to_city_id != w.to_city_id:
            continue
        s = (1 if t.service_type else 0) + (2 if t.from_city_id else 0) + (2 if t.to_city_id else 0)
        if s > score:
            best, score = t, s
    return best


# ------------------------------------------------------------- visibility ---
def visible_waybills(user: User):
    q = select(Waybill).where(Waybill.company_id == user.company_id)
    if user.role == "client":
        q = q.where(Waybill.sender_id == user.sender_id) if user.sender_id else q.where(Waybill.id < 0)
    elif user.role == "driver":
        q = q.where(Waybill.driver_id == user.driver_id, Waybill.status != "new") if user.driver_id else q.where(Waybill.id < 0)
    elif user.role != "admin" and not user.view_all:
        q = q.where(Waybill.created_by == user.id)
    return q


def get_waybill(db: Session, user: User, wid: int) -> Waybill:
    w = db.scalar(visible_waybills(user).where(Waybill.id == wid))
    if not w:
        bad("not_found", 404)
    return w  # type: ignore[return-value]


def allowed_drivers(db: Session, company_id: int, sender_id: int | None) -> list[Driver]:
    out = []
    for d in db.scalars(select(Driver).where(Driver.company_id == company_id, Driver.status.is_(True)).order_by(Driver.name)):
        ids = d.sender_ids or []
        if not ids or (sender_id and sender_id in ids):
            out.append(d)
    return out


# --------------------------------------------------------------- life-cycle ---
def _sync_status(w: Waybill):
    w.delivery_status = DELIVERY_STATUS[w.stage]


def _free_vehicle(db: Session, w: Waybill):
    if not w.vehicle_id:
        return
    busy = db.scalar(select(func.count(Waybill.id)).where(
        Waybill.vehicle_id == w.vehicle_id, Waybill.id != w.id, Waybill.status == "post", Waybill.stage.in_(ACTIVE_STAGES)))
    v = db.get(Vehicle, w.vehicle_id)
    if v and not busy and v.status == "on_trip":
        v.status = "available"


def set_driver(db: Session, w: Waybill, driver_id: int | None, actor: User | None):
    if w.status not in ("new", "post") or w.stage in ("delivered",):
        bad("waybill_locked")
    if not driver_id:
        w.driver_id, w.vehicle_id, w.vehicle_no = None, None, None
        if w.status == "post":
            w.stage = "pending"
            _sync_status(w)
        return
    d = db.get(Driver, driver_id)
    if not d or d.company_id != w.company_id or not d.status:
        bad("driver_not_available")
    ids = d.sender_ids or []
    if ids and w.sender_id not in ids:
        bad("driver_not_linked")
    changed = w.driver_id != d.id
    w.driver_id = d.id
    w.vehicle_id = d.vehicle_id
    v = db.get(Vehicle, d.vehicle_id) if d.vehicle_id else None
    w.vehicle_no = v.plate if v else None
    if w.status == "post" and w.stage in ("pending", "failed"):
        w.stage = "assigned"
        _sync_status(w)
    if changed and w.status == "post":
        log_event(db, w, "assigned", actor, d.name)
        notify(db, w.company_id, driver_user_ids(db, d.id), "assigned", w.number, w.to_name, f"/app/job?id={w.id}")


def post_waybill(db: Session, w: Waybill, actor: User, company: Company):
    if w.status != "new":
        bad("not_new")
    if not w.to_name or not w.to_address:
        bad("destination_required")
    if not w.packages and not w.qty:
        bad("shipment_required")
    w.status = "post"
    w.otp = f"{random.randint(0, 9999):04d}"
    hours = max(company.sla_hours // 2, 4) if w.priority == "urgent" else company.sla_hours
    w.promised_at = now() + timedelta(hours=hours)
    w.stage = "assigned" if w.driver_id else "pending"
    _sync_status(w)
    w.updated_by = actor.id
    log_event(db, w, "posted", actor)
    if w.driver_id:
        log_event(db, w, "assigned", actor, w.vehicle_no)
        notify(db, w.company_id, driver_user_ids(db, w.driver_id), "assigned", w.number, w.to_name, f"/app/job?id={w.id}")
    elif actor.role == "client":
        notify(db, w.company_id, users_with_role(db, w.company_id, "dispatcher"), "posted", w.number, w.to_name, f"/app/waybill?id={w.id}")


def cancel_waybill(db: Session, w: Waybill, actor: User, reason: str | None = None):
    if w.status in ("cancelled", "verified", "invoiced"):
        bad("cannot_cancel")
    if w.stage == "delivered":
        bad("cannot_cancel")
    _free_vehicle(db, w)
    w.status = "cancelled"
    w.stage = "pending"
    _sync_status(w)
    w.collect_status, w.collected_at = False, None
    w.updated_by = actor.id
    log_event(db, w, "cancelled", actor, reason)
    if w.driver_id:
        notify(db, w.company_id, driver_user_ids(db, w.driver_id), "cancelled", w.number, reason, "/app/jobs")


def driver_step(db: Session, w: Waybill, actor: User, driver: Driver, company: Company, stage: str, data: dict):
    """The driver's progress buttons: accepted -> picked_up -> in_transit -> arrived -> delivered | failed."""
    if w.status != "post" or w.driver_id != driver.id:
        bad("not_your_job", 403)
    if stage not in STAGES or stage in ("pending", "assigned"):
        bad("bad_stage")
    lat, lng = data.get("lat"), data.get("lng")
    cur = w.stage
    if stage == "failed":
        if cur not in ("picked_up", "in_transit", "arrived"):
            bad("bad_stage")
        reason = (data.get("reason") or "").strip()
        if not reason:
            bad("reason_required")
        w.stage, w.failure_reason, w.attempts = "failed", reason, w.attempts + 1
        _sync_status(w)
        _free_vehicle(db, w)
        log_event(db, w, "failed", actor, reason, lat, lng)
        notify(db, w.company_id, users_with_role(db, w.company_id, "dispatcher"), "failed", w.number, reason, f"/app/waybill?id={w.id}")
        return
    base = "assigned" if cur == "failed" else cur
    if base not in STAGE_ORDER or STAGE_ORDER.index(stage) <= STAGE_ORDER.index(base):
        bad("bad_stage")
    if stage in ("in_transit", "arrived", "delivered") and cur not in ("picked_up", "in_transit", "arrived"):
        bad("bad_stage")  # the goods must be picked up before they can travel or be delivered
    if stage == "delivered":
        received_by = (data.get("received_by") or "").strip()
        if not received_by:
            bad("receiver_required")
        sig, photo, otp = data.get("signature"), data.get("photo"), (data.get("otp") or "").strip()
        otp_ok = bool(otp) and otp == (w.otp or "")
        if otp and not otp_ok:
            bad("otp_invalid")
        if company.pod_required and not (sig or photo or otp_ok):
            bad("pod_required")
        w.received_by, w.receiver_mobile, w.receiver_id = received_by, data.get("receiver_mobile"), data.get("receiver_id")
        w.pod_signature, w.pod_photo, w.pod_note = sig, photo, data.get("note")
        w.delivered_at = now()
        w.status = "delivered"
        if w.cod_amount > 0:
            w.cod_collected = bool(data.get("cod_collected", True))
            if w.cod_collected:
                log_event(db, w, "cod_collected", actor, f"{w.cod_amount:g}")
        _free_vehicle(db, w)
        notify(db, w.company_id, sender_user_ids(db, w.sender_id) + users_with_role(db, w.company_id, "dispatcher"),
               "delivered", w.number, w.received_by, f"/app/waybill?id={w.id}")
    if stage == "picked_up":
        w.collect_status, w.collected_at = True, now()
        v = db.get(Vehicle, w.vehicle_id) if w.vehicle_id else None
        if v:
            v.status = "on_trip"
    w.stage = stage
    _sync_status(w)
    w.updated_by = actor.id
    log_event(db, w, stage, actor, data.get("note") if stage != "delivered" else w.received_by, lat, lng)


def bulk_delivery_update(db: Session, w: Waybill, actor: User, delivery_status: int):
    """The 'Delivery management' grid: dispatcher sets the delivery status directly."""
    if w.status not in ("post", "delivered"):
        bad("waybill_locked")
    target = {0: "pending", 1: "assigned", 2: "picked_up", 3: "delivered"}.get(delivery_status)
    if not target:
        bad("bad_stage")
    if target == "assigned" and not w.driver_id:
        target = "pending"
    w.stage = target
    _sync_status(w)
    if target == "delivered":
        w.status = "delivered"
        w.delivered_at = w.delivered_at or now()
        _free_vehicle(db, w)
    else:
        w.status = "post"
        w.delivered_at = None
    if target in ("picked_up", "delivered") and not w.collect_status:
        w.collect_status, w.collected_at = True, now()
    log_event(db, w, target, actor, "grid")


def verify_waybill(db: Session, w: Waybill, actor: User, company: Company, tariff_id: int, distance_km: float | None):
    if w.status != "delivered":
        bad("not_delivered")
    t = db.get(Tariff, tariff_id)
    if not t or t.company_id != w.company_id or not t.active:
        bad("tariff_invalid")
    if distance_km is not None:
        w.distance_km = r2(distance_km)
    totals = package_totals(normalize_packages(w.packages))
    charge = compute_charge(t, w.distance_km, totals["pallets"], w.weight or totals["weight"])
    w.tariff_id = t.id
    w.service_charge = charge
    w.vat_amount = r2(charge * company.vat_rate / 100)
    w.status = "verified"
    w.updated_by = actor.id
    log_event(db, w, "verified", actor, f"{t.name} · {charge:g}")


def create_invoices(db: Session, company: Company, actor: User, waybill_ids: list[int], issue: bool = False) -> list[Invoice]:
    wbs = list(db.scalars(select(Waybill).where(Waybill.company_id == company.id, Waybill.id.in_(waybill_ids))))
    if not wbs:
        bad("nothing_to_invoice")
    for w in wbs:
        if w.status != "verified" or w.invoice_id:
            bad("not_verified")
    L = Lookups(db, company.id)
    by_sender: dict[int, list[Waybill]] = {}
    for w in wbs:
        by_sender.setdefault(w.sender_id, []).append(w)
    out = []
    today = local_today()
    for sid, group in by_sender.items():
        s = L.senders[sid]
        inv = Invoice(company_id=company.id, number=f"INV-{today.year}-{company.next_invoice_seq:05d}", sender_id=sid,
                      issue_date=today, due_date=today + timedelta(days=s.payment_terms_days or 0),
                      status="issued" if issue else "draft", created_by=actor.id)
        company.next_invoice_seq += 1
        db.add(inv)
        db.flush()
        sub = vat = 0.0
        for w in sorted(group, key=lambda x: x.id):
            fc, tc = L.city(w.from_city_id), L.city(w.to_city_id)
            route = f"{fc['en'] if fc else '-'} → {tc['en'] if tc else '-'}"
            db.add(InvoiceLine(invoice_id=inv.id, waybill_id=w.id, description=f"{w.number} · {route}", qty=1,
                               unit_price=w.service_charge, amount=w.service_charge, vat=w.vat_amount))
            sub += w.service_charge
            vat += w.vat_amount
            w.invoice_id, w.status = inv.id, "invoiced"
            log_event(db, w, "invoiced", actor, inv.number)
        inv.subtotal, inv.vat, inv.total = r2(sub), r2(vat), r2(sub + vat)
        out.append(inv)
        if issue:
            notify(db, company.id, sender_user_ids(db, sid), "invoice", inv.number, f"{inv.total:g}", f"/app/invoice?id={inv.id}")
    return out


def invoice_out(i: Invoice, L: Lookups, detail: bool = False) -> dict:
    s = L.senders.get(i.sender_id)
    out = {
        "id": i.id, "number": i.number, "sender_id": i.sender_id, "sender_name": s.name if s else None,
        "issue_date": iso_date(i.issue_date), "due_date": iso_date(i.due_date), "status": i.status,
        "subtotal": i.subtotal, "vat": i.vat, "total": i.total, "paid": i.paid, "balance": r2(i.total - i.paid),
        "overdue": bool(i.due_date and i.status in ("issued", "partial") and i.due_date < local_today()),
        "lines_count": len(i.lines),
    }
    if detail:
        out.update({
            "note": i.note,
            "sender": sender_out(s, L) if s else None,
            "lines": [{"id": l.id, "waybill_id": l.waybill_id, "description": l.description, "qty": l.qty,
                       "unit_price": l.unit_price, "amount": l.amount, "vat": l.vat} for l in i.lines],
            "payments": [{"id": p.id, "date": iso_date(p.date), "amount": p.amount, "method": p.method, "ref": p.ref} for p in i.payments],
        })
    return out


def add_payment(db: Session, inv: Invoice, actor: User, amount: float, method: str, ref: str | None, when=None):
    if inv.status not in ("issued", "partial"):
        bad("invoice_not_payable")
    amount = r2(amount)
    if amount <= 0 or amount > r2(inv.total - inv.paid) + 0.001:
        bad("amount_invalid")
    db.add(Payment(invoice_id=inv.id, date=when or local_today(), amount=amount, method=method, ref=ref, created_by=actor.id))
    inv.paid = r2(inv.paid + amount)
    inv.status = "paid" if inv.paid + 0.001 >= inv.total else "partial"


def void_invoice(db: Session, inv: Invoice, actor: User):
    if inv.status in ("void", "paid", "partial") or inv.payments:
        bad("cannot_void")
    for l in inv.lines:
        w = db.get(Waybill, l.waybill_id) if l.waybill_id else None
        if w and w.invoice_id == inv.id:
            w.invoice_id, w.status = None, "verified"
            log_event(db, w, "invoice_void", actor, inv.number)
    inv.status = "void"


# ------------------------------------------------------------------ tracking ---
def register_ping(db: Session, driver: Driver, company: Company, lat: float, lng: float, speed: float | None) -> dict:
    from .models import Ping

    t = now()
    last = driver.last_seen
    moved = geo.haversine_km((driver.last_lat, driver.last_lng), (lat, lng)) if driver.last_lat is not None else 99
    driver.last_lat, driver.last_lng, driver.last_speed, driver.last_seen, driver.online = lat, lng, speed, t, True
    active = list(db.scalars(select(Waybill).where(
        Waybill.driver_id == driver.id, Waybill.status == "post", Waybill.stage.in_(ACTIVE_STAGES)).order_by(Waybill.id)))
    if (not last) or (t - last).total_seconds() >= 15 or moved >= 0.03:
        db.add(Ping(driver_id=driver.id, waybill_id=active[0].id if active else None, lat=lat, lng=lng, speed=speed, at=t))
    near = []
    for w in active:
        if w.stage == "picked_up":
            origin = geo.parse_gps(w.from_gps)
            if origin and geo.haversine_km(origin, (lat, lng)) > 0.3:
                w.stage = "in_transit"
                _sync_status(w)
                log_event(db, w, "in_transit", None, None, lat, lng)
        dest = geo.parse_gps(w.to_gps)
        if dest and w.stage in ("picked_up", "in_transit") and not w.near_notified:
            if geo.haversine_km(dest, (lat, lng)) * 1000 <= company.geofence_m:
                w.near_notified, w.stage = True, "arrived"
                _sync_status(w)
                log_event(db, w, "near_destination", None, None, lat, lng)
                notify(db, w.company_id, sender_user_ids(db, w.sender_id) + users_with_role(db, w.company_id, "dispatcher"),
                       "near", w.number, w.to_name, f"/app/waybill?id={w.id}")
                near.append(w.id)
    return {"ok": True, "near": near, "active": [w.id for w in active]}


def attachment_out(a: Attachment) -> dict:
    return {"id": a.id, "kind": a.kind, "filename": a.filename, "size": a.size, "url": f"/uploads/{a.path}", "created_at": iso(a.created_at)}
