import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { AuthService } from '../core/auth.service';
import { ROL_LABEL } from '../core/models';
import { NAV } from '../core/nav';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatIconModule, MatButtonModule, MatTooltipModule],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  auth = inject(AuthService);
  private router = inject(Router);

  movil = toSignal(inject(BreakpointObserver).observe('(max-width: 1024px)').pipe(map((r) => r.matches)), {
    initialValue: false,
  });
  abierto = signal(false);
  oscuro = signal(document.documentElement.getAttribute('data-theme') === 'dark');

  rolLabel = computed(() => (this.auth.rol() ? ROL_LABEL[this.auth.rol()!] : ''));
  iniciales = computed(() =>
    (this.auth.usuario()?.nombre_completo ?? '?')
      .split(' ')
      .filter((p) => /^[A-ZÁÉÍÓÚÑ]/i.test(p) && !p.endsWith('.'))
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join(''),
  );

  grupos = computed(() =>
    NAV.map((g) => ({
      ...g,
      items: g.items.filter((i) => i.roles.length === 0 || this.auth.puede(...i.roles)),
    })).filter((g) => g.items.length > 0),
  );

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.abierto.set(false));
  }

  alternarTema(): void {
    const oscuro = !this.oscuro();
    this.oscuro.set(oscuro);
    document.documentElement.setAttribute('data-theme', oscuro ? 'dark' : 'light');
    document.documentElement.style.colorScheme = oscuro ? 'dark' : 'light';
    try {
      localStorage.setItem('odonto-theme', oscuro ? 'dark' : 'light');
    } catch {
      /* preferencia solo por esta sesión */
    }
  }
}
