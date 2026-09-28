from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.enums import EstadoInscripcion, EstadoPago, Modalidad
from app.models.academico import Estudiante, Gestion, Materia
from app.models.base import col_creado_en, col_dinero, col_enum


class Inscripcion(Base):
    """Estudiante inscrito a una materia en una gestión. `monto` congela el precio de la materia al inscribirse."""

    __tablename__ = "inscripcion"
    __table_args__ = (
        Index(
            "uq_inscripcion_activa", "registro", "sigla", "id_gestion",
            unique=True, postgresql_where=text("estado = 'activa'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    registro: Mapped[int] = mapped_column(ForeignKey("estudiante.registro"), index=True)
    sigla: Mapped[str] = mapped_column(ForeignKey("materia.sigla"))
    id_gestion: Mapped[int] = mapped_column(ForeignKey("gestion.id"))
    monto: Mapped[Decimal] = col_dinero()
    estado: Mapped[EstadoInscripcion] = col_enum(EstadoInscripcion, default=EstadoInscripcion.activa)
    id_usuario: Mapped[int] = mapped_column(ForeignKey("usuario.id"))
    creado_en: Mapped[datetime] = col_creado_en()
    motivo_anulacion: Mapped[str | None] = mapped_column(String(200))

    estudiante: Mapped[Estudiante] = relationship()
    materia: Mapped[Materia] = relationship()
    gestion: Mapped[Gestion] = relationship()


class CuentaAnual(Base):
    """Deuda anual del estudiante en una gestión (Σ montos de sus inscripciones activas)."""

    __tablename__ = "cuenta_anual"
    __table_args__ = (UniqueConstraint("registro", "id_gestion", name="uq_cuenta_estudiante_gestion"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    registro: Mapped[int] = mapped_column(ForeignKey("estudiante.registro"))
    id_gestion: Mapped[int] = mapped_column(ForeignKey("gestion.id"))
    modalidad: Mapped[Modalidad] = col_enum(Modalidad, default=Modalidad.cuotas)

    cuotas: Mapped[list["Cuota"]] = relationship(order_by="Cuota.nro", cascade="all, delete-orphan")
    estudiante: Mapped[Estudiante] = relationship()
    gestion: Mapped[Gestion] = relationship()


class Cuota(Base):
    """Siempre 2 por cuenta. Al contado: cuota 1 = total y cuota 2 = 0.
    La cuota 1 cubre las prácticas del 1er semestre; la cuota 2, las del 2do."""

    __tablename__ = "cuota"
    __table_args__ = (
        UniqueConstraint("id_cuenta", "nro", name="uq_cuota_nro"),
        CheckConstraint("nro IN (1, 2)", name="ck_cuota_nro"),
        CheckConstraint("monto >= 0", name="ck_cuota_monto"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    id_cuenta: Mapped[int] = mapped_column(ForeignKey("cuenta_anual.id"))
    nro: Mapped[int] = mapped_column(Integer)
    monto: Mapped[Decimal] = col_dinero()
    fecha_vencimiento: Mapped[date] = mapped_column(Date)


class Pago(Base):
    """Pago a la cuenta anual. Se aplica en orden: primero cubre la cuota 1 y el resto la cuota 2."""

    __tablename__ = "pago"
    __table_args__ = (CheckConstraint("monto > 0", name="ck_pago_monto"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    nro_recibo: Mapped[str] = mapped_column(String(20), unique=True)
    id_cuenta: Mapped[int] = mapped_column(ForeignKey("cuenta_anual.id"), index=True)
    monto: Mapped[Decimal] = col_dinero()
    fecha_hora: Mapped[datetime] = col_creado_en()
    id_usuario: Mapped[int] = mapped_column(ForeignKey("usuario.id"))
    estado: Mapped[EstadoPago] = col_enum(EstadoPago, default=EstadoPago.vigente)
    observacion: Mapped[str | None] = mapped_column(String(200))
    motivo_anulacion: Mapped[str | None] = mapped_column(String(200))
    anulado_por: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    anulado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    cuenta: Mapped[CuentaAnual] = relationship()


class Correlativo(Base):
    """Numeración de recibos por tipo y año (R-2026-000001, V-2026-000001)."""

    __tablename__ = "correlativo"

    clave: Mapped[str] = mapped_column(String(20), primary_key=True)
    ultimo: Mapped[int] = mapped_column(Integer, default=0)
