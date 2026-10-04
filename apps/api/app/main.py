import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from .db import Base, SessionLocal, engine
from .models import Company, User
from .routers import billing, core, insights, masters, ops, waybills
from .security import hash_password


def seed_admin():
    """First run: one company with its owner account (credentials from env)."""
    login = os.getenv("ADMIN_LOGIN", "admin@masar.local")
    password = os.getenv("ADMIN_PASSWORD", "admin1234")
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)):
            return
        company = Company(name="شركتي للنقل", name_en="My Logistics Co.")
        db.add(company)
        db.flush()
        db.add(User(company_id=company.id, role="admin", login=login, password_hash=hash_password(password), full_name="Owner"))
        db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    seed_admin()
    yield


app = FastAPI(title="Masar Logistics API", version="1.0.0", lifespan=lifespan,
              description="Waybills, dispatch, live tracking, billing and reports for a transport company.")

# Capacitor (Android) serves the app from https://localhost; browsers use the web origin.
origins = os.getenv("CORS_ORIGINS", "http://localhost:3020,http://localhost:3000,https://localhost,capacitor://localhost,http://localhost").split(",")
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])

for r in (core.router, masters.router, waybills.router, ops.router, billing.router, insights.router):
    app.include_router(r)

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/health")
def health():
    return {"ok": True}
