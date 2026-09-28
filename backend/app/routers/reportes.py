"""Reportes que cruzan cuentas, prácticas, stock y ventas."""

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.config import TZ, ahora, hoy
from app.core.db import DbDep
from app.core.enums import (
    EstadoCierre, EstadoHabilitacion, EstadoInscripcion, EstadoPago, EstadoSesion, EstadoVenta, Rol,
    TipoLineaVenta, TipoMovimiento, UnidadMedida,
)
from app.core.security import get_usuario_actual, requiere_rol
from app.core.utils import Dinero, invalido
from app.models import (
    CierreCaja, CuentaAnual, EntregaKit, Inscripcion, Insumo, KitTratamiento, MovimientoStock, Pago,
    PlanMateria, SesionPractica, Usuario, VentaExtra, VentaExtraLinea,
)
from app.services import cuentas, practicas
from app.services.serializar import nombre_estudiante

router = APIRouter(prefix="/reportes", tags=["Reportes"])
CajaDep = Annotated[Usuario, Depends(requiere_rol(Rol.caja))]
EncargadoDep = Annotated[Usuario, Depends(requiere_rol(Rol.encargado_insumos))]
TodosDep = Annotated[Usuario, Depends(get_usuario_actual)]


# ---------------- Avance del plan (semáforo) ----------------
class TratamientoAvance(BaseModel):
    codigo: str
    tratamiento: str
    requeridos: int
    realizados: int
    faltantes: int
    semaforo: str
    kits_extra_comprados: int


class MateriaAvance(BaseModel):
    sigla: str
    materia: str
    avance_pct: float
    tratamientos: list[TratamientoAvance]


class AvanceOut(BaseModel):
    registro: int
    estudiante: str
    anio: int
    materias: list[MateriaAvance]


@router.get("/avance/{registro}", summary="Avance del estudiante en el plan de cada materia (semáforo)")
def avance(db: DbDep, _: TodosDep, registro: int, id_gestion: int | None = None) -> AvanceOut:
    estudiante = cuentas.estudiante_o_404(db, registro)
    gestion = cuentas.resolver_gestion(db, id_gestion)
    inscripciones = db.execute(
        select(Inscripcion).where(Inscripcion.registro == registro, Inscripcion.id_gestion == gestion.id,
                                  Inscripcion.estado == EstadoInscripcion.activa).order_by(Inscripcion.sigla)
    ).scalars()
    kits_extra = dict(db.execute(
        select(VentaExtraLinea.codigo_tratamiento, func.sum(VentaExtraLinea.cantidad))
        .join(VentaExtra).where(VentaExtra.registro == registro, VentaExtra.estado == EstadoVenta.vigente,
                                VentaExtraLinea.tipo == TipoLineaVenta.kit)
        .group_by(VentaExtraLinea.codigo_tratamiento)
    ).all())
    materias = []
    for ins in inscripciones:
        items = []
        for p in sorted(ins.materia.plan, key=lambda p: p.codigo_tratamiento):
            hechos = practicas.realizados(db, registro, ins.sigla, p.codigo_tratamiento, gestion.id)
            semaforo = "rojo" if hechos == 0 else "verde" if hechos >= p.cantidad else "amarillo"
            items.append(TratamientoAvance(
                codigo=p.codigo_tratamiento, tratamiento=p.tratamiento.nombre, requeridos=p.cantidad,
                realizados=hechos, faltantes=max(p.cantidad - hechos, 0), semaforo=semaforo,
                kits_extra_comprados=int(kits_extra.get(p.codigo_tratamiento, 0)),
            ))
        total_req = sum(t.requeridos for t in items)
        total_hechos = sum(min(t.realizados, t.requeridos) for t in items)
        materias.append(MateriaAvance(
            sigla=ins.sigla, materia=ins.materia.nombre, tratamientos=items,
            avance_pct=round(100 * total_hechos / total_req, 1) if total_req else 0.0,
        ))
    return AvanceOut(registro=registro, estudiante=nombre_estudiante(estudiante), anio=gestion.anio, materias=materias)


