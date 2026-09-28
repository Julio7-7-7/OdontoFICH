"""Datos de ejemplo para la demo de la feria.

Uso:
    uv run python -m app.seed --reiniciar     # vacía todas las tablas y carga todo de nuevo

Todo se carga a través de los mismos servicios de la API (pagos, entregas, ventas, cierres), así que
stock, kardex, recibos y avances quedan cruzados exactamente como en el uso real. Las fechas se
calculan a partir de hoy, para que la demo funcione el día que se ejecute.

Materias, tratamientos y códigos de insumos: tomados de la documentación del sistema de 2024 y del
relato del proceso real (Cirugía Bucal EST500 = Bs 820). Estudiantes y docentes: ficticios.
"""

import argparse
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import text

from app.core.config import TZ, hoy
from app.core.db import Base, SessionLocal
from app.core.enums import EstadoHabilitacion, Modalidad, Rol, TipoLineaVenta, TipoMovimiento, UnidadMedida
from app.core.security import hash_password
from app.core.utils import siguiente_numero
from app.models import (
    Docente, Estudiante, Gestion, Habilitacion, Inscripcion, Insumo, KitTratamiento, Materia, Pago, PlanMateria,
    SesionPractica, Tratamiento, Usuario,
)
from app.services import cuentas, practicas, stock, ventas

PASSWORD = "odonto123"
U = UnidadMedida

INSUMOS = [  # código, nombre, unidad, precio, stock inicial, stock mínimo
    ("AL01", "Algodón", U.unidad, "0.50", 400, 50),
    ("A05", "Aguja dental", U.unidad, "2.00", 300, 40),
    ("A06", "Anestesia (cartucho)", U.unidad, "4.00", 260, 40),
    ("G01", "Gasa estéril", U.unidad, "0.50", 600, 80),
    ("HS51", "Hilo de sutura", U.unidad, "6.00", 64, 15),
    ("SF01", "Suero fisiológico", U.sachet, "3.00", 120, 20),
    ("PRP71", "Placa radiográfica", U.unidad, "5.00", 150, 20),
    ("PP32", "Pasta para pulir", U.gr, "0.20", 1000, 150),
    ("PM31", "Papel de morder", U.tira, "0.30", 400, 50),
    ("HC57", "Hidróxido de calcio", U.gr, "1.50", 200, 30),
    ("AG05", "Ácido grabador en gel", U.ml, "2.00", 150, 20),
    ("PPTT70", "Pasta profiláctica", U.gr, "0.25", 800, 100),
    ("C59", "Cariostático", U.ml, "3.00", 100, 15),
    ("FC29", "Flúor en gel (cubeta)", U.unidad, "2.50", 100, 15),
    ("RS10", "Resina fotopolimerizable", U.gr, "8.00", 120, 20),
    ("AM20", "Amalgama (cápsula)", U.unidad, "6.00", 150, 20),
    ("GU01", "Guantes de látex", U.par, "1.00", 500, 100),
    ("LE01", "Lima endodóntica", U.unidad, "7.00", 80, 15),
    ("GP01", "Cono de gutapercha", U.unidad, "0.80", 300, 50),
    ("HN01", "Hipoclorito de sodio", U.ml, "0.05", 3000, 500),
    ("IO01", "Ionómero de vidrio", U.gr, "5.00", 12, 15),  # ya está bajo el mínimo
]

