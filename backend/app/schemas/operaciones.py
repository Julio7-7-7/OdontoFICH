from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field

from app.core.enums import (
    EstadoCierre, EstadoHabilitacion, EstadoInscripcion, EstadoPago, EstadoSesion, EstadoVenta, Modalidad,
    TipoLineaVenta, UnidadMedida,
)
from app.core.utils import Dinero

Motivo = Annotated[str, Field(min_length=3, max_length=200)]


class AnularIn(BaseModel):
    motivo: Motivo


# ---------- Inscripciones ----------
class InscripcionCreate(BaseModel):
    registro: int
    siglas: Annotated[list[str], Field(min_length=1)]
    id_gestion: int | None = Field(default=None, description="Por defecto, la gestión activa")


class InscripcionOut(BaseModel):
    id: int
    registro: int
    sigla: str
    materia: str
    anio: int
    monto: Dinero
    estado: EstadoInscripcion
    creado_en: datetime
    motivo_anulacion: str | None


# ---------- Cuenta y pagos ----------
class CuotaOut(BaseModel):
    nro: int
    monto: Dinero
    pagado: Dinero
    saldo: Dinero
    estado: str = Field(description="pagada | parcial | pendiente | no_aplica")
    fecha_vencimiento: date
    cubre: str


class PagoOut(BaseModel):
    id: int
    nro_recibo: str
    registro: int
    estudiante: str
    anio: int
    monto: Dinero
    fecha_hora: datetime
    cajero: str
    estado: EstadoPago
    observacion: str | None
    motivo_anulacion: str | None


class EstadoCuentaOut(BaseModel):
    registro: int
    estudiante: str
    id_gestion: int
    anio: int
    modalidad: Modalidad
    total: Dinero
    pagado: Dinero
    saldo: Dinero
    cuotas: list[CuotaOut]
    cubre_semestre_1: bool
    cubre_semestre_2: bool
    semestre_actual: int
    habilitado_hoy: bool = Field(description="¿Puede retirar material para una práctica de hoy?")
    motivo_bloqueo_hoy: str | None
    inscripciones: list[InscripcionOut]
    pagos: list[PagoOut]


class ModalidadIn(BaseModel):
    modalidad: Modalidad
    id_gestion: int | None = None


class PagoCreate(BaseModel):
    registro: int
    monto: Annotated[Decimal, Field(gt=0)]
    id_gestion: int | None = None
    observacion: str | None = Field(default=None, max_length=200)


class PagoRegistradoOut(BaseModel):
    pago: PagoOut
    estado_cuenta: EstadoCuentaOut


# ---------- Sesiones de práctica ----------
class SesionUpdate(BaseModel):
    fecha: date | None = None
    observacion: str | None = Field(default=None, max_length=200)


class SesionCreate(BaseModel):
    sigla: str
    codigo_tratamiento: str
    fecha: date
    id_docente: int | None = Field(default=None, description="Solo el administrador lo indica; el docente usa el suyo")
    observacion: str | None = Field(default=None, max_length=200)
    registros: list[int] = Field(default=[], description="Estudiantes que el docente habilita")


class MarcarIn(BaseModel):
    registros: Annotated[list[int], Field(min_length=1)]


class HabilitacionOut(BaseModel):
    id: int
    registro: int
    estudiante: str
    estado: EstadoHabilitacion
    motivo: str | None
    realizados: int
    requeridos: int
    entregado_en: datetime | None


class CandidatoOut(BaseModel):
    registro: int
    estudiante: str
    en_sesion: bool
    realizados: int
    requeridos: int
    quedaria_habilitado: bool
    motivo: str | None


class SesionResumenOut(BaseModel):
    id: int
    fecha: date
    sigla: str
    materia: str
    codigo_tratamiento: str
    tratamiento: str
    id_docente: int
    docente: str
    estado: EstadoSesion
    observacion: str | None
    habilitados: int
    bloqueados: int
    entregados: int


class SesionOut(SesionResumenOut):
    habilitaciones: list[HabilitacionOut]


# ---------- Entregas ----------
class KitLineaOut(BaseModel):
    codigo_insumo: str
    insumo: str
    unidad_medida: UnidadMedida
    cantidad: Dinero
    stock_actual: Dinero


class PendienteOut(BaseModel):
    id_habilitacion: int
    registro: int
    estudiante: str
    estado: EstadoHabilitacion
    motivo: str | None
    id_sesion: int
    fecha: date
    sigla: str
    materia: str
    codigo_tratamiento: str
    tratamiento: str
    docente: str
    kit: list[KitLineaOut]
    stock_suficiente: bool


class EntregaCreate(BaseModel):
    id_habilitacion: int


class EntregaInsumoOut(BaseModel):
    codigo_insumo: str
    insumo: str
    cantidad: Dinero
    stock_resultante: Dinero


class EntregaOut(BaseModel):
    id: int
    id_habilitacion: int
    registro: int
    estudiante: str
    sigla: str
    codigo_tratamiento: str
    tratamiento: str
    fecha_hora: datetime
    encargado: str
    insumos: list[EntregaInsumoOut]
    realizados: int
    requeridos: int


# ---------- Ventas de extras y cierre ----------
class LineaVentaIn(BaseModel):
    tipo: TipoLineaVenta
    codigo: str = Field(description="Código del insumo o del tratamiento (kit)")
    cantidad: Annotated[Decimal, Field(gt=0)]


class VentaCreate(BaseModel):
    registro: int
    lineas: Annotated[list[LineaVentaIn], Field(min_length=1)]


class LineaVentaOut(BaseModel):
    tipo: TipoLineaVenta
    codigo: str
    descripcion: str
    cantidad: Dinero
    precio_unitario: Dinero
    subtotal: Dinero


class VentaOut(BaseModel):
    id: int
    nro_recibo: str
    registro: int
    estudiante: str
    fecha_hora: datetime
    total: Dinero
    vendedor: str
    estado: EstadoVenta
    motivo_anulacion: str | None
    id_cierre: int | None
    lineas: list[LineaVentaOut]


class CierrePreviewOut(BaseModel):
    fecha: date
    ya_cerrado: bool
    cantidad_ventas: int
    total_sistema: Dinero
    ventas: list[VentaOut]


class CierreCreate(BaseModel):
    efectivo_declarado: Annotated[Decimal, Field(ge=0, description="Efectivo contado en la caja")]
    fecha: date | None = Field(default=None, description="Por defecto, hoy")
    observacion: str | None = Field(default=None, max_length=200)


class CierreOut(BaseModel):
    id: int
    fecha: date
    encargado: str
    cantidad_ventas: int
    total_sistema: Dinero
    efectivo_declarado: Dinero
    diferencia: Dinero
    observacion: str | None
    estado: EstadoCierre
    recibido_por: str | None
    recibido_en: datetime | None
