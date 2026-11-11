// Picoballoon float altitude calculator
// Model: float where air density = total system mass / balloon full volume,
// 1976 International Standard Atmosphere (0-32 km).

(function () {
  "use strict";

  const M_AIR = 28.965, M_H2 = 2.016, M_HE = 4.0026;   // g/mol
  const RHO0 = 1.225;                                   // sea-level air density, kg/m^3
  const RHO11 = 0.36392, RHO20 = 0.088035, RHO32 = 0.013227;
  const FT = 0.3048;
  const PAYLOADS = range(5, 30);
  const FREE_LIFTS = range(1, 20);
  const CHART_PAYLOADS = [5, 10, 15, 20, 25, 30];

  function range(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }
  const $ = (id) => document.getElementById(id);
  const num = (id) => parseFloat($(id).value);

  // Gas-to-air molar mass ratio
  function gasRatio(gas) { return (gas === "Hydrogen" ? M_H2 : M_HE) / M_AIR; }

  // ISA air density (kg/m^3) at altitude h (m)
  function densityAt(h) {
    if (h <= 11000) return RHO0 * Math.pow((288.15 - 0.0065 * h) / 288.15, 4.2559);
    if (h <= 20000) return RHO11 * Math.exp(-(h - 11000) / 6341.62);
    return RHO20 * Math.pow((216.65 + 0.001 * (h - 20000)) / 216.65, -35.1632);
  }

  // ISA altitude (m) for air density rho (kg/m^3); NaN if outside 0-32 km
  function altitudeFor(rho) {
    if (!(rho > 0) || rho >= RHO0) return NaN;
    if (rho >= RHO11) return (288.15 - 288.15 * Math.pow(rho / RHO0, 1 / 4.2559)) / 0.0065;
    if (rho >= RHO20) return 11000 - 6341.62 * Math.log(rho / RHO11);
    if (rho >= RHO32) return 20000 + (216.65 * Math.pow(rho / RHO20, -1 / 35.1632) - 216.65) / 0.001;
    return NaN;
  }

  // Gas mass (g) from total lift at launch: (envelope + payload + free lift) * r / (1 - r)
  function gasMass(env, pay, fl, r) { return (env + pay + fl) * r / (1 - r); }

  // Volume back-calculated from a past flight (L)
  function calibratedVolume(env, pay, fl, altFt, r) {
    const rho = densityAt(altFt * FT);          // kg/m^3 == g/L
    return (env + pay + gasMass(env, pay, fl, r)) / rho;
  }

  // One grid point
  function floatPoint(env, pay, fl, r, volL) {
    const groundFillL = (env + pay + fl) / (RHO0 * (1 - r));
    const mSys = env + pay + gasMass(env, pay, fl, r);
    const altM = altitudeFor(mSys / volL);
    return {
      fits: groundFillL <= volL,
      altFt: altM / FT,
      overpressure: fl / mSys,
    };
  }

  function readInputs() {
    const gas = $("gas").value;
    const r = gasRatio(gas);
    const calGas = $("cSame").value === "Yes" ? gas : $("cGas").value;
    const calVol = calibratedVolume(num("cEnv"), num("cPay"), num("cFL"), num("cAlt"), gasRatio(calGas));
    const vol = $("useCal").value === "Yes" ? calVol : num("volEntered");
    return { env: num("env"), r, vol };
  }

  function fmt(n) { return Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "–"; }

  function renderGrid(inp) {
    const t = $("grid");
    let html = '<thead><tr><th class="corner">Payload (g) ↓<br>Free lift (g) →</th>';
    FREE_LIFTS.forEach((fl) => { html += `<th>${fl}</th>`; });
    html += "</tr></thead><tbody>";
    PAYLOADS.forEach((p) => {
      html += `<tr><th>${p}</th>`;
      FREE_LIFTS.forEach((fl) => {
        const pt = floatPoint(inp.env, p, fl, inp.r, inp.vol);
        if (!pt.fits) { html += '<td class="nofit">no fit</td>'; return; }
        const cls = pt.overpressure < 0.05 ? ' class="low"' : "";
        html += `<td${cls}>${fmt(pt.altFt)}</td>`;
      });
      html += "</tr>";
    });
    t.innerHTML = html + "</tbody>";
  }

  function renderChart(inp) {
    const W = 760, H = 400, m = { l: 74, r: 130, t: 18, b: 52 };
    const series = CHART_PAYLOADS.map((p) => ({
      p,
      pts: FREE_LIFTS.map((fl) => {
        const pt = floatPoint(inp.env, p, fl, inp.r, inp.vol);
        return { x: fl, y: pt.fits ? pt.altFt : NaN };
      }).filter((d) => Number.isFinite(d.y)),
    }));
    const ys = series.flatMap((s) => s.pts.map((d) => d.y));
    const box = $("chart");
    if (!ys.length) { box.innerHTML = '<p class="empty">No valid altitudes for these inputs.</p>'; return; }

    const step = 1000;
    let y0 = Math.floor(Math.min(...ys) / step) * step;
    let y1 = Math.ceil(Math.max(...ys) / step) * step;
    if (y1 === y0) y1 = y0 + step;
    const x = (v) => m.l + (v - 1) / 19 * (W - m.l - m.r);
    const y = (v) => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);

    let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">`;
    const yStep = (y1 - y0) / step > 10 ? 2 * step : step;
    for (let v = y0; v <= y1; v += yStep) {
      s += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
      s += `<text class="tick" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v.toLocaleString("en-US")}</text>`;
    }
    [1, 5, 10, 15, 20].forEach((v) => {
      s += `<text class="tick" x="${x(v)}" y="${H - m.b + 20}" text-anchor="middle">${v}</text>`;
    });
    s += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/>`;
    s += `<text class="axis-title" x="${(m.l + W - m.r) / 2}" y="${H - 10}" text-anchor="middle">Free lift (g)</text>`;
    s += `<text class="axis-title" transform="translate(16 ${(m.t + H - m.b) / 2}) rotate(-90)" text-anchor="middle">Float altitude (ft)</text>`;

    series.forEach((ser, i) => {
      if (!ser.pts.length) return;
      const d = ser.pts.map((pt, k) => `${k ? "L" : "M"}${x(pt.x).toFixed(1)},${y(pt.y).toFixed(1)}`).join(" ");
      s += `<path class="line s${i + 1}" d="${d}"><title>${ser.p} g payload</title></path>`;
      const last = ser.pts[ser.pts.length - 1];
      s += `<circle class="dot s${i + 1}" cx="${x(last.x)}" cy="${y(last.y)}" r="3.5"/>`;
      s += `<text class="label s${i + 1}" x="${x(last.x) + 10}" y="${y(last.y) + 4}">${ser.p} g payload</text>`;
    });
    box.innerHTML = s + "</svg>";
  }

  function update() {
    const inp = readInputs();
    $("ratioOut").textContent = inp.r.toFixed(4);
    const ok = inp.env >= 0 && inp.vol > 0 && Number.isFinite(inp.vol) && Number.isFinite(inp.env);
    $("volUsedOut").textContent = ok ? fmt(inp.vol) : "check inputs";
    if (!ok) {
      $("grid").innerHTML = "";
      $("chart").innerHTML = '<p class="empty">Enter a valid envelope weight and volume.</p>';
      return;
    }
    renderGrid(inp);
    renderChart(inp);
  }

  document.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("input", update);
    el.addEventListener("change", update);
  });
  update();
})();
