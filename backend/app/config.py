from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:password@localhost:5432/beton"
    env: str = "DEV"
    supabase_url: str = ""
    supabase_key: str = ""
    
    class Config:
        env_file = ".env"

settings = Settings()
