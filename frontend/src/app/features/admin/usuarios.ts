import { Component, OnInit, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Docente, ROL_LABEL, Rol, Usuario } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { COMUNES } from '../../shared/material';

const ROLES: Rol[] = ['administrador', 'caja', 'docente', 'encargado_insumos'];

@Component({
  selector: 'app-usuario-dialog',
  imports: [...COMUNES],
  template: `
    <div class="dialog-header">
      <div class="header-icon"><mat-icon>manage_accounts</mat-icon><span class="header-icon-badge"><mat-icon>{{ data ? 'edit' : 'add' }}</mat-icon></span></div>
      <div>
        <h2 mat-dialog-title>{{ data ? 'Editar usuario' : 'Nuevo usuario' }}</h2>
        <p class="header-sub">Cada rol ve solo su parte del sistema; administración ve todo</p>
      </div>
    </div>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field><mat-label>Usuario</mat-label>
          <input matInput [disabled]="!!data" [ngModel]="usuario()" (ngModelChange)="usuario.set($event)" /></mat-form-field>
        @if (!data) {
          <mat-form-field><mat-label>Contraseña</mat-label>
            <input matInput type="password" [ngModel]="password()" (ngModelChange)="password.set($event)" />
            <mat-hint>Mínimo 6 caracteres</mat-hint></mat-form-field>
        } @else {
          <mat-form-field><mat-label>Nueva contraseña (opcional)</mat-label>
            <input matInput type="password" [ngModel]="password()" (ngModelChange)="password.set($event)" /></mat-form-field>
        }
        <mat-form-field class="span-2"><mat-label>Nombre completo</mat-label>
          <input matInput [ngModel]="nombre()" (ngModelChange)="nombre.set($event)" /></mat-form-field>
        <mat-form-field><mat-label>Rol</mat-label>
          <mat-select [ngModel]="rol()" (ngModelChange)="rol.set($event)">
            @for (r of roles; track r) { <mat-option [value]="r">{{ rolLabel[r] }}</mat-option> }
          </mat-select></mat-form-field>
        @if (rol() === 'docente') {
          <mat-form-field><mat-label>Docente vinculado</mat-label>
            <mat-select [ngModel]="idDocente()" (ngModelChange)="idDocente.set($event)">
              @for (d of docentes(); track d.id) { <mat-option [value]="d.id">{{ d.apellido }} {{ d.nombre }}</mat-option> }
            </mat-select></mat-form-field>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button class="btn-guardar" [disabled]="!valido() || guardando()" (click)="guardar()">
        <mat-icon>{{ data ? 'save' : 'add' }}</mat-icon> {{ data ? 'Guardar cambios' : 'Crear usuario' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class UsuarioDialog implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private ref = inject(MatDialogRef<UsuarioDialog, Usuario>);
  data = inject<Usuario | null>(MAT_DIALOG_DATA);
  readonly roles = ROLES;
  readonly rolLabel = ROL_LABEL;

  docentes = signal<Docente[]>([]);
  usuario = signal(this.data?.nombre_usuario ?? '');
  password = signal('');
  nombre = signal(this.data?.nombre_completo ?? '');
  rol = signal<Rol>(this.data?.rol ?? 'caja');
  idDocente = signal<number | null>(this.data?.id_docente ?? null);
  guardando = signal(false);

  ngOnInit(): void {
    this.api.get<Docente[]>('/docentes', { estado: 'activo' }).subscribe((d) => this.docentes.set(d));
  }

  valido(): boolean {
    const pass = this.password();
    const passOk = this.data ? pass === '' || pass.length >= 6 : pass.length >= 6;
    return this.usuario().trim().length >= 3 && this.nombre().trim().length > 0 && passOk && (this.rol() !== 'docente' || !!this.idDocente());
  }

  guardar(): void {
    this.guardando.set(true);
    const idDocente = this.rol() === 'docente' ? this.idDocente() : null;
    const fin = { next: (u: Usuario) => this.ref.close(u), error: (e: unknown) => { this.guardando.set(false); this.notify.error(e); } };
    if (!this.data) {
      this.api.post<Usuario>('/usuarios', {
        nombre_usuario: this.usuario().trim(), password: this.password(), nombre_completo: this.nombre().trim(), rol: this.rol(), id_docente: idDocente,
      }).subscribe(fin);
      return;
    }
    const id = this.data.id;
    this.api.patch<Usuario>(`/usuarios/${id}`, { nombre_completo: this.nombre().trim(), rol: this.rol(), id_docente: idDocente }).subscribe({
      next: (u) => {
        if (this.password()) this.api.patch<Usuario>(`/usuarios/${id}/password`, { password: this.password() }).subscribe(fin);
        else this.ref.close(u);
      },
      error: fin.error,
    });
  }
}

@Component({
  selector: 'app-usuarios',
  imports: [...COMUNES],
  template: `
    <div class="page-container">
      <div class="header-card">
        <div class="header-card-top">
          <div class="header-card-title">
            <div class="header-icon"><mat-icon>manage_accounts</mat-icon></div>
            <div>
              <h2>Usuarios</h2>
              <p class="subtitle">Quién entra al sistema y con qué rol</p>
            </div>
          </div>
          <div class="header-card-stats">
            <div class="summary-stat"><mat-icon>group</mat-icon><span class="summary-label">Usuarios</span><span class="summary-num">{{ lista().length }}</span></div>
          </div>
          <button mat-raised-button class="btn-nuevo" (click)="editar(null)"><mat-icon>add</mat-icon><span>Nuevo usuario</span></button>
        </div>
      </div>
      <div class="table-section">
        <table mat-table [dataSource]="lista()" class="full-width-table">
          <ng-container matColumnDef="numero">
            <th mat-header-cell *matHeaderCellDef class="col-center">N°</th>
            <td mat-cell *matCellDef="let u; let i = index" class="col-center"><span class="numero-cell">{{ i + 1 }}</span></td>
          </ng-container>
          <ng-container matColumnDef="usuario">
            <th mat-header-cell *matHeaderCellDef>Usuario</th>
            <td mat-cell *matCellDef="let u"><span class="reg">{{ u.nombre_usuario }}</span></td>
          </ng-container>
          <ng-container matColumnDef="nombre">
            <th mat-header-cell *matHeaderCellDef>Nombre</th>
            <td mat-cell *matCellDef="let u" class="name-cell">{{ u.nombre_completo }}</td>
          </ng-container>
          <ng-container matColumnDef="rol">
            <th mat-header-cell *matHeaderCellDef>Rol</th>
            <td mat-cell *matCellDef="let u"><span class="mod-chip">{{ etiqueta(u.rol) }}</span></td>
          </ng-container>
          <ng-container matColumnDef="estado">
            <th mat-header-cell *matHeaderCellDef class="col-center">Estado</th>
            <td mat-cell *matCellDef="let u" (click)="$event.stopPropagation()">
              <mat-slide-toggle color="primary" [checked]="u.activo" [disabled]="u.id === auth.usuario()?.id" (change)="toggleActivo($event, u)">
                {{ u.activo ? 'Activo' : 'Inactivo' }}
              </mat-slide-toggle>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columnas"></tr>
          <tr mat-row *matRowDef="let row; columns: columnas" class="clickable-row" matTooltip="Editar usuario" (click)="editar(row)"></tr>
        </table>
      </div>
    </div>
  `,
})
export class Usuarios implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  auth = inject(AuthService);
  lista = signal<Usuario[]>([]);
  columnas = ['numero', 'usuario', 'nombre', 'rol', 'estado'];

  etiqueta(rol: Rol): string {
    return ROL_LABEL[rol];
  }

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.api.get<Usuario[]>('/usuarios').subscribe({ next: (l) => this.lista.set(l), error: (e) => this.notify.error(e) });
  }

  editar(u: Usuario | null): void {
    this.dialog.open(UsuarioDialog, { data: u, width: '580px', maxWidth: '95vw' }).afterClosed().subscribe((r) => {
      if (!r) return;
      this.notify.ok(u ? 'Usuario actualizado' : 'Usuario creado');
      this.cargar();
    });
  }

  toggleActivo(ev: MatSlideToggleChange, u: Usuario): void {
    this.api.patch(`/usuarios/${u.id}`, { activo: ev.checked }).subscribe({
      next: () => this.cargar(),
      error: (e) => {
        ev.source.checked = !ev.checked;
        this.notify.error(e);
      },
    });
  }
}
