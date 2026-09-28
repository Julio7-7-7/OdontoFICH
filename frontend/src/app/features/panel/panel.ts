import { Component, OnInit, inject, signal } from '@angular/core';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { bs, fecha, hoyIso, num } from '../../core/format';
import { Dashboard, Insumo, SesionResumen } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { COMUNES } from '../../shared/material';

@Component({
  selector: 'app-panel',
  imports: [...COMUNES],
  templateUrl: './panel.html',
})
export class Panel implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  auth = inject(AuthService);

  datos = signal<Dashboard | null>(null);
  stockBajo = signal<Insumo[]>([]);
  sesionesHoy = signal<SesionResumen[]>([]);

  readonly bs = bs;
  readonly num = num;
  readonly fecha = fecha;

  ngOnInit(): void {
    this.api.get<Dashboard>('/reportes/dashboard').subscribe({
      next: (d) => this.datos.set(d),
      error: (e) => this.notify.error(e),
    });
    if (this.auth.puede('encargado_insumos')) {
      this.api.get<Insumo[]>('/insumos', { bajo_minimo: true }).subscribe((r) => this.stockBajo.set(r));
    }
    if (this.auth.puede('docente')) {
      this.api.get<SesionResumen[]>('/sesiones', { fecha: hoyIso() }).subscribe((r) => this.sesionesHoy.set(r));
    }
  }
}
