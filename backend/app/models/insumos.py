from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.enums import EstadoRegistro, TipoMovimiento, UnidadMedida
from app.models.base import col_cantidad, col_creado_en, col_dinero, col_enum


class Insumo(Base):
    __tablename__ = "insumo"
    __table_args__ = (
        CheckConstraint("stock >= 0", name="ck_insumo_stock"),
        CheckConstraint("stock_minimo >= 0", name="ck_insumo_minimo"),
        CheckConstraint("precio_unitario >= 0", name="ck_insumo_precio"),
    )

    codigo: Mapped[str] = mapped_column(String(20), primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100))
    unidad_medida: Mapped[UnidadMedida] = col_enum(UnidadMedida)
    precio_unitario: Mapped[Decimal] = col_dinero()
    stock: Mapped[Decimal] = col_cantidad(default=Decimal("0"))
    stock_minimo: Mapped[Decimal] = col_cantidad(default=Decimal("0"))
    estado: Mapped[EstadoRegistro] = col_enum(EstadoRegistro, default=EstadoRegistro.activo)


class MovimientoStock(Base):
    """Kardex: cada entrada o salida de un insumo. `cantidad` es con signo (+ entra, − sale)."""

    __tablename__ = "movimiento_stock"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo_insumo: Mapped[str] = mapped_column(ForeignKey("insumo.codigo"), index=True)
    tipo: Mapped[TipoMovimiento] = col_enum(TipoMovimiento)
    cantidad: Mapped[Decimal] = col_cantidad()
    stock_resultante: Mapped[Decimal] = col_cantidad()
    fecha_hora: Mapped[datetime] = col_creado_en()
    id_usuario: Mapped[int] = mapped_column(ForeignKey("usuario.id"))
    id_entrega: Mapped[int | None] = mapped_column(ForeignKey("entrega_kit.id"))
    id_venta: Mapped[int | None] = mapped_column(ForeignKey("venta_extra.id"))
    observacion: Mapped[str | None] = mapped_column(String(200))
