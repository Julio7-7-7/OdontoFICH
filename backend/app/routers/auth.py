from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from app.core.db import DbDep
from app.core.security import SoloAdmin, UsuarioActual, crear_token, hash_password, verificar_password
from app.core.utils import conflicto, invalido, no_encontrado
from app.models import Docente, Usuario
from app.core.enums import Rol
from app.schemas.catalogos import PasswordIn, Token, UsuarioCreate, UsuarioOut, UsuarioUpdate

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post("/login", summary="Iniciar sesión (usar también desde el botón Authorize de Swagger)")
def login(db: DbDep, form: Annotated[OAuth2PasswordRequestForm, Depends()]) -> Token:
    usuario = db.execute(select(Usuario).where(Usuario.nombre_usuario == form.username)).scalar_one_or_none()
    if usuario is None or not usuario.activo or not verificar_password(form.password, usuario.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario o contraseña incorrectos")
    return Token(access_token=crear_token(usuario), usuario=UsuarioOut.model_validate(usuario))


@router.get("/me")
def yo(usuario: UsuarioActual) -> UsuarioOut:
    return UsuarioOut.model_validate(usuario)


usuarios = APIRouter(prefix="/usuarios", tags=["Usuarios"])


def _validar_docente(db, rol: Rol, id_docente: int | None) -> None:
    if rol == Rol.docente:
        if id_docente is None:
            raise invalido("Un usuario con rol docente debe estar vinculado a un docente (id_docente)")
        if db.get(Docente, id_docente) is None:
            raise no_encontrado("Docente")
    elif id_docente is not None:
        raise invalido("Solo los usuarios con rol docente se vinculan a un docente")


@usuarios.get("")
def listar_usuarios(db: DbDep, _: SoloAdmin) -> list[UsuarioOut]:
    return [UsuarioOut.model_validate(u) for u in db.execute(select(Usuario).order_by(Usuario.id)).scalars()]


@usuarios.post("", status_code=201)
def crear_usuario(db: DbDep, _: SoloAdmin, data: UsuarioCreate) -> UsuarioOut:
    if db.execute(select(Usuario).where(Usuario.nombre_usuario == data.nombre_usuario)).first():
        raise conflicto("El nombre de usuario ya existe")
    _validar_docente(db, data.rol, data.id_docente)
    u = Usuario(nombre_usuario=data.nombre_usuario, password_hash=hash_password(data.password),
                nombre_completo=data.nombre_completo, rol=data.rol, id_docente=data.id_docente)
    db.add(u)
    db.commit()
    return UsuarioOut.model_validate(u)


@usuarios.patch("/{id_usuario}")
def editar_usuario(db: DbDep, admin: SoloAdmin, id_usuario: int, data: UsuarioUpdate) -> UsuarioOut:
    u = db.get(Usuario, id_usuario)
    if u is None:
        raise no_encontrado("Usuario")
    cambios = data.model_dump(exclude_unset=True)
    if u.id == admin.id and (cambios.get("activo") is False or cambios.get("rol", Rol.administrador) != Rol.administrador):
        raise conflicto("No puede desactivarse ni quitarse el rol de administrador a sí mismo")
    for campo, valor in cambios.items():
        setattr(u, campo, valor)
    _validar_docente(db, u.rol, u.id_docente)
    db.commit()
    return UsuarioOut.model_validate(u)


@usuarios.patch("/{id_usuario}/password")
def cambiar_password(db: DbDep, _: SoloAdmin, id_usuario: int, data: PasswordIn) -> UsuarioOut:
    u = db.get(Usuario, id_usuario)
    if u is None:
        raise no_encontrado("Usuario")
    u.password_hash = hash_password(data.password)
    db.commit()
    return UsuarioOut.model_validate(u)
