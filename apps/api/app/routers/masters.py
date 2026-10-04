"""Master data: senders (clients), consignees, drivers, vehicles and tariffs."""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import geo
from .. import models as m
from ..db import get_db
from ..deps import current_user, need
from ..schemas import ConsigneeIn, DriverIn, SenderIn, TariffIn, VehicleIn
from ..services import (
    Lookups, allowed_drivers, audit, bad, consignee_out, driver_out, sender_out, tariff_out, vehicle_out,
)

router = APIRouter()


def _gps(value: str | None):
    if value and not geo.parse_gps(value):
        bad("gps_invalid")


def _city(db: Session, cid: int | None):
    if cid and not db.get(m.City, cid):
        bad("city_invalid")


def _own(db: Session, model, user: m.User, oid: int):
    row = db.get(model, oid)
    if not row or row.company_id != user.company_id:
        bad("not_found", 404)
    return row


# ---------------------------------------------------------------- senders ---
@router.get("/senders")
def list_senders(q: str | None = None, user: m.User = Depends(need("senders.read")), db: Session = Depends(get_db)):
    L = Lookups(db, user.company_id)
    stmt = select(m.Sender).where(m.Sender.company_id == user.company_id).order_by(m.Sender.name)
    if user.role == "client":
        stmt = stmt.where(m.Sender.id == user.sender_id)
    if q:
        stmt = stmt.where(m.Sender.name.ilike(f"%{q}%"))
    counts = dict(db.execute(select(m.Waybill.sender_id, func.count(m.Waybill.id)).where(m.Waybill.company_id == user.company_id).group_by(m.Waybill.sender_id)).all())
    return [{**sender_out(s, L), "waybills": counts.get(s.id, 0)} for s in db.scalars(stmt)]


@router.get("/senders/{sid}")
def get_sender(sid: int, user: m.User = Depends(need("senders.read")), db: Session = Depends(get_db)):
    s = _own(db, m.Sender, user, sid)
    if user.role == "client" and s.id != user.sender_id:
        bad("forbidden", 403)
    L = Lookups(db, user.company_id)
    cons = db.scalars(select(m.Consignee).where(m.Consignee.sender_id == sid).order_by(m.Consignee.name))
    return {**sender_out(s, L), "consignees": [consignee_out(c, L) for c in cons]}


@router.post("/senders", status_code=201)
def create_sender(body: SenderIn, user: m.User = Depends(need("senders.write")), db: Session = Depends(get_db)):
    _gps(body.gps)
    _city(db, body.city_id)
    s = m.Sender(company_id=user.company_id, updated_by=user.id, **body.model_dump())
    db.add(s)
    db.flush()
    audit(db, user, "sender_create", "sender", s.id, s.name)
    db.commit()
    return sender_out(s, Lookups(db, user.company_id))


@router.put("/senders/{sid}")
def update_sender(sid: int, body: SenderIn, user: m.User = Depends(need("senders.write")), db: Session = Depends(get_db)):
    s = _own(db, m.Sender, user, sid)
    _gps(body.gps)
    _city(db, body.city_id)
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    s.updated_by = user.id
    audit(db, user, "sender_update", "sender", s.id, s.name)
    db.commit()
    return sender_out(s, Lookups(db, user.company_id))


@router.delete("/senders/{sid}", status_code=204)
def archive_sender(sid: int, user: m.User = Depends(need("senders.write")), db: Session = Depends(get_db)):
    s = _own(db, m.Sender, user, sid)
    s.status = False
    audit(db, user, "sender_archive", "sender", s.id, s.name)
    db.commit()


# ------------------------------------------------------------- consignees ---
@router.get("/consignees")
def list_consignees(sender_id: int | None = None, q: str | None = None, active: bool | None = None,
                    user: m.User = Depends(need("consignees.read")), db: Session = Depends(get_db)):
    L = Lookups(db, user.company_id)
    stmt = select(m.Consignee).where(m.Consignee.company_id == user.company_id).order_by(m.Consignee.name)
    if user.role == "client":
        sender_id = user.sender_id
    if sender_id:
        stmt = stmt.where(m.Consignee.sender_id == sender_id)
    if active is not None:
        stmt = stmt.where(m.Consignee.status.is_(active))
    if q:
        stmt = stmt.where(m.Consignee.name.ilike(f"%{q}%"))
    return [{**consignee_out(c, L), "sender_name": L.senders[c.sender_id].name if c.sender_id in L.senders else None} for c in db.scalars(stmt.limit(500))]


def _sender_for(db: Session, user: m.User, requested: int | None) -> int:
    sid = user.sender_id if user.role == "client" else requested
    s = db.get(m.Sender, sid) if sid else None
    if not s or s.company_id != user.company_id:
        bad("sender_required")
    return s.id


