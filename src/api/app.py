"""FastAPI application factory."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.api.routes import auth, chat, decompose, health, suggestions, tasks, users, ws_chat


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown hooks."""
    yield


app = FastAPI(
    title="Team Platform API",
    version="0.1.0",
    lifespan=lifespan,
)

# Mount routes
app.include_router(health.router)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(suggestions.router, prefix="/api/v1")
app.include_router(decompose.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(ws_chat.router)
