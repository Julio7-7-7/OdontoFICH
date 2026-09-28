import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { bs } from '../../core/format';
import { Deudores as DeudoresData } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { COMUNES } from '../../shared/material';

@Component({
  selector: 'app-deudores',
  imports: [...COMUNES],
  template: `
    <div class="page-container">
      <div class="header-card">
        <div class="header-card-top">
          <div class="header-card-title">
            <div class="header-icon"><mat-icon>money_off</mat-icon></div>
            <div>
              <h2>Deudores {{ datos()?.anio ?? '' }}</h2>
              <p class="subtitle">Saldo pendiente y bloqueo para practicar hoy</p>
            </div>
          </div>
          @if (datos(); as d) {
            <div class="header-card-stats">
              <div class="summary-stat"><mat-icon>group</mat-icon><span class="summary-label">Con deuda</span><span class="summary-num">{{ d.cantidad }}</span></div>
              <div class="summary-stat"><mat-icon>account_balance_wallet</mat-icon><span class="summary-label">Por cobrar</span><span class="summary-num">{{ bs(d.saldo_total) }}</span></div>
            </div>
            <mat-form-field class="header-search" subscriptSizing="dynamic">
              <mat-icon matPrefix>search</mat-icon>
              <input matInput [ngModel]="filtro()" (ngModelChange)="filtro.set($event)" placeholder="Buscar..." />
            </mat-form-field>
          }
        </div>
      </div>

      @if (!datos()) {
        <div class="loading-state"><mat-spinner diameter="44" /><p>Calculando saldos…</p></div>
      } @else {
        <div class="table-section">
          <table mat-table [dataSource]="filas()" class="full-width-table">
            <ng-container matColumnDef="numero">
              <th mat-header-cell *matHeaderCellDef class="col-center">N°</th>
              <td mat-cell *matCellDef="let d; let i = index" class="col-center"><span class="numero-cell">{{ i + 1 }}</span></td>
            </ng-container>
            <ng-container matColumnDef="estudiante">
              <th mat-header-cell *matHeaderCellDef>Estudiante</th>
              <td mat-cell *matCellDef="let d" class="name-cell"><span class="reg">{{ d.registro }}</span> {{ d.estudiante }}</td>
            </ng-container>
            <ng-container matColumnDef="total">
              <th mat-header-cell *matHeaderCellDef class="num-right">Deuda anual</th>
              <td mat-cell *matCellDef="let d" class="num-right money">{{ bs(d.total) }}</td>
            </ng-container>
            <ng-container matColumnDef="saldo">
              <th mat-header-cell *matHeaderCellDef class="num-right">Saldo</th>
              <td mat-cell *matCellDef="let d" class="num-right money saldo">{{ bs(d.saldo) }}</td>
            </ng-container>
            <ng-container matColumnDef="cuotas">
              <th mat-header-cell *matHeaderCellDef class="col-center">Cuotas</th>
              <td mat-cell *matCellDef="let d" class="col-center">
                <span class="chip" [class.ok]="d.cuota_1 === 'pagada'" [class.warn]="d.cuota_1 === 'parcial'" [class.danger]="d.cuota_1 === 'pendiente'">1: {{ d.cuota_1 }}</span>
                @if (d.cuota_2 !== 'no_aplica') {
                  <span class="chip" [class.ok]="d.cuota_2 === 'pagada'" [class.warn]="d.cuota_2 === 'parcial'" [class.danger]="d.cuota_2 === 'pendiente'">2: {{ d.cuota_2 }}</span>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="hoy">
              <th mat-header-cell *matHeaderCellDef>Prácticas hoy</th>
              <td mat-cell *matCellDef="let d">
                @if (d.bloqueado_hoy) { <span class="chip danger" [matTooltip]="d.motivo">Bloqueado</span> }
                @else { <span class="chip ok">Habilitado</span> }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columnas"></tr>
            <tr mat-row *matRowDef="let row; columns: columnas" class="clickable-row" matTooltip="Ir a cobrar"
                (click)="cobrar(row.registro)"></tr>
          </table>
          @if (filas().length === 0) {
            <div class="empty-state"><mat-icon>celebration</mat-icon><p>No hay deudores con ese criterio.</p></div>
          }
        </div>
      }
    </div>
  `,
  styles: '.chip + .chip { margin-left: 4px; } .saldo { color: var(--fich-danger); }',
})
export class Deudores implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private router = inject(Router);

  datos = signal<DeudoresData | null>(null);
  filtro = signal('');
  readonly bs = bs;
  columnas = ['numero', 'estudiante', 'total', 'saldo', 'cuotas', 'hoy'];

  filas = computed(() => {
    const q = this.filtro().toLowerCase().trim();
    const lista = this.datos()?.deudores ?? [];
    return q ? lista.filter((d) => `${d.registro} ${d.estudiante}`.toLowerCase().includes(q)) : lista;
  });

  ngOnInit(): void {
    this.api.get<DeudoresData>('/reportes/deudores').subscribe({
      next: (d) => this.datos.set(d),
      error: (e) => this.notify.error(e),
    });
  }

  cobrar(registro: number): void {
    this.router.navigate(['/caja/cobros'], { queryParams: { registro } });
  }
}
