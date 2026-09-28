from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.enums import Rol
from app.models.academico import Docente
from app.models.base import col_creado_en, col_enum


class Usuario(Base):
    __tablename__ = "usuario"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre_usuario: Mapped[str] = mapped_column(String(50), unique=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    nombre_completo: Mapped[str] = mapped_column(String(120))
    rol: Mapped[Rol] = col_enum(Rol)
    id_docente: Mapped[int | None] = mapped_column(ForeignKey("docente.id"), unique=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = col_creado_en()

    docente: Mapped[Docente | None] = relationship()
