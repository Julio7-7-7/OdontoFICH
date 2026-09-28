import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { ApiService } from '../../core/api.service';
import { num } from '../../core/format';
import { Consumo } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { COMUNES } from '../../shared/material';

@Component({
  selector: 'app-consumo',
  imports: [...COMUNES],
  template: `
    <div class="page-container">
      <div class="header-card">
        <div class="header-card-top">
          <div class="header-card-title">
            <div class="header-icon"><mat-icon>insights</mat-icon></div>
            <div>
              <h2>Consumo previsto contra real {{ datos()?.anio ?? '' }}</h2>
              <p class="subtitle">Previsto = inscritos × plan × kit. Lo vendido como extra es lo que el plan no contemplaba (desperdicio).</p>
            </div>
          </div>
          @if (datos(); as d) {
            <div class="header-card-stats">
              <div class="summary-stat"><mat-icon>school</mat-icon><span class="summary-label">Inscritos</span><span class="summary-num">{{ d.estudiantes_inscritos }}</span></div>
              <div class="summary-stat"><mat-icon>warning</mat-icon><span class="summary-label">No alcanzan</span><span class="summary-num">{{ noAlcanzan() }}</span></div>
            </div>
          }
        </div>
      </div>

      @if (datos(); as d) {
        <div class="table-section">
          <table mat-table [dataSource]="d.insumos" class="full-width-table">
            <ng-container matColumnDef="insumo">
              <th mat-header-cell *matHeaderCellDef>Insumo</th>
              <td mat-cell *matCellDef="let i" class="name-cell">{{ i.insumo }} <small class="muted">{{ i.codigo }}</small></td>
            </ng-container>
            <ng-container matColumnDef="barra">
              <th mat-header-cell *matHeaderCellDef>Previsto / entregado en kits / extra</th>
              <td mat-cell *matCellDef="let i">
                <div class="consumo">
                  <span class="c-kits" [style.width.%]="pct(i.entregado_en_kits, i)"></span>
                  <span class="c-extra" [style.width.%]="pct(i.vendido_como_extra, i)"></span>
                </div>
                <small class="muted">{{ num(i.previsto_anual) }} / {{ num(i.entregado_en_kits) }} / {{ num(i.vendido_como_extra) }} {{ i.unidad_medida }}</small>
              </td>
            </ng-container>
            <ng-container matColumnDef="extra">
              <th mat-header-cell *matHeaderCellDef class="col-center">Extra sobre kits</th>
              <td mat-cell *matCellDef="let i" class="col-center">
                <span class="chip" [class.warn]="i.extra_sobre_kits_pct >= 10" [class.muted]="i.extra_sobre_kits_pct < 10">{{ i.extra_sobre_kits_pct }} %</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="stock">
              <th mat-header-cell *matHeaderCellDef class="num-right">Pendiente del plan / stock</th>
              <td mat-cell *matCellDef="let i" class="num-right">
                {{ num(i.pendiente_segun_plan) }} / <strong>{{ num(i.stock_actual) }}</strong>
                @if (!i.alcanza_para_lo_pendiente) { <span class="chip danger">No alcanza</span> }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columnas"></tr>
            <tr mat-row *matRowDef="let row; columns: columnas"></tr>
          </table>
        </div>
        <div class="leyenda"><span class="c-kits"></span> Entregado en kits <span class="c-extra"></span> Vendido como extra · barra completa = previsto del año</div>
      } @else {
        <div class="loading-state"><mat-spinner diameter="44" /></div>
      }
    </div>
  `,
  styles: `
    .consumo { display: flex; height: 12px; border-radius: 999px; overflow: hidden; background: var(--fich-bg-active); min-width: 220px; }
    .c-kits { background: var(--fich-primary); }
    .c-extra { background: var(--ap-orange-fill); }
    .leyenda { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 0.8rem; color: var(--fich-text-muted); }
    .leyenda span { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
  `,
})
export class ConsumoPage implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);

  datos = signal<Consumo | null>(null);
  columnas = ['insumo', 'barra', 'extra', 'stock'];
  readonly num = num;
  noAlcanzan = computed(() => (this.datos()?.insumos ?? []).filter((i) => !i.alcanza_para_lo_pendiente).length);

  ngOnInit(): void {
    this.api.get<Consumo>('/reportes/consumo').subscribe({
      next: (d) => this.datos.set(d),
      error: (e) => this.notify.error(e),
    });
  }

  pct(valor: number, i: { previsto_anual: number; entregado_en_kits: number; vendido_como_extra: number }): number {
    const base = Math.max(i.previsto_anual, i.entregado_en_kits + i.vendido_como_extra, 1);
    return (100 * valor) / base;
  }
}
