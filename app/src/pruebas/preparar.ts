import { vi } from 'vitest';
import { invokeFalso } from './tauriFalso.ts';

// Se ejecuta antes de cada archivo de pruebas de componentes. `svelteTesting()` ya limpia el DOM entre pruebas.
// Todo lo que sale de la ventana pasa por `invoke`: se sustituye por el falso con tabla de comandos.
// Los demás módulos de Tauri se añaden aquí cuando una pantalla los necesite (PR 3).
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeFalso }));

// Las pantallas no salen a la red ni abren diálogos ni notificaciones: todo se sustituye.
// La red responde con un cuerpo vacío pero válido para GraphQL (`data` no nulo); los clientes leen todo con `?.`.
vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200 })),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ onCloseRequested: async () => () => {}, setTheme: async () => {}, isMaximized: async () => false, label: 'main' }),
}));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '0.0.0-test' }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: async () => false, requestPermission: async () => 'denied', sendNotification: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-log', () => ({
  error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn(), attachConsole: async () => () => {},
}));
// El actualizador no sale a la red: por defecto no hay versión nueva. Cada prueba fija lo que `check` devuelve.
vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn(async () => null) }));
vi.mock('@tauri-apps/plugin-autostart', () => ({ isEnabled: async () => false, enable: vi.fn(), disable: vi.fn() }));
vi.mock('../lib/fuentes.ts', () => ({
  fuentes: {
    buscar: vi.fn(async () => []),
    catalogo: vi.fn(async () => []),
    episodios: vi.fn(async () => ({ title: '', episodes: [], synopsis: '', genres: [], status: '', anio: null })),
    servidores: vi.fn(async () => []),
    resolver: vi.fn(),
  },
  // Las tareas de fondo usan esta otra fachada (misma cola, prioridad baja).
  fuentesFondo: {
    buscar: vi.fn(async () => []),
    episodios: vi.fn(async () => ({ title: '', episodes: [], synopsis: '', genres: [], status: '', anio: null })),
  },
}));
