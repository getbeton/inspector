from fastapi import FastAPI, Depends
from app.auth import get_current_user

app = FastAPI(title="Beton Inspector API")

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/api/me")
def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user
