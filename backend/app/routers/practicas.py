"""Sesiones de práctica (docente habilita) y entrega de kits (encargado de insumos)."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select

from app.core.config import TZ, hoy
from app.core.db import DbDep
from app.core.enums import EstadoHabilitacion, EstadoInscripcion, EstadoSesion, Rol
from app.core.security import requiere_rol
from app.core.utils import conflicto, invalido, no_encontrado
from app.models import (
    Docente, EntregaKit, Estudiante, Habilitacion, Inscripcion, Materia, PlanMateria, SesionPractica, Usuario,
)
from app.schemas.operaciones import (
    AnularIn, CandidatoOut, EntregaCreate, EntregaOut, MarcarIn, PendienteOut, SesionCreate, SesionOut, SesionResumenOut,
    SesionUpdate,
)
from app.services import cuentas, practicas
from app.services.serializar import entrega_out, nombre_estudiante, pendiente_out, sesion_out, sesion_resumen_out

DocenteDep = Annotated[Usuario, Depends(requiere_rol(Rol.docente))]
EncargadoDep = Annotated[Usuario, Depends(requiere_rol(Rol.encargado_insumos))]

sesiones = APIRouter(prefix="/sesiones", tags=["Docente: sesiones de práctica"])


def _sesion(db, id_sesion: int, usuario: Usuario) -> SesionPractica:
    s = db.get(SesionPractica, id_sesion)
    if s is None:
        raise no_encontrado("Sesión de práctica")
    if usuario.rol == Rol.docente and s.id_docente != usuario.id_docente:
        raise no_encontrado("Sesión de práctica")
    return s


def _sin_entregas(s: SesionPractica, accion: str) -> None:
    if any(h.estado == EstadoHabilitacion.entregado for h in s.habilitaciones):
        raise conflicto(f"No se puede {accion}: ya se entregó material en esta sesión")


def _reevaluar(db, s: SesionPractica) -> None:
    for h in s.habilitaciones:
        practicas.evaluar(db, h)
    db.commit()


def _marcar(db, s: SesionPractica, registros: list[int]) -> None:
    no_inscritos = []
    for registro in dict.fromkeys(registros):
        if db.get(Estudiante, registro) is None:
            raise no_encontrado(f"Estudiante {registro}")
        if not practicas.esta_inscrito(db, registro, s.sigla, s.id_gestion):
            no_inscritos.append(registro)
    if no_inscritos:
        raise invalido(f"No están inscritos en {s.sigla} en esta gestión: {no_inscritos}")
    existentes = {h.registro: h for h in s.habilitaciones}
    for registro in dict.fromkeys(registros):
        h = existentes.get(registro)
        if h is None:
            h = Habilitacion(registro=registro, estado=EstadoHabilitacion.bloqueado)
            s.habilitaciones.append(h)
            db.flush()
        elif h.estado == EstadoHabilitacion.retirado:
            h.estado = EstadoHabilitacion.bloqueado
        practicas.evaluar(db, h)
    db.flush()


@sesiones.get("", summary="Sesiones (el docente solo ve las suyas)")
def listar_sesiones(
    db: DbDep,
    usuario: DocenteDep,
    fecha: date | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    sigla: str | None = None,
    id_docente: int | None = None,
    estado: EstadoSesion | None = None,
) -> list[SesionResumenOut]:
    consulta = select(SesionPractica).order_by(SesionPractica.fecha.desc(), SesionPractica.id.desc())
    if usuario.rol == Rol.docente:
        id_docente = usuario.id_docente
    if id_docente:
        consulta = consulta.where(SesionPractica.id_docente == id_docente)
    if fecha:
        consulta = consulta.where(SesionPractica.fecha == fecha)
    if desde:
        consulta = consulta.where(SesionPractica.fecha >= desde)
    if hasta:
        consulta = consulta.where(SesionPractica.fecha <= hasta)
    if sigla:
        consulta = consulta.where(SesionPractica.sigla == sigla)
    if estado:
        consulta = consulta.where(SesionPractica.estado == estado)
    return [sesion_resumen_out(s) for s in db.execute(consulta).scalars()]


@sesiones.get("/{id_sesion}", summary="Detalle con el estado actualizado de cada estudiante")
def ver_sesion(db: DbDep, usuario: DocenteDep, id_sesion: int) -> SesionOut:
    s = _sesion(db, id_sesion, usuario)
    _reevaluar(db, s)
    return sesion_out(db, s)


@sesiones.get(
    "/{id_sesion}/candidatos",
    summary="Inscritos en la materia de la sesión y si quedarían habilitados o bloqueados (antes de marcarlos)",
)
def candidatos(db: DbDep, usuario: DocenteDep, id_sesion: int) -> list[CandidatoOut]:
    s = _sesion(db, id_sesion, usuario)
    marcados = {h.registro for h in s.habilitaciones if h.estado != EstadoHabilitacion.retirado}
    inscritos = db.execute(
        select(Inscripcion).join(Estudiante)
        .where(Inscripcion.sigla == s.sigla, Inscripcion.id_gestion == s.id_gestion,
               Inscripcion.estado == EstadoInscripcion.activa)
        .order_by(Estudiante.apellido, Estudiante.nombre)
    ).scalars()
    req = practicas.requeridos(db, s.sigla, s.codigo_tratamiento)
    salida = []
    for i in inscritos:
        motivo = practicas.motivo_bloqueo(db, s, i.registro)
        salida.append(CandidatoOut(
            registro=i.registro, estudiante=nombre_estudiante(i.estudiante), en_sesion=i.registro in marcados,
            realizados=practicas.realizados(db, i.registro, s.sigla, s.codigo_tratamiento, s.id_gestion),
            requeridos=req, quedaria_habilitado=motivo is None, motivo=motivo,
        ))
    return salida


@sesiones.post("", status_code=201, summary="Crear una sesión y habilitar estudiantes (el sistema bloquea a quien no pagó)")
def crear_sesion(db: DbDep, usuario: DocenteDep, data: SesionCreate) -> SesionOut:
    if usuario.rol == Rol.docente:
        id_docente = usuario.id_docente
    elif data.id_docente is None:
        raise invalido("Indique id_docente")
    else:
        id_docente = data.id_docente
    if db.get(Docente, id_docente) is None:
        raise no_encontrado("Docente")
    if db.get(Materia, data.sigla) is None:
        raise no_encontrado("Materia")
    if db.get(PlanMateria, (data.sigla, data.codigo_tratamiento)) is None:
        raise invalido(f"El tratamiento {data.codigo_tratamiento} no forma parte del plan de {data.sigla}")
    gestion = cuentas.gestion_activa(db)
    if not gestion.fecha_inicio <= data.fecha <= gestion.fecha_fin:
        raise invalido(f"La fecha debe estar dentro de la gestión {gestion.anio}")
    if data.fecha < hoy():
        raise invalido("No se pueden programar sesiones en fechas pasadas")
    s = SesionPractica(
        id_gestion=gestion.id, id_docente=id_docente, sigla=data.sigla, codigo_tratamiento=data.codigo_tratamiento,
        fecha=data.fecha, observacion=data.observacion, creado_por=usuario.id,
    )
    db.add(s)
    db.flush()
    if data.registros:
        _marcar(db, s, data.registros)
    db.commit()
    return sesion_out(db, s)


@sesiones.patch("/{id_sesion}", summary="Corregir fecha u observación (solo si aún no se entregó material)")
def editar_sesion(db: DbDep, usuario: DocenteDep, id_sesion: int, data: SesionUpdate) -> SesionOut:
    s = _sesion(db, id_sesion, usuario)
    _sin_entregas(s, "modificar la sesión")
    if data.fecha is not None:
        if not s.gestion.fecha_inicio <= data.fecha <= s.gestion.fecha_fin:
            raise invalido(f"La fecha debe estar dentro de la gestión {s.gestion.anio}")
        if data.fecha < hoy():
            raise invalido("No se pueden programar sesiones en fechas pasadas")
        s.fecha = data.fecha
    if data.observacion is not None:
        s.observacion = data.observacion
    _reevaluar(db, s)
    return sesion_out(db, s)


@sesiones.post("/{id_sesion}/estudiantes", summary="Habilitar más estudiantes en la sesión")
def marcar_estudiantes(db: DbDep, usuario: DocenteDep, id_sesion: int, data: MarcarIn) -> SesionOut:
    s = _sesion(db, id_sesion, usuario)
    if s.estado != EstadoSesion.abierta:
        raise conflicto("La sesión está anulada")
    _marcar(db, s, data.registros)
    db.commit()
    return sesion_out(db, s)


@sesiones.patch("/{id_sesion}/estudiantes/{registro}/retirar", summary="Quitar a un estudiante antes de la entrega")
def retirar_estudiante(db: DbDep, usuario: DocenteDep, id_sesion: int, registro: int) -> SesionOut:
    s = _sesion(db, id_sesion, usuario)
    h = next((h for h in s.habilitaciones if h.registro == registro), None)
    if h is None:
        raise no_encontrado("Estudiante en la sesión")
    if h.estado == EstadoHabilitacion.entregado:
        raise conflicto("El estudiante ya retiró su kit")
    h.estado = EstadoHabilitacion.retirado
    h.motivo = "Retirado por el docente"
    db.commit()
    return sesion_out(db, s)


@sesiones.patch("/{id_sesion}/anular", summary="Anular la sesión (solo si aún no se entregó material)")
def anular_sesion(db: DbDep, usuario: DocenteDep, id_sesion: int, data: AnularIn) -> SesionOut:
    s = _sesion(db, id_sesion, usuario)
    if s.estado == EstadoSesion.anulada:
        raise conflicto("La sesión ya está anulada")
    _sin_entregas(s, "anular la sesión")
    s.estado = EstadoSesion.anulada
    s.observacion = f"ANULADA: {data.motivo}"
    _reevaluar(db, s)
    return sesion_out(db, s)


# ---------------- Entregas ----------------
entregas = APIRouter(prefix="/entregas", tags=["Insumos: entrega de kits"])


@entregas.get("/pendientes", summary="Estudiantes que el docente habilitó y aún no retiraron su kit")
def pendientes(
    db: DbDep,
    _: EncargadoDep,
    fecha: Annotated[date | None, Query(description="Por defecto, hoy. Se ignora si se busca por registro")] = None,
    registro: int | None = None,
    incluir_bloqueados: Annotated[bool, Query(description="Para explicarle al estudiante por qué no puede retirar")] = False,
) -> list[PendienteOut]:
    consulta = (
        select(Habilitacion).join(SesionPractica)
        .where(SesionPractica.estado == EstadoSesion.abierta,
               Habilitacion.estado.in_([EstadoHabilitacion.habilitado, EstadoHabilitacion.bloqueado]))
        .order_by(SesionPractica.fecha, Habilitacion.id)
    )
    if registro:
        consulta = consulta.where(Habilitacion.registro == registro, SesionPractica.fecha >= hoy())
    else:
        consulta = consulta.where(SesionPractica.fecha == (fecha or hoy()))
    habs = list(db.execute(consulta).scalars())
    for h in habs:
        practicas.evaluar(db, h)
    db.commit()
    return [pendiente_out(h) for h in habs if incluir_bloqueados or h.estado == EstadoHabilitacion.habilitado]


@entregas.post("", status_code=201, summary="Entregar el kit: verifica todo de nuevo y descuenta el stock")
def entregar_kit(db: DbDep, encargado: EncargadoDep, data: EntregaCreate) -> EntregaOut:
    h = db.get(Habilitacion, data.id_habilitacion)
    if h is None:
        raise no_encontrado("Habilitación")
    try:
        entrega = practicas.entregar(db, h, encargado)
    except Exception:
        db.rollback()
        raise
    db.commit()
    return entrega_out(db, entrega)


@entregas.get("", summary="Kits entregados")
def listar_entregas(
    db: DbDep, _: EncargadoDep, fecha: date | None = None, registro: int | None = None,
) -> list[EntregaOut]:
    consulta = select(EntregaKit).join(Habilitacion).order_by(EntregaKit.id.desc())
    if fecha:
        consulta = consulta.where(func.date(func.timezone(TZ.key, EntregaKit.fecha_hora)) == fecha)
    if registro:
        consulta = consulta.where(Habilitacion.registro == registro)
    return [entrega_out(db, e) for e in db.execute(consulta).scalars()]
