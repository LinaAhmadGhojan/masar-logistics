"""Operations: dispatch board, delivery grid, driver jobs & live tracking, and the public tracking page."""
import re
from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import geo
from .. import models as m
from ..clock import iso, local_today, now
from ..db import get_db
from ..deps import current_company, need
from ..schemas import GridIn, PingIn, StepIn
from ..services import (
    ACTIVE_STAGES, Lookups, bad, bulk_delivery_update, driver_out, driver_step, get_waybill, log_event, register_ping,
    set_driver, visible_waybills, wb_out,
)

router = APIRouter()


# --------------------------------------------------------------- dispatch ---
@router.get("/dispatch/board")
def board(user: m.User = Depends(need("dispatch")), db: Session = Depends(get_db)):
    L = Lookups(db, user.company_id)
    since = now() - timedelta(hours=36)
    rows = list(db.scalars(select(m.Waybill).where(
        m.Waybill.company_id == user.company_id,
        (m.Waybill.status == "post") | ((m.Waybill.status == "delivered") & (m.Waybill.delivered_at >= since)),
    ).order_by(m.Waybill.priority.desc(), m.Waybill.promised_at, m.Waybill.id)))
    cols: dict[str, list] = {"unassigned": [], "assigned": [], "in_progress": [], "delivered": []}
    for w in rows:
        item = wb_out(w, L)
        if w.stage == "delivered":
            cols["delivered"].append(item)
        elif w.stage in ("picked_up", "in_transit", "arrived"):
            cols["in_progress"].append(item)
        elif w.driver_id:
            cols["assigned"].append(item)
        else:
            cols["unassigned"].append(item)
    active_by_driver: dict[int, int] = {}
    for w in rows:
        if w.driver_id and w.stage != "delivered":
            active_by_driver[w.driver_id] = active_by_driver.get(w.driver_id, 0) + 1
    drivers = [{**driver_out(d, L), "active": active_by_driver.get(d.id, 0)} for d in L.drivers.values() if d.status]
    drivers.sort(key=lambda d: (d["active"], d["name"]))
    return {"columns": cols, "drivers": drivers}


# --------------------------------------------------------- delivery grid ---
@router.get("/delivery")
def delivery_list(delivery_status: int | None = 0, date_from: str | None = None, date_to: str | None = None,
                  user: m.User = Depends(need("delivery")), db: Session = Depends(get_db)):
    """The 'Delivery management' screen: posted waybills with a pick-up GPS, editable in bulk."""
    L = Lookups(db, user.company_id)
    stmt = select(m.Waybill).where(m.Waybill.company_id == user.company_id, m.Waybill.status.in_(("post", "delivered")),
                                   m.Waybill.from_gps.is_not(None), m.Waybill.from_gps != "")
    if delivery_status is not None:
        stmt = stmt.where(m.Waybill.delivery_status == delivery_status)
    if date_from:
        stmt = stmt.where(m.Waybill.date >= date_from)
    if date_to:
        stmt = stmt.where(m.Waybill.date <= date_to)
    return [wb_out(w, L) for w in db.scalars(stmt.order_by(m.Waybill.updated_at.desc()).limit(300))]


@router.post("/delivery/update")
def delivery_update(body: GridIn, user: m.User = Depends(need("delivery")), db: Session = Depends(get_db)):
    if not body.rows:
        bad("no_updates")
    done = 0
    for row in body.rows:
        w = get_waybill(db, user, row.id)
        if w.status not in ("post", "delivered"):
            continue
        data = row.model_dump(exclude_unset=True)
        if row.to_gps:
            if not geo.parse_gps(row.to_gps):
                bad("gps_invalid")
            w.to_gps = row.to_gps
        if row.distance_km is not None:
            w.distance_km = round(row.distance_km, 2)
        for f in ("received_by", "receiver_mobile", "receiver_id"):
            if f in data:
                setattr(w, f, data[f])
        if "driver_id" in data and data["driver_id"] != w.driver_id and w.stage != "delivered":
            set_driver(db, w, data["driver_id"], user)
        if row.delivery_status is not None and row.delivery_status != w.delivery_status:
            bulk_delivery_update(db, w, user, row.delivery_status)
        w.updated_by = user.id
        done += 1
    db.commit()
    return {"updated": done}


# -------------------------------------------------------------- driver app ---
def _driver(db: Session, user: m.User) -> m.Driver:
    d = db.get(m.Driver, user.driver_id) if user.driver_id else None
    if not d:
        bad("not_a_driver", 403)
    return d  # type: ignore[return-value]


@router.get("/jobs")
def my_jobs(user: m.User = Depends(need("jobs")), db: Session = Depends(get_db)):
    d = _driver(db, user)
    L = Lookups(db, user.company_id)
    today_start = now() - timedelta(hours=24)
    rows = list(db.scalars(select(m.Waybill).where(
        m.Waybill.driver_id == d.id,
        (m.Waybill.status == "post") | ((m.Waybill.stage == "delivered") & (m.Waybill.delivered_at >= today_start)),
    ).order_by(m.Waybill.priority.desc(), m.Waybill.promised_at, m.Waybill.id)))
    items = [wb_out(w, L, viewer_role="driver") for w in rows]
    return {"driver": driver_out(d, L), "active": [i for i in items if i["stage"] != "delivered"], "done": [i for i in items if i["stage"] == "delivered"]}


