import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { ApiService } from '../../core/api.service';
import { bs, fechaHora, hoyIso, num } from '../../core/format';
import { CierrePreview, Estudiante, Insumo, Tratamiento, Venta } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { BuscarEstudiante } from '../../shared/buscar-estudiante';
import { pedirMotivo } from '../../shared/dialogos';
import { COMUNES } from '../../shared/material';

interface Linea {
  tipo: 'insumo' | 'kit';
  codigo: string;
  descripcion: string;
  cantidad: number;
  precio: number;
}

@Component({
  selector: 'app-mostrador',
  imports: [...COMUNES, BuscarEstudiante],
  templateUrl: './mostrador.html',
  styleUrl: './mostrador.css',
})
export class Mostrador implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);

  insumos = signal<Insumo[]>([]);
  tratamientos = signal<Tratamiento[]>([]);
  estudiante = signal<Estudiante | null>(null);
  lineas = signal<Linea[]>([]);
  tipo = signal<'insumo' | 'kit'>('insumo');
  codigo = signal<string | null>(null);
  cantidad = signal<number>(1);
  guardando = signal(false);
  ultima = signal<Venta | null>(null);
  ventasHoy = signal<Venta[]>([]);
  cerrado = signal(false);

  readonly bs = bs;
  readonly num = num;
  readonly fechaHora = fechaHora;

  total = computed(() => this.lineas().reduce((t, l) => t + l.cantidad * l.precio, 0));
  opciones = computed(() =>
    this.tipo() === 'insumo'
      ? this.insumos().map((i) => ({ codigo: i.codigo, texto: `${i.nombre} (${i.unidad_medida}) · ${bs(i.precio_unitario)} · stock ${num(i.stock)}` }))
      : this.tratamientos().map((t) => ({ codigo: t.codigo, texto: `Kit ${t.nombre} · ${bs(t.precio)}` })),
  );

  ngOnInit(): void {
    this.api.get<Insumo[]>('/insumos', { estado: 'activo' }).subscribe((i) => this.insumos.set(i));
    this.api.get<Tratamiento[]>('/tratamientos', { estado: 'activo' }).subscribe((t) => this.tratamientos.set(t.filter((x) => x.kit.length)));
    this.cargarDia();
  }

  cargarDia(): void {
    this.api.get<Venta[]>('/ventas', { fecha: hoyIso() }).subscribe((v) => this.ventasHoy.set(v));
    this.api.get<CierrePreview>('/cierres/preview').subscribe((p) => this.cerrado.set(p.ya_cerrado));
  }

  agregar(): void {
    const cod = this.codigo();
    const cant = Number(this.cantidad());
    if (!cod || !cant || cant <= 0) return;
    const linea: Linea =
      this.tipo() === 'insumo'
        ? (() => {
            const i = this.insumos().find((x) => x.codigo === cod)!;
            return { tipo: 'insumo', codigo: cod, descripcion: `${i.nombre} (${i.unidad_medida})`, cantidad: cant, precio: i.precio_unitario };
          })()
        : (() => {
            const t = this.tratamientos().find((x) => x.codigo === cod)!;
            return { tipo: 'kit', codigo: cod, descripcion: `Kit ${t.nombre}`, cantidad: Math.round(cant), precio: t.precio };
          })();
    this.lineas.update((ls) => {
      const existente = ls.find((l) => l.tipo === linea.tipo && l.codigo === linea.codigo);
      return existente
        ? ls.map((l) => (l === existente ? { ...l, cantidad: l.cantidad + linea.cantidad } : l))
        : [...ls, linea];
    });
    this.codigo.set(null);
    this.cantidad.set(1);
  }

  quitar(l: Linea): void {
    this.lineas.update((ls) => ls.filter((x) => x !== l));
  }

  cobrar(): void {
    const e = this.estudiante();
    if (!e || !this.lineas().length) return;
    this.guardando.set(true);
    this.api
      .post<Venta>('/ventas', {
        registro: e.registro,
        lineas: this.lineas().map((l) => ({ tipo: l.tipo, codigo: l.codigo, cantidad: l.cantidad })),
      })
      .subscribe({
        next: (v) => {
          this.ultima.set(v);
          this.lineas.set([]);
          this.guardando.set(false);
          this.notify.ok(`Venta ${v.nro_recibo} por ${bs(v.total)}`);
          this.cargarDia();
          this.api.get<Insumo[]>('/insumos', { estado: 'activo' }).subscribe((i) => this.insumos.set(i));
        },
        error: (err) => {
          this.guardando.set(false);
          this.notify.error(err);
        },
      });
  }

  imprimir(v: Venta): void {
    this.ultima.set(v);
    setTimeout(() => window.print());
  }

  anular(v: Venta): void {
    pedirMotivo(this.dialog, {
      titulo: `Anular venta ${v.nro_recibo}`,
      mensaje: `${bs(v.total)} — el material vuelve al stock.`,
    }).subscribe((motivo) => {
      if (!motivo) return;
      this.api.patch<Venta>(`/ventas/${v.id}/anular`, { motivo }).subscribe({
        next: () => {
          this.notify.ok('Venta anulada: el stock fue devuelto');
          this.cargarDia();
        },
        error: (e) => this.notify.error(e),
      });
    });
  }
}
