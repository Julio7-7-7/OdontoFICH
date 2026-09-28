import { HttpErrorResponse } from '@angular/common/http';

// Formateo sin pipes de locale (en Postgrado CurrencyPipe/DatePipe dieron NG0701): toLocaleString directo.

export function bs(valor: number | null | undefined): string {
  const n = Number(valor ?? 0);
  return 'Bs ' + n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function num(valor: number | null | undefined): string {
  return Number(valor ?? 0).toLocaleString('es-BO', { maximumFractionDigits: 2 });
}

/** '2026-09-24' → '24/09/2026' (sin pasar por Date, para no correr el día por la zona horaria). */
export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
  );
}

/** Fecha local de hoy en formato ISO (yyyy-mm-dd). */
export function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function aIso(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function deIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d);
}

/** Mensaje legible de un error de la API (detail texto, detalle de stock o errores de validación). */
export function mensajeError(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) return 'Error inesperado';
  if (err.status === 0) return 'No se pudo conectar con el servidor';
  const detail = err.error?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: { msg: string; loc?: string[] }) => `${d.loc?.at(-1) ?? ''}: ${d.msg}`).join(' · ');
  }
  if (detail?.faltantes) {
    const faltan = detail.faltantes
      .map((f: { nombre: string; requerido: number; disponible: number; unidad_medida: string }) =>
        `${f.nombre} (hay ${num(f.disponible)}, se necesitan ${num(f.requerido)} ${f.unidad_medida})`)
      .join(', ');
    return `${detail.mensaje}: ${faltan}`;
  }
  return `Error ${err.status}`;
}
