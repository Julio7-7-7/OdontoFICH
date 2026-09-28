import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { ApiService } from '../../core/api.service';
import { bs, fecha, fechaHora } from '../../core/format';
import { Cierre } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { confirmar } from '../../shared/dialogos';
import { COMUNES } from '../../shared/material';

@Component({
  selector: 'app-cierres',
  imports: [...COMUNES],
  template: `
    <div class="page-container">
      <div class="header-card">
        <div class="header-card-top">
          <div class="header-card-title">
            <div class="header-icon"><mat-icon>fact_check</mat-icon></div>
            <div>
              <h2>Cierres de caja de insumos</h2>
              <p class="subtitle">Efectivo de extras que rinde el encargado; confirme al recibirlo</p>
            </div>
          </div>
          <div class="header-card-stats">
            <div class="summary-stat"><mat-icon>pending</mat-icon><span class="summary-label">Por recibir</span><span class="summary-num">{{ pendientes() }}</span></div>
            <div class="summary-stat"><mat-icon>payments</mat-icon><span class="summary-label">Monto</span><span class="summary-num">{{ bs(montoPendiente()) }}</span></div>
          </div>
        </div>
      </div>
      <div class="table-section">
        <table mat-table [dataSource]="lista()" class="full-width-table">
          <ng-container matColumnDef="fecha">
            <th mat-header-cell *matHeaderCellDef class="col-center">Fecha</th>
            <td mat-cell *matCellDef="let c" class="col-center">{{ fecha(c.fecha) }}</td>
          </ng-container>
          <ng-container matColumnDef="encargado">
            <th mat-header-cell *matHeaderCellDef>Encargado</th>
            <td mat-cell *matCellDef="let c">{{ c.encargado }} <small class="muted">· {{ c.cantidad_ventas }} ventas</small></td>
          </ng-container>
          <ng-container matColumnDef="montos">
            <th mat-header-cell *matHeaderCellDef class="num-right">Sistema / declarado</th>
            <td mat-cell *matCellDef="let c" class="num-right">
              <span class="money">{{ bs(c.total_sistema) }}</span> / <span class="money">{{ bs(c.efectivo_declarado) }}</span>
              @if (c.diferencia !== 0) { <div class="dif">Diferencia {{ bs(c.diferencia) }}</div> }
            </td>
          </ng-container>
          <ng-container matColumnDef="estado">
            <th mat-header-cell *matHeaderCellDef class="col-center">Estado</th>
            <td mat-cell *matCellDef="let c" class="col-center">
              @if (c.estado === 'recibido') {
                <span class="chip ok" [matTooltip]="'Recibido por ' + c.recibido_por + ' · ' + fechaHora(c.recibido_en)">Recibido</span>
              } @else {
                <button mat-flat-button class="btn-guardar" (click)="recibir(c)"><mat-icon>check</mat-icon> Recibir</button>
              }
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columnas"></tr>
          <tr mat-row *matRowDef="let row; columns: columnas"></tr>
        </table>
        @if (!lista().length) { <div class="empty-state"><mat-icon>inbox</mat-icon><p>Todavía no hay cierres.</p></div> }
      </div>
    </div>
  `,
  styles: '.dif { color: var(--fich-danger); font-size: 0.78rem; font-weight: 700; }',
})
export class Cierres implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  lista = signal<Cierre[]>([]);
  columnas = ['fecha', 'encargado', 'montos', 'estado'];
  readonly bs = bs;
  readonly fecha = fecha;
  readonly fechaHora = fechaHora;

  pendientes = computed(() => this.lista().filter((c) => c.estado === 'pendiente').length);
  montoPendiente = computed(() => this.lista().filter((c) => c.estado === 'pendiente').reduce((t, c) => t + c.efectivo_declarado, 0));

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.api.get<Cierre[]>('/cierres').subscribe({ next: (l) => this.lista.set(l), error: (e) => this.notify.error(e) });
  }

  recibir(c: Cierre): void {
    confirmar(this.dialog, {
      titulo: 'Recibir efectivo',
      mensaje: `¿Recibió ${bs(c.efectivo_declarado)} de ${c.encargado} por el cierre del ${fecha(c.fecha)}?`,
      confirmar: 'Recibido',
      icono: 'payments',
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.patch(`/cierres/${c.id}/recibir`).subscribe({
        next: () => {
          this.notify.ok('Cierre recibido');
          this.cargar();
        },
        error: (e) => this.notify.error(e),
      });
    });
  }
}
