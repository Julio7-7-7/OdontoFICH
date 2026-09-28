"""Reglas de negocio de punta a punta, a través de la API (mismo JSON que se prueba en Swagger).

Estudiantes de los datos de ejemplo:
  215010001 Ana     — pagó todo, 12/20 exodoncias → habilitada hoy
  215010002 Bruno   — solo cuota 1
  215010003 Carla   — contado, 20/20 exodoncias (completó el plan)
  215010004 Diego   — no pagó nada, sin marcar en la sesión de hoy
  215010010 Jorge   — sin inscripciones
"""

from datetime import timedelta
from decimal import Decimal

from app.core.config import hoy
from app.models import MovimientoStock

ANA, CARLA, DIEGO, JORGE = 215010001, 215010003, 215010004, 215010010
KIT_EXODONCIA = {"AL01": 1, "HS51": 1, "A05": 1, "SF01": 1, "A06": 1, "G01": 2, "GU01": 1}


def _sesion_exodoncia_hoy(client, docente):
    ses = client.get("/sesiones", headers=docente, params={"fecha": hoy().isoformat()}).json()
    return next(s for s in ses if s["codigo_tratamiento"] == "2234")


def _stock(client, headers, codigo):
    return client.get(f"/insumos/{codigo}", headers=headers).json()["stock"]


# ---------------- Seguridad ----------------
def test_login_y_permisos_por_rol(client, docente, caja):
    assert client.post("/auth/login", data={"username": "admin", "password": "mal"}).status_code == 401
    assert client.get("/insumos").status_code == 401
    assert client.post("/pagos", headers=docente, json={"registro": DIEGO, "monto": 1}).status_code == 403
    assert client.post("/entregas", headers=caja, json={"id_habilitacion": 1}).status_code == 403
    assert client.get("/auth/me", headers=caja).json()["rol"] == "caja"


def test_docente_solo_ve_sus_sesiones(client, docente, docente2):
    s = _sesion_exodoncia_hoy(client, docente)
    assert client.get(f"/sesiones/{s['id']}", headers=docente2).status_code == 404
    assert all(x["id_docente"] == s["id_docente"] for x in client.get("/sesiones", headers=docente).json())


# ---------------- Deuda anual y cuotas ----------------
def test_precio_de_materia_y_deuda_por_inscripcion(client, admin, caja):
    assert client.get("/materias/EST500", headers=admin).json()["precio"] == 820.0
    r = client.post("/inscripciones", headers=admin, json={"registro": JORGE, "siglas": ["EST500", "EST508"]})
    assert r.status_code == 201, r.text
    cuenta = r.json()
    assert cuenta["total"] == 1245.0
    assert [c["monto"] for c in cuenta["cuotas"]] == [622.5, 622.5]
    assert client.post("/inscripciones", headers=admin, json={"registro": JORGE, "siglas": ["EST500"]}).status_code == 409

    r = client.patch(f"/cuentas/{JORGE}/modalidad", headers=caja, json={"modalidad": "contado"})
    assert [c["monto"] for c in r.json()["cuotas"]] == [1245.0, 0.0]
    client.post("/pagos", headers=caja, json={"registro": JORGE, "monto": 100})
    assert client.patch(f"/cuentas/{JORGE}/modalidad", headers=caja, json={"modalidad": "cuotas"}).status_code == 409


def test_pago_no_puede_superar_el_saldo_y_se_aplica_en_orden(client, caja):
    assert client.post("/pagos", headers=caja, json={"registro": DIEGO, "monto": 99999}).status_code == 422
    r = client.post("/pagos", headers=caja, json={"registro": DIEGO, "monto": 900}).json()
    c1, c2 = r["estado_cuenta"]["cuotas"]
    assert (c1["estado"], c1["pagado"]) == ("pagada", 785.0)
    assert (c2["estado"], c2["pagado"]) == ("parcial", 115.0)
    assert r["pago"]["nro_recibo"].startswith(f"R-{hoy().year}-")


