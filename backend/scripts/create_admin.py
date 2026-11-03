"""Create (or promote) an admin account.

Run from the backend/ folder:
    python -m scripts.create_admin
"""
import asyncio
import getpass

from app.database import close_pool, execute, init_pool
from app import database
from app.security import hash_password


async def main():
    email = input("Admin email [admin@eticket.com]: ").strip() or "admin@eticket.com"
    first = input("First name [Site]: ").strip() or "Site"
    last = input("Last name [Admin]: ").strip() or "Admin"
    password = getpass.getpass("Password (min 8 chars): ")
    if len(password) < 8 or password != getpass.getpass("Repeat password: "):
        raise SystemExit("Passwords must match and be at least 8 characters.")

    await init_pool()
    async with database._pool.acquire() as conn:
        await execute(
            conn,
            """
            INSERT INTO `user` (first_name, last_name, email, password, date_of_birth, role)
            VALUES (%s, %s, %s, %s, '2000-01-01', 'admin')
            ON DUPLICATE KEY UPDATE password = VALUES(password), role = 'admin'
            """,
            (first, last, email, hash_password(password)),
        )
    await close_pool()
    print(f"Done. {email} is now an admin.")


asyncio.run(main())
