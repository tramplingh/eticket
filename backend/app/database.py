"""Raw-SQL data access layer built directly on asyncmy (no ORM).

Design notes (useful for the viva):
  * One connection pool for the whole app, created at startup (see main.py lifespan).
  * Connections run in autocommit mode, so a plain SELECT is its own tiny transaction.
    Multi-statement work (booking, cancelling, creating an event) opts in explicitly
    with `async with transaction(conn):` which issues BEGIN ... COMMIT / ROLLBACK.
  * Every value goes through %s placeholders - values are never formatted into SQL text.
  * Triggers and stored procedures (sql/02_programmability.sql) report rule violations with
    SIGNAL ... MYSQL_ERRNO = 50000 + HTTP status. `signal_status()` reads that back so the API
    can answer 400/404/409 instead of a generic 500 (see the handler in main.py).
"""
import re
from contextlib import asynccontextmanager
from urllib.parse import unquote, urlparse

import asyncmy
from asyncmy.cursors import DictCursor

from app.config import settings

DUPLICATE_KEY = 1062  # MySQL error number for a UNIQUE / PRIMARY KEY violation


def error_code(exc: Exception) -> int | None:
    """The MySQL error number carried by a driver exception, if any."""
    return exc.args[0] if exc.args and isinstance(exc.args[0], int) else None


def signal_status(exc: Exception) -> int | None:
    """HTTP status encoded by one of our SIGNAL statements (50400 -> 400), else None."""
    code = error_code(exc)
    return code - 50000 if code is not None and 50400 <= code <= 50599 else None

_pool = None


def _connection_kwargs(url: str) -> dict:
    """Turn 'mysql+asyncmy://user:pass@host:3306/db' into asyncmy connect() kwargs."""
    parsed = urlparse(re.sub(r"^mysql\+\w+://", "mysql://", url))
    return {
        "host": parsed.hostname or "localhost",
        "port": parsed.port or 3306,
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "db": parsed.path.lstrip("/"),
        "charset": "utf8mb4",
        "autocommit": True,
    }


async def init_pool():
    global _pool
    _pool = await asyncmy.create_pool(
        minsize=1, maxsize=10, pool_recycle=280, **_connection_kwargs(settings.database_url)
    )


async def close_pool():
    global _pool
    if _pool is not None:
        _pool.close()
        await _pool.wait_closed()
        _pool = None


async def get_db():
    """FastAPI dependency: lends one pooled connection for the duration of a request."""
    async with _pool.acquire() as conn:
        yield conn


# ---------- small helpers so routers stay readable ----------

async def fetch_all(conn, sql: str, args=None) -> list[dict]:
    async with conn.cursor(DictCursor) as cur:
        await cur.execute(sql, args)
        return list(await cur.fetchall())


async def fetch_one(conn, sql: str, args=None) -> dict | None:
    async with conn.cursor(DictCursor) as cur:
        await cur.execute(sql, args)
        return await cur.fetchone()


async def execute(conn, sql: str, args=None) -> tuple[int, int]:
    """Run a write. Returns (rows_affected, last_insert_id)."""
    async with conn.cursor(DictCursor) as cur:
        await cur.execute(sql, args)
        return cur.rowcount, cur.lastrowid


async def execute_many(conn, sql: str, rows: list) -> int:
    if not rows:
        return 0
    async with conn.cursor(DictCursor) as cur:
        await cur.executemany(sql, rows)
        return cur.rowcount


def placeholders(n: int) -> str:
    """'%s,%s,%s' for building IN (...) lists."""
    return ",".join(["%s"] * n)


@asynccontextmanager
async def transaction(conn):
    """BEGIN ... COMMIT, or ROLLBACK if anything inside raises."""
    await conn.begin()
    try:
        yield
    except BaseException:
        await conn.rollback()
        raise
    else:
        await conn.commit()
