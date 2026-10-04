"""Sample data: a lubricant-and-goods carrier in Saudi Arabia with ~100 waybills over the last 60 days.

Deterministic (seeded RNG). Dates are relative to 'today', so the dashboard always looks alive.
"""
import random
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import geo
from . import models as m
from .clock import local_today, now
from .security import hash_password
from .services import (
    compute_charge, normalize_packages, package_totals, r2, suggest_tariff, _sync_status,
)

PASSWORD = "demo1234"

CITIES = [  # name_ar, name_en, country, lat, lng
    ("الرياض", "Riyadh", "SA", 24.7136, 46.6753), ("جدة", "Jeddah", "SA", 21.4858, 39.1925),
    ("الدمام", "Dammam", "SA", 26.4207, 50.0888), ("مكة المكرمة", "Makkah", "SA", 21.3891, 39.8579),
    ("المدينة المنورة", "Madinah", "SA", 24.5247, 39.5692), ("الطائف", "Taif", "SA", 21.2703, 40.4158),
    ("بريدة", "Buraydah", "SA", 26.3260, 43.9750), ("أبها", "Abha", "SA", 18.2164, 42.5053),
    ("خميس مشيط", "Khamis Mushait", "SA", 18.3093, 42.7289), ("تبوك", "Tabuk", "SA", 28.3838, 36.5550),
    ("الجبيل", "Jubail", "SA", 27.0046, 49.6460), ("الخبر", "Al Khobar", "SA", 26.2172, 50.1971),
    ("ينبع", "Yanbu", "SA", 24.0895, 38.0618), ("حائل", "Hail", "SA", 27.5114, 41.7208),
    ("جازان", "Jazan", "SA", 16.8892, 42.5511), ("دبي", "Dubai", "AE", 25.2048, 55.2708),
    ("عمّان", "Amman", "JO", 31.9454, 35.9284), ("المنامة", "Manama", "BH", 26.2285, 50.5860),
    ("مدينة الكويت", "Kuwait City", "KW", 29.3759, 47.9774), ("القاهرة", "Cairo", "EG", 30.0444, 31.2357),
]

SENDERS = [  # name, contact, city, street, vat
    ("شركة الخليج للزيوت", "م. فهد العتيبي", "Riyadh", "المدينة الصناعية الثانية", "300112233400003"),
    ("مصنع الأمل للشحوم", "سلمان الدوسري", "Dammam", "المنطقة الصناعية الأولى", "300445566700003"),
    ("مؤسسة النخبة لقطع الغيار", "عبدالله القحطاني", "Jeddah", "شارع الصناعة، حي الخمرة", "300778899100003"),
    ("شركة الواحة للأغذية", "نورة الشهري", "Riyadh", "طريق الخرج، المستودعات", "300223344500003"),
    ("مجموعة التقنية للإلكترونيات", "ماجد الحربي", "Jeddah", "حي الفيصلية، مجمع الأعمال", "300556677800003"),
    ("مصنع الراسية للكيماويات", "خالد البقمي", "Jubail", "المدينة الصناعية بالجبيل", "300889900200003"),
]

CONSIGNEE_NAMES = [
    "ورشة الفرسان للصيانة", "محطة النور للخدمة", "مركز السرعة لتغيير الزيوت", "شركة الطريق الذهبي", "مستودعات الشرق",
    "ورشة الإتقان", "مؤسسة البناء الحديث", "سوبر ماركت الوفاء", "مركز الصفوة التجاري", "مصنع الجزيرة", "ورشة الحرمين",
    "شركة المسار الأخضر", "مخازن التميز", "مركز الرياض للصيانة", "محطة الواحة", "مؤسسة الأفق للتجارة", "ورشة الأمانة",
    "شركة الركن الأمين", "مستودع الخليج الأزرق", "مركز النخيل", "ورشة الصقور", "شركة الجسر الدولي", "معرض الوفاق", "مصنع الندى",
]

