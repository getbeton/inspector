from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if settings.env == "DEV":
        return {"sub": "mock-user-id", "email": "mock@example.com", "role": "admin"}
    
    token = credentials.credentials
    # TODO: Implement real Supabase JWT validation here
    # For now, we just check if token exists
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {"sub": "real-user-id", "email": "real@example.com"}