# materia: (sigla, nombre, año, prerrequisito, docente, [(código, tratamiento, precio, veces, kit)])
MATERIAS = [
    ("EST500", "Cirugía Bucal", 5, "EST405", "4812345", [
        ("2234", "Exodoncia", "20", 20,
         {"AL01": 1, "HS51": 1, "A05": 1, "SF01": 1, "A06": 1, "G01": 2, "GU01": 1}),
        ("2235", "Extracción de tercer molar", "100", 2,
         {"A06": 2, "A05": 2, "HS51": 2, "SF01": 2, "G01": 4, "AL01": 2, "PRP71": 1, "GU01": 2}),
        ("2236", "Regularización ósea", "60", 3, {"A06": 1, "A05": 1, "HS51": 1, "SF01": 1, "G01": 2, "GU01": 1}),
        ("2237", "Apicectomía", "40", 1, {"A06": 1, "A05": 1, "HS51": 1, "G01": 2, "PRP71": 1, "GU01": 1}),
    ]),
    ("EST503", "Operatoria Dental", 5, "EST402", "5123456", [
        ("3101", "Amalgama simple", "30", 10, {"AM20": 1, "AL01": 2, "PM31": 1, "GU01": 1}),
        ("3102", "Restauración con resina", "35", 10, {"RS10": 1, "AG05": 1, "AL01": 2, "PM31": 1, "GU01": 1}),
        ("3103", "Incrustación", "50", 2, {"IO01": 1, "PM31": 2, "AL01": 2, "GU01": 1}),
    ]),
    ("EST508", "Endodoncia", 5, None, "5123456", [
        ("3201", "Biopulpectomía", "35", 4,
         {"A06": 1, "A05": 1, "LE01": 1, "GP01": 3, "HN01": 20, "PRP71": 2, "GU01": 1}),
        ("3202", "Necropulpectomía", "60", 3,
         {"A06": 1, "A05": 1, "LE01": 2, "GP01": 3, "HN01": 20, "HC57": 1, "PRP71": 2, "GU01": 1}),
        ("3203", "Pulpotomía", "35", 3, {"A06": 1, "A05": 1, "HC57": 1, "AL01": 2, "GU01": 1}),
    ]),
    ("EST402", "Odontología Preventiva", 4, None, "6234567", [
        ("4101", "Profilaxis", "10", 15, {"PPTT70": 5, "PP32": 2, "GU01": 1}),
        ("4102", "Aplicación de flúor", "10", 10, {"FC29": 1, "GU01": 1}),
        ("4103", "Sellado de fosas y fisuras", "20", 8, {"AG05": 1, "RS10": 1, "AL01": 2, "GU01": 1}),
    ]),
    ("EST405", "Periodoncia", 4, None, "6234567", [
        ("4201", "Tartrectomía", "30", 10, {"PPTT70": 3, "A06": 1, "A05": 1, "G01": 2, "GU01": 1}),
        ("4202", "Gingivectomía", "100", 1, {"A06": 2, "A05": 2, "HS51": 1, "G01": 4, "GU01": 1}),
    ]),
    ("EST301", "Clínica Integral I", 3, None, "6234567", [
        ("5101", "Examen radiográfico", "10", 5, {"PRP71": 1, "GU01": 1}),
        ("5102", "Aplicación de cariostático", "10", 5, {"C59": 1, "AL01": 2, "GU01": 1}),
    ]),
    ("MOR201", "Anatomía Dental", 2, None, None, []),  # teórica: sin prácticas, no genera deuda
]

DOCENTES = [
    ("4812345", "Patricia", "Salazar", "Cirugía bucal"),
    ("5123456", "Marcelo", "Aguilera", "Endodoncia y operatoria"),
    ("6234567", "Silvia", "Justiniano", "Odontología preventiva"),
]

# registro, nombre, apellido, año, materias, modalidad, cuánto pagó ("todo", "cuota1", monto o 0)
ESTUDIANTES = [
    (215010001, "Ana", "Rojas", 5, ["EST500", "EST503", "EST508"], Modalidad.cuotas, "todo"),
    (215010002, "Bruno", "Céspedes", 5, ["EST500", "EST508"], Modalidad.cuotas, "cuota1"),
    (215010003, "Carla", "Mendoza", 5, ["EST500", "EST503", "EST508"], Modalidad.contado, "todo"),
    (215010004, "Diego", "Vargas", 5, ["EST500", "EST503"], Modalidad.cuotas, 0),
    (215010005, "Elena", "Suárez", 5, ["EST500"], Modalidad.cuotas, 600),
    (214010006, "Fernando", "Ortiz", 4, ["EST402", "EST405"], Modalidad.cuotas, "todo"),
    (214010007, "Gabriela", "Paz", 4, ["EST402", "EST405"], Modalidad.cuotas, "cuota1"),
    (213010008, "Hugo", "Molina", 3, ["EST301", "MOR201"], Modalidad.contado, "todo"),
    (213010009, "Irene", "Flores", 3, ["EST301"], Modalidad.cuotas, 0),
    (215010010, "Jorge", "Álvarez", 5, [], Modalidad.cuotas, 0),  # sin inscripciones
]

# Historial de kits ya retirados: registro, código de tratamiento, cantidad, solo en el 1er semestre
HISTORIAL = [
    (215010003, "2234", 20, False), (215010003, "2235", 1, False),
    (215010001, "2234", 12, False), (215010001, "3101", 2, False), (215010001, "3201", 1, False),
    (215010002, "2234", 6, True),
    (215010005, "2234", 5, True),
    (214010006, "4101", 8, False), (214010006, "4102", 4, False),
    (214010007, "4101", 3, True),
    (213010008, "5101", 2, False),
]


