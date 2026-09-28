from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import EstadoRegistro, Rol, TipoMovimiento, UnidadMedida
from app.core.utils import Dinero

Texto = Annotated[str, Field(min_length=1, max_length=120)]
Codigo = Annotated[str, Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9\-]+$")]


class Orm(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class EstadoIn(BaseModel):
    estado: EstadoRegistro


# ---------- Usuarios ----------
class UsuarioOut(Orm):
    id: int
    nombre_usuario: str
    nombre_completo: str
    rol: Rol
    id_docente: int | None
    activo: bool


class UsuarioCreate(BaseModel):
    nombre_usuario: Annotated[str, Field(min_length=3, max_length=50)]
    password: Annotated[str, Field(min_length=6, max_length=72)]
    nombre_completo: Texto
    rol: Rol
    id_docente: int | None = Field(default=None, description="Obligatorio si el rol es docente")


class UsuarioUpdate(BaseModel):
    nombre_completo: Texto | None = None
    rol: Rol | None = None
    id_docente: int | None = None
    activo: bool | None = None


class PasswordIn(BaseModel):
    password: Annotated[str, Field(min_length=6, max_length=72)]


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioOut


# ---------- Gestión ----------
class GestionIn(BaseModel):
    anio: Annotated[int, Field(ge=2000, le=2100)]
    fecha_inicio: date
    fecha_corte: date = Field(description="Desde esta fecha empieza el 2do semestre (se exige la cuota 2)")
    fecha_fin: date

    @model_validator(mode="after")
    def fechas_en_orden(self):
        if not (self.fecha_inicio < self.fecha_corte < self.fecha_fin):
            raise ValueError("Debe cumplirse fecha_inicio < fecha_corte < fecha_fin")
        return self


class GestionOut(Orm):
    id: int
    anio: int
    fecha_inicio: date
    fecha_corte: date
    fecha_fin: date
    activa: bool


# ---------- Docentes ----------
class DocenteIn(BaseModel):
    ci: Annotated[str, Field(min_length=4, max_length=20)]
    nombre: Texto
    apellido: Texto
    telefono: str | None = None
    especialidad: str | None = None


class DocenteUpdate(BaseModel):
    ci: str | None = None
    nombre: str | None = None
    apellido: str | None = None
    telefono: str | None = None
    especialidad: str | None = None


class DocenteOut(Orm):
    id: int
    ci: str
    nombre: str
    apellido: str
    telefono: str | None
    especialidad: str | None
    estado: EstadoRegistro


# ---------- Estudiantes ----------
class EstudianteIn(BaseModel):
    registro: Annotated[int, Field(gt=0)]
    ci: str | None = None
    nombre: Texto
    apellido: Texto
    telefono: str | None = None
    anio_carrera: Annotated[int, Field(ge=1, le=5)]


class EstudianteUpdate(BaseModel):
    ci: str | None = None
    nombre: str | None = None
    apellido: str | None = None
    telefono: str | None = None
    anio_carrera: Annotated[int | None, Field(ge=1, le=5)] = None


class EstudianteOut(Orm):
    registro: int
    ci: str | None
    nombre: str
    apellido: str
    telefono: str | None
    anio_carrera: int
    estado: EstadoRegistro


# ---------- Insumos ----------
class InsumoIn(BaseModel):
    codigo: Codigo
    nombre: Texto
    unidad_medida: UnidadMedida
    precio_unitario: Annotated[Decimal, Field(ge=0, decimal_places=2)]
    stock_minimo: Annotated[Decimal, Field(ge=0)] = Decimal("0")
    stock_inicial: Annotated[Decimal, Field(ge=0)] = Field(
        default=Decimal("0"), description="Se registra como una entrada en el kardex"
    )


class InsumoUpdate(BaseModel):
    nombre: str | None = None
    unidad_medida: UnidadMedida | None = None
    precio_unitario: Annotated[Decimal | None, Field(ge=0)] = None
    stock_minimo: Annotated[Decimal | None, Field(ge=0)] = None


class InsumoOut(Orm):
    codigo: str
    nombre: str
    unidad_medida: UnidadMedida
    precio_unitario: Dinero
    stock: Dinero
    stock_minimo: Dinero
    bajo_minimo: bool
    estado: EstadoRegistro


class EntradaIn(BaseModel):
    cantidad: Annotated[Decimal, Field(gt=0)]
    observacion: str | None = Field(default=None, max_length=200)


class AjusteIn(BaseModel):
    stock_contado: Annotated[Decimal, Field(ge=0, description="Lo que hay físicamente en la estantería")]
    motivo: Annotated[str, Field(min_length=3, max_length=200)]


class MovimientoOut(BaseModel):
    id: int
    tipo: TipoMovimiento
    cantidad: Dinero
    stock_resultante: Dinero
    fecha_hora: datetime
    usuario: str
    observacion: str | None
    id_entrega: int | None
    id_venta: int | None


# ---------- Tratamientos y kits ----------
class TratamientoIn(BaseModel):
    codigo: Codigo
    nombre: Texto
    precio: Annotated[Decimal, Field(ge=0)]


class TratamientoUpdate(BaseModel):
    nombre: str | None = None
    precio: Annotated[Decimal | None, Field(ge=0)] = None


class KitItemIn(BaseModel):
    codigo_insumo: str
    cantidad: Annotated[Decimal, Field(gt=0)]


class KitItemOut(BaseModel):
    codigo_insumo: str
    nombre: str
    unidad_medida: UnidadMedida
    cantidad: Dinero
    costo: Dinero


class TratamientoOut(BaseModel):
    codigo: str
    nombre: str
    precio: Dinero
    estado: EstadoRegistro
    kit: list[KitItemOut]
    costo_kit: Dinero = Field(description="Σ cantidad × precio unitario de los insumos del kit")


# ---------- Materias y plan ----------
class MateriaIn(BaseModel):
    sigla: Codigo
    nombre: Texto
    anio_carrera: Annotated[int, Field(ge=1, le=5)]
    creditos: Annotated[int, Field(ge=0)] = 0
    horas_teoricas: Annotated[int, Field(ge=0)] = 0
    horas_practicas: Annotated[int, Field(ge=0)] = 0
    sigla_prerrequisito: str | None = None


class MateriaUpdate(BaseModel):
    nombre: str | None = None
    anio_carrera: Annotated[int | None, Field(ge=1, le=5)] = None
    creditos: int | None = None
    horas_teoricas: int | None = None
    horas_practicas: int | None = None
    sigla_prerrequisito: str | None = None


class PlanItemIn(BaseModel):
    codigo_tratamiento: str
    cantidad: Annotated[int, Field(gt=0, description="Veces que el estudiante debe realizarlo")]


class PlanItemOut(BaseModel):
    codigo_tratamiento: str
    tratamiento: str
    cantidad: int
    precio_unitario: Dinero
    subtotal: Dinero


class MateriaOut(BaseModel):
    sigla: str
    nombre: str
    anio_carrera: int
    creditos: int
    horas_teoricas: int
    horas_practicas: int
    sigla_prerrequisito: str | None
    estado: EstadoRegistro
    precio: Dinero = Field(description="Σ subtotales del plan")
    plan: list[PlanItemOut]
