import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { ApiService } from '../../core/api.service';
import { fecha, fechaHora, hoyIso } from '../../core/format';
import { Habilitacion, Sesion } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { pedirMotivo } from '../../shared/dialogos';
import { COMUNES } from '../../shared/material';
import { SesionDialog } from './sesion-dialog';

interface Candidato {
  registro: number;
  estudiante: string;
  en_sesion: boolean;
  realizados: number;
  requeridos: number;
  quedaria_habilitado: boolean;
  motivo: string | null;
}

@Component({
  selector: 'app-sesion-detalle',
  imports: [...COMUNES],
  templateUrl: './sesion-detalle.html',
  styleUrl: './sesion-detalle.css',
})
export class SesionDetalle implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);

  id = input.required<string>();
  sesion = signal<Sesion | null>(null);
  candidatos = signal<Candidato[]>([]);
  seleccion = signal<number[]>([]);
  guardando = signal(false);

  readonly fecha = fecha;
  readonly fechaHora = fechaHora;
  readonly hoy = hoyIso();
  columnas = ['numero', 'estudiante', 'avance', 'estado', 'acciones'];

  pendientesDeMarcar = computed(() => this.candidatos().filter((c) => !c.en_sesion));
  abierta = computed(() => this.sesion()?.estado === 'abierta');
  conEntregas = computed(() => (this.sesion()?.entregados ?? 0) > 0);
  todosMarcados = computed(() => {
    const p = this.pendientesDeMarcar();
    return p.length > 0 && p.every((c) => this.seleccion().includes(c.registro));
  });

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.api.get<Sesion>(`/sesiones/${this.id()}`).subscribe({
      next: (s) => this.sesion.set(s),
      error: (e) => this.notify.error(e),
    });
    this.api.get<Candidato[]>(`/sesiones/${this.id()}/candidatos`).subscribe((c) => {
      this.candidatos.set(c);
      this.seleccion.set([]);
    });
  }

  alternar(registro: number, marcado: boolean): void {
    this.seleccion.update((s) => (marcado ? [...s, registro] : s.filter((r) => r !== registro)));
  }

  alternarTodos(marcado: boolean): void {
    this.seleccion.set(marcado ? this.pendientesDeMarcar().map((c) => c.registro) : []);
  }

  habilitar(): void {
    if (!this.seleccion().length) return;
    this.guardando.set(true);
    this.api.post<Sesion>(`/sesiones/${this.id()}/estudiantes`, { registros: this.seleccion() }).subscribe({
      next: (s) => {
        this.sesion.set(s);
        const nuevos = s.habilitaciones.filter((h) => this.seleccion().includes(h.registro));
        const bloqueados = nuevos.filter((h) => h.estado === 'bloqueado').length;
        this.notify.ok(
          `${nuevos.length} estudiante(s) marcados` + (bloqueados ? ` · ${bloqueados} quedaron bloqueados` : ''),
        );
        this.guardando.set(false);
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.notify.error(e);
      },
    });
  }

  retirar(h: Habilitacion): void {
    this.api.patch<Sesion>(`/sesiones/${this.id()}/estudiantes/${h.registro}/retirar`).subscribe({
      next: () => {
        this.notify.ok(`${h.estudiante} retirado de la sesión`);
        this.cargar();
      },
      error: (e) => this.notify.error(e),
    });
  }

  editar(): void {
    this.dialog
      .open(SesionDialog, { data: this.sesion(), width: '560px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((s: Sesion | undefined) => {
        if (s) {
          this.notify.ok('Sesión actualizada');
          this.cargar();
        }
      });
  }

  anular(): void {
    pedirMotivo(this.dialog, {
      titulo: 'Anular sesión',
      mensaje: 'Los estudiantes marcados ya no podrán retirar su kit para esta práctica.',
      confirmar: 'Anular sesión',
    }).subscribe((motivo) => {
      if (!motivo) return;
      this.api.patch<Sesion>(`/sesiones/${this.id()}/anular`, { motivo }).subscribe({
        next: (s) => {
          this.sesion.set(s);
          this.notify.ok('Sesión anulada');
        },
        error: (e) => this.notify.error(e),
      });
    });
  }
}
