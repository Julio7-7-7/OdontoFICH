import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { ApiService } from '../../core/api.service';
import { bs, fecha, fechaHora } from '../../core/format';
import { Cierre, CierrePreview } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { confirmar } from '../../shared/dialogos';
import { COMUNES } from '../../shared/material';

@Component({
  selector: 'app-cierre',
  imports: [...COMUNES],
  template: `
    <div class="page-container">
      <div class="header-card">
        <div class="header-card-top">
          <div class="header-card-title">
            <div class="header-icon"><mat-icon>lock_clock</mat-icon></div>
            <div>
              <h2>Cierre de caja del día</h2>
              <p class="subtitle">Cuente el efectivo de las ventas de extras y ríndalo a administración</p>
            </div>
          </div>
        </div>
      </div>

      <div class="dos-columnas">
        <section class="panel-card">
          @if (preview(); as p) {
            <h3><mat-icon>calculate</mat-icon> {{ fecha(p.fecha) }}</h3>
            @if (p.ya_cerrado) {
              <div class="aviso ok"><mat-icon>verified</mat-icon><div>La caja de este día ya está cerrada.</div></div>
            } @else {
              <div class="kpi-grid">
                <div class="kpi"><span class="kpi-icon azul"><mat-icon>receipt</mat-icon></span>
                  <span><div class="kpi-num">{{ p.cantidad_ventas }}</div><div class="kpi-label">Ventas sin cerrar</div></span></div>
                <div class="kpi"><span class="kpi-icon verde"><mat-icon>payments</mat-icon></span>
                  <span><div class="kpi-num">{{ bs(p.total_sistema) }}</div><div class="kpi-label">Lo que debe haber en caja</div></span></div>
              </div>
              <mat-form-field class="w-100">
                <mat-label>Efectivo contado (Bs)</mat-label>
                <input matInput type="number" min="0" step="0.01" [ngModel]="efectivo()" (ngModelChange)="efectivo.set($event)" />
              </mat-form-field>
              @if (efectivo() !== null) {
                <div class="aviso" [class.ok]="diferencia() === 0" [class.warn]="diferencia() !== 0">
                  <mat-icon>{{ diferencia() === 0 ? 'check_circle' : 'error' }}</mat-icon>
                  <div>
                    @if (diferencia() === 0) { Cuadra exacto con el sistema. }
                    @else if (diferencia() > 0) { Sobran {{ bs(diferencia()) }}. }
                    @else { Faltan {{ bs(-diferencia()) }}. }
                  </div>
                </div>
              }
              <mat-form-field class="w-100">
                <mat-label>Observación (opcional)</mat-label>
                <input matInput maxlength="200" [ngModel]="observacion()" (ngModelChange)="observacion.set($event)" />
              </mat-form-field>
              <button mat-flat-button class="btn-guardar w-100" [disabled]="efectivo() === null || efectivo()! < 0" (click)="cerrar()">
                <mat-icon>lock</mat-icon> Cerrar caja
              </button>
              <p class="muted nota">Después del cierre no se pueden registrar ni anular ventas de este día.</p>
            }
          } @else {
            <div class="loading-state"><mat-spinner diameter="40" /></div>
          }
        </section>

        <section class="panel-card">
          <h3><mat-icon>history</mat-icon> Mis cierres</h3>
          @for (c of cierres(); track c.id) {
            <div class="cierre">
              <div>
                <strong>{{ fecha(c.fecha) }}</strong> · {{ c.cantidad_ventas }} ventas
                <div class="muted det">Sistema {{ bs(c.total_sistema) }} · declarado {{ bs(c.efectivo_declarado) }}
                  @if (c.diferencia !== 0) { · <span class="dif">diferencia {{ bs(c.diferencia) }}</span> }</div>
              </div>
              <span class="chip" [class.ok]="c.estado === 'recibido'" [class.warn]="c.estado === 'pendiente'"
                    [matTooltip]="c.recibido_por ? 'Recibido por ' + c.recibido_por + ' el ' + fechaHora(c.recibido_en) : 'Falta que administración lo reciba'">
                {{ c.estado === 'recibido' ? 'Recibido' : 'Por entregar' }}
              </span>
            </div>
          } @empty {
            <p class="no-mods">Sin cierres todavía.</p>
          }
        </section>
      </div>
    </div>
  `,
  styles: `
    .w-100 { width: 100%; }
    .nota { font-size: 0.8rem; }
    .cierre { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0;
      border-bottom: 0.5px solid var(--ap-separator); }
    .det { font-size: 0.8rem; margin-top: 2px; }
    .dif { color: var(--fich-danger); font-weight: 700; }
  `,
})
export class CierreCaja implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);

  preview = signal<CierrePreview | null>(null);
  cierres = signal<Cierre[]>([]);
  efectivo = signal<number | null>(null);
  observacion = signal('');
  readonly bs = bs;
  readonly fecha = fecha;
  readonly fechaHora = fechaHora;

  diferencia = computed(() => Math.round(((this.efectivo() ?? 0) - (this.preview()?.total_sistema ?? 0)) * 100) / 100);

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.api.get<CierrePreview>('/cierres/preview').subscribe({
      next: (p) => this.preview.set(p),
      error: (e) => this.notify.error(e),
    });
    this.api.get<Cierre[]>('/cierres').subscribe((c) => this.cierres.set(c));
  }

  cerrar(): void {
    confirmar(this.dialog, {
      titulo: 'Cerrar caja',
      mensaje: `Declara ${bs(this.efectivo())} en efectivo. Esta acción no se puede deshacer.`,
      confirmar: 'Cerrar caja',
      icono: 'lock',
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.post<Cierre>('/cierres', { efectivo_declarado: this.efectivo(), observacion: this.observacion() || null }).subscribe({
        next: () => {
          this.notify.ok('Caja cerrada: entregue el efectivo a administración');
          this.efectivo.set(null);
          this.cargar();
        },
        error: (e) => this.notify.error(e),
      });
    });
  }
}
