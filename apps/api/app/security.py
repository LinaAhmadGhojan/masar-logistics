import os
import time

import bcrypt
import jwt

SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
ALGO = "HS256"
ROUNDS = int(os.getenv("BCRYPT_ROUNDS", "12"))
TOKEN_TTL = 60 * 60 * 24 * 7


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=ROUNDS)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def make_token(user_id: int) -> str:
    return jwt.encode({"sub": str(user_id), "exp": int(time.time()) + TOKEN_TTL}, SECRET, ALGO)


def read_token(token: str) -> int | None:
    try:
        return int(jwt.decode(token, SECRET, algorithms=[ALGO])["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
