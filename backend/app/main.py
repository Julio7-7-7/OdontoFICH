from pathlib import Path

from fastapi import APIRouter, FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.routers import academico, auth, cuentas, insumos, practicas, reportes, ventas

DESCRIPCION = """
API del sistema de control de pagos e insumos de las prácticas clínicas — Carrera de Odontología (FICH).

**Cómo probar en Swagger:** pulse **Authorize** e ingrese un usuario de ejemplo
(`admin`, `caja`, `docente`, `insumos`; contraseña `odonto123`).

**Circuito principal**
1. Caja registra el pago de la cuota → `POST /pagos`
2. El docente crea la sesión y marca a sus estudiantes → `POST /sesiones` (el sistema bloquea a quien no pagó)
3. El encargado ve a los habilitados → `GET /entregas/pendientes` y entrega el kit → `POST /entregas` (baja el stock)
4. Si falta material, el encargado vende un extra → `POST /ventas` y al final del día cierra caja → `POST /cierres`
"""

app = FastAPI(
    title="OdontoFich API", version="1.0.0", description=DESCRIPCION,
    docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4300", "http://127.0.0.1:4300"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(IntegrityError)
def integridad(_: Request, exc: IntegrityError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": f"Operación rechazada por la base de datos: {exc.orig.diag.message_primary if hasattr(exc.orig, 'diag') else exc.orig}"},
    )


api = APIRouter(prefix="/api")
for r in (
    auth.router, auth.usuarios,
    academico.gestiones, academico.docentes, academico.estudiantes, academico.materias, academico.tratamientos,
    insumos.router,
    cuentas.inscripciones, cuentas.router,
    practicas.sesiones, practicas.entregas,
    ventas.router, ventas.cierres,
    reportes.router,
):
    api.include_router(r)


@api.get("/salud", tags=["Sistema"])
def salud() -> dict[str, str]:
    return {"estado": "ok"}


app.include_router(api)

# Aplicación Angular compilada (un solo proceso para la demo sin internet)
FRONTEND = Path(__file__).resolve().parents[2] / "frontend" / "dist" / "frontend" / "browser"
if FRONTEND.is_dir():
    app.frontend("/", directory=str(FRONTEND), fallback="index.html")  # SPA: toda ruta de Angular sirve index.html
