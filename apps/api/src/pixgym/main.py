from fastapi import FastAPI
from sqlalchemy import text

from pixgym.db.session import get_engine

app = FastAPI(title="PixGYM", docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.get("/api/v1/health")
async def health() -> dict[str, str]:
    async with get_engine().connect() as conn:
        await conn.execute(text("SELECT 1"))
    return {"status": "ok"}