def momento(d: date, hora: int = 10) -> datetime:
    return datetime.combine(d, time(hora), tzinfo=TZ)


def reiniciar(db) -> None:
    tablas = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    db.execute(text(f"TRUNCATE {tablas} RESTART IDENTITY CASCADE"))
    db.commit()


def cargar(db) -> None:
    f_hoy = hoy()
    anio = f_hoy.year
    gestion = Gestion(anio=anio, fecha_inicio=date(anio, 2, 2), fecha_corte=date(anio, 7, 13),
                      fecha_fin=date(anio, 12, 11), activa=True)
    db.add(gestion)

    docentes = {ci: Docente(ci=ci, nombre=n, apellido=a, especialidad=e) for ci, n, a, e in DOCENTES}
    db.add_all(docentes.values())
    db.flush()

    usuarios = {
        "admin": Usuario(nombre_usuario="admin", nombre_completo="Administración (demo)", rol=Rol.administrador),
        "caja": Usuario(nombre_usuario="caja", nombre_completo="Rosa Caja (demo)", rol=Rol.caja),
        "insumos": Usuario(nombre_usuario="insumos", nombre_completo="Mario Insumos (demo)", rol=Rol.encargado_insumos),
        "docente": Usuario(nombre_usuario="docente", nombre_completo="Dra. Patricia Salazar",
                           rol=Rol.docente, id_docente=docentes["4812345"].id),
        "docente2": Usuario(nombre_usuario="docente2", nombre_completo="Dr. Marcelo Aguilera",
                            rol=Rol.docente, id_docente=docentes["5123456"].id),
        "docente3": Usuario(nombre_usuario="docente3", nombre_completo="Dra. Silvia Justiniano",
                            rol=Rol.docente, id_docente=docentes["6234567"].id),
    }
    clave = hash_password(PASSWORD)
    for u in usuarios.values():
        u.password_hash = clave
    db.add_all(usuarios.values())
    db.flush()
    enc, caja = usuarios["insumos"], usuarios["caja"]

    for cod, nombre, unidad, precio, inicial, minimo in INSUMOS:
        ins = Insumo(codigo=cod, nombre=nombre, unidad_medida=unidad, precio_unitario=Decimal(precio),
                     stock=Decimal("0"), stock_minimo=Decimal(minimo))
        db.add(ins)
        db.flush()
        stock.mover(db, ins, Decimal(inicial), TipoMovimiento.entrada, enc.id, "Stock inicial de la gestión",
                    fecha_hora=momento(gestion.fecha_inicio, 8))

    docente_de: dict[str, int] = {}
    for sigla, nombre, anio_c, _pre, ci_doc, plan in MATERIAS:
        db.add(Materia(sigla=sigla, nombre=nombre, anio_carrera=anio_c, creditos=6, horas_teoricas=2,
                       horas_practicas=4 if plan else 0))
        if ci_doc:
            docente_de[sigla] = docentes[ci_doc].id
        for cod, trat, precio, veces, kit in plan:
            db.add(Tratamiento(codigo=cod, nombre=trat, precio=Decimal(precio)))
            db.flush()
            db.add_all(KitTratamiento(codigo_tratamiento=cod, codigo_insumo=i, cantidad=Decimal(c)) for i, c in kit.items())
            db.add(PlanMateria(sigla=sigla, codigo_tratamiento=cod, cantidad=veces))
    db.flush()
    for sigla, *_resto in MATERIAS:
        pre = _resto[2]
        if pre:
            db.get(Materia, sigla).sigla_prerrequisito = pre
    db.flush()

    # Estudiantes, inscripciones y pagos
    for reg, nombre, apellido, anio_c, materias, modalidad, pago in ESTUDIANTES:
        db.add(Estudiante(registro=reg, nombre=nombre, apellido=apellido, anio_carrera=anio_c,
                          ci=str(reg)[-7:], telefono=f"7{str(reg)[-7:]}"))
        db.flush()
        if not materias:
            continue
        for sigla in materias:
            db.add(Inscripcion(registro=reg, sigla=sigla, id_gestion=gestion.id,
                               monto=db.get(Materia, sigla).precio, id_usuario=usuarios["admin"].id,
                               creado_en=momento(gestion.fecha_inicio - timedelta(days=10))))
        db.flush()
        cuenta = cuentas.obtener_cuenta(db, reg, gestion, crear=True)
        cuenta.modalidad = modalidad
        cuentas.recalcular_cuotas(db, cuenta)
        s = cuentas.situacion(db, cuenta)
        c1, c2 = s.cuotas[0].monto, s.cuotas[1].monto
        abonos: list[tuple[Decimal, date]] = []
        if pago == "todo":
            abonos = [(c1, gestion.fecha_inicio - timedelta(days=5))]
            if c2:
                abonos.append((c2, gestion.fecha_corte - timedelta(days=4)))
        elif pago == "cuota1":
            abonos = [(c1, gestion.fecha_inicio - timedelta(days=3))]
        elif pago:
            abonos = [(Decimal(pago), gestion.fecha_inicio - timedelta(days=2))]
        for monto, dia in abonos:
            db.add(Pago(nro_recibo=siguiente_numero(db, "R", anio), id_cuenta=cuenta.id, monto=monto,
                        id_usuario=caja.id, fecha_hora=momento(dia, 9)))
        db.flush()

    # Historial de prácticas: una sesión por tratamiento y fecha, cada 3 días hacia atrás
    sesiones: dict[tuple[str, date], SesionPractica] = {}
    sigla_de = {cod: sigla for sigla, *_r, plan in MATERIAS for cod, *_x in plan}
    for reg, cod, cantidad, primer_semestre in HISTORIAL:
        tope = min(gestion.fecha_corte if primer_semestre else f_hoy, f_hoy)
        fechas = [tope - timedelta(days=3 * (i + 1)) for i in range(cantidad)]
        for d in fechas:
            if d < gestion.fecha_inicio:
                continue
            sigla = sigla_de[cod]
            s = sesiones.get((cod, d))
            if s is None:
                s = SesionPractica(id_gestion=gestion.id, id_docente=docente_de[sigla], sigla=sigla,
                                   codigo_tratamiento=cod, fecha=d, creado_por=usuarios["admin"].id)
                db.add(s)
                db.flush()
                sesiones[(cod, d)] = s
            h = Habilitacion(registro=reg, estado=EstadoHabilitacion.bloqueado)
            s.habilitaciones.append(h)
            db.flush()
            practicas.evaluar(db, h)
            practicas.entregar(db, h, enc, fecha_hora=momento(d, 11))

    # Extras de días anteriores (ayer, con cierre pendiente de recibir)
    ayer = f_hoy - timedelta(days=1)
    ventas.crear_venta(db, 215010001, [{"tipo": TipoLineaVenta.insumo, "codigo": "G01", "cantidad": 2},
                                       {"tipo": TipoLineaVenta.insumo, "codigo": "HS51", "cantidad": 1}],
                       enc, fecha_hora=momento(ayer, 15))
    ventas.crear_venta(db, 215010003, [{"tipo": TipoLineaVenta.kit, "codigo": "2234", "cantidad": 1}],
                       enc, fecha_hora=momento(ayer, 16))
    ventas.crear_venta(db, 214010006, [{"tipo": TipoLineaVenta.insumo, "codigo": "PPTT70", "cantidad": 5}],
                       enc, fecha_hora=momento(ayer, 16))
    ventas.cerrar_caja(db, enc, ayer, Decimal("28.25"), "Cuadra con lo del sistema")

    # Sesiones de HOY para la demo (Diego queda sin marcar: lo marca el visitante en vivo)
    for cod, registros in [("2234", [215010001, 215010002, 215010003, 215010005]),
                           ("4101", [214010006, 214010007])]:
        sigla = sigla_de[cod]
        s = SesionPractica(id_gestion=gestion.id, id_docente=docente_de[sigla], sigla=sigla, codigo_tratamiento=cod,
                           fecha=f_hoy, creado_por=usuarios["admin"].id, observacion="Sesión de demostración")
        db.add(s)
        db.flush()
        for reg in registros:
            h = Habilitacion(registro=reg, estado=EstadoHabilitacion.bloqueado)
            s.habilitaciones.append(h)
            db.flush()
            practicas.evaluar(db, h)
    db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Carga los datos de ejemplo de OdontoFich")
    parser.add_argument("--reiniciar", action="store_true", help="Vacía TODAS las tablas antes de cargar")
    args = parser.parse_args()
    with SessionLocal() as db:
        if args.reiniciar:
            reiniciar(db)
        elif db.query(Gestion).first():
            raise SystemExit("La base ya tiene datos. Use --reiniciar para vaciarla y cargar de nuevo.")
        cargar(db)
        print(f"Datos de ejemplo cargados. Usuarios: admin, caja, insumos, docente, docente2, docente3 "
              f"(contraseña: {PASSWORD})")


if __name__ == "__main__":
    main()
