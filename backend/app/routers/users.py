"""The signed-in user's own profile.

Shows two attribute types from the synopsis:
  * derived attribute  -> age, computed by the view v_user_profile from date_of_birth
  * multivalued attr.  -> phone numbers, one row each in user_phone (composite primary key)
"""
from asyncmy.errors import IntegrityError
from fastapi import APIRouter, Depends, HTTPException, status

from app.database import DUPLICATE_KEY, error_code, execute, fetch_all, fetch_one, get_db
from app.deps import get_current_user
from app.schemas import PhoneIn, ProfileUpdate, UserProfile

router = APIRouter(prefix="/users", tags=["users"])

MAX_PHONES = 5


async def _profile(db, user_id: int) -> dict:
    profile = await fetch_one(
        db,
        """
        SELECT user_id, first_name, last_name, full_name, email, date_of_birth, age,
               address, role, created_at
        FROM v_user_profile
        WHERE user_id = %s
        """,
        (user_id,),
    )
    phones = await fetch_all(
        db, "SELECT phone_number FROM user_phone WHERE user_id = %s ORDER BY phone_number", (user_id,)
    )
    profile["phones"] = [p["phone_number"] for p in phones]
    return profile


@router.get("/me", response_model=UserProfile)
async def my_profile(db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    return await _profile(db, current_user["user_id"])


@router.put("/me", response_model=UserProfile)
async def update_profile(payload: ProfileUpdate, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    changes = payload.model_dump(exclude_unset=True)
    if "address" in changes:
        changes["address"] = (changes["address"] or "").strip() or None
    if changes:
        # Column names come from the Pydantic model's fixed field list, never from the client.
        assignments = ", ".join(f"{col} = %s" for col in changes)
        await execute(
            db, f"UPDATE `user` SET {assignments} WHERE user_id = %s", (*changes.values(), current_user["user_id"])
        )
    return await _profile(db, current_user["user_id"])


@router.post("/me/phones", response_model=UserProfile, status_code=status.HTTP_201_CREATED)
async def add_phone(payload: PhoneIn, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    count = await fetch_one(
        db, "SELECT COUNT(*) AS n FROM user_phone WHERE user_id = %s", (current_user["user_id"],)
    )
    if count["n"] >= MAX_PHONES:
        raise HTTPException(status_code=400, detail=f"You can save up to {MAX_PHONES} phone numbers")
    try:
        await execute(
            db,
            "INSERT INTO user_phone (user_id, phone_number) VALUES (%s, %s)",
            (current_user["user_id"], payload.phone_number.strip()),
        )
    except IntegrityError as exc:
        # The composite primary key (user_id, phone_number) rejects a repeat.
        if error_code(exc) == DUPLICATE_KEY:
            raise HTTPException(status_code=409, detail="That number is already on your profile")
        raise
    return await _profile(db, current_user["user_id"])


@router.delete("/me/phones/{phone_number}", response_model=UserProfile)
async def remove_phone(phone_number: str, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    removed, _ = await execute(
        db,
        "DELETE FROM user_phone WHERE user_id = %s AND phone_number = %s",
        (current_user["user_id"], phone_number),
    )
    if not removed:
        raise HTTPException(status_code=404, detail="Phone number not found")
    return await _profile(db, current_user["user_id"])