@router.post("/consignees", status_code=201)
def create_consignee(body: ConsigneeIn, user: m.User = Depends(need("consignees.write")), db: Session = Depends(get_db)):
    sid = _sender_for(db, user, body.sender_id)
    _gps(body.gps)
    _city(db, body.city_id)
    dup = db.scalar(select(m.Consignee.id).where(m.Consignee.sender_id == sid, func.lower(m.Consignee.name) == body.name.lower()))
    if dup:
        bad("duplicate_consignee")
    data = body.model_dump(exclude={"sender_id"})
    c = m.Consignee(company_id=user.company_id, sender_id=sid, updated_by=user.id, **data)
    db.add(c)
    db.flush()
    audit(db, user, "consignee_create", "consignee", c.id, c.name)
    db.commit()
    return consignee_out(c, Lookups(db, user.company_id))


@router.put("/consignees/{cid}")
def update_consignee(cid: int, body: ConsigneeIn, user: m.User = Depends(need("consignees.write")), db: Session = Depends(get_db)):
    c = _own(db, m.Consignee, user, cid)
    if user.role == "client" and c.sender_id != user.sender_id:
        bad("forbidden", 403)
    _gps(body.gps)
    _city(db, body.city_id)
    for k, v in body.model_dump(exclude={"sender_id"}).items():
        setattr(c, k, v)
    c.updated_by = user.id
    db.commit()
    return consignee_out(c, Lookups(db, user.company_id))


@router.delete("/consignees/{cid}", status_code=204)
def delete_consignee(cid: int, user: m.User = Depends(need("consignees.write")), db: Session = Depends(get_db)):
    c = _own(db, m.Consignee, user, cid)
    if user.role == "client" and c.sender_id != user.sender_id:
        bad("forbidden", 403)
    used = db.scalar(select(func.count(m.Waybill.id)).where(m.Waybill.consignee_id == cid))
    if used:
        c.status = False
    else:
        db.delete(c)
    db.commit()


# ---------------------------------------------------------------- drivers ---
def _check_driver(db: Session, user: m.User, body: DriverIn):
    if body.vehicle_id:
        _own(db, m.Vehicle, user, body.vehicle_id)
    for sid in body.sender_ids:
        _own(db, m.Sender, user, sid)


@router.get("/drivers")
def list_drivers(for_sender: int | None = None, online: bool | None = None,
                 user: m.User = Depends(need("drivers.read")), db: Session = Depends(get_db)):
    L = Lookups(db, user.company_id)
    if for_sender:
        rows = allowed_drivers(db, user.company_id, for_sender)
    else:
        rows = list(db.scalars(select(m.Driver).where(m.Driver.company_id == user.company_id).order_by(m.Driver.name)))
    if online is not None:
        rows = [d for d in rows if d.online == online]
    return [driver_out(d, L) for d in rows]


@router.get("/drivers/{did}")
def get_driver(did: int, user: m.User = Depends(need("drivers.read")), db: Session = Depends(get_db)):
    d = _own(db, m.Driver, user, did)
    L = Lookups(db, user.company_id)
    stats = db.execute(select(func.count(m.Waybill.id), func.coalesce(func.sum(m.Waybill.distance_km), 0)).where(
        m.Waybill.driver_id == did, m.Waybill.stage == "delivered")).one()
    return {**driver_out(d, L), "delivered": stats[0], "distance_km": round(stats[1], 1)}


@router.post("/drivers", status_code=201)
def create_driver(body: DriverIn, user: m.User = Depends(need("drivers.write")), db: Session = Depends(get_db)):
    _check_driver(db, user, body)
    d = m.Driver(company_id=user.company_id, updated_by=user.id, **body.model_dump())
    db.add(d)
    db.flush()
    audit(db, user, "driver_create", "driver", d.id, d.name)
    db.commit()
    return driver_out(d, Lookups(db, user.company_id))


@router.put("/drivers/{did}")
def update_driver(did: int, body: DriverIn, user: m.User = Depends(need("drivers.write")), db: Session = Depends(get_db)):
    d = _own(db, m.Driver, user, did)
    _check_driver(db, user, body)
    for k, v in body.model_dump().items():
        setattr(d, k, v)
    d.updated_by = user.id
    audit(db, user, "driver_update", "driver", d.id, d.name)
    db.commit()
    return driver_out(d, Lookups(db, user.company_id))


