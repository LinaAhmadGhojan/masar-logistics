"""Dashboard and reports."""
from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models as m
from ..clock import iso_date, local_today, now
from ..db import get_db
from ..deps import current_company, current_user, need
from ..services import (
    ACTIVE_STAGES, Lookups, bad, is_delayed, is_late, normalize_packages, package_totals, r2, vehicle_out, visible_waybills, wb_out,
)

router = APIRouter()
FINANCE_ROLES = ("admin", "finance")


def _days(n: int):
    today = local_today()
    return [today - timedelta(days=i) for i in range(n - 1, -1, -1)]


def _on_time(rows) -> float | None:
    done = [w for w in rows if w.delivered_at and w.promised_at]
    return round(100 * sum(1 for w in done if not is_late(w)) / len(done), 1) if done else None


@router.get("/dashboard")
def dashboard(user: m.User = Depends(need("dashboard", "jobs")), company: m.Company = Depends(current_company), db: Session = Depends(get_db)):
    L = Lookups(db, user.company_id)
    today = local_today()
    since30 = today - timedelta(days=30)

    if user.role == "driver":
        mine = list(db.scalars(select(m.Waybill).where(m.Waybill.driver_id == user.driver_id)))
        d = L.drivers.get(user.driver_id) if user.driver_id else None
        done = [w for w in mine if w.stage == "delivered"]
        return {
            "role": "driver", "driver": d.name if d else None, "rating": d.rating if d else None,
            "kpis": {"active": sum(1 for w in mine if w.status == "post" and w.stage != "delivered"),
                     "delivered_today": sum(1 for w in done if w.delivered_at and w.delivered_at.date() == today),
                     "delivered_30d": sum(1 for w in done if w.date >= since30),
                     "distance_30d": r2(sum(w.distance_km for w in done if w.date >= since30)),
                     "on_time_rate": _on_time([w for w in done if w.date >= since30]),
                     "cod_in_hand": r2(sum(w.cod_amount for w in mine if w.cod_collected and not w.cod_settled))},
        }

    scope = list(db.scalars(visible_waybills(user).where(m.Waybill.date >= today - timedelta(days=180))))
    last30 = [w for w in scope if w.date >= since30 and w.status != "cancelled"]
    days14 = _days(14)
    created, delivered = defaultdict(int), defaultdict(int)
    for w in scope:
        created[w.date] += 1
        if w.delivered_at:
            delivered[w.delivered_at.date()] += 1
    series = [{"date": iso_date(d), "created": created[d], "delivered": delivered[d]} for d in days14]
    by_status = defaultdict(int)
    for w in scope:
        if w.date >= since30:
            by_status[w.status] += 1

    senders: dict[int, dict] = {}
    routes: dict[tuple, int] = defaultdict(int)
    for w in last30:
        s = senders.setdefault(w.sender_id, {"id": w.sender_id, "name": L.senders[w.sender_id].name if w.sender_id in L.senders else "-", "count": 0, "revenue": 0.0})
        s["count"] += 1
        s["revenue"] = r2(s["revenue"] + (w.service_charge if w.status in ("verified", "invoiced") else 0))
        routes[(w.from_city_id, w.to_city_id)] += 1
    top_routes = [{"from": L.city(a), "to": L.city(b), "count": c} for (a, b), c in sorted(routes.items(), key=lambda kv: -kv[1])[:5]]

    invs = list(db.scalars(select(m.Invoice).where(m.Invoice.company_id == user.company_id,
                                                  *( [m.Invoice.sender_id == (user.sender_id or -1)] if user.role == "client" else []))))
    live = [i for i in invs if i.status in ("issued", "partial", "paid")]
    open_inv = [i for i in invs if i.status in ("issued", "partial")]
    kpis = {
        "total_30d": len(last30),
        "new": sum(1 for w in scope if w.status == "new"),
        "unassigned": sum(1 for w in scope if w.status == "post" and not w.driver_id),
        "in_transit": sum(1 for w in scope if w.status == "post" and w.stage in ACTIVE_STAGES),
        "delivered_today": sum(1 for w in scope if w.delivered_at and w.delivered_at.date() == today),
        "delayed": sum(1 for w in scope if is_delayed(w)),
        "on_time_rate": _on_time([w for w in scope if w.date >= since30]),
        "to_verify": sum(1 for w in scope if w.status == "delivered"),
        "to_invoice": sum(1 for w in scope if w.status == "verified" and not w.invoice_id),
        "revenue_30d": r2(sum(i.total for i in live if i.issue_date >= since30)),
        "receivables": r2(sum(i.total - i.paid for i in open_inv)),
        "overdue_amount": r2(sum(i.total - i.paid for i in open_inv if i.due_date and i.due_date < today)),
        "cod_pending": r2(sum(w.cod_amount for w in scope if w.cod_collected and not w.cod_settled)),
    }
    out = {"role": user.role, "kpis": kpis, "series": series, "by_status": dict(by_status),
           "top_senders": sorted(senders.values(), key=lambda s: -s["count"])[:5], "top_routes": top_routes}

    recent = sorted(scope, key=lambda w: -w.id)[:6]
    out["recent"] = [wb_out(w, L) for w in recent]

    if user.role == "client":
        done = [w for w in last30 if w.delivered_at]
        hours = [(w.delivered_at - w.created_at).total_seconds() / 3600 for w in done]
        out["kpis"]["avg_hours"] = round(sum(hours) / len(hours), 1) if hours else None
        out["kpis"]["active"] = sum(1 for w in scope if w.status == "post" and w.stage != "delivered")
        return out

    # staff-only blocks
    months = []
    cur = today.replace(day=1)
    for _ in range(6):
        months.append(cur)
        cur = (cur - timedelta(days=1)).replace(day=1)
    months.reverse()
    out["revenue_series"] = [{"month": mo.strftime("%Y-%m"), "total": r2(sum(i.total for i in live if i.issue_date.year == mo.year and i.issue_date.month == mo.month))} for mo in months]

    done30 = [w for w in scope if w.stage == "delivered" and w.date >= since30]
    leaders: dict[int, dict] = {}
    for w in done30:
        if not w.driver_id:
            continue
        dr = leaders.setdefault(w.driver_id, {"id": w.driver_id, "name": L.drivers[w.driver_id].name if w.driver_id in L.drivers else "-", "delivered": 0, "late": 0, "km": 0.0})
        dr["delivered"] += 1
        dr["late"] += 1 if is_late(w) else 0
        dr["km"] = r2(dr["km"] + w.distance_km)
    out["drivers"] = sorted(leaders.values(), key=lambda d: -d["delivered"])[:5]

    vehicles = list(L.vehicles.values())
    out["fleet"] = {
        "total": len(vehicles), "available": sum(1 for v in vehicles if v.status == "available"),
        "on_trip": sum(1 for v in vehicles if v.status == "on_trip"), "maintenance": sum(1 for v in vehicles if v.status == "maintenance"),
        "drivers_online": sum(1 for d in L.drivers.values() if d.online),
    }

    alerts = []
    if kpis["delayed"]:
        alerts.append({"type": "delayed", "severity": "high", "count": kpis["delayed"], "link": "/app/waybills?delayed=1"})
    if kpis["unassigned"]:
        alerts.append({"type": "unassigned", "severity": "mid", "count": kpis["unassigned"], "link": "/app/dispatch"})
    if kpis["to_verify"]:
        alerts.append({"type": "to_verify", "severity": "low", "count": kpis["to_verify"], "link": "/app/billing"})
    overdue = [i for i in open_inv if i.due_date and i.due_date < today]
    if overdue:
        alerts.append({"type": "overdue", "severity": "high", "count": len(overdue), "link": "/app/invoices?overdue=1"})
    for d in L.drivers.values():
        if d.license_expiry and (d.license_expiry - today).days <= 30:
            alerts.append({"type": "license", "severity": "mid", "name": d.name, "days": (d.license_expiry - today).days, "link": f"/app/driver?id={d.id}"})
    for v in vehicles:
        for kind, dt in (("insurance", v.insurance_expiry), ("registration", v.registration_expiry)):
            if dt and (dt - today).days <= 30:
                alerts.append({"type": kind, "severity": "mid", "name": v.plate, "days": (dt - today).days, "link": "/app/vehicles"})
    out["alerts"] = alerts
    return out


