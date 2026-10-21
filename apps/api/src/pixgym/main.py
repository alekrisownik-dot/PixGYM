import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from pixgym.api.deps import csrf_middleware
from pixgym.api.v1 import (
    analytics,
    auth,
    body,
    catalog,
    events,
    programs,
    progress,
    push,
    training,
)
from pixgym.core.config import get_settings
from pixgym.db.session import get_engine
from pixgym.services import push as push_service


@asynccontextmanager
async def lifespan(_: FastAPI):
    """W tle: pętla przypomnień push (o jutrzejszych wydarzeniach i treningu)."""
    task = asyncio.create_task(push_service.loop()) if get_settings().reminders_loop else None
    yield
    if task:
        task.cancel()


app = FastAPI(
    title="PixGYM", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan
)
app.middleware("http")(csrf_middleware)

for module in (auth, training, catalog, programs, progress, analytics, events, body, push):
    app.include_router(module.router, prefix="/api/v1")

# Front sam w sobie nie ładuje nic z zewnątrz, więc CSP może być ścisła.
CSP = (
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; "
    "connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; "
    "base-uri 'none'; form-action 'self'"
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("x-content-type-options", "nosniff")
    response.headers.setdefault("referrer-policy", "no-referrer")
    response.headers.setdefault("x-frame-options", "DENY")
    if not request.url.path.startswith("/api/docs"):
        response.headers.setdefault("content-security-policy", CSP)
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("cache-control", "no-store")
    if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
        response.headers.setdefault("strict-transport-security", "max-age=31536000")
    return response


@app.get("/api/v1/health")
async def health() -> dict[str, str]:
    async with get_engine().connect() as conn:
        await conn.execute(text("SELECT 1"))
    return {"status": "ok"}


def _red_manifest(file: Path) -> Response:
    """Motyw Red Team (ciasteczko ustawia front): czerwone ikony i kolory aplikacji na telefonie."""
    manifest = json.loads(file.read_text())
    manifest["background_color"] = manifest["theme_color"] = "#0e0909"
    for icon in manifest["icons"]:
        icon["src"] = icon["src"].replace("/icon", "/icon-red", 1)
    return Response(
        json.dumps(manifest, ensure_ascii=False),
        media_type="application/manifest+json",
        headers={"cache-control": "no-cache"},
    )


def _mount_web(web_dir: Path) -> None:
    """Zbudowany front (PWA). Nieznane ścieżki poza /api dostają index.html (routing w JS)."""
    index = web_dir / "index.html"
    # check_dir=False: front można zbudować po starcie API, bez restartu.
    app.mount("/assets", StaticFiles(directory=web_dir / "assets", check_dir=False), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str, request: Request) -> Response:
        if path.startswith("api/"):
            raise HTTPException(404)
        if path == "manifest.webmanifest" and request.cookies.get("pixgym_theme") == "red":
            return _red_manifest(web_dir / path)
        file = (web_dir / path).resolve()
        if path and file.is_file() and file.is_relative_to(web_dir.resolve()):
            # Service worker i manifest muszą być zawsze świeże, inaczej aktualizacja nie dojdzie.
            no_cache = file.name in {"sw.js", "manifest.webmanifest", "index.html", "version.json"}
            return FileResponse(file, headers={"cache-control": "no-cache"} if no_cache else None)
        if not index.is_file():
            raise HTTPException(404, "Front nie jest zbudowany: cd apps/web && npm run build")
        return FileResponse(index, headers={"cache-control": "no-cache"})


if get_settings().web_dir:
    _mount_web(Path(get_settings().web_dir))
