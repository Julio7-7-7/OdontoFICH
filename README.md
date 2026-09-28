# OdontoFich Web

Sistema de control de pagos e insumos de las prácticas clínicas — Carrera de Odontología (FICH).
Versión web del sistema de escritorio de 2024 (`../OdontoFich`), rediseñada para la Feria 2026 de INF219.

- `backend/` — FastAPI + SQLAlchemy + PostgreSQL (este README)
- `frontend/` — Angular 21 (standalone, zoneless, signals, Material) con el mismo sistema de diseño de Postgrado

## Día de la feria (un solo proceso, sin internet)

```bash
./iniciar-feria.sh              # compila si hace falta, recarga datos de ejemplo y abre http://localhost:8100
./iniciar-feria.sh --compilar   # fuerza recompilar la aplicación
```

FastAPI sirve la API bajo `/api` y la aplicación Angular compilada en `/`. Fuentes e íconos van empaquetados: no se necesita internet.

## Desarrollo

```bash
cd backend && uv run uvicorn app.main:app --port 8100 --reload   # API + Swagger en /api/docs
cd frontend && npx ng serve                                      # http://localhost:4300 (proxy /api → 8100)
```

## Backend: puesta en marcha

Requisitos: PostgreSQL y [uv](https://docs.astral.sh/uv/).

```bash
cd backend
cp .env.example .env                      # ajustar usuario/clave de Postgres
createdb odontofich && createdb odontofich_test
uv sync                                   # crea el entorno e instala dependencias
uv run alembic upgrade head               # crea las tablas
uv run python -m app.seed --reiniciar     # datos de ejemplo (fechas relativas a hoy)
uv run uvicorn app.main:app --port 8100   # API en http://localhost:8100/api/docs
uv run pytest                             # tests (usan odontofich_test, nunca la base de desarrollo)
```

**Antes de cada demo:** `uv run python -m app.seed --reiniciar` deja todo como nuevo.

## Usuarios de ejemplo (contraseña `odonto123`)

| Usuario | Rol | Qué hace |
|---|---|---|
| `admin` | administrador | Catálogos, inscripciones, recibe cierres; puede hacer todo |
| `caja` | caja | Cobra cuotas, estado de cuenta, deudores, constancias |
| `docente` / `docente2` / `docente3` | docente | Crea sesiones de práctica y habilita estudiantes |
| `insumos` | encargado de insumos | Entrega kits, vende extras, stock, cierre de caja |

## Guion de la demo en Swagger

1. **Authorize** como `docente` → `GET /sesiones?fecha=<hoy>` → `POST /sesiones/{id}/estudiantes` con `{"registros":[215010004]}` → Diego queda **bloqueado** ("Cuota 1 impaga").
2. **Authorize** como `caja` → `GET /cuentas/215010004` → `POST /pagos` con el saldo → queda al día.
3. Como `docente`: `GET /sesiones/{id}` → Diego ahora está **habilitado**.
4. Como `insumos`: `GET /entregas/pendientes` → `POST /entregas` con su `id_habilitacion` → mirar `GET /insumos/HS51` antes y después.
5. Carla (215010003) ya completó 20/20 exodoncias: está bloqueada, y compra el kit como extra → `POST /ventas`.
6. `GET /cierres/preview` → `POST /cierres` → como `admin`, `PATCH /cierres/{id}/recibir`.
7. Reportes: `/reportes/dashboard`, `/reportes/avance/{registro}`, `/reportes/deudores`, `/reportes/consumo`.

## Estudiantes de ejemplo

| Registro | Estudiante | Situación |
|---|---|---|
| 215010001 | Ana Rojas | Pagó todo; 12/20 exodoncias → habilitada |
| 215010002 | Bruno Céspedes | Solo cuota 1 → bloqueado en el 2do semestre |
| 215010003 | Carla Mendoza | Contado; 20/20 exodoncias → plan completo |
| 215010004 | Diego Vargas | No pagó nada; sin marcar (para la demo en vivo) |
| 215010005 | Elena Suárez | Pagó Bs 600 de 820 |
| 214010006 | Fernando Ortiz | 4to año, pagó todo |
| 214010007 | Gabriela Paz | 4to año, solo cuota 1 |
| 213010008 / 213010009 | Hugo Molina / Irene Flores | 3er año (pagó / no pagó) |
| 215010010 | Jorge Álvarez | Sin inscripciones |
