import { beforeEach, describe, expect, it } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { llamadasA, reiniciarTauri, responder } from './tauriFalso.ts';

describe('invoke falso de Tauri', () => {
  beforeEach(() => reiniciarTauri());

  it('devuelve lo declarado con responder y recuerda los argumentos', async () => {
    responder('progreso_de', 42);
    expect(await invoke('progreso_de', { aid: 7, numero: 1 })).toBe(42);
    expect(llamadasA('progreso_de')).toEqual([{ aid: 7, numero: 1 }]);
  });

  it('admite una función que calcula la respuesta con los argumentos', async () => {
    responder('episodios_vistos', (args) => [(args as { aid: number }).aid]);
    expect(await invoke('episodios_vistos', { aid: 9 })).toEqual([9]);
  });

  it('un comando sin falsear falla con su nombre', async () => {
    await expect(invoke('comando_nuevo')).rejects.toThrow('comando sin falsear: comando_nuevo');
  });

  it('reiniciarTauri borra lo declarado y las llamadas', async () => {
    responder('x', 1);
    await invoke('x');
    reiniciarTauri();
    expect(llamadasA('x')).toEqual([]);
    await expect(invoke('x')).rejects.toThrow('comando sin falsear: x');
  });
});
