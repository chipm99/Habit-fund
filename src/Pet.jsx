import React, { useEffect, useId, useState } from 'react';

/**
 * Pet.jsx — 手繪電子寵物（蛋 → 孵化 → 成長 → 進化）
 * ────────────────────────────────────────────────────────────
 * 美術原則：
 *   · 全部內嵌 SVG 手繪，無外部圖檔、無 emoji 主體、無像素風
 *   · 沿用 FluidBackground 的 boiling-line squigglevision：三組
 *     feTurbulence + feDisplacementMap 濾鏡以 ~190ms 輪播，線條像停格動畫微微抖動
 *   · 線條蠟筆質感、圓潤收尾、左右不對稱（眼睛不同高、輪廓有機起伏）
 *   · 顏色由 pet.hue 生成，低飽和柔和，在 cream #FDFBF7 上好看
 *   · 動態只有「極緩慢呼吸」與「偶爾眨眼」，禁止快速彈跳
 *
 * 對外：
 *   <Pet pet={petRow} days={n} size={px} />      // 未孵化自動改畫蛋
 *   <Egg hue={} pattern={} daysLeft={} size={} />
 *   以及成長／進化／禮物的純資料函式（見下方 export）
 */

const REDUCED =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── 共用 boiling 幀（一個 interval 驅動所有寵物，避免每隻各開一顆 timer）──
let boilFrame = 0;
let boilTimer = null;
const boilSubs = new Set();
function subscribeBoil(fn) {
  boilSubs.add(fn);
  if (!boilTimer && !REDUCED) {
    boilTimer = setInterval(() => {
      boilFrame = (boilFrame + 1) % 3;
      boilSubs.forEach(f => f(boilFrame));
    }, 190); // ≈5.3fps，與 FluidBackground 同步
  }
  return () => {
    boilSubs.delete(fn);
    if (boilSubs.size === 0 && boilTimer) { clearInterval(boilTimer); boilTimer = null; }
  };
}
function useBoil() {
  const [f, setF] = useState(boilFrame);
  useEffect(() => subscribeBoil(setF), []);
  return REDUCED ? 0 : f;
}

