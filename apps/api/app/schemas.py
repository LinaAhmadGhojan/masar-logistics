from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from .models import (
    COLLECT_TYPES, DELIVER_TYPES, INSURANCE_TYPES, INVOICE_TYPES, MATERIALS, PAYMENT_MODES, PKG_TYPES, PRIORITIES,
    RETURN_REFS, SERVICE_TYPES, VEHICLE_KINDS,
)
from .perms import ROLES


class In(BaseModel):
    """Request bodies: trims strings and turns '' into null (web forms send empty strings)."""
    model_config = ConfigDict(str_strip_whitespace=True)

    @model_validator(mode="before")
    @classmethod
    def blank_to_none(cls, v):
        if isinstance(v, dict):
            return {k: (None if x == "" else x) for k, x in v.items()}
        return v


class LoginIn(In):
    login: str
    password: str


class PasswordIn(In):
    old: str
    new: str = Field(min_length=6)


class SettingsIn(In):
    name: str | None = Field(None, min_length=1)
    name_en: str | None = None
    currency: str | None = Field(None, max_length=8)
    vat_rate: float | None = Field(None, ge=0, le=100)
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    vat_no: str | None = None
    waybill_prefix: str | None = Field(None, min_length=1, max_length=10)
    next_seq: int | None = Field(None, ge=1)
    auto_number: bool | None = None
    number_optional: bool | None = None
    attachment_required: bool | None = None
    require_refs: bool | None = None
    pod_required: bool | None = None
    geofence_m: int | None = Field(None, ge=20, le=5000)
    distance_factor: float | None = Field(None, ge=1, le=3)
    sla_hours: int | None = Field(None, ge=1, le=720)


class UserIn(In):
    role: Literal[*ROLES]  # type: ignore[valid-type]
    login: str = Field(min_length=3)
    password: str | None = Field(None, min_length=6)
    full_name: str = Field(min_length=1)
    phone: str | None = None
    active: bool = True
    view_all: bool = True
    sender_id: int | None = None
    driver_id: int | None = None


class SenderIn(In):
    name: str = Field(min_length=1)
    contact_person: str | None = None
    mobile: str | None = None
    email: EmailStr | None = None
    city_id: int | None = None
    address: str | None = None
    gps: str | None = None
    national_address: str | None = None
    vat_no: str | None = None
    credit_limit: float = Field(0, ge=0)
    payment_terms_days: int = Field(30, ge=0, le=365)
    status: bool = True


class ConsigneeIn(In):
    sender_id: int | None = None
    name: str = Field(min_length=1)
    email: EmailStr | None = None
    phone: str | None = None
    mobile: str | None = None
    city_id: int | None = None
    address: str | None = None
    gps: str | None = None
    nad: str | None = None
    idno: str | None = None
    status: bool = True


class DriverIn(In):
    name: str = Field(min_length=1)
    mobile: str | None = None
    email: EmailStr | None = None
    doc_id: str | None = None
    license_no: str | None = None
    license_expiry: dt.date | None = None
    vehicle_id: int | None = None
    sender_ids: list[int] = []
    status: bool = True
    locked: bool = False


class VehicleIn(In):
    plate: str = Field(min_length=1)
    kind: Literal[*VEHICLE_KINDS] = "dyna"  # type: ignore[valid-type]
    capacity_kg: float = Field(0, ge=0)
    capacity_pallets: int = Field(0, ge=0)
    status: Literal["available", "on_trip", "maintenance"] = "available"
    insurance_expiry: dt.date | None = None
    registration_expiry: dt.date | None = None
    last_service: dt.date | None = None
    odometer_km: float = Field(0, ge=0)
    notes: str | None = None


class TariffIn(In):
    name: str = Field(min_length=1)
    code: str = ""
    service_type: Literal[*SERVICE_TYPES] | None = None  # type: ignore[valid-type]
    from_city_id: int | None = None
    to_city_id: int | None = None
    base: float = Field(0, ge=0)
    per_km: float = Field(0, ge=0)
    per_pallet: float = Field(0, ge=0)
    per_kg: float = Field(0, ge=0)
    min_charge: float = Field(0, ge=0)
    active: bool = True


