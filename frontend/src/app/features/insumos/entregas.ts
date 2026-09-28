import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { ApiService } from '../../core/api.service';
import { aIso, deIso, fecha, fechaHora, hoyIso, num } from '../../core/format';
import { Entrega, Pendiente } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { confirmar } from '../../shared/dialogos';
import { COMUNES } from '../../shared/material';

@Component({
  selector: 'app-entregas',
  imports: [...COMUNES],
  templateUrl: './entregas.html',
  styleUrl: './entregas.css',
})
export class Entregas implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);

  dia = signal<Date | null>(deIso(hoyIso()));
  verBloqueados = signal(false);
  filtro = signal('');
  pendientes = signal<Pendiente[] | null>(null);
  entregadas = signal<Entrega[]>([]);
  entregando = signal<number | null>(null);

  readonly fecha = fecha;
  readonly fechaHora = fechaHora;
  readonly num = num;

  aIsoDia = computed(() => aIso(this.dia()));
  habilitados = computed(() => (this.pendientes() ?? []).filter((p) => p.estado === 'habilitado').length);
  visibles = computed(() => {
    const q = this.filtro().toLowerCase().trim();
    const lista = this.pendientes() ?? [];
    return q ? lista.filter((p) => `${p.registro} ${p.estudiante} ${p.tratamiento}`.toLowerCase().includes(q)) : lista;
  });

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    const f = aIso(this.dia()) ?? hoyIso();
    this.api.get<Pendiente[]>('/entregas/pendientes', { fecha: f, incluir_bloqueados: this.verBloqueados() }).subscribe({
      next: (p) => this.pendientes.set(p),
      error: (e) => this.notify.error(e),
    });
    this.api.get<Entrega[]>('/entregas', { fecha: f }).subscribe((e) => this.entregadas.set(e));
  }

  entregar(p: Pendiente): void {
    const lista = p.kit.map((k) => `${num(k.cantidad)} ${k.unidad_medida} ${k.insumo}`).join(', ');
    confirmar(this.dialog, {
      titulo: `Entregar kit de ${p.tratamiento}`,
      mensaje: `${p.estudiante} (reg. ${p.registro}) recibe: ${lista}.`,
      confirmar: 'Entregar',
      icono: 'inventory',
    }).subscribe((ok) => {
      if (!ok) return;
      this.entregando.set(p.id_habilitacion);
      this.api.post<Entrega>('/entregas', { id_habilitacion: p.id_habilitacion }).subscribe({
        next: (e) => {
          this.notify.ok(`Kit entregado a ${e.estudiante} · lleva ${e.realizados}/${e.requeridos}`);
          this.entregando.set(null);
          this.cargar();
        },
        error: (err) => {
          this.entregando.set(null);
          this.notify.error(err);
          this.cargar();
        },
      });
    });
  }
}