# ---------------- Circuito principal ----------------
def test_circuito_pago_habilitacion_entrega(client, docente, caja, insumos, db):
    s = _sesion_exodoncia_hoy(client, docente)
    marcado = client.post(f"/sesiones/{s['id']}/estudiantes", headers=docente, json={"registros": [DIEGO]}).json()
    diego = next(h for h in marcado["habilitaciones"] if h["registro"] == DIEGO)
    assert diego["estado"] == "bloqueado" and "Cuota 1" in diego["motivo"]

    cuenta = client.get(f"/cuentas/{DIEGO}", headers=caja).json()
    client.post("/pagos", headers=caja, json={"registro": DIEGO, "monto": cuenta["saldo"]})

    detalle = client.get(f"/sesiones/{s['id']}", headers=docente).json()
    diego = next(h for h in detalle["habilitaciones"] if h["registro"] == DIEGO)
    assert diego["estado"] == "habilitado"

    antes = {c: _stock(client, insumos, c) for c in KIT_EXODONCIA}
    r = client.post("/entregas", headers=insumos, json={"id_habilitacion": diego["id"]})
    assert r.status_code == 201, r.text
    assert (r.json()["realizados"], r.json()["requeridos"]) == (1, 20)
    for codigo, cantidad in KIT_EXODONCIA.items():
        assert _stock(client, insumos, codigo) == antes[codigo] - cantidad
    movs = db.query(MovimientoStock).filter(MovimientoStock.id_entrega == r.json()["id"]).count()
    assert movs == len(KIT_EXODONCIA)
    assert client.post("/entregas", headers=insumos, json={"id_habilitacion": diego["id"]}).status_code == 409


def test_bloqueado_no_puede_retirar_material(client, docente, insumos):
    sid = _sesion_exodoncia_hoy(client, docente)["id"]
    s = client.post(f"/sesiones/{sid}/estudiantes", headers=docente, json={"registros": [DIEGO]}).json()
    diego = next(h for h in s["habilitaciones"] if h["registro"] == DIEGO)
    antes = _stock(client, insumos, "HS51")
    r = client.post("/entregas", headers=insumos, json={"id_habilitacion": diego["id"]})
    assert r.status_code == 409 and "bloqueado" in r.json()["detail"]
    assert _stock(client, insumos, "HS51") == antes


def test_estudiante_no_inscrito_no_se_puede_marcar(client, docente):
    s = _sesion_exodoncia_hoy(client, docente)
    r = client.post(f"/sesiones/{s['id']}/estudiantes", headers=docente, json={"registros": [JORGE]})
    assert r.status_code == 422 and str(JORGE) in r.json()["detail"]


def test_plan_completo_bloquea_y_el_kit_se_compra_como_extra(client, docente, insumos):
    s = client.get(f"/sesiones/{_sesion_exodoncia_hoy(client, docente)['id']}", headers=docente).json()
    carla = next(h for h in s["habilitaciones"] if h["registro"] == CARLA)
    assert carla["estado"] == "bloqueado" and "completó el plan" in carla["motivo"]
    antes = _stock(client, insumos, "HS51")
    v = client.post("/ventas", headers=insumos,
                    json={"registro": CARLA, "lineas": [{"tipo": "kit", "codigo": "2234", "cantidad": 1}]})
    assert v.status_code == 201 and v.json()["total"] == 20.0
    assert _stock(client, insumos, "HS51") == antes - 1


# ---------------- Stock ----------------
def test_stock_insuficiente_es_todo_o_nada(client, insumos):
    antes = {c: _stock(client, insumos, c) for c in ("G01", "IO01")}
    r = client.post("/ventas", headers=insumos, json={"registro": ANA, "lineas": [
        {"tipo": "insumo", "codigo": "G01", "cantidad": 2}, {"tipo": "insumo", "codigo": "IO01", "cantidad": 50}]})
    assert r.status_code == 409
    assert r.json()["detail"]["faltantes"][0]["codigo"] == "IO01"
    assert {c: _stock(client, insumos, c) for c in antes} == antes


