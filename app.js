'use strict';
/* Kairos page behaviour. Static page, no build step and no network access.
   Needs window.KAIROS_CASES (assets/cases.js), window.KAIROS_LANDSCAPE (assets/landscape.js)
   and window.KAIROS_I18N (i18n.js), all loaded before this file.
   Sections: canvas helpers · opening landscape and playback · method figure · three modelling views
   · case explorer · language · figure viewer · reading navigation · animation loop. */
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const D = window.KAIROS_CASES;
  const INK = '#17243b', ACCENT = '#78b5e2', BLUE = '#738997', SAGE = '#9cbfce';
  const STATIC_COLOR = '#b39abb', DYNAMICS_COLOR = '#76aaa6';
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = v => { const t = clamp(v); return t * t * (3 - 2 * t); };
  const mix = (a, b, u) => a + (b - a) * u;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Per-case MMD²: unbiased RBF kernel on a shared 50-d PCA, single median-distance bandwidth,
  // 3-seed median at each of the 7 query times, then averaged. Keyed by case id; A = forward-looking, B = response readout.
  const MMD2_BY_CASE = {
    KO0060: {A: 0.6360999571168078, B: 0.3885328498199963},
    KO0068: {A: 0.4857701089552086, B: 0.3972312330706321},
    KO0052: {A: 0.7392969579681034, B: 0.4501267017108705}
  };

  let lang = 'en';
  const T = () => window.KAIROS_I18N[lang];

  function surface(canvas) {
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = box.width, h = box.height;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    ctx.font = '11px system-ui, sans-serif';
    return {ctx, w, h};
  }
  function path(ctx, pts, color, width = 1, alpha = 1) {
    if (!pts.length) return;
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p));
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = alpha; ctx.stroke(); ctx.globalAlpha = 1;
  }
  function arrow(ctx, a, b, color, alpha = 1) {
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    path(ctx, [a, b], color, 1, alpha);
    path(ctx, [[b[0] - 3.5 * Math.cos(angle - .5), b[1] - 3.5 * Math.sin(angle - .5)], b,
      [b[0] - 3.5 * Math.cos(angle + .5), b[1] - 3.5 * Math.sin(angle + .5)]], color, 1, alpha);
  }

  // Current Fig. 1a surface and sphere routes; website-only conceptual condition morph.
  const PARAMS = [
    {center: 0, split: .05, fork: .24, tilt: 0, bias: .5, wA: 0, wB: 0},
    {center: .60, split: .12, fork: .18, tilt: .09, bias: 1, wA: 1, wB: 0},
    {center: -.65, split: .10, fork: .18, tilt: -.10, bias: 0, wA: 0, wB: 1}
  ];
  let condition = 0, currentParams = {...PARAMS[0]}, morphFrom = {...currentParams}, morphStart = -1;
  let conceptTime = reduceMotion ? .88 : 0;
  let conceptDirty = true;
  function centerAt(x, p) { return p.center * smooth(x); }
  function splitAt(x, p) { return p.split * smooth((x - p.fork) / (1 - p.fork)); }
  function heightAt(x, y, p) {
    const z = y - centerAt(x, p), s = splitAt(x, p);
    const ridge = .42 * smooth((x - p.fork) / (1 - p.fork)) * Math.exp(-((z / .20) ** 2));
    return .94 * (1 - x) + 1.10 * (z * z - s * s) ** 2 + p.tilt * z * x + ridge;
  }
  function schematicPoint(x, seed, p) {
    const branch = (seed + .5) / 56 < p.bias ? 1 : -1;
    const jitter = Math.sin(seed * 8.72) * .045;
    return [x, centerAt(x, p) + branch * splitAt(x, p) + jitter * (.15 + .85 * x)];
  }
  // The method-section field has its own state so it never disturbs the opening landscape.
  const fieldState = {params: {...PARAMS[0]}, from: {...PARAMS[0]}, start: -1, cond: 0, time: .3, target: .3, step: 0};
  let fieldDirty = true;
  function updateConditionLabels() {
    $('#condition-description').textContent = T().condDescs[condition];
    $('#field-condition').textContent = T().condNames[fieldState.cond];
    updateFieldCaption();
  }
  function updateFieldCaption() {
    $('#field-caption').textContent = fieldState.step === 0 ? T().fieldCap0 : fieldState.step === 1 ? T().fieldCap1 : T().condDescs[fieldState.cond];
  }
  function setFieldCondition(n) {
    fieldState.cond = n; fieldState.from = {...fieldState.params};
    if (reduceMotion) fieldState.params = {...PARAMS[n]}; else fieldState.start = performance.now();
    updateConditionLabels(); fieldDirty = true;
  }
  let fieldCycle = null;
  function setFieldStep(i) {
    fieldState.step = i;
    $$('.scrolly .step').forEach(el => el.classList.toggle('is-active', Number(el.dataset.step) === i));
    clearInterval(fieldCycle); fieldCycle = null;
    fieldState.target = i === 0 ? .3 : .88;
    if (reduceMotion) fieldState.time = fieldState.target;
    if (i < 2) setFieldCondition(0);
    else {
      setFieldCondition(1);
      if (!reduceMotion) fieldCycle = setInterval(() => { if (!document.hidden) setFieldCondition(fieldState.cond === 1 ? 2 : fieldState.cond === 2 ? 0 : 1); }, 2600);
    }
    updateFieldCaption(); fieldDirty = true;
  }
  // Opening "video": the state travels along each condition's path, then the landscape morphs to the next condition.
  const hero = {playing: !reduceMotion, t: reduceMotion ? 1 : 0, hold: 0, visible: true};
  const HERO_END = .88, HERO_SECONDS = 6, HERO_HOLD = 1.1;
  function heroSync() {
    conceptTime = hero.t * HERO_END; conceptDirty = true;
    const scrub = $('#hero-scrub'); if (scrub) scrub.value = Math.round(hero.t * 1000);
    const out = $('#hero-time'); if (out) out.textContent = Math.round(hero.t * 100) + '%';
    const btn = $('#hero-play'); if (btn) { btn.textContent = hero.playing ? '❚❚' : '▶'; btn.setAttribute('aria-label', hero.playing ? T().heroPause : T().heroPlay); }
  }
  function heroAdvance(dt) {
    if (!hero.playing || !hero.visible || document.hidden) return;
    if (hero.t >= 1) {
      hero.hold += dt;
      if (hero.hold >= HERO_HOLD) { hero.hold = 0; hero.t = 0; selectCondition((condition + 1) % 3, true); heroSync(); }
      return;
    }
    hero.t = Math.min(1, hero.t + dt / HERO_SECONDS); heroSync();
  }
  function selectCondition(n, auto = false) {
    if (!auto) { hero.t = 0; hero.hold = 0; if (!reduceMotion) hero.playing = true; heroSync(); }
    condition = clamp(Number(n), 0, 2);
    morphFrom = {...currentParams}; morphStart = performance.now();
    $$('[data-condition]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.condition) === condition)));
    updateConditionLabels();
    conceptDirty = true;
  }
  $$('[data-condition]').forEach(b => b.addEventListener('click', () => selectCondition(b.dataset.condition)));
  function setConceptTime(t) {
    hero.playing = false; hero.t = clamp(Number(t) / HERO_END); heroSync();
  }
  $('#hero-play').addEventListener('click', () => {
    if (!hero.playing && hero.t >= 1) { hero.t = 0; hero.hold = 0; }
    hero.playing = !hero.playing; heroSync();
  });
  $('#hero-scrub').addEventListener('input', e => { hero.playing = false; hero.t = Number(e.target.value) / 1000; heroSync(); });
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { hero.visible = e.isIntersecting; }).observe($('.landscape-explorer'));

  const L = window.KAIROS_LANDSCAPE;
  const terrainCache = document.createElement('canvas');
  // Preserve the source lighting while giving each condition its own surface.
  // Control stays white; A is blue and B is red, including during the morph.
  const surfacePalette = [[255, 255, 255], [137, 183, 241], [241, 154, 164]];
  const sourceLighting = new Map(L.faces.map(([, fill]) => {
    const channels = [1, 3, 5].map(i => parseInt(fill.slice(i, i + 2), 16));
    return [fill, (.2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2]) / 255];
  }));
  let terrainKey = '';
  // Use the original control trajectory as the center of the valley that rises.
  function controlCenter(y) {
    const route = L.routes[0];
    for (let i = 1; i < route.length; i++) {
      if (route[i][1] >= y) {
        const a = route[i - 1], b = route[i];
        return mix(a[0], b[0], clamp((y - a[1]) / Math.max(.001, b[1] - a[1])));
      }
    }
    return route.at(-1)[0];
  }
  function terrainOffset(x, y, p) {
    const depth = smooth((y - 275) / 230) * (1 - .35 * smooth((y - 820) / 190));
    const central = Math.exp(-(((x - controlCenter(y)) / 105) ** 2));
    const rightChannel = Math.exp(-(((x - (800 + (y - 300) * .68)) / 105) ** 2));
    return depth * (-245 * p.wA * central + p.wB * (-65 * central + 60 * rightChannel));
  }
  function nativeRoute(t, p) {
    const u = clamp(t) * (L.routes[0].length - 1), i = Math.min(Math.floor(u), L.routes[0].length - 2), f = u - i;
    const points = L.routes.map(r => [mix(r[i][0], r[i + 1][0], f), mix(r[i][1], r[i + 1][1], f)]);
    const weights = [1 - p.wA - p.wB, p.wA, p.wB];
    return [0, 1].map(k => points.reduce((sum, q, n) => sum + q[k] * weights[n], 0));
  }
  function drawLandscape() {
    const canvas = $('#landscape'), {ctx, w, h} = surface(canvas), p = currentParams;
    const scale = Math.min(w / 1491, (h - 30) / 870), ox = (w - 1491 * scale) / 2, oy = 23;
    const project = (x, y) => [ox + x * scale, oy + (y - 150 + terrainOffset(x, y, p)) * scale];
    const key = [canvas.width, canvas.height, p.wA.toFixed(2), p.wB.toFixed(2)].join(':');
    if (key !== terrainKey) {
      terrainKey = key; terrainCache.width = canvas.width; terrainCache.height = canvas.height;
      const c = terrainCache.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const weights = [1 - p.wA - p.wB, p.wA, p.wB];
      const base = [0, 1, 2].map(k => surfacePalette.reduce((v, color, n) => v + weights[n] * color[k], 0));
      const shaded = new Map([...sourceLighting].map(([fill, light]) => [fill, `rgb(${base.map(channel => Math.round(channel * light)).join(',')})`]));
      for (const [coords, fill] of L.faces) {
        c.beginPath();
        for (let j = 0; j < coords.length; j += 2) {
          const q = project(coords[j], coords[j + 1]); j ? c.lineTo(...q) : c.moveTo(...q);
        }
        c.closePath(); c.fillStyle = shaded.get(fill); c.fill(); c.strokeStyle = shaded.get(fill); c.lineWidth = .35; c.stroke();
      }
      c.beginPath();
      for (const coords of L.mesh) {
        for (let j = 0; j < coords.length; j += 2) {
          const q = project(coords[j], coords[j + 1]); j ? c.lineTo(...q) : c.moveTo(...q);
        }
      }
      c.strokeStyle = `rgb(${[0, 1, 2].map(k => Math.round([[135,145,153],[49,101,168],[172,67,83]].reduce((v, color, n) => v + weights[n] * color[k], 0))).join(',')})`; c.globalAlpha = .30; c.lineWidth = .4; c.stroke(); c.globalAlpha = 1;
    }
    ctx.drawImage(terrainCache, 0, 0, w, h);
    const baseRGB = [[56,70,80], [7,89,206], [208,46,64]];
    const weights = [1 - p.wA - p.wB, p.wA, p.wB];
    const color = baseRGB[0].map((_, k) => Math.round(baseRGB.reduce((v, c, i) => v + weights[i] * c[k], 0)));
    const rgb = white => `rgb(${color.map(c => Math.round(c + (255 - c) * white)).join(',')})`;
    const route = t => project(...nativeRoute(t, p));
    path(ctx, Array.from({length: 121}, (_, i) => route(i / 120)), rgb(.25), 1.2, .20);
    path(ctx, Array.from({length: 121}, (_, i) => route(conceptTime * i / 120)), rgb(.05), 1.8, .90);
    // Small intermediate state spheres retain Fig. 1a's visual vocabulary.
    for (let i = 1; i < 23; i++) {
      const t = i / 23;
      if (t >= conceptTime - .025) break;
      const [x, y] = route(t); ctx.beginPath(); ctx.arc(x, y, Math.max(1.8, 7 * scale), 0, 2 * Math.PI);
      ctx.fillStyle = rgb(.32); ctx.fill();
    }
    const sphere = (t, radius, muted = false) => {
      const [x, y] = route(t), r = Math.max(radius * scale, 5);
      ctx.fillStyle = 'rgba(38,60,80,.10)'; ctx.beginPath(); ctx.ellipse(x + r * .08, y + r * .96, r * .9, r * .16, 0, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(x - r * .3, y - r * .35, 0, x, y, r);
      if (muted) { g.addColorStop(0, '#c3cbd0'); g.addColorStop(1, '#7b8890'); }
      else { g.addColorStop(0, rgb(.60)); g.addColorStop(.55, rgb(.43)); g.addColorStop(1, rgb(.22)); }
      ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fillStyle = g; ctx.fill();
    };
    sphere(0, 24, true); sphere(conceptTime, 32);
    const origin = route(0); ctx.font = '14px system-ui, sans-serif'; ctx.fillStyle = '#384650'; ctx.textAlign = 'center';
    ctx.fillText(T().canvasSharedOrigin, origin[0], Math.max(18, origin[1] - 18));
    ctx.textAlign = 'left';
  }
  function drawField() {
    const {ctx, w, h} = surface($('#vector-field')), p = fieldState.params;
    const project = (x, y) => [24 + x * (w - 46), h * .48 - y * h * .34];
    for (let i = 0; i < 11; i++) path(ctx, [project(i / 10, -1.04), project(i / 10, 1.04)], '#e0e6ee', .7);
    for (let j = -4; j <= 4; j++) path(ctx, [project(0, j / 4), project(1, j / 4)], '#e0e6ee', .7);
    for (let i = 0; i < 13; i++) for (let j = -5; j <= 5; j++) {
      const x = i / 13, y = j / 5, c = centerAt(x, p), s = splitAt(x, p);
      const target = c + s * Math.tanh((y - c) * 7);
      const dy = clamp((target - y) * .065 + p.center * .02, -.09, .09);
      arrow(ctx, project(x, y), project(x + .038, y + dy), SAGE, .66);
    }
    for (let i = 0; i < 56; i++) {
      const progress = clamp(fieldState.time * (.86 + .14 * ((i % 7) / 6)));
      const pts = Array.from({length: 40}, (_, k) => project(...schematicPoint(progress * k / 39, i, p)));
      path(ctx, pts, ACCENT, .85, .18);
      ctx.beginPath(); ctx.arc(...pts[pts.length - 1], 2.2, 0, Math.PI * 2); ctx.fillStyle = ACCENT; ctx.fill();
    }
    ctx.fillStyle = '#6c7471'; ctx.font = '10.5px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText(T().canvasSharedOrigin, 12, h - 10); ctx.textAlign = 'right'; ctx.fillText(T().canvasStateSpace, w - 12, h - 10); ctx.textAlign = 'left';
  }

  // Interactive 3-panel paradigm comparison (Unseen perturbation vs Unseen time point)
  const PARADIGM_CONDS = [
    {lift: .02, arch: 0, spread: .24, fork: .34, tag: 'p₀'},
    {lift: .56, arch: .14, spread: .10, fork: .18, tag: 'p₁'},
    {lift: -.56, arch: -.13, spread: .13, fork: .24, tag: 'p₂'}
  ];
  const paradigmCond = 1;
  const paradigmTime = .88;
  let paradigmDirty = true;
  const PARADIGM_SEEDS = Array.from({length: 24}, (_, i) => {
    const r = ((i % 5) + 1) / 5, a = i * 2.39996;
    return {dx: Math.cos(a) * .030 * r, dy: Math.sin(a) * .11 * r, branch: i % 2 ? 1 : -1, jit: Math.sin(i * 5.31) * .05};
  });
  function pMeanY(u, p) { return p.lift * smooth(u) + p.arch * Math.sin(Math.PI * u); }
  function pSpread(u, p) { return p.spread * smooth((u - p.fork) / Math.max(.2, 1 - p.fork)); }
  function pCellPos(u, s, p) {
    const x = mix(.13 + s.dx, .84 + s.dx * .9, u);
    const y = s.dy * (1 - .65 * u) + pMeanY(u, p) + s.branch * pSpread(u, p) + s.jit * u;
    return [x, y];
  }
  function pFieldDir(u, y, p) {
    const du = .01, m0 = pMeanY(u, p), m1 = pMeanY(clamp(u + du), p);
    const sp = pSpread(u, p), sp1 = pSpread(clamp(u + du), p);
    const target = m0 + sp * Math.tanh((y - m0) * 6.5);
    const dm = (m1 - m0) / du + (sp1 - sp) / du * Math.tanh((y - m0) * 5);
    const pull = (target - y) * 1.45;
    return [.058, clamp((dm * .052 + pull * .045), -.095, .095)];
  }
  function drawParadigmBase(canvas) {
    const {ctx, w, h} = surface(canvas);
    const proj = (u, v) => [16 + u * (w - 32), h * .51 - v * h * .38];
    for (let i = 0; i <= 6; i++) path(ctx, [proj(i / 6, -1.04), proj(i / 6, 1.04)], '#e0e6ee', .7);
    for (let j = -2; j <= 2; j++) path(ctx, [proj(0, j / 2), proj(1, j / 2)], '#e0e6ee', .7);
    ctx.fillStyle = '#858d8f'; ctx.font = '10px ui-monospace, SFMono-Regular, monospace'; ctx.textAlign = 'left';
    ctx.fillText(T().pCanvasState, 8, 16);
    return {ctx, w, h, proj};
  }
  function drawStartCloud(ctx, proj) {
    ctx.strokeStyle = BLUE; ctx.lineWidth = 1.05; ctx.globalAlpha = .78;
    PARADIGM_SEEDS.forEach(s => { const q = proj(.13 + s.dx, s.dy); ctx.beginPath(); ctx.arc(...q, 2.3, 0, Math.PI * 2); ctx.stroke(); });
    ctx.globalAlpha = 1;
    const lbl = proj(.13, -.26);
    ctx.fillStyle = BLUE; ctx.font = '10px ui-monospace, SFMono-Regular, monospace'; ctx.textAlign = 'center';
    ctx.fillText(T().pCanvasStart, lbl[0] + 6, Math.min(lbl[1] + 8, ctx.canvas.getBoundingClientRect().height - 20));
    ctx.textAlign = 'left';
  }
  function drawParadigmStatic() {
    const el = $('#paradigm-static'); if (!el) return;
    const {ctx, w, h, proj} = drawParadigmBase(el);
    const sliceU = .71;
    const dimA = proj(.04, 1.04), dimB = proj(.52, -1.04);
    ctx.fillStyle = 'rgba(209,219,234,.25)'; ctx.fillRect(dimA[0], dimA[1], dimB[0] - dimA[0], dimB[1] - dimA[1]);
    ctx.fillStyle = '#737b7d'; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
    const notePt = proj(.28, -.58);
    ctx.fillText(T().pCanvasNoTime1, notePt[0], notePt[1] - 6);
    ctx.fillStyle = '#8c9496';
    ctx.fillText(T().pCanvasNoTime2, notePt[0], notePt[1] + 9);
    const slA = proj(.56, 1.04), slB = proj(.96, -1.04);
    ctx.fillStyle = 'rgba(255,255,255,.84)'; ctx.fillRect(slA[0], slA[1], slB[0] - slA[0], slB[1] - slA[1]);
    ctx.save(); ctx.setLineDash([3, 3]);
    path(ctx, [proj(.56, -1.04), proj(.56, 1.04)], '#c9d3e0', 1);
    path(ctx, [proj(.96, -1.04), proj(.96, 1.04)], '#c9d3e0', 1);
    ctx.restore();
    path(ctx, [proj(sliceU, -.92), proj(sliceU, .92)], '#dce3ee', 1);
    PARADIGM_CONDS.forEach((c, idx) => {
      if (idx === paradigmCond || idx === 0) return;
      const cy = c.lift;
      ctx.fillStyle = '#9aa1a3'; ctx.globalAlpha = .26;
      PARADIGM_SEEDS.forEach(s => { const q = proj(sliceU + s.dx * .85, cy + s.dy * .85); ctx.beginPath(); ctx.arc(...q, 2.1, 0, Math.PI * 2); ctx.fill(); });
      ctx.globalAlpha = 1;
      const gEnd = proj(sliceU + .065, cy);
      ctx.fillStyle = '#858d8f'; ctx.font = '10px ui-monospace, SFMono-Regular, monospace'; ctx.textAlign = 'left';
      ctx.textAlign = 'right'; ctx.fillText(T().pTagsShort[idx], gEnd[0] - 14, gEnd[1] + 3); ctx.textAlign = 'left';
    });
    const ctrlY = .02;
    ctx.strokeStyle = BLUE; ctx.lineWidth = 1.1; ctx.globalAlpha = .86;
    PARADIGM_SEEDS.forEach(s => { const q = proj(sliceU + s.dx * .85, ctrlY + s.dy * .92); ctx.beginPath(); ctx.arc(...q, 2.35, 0, Math.PI * 2); ctx.stroke(); });
    ctx.globalAlpha = 1;
    const ctrlLbl = proj(sliceU + .065, ctrlY);
    ctx.fillStyle = BLUE; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(T().pCanvasCtrl1, ctrlLbl[0] + 4, ctrlLbl[1] - 2);
    ctx.fillText(T().pCanvasCtrl2, ctrlLbl[0] + 4, ctrlLbl[1] + 10);
    const active = PARADIGM_CONDS[paradigmCond];
    const targetY = paradigmCond === 0 ? ctrlY : active.lift;
    if (paradigmCond !== 0) {
      const dir = Math.sign(targetY - ctrlY);
      const start = proj(sliceU - .015, ctrlY + dir * .13);
      const end = proj(sliceU - .015, targetY - dir * .14);
      const ctrl = proj(sliceU - .10, (ctrlY + targetY) / 2);
      ctx.save(); ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(...start); ctx.quadraticCurveTo(...ctrl, ...end);
      ctx.strokeStyle = STATIC_COLOR; ctx.lineWidth = 1.7; ctx.stroke(); ctx.restore();
      const ang = Math.atan2(end[1] - ctrl[1], end[0] - ctrl[0]);
      path(ctx, [[end[0] - 5.5 * Math.cos(ang - .45), end[1] - 5.5 * Math.sin(ang - .45)], end,
        [end[0] - 5.5 * Math.cos(ang + .45), end[1] - 5.5 * Math.sin(ang + .45)]], STATIC_COLOR, 1.7);
      const tt = paradigmTime, mt = 1 - tt;
      const px = mt * mt * start[0] + 2 * mt * tt * ctrl[0] + tt * tt * end[0];
      const py = mt * mt * start[1] + 2 * mt * tt * ctrl[1] + tt * tt * end[1];
      ctx.beginPath(); ctx.arc(px, py, 2.7, 0, Math.PI * 2); ctx.fillStyle = STATIC_COLOR; ctx.globalAlpha = .62; ctx.fill(); ctx.globalAlpha = 1;
      const arcMid = proj(sliceU - .12, (ctrlY + targetY) / 2);
      const mText = T().pCanvasMap(T().pTagsShort[paradigmCond]);
      ctx.font = '600 10.5px system-ui, sans-serif';
      const mw = ctx.measureText(mText).width + 8;
      ctx.fillStyle = 'rgba(246,248,252,.95)'; ctx.fillRect(arcMid[0] - mw - 1, arcMid[1] - 8, mw, 15);
      ctx.fillStyle = '#3b7097'; ctx.textAlign = 'right';
      ctx.fillText(mText, arcMid[0] - 5, arcMid[1] + 3);
    }
    ctx.fillStyle = STATIC_COLOR; ctx.globalAlpha = paradigmCond === 0 ? .58 : .86;
    PARADIGM_SEEDS.forEach(s => { const q = proj(sliceU + s.dx * .85, targetY + s.dy * .85); ctx.beginPath(); ctx.arc(...q, 2.45, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
    const lblY = paradigmCond === 1 ? .84 : paradigmCond === 2 ? -.88 : .30;
    const tlbl = proj(sliceU, lblY);
    const tText = paradigmCond === 0 ? T().pCanvasZeroShift : T().pCanvasPred;
    ctx.font = '10.5px ui-monospace, SFMono-Regular, monospace';
    const tw = ctx.measureText(tText).width + 10, tx = Math.min(tlbl[0], w - tw / 2 - 6), ty = clamp(tlbl[1], 36, h - 18);
    ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.fillRect(tx - tw / 2, ty - 10.5, tw, 14);
    ctx.fillStyle = '#3b7097'; ctx.textAlign = 'center';
    ctx.fillText(tText, tx, ty);
    ctx.fillStyle = '#99a0a2'; ctx.font = '10px ui-monospace, SFMono-Regular, monospace'; ctx.textAlign = 'center';
    ctx.fillText('t₀', proj(.13, -.96)[0], h - 6);
    ctx.fillText('t₁', proj(.42, -.96)[0], h - 6);
    ctx.fillStyle = '#3b7097'; ctx.font = '600 10px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText(T().pCanvasSliceTick, proj(sliceU + .03, -.96)[0], h - 6);
    ctx.textAlign = 'right'; ctx.fillStyle = '#6f7779'; ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(T().pCanvasStaticTop, w - 10, 16); ctx.textAlign = 'left';
  }
  function drawParadigmDynamics() {
    const el = $('#paradigm-dynamics'); if (!el) return;
    const {ctx, w, h, proj} = drawParadigmBase(el);
    const fixed = PARADIGM_CONDS[0];
    for (let i = 0; i < 9; i++) for (let j = -3; j <= 3; j++) {
      const u = .08 + i * .102, y = j * .29, [du, dy] = pFieldDir(u, y, fixed);
      arrow(ctx, proj(u, y), proj(u + du, y + dy), SAGE, .56);
    }
    drawStartCloud(ctx, proj);
    PARADIGM_SEEDS.forEach((s, idx) => {
      const prog = clamp(paradigmTime * (.88 + .12 * ((idx % 6) / 5)));
      const pts = Array.from({length: 22}, (_, k) => proj(...pCellPos(prog * k / 21, s, fixed)));
      path(ctx, pts, DYNAMICS_COLOR, .85, .20);
      const q = pts[pts.length - 1]; ctx.beginPath(); ctx.arc(...q, 2.35, 0, Math.PI * 2); ctx.fillStyle = DYNAMICS_COLOR; ctx.globalAlpha = .82; ctx.fill(); ctx.globalAlpha = 1;
    });
    ctx.fillStyle = '#737b7d'; ctx.font = '10px ui-monospace, SFMono-Regular, monospace'; ctx.textAlign = 'center';
    [['t₀', .13], ['t₁', .48], ['t₂', .84]].forEach(([t, u]) => ctx.fillText(t, proj(u, -.96)[0], h - 6));
    ctx.textAlign = 'right'; ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#5a6265';
    ctx.fillText(paradigmCond === 0 ? T().pCanvasDynFixed : T().pCanvasDynUnchanged(PARADIGM_CONDS[paradigmCond].tag), w - 10, 16);
    ctx.textAlign = 'left';
  }
  function drawParadigmKairos() {
    const el = $('#paradigm-kairos'); if (!el) return;
    const {ctx, w, h} = surface(el);
    // One lane per perturbation: each has its own vector field and its own route from the same starting population.
    const colors = ['#7f8f9f', '#5b9bd5', '#e07d8d'], fills = ['rgba(127,143,159,.10)', 'rgba(91,155,213,.12)', 'rgba(224,125,141,.12)'];
    const top = 26, laneH = (h - top - 16) / 3, scale = laneH / 2 / .86;
    ctx.fillStyle = '#3f5a73'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(T().pCanvasKairosSub, 10, 16);
    PARADIGM_CONDS.forEach((c, i) => {
      const cy = top + laneH * (i + .5);
      const proj = (u, v) => [16 + u * (w - 32), cy - v * scale];
      ctx.save(); ctx.beginPath(); ctx.rect(0, top + laneH * i + 1, w, laneH - 2); ctx.clip();
      ctx.fillStyle = fills[i]; ctx.fillRect(0, top + laneH * i + 1, w, laneH - 2);
      for (let k = 0; k <= 6; k++) path(ctx, [proj(k / 6, -1), proj(k / 6, 1)], 'rgba(255,255,255,.7)', .8);
      for (let ia = 0; ia < 9; ia++) for (let j = -2; j <= 2; j++) {
        const u = .08 + ia * .102, y = j * .34, [du, dy] = pFieldDir(u, y, c);
        arrow(ctx, proj(u, y), proj(u + du, y + dy), colors[i], .62);
      }
      ctx.strokeStyle = BLUE; ctx.lineWidth = 1; ctx.globalAlpha = .8;
      PARADIGM_SEEDS.forEach(sd => { const q = proj(.13 + sd.dx, sd.dy * .8); ctx.beginPath(); ctx.arc(...q, 2, 0, Math.PI * 2); ctx.stroke(); });
      ctx.globalAlpha = 1;
      PARADIGM_SEEDS.forEach((sd, idx) => {
        const prog = clamp(paradigmTime * (.88 + .12 * ((idx % 6) / 5)));
        const pts = Array.from({length: 22}, (_, k) => proj(...(([x, y]) => [x, y])(pCellPos(prog * k / 21, {...sd, dy: sd.dy * .8}, c))));
        path(ctx, pts, colors[i], .9, .32);
        const q = pts[pts.length - 1]; ctx.beginPath(); ctx.arc(...q, 2.3, 0, Math.PI * 2); ctx.fillStyle = colors[i]; ctx.globalAlpha = .92; ctx.fill(); ctx.globalAlpha = 1;
      });
      ctx.restore();
      const label = `${T().pTags[i]} · ${T().pFieldName}`;
      ctx.font = '600 11px system-ui, sans-serif';
      const lw = ctx.measureText(label).width + 12;
      ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.fillRect(6, top + laneH * i + 4, lw, 17);
      ctx.fillStyle = colors[i]; ctx.textAlign = 'left';
      ctx.fillText(label, 12, top + laneH * i + 16);
    });
    ctx.fillStyle = '#737b7d'; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(T().pTickStart, 16 + .13 * (w - 32), h - 4); ctx.fillText(T().pTickLater, 16 + .84 * (w - 32), h - 4);
    ctx.textAlign = 'left';
  }
  // Case interpolation & rendering (existing 6-case demo preserved intact)
  function pchip(times, frames) {
    const n = times.length, count = frames[0].length;
    const slopes = frames.map(f => f.map(p => p.map(() => 0)));
    for (let j = 0; j < count; j++) for (let d = 0; d < 2; d++) {
      const h = times.slice(1).map((v, i) => v - times[i]);
      const delta = h.map((v, i) => (frames[i + 1][j][d] - frames[i][j][d]) / v);
      for (let i = 1; i < n - 1; i++) {
        if (delta[i - 1] * delta[i] > 0) {
          const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
          slopes[i][j][d] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
        }
      }
      const edge = (a, b, da, db) => {
        let m = ((2 * a + b) * da - a * db) / (a + b);
        if (Math.sign(m) !== Math.sign(da)) m = 0;
        else if (Math.sign(da) !== Math.sign(db) && Math.abs(m) > 3 * Math.abs(da)) m = 3 * da;
        return m;
      };
      slopes[0][j][d] = edge(h[0], h[1], delta[0], delta[1]);
      slopes[n - 1][j][d] = edge(h[n - 2], h[n - 3], delta[n - 2], delta[n - 3]);
    }
    return t => {
      t = clamp(t, times[0], times[n - 1]);
      let i = 0; while (i < n - 2 && t > times[i + 1]) i++;
      const h = times[i + 1] - times[i], u = (t - times[i]) / h;
      return hermite(frames[i], frames[i + 1], slopes[i], slopes[i + 1], h, u);
    };
  }
  function hermite(a, b, va, vb, h, u) {
    const u2 = u * u, u3 = u2 * u;
    const wa = 2 * u3 - 3 * u2 + 1, wva = (u3 - 2 * u2 + u) * h;
    const wb = -2 * u3 + 3 * u2, wvb = (u3 - u2) * h;
    return a.map((p, i) => p.map((z, d) => wa * z + wva * va[i][d] + wb * b[i][d] + wvb * vb[i][d]));
  }
  function epiPosition(c, t) {
    const z = clamp((t - 6) * 2, 0, 84), i = Math.min(83, Math.floor(z));
    return hermite(c.xy[i], c.xy[i + 1], c.velocity[i], c.velocity[i + 1], .5, z - i);
  }
  const simulation = D.dyngen.cases.map(c => ({...c,
    interpolateA: pchip(D.dyngen.times, c.prediction), interpolateB: pchip(D.dyngen.times, c.predictionB),
    interpolateTruth: pchip(D.dyngen.times, c.truth)}));
  function boundsFor(c) {
    const pts = [...c.prediction.flat(), ...c.predictionB.flat(), ...c.truth.flat()];
    const lo = [0, 1].map(d => Math.min(...pts.map(p => p[d]))), hi = [0, 1].map(d => Math.max(...pts.map(p => p[d])));
    return [lo.map((v, d) => v - (hi[d] - v) * .08), hi.map((v, d) => v + (v - lo[d]) * .08)];
  }
  simulation.forEach(c => c.bounds = boundsFor(c));
  let dataset = 'dyngen', readout = 'A', caseTime = 48, casePlaying = false, caseDirty = true, cards = [];
  const rememberedTime = {dyngen: 48, epi: 32}, rememberedRef = {dyngen: true, epi: false};
  const getCases = () => dataset === 'dyngen' ? simulation : D.epi.cases;
  const getPositions = (c, t, mode = readout) => dataset === 'dyngen' ? c[mode === 'A' ? 'interpolateA' : 'interpolateB'](t) : epiPosition(c, t);
  const centroid = pts => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
  function caseTitle(c) {
    return dataset === 'dyngen' ? (T().dyngenLabels[c.world] || c.label) : (T().epiLabels[c.id] || c.label);
  }
  function buildCards() {
    $('#case-grid').replaceChildren();
    cards = getCases().map(c => {
      const el = document.createElement('article'); el.className = 'case-card';
      const title = caseTitle(c);
      const kind = dataset === 'dyngen' ? T().caseKindDouble : T().caseKindTime;
      const sub = dataset === 'dyngen' ? T().dyngenSub(c) : T().epiSub(c);
      el.innerHTML = `<div class="case-title"><h3>${title}</h3><span class="case-kind">${kind}</span></div><p class="case-subtitle">${sub}</p><div class="case-stage"><canvas role="img" aria-label="${title}"></canvas></div><div class="case-footer"></div>`;
      $('#case-grid').append(el);
      const item = {c, el, canvas: el.querySelector('canvas'), footer: el.querySelector('.case-footer')};
      item.centroids = Array.from({length: 97}, (_, i) => {
        const t = dataset === 'dyngen' ? i : 6 + i * 42 / 96;
        return [t, centroid(getPositions(c, t))];
      });
      return item;
    });
    caseDirty = true;
  }
  function updateCopy() {
    const sim = dataset === 'dyngen';
    $('#dataset-description').textContent = sim ? T().descDouble : T().descTime;
    $('#readout-badge').textContent = sim ? (readout === 'A' ? T().badgeA : T().badgeB) : T().badgeEpi;
    $('#prediction-legend').textContent = sim ? T().predLegendDouble : T().predLegendTime;
    $('#reference-label').textContent = sim ? T().refLegendDouble : T().refLegendTime;
    $('#readout-control').hidden = !sim;
    $('#case-disclosure').textContent = sim ? (readout === 'A' ? T().discA : T().discB) : T().discEpi;
    $('#case-details-content').innerHTML = sim ? T().detailsDouble : T().detailsTime;
    cards.forEach(({c, footer}) => { footer.textContent = sim ? T().footerDouble(Number(MMD2_BY_CASE[c.id]?.[readout] ?? 0).toFixed(3)) : T().footerTime; });
  }
  function updateTime() {
    $('#case-time').value = caseTime;
    $('#case-clock').innerHTML = `${caseTime.toFixed(1)}<span>${dataset === 'dyngen' ? T().unitDouble : T().unitTime}</span>`;
    if (dataset === 'dyngen') {
      const exact = D.dyngen.times.slice(1).some(t => Math.abs(t - caseTime) < .001);
      $('#time-status').textContent = caseTime < .001 ? T().timeStatusDoubleOrigin : exact ? T().timeStatusDoubleExact(caseTime <= 64) : T().timeStatusDoubleInterp;
    } else {
      $('#time-status').textContent = Math.abs(caseTime - 32) < .001 ? T().timeStatusEpi32 : caseTime >= 24 && caseTime < 32 ? T().timeStatusEpiNative : [6, 24, 48].some(t => Math.abs(caseTime - t) < .001) ? T().timeStatusEpiAnchor : T().timeStatusEpiCalib;
    }
    caseDirty = true;
  }
  function setCaseTime(t) {
    caseTime = clamp(Number(t), dataset === 'dyngen' ? 0 : 6, dataset === 'dyngen' ? 96 : 48);
    rememberedTime[dataset] = caseTime; updateTime();
  }
  function playbackButton() {
    $('#case-play').textContent = casePlaying ? T().casePause : T().casePlay;
    $('#case-play').setAttribute('aria-label', casePlaying ? T().casePauseAria : T().casePlayAria);
  }
  function buildTicks(name) {
    const min = name === 'dyngen' ? 0 : 6, max = name === 'dyngen' ? 96 : 48;
    const ticks = name === 'dyngen' ? D.dyngen.times : [6, 24, 32, 48];
    $('#case-ticks').innerHTML = ticks.map(t => `<span style="left:${(t - min) / (max - min) * 100}%" class="${name === 'epi' && t === 32 ? 'held' : ''}" data-time="${t}">${t}</span>`).join('');
  }
  function buildBands(name) {
    const min = name === 'dyngen' ? 0 : 6, max = name === 'dyngen' ? 96 : 48, pct = t => (t - min) / (max - min) * 100;
    const seg = (a, b, cls) => `<i class="band ${cls}" style="left:${pct(a)}%;width:${pct(b) - pct(a)}%"></i>`;
    if (name === 'epi') {
      $('#case-bands').innerHTML = seg(6, 24, 'band-corr') + seg(24, 32, 'band-native') + seg(32, 48, 'band-corr');
      $('#band-legend').innerHTML = `<span><i class="sw band-native"></i>${T().bandEpiNative}</span><span><i class="sw band-corr"></i>${T().bandEpiOther}</span>`;
    } else {
      $('#case-bands').innerHTML = '<i class="band band-display" style="left:0;width:100%"></i>' + D.dyngen.times.slice(1).map(t => `<i class="band-dot ${t <= 64 ? 'band-interp' : 'band-extrap'}" style="left:${pct(t)}%"></i>`).join('');
      $('#band-legend').innerHTML = `<span><i class="sw band-interp"></i>${T().bandSimInterp}</span><span><i class="sw band-extrap"></i>${T().bandSimExtrap}</span><span><i class="sw band-display"></i>${T().bandSimDisplay}</span>`;
    }
  }
  function selectDataset(name) {
    rememberedTime[dataset] = caseTime; rememberedRef[dataset] = $('#show-reference').checked;
    dataset = name; caseTime = rememberedTime[name]; casePlaying = false; playbackButton();
    $$('.dataset-tabs button').forEach(b => { const on = b.dataset.dataset === name; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
    $('#case-content').setAttribute('aria-labelledby', `tab-${name}`);
    $('#show-reference').checked = rememberedRef[name];
    const min = name === 'dyngen' ? 0 : 6, max = name === 'dyngen' ? 96 : 48;
    $('#case-time').min = min; $('#case-time').max = max;
    buildTicks(name); buildBands(name); buildCards(); updateCopy(); updateTime();
  }
  $$('.dataset-tabs button').forEach((b, i, list) => {
    b.addEventListener('click', () => selectDataset(b.dataset.dataset));
    b.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const j = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : 1 - i; selectDataset(list[j].dataset.dataset); list[j].focus(); } });
  });
  $('#readout').addEventListener('change', e => { readout = e.target.value; buildCards(); updateCopy(); });
  $('#show-reference').addEventListener('change', () => { rememberedRef[dataset] = $('#show-reference').checked; caseDirty = true; });
  $('#case-time').addEventListener('input', e => { casePlaying = false; playbackButton(); setCaseTime(e.target.value); });
  $('#case-play').addEventListener('click', () => {
    if (!casePlaying && caseTime >= (dataset === 'dyngen' ? 96 : 48)) setCaseTime(dataset === 'dyngen' ? 0 : 6);
    casePlaying = !casePlaying; playbackButton();
  });
  function drawCase(card) {
    const {ctx, w, h} = surface(card.canvas), c = card.c, sim = dataset === 'dyngen';
    const b = sim ? c.bounds : D.epi.bounds;
    const margin = {left: 31, right: 12, top: 14, bottom: 30};
    const scale = Math.min((w - margin.left - margin.right) / (b[1][0] - b[0][0]), (h - margin.top - margin.bottom) / (b[1][1] - b[0][1]));
    const mid = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
    const project = p => [(w + margin.left - margin.right) / 2 + (p[0] - mid[0]) * scale, (h + margin.top - margin.bottom) / 2 - (p[1] - mid[1]) * scale];
    const lo = project([b[0][0], b[0][1]]), hi = project([b[1][0], b[1][1]]);
    for (let k = 0; k <= 4; k++) {
      const x = mix(lo[0], hi[0], k / 4), y = mix(lo[1], hi[1], k / 4);
      path(ctx, [[x, hi[1]], [x, lo[1]]], '#efefef', .7);
      path(ctx, [[lo[0], y], [hi[0], y]], '#efefef', .7);
    }
    ctx.font = '10px ui-monospace, SFMono-Regular, monospace'; ctx.fillStyle = '#858d8f';
    ctx.fillText('PC2', 4, 14); ctx.textAlign = 'right'; ctx.fillText('PC1', w - 6, h - 6); ctx.textAlign = 'left';
    if ($('#show-reference').checked) {
      const refs = sim ? [[c.interpolateTruth(caseTime), .46]] : Object.entries(c.observed).map(([t, pts]) => [pts, .36 * smooth(1 - Math.abs(caseTime - Number(t)) / 1.8)]);
      refs.forEach(([points, alpha]) => {
        if (alpha <= 0) return;
        ctx.strokeStyle = BLUE; ctx.lineWidth = .85; ctx.globalAlpha = alpha;
        points.forEach(p => { ctx.beginPath(); ctx.arc(...project(p), sim ? 2.65 : 2.2, 0, Math.PI * 2); ctx.stroke(); }); ctx.globalAlpha = 1;
      });
    }
    { // Centroid trail is always shown; no separate display toggle.
      const trail = card.centroids.filter(([t]) => t <= caseTime).map(([, p]) => project(p));
      trail.push(project(centroid(getPositions(c, caseTime))));
      path(ctx, trail, '#536579', 1.3, .65);
    }
    const pts = getPositions(c, caseTime);
    ctx.fillStyle = ACCENT; ctx.globalAlpha = sim ? .92 : .78;
    pts.forEach(p => { ctx.beginPath(); ctx.arc(...project(p), sim ? 2.65 : 2.35, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1;
    const q = project(centroid(pts)); ctx.beginPath(); ctx.arc(...q, 4, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); ctx.arc(...q, 1.4, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
  }
  function setLang(next) {
    lang = next === 'zh' ? 'zh' : 'en';
    document.documentElement.lang = T().htmlLang;
    document.title = T().pageTitle;
    $$('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    $$('[data-i18n]').forEach(el => { const k = el.dataset.i18n; if (k in T()) el.textContent = T()[k]; });
    $$('[data-i18n-html]').forEach(el => { const k = el.dataset.i18nHtml; if (k in T()) el.innerHTML = T()[k]; });
    $$('[data-i18n-label]').forEach(el => { const k = el.dataset.i18nLabel; if (k in T()) el.setAttribute('aria-label', T()[k]); });
    updateConditionLabels(); heroSync();
    playbackButton(); buildTicks(dataset); buildBands(dataset); buildCards(); updateCopy(); updateTime();
    conceptDirty = true; fieldDirty = true; paradigmDirty = true; caseDirty = true;
    $$('.fig-plate[role=button]').forEach(f => f.setAttribute('aria-label', T().zoomLabel + ': ' + (f.querySelector('img')?.alt || '')));
  }
  $$('[data-lang]').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
  // Lightbox viewer for real manuscript figures
  const lb = $('#fig-lightbox');
  if (lb) {
    $$('[data-lightbox-src]').forEach(btn => btn.addEventListener('click', () => {
      const img = btn.querySelector('img');
      $('#lb-img').src = img ? img.src : btn.dataset.lightboxSrc;
      $('#lb-img').alt = img ? img.alt : '';
      const k = btn.dataset.lightboxKey;
      $('#lb-caption').textContent = (k && k in T()) ? T()[k] : '';
      lb.showModal();
    }));
    $$('.fig-plate:not(.architecture-plate)').forEach(fig => {
      const img = fig.querySelector('img'); if (!img) return;
      fig.setAttribute('role', 'button'); fig.tabIndex = 0; fig.classList.add('zoomable');
      fig.insertAdjacentHTML('beforeend', '<span class="fig-zoom" aria-hidden="true">+</span>');
      const open = () => { $('#lb-img').src = img.src; $('#lb-img').alt = img.alt; $('#lb-caption').textContent = img.alt; lb.showModal(); };
      fig.addEventListener('click', open);
      fig.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    $('#lb-close').addEventListener('click', () => lb.close());
    lb.addEventListener('click', e => { if (e.target === lb) lb.close(); });
  }

  // Reading navigation reflects the chapter crossing the top reading line.
  const chapterLinks = $$('[data-nav]');
  const chapters = $$('[data-chapter]');
  let navPending = false;
  function updateReadingNav() {
    navPending = false;
    const readingLine = matchMedia('(max-width: 900px)').matches ? 155 : 160;
    let active = chapters[0].dataset.chapter;
    for (const chapter of chapters) {
      if (chapter.getBoundingClientRect().top <= readingLine) active = chapter.dataset.chapter;
    }
    if (scrollY + innerHeight >= document.documentElement.scrollHeight - 2) active = chapters.at(-1).dataset.chapter;
    for (const link of chapterLinks) {
      if (link.dataset.nav === active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
    const selected = $('.chapter-nav [aria-current]');
    const nav = $('.chapter-nav');
    if (selected && matchMedia('(max-width: 900px)').matches) {
      const left = selected.offsetLeft - nav.offsetLeft;
      if (left < nav.scrollLeft || left + selected.offsetWidth > nav.scrollLeft + nav.clientWidth) {
        nav.scrollLeft = left - 12;
      }
    }
  }
  function scheduleReadingNav() {
    if (!navPending) { navPending = true; requestAnimationFrame(updateReadingNav); }
  }
  addEventListener('scroll', scheduleReadingNav, {passive: true});
  addEventListener('resize', scheduleReadingNav, {passive: true});
  addEventListener('hashchange', scheduleReadingNav);
  updateReadingNav();
  selectDataset('dyngen');
  if ('IntersectionObserver' in window) {
    const stepObserver = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) setFieldStep(Number(e.target.dataset.step)); }), {rootMargin: '-50% 0px -35% 0px'});
    $$('.scrolly .step').forEach(el => stepObserver.observe(el));
  }
  updateFieldCaption();
  heroSync();
  setLang(new URLSearchParams(location.search).get('lang') === 'zh' ? 'zh' : 'en');

  const resize = new ResizeObserver(() => { conceptDirty = true; fieldDirty = true; paradigmDirty = true; caseDirty = true; });
  resize.observe($('#landscape')); resize.observe($('#vector-field')); resize.observe($('#case-grid'));
  if ($('#paradigm-static')) { resize.observe($('#paradigm-static')); resize.observe($('#paradigm-dynamics')); resize.observe($('#paradigm-kairos')); }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, .1); last = now;
    if (morphStart >= 0) {
      const u = smooth((now - morphStart) / 500);
      Object.keys(currentParams).forEach(k => currentParams[k] = mix(morphFrom[k], PARAMS[condition][k], u));
      if (u >= 1) morphStart = -1; conceptDirty = true;
    }

    heroAdvance(dt);
    if (fieldState.start >= 0) {
      const u = smooth((now - fieldState.start) / 500);
      Object.keys(fieldState.params).forEach(k => fieldState.params[k] = mix(fieldState.from[k], PARAMS[fieldState.cond][k], u));
      if (u >= 1) fieldState.start = -1; fieldDirty = true;
    }
    if (Math.abs(fieldState.target - fieldState.time) > .002) {
      fieldState.time += (fieldState.target - fieldState.time) * Math.min(1, dt * 3.2); fieldDirty = true;
    } else if (fieldState.time !== fieldState.target) { fieldState.time = fieldState.target; fieldDirty = true; }
    if (conceptDirty) { drawLandscape(); conceptDirty = false; }
    if (fieldDirty) { drawField(); fieldDirty = false; }
    if (paradigmDirty) { drawParadigmStatic(); drawParadigmDynamics(); drawParadigmKairos(); paradigmDirty = false; }
    if (casePlaying && !document.hidden) {
      const speed = dataset === 'dyngen' ? 96 / 22 : 42 / 28;
      setCaseTime(caseTime + dt * speed);
      if (caseTime >= (dataset === 'dyngen' ? 96 : 48)) { casePlaying = false; playbackButton(); }
    }
    if (caseDirty) { cards.forEach(drawCase); caseDirty = false; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.KAIROS_PREVIEW = {
    setLang, setDataset: selectDataset, setCaseTime,
    setCondition: selectCondition,
    setConceptTime,
    positions: (i, t, mode = readout) => getPositions(getCases()[i], t, mode),
    schematic: (n, x, seed = 0) => schematicPoint(x, seed, PARAMS[n]),
    height: (n, x, y) => heightAt(x, y, PARAMS[n]),
    terrainOffset: (n, x, y) => terrainOffset(x, y, PARAMS[n]),
    route: (n, t) => nativeRoute(t, PARAMS[n]),
    state: () => ({lang, dataset, readout, caseTime, condition, paradigmCond, casePlaying})
  };
})();
