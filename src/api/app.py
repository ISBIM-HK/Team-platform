"""FastAPI application factory."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.api.routes import auth, chat, decompose, health, pm, suggestions, tasks, users, ws_chat
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
app.include_router(users.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(suggestions.router, prefix="/api/v1")
app.include_router(decompose.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(pm.router, prefix="/api/v1")
app.include_router(ws_chat.router)
