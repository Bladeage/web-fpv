// Feste Flugszenarien für den Vergleich mit legacy/fpv-sim-stufe1.html.
// Die Funktionen dürfen keine Namen von außen benutzen: tools/record-legacy-trace.mjs
// schickt ihren Quelltext in die Browserseite der Referenz.
// api: { sim(), state(), setThrottle(v), inp, cfg, gates, step, respawn }

export function runScenarios(api) {
  const STEP = 1/240;
  const out = {};
  const snap = () => {
    const s = api.sim();
    return { p: s.p.slice(), v: s.v.slice(), q: s.q.slice(), w: s.w.slice(), thr: s.thr, t: s.t,
             mah: s.mah, amp: s.amp, vpack: s.vpack, cellRest: s.cellRest, flyT: s.flyT,
             next: s.next, lapStart: s.lapStart, grounded: s.grounded, state: api.state(), crashMsg: s.crashMsg };
  };
  // Eine Folge von Abschnitten fliegen: [Dauer s, Gas, Nicken, Rollen, Gieren]
  const fly = (segs, every) => {
    const rec = [];
    let n = 0;
    for (const [dur, thr, pitch, roll, yaw] of segs) {
      api.setThrottle(thr);
      api.inp.pitch = pitch; api.inp.roll = roll; api.inp.yaw = yaw;
      const steps = Math.round(dur/STEP);
      for (let i = 0; i < steps; i++) {
        if (api.state() !== 'fly') break;
        api.step(STEP);
        if (++n % every === 0) rec.push(snap());
      }
    }
    rec.push(snap());
    return rec;
  };
  const neutral = () => { api.inp.pitch = api.inp.roll = api.inp.yaw = 0; };

  api.cfg.mode = 'angle'; api.cfg.rate = 450;
  api.respawn(); neutral();
  out.angle = fly([[1.5, 0.5, 0, 0, 0], [2, 0.32, 1, 0, 0], [1, 0.3, 0, 0.5, 0], [1, 0.3, 0, 0, 1], [1.5, 0.28, -0.4, -0.3, -0.5], [1, 0.25, 0, 0, 0]], 24);

  api.cfg.mode = 'acro';
  api.respawn(); neutral();
  out.acro = fly([[1, 0.45, 0, 0, 0], [0.5, 0.35, 0.3, 0, 0], [0.5, 0.35, 0, -0.6, 0], [0.5, 0.35, 0, 0, 0.4], [1, 0.3, -0.2, 0.2, 0], [2, 0.15, 0, 0, 0]], 24);

  // Tor 1 gerade durchfliegen
  api.cfg.mode = 'angle';
  api.respawn(); neutral();
  {
    const g = api.gates[0], s = api.sim();
    s.p = [g.c[0] - g.n[0]*1.5, g.c[1], g.c[2] - g.n[2]*1.5];
    s.v = [g.n[0]*8, 0, g.n[2]*8];
    s.grounded = false; s.thr = 0.24;
  }
  out.gate = fly([[0.5, 0.24, 0, 0, 0]], 12);

  // Torpfosten treffen
  api.respawn(); neutral();
  {
    const g = api.gates[0], s = api.sim(), lat = -(1.2 + 0.12);
    s.p = [g.c[0] + g.r[0]*lat - g.n[0]*1.5, g.c[1], g.c[2] + g.r[2]*lat - g.n[2]*1.5];
    s.v = [g.n[0]*8, 0, g.n[2]*8];
    s.grounded = false; s.thr = 0.24;
  }
  out.post = fly([[0.5, 0.24, 0, 0, 0]], 12);

  // Akku bis über das Ende entladen
  api.respawn(); neutral();
  out.battery = fly([[140, 0.6, 0, 0, 0]], 240);

  api.cfg.mode = 'angle';
  api.respawn(); neutral();
  return out;
}

// Kennzahlen eines Modells (Vertexdaten). Node und Chromium runden Math.sin/cos
// nicht bitgleich, darum Summen statt Prüfsumme; Vergleich mit Toleranz.
export function meshStats(arr) {
  let sum = 0, abs = 0, wsum = 0;
  for (let i = 0; i < arr.length; i++) { sum += arr[i]; abs += Math.abs(arr[i]); wsum += arr[i]*(i % 97 + 1); }
  return { n: arr.length, sum, abs, wsum };
}
