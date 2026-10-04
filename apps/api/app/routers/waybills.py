"""Waybills: CRUD, search, attachments, life-cycle actions and the location helpers."""
import os
import re
import uuid
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import geo
from .. import models as m
from ..clock import local_today, now
from ..db import get_db
from ..deps import current_company, current_user, need
from ..schemas import AssignIn, CancelIn, DistanceIn, ResolveIn, WaybillIn
from ..services import (
    Lookups, allowed_drivers, attachment_out, audit, bad, cancel_waybill, consume_number, driver_out, get_waybill,
    log_event, normalize_packages, package_totals, post_waybill, preview_number, r2, set_driver, visible_waybills, wb_out,
)

router = APIRouter()
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))
ALLOWED_EXT = {"pdf", "jpg", "jpeg", "png", "gif", "doc", "docx", "xls", "xlsx", "zip"}
MAX_UPLOAD = 10 * 1024 * 1024
STAFF_EDIT = ("admin", "dispatcher")


def _can_edit(user: m.User, w: m.Waybill) -> bool:
    return w.status == "new" or (w.status == "post" and user.role in STAFF_EDIT)


def _gps(value: str | None):
    if value and not geo.parse_gps(value):
        bad("gps_invalid")


def apply_waybill(db: Session, w: m.Waybill, body: WaybillIn, user: m.User, company: m.Company, creating: bool):
    # --- parties
    sender_id = user.sender_id if user.role == "client" else (body.sender_id or (None if creating else w.sender_id))
    sender = db.get(m.Sender, sender_id) if sender_id else None
    if not sender or sender.company_id != company.id:
        bad("sender_required")
    if not creating and sender.id != w.sender_id:
        bad("sender_locked")
    if creating and not sender.status:
        bad("sender_inactive")
    cons = db.get(m.Consignee, body.consignee_id) if body.consignee_id else None
    if not cons or cons.company_id != company.id or cons.sender_id != sender.id:
        bad("consignee_required")

    # --- addresses (blank fields fall back to the master records, like the auto-fill of the original form)
    pick = lambda mine, theirs: mine if mine not in (None, "") else theirs  # noqa: E731
    w.sender_id, w.consignee_id = sender.id, cons.id
    w.from_city_id = pick(body.from_city_id, sender.city_id)
    w.from_address = pick(body.from_address, sender.address)
    w.from_gps = pick(body.from_gps, sender.gps)
    w.from_mobile = pick(body.from_mobile, sender.mobile)
    w.from_email = pick(body.from_email, sender.email)
    w.to_name = pick(body.to_name, cons.name)
    w.to_phone = pick(body.to_phone, cons.phone)
    w.to_mobile = pick(body.to_mobile, cons.mobile)
    w.to_email = pick(body.to_email, cons.email)
    w.to_city_id = pick(body.to_city_id, cons.city_id)
    w.to_address = pick(body.to_address, cons.address)
    w.to_gps = pick(body.to_gps, cons.gps)
    w.to_nad = pick(body.to_nad, cons.nad)
    w.to_idno = pick(body.to_idno, cons.idno)
    if not w.to_address:
        bad("destination_required")
    _gps(w.from_gps)
    _gps(w.to_gps)
    for cid in (w.from_city_id, w.to_city_id):
        if cid and not db.get(m.City, cid):
            bad("city_invalid")

    # --- references
    if company.require_refs and not (body.order_no and body.shipment_no and body.delivery_note):
        bad("refs_required")
    w.order_no, w.shipment_no, w.delivery_note, w.reference_no = body.order_no, body.shipment_no, body.delivery_note, body.reference_no
    w.date = body.date or w.date or local_today()

    # --- shipment
    w.shipment_det, w.remark = body.shipment_det, body.remark
    w.service_type, w.deliver_type, w.material, w.priority = body.service_type, body.deliver_type, body.material, body.priority
    w.return_refs = list(body.return_refs)
    pkgs = normalize_packages([p.model_dump() for p in body.packages])
    tot = package_totals(pkgs)
    w.packages = pkgs
    w.qty = tot["qty"] if tot["qty"] > 0 else (body.qty or 0)
    w.weight = tot["weight"] if tot["weight"] > 0 else (body.weight or 0)
    w.volume_m3 = tot["volume_m3"]
    w.total_qty = body.total_qty if body.total_qty is not None else w.qty
    w.est_weight = body.est_weight if body.est_weight is not None else w.weight

    # --- payment (the price itself is set at verification from the tariff)
    w.payment_mode, w.invoice_type, w.insurance_type = body.payment_mode, body.invoice_type, body.insurance_type
    w.shipment_value, w.cod_amount, w.collect_type = body.shipment_value, body.cod_amount, body.collect_type

    # --- distance (the web app asks /geo/distance first; this is the offline fallback)
    a, b = geo.parse_gps(w.from_gps), geo.parse_gps(w.to_gps)
    if body.distance_km is not None:
        w.distance_km = r2(body.distance_km)
    elif a and b and not w.distance_km:
        w.distance_km = r2(geo.haversine_km(a, b) * company.distance_factor)
    w.duration_min = round(w.distance_km) if w.distance_km else 0
    w.updated_by = user.id