@router.post("/jobs/{wid}/step")
def job_step(wid: int, body: StepIn, user: m.User = Depends(need("jobs")), company: m.Company = Depends(current_company), db: Session = Depends(get_db)):
    d = _driver(db, user)
    w = get_waybill(db, user, wid)
    driver_step(db, w, user, d, company, body.stage, body.model_dump())
    if body.lat is not None and body.lng is not None:
        register_ping(db, d, company, body.lat, body.lng, None)
    db.commit()
    return wb_out(w, Lookups(db, user.company_id), detail=True, viewer_role="driver")


@router.post("/tracking/ping")
def ping(body: PingIn, user: m.User = Depends(need("jobs")), company: m.Company = Depends(current_company), db: Session = Depends(get_db)):
    d = _driver(db, user)
    out = register_ping(db, d, company, body.lat, body.lng, body.speed)
    db.commit()
    return out


@router.post("/tracking/offline")
def go_offline(user: m.User = Depends(need("jobs")), db: Session = Depends(get_db)):
    d = _driver(db, user)
    d.online = False
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------- live map ---
@router.get("/tracking/live")
def live(user: m.User = Depends(need("tracking")), db: Session = Depends(get_db)):
    """Everything in motion that the caller may see: active waybills with the driver's last position."""
    L = Lookups(db, user.company_id)
    rows = db.scalars(visible_waybills(user).where(m.Waybill.status == "post", m.Waybill.stage.in_(ACTIVE_STAGES)).order_by(m.Waybill.id.desc()))
    items = [wb_out(w, L, detail=True, viewer_role=user.role) for w in rows]
    for i in items:
        for k in ("events", "attachments", "pod_signature", "pod_photo"):
            i.pop(k, None)
    drivers = []
    if user.role not in ("client", "driver"):
        cutoff = now() - timedelta(minutes=30)
        drivers = [driver_out(d, L) for d in L.drivers.values() if d.last_lat is not None and d.last_seen and d.last_seen >= cutoff]
    return {"waybills": items, "drivers": drivers, "at": iso(now())}


@router.get("/tracking/waybill/{wid}/trail")
def trail(wid: int, user: m.User = Depends(need("tracking", "jobs")), db: Session = Depends(get_db)):
    w = get_waybill(db, user, wid)
    if not w.driver_id:
        return []
    start = w.collected_at or (now() - timedelta(hours=12))
    end = w.delivered_at or now()
    pts = db.scalars(select(m.Ping).where(m.Ping.driver_id == w.driver_id, m.Ping.at >= start, m.Ping.at <= end).order_by(m.Ping.id).limit(1500))
    return [{"lat": p.lat, "lng": p.lng, "at": iso(p.at)} for p in pts]


# -------------------------------------------------------------- public track ---
_PUBLIC_FIELDS = {
    "created": "created", "posted": "posted", "assigned": "assigned", "accepted": "accepted", "picked_up": "picked_up",
    "in_transit": "in_transit", "near_destination": "near_destination", "arrived": "arrived", "delivered": "delivered",
    "failed": "failed", "cancelled": "cancelled",
}


@router.get("/public/track")
def public_track(number: str = Query(min_length=3), code: str = Query(min_length=4, max_length=12), db: Session = Depends(get_db)):
    """No login: the waybill number plus the last 4 digits of the consignee's phone (or the OTP)."""
    w = db.scalar(select(m.Waybill).where(func.upper(m.Waybill.number) == number.strip().upper()))
    digits = lambda s: re.sub(r"\D", "", s or "")  # noqa: E731
    ok = False
    if w:
        tail = code.strip()
        phones = [digits(w.to_mobile), digits(w.to_phone)]
        ok = any(p and p.endswith(digits(tail)[-4:]) and len(digits(tail)) >= 4 for p in phones) or (bool(w.otp) and tail == w.otp)
    if not w or not ok or w.status == "new":
        bad("track_not_found", 404)
    L = Lookups(db, w.company_id)
    driver = L.drivers.get(w.driver_id) if w.driver_id else None
    pos = None
    if driver and driver.last_lat is not None and w.stage in ACTIVE_STAGES:
        pos = {"lat": driver.last_lat, "lng": driver.last_lng, "seen": iso(driver.last_seen)}
        dest = geo.parse_gps(w.to_gps)
        if dest:
            rem, eta = geo.eta_minutes((driver.last_lat, driver.last_lng), dest, driver.last_speed)
            pos.update({"remaining_km": rem, "eta_min": eta})
    company = db.get(m.Company, w.company_id)
    sender = L.senders.get(w.sender_id)
    return {
        "number": w.number, "status": w.status, "stage": w.stage, "company": company.name if company else None,
        "company_en": company.name_en if company else None,
        "sender": sender.name if sender else None, "from_city": L.city(w.from_city_id), "to_city": L.city(w.to_city_id),
        "to_gps": w.to_gps, "from_gps": w.from_gps, "promised_at": iso(w.promised_at), "delivered_at": iso(w.delivered_at),
        "received_by": w.received_by, "driver_name": driver.name if driver and w.stage in ACTIVE_STAGES else None,
        "vehicle_no": w.vehicle_no if w.stage in ACTIVE_STAGES else None, "position": pos,
        "timeline": [{"at": iso(e.at), "type": e.type} for e in w.events if e.type in _PUBLIC_FIELDS],
    }
