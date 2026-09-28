import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { fecha, hoyIso } from '../../core/format';
import { Sesion, SesionResumen } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { COMUNES } from '../../shared/material';
import { SesionDialog } from './sesion-dialog';

@Component({
  selector: 'app-sesiones',
  imports: [...COMUNES],
  template: `
    <div class="page-container">
      <div class="header-card">
        <div class="header-card-top">
          <div class="header-card-title">
            <div class="header-icon"><mat-icon>medical_services</mat-icon></div>
            <div>
              <h2>Sesiones de práctica</h2>
              <p class="subtitle">El sistema bloquea a quien no pagó la cuota</p>
            </div>
          </div>
          @if (sesiones()) {
            <div class="header-card-stats">
              <div class="summary-stat"><mat-icon>event</mat-icon><span class="summary-label">Sesiones</span><span class="summary-num">{{ sesiones()!.length }}</span></div>
              <div class="summary-stat"><mat-icon>today</mat-icon><span class="summary-label">Hoy y próximas</span><span class="summary-num">{{ proximas() }}</span></div>
            </div>
            <mat-form-field class="header-search" subscriptSizing="dynamic">
              <mat-icon matPrefix>search</mat-icon>
              <input matInput [ngModel]="filtro()" (ngModelChange)="filtro.set($event)" placeholder="Buscar..." />
            </mat-form-field>
          }
          <button mat-raised-button class="btn-nuevo" (click)="nueva()"><mat-icon>add</mat-icon><span>Nueva sesión</span></button>
        </div>
      </div>

      @if (!sesiones()) {
        <div class="loading-state"><mat-spinner diameter="44" /></div>
      } @else {
        <div class="table-section">
          <table mat-table [dataSource]="filas()" class="full-width-table">
            <ng-container matColumnDef="numero">
              <th mat-header-cell *matHeaderCellDef class="col-center">N°</th>
              <td mat-cell *matCellDef="let s; let i = index" class="col-center"><span class="numero-cell">{{ i + 1 }}</span></td>
            </ng-container>
            <ng-container matColumnDef="fecha">
              <th mat-header-cell *matHeaderCellDef class="col-center">Fecha</th>
              <td mat-cell *matCellDef="let s" class="col-center">
                {{ fecha(s.fecha) }} @if (s.fecha === hoy) { <span class="chip info">Hoy</span> }
              </td>
            </ng-container>
            <ng-container matColumnDef="practica">
              <th mat-header-cell *matHeaderCellDef>Práctica</th>
              <td mat-cell *matCellDef="let s"><strong>{{ s.tratamiento }}</strong> · <span class="muted">{{ s.sigla }} {{ s.materia }}</span></td>
            </ng-container>
            <ng-container matColumnDef="docente">
              <th mat-header-cell *matHeaderCellDef>Docente</th>
              <td mat-cell *matCellDef="let s">{{ s.docente }}</td>
            </ng-container>
            <ng-container matColumnDef="estudiantes">
              <th mat-header-cell *matHeaderCellDef>Estudiantes</th>
              <td mat-cell *matCellDef="let s">
                <div class="chips-lista">
                  @if (s.entregados) { <span class="chip info">{{ s.entregados }} con kit</span> }
                  @if (s.habilitados) { <span class="chip ok">{{ s.habilitados }} habilitados</span> }
                  @if (s.bloqueados) { <span class="chip danger">{{ s.bloqueados }} bloqueados</span> }
                  @if (!s.entregados && !s.habilitados && !s.bloqueados) { <span class="no-mods">Sin estudiantes</span> }
                </div>
              </td>
            </ng-container>
            <ng-container matColumnDef="estado">
              <th mat-header-cell *matHeaderCellDef class="col-center">Estado</th>
              <td mat-cell *matCellDef="let s" class="col-center">
                <span class="chip" [class.ok]="s.estado === 'abierta'" [class.muted]="s.estado === 'anulada'">{{ s.estado | titlecase }}</span>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columnas()"></tr>
            <tr mat-row *matRowDef="let row; columns: columnas()" class="clickable-row" (click)="abrir(row.id)"></tr>
          </table>
          @if (filas().length === 0) {
            <div class="empty-state"><mat-icon>event_busy</mat-icon><p>No hay sesiones. Cree la primera con "Nueva sesión".</p></div>
          }
        </div>
      }
    </div>
  `,
})
export class Sesiones implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  auth = inject(AuthService);

  sesiones = signal<SesionResumen[] | null>(null);
  filtro = signal('');
  readonly hoy = hoyIso();
  readonly fecha = fecha;

  columnas = computed(() =>
    this.auth.esAdmin()
      ? ['numero', 'fecha', 'practica', 'docente', 'estudiantes', 'estado']
      : ['numero', 'fecha', 'practica', 'estudiantes', 'estado'],
  );
  proximas = computed(() => (this.sesiones() ?? []).filter((s) => s.fecha >= this.hoy && s.estado === 'abierta').length);
  filas = computed(() => {
    const q = this.filtro().toLowerCase().trim();
    const lista = this.sesiones() ?? [];
    return q ? lista.filter((s) => `${s.tratamiento} ${s.materia} ${s.sigla} ${s.docente}`.toLowerCase().includes(q)) : lista;
  });

  ngOnInit(): void {
    this.api.get<SesionResumen[]>('/sesiones').subscribe({
      next: (s) => this.sesiones.set(s),
      error: (e) => this.notify.error(e),
    });
  }

  abrir(id: number): void {
    this.router.navigate(['/docente/sesiones', id]);
  }

  nueva(): void {
    this.dialog
      .open(SesionDialog, { data: null, width: '600px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((s: Sesion | undefined) => {
        if (s) this.abrir(s.id);
      });
  }
}