PEOPLE = ["أحمد", "محمد", "عبدالله", "خالد", "سعد", "فهد", "ناصر", "ياسر", "بندر", "سلطان", "تركي", "ماجد"]
FAMILIES = ["العتيبي", "الدوسري", "القحطاني", "الشهري", "الحربي", "الغامدي", "المطيري", "الزهراني", "العنزي", "البقمي"]

DRIVERS = [  # name, plate, kind, capacity_kg, pallets
    ("سعيد المالكي", "أ ب ج 1234", "lorry", 12000, 18), ("حسن الزهراني", "د هـ و 5821", "dyna", 5000, 8),
    ("علي الغامدي", "ز ح ط 3390", "trailer", 24000, 28), ("يوسف الشمري", "ك ل م 7745", "dyna", 5000, 8),
    ("إبراهيم العسيري", "ن س ع 2216", "van", 1500, 3), ("طارق الحارثي", "ف ص ق 9087", "pickup", 1000, 2),
    ("وليد السبيعي", "ر ش ت 4412", "lorry", 12000, 18), ("عمر باوزير", "ث خ ذ 6603", "dyna", 5000, 8),
]

MATERIAL_PKGS = {
    "oil": [("drum", 200, 88, 58, 58), ("pallet", 450, 120, 100, 120), ("gallon_20", 20, 40, 30, 30)],
    "grease": [("pallet", 500, 120, 100, 120), ("box", 25, 40, 40, 60)],
    "transmission_fluid": [("pallet", 420, 120, 100, 120), ("drum", 200, 88, 58, 58)],
    "brake_fluid": [("box", 12, 30, 30, 40), ("pallet", 300, 120, 100, 110)],
    "mix": [("pallet", 450, 120, 100, 120), ("drum", 200, 88, 58, 58), ("box", 20, 40, 40, 60)],
    "spare_parts": [("box", 22, 40, 40, 60), ("pallet", 380, 120, 100, 110)],
    "food": [("pallet", 520, 120, 100, 150), ("box", 15, 40, 40, 50)],
    "electronics": [("box", 9, 45, 35, 60)],
    "chemicals": [("drum", 210, 88, 58, 58), ("pallet", 480, 120, 100, 120)],
    "furniture": [("pallet", 300, 140, 100, 160)],
    "documents": [("box", 3, 30, 25, 35)],
}
SENDER_MATERIALS = [["oil", "mix", "transmission_fluid", "brake_fluid"], ["grease", "oil", "mix"], ["spare_parts", "mix"],
                    ["food"], ["electronics"], ["chemicals", "oil"]]

SIGNATURE = ("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='110' viewBox='0 0 300 110'>"
             "<path d='M12 70 C40 10 70 100 100 50 S150 20 170 60 S230 95 288 30' fill='none' stroke='%23102a43' stroke-width='3' stroke-linecap='round'/></svg>")


def _jitter(rnd, lat, lng, spread=0.06):
    return geo.fmt_gps(lat + rnd.uniform(-spread, spread), lng + rnd.uniform(-spread, spread))


