from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from fastapi import HTTPException, status
from pydantic import PlainSerializer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Correlativo

CENTAVO = Decimal("0.01")

# Dinero y cantidades viajan como número en el JSON (no como texto)
Dinero = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]


def redondear(valor: Decimal) -> Decimal:
    return valor.quantize(CENTAVO, rounding=ROUND_HALF_UP)


def siguiente_numero(db: Session, prefijo: str, anio: int) -> str:
    """Recibo correlativo por tipo y año, seguro ante cobros simultáneos (bloqueo de fila)."""
    clave = f"{prefijo}-{anio}"
    fila = db.execute(select(Correlativo).where(Correlativo.clave == clave).with_for_update()).scalar_one_or_none()
    if fila is None:
        fila = Correlativo(clave=clave, ultimo=0)
        db.add(fila)
        db.flush()
    fila.ultimo += 1
    return f"{clave}-{fila.ultimo:06d}"


def no_encontrado(que: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{que} no encontrado")


def conflicto(detalle: str | dict) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, detalle)


def invalido(detalle: str | dict) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detalle)