def _number_for_create(db: Session, company: m.Company, wanted: str | None) -> str:
    manual = wanted and (not company.auto_number or company.number_optional)
    if manual:
        if db.scalar(select(m.Waybill.id).where(m.Waybill.company_id == company.id, m.Waybill.number == wanted)):
            bad("number_taken")
        return wanted  # type: ignore[return-value]
    if not company.auto_number:
        bad("number_required")
    return consume_number(db, company)


# ------------------------------------------------------------------- list ---
SORTS = {"date": m.Waybill.date, "number": m.Waybill.number, "status": m.Waybill.status, "created": m.Waybill.id,
         "sender": m.Waybill.sender_id, "to": m.Waybill.to_name, "distance": m.Waybill.distance_km}


@router.get("/waybills")
def list_waybills(
    q: str | None = None, status: str | None = None, stage: str | None = None, delivery_status: int | None = None,
    sender_id: int | None = None, driver_id: int | None = None, from_city_id: int | None = None, to_city_id: int | None = None,
    date_from: str | None = None, date_to: str | None = None, priority: str | None = None, delayed: bool | None = None,
    unassigned: bool | None = None, sort: str = "-created", page: int = 1, size: int = 20,
    user: m.User = Depends(need("waybills.read", "jobs")), db: Session = Depends(get_db),
):
    base = visible_waybills(user)
    L = Lookups(db, user.company_id)
    scope = base.subquery()
    counts = dict(db.execute(select(scope.c.status, func.count()).group_by(scope.c.status)).all())

    stmt = base
    if q:
        like = f"%{q}%"
        sender_ids = [sid for sid, s in L.senders.items() if q.lower() in s.name.lower()]
        stmt = stmt.where(or_(m.Waybill.number.ilike(like), m.Waybill.to_name.ilike(like), m.Waybill.order_no.ilike(like),
                              m.Waybill.shipment_no.ilike(like), m.Waybill.delivery_note.ilike(like), m.Waybill.sender_id.in_(sender_ids or [-1])))
    if status:
        stmt = stmt.where(m.Waybill.status.in_(status.split(",")))
    if stage:
        stmt = stmt.where(m.Waybill.stage.in_(stage.split(",")))
    if delivery_status is not None:
        stmt = stmt.where(m.Waybill.delivery_status == delivery_status)
    if sender_id and user.role != "client":
        stmt = stmt.where(m.Waybill.sender_id == sender_id)
    if driver_id:
        stmt = stmt.where(m.Waybill.driver_id == driver_id)
    if from_city_id:
        stmt = stmt.where(m.Waybill.from_city_id == from_city_id)
    if to_city_id:
        stmt = stmt.where(m.Waybill.to_city_id == to_city_id)
    if date_from:
        stmt = stmt.where(m.Waybill.date >= date_from)
    if date_to:
        stmt = stmt.where(m.Waybill.date <= date_to)
    if priority:
        stmt = stmt.where(m.Waybill.priority == priority)
    if delayed:
        stmt = stmt.where(m.Waybill.status.in_(("new", "post")), m.Waybill.stage != "delivered", m.Waybill.promised_at < now())
    if unassigned:
        stmt = stmt.where(m.Waybill.status == "post", m.Waybill.driver_id.is_(None))

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    desc = sort.startswith("-")
    col = SORTS.get(sort.lstrip("-"), m.Waybill.id)
    stmt = stmt.order_by(col.desc() if desc else col.asc(), m.Waybill.id.desc())
    size = max(1, min(size, 200))
    rows = db.scalars(stmt.offset((max(page, 1) - 1) * size).limit(size))
    return {"items": [wb_out(w, L, viewer_role=user.role) for w in rows], "total": total, "page": page, "size": size, "counts": counts}


