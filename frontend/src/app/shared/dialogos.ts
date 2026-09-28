import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Observable } from 'rxjs';

export interface ConfirmData {
  titulo: string;
  mensaje: string;
  confirmar?: string;
  icono?: string;
  peligro?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="dialog-header">
      <div class="header-icon" [class.header-icon-danger]="data.peligro">
        <mat-icon>{{ data.icono ?? 'help_outline' }}</mat-icon>
      </div>
      <div>
        <h2 mat-dialog-title>{{ data.titulo }}</h2>
      </div>
    </div>
    <mat-dialog-content><p class="confirm-msg">{{ data.mensaje }}</p></mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-flat-button class="btn-guardar" [class.btn-peligro]="data.peligro" [mat-dialog-close]="true">
        {{ data.confirmar ?? 'Confirmar' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialog {
  data = inject<ConfirmData>(MAT_DIALOG_DATA);
}

export interface MotivoData {
  titulo: string;
  mensaje: string;
  confirmar?: string;
}

/** Anular siempre exige un motivo: nada se borra, queda registrado quién y por qué. */
@Component({
  selector: 'app-motivo-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, FormsModule],
  template: `
    <div class="dialog-header">
      <div class="header-icon header-icon-danger"><mat-icon>block</mat-icon></div>
      <div>
        <h2 mat-dialog-title>{{ data.titulo }}</h2>
        <p class="header-sub">{{ data.mensaje }}</p>
      </div>
    </div>
    <mat-dialog-content>
      <mat-form-field class="w-100">
        <mat-label>Motivo</mat-label>
        <textarea matInput rows="3" required maxlength="200" [ngModel]="motivo()" (ngModelChange)="motivo.set($event)"
                  cdkFocusInitial></textarea>
        <mat-hint align="end">{{ motivo().length }}/200</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button class="btn-guardar btn-peligro" [disabled]="motivo().trim().length < 3"
              (click)="ref.close(motivo().trim())">
        {{ data.confirmar ?? 'Anular' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: '.w-100 { width: 100%; min-width: 380px; }',
})
export class MotivoDialog {
  data = inject<MotivoData>(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<MotivoDialog, string>);
  motivo = signal('');
}

export function confirmar(dialog: MatDialog, data: ConfirmData): Observable<boolean | undefined> {
  return dialog.open(ConfirmDialog, { data, width: '440px', maxWidth: '95vw' }).afterClosed();
}

export function pedirMotivo(dialog: MatDialog, data: MotivoData): Observable<string | undefined> {
  return dialog.open(MotivoDialog, { data, width: '480px', maxWidth: '95vw' }).afterClosed();
}