// ── 一次性注入呼吸／眨眼 keyframes ──
const STYLE_ID = 'pet-anim-styles';
function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
@keyframes petBreathe{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
@keyframes petBlink{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(0.1)}}
@keyframes petFloat{0%,100%{transform:translateY(0px)}50%{transform:translateY(-2.5px)}}
@keyframes eggWobble{0%,100%{transform:rotate(-1.4deg) scale(1)}50%{transform:rotate(1.4deg) scale(1.025)}}
.pet-breathe{transform-box:fill-box;transform-origin:50% 92%;animation:petBreathe 3.6s ease-in-out infinite}
.pet-float{transform-box:fill-box;transform-origin:50% 50%;animation:petFloat 4.2s ease-in-out infinite}
.pet-eyes{transform-box:fill-box;transform-origin:50% 50%;animation:petBlink 5.8s ease-in-out infinite}
.egg-wobble{transform-box:fill-box;transform-origin:50% 92%;animation:eggWobble 4s ease-in-out infinite}
.pet-slow{animation-duration:7.5s}
@media (prefers-reduced-motion: reduce){.pet-breathe,.pet-float,.pet-eyes,.egg-wobble{animation:none}}
`;
  document.head.appendChild(el);
}

// ══════════════════════════════════════════════════════════
//  資料：色盤 / 花紋 / 四階種族 / 成長 / 禮物 / 進化
// ══════════════════════════════════════════════════════════

export const PATTERNS = ['dots', 'stripes', 'speckle', 'swirl', 'plain'];

export function petPalette(hue) {
  const h = ((hue % 360) + 360) % 360;
  return {
    main: `hsl(${h},55%,78%)`,
    stroke: `hsl(${h},45%,62%)`,
    belly: `hsl(${(h + 30) % 360},60%,88%)`,
    deep: `hsl(${h},40%,52%)`,
    dark: `hsl(${h},26%,40%)`, // 角、甲殼等需要「硬」質感的深色
  };
}

export const TIER_ORDER = ['egg', 'insect', 'cute', 'rare', 'spirit'];
export const TIER_LABEL = { egg: '蛋', insect: '稀有昆蟲', cute: '可愛動物', rare: '保育動物', spirit: '精靈' };

// 四階種族表（每階 4 種，剪影各自可辨識）
export const SPECIES = {
  insect: { firefly: '螢火蟲', rhinobeetle: '獨角仙', swallowtail: '寬尾鳳蝶', damselfly: '豆娘' },
  cute: { cat: '貓', dog: '狗', seal: '海豹', rabbit: '兔子' },
  rare: { blackbear: '臺灣黑熊', leopardcat: '石虎', pangolin: '穿山甲', otter: '水獺' },
  spirit: { sprite_moss: '苔球精靈', sprite_cloud: '雲朵精靈', sprite_flame: '火種精靈', sprite_star: '星塵精靈' },
};

export const speciesLabel = (tier, key) => (SPECIES[tier] && SPECIES[tier][key]) || TIER_LABEL[tier] || '小生物';

// 依 hue 穩定挑選（同一隻寵物結果永遠一樣，不用亂數）
export function pickSpecies(tier, hue) {
  const keys = Object.keys(SPECIES[tier] || {});
  if (!keys.length) return null;
  return keys[Math.abs(Math.round(hue)) % keys.length];
}

// 成長
export const HATCH_DAYS = 14;
export const STAGE_LABEL = ['幼', '中', '大', '成熟'];
const STAGE_SCALE = [0.76, 0.88, 1.0, 1.1];
export const stageIndex = (days) => (days >= 120 ? 3 : days >= 60 ? 2 : days >= 30 ? 1 : 0);

// 禮物（價格從全域寵物幣扣，與捐款基金完全分離）
export const GIFTS = [
  { key: 'berry', emoji: '🫐', name: '野莓', rarity: 1, cost: 30 },
  { key: 'honey', emoji: '🍯', name: '蜂蜜罐', rarity: 2, cost: 80 },
  { key: 'crystal', emoji: '💎', name: '晶石', rarity: 3, cost: 200 },
  { key: 'starfruit', emoji: '⭐', name: '星星果', rarity: 4, cost: 450 },
  { key: 'moonpetal', emoji: '🌙', name: '月光花', rarity: 5, cost: 900 },
];

// 難度倍率：挑戰型習慣的成長速度約 2 倍
export const DIFF_MULT = { easy: 1.0, medium: 1.5, hard: 2.0 };
export const diffMult = (d) => DIFF_MULT[d] ?? 1.5;

// xp = floor(days × 難度倍率) + xp_base（前一隻留下的 30%）+ Σ(禮物稀有度×5)
export const petXp = (days, giftLog = [], mult = 1, xpBase = 0) =>
  Math.floor(days * mult) + (Number(xpBase) || 0) +
  giftLog.reduce((s, g) => s + (Number(g.rarity) || 0) * 5, 0);

// 各階門檻
export const TIER_REQ = {
  cute: { xp: 60, gifts: 3, avg: 0 },
  rare: { xp: 150, gifts: 8, avg: 2.0 },
  spirit: { xp: 300, gifts: 15, avg: 3.0 },
};

// 進化判定：只升不降；精靈種需要 difficulty !== 'easy'（輕鬆習慣最高到保育類）
export function evolveTier(current, xp, giftLog = [], difficulty = 'medium') {
  const n = giftLog.length;
  const avg = n ? giftLog.reduce((s, g) => s + (Number(g.rarity) || 0), 0) / n : 0;
  let t = 'insect';
  if (xp >= TIER_REQ.cute.xp && n >= TIER_REQ.cute.gifts) t = 'cute';
  if (xp >= TIER_REQ.rare.xp && n >= TIER_REQ.rare.gifts && avg >= TIER_REQ.rare.avg) t = 'rare';
  if (xp >= TIER_REQ.spirit.xp && n >= TIER_REQ.spirit.gifts && avg >= TIER_REQ.spirit.avg && difficulty !== 'easy') t = 'spirit';
  const cur = current && current !== 'egg' ? current : 'insect';
  return TIER_ORDER.indexOf(t) > TIER_ORDER.indexOf(cur) ? t : cur;
}

// 下一階還差什麼（給寵物卡的進度提示）
export function nextTierGoal(current, xp, giftLog = [], difficulty = 'medium') {
  const order = ['insect', 'cute', 'rare', 'spirit'];
  const idx = order.indexOf(current === 'egg' || !current ? 'insect' : current);
  if (idx < 0 || idx >= order.length - 1) return null;          // 已是精靈
  const next = order[idx + 1];
  if (next === 'spirit' && difficulty === 'easy') return { capped: true };
  const req = TIER_REQ[next];
  const n = giftLog.length;
  const avg = n ? giftLog.reduce((s, g) => s + (Number(g.rarity) || 0), 0) / n : 0;
  return {
    tier: next,
    label: TIER_LABEL[next],
    needXp: Math.max(0, req.xp - xp),
    needGifts: Math.max(0, req.gifts - n),
    needAvg: avg >= req.avg ? 0 : req.avg,
    avg,
  };
}

// ── 飢餓與死亡 ──────────────────────────────────────────
// gap = 今天 − 最後打卡日（從未打卡則自 created_at 起算）
// 每日習慣：0-2 健康 / 3-4 餓 / 5 虛弱 / ≥6 死亡；每週習慣門檻 ×2
export function petHealth(gap, weekly = false) {
  const m = weekly ? 2 : 1;
  if (gap >= 6 * m) return 'dead';
  if (gap >= 5 * m) return 'weak';
  if (gap >= 3 * m) return 'hungry';
  return 'ok';
}
export const HEALTH_LABEL = { ok: '健康', hungry: '肚子餓了', weak: '虛弱', dead: '已離開' };

/**
 * ISO-8601 週字串 'YYYY-Www'。
 * 以「該週星期四所在的年份」為年，因此跨年（12/29~1/03）自動落到正確的 ISO 年份與週數，
 * 例：2026-12-31(四) → 2026-W53；2027-01-01(五) → 2026-W53。
 */
export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;          // 週一=1 … 週日=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);  // 移到該週的星期四
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// 下週一的日期字串（給「本週已餵食」提示用）
export function nextMondayLabel(from = new Date()) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((8 - (d.getDay() || 7)) % 7 || 7));
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 由 habit.id 穩定推出 hue / pattern（不用亂數，重整後同一隻）
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) {
    h ^= String(s).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export const hueFromId = (id) => hashStr(id) % 360;
export const patternFromId = (id) => PATTERNS[(hashStr(id) >>> 9) % PATTERNS.length];

// ══════════════════════════════════════════════════════════
//  美術：花紋、濾鏡、五官
// ══════════════════════════════════════════════════════════

const SPECKLES = [
  [34, 44], [58, 40], [46, 58], [66, 56], [30, 62], [52, 70], [70, 70], [40, 34],
  [62, 66], [26, 52], [50, 48], [74, 46], [36, 74], [56, 30], [44, 80], [68, 34],
];

function PatternMarks({ pattern, P }) {
  if (!pattern || pattern === 'plain') return null;
  const col = P.stroke;
  if (pattern === 'dots') {
    const out = [];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        out.push(
          <circle key={`${r}-${c}`} cx={10 + c * 17 + (r % 2 ? 8 : 0)} cy={10 + r * 16} r={3.3} fill={col} opacity={0.34} />
        );
      }
    }
    return <>{out}</>;
  }
  if (pattern === 'stripes') {
    return (
      <>
        {Array.from({ length: 11 }).map((_, i) => (
          <path key={i} d={`M${-30 + i * 16} 110 L${20 + i * 16} -10`} stroke={col} strokeWidth={3.4} opacity={0.3} fill="none" strokeLinecap="round" />
        ))}
      </>
    );
  }
  if (pattern === 'speckle') {
    return (
      <>
        {SPECKLES.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2.2 : 1.5} fill={col} opacity={0.4} />
        ))}
      </>
    );
  }
  // swirl
  return (
    <>
      {[[36, 46], [66, 60], [46, 74]].map(([x, y], i) => (
        <path
          key={i}
          d={`M${x} ${y} C${x - 8} ${y - 2} ${x - 8} ${y - 11} ${x} ${y - 11} C${x + 10} ${y - 11} ${x + 11} ${y + 2} ${x} ${y + 4} C${x - 13} ${y + 6} ${x - 14} ${y - 8} ${x - 6} ${y - 14}`}
          stroke={col} strokeWidth={2.4} fill="none" opacity={0.35} strokeLinecap="round"
        />
      ))}
    </>
  );
}

function BoilDefs({ uid, scale = 1.8 }) {
  return (
    <defs>
      {[0, 1, 2].map((s) => (
        <filter key={s} id={`pboil-${uid}-${s}`} x="-25%" y="-25%" width="150%" height="150%">
          <feTurbulence type="fractalNoise" baseFrequency="0.021" numOctaves="2" seed={s * 9 + 5} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={REDUCED ? 0 : scale} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      ))}
    </defs>
  );
}

// 肚子餓／虛弱時頭上的小水滴
function Droplet({ x = 74, y = 20 }) {
  return (
    <path
      d={`M${x} ${y} C${x + 5} ${y + 7} ${x + 5} ${y + 13} ${x} ${y + 13} C${x - 5} ${y + 13} ${x - 5} ${y + 7} ${x} ${y} Z`}
      fill="#A5DEE4" stroke="#7FBCC4" strokeWidth="1.8" opacity="0.95"
    />
  );
}

// 一對不對稱的眼睛 + 淡淡的嘴；mood !== 'ok' 時眼神下垂並改成嘟嘴
function Face({ eyes, P, blush, mood = 'ok' }) {
  const { lx, ly, rx, ry, r = 3, mouth } = eyes;
  const sad = mood === 'hungry' || mood === 'weak';
  const cx = (lx + rx) / 2;
  const my = Math.max(ly, ry) + 11;
  if (sad) {
    return (
      <>
        <g className="pet-eyes">
          <circle cx={lx} cy={ly + 0.6} r={r * 0.85} fill="#4A3B31" />
          <circle cx={rx} cy={ry + 0.6} r={r * 0.9} fill="#4A3B31" />
        </g>
        {/* 下垂的眼皮 */}
        <path d={`M${lx - r - 2.5} ${ly + r * 0.3} C${lx - r * 0.4} ${ly - r * 1.5} ${lx + r * 0.6} ${ly - r * 1.3} ${lx + r + 1.5} ${ly - r * 0.9}`} stroke={P.deep} strokeWidth="2.3" fill="none" />
        <path d={`M${rx + r + 2.5} ${ry + r * 0.3} C${rx + r * 0.4} ${ry - r * 1.5} ${rx - r * 0.6} ${ry - r * 1.3} ${rx - r - 1.5} ${ry - r * 0.9}`} stroke={P.deep} strokeWidth="2.3" fill="none" />
        <path d={`M${cx - 5} ${my + 2} C${cx - 2} ${my - 2.5} ${cx + 2} ${my - 2.5} ${cx + 5} ${my + 2}`} stroke={P.deep} strokeWidth="2.2" fill="none" />
      </>
    );
  }
  return (
    <>
      {blush && (
        <>
          <ellipse cx={lx - 6} cy={ly + 7} rx={4.4} ry={2.8} fill="#F6B7A6" opacity={0.5} />
          <ellipse cx={rx + 6} cy={ry + 7} rx={4.2} ry={2.6} fill="#F6B7A6" opacity={0.5} />
        </>
      )}
      <g className="pet-eyes">
        <circle cx={lx} cy={ly} r={r} fill="#4A3B31" />
        <circle cx={rx} cy={ry} r={r * 1.1} fill="#4A3B31" />
        <circle cx={lx + r * 0.35} cy={ly - r * 0.4} r={r * 0.3} fill="#FFFDF9" />
        <circle cx={rx + r * 0.35} cy={ry - r * 0.4} r={r * 0.32} fill="#FFFDF9" />
      </g>
      {mouth && <path d={mouth} stroke={P.deep} strokeWidth={2.2} fill="none" strokeLinecap="round" />}
    </>
  );
}

// ══════════════════════════════════════════════════════════
//  16 種剪影（每階 4 種）
//  每個 shape function 回傳 { body, behind, front, eyes, float }
//    body   = 主體 path（同時當花紋的 clip 形狀）
//    behind = 畫在主體之下（翅膀、尾巴…）
//    front  = 畫在主體之上（耳朵、角、斑紋…）
// ══════════════════════════════════════════════════════════

const wing = (d, P, op = 0.55, fill = '#FFFDF9') => <path d={d} fill={fill} fillOpacity={op} stroke={P.stroke} strokeWidth={2.4} />;

const SHAPES = {
  // ── 稀有昆蟲 ─────────────────────────────
  firefly: (P) => ({
    body: 'M50 40 C62 40 71 47 70 57 C69 68 61 77 50 77 C39 77 31 68 30 57 C29 47 38 40 50 40 Z',
    behind: (
      <>
        {wing('M47 46 C34 25 15 21 9 32 C4 44 24 57 46 54 Z', P, 0.9, P.belly)}
        {wing('M54 46 C67 23 86 22 91 33 C96 45 76 58 54 54 Z', P, 0.9, P.belly)}
        <path d="M44 50 C33 44 22 38 14 33" stroke={P.stroke} strokeWidth="1.6" fill="none" opacity="0.7" />
        <path d="M57 50 C68 43 79 37 87 34" stroke={P.stroke} strokeWidth="1.6" fill="none" opacity="0.7" />
        <circle cx="50" cy="86" r="11" fill="#FBE790" opacity="0.28" />
      </>
    ),
    front: (
      <>
        <path d="M44 40 C40 30 36 26 30 23" stroke={P.stroke} strokeWidth="2.6" fill="none" />
        <path d="M57 40 C61 31 66 27 72 25" stroke={P.stroke} strokeWidth="2.6" fill="none" />
        <circle cx="29" cy="22" r="2.2" fill={P.stroke} />
        <circle cx="73" cy="24" r="2.2" fill={P.stroke} />
        <circle cx="50" cy="84" r="7.5" fill="#FBE790" stroke="#E8C94F" strokeWidth="2.2" />
      </>
    ),
    eyes: { lx: 43, ly: 55, rx: 58, ry: 54, r: 3, mouth: 'M47 63 C49 66 53 66 55 63' },
  }),

  rhinobeetle: (P) => ({
    body: 'M50 40 C66 40 77 50 76 62 C75 74 64 81 50 81 C36 81 24 74 24 62 C24 50 34 40 50 40 Z',
    behind: (
      <>
        {[[27, 55, 15, 49], [25, 64, 13, 64], [28, 72, 17, 78], [73, 54, 85, 48], [75, 63, 87, 63], [72, 72, 83, 78]].map(([a, b, c, d], i) => (
          <path key={i} d={`M${a} ${b} L${c} ${d}`} stroke={P.stroke} strokeWidth="2.8" fill="none" />
        ))}
      </>
    ),
    front: (
      <>
        <path d="M50 43 C50 56 50 68 49 79" stroke={P.stroke} strokeWidth="2.4" fill="none" opacity="0.8" />
        <path d="M51 41 C51 30 45 22 34 17" stroke={P.dark} strokeWidth="6.5" fill="none" />
        <path d="M34 17 C41 17 45 20 47 25" stroke={P.dark} strokeWidth="5" fill="none" />
        <path d="M46 26 C50 23 55 24 57 28" stroke={P.dark} strokeWidth="3.8" fill="none" />
      </>
    ),
    eyes: { lx: 42, ly: 55, rx: 59, ry: 54, r: 2.9, mouth: 'M46 64 C49 67 53 67 56 64' },
  }),

  swallowtail: (P) => ({
    body: 'M50 36 C54 36 57 42 56 55 C55 69 53 79 50 82 C47 79 45 69 44 55 C43 42 46 36 50 36 Z',
    behind: (
      <>
        {wing('M46 47 C31 26 12 25 8 38 C4 51 22 61 46 59 Z', P, 0.7)}
        {wing('M55 47 C70 25 89 26 93 39 C96 52 78 61 55 59 Z', P, 0.7)}
        {wing('M47 61 C34 63 20 71 18 84 C27 88 41 84 49 72 Z', P, 0.7)}
        {wing('M54 61 C67 63 81 71 83 84 C74 88 60 84 52 72 Z', P, 0.7)}
        {[[26, 44], [74, 44], [30, 76], [70, 76]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="4" fill={P.main} stroke={P.stroke} strokeWidth="1.8" />
        ))}
      </>
    ),
    front: (
      <>
        <path d="M47 38 C42 28 36 23 29 21" stroke={P.stroke} strokeWidth="2.4" fill="none" />
        <path d="M54 38 C59 28 65 23 72 22" stroke={P.stroke} strokeWidth="2.4" fill="none" />
        <circle cx="28" cy="20" r="2.4" fill={P.stroke} />
        <circle cx="73" cy="21" r="2.4" fill={P.stroke} />
      </>
    ),
    eyes: { lx: 46, ly: 45, rx: 55, ry: 44, r: 2.3, mouth: null },
  }),

  damselfly: (P) => ({
    body: 'M50 30 C55 30 58 37 56 47 C55 61 54 77 50 88 C46 77 45 61 44 47 C42 37 45 30 50 30 Z',
    behind: (
      <>
        {wing('M48 41 C30 32 12 34 8 43 C11 51 30 53 48 47 Z', P)}
        {wing('M53 41 C71 32 89 34 93 43 C90 51 71 53 53 47 Z', P)}
        {wing('M48 55 C33 49 18 51 15 58 C18 65 33 66 48 61 Z', P)}
        {wing('M53 55 C68 49 83 51 86 58 C83 65 68 66 53 61 Z', P)}
      </>
    ),
    front: (
      <>
        <circle cx="50" cy="26" r="9.5" fill={P.main} stroke={P.stroke} strokeWidth="2.8" />
        <path d="M47 70 C49 72 52 72 54 70" stroke={P.stroke} strokeWidth="2" fill="none" opacity="0.7" />
        <path d="M47 79 C49 81 52 81 54 79" stroke={P.stroke} strokeWidth="2" fill="none" opacity="0.7" />
      </>
    ),
    eyes: { lx: 46, ly: 25, rx: 54, ry: 24, r: 2.6, mouth: null },
  }),

  // ── 可愛動物 ─────────────────────────────
  cat: (P) => ({
    body: 'M50 32 C68 32 81 46 80 61 C79 77 66 85 50 85 C34 85 21 77 20 61 C19 46 32 32 50 32 Z',
    behind: <path d="M77 80 C95 81 100 58 90 41" stroke={P.stroke} strokeWidth="3.6" fill="none" />,
    front: (
      <>
        <path d="M31 41 C28 27 27 21 29 20 C34 24 41 30 45 35 Z" fill={P.main} stroke={P.stroke} strokeWidth="2.8" />
        <path d="M70 40 C74 26 76 21 74 20 C68 25 61 30 57 35 Z" fill={P.main} stroke={P.stroke} strokeWidth="2.8" />
        <path d="M33 38 C32 31 32 28 33 27 C36 30 39 33 41 36 Z" fill={P.belly} />
        <path d="M68 37 C70 30 70 27 69 26 C66 29 63 32 61 35 Z" fill={P.belly} />
        {[[24, 60, 12, 57], [24, 66, 12, 68], [76, 59, 88, 56], [76, 65, 88, 67]].map(([a, b, c, d], i) => (
          <path key={i} d={`M${a} ${b} L${c} ${d}`} stroke={P.stroke} strokeWidth="1.8" fill="none" opacity="0.75" />
        ))}
        <path d="M46 62 L54 62 L50 66 Z" fill={P.deep} />
      </>
    ),
    eyes: { lx: 40, ly: 55, rx: 61, ry: 54, r: 3.4, mouth: 'M44 69 C47 72 50 70 50 67 C50 70 53 72 56 69' },
  }),

  dog: (P) => ({
    body: 'M50 32 C69 32 81 45 80 61 C79 77 66 86 50 86 C34 86 21 77 20 61 C19 45 31 32 50 32 Z',
    behind: (
      <>
        <path d="M78 76 C93 74 99 58 91 44" stroke={P.stroke} strokeWidth="3.6" fill="none" />
        <path d="M30 38 C18 41 13 58 20 69 C29 66 33 53 33 42 Z" fill={P.main} stroke={P.stroke} strokeWidth="2.8" />
        <path d="M70 37 C82 41 87 57 80 68 C71 65 67 52 67 41 Z" fill={P.main} stroke={P.stroke} strokeWidth="2.8" />
      </>
    ),
    front: (
      <>
        <ellipse cx="50" cy="68" rx="14" ry="10" fill={P.belly} stroke={P.stroke} strokeWidth="2.2" />
        <ellipse cx="50" cy="63" rx="4.2" ry="3.2" fill={P.deep} />
        <path d="M50 66 C50 71 46 73 42 71" stroke={P.deep} strokeWidth="2" fill="none" />
        <path d="M50 66 C50 71 54 73 58 71" stroke={P.deep} strokeWidth="2" fill="none" />
      </>
    ),
    eyes: { lx: 41, ly: 50, rx: 60, ry: 49, r: 3.3, mouth: null },
  }),

  seal: (P) => ({
    body: 'M50 36 C71 36 85 48 84 62 C83 77 69 84 49 84 C29 84 16 76 16 62 C16 48 30 36 50 36 Z',
    behind: (
      <>
        <path d="M22 74 C11 79 7 89 14 90 C23 89 29 82 31 75 Z" fill={P.main} stroke={P.stroke} strokeWidth="2.6" />
        <path d="M78 73 C89 78 93 88 86 90 C77 89 71 82 69 74 Z" fill={P.main} stroke={P.stroke} strokeWidth="2.6" />
      </>
    ),
    front: (
      <>
        <ellipse cx="50" cy="66" rx="13" ry="9" fill={P.belly} opacity="0.85" />
        <ellipse cx="50" cy="63" rx="3.6" ry="2.8" fill={P.deep} />
        <path d="M50 66 C50 70 46 72 43 70" stroke={P.deep} strokeWidth="1.9" fill="none" />
        <path d="M50 66 C50 70 54 72 57 70" stroke={P.deep} strokeWidth="1.9" fill="none" />
        {[[38, 64, 26, 61], [38, 69, 26, 71], [62, 63, 74, 60], [62, 68, 74, 70]].map(([a, b, c, d], i) => (
          <path key={i} d={`M${a} ${b} L${c} ${d}`} stroke={P.stroke} strokeWidth="1.7" fill="none" opacity="0.7" />
        ))}
      </>
    ),
    eyes: { lx: 39, ly: 53, rx: 62, ry: 52, r: 4.2, mouth: null },
  }),

  rabbit: (P) => ({
    body: 'M50 40 C67 40 77 52 76 67 C75 81 64 87 50 87 C36 87 25 81 24 67 C23 52 33 40 50 40 Z',
    behind: (
      <>
        <circle cx="80" cy="79" r="7.5" fill={P.belly} stroke={P.stroke} strokeWidth="2.4" />
        <path d="M40 44 C33 27 33 12 39 8 C46 13 46 29 44 44 Z" fill={P.main} stroke={P.stroke} strokeWidth="2.8" />
        <path d="M60 43 C68 27 69 13 63 9 C56 14 55 29 56 43 Z" fill={P.main} stroke={P.stroke} strokeWidth="2.8" />
        <path d="M40 40 C36 27 36 17 39 14 C43 18 43 30 42 40 Z" fill={P.belly} />
        <path d="M59 39 C63 27 64 18 61 15 C57 19 57 30 57 39 Z" fill={P.belly} />
      </>
    ),
    front: (
      <>
        <path d="M46 66 L54 66 L50 70 Z" fill={P.deep} />
        <path d="M50 70 L50 74" stroke={P.deep} strokeWidth="2" fill="none" />
      </>
    ),
    eyes: { lx: 40, ly: 60, rx: 61, ry: 59, r: 3.4, mouth: 'M43 75 C46 78 49 76 50 74 C51 76 54 78 57 75' },
  }),

  // ── 保育動物 ─────────────────────────────
  blackbear: (P) => ({
    body: 'M50 34 C71 34 83 48 82 64 C81 80 68 88 50 88 C32 88 19 80 18 64 C17 48 29 34 50 34 Z',
    behind: (
      <>
        <circle cx="27" cy="36" r="9.5" fill={P.main} stroke={P.stroke} strokeWidth="2.8" />
        <circle cx="73" cy="35" r="9.5" fill={P.main} stroke={P.stroke} strokeWidth="2.8" />
      </>
    ),
    front: (
      <>
        {/* 胸前 V 白紋（臺灣黑熊的招牌） */}
        <path d="M37 61 L50 82 L63 60" stroke="#FFFDF9" strokeWidth="5.5" fill="none" />
        <ellipse cx="50" cy="59" rx="11.5" ry="8.5" fill={P.belly} stroke={P.stroke} strokeWidth="2" />
        <ellipse cx="50" cy="55" rx="4" ry="3" fill={P.deep} />
        <path d="M50 58 C50 62 47 63 45 62" stroke={P.deep} strokeWidth="1.9" fill="none" />
        <path d="M50 58 C50 62 53 63 55 62" stroke={P.deep} strokeWidth="1.9" fill="none" />
      </>
    ),
    eyes: { lx: 39, ly: 47, rx: 61, ry: 46, r: 3.1, mouth: null },
  }),

  leopardcat: (P) => ({
    body: 'M50 32 C68 32 81 46 80 61 C79 77 66 85 50 85 C34 85 21 77 20 61 C19 46 32 32 50 32 Z',
    behind: (
      <>
        <path d="M78 80 C96 81 101 58 91 41" stroke={P.stroke} strokeWidth="3.6" fill="none" />
        {[[92, 68], [96, 57]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.4" fill={P.deep} opacity="0.6" />
        ))}
      </>
    ),
    front: (
      <>
        <path d="M31 41 C28 26 27 21 29 20 C34 24 41 30 45 35 Z" fill={P.main} stroke={P.stroke} strokeWidth="2.8" />
        <path d="M70 40 C74 26 76 21 74 20 C68 25 61 30 57 35 Z" fill={P.main} stroke={P.stroke} strokeWidth="2.8" />
        <circle cx="33" cy="30" r="3" fill="#FFFDF9" />
        <circle cx="71" cy="29" r="3" fill="#FFFDF9" />
        {/* 額頭條紋 */}
        <path d="M43 40 C44 35 45 32 45 29" stroke={P.deep} strokeWidth="2.2" fill="none" opacity="0.7" />
        <path d="M50 39 C51 34 52 31 52 28" stroke={P.deep} strokeWidth="2.2" fill="none" opacity="0.7" />
        <path d="M57 40 C57 35 58 32 59 29" stroke={P.deep} strokeWidth="2.2" fill="none" opacity="0.7" />
        {/* 身上斑點 */}
        {[[33, 63], [42, 72], [56, 70], [66, 62], [50, 78], [28, 71]].map(([x, y], i) => (
          <ellipse key={i} cx={x} cy={y} rx="3.6" ry="2.8" fill={P.deep} opacity="0.45" />
        ))}
        <path d="M46 61 L54 61 L50 65 Z" fill={P.deep} />
      </>
    ),
    eyes: { lx: 40, ly: 54, rx: 61, ry: 53, r: 3.3, mouth: 'M44 68 C47 71 50 69 50 66 C50 69 53 71 56 68' },
  }),

  pangolin: (P) => ({
    body: 'M57 38 C75 38 86 51 84 65 C82 79 66 85 50 85 C34 85 22 77 24 64 C26 51 41 38 57 38 Z',
    behind: (
      <>
        <path d="M82 76 C93 82 95 93 87 94 C78 94 71 86 73 79 Z" fill={P.main} stroke={P.stroke} strokeWidth="2.6" />
        <path d="M26 66 C15 66 8 70 8 74 C8 79 17 81 26 79 Z" fill={P.belly} stroke={P.stroke} strokeWidth="2.6" />
      </>
    ),
    front: (
      <>
        {/* 鱗片：三排交錯弧線 */}
        {[[36, 56], [50, 52], [64, 55], [42, 68], [57, 67], [71, 70], [33, 78], [48, 79], [63, 80]].map(([x, y], i) => (
          <path key={i} d={`M${x - 8} ${y + 4} C${x - 6} ${y - 5} ${x + 6} ${y - 5} ${x + 8} ${y + 4}`} stroke={P.stroke} strokeWidth="2.4" fill="none" opacity="0.75" />
        ))}
        <circle cx="12" cy="73" r="1.8" fill={P.deep} />
      </>
    ),
    eyes: { lx: 29, ly: 66, rx: 37, ry: 64, r: 2.4, mouth: null },
  }),

  otter: (P) => ({
    body: 'M50 34 C67 34 77 46 76 61 C75 79 64 88 50 88 C36 88 25 79 24 61 C23 46 33 34 50 34 Z',
    behind: (
      <>
        <path d="M71 84 C84 90 93 88 97 80" stroke={P.stroke} strokeWidth="6" fill="none" />
        <circle cx="31" cy="38" r="6" fill={P.main} stroke={P.stroke} strokeWidth="2.6" />
        <circle cx="69" cy="37" r="6" fill={P.main} stroke={P.stroke} strokeWidth="2.6" />
      </>
    ),
    front: (
      <>
        <ellipse cx="50" cy="60" rx="12.5" ry="9.5" fill={P.belly} stroke={P.stroke} strokeWidth="2.1" />
        <ellipse cx="50" cy="55" rx="3.8" ry="3" fill={P.deep} />
        <path d="M50 58 C50 63 46 64 43 63" stroke={P.deep} strokeWidth="1.9" fill="none" />
        <path d="M50 58 C50 63 54 64 57 63" stroke={P.deep} strokeWidth="1.9" fill="none" />
        {[[39, 59, 28, 56], [39, 64, 28, 66], [61, 58, 72, 55], [61, 63, 72, 65]].map(([a, b, c, d], i) => (
          <path key={i} d={`M${a} ${b} L${c} ${d}`} stroke={P.stroke} strokeWidth="1.6" fill="none" opacity="0.7" />
        ))}
      </>
    ),
    eyes: { lx: 40, ly: 47, rx: 60, ry: 46, r: 3.2, mouth: null },
  }),

  // ── 精靈（非人型、漂浮、帶光點）─────────────
  sprite_moss: (P) => ({
    float: true,
    body: 'M50 30 C64 30 75 40 74 52 C73 66 63 77 50 77 C37 77 27 66 26 52 C25 40 36 30 50 30 Z',
    behind: (
      <>
        {/* 苔蘚般的蓬鬆邊緣（扇貝弧線，不是尖刺） */}
        {Array.from({ length: 15 }).map((_, i) => {
          const a = (i / 15) * Math.PI * 2;
          const a2 = ((i + 1) / 15) * Math.PI * 2;
          const r = 23;
          const p1 = [50 + Math.cos(a) * r, 53 + Math.sin(a) * r];
          const p2 = [50 + Math.cos(a2) * r, 53 + Math.sin(a2) * r];
          const mid = [(a + a2) / 2];
          const c = [50 + Math.cos(mid) * (r + 8), 53 + Math.sin(mid) * (r + 8)];
          return (
            <path key={i} d={`M${p1[0]} ${p1[1]} Q${c[0]} ${c[1]} ${p2[0]} ${p2[1]} Z`} fill="#A8D8B9" stroke="#8FC7A3" strokeWidth="1.8" />
          );
        })}
      </>
    ),
    front: (
      <>
        <path d="M46 32 C41 22 39 15 43 9" stroke="#5AA37F" strokeWidth="2.8" fill="none" />
        <path d="M52 30 C55 20 59 14 64 11" stroke="#5AA37F" strokeWidth="2.8" fill="none" />
        <path d="M43 9 C47 10 49 14 48 18" stroke="#5AA37F" strokeWidth="2.4" fill="none" />
        <path d="M50 30 C50 23 51 17 53 13" stroke="#A8D8B9" strokeWidth="2.4" fill="none" />
        <Sparkles pts={[[16, 34], [86, 44], [78, 76], [22, 74]]} />
      </>
    ),
    eyes: { lx: 43, ly: 52, rx: 58, ry: 51, r: 3.1, mouth: 'M46 61 C48 64 52 64 54 61' },
  }),

  sprite_cloud: (P) => ({
    float: true,
    body: 'M32 66 C20 66 14 55 21 46 C18 34 30 25 40 31 C45 20 61 19 66 30 C79 27 88 39 82 49 C90 57 84 70 72 67 Z',
    behind: null,
    front: (
      <>
        {[[40, 76], [52, 80], [64, 74]].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y} C${x - 3.5} ${y + 6} ${x - 3} ${y + 11} ${x} ${y + 11} C${x + 3} ${y + 11} ${x + 3.5} ${y + 6} ${x} ${y} Z`} fill="#A5DEE4" stroke={P.stroke} strokeWidth="1.8" opacity="0.9" />
        ))}
        <Sparkles pts={[[14, 40], [88, 36], [90, 62]]} />
      </>
    ),
    eyes: { lx: 42, ly: 48, rx: 59, ry: 47, r: 3.2, mouth: 'M46 57 C48 60 52 60 54 57' },
  }),

  sprite_flame: (P) => ({
    float: true,
    body: 'M50 18 C61 33 72 44 70 58 C68 73 60 81 50 81 C40 81 32 73 30 58 C28 44 40 33 50 18 Z',
    behind: null,
    front: (
      <>
        <path d="M50 66 C43 64 41 56 46 51 C51 46 59 49 58 56" stroke="#FBE790" strokeWidth="2.8" fill="none" />
        <path d="M50 26 C55 36 61 43 60 51" stroke="#FBE790" strokeWidth="2.2" fill="none" opacity="0.7" />
        <Sparkles pts={[[20, 46], [82, 40], [78, 70], [24, 74]]} color="#FBE790" />
      </>
    ),
    eyes: { lx: 43, ly: 54, rx: 57, ry: 53, r: 3, mouth: 'M46 62 C48 65 52 65 54 62' },
  }),

  sprite_star: (P) => ({
    float: true,
    body: 'M50 14 C54 31 59 38 76 40 C62 50 59 58 63 76 C50 67 44 67 32 76 C36 58 33 50 19 40 C36 38 43 31 50 14 Z',
    behind: null,
    front: (
      <>
        {[[24, 82, 2.6], [17, 88, 1.9], [80, 80, 2.4], [88, 86, 1.7]].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#FBE790" opacity="0.85" />
        ))}
        <Sparkles pts={[[12, 26], [88, 22]]} />
      </>
    ),
    eyes: { lx: 44, ly: 43, rx: 57, ry: 42, r: 2.9, mouth: 'M47 51 C49 54 52 54 54 51' },
  }),
};

