import { vi } from 'vitest';
import { invokeFalso } from './tauriFalso.ts';

// Se ejecuta antes de cada archivo de pruebas de componentes. `svelteTesting()` ya limpia el DOM entre pruebas.
// Todo lo que sale de la ventana pasa por `invoke`: se sustituye por el falso con tabla de comandos.
// Los demás módulos de Tauri se añaden aquí cuando una pantalla los necesite (PR 3).
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeFalso }));
