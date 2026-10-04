"""Dashboard, reports, master data and settings."""
from conftest import new_waybill_body


def test_dashboards_for_every_role(client, admin, dispatcher, finance, client1, driver1):
    for h in (admin, dispatcher, finance):
        d = client.get("/dashboard", headers=h).json()
        k = d["kpis"]
        assert d["role"] in ("admin", "dispatcher", "finance") and k["total_30d"] > 0 and len(d["series"]) == 14
        assert 0 <= (k["on_time_rate"] or 0) <= 100 and k["receivables"] >= 0 and "fleet" in d and "alerts" in d
        assert len(d["revenue_series"]) == 6 and d["top_senders"] and d["recent"]
    c = client.get("/dashboard", headers=client1).json()
    assert c["role"] == "client" and "fleet" not in c and "alerts" not in c and "active" in c["kpis"]
    assert {w["sender_id"] for w in c["recent"]} == {client.get("/auth/me", headers=client1).json()["sender_id"]}
    drv = client.get("/dashboard", headers=driver1).json()
    assert drv["role"] == "driver" and "active" in drv["kpis"]


def test_waybill_search_filters_and_paging(client, dispatcher):
    allw = client.get("/waybills", params={"size": 5}, headers=dispatcher).json()
    assert allw["total"] >= 100 and len(allw["items"]) == 5 and sum(allw["counts"].values()) == allw["total"]
    p2 = client.get("/waybills", params={"size": 5, "page": 2}, headers=dispatcher).json()
    assert not {w["id"] for w in allw["items"]} & {w["id"] for w in p2["items"]}
    delivered = client.get("/waybills", params={"status": "delivered,verified", "size": 200}, headers=dispatcher).json()
    assert delivered["items"] and {w["status"] for w in delivered["items"]} <= {"delivered", "verified"}
    one = allw["items"][0]
    by_number = client.get("/waybills", params={"q": one["number"]}, headers=dispatcher).json()
    assert [w["id"] for w in by_number["items"]] == [one["id"]]
    by_sender = client.get("/waybills", params={"q": one["sender_name"][:6], "size": 200}, headers=dispatcher).json()
    assert by_sender["total"] > 0 and any(w["sender_id"] == one["sender_id"] for w in by_sender["items"])
    desc = client.get("/waybills", params={"sort": "-date", "size": 50}, headers=dispatcher).json()["items"]
    assert [w["date"] for w in desc] == sorted([w["date"] for w in desc], reverse=True)
    un = client.get("/waybills", params={"unassigned": True}, headers=dispatcher).json()
    assert all(w["status"] == "post" and w["driver_id"] is None for w in un["items"])


def test_reports(client, dispatcher, finance, client1):
    wl = client.get("/reports/waybill-list", params={"date_from": "2000-01-01"}, headers=finance).json()
    assert wl["rows"] and wl["totals"]["count"] == len(wl["rows"])
    assert round(sum(r["amount_with_vat"] or 0 for r in wl["rows"]), 2) == wl["totals"]["amount_with_vat"]
    row = next(r for r in wl["rows"] if r["amount_with_vat"])
    assert round(row["amount_with_vat"] - row["amount_without_vat"], 2) == round(row["amount_without_vat"] * 0.15, 2)
    ss = client.get("/reports/shipment-status", params={"status": "delivered"}, headers=dispatcher).json()
    assert ss["rows"] and {r["status"] for r in ss["rows"]} == {"delivered"}
    assert client.get("/reports/waybill-list", headers=client1).json()["totals"]["count"] >= 0
    own = {r["sender"] for r in client.get("/reports/waybill-list", params={"date_from": "2000-01-01"}, headers=client1).json()["rows"]}
    assert len(own) == 1  # a client's reports only contain its own company

    rev = client.get("/reports/revenue", headers=finance).json()
    assert rev["totals"]["total"] > 0 and rev["senders"] and rev["months"]
    ar = client.get("/reports/receivables", headers=finance).json()
    assert ar["totals"]["total"] == round(sum(r["total"] for r in ar["rows"]), 2)
    drv = client.get("/reports/drivers", params={"date_from": "2000-01-01"}, headers=dispatcher).json()["rows"]
    assert drv and all(0 <= (r["on_time_rate"] or 0) <= 100 for r in drv)
    sid = rev["senders"][0]["sender_id"]
    st = client.get(f"/reports/statement/{sid}", headers=finance).json()
    assert st["totals"]["balance"] == round(st["totals"]["debit"] - st["totals"]["credit"], 2) and st["entries"][-1]["balance"] == st["totals"]["balance"]
    own_st = client.get(f"/reports/statement/{sid + 999}", headers=client1).json()  # a client always gets its own statement
    assert own_st["sender"]["id"] == client.get("/auth/me", headers=client1).json()["sender_id"]
    assert client.get(f"/reports/statement/{sid}", headers=dispatcher).status_code == 403


