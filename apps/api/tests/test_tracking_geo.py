"""Live tracking, geofence, public tracking page and the GPS helpers."""
import pytest

from app import geo
from conftest import new_waybill_body

RIYADH = (24.7136, 46.6753)


def _live_job(client, dispatcher, driver1, to_gps):
    me = client.get("/auth/me", headers=driver1).json()
    sender_id = client.get(f"/drivers/{me['driver_id']}", headers=dispatcher).json()["sender_ids"][0]
    body = new_waybill_body(client, dispatcher, sender_id=sender_id, driver_id=me["driver_id"], to_gps=to_gps, from_gps="24.7000,46.6000",
                            to_mobile="0501234567")
    w = client.post("/waybills", json=body, headers=dispatcher).json()
    posted = client.post(f"/waybills/{w['id']}/post", headers=dispatcher).json()
    client.post(f"/jobs/{w['id']}/step", json={"stage": "accepted"}, headers=driver1)
    client.post(f"/jobs/{w['id']}/step", json={"stage": "picked_up"}, headers=driver1)
    return w["id"], posted


def test_ping_moves_truck_then_geofence_arrives_and_notifies(client, dispatcher, driver1, client1):
    wid, posted = _live_job(client, dispatcher, driver1, "24.5000,46.8000")
    # far from the origin -> in transit
    r = client.post("/tracking/ping", json={"lat": 24.60, "lng": 46.70, "speed": 80}, headers=driver1).json()
    assert wid in r["active"] and r["near"] == []
    det = client.get(f"/waybills/{wid}", headers=dispatcher).json()
    assert det["stage"] == "in_transit" and det["driver_position"]["lat"] == 24.60 and det["driver_position"]["eta_min"] > 0
    live = client.get("/tracking/live", headers=dispatcher).json()
    assert wid in [w["id"] for w in live["waybills"]] and live["drivers"]
    # within the geofence of the destination -> arrived, event + notification to the sender's users and dispatchers
    r = client.post("/tracking/ping", json={"lat": 24.5001, "lng": 46.8001, "speed": 20}, headers=driver1).json()
    assert r["near"] == [wid]
    det = client.get(f"/waybills/{wid}", headers=dispatcher).json()
    assert det["stage"] == "arrived" and "near_destination" in [e["type"] for e in det["events"]]
    assert client.post("/tracking/ping", json={"lat": 24.5001, "lng": 46.8001}, headers=driver1).json()["near"] == []  # only once
    assert any(n["kind"] == "near" and n["title"] == det["number"] for n in client.get("/notifications", headers=dispatcher).json()["items"])
    trail = client.get(f"/tracking/waybill/{wid}/trail", headers=dispatcher).json()
    assert len(trail) >= 2
    assert client.post("/tracking/ping", json={"lat": 999, "lng": 0}, headers=driver1).status_code == 422
    assert client.post("/tracking/offline", headers=driver1).status_code == 200


def test_public_tracking(client, dispatcher, driver1):
    wid, posted = _live_job(client, dispatcher, driver1, "24.5000,46.8000")
    num = posted["number"]
    assert client.get("/public/track", params={"number": num, "code": "0000"}).status_code == 404  # wrong code
    assert client.get("/public/track", params={"number": "WB-NOPE", "code": "4567"}).status_code == 404
    ok = client.get("/public/track", params={"number": num.lower(), "code": "4567"})  # last 4 digits of 0501234567
    assert ok.status_code == 200
    data = ok.json()
    assert data["stage"] == "picked_up" and data["to_city"] and "otp" not in data and "driver_mobile" not in data
    assert [e["type"] for e in data["timeline"]][:2] == ["created", "posted"]
    assert client.get("/public/track", params={"number": num, "code": posted["otp"]}).status_code == 200  # the OTP works as well
    # a waybill that is still 'new' is not publicly visible
    draft = client.post("/waybills", json=new_waybill_body(client, dispatcher, to_mobile="0509998888"), headers=dispatcher).json()
    assert client.get("/public/track", params={"number": draft["number"], "code": "8888"}).status_code == 404


def test_geo_resolve_and_distance_endpoints(client, dispatcher):
    assert client.post("/geo/resolve", json={"text": "24.7136, 46.6753"}, headers=dispatcher).json()["gps"] == "24.713600,46.675300"
    url = "https://www.google.com/maps/place/X/@24.71,46.67,17z/data=!3m1!4b1!4m6!3d24.7140!4d46.6760"
    assert client.post("/geo/resolve", json={"text": url}, headers=dispatcher).json()["gps"] == "24.714000,46.676000"
    assert client.post("/geo/resolve", json={"text": "hello"}, headers=dispatcher).json()["detail"] == "gps_unresolved"
    d = client.post("/geo/distance", json={"from_gps": "24.7136,46.6753", "to_gps": "21.4858,39.1925"}, headers=dispatcher).json()
    assert d["source"] == "estimate" and 900 < d["distance_km"] < 1100  # Riyadh -> Jeddah ~ 950 km by road
    assert client.post("/geo/distance", json={"from_gps": "x", "to_gps": "y"}, headers=dispatcher).json()["detail"] == "gps_invalid"


def test_haversine_and_parse():
    assert geo.haversine_km(RIYADH, RIYADH) == 0
    assert 840 < geo.haversine_km(RIYADH, (21.4858, 39.1925)) < 860
    assert geo.parse_gps("24.5, 46.5") == (24.5, 46.5) and geo.parse_gps("91,10") is None and geo.parse_gps("x") is None and geo.parse_gps("") is None


@pytest.mark.parametrize("text,expected", [
    ("33.3157,35.1264", (33.3157, 35.1264)),
    ("https://maps.google.com/?q=24.5,46.5", (24.5, 46.5)),
    ("https://www.google.com/maps/@24.6,46.7,15z", (24.6, 46.7)),
    ("https://www.google.com/maps/search/25.427431,+55.536296", (25.427431, 55.536296)),
])
def test_resolve_formats(text, expected):
    got = geo.resolve_location(text)
    assert got and (got["lat"], got["lng"]) == pytest.approx(expected, abs=1e-5)


def test_plus_codes():
    full = geo.olc_decode("8FVC9G8F+6W")  # the reference example of the Open Location Code spec (Zurich)
    assert full == pytest.approx((47.365562, 8.524813), abs=1e-4)
    short = geo.olc_recover("9G8F+6W", 47.4, 8.6)
    assert short == pytest.approx(full, abs=1e-4)
    got = geo.resolve_location("https://www.google.com/maps/place/9G8F%2B6W+Zurich", ref=(47.4, 8.6))
    assert got and (got["lat"], got["lng"]) == pytest.approx(full, abs=1e-4)
    assert geo.resolve_location("9G8F+6W") is None  # a short code needs a reference city
    assert geo.olc_encode(*full)[:8] == "8FVC9G8F"
