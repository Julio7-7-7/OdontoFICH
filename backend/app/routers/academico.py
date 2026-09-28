"""Catálogos académicos: gestiones, docentes, estudiantes, materias (con su plan) y tratamientos (con su kit)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select, update

from app.core.db import DbDep
from app.core.enums import EstadoRegistro
from app.core.security import SoloAdmin, get_usuario_actual
from app.core.utils import conflicto, invalido, no_encontrado
from app.models import Docente, Estudiante, Gestion, Insumo, KitTratamiento, Materia, PlanMateria, Tratamiento
from app.schemas.catalogos import (
    DocenteIn, DocenteOut, DocenteUpdate, EstadoIn, EstudianteIn, EstudianteOut, EstudianteUpdate, GestionIn,
    GestionOut, KitItemIn, MateriaIn, MateriaOut, MateriaUpdate, PlanItemIn, TratamientoIn, TratamientoOut,
    TratamientoUpdate,
)
from app.services.serializar import materia_out, tratamiento_out

Autenticado = [Depends(get_usuario_actual)]
Busqueda = Annotated[str | None, Query(description="Texto a buscar")]
FiltroEstado = Annotated[EstadoRegistro | None, Query(description="Por defecto devuelve todos")]


def _aplicar(obj, data) -> None:
    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(obj, campo, valor)


# ---------------- Gestiones ----------------
gestiones = APIRouter(prefix="/gestiones", tags=["Gestiones"], dependencies=Autenticado)


@gestiones.get("")
def listar_gestiones(db: DbDep) -> list[GestionOut]:
    return [GestionOut.model_validate(g) for g in db.execute(select(Gestion).order_by(Gestion.anio.desc())).scalars()]


@gestiones.post("", status_code=201)
def crear_gestion(db: DbDep, _: SoloAdmin, data: GestionIn) -> GestionOut:
    if db.execute(select(Gestion).where(Gestion.anio == data.anio)).first():
        raise conflicto(f"Ya existe la gestión {data.anio}")
    g = Gestion(**data.model_dump(), activa=False)
    db.add(g)
    db.commit()
    return GestionOut.model_validate(g)


@gestiones.put("/{id_gestion}")
def editar_gestion(db: DbDep, _: SoloAdmin, id_gestion: int, data: GestionIn) -> GestionOut:
    g = db.get(Gestion, id_gestion)
    if g is None:
        raise no_encontrado("Gestión")
    _aplicar(g, data)
    db.commit()
    return GestionOut.model_validate(g)


@gestiones.patch("/{id_gestion}/activar", summary="Marca esta gestión como la activa (desactiva las demás)")
def activar_gestion(db: DbDep, _: SoloAdmin, id_gestion: int) -> GestionOut:
    g = db.get(Gestion, id_gestion)
    if g is None:
        raise no_encontrado("Gestión")
    db.execute(update(Gestion).values(activa=False))
    g.activa = True
    db.commit()
    return GestionOut.model_validate(g)


# ---------------- Docentes ----------------
docentes = APIRouter(prefix="/docentes", tags=["Docentes"], dependencies=Autenticado)


@docentes.get("")
def listar_docentes(db: DbDep, q: Busqueda = None, estado: FiltroEstado = None) -> list[DocenteOut]:
    consulta = select(Docente).order_by(Docente.apellido, Docente.nombre)
    if q:
        patron = f"%{q}%"
        consulta = consulta.where(or_(Docente.nombre.ilike(patron), Docente.apellido.ilike(patron), Docente.ci.ilike(patron)))
    if estado:
        consulta = consulta.where(Docente.estado == estado)
    return [DocenteOut.model_validate(d) for d in db.execute(consulta).scalars()]


@docentes.get("/{id_docente}")
def ver_docente(db: DbDep, id_docente: int) -> DocenteOut:
    d = db.get(Docente, id_docente)
    if d is None:
        raise no_encontrado("Docente")
    return DocenteOut.model_validate(d)


@docentes.post("", status_code=201)
def crear_docente(db: DbDep, _: SoloAdmin, data: DocenteIn) -> DocenteOut:
    if db.execute(select(Docente).where(Docente.ci == data.ci)).first():
        raise conflicto("Ya existe un docente con ese CI")
    d = Docente(**data.model_dump())
    db.add(d)
    db.commit()
    return DocenteOut.model_validate(d)


@docentes.patch("/{id_docente}")
def editar_docente(db: DbDep, _: SoloAdmin, id_docente: int, data: DocenteUpdate) -> DocenteOut:
    d = db.get(Docente, id_docente)
    if d is None:
        raise no_encontrado("Docente")
    _aplicar(d, data)
    db.commit()
    return DocenteOut.model_validate(d)


@docentes.patch("/{id_docente}/estado", summary="Baja o reactivación (no se borra)")
def estado_docente(db: DbDep, _: SoloAdmin, id_docente: int, data: EstadoIn) -> DocenteOut:
    d = db.get(Docente, id_docente)
    if d is None:
        raise no_encontrado("Docente")
    d.estado = data.estado
    db.commit()
    return DocenteOut.model_validate(d)


# ---------------- Estudiantes ----------------
estudiantes = APIRouter(prefix="/estudiantes", tags=["Estudiantes"], dependencies=Autenticado)


@estudiantes.get("")
def listar_estudiantes(
    db: DbDep, q: Busqueda = None, estado: FiltroEstado = None,
    anio_carrera: Annotated[int | None, Query(ge=1, le=5)] = None,
) -> list[EstudianteOut]:
    consulta = select(Estudiante).order_by(Estudiante.apellido, Estudiante.nombre)
    if q:
        patron = f"%{q}%"
        filtros = [Estudiante.nombre.ilike(patron), Estudiante.apellido.ilike(patron), Estudiante.ci.ilike(patron)]
        if q.isdigit():
            filtros.append(Estudiante.registro == int(q))
        consulta = consulta.where(or_(*filtros))
    if estado:
        consulta = consulta.where(Estudiante.estado == estado)
    if anio_carrera:
        consulta = consulta.where(Estudiante.anio_carrera == anio_carrera)
    return [EstudianteOut.model_validate(e) for e in db.execute(consulta).scalars()]


@estudiantes.get("/{registro}")
def ver_estudiante(db: DbDep, registro: int) -> EstudianteOut:
    e = db.get(Estudiante, registro)
    if e is None:
        raise no_encontrado("Estudiante")
    return EstudianteOut.model_validate(e)


@estudiantes.post("", status_code=201)
def crear_estudiante(db: DbDep, _: SoloAdmin, data: EstudianteIn) -> EstudianteOut:
    if db.get(Estudiante, data.registro):
        raise conflicto("Ya existe un estudiante con ese registro")
    if data.ci and db.execute(select(Estudiante).where(Estudiante.ci == data.ci)).first():
        raise conflicto("Ya existe un estudiante con ese CI")
    e = Estudiante(**data.model_dump())
    db.add(e)
    db.commit()
    return EstudianteOut.model_validate(e)


@estudiantes.patch("/{registro}")
def editar_estudiante(db: DbDep, _: SoloAdmin, registro: int, data: EstudianteUpdate) -> EstudianteOut:
    e = db.get(Estudiante, registro)
    if e is None:
        raise no_encontrado("Estudiante")
    _aplicar(e, data)
    db.commit()
    return EstudianteOut.model_validate(e)


@estudiantes.patch("/{registro}/estado", summary="Baja o reactivación (no se borra)")
def estado_estudiante(db: DbDep, _: SoloAdmin, registro: int, data: EstadoIn) -> EstudianteOut:
    e = db.get(Estudiante, registro)
    if e is None:
        raise no_encontrado("Estudiante")
    e.estado = data.estado
    db.commit()
    return EstudianteOut.model_validate(e)


# ---------------- Tratamientos y kits ----------------
tratamientos = APIRouter(prefix="/tratamientos", tags=["Tratamientos y kits"], dependencies=Autenticado)


def _tratamiento(db, codigo: str) -> Tratamiento:
    t = db.get(Tratamiento, codigo)
    if t is None:
        raise no_encontrado("Tratamiento")
    return t


@tratamientos.get("")
def listar_tratamientos(db: DbDep, q: Busqueda = None, estado: FiltroEstado = None) -> list[TratamientoOut]:
    consulta = select(Tratamiento).order_by(Tratamiento.codigo)
    if q:
        consulta = consulta.where(or_(Tratamiento.nombre.ilike(f"%{q}%"), Tratamiento.codigo.ilike(f"%{q}%")))
    if estado:
        consulta = consulta.where(Tratamiento.estado == estado)
    return [tratamiento_out(t) for t in db.execute(consulta).scalars()]


@tratamientos.get("/{codigo}")
def ver_tratamiento(db: DbDep, codigo: str) -> TratamientoOut:
    return tratamiento_out(_tratamiento(db, codigo))


@tratamientos.post("", status_code=201)
def crear_tratamiento(db: DbDep, _: SoloAdmin, data: TratamientoIn) -> TratamientoOut:
    if db.get(Tratamiento, data.codigo):
        raise conflicto("Ya existe un tratamiento con ese código")
    t = Tratamiento(**data.model_dump())
    db.add(t)
    db.commit()
    return tratamiento_out(t)


@tratamientos.patch("/{codigo}", summary="El cambio de precio rige para inscripciones y ventas futuras")
def editar_tratamiento(db: DbDep, _: SoloAdmin, codigo: str, data: TratamientoUpdate) -> TratamientoOut:
    t = _tratamiento(db, codigo)
    _aplicar(t, data)
    db.commit()
    return tratamiento_out(t)


@tratamientos.patch("/{codigo}/estado")
def estado_tratamiento(db: DbDep, _: SoloAdmin, codigo: str, data: EstadoIn) -> TratamientoOut:
    t = _tratamiento(db, codigo)
    t.estado = data.estado
    db.commit()
    return tratamiento_out(t)


@tratamientos.put("/{codigo}/kit", summary="Reemplaza el kit completo del tratamiento")
def definir_kit(db: DbDep, _: SoloAdmin, codigo: str, items: list[KitItemIn]) -> TratamientoOut:
    t = _tratamiento(db, codigo)
    codigos = [i.codigo_insumo for i in items]
    if len(codigos) != len(set(codigos)):
        raise invalido("Hay insumos repetidos en el kit")
    for c in codigos:
        if db.get(Insumo, c) is None:
            raise no_encontrado(f"Insumo {c}")
    t.kit = [KitTratamiento(codigo_insumo=i.codigo_insumo, cantidad=i.cantidad) for i in items]
    db.commit()
    db.refresh(t)
    return tratamiento_out(t)


# ---------------- Materias y plan ----------------
materias = APIRouter(prefix="/materias", tags=["Materias y plan"], dependencies=Autenticado)


def _materia(db, sigla: str) -> Materia:
    m = db.get(Materia, sigla)
    if m is None:
        raise no_encontrado("Materia")
    return m


def _validar_prerrequisito(db, sigla: str, pre: str | None) -> None:
    if pre is None:
        return
    if pre == sigla:
        raise invalido("Una materia no puede ser su propio prerrequisito")
    if db.get(Materia, pre) is None:
        raise no_encontrado(f"Materia prerrequisito {pre}")


@materias.get("")
def listar_materias(
    db: DbDep, q: Busqueda = None, estado: FiltroEstado = None,
    anio_carrera: Annotated[int | None, Query(ge=1, le=5)] = None,
) -> list[MateriaOut]:
    consulta = select(Materia).order_by(Materia.anio_carrera, Materia.sigla)
    if q:
        consulta = consulta.where(or_(Materia.nombre.ilike(f"%{q}%"), Materia.sigla.ilike(f"%{q}%")))
    if estado:
        consulta = consulta.where(Materia.estado == estado)
    if anio_carrera:
        consulta = consulta.where(Materia.anio_carrera == anio_carrera)
    return [materia_out(m) for m in db.execute(consulta).scalars()]


@materias.get("/{sigla}")
def ver_materia(db: DbDep, sigla: str) -> MateriaOut:
    return materia_out(_materia(db, sigla))


@materias.post("", status_code=201)
def crear_materia(db: DbDep, _: SoloAdmin, data: MateriaIn) -> MateriaOut:
    if db.get(Materia, data.sigla):
        raise conflicto("Ya existe una materia con esa sigla")
    _validar_prerrequisito(db, data.sigla, data.sigla_prerrequisito)
    m = Materia(**data.model_dump())
    db.add(m)
    db.commit()
    return materia_out(m)


@materias.patch("/{sigla}")
def editar_materia(db: DbDep, _: SoloAdmin, sigla: str, data: MateriaUpdate) -> MateriaOut:
    m = _materia(db, sigla)
    _validar_prerrequisito(db, sigla, data.sigla_prerrequisito)
    _aplicar(m, data)
    db.commit()
    return materia_out(m)


@materias.patch("/{sigla}/estado")
def estado_materia(db: DbDep, _: SoloAdmin, sigla: str, data: EstadoIn) -> MateriaOut:
    m = _materia(db, sigla)
    m.estado = data.estado
    db.commit()
    return materia_out(m)


@materias.put(
    "/{sigla}/plan",
    summary="Reemplaza el plan de tratamientos (rige para inscripciones futuras: las existentes conservan su monto)",
)
def definir_plan(db: DbDep, _: SoloAdmin, sigla: str, items: list[PlanItemIn]) -> MateriaOut:
    m = _materia(db, sigla)
    codigos = [i.codigo_tratamiento for i in items]
    if len(codigos) != len(set(codigos)):
        raise invalido("Hay tratamientos repetidos en el plan")
    for c in codigos:
        if db.get(Tratamiento, c) is None:
            raise no_encontrado(f"Tratamiento {c}")
    m.plan = [PlanMateria(codigo_tratamiento=i.codigo_tratamiento, cantidad=i.cantidad) for i in items]
    db.commit()
    db.refresh(m)
    return materia_out(m)