function Sparkles({ pts, color = '#FFFFFF' }) {
  return (
    <>
      {pts.map(([x, y], i) => (
        <path
          key={i}
          d={`M${x} ${y - 5} C${x + 0.6} ${y - 1.2} ${x + 1.2} ${y - 0.6} ${x + 5} ${y} C${x + 1.2} ${y + 0.6} ${x + 0.6} ${y + 1.2} ${x} ${y + 5} C${x - 0.6} ${y + 1.2} ${x - 1.2} ${y + 0.6} ${x - 5} ${y} C${x - 1.2} ${y - 0.6} ${x - 0.6} ${y - 1.2} ${x} ${y - 5} Z`}
          fill={color} stroke="#E8C94F" strokeWidth="1" opacity="0.8"
        />
      ))}
    </>
  );
}

// ══════════════════════════════════════════════════════════
//  <Egg />
// ══════════════════════════════════════════════════════════
export function Egg({ hue = 40, pattern = 'dots', daysLeft = 14, size = 120 }) {
  useEffect(ensureStyles, []);
  const frame = useBoil();
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9]/g, '');
  const P = petPalette(hue);
  const boil = `url(#pboil-${uid}-${frame})`;
  const eggPath = 'M50 12 C65 12 79 34 78 55 C77 75 65 88 50 88 C35 88 23 75 22 55 C21 34 35 12 50 12 Z';
  const crack1 = daysLeft <= 4;   // days >= 10
  const crack2 = daysLeft <= 2;   // days >= 12

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="蛋" role="img" style={{ overflow: 'visible', display: 'block' }}>
      <BoilDefs uid={uid} scale={1.5} />
      <clipPath id={`eclip-${uid}`}><path d={eggPath} /></clipPath>
      <g filter={boil} strokeLinecap="round" strokeLinejoin="round">
        <g className="egg-wobble">
          <path d={eggPath} fill={P.main} stroke={P.stroke} strokeWidth="3.2" />
          <g clipPath={`url(#eclip-${uid})`}>
            <PatternMarks pattern={pattern} P={P} />
          </g>
          <path d={eggPath} fill="none" stroke={P.stroke} strokeWidth="3.2" />
          {/* 頂部反光 */}
          <path d="M38 30 C40 23 45 19 50 18" stroke="#FFFDF9" strokeWidth="3" fill="none" opacity="0.85" />
          {crack1 && <path d="M42 30 L48 38 L41 45 L48 52" stroke={P.deep} strokeWidth="2.6" fill="none" />}
          {crack2 && <path d="M62 34 L56 42 L63 48 L58 55" stroke={P.deep} strokeWidth="2.4" fill="none" />}
        </g>
      </g>
    </svg>
  );
}

