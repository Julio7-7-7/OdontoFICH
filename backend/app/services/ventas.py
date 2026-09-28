"""Venta de extras en el mostrador de insumos (efectivo) y cierre de caja diario.

- Una línea puede ser un insumo suelto (a su precio unitario) o un kit completo de un tratamiento
  (al precio del tratamiento; descuenta todos los insumos del kit).
- El stock se verifica y descuenta en la misma transacción (todo o nada).
- Una venta solo se anula si todavía no entró en un cierre de caja; al anular, el stock vuelve.
- Después de cerrar caja, el encargado no puede vender más ese día.
"""

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import TZ, ahora
from app.core.enums import EstadoVenta, TipoLineaVenta, TipoMovimiento
from app.core.utils import conflicto, invalido, no_encontrado, siguiente_numero
from app.models import CierreCaja, Estudiante, Insumo, Tratamiento, Usuario, VentaExtra, VentaExtraLinea
from app.services import stock


def cierre_de(db: Session, id_usuario: int, fecha: date) -> CierreCaja | None:
    return db.execute(
        select(CierreCaja).where(CierreCaja.id_usuario == id_usuario, CierreCaja.fecha == fecha)
    ).scalar_one_or_none()


def crear_venta(
    db: Session, registro: int, lineas: list[dict], usuario: Usuario, fecha_hora: datetime | None = None
) -> VentaExtra:
    momento = fecha_hora or ahora()
    if db.get(Estudiante, registro) is None:
        raise no_encontrado("Estudiante")
    if cierre_de(db, usuario.id, momento.date()):
        raise conflicto("Ya cerró la caja de hoy: no puede registrar más ventas")
    if not lineas:
        raise invalido("La venta debe tener al menos una línea")

    requeridos: dict[str, Decimal] = defaultdict(Decimal)
    nuevas: list[VentaExtraLinea] = []
    for ln in lineas:
        cantidad = Decimal(str(ln["cantidad"]))
        if ln["tipo"] == TipoLineaVenta.insumo:
            ins = db.get(Insumo, ln["codigo"])
            if ins is None:
                raise no_encontrado(f"Insumo {ln['codigo']}")
            requeridos[ins.codigo] += cantidad
            nuevas.append(VentaExtraLinea(
                tipo=TipoLineaVenta.insumo, codigo_insumo=ins.codigo,
                descripcion=f"{ins.nombre} ({ins.unidad_medida.value})",
                cantidad=cantidad, precio_unitario=ins.precio_unitario, subtotal=ins.precio_unitario * cantidad,
            ))
        else:
            if cantidad != cantidad.to_integral_value():
                raise invalido("Los kits se venden por unidades enteras")
            trat = db.get(Tratamiento, ln["codigo"])
            if trat is None:
                raise no_encontrado(f"Tratamiento {ln['codigo']}")
            if not trat.kit:
                raise conflicto(f"El tratamiento {trat.codigo} no tiene kit configurado")
            for item in trat.kit:
                requeridos[item.codigo_insumo] += item.cantidad * cantidad
            nuevas.append(VentaExtraLinea(
                tipo=TipoLineaVenta.kit, codigo_tratamiento=trat.codigo, descripcion=f"Kit {trat.nombre}",
                cantidad=cantidad, precio_unitario=trat.precio, subtotal=trat.precio * cantidad,
            ))

    insumos = stock.verificar_disponible(db, dict(requeridos))
    venta = VentaExtra(
        nro_recibo=siguiente_numero(db, "V", momento.year),
        registro=registro,
        total=sum((ln.subtotal for ln in nuevas), Decimal("0")),
        id_usuario=usuario.id,
        lineas=nuevas,
    )
    if fecha_hora is not None:
        venta.fecha_hora = fecha_hora
    db.add(venta)
    db.flush()
    for codigo, cant in requeridos.items():
        stock.mover(db, insumos[codigo], -cant, TipoMovimiento.salida_venta, usuario.id,
                    f"Venta {venta.nro_recibo}", id_venta=venta.id, fecha_hora=fecha_hora)
    db.flush()
    return venta


def anular_venta(db: Session, venta: VentaExtra, motivo: str, usuario: Usuario) -> VentaExtra:
    if venta.estado == EstadoVenta.anulada:
        raise conflicto("La venta ya está anulada")
    if venta.id_cierre is not None:
        raise conflicto("La venta ya entró en un cierre de caja: no se puede anular")
    devolver: dict[str, Decimal] = defaultdict(Decimal)
    for ln in venta.lineas:
        if ln.tipo == TipoLineaVenta.insumo:
            devolver[ln.codigo_insumo] += ln.cantidad
        else:
            for item in db.get(Tratamiento, ln.codigo_tratamiento).kit:
                devolver[item.codigo_insumo] += item.cantidad * ln.cantidad
    insumos = stock.bloquear_insumos(db, set(devolver))
    for codigo, cant in devolver.items():
        stock.mover(db, insumos[codigo], cant, TipoMovimiento.anulacion_venta, usuario.id,
                    f"Anulación {venta.nro_recibo}: {motivo}", id_venta=venta.id)
    venta.estado = EstadoVenta.anulada
    venta.motivo_anulacion = motivo
    venta.anulado_por = usuario.id
    venta.anulado_en = ahora()
    db.flush()
    return venta


def ventas_sin_cierre(db: Session, id_usuario: int, fecha: date) -> list[VentaExtra]:
    return list(db.execute(
        select(VentaExtra).where(
            VentaExtra.id_usuario == id_usuario,
            VentaExtra.estado == EstadoVenta.vigente,
            VentaExtra.id_cierre.is_(None),
            func.date(func.timezone(TZ.key, VentaExtra.fecha_hora)) == fecha,
        ).order_by(VentaExtra.id)
    ).scalars())


def cerrar_caja(
    db: Session, usuario: Usuario, fecha: date, efectivo_declarado: Decimal, observacion: str | None
) -> CierreCaja:
    if cierre_de(db, usuario.id, fecha):
        raise conflicto(f"Ya existe un cierre de caja del {fecha} para este usuario")
    ventas = ventas_sin_cierre(db, usuario.id, fecha)
    total = sum((v.total for v in ventas), Decimal("0"))
    cierre = CierreCaja(
        fecha=fecha, id_usuario=usuario.id, cantidad_ventas=len(ventas), total_sistema=total,
        efectivo_declarado=efectivo_declarado, diferencia=efectivo_declarado - total, observacion=observacion,
    )
    db.add(cierre)
    db.flush()
    for v in ventas:
        v.id_cierre = cierre.id
    db.flush()
    return cierre
