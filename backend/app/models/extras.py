from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.enums import EstadoCierre, EstadoVenta, TipoLineaVenta
from app.models.academico import Estudiante
from app.models.base import col_cantidad, col_creado_en, col_dinero, col_enum


class CierreCaja(Base):
    """Cierre diario del efectivo de extras que el encargado rinde a administración."""

    __tablename__ = "cierre_caja"
    __table_args__ = (UniqueConstraint("fecha", "id_usuario", name="uq_cierre_fecha_usuario"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    fecha: Mapped[date] = mapped_column(Date)
    id_usuario: Mapped[int] = mapped_column(ForeignKey("usuario.id"))
    cantidad_ventas: Mapped[int] = mapped_column(Integer)
    total_sistema: Mapped[Decimal] = col_dinero()
    efectivo_declarado: Mapped[Decimal] = col_dinero()
    diferencia: Mapped[Decimal] = col_dinero()
    observacion: Mapped[str | None] = mapped_column(String(200))
    estado: Mapped[EstadoCierre] = col_enum(EstadoCierre, default=EstadoCierre.pendiente)
    recibido_por: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    recibido_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    creado_en: Mapped[datetime] = col_creado_en()


class VentaExtra(Base):
    """Venta de material extra (insumo suelto o kit completo) en el mostrador de insumos, en efectivo."""

    __tablename__ = "venta_extra"

    id: Mapped[int] = mapped_column(primary_key=True)
    nro_recibo: Mapped[str] = mapped_column(String(20), unique=True)
    registro: Mapped[int] = mapped_column(ForeignKey("estudiante.registro"), index=True)
    fecha_hora: Mapped[datetime] = col_creado_en()
    total: Mapped[Decimal] = col_dinero()
    id_usuario: Mapped[int] = mapped_column(ForeignKey("usuario.id"))
    estado: Mapped[EstadoVenta] = col_enum(EstadoVenta, default=EstadoVenta.vigente)
    motivo_anulacion: Mapped[str | None] = mapped_column(String(200))
    anulado_por: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    anulado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    id_cierre: Mapped[int | None] = mapped_column(ForeignKey("cierre_caja.id"))

    lineas: Mapped[list["VentaExtraLinea"]] = relationship(cascade="all, delete-orphan", order_by="VentaExtraLinea.id")
    estudiante: Mapped[Estudiante] = relationship()


class VentaExtraLinea(Base):
    __tablename__ = "venta_extra_linea"
    __table_args__ = (
        CheckConstraint("cantidad > 0", name="ck_linea_cantidad"),
        CheckConstraint(
            "(tipo = 'insumo' AND codigo_insumo IS NOT NULL AND codigo_tratamiento IS NULL) OR "
            "(tipo = 'kit' AND codigo_tratamiento IS NOT NULL AND codigo_insumo IS NULL)",
            name="ck_linea_tipo",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    id_venta: Mapped[int] = mapped_column(ForeignKey("venta_extra.id"))
    tipo: Mapped[TipoLineaVenta] = col_enum(TipoLineaVenta)
    codigo_insumo: Mapped[str | None] = mapped_column(ForeignKey("insumo.codigo"))
    codigo_tratamiento: Mapped[str | None] = mapped_column(ForeignKey("tratamiento.codigo"))
    descripcion: Mapped[str] = mapped_column(String(120))
    cantidad: Mapped[Decimal] = col_cantidad()
    precio_unitario: Mapped[Decimal] = col_dinero()
    subtotal: Mapped[Decimal] = col_dinero()
