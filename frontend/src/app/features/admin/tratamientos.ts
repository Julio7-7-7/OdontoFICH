import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';

import { ApiService } from '../../core/api.service';
import { bs, num } from '../../core/format';
import { Insumo, Tratamiento } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { COMUNES } from '../../shared/material';

@Component({
  selector: 'app-tratamiento-dialog',
  imports: [...COMUNES],
  template: `
    <div class="dialog-header">
      <div class="header-icon"><mat-icon>healing</mat-icon><span class="header-icon-badge"><mat-icon>{{ data ? 'edit' : 'add' }}</mat-icon></span></div>
      <div>
        <h2 mat-dialog-title>{{ data ? 'Editar tratamiento' : 'Nuevo tratamiento' }}</h2>
        <p class="header-sub">El precio incluye el kit de insumos que se entrega al estudiante</p>
      </div>
    </div>
    <mat-dialog-content>
      <form [formGroup]="form" class="form-grid">
        <mat-form-field><mat-label>Código</mat-label><input matInput formControlName="codigo" placeholder="Ej: 2234" /></mat-form-field>
        <mat-form-field><mat-label>Precio (Bs)</mat-label><input matInput type="number" min="0" step="0.01" formControlName="precio" />
          @if (data) { <mat-hint>Rige para inscripciones y ventas futuras</mat-hint> }</mat-form-field>
        <mat-form-field class="span-2"><mat-label>Nombre</mat-label><input matInput formControlName="nombre" placeholder="Ej: Exodoncia" /></mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button class="btn-guardar" [disabled]="form.invalid || guardando()" (click)="guardar()">
        <mat-icon>{{ data ? 'save' : 'add' }}</mat-icon> {{ data ? 'Guardar cambios' : 'Crear tratamiento' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class TratamientoDialog {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private ref = inject(MatDialogRef<TratamientoDialog, Tratamiento>);
  data = inject<Tratamiento | null>(MAT_DIALOG_DATA);
  guardando = signal(false);

  form = inject(FormBuilder).nonNullable.group({
    codigo: [{ value: this.data?.codigo ?? '', disabled: !!this.data }, [Validators.required, Validators.pattern(/^[A-Za-z0-9-]+$/)]],
    nombre: [this.data?.nombre ?? '', Validators.required],
    precio: [this.data?.precio ?? 0, [Validators.required, Validators.min(0)]],
  });

  guardar(): void {
    this.guardando.set(true);
    const v = this.form.getRawValue();
    const peticion = this.data
      ? this.api.patch<Tratamiento>(`/tratamientos/${this.data.codigo}`, { nombre: v.nombre, precio: v.precio })
      : this.api.post<Tratamiento>('/tratamientos', { ...v, codigo: v.codigo.trim().toUpperCase() });
    peticion.subscribe({
      next: (t) => this.ref.close(t),
      error: (e) => {
        this.guardando.set(false);
        this.notify.error(e);
      },
    });
  }
}

interface FilaKit {
  codigo_insumo: string | null;
  cantidad: number;
}

@Component({
  selector: 'app-kit-dialog',
  imports: [...COMUNES],
  template: `
    <div class="dialog-header">
      <div class="header-icon"><mat-icon>inventory</mat-icon><span class="header-icon-badge"><mat-icon>edit</mat-icon></span></div>
      <div>
        <h2 mat-dialog-title>Kit de {{ data.nombre }}</h2>
        <p class="header-sub">Lo que el encargado entrega (y descuenta del stock) en cada práctica · precio {{ bs(data.precio) }}</p>
      </div>
    </div>
    <mat-dialog-content>
      @for (f of filas(); track $index; let i = $index) {
        <div class="fila">
          <mat-form-field class="f-ins" subscriptSizing="dynamic">
            <mat-label>Insumo</mat-label>
            <mat-select [ngModel]="f.codigo_insumo" (ngModelChange)="cambiar(i, { codigo_insumo: $event })">
              @for (ins of insumos(); track ins.codigo) { <mat-option [value]="ins.codigo">{{ ins.nombre }} ({{ ins.unidad_medida }})</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="f-cant" subscriptSizing="dynamic">
            <mat-label>Cantidad</mat-label>
            <input matInput type="number" min="0.01" step="0.01" [ngModel]="f.cantidad" (ngModelChange)="cambiar(i, { cantidad: $event })" />
            <span matTextSuffix>{{ unidad(f) }}</span>
          </mat-form-field>
          <span class="money sub">{{ bs(costo(f)) }}</span>
          <button mat-icon-button (click)="quitar(i)" matTooltip="Quitar"><mat-icon>close</mat-icon></button>
        </div>
      }
      <button mat-stroked-button (click)="agregar()"><mat-icon>add</mat-icon> Agregar insumo</button>
      <div class="total">Costo del kit (a precio unitario) <span class="money">{{ bs(total()) }}</span></div>
      @if (total() > data.precio) {
        <div class="aviso warn"><mat-icon>warning</mat-icon><div>El kit cuesta más que el precio del tratamiento ({{ bs(data.precio) }}).</div></div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button class="btn-guardar" [disabled]="!valido() || guardando()" (click)="guardar()"><mat-icon>save</mat-icon> Guardar kit</button>
    </mat-dialog-actions>
  `,
  styles: `
    .fila { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .f-ins { flex: 1; min-width: 260px; }
    .f-cant { width: 140px; }
    .sub { width: 100px; text-align: right; }
    .total { display: flex; justify-content: space-between; font-weight: 800; font-size: 1.05rem; margin: 18px 0 12px; }
  `,
})
export class KitDialog implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private ref = inject(MatDialogRef<KitDialog, Tratamiento>);
  data = inject<Tratamiento>(MAT_DIALOG_DATA);
  insumos = signal<Insumo[]>([]);
  filas = signal<FilaKit[]>(this.data.kit.map((k) => ({ codigo_insumo: k.codigo_insumo, cantidad: k.cantidad })));
  guardando = signal(false);
  readonly bs = bs;

  total = computed(() => this.filas().reduce((t, f) => t + this.costo(f), 0));
  valido = computed(() => {
    const cods = this.filas().map((f) => f.codigo_insumo);
    return this.filas().every((f) => f.codigo_insumo && Number(f.cantidad) > 0) && new Set(cods).size === cods.length;
  });

  ngOnInit(): void {
    this.api.get<Insumo[]>('/insumos', { estado: 'activo' }).subscribe((i) => this.insumos.set(i));
  }

  private insumo(f: FilaKit): Insumo | undefined {
    return this.insumos().find((i) => i.codigo === f.codigo_insumo);
  }

  unidad(f: FilaKit): string {
    return this.insumo(f)?.unidad_medida ?? '';
  }

  costo(f: FilaKit): number {
    return (this.insumo(f)?.precio_unitario ?? 0) * (Number(f.cantidad) || 0);
  }

  cambiar(i: number, cambio: Partial<FilaKit>): void {
    this.filas.update((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  }

  agregar(): void {
    this.filas.update((fs) => [...fs, { codigo_insumo: null, cantidad: 1 }]);
  }

  quitar(i: number): void {
    this.filas.update((fs) => fs.filter((_, j) => j !== i));
  }

  guardar(): void {
    this.guardando.set(true);
    this.api.put<Tratamiento>(`/tratamientos/${this.data.codigo}/kit`, this.filas().map((f) => ({ ...f, cantidad: Number(f.cantidad) }))).subscribe({
      next: (t) => this.ref.close(t),
      error: (e) => {
        this.guardando.set(false);
        this.notify.error(e);
      },
    });
  }
}

@Component({
  selector: 'app-tratamientos',
  imports: [...COMUNES],
  template: `
    <div class="page-container">
      <div class="header-card">
        <div class="header-card-top">
          <div class="header-card-title">
            <div class="header-icon"><mat-icon>healing</mat-icon></div>
            <div>
              <h2>Tratamientos y kits</h2>
              <p class="subtitle">Precio y kit de insumos de cada práctica</p>
            </div>
          </div>
          @if (lista()) {
            <div class="header-card-stats">
              <div class="summary-stat"><mat-icon>healing</mat-icon><span class="summary-label">Tratamientos</span><span class="summary-num">{{ lista()!.length }}</span></div>
              <div class="summary-stat"><mat-icon>warning</mat-icon><span class="summary-label">Sin kit</span><span class="summary-num">{{ sinKit() }}</span></div>
            </div>
            <mat-form-field class="header-search" subscriptSizing="dynamic">
              <mat-icon matPrefix>search</mat-icon>
              <input matInput [ngModel]="filtro()" (ngModelChange)="filtro.set($event)" placeholder="Código o nombre..." />
            </mat-form-field>
          }
          <button mat-raised-button class="btn-nuevo" (click)="editar(null)"><mat-icon>add</mat-icon><span>Nuevo tratamiento</span></button>
        </div>
      </div>

      @if (!lista()) {
        <div class="loading-state"><mat-spinner diameter="44" /></div>
      } @else {
        <div class="table-section">
          <table mat-table [dataSource]="filas()" class="full-width-table">
            <ng-container matColumnDef="numero">
              <th mat-header-cell *matHeaderCellDef class="col-center">N°</th>
              <td mat-cell *matCellDef="let t; let i = index" class="col-center"><span class="numero-cell">{{ i + 1 }}</span></td>
            </ng-container>
            <ng-container matColumnDef="tratamiento">
              <th mat-header-cell *matHeaderCellDef>Tratamiento</th>
              <td mat-cell *matCellDef="let t" class="name-cell"><span class="reg">{{ t.codigo }}</span> {{ t.nombre }}</td>
            </ng-container>
            <ng-container matColumnDef="kit">
              <th mat-header-cell *matHeaderCellDef>Kit</th>
              <td mat-cell *matCellDef="let t">
                @if (t.kit.length) {
                  <div class="chips-lista">
                    @for (k of t.kit; track k.codigo_insumo) { <span class="mod-chip">{{ k.nombre }} <b>×{{ num(k.cantidad) }}</b></span> }
                  </div>
                } @else { <span class="chip danger">Sin kit: no se puede entregar</span> }
              </td>
            </ng-container>
            <ng-container matColumnDef="precio">
              <th mat-header-cell *matHeaderCellDef class="num-right">Precio / costo kit</th>
              <td mat-cell *matCellDef="let t" class="num-right"><span class="money">{{ bs(t.precio) }}</span><br /><small class="muted">{{ bs(t.costo_kit) }}</small></td>
            </ng-container>
            <ng-container matColumnDef="estado">
              <th mat-header-cell *matHeaderCellDef class="col-center">Estado</th>
              <td mat-cell *matCellDef="let t" (click)="$event.stopPropagation()">
                <mat-slide-toggle color="primary" [checked]="t.estado === 'activo'" (change)="toggleEstado($event, t)">{{ t.estado | titlecase }}</mat-slide-toggle>
              </td>
            </ng-container>
            <ng-container matColumnDef="acciones">
              <th mat-header-cell *matHeaderCellDef class="col-center">Acciones</th>
              <td mat-cell *matCellDef="let t" class="col-center" (click)="$event.stopPropagation()">
                <button mat-icon-button (click)="kit(t)" matTooltip="Editar kit"><mat-icon>inventory</mat-icon></button>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columnas"></tr>
            <tr mat-row *matRowDef="let row; columns: columnas" class="clickable-row" matTooltip="Editar datos del tratamiento" (click)="editar(row)"></tr>
          </table>
        </div>
      }
    </div>
  `,
})
export class Tratamientos implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);

  lista = signal<Tratamiento[] | null>(null);
  filtro = signal('');
  columnas = ['numero', 'tratamiento', 'kit', 'precio', 'estado', 'acciones'];
  readonly bs = bs;
  readonly num = num;

  sinKit = computed(() => (this.lista() ?? []).filter((t) => !t.kit.length).length);
  filas = computed(() => {
    const q = this.filtro().toLowerCase().trim();
    const l = this.lista() ?? [];
    return q ? l.filter((t) => `${t.codigo} ${t.nombre}`.toLowerCase().includes(q)) : l;
  });

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.api.get<Tratamiento[]>('/tratamientos').subscribe({ next: (l) => this.lista.set(l), error: (e) => this.notify.error(e) });
  }

  editar(t: Tratamiento | null): void {
    this.dialog.open(TratamientoDialog, { data: t, width: '520px', maxWidth: '95vw' }).afterClosed().subscribe((r?: Tratamiento) => {
      if (!r) return;
      this.notify.ok(t ? 'Tratamiento actualizado' : 'Tratamiento creado: arme ahora su kit');
      this.cargar();
      if (!t) this.kit(r);
    });
  }

  kit(t: Tratamiento): void {
    this.dialog.open(KitDialog, { data: t, width: '720px', maxWidth: '95vw' }).afterClosed().subscribe((r?: Tratamiento) => {
      if (!r) return;
      this.notify.ok('Kit guardado');
      this.cargar();
    });
  }

  toggleEstado(ev: MatSlideToggleChange, t: Tratamiento): void {
    this.api.patch(`/tratamientos/${t.codigo}/estado`, { estado: ev.checked ? 'activo' : 'inactivo' }).subscribe({
      next: () => this.cargar(),
      error: (e) => {
        ev.source.checked = !ev.checked;
        this.notify.error(e);
      },
    });
  }
}
