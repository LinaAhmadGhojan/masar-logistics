from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .clock import now
from .db import Base

# ---- vocabularies (the web app translates the keys) -------------------------
SERVICE_TYPES = ("domestic", "international")
DELIVER_TYPES = ("d2d", "d2h", "h2d", "h2h")
PAYMENT_MODES = ("shipper", "recipient", "3rd_party")
INVOICE_TYPES = ("credit", "cod", "foc", "pp")
INSURANCE_TYPES = ("none", "pp_cod")
COLLECT_TYPES = ("driver", "supervisor")
RETURN_REFS = ("wb", "dn", "st", "sg", "rr", "ot")
PKG_TYPES = ("pallet", "box", "drum", "gallon", "gallon_15", "gallon_20", "gallon_25", "ftl", "container", "lorry", "dyna", "others")
MATERIALS = ("grease", "oil", "transmission_fluid", "brake_fluid", "mix", "spare_parts", "food", "electronics", "chemicals", "furniture", "documents")
VEHICLE_KINDS = ("pickup", "van", "dyna", "lorry", "trailer")
PRIORITIES = ("normal", "urgent")
STATUSES = ("new", "post", "delivered", "verified", "invoiced", "cancelled")
STAGES = ("pending", "assigned", "accepted", "picked_up", "in_transit", "arrived", "delivered", "failed")
DELIVERY_STATUS = {"pending": 0, "assigned": 1, "accepted": 1, "failed": 1, "picked_up": 2, "in_transit": 2, "arrived": 2, "delivered": 3}


class Company(Base):
    __tablename__ = "companies"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120), default="")
    currency: Mapped[str] = mapped_column(String(8), default="SAR")
    vat_rate: Mapped[float] = mapped_column(Float, default=15.0)
    phone: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(120))
    address: Mapped[str | None] = mapped_column(String(200))
    vat_no: Mapped[str | None] = mapped_column(String(40))
    # rules (the "system rules" of the original module)
    waybill_prefix: Mapped[str] = mapped_column(String(10), default="WB")
    next_seq: Mapped[int] = mapped_column(Integer, default=1)
    auto_number: Mapped[bool] = mapped_column(Boolean, default=True)
    number_optional: Mapped[bool] = mapped_column(Boolean, default=False)
    attachment_required: Mapped[bool] = mapped_column(Boolean, default=False)
    require_refs: Mapped[bool] = mapped_column(Boolean, default=True)
    pod_required: Mapped[bool] = mapped_column(Boolean, default=True)
    geofence_m: Mapped[int] = mapped_column(Integer, default=250)
    distance_factor: Mapped[float] = mapped_column(Float, default=1.3)
    sla_hours: Mapped[int] = mapped_column(Integer, default=48)
    next_invoice_seq: Mapped[int] = mapped_column(Integer, default=1)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    role: Mapped[str] = mapped_column(String(20))
    login: Mapped[str] = mapped_column(String(120), unique=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    full_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(40))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    view_all: Mapped[bool] = mapped_column(Boolean, default=True)  # the "view all waybills" permission
    sender_id: Mapped[int | None] = mapped_column(ForeignKey("senders.id"))
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    last_login: Mapped[datetime | None] = mapped_column(DateTime)


class City(Base):
    __tablename__ = "cities"
    id: Mapped[int] = mapped_column(primary_key=True)
    name_ar: Mapped[str] = mapped_column(String(80))
    name_en: Mapped[str] = mapped_column(String(80))
    country: Mapped[str] = mapped_column(String(2), default="SA")
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)


