import React, { useEffect, useRef, useState } from 'react';

/**
 * FluidBackground  →  "Cozy Morning Sun" paper backdrop
 * ────────────────────────────────────────────────────────────
 * Replaces the old WebGL ink-wash background. Renders (fixed, z-index bottom,
 * pointer-events none):
 *   1. a warm cream paper base with a soft morning-sun glow
 *   2. a faint hand-made paper grain (SVG fractal noise, very low opacity)
 *   3. sparse "magic white line" squigglevision decorations — a little sun,
 *      stars, sparkles, a dashed frame corner, sprouting grass — all rendered
 *      with a boiling-line (Squigglevision) filter that jitters at ~5 fps.
 *
 * Squigglevision mechanism:
 *   Three feTurbulence + feDisplacementMap filters with different seeds live in
 *   a hidden <defs>. A JS interval (190ms ≈ 5.3 fps, within the 4–6 fps spec)
 *   cycles a `frame` state 0→1→2→0; every decorative <g> references
 *   `url(#boil-{frame})`, so the whole scene "boils" like stop-motion.
 *
 * Degradation:
 *   prefers-reduced-motion → no interval (frame frozen at 0), decorations sit
 *   perfectly still. Everything else (glow, grain) is static anyway.
 */

const PREFERS_REDUCED =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Faint paper grain as an inline SVG data-uri (fractal noise, clamped very light).
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

// palette
const WHITE = 'rgba(255,255,255,0.92)';
const CINN = '#C9A98F';
const LEMON = '#FBE790';
const MINT = '#A8D8B9';
const SKY = '#A5DEE4';

// A positioned squiggle sprite. `filter` is the current boiling filter id.
function Sprite({ style, filter, children }) {
  return (
    <svg
      viewBox="0 0 100 100"
      style={{ position: 'absolute', overflow: 'visible', ...style }}
      aria-hidden="true"
    >
      <g filter={filter} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

export default function FluidBackground() {
  const [frame, setFrame] = useState(0);
  const timer = useRef(null);

  useEffect(() => {
    if (PREFERS_REDUCED) return; // reduced motion → no boiling
    timer.current = setInterval(() => {
      setFrame((f) => (f + 1) % 3);
    }, 190); // ≈ 5.3 fps
    const onVis = () => {
      if (document.hidden) {
        clearInterval(timer.current);
      } else {
        clearInterval(timer.current);
        timer.current = setInterval(() => setFrame((f) => (f + 1) % 3), 190);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(timer.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const boil = `url(#boil-${frame})`;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        pointerEvents: 'none',
        overflow: 'hidden',
        // warm cream + soft morning-sun glow (top-right lemon, low mint wash bottom-left)
        background:
          'radial-gradient(85% 65% at 84% 8%, rgba(251,231,144,0.42) 0%, rgba(251,231,144,0) 58%),' +
          'radial-gradient(75% 70% at 6% 96%, rgba(168,216,185,0.24) 0%, rgba(168,216,185,0) 55%),' +
          'radial-gradient(120% 120% at 50% 30%, #FFFDF7 0%, #FDFBF7 45%, #F7F4EB 100%)',
      }}
    >
      {/* paper grain */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: GRAIN,
          backgroundSize: '180px 180px',
          opacity: 0.05,
          mixBlendMode: 'multiply',
        }}
      />

      {/* Boiling-line filter defs (three seeds → stop-motion jitter) */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          {[0, 1, 2].map((s) => (
            <filter key={s} id={`boil-${s}`} x="-30%" y="-30%" width="160%" height="160%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.018"
                numOctaves="2"
                seed={s * 7 + 3}
                result="n"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="n"
                scale={PREFERS_REDUCED ? 0 : 4.5}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          ))}
        </defs>
      </svg>

      {/* ── sparse decorations, tucked near the edges to protect whitespace ── */}

      {/* morning sun, top-right */}
      <Sprite filter={boil} style={{ top: '3%', right: '5%', width: 96, height: 96 }}>
        <circle cx="50" cy="50" r="17" stroke={LEMON} strokeWidth="3.2" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * Math.PI * 2;
          const x1 = 50 + Math.cos(a) * 25, y1 = 50 + Math.sin(a) * 25;
          const x2 = 50 + Math.cos(a) * 33, y2 = 50 + Math.sin(a) * 33;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={LEMON} strokeWidth="3" />;
        })}
      </Sprite>

      {/* little four-point sparkle, upper-left */}
      <Sprite filter={boil} style={{ top: '11%', left: '7%', width: 54, height: 54 }}>
        <path d="M50 20 C52 42 58 48 80 50 C58 52 52 58 50 80 C48 58 42 52 20 50 C42 48 48 42 50 20 Z" stroke={WHITE} strokeWidth="3" />
      </Sprite>

      {/* tiny star, mid-right */}
      <Sprite filter={boil} style={{ top: '38%', right: '8%', width: 40, height: 40 }}>
        <path d="M50 22 L58 44 L80 46 L62 60 L68 82 L50 68 L32 82 L38 60 L20 46 L42 44 Z" stroke={SKY} strokeWidth="3" />
      </Sprite>

      {/* dashed frame corner, mid-left */}
      <Sprite filter={boil} style={{ top: '46%', left: '4%', width: 70, height: 70 }}>
        <path d="M78 14 L14 14 L14 78" stroke={CINN} strokeWidth="2.4" strokeDasharray="6 7" />
      </Sprite>

      {/* sprouting grass, bottom-left */}
      <Sprite filter={boil} style={{ bottom: '7%', left: '9%', width: 66, height: 66 }}>
        <path d="M50 84 C50 60 50 52 50 44" stroke={MINT} strokeWidth="3" />
        <path d="M50 58 C36 56 30 44 32 34 C44 34 52 44 50 58 Z" stroke={MINT} strokeWidth="2.8" />
        <path d="M50 64 C64 62 70 50 68 40 C56 40 48 50 50 64 Z" stroke={MINT} strokeWidth="2.8" />
      </Sprite>

      {/* cute little arrow, bottom-right */}
      <Sprite filter={boil} style={{ bottom: '12%', right: '9%', width: 74, height: 60 }}>
        <path d="M16 60 C36 38 52 30 82 26" stroke={CINN} strokeWidth="2.6" />
        <path d="M68 20 L84 25 L74 39" stroke={CINN} strokeWidth="2.6" />
      </Sprite>

      {/* twinkle dot cluster, upper-center */}
      <Sprite filter={boil} style={{ top: '6%', left: '40%', width: 46, height: 46 }}>
        <path d="M50 30 L52 48 L70 50 L52 52 L50 70 L48 52 L30 50 L48 48 Z" stroke={WHITE} strokeWidth="2.6" />
      </Sprite>
    </div>
  );
}
