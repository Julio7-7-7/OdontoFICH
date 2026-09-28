import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import { Rol, Token, Usuario } from './models';

const CLAVE = 'odonto-sesion';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private sesion = signal<Token | null>(this.leer());

  readonly usuario = computed<Usuario | null>(() => this.sesion()?.usuario ?? null);
  readonly token = computed(() => this.sesion()?.access_token ?? null);
  readonly rol = computed<Rol | null>(() => this.usuario()?.rol ?? null);
  readonly esAdmin = computed(() => this.rol() === 'administrador');

  login(usuario: string, password: string): Observable<Token> {
    const body = new HttpParams().set('username', usuario).set('password', password);
    return this.http.post<Token>('/api/auth/login', body).pipe(
      tap((t) => {
        this.sesion.set(t);
        try {
          localStorage.setItem(CLAVE, JSON.stringify(t));
        } catch {
          /* sin almacenamiento: la sesión dura lo que dure la pestaña */
        }
      }),
    );
  }

  logout(): void {
    this.sesion.set(null);
    try {
      localStorage.removeItem(CLAVE);
    } catch {
      /* nada que limpiar */
    }
    this.router.navigate(['/login']);
  }

  /** El administrador puede todo; los demás, solo lo de su rol. */
  puede(...roles: Rol[]): boolean {
    const rol = this.rol();
    return rol === 'administrador' || (rol !== null && roles.includes(rol));
  }

  private leer(): Token | null {
    try {
      const raw = localStorage.getItem(CLAVE);
      return raw ? (JSON.parse(raw) as Token) : null;
    } catch {
      return null;
    }
  }
}
