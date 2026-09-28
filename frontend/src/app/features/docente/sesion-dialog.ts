import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { aIso, deIso, hoyIso } from '../../core/format';
import { Docente, Materia, Sesion } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { COMUNES } from '../../shared/material';

/** Crear sesión (sin data) o corregir fecha/observación de una existente (data = sesión). */
@Component({
  selector: 'app-sesion-dialog',
  imports: [...COMUNES],
  template: `
    <div class="dialog-header">
      <div class="header-icon">
        <mat-icon>medical_services</mat-icon>
        <span class="header-icon-badge"><mat-icon>{{ data ? 'edit' : 'add' }}</mat-icon></span>
      </div>
      <div>
        <h2 mat-dialog-title>{{ data ? 'Corregir sesión' : 'Nueva sesión de práctica' }}</h2>
        <p class="header-sub">
          {{ data ? data.tratamiento + ' · ' + data.materia : 'Luego marque a los estudiantes que harán la práctica' }}
        </p>
      </div>
    </div>
    <mat-dialog-content>
      <div class="form-grid">
        @if (!data) {
          @if (auth.esAdmin()) {
            <mat-form-field class="span-2">
              <mat-label>Docente</mat-label>
              <mat-select [ngModel]="idDocente()" (ngModelChange)="idDocente.set($event)" required>
                @for (d of docentes(); track d.id) { <mat-option [value]="d.id">{{ d.apellido }} {{ d.nombre }}</mat-option> }
              </mat-select>
            </mat-form-field>
          }
          <mat-form-field class="span-2">
            <mat-label>Materia</mat-label>
            <mat-select [ngModel]="sigla()" (ngModelChange)="sigla.set($event); codigo.set(null)" required>
              @for (m of materias(); track m.sigla) { <mat-option [value]="m.sigla">{{ m.sigla }} · {{ m.nombre }} ({{ m.anio_carrera }}° año)</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>Tratamiento</mat-label>
            <mat-select [ngModel]="codigo()" (ngModelChange)="codigo.set($event)" [disabled]="!sigla()" required>
              @for (p of plan(); track p.codigo_tratamiento) {
                <mat-option [value]="p.codigo_tratamiento">{{ p.tratamiento }} — el plan exige {{ p.cantidad }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        <mat-form-field>
          <mat-label>Fecha de la práctica</mat-label>
          <input matInput [matDatepicker]="dp" [min]="minimo" [ngModel]="fechaSel()" (ngModelChange)="fechaSel.set($event)" required />
          <mat-datepicker-toggle matSuffix [for]="dp" /><mat-datepicker #dp />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Observación (opcional)</mat-label>
          <input matInput maxlength="200" [ngModel]="observacion()" (ngModelChange)="observacion.set($event)" />
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button class="btn-guardar" [disabled]="!valido() || guardando()" (click)="guardar()">
        <mat-icon>{{ data ? 'save' : 'add' }}</mat-icon> {{ data ? 'Guardar' : 'Crear sesión' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class SesionDialog implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private ref = inject(MatDialogRef<SesionDialog, Sesion>);
  auth = inject(AuthService);
  data = inject<Sesion | null>(MAT_DIALOG_DATA);

  materias = signal<Materia[]>([]);
  docentes = signal<Docente[]>([]);
  sigla = signal<string | null>(null);
  codigo = signal<string | null>(null);
  idDocente = signal<number | null>(null);
  fechaSel = signal<Date | null>(deIso(this.data?.fecha ?? hoyIso()));
  observacion = signal(this.data?.observacion ?? '');
  guardando = signal(false);
  readonly minimo = deIso(hoyIso());

  plan = computed(() => this.materias().find((m) => m.sigla === this.sigla())?.plan ?? []);
  valido = computed(() =>
    this.data
      ? !!this.fechaSel()
      : !!this.sigla() && !!this.codigo() && !!this.fechaSel() && (!this.auth.esAdmin() || !!this.idDocente()),
  );

  ngOnInit(): void {
    if (this.data) return;
    this.api.get<Materia[]>('/materias', { estado: 'activo' }).subscribe((m) => this.materias.set(m.filter((x) => x.plan.length)));
    if (this.auth.esAdmin()) this.api.get<Docente[]>('/docentes', { estado: 'activo' }).subscribe((d) => this.docentes.set(d));
  }

  guardar(): void {
    this.guardando.set(true);
    const peticion = this.data
      ? this.api.patch<Sesion>(`/sesiones/${this.data.id}`, { fecha: aIso(this.fechaSel()), observacion: this.observacion() })
      : this.api.post<Sesion>('/sesiones', {
          sigla: this.sigla(),
          codigo_tratamiento: this.codigo(),
          fecha: aIso(this.fechaSel()),
          observacion: this.observacion() || null,
          id_docente: this.idDocente(),
        });
    peticion.subscribe({
      next: (s) => this.ref.close(s),
      error: (e) => {
        this.guardando.set(false);
        this.notify.error(e);
      },
    });
  }
}
