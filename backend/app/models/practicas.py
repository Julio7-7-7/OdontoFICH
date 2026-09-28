from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.enums import EstadoHabilitacion, EstadoSesion
from app.models.academico import Docente, Estudiante, Gestion, Materia, Tratamiento
from app.models.base import col_creado_en, col_enum


class SesionPractica(Base):
    """Práctica programada por el docente: qué tratamiento de qué materia, qué día.
    Es el equivalente digital de firmar las hojas de historia clínica."""

    __tablename__ = "sesion_practica"

    id: Mapped[int] = mapped_column(primary_key=True)
    id_gestion: Mapped[int] = mapped_column(ForeignKey("gestion.id"))
    id_docente: Mapped[int] = mapped_column(ForeignKey("docente.id"), index=True)
    sigla: Mapped[str] = mapped_column(ForeignKey("materia.sigla"))
    codigo_tratamiento: Mapped[str] = mapped_column(ForeignKey("tratamiento.codigo"))
    fecha: Mapped[date] = mapped_column(Date, index=True)
    estado: Mapped[EstadoSesion] = col_enum(EstadoSesion, default=EstadoSesion.abierta)
    observacion: Mapped[str | None] = mapped_column(String(200))
    creado_por: Mapped[int] = mapped_column(ForeignKey("usuario.id"))
    creado_en: Mapped[datetime] = col_creado_en()

    gestion: Mapped[Gestion] = relationship()
    docente: Mapped[Docente] = relationship()
    materia: Mapped[Materia] = relationship()
    tratamiento: Mapped[Tratamiento] = relationship()
    habilitaciones: Mapped[list["Habilitacion"]] = relationship(back_populates="sesion", order_by="Habilitacion.id")


class Habilitacion(Base):
    """Estudiante marcado por el docente en una sesión. El sistema decide si queda habilitado o bloqueado."""

    __tablename__ = "habilitacion"
    __table_args__ = (UniqueConstraint("id_sesion", "registro", name="uq_habilitacion_sesion_estudiante"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    id_sesion: Mapped[int] = mapped_column(ForeignKey("sesion_practica.id"))
    registro: Mapped[int] = mapped_column(ForeignKey("estudiante.registro"), index=True)
    estado: Mapped[EstadoHabilitacion] = col_enum(EstadoHabilitacion)
    motivo: Mapped[str | None] = mapped_column(String(200))
    marcado_en: Mapped[datetime] = col_creado_en()

    sesion: Mapped[SesionPractica] = relationship(back_populates="habilitaciones")
    estudiante: Mapped[Estudiante] = relationship()
    entrega: Mapped["EntregaKit | None"] = relationship(back_populates="habilitacion")


class EntregaKit(Base):
    """El encargado entregó el kit al estudiante habilitado. Cuenta como un tratamiento realizado del plan."""

    __tablename__ = "entrega_kit"

    id: Mapped[int] = mapped_column(primary_key=True)
    id_habilitacion: Mapped[int] = mapped_column(ForeignKey("habilitacion.id"), unique=True)
    fecha_hora: Mapped[datetime] = col_creado_en()
    id_usuario: Mapped[int] = mapped_column(ForeignKey("usuario.id"))

    habilitacion: Mapped[Habilitacion] = relationship(back_populates="entrega")