@router.get("/waybills/next-number")
def next_number(company: m.Company = Depends(current_company), user: m.User = Depends(need("waybills.write"))):
    return {"number": preview_number(company), "auto": company.auto_number, "optional": company.number_optional}


@router.get("/waybills/{wid}")
def get_one(wid: int, user: m.User = Depends(need("waybills.read", "jobs")), db: Session = Depends(get_db)):
    w = get_waybill(db, user, wid)
    return wb_out(w, Lookups(db, user.company_id), detail=True, viewer_role=user.role)


@router.post("/waybills", status_code=201)
def create(body: WaybillIn, user: m.User = Depends(need("waybills.write")), company: m.Company = Depends(current_company), db: Session = Depends(get_db)):
    w = m.Waybill(company_id=company.id, number="", date=local_today(), sender_id=0, created_by=user.id)
    apply_waybill(db, w, body, user, company, creating=True)
    w.number = _number_for_create(db, company, body.number)
    db.add(w)
    db.flush()
    if body.driver_id:
        set_driver(db, w, body.driver_id, user)
    log_event(db, w, "created", user)
    audit(db, user, "waybill_create", "waybill", w.id, w.number)
    db.commit()
    return wb_out(w, Lookups(db, company.id), detail=True, viewer_role=user.role)


@router.put("/waybills/{wid}")
def update(wid: int, body: WaybillIn, user: m.User = Depends(need("waybills.write")), company: m.Company = Depends(current_company), db: Session = Depends(get_db)):
    w = get_waybill(db, user, wid)
    if not _can_edit(user, w):
        bad("waybill_locked")
    apply_waybill(db, w, body, user, company, creating=False)
    if body.number and body.number != w.number and not company.auto_number:
        if db.scalar(select(m.Waybill.id).where(m.Waybill.company_id == company.id, m.Waybill.number == body.number, m.Waybill.id != w.id)):
            bad("number_taken")
        w.number = body.number
    if body.driver_id != w.driver_id:
        set_driver(db, w, body.driver_id, user)
    log_event(db, w, "updated", user)
    db.commit()
    return wb_out(w, Lookups(db, company.id), detail=True, viewer_role=user.role)


@router.delete("/waybills/{wid}", status_code=204)
def delete(wid: int, user: m.User = Depends(need("waybills.write")), db: Session = Depends(get_db)):
    w = get_waybill(db, user, wid)
    if w.status != "new":
        bad("waybill_locked")
    for a in w.attachments:
        (UPLOAD_DIR / a.path).unlink(missing_ok=True)
    audit(db, user, "waybill_delete", "waybill", w.id, w.number)
    db.delete(w)
    db.commit()


@router.post("/waybills/{wid}/duplicate", status_code=201)
def duplicate(wid: int, user: m.User = Depends(need("waybills.write")), company: m.Company = Depends(current_company), db: Session = Depends(get_db)):
    src = get_waybill(db, user, wid)
    keep = ("sender_id", "consignee_id", "from_city_id", "from_address", "from_gps", "from_mobile", "from_email", "order_no",
            "shipment_no", "delivery_note", "to_name", "to_phone", "to_mobile", "to_email", "to_city_id", "to_address", "to_gps",
            "to_nad", "to_idno", "shipment_det", "remark", "service_type", "deliver_type", "return_refs", "packages", "material",
            "qty", "weight", "total_qty", "est_weight", "volume_m3", "priority", "payment_mode", "invoice_type", "insurance_type",
            "shipment_value", "cod_amount", "collect_type", "distance_km", "duration_min")
    w = m.Waybill(company_id=company.id, number=consume_number(db, company), date=local_today(), created_by=user.id, updated_by=user.id,
                  **{k: getattr(src, k) for k in keep})
    db.add(w)
    db.flush()
    log_event(db, w, "created", user, f"copy of {src.number}")
    db.commit()
    return wb_out(w, Lookups(db, company.id), detail=True, viewer_role=user.role)


# ------------------------------------------------------------- life-cycle ---
@router.post("/waybills/{wid}/post")
def post(wid: int, user: m.User = Depends(need("waybills.post")), company: m.Company = Depends(current_company), db: Session = Depends(get_db)):
    w = get_waybill(db, user, wid)
    if company.attachment_required and not any(a.kind == "from" for a in w.attachments):
        bad("attachment_required")
    post_waybill(db, w, user, company)
    audit(db, user, "waybill_post", "waybill", w.id, w.number)
    db.commit()
    return wb_out(w, Lookups(db, company.id), detail=True, viewer_role=user.role)