# ---------------------------------------------------------------- reports ---
def _scope(user: m.User, db: Session, date_from, date_to, **flt):
    stmt = visible_waybills(user).where(m.Waybill.status != "cancelled") if not flt.pop("with_cancelled", False) else visible_waybills(user)
    if date_from:
        stmt = stmt.where(m.Waybill.date >= date_from)
    if date_to:
        stmt = stmt.where(m.Waybill.date <= date_to)
    for k, v in flt.items():
        if v:
            stmt = stmt.where(getattr(m.Waybill, k) == v)
    return stmt.order_by(m.Waybill.date.desc(), m.Waybill.id.desc())


@router.get("/reports/shipment-status")
def shipment_status(date_from: str | None = None, date_to: str | None = None, delivered_from: str | None = None,
                    delivered_to: str | None = None, status: str | None = None, delivery_status: int | None = None,
                    to_city_id: int | None = None, user: m.User = Depends(need("reports")), db: Session = Depends(get_db)):
    L = Lookups(db, user.company_id)
    stmt = _scope(user, db, date_from, date_to, with_cancelled=True, to_city_id=to_city_id)
    if status:
        stmt = stmt.where(m.Waybill.status.in_(("post", "delivered")) if status == "post" else m.Waybill.status == status)
    if delivery_status is not None:
        stmt = stmt.where(m.Waybill.delivery_status == delivery_status)
    if delivered_from:
        stmt = stmt.where(func.date(m.Waybill.delivered_at) >= delivered_from)
    if delivered_to:
        stmt = stmt.where(func.date(m.Waybill.delivered_at) <= delivered_to)
    users = {u.id: u for u in db.scalars(select(m.User).where(m.User.company_id == user.company_id))}
    rows = []
    for w in db.scalars(stmt.limit(2000)):
        creator = users.get(w.created_by)
        t = L.tariffs.get(w.tariff_id) if w.tariff_id else None
        rows.append({
            "id": w.id, "number": w.number, "date": iso_date(w.date), "sender": L.senders[w.sender_id].name if w.sender_id in L.senders else "-",
            "user": creator.full_name if creator else "-", "user_email": creator.login if creator else "-", "to_name": w.to_name,
            "to_city": L.city(w.to_city_id), "service": t.name if t else None, "service_charge": w.service_charge,
            "status": w.status, "delivery_status": w.delivery_status,
            "driver": L.drivers[w.driver_id].name if w.driver_id in L.drivers else None,
            "delivered_at": w.delivered_at.isoformat(timespec="minutes").replace("T", " ") if w.delivered_at else None,
        })
    return {"rows": rows, "totals": {"count": len(rows), "service_charge": r2(sum(r["service_charge"] for r in rows))}}


