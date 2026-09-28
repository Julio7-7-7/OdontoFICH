import os
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://julius:adminjt@localhost/odontofich")
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "postgresql+psycopg://julius:adminjt@localhost/odontofich_test")
SECRET_KEY = os.getenv("SECRET_KEY", "odontofich-dev")
JWT_ALGORITHM = "HS256"
JWT_HORAS = 12
TZ = ZoneInfo(os.getenv("TIMEZONE", "America/La_Paz"))


def ahora() -> datetime:
    return datetime.now(TZ)


def hoy() -> date:
    return ahora().date()
