"""Fill the database with sample data.   python scripts/seed_data.py [--reset]

Logins (password demo1234):  dispatch@masar.app · finance@masar.app · client@gulf.app · client@amal.app · driver1@masar.app
Owner:  admin@masar.local / admin1234
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.models import User  # noqa: E402
from app.seed import seed  # noqa: E402

if __name__ == "__main__":
    if "--reset" in sys.argv:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)):
            sys.exit("Database already has data. Use --reset to wipe it first.")
        print(seed(db))