# ---------------- Deudores y constancia ----------------
class DeudorOut(BaseModel):
    registro: int
    estudiante: str
    modalidad: str
    total: Dinero
    pagado: Dinero
    saldo: Dinero
    cuota_1: str
    cuota_2: str
    bloqueado_hoy: bool
    motivo: str | None


class DeudoresOut(BaseModel):
    anio: int
    cantidad: int
    saldo_total: Dinero
    deudores: list[DeudorOut]


@router.get("/deudores", summary="Estudiantes con saldo pendiente y si hoy quedarían bloqueados para practicar")
def deudores(db: DbDep, _: CajaDep, id_gestion: int | None = None) -> DeudoresOut:
    gestion = cuentas.resolver_gestion(db, id_gestion)
    filas = []
    for cuenta in db.execute(select(CuentaAnual).where(CuentaAnual.id_gestion == gestion.id)).scalars():
        s = cuentas.situacion(db, cuenta)
        if s.saldo <= 0:
            continue
        motivo = cuentas.motivo_sin_cobertura(db, cuenta.registro, gestion, hoy())
        filas.append(DeudorOut(
            registro=cuenta.registro, estudiante=nombre_estudiante(cuenta.estudiante), modalidad=cuenta.modalidad,
            total=s.total, pagado=s.pagado, saldo=s.saldo, cuota_1=s.cuotas[0].estado, cuota_2=s.cuotas[1].estado,
            bloqueado_hoy=motivo is not None, motivo=motivo,
        ))
    filas.sort(key=lambda f: f.saldo, reverse=True)
    return DeudoresOut(anio=gestion.anio, cantidad=len(filas), saldo_total=sum((f.saldo for f in filas), Decimal("0")),
                       deudores=filas)


class ConstanciaOut(BaseModel):
    registro: int
    estudiante: str
    anio: int
    sin_deuda: bool
    total: Dinero
    pagado: Dinero
    saldo: Dinero
    mensaje: str
    emitida_en: datetime


@router.get("/constancia/{registro}", summary="Constancia de no adeudo para cerrar el año")
def constancia(db: DbDep, _: CajaDep, registro: int, id_gestion: int | None = None) -> ConstanciaOut:
    estudiante = cuentas.estudiante_o_404(db, registro)
    gestion = cuentas.resolver_gestion(db, id_gestion)
    cuenta = cuentas.obtener_cuenta(db, registro, gestion)
    if cuenta is None:
        raise invalido(f"El estudiante no tiene inscripciones en la gestión {gestion.anio}")
    s = cuentas.situacion(db, cuenta)
    sin_deuda = s.saldo <= 0
    nombre = nombre_estudiante(estudiante)
    mensaje = (f"{nombre} (reg. {registro}) no tiene deudas con la carrera en la gestión {gestion.anio}."
               if sin_deuda else f"{nombre} (reg. {registro}) adeuda Bs {s.saldo} de la gestión {gestion.anio}.")
    return ConstanciaOut(registro=registro, estudiante=nombre, anio=gestion.anio, sin_deuda=sin_deuda, total=s.total,
                         pagado=s.pagado, saldo=s.saldo, mensaje=mensaje, emitida_en=ahora())


# ---------------- Recaudación ----------------
class DiaRecaudacion(BaseModel):
    fecha: date
    cuotas: Dinero
    extras: Dinero
    total: Dinero


class RecaudacionOut(BaseModel):
    desde: date
    hasta: date
    cuotas: Dinero
    extras: Dinero
    total: Dinero
    por_dia: list[DiaRecaudacion]