def seed(db: Session, rnd_seed: int = 7) -> dict:
    rnd = random.Random(rnd_seed)
    today = local_today()
    t_now = now()
    pw = hash_password(PASSWORD)

    c = m.Company(name="مسار للنقل واللوجستيات", name_en="Masar Logistics", currency="SAR", vat_rate=15.0, phone="+966 11 555 0100",
                  email="ops@masar.example", address="الرياض، طريق الملك فهد", vat_no="300999888700003", waybill_prefix="WB",
                  auto_number=True, number_optional=True, attachment_required=False, require_refs=True, pod_required=True,
                  geofence_m=250, sla_hours=48)
    db.add(c)
    db.flush()

    cities = {}
    for ar, en, country, lat, lng in CITIES:
        city = m.City(name_ar=ar, name_en=en, country=country, lat=lat, lng=lng)
        db.add(city)
        cities[en] = city
    db.flush()
    domestic_ids = [city.id for en, city in cities.items() if city.country == "SA"]

    # ---- senders & consignees
    senders, consignees = [], {}
    for i, (name, contact, city_en, street, vat) in enumerate(SENDERS):
        city = cities[city_en]
        s = m.Sender(company_id=c.id, name=name, contact_person=contact, mobile=f"05{rnd.randint(10000000, 99999999)}",
                     email=f"orders{i + 1}@{['gulf', 'amal', 'nokhba', 'waha', 'tech', 'rasia'][i]}.example", city_id=city.id,
                     address=f"{city.name_ar}، {street}", gps=_jitter(rnd, city.lat, city.lng, 0.03), national_address=f"RUH{rnd.randint(1000, 9999)}",
                     vat_no=vat, credit_limit=[250000, 150000, 120000, 200000, 180000, 160000][i], payment_terms_days=[30, 45, 30, 30, 15, 60][i])
        db.add(s)
        senders.append(s)
    db.flush()
    names = CONSIGNEE_NAMES[:]
    rnd.shuffle(names)
    for s in senders:
        consignees[s.id] = []
        for _ in range(5):
            if rnd.random() < 0.12:
                city = rnd.choice([cities[k] for k in ("Dubai", "Amman", "Manama", "Kuwait City")])
            else:
                city = rnd.choice([cities[en] for en, ci in cities.items() if ci.country == "SA"])
            n = names.pop() if names else f"عميل {rnd.randint(100, 999)}"
            person = f"{rnd.choice(PEOPLE)} {rnd.choice(FAMILIES)}"
            con = m.Consignee(company_id=c.id, sender_id=s.id, name=n, email=f"info{rnd.randint(10, 99)}@client.example",
                              phone=f"011{rnd.randint(2000000, 9999999)}", mobile=f"05{rnd.randint(10000000, 99999999)}", city_id=city.id,
                              address=f"{city.name_ar}، حي {rnd.choice(['الروضة', 'النزهة', 'العليا', 'الصفا', 'الفيصلية', 'المروج', 'الملقا'])}",
                              gps=_jitter(rnd, city.lat, city.lng), nad=f"{city.name_en[:3].upper()}{rnd.randint(1000, 9999)}",
                              idno=str(rnd.randint(1000000000, 2999999999)))
            con.person = person  # type: ignore[attr-defined]  (only used for the receiver name)
            db.add(con)
            consignees[s.id].append(con)
    db.flush()

    # ---- vehicles & drivers
    vehicles, drivers = [], []
    for i, (dname, plate, kind, cap, pal) in enumerate(DRIVERS):
        v = m.Vehicle(company_id=c.id, plate=plate, kind=kind, capacity_kg=cap, capacity_pallets=pal, status="available",
                      insurance_expiry=today + timedelta(days=rnd.choice([12, 45, 90, 160, 220, 300])),
                      registration_expiry=today + timedelta(days=rnd.choice([25, 60, 120, 200, 330])),
                      last_service=today - timedelta(days=rnd.randint(10, 120)), odometer_km=rnd.randint(40000, 380000))
        db.add(v)
        vehicles.append(v)
    db.flush()
    linked = {0: [senders[0].id, senders[1].id], 1: [], 2: [senders[0].id, senders[5].id], 3: [], 4: [senders[4].id, senders[2].id],
              5: [senders[2].id, senders[3].id], 6: [], 7: [senders[3].id]}
    for i, (dname, *_rest) in enumerate(DRIVERS):
        d = m.Driver(company_id=c.id, name=dname, mobile=f"05{rnd.randint(10000000, 99999999)}", email=f"driver{i + 1}@masar.app",
                     doc_id=str(rnd.randint(1000000000, 2999999999)), license_no=f"L{rnd.randint(100000, 999999)}",
                     license_expiry=today + timedelta(days=rnd.choice([18, 90, 200, 365, 500])), vehicle_id=vehicles[i].id,
                     sender_ids=linked[i], rating=round(rnd.uniform(4.2, 5.0), 1))
        db.add(d)
        drivers.append(d)
    vehicles[7].status = "maintenance"
    vehicles[7].notes = "Brake service"
    db.flush()

    # ---- users
    def user(role, login, name, **kw):
        u = m.User(company_id=c.id, role=role, login=login, password_hash=pw, full_name=name, phone=f"05{rnd.randint(10000000, 99999999)}", **kw)
        db.add(u)
        return u

    admin = user("admin", "admin@masar.local", "مدير النظام")
    admin.password_hash = hash_password("admin1234")
    dispatcher = user("dispatcher", "dispatch@masar.app", "ريم المنسّقة")
    finance = user("finance", "finance@masar.app", "هشام المحاسب")
    client1 = user("client", "client@gulf.app", "فهد العتيبي", sender_id=senders[0].id)
    client2 = user("client", "client@amal.app", "سلمان الدوسري", sender_id=senders[1].id)
    driver_users = [user("driver", f"driver{i + 1}@masar.app", d.name, driver_id=d.id) for i, d in enumerate(drivers[:4])]
    db.flush()

    # ---- tariffs
    T = lambda **kw: db.add(m.Tariff(company_id=c.id, **kw))  # noqa: E731
    T(name="Domestic standard", code="DOM", service_type="domestic", base=90, per_km=1.35, per_pallet=22, per_kg=0.0, min_charge=160)
    T(name="Riyadh → Jeddah", code="RUH-JED", service_type="domestic", from_city_id=cities["Riyadh"].id, to_city_id=cities["Jeddah"].id,
      base=380, per_km=0.0, per_pallet=45, per_kg=0.0, min_charge=420)
    T(name="Riyadh → Dammam", code="RUH-DMM", service_type="domestic", from_city_id=cities["Riyadh"].id, to_city_id=cities["Dammam"].id,
      base=260, per_km=0.0, per_pallet=38, per_kg=0.0, min_charge=300)
    T(name="International road freight", code="INT", service_type="international", base=520, per_km=1.9, per_pallet=60, per_kg=0.05, min_charge=900)
    T(name="Light cargo by weight", code="KG", service_type="domestic", base=60, per_km=0.9, per_pallet=0, per_kg=0.08, min_charge=110)
    db.flush()
    tariffs = list(db.scalars(select(m.Tariff)))

    # ---- waybills
    plans_by_age = lambda age: (  # noqa: E731
        rnd.choices(["invoiced", "verified", "delivered", "cancelled"], [70, 12, 12, 6])[0] if age >= 14 else
        rnd.choices(["invoiced", "verified", "delivered", "cancelled", "failed"], [28, 24, 38, 5, 5])[0] if age >= 5 else
        rnd.choices(["delivered", "in_transit", "picked_up", "assigned", "unassigned", "new", "cancelled"], [38, 16, 8, 14, 9, 11, 4])[0] if age >= 1 else
        rnd.choices(["delivered", "in_transit", "picked_up", "assigned", "unassigned", "new"], [10, 24, 12, 24, 14, 16])[0]
    )

    def allowed(s_id):
        return [d for d in drivers if not d.sender_ids or s_id in d.sender_ids]

    seq = 0
    waybills: list[m.Waybill] = []
    ages = sorted([int(abs(rnd.gauss(0, 24))) % 61 for _ in range(96)] + [0] * 10 + [1] * 6, reverse=True)
    for age in ages:
        seq += 1
        s_idx = rnd.choices(range(len(senders)), [26, 18, 16, 14, 14, 12])[0]
        s = senders[s_idx]
        con = rnd.choice(consignees[s.id])
        d0 = today - timedelta(days=age)
        plan = plans_by_age(age)
        material = rnd.choice(SENDER_MATERIALS[s_idx])
        pk = []
        for typ, wt, h, wd, ln in rnd.sample(MATERIAL_PKGS[material], k=min(len(MATERIAL_PKGS[material]), rnd.choice([1, 1, 2]))):
            q = rnd.randint(1, 12) if typ in ("pallet",) else rnd.randint(2, 24)
            pk.append({"type": typ, "qty": q, "weight": q * wt, "height": h, "width": wd, "length": ln})
        pk = normalize_packages(pk)
        tot = package_totals(pk)
        from_c, to_c = cities_by_id(db, s.city_id), cities_by_id(db, con.city_id)
        service = "international" if to_c.country != "SA" else "domestic"
        a, b = geo.parse_gps(s.gps), geo.parse_gps(con.gps)
        dist = r2(geo.haversine_km(a, b) * 1.3)
        urgent = rnd.random() < 0.12
        inv_type = rnd.choices(["credit", "cod", "pp", "foc"], [60, 20, 12, 8])[0]
        creator = client1 if s.id == senders[0].id and rnd.random() < 0.5 else client2 if s.id == senders[1].id and rnd.random() < 0.5 else dispatcher
        created = datetime.combine(d0, datetime.min.time()) + timedelta(hours=rnd.randint(5, 14), minutes=rnd.randint(0, 59))
        if age == 0:
            created = t_now - timedelta(hours=rnd.uniform(1.5, 9))
        w = m.Waybill(
            company_id=c.id, number=f"WB-{d0.year}-{seq:05d}", date=d0, sender_id=s.id, consignee_id=con.id,
            from_city_id=s.city_id, from_address=s.address, from_gps=s.gps, from_mobile=s.mobile, from_email=s.email,
            order_no=f"PO-{rnd.randint(40000, 99999)}", shipment_no=f"SH-{rnd.randint(10000, 99999)}", delivery_note=f"DN-{rnd.randint(10000, 99999)}",
            to_name=con.name, to_phone=con.phone, to_mobile=con.mobile, to_email=con.email, to_city_id=con.city_id, to_address=con.address,
            to_gps=con.gps, to_nad=con.nad, to_idno=con.idno, shipment_det=rnd.choice([None, None, "Deliver during working hours", "Call before arrival", "Fragile - handle with care", "Needs forklift at site"]),
            service_type=service, deliver_type=rnd.choice(["d2d", "d2d", "d2h", "h2d"]), return_refs=rnd.sample(["wb", "dn", "st", "sg"], k=rnd.randint(0, 2)),
            packages=pk, material=material, qty=tot["qty"], weight=tot["weight"], total_qty=tot["qty"], est_weight=tot["weight"], volume_m3=tot["volume_m3"],
            priority="urgent" if urgent else "normal", payment_mode=rnd.choice(["shipper", "shipper", "recipient", "3rd_party"]), invoice_type=inv_type,
            insurance_type=rnd.choice(["none", "none", "pp_cod"]), shipment_value=r2(rnd.randint(3, 90) * 500),
            cod_amount=r2(rnd.randint(4, 60) * 100) if inv_type == "cod" else 0, collect_type=rnd.choice(["driver", "driver", "supervisor"]),
            distance_km=dist, duration_min=round(dist), created_by=creator.id, updated_by=creator.id, created_at=created, updated_at=created,
        )
        db.add(w)
        db.flush()
        _history(db, rnd, c, w, plan, creator, dispatcher, finance, allowed(s.id), tariffs, t_now, created, from_c, to_c)
        waybills.append(w)
    c.next_seq = seq + 1
    db.flush()

    # ---- invoices from the 'invoiced' waybills (one per sender per ISO week)
    groups: dict[tuple, list[m.Waybill]] = {}
    for w in waybills:
        if w.status == "invoiced":
            wk = (w.delivered_at or created).isocalendar()
            groups.setdefault((w.sender_id, wk[0], wk[1]), []).append(w)
    inv_seq = 0
    for (sid, _y, _wk), group in sorted(groups.items(), key=lambda kv: max(x.delivered_at for x in kv[1])):
        inv_seq += 1
        sender = next(s for s in senders if s.id == sid)
        issue = min(max(x.delivered_at.date() for x in group) + timedelta(days=2), today)
        age = (today - issue).days
        status = "paid" if age > 38 and rnd.random() < 0.85 else "partial" if age > 20 and rnd.random() < 0.5 else "issued"
        if age <= 2 and rnd.random() < 0.5:
            status = "draft"
        inv = m.Invoice(company_id=c.id, number=f"INV-{issue.year}-{inv_seq:05d}", sender_id=sid, issue_date=issue,
                        due_date=issue + timedelta(days=sender.payment_terms_days), status=status, created_by=finance.id)
        db.add(inv)
        db.flush()
        sub = vat = 0.0
        for w in group:
            fc, tc = cities_by_id(db, w.from_city_id), cities_by_id(db, w.to_city_id)
            db.add(m.InvoiceLine(invoice_id=inv.id, waybill_id=w.id, description=f"{w.number} · {fc.name_en} → {tc.name_en}", qty=1,
                                 unit_price=w.service_charge, amount=w.service_charge, vat=w.vat_amount))
            sub += w.service_charge
            vat += w.vat_amount
            w.invoice_id = inv.id
        inv.subtotal, inv.vat, inv.total = r2(sub), r2(vat), r2(sub + vat)
        if status in ("paid", "partial"):
            amount = inv.total if status == "paid" else r2(inv.total * rnd.choice([0.4, 0.5, 0.6]))
            db.add(m.Payment(invoice_id=inv.id, date=min(issue + timedelta(days=rnd.randint(5, 28)), today), amount=amount,
                             method=rnd.choice(["bank", "bank", "cheque", "card"]), ref=f"TRX{rnd.randint(100000, 999999)}", created_by=finance.id))
            inv.paid = amount
    c.next_invoice_seq = inv_seq + 1

    # ---- notifications (a few per role so the bell is not empty)
    def note(u, kind, title, body, link, mins):
        db.add(m.Notification(company_id=c.id, user_id=u.id, kind=kind, title=title, body=body, link=link, at=t_now - timedelta(minutes=mins), seen=mins > 600))

    recent = [w for w in waybills if w.stage == "delivered"][-3:]
    for k, w in enumerate(recent):
        note(dispatcher, "delivered", w.number, w.received_by, f"/app/waybill?id={w.id}", 40 + k * 55)
        note(client1, "delivered", w.number, w.received_by, f"/app/waybill?id={w.id}", 70 + k * 80)
    for w in [x for x in waybills if x.stage == "assigned"][:3]:
        for du in driver_users:
            if du.driver_id == w.driver_id:
                note(du, "assigned", w.number, w.to_name, f"/app/job?id={w.id}", 25)
    db.add(m.AuditLog(company_id=c.id, user_id=admin.id, user_name=admin.full_name, action="settings", entity="company", entity_id=c.id, at=t_now - timedelta(days=3)))
    db.commit()
    return {"company_id": c.id, "waybills": len(waybills), "invoices": inv_seq, "password": PASSWORD}


