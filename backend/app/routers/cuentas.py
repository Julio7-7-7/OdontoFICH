"""Inscripciones (generan la deuda anual), estado de cuenta y pagos en caja."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select

from app.core.config import TZ, ahora
from app.core.db import DbDep
from app.core.enums import EstadoInscripcion, EstadoPago, EstadoRegistro, Rol
from app.core.security import SoloAdmin, requiere_rol
from app.core.utils import conflicto, invalido, no_encontrado, siguiente_numero
from app.models import CuentaAnual, Inscripcion, Materia, Pago, Usuario
from app.schemas.operaciones import (
    AnularIn, EstadoCuentaOut, InscripcionCreate, InscripcionOut, ModalidadIn, PagoCreate, PagoOut,
    PagoRegistradoOut,
)
from app.services import cuentas, practicas
from app.services.serializar import estado_cuenta_out, inscripcion_out, pago_out

Caja = Annotated[Usuario, Depends(requiere_rol(Rol.caja))]

# ---------------- Inscripciones ----------------
inscripciones = APIRouter(prefix="/inscripciones", tags=["Inscripciones"])


@inscripciones.get("")
def listar_inscripciones(
    db: DbDep,
    _: Caja,
    registro: int | None = None,
    sigla: str | None = None,
    id_gestion: Annotated[int | None, Query(description="Por defecto, la gestión activa")] = None,
    estado: EstadoInscripcion | None = None,
) -> list[InscripcionOut]:
    gestion = cuentas.resolver_gestion(db, id_gestion)
    consulta = select(Inscripcion).where(Inscripcion.id_gestion == gestion.id).order_by(Inscripcion.registro, Inscripcion.sigla)
    if registro:
        consulta = consulta.where(Inscripcion.registro == registro)
    if sigla:
        consulta = consulta.where(Inscripcion.sigla == sigla)
    if estado:
        consulta = consulta.where(Inscripcion.estado == estado)
    return [inscripcion_out(i) for i in db.execute(consulta).scalars()]


@inscripciones.post(
    "", status_code=201,
    summary="Inscribe al estudiante en una o más materias y recalcula su deuda anual y sus cuotas",
)
def inscribir(db: DbDep, admin: SoloAdmin, data: InscripcionCreate) -> EstadoCuentaOut:
    estudiante = cuentas.estudiante_o_404(db, data.registro)
    if estudiante.estado != EstadoRegistro.activo:
        raise conflicto("El estudiante está dado de baja")
    gestion = cuentas.resolver_gestion(db, data.id_gestion)
    siglas = list(dict.fromkeys(data.siglas))
    for sigla in siglas:
        materia = db.get(Materia, sigla)
        if materia is None:
            raise no_encontrado(f"Materia {sigla}")
        if materia.estado != EstadoRegistro.activo:
            raise conflicto(f"La materia {sigla} está inactiva")
        if practicas.esta_inscrito(db, data.registro, sigla, gestion.id):
            raise conflicto(f"El estudiante ya está inscrito en {sigla} en la gestión {gestion.anio}")
        db.add(Inscripcion(registro=data.registro, sigla=sigla, id_gestion=gestion.id,
                           monto=materia.precio, id_usuario=admin.id))
    db.flush()
    cuenta = cuentas.obtener_cuenta(db, data.registro, gestion, crear=True)
    cuentas.recalcular_cuotas(db, cuenta)
    db.commit()
    return estado_cuenta_out(db, cuenta)


@inscripciones.patch("/{id_inscripcion}/anular", summary="Anula una inscripción (con motivo) y recalcula la deuda")
def anular_inscripcion(db: DbDep, _: SoloAdmin, id_inscripcion: int, data: AnularIn) -> EstadoCuentaOut:
    i = db.get(Inscripcion, id_inscripcion)
    if i is None:
        raise no_encontrado("Inscripción")
    if i.estado == EstadoInscripcion.anulada:
        raise conflicto("La inscripción ya está anulada")
    cuenta = cuentas.obtener_cuenta(db, i.registro, i.gestion)
    retirados = sum(
        practicas.realizados(db, i.registro, i.sigla, p.codigo_tratamiento, i.id_gestion) for p in i.materia.plan
    )
    if retirados:
        raise conflicto(f"El estudiante ya retiró {retirados} kit(s) de {i.sigla}: no se puede anular")
    nuevo_total = cuentas.total_inscrito(db, i.registro, i.id_gestion) - i.monto
    if cuentas.total_pagado(db, cuenta.id) > nuevo_total:
        raise conflicto("Lo pagado supera la nueva deuda: primero anule o devuelva pagos")
    i.estado = EstadoInscripcion.anulada
    i.motivo_anulacion = data.motivo
    db.flush()
    cuentas.recalcular_cuotas(db, cuenta)
    db.commit()
    return estado_cuenta_out(db, cuenta)


# ---------------- Cuentas y pagos ----------------
router = APIRouter(tags=["Caja: cuentas y pagos"])


def _cuenta(db, registro: int, id_gestion: int | None) -> CuentaAnual:
    cuentas.estudiante_o_404(db, registro)
    gestion = cuentas.resolver_gestion(db, id_gestion)
    cuenta = cuentas.obtener_cuenta(db, registro, gestion)
    if cuenta is None:
        raise no_encontrado(f"Cuenta de la gestión {gestion.anio} (el estudiante no tiene inscripciones)")
    return cuenta


@router.get("/cuentas/{registro}", summary="Estado de cuenta: deuda, cuotas, pagos y si puede practicar hoy")
def estado_cuenta(db: DbDep, _: Caja, registro: int, id_gestion: int | None = None) -> EstadoCuentaOut:
    return estado_cuenta_out(db, _cuenta(db, registro, id_gestion))


@router.patch("/cuentas/{registro}/modalidad", summary="Contado o 2 cuotas (solo antes del primer pago)")
def cambiar_modalidad(db: DbDep, _: Caja, registro: int, data: ModalidadIn) -> EstadoCuentaOut:
    cuenta = _cuenta(db, registro, data.id_gestion)
    if cuentas.total_pagado(db, cuenta.id) > 0:
        raise conflicto("La cuenta ya tiene pagos: no se puede cambiar la modalidad")
    cuenta.modalidad = data.modalidad
    cuentas.recalcular_cuotas(db, cuenta)
    db.commit()
    return estado_cuenta_out(db, cuenta)


@router.post("/pagos", status_code=201, summary="Registrar un pago a la cuenta anual (emite recibo)")
def registrar_pago(db: DbDep, cajero: Caja, data: PagoCreate) -> PagoRegistradoOut:
    cuenta = _cuenta(db, data.registro, data.id_gestion)
    db.execute(select(CuentaAnual).where(CuentaAnual.id == cuenta.id).with_for_update())
    s = cuentas.situacion(db, cuenta)
    if s.saldo <= 0:
        raise conflicto("La cuenta no tiene saldo pendiente")
    if data.monto > s.saldo:
        raise invalido(f"El monto supera el saldo pendiente (Bs {s.saldo})")
    pago = Pago(
        nro_recibo=siguiente_numero(db, "R", ahora().year), id_cuenta=cuenta.id, monto=data.monto,
        id_usuario=cajero.id, observacion=data.observacion,
    )
    db.add(pago)
    db.commit()
    return PagoRegistradoOut(pago=pago_out(db, pago), estado_cuenta=estado_cuenta_out(db, cuenta))


@router.patch("/pagos/{id_pago}/anular", summary="Anular un pago con motivo (nunca se borra)")
def anular_pago(db: DbDep, cajero: Caja, id_pago: int, data: AnularIn) -> PagoRegistradoOut:
    pago = db.get(Pago, id_pago)
    if pago is None:
        raise no_encontrado("Pago")
    if pago.estado == EstadoPago.anulado:
        raise conflicto("El pago ya está anulado")
    pago.estado = EstadoPago.anulado
    pago.motivo_anulacion = data.motivo
    pago.anulado_por = cajero.id
    pago.anulado_en = ahora()
    db.commit()
    return PagoRegistradoOut(pago=pago_out(db, pago), estado_cuenta=estado_cuenta_out(db, pago.cuenta))


@router.get("/pagos", summary="Pagos registrados (por fecha y/o estudiante)")
def listar_pagos(
    db: DbDep,
    _: Caja,
    desde: date | None = None,
    hasta: date | None = None,
    registro: int | None = None,
    estado: EstadoPago | None = None,
) -> list[PagoOut]:
    consulta = select(Pago).join(CuentaAnual).order_by(Pago.id.desc())
    dia = func.date(func.timezone(TZ.key, Pago.fecha_hora))
    if desde:
        consulta = consulta.where(dia >= desde)
    if hasta:
        consulta = consulta.where(dia <= hasta)
    if registro:
        consulta = consulta.where(CuentaAnual.registro == registro)
    if estado:
        consulta = consulta.where(Pago.estado == estado)
    return [pago_out(db, p) for p in db.execute(consulta).scalars()]
