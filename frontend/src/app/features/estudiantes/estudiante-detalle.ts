import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { bs } from '../../core/format';
import { Avance, EstadoCuenta, Estudiante, Inscripcion, Materia } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { pedirMotivo } from '../../shared/dialogos';
import { COMUNES } from '../../shared/material';

/** Inscribir a una o más materias: muestra el precio de cada una (Σ plan) y el total que suma a la deuda. */
@Component({
  selector: 'app-inscribir-dialog',
  imports: [...COMUNES],
  template: `
    <div class="dialog-header">
      <div class="header-icon"><mat-icon>menu_book</mat-icon><span class="header-icon-badge"><mat-icon>add</mat-icon></span></div>
      <div>
        <h2 mat-dialog-title>Inscribir a materias</h2>
        <p class="header-sub">{{ data.estudiante.apellido }} {{ data.estudiante.nombre }} · el precio de cada materia es la suma de su plan</p>
      </div>
    </div>
    <mat-dialog-content>
      @for (m of disponibles(); track m.sigla) {
        <label class="materia">
          <mat-checkbox [checked]="seleccion().includes(m.sigla)" (change)="alternar(m.sigla, $event.checked)" />
          <span class="m-info">
            <span><strong>{{ m.sigla }}</strong> · {{ m.nombre }} <small class="muted">({{ m.anio_carrera }}° año)</small></span>
            <small class="muted">{{ m.plan.length ? m.plan.length + ' tratamientos en el plan' : 'Sin prácticas' }}</small>
          </span>
          <span class="money">{{ bs(m.precio) }}</span>
        </label>
      } @empty {
        <p class="no-mods">Ya está inscrito en todas las materias activas.</p>
      }
      <div class="total">Suma a la deuda anual <span class="money">{{ bs(total()) }}</span></div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button class="btn-guardar" [disabled]="!seleccion().length || guardando()" (click)="guardar()">
        <mat-icon>how_to_reg</mat-icon> Inscribir
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .materia { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-radius: 12px; background: var(--ap-fill-2); margin-bottom: 8px; cursor: pointer; }
    .m-info { flex: 1; display: flex; flex-direction: column; }
    .total { display: flex; justify-content: space-between; font-weight: 800; font-size: 1.05rem; margin-top: 14px; }
  `,
})
export class InscribirDialog implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private ref = inject(MatDialogRef<InscribirDialog, EstadoCuenta>);
  data = inject<{ estudiante: Estudiante; inscritas: string[] }>(MAT_DIALOG_DATA);
  materias = signal<Materia[]>([]);
  seleccion = signal<string[]>([]);
  guardando = signal(false);
  readonly bs = bs;

  disponibles = computed(() => this.materias().filter((m) => !this.data.inscritas.includes(m.sigla)));
  total = computed(() => this.materias().filter((m) => this.seleccion().includes(m.sigla)).reduce((t, m) => t + m.precio, 0));

  ngOnInit(): void {
    this.api.get<Materia[]>('/materias', { estado: 'activo' }).subscribe((m) => {
      const anio = this.data.estudiante.anio_carrera;
      this.materias.set([...m].sort((a, b) => Math.abs(a.anio_carrera - anio) - Math.abs(b.anio_carrera - anio)));
    });
  }

  alternar(sigla: string, marcado: boolean): void {
    this.seleccion.update((s) => (marcado ? [...s, sigla] : s.filter((x) => x !== sigla)));
  }

  guardar(): void {
    this.guardando.set(true);
    this.api.post<EstadoCuenta>('/inscripciones', { registro: this.data.estudiante.registro, siglas: this.seleccion() }).subscribe({
      next: (c) => this.ref.close(c),
      error: (e) => {
        this.guardando.set(false);
        this.notify.error(e);
      },
    });
  }
}

@Component({
  selector: 'app-estudiante-detalle',
  imports: [...COMUNES],
  templateUrl: './estudiante-detalle.html',
  styleUrl: './estudiante-detalle.css',
})
export class EstudianteDetalle implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  auth = inject(AuthService);

  registro = input.required<string>();
  estudiante = signal<Estudiante | null>(null);
  avance = signal<Avance | null>(null);
  cuenta = signal<EstadoCuenta | null>(null);
  readonly bs = bs;

  verCuenta = computed(() => this.auth.puede('caja'));

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    const r = this.registro();
    this.api.get<Estudiante>(`/estudiantes/${r}`).subscribe({ next: (e) => this.estudiante.set(e), error: (e) => this.notify.error(e) });
    this.api.get<Avance>(`/reportes/avance/${r}`).subscribe((a) => this.avance.set(a));
    if (this.verCuenta()) {
      this.api.get<EstadoCuenta>(`/cuentas/${r}`).subscribe({ next: (c) => this.cuenta.set(c), error: () => this.cuenta.set(null) });
    }
  }

  inscribir(): void {
    const e = this.estudiante();
    if (!e) return;
    const inscritas = (this.cuenta()?.inscripciones ?? []).filter((i) => i.estado === 'activa').map((i) => i.sigla);
    this.dialog
      .open(InscribirDialog, { data: { estudiante: e, inscritas }, width: '620px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((c?: EstadoCuenta) => {
        if (!c) return;
        this.notify.ok(`Inscrito · deuda anual ${bs(c.total)}`);
        this.cargar();
      });
  }

  anular(i: Inscripcion): void {
    pedirMotivo(this.dialog, {
      titulo: `Anular inscripción a ${i.sigla}`,
      mensaje: `Se descuentan ${bs(i.monto)} de la deuda. No se puede si ya retiró kits de esta materia.`,
    }).subscribe((motivo) => {
      if (!motivo) return;
      this.api.patch<EstadoCuenta>(`/inscripciones/${i.id}/anular`, { motivo }).subscribe({
        next: () => {
          this.notify.ok('Inscripción anulada');
          this.cargar();
        },
        error: (e) => this.notify.error(e),
      });
    });
  }
}
