"""Movimientos de stock. Toda salida o entrada pasa por aquí para que el kardex nunca se desincronice."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import TipoMovimiento
from app.core.utils import conflicto, no_encontrado
from app.models import Insumo, MovimientoStock


def bloquear_insumos(db: Session, codigos: set[str]) -> dict[str, Insumo]:
    """Bloquea las filas (orden fijo para evitar deadlocks) hasta el commit."""
    filas = db.execute(
        select(Insumo).where(Insumo.codigo.in_(codigos)).order_by(Insumo.codigo).with_for_update()
    ).scalars().all()
    insumos = {i.codigo: i for i in filas}
    faltan = codigos - insumos.keys()
    if faltan:
        raise no_encontrado(f"Insumo {', '.join(sorted(faltan))}")
    return insumos


def verificar_disponible(db: Session, requeridos: dict[str, Decimal]) -> dict[str, Insumo]:
    """Todo o nada: si falta cualquier insumo, no se mueve ninguno."""
    insumos = bloquear_insumos(db, set(requeridos))
    faltantes = [
        {
            "codigo": cod,
            "nombre": insumos[cod].nombre,
            "unidad_medida": insumos[cod].unidad_medida.value,
            "requerido": float(cant),
            "disponible": float(insumos[cod].stock),
        }
        for cod, cant in sorted(requeridos.items())
        if insumos[cod].stock < cant
    ]
    if faltantes:
        raise conflicto({"mensaje": "Stock insuficiente", "faltantes": faltantes})
    return insumos


def mover(
    db: Session,
    insumo: Insumo,
    delta: Decimal,
    tipo: TipoMovimiento,
    id_usuario: int,
    observacion: str | None = None,
    id_entrega: int | None = None,
    id_venta: int | None = None,
    fecha_hora: datetime | None = None,
) -> MovimientoStock:
    nuevo = insumo.stock + delta
    if nuevo < 0:
        raise conflicto(f"Stock insuficiente de {insumo.nombre}: hay {insumo.stock}, se piden {-delta}")
    insumo.stock = nuevo
    mov = MovimientoStock(
        codigo_insumo=insumo.codigo,
        tipo=tipo,
        cantidad=delta,
        stock_resultante=nuevo,
        id_usuario=id_usuario,
        observacion=observacion,
        id_entrega=id_entrega,
        id_venta=id_venta,
    )
    if fecha_hora is not None:
        mov.fecha_hora = fecha_hora
    db.add(mov)
    return mov
