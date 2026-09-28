import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';

import { ApiService } from '../../core/api.service';
import { bs } from '../../core/format';
import { Materia, Tratamiento } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { COMUNES } from '../../shared/material';

@Component({
  selector: 'app-materia-dialog',
  imports: [...COMUNES],
  template: `
    <div class="dialog-header">
      <div class="header-icon"><mat-icon>menu_book</mat-icon><span class="header-icon-badge"><mat-icon>{{ data.materia ? 'edit' : 'add' }}</mat-icon></span></div>
      <div>
        <h2 mat-dialog-title>{{ data.materia ? 'Editar materia' : 'Nueva materia' }}</h2>
        <p class="header-sub">El precio se calcula del plan de tratamientos (botón "Plan" en la lista)</p>
      </div>
    </div>
    <mat-dialog-content>
      <form [formGroup]="form" class="form-grid">
        <mat-form-field><mat-label>Sigla</mat-label><input matInput formControlName="sigla" placeholder="Ej: EST500" /></mat-form-field>
        <mat-form-field>
          <mat-label>Año de la carrera</mat-label>
          <mat-select formControlName="anio_carrera">
            @for (a of [1, 2, 3, 4, 5]; track a) { <mat-option [value]="a">{{ a }}° año</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="span-2"><mat-label>Nombre</mat-label><input matInput formControlName="nombre" /></mat-form-field>
        <mat-form-field><mat-label>Créditos</mat-label><input matInput type="number" min="0" formControlName="creditos" /></mat-form-field>
        <mat-form-field>
          <mat-label>Prerrequisito</mat-label>
          <mat-select formControlName="sigla_prerrequisito">
            <mat-option [value]="null">Ninguno</mat-option>
            @for (m of otras(); track m.sigla) { <mat-option [value]="m.sigla">{{ m.sigla }} · {{ m.nombre }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field><mat-label>Horas teóricas</mat-label><input matInput type="number" min="0" formControlName="horas_teoricas" /></mat-form-field>
        <mat-form-field><mat-label>Horas prácticas</mat-label><input matInput type="number" min="0" formControlName="horas_practicas" /></mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button class="btn-guardar" [disabled]="form.invalid || guardando()" (click)="guardar()">
        <mat-icon>{{ data.materia ? 'save' : 'add' }}</mat-icon> {{ data.materia ? 'Guardar cambios' : 'Crear materia' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class MateriaDialog {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private ref = inject(MatDialogRef<MateriaDialog, Materia>);
  data = inject<{ materia: Materia | null; todas: Materia[] }>(MAT_DIALOG_DATA);
  guardando = signal(false);
  otras = computed(() => this.data.todas.filter((m) => m.sigla !== this.data.materia?.sigla));

  form = inject(FormBuilder).group({
    sigla: [{ value: this.data.materia?.sigla ?? '', disabled: !!this.data.materia }, [Validators.required, Validators.pattern(/^[A-Za-z0-9-]+$/)]],
    nombre: [this.data.materia?.nombre ?? '', Validators.required],
    anio_carrera: [this.data.materia?.anio_carrera ?? 3, Validators.required],
    creditos: [this.data.materia?.creditos ?? 0, Validators.min(0)],
    horas_teoricas: [this.data.materia?.horas_teoricas ?? 0, Validators.min(0)],
    horas_practicas: [this.data.materia?.horas_practicas ?? 0, Validators.min(0)],
    sigla_prerrequisito: [this.data.materia?.sigla_prerrequisito ?? null as string | null],
  });

  guardar(): void {
    this.guardando.set(true);
    const v = this.form.getRawValue();
    const peticion = this.data.materia
      ? this.api.patch<Materia>(`/materias/${this.data.materia.sigla}`, { ...v, sigla: undefined })
      : this.api.post<Materia>('/materias', { ...v, sigla: (v.sigla ?? '').trim().toUpperCase() });
    peticion.subscribe({
      next: (m) => this.ref.close(m),
      error: (e) => {
        this.guardando.set(false);
        this.notify.error(e);
      },
    });
  }
}

interface FilaPlan {
  codigo_tratamiento: string | null;
  cantidad: number;
}

/** Plan de la materia: qué tratamientos exige y cuántas veces. El precio de la materia sale de aquí. */
@Component({
  selector: 'app-plan-dialog',
  imports: [...COMUNES],
  template: `
    <div class="dialog-header">
      <div class="header-icon"><mat-icon>checklist</mat-icon><span class="header-icon-badge"><mat-icon>edit</mat-icon></span></div>
      <div>
        <h2 mat-dialog-title>Plan de {{ data.sigla }}</h2>
        <p class="header-sub">{{ data.nombre }} · rige para inscripciones futuras (las existentes conservan su monto)</p>
      </div>
    </div>
    <mat-dialog-content>
      @for (f of filas(); track $index; let i = $index) {
        <div class="fila">
          <mat-form-field class="f-trat" subscriptSizing="dynamic">
            <mat-label>Tratamiento</mat-label>
            <mat-select [ngModel]="f.codigo_tratamiento" (ngModelChange)="cambiar(i, { codigo_tratamiento: $event })">
              @for (t of tratamientos(); track t.codigo) { <mat-option [value]="t.codigo">{{ t.codigo }} · {{ t.nombre }} ({{ bs(t.precio) }})</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="f-cant" subscriptSizing="dynamic">
            <mat-label>Veces</mat-label>
            <input matInput type="number" min="1" [ngModel]="f.cantidad" (ngModelChange)="cambiar(i, { cantidad: $event })" />
          </mat-form-field>
          <span class="money sub">{{ bs(subtotal(f)) }}</span>
          <button mat-icon-button (click)="quitar(i)" matTooltip="Quitar"><mat-icon>close</mat-icon></button>
        </div>
      }
      <button mat-stroked-button (click)="agregar()"><mat-icon>add</mat-icon> Agregar tratamiento</button>
      <div class="total">Precio de la materia <span class="money">{{ bs(total()) }}</span></div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button class="btn-guardar" [disabled]="!valido() || guardando()" (click)="guardar()"><mat-icon>save</mat-icon> Guardar plan</button>
    </mat-dialog-actions>
  `,
  styles: `
    .fila { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .f-trat { flex: 1; min-width: 280px; }
    .f-cant { width: 100px; }
    .sub { width: 110px; text-align: right; }
    .total { display: flex; justify-content: space-between; font-weight: 800; font-size: 1.1rem; margin-top: 18px; }
  `,
})
export class PlanDialog implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private ref = inject(MatDialogRef<PlanDialog, Materia>);
  data = inject<Materia>(MAT_DIALOG_DATA);
  tratamientos = signal<Tratamiento[]>([]);
  filas = signal<FilaPlan[]>(this.data.plan.map((p) => ({ codigo_tratamiento: p.codigo_tratamiento, cantidad: p.cantidad })));
  guardando = signal(false);
  readonly bs = bs;

  total = computed(() => this.filas().reduce((t, f) => t + this.subtotal(f), 0));
  valido = computed(() => {
    const cods = this.filas().map((f) => f.codigo_tratamiento);
    return this.filas().every((f) => f.codigo_tratamiento && f.cantidad >= 1) && new Set(cods).size === cods.length;
  });

  ngOnInit(): void {
    this.api.get<Tratamiento[]>('/tratamientos', { estado: 'activo' }).subscribe((t) => this.tratamientos.set(t));
  }

  subtotal(f: FilaPlan): number {
    const t = this.tratamientos().find((x) => x.codigo === f.codigo_tratamiento);
    return t ? t.precio * (Number(f.cantidad) || 0) : 0;
  }

  cambiar(i: number, cambio: Partial<FilaPlan>): void {
    this.filas.update((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  }

  agregar(): void {
    this.filas.update((fs) => [...fs, { codigo_tratamiento: null, cantidad: 1 }]);
  }

  quitar(i: number): void {
    this.filas.update((fs) => fs.filter((_, j) => j !== i));
  }

  guardar(): void {
    this.guardando.set(true);
    this.api.put<Materia>(`/materias/${this.data.sigla}/plan`, this.filas().map((f) => ({ ...f, cantidad: Number(f.cantidad) }))).subscribe({
      next: (m) => this.ref.close(m),
      error: (e) => {
        this.guardando.set(false);
        this.notify.error(e);
      },
    });
  }
}

@Component({
  selector: 'app-materias',
  imports: [...COMUNES],
  template: `
    <div class="page-container">
      <div class="header-card">
        <div class="header-card-top">
          <div class="header-card-title">
            <div class="header-icon"><mat-icon>menu_book</mat-icon></div>
            <div>
              <h2>Materias y planes</h2>
              <p class="subtitle">Su precio es la suma de su plan de tratamientos</p>
            </div>
          </div>
          @if (lista()) {
            <div class="header-card-stats">
              <div class="summary-stat"><mat-icon>menu_book</mat-icon><span class="summary-label">Materias</span><span class="summary-num">{{ lista()!.length }}</span></div>
              <div class="summary-stat"><mat-icon>medical_services</mat-icon><span class="summary-label">Con prácticas</span><span class="summary-num">{{ conPracticas() }}</span></div>
            </div>
            <mat-form-field class="header-search" subscriptSizing="dynamic">
              <mat-icon matPrefix>search</mat-icon>
              <input matInput [ngModel]="filtro()" (ngModelChange)="filtro.set($event)" placeholder="Sigla o nombre..." />
            </mat-form-field>
          }
          <button mat-raised-button class="btn-nuevo" (click)="editar(null)"><mat-icon>add</mat-icon><span>Nueva materia</span></button>
        </div>
      </div>

      @if (!lista()) {
        <div class="loading-state"><mat-spinner diameter="44" /></div>
      } @else {
        <div class="table-section">
          <table mat-table [dataSource]="filas()" class="full-width-table">
            <ng-container matColumnDef="numero">
              <th mat-header-cell *matHeaderCellDef class="col-center">N°</th>
              <td mat-cell *matCellDef="let m; let i = index" class="col-center"><span class="numero-cell">{{ i + 1 }}</span></td>
            </ng-container>
            <ng-container matColumnDef="materia">
              <th mat-header-cell *matHeaderCellDef>Materia</th>
              <td mat-cell *matCellDef="let m" class="name-cell"><span class="reg">{{ m.sigla }}</span> {{ m.nombre }}</td>
            </ng-container>
            <ng-container matColumnDef="anio">
              <th mat-header-cell *matHeaderCellDef class="col-center">Año</th>
              <td mat-cell *matCellDef="let m" class="col-center">{{ m.anio_carrera }}°</td>
            </ng-container>
            <ng-container matColumnDef="plan">
              <th mat-header-cell *matHeaderCellDef>Plan de tratamientos</th>
              <td mat-cell *matCellDef="let m">
                @if (m.plan.length) {
                  <div class="chips-lista">
                    @for (p of m.plan; track p.codigo_tratamiento) { <span class="mod-chip">{{ p.tratamiento }} <b>×{{ p.cantidad }}</b></span> }
                  </div>
                } @else { <span class="no-mods">Teórica (sin prácticas)</span> }
              </td>
            </ng-container>
            <ng-container matColumnDef="precio">
              <th mat-header-cell *matHeaderCellDef class="num-right">Precio</th>
              <td mat-cell *matCellDef="let m" class="num-right money">{{ bs(m.precio) }}</td>
            </ng-container>
            <ng-container matColumnDef="estado">
              <th mat-header-cell *matHeaderCellDef class="col-center">Estado</th>
              <td mat-cell *matCellDef="let m" (click)="$event.stopPropagation()">
                <mat-slide-toggle color="primary" [checked]="m.estado === 'activo'" (change)="toggleEstado($event, m)">{{ m.estado | titlecase }}</mat-slide-toggle>
              </td>
            </ng-container>
            <ng-container matColumnDef="acciones">
              <th mat-header-cell *matHeaderCellDef class="col-center">Acciones</th>
              <td mat-cell *matCellDef="let m" class="col-center" (click)="$event.stopPropagation()">
                <button mat-icon-button (click)="plan(m)" matTooltip="Editar plan"><mat-icon>checklist</mat-icon></button>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columnas"></tr>
            <tr mat-row *matRowDef="let row; columns: columnas" class="clickable-row" matTooltip="Editar datos de la materia" (click)="editar(row)"></tr>
          </table>
        </div>
      }
    </div>
  `,
})
export class Materias implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);

  lista = signal<Materia[] | null>(null);
  filtro = signal('');
  columnas = ['numero', 'materia', 'anio', 'plan', 'precio', 'estado', 'acciones'];
  readonly bs = bs;

  conPracticas = computed(() => (this.lista() ?? []).filter((m) => m.plan.length).length);
  filas = computed(() => {
    const q = this.filtro().toLowerCase().trim();
    const l = this.lista() ?? [];
    return q ? l.filter((m) => `${m.sigla} ${m.nombre}`.toLowerCase().includes(q)) : l;
  });

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.api.get<Materia[]>('/materias').subscribe({ next: (l) => this.lista.set(l), error: (e) => this.notify.error(e) });
  }

  editar(m: Materia | null): void {
    this.dialog.open(MateriaDialog, { data: { materia: m, todas: this.lista() ?? [] }, width: '600px', maxWidth: '95vw' })
      .afterClosed().subscribe((r?: Materia) => {
        if (!r) return;
        this.notify.ok(m ? 'Materia actualizada' : 'Materia creada: defina ahora su plan');
        this.cargar();
        if (!m) this.plan(r);
      });
  }

  plan(m: Materia): void {
    this.dialog.open(PlanDialog, { data: m, width: '720px', maxWidth: '95vw' }).afterClosed().subscribe((r?: Materia) => {
      if (!r) return;
      this.notify.ok(`Plan guardado · precio ${bs(r.precio)}`);
      this.cargar();
    });
  }

  toggleEstado(ev: MatSlideToggleChange, m: Materia): void {
    this.api.patch(`/materias/${m.sigla}/estado`, { estado: ev.checked ? 'activo' : 'inactivo' }).subscribe({
      next: () => this.cargar(),
      error: (e) => {
        ev.source.checked = !ev.checked;
        this.notify.error(e);
      },
    });
  }
}
