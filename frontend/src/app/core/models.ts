// Tipos que reflejan las respuestas de la API (backend/app/schemas)

export type Rol = 'administrador' | 'caja' | 'docente' | 'encargado_insumos';
export type EstadoRegistro = 'activo' | 'inactivo';
export type UnidadMedida = 'unidad' | 'sachet' | 'tira' | 'bolsa' | 'caja' | 'par' | 'gr' | 'mg' | 'ml';
export type EstadoHabilitacion = 'habilitado' | 'bloqueado' | 'entregado' | 'retirado';

export const UNIDADES: UnidadMedida[] = ['unidad', 'sachet', 'tira', 'bolsa', 'caja', 'par', 'gr', 'mg', 'ml'];

export const ROL_LABEL: Record<Rol, string> = {
  administrador: 'Administración',
  caja: 'Caja',
  docente: 'Docente',
  encargado_insumos: 'Encargado de insumos',
};

export interface Usuario {
  id: number;
  nombre_usuario: string;
  nombre_completo: string;
  rol: Rol;
  id_docente: number | null;
  activo: boolean;
}

export interface Token {
  access_token: string;
  token_type: string;
  usuario: Usuario;
}

export interface Gestion {
  id: number;
  anio: number;
  fecha_inicio: string;
  fecha_corte: string;
  fecha_fin: string;
  activa: boolean;
}

export interface Docente {
  id: number;
  ci: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  especialidad: string | null;
  estado: EstadoRegistro;
}

export interface Estudiante {
  registro: number;
  ci: string | null;
  nombre: string;
  apellido: string;
  telefono: string | null;
  anio_carrera: number;
  estado: EstadoRegistro;
}

export interface Insumo {
  codigo: string;
  nombre: string;
  unidad_medida: UnidadMedida;
  precio_unitario: number;
  stock: number;
  stock_minimo: number;
  bajo_minimo: boolean;
  estado: EstadoRegistro;
}

export interface Movimiento {
  id: number;
  tipo: 'entrada' | 'salida_kit' | 'salida_venta' | 'anulacion_venta' | 'ajuste';
  cantidad: number;
  stock_resultante: number;
  fecha_hora: string;
  usuario: string;
  observacion: string | null;
  id_entrega: number | null;
  id_venta: number | null;
}

export interface KitItem {
  codigo_insumo: string;
  nombre: string;
  unidad_medida: UnidadMedida;
  cantidad: number;
  costo: number;
}

export interface Tratamiento {
  codigo: string;
  nombre: string;
  precio: number;
  estado: EstadoRegistro;
  kit: KitItem[];
  costo_kit: number;
}

