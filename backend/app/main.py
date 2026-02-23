from __future__ import annotations

import sqlite3
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import API_PREFIX
from app.db import initialize_database
from app.models import ApiError, ErrorResponse
from app.routers import (
    accounts,
    asset_purchases,
    auth,
    kpis,
    reconciliations,
    reports,
    system,
    transactions,
)
from app.services.auth import get_current_user


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="Oikonomos API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ApiError)
def handle_api_error(_, exc: ApiError) -> JSONResponse:
    payload = ErrorResponse(code=exc.code, message=exc.message, details=exc.details)
    return JSONResponse(status_code=exc.status_code, content=payload.model_dump())


@app.exception_handler(sqlite3.IntegrityError)
def handle_integrity_error(_, exc: sqlite3.IntegrityError) -> JSONResponse:
    payload = ErrorResponse(
        code="db_integrity_error",
        message="database integrity error",
        details={"reason": str(exc)},
    )
    return JSONResponse(status_code=400, content=payload.model_dump())


@app.exception_handler(sqlite3.Error)
def handle_db_error(_, exc: sqlite3.Error) -> JSONResponse:
    payload = ErrorResponse(code="db_error", message="database error", details={"reason": str(exc)})
    return JSONResponse(status_code=500, content=payload.model_dump())


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth.router, prefix=API_PREFIX)

protected_api = APIRouter(prefix=API_PREFIX, dependencies=[Depends(get_current_user)])
protected_api.include_router(system.router)
protected_api.include_router(accounts.router)
protected_api.include_router(transactions.router)
protected_api.include_router(asset_purchases.router)
protected_api.include_router(reconciliations.router)
protected_api.include_router(reports.router)
protected_api.include_router(kpis.router)

app.include_router(protected_api)
