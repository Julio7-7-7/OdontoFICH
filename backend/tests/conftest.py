"""Los tests usan la base TEST_DATABASE_URL (nunca la de desarrollo): se reemplaza get_db."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core import config
from app.core import db as core_db
from app.core.db import Base
from app.main import app
from app.seed import cargar, reiniciar

engine = create_engine(config.TEST_DATABASE_URL)
SesionPrueba = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def _db():
    s = SesionPrueba()
    try:
        yield s
    finally:
        s.close()


app.dependency_overrides[core_db.get_db] = _db


@pytest.fixture(scope="session", autouse=True)
def esquema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture(autouse=True)
def datos():
    """Cada test arranca con los datos de ejemplo recién cargados."""
    with SesionPrueba() as s:
        reiniciar(s)
        cargar(s)


@pytest.fixture
def db():
    with SesionPrueba() as s:
        yield s


@pytest.fixture
def client():
    return TestClient(app, base_url="http://testserver/api")


def _token(client, usuario):
    r = client.post("/auth/login", data={"username": usuario, "password": "odonto123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def admin(client):
    return _token(client, "admin")


@pytest.fixture
def caja(client):
    return _token(client, "caja")


@pytest.fixture
def docente(client):
    return _token(client, "docente")


@pytest.fixture
def docente2(client):
    return _token(client, "docente2")


@pytest.fixture
def insumos(client):
    return _token(client, "insumos")
