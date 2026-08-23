from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from dotenv import load_dotenv
import bcrypt
import pyotp
import os

load_dotenv()

# ── Password hashing ──────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hash a plain password using bcrypt."""
    return bcrypt.hashpw(
        password.encode('utf-8'),
        bcrypt.gensalt()
    ).decode('utf-8')

def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain password against its hash."""
    return bcrypt.checkpw(
        plain.encode('utf-8'),
        hashed.encode('utf-8')
    )

# ── JWT ───────────────────────────────────────────────────────────────────────
JWT_SECRET     = os.getenv("JWT_SECRET_KEY", "change-me")
JWT_ALGORITHM  = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MIN = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=JWT_EXPIRE_MIN))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_access_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT token. Returns None if invalid."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None

# ── OTP / 2FA ─────────────────────────────────────────────────────────────────

def generate_otp_secret() -> str:
    """Generate a new OTP secret for a user."""
    return pyotp.random_base32()

def generate_otp(secret: str) -> str:
    """Generate current OTP from secret — valid for 5 minutes."""
    totp = pyotp.TOTP(secret, interval=300)
    return totp.now()

def verify_otp(secret: str, otp: str) -> bool:
    """Verify an OTP against the secret."""
    totp = pyotp.TOTP(secret, interval=300)
    return totp.verify(otp, valid_window=1)