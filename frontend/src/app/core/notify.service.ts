import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

import { mensajeError } from './format';

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private snack = inject(MatSnackBar);

  ok(mensaje: string): void {
    this.snack.open(mensaje, 'OK', { duration: 3500, panelClass: 'snack-ok' });
  }

  error(err: unknown): void {
    this.snack.open(mensajeError(err), 'Cerrar', { duration: 7000, panelClass: 'snack-error' });
  }
}
