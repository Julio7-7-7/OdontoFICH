import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { bs, fecha, fechaHora } from '../../core/format';
import { Constancia, EstadoCuenta, Estudiante, Pago, PagoRegistrado } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { BuscarEstudiante } from '../../shared/buscar-estudiante';
import { confirmar, pedirMotivo } from '../../shared/dialogos';
import { COMUNES } from '../../shared/material';

@Component({
  selector: 'app-cobros',
  imports: [...COMUNES, BuscarEstudiante],
  templateUrl: './cobros.html',
  styleUrl: './cobros.css',
})
export class Cobros implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  /** ?registro=... (desde Deudores o desde la ficha del estudiante) */
  registro = input<string>();

  cuenta = signal<EstadoCuenta | null>(null);
  sinCuenta = signal<string | null>(null);
  cargando = signal(false);
  guardando = signal(false);
  monto = signal<number | null>(null);
  observacion = signal('');
  recibo = signal<Pago | null>(null);
  constancia = signal<Constancia | null>(null);

  readonly bs = bs;
  readonly fecha = fecha;
  readonly fechaHora = fechaHora;

  saldoCuota = computed(() => this.cuenta()?.cuotas.find((c) => c.saldo > 0) ?? null);
  pagosVigentes = computed(() => (this.cuenta()?.pagos ?? []).filter((p) => p.estado === 'vigente').length);
  columnasPagos = ['recibo', 'fecha', 'monto', 'cajero', 'estado', 'acciones'];

  ngOnInit(): void {
    const reg = Number(this.registro());
    if (reg) this.cargar(reg);
  }

  elegir(e: Estudiante): void {
    this.router.navigate([], { queryParams: { registro: e.registro }, replaceUrl: true });
    this.cargar(e.registro);
  }

  cargar(registro: number): void {
    this.cargando.set(true);
    this.sinCuenta.set(null);
    this.recibo.set(null);
    this.constancia.set(null);
    this.api.get<EstadoCuenta>(`/cuentas/${registro}`).subscribe({
      next: (c) => {
        this.cuenta.set(c);
        this.monto.set(this.saldoCuota()?.saldo ?? null);
        this.cargando.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.cuenta.set(null);
        this.cargando.set(false);
        if (e.status === 404) this.sinCuenta.set(e.error?.detail ?? 'Sin cuenta');
        else this.notify.error(e);
      },
    });
  }

  cambiarModalidad(modalidad: 'contado' | 'cuotas'): void {
    const c = this.cuenta();
    if (!c || c.modalidad === modalidad) return;
    this.api.patch<EstadoCuenta>(`/cuentas/${c.registro}/modalidad`, { modalidad }).subscribe({
      next: (r) => {
        this.cuenta.set(r);
        this.monto.set(this.saldoCuota()?.saldo ?? null);
        this.notify.ok(modalidad === 'contado' ? 'Pagará al contado' : 'Pagará en 2 cuotas');
      },
      error: (e) => this.notify.error(e),
    });
  }

  cobrar(): void {
    const c = this.cuenta();
    const monto = Number(this.monto());
    if (!c || !monto || this.guardando()) return;
    confirmar(this.dialog, {
      titulo: 'Registrar pago',
      mensaje: `¿Cobrar ${bs(monto)} a ${c.estudiante} (reg. ${c.registro})? Se emitirá un recibo.`,
      confirmar: 'Cobrar',
      icono: 'point_of_sale',
    }).subscribe((ok) => {
      if (!ok) return;
      this.guardando.set(true);
      this.api
        .post<PagoRegistrado>('/pagos', { registro: c.registro, monto, observacion: this.observacion() || null })
        .subscribe({
          next: (r) => {
            this.cuenta.set(r.estado_cuenta);
            this.recibo.set(r.pago);
            this.monto.set(this.saldoCuota()?.saldo ?? null);
            this.observacion.set('');
            this.guardando.set(false);
            this.notify.ok(`Pago registrado · recibo ${r.pago.nro_recibo}`);
          },
          error: (e) => {
            this.guardando.set(false);
            this.notify.error(e);
          },
        });
    });
  }

  anular(p: Pago): void {
    pedirMotivo(this.dialog, {
      titulo: `Anular recibo ${p.nro_recibo}`,
      mensaje: `${bs(p.monto)} — el pago no se borra: queda anulado con su motivo.`,
    }).subscribe((motivo) => {
      if (!motivo) return;
      this.api.patch<PagoRegistrado>(`/pagos/${p.id}/anular`, { motivo }).subscribe({
        next: (r) => {
          this.cuenta.set(r.estado_cuenta);
          this.monto.set(this.saldoCuota()?.saldo ?? null);
          this.notify.ok('Pago anulado');
        },
        error: (e) => this.notify.error(e),
      });
    });
  }

  reimprimir(p: Pago): void {
    this.constancia.set(null);
    this.recibo.set(p);
    setTimeout(() => window.print());
  }

  imprimirRecibo(): void {
    this.constancia.set(null);
    setTimeout(() => window.print());
  }

  emitirConstancia(): void {
    const c = this.cuenta();
    if (!c) return;
    this.api.get<Constancia>(`/reportes/constancia/${c.registro}`).subscribe({
      next: (k) => {
        this.recibo.set(null);
        this.constancia.set(k);
        setTimeout(() => window.print());
      },
      error: (e) => this.notify.error(e),
    });
  }
}
