"""Who may do what, and tenant / client isolation (enforced on the server, not by hiding menus)."""
from conftest import auth, new_waybill_body


def test_login_and_me(client):
    assert client.post("/auth/login", json={"login": "dispatch@masar.app", "password": "wrong"}).status_code == 401
    assert client.post("/auth/login", json={"login": "nobody@x", "password": "demo1234"}).status_code == 401
    r = client.post("/auth/login", json={"login": "DISPATCH@masar.app", "password": "demo1234"})  # login is case-insensitive
    assert r.status_code == 200 and r.json()["user"]["role"] == "dispatcher"
    assert "dispatch" in r.json()["user"]["perms"] and "users" not in r.json()["user"]["perms"]
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_permission_walls(client, admin, dispatcher, finance, client1, driver1):
    # dispatcher: operations yes, money and administration no
    assert client.get("/dispatch/board", headers=dispatcher).status_code == 200
    assert client.get("/billing/unverified", headers=dispatcher).status_code == 403
    assert client.get("/users", headers=dispatcher).status_code == 403
    assert client.put("/settings", json={"vat_rate": 5}, headers=dispatcher).status_code == 403
    assert client.get("/reports/revenue", headers=dispatcher).status_code == 403
    # finance: money yes, dispatch no, cannot create waybills
    assert client.get("/billing/unverified", headers=finance).status_code == 200
    assert client.get("/dispatch/board", headers=finance).status_code == 403
    assert client.post("/waybills", json={}, headers=finance).status_code == 403
    assert client.get("/reports/revenue", headers=finance).status_code == 200
    # client: own portal only
    for path in ("/dispatch/board", "/billing/unverified", "/users", "/drivers", "/vehicles", "/tariffs", "/cod", "/delivery", "/tracking/ping"):
        assert client.get(path, headers=client1).status_code in (403, 405), path
    # driver: jobs only
    for path in ("/waybills/next-number", "/senders", "/invoices", "/dashboard/../users"):
        assert client.get(path, headers=driver1).status_code in (403, 404), path
    assert client.get("/jobs", headers=driver1).status_code == 200
    # admin does everything
    assert client.get("/users", headers=admin).status_code == 200 and client.get("/audit", headers=admin).status_code == 200


def test_client_only_sees_own_waybills(client, client1, client2, dispatcher):
    mine = client.get("/waybills", params={"size": 200}, headers=client1).json()
    sender1 = client.get("/auth/me", headers=client1).json()["sender_id"]
    assert mine["total"] > 0 and {w["sender_id"] for w in mine["items"]} == {sender1}
    theirs = client.get("/waybills", params={"size": 200}, headers=client2).json()
    sender2 = client.get("/auth/me", headers=client2).json()["sender_id"]
    assert {w["sender_id"] for w in theirs["items"]} == {sender2}
    foreign = theirs["items"][0]["id"]
    assert client.get(f"/waybills/{foreign}", headers=client1).status_code == 404
    assert client.put(f"/waybills/{foreign}", json={}, headers=client1).status_code in (404, 422)
    assert client.post(f"/waybills/{foreign}/cancel", json={}, headers=client1).status_code == 404
    # filtering by another sender does not widen the scope
    only = client.get("/waybills", params={"sender_id": sender2}, headers=client1).json()
    assert {w["sender_id"] for w in only["items"]} == {sender1}
    # senders / consignees / invoices are scoped too
    assert [s["id"] for s in client.get("/senders", headers=client1).json()] == [sender1]
    assert {c["sender_id"] for c in client.get("/consignees", params={"sender_id": sender2}, headers=client1).json()} <= {sender1}
    assert all(i["sender_id"] == sender1 and i["status"] != "draft" for i in client.get("/invoices", headers=client1).json())


