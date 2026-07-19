import React, { useRef, useImperativeHandle, forwardRef, useEffect } from 'react';

/**
 * CheckinCelebration
 * ────────────────────────────────────────────────────────────
 * A fixed, full-screen <canvas> overlay (pointer-events none) that bursts
 * hand-drawn crayon particles — little stars, hearts and spinning white
 * sparkles — from a point when you check in. They fling outward, then gravity
 * pulls them into a graceful fall while they fade. One burst lasts ~1.2s and
 * the canvas is cleared when it settles.
 *
 * Usage:
 *   const celebRef = useRef(null);
 *   <CheckinCelebration ref={celebRef} />
 *   celebRef.current.fire(x, y);   // x,y = viewport coords of the burst origin
 *
 * Respects prefers-reduced-motion: fire() becomes a no-op.
 */

const REDUCED =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const COLORS = ['#FBE790', '#A8D8B9', '#A5DEE4', '#F6B7A6', '#FFFFFF', '#E8C94F'];

function drawStar(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const ia = a + Math.PI / 5;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(ia) * r * 0.45, Math.sin(ia) * r * 0.45);
  }
  ctx.closePath();
}

function drawHeart(ctx, r) {
  const s = r / 12;
  ctx.beginPath();
  ctx.moveTo(0, 4 * s);
  ctx.bezierCurveTo(-8 * s, -6 * s, -14 * s, 4 * s, 0, 12 * s);
  ctx.bezierCurveTo(14 * s, 4 * s, 8 * s, -6 * s, 0, 4 * s);
  ctx.closePath();
}

function drawSparkle(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, -r); ctx.lineTo(r * 0.16, -r * 0.16);
  ctx.lineTo(r, 0); ctx.lineTo(r * 0.16, r * 0.16);
  ctx.lineTo(0, r); ctx.lineTo(-r * 0.16, r * 0.16);
  ctx.lineTo(-r, 0); ctx.lineTo(-r * 0.16, -r * 0.16);
  ctx.closePath();
}

const CheckinCelebration = forwardRef(function CheckinCelebration(_props, ref) {
  const canvasRef = useRef(null);
  const particles = useRef([]);
  const raf = useRef(null);

  // keep the backing store sized to the viewport (device-pixel aware)
  useEffect(() => {
    const canvas = canvasRef.current;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  const tick = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const now = performance.now();
    let alive = false;

    for (const p of particles.current) {
      const t = (now - p.born) / p.life;
      if (t >= 1) continue;
      alive = true;
      p.vy += 0.28;              // gravity
      p.vx *= 0.99;              // slight air drag
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      const fade = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45; // hold, then fade out

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, fade);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = 'rgba(138,107,88,0.35)'; // soft cinnamon crayon outline
      ctx.lineWidth = 1.4;
      ctx.lineJoin = 'round';
      if (p.shape === 'star') drawStar(ctx, p.r);
      else if (p.shape === 'heart') drawHeart(ctx, p.r);
      else drawSparkle(ctx, p.r);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (alive) {
      raf.current = requestAnimationFrame(tick);
    } else {
      particles.current = [];
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  };

  useImperativeHandle(ref, () => ({
    fire(x, y) {
      if (REDUCED) return;
      const cx = x ?? window.innerWidth / 2;
      const cy = y ?? window.innerHeight / 2;
      const n = 24 + Math.floor(Math.random() * 6); // 24–29 particles
      const shapes = ['star', 'heart', 'sparkle'];
      const born = performance.now();
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 6;
        particles.current.push({
          x: cx, y: cy,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed - (3 + Math.random() * 3), // bias upward
          r: 6 + Math.random() * 7,
          rot: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 0.3,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          shape: shapes[Math.floor(Math.random() * shapes.length)],
          born,
          life: 1050 + Math.random() * 250, // ~1.2s
        });
      }
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(tick);
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 900,
      }}
    />
  );
});

export default CheckinCelebration;
