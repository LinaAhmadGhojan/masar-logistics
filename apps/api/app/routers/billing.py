"""Billing: verification of delivered waybills, invoices, payments and COD cash settlement."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from ..clock import local_today
from ..db import get_db
from ..deps import current_company, need
from ..schemas import InvoiceIn, PaymentIn, SettleIn, VerifyIn
from ..services import (
    Lookups, add_payment, audit, bad, compute_charge, create_invoices, invoice_out, log_event, normalize_packages,
    package_totals, r2, suggest_tariff, verify_waybill, void_invoice, wb_out,
)

router = APIRouter()


@router.get("/billing/unverified")
def unverified(date_from: str | None = None, date_to: str | None = None, sender_id: int | None = None,
               user: m.User = Depends(need("billing")), company: m.Company = Depends(current_company), db: Session = Depends(get_db)):
    """Delivered waybills waiting for a tariff: each row carries the tariff the rules suggest and its price."""
    L = Lookups(db, user.company_id)
    stmt = select(m.Waybill).where(m.Waybill.company_id == user.company_id, m.Waybill.status == "delivered")
    if date_from:
        stmt = stmt.where(m.Waybill.date >= date_from)
    if date_to:
        stmt = stmt.where(m.Waybill.date <= date_to)
    if sender_id:
        stmt = stmt.where(m.Waybill.sender_id == sender_id)
    out = []
    for w in db.scalars(stmt.order_by(m.Waybill.delivered_at).limit(300)):
        item = wb_out(w, L)
        t = suggest_tariff(db, user.company_id, w)
        item["suggested_tariff_id"] = t.id if t else None
        if t:
            pallets = package_totals(normalize_packages(w.packages))["pallets"]
            charge = compute_charge(t, w.distance_km, pallets, w.weight)
            item["suggested_charge"] = charge
            item["suggested_vat"] = r2(charge * company.vat_rate / 100)
        out.append(item)
    return out


@router.post("/billing/verify")
def verify(body: VerifyIn, user: m.User = Depends(need("billing")), company: m.Company = Depends(current_company), db: Session = Depends(get_db)):
    if not body.rows:
        bad("no_updates")
    for row in body.rows:  # all-or-nothing: one bad row rolls the whole batch back
        w = db.get(m.Waybill, row.id)
        if not w or w.company_id != user.company_id:
            bad("not_found", 404)
        verify_waybill(db, w, user, company, row.tariff_id, row.distance_km)
        audit(db, user, "waybill_verify", "waybill", w.id, w.number)
    db.commit()
    return {"verified": len(body.rows)}


@router.get("/billing/ready")
def ready(sender_id: int | None = None, user: m.User = Depends(need("billing", "invoices.write")), db: Session = Depends(get_db)):
    L = Lookups(db, user.company_id)
    stmt = select(m.Waybill).where(m.Waybill.company_id == user.company_id, m.Waybill.status == "verified", m.Waybill.invoice_id.is_(None))
    if sender_id:
        stmt = stmt.where(m.Waybill.sender_id == sender_id)
    return [wb_out(w, L) for w in db.scalars(stmt.order_by(m.Waybill.sender_id, m.Waybill.id).limit(500))]


# --------------------------------------------------------------- invoices ---
@router.get("/invoices")
def list_invoices(status: str | None = None, sender_id: int | None = None, overdue: bool | None = None,
                  user: m.User = Depends(need("invoices.read")), db: Session = Depends(get_db)):
    L = Lookups(db, user.company_id)
    stmt = select(m.Invoice).where(m.Invoice.company_id == user.company_id)
    if user.role == "client":
        stmt = stmt.where(m.Invoice.sender_id == (user.sender_id or -1), m.Invoice.status != "draft")
    elif sender_id:
        stmt = stmt.where(m.Invoice.sender_id == sender_id)
    if status:
        stmt = stmt.where(m.Invoice.status.in_(status.split(",")))
    rows = [invoice_out(i, L) for i in db.scalars(stmt.order_by(m.Invoice.id.desc()).limit(500))]
    if overdue:
        rows = [r for r in rows if r["overdue"]]
    return rows


def _invoice(db: Session, user: m.User, iid: int) -> m.Invoice:
    i = db.get(m.Invoice, iid)
    if not i or i.company_id != user.company_id:
        bad("not_found", 404)
    if user.role == "client" and (i.sender_id != user.sender_id or i.status == "draft"):
        bad("not_found", 404)
    return i  # type: ignore[return-value]


@router.get("/invoices/{iid}")
def get_invoice(iid: int, user: m.User = Depends(need("invoices.read")), company: m.Company = Depends(current_company), db: Session = Depends(get_db)):
    i = _invoice(db, user, iid)
    return {**invoice_out(i, Lookups(db, user.company_id), detail=True), "company": {
        "name": company.name, "name_en": company.name_en, "vat_no": company.vat_no, "address": company.address,
        "phone": company.phone, "email": company.email, "currency": company.currency, "vat_rate": company.vat_rate}}


@router.post("/invoices", status_code=201)
def make_invoices(body: InvoiceIn, user: m.User = Depends(need("invoices.write")), company: m.Company = Depends(current_company), db: Session = Depends(get_db)):
    invs = create_invoices(db, company, user, body.waybill_ids, body.issue)
    for i in invs:
        audit(db, user, "invoice_create", "invoice", i.id, i.number)
    db.commit()
    L = Lookups(db, company.id)
    return [invoice_out(i, L) for i in invs]


@router.post("/invoices/{iid}/issue")
def issue(iid: int, user: m.User = Depends(need("invoices.write")), db: Session = Depends(get_db)):
    i = _invoice(db, user, iid)
    if i.status != "draft":
        bad("not_draft")
    i.status = "issued"
    i.issue_date = local_today()
    from datetime import timedelta
    s = db.get(m.Sender, i.sender_id)
    i.due_date = i.issue_date + timedelta(days=s.payment_terms_days if s else 0)
    from ..services import notify, sender_user_ids
    notify(db, i.company_id, sender_user_ids(db, i.sender_id), "invoice", i.number, f"{i.total:g}", f"/app/invoice?id={i.id}")
    audit(db, user, "invoice_issue", "invoice", i.id, i.number)
    db.commit()
    return invoice_out(i, Lookups(db, user.company_id), detail=True)


@router.post("/invoices/{iid}/void")
def void(iid: int, user: m.User = Depends(need("invoices.write")), db: Session = Depends(get_db)):
    i = _invoice(db, user, iid)
    void_invoice(db, i, user)
    audit(db, user, "invoice_void", "invoice", i.id, i.number)
    db.commit()
    return invoice_out(i, Lookups(db, user.company_id), detail=True)


@router.post("/invoices/{iid}/pay")
def pay(iid: int, body: PaymentIn, user: m.User = Depends(need("payments")), db: Session = Depends(get_db)):
    i = _invoice(db, user, iid)
    add_payment(db, i, user, body.amount, body.method, body.ref, body.date)
    audit(db, user, "payment", "invoice", i.id, f"{i.number} · {body.amount:g}")
    db.commit()
    return invoice_out(i, Lookups(db, user.company_id), detail=True)


# -------------------------------------------------------------------- COD ---
@router.get("/cod")
def cod(user: m.User = Depends(need("cod")), db: Session = Depends(get_db)):
    """Cash collected by drivers on delivery that has not been handed over to the office yet."""
    L = Lookups(db, user.company_id)
    rows = list(db.scalars(select(m.Waybill).where(m.Waybill.company_id == user.company_id, m.Waybill.cod_collected.is_(True),
                                                   m.Waybill.cod_settled.is_(False)).order_by(m.Waybill.delivered_at)))
    groups: dict[int, dict] = {}
    for w in rows:
        d = L.drivers.get(w.driver_id) if w.driver_id else None
        g = groups.setdefault(w.driver_id or 0, {"driver_id": w.driver_id, "driver_name": d.name if d else "-", "total": 0.0, "items": []})
        g["total"] = r2(g["total"] + w.cod_amount)
        g["items"].append(wb_out(w, L))
    return {"total": r2(sum(g["total"] for g in groups.values())), "groups": list(groups.values())}


@router.post("/cod/settle")
def settle(body: SettleIn, user: m.User = Depends(need("cod")), db: Session = Depends(get_db)):
    n = 0
    for w in db.scalars(select(m.Waybill).where(m.Waybill.company_id == user.company_id, m.Waybill.id.in_(body.waybill_ids),
                                                m.Waybill.cod_collected.is_(True), m.Waybill.cod_settled.is_(False))):
        w.cod_settled = True
        log_event(db, w, "cod_settled", user, f"{w.cod_amount:g}")
        n += 1
    if not n:
        bad("nothing_to_settle")
    audit(db, user, "cod_settle", "waybill", None, f"{n} waybills")
    db.commit()
    return {"settled": n}
