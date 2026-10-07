/* ═══════════════════════════════════════════════════════════════════
   TOURS EMOTIONS · app.js
   Vanilla JS, sin dependencias. Todo es mejora progresiva: si algo falla,
   el contenido sigue visible gracias al HTML estático.

   ÍNDICE
   0. Configuración (aquí se pone el WhatsApp)
   1. Utilidades
   2. Primitivas estilo Remotion: interpolate, spring, composition
   3. Estado de scroll con suavizado y bucle único de animación
   4. Loader con progreso real
   5. Hero: intro por frames, slideshow, cáusticas WebGL, partículas
   6. Navegación, menú móvil y barra de progreso
   7. Reveal, contadores, marquee y declaración palabra por palabra
   8. Tours: pan horizontal fijado
   9. Secuencia "Un día en el mar" (frame = scroll)
   10. Noche, ruta SVG y parallax
   11. Galería y lightbox
   12. Formulario y enlaces de WhatsApp
   13. Microinteracciones: tilt, imán, spotlight, ripple
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  /* ─────────────────────────── 0. CONFIGURACIÓN ─────────────────────────── */
  const CONFIG = {
    brand: 'Tours Emotions',
    /* NÚMERO DE WHATSAPP del negocio, solo dígitos con lada de país.
       México: '52' + 10 dígitos. Ejemplo: '523221234567'.
       Mientras esté vacío, los botones abren WhatsApp con el mensaje listo
       y la persona elige el contacto. */
    whatsapp: '',
  };

  /* ─────────────────────────── 1. UTILIDADES ─────────────────────────── */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const mqPan = window.matchMedia('(min-width: 1024px)');
  const safe = (fn) => { try { return fn(); } catch (err) { console.warn('[Tours Emotions]', err); } };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function watch(el, cb, margin = '120px') {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { cb(true); return; }
    new IntersectionObserver((es) => cb(es[0].isIntersecting), { rootMargin: margin }).observe(el);
  }

  /* ───────────────── 2. PRIMITIVAS ESTILO REMOTION ─────────────────
     Remotion es una librería de React para renderizar video. Aquí replicamos
     su modelo mental en vanilla JS: todo se calcula a partir de un número de
     "frame". El frame puede venir del reloj (intro del hero) o del scroll
     (secuencia "Un día en el mar"). */
  const Easing = {
    linear: (t) => t,
    out: (t) => 1 - Math.pow(1 - t, 3),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  };

  /* interpolate(frame, [f0, f1, ...], [v0, v1, ...]) con extrapolación fija */
  function interpolate(x, input, output, opts = {}) {
    const ease = opts.easing || Easing.linear;
    const n = input.length;
    if (x <= input[0]) return output[0];
    if (x >= input[n - 1]) return output[n - 1];
    for (let i = 0; i < n - 1; i++) {
      if (x <= input[i + 1]) {
        const t = (x - input[i]) / (input[i + 1] - input[i]);
        return output[i] + (output[i + 1] - output[i]) * ease(t);
      }
    }
    return output[n - 1];
  }

  /* spring(): oscilador amortiguado en forma cerrada, igual que Remotion */
  function spring({ frame, fps = 60, damping = 12, stiffness = 100, mass = 1 }) {
    const t = Math.max(0, frame) / fps;
    const w0 = Math.sqrt(stiffness / mass);
    const z = damping / (2 * Math.sqrt(stiffness * mass));
    if (z < 1) {
      const wd = w0 * Math.sqrt(1 - z * z);
      return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
    }
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  }

  /* composition(): reproduce render(frame) con el reloj */
  function composition({ fps = 60, durationInFrames, render, onEnd }) {
    let start = null;
    let raf = 0;
    const loop = (now) => {
      if (start === null) start = now;
      const frame = Math.min(durationInFrames, ((now - start) / 1000) * fps);
      render(frame);
      if (frame < durationInFrames) raf = requestAnimationFrame(loop);
      else if (onEnd) onEnd();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }

  function scramble(el, to, dur = 700) {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ0123456789#%&';
    const t0 = performance.now();
    (function f(now) {
      const p = clamp((now - t0) / dur);
      let s = '';
      for (let i = 0; i < to.length; i++) {
        s += i < to.length * p ? to[i] : to[i] === ' ' ? ' ' : chars[(Math.random() * chars.length) | 0];
      }
      el.textContent = s;
      if (p < 1) requestAnimationFrame(f); else el.textContent = to;
    })(t0);
  }

  /* ─────────────── 3. SCROLL SUAVIZADO Y BUCLE ÚNICO ───────────────
     No hay listener de "scroll": un solo requestAnimationFrame lee scrollY.
     S.sy es el scroll "con inercia": los efectos lo siguen con un poco de
     retraso, lo que da la sensación de movimiento lento y cinematográfico
     sin secuestrar la rueda del mouse. */
  const S = {
    y: window.scrollY, sy: window.scrollY, vel: 0, velS: 0,
    vh: window.innerHeight, vw: root.clientWidth, docH: 1,
  };
  const tickers = [];
  const measures = [];
  const onTick = (fn) => tickers.push(fn);
  const onMeasure = (fn) => measures.push(fn);

  function measureAll() {
    S.vh = window.innerHeight;
    S.vw = root.clientWidth;
    S.docH = Math.max(1, root.scrollHeight - S.vh);
    measures.forEach((fn) => safe(fn));
  }

  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000) || 0.016;
    lastT = now;
    const y = window.scrollY;
    S.vel = (y - S.y) / Math.max(dt, 0.001);
    S.velS = lerp(S.velS, S.vel, 0.1);
    S.y = y;
    S.sy = reduced ? y : lerp(S.sy, y, 1 - Math.pow(0.003, dt));
    if (Math.abs(S.sy - y) < 0.1) S.sy = y;
    for (let i = 0; i < tickers.length; i++) tickers[i](now, dt, S);
    requestAnimationFrame(frame);
  }

  /* Helper de secciones fijadas (sticky): progreso 0..1 dentro del pin */
  function makePin(el) {
    const P = { el, top: 0, len: 1, p: 0, near: false };
    onMeasure(() => {
      const r = el.getBoundingClientRect();
      P.top = r.top + window.scrollY;
      P.len = Math.max(1, el.offsetHeight - S.vh);
    });
    P.update = () => {
      P.p = clamp((S.sy - P.top) / P.len);
      P.near = S.sy > P.top - S.vh * 1.1 && S.sy < P.top + P.len + S.vh * 1.1;
      return P.near;
    };
    return P;
  }

  /* Progreso de una sección normal al cruzar el viewport (0 al entrar, 1 al salir) */
  function makeFlow(el) {
    const F = { el, top: 0, h: 1, q: 0, near: false };
    onMeasure(() => {
      const r = el.getBoundingClientRect();
      F.top = r.top + window.scrollY;
      F.h = r.height;
    });
    F.update = () => {
      F.q = clamp((S.sy + S.vh - F.top) / (F.h + S.vh));
      F.near = S.sy + S.vh > F.top - 100 && S.sy < F.top + F.h + 100;
      return F.near;
    };
    return F;
  }

  /* ─────────────────────────── 4. LOADER ─────────────────────────── */
  function initLoader() {
    const loader = $('#loader');
    if (!loader) return Promise.resolve();

    const pctEl = $('#loaderPct');
    const ring = $('#ringProg');
    const waves = $('#orbWaves');
    const label = $('#loaderLabel');
    const C = 2 * Math.PI * 88;

    /* Progreso real: primeras imágenes del hero + fuentes */
    const critical = ['img/tours/atardecer-1200.webp', 'img/tours/los-arcos-1200.webp'];
    let done = 0;
    const total = critical.length + 1;
    critical.forEach((src) => {
      const im = new Image();
      im.onload = im.onerror = () => { done++; };
      im.src = src;
    });
    const fontsReady = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, wait(1800)]) : Promise.resolve();
    fontsReady.then(() => { done++; });

    const minMs = reduced ? 450 : 2400;
    const maxMs = 4500;
    const t0 = performance.now();
    let shown = 0;

    return new Promise((resolve) => {
      function paint() {
        pctEl.textContent = Math.round(shown * 100);
        ring.style.strokeDashoffset = String(C * (1 - shown));
        waves.style.transform = 'translateY(' + lerp(150, 12, shown) + 'px)';
      }
      function finish() {
        shown = 1;
        paint();
        if (!reduced) scramble(label, 'Listo para zarpar', 600);
        else label.textContent = 'Listo para zarpar';
        wait(reduced ? 150 : 750).then(() => {
          loader.classList.add('is-out');
          root.classList.remove('is-loading');
          wait(reduced ? 100 : 350).then(resolve);
          wait(1300).then(() => loader.classList.add('is-gone'));
        });
      }
      let prev = t0;
      function step(now) {
        const el = now - t0;
        const dt = Math.min(0.1, (now - prev) / 1000);
        prev = now;
        const goal = Math.min(done / total, clamp(el / minMs));
        /* Suavizado dependiente del tiempo (no de los fps) y tope duro: nunca se queda atascado */
        shown += ((el > maxMs ? 1 : goal) - shown) * (1 - Math.exp(-dt * 7));
        paint();
        if (el > maxMs + 600 || (shown > 0.995 && el >= minMs)) finish();
        else requestAnimationFrame(step);
      }
      if (!reduced) scramble(label, 'Preparando tu zarpe', 800);
      requestAnimationFrame(step);
    });
  }

  /* ─────────────────────────── 5. HERO ─────────────────────────── */
  function prepHeroIntro() {
    if (reduced) return;
    $$('.hero-title .w').forEach((w) => { w.style.opacity = '0'; w.style.transform = 'translate3d(0,115%,0)'; });
    $$('.hero-in').forEach((el) => { el.style.opacity = '0'; });
  }

  /* Intro del hero: una "composición" de 150 frames a 60 fps */
  function playHeroIntro() {
    if (reduced) return;
    const words = $$('.hero-title .w');
    const ins = $$('.hero-in');
    composition({
      fps: 60,
      durationInFrames: 150,
      render(f) {
        words.forEach((w, i) => {
          const s = spring({ frame: f - 4 - i * 5, damping: 15, stiffness: 120 });
          w.style.opacity = String(clamp(s * 4));
          w.style.transform = 'translate3d(0,' + Math.max(0, 1 - s) * 115 + '%,0) rotate(' + (1 - s) * 5 + 'deg)';
        });
        ins.forEach((el, i) => {
          const s = spring({ frame: f - 28 - i * 8, damping: 18, stiffness: 90 });
          el.style.opacity = String(clamp(s * 2));
          el.style.transform = 'translate3d(0,' + (1 - s) * 30 + 'px,0)';
        });
      },
      onEnd() {
        words.forEach((w) => { w.style.transform = ''; w.style.opacity = ''; });
        ins.forEach((el) => { el.style.transform = ''; el.style.opacity = ''; });
      },
    });
  }

  function initHeroSlides() {
    const slides = $$('.hero-slide');
    const bars = $$('#heroBars button');
    if (slides.length < 2) return { start() {} };
    let i = 0;
    let timer = 0;
    const show = (n) => {
      if (n === i) return;
      const prev = slides[i];
      prev.classList.remove('is-active');
      prev.classList.add('is-leaving');
      setTimeout(() => prev.classList.remove('is-leaving'), 2000);
      bars[i].classList.remove('is-active');
      i = n;
      slides[i].classList.add('is-active');
      void bars[i].offsetWidth;
      bars[i].classList.add('is-active');
    };
    const next = () => show((i + 1) % slides.length);
    const start = () => { clearInterval(timer); if (!reduced) timer = setInterval(next, 6500); };
    bars.forEach((b, n) => b.addEventListener('click', () => { show(n); start(); }));
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearInterval(timer); else start(); });
    return { start };
  }

  /* Cáusticas de agua: shader WebGL sobre la foto. Se renderiza a media resolución. */
  function initCaustics(canvas) {
    if (!canvas || reduced) { if (canvas) canvas.remove(); return null; }
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
    if (!gl) { canvas.remove(); return null; }

    const vsSrc = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
    const fsSrc = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse;
      const float TAU = 6.28318530718;
      float caustic(vec2 uv, float t) {
        vec2 p = mod(uv * TAU, TAU) - 250.0;
        vec2 i = p;
        float c = 1.0;
        float inten = 0.005;
        for (int n = 0; n < 4; n++) {
          float tt = t * (1.0 - (3.5 / float(n + 1)));
          i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
          c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
        }
        c /= 4.0;
        c = 1.17 - pow(c, 1.4);
        return pow(abs(c), 8.0);
      }
      void main() {
        vec2 uv = gl_FragCoord.xy / uRes;
        uv.x *= uRes.x / uRes.y;
        float t = uTime * 0.35 + 23.0;
        float c = caustic(uv * 0.9, t);
        float d = distance(gl_FragCoord.xy / uRes, uMouse);
        c += smoothstep(0.28, 0.0, d) * 0.35 * caustic(uv * 1.5 + 0.3, t * 1.3);
        vec3 col = vec3(0.36, 0.92, 0.96) * c;
        gl_FragColor = vec4(col, 1.0);
      }`;

    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = sh(gl.VERTEX_SHADER, vsSrc);
    const fs = sh(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) { canvas.remove(); return null; }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return null; }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uMouse = gl.getUniformLocation(prog, 'uMouse');

    const api = { visible: false };
    const mouse = { x: 0.7, y: 0.3, tx: 0.7, ty: 0.3 };
    window.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.tx = clamp((e.clientX - r.left) / r.width);
      mouse.ty = clamp(1 - (e.clientY - r.top) / r.height);
    }, { passive: true });

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const scale = Math.min(0.5, 960 / Math.max(1, r.width));
      canvas.width = Math.max(2, Math.round(r.width * scale));
      canvas.height = Math.max(2, Math.round(r.height * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    resize();
    new ResizeObserver(resize).observe(canvas);

    let n = 0;
    api.render = (now) => {
      if (++n % 2) return; /* ~30 fps, suficiente para agua y mucho más barato */
      mouse.x = lerp(mouse.x, mouse.tx, 0.06);
      mouse.y = lerp(mouse.y, mouse.ty, 0.06);
      gl.uniform1f(uTime, now / 1000);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    watch(canvas, (v) => { api.visible = v; });
    return api;
  }

  /* Partículas 2D: burbujas (hero, cierre) y brasas (noche) */
  class Particles {
    constructor(canvas, opts) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.o = Object.assign({ kind: 'bubble', density: 0.00006, min: 12, max: 60, speed: [14, 40], size: [2, 8], color: '255,255,255', pointer: false }, opts);
      this.items = [];
      this.visible = false;
      this.t = 0;
      this.mouse = { x: -999, y: -999 };
      this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if (this.o.kind === 'ember') this.sprite = Particles.sprite(this.o.color);
      this.resize();
      new ResizeObserver(() => this.resize()).observe(canvas);
      if (this.o.pointer && finePointer) {
        window.addEventListener('pointermove', (e) => {
          const r = this.c.getBoundingClientRect();
          this.mouse.x = e.clientX - r.left;
          this.mouse.y = e.clientY - r.top;
        }, { passive: true });
      }
      watch(canvas, (v) => { this.visible = v; });
    }
    static sprite(rgb) {
      const s = document.createElement('canvas');
      s.width = s.height = 64;
      const g = s.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(' + rgb + ',1)');
      gr.addColorStop(0.25, 'rgba(' + rgb + ',.55)');
      gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      return s;
    }
    resize() {
      const r = this.c.getBoundingClientRect();
      this.w = Math.max(1, r.width);
      this.h = Math.max(1, r.height);
      this.c.width = Math.round(this.w * this.dpr);
      this.c.height = Math.round(this.h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const n = clamp(Math.round(this.w * this.h * this.o.density), this.o.min, this.o.max);
      while (this.items.length < n) this.items.push(this.spawn(true));
      this.items.length = Math.min(this.items.length, n);
    }
    spawn(initial) {
      const o = this.o;
      const r = Math.random();
      return {
        x: Math.random() * this.w,
        y: initial ? Math.random() * this.h : this.h + 20 + Math.random() * 60,
        s: o.size[0] + (o.size[1] - o.size[0]) * r * r,
        v: o.speed[0] + (o.speed[1] - o.speed[0]) * Math.random(),
        ph: Math.random() * 6.283,
        sw: 8 + Math.random() * 26,
        f: 0.5 + Math.random() * 1.4,
        a: 0.35 + Math.random() * 0.55,
      };
    }
    step(dt) {
      if (!this.visible) return;
      const { ctx, w, h, o } = this;
      this.t += dt;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = o.kind === 'ember' ? 'lighter' : 'source-over';
      for (const p of this.items) {
        p.y -= p.v * dt;
        p.x += Math.sin(this.t * p.f + p.ph) * p.sw * dt;
        if (o.pointer) {
          const dx = p.x - this.mouse.x;
          const dy = p.y - this.mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 12100) {
            const d = Math.sqrt(d2) || 1;
            const k = (110 - d) / 110;
            p.x += (dx / d) * k * 170 * dt;
            p.y += (dy / d) * k * 170 * dt;
          }
        }
        if (p.y < -30 || p.x < -40 || p.x > w + 40) Object.assign(p, this.spawn(false));
        if (o.kind === 'ember') {
          ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(this.t * 3 * p.f + p.ph));
          const d = p.s * 5;
          ctx.drawImage(this.sprite, p.x - d / 2, p.y - d / 2, d, d);
        } else {
          ctx.globalAlpha = p.a;
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(' + o.color + ',.8)';
          ctx.fillStyle = 'rgba(' + o.color + ',.07)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.s, 0, 6.283);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.7)';
          ctx.beginPath();
          ctx.arc(p.x - p.s * 0.35, p.y - p.s * 0.35, p.s * 0.22, 0, 6.283);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* ─────────────────────── 6. NAVEGACIÓN ─────────────────────── */
  function initNav() {
    const nav = $('#nav');
    const bar = $('#scrollBar');
    const burger = $('#burger');
    const menu = $('#menu');
    let stuck = false;

    onTick(() => {
      const s = S.y > 24;
      if (s !== stuck) { stuck = s; nav.classList.toggle('is-stuck', s); }
      bar.style.transform = 'scaleX(' + clamp(S.y / S.docH) + ')';
    });

    const setMenu = (open) => {
      menu.classList.toggle('is-open', open);
      menu.setAttribute('aria-hidden', String(!open));
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      root.classList.toggle('is-locked', open);
      root.classList.toggle('menu-open', open);
    };
    burger.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
    $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('is-open')) setMenu(false); });
    mqPan.addEventListener('change', () => setMenu(false));

    /* Enlace activo según la sección en pantalla */
    const links = $$('.nav-links a');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => {
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id));
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      /* Se observan todas las secciones: las que no tienen enlace apagan el resaltado */
      $$('main > section[id]').forEach((s) => io.observe(s));
    }
  }

  /* ─────────────── 7. REVEAL, CONTADORES, MARQUEE, DECLARACIÓN ─────────────── */
  function initReveal() {
    const els = $$('[data-reveal]');
    if (reduced || !('IntersectionObserver' in window)) return;
    root.classList.add('reveal-ready');
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    els.forEach((el) => io.observe(el));
  }

  function initCounters() {
    const els = $$('[data-count]');
    if (reduced || !('IntersectionObserver' in window)) return;
    const fmt = (el, v) => (el.dataset.prefix || '') + Math.round(v).toLocaleString('es-MX') + (el.dataset.suffix || '');
    els.forEach((el) => { el.dataset.final = fmt(el, +el.dataset.count); el.textContent = fmt(el, 0); });
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const el = e.target;
        const target = +el.dataset.count;
        const t0 = performance.now();
        (function f(now) {
          const p = clamp((now - t0) / 1600);
          el.textContent = fmt(el, target * Easing.outExpo(p));
          if (p < 1) requestAnimationFrame(f); else el.textContent = el.dataset.final;
        })(t0);
      });
    }, { threshold: 0.6 });
    els.forEach((el) => io.observe(el));
  }

  function initMarquee() {
    const track = $('#marquee');
    if (!track || reduced) return;
    const n = track.children.length;
    track.innerHTML += track.innerHTML;
    let period = 1;
    let x = 0;
    let near = true;
    onMeasure(() => { period = track.children[n].offsetLeft - track.children[0].offsetLeft || 1; });
    watch(track.parentElement, (v) => { near = v; });
    onTick((now, dt) => {
      if (!near) return;
      x -= (60 + Math.abs(S.velS) * 0.3) * dt;
      if (x <= -period) x += period;
      track.style.transform = 'translate3d(' + x + 'px,0,0)';
    });
  }

  /* Declaración: cada palabra se enciende según el scroll */
  function initStatement() {
    const text = $('#statementText');
    const pinEl = $('#statementPin');
    if (!text || !pinEl || reduced) return;
    const words = [];
    (function wrap(node, hl) {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(part); return; }
            const s = document.createElement('span');
            s.className = 'sw is-dim' + (hl ? ' is-hl' : '');
            s.textContent = part;
            frag.append(s);
            words.push(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) {
          wrap(n, hl || n.tagName === 'B');
        }
      });
    })(text, false);

    const P = makePin(pinEl);
    let lit = 0;
    onTick(() => {
      if (!P.update()) return;
      const target = Math.round(clamp(P.p * 1.18) * words.length);
      if (target === lit) return;
      const a = Math.min(lit, target);
      const b = Math.max(lit, target);
      for (let i = a; i < b; i++) {
        words[i].classList.toggle('is-dim', i >= target);
        words[i].classList.toggle('is-lit', i < target);
      }
      lit = target;
    });
  }

  /* ─────────────────────── 8. TOURS: PAN HORIZONTAL ─────────────────────── */
  const pan = { active: false, top: 0, dist: 0 };

  function initTours() {
    const pin = $('#toursPin');
    const track = $('#toursTrack');
    const prog = $('#toursProgress');
    if (!pin || !track) return;
    const panels = $$('.panel', track);
    let cache = [];

    onMeasure(() => {
      const on = mqPan.matches && !reduced;
      pin.classList.toggle('is-pan', on);
      pan.active = on;
      if (!on) {
        pin.style.height = '';
        track.style.transform = '';
        panels.forEach((p) => { p.style.opacity = ''; p.style.transform = ''; });
        return;
      }
      pan.dist = Math.max(0, track.offsetWidth - root.clientWidth);
      pin.style.height = pan.dist + window.innerHeight + 'px';
      pan.top = pin.getBoundingClientRect().top + window.scrollY;
      cache = panels.map((p) => ({ el: p, left: p.offsetLeft, w: p.offsetWidth }));
    });

    onTick(() => {
      if (!pan.active) return;
      const near = S.sy > pan.top - S.vh && S.sy < pan.top + pan.dist + S.vh * 1.2;
      if (!near) return;
      const p = clamp((S.sy - pan.top) / Math.max(1, pan.dist));
      const x = -pan.dist * p;
      track.style.transform = 'translate3d(' + x + 'px,0,0)';
      if (prog) prog.style.transform = 'scaleX(' + p + ')';
      /* El panel centrado gana jerarquía: más opaco y a escala completa */
      for (const c of cache) {
        const center = c.left + x + c.w / 2;
        const k = 1 - clamp(Math.abs(center - S.vw / 2) / (S.vw * 0.62));
        c.el.style.opacity = String(0.5 + 0.5 * k);
        c.el.style.transform = 'scale(' + (0.94 + 0.06 * k) + ')';
      }
    });

    /* Ir a un tour concreto desde el hero o con el teclado */
    const gotoPanel = (panel, behavior) => {
      if (pan.active) {
        const gutter = parseFloat(getComputedStyle(track).paddingLeft) || 0;
        const left = panel.offsetLeft - gutter;
        window.scrollTo({ top: pan.top + clamp(left, 0, pan.dist), behavior });
      } else {
        panel.scrollIntoView({ behavior, block: 'start' });
      }
    };
    $$('[data-goto-tour]').forEach((a) => a.addEventListener('click', (e) => {
      const panel = $('#tour-' + a.dataset.gotoTour);
      if (!panel) return;
      e.preventDefault();
      gotoPanel(panel, 'smooth');
    }));
    track.addEventListener('focusin', (e) => {
      if (!pan.active) return;
      const panel = e.target.closest('.panel');
      if (panel) gotoPanel(panel, 'auto');
    });
  }

  /* ─────────────── 9. SECUENCIA "UN DÍA EN EL MAR" ───────────────
     Una composición de 300 frames (5 escenas x 60). El frame actual es
     progreso_de_scroll * 300, como si el scroll fuera la barra de tiempo. */
  function initSequence() {
    const pinEl = $('#seqPin');
    if (!pinEl || reduced) return;
    const imgs = $$('.seq-img', pinEl);
    const scenes = $$('#seqScenes .scene', pinEl);
    const fill = $('#seqFill');
    const labels = $$('.seq-timeline span', pinEl);
    const word = $('#seqWord');
    const N = scenes.length;
    const SCENE = 60;
    const DURATION = N * SCENE;
    let wordW = 0;
    let curLabel = -1;
    const P = makePin(pinEl);
    onMeasure(() => { wordW = word.offsetWidth; });

    /* Las 5 fotos se piden con antelación para que nunca aparezcan tarde al llegar a la secuencia */
    watch(pinEl, (v) => {
      if (!v) return;
      imgs.forEach((im) => { im.loading = 'eager'; });
    }, '2500px');

    function render(f) {
      scenes.forEach((el, i) => {
        const from = i * SCENE;
        const o = interpolate(f, [from, from + 10, from + SCENE - 10, from + SCENE], [i === 0 ? 1 : 0, 1, 1, i === N - 1 ? 1 : 0]);
        const yIn = interpolate(f, [from, from + 14], [i === 0 ? 0 : 46, 0], { easing: Easing.out });
        const yOut = interpolate(f, [from + SCENE - 12, from + SCENE], [0, i === N - 1 ? 0 : -46], { easing: Easing.inOut });
        el.style.opacity = String(o);
        el.style.transform = 'translate3d(0,calc(-50% + ' + (yIn + yOut) + 'px),0)';
      });
      imgs.forEach((im, i) => {
        const from = i * SCENE;
        im.style.opacity = String(i === 0 ? 1 : interpolate(f, [from - 20, from], [0, 1]));
        const sc = interpolate(f, [from - 20, from + SCENE + 40], [1.22, 1.04], { easing: Easing.out });
        im.style.transform = 'scale(' + sc + ')';
      });
      fill.style.transform = 'scaleX(' + f / DURATION + ')';
      const idx = Math.min(N - 1, Math.floor(f / SCENE));
      if (idx !== curLabel) {
        curLabel = idx;
        labels.forEach((l, i) => l.classList.toggle('is-on', i <= idx));
      }
      word.style.transform = 'translate3d(' + -(f / DURATION) * Math.max(0, wordW - S.vw * 0.45) + 'px,0,0)';
    }

    render(0);
    onTick(() => { if (P.update()) render(P.p * DURATION); });
  }

  /* ─────────────── 10. NOCHE, RUTA SVG Y PARALLAX ─────────────── */
  function initNight() {
    const sec = $('#noche');
    const word = $('#nightWord');
    if (!sec || !word || reduced) return;
    const F = makeFlow(sec);
    let wordW = 0;
    onMeasure(() => { wordW = word.offsetWidth; });
    onTick(() => {
      if (!F.update()) return;
      word.style.transform = 'translate3d(' + lerp(S.vw * 0.04, -(wordW - S.vw * 0.7), F.q) + 'px,0,0)';
    });
  }

  function initParallax() {
    if (reduced) return;
    const items = $$('[data-parallax]').map((el) => ({ el, k: parseFloat(el.dataset.parallax) || 0.1, top: 0, h: 1 }));
    onMeasure(() => {
      items.forEach((it) => {
        const r = it.el.parentElement.getBoundingClientRect();
        it.top = r.top + window.scrollY;
        it.h = r.height;
      });
    });
    onTick(() => {
      for (const it of items) {
        const c = it.top + it.h / 2 - (S.sy + S.vh / 2);
        if (Math.abs(c) > S.vh * 1.3) continue;
        it.el.style.transform = 'translate3d(0,' + c * it.k + 'px,0)';
      }
    });
    /* El texto del hero se desvanece al salir */
    const copy = $('[data-parallax-out]');
    if (copy) {
      onTick(() => {
        if (S.sy > S.vh * 1.1) return;
        const p = clamp(S.sy / (S.vh * 0.85));
        copy.style.transform = 'translate3d(0,' + p * 70 + 'px,0)';
        copy.style.opacity = String(1 - p * 0.9);
      });
    }
  }

  function initRoute() {
    const sec = $('#ruta');
    const svg = $('#routeSvg');
    const line = $('#routeLine');
    const stopsG = $('#routeStops');
    const boat = $('#routeBoat');
    const items = $$('#routeList li');
    if (!sec || !svg || !line) return;
    const NS = 'http://www.w3.org/2000/svg';
    const L = line.getTotalLength();
    line.style.strokeDasharray = String(L);
    line.style.strokeDashoffset = String(reduced ? 0 : L);

    const stops = items.map((li, i) => {
      const at = parseFloat(li.dataset.at);
      const pt = line.getPointAtLength(L * at);
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'stop');
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', pt.x); c.setAttribute('cy', pt.y); c.setAttribute('r', 7);
      const t = document.createElementNS(NS, 'text');
      const right = i % 2 === 0;
      t.setAttribute('x', pt.x + (right ? 16 : -16));
      t.setAttribute('y', pt.y + 5);
      t.setAttribute('text-anchor', right ? 'start' : 'end');
      t.textContent = $('b', li).textContent;
      g.append(c, t);
      stopsG.append(g);
      return { g, li, at };
    });

    const place = (q) => {
      const pt = line.getPointAtLength(L * q);
      boat.setAttribute('transform', 'translate(' + pt.x + ' ' + pt.y + ')');
    };

    if (reduced) {
      stops.forEach((s) => { s.g.classList.add('is-on'); s.li.classList.add('is-on'); });
      place(1);
      return;
    }

    const F = makeFlow(sec);
    const mapFig = $('.route-map', sec);
    let cur = -1;
    place(0);
    onTick(() => {
      if (!F.update()) return;
      /* En desktop el mapa queda fijo mientras pasa la lista; en móvil sigue al propio mapa */
      const q = clamp(((S.sy + S.vh * 0.62) - F.top) / (F.h * 0.82));
      const e = Easing.inOut(q);
      line.style.strokeDashoffset = String(L * (1 - e));
      place(e);
      const n = stops.filter((s) => e >= s.at - 0.004).length;
      if (n !== cur) {
        cur = n;
        stops.forEach((s, i) => { s.g.classList.toggle('is-on', i < n); s.li.classList.toggle('is-on', i < n); });
      }
    });
    void mapFig;
  }

  /* ─────────────────────── 11. GALERÍA Y LIGHTBOX ─────────────────────── */
  function initGallery() {
    const items = $$('.g-item');
    const dlg = $('#lightbox');
    if (!items.length || !dlg || typeof dlg.showModal !== 'function') return;
    const img = $('#lbImg');
    let idx = 0;
    const show = (i) => {
      idx = (i + items.length) % items.length;
      const src = items[idx];
      img.src = src.dataset.full;
      img.alt = $('img', src).alt;
    };
    items.forEach((b, i) => b.addEventListener('click', () => { show(i); dlg.showModal(); root.classList.add('is-locked'); }));
    $('#lbPrev').addEventListener('click', () => show(idx - 1));
    $('#lbNext').addEventListener('click', () => show(idx + 1));
    $('#lbClose').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => root.classList.remove('is-locked'));
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') show(idx + 1);
      if (e.key === 'ArrowLeft') show(idx - 1);
    });
  }

  /* ───────────────── 12. WHATSAPP Y FORMULARIO ───────────────── */
  function waURL(text) {
    const n = String(CONFIG.whatsapp).replace(/\D/g, '');
    return 'https://wa.me/' + (n.length >= 10 ? n : '') + '?text=' + encodeURIComponent(text);
  }

  function openWA(url) {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function initWhatsApp() {
    if (String(CONFIG.whatsapp).replace(/\D/g, '').length < 10) {
      console.info('[Tours Emotions] Falta el número de WhatsApp: edita CONFIG.whatsapp en app.js. Mientras tanto los botones abren WhatsApp para elegir contacto.');
    }
    $$('[data-wa]').forEach((a) => { a.href = waURL(a.dataset.waMsg || ''); });

    /* Globo del botón flotante: aparece una vez, unos segundos */
    const box = $('#waFloat');
    if (box) {
      wait(6000).then(() => {
        box.classList.add('show-bubble');
        wait(7000).then(() => box.classList.remove('show-bubble'));
      });
    }
  }

  function initForm() {
    const form = $('#bookForm');
    if (!form) return;
    const radios = $$('input[name="tour"]', form);
    const nameEl = $('#f-name');
    const dateEl = $('#f-date');
    const msgEl = $('#f-msg');
    const paxOut = $('#paxOut');
    const sumTour = $('#sumTour');
    const sumDate = $('#sumDate');
    const sumPax = $('#sumPax');
    const sumTotal = $('#sumTotal');
    const btn = $('#bookBtn');
    const note = $('#bookNote');
    const noteDefault = note.textContent;
    let pax = 2;
    const MAX_PAX = 30;

    const t = new Date();
    t.setMinutes(t.getMinutes() - t.getTimezoneOffset());
    dateEl.min = t.toISOString().slice(0, 10);

    const money = (n) => '$' + n.toLocaleString('es-MX');
    const selected = () => radios.find((r) => r.checked);
    const dateLong = () => {
      if (!dateEl.value) return '';
      const [y, m, d] = dateEl.value.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    };

    function update() {
      const r = selected();
      const price = r && r.dataset.price ? +r.dataset.price : 0;
      sumTour.textContent = r ? r.dataset.name : 'Elige uno arriba';
      sumDate.textContent = dateLong() || 'Por definir';
      sumPax.textContent = String(pax);
      paxOut.textContent = String(pax);
      sumTotal.textContent = price ? money(price * pax) + ' MXN' : r ? 'A confirmar' : '$0 MXN';
    }

    const setErr = (id, field, msg) => {
      const e = $('#err-' + id);
      e.textContent = msg || '';
      if (field) field.classList.toggle('is-invalid', !!msg);
      if (field) field.setAttribute('aria-invalid', msg ? 'true' : 'false');
    };

    function validate() {
      let first = null;
      const bad = (id, field, msg, focusEl) => { setErr(id, field, msg); if (!first) first = focusEl || field; };
      if (!selected()) bad('tour', null, 'Elige el tour que te interesa.', radios[0]); else setErr('tour', null, '');
      if (nameEl.value.trim().length < 3) bad('name', nameEl, 'Escribe tu nombre para saludarte por WhatsApp.'); else setErr('name', nameEl, '');
      if (!dateEl.value) bad('date', dateEl, 'Elige la fecha en la que quieres ir.');
      else if (dateEl.value < dateEl.min) bad('date', dateEl, 'Elige una fecha de hoy en adelante.');
      else setErr('date', dateEl, '');
      return first;
    }

    function setTour(value) {
      const r = radios.find((x) => x.value === value);
      if (!r) return;
      r.checked = true;
      setErr('tour', null, '');
      update();
    }

    radios.forEach((r) => r.addEventListener('change', () => { setErr('tour', null, ''); update(); }));
    dateEl.addEventListener('input', () => { setErr('date', dateEl, ''); update(); });
    nameEl.addEventListener('input', () => setErr('name', nameEl, ''));
    $('#paxMinus').addEventListener('click', () => { pax = Math.max(1, pax - 1); update(); });
    $('#paxPlus').addEventListener('click', () => { pax = Math.min(MAX_PAX, pax + 1); update(); });
    $$('[data-pick]').forEach((a) => a.addEventListener('click', () => setTour(a.dataset.pick)));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const first = validate();
      if (first) { first.focus({ preventScroll: false }); return; }
      const r = selected();
      const price = r.dataset.price ? +r.dataset.price : 0;
      const lines = [
        'Hola, soy ' + nameEl.value.trim() + '.',
        'Quiero reservar: ' + r.dataset.name + '.',
        'Fecha: ' + dateLong() + '.',
        'Personas: ' + pax + '.',
        price ? 'Total estimado: ' + money(price * pax) + ' MXN.' : '',
        msgEl.value.trim() ? 'Comentarios: ' + msgEl.value.trim().slice(0, 300) : '',
        '¿Tienen disponibilidad?',
      ].filter(Boolean);
      const url = waURL(lines.join('\n'));

      btn.classList.add('is-loading');
      $('.btn-label', btn).textContent = 'Abriendo WhatsApp';
      openWA(url);
      wait(1100).then(() => {
        btn.classList.remove('is-loading');
        $('.btn-label', btn).textContent = 'Quiero mi lugar por WhatsApp';
        note.classList.add('is-ok');
        note.textContent = 'Listo, abrimos WhatsApp con tu solicitud. ';
        const again = document.createElement('a');
        again.href = url; again.target = '_blank'; again.rel = 'noopener';
        again.textContent = 'Si no se abrió, toca aquí.';
        again.style.textDecoration = 'underline';
        note.append(again);
        wait(12000).then(() => { note.classList.remove('is-ok'); note.textContent = noteDefault; });
      });
    });

    update();
  }

  /* ───────────────── 13. MICROINTERACCIONES ───────────────── */
  function initMicro() {
    /* Spotlight: sigue al cursor sobre tarjetas */
    $$('[data-spot]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', e.clientX - r.left + 'px');
        el.style.setProperty('--my', e.clientY - r.top + 'px');
      }, { passive: true });
    });

    /* Ripple en todos los botones */
    document.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.btn');
      if (!b || reduced) return;
      const r = b.getBoundingClientRect();
      const d = Math.max(r.width, r.height);
      const s = document.createElement('span');
      s.className = 'ripple';
      s.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (e.clientX - r.left - d / 2) + 'px;top:' + (e.clientY - r.top - d / 2) + 'px';
      b.append(s);
      s.addEventListener('animationend', () => s.remove());
    });

    if (!finePointer || reduced) return;

    /* Tilt 3D en las tarjetas del hero */
    $$('[data-tilt]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = 'perspective(700px) rotateX(' + -y * 9 + 'deg) rotateY(' + x * 12 + 'deg)';
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });

    /* Botones magnéticos */
    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = 'translate3d(' + dx * 0.22 + 'px,' + dy * 0.32 + 'px,0)';
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ─────────────────────────── ARRANQUE ─────────────────────────── */
  function boot() {
    safe(initWhatsApp);
    safe(initNav);
    safe(prepHeroIntro);
    safe(initReveal);
    safe(initCounters);
    safe(initTours);       /* primero: cambia la altura de la página */
    safe(initStatement);
    safe(initMarquee);
    safe(initSequence);
    safe(initNight);
    safe(initParallax);
    safe(initRoute);
    safe(initGallery);
    safe(initForm);
    safe(initMicro);

    /* Canvas: cáusticas, partículas */
    const caustics = safe(() => initCaustics($('#caustics')));
    const fx = [];
    const heroC = $('#heroParticles');
    if (heroC && !reduced) fx.push(new Particles(heroC, { kind: 'bubble', color: '190,245,240', density: 0.00007, min: 14, max: 70, size: [1.5, 7], speed: [14, 46], pointer: true }));
    const embC = $('#embers');
    if (embC && !reduced) fx.push(new Particles(embC, { kind: 'ember', color: '255,150,70', density: 0.00005, min: 16, max: 60, size: [1.4, 5], speed: [10, 40] }));
    const finC = $('#finalBubbles');
    if (finC && !reduced) fx.push(new Particles(finC, { kind: 'bubble', color: '200,245,255', density: 0.00004, min: 10, max: 40, size: [2, 9], speed: [18, 52] }));

    onTick((now, dt) => {
      if (caustics && caustics.visible) caustics.render(now);
      for (const p of fx) p.step(dt);
    });

    const slides = initHeroSlides();

    /* Mediciones: ahora, al cargar todo, y cuando cambie el tamaño de la página */
    measureAll();
    window.addEventListener('load', measureAll);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureAll);
    let rt = 0;
    const remeasure = () => { cancelAnimationFrame(rt); rt = requestAnimationFrame(measureAll); };
    window.addEventListener('resize', remeasure);
    if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(document.body);
    mqPan.addEventListener('change', remeasure);

    S.y = S.sy = window.scrollY;
    requestAnimationFrame(frame);

    initLoader().then(() => {
      measureAll();
      playHeroIntro();
      slides.start();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
