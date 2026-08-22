from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv
from typing import Generator
import os

load_dotenv()

# ── Engine ────────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,       # checks connection is alive before using it
    pool_size=5,              # keep 5 connections open
    max_overflow=10,          # allow 10 extra connections under heavy load
    echo=False,               # set True to see SQL queries in terminal (debug)
)

# ── Session factory ───────────────────────────────────────────────────────────
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# ── Dependency ────────────────────────────────────────────────────────────────
def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency — provides a database session to each request.
    Automatically closes the session when the request is done.
    Usage: db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError as e:
        db.rollback()
        raise e
    finally:
        db.close()  