def test_entrada_y_ajuste_quedan_en_el_kardex(client, insumos):
    r = client.post("/insumos/IO01/entradas", headers=insumos, json={"cantidad": 30, "observacion": "Compra"})
    assert r.json()["stock"] == 42.0 and r.json()["bajo_minimo"] is False
    r = client.post("/insumos/IO01/ajustes", headers=insumos, json={"stock_contado": 40, "motivo": "Conteo físico"})
    assert r.json()["stock"] == 40.0
    kardex = client.get("/insumos/IO01/kardex", headers=insumos).json()
    assert [m["tipo"] for m in kardex[:2]] == ["ajuste", "entrada"]
    assert kardex[0]["cantidad"] == -2.0


# ---------------- Ventas y cierre ----------------
def test_anular_venta_devuelve_stock_y_cierre_la_bloquea(client, insumos, admin):
    antes = _stock(client, insumos, "G01")
    v = client.post("/ventas", headers=insumos,
                    json={"registro": ANA, "lineas": [{"tipo": "insumo", "codigo": "G01", "cantidad": 4}]}).json()
    assert _stock(client, insumos, "G01") == antes - 4
    r = client.patch(f"/ventas/{v['id']}/anular", headers=insumos, json={"motivo": "Error de digitación"})
    assert r.json()["estado"] == "anulada" and _stock(client, insumos, "G01") == antes

    v2 = client.post("/ventas", headers=insumos,
                     json={"registro": ANA, "lineas": [{"tipo": "insumo", "codigo": "G01", "cantidad": 1}]}).json()
    prev = client.get("/cierres/preview", headers=insumos).json()
    assert prev["cantidad_ventas"] == 1 and prev["total_sistema"] == 0.5
    c = client.post("/cierres", headers=insumos, json={"efectivo_declarado": 0}).json()
    assert c["diferencia"] == -0.5
    assert client.patch(f"/ventas/{v2['id']}/anular", headers=insumos, json={"motivo": "tarde"}).status_code == 409
    assert client.post("/ventas", headers=insumos,
                       json={"registro": ANA, "lineas": [{"tipo": "insumo", "codigo": "G01", "cantidad": 1}]}).status_code == 409
    assert client.patch(f"/cierres/{c['id']}/recibir", headers=insumos).status_code == 403
    assert client.patch(f"/cierres/{c['id']}/recibir", headers=admin).json()["estado"] == "recibido"


# ---------------- Anulaciones ----------------
def test_anular_pago_vuelve_a_bloquear(client, caja, docente):
    pago = client.get("/pagos", headers=caja, params={"registro": ANA}).json()[0]
    r = client.patch(f"/pagos/{pago['id']}/anular", headers=caja, json={"motivo": "Cheque rechazado"})
    assert r.json()["pago"]["estado"] == "anulado"
    assert r.json()["estado_cuenta"]["habilitado_hoy"] is False
    s = client.get(f"/sesiones/{_sesion_exodoncia_hoy(client, docente)['id']}", headers=docente).json()
    assert next(h for h in s["habilitaciones"] if h["registro"] == ANA)["estado"] == "bloqueado"


def test_anular_inscripcion(client, admin):
    ins = client.get("/inscripciones", headers=admin, params={"registro": ANA}).json()
    con_kits = next(i for i in ins if i["sigla"] == "EST500")
    assert client.patch(f"/inscripciones/{con_kits['id']}/anular", headers=admin,
                        json={"motivo": "Prueba"}).status_code == 409  # ya retiró kits
    r = client.post("/inscripciones", headers=admin, json={"registro": JORGE, "siglas": ["EST500", "EST508"]}).json()
    i = next(x for x in r["inscripciones"] if x["sigla"] == "EST508")
    r = client.patch(f"/inscripciones/{i['id']}/anular", headers=admin, json={"motivo": "Se inscribió por error"})
    assert r.json()["total"] == 820.0


