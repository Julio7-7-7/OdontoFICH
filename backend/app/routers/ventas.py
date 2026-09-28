"""Mostrador de insumos: venta de extras en efectivo y cierre de caja diario."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.core.config import TZ, ahora, hoy
from app.core.db import DbDep
from app.core.enums import EstadoCierre, EstadoVenta, Rol
from app.core.security import SoloAdmin, requiere_rol
from app.core.utils import conflicto, no_encontrado
from app.models import CierreCaja, Usuario, VentaExtra
from app.schemas.operaciones import AnularIn, CierreCreate, CierreOut, CierrePreviewOut, VentaCreate, VentaOut
from app.services import ventas as svc
from app.services.serializar import cierre_out, venta_out

EncargadoDep = Annotated[Usuario, Depends(requiere_rol(Rol.encargado_insumos))]

router = APIRouter(prefix="/ventas", tags=["Insumos: venta de extras"])


@router.post("", status_code=201, summary="Vender material extra (insumo suelto o kit completo) con recibo")
def vender(db: DbDep, encargado: EncargadoDep, data: VentaCreate) -> VentaOut:
    try:
        venta = svc.crear_venta(db, data.registro, [ln.model_dump() for ln in data.lineas], encargado)
    except Exception:
        db.rollback()
        raise
    db.commit()
    return venta_out(db, venta)


@router.get("")
def listar_ventas(
    db: DbDep, usuario: EncargadoDep, fecha: date | None = None, registro: int | None = None,
    estado: EstadoVenta | None = None,
) -> list[VentaOut]:
    consulta = select(VentaExtra).order_by(VentaExtra.id.desc())
    if usuario.rol == Rol.encargado_insumos:
        consulta = consulta.where(VentaExtra.id_usuario == usuario.id)
    if fecha:
        consulta = consulta.where(func.date(func.timezone(TZ.key, VentaExtra.fecha_hora)) == fecha)
    if registro:
        consulta = consulta.where(VentaExtra.registro == registro)
    if estado:
        consulta = consulta.where(VentaExtra.estado == estado)
    return [venta_out(db, v) for v in db.execute(consulta).scalars()]


@router.patch("/{id_venta}/anular", summary="Anular una venta (antes del cierre de caja); el stock vuelve")
def anular(db: DbDep, usuario: EncargadoDep, id_venta: int, data: AnularIn) -> VentaOut:
    venta = db.get(VentaExtra, id_venta)
    if venta is None or (usuario.rol == Rol.encargado_insumos and venta.id_usuario != usuario.id):
        raise no_encontrado("Venta")
    svc.anular_venta(db, venta, data.motivo, usuario)
    db.commit()
    return venta_out(db, venta)


cierres = APIRouter(prefix="/cierres", tags=["Insumos: cierre de caja"])


@cierres.get("/preview", summary="Lo que el sistema espera que haya en caja (ventas del día aún sin cerrar)")
def preview(db: DbDep, usuario: EncargadoDep, fecha: date | None = None) -> CierrePreviewOut:
    fecha = fecha or hoy()
    ventas = svc.ventas_sin_cierre(db, usuario.id, fecha)
    return CierrePreviewOut(
        fecha=fecha, ya_cerrado=svc.cierre_de(db, usuario.id, fecha) is not None, cantidad_ventas=len(ventas),
        total_sistema=sum((v.total for v in ventas), 0), ventas=[venta_out(db, v) for v in ventas],
    )


@cierres.post("", status_code=201, summary="Cerrar la caja del día declarando el efectivo contado")
def cerrar(db: DbDep, usuario: EncargadoDep, data: CierreCreate) -> CierreOut:
    cierre = svc.cerrar_caja(db, usuario, data.fecha or hoy(), data.efectivo_declarado, data.observacion)
    db.commit()
    return cierre_out(db, cierre)


@cierres.get("", summary="Cierres (el encargado ve los suyos; administración, todos)")
def listar_cierres(db: DbDep, usuario: EncargadoDep, estado: EstadoCierre | None = None) -> list[CierreOut]:
    consulta = select(CierreCaja).order_by(CierreCaja.fecha.desc(), CierreCaja.id.desc())
    if usuario.rol == Rol.encargado_insumos:
        consulta = consulta.where(CierreCaja.id_usuario == usuario.id)
    if estado:
        consulta = consulta.where(CierreCaja.estado == estado)
    return [cierre_out(db, c) for c in db.execute(consulta).scalars()]


@cierres.patch("/{id_cierre}/recibir", summary="Administración confirma que recibió el efectivo")
def recibir(db: DbDep, admin: SoloAdmin, id_cierre: int) -> CierreOut:
    c = db.get(CierreCaja, id_cierre)
    if c is None:
        raise no_encontrado("Cierre")
    if c.estado == EstadoCierre.recibido:
        raise conflicto("Este cierre ya fue recibido")
    c.estado = EstadoCierre.recibido
    c.recibido_por = admin.id
    c.recibido_en = ahora()
    db.commit()
    return cierre_out(db, c)
