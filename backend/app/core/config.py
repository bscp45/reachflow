from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    # App
    app_env: str = "development"
    debug: bool = True
    secret_key: str = "change-me"

    # JWT
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # Database
    database_url: str = ""

    # Redis
    redis_url: str = ""

    # Frontend
    frontend_url: str = "http://localhost:3000"

    # TRAI Compliance
    call_window_start_hour: int = 9
    call_window_end_hour: int = 21
    no_answer_retry_hours: int = 2
    declined_retry_days: int = 30

    # Languages
    supported_languages: str = "english,hindi,telugu"

    # Vapi
    vapi_api_key: str = ""
    vapi_phone_number_id: str = ""

    # OpenAI
    openai_api_key: str = ""

    # AWS
    aws_region: str = "ap-south-1"
    aws_s3_bucket: str = ""

    class Config:
        env_file = ".env"
        extra = "allow"

# Single instance used across entire app
settings = Settings()