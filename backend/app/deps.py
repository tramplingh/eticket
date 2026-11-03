from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.database import fetch_one, get_db
from app.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


async def get_current_user(token: str | None = Depends(oauth2_scheme), db=Depends(get_db)) -> dict:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_error
    user_id = decode_access_token(token)
    if user_id is None:
        raise credentials_error
    user = await fetch_one(
        db,
        "SELECT user_id, first_name, last_name, email, date_of_birth, address, role "
        "FROM `user` WHERE user_id = %s",
        (int(user_id),),
    )
    if user is None:
        raise credentials_error
    return user


async def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