@router.get("/reports/waybill-list")
def waybill_list(date_from: str | None = None, date_to: str | None = None, from_city_id: int | None = None,
                 to_city_id: int | None = None, sender_id: int | None = None, driver_id: int | None = None,
                 user: m.User = Depends(need("reports")), db: Session = Depends(get_db)):
    """The trip sheet of the original module (one row per waybill, with pallets, material, weight and amounts)."""
    L = Lookups(db, user.company_id)
    date_from = date_from or iso_date(local_today() - timedelta(days=30))
    date_to = date_to or iso_date(local_today())
    if user.role == "client":
        sender_id = None
    stmt = _scope(user, db, date_from, date_to, from_city_id=from_city_id, to_city_id=to_city_id, sender_id=sender_id, driver_id=driver_id)
    inv = {i.id: i.number for i in db.scalars(select(m.Invoice).where(m.Invoice.company_id == user.company_id))}
    rows = []
    for w in db.scalars(stmt.limit(2000)):
        pallets = package_totals(normalize_packages(w.packages))["pallets"]
        d = L.drivers.get(w.driver_id) if w.driver_id else None
        rows.append({
            "id": w.id, "date": iso_date(w.date), "invoice": inv.get(w.invoice_id), "order_no": w.order_no, "to_name": w.to_name,
            "from_city": L.city(w.from_city_id), "delivery_note": w.delivery_note, "number": w.number, "vehicle_no": w.vehicle_no,
            "driver": d.name if d else None, "sender": L.senders[w.sender_id].name if w.sender_id in L.senders else None,
            "to_city": L.city(w.to_city_id), "to_gps": w.to_gps, "distance_km": w.distance_km, "pallets": pallets or None,
            "material": w.material, "total_qty": w.total_qty, "est_weight": w.est_weight,
            "amount_without_vat": w.service_charge if w.service_charge else None,
            "amount_with_vat": r2(w.service_charge + w.vat_amount) if w.service_charge else None,
        })
    tot = lambda k: r2(sum((r[k] or 0) for r in rows))  # noqa: E731
    return {"rows": rows, "totals": {"count": len(rows), "distance_km": tot("distance_km"), "pallets": tot("pallets"), "total_qty": tot("total_qty"),
                                     "est_weight": tot("est_weight"), "amount_without_vat": tot("amount_without_vat"), "amount_with_vat": tot("amount_with_vat")}}