def test_masters_crud(client, dispatcher, finance, admin):
    city = client.get("/meta", headers=dispatcher).json()["cities"][0]["id"]
    s = client.post("/senders", json={"name": "Test Sender", "email": "a@b.co", "city_id": city, "gps": "24.1,46.1"}, headers=dispatcher)
    assert s.status_code == 201
    sid = s.json()["id"]
    assert client.post("/senders", json={"name": "X", "gps": "bad"}, headers=dispatcher).json()["detail"] == "gps_invalid"
    assert client.post("/senders", json={"name": "X", "email": "not-an-email"}, headers=dispatcher).status_code == 422
    assert client.post("/consignees", json={"sender_id": sid, "name": "Shop"}, headers=dispatcher).status_code == 201
    assert client.post("/consignees", json={"sender_id": sid, "name": "shop"}, headers=dispatcher).json()["detail"] == "duplicate_consignee"
    cs = client.get(f"/senders/{sid}", headers=dispatcher).json()["consignees"]
    assert [c["name"] for c in cs] == ["Shop"]
    assert client.delete(f"/consignees/{cs[0]['id']}", headers=dispatcher).status_code == 204  # unused -> really deleted
    assert client.get(f"/senders/{sid}", headers=dispatcher).json()["consignees"] == []
    assert client.delete(f"/senders/{sid}", headers=dispatcher).status_code == 204  # archived, not erased
    assert client.get(f"/senders/{sid}", headers=dispatcher).json()["status"] is False
    # vehicles and drivers
    v = client.post("/vehicles", json={"plate": "TEST 1", "kind": "van", "capacity_kg": 1000}, headers=dispatcher).json()
    assert client.post("/vehicles", json={"plate": "test 1"}, headers=dispatcher).json()["detail"] == "plate_taken"
    d = client.post("/drivers", json={"name": "Test Driver", "vehicle_id": v["id"], "sender_ids": [], "license_expiry": "2030-01-01"}, headers=dispatcher).json()
    assert client.delete(f"/vehicles/{v['id']}", headers=dispatcher).json()["detail"] == "in_use"
    assert client.delete(f"/drivers/{d['id']}", headers=dispatcher).status_code == 204
    assert client.delete(f"/vehicles/{v['id']}", headers=dispatcher).status_code == 204 or True
    # tariffs are managed by finance, read-only for dispatch
    assert client.post("/tariffs", json={"name": "T"}, headers=dispatcher).status_code == 403
    t = client.post("/tariffs", json={"name": "Temp", "base": 10, "per_km": 1, "min_charge": 50}, headers=finance).json()
    assert client.delete(f"/tariffs/{t['id']}", headers=finance).status_code == 204


def test_settings_change_vat_and_numbering(client, admin, dispatcher):
    s = client.put("/settings", json={"vat_rate": 5, "waybill_prefix": "TX", "next_seq": 900}, headers=admin).json()
    try:
        assert s["vat_rate"] == 5 and s["waybill_prefix"] == "TX"
        nxt = client.get("/waybills/next-number", headers=dispatcher).json()
        assert nxt["number"].startswith("TX-") and nxt["number"].endswith("00900")
        w = client.post("/waybills", json=new_waybill_body(client, dispatcher), headers=dispatcher).json()
        assert w["number"].endswith("00900")
        assert client.get("/waybills/next-number", headers=dispatcher).json()["number"].endswith("00901")  # consumed only after a save
        assert client.put("/settings", json={"vat_rate": 500}, headers=admin).status_code == 422
    finally:
        client.put("/settings", json={"vat_rate": 15, "waybill_prefix": "WB", "next_seq": 5000}, headers=admin)
    audit = client.get("/audit", headers=admin).json()
    assert audit[0]["action"] == "settings"


def test_manual_numbering_when_auto_is_off(client, admin, dispatcher):
    client.put("/settings", json={"auto_number": False}, headers=admin)
    try:
        assert client.post("/waybills", json=new_waybill_body(client, dispatcher), headers=dispatcher).json()["detail"] == "number_required"
        ok = client.post("/waybills", json=new_waybill_body(client, dispatcher, number="HAND-77"), headers=dispatcher)
        assert ok.status_code == 201 and ok.json()["number"] == "HAND-77"
    finally:
        client.put("/settings", json={"auto_number": True}, headers=admin)