@router.get("/recaudacion", summary="Cobros de cuotas (caja) + ventas de extras (insumos), por día")
def recaudacion(db: DbDep, _: CajaDep, desde: date | None = None, hasta: date | None = None) -> RecaudacionOut:
    hasta = hasta or hoy()
    desde = desde or hasta.replace(day=1)
    if desde > hasta:
        raise invalido("'desde' no puede ser posterior a 'hasta'")
    dia_pago = func.date(func.timezone(TZ.key, Pago.fecha_hora))
    dia_venta = func.date(func.timezone(TZ.key, VentaExtra.fecha_hora))
    dias: dict[date, dict[str, Decimal]] = defaultdict(lambda: {"cuotas": Decimal("0"), "extras": Decimal("0")})
    for d, monto in db.execute(
        select(dia_pago, func.sum(Pago.monto)).where(Pago.estado == EstadoPago.vigente, dia_pago.between(desde, hasta))
        .group_by(dia_pago)
    ):
        dias[d]["cuotas"] = monto
    for d, monto in db.execute(
        select(dia_venta, func.sum(VentaExtra.total))
        .where(VentaExtra.estado == EstadoVenta.vigente, dia_venta.between(desde, hasta)).group_by(dia_venta)
    ):
        dias[d]["extras"] = monto
    por_dia = [DiaRecaudacion(fecha=d, cuotas=v["cuotas"], extras=v["extras"], total=v["cuotas"] + v["extras"])
               for d, v in sorted(dias.items())]
    c = sum((x.cuotas for x in por_dia), Decimal("0"))
    e = sum((x.extras for x in por_dia), Decimal("0"))
    return RecaudacionOut(desde=desde, hasta=hasta, cuotas=c, extras=e, total=c + e, por_dia=por_dia)


# ---------------- Consumo previsto vs real ----------------
class ConsumoInsumo(BaseModel):
    codigo: str
    insumo: str
    unidad_medida: UnidadMedida
    previsto_anual: Dinero
    entregado_en_kits: Dinero
    vendido_como_extra: Dinero
    pendiente_segun_plan: Dinero
    stock_actual: Dinero
    alcanza_para_lo_pendiente: bool
    extra_sobre_kits_pct: float


class ConsumoOut(BaseModel):
    anio: int
    estudiantes_inscritos: int
    insumos: list[ConsumoInsumo]


@router.get(
    "/consumo",
    summary="Consumo previsto (inscritos × plan × kit) contra lo entregado y lo vendido como extra",
    description="Lo vendido como extra es el material que el plan no contemplaba: el indicador de desperdicio.",
)
def consumo(db: DbDep, _: EncargadoDep, id_gestion: int | None = None) -> ConsumoOut:
    gestion = cuentas.resolver_gestion(db, id_gestion)
    previsto = dict(db.execute(
        select(KitTratamiento.codigo_insumo, func.sum(KitTratamiento.cantidad * PlanMateria.cantidad))
        .join(PlanMateria, PlanMateria.codigo_tratamiento == KitTratamiento.codigo_tratamiento)
        .join(Inscripcion, Inscripcion.sigla == PlanMateria.sigla)
        .where(Inscripcion.id_gestion == gestion.id, Inscripcion.estado == EstadoInscripcion.activa)
        .group_by(KitTratamiento.codigo_insumo)
    ).all())
    dia = func.date(func.timezone(TZ.key, MovimientoStock.fecha_hora))

    def salidas(*tipos: TipoMovimiento) -> dict[str, Decimal]:
        return dict(db.execute(
            select(MovimientoStock.codigo_insumo, -func.sum(MovimientoStock.cantidad))
            .where(MovimientoStock.tipo.in_(tipos), dia.between(gestion.fecha_inicio, gestion.fecha_fin))
            .group_by(MovimientoStock.codigo_insumo)
        ).all())

    kits = salidas(TipoMovimiento.salida_kit)
    extras = salidas(TipoMovimiento.salida_venta, TipoMovimiento.anulacion_venta)
    inscritos = db.execute(
        select(func.count(func.distinct(Inscripcion.registro)))
        .where(Inscripcion.id_gestion == gestion.id, Inscripcion.estado == EstadoInscripcion.activa)
    ).scalar_one()
    cero = Decimal("0")
    filas = []
    for ins in db.execute(select(Insumo).order_by(Insumo.codigo)).scalars():
        prev, k, x = previsto.get(ins.codigo, cero), kits.get(ins.codigo, cero), extras.get(ins.codigo, cero)
        if prev == 0 and k == 0 and x == 0:
            continue
        pendiente = max(prev - k, cero)
        filas.append(ConsumoInsumo(
            codigo=ins.codigo, insumo=ins.nombre, unidad_medida=ins.unidad_medida, previsto_anual=prev,
            entregado_en_kits=k, vendido_como_extra=x, pendiente_segun_plan=pendiente, stock_actual=ins.stock,
            alcanza_para_lo_pendiente=ins.stock >= pendiente,
            extra_sobre_kits_pct=round(float(100 * x / k), 1) if k else 0.0,
        ))
    return ConsumoOut(anio=gestion.anio, estudiantes_inscritos=inscritos, insumos=filas)


