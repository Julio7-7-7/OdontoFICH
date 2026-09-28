import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';
import { Router } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { Estudiante } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { COMUNES } from '../../shared/material';

@Component({
  selector: 'app-estudiante-dialog',
  imports: [...COMUNES],
  template: `
    <div class="dialog-header">
      <div class="header-icon">
        <mat-icon>school</mat-icon>
        <span class="header-icon-badge"><mat-icon>{{ data ? 'edit' : 'add' }}</mat-icon></span>
      </div>
      <div>
        <h2 mat-dialog-title>{{ data ? 'Editar estudiante' : 'Nuevo estudiante' }}</h2>
        <p class="header-sub">{{ data ? 'Registro ' + data.registro : 'Después se lo inscribe a sus materias desde su ficha' }}</p>
      </div>
    </div>
    <mat-dialog-content>
      <form [formGroup]="form" class="form-grid">
        <mat-form-field><mat-label>Registro universitario</mat-label><input matInput type="number" formControlName="registro" /></mat-form-field>
        <mat-form-field><mat-label>CI</mat-label><input matInput formControlName="ci" /></mat-form-field>
        <mat-form-field><mat-label>Apellidos</mat-label><input matInput formControlName="apellido" /></mat-form-field>
        <mat-form-field><mat-label>Nombres</mat-label><input matInput formControlName="nombre" /></mat-form-field>
        <mat-form-field>
          <mat-label>Año de la carrera</mat-label>
          <mat-select formControlName="anio_carrera">
            @for (a of [1, 2, 3, 4, 5]; track a) { <mat-option [value]="a">{{ a }}° año</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field><mat-label>Teléfono</mat-label><input matInput formControlName="telefono" /></mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button class="btn-guardar" [disabled]="form.invalid || guardando()" (click)="guardar()">
        <mat-icon>{{ data ? 'save' : 'add' }}</mat-icon> {{ data ? 'Guardar cambios' : 'Crear estudiante' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class EstudianteDialog {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private ref = inject(MatDialogRef<EstudianteDialog, Estudiante>);
  data = inject<Estudiante | null>(MAT_DIALOG_DATA);
  guardando = signal(false);

  form = inject(FormBuilder).group({
    registro: [{ value: this.data?.registro ?? null, disabled: !!this.data }, [Validators.required, Validators.min(1)]],
    ci: [this.data?.ci ?? ''],
    nombre: [this.data?.nombre ?? '', Validators.required],
    apellido: [this.data?.apellido ?? '', Validators.required],
    anio_carrera: [this.data?.anio_carrera ?? 3, Validators.required],
    telefono: [this.data?.telefono ?? ''],
  });

  guardar(): void {
    this.guardando.set(true);
    const v = this.form.getRawValue();
    const cuerpo = { ...v, ci: v.ci || null, telefono: v.telefono || null };
    const peticion = this.data
      ? this.api.patch<Estudiante>(`/estudiantes/${this.data.registro}`, { ...cuerpo, registro: undefined })
      : this.api.post<Estudiante>('/estudiantes', cuerpo);
    peticion.subscribe({
      next: (e) => this.ref.close(e),
      error: (e) => {
        this.guardando.set(false);
        this.notify.error(e);
      },
    });
  }
}

@Component({
  selector: 'app-estudiantes',
  imports: [...COMUNES],
  template: `
    <div class="page-container">
      <div class="header-card">
        <div class="header-card-top">
          <div class="header-card-title">
            <div class="header-icon"><mat-icon>school</mat-icon></div>
            <div>
              <h2>Estudiantes</h2>
              <p class="subtitle">Abra la ficha para inscribirlo, ver su cuenta y su avance en el plan</p>
            </div>
          </div>
          @if (lista()) {
            <div class="header-card-stats">
              <div class="summary-stat"><mat-icon>school</mat-icon><span class="summary-label">Registrados</span><span class="summary-num">{{ lista()!.length }}</span></div>
              <div class="summary-stat"><mat-icon>toggle_on</mat-icon><span class="summary-label">Activos</span><span class="summary-num">{{ activos() }}</span></div>
            </div>
            <mat-form-field class="header-search" subscriptSizing="dynamic">
              <mat-icon matPrefix>search</mat-icon>
              <input matInput [ngModel]="filtro()" (ngModelChange)="filtro.set($event)" placeholder="Registro, nombre o CI..." />
            </mat-form-field>
          }
          <button mat-raised-button class="btn-nuevo" (click)="editar(null)"><mat-icon>add</mat-icon><span>Nuevo estudiante</span></button>
        </div>
      </div>

      @if (!lista()) {
        <div class="loading-state"><mat-spinner diameter="44" /></div>
      } @else {
        <div class="table-section">
          <table mat-table [dataSource]="filas()" class="full-width-table">
            <ng-container matColumnDef="numero">
              <th mat-header-cell *matHeaderCellDef class="col-center">N°</th>
              <td mat-cell *matCellDef="let e; let i = index" class="col-center"><span class="numero-cell">{{ i + 1 }}</span></td>
            </ng-container>
            <ng-container matColumnDef="registro">
              <th mat-header-cell *matHeaderCellDef class="col-center">Registro</th>
              <td mat-cell *matCellDef="let e" class="col-center"><span class="reg">{{ e.registro }}</span></td>
            </ng-container>
            <ng-container matColumnDef="nombre">
              <th mat-header-cell *matHeaderCellDef>Estudiante</th>
              <td mat-cell *matCellDef="let e" class="name-cell">{{ e.apellido }} {{ e.nombre }}</td>
            </ng-container>
            <ng-container matColumnDef="ci">
              <th mat-header-cell *matHeaderCellDef class="col-center">CI</th>
              <td mat-cell *matCellDef="let e" class="col-center">{{ e.ci ?? '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="anio">
              <th mat-header-cell *matHeaderCellDef class="col-center">Año</th>
              <td mat-cell *matCellDef="let e" class="col-center">{{ e.anio_carrera }}°</td>
            </ng-container>
            <ng-container matColumnDef="estado">
              <th mat-header-cell *matHeaderCellDef class="col-center">Estado</th>
              <td mat-cell *matCellDef="let e" (click)="$event.stopPropagation()">
                <mat-slide-toggle color="primary" [checked]="e.estado === 'activo'" (change)="toggleEstado($event, e)">{{ e.estado | titlecase }}</mat-slide-toggle>
              </td>
            </ng-container>
            <ng-container matColumnDef="acciones">
              <th mat-header-cell *matHeaderCellDef class="col-center">Acciones</th>
              <td mat-cell *matCellDef="let e" class="col-center" (click)="$event.stopPropagation()">
                <button mat-icon-button (click)="editar(e)" matTooltip="Editar datos"><mat-icon>edit</mat-icon></button>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columnas"></tr>
            <tr mat-row *matRowDef="let row; columns: columnas" class="clickable-row" matTooltip="Abrir ficha" (click)="abrir(row)"></tr>
          </table>
          @if (filas().length === 0) { <div class="empty-state"><mat-icon>search_off</mat-icon><p>Sin estudiantes con ese criterio.</p></div> }
        </div>
      }
    </div>
  `,
})
export class Estudiantes implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  lista = signal<Estudiante[] | null>(null);
  filtro = signal('');
  columnas = ['numero', 'registro', 'nombre', 'ci', 'anio', 'estado', 'acciones'];

  activos = computed(() => (this.lista() ?? []).filter((e) => e.estado === 'activo').length);
  filas = computed(() => {
    const q = this.filtro().toLowerCase().trim();
    const l = this.lista() ?? [];
    return q ? l.filter((e) => `${e.registro} ${e.apellido} ${e.nombre} ${e.ci ?? ''}`.toLowerCase().includes(q)) : l;
  });

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.api.get<Estudiante[]>('/estudiantes').subscribe({ next: (l) => this.lista.set(l), error: (e) => this.notify.error(e) });
  }

  abrir(e: Estudiante): void {
    this.router.navigate(['/estudiantes', e.registro]);
  }

  editar(e: Estudiante | null): void {
    this.dialog.open(EstudianteDialog, { data: e, width: '580px', maxWidth: '95vw' }).afterClosed().subscribe((r?: Estudiante) => {
      if (!r) return;
      this.notify.ok(e ? 'Estudiante actualizado' : 'Estudiante creado');
      if (e) this.cargar();
      else this.router.navigate(['/estudiantes', r.registro]);
    });
  }

  toggleEstado(ev: MatSlideToggleChange, e: Estudiante): void {
    this.api.patch(`/estudiantes/${e.registro}/estado`, { estado: ev.checked ? 'activo' : 'inactivo' }).subscribe({
      next: () => this.cargar(),
      error: (err) => {
        ev.source.checked = !ev.checked;
        this.notify.error(err);
      },
    });
  }
}
