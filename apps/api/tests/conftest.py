import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="masar-test-"))
os.environ.update({
    "DATABASE_URL": f"sqlite:///{_tmp / 'test.db'}", "UPLOAD_DIR": str(_tmp / "uploads"), "OSRM_ENABLED": "0",
    "RESOLVE_LINKS": "0", "BCRYPT_ROUNDS": "4", "JWT_SECRET": "test-secret",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed  # noqa: E402


@pytest.fixture(scope="session")
def client():
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
    with TestClient(app) as c:
        yield c


_tokens: dict[str, str] = {}


def auth(client, login: str, password: str = "demo1234") -> dict:
    if login not in _tokens:
        r = client.post("/auth/login", json={"login": login, "password": password})
        assert r.status_code == 200, r.text
        _tokens[login] = r.json()["token"]
    return {"Authorization": f"Bearer {_tokens[login]}"}


@pytest.fixture(scope="session")
def admin(client):
    return auth(client, "admin@masar.local", "admin1234")


@pytest.fixture(scope="session")
def dispatcher(client):
    return auth(client, "dispatch@masar.app")


@pytest.fixture(scope="session")
def finance(client):
    return auth(client, "finance@masar.app")


@pytest.fixture(scope="session")
def client1(client):
    return auth(client, "client@gulf.app")


@pytest.fixture(scope="session")
def client2(client):
    return auth(client, "client@amal.app")


@pytest.fixture(scope="session")
def driver1(client):
    return auth(client, "driver1@masar.app")


def new_waybill_body(client, headers, sender_id=None, **over):
    """A valid waybill payload built from real master data."""
    cons = []
    if sender_id is None:
        for s in client.get("/senders", headers=headers).json():
            cons = client.get("/consignees", params={"sender_id": s["id"], "active": True}, headers=headers).json()
            if s["status"] and cons:
                sender_id = s["id"]
                break
    else:
        cons = client.get("/consignees", params={"sender_id": sender_id, "active": True}, headers=headers).json()
    body = {
        "sender_id": sender_id, "consignee_id": cons[0]["id"], "order_no": "PO-1", "shipment_no": "SH-1", "delivery_note": "DN-1",
        "packages": [{"type": "pallet", "qty": 4, "weight": 1800, "height": 120, "width": 100, "length": 120}],
        "material": "oil", "invoice_type": "credit", "payment_mode": "shipper",
    }
    body.update(over)
    return body