# ---------------- Panel ----------------
class DashboardOut(BaseModel):
    fecha: date
    semestre: int
    cobrado_hoy_cuotas: Dinero
    vendido_hoy_extras: Dinero
    sesiones_hoy: int
    pendientes_de_entrega_hoy: int
    kits_entregados_hoy: int
    insumos_bajo_minimo: int
    estudiantes_con_deuda: int
    cierres_por_recibir: int


@router.get("/dashboard", summary="Resumen del día para el panel principal")
def dashboard(db: DbDep, _: TodosDep) -> DashboardOut:
    gestion = cuentas.gestion_activa(db)
    f = hoy()
    dia = lambda col: func.date(func.timezone(TZ.key, col))  # noqa: E731
    cuotas_hoy = db.execute(
        select(func.coalesce(func.sum(Pago.monto), 0)).where(Pago.estado == EstadoPago.vigente, dia(Pago.fecha_hora) == f)
    ).scalar_one()
    extras_hoy = db.execute(
        select(func.coalesce(func.sum(VentaExtra.total), 0))
        .where(VentaExtra.estado == EstadoVenta.vigente, dia(VentaExtra.fecha_hora) == f)
    ).scalar_one()
    sesiones_hoy = list(db.execute(
        select(SesionPractica).where(SesionPractica.fecha == f, SesionPractica.estado == EstadoSesion.abierta)
    ).scalars())
    pendientes = 0
    for s in sesiones_hoy:
        for h in s.habilitaciones:
            practicas.evaluar(db, h)
            pendientes += h.estado == EstadoHabilitacion.habilitado
    db.commit()
    deudas = sum(
        1 for c in db.execute(select(CuentaAnual).where(CuentaAnual.id_gestion == gestion.id)).scalars()
        if cuentas.situacion(db, c).saldo > 0
    )
    return DashboardOut(
        fecha=f, semestre=cuentas.semestre_de(gestion, f), cobrado_hoy_cuotas=cuotas_hoy, vendido_hoy_extras=extras_hoy,
        sesiones_hoy=len(sesiones_hoy), pendientes_de_entrega_hoy=pendientes,
        kits_entregados_hoy=db.execute(select(func.count(EntregaKit.id)).where(dia(EntregaKit.fecha_hora) == f)).scalar_one(),
        insumos_bajo_minimo=db.execute(select(func.count()).select_from(Insumo).where(Insumo.stock <= Insumo.stock_minimo)).scalar_one(),
        estudiantes_con_deuda=deudas,
        cierres_por_recibir=db.execute(select(func.count(CierreCaja.id)).where(CierreCaja.estado == EstadoCierre.pendiente)).scalar_one(),
    )
