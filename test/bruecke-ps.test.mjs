// Windows-Brücke (bruecke/fpv-dis-bruecke.cmd, PowerShell): gleicher Ablauf wie die Node-Brücke. Läuft nur, wenn PowerShell
// vorhanden ist (Umgebungsvariable PWSH oder pwsh im Pfad; GitHub-Runner haben es), sonst übersprungen.
// Unter Linux ist es PowerShell 7; auf Windows läuft Windows PowerShell 5.1 (die Datei nutzt nur Befehle, die beide kennen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { readFileSync } from 'node:fs';

const PW = process.env.PWSH || 'pwsh', have = spawnSync(PW, ['-NoProfile', '-Command', '1'], { encoding: 'utf8' }).status === 0;
const CMD = new URL('../bruecke/fpv-dis-bruecke.cmd', import.meta.url).pathname;
const wait = ms => new Promise(r => setTimeout(r, ms));

test('Windows-Brücke: reines ASCII, Kopf für cmd und PowerShell', () => {
  const s = readFileSync(CMD, 'utf8');
  assert.ok(!/[^\x00-\x7f]/.test(s), 'nur ASCII');
  assert.ok(s.startsWith('<# :'), 'Kopf: für cmd eine Sprungmarke, für PowerShell ein Kommentar');
  assert.match(s, /powershell -NoProfile -ExecutionPolicy Bypass/);
  assert.ok(!/\?\?|\?\.|&&|\|\|/.test(s.split('#>')[1]), 'keine Schreibweisen nur für PowerShell 7');
  assert.ok(!/vbs|lagebild/i.test(s), 'universell: kein Bezug auf ein bestimmtes Programm');
});

test('Windows-Brücke: Gesamtlauf mit PowerShell (WebSocket <-> UDP, Herzschlag, Port wechseln, deaktiviert)', { skip: !have && 'PowerShell nicht vorhanden' }, async t => {
  const vbs = createSocket('udp4'), got = [];
  vbs.on('message', m => got.push(new Uint8Array(m)));
  await new Promise(r => vbs.bind(0, '127.0.0.1', r));
  const port = 20000 + Math.floor(Math.random()*20000), disPort = port + 1;
  const ps = spawn(PW, ['-NoProfile', '-Command', `iex (Get-Content -LiteralPath '${CMD}' -Raw)`],
    { env: { ...process.env, FPVB_PORT: String(port), FPVB_DISPORT: String(disPort), FPVB_TARGETPORT: String(vbs.address().port), FPVB_TARGET: '127.0.0.1', FPVB_HEARTBEAT: '0.5' } });
  let out = ''; ps.stdout.on('data', d => out += d); ps.stderr.on('data', d => out += d);
  t.after(() => { ps.kill(); vbs.close(); });
  for (let i = 0; i < 60 && !out.includes('laeuft'); i++) await wait(250);
  assert.match(out, /FPV-DIS-Bruecke laeuft/);
  const ws = new WebSocket('ws://localhost:' + port), rx = [];
  ws.binaryType = 'arraybuffer'; ws.onmessage = e => rx.push(e.data);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WebSocket: ' + out)); });
  await wait(1500);
  assert.ok(rx.some(x => typeof x === 'string' && JSON.parse(x).name === 'fpv-dis-bruecke' && JSON.parse(x).disPort === disPort), 'meldet sich');
  // Version 3 (Prompt 177): Nummer je Verbindung, Zahl der Verbindungen an alle
  const infos = arr => arr.filter(x => typeof x === 'string').map(x => JSON.parse(x)).filter(m => m.t === 'info');
  assert.equal(infos(rx).pop().slot, 1, 'erste Verbindung FPV1');
  const ws2 = new WebSocket('ws://localhost:' + port), rx2 = [];
  ws2.onmessage = e => rx2.push(e.data);
  await new Promise((res, rej) => { ws2.onopen = res; ws2.onerror = () => rej(new Error('WebSocket 2: ' + out)); });
  await wait(1500);
  assert.equal(infos(rx2).pop().slot, 2, 'zweite Verbindung FPV2'); assert.equal(infos(rx).pop().clients, 2, 'erste erfährt davon');
  ws2.close(); await wait(1500);
  assert.equal(infos(rx).pop().clients, 1, 'nach dem Trennen wieder eine');
  const pdu = new Uint8Array(144); pdu[0] = 6; pdu[1] = 1; pdu[2] = 1; pdu[3] = 1; pdu[88] = 4; pdu[100] = 42;
  ws.send(pdu); await wait(400);
  assert.ok(got.length >= 1 && got[0][100] === 42, 'durchgereicht');
  await wait(1300); assert.ok(got.length >= 3, 'Herzschlag: ' + got.length);
  const s = createSocket('udp4'), back = Buffer.from(pdu); back[17] = 13;
  await new Promise(r => s.send(back, disPort, '127.0.0.1', r)); s.close(); await wait(500);
  assert.ok(rx.some(x => x instanceof ArrayBuffer && new Uint8Array(x)[17] === 13), 'PDU von VBS am Browser');
  // anderer DIS-Port auf Wunsch des Browsers
  const np = disPort + 2; ws.send(JSON.stringify({ t: 'config', port: np })); await wait(800);
  assert.ok(rx.some(x => typeof x === 'string' && JSON.parse(x).disPort === np), 'neue Info: ' + out);
  const s3 = createSocket('udp4'), b3 = Buffer.from(pdu); b3[17] = 31;
  await new Promise(r => s3.send(b3, np, '127.0.0.1', r)); s3.close(); await wait(500);
  assert.ok(rx.some(x => x instanceof ArrayBuffer && new Uint8Array(x)[17] === 31), 'Empfang auf dem neuen Port');
  const n = got.length; ws.close(); await wait(800);
  assert.ok(got.slice(n).some(p => (p[85] & 0x80) && p[88] === 1), 'deaktiviert');
});
