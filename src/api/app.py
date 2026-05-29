"""FastAPI application factory."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.api.routes import (
    admin,
    assistant,
    auth,
    chat,
    contributions,
    decompose,
    health,
    integrations,
    notifications,
    pm,
    projects,
    sso,
    suggestions,
    tasks,
    tokens,
    users,
    ws_chat,
)
from src.core.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown hooks. Fail-fast on missing prod secrets (设计 §5.7)."""
    settings = get_settings()
    if settings.is_production:
        if not settings.crypto_key:
            raise RuntimeError("CRYPTO_KEY must be set in production")
        if settings.secret_key == "dev-secret-key-not-for-production":
            raise RuntimeError("SECRET_KEY must be overridden in production")
    yield


app = FastAPI(
    title="Team Platform API",
    version="0.1.0",
    lifespan=lifespan,
)


# Don't let the browser cache the SPA assets (so frontend edits show on refresh).
@app.middleware("http")
async def _no_cache_spa(request: Request, call_next):
    resp = await call_next(request)
    if request.url.path in ("/", "/index.html", "/app.js", "/styles.css"):
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return resp


# ─── RFC 7807 Problem Details error format (设计 §6.1) ───

def _problem(status: int, title: str, detail: str, instance: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        media_type="application/problem+json",
        content={"type": "about:blank", "title": title, "status": status,
                 "detail": detail, "instance": instance},
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return _problem(exc.status_code, str(exc.detail), str(exc.detail), request.url.path)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return _problem(422, "Validation Error", str(exc.errors()), request.url.path)


# Mount routes
app.include_router(health.router)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(sso.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(suggestions.router, prefix="/api/v1")
app.include_router(decompose.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(pm.router, prefix="/api/v1")
app.include_router(integrations.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(tokens.router, prefix="/api/v1")
app.include_router(contributions.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(assistant.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(ws_chat.router)

# Serve the bundled SPA last (same-origin → cookies work, no CORS).
# Explicit API/docs/ws routes above are matched first.
_FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
if _FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIR), html=True), name="frontend")
