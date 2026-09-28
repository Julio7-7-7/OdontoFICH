"""Convierte modelos en las respuestas de la API (nombres legibles, totales calculados)."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import hoy
from app.core.enums import EstadoHabilitacion, EstadoInscripcion
from app.models import (
    CierreCaja, CuentaAnual, Docente, EntregaKit, Estudiante, Habilitacion, Inscripcion, Insumo, Materia,
    MovimientoStock, Pago, SesionPractica, Tratamiento, Usuario, VentaExtra,
)
from app.schemas.catalogos import InsumoOut, KitItemOut, MateriaOut, PlanItemOut, TratamientoOut
from app.schemas.operaciones import (
    CierreOut, CuotaOut, EntregaInsumoOut, EntregaOut, EstadoCuentaOut, HabilitacionOut, InscripcionOut,
    KitLineaOut, LineaVentaOut, PagoOut, PendienteOut, SesionOut, SesionResumenOut, VentaOut,
)
from app.services import cuentas, practicas


def nombre_estudiante(e: Estudiante) -> str:
    return f"{e.apellido} {e.nombre}"


def nombre_docente(d: Docente) -> str:
    return f"{d.apellido} {d.nombre}"


def nombre_usuario(db: Session, id_usuario: int | None) -> str | None:
    if id_usuario is None:
        return None
    u = db.get(Usuario, id_usuario)
    return u.nombre_completo if u else None


def insumo_out(i: Insumo) -> InsumoOut:
    return InsumoOut(
        codigo=i.codigo, nombre=i.nombre, unidad_medida=i.unidad_medida, precio_unitario=i.precio_unitario,
        stock=i.stock, stock_minimo=i.stock_minimo, bajo_minimo=i.stock <= i.stock_minimo, estado=i.estado,
    )


def tratamiento_out(t: Tratamiento) -> TratamientoOut:
    kit = [
        KitItemOut(codigo_insumo=k.codigo_insumo, nombre=k.insumo.nombre, unidad_medida=k.insumo.unidad_medida,
                   cantidad=k.cantidad, costo=k.cantidad * k.insumo.precio_unitario)
        for k in sorted(t.kit, key=lambda k: k.codigo_insumo)
    ]
    return TratamientoOut(codigo=t.codigo, nombre=t.nombre, precio=t.precio, estado=t.estado, kit=kit,
                          costo_kit=sum((k.costo for k in kit), Decimal("0")))


def materia_out(m: Materia) -> MateriaOut:
    plan = [
        PlanItemOut(codigo_tratamiento=p.codigo_tratamiento, tratamiento=p.tratamiento.nombre, cantidad=p.cantidad,
                    precio_unitario=p.tratamiento.precio, subtotal=p.cantidad * p.tratamiento.precio)
        for p in sorted(m.plan, key=lambda p: p.codigo_tratamiento)
    ]
    return MateriaOut(
        sigla=m.sigla, nombre=m.nombre, anio_carrera=m.anio_carrera, creditos=m.creditos,
        horas_teoricas=m.horas_teoricas, horas_practicas=m.horas_practicas,
        sigla_prerrequisito=m.sigla_prerrequisito, estado=m.estado, precio=m.precio, plan=plan,
    )


def inscripcion_out(i: Inscripcion) -> InscripcionOut:
    return InscripcionOut(
        id=i.id, registro=i.registro, sigla=i.sigla, materia=i.materia.nombre, anio=i.gestion.anio,
        monto=i.monto, estado=i.estado, creado_en=i.creado_en, motivo_anulacion=i.motivo_anulacion,
    )


def pago_out(db: Session, p: Pago) -> PagoOut:
    return PagoOut(
        id=p.id, nro_recibo=p.nro_recibo, registro=p.cuenta.registro,
        estudiante=nombre_estudiante(p.cuenta.estudiante), anio=p.cuenta.gestion.anio, monto=p.monto,
        fecha_hora=p.fecha_hora, cajero=nombre_usuario(db, p.id_usuario), estado=p.estado,
        observacion=p.observacion, motivo_anulacion=p.motivo_anulacion,
    )


def estado_cuenta_out(db: Session, cuenta: CuentaAnual) -> EstadoCuentaOut:
    s = cuentas.situacion(db, cuenta)
    gestion = cuenta.gestion
    fecha = hoy()
    motivo_hoy = cuentas.motivo_sin_cobertura(db, cuenta.registro, gestion, fecha)
    inscripciones = db.execute(
        select(Inscripcion).where(Inscripcion.registro == cuenta.registro, Inscripcion.id_gestion == gestion.id)
        .order_by(Inscripcion.estado, Inscripcion.sigla)
    ).scalars()
    pagos = db.execute(select(Pago).where(Pago.id_cuenta == cuenta.id).order_by(Pago.id)).scalars()
    cubre = {1: "Prácticas del 1er semestre", 2: "Prácticas del 2do semestre"}
    return EstadoCuentaOut(
        registro=cuenta.registro, estudiante=nombre_estudiante(cuenta.estudiante), id_gestion=gestion.id,
        anio=gestion.anio, modalidad=cuenta.modalidad, total=s.total, pagado=s.pagado, saldo=s.saldo,
        cuotas=[CuotaOut(nro=c.nro, monto=c.monto, pagado=c.pagado, saldo=c.saldo, estado=c.estado,
                         fecha_vencimiento=c.fecha_vencimiento,
                         cubre="Todo el año (al contado)" if cuenta.modalidad == "contado" and c.nro == 1
                         else cubre[c.nro])
                for c in s.cuotas],
        cubre_semestre_1=s.cubre_semestre_1, cubre_semestre_2=s.cubre_semestre_2,
        semestre_actual=cuentas.semestre_de(gestion, fecha), habilitado_hoy=motivo_hoy is None,
        motivo_bloqueo_hoy=motivo_hoy,
        inscripciones=[inscripcion_out(i) for i in inscripciones],
        pagos=[pago_out(db, p) for p in pagos],
    )


def habilitacion_out(db: Session, h: Habilitacion) -> HabilitacionOut:
    s = h.sesion
    return HabilitacionOut(
        id=h.id, registro=h.registro, estudiante=nombre_estudiante(h.estudiante), estado=h.estado, motivo=h.motivo,
        realizados=practicas.realizados(db, h.registro, s.sigla, s.codigo_tratamiento, s.id_gestion),
        requeridos=practicas.requeridos(db, s.sigla, s.codigo_tratamiento),
        entregado_en=h.entrega.fecha_hora if h.entrega else None,
    )


def _conteos(s: SesionPractica) -> dict[str, int]:
    estados = [h.estado for h in s.habilitaciones]
    return {
        "habilitados": estados.count(EstadoHabilitacion.habilitado),
        "bloqueados": estados.count(EstadoHabilitacion.bloqueado),
        "entregados": estados.count(EstadoHabilitacion.entregado),
    }


def sesion_resumen_out(s: SesionPractica) -> SesionResumenOut:
    return SesionResumenOut(
        id=s.id, fecha=s.fecha, sigla=s.sigla, materia=s.materia.nombre, codigo_tratamiento=s.codigo_tratamiento,
        tratamiento=s.tratamiento.nombre, id_docente=s.id_docente, docente=nombre_docente(s.docente),
        estado=s.estado, observacion=s.observacion, **_conteos(s),
    )


def sesion_out(db: Session, s: SesionPractica) -> SesionOut:
    return SesionOut(
        **sesion_resumen_out(s).model_dump(),
        habilitaciones=[habilitacion_out(db, h) for h in s.habilitaciones],
    )


def pendiente_out(h: Habilitacion) -> PendienteOut:
    s = h.sesion
    kit = [
        KitLineaOut(codigo_insumo=k.codigo_insumo, insumo=k.insumo.nombre, unidad_medida=k.insumo.unidad_medida,
                    cantidad=k.cantidad, stock_actual=k.insumo.stock)
        for k in sorted(s.tratamiento.kit, key=lambda k: k.codigo_insumo)
    ]
    return PendienteOut(
        id_habilitacion=h.id, registro=h.registro, estudiante=nombre_estudiante(h.estudiante), estado=h.estado,
        motivo=h.motivo, id_sesion=s.id,
        fecha=s.fecha, sigla=s.sigla, materia=s.materia.nombre, codigo_tratamiento=s.codigo_tratamiento,
        tratamiento=s.tratamiento.nombre, docente=nombre_docente(s.docente), kit=kit,
        stock_suficiente=bool(kit) and all(k.stock_actual >= k.cantidad for k in kit),
    )


def entrega_out(db: Session, e: EntregaKit) -> EntregaOut:
    h = e.habilitacion
    s = h.sesion
    movs = db.execute(
        select(MovimientoStock).where(MovimientoStock.id_entrega == e.id).order_by(MovimientoStock.codigo_insumo)
    ).scalars()
    return EntregaOut(
        id=e.id, id_habilitacion=h.id, registro=h.registro, estudiante=nombre_estudiante(h.estudiante),
        sigla=s.sigla, codigo_tratamiento=s.codigo_tratamiento, tratamiento=s.tratamiento.nombre,
        fecha_hora=e.fecha_hora, encargado=nombre_usuario(db, e.id_usuario),
        insumos=[EntregaInsumoOut(codigo_insumo=m.codigo_insumo, insumo=db.get(Insumo, m.codigo_insumo).nombre,
                                  cantidad=-m.cantidad, stock_resultante=m.stock_resultante) for m in movs],
        realizados=practicas.realizados(db, h.registro, s.sigla, s.codigo_tratamiento, s.id_gestion),
        requeridos=practicas.requeridos(db, s.sigla, s.codigo_tratamiento),
    )


def venta_out(db: Session, v: VentaExtra) -> VentaOut:
    return VentaOut(
        id=v.id, nro_recibo=v.nro_recibo, registro=v.registro, estudiante=nombre_estudiante(v.estudiante),
        fecha_hora=v.fecha_hora, total=v.total, vendedor=nombre_usuario(db, v.id_usuario), estado=v.estado,
        motivo_anulacion=v.motivo_anulacion, id_cierre=v.id_cierre,
        lineas=[LineaVentaOut(tipo=ln.tipo, codigo=ln.codigo_insumo or ln.codigo_tratamiento,
                              descripcion=ln.descripcion, cantidad=ln.cantidad, precio_unitario=ln.precio_unitario,
                              subtotal=ln.subtotal) for ln in v.lineas],
    )


def cierre_out(db: Session, c: CierreCaja) -> CierreOut:
    return CierreOut(
        id=c.id, fecha=c.fecha, encargado=nombre_usuario(db, c.id_usuario), cantidad_ventas=c.cantidad_ventas,
        total_sistema=c.total_sistema, efectivo_declarado=c.efectivo_declarado, diferencia=c.diferencia,
        observacion=c.observacion, estado=c.estado, recibido_por=nombre_usuario(db, c.recibido_por),
        recibido_en=c.recibido_en,
    )


def inscripciones_activas(db: Session, registro: int, id_gestion: int) -> list[Inscripcion]:
    return list(db.execute(
        select(Inscripcion).where(Inscripcion.registro == registro, Inscripcion.id_gestion == id_gestion,
                                  Inscripcion.estado == EstadoInscripcion.activa)
    ).scalars())
