"""Habilitación de estudiantes para una práctica y entrega del kit.

El docente marca a sus estudiantes; el sistema decide si cada uno queda habilitado o bloqueado:
1. La sesión debe estar abierta.
2. El estudiante debe estar inscrito (inscripción activa) en la materia de la sesión.
3. Debe tener pagado lo que exige el semestre de la fecha de la sesión.
4. No debe haber completado ya lo que exige el plan para ese tratamiento
   (un kit por encima del plan no está cubierto por la cuota: se compra como extra).
El estado se vuelve a evaluar al consultar y al entregar, porque un pago o una entrega
posterior pueden cambiarlo.
"""

from collections import defaultdict
from datetime import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import EstadoHabilitacion, EstadoInscripcion, EstadoSesion, TipoMovimiento
from app.core.utils import conflicto
from app.models import EntregaKit, Habilitacion, Inscripcion, PlanMateria, SesionPractica, Usuario
from app.services import cuentas, stock

PENDIENTES = (EstadoHabilitacion.habilitado, EstadoHabilitacion.bloqueado)


def requeridos(db: Session, sigla: str, codigo_tratamiento: str) -> int:
    plan = db.get(PlanMateria, (sigla, codigo_tratamiento))
    return plan.cantidad if plan else 0


def realizados(db: Session, registro: int, sigla: str, codigo_tratamiento: str, id_gestion: int) -> int:
    return db.execute(
        select(func.count(EntregaKit.id))
        .join(Habilitacion, EntregaKit.id_habilitacion == Habilitacion.id)
        .join(SesionPractica, Habilitacion.id_sesion == SesionPractica.id)
        .where(
            Habilitacion.registro == registro,
            SesionPractica.sigla == sigla,
            SesionPractica.codigo_tratamiento == codigo_tratamiento,
            SesionPractica.id_gestion == id_gestion,
        )
    ).scalar_one()


def esta_inscrito(db: Session, registro: int, sigla: str, id_gestion: int) -> bool:
    return db.execute(
        select(Inscripcion.id).where(
            Inscripcion.registro == registro,
            Inscripcion.sigla == sigla,
            Inscripcion.id_gestion == id_gestion,
            Inscripcion.estado == EstadoInscripcion.activa,
        )
    ).first() is not None


def motivo_bloqueo(db: Session, sesion: SesionPractica, registro: int) -> str | None:
    if sesion.estado != EstadoSesion.abierta:
        return "La sesión de práctica fue anulada"
    if not esta_inscrito(db, registro, sesion.sigla, sesion.id_gestion):
        return f"No está inscrito en {sesion.sigla}"
    motivo = cuentas.motivo_sin_cobertura(db, registro, sesion.gestion, sesion.fecha)
    if motivo:
        return motivo
    req = requeridos(db, sesion.sigla, sesion.codigo_tratamiento)
    hechos = realizados(db, registro, sesion.sigla, sesion.codigo_tratamiento, sesion.id_gestion)
    if hechos >= req:
        return f"Ya completó el plan ({hechos}/{req}): un kit adicional se compra como extra"
    return None


def evaluar(db: Session, hab: Habilitacion) -> Habilitacion:
    if hab.estado in PENDIENTES:
        motivo = motivo_bloqueo(db, hab.sesion, hab.registro)
        hab.estado = EstadoHabilitacion.bloqueado if motivo else EstadoHabilitacion.habilitado
        hab.motivo = motivo
    return hab


def kit_requerido(sesion: SesionPractica, veces: int = 1) -> dict[str, Decimal]:
    requeridos_kit: dict[str, Decimal] = defaultdict(Decimal)
    for item in sesion.tratamiento.kit:
        requeridos_kit[item.codigo_insumo] += item.cantidad * veces
    return dict(requeridos_kit)


def entregar(db: Session, hab: Habilitacion, usuario: Usuario, fecha_hora: datetime | None = None) -> EntregaKit:
    if hab.estado == EstadoHabilitacion.entregado:
        raise conflicto("El kit de esta habilitación ya fue entregado")
    if hab.estado == EstadoHabilitacion.retirado:
        raise conflicto("El docente retiró a este estudiante de la sesión")
    evaluar(db, hab)
    if hab.estado != EstadoHabilitacion.habilitado:
        raise conflicto(f"Estudiante bloqueado: {hab.motivo}")
    requerido = kit_requerido(hab.sesion)
    if not requerido:
        raise conflicto(f"El tratamiento {hab.sesion.codigo_tratamiento} no tiene kit configurado")

    insumos = stock.verificar_disponible(db, requerido)
    entrega = EntregaKit(id_habilitacion=hab.id, id_usuario=usuario.id)
    if fecha_hora is not None:
        entrega.fecha_hora = fecha_hora
    db.add(entrega)
    db.flush()
    obs = f"Kit {hab.sesion.codigo_tratamiento} — sesión {hab.sesion.id} — reg. {hab.registro}"
    for codigo, cantidad in requerido.items():
        stock.mover(db, insumos[codigo], -cantidad, TipoMovimiento.salida_kit, usuario.id, obs,
                    id_entrega=entrega.id, fecha_hora=fecha_hora)
    hab.estado = EstadoHabilitacion.entregado
    hab.motivo = None
    db.flush()
    return entrega
