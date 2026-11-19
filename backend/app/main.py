import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes.health import router as health_router

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

default_frontend_origins = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
]
configured_origins = os.getenv("FRONTEND_ORIGINS")
allowed_origins = (
    [origin.strip() for origin in configured_origins.split(",") if origin.strip()]
    if configured_origins
    else default_frontend_origins
)

if "*" in allowed_origins:
    raise ValueError("FRONTEND_ORIGINS must list explicit origins; '*' is not allowed.")

app = FastAPI(title="TRACE_LENS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET"],
)

app.include_router(health_router, prefix="/api")