@router.delete("/drivers/{did}", status_code=204)
def archive_driver(did: int, user: m.User = Depends(need("drivers.write")), db: Session = Depends(get_db)):
    d = _own(db, m.Driver, user, did)
    active = db.scalar(select(func.count(m.Waybill.id)).where(m.Waybill.driver_id == did, m.Waybill.status == "post", m.Waybill.stage != "delivered"))
    if active:
        bad("driver_busy")
    d.status = False
    audit(db, user, "driver_archive", "driver", d.id, d.name)
    db.commit()


# --------------------------------------------------------------- vehicles ---
@router.get("/vehicles")
def list_vehicles(user: m.User = Depends(need("vehicles.read")), db: Session = Depends(get_db)):
    rows = db.scalars(select(m.Vehicle).where(m.Vehicle.company_id == user.company_id).order_by(m.Vehicle.plate))
    drivers = {d.vehicle_id: d.name for d in db.scalars(select(m.Driver).where(m.Driver.company_id == user.company_id)) if d.vehicle_id}
    return [{**vehicle_out(v), "driver_name": drivers.get(v.id)} for v in rows]


@router.post("/vehicles", status_code=201)
def create_vehicle(body: VehicleIn, user: m.User = Depends(need("vehicles.write")), db: Session = Depends(get_db)):
    if db.scalar(select(m.Vehicle.id).where(m.Vehicle.company_id == user.company_id, func.lower(m.Vehicle.plate) == body.plate.lower())):
        bad("plate_taken")
    v = m.Vehicle(company_id=user.company_id, **body.model_dump())
    db.add(v)
    db.flush()
    audit(db, user, "vehicle_create", "vehicle", v.id, v.plate)
    db.commit()
    return vehicle_out(v)


@router.put("/vehicles/{vid}")
def update_vehicle(vid: int, body: VehicleIn, user: m.User = Depends(need("vehicles.write")), db: Session = Depends(get_db)):
    v = _own(db, m.Vehicle, user, vid)
    if db.scalar(select(m.Vehicle.id).where(m.Vehicle.company_id == user.company_id, func.lower(m.Vehicle.plate) == body.plate.lower(), m.Vehicle.id != vid)):
        bad("plate_taken")
    for k, val in body.model_dump().items():
        setattr(v, k, val)
    audit(db, user, "vehicle_update", "vehicle", v.id, v.plate)
    db.commit()
    return vehicle_out(v)


@router.delete("/vehicles/{vid}", status_code=204)
def delete_vehicle(vid: int, user: m.User = Depends(need("vehicles.write")), db: Session = Depends(get_db)):
    v = _own(db, m.Vehicle, user, vid)
    used = db.scalar(select(func.count(m.Driver.id)).where(m.Driver.vehicle_id == vid)) or db.scalar(
        select(func.count(m.Waybill.id)).where(m.Waybill.vehicle_id == vid))
    if used:
        bad("in_use")
    db.delete(v)
    db.commit()


# ---------------------------------------------------------------- tariffs ---
@router.get("/tariffs")
def list_tariffs(active: bool | None = None, user: m.User = Depends(need("tariffs.read")), db: Session = Depends(get_db)):
    L = Lookups(db, user.company_id)
    stmt = select(m.Tariff).where(m.Tariff.company_id == user.company_id).order_by(m.Tariff.name)
    if active is not None:
        stmt = stmt.where(m.Tariff.active.is_(active))
    return [tariff_out(t, L) for t in db.scalars(stmt)]


@router.post("/tariffs", status_code=201)
def create_tariff(body: TariffIn, user: m.User = Depends(need("tariffs.write")), db: Session = Depends(get_db)):
    _city(db, body.from_city_id)
    _city(db, body.to_city_id)
    t = m.Tariff(company_id=user.company_id, **body.model_dump())
    db.add(t)
    db.flush()
    audit(db, user, "tariff_create", "tariff", t.id, t.name)
    db.commit()
    return tariff_out(t, Lookups(db, user.company_id))


@router.put("/tariffs/{tid}")
def update_tariff(tid: int, body: TariffIn, user: m.User = Depends(need("tariffs.write")), db: Session = Depends(get_db)):
    t = _own(db, m.Tariff, user, tid)
    _city(db, body.from_city_id)
    _city(db, body.to_city_id)
    for k, v in body.model_dump().items():
        setattr(t, k, v)
    audit(db, user, "tariff_update", "tariff", t.id, t.name)
    db.commit()
    return tariff_out(t, Lookups(db, user.company_id))


@router.delete("/tariffs/{tid}", status_code=204)
def delete_tariff(tid: int, user: m.User = Depends(need("tariffs.write")), db: Session = Depends(get_db)):
    t = _own(db, m.Tariff, user, tid)
    if db.scalar(select(func.count(m.Waybill.id)).where(m.Waybill.tariff_id == tid)):
        t.active = False
    else:
        db.delete(t)
    db.commit()
