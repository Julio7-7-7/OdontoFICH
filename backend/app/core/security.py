from datetime import timedelta
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.core.config import JWT_ALGORITHM, JWT_HORAS, SECRET_KEY, ahora
from app.core.db import DbDep
from app.core.enums import Rol
from app.models import Usuario

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verificar_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def crear_token(usuario: Usuario) -> str:
    payload = {"sub": str(usuario.id), "rol": usuario.rol.value, "exp": ahora() + timedelta(hours=JWT_HORAS)}
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def get_usuario_actual(db: DbDep, token: Annotated[str, Depends(oauth2_scheme)]) -> Usuario:
    no_autorizado = HTTPException(
        status.HTTP_401_UNAUTHORIZED, "Sesión inválida o expirada", headers={"WWW-Authenticate": "Bearer"}
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise no_autorizado from exc
    usuario = db.get(Usuario, int(payload["sub"]))
    if usuario is None or not usuario.activo:
        raise no_autorizado
    return usuario


UsuarioActual = Annotated[Usuario, Depends(get_usuario_actual)]


def requiere_rol(*roles: Rol):
    """El administrador siempre pasa; los demás solo si su rol está en la lista."""

    def verificar(usuario: UsuarioActual) -> Usuario:
        if usuario.rol != Rol.administrador and usuario.rol not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Su rol no tiene acceso a esta operación")
        return usuario

    return verificar


SoloAdmin = Annotated[Usuario, Depends(requiere_rol())]
