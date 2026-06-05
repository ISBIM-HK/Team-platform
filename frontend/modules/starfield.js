'use strict';

import { $ } from './core.js';

export function initStarfield() {
  const canvas = $('#starfield'); if (!canvas) return;
  if (canvas.dataset.init) return; canvas.dataset.init = '1';
  const ctx = canvas.getContext('2d');
  let w, h, stars;
  const mouse = { x: -9999, y: -9999 };
  const MOUSE_R = 200, LINK_R = 150;

  function resize() {
    w = canvas.width = canvas.parentElement.clientWidth;
    h = canvas.height = canvas.parentElement.clientHeight;
  }

  function create() {
    const count = Math.floor((w * h) / 6000);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r: Math.random() < 0.12 ? Math.random() * 2 + 1.8 : Math.random() * 1.2 + 0.4,
      base: Math.random() * 0.45 + 0.15,
      phase: Math.random() * Math.PI * 2,
      freq: Math.random() * 0.015 + 0.004,
    }));
  }

  let t = 0;
  function draw() {
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < stars.length; i++) {
      const a = stars[i];
      a.x += a.vx; a.y += a.vy;
      if (a.x < 0) a.x += w; if (a.x > w) a.x -= w;
      if (a.y < 0) a.y += h; if (a.y > h) a.y -= h;

      const flicker = a.base + (1 - a.base) * (0.5 + 0.5 * Math.sin(t * a.freq + a.phase));
      const mdx = a.x - mouse.x, mdy = a.y - mouse.y;
      const md = Math.sqrt(mdx * mdx + mdy * mdy);
      const boost = md < MOUSE_R ? (1 - md / MOUSE_R) * 0.5 : 0;
      const alpha = Math.min(flicker + boost, 1);

      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r * (1 + boost * 0.6), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200, 220, 240, ' + alpha + ')';
      ctx.fill();

      if (md < MOUSE_R) {
        ctx.beginPath();
        ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(a.x, a.y);
        ctx.strokeStyle = 'rgba(60, 200, 235, ' + (1 - md / MOUSE_R) * 0.75 + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      if (md < MOUSE_R * 1.3) {
        for (let j = i + 1; j < stars.length; j++) {
          const b = stars[j];
          const bd = Math.sqrt((b.x - mouse.x) ** 2 + (b.y - mouse.y) ** 2);
          if (bd > MOUSE_R * 1.3) continue;
          const dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < LINK_R) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = 'rgba(60, 200, 235, ' + (1 - d / LINK_R) * 0.55 + ')';
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }
    }

    t++;
    requestAnimationFrame(draw);
  }

  const wrap = canvas.parentElement;
  wrap.addEventListener('mousemove', (e) => {
    const r = wrap.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  });
  wrap.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });
  window.addEventListener('resize', () => { resize(); create(); });
  resize(); create(); draw();
}
