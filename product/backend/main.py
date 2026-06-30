"""VAYNE Product API — wraps VAYNE Core as a black box."""

from __future__ import annotations

import os
import asyncio
from contextlib import asynccontextmanager

from product.backend.env import load_repo_env

load_repo_env()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from product.backend.db.session import init_db
from product.backend.routes import analyst_chat, attack_paths, investigations, proof, upload


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    from product.backend.services.analyst_llm import warmup_analyst_llm

    asyncio.create_task(warmup_analyst_llm())
    yield


app = FastAPI(
    title="VAYNE Product API",
    version="1.0.0",
    description="Product shell around VAYNE Core — upload scans, receive investigations.",
    lifespan=lifespan,
)

origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(investigations.router)
app.include_router(attack_paths.router)
app.include_router(proof.router)
app.include_router(analyst_chat.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "vayne-product-api"}


@app.get("/api/health")
def api_health() -> dict[str, str]:
    return {"status": "ok", "service": "vayne-product-api"}
