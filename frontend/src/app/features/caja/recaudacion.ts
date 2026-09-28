import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { ApiService } from '../../core/api.service';
import { aIso, bs, deIso, fecha, hoyIso } from '../../core/format';
import { Recaudacion } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { COMUNES } from '../../shared/material';

@Component({
  selector: 'app-recaudacion',
  imports: [...COMUNES],
  template: `
    <div class="page-container">
      <div class="header-card">
        <div class="header-card-top">
          <div class="header-card-title">
            <div class="header-icon"><mat-icon>bar_chart</mat-icon></div>
            <div>
              <h2>Recaudación</h2>
              <p class="subtitle">Cuotas cobradas en caja + extras vendidos en insumos</p>
            </div>
          </div>
          <div class="rango">
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>Desde</mat-label>
              <input matInput [matDatepicker]="d1" [ngModel]="desde()" (ngModelChange)="desde.set($event)" />
              <mat-datepicker-toggle matSuffix [for]="d1" /><mat-datepicker #d1 />
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>Hasta</mat-label>
              <input matInput [matDatepicker]="d2" [ngModel]="hasta()" (ngModelChange)="hasta.set($event)" />
              <mat-datepicker-toggle matSuffix [for]="d2" /><mat-datepicker #d2 />
            </mat-form-field>
            <button mat-flat-button class="btn-guardar" (click)="cargar()"><mat-icon>search</mat-icon> Consultar</button>
          </div>
        </div>
      </div>

      @if (datos(); as r) {
        <div class="kpi-grid">
          <div class="kpi"><span class="kpi-icon azul"><mat-icon>point_of_sale</mat-icon></span>
            <span><div class="kpi-num">{{ bs(r.cuotas) }}</div><div class="kpi-label">Cuotas (caja)</div></span></div>
          <div class="kpi"><span class="kpi-icon ambar"><mat-icon>storefront</mat-icon></span>
            <span><div class="kpi-num">{{ bs(r.extras) }}</div><div class="kpi-label">Extras (insumos)</div></span></div>
          <div class="kpi"><span class="kpi-icon verde"><mat-icon>savings</mat-icon></span>
            <span><div class="kpi-num">{{ bs(r.total) }}</div><div class="kpi-label">Total {{ fecha(r.desde) }} – {{ fecha(r.hasta) }}</div></span></div>
        </div>

        <section class="panel-card">
          <h3><mat-icon>calendar_view_day</mat-icon> Por día</h3>
          @for (d of r.por_dia; track d.fecha) {
            <div class="dia">
              <span class="dia-fecha">{{ fecha(d.fecha) }}</span>
              <div class="dia-barras">
                <span class="b-cuotas" [style.width.%]="(100 * d.cuotas) / maximo()" [matTooltip]="'Cuotas ' + bs(d.cuotas)"></span>
                <span class="b-extras" [style.width.%]="(100 * d.extras) / maximo()" [matTooltip]="'Extras ' + bs(d.extras)"></span>
              </div>
              <span class="money">{{ bs(d.total) }}</span>
            </div>
          } @empty {
            <p class="no-mods">Sin movimientos en el rango elegido.</p>
          }
          <div class="leyenda"><span class="l-cuotas"></span> Cuotas <span class="l-extras"></span> Extras</div>
        </section>
      } @else {
        <div class="loading-state"><mat-spinner diameter="44" /></div>
      }
    </div>
  `,
  styles: `
    .rango { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-left: auto; }
    .rango mat-form-field { width: 170px; }
    .dia { display: grid; grid-template-columns: 110px 1fr 130px; gap: 12px; align-items: center; padding: 6px 0;
      border-bottom: 0.5px solid var(--ap-separator); }
    .dia-fecha { font-weight: 600; }
    .dia .money { text-align: right; }
    .dia-barras { display: flex; height: 16px; border-radius: 999px; overflow: hidden; background: var(--fich-bg-hover); }
    .b-cuotas, .l-cuotas { background: var(--fich-primary); }
    .b-extras, .l-extras { background: var(--ap-orange-fill); }
    .leyenda { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 0.8rem; color: var(--fich-text-muted); }
    .leyenda span { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
  `,
})
export class RecaudacionPage implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);

  hasta = signal<Date | null>(deIso(hoyIso()));
  desde = signal<Date | null>(new Date(new Date().getFullYear(), 0, 1));
  datos = signal<Recaudacion | null>(null);
  maximo = computed(() => Math.max(1, ...(this.datos()?.por_dia ?? []).map((d) => d.total)));

  readonly bs = bs;
  readonly fecha = fecha;

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.api.get<Recaudacion>('/reportes/recaudacion', { desde: aIso(this.desde()), hasta: aIso(this.hasta()) }).subscribe({
      next: (r) => this.datos.set(r),
      error: (e) => this.notify.error(e),
    });
  }
}
