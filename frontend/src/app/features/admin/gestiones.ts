import { Component, OnInit, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';

import { ApiService } from '../../core/api.service';
import { aIso, deIso, fecha } from '../../core/format';
import { Gestion } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { confirmar } from '../../shared/dialogos';
import { COMUNES } from '../../shared/material';

@Component({
  selector: 'app-gestion-dialog',
  imports: [...COMUNES],
  template: `
    <div class="dialog-header">
      <div class="header-icon"><mat-icon>event</mat-icon><span class="header-icon-badge"><mat-icon>{{ data ? 'edit' : 'add' }}</mat-icon></span></div>
      <div>
        <h2 mat-dialog-title>{{ data ? 'Editar gestión ' + data.anio : 'Nueva gestión' }}</h2>
        <p class="header-sub">La fecha de corte separa el 1er semestre (cuota 1) del 2do (cuota 2)</p>
      </div>
    </div>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field><mat-label>Año</mat-label><input matInput type="number" [ngModel]="anio()" (ngModelChange)="anio.set($event)" /></mat-form-field>
        <mat-form-field><mat-label>Inicio de clases</mat-label>
          <input matInput [matDatepicker]="d1" [ngModel]="inicio()" (ngModelChange)="inicio.set($event)" /><mat-datepicker-toggle matSuffix [for]="d1" /><mat-datepicker #d1 /></mat-form-field>
        <mat-form-field><mat-label>Fecha de corte (inicio 2do semestre)</mat-label>
          <input matInput [matDatepicker]="d2" [ngModel]="corte()" (ngModelChange)="corte.set($event)" /><mat-datepicker-toggle matSuffix [for]="d2" /><mat-datepicker #d2 /></mat-form-field>
        <mat-form-field><mat-label>Fin de la gestión</mat-label>
          <input matInput [matDatepicker]="d3" [ngModel]="fin()" (ngModelChange)="fin.set($event)" /><mat-datepicker-toggle matSuffix [for]="d3" /><mat-datepicker #d3 /></mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button class="btn-guardar" [disabled]="!anio() || !inicio() || !corte() || !fin() || guardando()" (click)="guardar()">
        <mat-icon>save</mat-icon> Guardar
      </button>
    </mat-dialog-actions>
  `,
})
export class GestionDialog {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private ref = inject(MatDialogRef<GestionDialog, Gestion>);
  data = inject<Gestion | null>(MAT_DIALOG_DATA);
  anio = signal<number>(this.data?.anio ?? new Date().getFullYear() + 1);
  inicio = signal<Date | null>(deIso(this.data?.fecha_inicio));
  corte = signal<Date | null>(deIso(this.data?.fecha_corte));
  fin = signal<Date | null>(deIso(this.data?.fecha_fin));
  guardando = signal(false);

  guardar(): void {
    this.guardando.set(true);
    const cuerpo = { anio: Number(this.anio()), fecha_inicio: aIso(this.inicio()), fecha_corte: aIso(this.corte()), fecha_fin: aIso(this.fin()) };
    const peticion = this.data ? this.api.put<Gestion>(`/gestiones/${this.data.id}`, cuerpo) : this.api.post<Gestion>('/gestiones', cuerpo);
    peticion.subscribe({
      next: (g) => this.ref.close(g),
      error: (e) => {
        this.guardando.set(false);
        this.notify.error(e);
      },
    });
  }
}

@Component({
  selector: 'app-gestiones',
  imports: [...COMUNES],
  template: `
    <div class="page-container">
      <div class="header-card">
        <div class="header-card-top">
          <div class="header-card-title">
            <div class="header-icon"><mat-icon>event</mat-icon></div>
            <div>
              <h2>Gestiones</h2>
              <p class="subtitle">Año académico: define qué cuota exige cada semestre. Solo una gestión está activa.</p>
            </div>
          </div>
          <button mat-raised-button class="btn-nuevo" (click)="editar(null)"><mat-icon>add</mat-icon><span>Nueva gestión</span></button>
        </div>
      </div>
      <div class="table-section">
        <table mat-table [dataSource]="lista()" class="full-width-table">
          <ng-container matColumnDef="anio">
            <th mat-header-cell *matHeaderCellDef class="col-center">Año</th>
            <td mat-cell *matCellDef="let g" class="col-center"><strong>{{ g.anio }}</strong></td>
          </ng-container>
          <ng-container matColumnDef="s1">
            <th mat-header-cell *matHeaderCellDef>1er semestre (cuota 1)</th>
            <td mat-cell *matCellDef="let g">{{ fecha(g.fecha_inicio) }} → {{ fecha(g.fecha_corte) }}</td>
          </ng-container>
          <ng-container matColumnDef="s2">
            <th mat-header-cell *matHeaderCellDef>2do semestre (cuota 2)</th>
            <td mat-cell *matCellDef="let g">{{ fecha(g.fecha_corte) }} → {{ fecha(g.fecha_fin) }}</td>
          </ng-container>
          <ng-container matColumnDef="estado">
            <th mat-header-cell *matHeaderCellDef class="col-center">Estado</th>
            <td mat-cell *matCellDef="let g" class="col-center" (click)="$event.stopPropagation()">
              @if (g.activa) { <span class="chip ok"><mat-icon>check</mat-icon> Activa</span> }
              @else { <button mat-stroked-button (click)="activar(g)">Activar</button> }
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columnas"></tr>
          <tr mat-row *matRowDef="let row; columns: columnas" class="clickable-row" matTooltip="Editar fechas" (click)="editar(row)"></tr>
        </table>
      </div>
    </div>
  `,
})
export class Gestiones implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  lista = signal<Gestion[]>([]);
  columnas = ['anio', 's1', 's2', 'estado'];
  readonly fecha = fecha;

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.api.get<Gestion[]>('/gestiones').subscribe({ next: (l) => this.lista.set(l), error: (e) => this.notify.error(e) });
  }

  editar(g: Gestion | null): void {
    this.dialog.open(GestionDialog, { data: g, width: '560px', maxWidth: '95vw' }).afterClosed().subscribe((r) => {
      if (!r) return;
      this.notify.ok('Gestión guardada');
      this.cargar();
    });
  }

  activar(g: Gestion): void {
    confirmar(this.dialog, {
      titulo: `Activar la gestión ${g.anio}`,
      mensaje: 'Las inscripciones, cobros y sesiones nuevas pasarán a usar esta gestión.',
      confirmar: 'Activar',
      icono: 'event_available',
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.patch(`/gestiones/${g.id}/activar`).subscribe({
        next: () => {
          this.notify.ok(`Gestión ${g.anio} activa`);
          this.cargar();
        },
        error: (e) => this.notify.error(e),
      });
    });
  }
}
