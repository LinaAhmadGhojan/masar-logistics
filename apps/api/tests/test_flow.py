"""The complete life of a waybill: create -> post -> assign -> drive -> deliver -> verify -> invoice -> pay."""
from conftest import auth, new_waybill_body


def _make(client, h, **over):
    r = client.post("/waybills", json=new_waybill_body(client, h, **over), headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def _drivers_for(client, h, sender_id):
    return client.get(f"/drivers-for/{sender_id}", headers=h).json()


def test_numbering_and_validation(client, dispatcher):
    a = _make(client, dispatcher)
    b = _make(client, dispatcher)
    assert a["number"] != b["number"] and a["number"].startswith("WB-")
    assert int(b["number"].split("-")[-1]) == int(a["number"].split("-")[-1]) + 1
    assert a["status"] == "new" and a["stage"] == "pending" and a["volume_m3"] > 0 and a["qty"] == 4 and a["weight"] == 1800

    # references are mandatory while the rule is on
    bad = new_waybill_body(client, dispatcher)
    bad.pop("order_no")
    assert client.post("/waybills", json=bad, headers=dispatcher).json()["detail"] == "refs_required"

    # manual number: allowed (optional rule is on) and must be unique
    r = client.post("/waybills", json=new_waybill_body(client, dispatcher, number="MANUAL-1"), headers=dispatcher)
    assert r.status_code == 201 and r.json()["number"] == "MANUAL-1"
    r = client.post("/waybills", json=new_waybill_body(client, dispatcher, number="MANUAL-1"), headers=dispatcher)
    assert r.json()["detail"] == "number_taken"

    # bad GPS is rejected, unknown package type too
    assert client.post("/waybills", json=new_waybill_body(client, dispatcher, to_gps="nope"), headers=dispatcher).json()["detail"] == "gps_invalid"
    assert client.post("/waybills", json=new_waybill_body(client, dispatcher, packages=[{"type": "spaceship", "qty": 1}]), headers=dispatcher).status_code == 422


def test_full_lifecycle(client, dispatcher, finance, driver1):
    me = client.get("/auth/me", headers=driver1).json()
    drv = client.get(f"/drivers/{me['driver_id']}", headers=dispatcher).json()
    sender_id = drv["sender_ids"][0]  # a sender this driver is linked to
    wb = _make(client, dispatcher, sender_id=sender_id)
    wid = wb["id"]

    # a driver linked to other senders only cannot take it
    others = [d for d in client.get("/drivers", headers=dispatcher).json() if d["sender_ids"] and sender_id not in d["sender_ids"]]
    assert client.post(f"/waybills/{wid}/assign", json={"driver_id": others[0]["id"]}, headers=dispatcher).json()["detail"] == "driver_not_linked"

    # the driver does not see unposted waybills
    assert client.get(f"/waybills/{wid}", headers=driver1).status_code == 404

    posted = client.post(f"/waybills/{wid}/post", headers=dispatcher).json()
    assert posted["status"] == "post" and posted["stage"] == "pending" and posted["otp"] and posted["promised_at"]
    assert client.post(f"/waybills/{wid}/post", headers=dispatcher).json()["detail"] == "not_new"

    assigned = client.post(f"/waybills/{wid}/assign", json={"driver_id": me["driver_id"]}, headers=dispatcher).json()
    assert assigned["stage"] == "assigned" and assigned["delivery_status"] == 1 and assigned["vehicle_no"]
    jobs = client.get("/jobs", headers=driver1).json()
    assert wid in [j["id"] for j in jobs["active"]]
    assert client.get(f"/waybills/{wid}", headers=driver1).json()["otp"] is None  # never shown to the driver

    step = lambda body: client.post(f"/jobs/{wid}/step", json=body, headers=driver1)  # noqa: E731
    assert step({"stage": "delivered", "received_by": "X", "signature": "sig"}).json()["detail"] == "bad_stage"  # no skipping ahead
    assert step({"stage": "accepted"}).json()["stage"] == "accepted"
    r = step({"stage": "picked_up"}).json()
    assert r["collect_status"] is True and r["delivery_status"] == 2
    assert step({"stage": "in_transit"}).json()["stage"] == "in_transit"
    assert step({"stage": "picked_up"}).json()["detail"] == "bad_stage"  # no going back
    assert step({"stage": "arrived"}).json()["stage"] == "arrived"

    # proof of delivery is required: receiver name + (signature | photo | correct OTP)
    assert step({"stage": "delivered"}).json()["detail"] == "receiver_required"
    assert step({"stage": "delivered", "received_by": "Ali"}).json()["detail"] == "pod_required"
    assert step({"stage": "delivered", "received_by": "Ali", "otp": "xxxx"}).json()["detail"] == "otp_invalid"
    done = step({"stage": "delivered", "received_by": "Ali", "otp": posted["otp"]}).json()
    assert done["status"] == "delivered" and done["delivery_status"] == 3 and done["delivered_at"] and done["received_by"] == "Ali"
    assert [e["type"] for e in done["events"]][:3] == ["created", "posted", "assigned"] and done["events"][-1]["type"] == "delivered"

    # billing: delivered -> verified (tariff gives the price) -> invoiced -> paid
    queue = client.get("/billing/unverified", headers=finance).json()
    row = next(r for r in queue if r["id"] == wid)
    assert row["suggested_tariff_id"] and row["suggested_charge"] > 0
    assert client.post("/billing/verify", json={"rows": [{"id": wid, "tariff_id": 99999}]}, headers=finance).json()["detail"] == "tariff_invalid"
    assert client.post("/billing/verify", json={"rows": [{"id": wid, "tariff_id": row["suggested_tariff_id"]}]}, headers=finance).json() == {"verified": 1}
    v = client.get(f"/waybills/{wid}", headers=finance).json()
    assert v["status"] == "verified" and v["service_charge"] == row["suggested_charge"] and v["vat_amount"] == round(v["service_charge"] * 0.15, 2)

    invs = client.post("/invoices", json={"waybill_ids": [wid], "issue": True}, headers=finance).json()
    inv = invs[0]
    assert inv["status"] == "issued" and inv["subtotal"] == v["service_charge"] and inv["total"] == round(v["service_charge"] + v["vat_amount"], 2)
    assert client.get(f"/waybills/{wid}", headers=finance).json()["status"] == "invoiced"
    assert client.post("/invoices", json={"waybill_ids": [wid]}, headers=finance).json()["detail"] == "not_verified"

    half = round(inv["total"] / 2, 2)
    p = client.post(f"/invoices/{inv['id']}/pay", json={"amount": half}, headers=finance).json()
    assert p["status"] == "partial" and p["paid"] == half
    assert client.post(f"/invoices/{inv['id']}/pay", json={"amount": inv["total"]}, headers=finance).json()["detail"] == "amount_invalid"
    p = client.post(f"/invoices/{inv['id']}/pay", json={"amount": round(inv["total"] - half, 2)}, headers=finance).json()
    assert p["status"] == "paid" and p["balance"] == 0
    assert client.post(f"/invoices/{inv['id']}/void", headers=finance).json()["detail"] == "cannot_void"


def test_void_invoice_returns_waybills_to_verified(client, dispatcher, finance, driver1):
    me = client.get("/auth/me", headers=driver1).json()
    sender_id = client.get(f"/drivers/{me['driver_id']}", headers=dispatcher).json()["sender_ids"][0]
    wid = _make(client, dispatcher, sender_id=sender_id, driver_id=me["driver_id"])["id"]
    otp = client.post(f"/waybills/{wid}/post", headers=dispatcher).json()["otp"]
    for st in ("accepted", "picked_up", "in_transit", "arrived"):
        client.post(f"/jobs/{wid}/step", json={"stage": st}, headers=driver1)
    client.post(f"/jobs/{wid}/step", json={"stage": "delivered", "received_by": "Z", "otp": otp}, headers=driver1)
    t = client.get("/tariffs", headers=finance).json()[0]["id"]
    client.post("/billing/verify", json={"rows": [{"id": wid, "tariff_id": t, "distance_km": 100}]}, headers=finance)
    assert client.get(f"/waybills/{wid}", headers=finance).json()["distance_km"] == 100
    inv = client.post("/invoices", json={"waybill_ids": [wid]}, headers=finance).json()[0]
    assert inv["status"] == "draft"
    assert client.post(f"/invoices/{inv['id']}/void", headers=finance).json()["status"] == "void"
    assert client.get(f"/waybills/{wid}", headers=finance).json()["status"] == "verified"
    # it can be invoiced again
    assert client.post("/invoices", json={"waybill_ids": [wid]}, headers=finance).status_code == 201


def test_cancel_edit_delete_rules(client, dispatcher, client1):
    wb = _make(client, dispatcher)
    wid = wb["id"]
    upd = new_waybill_body(client, dispatcher, sender_id=wb["sender_id"], remark="changed")
    assert client.put(f"/waybills/{wid}", json=upd, headers=dispatcher).status_code == 200
    posted = client.post(f"/waybills/{wid}/post", headers=dispatcher)
    assert posted.status_code == 200
    assert client.delete(f"/waybills/{wid}", headers=dispatcher).json()["detail"] == "waybill_locked"  # posted: cancel instead
    c = client.post(f"/waybills/{wid}/cancel", json={"reason": "wrong address"}, headers=dispatcher).json()
    assert c["status"] == "cancelled" and c["events"][-1]["text"] == "wrong address"
    assert client.post(f"/waybills/{wid}/cancel", json={}, headers=dispatcher).json()["detail"] == "cannot_cancel"
    gone = _make(client, dispatcher)["id"]
    assert client.delete(f"/waybills/{gone}", headers=dispatcher).status_code == 204
    assert client.get(f"/waybills/{gone}", headers=dispatcher).status_code == 404


def test_duplicate_and_comment(client, dispatcher):
    wb = _make(client, dispatcher)
    cp = client.post(f"/waybills/{wb['id']}/duplicate", headers=dispatcher).json()
    assert cp["id"] != wb["id"] and cp["number"] != wb["number"] and cp["status"] == "new" and cp["packages"] == wb["packages"]
    assert client.post(f"/waybills/{wb['id']}/comment", json={"reason": "call the site first"}, headers=dispatcher).status_code == 200
    assert client.get(f"/waybills/{wb['id']}", headers=dispatcher).json()["events"][-1]["type"] == "comment"


def test_attachments_and_required_rule(client, dispatcher, admin):
    wb = _make(client, dispatcher)
    wid = wb["id"]
    client.put("/settings", json={"attachment_required": True}, headers=admin)
    try:
        assert client.post(f"/waybills/{wid}/post", headers=dispatcher).json()["detail"] == "attachment_required"
        bad = client.post(f"/waybills/{wid}/attachments", files={"file": ("virus.exe", b"x")}, data={"kind": "from"}, headers=dispatcher)
        assert bad.json()["detail"] == "file_type"
        ok = client.post(f"/waybills/{wid}/attachments", files={"file": ("po.pdf", b"%PDF-1.4 hello")}, data={"kind": "from"}, headers=dispatcher)
        assert ok.status_code == 201 and ok.json()["url"].startswith("/uploads/waybills/")
        assert client.get(ok.json()["url"]).content == b"%PDF-1.4 hello"
        again = client.post(f"/waybills/{wid}/attachments", files={"file": ("po2.pdf", b"2")}, data={"kind": "from"}, headers=dispatcher).json()
        det = client.get(f"/waybills/{wid}", headers=dispatcher).json()
        assert [a["id"] for a in det["attachments"]] == [again["id"]]  # the 'from' document is replaced, not duplicated
        assert client.post(f"/waybills/{wid}/post", headers=dispatcher).status_code == 200
    finally:
        client.put("/settings", json={"attachment_required": False}, headers=admin)


def test_cod_collect_and_settle(client, dispatcher, finance, driver1):
    me = client.get("/auth/me", headers=driver1).json()
    sender_id = client.get(f"/drivers/{me['driver_id']}", headers=dispatcher).json()["sender_ids"][0]
    wid = _make(client, dispatcher, sender_id=sender_id, driver_id=me["driver_id"], invoice_type="cod", cod_amount=750)["id"]
    otp = client.post(f"/waybills/{wid}/post", headers=dispatcher).json()["otp"]
    for st in ("accepted", "picked_up", "in_transit", "arrived"):
        client.post(f"/jobs/{wid}/step", json={"stage": st}, headers=driver1)
    d = client.post(f"/jobs/{wid}/step", json={"stage": "delivered", "received_by": "Z", "otp": otp, "cod_collected": True}, headers=driver1).json()
    assert d["cod_collected"] is True and d["cod_settled"] is False
    cod = client.get("/cod", headers=finance).json()
    assert any(i["id"] == wid for g in cod["groups"] for i in g["items"]) and cod["total"] >= 750
    assert client.post("/cod/settle", json={"waybill_ids": [wid]}, headers=finance).json() == {"settled": 1}
    assert client.post("/cod/settle", json={"waybill_ids": [wid]}, headers=finance).json()["detail"] == "nothing_to_settle"
    assert not any(i["id"] == wid for g in client.get("/cod", headers=finance).json()["groups"] for i in g["items"])


def test_failed_delivery_goes_back_to_dispatch(client, dispatcher, driver1):
    me = client.get("/auth/me", headers=driver1).json()
    sender_id = client.get(f"/drivers/{me['driver_id']}", headers=dispatcher).json()["sender_ids"][0]
    wid = _make(client, dispatcher, sender_id=sender_id, driver_id=me["driver_id"])["id"]
    client.post(f"/waybills/{wid}/post", headers=dispatcher)
    for st in ("accepted", "picked_up", "in_transit"):
        client.post(f"/jobs/{wid}/step", json={"stage": st}, headers=driver1)
    assert client.post(f"/jobs/{wid}/step", json={"stage": "failed"}, headers=driver1).json()["detail"] == "reason_required"
    f = client.post(f"/jobs/{wid}/step", json={"stage": "failed", "reason": "Site closed"}, headers=driver1).json()
    assert f["stage"] == "failed" and f["attempts"] == 1 and f["delivery_status"] == 1
    # dispatcher reassigns; the driver can start again from 'accepted'
    assert client.post(f"/waybills/{wid}/assign", json={"driver_id": me["driver_id"]}, headers=dispatcher).json()["stage"] == "assigned"
    assert client.post(f"/jobs/{wid}/step", json={"stage": "accepted"}, headers=driver1).json()["stage"] == "accepted"


def test_delivery_grid_bulk_update(client, dispatcher):
    rows = client.get("/delivery", params={"delivery_status": 0}, headers=dispatcher).json()
    assert rows, "seed has posted-but-pending waybills"
    target = rows[0]
    r = client.post("/delivery/update", json={"rows": [{"id": target["id"], "distance_km": 321.5, "to_gps": "24.5,46.5", "received_by": "Grid"}]}, headers=dispatcher)
    assert r.json() == {"updated": 1}
    got = client.get(f"/waybills/{target['id']}", headers=dispatcher).json()
    assert got["distance_km"] == 321.5 and got["to_gps"] == "24.5,46.5" and got["received_by"] == "Grid"
    assert client.post("/delivery/update", json={"rows": [{"id": target["id"], "to_gps": "garbage"}]}, headers=dispatcher).json()["detail"] == "gps_invalid"
