from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.enums import EstadoRegistro
from app.models.base import col_cantidad, col_creado_en, col_dinero, col_enum


class Gestion(Base):
    """Año académico. La fecha de corte separa el 1er semestre (cuota 1) del 2do (cuota 2)."""

    __tablename__ = "gestion"
    __table_args__ = (
        CheckConstraint("fecha_inicio < fecha_corte AND fecha_corte < fecha_fin", name="ck_gestion_fechas"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    anio: Mapped[int] = mapped_column(Integer, unique=True)
    fecha_inicio: Mapped[date] = mapped_column(Date)
    fecha_corte: Mapped[date] = mapped_column(Date)
    fecha_fin: Mapped[date] = mapped_column(Date)
    activa: Mapped[bool] = mapped_column(Boolean, default=False)


class Docente(Base):
    __tablename__ = "docente"

    id: Mapped[int] = mapped_column(primary_key=True)
    ci: Mapped[str] = mapped_column(String(20), unique=True)
    nombre: Mapped[str] = mapped_column(String(80))
    apellido: Mapped[str] = mapped_column(String(80))
    telefono: Mapped[str | None] = mapped_column(String(20))
    especialidad: Mapped[str | None] = mapped_column(String(80))
    estado: Mapped[EstadoRegistro] = col_enum(EstadoRegistro, default=EstadoRegistro.activo)
    creado_en: Mapped[datetime] = col_creado_en()


class Estudiante(Base):
    __tablename__ = "estudiante"
    __table_args__ = (CheckConstraint("anio_carrera BETWEEN 1 AND 5", name="ck_estudiante_anio"),)

    registro: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    ci: Mapped[str | None] = mapped_column(String(20), unique=True)
    nombre: Mapped[str] = mapped_column(String(80))
    apellido: Mapped[str] = mapped_column(String(80))
    telefono: Mapped[str | None] = mapped_column(String(20))
    anio_carrera: Mapped[int] = mapped_column(Integer)
    estado: Mapped[EstadoRegistro] = col_enum(EstadoRegistro, default=EstadoRegistro.activo)
    creado_en: Mapped[datetime] = col_creado_en()


class Materia(Base):
    __tablename__ = "materia"
    __table_args__ = (CheckConstraint("anio_carrera BETWEEN 1 AND 5", name="ck_materia_anio"),)

    sigla: Mapped[str] = mapped_column(String(10), primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100))
    anio_carrera: Mapped[int] = mapped_column(Integer)
    creditos: Mapped[int] = mapped_column(Integer, default=0)
    horas_teoricas: Mapped[int] = mapped_column(Integer, default=0)
    horas_practicas: Mapped[int] = mapped_column(Integer, default=0)
    sigla_prerrequisito: Mapped[str | None] = mapped_column(ForeignKey("materia.sigla"))
    estado: Mapped[EstadoRegistro] = col_enum(EstadoRegistro, default=EstadoRegistro.activo)

    plan: Mapped[list["PlanMateria"]] = relationship(back_populates="materia", cascade="all, delete-orphan")

    @property
    def precio(self) -> Decimal:
        """Precio de la materia = Σ (veces × precio del tratamiento) de su plan."""
        return sum((p.cantidad * p.tratamiento.precio for p in self.plan), Decimal("0"))


class Tratamiento(Base):
    """Trabajo clínico. Su precio incluye el kit de insumos que se entrega."""

    __tablename__ = "tratamiento"
    __table_args__ = (CheckConstraint("precio >= 0", name="ck_tratamiento_precio"),)

    codigo: Mapped[str] = mapped_column(String(20), primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100))
    precio: Mapped[Decimal] = col_dinero()
    estado: Mapped[EstadoRegistro] = col_enum(EstadoRegistro, default=EstadoRegistro.activo)

    kit: Mapped[list["KitTratamiento"]] = relationship(back_populates="tratamiento", cascade="all, delete-orphan")


class PlanMateria(Base):
    """Qué tratamientos exige una materia y cuántas veces."""

    __tablename__ = "plan_materia"
    __table_args__ = (CheckConstraint("cantidad > 0", name="ck_plan_cantidad"),)

    sigla: Mapped[str] = mapped_column(ForeignKey("materia.sigla"), primary_key=True)
    codigo_tratamiento: Mapped[str] = mapped_column(ForeignKey("tratamiento.codigo"), primary_key=True)
    cantidad: Mapped[int] = mapped_column(Integer)

    materia: Mapped[Materia] = relationship(back_populates="plan")
    tratamiento: Mapped[Tratamiento] = relationship(lazy="joined")


class KitTratamiento(Base):
    """Insumos (y cantidades) que forman el kit de un tratamiento."""

    __tablename__ = "kit_tratamiento"
    __table_args__ = (CheckConstraint("cantidad > 0", name="ck_kit_cantidad"),)

    codigo_tratamiento: Mapped[str] = mapped_column(ForeignKey("tratamiento.codigo"), primary_key=True)
    codigo_insumo: Mapped[str] = mapped_column(ForeignKey("insumo.codigo"), primary_key=True)
    cantidad: Mapped[Decimal] = col_cantidad()

    tratamiento: Mapped[Tratamiento] = relationship(back_populates="kit")
    insumo: Mapped["Insumo"] = relationship(lazy="joined")  # noqa: F821
