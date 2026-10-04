"""Exports the seeded database to JSON for the in-browser (local) mode of the web app / APK.

    python scripts/export_local_seed.py            # writes ../web/src/lib/local/seed.json

Run it against a freshly seeded database. Dates are shifted to 'today' by the app when it loads.
"""
import json
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app import models as m  # noqa: E402
from app.db import SessionLocal  # noqa: E402

TABLES = {
    "companies": m.Company, "cities": m.City, "senders": m.Sender, "consignees": m.Consignee, "vehicles": m.Vehicle, "drivers": m.Driver,
    "users": m.User, "tariffs": m.Tariff, "waybills": m.Waybill, "events": m.WaybillEvent, "invoices": m.Invoice, "invoice_lines": m.InvoiceLine,
    "payments": m.Payment, "pings": m.Ping, "notifications": m.Notification, "audit": m.AuditLog,
}
SKIP = {"password_hash"}


def cell(v):
    if isinstance(v, datetime):
        return v.isoformat(timespec="seconds")
    if isinstance(v, date):
        return v.isoformat()
    return v


def main():
    out = {"generated_at": datetime.utcnow().isoformat(timespec="seconds")}
    with SessionLocal() as db:
        for name, model in TABLES.items():
            cols = [c.key for c in model.__table__.columns if c.key not in SKIP]
            out[name] = [{c: cell(getattr(r, c)) for c in cols} for r in db.scalars(select(model))]
    target = Path(__file__).resolve().parents[2] / "web" / "src" / "lib" / "local" / "seed.json"
    target.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{target}  {target.stat().st_size // 1024} KB  waybills={len(out['waybills'])}")


if __name__ == "__main__":
    main()
