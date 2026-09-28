import { Routes } from '@angular/router';

import { authGuard, rolGuard } from './core/auth';
import { Login } from './features/login/login';
import { Shell } from './layout/shell';

export const routes: Routes = [
  { path: 'login', component: Login, title: 'Ingresar · OdontoFich' },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'panel' },
      { path: 'panel', title: 'Panel · OdontoFich', loadComponent: () => import('./features/panel/panel').then((m) => m.Panel) },

      // Caja
      { path: 'caja/cobros', title: 'Cobros · OdontoFich', canActivate: [rolGuard('caja')],
        loadComponent: () => import('./features/caja/cobros').then((m) => m.Cobros) },
      { path: 'caja/deudores', title: 'Deudores · OdontoFich', canActivate: [rolGuard('caja')],
        loadComponent: () => import('./features/caja/deudores').then((m) => m.Deudores) },
      { path: 'caja/recaudacion', title: 'Recaudación · OdontoFich', canActivate: [rolGuard('caja')],
        loadComponent: () => import('./features/caja/recaudacion').then((m) => m.RecaudacionPage) },

      // Docente
      { path: 'docente/sesiones', title: 'Sesiones · OdontoFich', canActivate: [rolGuard('docente')],
        loadComponent: () => import('./features/docente/sesiones').then((m) => m.Sesiones) },
      { path: 'docente/sesiones/:id', title: 'Sesión · OdontoFich', canActivate: [rolGuard('docente')],
        loadComponent: () => import('./features/docente/sesion-detalle').then((m) => m.SesionDetalle) },

      // Insumos
      { path: 'insumos/entregas', title: 'Entregas · OdontoFich', canActivate: [rolGuard('encargado_insumos')],
        loadComponent: () => import('./features/insumos/entregas').then((m) => m.Entregas) },
      { path: 'insumos/mostrador', title: 'Mostrador · OdontoFich', canActivate: [rolGuard('encargado_insumos')],
        loadComponent: () => import('./features/insumos/mostrador').then((m) => m.Mostrador) },
      { path: 'insumos/cierre', title: 'Cierre de caja · OdontoFich', canActivate: [rolGuard('encargado_insumos')],
        loadComponent: () => import('./features/insumos/cierre').then((m) => m.CierreCaja) },
      { path: 'insumos/stock', title: 'Stock · OdontoFich', canActivate: [rolGuard('encargado_insumos')],
        loadComponent: () => import('./features/insumos/stock').then((m) => m.Stock) },
      { path: 'insumos/consumo', title: 'Consumo · OdontoFich', canActivate: [rolGuard('encargado_insumos')],
        loadComponent: () => import('./features/insumos/consumo').then((m) => m.ConsumoPage) },

      // Estudiante (Show: avance, inscripciones y cuenta — lo ven todos los roles, cada uno su parte)
      { path: 'estudiantes/:registro', title: 'Estudiante · OdontoFich',
        loadComponent: () => import('./features/estudiantes/estudiante-detalle').then((m) => m.EstudianteDetalle) },

      // Administración
      { path: 'admin/estudiantes', title: 'Estudiantes · OdontoFich', canActivate: [rolGuard('administrador')],
        loadComponent: () => import('./features/admin/estudiantes').then((m) => m.Estudiantes) },
      { path: 'admin/materias', title: 'Materias · OdontoFich', canActivate: [rolGuard('administrador')],
        loadComponent: () => import('./features/admin/materias').then((m) => m.Materias) },
      { path: 'admin/tratamientos', title: 'Tratamientos · OdontoFich', canActivate: [rolGuard('administrador')],
        loadComponent: () => import('./features/admin/tratamientos').then((m) => m.Tratamientos) },
      { path: 'admin/docentes', title: 'Docentes · OdontoFich', canActivate: [rolGuard('administrador')],
        loadComponent: () => import('./features/admin/docentes').then((m) => m.Docentes) },
      { path: 'admin/gestiones', title: 'Gestiones · OdontoFich', canActivate: [rolGuard('administrador')],
        loadComponent: () => import('./features/admin/gestiones').then((m) => m.Gestiones) },
      { path: 'admin/usuarios', title: 'Usuarios · OdontoFich', canActivate: [rolGuard('administrador')],
        loadComponent: () => import('./features/admin/usuarios').then((m) => m.Usuarios) },
      { path: 'admin/cierres', title: 'Cierres · OdontoFich', canActivate: [rolGuard('administrador')],
        loadComponent: () => import('./features/admin/cierres').then((m) => m.Cierres) },
    ],
  },
  { path: '**', redirectTo: '' },
];
