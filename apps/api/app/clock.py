import os
from datetime import date, datetime, timedelta, timezone

TZ_OFFSET = int(os.getenv("TZ_OFFSET", "3"))


def now() -> datetime:
    """Naive UTC 'now' (all DateTime columns are naive UTC)."""
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


def local_today() -> date:
    """'Today' for the business, shifted by TZ_OFFSET hours."""
    return (now() + timedelta(hours=TZ_OFFSET)).date()


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat(timespec="seconds") + "Z" if dt else None


def iso_date(d: date | None) -> str | None:
    return d.isoformat() if d else None