export interface PlanItem {
  codigo_tratamiento: string;
  tratamiento: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface Materia {
  sigla: string;
  nombre: string;
  anio_carrera: number;
  creditos: number;
  horas_teoricas: number;
  horas_practicas: number;
  sigla_prerrequisito: string | null;
  estado: EstadoRegistro;
  precio: number;
  plan: PlanItem[];
}

export interface Inscripcion {
  id: number;
  registro: number;
  sigla: string;
  materia: string;
  anio: number;
  monto: number;
  estado: 'activa' | 'anulada';
  creado_en: string;
  motivo_anulacion: string | null;
}

export interface Cuota {
  nro: number;
  monto: number;
  pagado: number;
  saldo: number;
  estado: 'pagada' | 'parcial' | 'pendiente' | 'no_aplica';
  fecha_vencimiento: string;
  cubre: string;
}

export interface Pago {
  id: number;
  nro_recibo: string;
  registro: number;
  estudiante: string;
  anio: number;
  monto: number;
  fecha_hora: string;
  cajero: string;
  estado: 'vigente' | 'anulado';
  observacion: string | null;
  motivo_anulacion: string | null;
}

export interface EstadoCuenta {
  registro: number;
  estudiante: string;
  id_gestion: number;
  anio: number;
  modalidad: 'contado' | 'cuotas';
  total: number;
  pagado: number;
  saldo: number;
  cuotas: Cuota[];
  cubre_semestre_1: boolean;
  cubre_semestre_2: boolean;
  semestre_actual: number;
  habilitado_hoy: boolean;
  motivo_bloqueo_hoy: string | null;
  inscripciones: Inscripcion[];
  pagos: Pago[];
}

export interface PagoRegistrado {
  pago: Pago;
  estado_cuenta: EstadoCuenta;
}

export interface Habilitacion {
  id: number;
  registro: number;
  estudiante: string;
  estado: EstadoHabilitacion;
  motivo: string | null;
  realizados: number;
  requeridos: number;
  entregado_en: string | null;
}

export interface SesionResumen {
  id: number;
  fecha: string;
  sigla: string;
  materia: string;
  codigo_tratamiento: string;
  tratamiento: string;
  id_docente: number;
  docente: string;
  estado: 'abierta' | 'anulada';
  observacion: string | null;
  habilitados: number;
  bloqueados: number;
  entregados: number;
}

export interface Sesion extends SesionResumen {
  habilitaciones: Habilitacion[];
}

export interface KitLinea {
  codigo_insumo: string;
  insumo: string;
  unidad_medida: UnidadMedida;
  cantidad: number;
  stock_actual: number;
}

export interface Pendiente {
  id_habilitacion: number;
  registro: number;
  estudiante: string;
  estado: EstadoHabilitacion;
  motivo: string | null;
  id_sesion: number;
  fecha: string;
  sigla: string;
  materia: string;
  codigo_tratamiento: string;
  tratamiento: string;
  docente: string;
  kit: KitLinea[];
  stock_suficiente: boolean;
}

export interface Entrega {
  id: number;
  id_habilitacion: number;
  registro: number;
  estudiante: string;
  sigla: string;
  codigo_tratamiento: string;
  tratamiento: string;
  fecha_hora: string;
  encargado: string;
  insumos: { codigo_insumo: string; insumo: string; cantidad: number; stock_resultante: number }[];
  realizados: number;
  requeridos: number;
}

export interface LineaVenta {
  tipo: 'insumo' | 'kit';
  codigo: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface Venta {
  id: number;
  nro_recibo: string;
  registro: number;
  estudiante: string;
  fecha_hora: string;
  total: number;
  vendedor: string;
  estado: 'vigente' | 'anulada';
  motivo_anulacion: string | null;
  id_cierre: number | null;
  lineas: LineaVenta[];
}

export interface CierrePreview {
  fecha: string;
  ya_cerrado: boolean;
  cantidad_ventas: number;
  total_sistema: number;
  ventas: Venta[];
}

export interface Cierre {
  id: number;
  fecha: string;
  encargado: string;
  cantidad_ventas: number;
  total_sistema: number;
  efectivo_declarado: number;
  diferencia: number;
  observacion: string | null;
  estado: 'pendiente' | 'recibido';
  recibido_por: string | null;
  recibido_en: string | null;
}

export interface TratamientoAvance {
  codigo: string;
  tratamiento: string;
  requeridos: number;
  realizados: number;
  faltantes: number;
  semaforo: 'rojo' | 'amarillo' | 'verde';
  kits_extra_comprados: number;
}

export interface Avance {
  registro: number;
  estudiante: string;
  anio: number;
  materias: { sigla: string; materia: string; avance_pct: number; tratamientos: TratamientoAvance[] }[];
}

export interface Deudor {
  registro: number;
  estudiante: string;
  modalidad: string;
  total: number;
  pagado: number;
  saldo: number;
  cuota_1: string;
  cuota_2: string;
  bloqueado_hoy: boolean;
  motivo: string | null;
}

export interface Deudores {
  anio: number;
  cantidad: number;
  saldo_total: number;
  deudores: Deudor[];
}

export interface Constancia {
  registro: number;
  estudiante: string;
  anio: number;
  sin_deuda: boolean;
  total: number;
  pagado: number;
  saldo: number;
  mensaje: string;
  emitida_en: string;
}

export interface Recaudacion {
  desde: string;
  hasta: string;
  cuotas: number;
  extras: number;
  total: number;
  por_dia: { fecha: string; cuotas: number; extras: number; total: number }[];
}

export interface ConsumoInsumo {
  codigo: string;
  insumo: string;
  unidad_medida: UnidadMedida;
  previsto_anual: number;
  entregado_en_kits: number;
  vendido_como_extra: number;
  pendiente_segun_plan: number;
  stock_actual: number;
  alcanza_para_lo_pendiente: boolean;
  extra_sobre_kits_pct: number;
}

export interface Consumo {
  anio: number;
  estudiantes_inscritos: number;
  insumos: ConsumoInsumo[];
}

export interface Dashboard {
  fecha: string;
  semestre: number;
  cobrado_hoy_cuotas: number;
  vendido_hoy_extras: number;
  sesiones_hoy: number;
  pendientes_de_entrega_hoy: number;
  kits_entregados_hoy: number;
  insumos_bajo_minimo: number;
  estudiantes_con_deuda: number;
  cierres_por_recibir: number;
}
