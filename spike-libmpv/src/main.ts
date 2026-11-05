import { invoke } from '@tauri-apps/api/core';
import {
  MpvConfig,
  getProperty,
  MpvObservableProperty,
  command,
  init,
  observeProperties,
  setProperty,
} from 'tauri-plugin-libmpv-api';

const OBSERVED = [
  ['pause', 'flag'],
  ['time-pos', 'double', 'none'],
  ['duration', 'double', 'none'],
] as const satisfies MpvObservableProperty[];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('status');
const seek = $<HTMLInputElement>('seek');
const time = $('time');
let paused = false;
let duration = 0;

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const config: MpvConfig = {
  initialOptions: { vo: 'gpu-next', hwdec: 'auto-safe', 'keep-open': 'yes', 'force-window': 'yes' },
  observedProperties: OBSERVED,
};

async function main() {
  try {
    await init(config);
    status.textContent = 'mpv listo';
  } catch (e) {
    status.textContent = `init falló: ${e}`;
    return;
  }

  await observeProperties(OBSERVED, ({ name, data }) => {
    if (name === 'pause') {
      paused = Boolean(data);
      $('toggle').textContent = paused ? 'Reanudar' : 'Pausa';
    } else if (name === 'duration') {
      duration = Number(data ?? 0);
      seek.max = String(duration || 1);
    } else if (name === 'time-pos' && data != null) {
      seek.value = String(data);
      time.textContent = `${fmt(Number(data))} / ${fmt(duration)}`;
    }
  });

  $('play').addEventListener('click', async () => {
    try {
      const p = JSON.parse($<HTMLInputElement>('playable').value);
      const fields = Object.entries(p.headers as Record<string, string>)
        .map(([k, v]) => `${k}: ${v}`)
        .join(',');
      await setProperty('user-agent', p.userAgent);
      await setProperty('http-header-fields', fields);
      await command('loadfile', [p.url]);
      status.textContent = 'cargando…';
    } catch (e) {
      status.textContent = `error: ${e}`;
    }
  });
  $('toggle').addEventListener('click', () => setProperty('pause', !paused));
  seek.addEventListener('change', () => command('seek', [seek.value, 'absolute']));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const report = (msg: string) => invoke('report', { msg });

// Prueba automática: si hay /playable.json, reproduce, pausa, reanuda y busca, y lo reporta.
async function autotest() {
  const res = await fetch('/playable.json').catch(() => null);
  if (!res?.ok) return;
  const p = await res.json();
  const num = async (n: string) => (await getProperty(n, 'double')) as number | null;
  try {
    await report('init ok; cargando Playable');
    await setProperty('user-agent', p.userAgent);
    await setProperty(
      'http-header-fields',
      Object.entries(p.headers as Record<string, string>)
        .map(([k, v]) => `${k}: ${v}`)
        .join(','),
    );
    await command('loadfile', [p.url]);
    await sleep(10000);
    const t1 = await num('time-pos');
    const dur = await num('duration');
    const codec = await getProperty('video-codec', 'string');
    const hw = await getProperty('hwdec-current', 'string');
    await report(`t1=${t1} dur=${dur} codec=${codec} hwdec=${hw}`);
    await setProperty('pause', true);
    await sleep(500);
    const a = await num('time-pos');
    await sleep(1500);
    const b = await num('time-pos');
    await report(`pausa: ${a} -> ${b} ${a === b ? 'OK (quieto)' : 'FALLA (avanza)'}`);
    await setProperty('pause', false);
    await command('seek', ['300', 'absolute']);
    await sleep(4000);
    const t2 = await num('time-pos');
    await report(`seek a 300: time-pos=${t2} ${t2 !== null && t2 >= 300 && t2 < 320 ? 'OK' : 'FALLA'}`);
    await report(`avance inicial: ${t1 !== null && t1 > 3 ? 'OK' : 'FALLA'}`);
  } catch (e) {
    await report(`ERROR: ${e}`);
  }
}

main().then(autotest);