def _finance_only(user: m.User):
    if user.role not in FINANCE_ROLES:
        bad("forbidden", 403)


@router.get("/reports/revenue")
def revenue(months: int = 6, user: m.User = Depends(need("reports")), db: Session = Depends(get_db)):
    _finance_only(user)
    L = Lookups(db, user.company_id)
    start = (local_today().replace(day=1) - timedelta(days=31 * (max(months, 1) - 1))).replace(day=1)
    invs = list(db.scalars(select(m.Invoice).where(m.Invoice.company_id == user.company_id, m.Invoice.status.in_(("issued", "partial", "paid")), m.Invoice.issue_date >= start)))
    by_month, by_sender = defaultdict(lambda: {"subtotal": 0.0, "vat": 0.0, "total": 0.0, "paid": 0.0, "count": 0}), defaultdict(lambda: {"total": 0.0, "paid": 0.0, "count": 0})
    for i in invs:
        mm = by_month[i.issue_date.strftime("%Y-%m")]
        mm["subtotal"] += i.subtotal; mm["vat"] += i.vat; mm["total"] += i.total; mm["paid"] += i.paid; mm["count"] += 1
        ss = by_sender[i.sender_id]
        ss["total"] += i.total; ss["paid"] += i.paid; ss["count"] += 1
    return {
        "months": [{"month": k, **{a: r2(b) if a != "count" else b for a, b in v.items()}} for k, v in sorted(by_month.items())],
        "senders": sorted([{"sender_id": k, "sender": L.senders[k].name if k in L.senders else "-", **{a: r2(b) if a != "count" else b for a, b in v.items()}} for k, v in by_sender.items()], key=lambda r: -r["total"]),
        "totals": {"total": r2(sum(i.total for i in invs)), "paid": r2(sum(i.paid for i in invs)), "count": len(invs)},
    }


