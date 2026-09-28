import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';

import { ApiService } from '../core/api.service';
import { Estudiante } from '../core/models';

/** Buscador de estudiantes por registro, nombre, apellido o CI. Emite el estudiante elegido. */
@Component({
  selector: 'app-buscar-estudiante',
  imports: [FormsModule, MatAutocompleteModule, MatFormFieldModule, MatInputModule, MatIconModule, MatButtonModule],
  template: `
    <mat-form-field class="buscar" subscriptSizing="dynamic">
      <mat-label>{{ etiqueta() }}</mat-label>
      <mat-icon matPrefix>person_search</mat-icon>
      <input matInput [matAutocomplete]="auto" [ngModel]="texto()" (ngModelChange)="escribir($event)"
             placeholder="Registro, nombre o CI" />
      @if (texto()) {
        <button mat-icon-button matSuffix type="button" (click)="limpiar()" aria-label="Limpiar"><mat-icon>close</mat-icon></button>
      }
      <mat-autocomplete #auto="matAutocomplete" (optionSelected)="elegir($event.option.value)">
        @for (e of resultados(); track e.registro) {
          <mat-option [value]="e">
            <span class="op-reg">{{ e.registro }}</span> {{ e.apellido }} {{ e.nombre }}
            <small class="op-anio">· {{ e.anio_carrera }}° año</small>
          </mat-option>
        }
        @if (texto().length >= 2 && resultados().length === 0) {
          <mat-option disabled>Sin coincidencias</mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
  styles: `
    .buscar { width: 100%; }
    .op-reg { font-weight: 600; color: var(--ap-label-3); margin-right: 6px; }
    .op-anio { color: var(--fich-text-muted); }
  `,
})
export class BuscarEstudiante {
  private api = inject(ApiService);
  etiqueta = input('Buscar estudiante');
  elegido = output<Estudiante>();

  texto = signal('');
  resultados = signal<Estudiante[]>([]);
  private busqueda = new Subject<string>();

  constructor() {
    this.busqueda
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) =>
          q.length < 2 ? of([]) : this.api.get<Estudiante[]>('/estudiantes', { q, estado: 'activo' }).pipe(catchError(() => of([]))),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((r) => this.resultados.set(r.slice(0, 12)));
  }

  escribir(valor: string | Estudiante): void {
    if (typeof valor !== 'string') return;
    this.texto.set(valor);
    this.busqueda.next(valor.trim());
  }

  elegir(e: Estudiante): void {
    this.texto.set(`${e.registro} — ${e.apellido} ${e.nombre}`);
    this.elegido.emit(e);
  }

  limpiar(): void {
    this.texto.set('');
    this.resultados.set([]);
    this.busqueda.next('');
  }
}
