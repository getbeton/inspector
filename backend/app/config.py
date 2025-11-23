from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:password@localhost:5432/beton"
    env: str = "DEV"
    supabase_url: str = ""
    supabase_key: str = ""
    
    # Integration API Keys
    posthog_api_key: str = ""
    posthog_project_id: str = ""
    stripe_api_key: str = ""
    apollo_api_key: str = ""
    
    # Sync Configuration
    sync_enabled: bool = False
    
    class Config:
        env_file = ".env"

settings = Settings()
