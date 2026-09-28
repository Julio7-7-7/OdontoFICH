import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { mensajeError } from '../../core/format';
import { Rol } from '../../core/models';

/** Pantalla inicial según el rol: cada uno entra directo a su trabajo del día. */
const INICIO: Record<Rol, string> = {
  administrador: '/panel',
  caja: '/caja/cobros',
  docente: '/docente/sesiones',
  encargado_insumos: '/insumos/entregas',
};

@Component({
  selector: 'app-login',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private auth = inject(AuthService);
  private router = inject(Router);

  usuario = signal('');
  password = signal('');
  verPassword = signal(false);
  cargando = signal(false);
  error = signal<string | null>(null);

  readonly demo = [
    { usuario: 'admin', rol: 'Administración', detalle: 'Materias, planes, usuarios', icono: 'admin_panel_settings', color: 'linear-gradient(180deg,#8e8e93,#636366)' },
    { usuario: 'caja', rol: 'Caja', detalle: 'Cobra las cuotas del año', icono: 'point_of_sale', color: 'linear-gradient(180deg,#34c759,#248a3d)' },
    { usuario: 'docente', rol: 'Docente', detalle: 'Habilita las prácticas', icono: 'medical_services', color: 'linear-gradient(180deg,#5ac8fa,#0071e3)' },
    { usuario: 'insumos', rol: 'Insumos', detalle: 'Entrega kits y vende extras', icono: 'inventory_2', color: 'linear-gradient(180deg,#ffb340,#ff9500)' },
  ];

  usarDemo(usuario: string): void {
    this.usuario.set(usuario);
    this.password.set('odonto123');
    this.error.set(null);
  }

  ingresar(): void {
    if (!this.usuario() || !this.password() || this.cargando()) return;
    this.cargando.set(true);
    this.error.set(null);
    this.auth.login(this.usuario().trim(), this.password()).subscribe({
      next: (t) => this.router.navigateByUrl(INICIO[t.usuario.rol]),
      error: (e) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }
}
