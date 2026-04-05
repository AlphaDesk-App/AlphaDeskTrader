from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    schwab_app_key:      str = ""
    schwab_app_secret:   str = ""
    schwab_redirect_uri: str = "https://127.0.0.1"
    schwab_token_path:   str = "config/tokens.json"  # kept for .env compatibility
    port:                int = 8000
    database_url:        str = "postgresql+asyncpg://postgres:Normandale1%40%40@localhost:5432/alphadesk"
    secret_key:          str = "change_this_to_a_long_random_secret_key_in_production"
    algorithm:           str = "HS256"
    access_token_expire_minutes: int = 10080

    class Config:
        env_file = ".env"
        extra    = "allow"

settings = Settings()