# ---------------- Sesiones ----------------
def test_validaciones_de_sesion(client, docente, insumos):
    base = {"sigla": "EST500", "codigo_tratamiento": "2234", "fecha": hoy().isoformat()}
    assert client.post("/sesiones", headers=docente, json={**base, "codigo_tratamiento": "4101"}).status_code == 422
    pasado = (hoy() - timedelta(days=1)).isoformat()
    assert client.post("/sesiones", headers=docente, json={**base, "fecha": pasado}).status_code == 422

    s = client.post("/sesiones", headers=docente, json={**base, "registros": [ANA]}).json()
    assert s["habilitados"] == 1
    r = client.patch(f"/sesiones/{s['id']}/estudiantes/{ANA}/retirar", headers=docente).json()
    assert r["habilitaciones"][0]["estado"] == "retirado"
    client.post(f"/sesiones/{s['id']}/estudiantes", headers=docente, json={"registros": [ANA]})
    hab = client.get(f"/sesiones/{s['id']}", headers=docente).json()["habilitaciones"][0]
    client.post("/entregas", headers=insumos, json={"id_habilitacion": hab["id"]})
    assert client.patch(f"/sesiones/{s['id']}/anular", headers=docente, json={"motivo": "Lluvia"}).status_code == 409


# ---------------- Reportes ----------------
def test_reportes(client, admin, caja, insumos):
    av = client.get(f"/reportes/avance/{CARLA}", headers=admin).json()
    exo = next(t for m in av["materias"] for t in m["tratamientos"] if t["codigo"] == "2234")
    assert (exo["realizados"], exo["semaforo"], exo["kits_extra_comprados"]) == (20, "verde", 1)

    deudores = client.get("/reportes/deudores", headers=caja).json()
    registros = {d["registro"] for d in deudores["deudores"]}
    assert DIEGO in registros and ANA not in registros
    assert client.get(f"/reportes/constancia/{ANA}", headers=caja).json()["sin_deuda"] is True

    rec = client.get("/reportes/recaudacion", headers=caja,
                     params={"desde": f"{hoy().year}-01-01", "hasta": hoy().isoformat()}).json()
    assert Decimal(str(rec["total"])) == Decimal(str(rec["cuotas"])) + Decimal(str(rec["extras"]))

    consumo = {c["codigo"]: c for c in client.get("/reportes/consumo", headers=insumos).json()["insumos"]}
    assert consumo["HS51"]["entregado_en_kits"] > 0 and consumo["HS51"]["vendido_como_extra"] > 0
    assert client.get("/reportes/dashboard", headers=admin).json()["sesiones_hoy"] == 2


# ---------------- Catálogos ----------------
def test_catalogos_kit_plan_y_precio(client, admin, insumos):
    r = client.post("/insumos", headers=insumos, json={
        "codigo": "BA01", "nombre": "Babero", "unidad_medida": "unidad", "precio_unitario": 0.3,
        "stock_minimo": 10, "stock_inicial": 100})
    assert r.status_code == 201 and r.json()["stock"] == 100.0
    assert client.get("/insumos/BA01/kardex", headers=admin).json()[0]["tipo"] == "entrada"

    client.post("/tratamientos", headers=admin, json={"codigo": "2238", "nombre": "Frenectomía", "precio": 80})
    t = client.put("/tratamientos/2238/kit", headers=admin,
                   json=[{"codigo_insumo": "BA01", "cantidad": 1}, {"codigo_insumo": "A06", "cantidad": 1}]).json()
    assert t["costo_kit"] == 4.3
    plan = client.get("/materias/EST500", headers=admin).json()["plan"]
    nuevo = [{"codigo_tratamiento": p["codigo_tratamiento"], "cantidad": p["cantidad"]} for p in plan]
    m = client.put("/materias/EST500/plan", headers=admin, json=[*nuevo, {"codigo_tratamiento": "2238", "cantidad": 1}])
    assert m.json()["precio"] == 900.0
    assert client.patch("/insumos/BA01/estado", headers=insumos, json={"estado": "inactivo"}).json()["estado"] == "inactivo"


def test_usuario_docente_requiere_docente_vinculado(client, admin):
    r = client.post("/usuarios", headers=admin,
                    json={"nombre_usuario": "nuevo", "password": "123456", "nombre_completo": "X", "rol": "docente"})
    assert r.status_code == 422