_city_cache: dict[int, m.City] = {}


def cities_by_id(db: Session, cid: int) -> m.City:
    if cid not in _city_cache:
        _city_cache[cid] = db.get(m.City, cid)  # type: ignore[assignment]
    return _city_cache[cid]


def _history(db, rnd, c, w, plan, creator, dispatcher, finance, pool, tariffs, t_now, created, from_c, to_c):
    """Writes the timeline of one waybill and sets its final state according to the plan."""
    ev = lambda type, at, actor=None, text=None, lat=None, lng=None: db.add(  # noqa: E731
        m.WaybillEvent(waybill_id=w.id, type=type, text=text, at=at, actor_id=actor.id if actor else None,
                       actor_name=actor.full_name if actor else None, lat=lat, lng=lng))
    ev("created", created, creator)
    if plan == "new":
        return
    if plan == "cancelled":
        w.status, w.stage = "cancelled", "pending"
        w.otp = None
        ev("posted", created + timedelta(minutes=40), creator)
        ev("cancelled", created + timedelta(hours=3), creator, "Customer request")
        return

    t = created + timedelta(minutes=rnd.randint(25, 100))
    ev("posted", t, creator)
    w.status, w.otp = "post", f"{rnd.randint(0, 9999):04d}"
    w.promised_at = t + timedelta(hours=24 if w.priority == "urgent" else c.sla_hours)
    w.stage = "pending"
    if plan == "unassigned":
        _sync_status(w)
        return

    d = rnd.choice(pool)
    w.driver_id, w.vehicle_id = d.id, d.vehicle_id
    veh = db.get(m.Vehicle, d.vehicle_id)
    w.vehicle_no = veh.plate if veh else None
    t += timedelta(minutes=6)
    ev("assigned", t, dispatcher, d.name)
    w.stage = "assigned"
    goal = {"assigned": "assigned", "picked_up": "picked_up", "in_transit": "in_transit", "delivered": "delivered",
            "invoiced": "delivered", "verified": "delivered", "failed": "in_transit"}[plan]
    steps = [("accepted", rnd.uniform(0.3, 1.5)), ("picked_up", rnd.uniform(1, 3)), ("in_transit", 0.3),
             ("arrived", max(w.distance_km / rnd.uniform(48, 70), 0.5)), ("delivered", rnd.uniform(0.2, 0.6))]
    if plan in ("delivered", "verified", "invoiced") and rnd.random() < 0.14:
        steps[3] = ("arrived", steps[3][1] + c.sla_hours)  # a late delivery
    times = {}
    for name, hours in ([] if goal == "assigned" else steps):
        t += timedelta(hours=hours)
        if t > t_now - timedelta(minutes=4):
            break
        times[name] = t
        ev(name, t)
        w.stage = name
        if name == "picked_up":
            w.collect_status, w.collected_at = True, t
        if name == goal:
            break
    if plan == "failed" and w.stage in ("picked_up", "in_transit", "arrived"):
        w.stage, w.failure_reason, w.attempts = "failed", "Consignee unreachable", 1
        ev("failed", t + timedelta(minutes=20), None, w.failure_reason)
        w.stage = "assigned"  # re-assigned and waiting for a second attempt
        ev("assigned", t + timedelta(hours=1), dispatcher, d.name)
    _sync_status(w)

    if w.stage == "delivered":
        w.delivered_at = times["delivered"]
        w.status = "delivered"
        who = f"{rnd.choice(PEOPLE)} {rnd.choice(FAMILIES)}"
        w.received_by, w.receiver_mobile = who, f"05{rnd.randint(10000000, 99999999)}"
        w.pod_signature = SIGNATURE if rnd.random() < 0.6 else None
        if w.cod_amount > 0:
            w.cod_collected = True
            w.cod_settled = (t_now - w.delivered_at).days > 4
            ev("cod_collected", w.delivered_at, None, f"{w.cod_amount:g}")
        db.query(m.WaybillEvent).filter(m.WaybillEvent.waybill_id == w.id, m.WaybillEvent.type == "delivered").update({"text": who})
        if plan in ("verified", "invoiced"):
            tf = suggest_tariff(db, c.id, w) or tariffs[0]
            totals = package_totals(normalize_packages(w.packages))
            charge = compute_charge(tf, w.distance_km, totals["pallets"], w.weight)
            w.tariff_id, w.service_charge, w.vat_amount = tf.id, charge, r2(charge * c.vat_rate / 100)
            w.status = "verified"
            ev("verified", w.delivered_at + timedelta(hours=rnd.randint(4, 30)), finance, f"{tf.name} · {charge:g}")
            if plan == "invoiced":
                w.status = "invoiced"
        return
    if w.stage in ("picked_up", "in_transit", "arrived") and veh:
        veh.status = "on_trip"
        o, dest = geo.parse_gps(w.from_gps), geo.parse_gps(w.to_gps)
        frac = rnd.uniform(0.15, 0.85)
        lat, lng = o[0] + (dest[0] - o[0]) * frac, o[1] + (dest[1] - o[1]) * frac
        d.online, d.last_lat, d.last_lng, d.last_speed, d.last_seen = True, lat, lng, round(rnd.uniform(55, 95), 1), t_now - timedelta(seconds=rnd.randint(5, 90))
        for k in range(1, 9):  # a short trail behind the truck
            f = max(frac - 0.02 * (9 - k), 0.02)
            db.add(m.Ping(driver_id=d.id, waybill_id=w.id, lat=o[0] + (dest[0] - o[0]) * f, lng=o[1] + (dest[1] - o[1]) * f,
                          speed=round(rnd.uniform(50, 95), 1), at=t_now - timedelta(minutes=(9 - k) * 6)))