class Sender(Base):
    """The shipper/client company (`logistics_users` in the original module)."""
    __tablename__ = "senders"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    contact_person: Mapped[str | None] = mapped_column(String(150))
    mobile: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(120))
    city_id: Mapped[int | None] = mapped_column(ForeignKey("cities.id"))
    address: Mapped[str | None] = mapped_column(String(200))
    gps: Mapped[str | None] = mapped_column(String(60))
    national_address: Mapped[str | None] = mapped_column(String(150))
    vat_no: Mapped[str | None] = mapped_column(String(40))
    credit_limit: Mapped[float] = mapped_column(Float, default=0)
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=30)
    status: Mapped[bool] = mapped_column(Boolean, default=True)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_by: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Consignee(Base):
    __tablename__ = "consignees"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("senders.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(40))
    mobile: Mapped[str | None] = mapped_column(String(40))
    city_id: Mapped[int | None] = mapped_column(ForeignKey("cities.id"))
    address: Mapped[str | None] = mapped_column(String(200))
    gps: Mapped[str | None] = mapped_column(String(60))
    nad: Mapped[str | None] = mapped_column(String(20))
    idno: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_by: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Vehicle(Base):
    __tablename__ = "vehicles"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    plate: Mapped[str] = mapped_column(String(30))
    kind: Mapped[str] = mapped_column(String(20), default="dyna")
    capacity_kg: Mapped[float] = mapped_column(Float, default=0)
    capacity_pallets: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="available")  # available | on_trip | maintenance
    insurance_expiry: Mapped[date | None] = mapped_column(Date)
    registration_expiry: Mapped[date | None] = mapped_column(Date)
    last_service: Mapped[date | None] = mapped_column(Date)
    odometer_km: Mapped[float] = mapped_column(Float, default=0)
    notes: Mapped[str | None] = mapped_column(String(300))


class Driver(Base):
    __tablename__ = "drivers"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    mobile: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(120))
    doc_id: Mapped[str | None] = mapped_column(String(40))
    license_no: Mapped[str | None] = mapped_column(String(40))
    license_expiry: Mapped[date | None] = mapped_column(Date)
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id"))
    sender_ids: Mapped[list] = mapped_column(JSON, default=list)  # empty = serves every sender
    status: Mapped[bool] = mapped_column(Boolean, default=True)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    rating: Mapped[float] = mapped_column(Float, default=5.0)
    online: Mapped[bool] = mapped_column(Boolean, default=False)
    last_lat: Mapped[float | None] = mapped_column(Float)
    last_lng: Mapped[float | None] = mapped_column(Float)
    last_speed: Mapped[float | None] = mapped_column(Float)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime)
    updated_by: Mapped[int | None] = mapped_column(Integer)


