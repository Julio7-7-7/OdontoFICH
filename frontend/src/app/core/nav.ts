import { Rol } from './models';

export interface NavItem {
  label: string;
  icon: string;
  ruta: string;
  roles: Rol[]; // vacío = todos los roles
}

export interface NavGrupo {
  titulo: string;
  items: NavItem[];
}

/** Fuente única del menú. El administrador ve todo; cada rol, solo lo suyo. */
export const NAV: NavGrupo[] = [
  { titulo: 'General', items: [{ label: 'Panel del día', icon: 'dashboard', ruta: '/panel', roles: [] }] },
  {
    titulo: 'Caja',
    items: [
      { label: 'Cobros', icon: 'point_of_sale', ruta: '/caja/cobros', roles: ['caja'] },
      { label: 'Deudores', icon: 'money_off', ruta: '/caja/deudores', roles: ['caja'] },
      { label: 'Recaudación', icon: 'bar_chart', ruta: '/caja/recaudacion', roles: ['caja'] },
    ],
  },
  {
    titulo: 'Prácticas',
    items: [{ label: 'Sesiones de práctica', icon: 'medical_services', ruta: '/docente/sesiones', roles: ['docente'] }],
  },
  {
    titulo: 'Insumos',
    items: [
      { label: 'Entregas del día', icon: 'assignment_turned_in', ruta: '/insumos/entregas', roles: ['encargado_insumos'] },
      { label: 'Mostrador (extras)', icon: 'storefront', ruta: '/insumos/mostrador', roles: ['encargado_insumos'] },
      { label: 'Cierre de caja', icon: 'lock_clock', ruta: '/insumos/cierre', roles: ['encargado_insumos'] },
      { label: 'Stock', icon: 'inventory_2', ruta: '/insumos/stock', roles: ['encargado_insumos'] },
      { label: 'Consumo previsto', icon: 'insights', ruta: '/insumos/consumo', roles: ['encargado_insumos'] },
    ],
  },
  {
    titulo: 'Administración',
    items: [
      { label: 'Estudiantes', icon: 'school', ruta: '/admin/estudiantes', roles: ['administrador'] },
      { label: 'Materias y planes', icon: 'menu_book', ruta: '/admin/materias', roles: ['administrador'] },
      { label: 'Tratamientos y kits', icon: 'healing', ruta: '/admin/tratamientos', roles: ['administrador'] },
      { label: 'Docentes', icon: 'badge', ruta: '/admin/docentes', roles: ['administrador'] },
      { label: 'Gestiones', icon: 'event', ruta: '/admin/gestiones', roles: ['administrador'] },
      { label: 'Usuarios', icon: 'manage_accounts', ruta: '/admin/usuarios', roles: ['administrador'] },
      { label: 'Cierres recibidos', icon: 'fact_check', ruta: '/admin/cierres', roles: ['administrador'] },
    ],
  },
];
