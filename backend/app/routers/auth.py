from asyncmy.errors import IntegrityError
from fastapi import APIRouter, Depends, HTTPException, status

from app.database import execute, fetch_one, get_db, transaction
from app.deps import get_current_user
from app.schemas import Token, UserLogin, UserOut, UserRegister
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

USER_COLUMNS = "user_id, first_name, last_name, email, date_of_birth, address, role"


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, db=Depends(get_db)):
    if await fetch_one(db, "SELECT 1 AS x FROM `user` WHERE email = %s", (payload.email,)):
        raise HTTPException(status_code=400, detail="Email already registered")

    try:
        async with transaction(db):
            _, user_id = await execute(
                db,
                "INSERT INTO `user` (first_name, last_name, email, password, date_of_birth, address) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (
                    payload.first_name,
                    payload.last_name,
                    payload.email,
                    hash_password(payload.password),
                    payload.date_of_birth,
                    payload.address,
                ),
            )
            if payload.phone_number:
                await execute(
                    db,
                    "INSERT INTO user_phone (user_id, phone_number) VALUES (%s, %s)",
                    (user_id, payload.phone_number),
                )
    except IntegrityError:  # two people registering the same email at the same instant
        raise HTTPException(status_code=400, detail="Email already registered")

    user = await fetch_one(db, f"SELECT {USER_COLUMNS} FROM `user` WHERE user_id = %s", (user_id,))
    return Token(access_token=create_access_token(str(user_id)), user=UserOut(**user))


@router.post("/login", response_model=Token)
async def login(payload: UserLogin, db=Depends(get_db)):
    user = await fetch_one(
        db, f"SELECT {USER_COLUMNS}, password FROM `user` WHERE email = %s", (payload.email,)
    )
    if not user or not verify_password(payload.password, user.pop("password")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return Token(access_token=create_access_token(str(user["user_id"])), user=UserOut(**user))


@router.get("/me", response_model=UserOut)
async def me(current_user: dict = Depends(get_current_user)):
    return UserOut(**current_user)