class Tariff(Base):
    """A billable service (the original picks a catalog 'product' when verifying)."""
    __tablename__ = "tariffs"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    code: Mapped[str] = mapped_column(String(30), default="")
    service_type: Mapped[str | None] = mapped_column(String(20))
    from_city_id: Mapped[int | None] = mapped_column(ForeignKey("cities.id"))
    to_city_id: Mapped[int | None] = mapped_column(ForeignKey("cities.id"))
    base: Mapped[float] = mapped_column(Float, default=0)
    per_km: Mapped[float] = mapped_column(Float, default=0)
    per_pallet: Mapped[float] = mapped_column(Float, default=0)
    per_kg: Mapped[float] = mapped_column(Float, default=0)
    min_charge: Mapped[float] = mapped_column(Float, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Waybill(Base):
    __tablename__ = "waybills"
    __table_args__ = (UniqueConstraint("company_id", "number", name="uq_waybill_number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    number: Mapped[str] = mapped_column(String(30))
    date: Mapped[date] = mapped_column(Date)
    sender_id: Mapped[int] = mapped_column(ForeignKey("senders.id"), index=True)
    consignee_id: Mapped[int | None] = mapped_column(ForeignKey("consignees.id"))

    # from
    from_city_id: Mapped[int | None] = mapped_column(ForeignKey("cities.id"))
    from_address: Mapped[str | None] = mapped_column(String(200))
    from_gps: Mapped[str | None] = mapped_column(String(60))
    from_mobile: Mapped[str | None] = mapped_column(String(40))
    from_email: Mapped[str | None] = mapped_column(String(120))
    order_no: Mapped[str | None] = mapped_column(String(150))
    shipment_no: Mapped[str | None] = mapped_column(String(150))
    delivery_note: Mapped[str | None] = mapped_column(String(150))
    reference_no: Mapped[str | None] = mapped_column(String(60))

    # to
    to_name: Mapped[str | None] = mapped_column(String(200))
    to_phone: Mapped[str | None] = mapped_column(String(40))
    to_mobile: Mapped[str | None] = mapped_column(String(40))
    to_email: Mapped[str | None] = mapped_column(String(120))
    to_city_id: Mapped[int | None] = mapped_column(ForeignKey("cities.id"))
    to_address: Mapped[str | None] = mapped_column(String(200))
    to_gps: Mapped[str | None] = mapped_column(String(60))
    to_nad: Mapped[str | None] = mapped_column(String(20))
    to_idno: Mapped[str | None] = mapped_column(String(40))

    # shipment
    shipment_det: Mapped[str | None] = mapped_column(Text)  # delivery instructions
    remark: Mapped[str | None] = mapped_column(Text)
    service_type: Mapped[str] = mapped_column(String(20), default="domestic")
    deliver_type: Mapped[str] = mapped_column(String(10), default="d2d")
    return_refs: Mapped[list] = mapped_column(JSON, default=list)
    packages: Mapped[list] = mapped_column(JSON, default=list)
    material: Mapped[str | None] = mapped_column(String(30))
    qty: Mapped[float] = mapped_column(Float, default=0)
    weight: Mapped[float] = mapped_column(Float, default=0)
    total_qty: Mapped[float] = mapped_column(Float, default=0)
    est_weight: Mapped[float] = mapped_column(Float, default=0)
    volume_m3: Mapped[float] = mapped_column(Float, default=0)
    priority: Mapped[str] = mapped_column(String(10), default="normal")
    promised_at: Mapped[datetime | None] = mapped_column(DateTime)

    # payment
    payment_mode: Mapped[str | None] = mapped_column(String(20))
    invoice_type: Mapped[str | None] = mapped_column(String(10))
    insurance_type: Mapped[str | None] = mapped_column(String(10))
    service_charge: Mapped[float] = mapped_column(Float, default=0)
    shipment_value: Mapped[float] = mapped_column(Float, default=0)
    vat_amount: Mapped[float] = mapped_column(Float, default=0)
    cod_amount: Mapped[float] = mapped_column(Float, default=0)
    cod_collected: Mapped[bool] = mapped_column(Boolean, default=False)
    cod_settled: Mapped[bool] = mapped_column(Boolean, default=False)

    # collection
    collect_type: Mapped[str | None] = mapped_column(String(15))
    collect_status: Mapped[bool] = mapped_column(Boolean, default=False)
    collected_at: Mapped[datetime | None] = mapped_column(DateTime)

    # delivery
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), index=True)
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id"))
    vehicle_no: Mapped[str | None] = mapped_column(String(30))
    distance_km: Mapped[float] = mapped_column(Float, default=0)
    duration_min: Mapped[float] = mapped_column(Float, default=0)
    stage: Mapped[str] = mapped_column(String(15), default="pending")
    delivery_status: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(12), default="new", index=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime)
    received_by: Mapped[str | None] = mapped_column(String(100))
    receiver_mobile: Mapped[str | None] = mapped_column(String(40))
    receiver_id: Mapped[str | None] = mapped_column(String(40))
    otp: Mapped[str | None] = mapped_column(String(8))
    pod_signature: Mapped[str | None] = mapped_column(Text)
    pod_photo: Mapped[str | None] = mapped_column(Text)
    pod_note: Mapped[str | None] = mapped_column(String(300))
    failure_reason: Mapped[str | None] = mapped_column(String(200))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    near_notified: Mapped[bool] = mapped_column(Boolean, default=False)

    # billing
    tariff_id: Mapped[int | None] = mapped_column(ForeignKey("tariffs.id"))
    invoice_id: Mapped[int | None] = mapped_column(ForeignKey("invoices.id"))

    created_by: Mapped[int | None] = mapped_column(Integer)
    updated_by: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    events: Mapped[list["WaybillEvent"]] = relationship(back_populates="waybill", cascade="all, delete-orphan", order_by="WaybillEvent.id")
    attachments: Mapped[list["Attachment"]] = relationship(back_populates="waybill", cascade="all, delete-orphan")


