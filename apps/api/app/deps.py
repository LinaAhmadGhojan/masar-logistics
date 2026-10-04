from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import Company, User
from .perms import perms_of
from .security import read_token

bearer = HTTPBearer(auto_error=False)


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    uid = read_token(cred.credentials) if cred else None
    user = db.get(User, uid) if uid else None
    if not user or not user.active:
        raise HTTPException(401, "unauthorized")
    return user


def current_company(user: User = Depends(current_user), db: Session = Depends(get_db)) -> Company:
    return db.get(Company, user.company_id)  # type: ignore[return-value]


def need(*perms: str):
    """Dependency: the caller must hold at least one of the given permissions."""

    def dep(user: User = Depends(current_user)) -> User:
        mine = set(perms_of(user.role))
        if not mine.intersection(perms):
            raise HTTPException(403, "forbidden")
        return user

    return dep
