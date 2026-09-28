import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';

import { ApiService } from '../../core/api.service';
import { Docente } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { COMUNES } from '../../shared/material';

@Component({
  selector: 'app-docente-dialog',
  imports: [...COMUNES],
  template: `
    <div class="dialog-header">
      <div class="header-icon"><mat-icon>badge</mat-icon><span class="header-icon-badge"><mat-icon>{{ data ? 'edit' : 'add' }}</mat-icon></span></div>
      <div>
        <h2 mat-dialog-title>{{ data ? 'Editar docente' : 'Nuevo docente' }}</h2>
        <p class="header-sub">Para que habilite prácticas, créele un usuario con rol Docente en Usuarios</p>
      </div>
    </div>
    <mat-dialog-content>
      <form [formGroup]="form" class="form-grid">
        <mat-form-field><mat-label>Apellidos</mat-label><input matInput formControlName="apellido" /></mat-form-field>
        <mat-form-field><mat-label>Nombres</mat-label><input matInput formControlName="nombre" /></mat-form-field>
        <mat-form-field><mat-label>CI</mat-label><input matInput formControlName="ci" /></mat-form-field>
        <mat-form-field><mat-label>Teléfono</mat-label><input matInput formControlName="telefono" /></mat-form-field>
        <mat-form-field class="span-2"><mat-label>Especialidad</mat-label><input matInput formControlName="especialidad" /></mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button class="btn-guardar" [disabled]="form.invalid || guardando()" (click)="guardar()">
        <mat-icon>{{ data ? 'save' : 'add' }}</mat-icon> {{ data ? 'Guardar cambios' : 'Crear docente' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class DocenteDialog {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private ref = inject(MatDialogRef<DocenteDialog, Docente>);
  data = inject<Docente | null>(MAT_DIALOG_DATA);
  guardando = signal(false);

  form = inject(FormBuilder).nonNullable.group({
    ci: [this.data?.ci ?? '', [Validators.required, Validators.minLength(4)]],
    nombre: [this.data?.nombre ?? '', Validators.required],
    apellido: [this.data?.apellido ?? '', Validators.required],
    telefono: [this.data?.telefono ?? ''],
    especialidad: [this.data?.especialidad ?? ''],
  });

  guardar(): void {
    this.guardando.set(true);
    const v = this.form.getRawValue();
    const cuerpo = { ...v, telefono: v.telefono || null, especialidad: v.especialidad || null };
    const peticion = this.data ? this.api.patch<Docente>(`/docentes/${this.data.id}`, cuerpo) : this.api.post<Docente>('/docentes', cuerpo);
    peticion.subscribe({
      next: (d) => this.ref.close(d),
      error: (e) => {
        this.guardando.set(false);
        this.notify.error(e);
      },
    });
  }
}

@Component({
  selector: 'app-docentes',
  imports: [...COMUNES],
  template: `
    <div class="page-container">
      <div class="header-card">
        <div class="header-card-top">
          <div class="header-card-title">
            <div class="header-icon"><mat-icon>badge</mat-icon></div>
            <div>
              <h2>Docentes</h2>
              <p class="subtitle">Docentes que programan sesiones de práctica y habilitan a sus estudiantes</p>
            </div>
          </div>
          @if (lista()) {
            <div class="header-card-stats">
              <div class="summary-stat"><mat-icon>badge</mat-icon><span class="summary-label">Docentes</span><span class="summary-num">{{ lista()!.length }}</span></div>
              <div class="summary-stat"><mat-icon>toggle_on</mat-icon><span class="summary-label">Activos</span><span class="summary-num">{{ activos() }}</span></div>
            </div>
            <mat-form-field class="header-search" subscriptSizing="dynamic">
              <mat-icon matPrefix>search</mat-icon>
              <input matInput [ngModel]="filtro()" (ngModelChange)="filtro.set($event)" placeholder="Nombre o CI..." />
            </mat-form-field>
          }
          <button mat-raised-button class="btn-nuevo" (click)="editar(null)"><mat-icon>add</mat-icon><span>Nuevo docente</span></button>
        </div>
      </div>
      @if (!lista()) {
        <div class="loading-state"><mat-spinner diameter="44" /></div>
      } @else {
        <div class="table-section">
          <table mat-table [dataSource]="filas()" class="full-width-table">
            <ng-container matColumnDef="numero">
              <th mat-header-cell *matHeaderCellDef class="col-center">N°</th>
              <td mat-cell *matCellDef="let d; let i = index" class="col-center"><span class="numero-cell">{{ i + 1 }}</span></td>
            </ng-container>
            <ng-container matColumnDef="nombre">
              <th mat-header-cell *matHeaderCellDef>Docente</th>
              <td mat-cell *matCellDef="let d" class="name-cell">{{ d.apellido }} {{ d.nombre }}</td>
            </ng-container>
            <ng-container matColumnDef="ci">
              <th mat-header-cell *matHeaderCellDef class="col-center">CI</th>
              <td mat-cell *matCellDef="let d" class="col-center">{{ d.ci }}</td>
            </ng-container>
            <ng-container matColumnDef="especialidad">
              <th mat-header-cell *matHeaderCellDef>Especialidad</th>
              <td mat-cell *matCellDef="let d">{{ d.especialidad ?? '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="telefono">
              <th mat-header-cell *matHeaderCellDef class="col-center">Teléfono</th>
              <td mat-cell *matCellDef="let d" class="col-center">{{ d.telefono ?? '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="estado">
              <th mat-header-cell *matHeaderCellDef class="col-center">Estado</th>
              <td mat-cell *matCellDef="let d" (click)="$event.stopPropagation()">
                <mat-slide-toggle color="primary" [checked]="d.estado === 'activo'" (change)="toggleEstado($event, d)">{{ d.estado | titlecase }}</mat-slide-toggle>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columnas"></tr>
            <tr mat-row *matRowDef="let row; columns: columnas" class="clickable-row" matTooltip="Editar docente" (click)="editar(row)"></tr>
          </table>
        </div>
      }
    </div>
  `,
})
export class Docentes implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);

  lista = signal<Docente[] | null>(null);
  filtro = signal('');
  columnas = ['numero', 'nombre', 'ci', 'especialidad', 'telefono', 'estado'];
  activos = computed(() => (this.lista() ?? []).filter((d) => d.estado === 'activo').length);
  filas = computed(() => {
    const q = this.filtro().toLowerCase().trim();
    const l = this.lista() ?? [];
    return q ? l.filter((d) => `${d.apellido} ${d.nombre} ${d.ci}`.toLowerCase().includes(q)) : l;
  });

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.api.get<Docente[]>('/docentes').subscribe({ next: (l) => this.lista.set(l), error: (e) => this.notify.error(e) });
  }

  editar(d: Docente | null): void {
    this.dialog.open(DocenteDialog, { data: d, width: '580px', maxWidth: '95vw' }).afterClosed().subscribe((r) => {
      if (!r) return;
      this.notify.ok(d ? 'Docente actualizado' : 'Docente creado');
      this.cargar();
    });
  }

  toggleEstado(ev: MatSlideToggleChange, d: Docente): void {
    this.api.patch(`/docentes/${d.id}/estado`, { estado: ev.checked ? 'activo' : 'inactivo' }).subscribe({
      next: () => this.cargar(),
      error: (e) => {
        ev.source.checked = !ev.checked;
        this.notify.error(e);
      },
    });
  }
}
