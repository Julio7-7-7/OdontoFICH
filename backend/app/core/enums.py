from enum import StrEnum


class Rol(StrEnum):
    administrador = "administrador"
    caja = "caja"
    docente = "docente"
    encargado_insumos = "encargado_insumos"


class EstadoRegistro(StrEnum):
    activo = "activo"
    inactivo = "inactivo"


class UnidadMedida(StrEnum):
    unidad = "unidad"
    sachet = "sachet"
    tira = "tira"
    bolsa = "bolsa"
    caja = "caja"
    par = "par"
    gr = "gr"
    mg = "mg"
    ml = "ml"


class Modalidad(StrEnum):
    contado = "contado"
    cuotas = "cuotas"


class EstadoInscripcion(StrEnum):
    activa = "activa"
    anulada = "anulada"


class EstadoPago(StrEnum):
    vigente = "vigente"
    anulado = "anulado"


class EstadoSesion(StrEnum):
    abierta = "abierta"
    anulada = "anulada"


class EstadoHabilitacion(StrEnum):
    habilitado = "habilitado"
    bloqueado = "bloqueado"
    entregado = "entregado"
    retirado = "retirado"  # el docente lo quitó de la sesión antes de la entrega


class TipoMovimiento(StrEnum):
    entrada = "entrada"
    salida_kit = "salida_kit"
    salida_venta = "salida_venta"
    anulacion_venta = "anulacion_venta"
    ajuste = "ajuste"


class EstadoVenta(StrEnum):
    vigente = "vigente"
    anulada = "anulada"


class TipoLineaVenta(StrEnum):
    insumo = "insumo"
    kit = "kit"


class EstadoCierre(StrEnum):
    pendiente = "pendiente"
    recibido = "recibido"