@router.get("/reports/drivers")
def driver_performance(date_from: str | None = None, date_to: str | None = None, user: m.User = Depends(need("reports")), db: Session = Depends(get_db)):
    if user.role == "client":
        bad("forbidden", 403)
    L = Lookups(db, user.company_id)
    date_from = date_from or iso_date(local_today() - timedelta(days=30))
    date_to = date_to or iso_date(local_today())
    rows = list(db.scalars(_scope(user, db, date_from, date_to).where(m.Waybill.driver_id.is_not(None))))
    out: dict[int, dict] = {}
    for w in rows:
        d = out.setdefault(w.driver_id, {"driver_id": w.driver_id, "driver": L.drivers[w.driver_id].name if w.driver_id in L.drivers else "-",
                                         "assigned": 0, "delivered": 0, "failed": 0, "late": 0, "km": 0.0, "hours": [], "cod": 0.0})
        d["assigned"] += 1
        d["failed"] += 1 if w.stage == "failed" else 0
        if w.stage == "delivered":
            d["delivered"] += 1
            d["late"] += 1 if is_late(w) else 0
            d["km"] += w.distance_km
            if w.collected_at and w.delivered_at:
                d["hours"].append((w.delivered_at - w.collected_at).total_seconds() / 3600)
            d["cod"] += w.cod_amount if w.cod_collected else 0
    res = []
    for d in out.values():
        res.append({**{k: v for k, v in d.items() if k != "hours"}, "km": r2(d["km"]), "cod": r2(d["cod"]),
                    "on_time_rate": round(100 * (d["delivered"] - d["late"]) / d["delivered"], 1) if d["delivered"] else None,
                    "avg_hours": round(sum(d["hours"]) / len(d["hours"]), 1) if d["hours"] else None})
    return {"rows": sorted(res, key=lambda r: -r["delivered"])}


@router.get("/reports/receivables")
def receivables(user: m.User = Depends(need("reports")), db: Session = Depends(get_db)):
    _finance_only(user)
    L = Lookups(db, user.company_id)
    today = local_today()
    buckets = ("current", "d1_30", "d31_60", "d61_90", "d90")
    out: dict[int, dict] = {}
    for i in db.scalars(select(m.Invoice).where(m.Invoice.company_id == user.company_id, m.Invoice.status.in_(("issued", "partial")))):
        bal = i.total - i.paid
        late = (today - i.due_date).days if i.due_date else 0
        b = "current" if late <= 0 else "d1_30" if late <= 30 else "d31_60" if late <= 60 else "d61_90" if late <= 90 else "d90"
        row = out.setdefault(i.sender_id, {"sender_id": i.sender_id, "sender": L.senders[i.sender_id].name if i.sender_id in L.senders else "-", **{k: 0.0 for k in buckets}, "total": 0.0})
        row[b] = r2(row[b] + bal)
        row["total"] = r2(row["total"] + bal)
    rows = sorted(out.values(), key=lambda r: -r["total"])
    return {"rows": rows, "totals": {k: r2(sum(r[k] for r in rows)) for k in (*buckets, "total")}}


@router.get("/reports/statement/{sender_id}")
def statement(sender_id: int, date_from: str | None = None, date_to: str | None = None, user: m.User = Depends(need("reports", "invoices.read")), db: Session = Depends(get_db)):
    if user.role == "client":
        sender_id = user.sender_id or -1
    elif user.role not in FINANCE_ROLES:
        bad("forbidden", 403)
    s = db.get(m.Sender, sender_id)
    if not s or s.company_id != user.company_id:
        bad("not_found", 404)
    stmt = select(m.Invoice).where(m.Invoice.sender_id == sender_id, m.Invoice.status.in_(("issued", "partial", "paid")))
    if date_from:
        stmt = stmt.where(m.Invoice.issue_date >= date_from)
    if date_to:
        stmt = stmt.where(m.Invoice.issue_date <= date_to)
    entries = []
    for i in db.scalars(stmt):
        entries.append({"date": iso_date(i.issue_date), "kind": "invoice", "ref": i.number, "debit": i.total, "credit": 0.0, "invoice_id": i.id})
        for p in i.payments:
            entries.append({"date": iso_date(p.date), "kind": "payment", "ref": p.ref or i.number, "debit": 0.0, "credit": p.amount, "invoice_id": i.id})
    entries.sort(key=lambda e: (e["date"], 0 if e["kind"] == "invoice" else 1))
    bal = 0.0
    for e in entries:
        bal = r2(bal + e["debit"] - e["credit"])
        e["balance"] = bal
    return {"sender": {"id": s.id, "name": s.name, "vat_no": s.vat_no, "address": s.address}, "entries": entries,
            "totals": {"debit": r2(sum(e["debit"] for e in entries)), "credit": r2(sum(e["credit"] for e in entries)), "balance": bal}}
