import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { ApiService } from '../../core/api.service';
import { fechaHora, num } from '../../core/format';
import { Insumo, Movimiento, UNIDADES } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { COMUNES } from '../../shared/material';

/** Alta y edición de insumo. El stock NO se edita aquí: se usa entrada o ajuste (queda en el kardex). */
@Component({
  selector: 'app-insumo-dialog',
  imports: [...COMUNES],
  template: `
    <div class="dialog-header">
      <div class="header-icon">
        <mat-icon>inventory_2</mat-icon>
        <span class="header-icon-badge"><mat-icon>{{ data ? 'edit' : 'add' }}</mat-icon></span>
      </div>
      <div>
        <h2 mat-dialog-title>{{ data ? 'Editar insumo' : 'Nuevo insumo' }}</h2>
        <p class="header-sub">{{ data ? data.codigo + ' · el stock se corrige con Entrada o Ajuste' : 'Material que se entrega en kits o se vende suelto' }}</p>
      </div>
    </div>
    <mat-dialog-content>
      <form [formGroup]="form" class="form-grid">
        <mat-form-field><mat-label>Código</mat-label><input matInput formControlName="codigo" placeholder="Ej: A05" /></mat-form-field>
        <mat-form-field>
          <mat-label>Unidad de medida</mat-label>
          <mat-select formControlName="unidad_medida">
            @for (u of unidades; track u) { <mat-option [value]="u">{{ u }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="span-2"><mat-label>Nombre</mat-label><input matInput formControlName="nombre" /></mat-form-field>
        <mat-form-field><mat-label>Precio unitario (Bs)</mat-label><input matInput type="number" min="0" step="0.01" formControlName="precio_unitario" /></mat-form-field>
        <mat-form-field><mat-label>Stock mínimo (alerta)</mat-label><input matInput type="number" min="0" formControlName="stock_minimo" /></mat-form-field>
        @if (!data) {
          <mat-form-field class="span-2"><mat-label>Stock inicial</mat-label><input matInput type="number" min="0" formControlName="stock_inicial" />
            <mat-hint>Se registra como una entrada en el kardex</mat-hint></mat-form-field>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button class="btn-guardar" [disabled]="form.invalid || guardando()" (click)="guardar()">
        <mat-icon>{{ data ? 'save' : 'add' }}</mat-icon> {{ data ? 'Guardar cambios' : 'Crear insumo' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class InsumoDialog {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private ref = inject(MatDialogRef<InsumoDialog, Insumo>);
  data = inject<Insumo | null>(MAT_DIALOG_DATA);
  readonly unidades = UNIDADES;
  guardando = signal(false);

  form = inject(FormBuilder).nonNullable.group({
    codigo: [{ value: this.data?.codigo ?? '', disabled: !!this.data }, [Validators.required, Validators.pattern(/^[A-Za-z0-9-]+$/)]],
    nombre: [this.data?.nombre ?? '', Validators.required],
    unidad_medida: [this.data?.unidad_medida ?? 'unidad', Validators.required],
    precio_unitario: [this.data?.precio_unitario ?? 0, [Validators.required, Validators.min(0)]],
    stock_minimo: [this.data?.stock_minimo ?? 0, [Validators.required, Validators.min(0)]],
    stock_inicial: [0, [Validators.min(0)]],
  });

  guardar(): void {
    this.guardando.set(true);
    const v = this.form.getRawValue();
    const peticion = this.data
      ? this.api.patch<Insumo>(`/insumos/${this.data.codigo}`, {
          nombre: v.nombre, unidad_medida: v.unidad_medida, precio_unitario: v.precio_unitario, stock_minimo: v.stock_minimo,
        })
      : this.api.post<Insumo>('/insumos', { ...v, codigo: v.codigo.trim().toUpperCase() });
    peticion.subscribe({
      next: (i) => this.ref.close(i),
      error: (e) => {
        this.guardando.set(false);
        this.notify.error(e);
      },
    });
  }
}

/** Entrada de material (reposición) o ajuste por conteo físico. */
@Component({
  selector: 'app-movimiento-dialog',
  imports: [...COMUNES],
  template: `
    <div class="dialog-header">
      <div class="header-icon"><mat-icon>{{ data.tipo === 'entrada' ? 'add_box' : 'tune' }}</mat-icon></div>
      <div>
        <h2 mat-dialog-title>{{ data.tipo === 'entrada' ? 'Registrar entrada' : 'Ajustar por conteo físico' }}</h2>
        <p class="header-sub">{{ data.insumo.nombre }} · stock actual {{ num(data.insumo.stock) }} {{ data.insumo.unidad_medida }}</p>
      </div>
    </div>
    <mat-dialog-content>
      @if (data.tipo === 'entrada') {
        <mat-form-field class="w-100"><mat-label>Cantidad que llegó ({{ data.insumo.unidad_medida }})</mat-label>
          <input matInput type="number" min="0.01" [ngModel]="cantidad()" (ngModelChange)="cantidad.set($event)" cdkFocusInitial /></mat-form-field>
        <mat-form-field class="w-100"><mat-label>Observación (proveedor, factura…)</mat-label>
          <input matInput maxlength="200" [ngModel]="texto()" (ngModelChange)="texto.set($event)" /></mat-form-field>
      } @else {
        <mat-form-field class="w-100"><mat-label>Lo que hay en la estantería ({{ data.insumo.unidad_medida }})</mat-label>
          <input matInput type="number" min="0" [ngModel]="cantidad()" (ngModelChange)="cantidad.set($event)" cdkFocusInitial />
          @if (cantidad() !== null) { <mat-hint>Diferencia con el sistema: {{ num(cantidad()! - data.insumo.stock) }}</mat-hint> }
        </mat-form-field>
        <mat-form-field class="w-100"><mat-label>Motivo del ajuste</mat-label>
          <input matInput required maxlength="200" [ngModel]="texto()" (ngModelChange)="texto.set($event)" /></mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button class="btn-guardar" [disabled]="!valido() || guardando()" (click)="guardar()">
        <mat-icon>save</mat-icon> Registrar
      </button>
    </mat-dialog-actions>
  `,
  styles: '.w-100 { width: 100%; min-width: 380px; }',
})
export class MovimientoDialog {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private ref = inject(MatDialogRef<MovimientoDialog, Insumo>);
  data = inject<{ tipo: 'entrada' | 'ajuste'; insumo: Insumo }>(MAT_DIALOG_DATA);
  cantidad = signal<number | null>(null);
  texto = signal('');
  guardando = signal(false);
  readonly num = num;

  valido = computed(() => {
    const c = this.cantidad();
    return this.data.tipo === 'entrada' ? c !== null && c > 0 : c !== null && c >= 0 && this.texto().trim().length >= 3;
  });

  guardar(): void {
    this.guardando.set(true);
    const cod = this.data.insumo.codigo;
    const peticion =
      this.data.tipo === 'entrada'
        ? this.api.post<Insumo>(`/insumos/${cod}/entradas`, { cantidad: this.cantidad(), observacion: this.texto() || null })
        : this.api.post<Insumo>(`/insumos/${cod}/ajustes`, { stock_contado: this.cantidad(), motivo: this.texto().trim() });
    peticion.subscribe({
      next: (i) => this.ref.close(i),
      error: (e) => {
        this.guardando.set(false);
        this.notify.error(e);
      },
    });
  }
}

const TIPO_MOV: Record<Movimiento['tipo'], string> = {
  entrada: 'Entrada',
  salida_kit: 'Kit entregado',
  salida_venta: 'Venta extra',
  anulacion_venta: 'Venta anulada',
  ajuste: 'Ajuste',
};

@Component({
  selector: 'app-kardex-dialog',
  imports: [...COMUNES],
  template: `
    <div class="dialog-header">
      <div class="header-icon"><mat-icon>history</mat-icon></div>
      <div>
        <h2 mat-dialog-title>Kardex · {{ data.nombre }}</h2>
        <p class="header-sub">Cada entrada y salida, con quién la hizo. Stock actual {{ num(data.stock) }} {{ data.unidad_medida }}</p>
      </div>
    </div>
    <mat-dialog-content>
      <table class="kardex">
        <thead><tr><th>Fecha</th><th>Movimiento</th><th class="num-right">Cantidad</th><th class="num-right">Saldo</th><th>Usuario / detalle</th></tr></thead>
        <tbody>
          @for (m of movs(); track m.id) {
            <tr>
              <td>{{ fechaHora(m.fecha_hora) }}</td>
              <td><span class="chip" [class.ok]="m.cantidad > 0" [class.danger]="m.cantidad < 0">{{ tipo[m.tipo] }}</span></td>
              <td class="num-right money">{{ m.cantidad > 0 ? '+' : '' }}{{ num(m.cantidad) }}</td>
              <td class="num-right money">{{ num(m.stock_resultante) }}</td>
              <td>{{ m.usuario }}<br /><small class="muted">{{ m.observacion }}</small></td>
            </tr>
          }
        </tbody>
      </table>
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button mat-dialog-close>Cerrar</button></mat-dialog-actions>
  `,
  styles: `
    .kardex { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
    .kardex th { text-align: left; font-size: 0.7rem; color: var(--fich-text-muted); padding: 6px; border-bottom: 0.5px solid var(--ap-separator); }
    .kardex td { padding: 6px; border-bottom: 0.5px solid var(--ap-separator); vertical-align: top; }
  `,
})
export class KardexDialog implements OnInit {
  private api = inject(ApiService);
  data = inject<Insumo>(MAT_DIALOG_DATA);
  movs = signal<Movimiento[]>([]);
  readonly tipo = TIPO_MOV;
  readonly num = num;
  readonly fechaHora = fechaHora;

  ngOnInit(): void {
    this.api.get<Movimiento[]>(`/insumos/${this.data.codigo}/kardex`).subscribe((m) => this.movs.set(m));
  }
}
