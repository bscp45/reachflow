from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

# ── Settings ──────────────────────────────────────────────────────────────────
class Settings(BaseSettings):
    app_env: str = "development"
    debug: bool = True
    secret_key: str = "change-me"
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    database_url: str = ""
    redis_url: str = ""
    frontend_url: str = "http://localhost:3000"
    call_window_start_hour: int = 9
    call_window_end_hour: int = 21
    no_answer_retry_hours: int = 2
    declined_retry_days: int = 30
    supported_languages: str = "english,hindi,telugu"

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="ReachFlow API",
    description="AI-powered voice outreach platform — backend API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {
        "app": "ReachFlow API",
        "version": "0.1.0",
        "status": "running",
        "environment": settings.app_env,
    }

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "database": "not connected yet",
        "redis": "not connected yet",
    }

@app.get("/api/languages")
def get_languages():
    return {
        "supported": settings.supported_languages.split(","),
        "default": "english",
    }