class WaybillEvent(Base):
    __tablename__ = "waybill_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    waybill_id: Mapped[int] = mapped_column(ForeignKey("waybills.id"), index=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=now)
    type: Mapped[str] = mapped_column(String(30))
    text: Mapped[str | None] = mapped_column(String(300))
    actor_id: Mapped[int | None] = mapped_column(Integer)
    actor_name: Mapped[str | None] = mapped_column(String(120))
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    waybill: Mapped[Waybill] = relationship(back_populates="events")


class Attachment(Base):
    __tablename__ = "attachments"
    id: Mapped[int] = mapped_column(primary_key=True)
    waybill_id: Mapped[int] = mapped_column(ForeignKey("waybills.id"), index=True)
    kind: Mapped[str] = mapped_column(String(10), default="policy")  # from | policy
    filename: Mapped[str] = mapped_column(String(200))
    path: Mapped[str] = mapped_column(String(300))
    size: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_by: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    waybill: Mapped[Waybill] = relationship(back_populates="attachments")


class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    number: Mapped[str] = mapped_column(String(30))
    sender_id: Mapped[int] = mapped_column(ForeignKey("senders.id"), index=True)
    issue_date: Mapped[date] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), default="draft")  # draft | issued | partial | paid | void
    subtotal: Mapped[float] = mapped_column(Float, default=0)
    vat: Mapped[float] = mapped_column(Float, default=0)
    total: Mapped[float] = mapped_column(Float, default=0)
    paid: Mapped[float] = mapped_column(Float, default=0)
    note: Mapped[str | None] = mapped_column(String(300))
    created_by: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    lines: Mapped[list["InvoiceLine"]] = relationship(back_populates="invoice", cascade="all, delete-orphan")
    payments: Mapped[list["Payment"]] = relationship(back_populates="invoice", cascade="all, delete-orphan")


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    waybill_id: Mapped[int | None] = mapped_column(ForeignKey("waybills.id"))
    description: Mapped[str] = mapped_column(String(300))
    qty: Mapped[float] = mapped_column(Float, default=1)
    unit_price: Mapped[float] = mapped_column(Float, default=0)
    amount: Mapped[float] = mapped_column(Float, default=0)
    vat: Mapped[float] = mapped_column(Float, default=0)
    invoice: Mapped[Invoice] = relationship(back_populates="lines")


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    amount: Mapped[float] = mapped_column(Float)
    method: Mapped[str] = mapped_column(String(20), default="bank")
    ref: Mapped[str | None] = mapped_column(String(80))
    created_by: Mapped[int | None] = mapped_column(Integer)
    invoice: Mapped[Invoice] = relationship(back_populates="payments")


class Ping(Base):
    __tablename__ = "pings"
    id: Mapped[int] = mapped_column(primary_key=True)
    driver_id: Mapped[int] = mapped_column(ForeignKey("drivers.id"), index=True)
    waybill_id: Mapped[int | None] = mapped_column(ForeignKey("waybills.id"), index=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    speed: Mapped[float | None] = mapped_column(Float)
    at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str | None] = mapped_column(String(300))
    link: Mapped[str | None] = mapped_column(String(120))
    seen: Mapped[bool] = mapped_column(Boolean, default=False)
    at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=now)
    user_id: Mapped[int | None] = mapped_column(Integer)
    user_name: Mapped[str | None] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(40))
    entity: Mapped[str | None] = mapped_column(String(40))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    detail: Mapped[str | None] = mapped_column(String(300))