@router.post("/waybills/{wid}/assign")
def assign(wid: int, body: AssignIn, user: m.User = Depends(need("dispatch")), db: Session = Depends(get_db)):
    w = get_waybill(db, user, wid)
    set_driver(db, w, body.driver_id, user)
    if w.status == "new":
        log_event(db, w, "driver_set" if body.driver_id else "driver_cleared", user, w.vehicle_no)
    db.commit()
    return wb_out(w, Lookups(db, user.company_id), detail=True, viewer_role=user.role)


@router.post("/waybills/{wid}/cancel")
def cancel(wid: int, body: CancelIn, user: m.User = Depends(need("waybills.cancel")), db: Session = Depends(get_db)):
    w = get_waybill(db, user, wid)
    if user.role == "client" and w.status != "new" and w.stage not in ("pending", "assigned"):
        bad("cannot_cancel")
    cancel_waybill(db, w, user, body.reason)
    audit(db, user, "waybill_cancel", "waybill", w.id, w.number)
    db.commit()
    return wb_out(w, Lookups(db, user.company_id), detail=True, viewer_role=user.role)


@router.post("/waybills/{wid}/comment")
def comment(wid: int, body: CancelIn, user: m.User = Depends(need("waybills.read", "jobs")), db: Session = Depends(get_db)):
    w = get_waybill(db, user, wid)
    if not body.reason:
        bad("text_required")
    log_event(db, w, "comment", user, body.reason[:300])
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------ attachments ---
@router.post("/waybills/{wid}/attachments", status_code=201)
async def upload(wid: int, file: UploadFile = File(...), kind: str = Form("policy"),
                 user: m.User = Depends(need("waybills.write")), db: Session = Depends(get_db)):
    w = get_waybill(db, user, wid)
    if kind not in ("from", "policy"):
        bad("bad_kind")
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXT:
        bad("file_type")
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        bad("file_too_large", 413)
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", file.filename or "file")
    rel = f"waybills/{w.id}/{uuid.uuid4().hex[:8]}_{safe}"
    target = UPLOAD_DIR / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    if kind == "from":  # a single 'original' document: the new one replaces the old
        for old in [a for a in w.attachments if a.kind == "from"]:
            (UPLOAD_DIR / old.path).unlink(missing_ok=True)
            db.delete(old)
    a = m.Attachment(waybill_id=w.id, kind=kind, filename=file.filename or safe, path=rel, size=len(data), uploaded_by=user.id)
    db.add(a)
    db.flush()
    log_event(db, w, "attachment", user, a.filename)
    db.commit()
    return attachment_out(a)


@router.delete("/waybills/{wid}/attachments/{aid}", status_code=204)
def remove_attachment(wid: int, aid: int, user: m.User = Depends(need("waybills.write")), db: Session = Depends(get_db)):
    w = get_waybill(db, user, wid)
    a = next((x for x in w.attachments if x.id == aid), None)
    if not a:
        bad("not_found", 404)
    (UPLOAD_DIR / a.path).unlink(missing_ok=True)
    db.delete(a)
    db.commit()


# ------------------------------------------------------------ geo helpers ---
@router.post("/geo/resolve")
def resolve(body: ResolveIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    ref = None
    if body.ref_city_id:
        c = db.get(m.City, body.ref_city_id)
        ref = (c.lat, c.lng) if c else None
    got = geo.resolve_location(body.text, ref)
    if not got:
        bad("gps_unresolved", 422)
    return got


@router.post("/geo/distance")
def distance(body: DistanceIn, user: m.User = Depends(current_user), company: m.Company = Depends(current_company)):
    a, b = geo.parse_gps(body.from_gps), geo.parse_gps(body.to_gps)
    if not a or not b:
        bad("gps_invalid")
    return geo.route(a, b, company.distance_factor)


@router.get("/drivers-for/{sender_id}")
def drivers_for(sender_id: int, user: m.User = Depends(need("waybills.write")), db: Session = Depends(get_db)):
    """Drivers a waybill of this sender may use (linked to the sender, or open to everyone)."""
    L = Lookups(db, user.company_id)
    return [driver_out(d, L) for d in allowed_drivers(db, user.company_id, sender_id)]
