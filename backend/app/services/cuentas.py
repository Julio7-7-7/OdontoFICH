"""Cuenta anual del estudiante: deuda por inscripciones, cuotas, pagos y cobertura de prácticas.

Reglas:
- Deuda anual = Σ montos de las inscripciones activas de la gestión.
- Siempre hay 2 cuotas. En cuotas: la 1 es la mitad (redondeada) y la 2 el resto.
  Al contado: la 1 es el total y la 2 vale 0.
- Los pagos se aplican en orden: primero cubren la cuota 1 y el excedente la cuota 2.
- Prácticas del 1er semestre (antes de la fecha de corte) exigen la cuota 1 pagada;
  las del 2do semestre exigen la deuda completa.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import EstadoInscripcion, EstadoPago, Modalidad
from app.core.utils import conflicto, no_encontrado, redondear
from app.models import CuentaAnual, Cuota, Estudiante, Gestion, Inscripcion, Pago

CERO = Decimal("0")


def gestion_activa(db: Session) -> Gestion:
    gestion = db.execute(select(Gestion).where(Gestion.activa.is_(True))).scalar_one_or_none()
    if gestion is None:
        raise conflicto("No hay una gestión activa configurada")
    return gestion


def resolver_gestion(db: Session, id_gestion: int | None) -> Gestion:
    if id_gestion is None:
        return gestion_activa(db)
    gestion = db.get(Gestion, id_gestion)
    if gestion is None:
        raise no_encontrado("Gestión")
    return gestion


def semestre_de(gestion: Gestion, fecha: date) -> int:
    return 1 if fecha < gestion.fecha_corte else 2


def obtener_cuenta(db: Session, registro: int, gestion: Gestion, crear: bool = False) -> CuentaAnual | None:
    cuenta = db.execute(
        select(CuentaAnual).where(CuentaAnual.registro == registro, CuentaAnual.id_gestion == gestion.id)
    ).scalar_one_or_none()
    if cuenta is None and crear:
        cuenta = CuentaAnual(registro=registro, id_gestion=gestion.id, modalidad=Modalidad.cuotas)
        cuenta.cuotas = [
            Cuota(nro=1, monto=CERO, fecha_vencimiento=gestion.fecha_inicio),
            Cuota(nro=2, monto=CERO, fecha_vencimiento=gestion.fecha_corte),
        ]
        db.add(cuenta)
        db.flush()
    return cuenta


def total_inscrito(db: Session, registro: int, id_gestion: int) -> Decimal:
    return db.execute(
        select(func.coalesce(func.sum(Inscripcion.monto), 0)).where(
            Inscripcion.registro == registro,
            Inscripcion.id_gestion == id_gestion,
            Inscripcion.estado == EstadoInscripcion.activa,
        )
    ).scalar_one()


def total_pagado(db: Session, id_cuenta: int) -> Decimal:
    return db.execute(
        select(func.coalesce(func.sum(Pago.monto), 0)).where(
            Pago.id_cuenta == id_cuenta, Pago.estado == EstadoPago.vigente
        )
    ).scalar_one()


def recalcular_cuotas(db: Session, cuenta: CuentaAnual) -> None:
    total = total_inscrito(db, cuenta.registro, cuenta.id_gestion)
    c1, c2 = cuenta.cuotas
    if cuenta.modalidad == Modalidad.contado:
        c1.monto, c2.monto = total, CERO
    else:
        c1.monto = redondear(total / 2)
        c2.monto = total - c1.monto
    db.flush()


@dataclass
class CuotaCalculada:
    nro: int
    monto: Decimal
    pagado: Decimal
    saldo: Decimal
    estado: str
    fecha_vencimiento: date


@dataclass
class Situacion:
    total: Decimal
    pagado: Decimal
    saldo: Decimal
    cuotas: list[CuotaCalculada]
    cubre_semestre_1: bool
    cubre_semestre_2: bool


def situacion(db: Session, cuenta: CuentaAnual) -> Situacion:
    total = total_inscrito(db, cuenta.registro, cuenta.id_gestion)
    pagado = total_pagado(db, cuenta.id)
    restante = pagado
    cuotas = []
    for c in cuenta.cuotas:
        aplicado = min(c.monto, restante)
        restante -= aplicado
        if c.monto == 0:
            estado = "no_aplica"
        elif aplicado >= c.monto:
            estado = "pagada"
        elif aplicado > 0:
            estado = "parcial"
        else:
            estado = "pendiente"
        cuotas.append(CuotaCalculada(c.nro, c.monto, aplicado, c.monto - aplicado, estado, c.fecha_vencimiento))
    return Situacion(
        total=total,
        pagado=pagado,
        saldo=total - pagado,
        cuotas=cuotas,
        cubre_semestre_1=total > 0 and cuotas[0].saldo <= 0,
        cubre_semestre_2=total > 0 and pagado >= total,
    )


def motivo_sin_cobertura(db: Session, registro: int, gestion: Gestion, fecha: date) -> str | None:
    """None si el estudiante tiene pagado lo que exige el semestre de `fecha`; si no, el motivo del bloqueo."""
    cuenta = obtener_cuenta(db, registro, gestion)
    if cuenta is None:
        return "No tiene materias inscritas en la gestión"
    s = situacion(db, cuenta)
    if semestre_de(gestion, fecha) == 1:
        if s.cubre_semestre_1:
            return None
        c1 = s.cuotas[0]
        return f"Cuota 1 impaga (pagado Bs {c1.pagado} de Bs {c1.monto})"
    if s.cubre_semestre_2:
        return None
    if not s.cubre_semestre_1:
        return f"Cuota 1 impaga (debe Bs {s.saldo} en total)"
    return f"Cuota 2 impaga (pagado Bs {s.pagado} de Bs {s.total})"


def estudiante_o_404(db: Session, registro: int) -> Estudiante:
    estudiante = db.get(Estudiante, registro)
    if estudiante is None:
        raise no_encontrado("Estudiante")
    return estudiante