// ══════════════════════════════════════════════════════════
//  <Pet />
// ══════════════════════════════════════════════════════════
export function Pet({ pet, days = 0, size = 120, health = 'ok' }) {
  useEffect(ensureStyles, []);
  const frame = useBoil();
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9]/g, '');

  if (!pet) return <svg width={size} height={size} viewBox="0 0 100 100" />;

  const hue = Number(pet.hue) || 0;
  const pattern = pet.pattern || 'plain';
  const tier = pet.species_tier || 'egg';

  // 未孵化 → 畫蛋
  if (!pet.hatched_at || tier === 'egg') {
    return <Egg hue={hue} pattern={pattern} daysLeft={Math.max(0, HATCH_DAYS - days)} size={size} />;
  }

  const key = (SHAPES[pet.species_key] ? pet.species_key : pickSpecies(tier, hue)) || 'firefly';
  const P = petPalette(hue);
  const shape = (SHAPES[key] || SHAPES.firefly)(P);
  const stage = stageIndex(days);
  const scale = STAGE_SCALE[stage];
  const boil = `url(#pboil-${uid}-${frame})`;

  // 飢餓：降飽和；虛弱：整體轉灰＋動作變慢
  const dim = health === 'weak' ? 'grayscale(0.82) opacity(0.9)' : health === 'hungry' ? 'saturate(0.5)' : undefined;
  const animClass = (shape.float ? 'pet-float' : 'pet-breathe') + (health === 'weak' ? ' pet-slow' : '');

  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100"
      role="img" aria-label={speciesLabel(tier, key) + (health !== 'ok' ? `（${HEALTH_LABEL[health]}）` : '')}
      style={{ overflow: 'visible', display: 'block', filter: dim }}
    >
      <BoilDefs uid={uid} scale={1.8} />
      <clipPath id={`bclip-${uid}`}><path d={shape.body} /></clipPath>
      <g filter={boil} strokeLinecap="round" strokeLinejoin="round">
        <g transform={`translate(50 54) scale(${scale}) translate(-50 -54)`}>
          <g className={animClass}>
            {shape.behind}
            <path d={shape.body} fill={P.main} stroke={P.stroke} strokeWidth="3" />
            <g clipPath={`url(#bclip-${uid})`}>
              <PatternMarks pattern={pattern} P={P} />
            </g>
            <path d={shape.body} fill="none" stroke={P.stroke} strokeWidth="3" />
            {shape.front}
            <Face eyes={shape.eyes} P={P} blush={stage >= 2 && health === 'ok'} mood={health} />
            {health !== 'ok' && <Droplet x={74} y={16} />}
            {/* 成熟階段：小葉冠 + 光點 */}
            {stage >= 3 && health === 'ok' && (
              <>
                <path d="M38 16 C42 8 50 6 54 10 C58 6 66 9 68 16" stroke="#5AA37F" strokeWidth="2.6" fill="none" />
                <circle cx="54" cy="9" r="2.4" fill="#FBE790" stroke="#E8C94F" strokeWidth="1.2" />
                <Sparkles pts={[[14, 20], [88, 26]]} />
              </>
            )}
          </g>
        </g>
      </g>
    </svg>
  );
}

export default Pet;
