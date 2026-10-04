"""Authentication, metadata, company settings, users, notifications and the audit log."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models as m
from ..clock import iso, now
from ..db import get_db
from ..deps import current_company, current_user, need
from ..schemas import LoginIn, PasswordIn, SettingsIn, UserIn
from ..security import hash_password, make_token, verify_password
from ..services import audit, bad, company_out, user_out

router = APIRouter()


@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(m.User).where(func.lower(m.User.login) == body.login.lower()))
    if not user or not user.active or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "bad_credentials")
    user.last_login = now()
    db.commit()
    return {"token": make_token(user.id), "user": user_out(user, db)}


@router.get("/auth/me")
def me(user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    return user_out(user, db)


@router.post("/auth/password")
def change_password(body: PasswordIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.old, user.password_hash):
        bad("wrong_password")
    user.password_hash = hash_password(body.new)
    audit(db, user, "password_change", "user", user.id)
    db.commit()
    return {"ok": True}


@router.get("/meta")
def meta(user: m.User = Depends(current_user), company: m.Company = Depends(current_company), db: Session = Depends(get_db)):
    cities = [{"id": c.id, "ar": c.name_ar, "en": c.name_en, "country": c.country, "lat": c.lat, "lng": c.lng}
              for c in db.scalars(select(m.City).order_by(m.City.name_en))]
    return {
        "service_types": m.SERVICE_TYPES, "deliver_types": m.DELIVER_TYPES, "payment_modes": m.PAYMENT_MODES,
        "invoice_types": m.INVOICE_TYPES, "insurance_types": m.INSURANCE_TYPES, "collect_types": m.COLLECT_TYPES,
        "return_refs": m.RETURN_REFS, "pkg_types": m.PKG_TYPES, "materials": m.MATERIALS, "vehicle_kinds": m.VEHICLE_KINDS,
        "priorities": m.PRIORITIES, "statuses": m.STATUSES, "stages": m.STAGES, "cities": cities, "company": company_out(company),
    }


# ---- settings ("system rules") ----------------------------------------------
@router.get("/settings")
def get_settings(company: m.Company = Depends(current_company), user: m.User = Depends(current_user)):
    return company_out(company)


@router.put("/settings")
def put_settings(body: SettingsIn, user: m.User = Depends(need("settings")), company: m.Company = Depends(current_company), db: Session = Depends(get_db)):
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None or k in ("phone", "email", "address", "vat_no", "name_en"):
            setattr(company, k, v)
    audit(db, user, "settings", "company", company.id)
    db.commit()
    return company_out(company)


# ---- users ------------------------------------------------------------------
def _check_links(db: Session, user: m.User, body: UserIn):
    if body.role == "client":
        s = db.get(m.Sender, body.sender_id) if body.sender_id else None
        if not s or s.company_id != user.company_id:
            bad("sender_required")
    if body.role == "driver":
        d = db.get(m.Driver, body.driver_id) if body.driver_id else None
        if not d or d.company_id != user.company_id:
            bad("driver_required")


@router.get("/users")
def list_users(user: m.User = Depends(need("users")), db: Session = Depends(get_db)):
    rows = db.scalars(select(m.User).where(m.User.company_id == user.company_id).order_by(m.User.role, m.User.full_name))
    return [user_out(u, db) for u in rows]


@router.post("/users", status_code=201)
def create_user(body: UserIn, user: m.User = Depends(need("users")), db: Session = Depends(get_db)):
    if not body.password:
        bad("password_required")
    if db.scalar(select(m.User.id).where(func.lower(m.User.login) == body.login.lower())):
        bad("login_taken")
    _check_links(db, user, body)
    u = m.User(company_id=user.company_id, password_hash=hash_password(body.password),
               **body.model_dump(exclude={"password"}))
    if u.role != "client":
        u.sender_id = None
    if u.role != "driver":
        u.driver_id = None
    db.add(u)
    db.flush()
    audit(db, user, "user_create", "user", u.id, f"{u.login} ({u.role})")
    db.commit()
    return user_out(u, db)


@router.put("/users/{uid}")
def update_user(uid: int, body: UserIn, user: m.User = Depends(need("users")), db: Session = Depends(get_db)):
    u = db.get(m.User, uid)
    if not u or u.company_id != user.company_id:
        bad("not_found", 404)
    other = db.scalar(select(m.User.id).where(func.lower(m.User.login) == body.login.lower(), m.User.id != uid))
    if other:
        bad("login_taken")
    if u.id == user.id and (body.role != u.role or not body.active):
        bad("cannot_demote_self")
    _check_links(db, user, body)
    for k, v in body.model_dump(exclude={"password"}).items():
        setattr(u, k, v)
    if body.password:
        u.password_hash = hash_password(body.password)
    if u.role != "client":
        u.sender_id = None
    if u.role != "driver":
        u.driver_id = None
    audit(db, user, "user_update", "user", u.id, f"{u.login} ({u.role})")
    db.commit()
    return user_out(u, db)


@router.delete("/users/{uid}", status_code=204)
def delete_user(uid: int, user: m.User = Depends(need("users")), db: Session = Depends(get_db)):
    u = db.get(m.User, uid)
    if not u or u.company_id != user.company_id:
        bad("not_found", 404)
    if u.id == user.id:
        bad("cannot_demote_self")
    u.active = False  # accounts are archived, never erased (history keeps their name)
    audit(db, user, "user_disable", "user", u.id, u.login)
    db.commit()


# ---- notifications ----------------------------------------------------------
@router.get("/notifications")
def notifications(unseen: bool = False, limit: int = 40, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(m.Notification).where(m.Notification.user_id == user.id)
    if unseen:
        q = q.where(m.Notification.seen.is_(False))
    rows = db.scalars(q.order_by(m.Notification.id.desc()).limit(min(limit, 200)))
    unseen_count = db.scalar(select(func.count(m.Notification.id)).where(m.Notification.user_id == user.id, m.Notification.seen.is_(False)))
    return {"unseen": unseen_count, "items": [
        {"id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "link": n.link, "seen": n.seen, "at": iso(n.at)} for n in rows]}


@router.post("/notifications/seen")
def mark_seen(user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    for n in db.scalars(select(m.Notification).where(m.Notification.user_id == user.id, m.Notification.seen.is_(False))):
        n.seen = True
    db.commit()
    return {"ok": True}


# ---- audit ------------------------------------------------------------------
@router.get("/audit")
def audit_log(limit: int = 100, user: m.User = Depends(need("audit")), db: Session = Depends(get_db)):
    rows = db.scalars(select(m.AuditLog).where(m.AuditLog.company_id == user.company_id).order_by(m.AuditLog.id.desc()).limit(min(limit, 500)))
    return [{"id": a.id, "at": iso(a.at), "user": a.user_name, "action": a.action, "entity": a.entity, "entity_id": a.entity_id, "detail": a.detail} for a in rows]