class PackageIn(In):
    type: Literal[*PKG_TYPES]  # type: ignore[valid-type]
    qty: float = Field(0, ge=0)
    weight: float = Field(0, ge=0)
    height: float = Field(0, ge=0)
    width: float = Field(0, ge=0)
    length: float = Field(0, ge=0)


class WaybillIn(In):
    number: str | None = Field(None, max_length=30)
    date: dt.date | None = None
    sender_id: int | None = None
    consignee_id: int | None = None
    # from
    from_city_id: int | None = None
    from_address: str | None = None
    from_gps: str | None = None
    from_mobile: str | None = None
    from_email: str | None = None
    order_no: str | None = None
    shipment_no: str | None = None
    delivery_note: str | None = None
    reference_no: str | None = None
    # to
    to_name: str | None = None
    to_phone: str | None = None
    to_mobile: str | None = None
    to_email: str | None = None
    to_city_id: int | None = None
    to_address: str | None = None
    to_gps: str | None = None
    to_nad: str | None = None
    to_idno: str | None = None
    # shipment
    shipment_det: str | None = None
    remark: str | None = None
    service_type: Literal[*SERVICE_TYPES] = "domestic"  # type: ignore[valid-type]
    deliver_type: Literal[*DELIVER_TYPES] = "d2d"  # type: ignore[valid-type]
    return_refs: list[Literal[*RETURN_REFS]] = []  # type: ignore[valid-type]
    packages: list[PackageIn] = []
    material: Literal[*MATERIALS] | None = None  # type: ignore[valid-type]
    qty: float | None = Field(None, ge=0)
    weight: float | None = Field(None, ge=0)
    total_qty: float | None = Field(None, ge=0)
    est_weight: float | None = Field(None, ge=0)
    priority: Literal[*PRIORITIES] = "normal"  # type: ignore[valid-type]
    # payment
    payment_mode: Literal[*PAYMENT_MODES] | None = None  # type: ignore[valid-type]
    invoice_type: Literal[*INVOICE_TYPES] | None = None  # type: ignore[valid-type]
    insurance_type: Literal[*INSURANCE_TYPES] | None = None  # type: ignore[valid-type]
    shipment_value: float = Field(0, ge=0)
    cod_amount: float = Field(0, ge=0)
    collect_type: Literal[*COLLECT_TYPES] | None = None  # type: ignore[valid-type]
    # delivery
    driver_id: int | None = None
    distance_km: float | None = Field(None, ge=0)


class AssignIn(In):
    driver_id: int | None = None


class CancelIn(In):
    reason: str | None = None


class StepIn(In):
    stage: str
    lat: float | None = None
    lng: float | None = None
    note: str | None = None
    reason: str | None = None
    received_by: str | None = None
    receiver_mobile: str | None = None
    receiver_id: str | None = None
    otp: str | None = None
    signature: str | None = None
    photo: str | None = None
    cod_collected: bool = True


class PingIn(In):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    speed: float | None = Field(None, ge=0, le=300)


class GridRow(In):
    id: int
    delivery_status: int | None = Field(None, ge=0, le=3)
    to_gps: str | None = None
    distance_km: float | None = Field(None, ge=0)
    received_by: str | None = None
    receiver_mobile: str | None = None
    receiver_id: str | None = None
    driver_id: int | None = None


class GridIn(In):
    rows: list[GridRow]


class VerifyRow(In):
    id: int
    tariff_id: int
    distance_km: float | None = Field(None, ge=0)


class VerifyIn(In):
    rows: list[VerifyRow]


class InvoiceIn(In):
    waybill_ids: list[int] = Field(min_length=1)
    issue: bool = False


class PaymentIn(In):
    amount: float = Field(gt=0)
    method: Literal["bank", "cash", "card", "cheque"] = "bank"
    ref: str | None = None
    date: dt.date | None = None


class SettleIn(In):
    waybill_ids: list[int] = Field(min_length=1)


class ResolveIn(In):
    text: str
    ref_city_id: int | None = None


class DistanceIn(In):
    from_gps: str
    to_gps: str
