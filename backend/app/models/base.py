from enum import StrEnum

from sqlalchemy import DateTime, Enum, Numeric, func
from sqlalchemy.orm import mapped_column


def col_enum(enum_cls: type[StrEnum], **kw):
    """Enum guardado como VARCHAR + CHECK (más simple de migrar que un ENUM nativo)."""
    return mapped_column(Enum(enum_cls, native_enum=False, length=30, validate_strings=True), **kw)


def col_dinero(**kw):
    return mapped_column(Numeric(12, 2), **kw)


def col_cantidad(**kw):
    return mapped_column(Numeric(12, 2), **kw)


def col_creado_en():
    return mapped_column(DateTime(timezone=True), server_default=func.now())
