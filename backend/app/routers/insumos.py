from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select

from app.core.db import DbDep
from app.core.enums import EstadoRegistro, Rol, TipoMovimiento
from app.core.security import get_usuario_actual, requiere_rol
from app.core.utils import conflicto, invalido, no_encontrado
from app.models import Insumo, MovimientoStock, Usuario
from app.schemas.catalogos import AjusteIn, EntradaIn, EstadoIn, InsumoIn, InsumoOut, InsumoUpdate, MovimientoOut
from app.services import stock
from app.services.serializar import insumo_out, nombre_usuario

router = APIRouter(prefix="/insumos", tags=["Insumos y stock"], dependencies=[Depends(get_usuario_actual)])
Encargado = Annotated[Usuario, Depends(requiere_rol(Rol.encargado_insumos))]


def _insumo(db, codigo: str) -> Insumo:
    i = db.get(Insumo, codigo)
    if i is None:
        raise no_encontrado("Insumo")
    return i


@router.get("")
def listar_insumos(
    db: DbDep,
    q: Annotated[str | None, Query(description="Texto a buscar")] = None,
    estado: EstadoRegistro | None = None,
    bajo_minimo: Annotated[bool, Query(description="Solo los que están en o bajo su stock mínimo")] = False,
) -> list[InsumoOut]:
    consulta = select(Insumo).order_by(Insumo.codigo)
    if q:
        consulta = consulta.where(or_(Insumo.nombre.ilike(f"%{q}%"), Insumo.codigo.ilike(f"%{q}%")))
    if estado:
        consulta = consulta.where(Insumo.estado == estado)
    if bajo_minimo:
        consulta = consulta.where(Insumo.stock <= Insumo.stock_minimo)
    return [insumo_out(i) for i in db.execute(consulta).scalars()]


@router.get("/{codigo}")
def ver_insumo(db: DbDep, codigo: str) -> InsumoOut:
    return insumo_out(_insumo(db, codigo))


@router.post("", status_code=201)
def crear_insumo(db: DbDep, usuario: Encargado, data: InsumoIn) -> InsumoOut:
    if db.get(Insumo, data.codigo):
        raise conflicto("Ya existe un insumo con ese código")
    i = Insumo(**data.model_dump(exclude={"stock_inicial"}))
    db.add(i)
    db.flush()
    if data.stock_inicial > 0:
        stock.mover(db, i, data.stock_inicial, TipoMovimiento.entrada, usuario.id, "Stock inicial")
    db.commit()
    return insumo_out(i)


@router.patch("/{codigo}", summary="Datos del insumo. El stock NO se edita aquí: se usan entradas y ajustes")
def editar_insumo(db: DbDep, _: Encargado, codigo: str, data: InsumoUpdate) -> InsumoOut:
    i = _insumo(db, codigo)
    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(i, campo, valor)
    db.commit()
    return insumo_out(i)


@router.patch("/{codigo}/estado")
def estado_insumo(db: DbDep, _: Encargado, codigo: str, data: EstadoIn) -> InsumoOut:
    i = _insumo(db, codigo)
    i.estado = data.estado
    db.commit()
    return insumo_out(i)


@router.post("/{codigo}/entradas", summary="Registrar la llegada de material (reposición)")
def registrar_entrada(db: DbDep, usuario: Encargado, codigo: str, data: EntradaIn) -> InsumoOut:
    i = stock.bloquear_insumos(db, {codigo})[codigo]
    stock.mover(db, i, data.cantidad, TipoMovimiento.entrada, usuario.id, data.observacion)
    db.commit()
    return insumo_out(i)


@router.post("/{codigo}/ajustes", summary="Corregir el stock según el conteo físico (queda en el kardex con su motivo)")
def registrar_ajuste(db: DbDep, usuario: Encargado, codigo: str, data: AjusteIn) -> InsumoOut:
    i = stock.bloquear_insumos(db, {codigo})[codigo]
    delta = data.stock_contado - i.stock
    if delta == 0:
        raise invalido("El stock contado coincide con el del sistema: no hay nada que ajustar")
    stock.mover(db, i, delta, TipoMovimiento.ajuste, usuario.id, data.motivo)
    db.commit()
    return insumo_out(i)


@router.get("/{codigo}/kardex", summary="Historial de entradas y salidas del insumo")
def kardex(db: DbDep, codigo: str, limite: Annotated[int, Query(ge=1, le=1000)] = 200) -> list[MovimientoOut]:
    _insumo(db, codigo)
    movs = db.execute(
        select(MovimientoStock).where(MovimientoStock.codigo_insumo == codigo)
        .order_by(MovimientoStock.id.desc()).limit(limite)
    ).scalars()
    return [
        MovimientoOut(id=m.id, tipo=m.tipo, cantidad=m.cantidad, stock_resultante=m.stock_resultante,
                      fecha_hora=m.fecha_hora, usuario=nombre_usuario(db, m.id_usuario), observacion=m.observacion,
                      id_entrega=m.id_entrega, id_venta=m.id_venta)
        for m in movs
    ]
