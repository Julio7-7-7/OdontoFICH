import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';

import { ApiService } from '../../core/api.service';
import { bs, num } from '../../core/format';
import { Insumo } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { COMUNES } from '../../shared/material';
import { InsumoDialog, KardexDialog, MovimientoDialog } from './stock-dialogos';

@Component({
  selector: 'app-stock',
  imports: [...COMUNES],
  template: `
    <div class="page-container">
      <div class="header-card">
        <div class="header-card-top">
          <div class="header-card-title">
            <div class="header-icon"><mat-icon>inventory_2</mat-icon></div>
            <div>
              <h2>Stock de insumos</h2>
              <p class="subtitle">Baja solo con cada kit entregado o extra vendido; sube con las entradas</p>
            </div>
          </div>
          @if (insumos()) {
            <div class="header-card-stats">
              <div class="summary-stat"><mat-icon>inventory_2</mat-icon><span class="summary-label">Insumos</span><span class="summary-num">{{ activos().length }}</span></div>
              <div class="summary-stat"><mat-icon>warning</mat-icon><span class="summary-label">Bajo mínimo</span><span class="summary-num">{{ bajos() }}</span></div>
            </div>
            <mat-form-field class="header-search" subscriptSizing="dynamic">
              <mat-icon matPrefix>search</mat-icon>
              <input matInput [ngModel]="filtro()" (ngModelChange)="filtro.set($event)" placeholder="Código o nombre..." />
            </mat-form-field>
          }
          <button mat-raised-button class="btn-nuevo" (click)="editar(null)"><mat-icon>add</mat-icon><span>Nuevo insumo</span></button>
        </div>
      </div>

      <div class="filtros">
        <mat-slide-toggle [checked]="soloBajos()" (change)="soloBajos.set($event.checked)">Solo los que están en o bajo su mínimo</mat-slide-toggle>
      </div>

      @if (!insumos()) {
        <div class="loading-state"><mat-spinner diameter="44" /></div>
      } @else {
        <div class="table-section">
          <table mat-table [dataSource]="filas()" class="full-width-table">
            <ng-container matColumnDef="numero">
              <th mat-header-cell *matHeaderCellDef class="col-center">N°</th>
              <td mat-cell *matCellDef="let i; let n = index" class="col-center"><span class="numero-cell">{{ n + 1 }}</span></td>
            </ng-container>
            <ng-container matColumnDef="insumo">
              <th mat-header-cell *matHeaderCellDef>Insumo</th>
              <td mat-cell *matCellDef="let i" class="name-cell"><span class="reg">{{ i.codigo }}</span> {{ i.nombre }}</td>
            </ng-container>
            <ng-container matColumnDef="precio">
              <th mat-header-cell *matHeaderCellDef class="num-right">Precio</th>
              <td mat-cell *matCellDef="let i" class="num-right money">{{ bs(i.precio_unitario) }} <small class="muted">/{{ i.unidad_medida }}</small></td>
            </ng-container>
            <ng-container matColumnDef="stock">
              <th mat-header-cell *matHeaderCellDef>Stock</th>
              <td mat-cell *matCellDef="let i">
                <div class="stock">
                  <span class="money" [class.bajo]="i.bajo_minimo">{{ num(i.stock) }} {{ i.unidad_medida }}</span>
                  <small class="muted">mín. {{ num(i.stock_minimo) }}</small>
                  @if (i.bajo_minimo) { <span class="chip danger">Reponer</span> }
                </div>
              </td>
            </ng-container>
            <ng-container matColumnDef="estado">
              <th mat-header-cell *matHeaderCellDef class="col-center">Estado</th>
              <td mat-cell *matCellDef="let i" (click)="$event.stopPropagation()">
                <mat-slide-toggle color="primary" [checked]="i.estado === 'activo'" (change)="toggleEstado($event, i)">
                  {{ i.estado | titlecase }}
                </mat-slide-toggle>
              </td>
            </ng-container>
            <ng-container matColumnDef="acciones">
              <th mat-header-cell *matHeaderCellDef class="col-center">Acciones</th>
              <td mat-cell *matCellDef="let i" class="col-center acciones" (click)="$event.stopPropagation()">
                <button mat-icon-button (click)="movimiento('entrada', i)" matTooltip="Registrar entrada"><mat-icon>add_box</mat-icon></button>
                <button mat-icon-button (click)="movimiento('ajuste', i)" matTooltip="Ajustar por conteo"><mat-icon>tune</mat-icon></button>
                <button mat-icon-button (click)="kardex(i)" matTooltip="Kardex"><mat-icon>history</mat-icon></button>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columnas"></tr>
            <tr mat-row *matRowDef="let row; columns: columnas" class="clickable-row" [class.fila-inactiva]="row.estado === 'inactivo'"
                matTooltip="Editar datos del insumo" (click)="editar(row)"></tr>
          </table>
          @if (filas().length === 0) { <div class="empty-state"><mat-icon>search_off</mat-icon><p>Sin insumos con ese criterio.</p></div> }
        </div>
      }
    </div>
  `,
  styles: `
    .filtros { margin: -8px 0 16px; }
    .stock { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .bajo { color: var(--fich-danger); }
    .acciones { white-space: nowrap; }
    .full-width-table .mat-column-acciones { width: 150px; }
    .fila-inactiva { opacity: 0.55; }
  `,
})
export class Stock implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);

  insumos = signal<Insumo[] | null>(null);
  filtro = signal('');
  soloBajos = signal(false);
  columnas = ['numero', 'insumo', 'precio', 'stock', 'estado', 'acciones'];
  readonly bs = bs;
  readonly num = num;

  activos = computed(() => (this.insumos() ?? []).filter((i) => i.estado === 'activo'));
  bajos = computed(() => this.activos().filter((i) => i.bajo_minimo).length);
  filas = computed(() => {
    const q = this.filtro().toLowerCase().trim();
    return (this.insumos() ?? []).filter(
      (i) => (!this.soloBajos() || i.bajo_minimo) && (!q || `${i.codigo} ${i.nombre}`.toLowerCase().includes(q)),
    );
  });

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.api.get<Insumo[]>('/insumos').subscribe({
      next: (i) => this.insumos.set(i),
      error: (e) => this.notify.error(e),
    });
  }

  editar(i: Insumo | null): void {
    this.dialog.open(InsumoDialog, { data: i, width: '560px', maxWidth: '95vw' }).afterClosed().subscribe((r) => {
      if (r) {
        this.notify.ok(i ? 'Insumo actualizado' : 'Insumo creado');
        this.cargar();
      }
    });
  }

  movimiento(tipo: 'entrada' | 'ajuste', i: Insumo): void {
    this.dialog.open(MovimientoDialog, { data: { tipo, insumo: i }, width: '460px', maxWidth: '95vw' }).afterClosed().subscribe((r?: Insumo) => {
      if (r) {
        this.notify.ok(`${r.nombre}: stock ${num(r.stock)} ${r.unidad_medida}`);
        this.cargar();
      }
    });
  }

  kardex(i: Insumo): void {
    this.dialog.open(KardexDialog, { data: i, width: '820px', maxWidth: '95vw' });
  }

  toggleEstado(ev: MatSlideToggleChange, i: Insumo): void {
    const estado = ev.checked ? 'activo' : 'inactivo';
    this.api.patch<Insumo>(`/insumos/${i.codigo}/estado`, { estado }).subscribe({
      next: () => this.cargar(),
      error: (e) => {
        ev.source.checked = !ev.checked;
        this.notify.error(e);
      },
    });
  }
}