def test_client_creates_for_own_sender_even_if_it_asks_otherwise(client, client1, client2, dispatcher):
    sender1 = client.get("/auth/me", headers=client1).json()["sender_id"]
    sender2 = client.get("/auth/me", headers=client2).json()["sender_id"]
    body = new_waybill_body(client, client1, sender_id=sender1)
    body["sender_id"] = sender2  # tampering is ignored: the account's own sender wins
    r = client.post("/waybills", json=body, headers=client1)
    assert r.status_code == 201 and r.json()["sender_id"] == sender1
    # using another sender's consignee is refused
    foreign_cons = client.get("/consignees", params={"sender_id": sender2}, headers=dispatcher).json()[0]["id"]
    body["consignee_id"] = foreign_cons
    assert client.post("/waybills", json=body, headers=client1).json()["detail"] == "consignee_required"
    # clients post their own waybill and the dispatcher is notified
    wid = r.json()["id"]
    assert client.post(f"/waybills/{wid}/post", headers=client1).status_code == 200
    notes = client.get("/notifications", headers=dispatcher).json()
    assert any(n["kind"] == "posted" and n["title"] == r.json()["number"] for n in notes["items"])
    # but a client cannot dispatch it
    assert client.post(f"/waybills/{wid}/assign", json={"driver_id": None}, headers=client1).status_code == 403


def test_view_all_flag_limits_dispatcher_to_own_waybills(client, admin):
    r = client.post("/users", json={"role": "dispatcher", "login": "solo@masar.app", "password": "secret12", "full_name": "Solo", "view_all": False}, headers=admin)
    assert r.status_code == 201
    solo = auth(client, "solo@masar.app", "secret12")
    assert client.get("/waybills", headers=solo).json()["total"] == 0
    mine = client.post("/waybills", json=new_waybill_body(client, solo), headers=solo).json()
    got = client.get("/waybills", headers=solo).json()
    assert got["total"] == 1 and got["items"][0]["id"] == mine["id"]


def test_tenant_isolation(client, admin):
    from app.db import SessionLocal
    from app.models import City, Company, Sender, User
    from app.security import hash_password

    with SessionLocal() as db:
        co = Company(name="Other Co", name_en="Other Co")
        db.add(co)
        db.flush()
        db.add(User(company_id=co.id, role="admin", login="boss@other.app", password_hash=hash_password("secret12"), full_name="Boss"))
        s = Sender(company_id=co.id, name="Their sender")
        db.add(s)
        db.commit()
        other_sender = s.id
    boss = auth(client, "boss@other.app", "secret12")
    assert client.get("/waybills", headers=boss).json()["total"] == 0
    assert [s["name"] for s in client.get("/senders", headers=boss).json()] == ["Their sender"]
    assert client.get("/drivers", headers=boss).json() == []
    ours = client.get("/waybills", headers=admin).json()["items"][0]["id"]
    assert client.get(f"/waybills/{ours}", headers=boss).status_code == 404
    assert client.get(f"/senders/{client.get('/senders', headers=admin).json()[0]['id']}", headers=boss).status_code == 404
    # cross-company references are refused
    body = new_waybill_body(client, admin)
    body["sender_id"] = other_sender
    assert client.post("/waybills", json=body, headers=admin).json()["detail"] == "sender_required"


def test_user_management(client, admin):
    base = {"role": "dispatcher", "login": "new.user@masar.app", "password": "secret12", "full_name": "New"}
    assert client.post("/users", json={**base, "password": None}, headers=admin).json()["detail"] == "password_required"
    assert client.post("/users", json=base, headers=admin).status_code == 201
    assert client.post("/users", json=base, headers=admin).json()["detail"] == "login_taken"
    assert client.post("/users", json={**base, "login": "c@x.app", "role": "client"}, headers=admin).json()["detail"] == "sender_required"
    assert client.post("/users", json={**base, "login": "d@x.app", "role": "driver"}, headers=admin).json()["detail"] == "driver_required"
    me = client.get("/auth/me", headers=admin).json()
    assert client.put(f"/users/{me['id']}", json={**base, "login": me["login"], "role": "dispatcher"}, headers=admin).json()["detail"] == "cannot_demote_self"
    assert client.delete(f"/users/{me['id']}", headers=admin).json()["detail"] == "cannot_demote_self"
    # change password
    tok = auth(client, "new.user@masar.app", "secret12")
    assert client.post("/auth/password", json={"old": "bad", "new": "another1"}, headers=tok).json()["detail"] == "wrong_password"
    assert client.post("/auth/password", json={"old": "secret12", "new": "another1"}, headers=tok).status_code == 200
    assert client.post("/auth/login", json={"login": "new.user@masar.app", "password": "another1"}).status_code == 200
