import React, { useEffect, useRef, useState } from 'react';

/**
 * Pet.jsx — 像素電子雞（蛋 → 孵化 → 成長 → 進化）
 * ────────────────────────────────────────────────────────────
 * 美術原則（詳細規格見 src/PET_PIXEL_SPEC.md）：
 *   · 20×20 像素網格，SVG <rect> + shapeRendering="crispEdges"，方塊感明確
 *   · 每隻 4-6 色：A 主色 / B 暗部 / C 亮部 / D 深色輪廓 / E 白 / S 眼睛高光 / F,G 物種重點色
 *   · 逐格動畫 2.5fps（400ms），不使用 CSS transition 補間
 *   · 無反鋸齒、無漸層、無 boiling-line 濾鏡（會把方塊糊掉）
 *
 * 對外（與 App.jsx 相容，介面未變）：
 *   <Pet pet={petRow} days={n} size={px} health={'ok'|'hungry'|'weak'|'dead'} />
 *   <Egg hue={} pattern={} daysLeft={} size={} />
 *   以及成長／進化／禮物的純資料函式（見下方 export）
 */

const REDUCED =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ══════════════════════════════════════════════════════════
//  逐格動畫時脈：全域單一 interval，所有寵物共用（省電）
//  400ms = 2.5fps。小尺寸／虛弱狀態再除以 2 → 800ms（1.25fps）
// ══════════════════════════════════════════════════════════
const FRAME_MS = 400;
let tickN = 0;
let tickTimer = null;
const tickSubs = new Set();
function subscribeTick(fn) {
  tickSubs.add(fn);
  if (!tickTimer && !REDUCED) {
    tickTimer = setInterval(() => {
      tickN += 1;
      tickSubs.forEach((f) => f(tickN));
    }, FRAME_MS);
  }
  return () => {
    tickSubs.delete(fn);
    if (tickSubs.size === 0 && tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  };
}
function useTick() {
  const [t, setT] = useState(tickN);
  useEffect(() => subscribeTick(setT), []);
  return REDUCED ? 0 : t;   // prefers-reduced-motion → 永遠停在 frame 0
}

// ══════════════════════════════════════════════════════════
//  資料：色盤 / 花紋 / 四階種族 / 成長 / 禮物 / 進化
// ══════════════════════════════════════════════════════════

export const PATTERNS = ['dots', 'stripes', 'speckle', 'swirl', 'plain'];

// 舊介面保留（其他模組可能引用）
export function petPalette(hue) {
  const h = ((hue % 360) + 360) % 360;
  return {
    main: `hsl(${h},55%,78%)`,
    stroke: `hsl(${h},45%,62%)`,
    belly: `hsl(${(h + 30) % 360},60%,88%)`,
    deep: `hsl(${h},40%,52%)`,
    dark: `hsl(${h},26%,40%)`,
  };
}

/**
 * 像素色盤：字母 → 顏色。每隻生物最多用到 6 色。
 *   A 主色 / B 暗部 / C 亮部 / D 輪廓 / E 白 / S 眼睛高光（眨眼時變 D）/ F,G 物種重點色
 * health: 'hungry' 降飽和、'weak'/'dead' 幾乎去彩且重點色併入暗部
 */
export function pixelPalette(hue, health = 'ok') {
  const h = ((hue % 360) + 360) % 360;
  const k = health === 'weak' || health === 'dead' ? 0.16 : health === 'hungry' ? 0.55 : 1;
  const s = (v) => Math.round(v * k);
  return {
    A: `hsl(${h},${s(58)}%,${health === 'weak' || health === 'dead' ? 64 : 68}%)`,
    B: `hsl(${h},${s(46)}%,48%)`,
    C: `hsl(${h},${s(62)}%,86%)`,
    D: `hsl(${h},${s(40)}%,${health === 'weak' || health === 'dead' ? 32 : 25}%)`,
    E: '#FFFDF9',
    S: '#FFFDF9',
  };
}

export const TIER_ORDER = ['egg', 'insect', 'cute', 'rare', 'spirit'];
export const TIER_LABEL = { egg: '蛋', insect: '稀有昆蟲', cute: '可愛動物', rare: '保育動物', spirit: '精靈' };

// 四階種族表（species_key 一旦寫進 DB 就不可刪改）
export const SPECIES = {
  insect: { firefly: '螢火蟲', rhinobeetle: '獨角仙', swallowtail: '寬尾鳳蝶', damselfly: '豆娘' },
  cute: { cat: '貓', dog: '狗', seal: '海豹', rabbit: '兔子' },
  rare: {
    blackbear: '臺灣黑熊', leopardcat: '石虎', pangolin: '穿山甲', otter: '水獺',
    redpanda: '小熊貓', fennec: '耳廓狐', axolotl: '墨西哥鈍口螈', seaotter: '海獺',
    bluedragon: '藍龍海蛞蝓', shoebill: '鯨頭鸛', sawfish: '鋸鰩',
  },
  spirit: {
    sprite_moss: '苔球精靈', sprite_cloud: '雲朵精靈', sprite_flame: '火種精靈', sprite_star: '星塵精靈',
    kitsune: '九尾狐', phoenix: '不死鳥', qilin: '麒麟', baize: '白澤',
    dijiang: '帝江', kelpie: '凱爾派', ouroboros: '銜尾蛇', basilisk: '巴西利斯克',
    behemoth: '貝希摩斯', ammit: '阿米特', jianbird: '比翼鳥', goldencrow: '三足金烏',
    thunderbird: '雷鳥', carbuncle: '寶石獸', jormungandr: '耶夢加得', ratatoskr: '世界樹松鼠',
  },
};

export const speciesLabel = (tier, key) => (SPECIES[tier] && SPECIES[tier][key]) || TIER_LABEL[tier] || '小生物';

// 依 hue 穩定挑選（同一隻寵物結果永遠一樣，不用亂數）
export function pickSpecies(tier, hue) {
  const keys = Object.keys(SPECIES[tier] || {});
  if (!keys.length) return null;
  return keys[Math.abs(Math.round(hue)) % keys.length];
}

// ── 成長 ────────────────────────────────────────────────
export const HATCH_AT = 4;             // 打卡 4 次孵化（唯一真相來源）
export const HATCH_DAYS = HATCH_AT;    // 舊名保留：App.jsx 匯入的是這個
export const CRACK1_AT = 2;            // 第 2 次出現第一道裂痕
export const CRACK2_AT = 3;            // 第 3 次出現第二道裂痕
export const STAGE_LABEL = ['幼', '中', '大', '成熟'];
export const stageIndex = (days) => (days >= 120 ? 3 : days >= 60 ? 2 : days >= 30 ? 1 : 0);
// 成長階段用「viewBox 留白」控制大小，維持整格像素不變形
const STAGE_PAD = [3.2, 1.8, 0.6, 0];

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

// 各階門檻：xp + 累計投入金幣（coins_spent）+ 高稀有度禮物「份數」（不看平均，只看有沒有給過好東西）
export const TIER_REQ = {
  cute: { xp: 40, coins: 60 },
  rare: { xp: 100, coins: 200, highGifts: 2, highRarity: 2 },
  spirit: { xp: 220, coins: 500, highGifts: 2, highRarity: 4 },
};

// 依最低稀有度門檻，數出禮物紀錄裡有幾份達標（不是平均，只是計數）
function countHighRarity(giftLog, minRarity) {
  return giftLog.reduce((n, g) => n + ((Number(g.rarity) || 0) >= minRarity ? 1 : 0), 0);
}

// 進化判定：只升不降；精靈種需要 difficulty !== 'easy'（輕鬆習慣最高到保育類）
export function evolveTier(current, xp, giftLog = [], difficulty = 'medium', coinsSpent = 0) {
  const coins = Number(coinsSpent) || 0;
  let t = 'insect';
  if (xp >= TIER_REQ.cute.xp && coins >= TIER_REQ.cute.coins) t = 'cute';
  if (xp >= TIER_REQ.rare.xp && coins >= TIER_REQ.rare.coins
    && countHighRarity(giftLog, TIER_REQ.rare.highRarity) >= TIER_REQ.rare.highGifts) t = 'rare';
  if (xp >= TIER_REQ.spirit.xp && coins >= TIER_REQ.spirit.coins
    && countHighRarity(giftLog, TIER_REQ.spirit.highRarity) >= TIER_REQ.spirit.highGifts
    && difficulty !== 'easy') t = 'spirit';
  const cur = current && current !== 'egg' ? current : 'insect';
  return TIER_ORDER.indexOf(t) > TIER_ORDER.indexOf(cur) ? t : cur;
}

// 下一階還差什麼（給寵物卡的進度提示）
export function nextTierGoal(current, xp, giftLog = [], difficulty = 'medium', coinsSpent = 0) {
  const order = ['insect', 'cute', 'rare', 'spirit'];
  const idx = order.indexOf(current === 'egg' || !current ? 'insect' : current);
  if (idx < 0 || idx >= order.length - 1) return null;          // 已是精靈
  const next = order[idx + 1];
  if (next === 'spirit' && difficulty === 'easy') return { capped: true };
  const req = TIER_REQ[next];
  const coins = Number(coinsSpent) || 0;
  const highCount = req.highRarity ? countHighRarity(giftLog, req.highRarity) : 0;
  return {
    tier: next,
    label: TIER_LABEL[next],
    needXp: Math.max(0, req.xp - xp),
    needCoins: Math.max(0, req.coins - coins),
    needHighGifts: req.highGifts ? Math.max(0, req.highGifts - highCount) : 0,
    highRarity: req.highRarity || null,
  };
}

// ── 飢餓與死亡 ──────────────────────────────────────────
// gap = 今天 − 最後打卡日（從未打卡則自 created_at 起算）
// 每日習慣：0-2 健康 / 3-5 餓 / 6-8 虛弱 / ≥9 死亡；每週習慣門檻 ×2
export function petHealth(gap, weekly = false) {
  const m = weekly ? 2 : 1;
  if (gap >= 9 * m) return 'dead';
  if (gap >= 6 * m) return 'weak';
  if (gap >= 3 * m) return 'hungry';
  return 'ok';
}
export const HEALTH_LABEL = { ok: '健康', hungry: '肚子餓了', weak: '虛弱', dead: '已離開' };

// ── 急救／復活花費 ──────────────────────────────────────
// 一律記到 pets.rescue_spent，絕不加進 coins_spent（否則付費就能推進進化門檻）。
export const CARE_COST = 40;                                              // 緊急照顧一次（重置死亡倒數）
export const REVIVE_COST = { insect: 60, cute: 150, rare: 350, spirit: 700 }; // 依死亡時的 species_tier 計費

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
//  像素引擎
//  · GRID = 20：所有圖 20×20；每行 20 字元（不足自動補 '.'）
//  · '.' = 透明；其餘字母查 palette
//  · 同色水平連續像素合併成一個 <rect>（run-length），控制節點數
// ══════════════════════════════════════════════════════════
export const GRID = 20;

function gridRects(grid, colors, keyPrefix) {
  const out = [];
  for (let y = 0; y < grid.length && y < GRID; y++) {
    const row = grid[y] || '';
    let x = 0;
    while (x < row.length && x < GRID) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') { x++; continue; }
      let w = 1;
      while (x + w < row.length && x + w < GRID && row[x + w] === ch) w++;
      const fill = colors[ch];
      if (fill) out.push(<rect key={`${keyPrefix}${x}-${y}`} x={x} y={y} width={w} height={1} fill={fill} />);
      x += w;
    }
  }
  return out;
}

// 覆蓋物：愛心、飯碗、水滴、莓果、蛋殼碎片（固定色，不隨 hue）
const OV = {
  heart: { grid: ['.RR.RR.', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'], colors: { R: '#E88AA0' } },
  note: { grid: ['..NN', '.N.N', 'NN.N', 'NN.N', '..NN'], colors: { N: '#8A9FD0' } },
  bowl: { grid: ['.PPPPP.', 'WWWWWWW', '.WWWWW.', '..WWW..'], colors: { P: '#C98F5E', W: '#9C8A78' } },
  drop: { grid: ['.T.', 'TTT', 'TTT', '.T.'], colors: { T: '#8FD3E8' } },
  berry: { grid: ['.PP.', 'PPPP', 'PPPP', '.PP.'], colors: { P: '#8E7BC0' } },
  spark: { grid: ['.Y.', 'YYY', '.Y.'], colors: { Y: '#F5D97B' } },
};

function Overlay({ name, x, y, k }) {
  const o = OV[name];
  if (!o) return null;
  return <g transform={`translate(${x} ${y})`}>{gridRects(o.grid, o.colors, `${k}-`)}</g>;
}

// ══════════════════════════════════════════════════════════
//  像素圖資料
//  格式：SPRITES[key] = { frames: [grid, ...], accent?: { F: '#hex', G: '#hex' } }
//  · frames 只有 1 張 → 引擎自動產生 idle 循環（上下浮動 1px + 定時眨眼）
//  · frames 有 2 張以上 → 依序輪播（翅膀拍動等需要真正第二格的生物用這個）
//  · 眨眼＝把 'S'（眼睛高光）改畫成 'D'，所以眼睛請用 S 當高光
// ══════════════════════════════════════════════════════════

const SPRITES = {

  // ──────────── 稀有昆蟲 ────────────
  firefly: {
    accent: { F: '#F0C64A', G: '#FFF3B8' },
    frames: [
      [
        '..D..............D..',
        '...D............D...',
        '....DD..DDDD..DD....',
        '.......DASSAD.......',
        '.......DAAAAD.......',
        '.....DDBBBBBBDD.....',
        '...DCCDBBBBBBDCCD...',
        '..DCCCDBBBBBBDCCCD..',
        '..DCCCDAAAAAADCCCD..',
        '..DCCCDAAAAAADCCCD..',
        '...DCCDAAAAAADCCD...',
        '....DDDAAAAAADDD....',
        '.......DAAAAD.......',
        '......DFFFFFFD......',
        '.....DFFGGGGFFD.....',
        '.....DFFGGGGFFD.....',
        '......DFFFFFFD......',
        '.......DDDDDD.......',
        '....................',
        '....................',
      ],
      [
        '..D..............D..',
        '...D............D...',
        '....DD..DDDD..DD....',
        '.......DASSAD.......',
        '.......DAAAAD.......',
        '.....DDBBBBBBDD.....',
        '.DCCCCDBBBBBBDCCCCD.',
        'DCCCCCDBBBBBBDCCCCCD',
        'DCCCCCDAAAAAADCCCCCD',
        '.DCCCCDAAAAAADCCCCD.',
        '..DCCDDAAAAAADDCCD..',
        '....DDDAAAAAADDD....',
        '.......DAAAAD.......',
        '......DFFFFFFD......',
        '.....DFFGGGGFFD.....',
        '.....DFFGGGGFFD.....',
        '......DFFFFFFD......',
        '.......DDDDDD.......',
        '....................',
        '....................',
      ],
    ],
  },

  rhinobeetle: {
    accent: { F: '#4A3524' },
    frames: [
      [
        '.........FF.........',
        '........FF..........',
        '.......FF...........',
        '.......FFF..........',
        '........FFF.........',
        '.......DDDDDD.......',
        '......DASDDSAD......',
        '.....DDAAAAAADD.....',
        '...DDAAAAAAAAAADD...',
        'DDDDABBBBBBBBBBADDDD',
        'D..DABBBBBBBBBBAD..D',
        '...DABBBBBBBBBBAD...',
        'DDDDABBBBBBBBBBADDDD',
        'D..DAABBBBBBBBAAD..D',
        '...DAAAAAAAAAAAAD...',
        'DDDD.DDAAAAAADD.DDDD',
        '.......DDDDDD.......',
        '....................',
        '....................',
        '....................',
      ],
    ],
  },

  swallowtail: {
    accent: { F: '#F2C14E' },
    frames: [
      [
        '....................',
        '......D......D......',
        '.......D....D.......',
        '........DDDD........',
        '.......DASSAD.......',
        '..DDDD..DAAD..DDDD..',
        '.DCCCCD.DAAD.DCCCCD.',
        'DCCFFCCDDAADDCCFFCCD',
        'DCCCCCCDDAADDCCCCCCD',
        '..DCCCD.DAAD.DCCCD..',
        '..DDDD..DAAD..DDDD..',
        '...DDDD.DAAD.DDDD...',
        '..DCCCCDDAADDCCCCD..',
        '..DCFCCDDAADDCCFCD..',
        '..DCCCCDDAADDCCCCD..',
        '...DCCD.DAAD.DCCD...',
        '....DDD.DAAD.DDD....',
        '.....DD.DAAD.DD.....',
        '........DDDD........',
        '....................',
      ],
      [
        '....................',
        '......D......D......',
        '.......D....D.......',
        '........DDDD........',
        '.......DASSAD.......',
        '....DD..DAAD..DD....',
        '...DCCD.DAAD.DCCD...',
        '..DCFCD.DAAD.DCFCD..',
        '..DCCCD.DAAD.DCCCD..',
        '...DCCD.DAAD.DCCD...',
        '....DD..DAAD..DD....',
        '....DDD.DAAD.DDD....',
        '...DCCCDDAADDCCCD...',
        '...DCFCDDAADDCFCD...',
        '...DCCCDDAADDCCCD...',
        '....DCCDDAADDCCD....',
        '.....DD.DAAD.DD.....',
        '......D.DAAD.D......',
        '........DDDD........',
        '....................',
      ],
    ],
  },

  damselfly: {
    accent: { F: '#8FD3E8' },
    frames: [
      [
        '....................',
        '........DDD.........',
        '.......DASDAD.......',
        '.......DASDAD.......',
        '........DDD.........',
        '.........DD.........',
        '..DDDDD..DD..DDDDD..',
        '.DFFFFFD.DD.DFFFFFD.',
        '..DDDDD..DD..DDDDD..',
        '...DDDD..DD..DDDD...',
        '..DFFFD..DD..DFFFD..',
        '...DDD...DD...DDD...',
        '.........DD.........',
        '........DAAD........',
        '........DBBD........',
        '........DAAD........',
        '........DBBD........',
        '........DAAD........',
        '.........DD.........',
        '....................',
      ],
      [
        '....................',
        '........DDD.........',
        '.......DASDAD.......',
        '.......DASDAD.......',
        '........DDD.........',
        '.........DD.........',
        '...DDDD..DD..DDDD...',
        '..DFFFD..DD..DFFFD..',
        '...DDD...DD...DDD...',
        '..DDDDD..DD..DDDDD..',
        '.DFFFFFD.DD.DFFFFFD.',
        '..DDDDD..DD..DDDDD..',
        '.........DD.........',
        '........DAAD........',
        '........DBBD........',
        '........DAAD........',
        '........DBBD........',
        '........DAAD........',
        '.........DD.........',
        '....................',
      ],
    ],
  },

  // ──────────── 可愛動物 ────────────
  cat: {
    accent: { F: '#E9A0A8' },
    frames: [[
      '....................',
      '....D..........D....',
      '....DAD......DAD....',
      '...DAFAD....DAFAD...',
      '...DAAADDDDDDAAAD...',
      '....DAAAAAAAAAAD....',
      '...DAAAAAAAAAAAAD...',
      '...DASDAAAAAADSAD...',
      '...DADDAAAAAADDAD...',
      '...DAAAAAFFAAAAAD...',
      '...DAAAADAADAAAAD...',
      '....DAAAAAAAAAAD....',
      '.....DDAAAAAADD.DDD.',
      '.....DAACCCCAAD.DAD.',
      '.....DAACCCCAAD.DAD.',
      '.....DAACCCCAAD.DAD.',
      '.....DAAACCAAADDDAD.',
      '.....DAAAAAAAADDDDD.',
      '.....DDDD..DDDD.....',
      '....................',
    ]],
  },

  dog: {
    accent: { F: '#E9A0A8' },
    frames: [[
      '....................',
      '....................',
      '....................',
      '.....DDDDDDDDDD.....',
      'DBBD.DAAAAAAAAD.DBBD',
      'DBBDDAAAAAAAAAADDBBD',
      'DBBDAAAAAAAAAAAADBBD',
      'DBBDASDAAAAAADSADBBD',
      'DBBDADDAAAAAADDADBBD',
      'DBBDAAAACDDCAAAADBBD',
      'DBBDAAACCCCCCAAADBBD',
      'DBBDDAAACFFCAAADDBBD',
      '.DDDDDAAAAAAAADDDDD.',
      '.....DAACCCCAAD.....',
      '.....DAACCCCAAD.DDD.',
      '.....DAACCCCAAD.DAD.',
      '.....DAAACCAAADDDAD.',
      '.....DAAAAAAAADDDD..',
      '.....DDDD..DDDD.....',
      '....................',
    ]],
  },

  seal: {
    accent: { F: '#6B5A50' },
    frames: [[
      '....................',
      '....................',
      '....................',
      '......DDDDDDDD......',
      '....DDAAAAAAAADD....',
      '...DAAAAAAAAAAAAD...',
      '...DASDAAAAAADSAD...',
      '...DADDAAAAAADDAD...',
      '.D.DAAACCCCCCAAAD.D.',
      'DDDDAAACFFFFCAAADDDD',
      '.D.DAAACCDDCCAAAD.D.',
      '...DAAAACCCCAAAAD...',
      '....DAAAAAAAAAAD....',
      '....DAACCCCCCAAD....',
      '....DAACCCCCCAAD....',
      '...DAAACCCCCCAAAD...',
      '..DAAAAACCCCAAAAAD..',
      '.DAADDDDDDDDDDDDAAD.',
      '.DDD............DDD.',
      '....................',
    ]],
  },

  rabbit: {
    accent: { F: '#E9A0A8' },
    frames: [[
      '.......DD..DD.......',
      '......DFAD.DAFD.....',
      '......DFAD.DAFD.....',
      '......DFAD.DAFD.....',
      '......DAAD.DAAD.....',
      '.....DDAADDDAADD....',
      '....DAAAAAAAAAAAD...',
      '...DAAAAAAAAAAAAD...',
      '...DASDAAAAAADSAD...',
      '...DADDAAAAAADDAD...',
      '...DAAAAAFFAAAAAD...',
      '....DAAAADAADAAAD...',
      '.....DDAAAAAADD.....',
      '.....DAACCCCAAD.....',
      '.....DAACCCCAAD..DD.',
      '.....DAACCCCAAD.DCCD',
      '.....DAAACCAAAD.DCCD',
      '.....DAAAAAAAADDDDD.',
      '.....DDDD..DDDD.....',
      '....................',
    ]],
  },

  // ──────────── 保育動物 ────────────
  blackbear: {
    accent: { F: '#E9A0A8' },
    frames: [[
      '....................',
      '....................',
      '...DDD......DDD.....',
      '..DAAAD....DAAAD....',
      '..DAAADDDDDDAAAD....',
      '...DDAAAAAAAADD.....',
      '...DAAAAAAAAAAAD....',
      '...DASDAAAAAADSAD...',
      '...DADDAAAAAADDAD...',
      '...DAAACCCCCCAAAD...',
      '...DAAACFFFFCAAAD...',
      '....DAACCDDCCAAD....',
      '.....DDAAAAAADD.....',
      '.....DAEAAAAEAD.....',
      '.....DAAEAAEAAD.....',
      '.....DAAAEEAAAD.....',
      '.....DAAAAAAAAD.....',
      '.....DAAAAAAAAD.....',
      '.....DDDD..DDDD.....',
      '....................',
    ]],
  },

  leopardcat: {
    accent: { F: '#E9A0A8' },
    frames: [[
      '....................',
      '....D..........D....',
      '....DAD......DAD....',
      '...DAEAD....DAEAD...',
      '...DAAADDDDDDAAAD...',
      '....DABAAAAABAD.....',
      '...DAAAABAABAAAAD...',
      '...DASDAAAAAADSAD...',
      '...DADDAAAAAADDAD...',
      '...DAAAAAFFAAAAAD...',
      '...DAAAADAADAAAAD...',
      '....DAAAAAAAAAAD....',
      '.....DDAAAAAADD.DDD.',
      '.....DABCCCCBAD.DBD.',
      '.....DAACCCCAAD.DAD.',
      '.....DABCCCCBAD.DBD.',
      '.....DAAACCAAADDDAD.',
      '.....DABAAAABADDDDD.',
      '.....DDDD..DDDD.....',
      '....................',
    ]],
  },

  pangolin: {
    accent: { F: '#B98B5E' },
    frames: [[
      '....................',
      '....................',
      '.........DDDDDD.....',
      '.......DDFFFFFFDD...',
      '......DFFFFFFFFFFD..',
      '..DDDDFFDFFDFFDFFFD.',
      '.DAAADFFFFFFFFFFFFD.',
      'DASADFFDFFDFFDFFFFD.',
      'DADDDFFFFFFFFFFFFFD.',
      '.DAAADFFDFFDFFDFFD..',
      '..DDDDFFFFFFFFFFD...',
      '.....DFFDFFDFFDFD...',
      '.....DFFFFFFFFFFD...',
      '.....DAAFFFFFFAAD...',
      '.....DAAAAAAAAADDDD.',
      '.....DAAAAAAAADFFFD.',
      '.....DDDD..DDDDDFFD.',
      '.................DD.',
      '....................',
      '....................',
    ]],
  },

  otter: {
    accent: { F: '#6B5A50' },
    frames: [[
      '....................',
      '....................',
      '....DD........DD....',
      '...DAAD......DAAD...',
      '...DAAADDDDDDAAAD...',
      '....DAAAAAAAAAAD....',
      '...DAAAAAAAAAAAAD...',
      '...DASDAAAAAADSAD...',
      '...DADDAAAAAADDAD...',
      '...DAAACCCCCCAAAD...',
      '...DAAACFFFFCAAAD...',
      '....DAACCCCCCAAD....',
      '.....DDAAAAAADD.....',
      '.....DAACCCCAAD.....',
      '.....DAACCCCAAD.....',
      '.....DAACCCCAAD.DDD.',
      '.....DAAACCAAADDBBD.',
      '.....DAAAAAAAADBBD..',
      '.....DDDD..DDDDD....',
      '....................',
    ]],
  },

  redpanda: {
    accent: { F: '#C9633A' },
    frames: [[
      '....................',
      '....................',
      '...DDD......DDD.....',
      '..DEEED....DEEED....',
      '..DEEEDDDDDDEEED....',
      '...DDFFFFFFFFDD.....',
      '...DFFEEFFEEFFFD....',
      '...DFSDEEFFEEDSFD...',
      '...DFDDEEFFEEDDFD...',
      '...DFFEEEDDEEEFFD...',
      '....DFEEEEEEEEFD....',
      '.....DDFFFFFFDD.....',
      '.....DFFEEEEFFD.....',
      '.....DFFEEEEFFD.DDD.',
      '.....DFFEEEEFFD.DFD.',
      '.....DFFEEEEFFDDDED.',
      '.....DFFFEEFFFDDDFD.',
      '.....DFFFFFFFFDDDED.',
      '.....DDDD..DDDDDDDD.',
      '....................',
    ]],
  },

  fennec: {
    accent: { F: '#E9A0A8' },
    frames: [[
      '...DD..........DD...',
      '..DAAD........DAAD..',
      '..DAFAD......DAFAD..',
      '..DAFFAD....DAFFAD..',
      '..DAFFAD....DAFFAD..',
      '...DAFAD....DAFAD...',
      '...DAAADDDDDDAAAD...',
      '....DAAAAAAAAAAD....',
      '...DAAAAAAAAAAAAD...',
      '...DASDAAAAAADSAD...',
      '...DADDAAAAAADDAD...',
      '...DAAAAAFFAAAAAD...',
      '....DAAAADAADAAAD...',
      '.....DDAAAAAADD.....',
      '.....DAACCCCAAD.DDD.',
      '.....DAACCCCAAD.DCD.',
      '.....DAAACCAAADDDCD.',
      '.....DAAAAAAAADDDDD.',
      '.....DDDD..DDDD.....',
      '....................',
    ]],
  },

  axolotl: {
    accent: { F: '#F2A0C0' },
    frames: [[
      '....................',
      '....................',
      '..FF..........FF....',
      '.FDDF........FDDF...',
      '..FDF..........FDF..',
      '.FDDF.DDDDDD.FDDF...',
      '..FFDDAAAAAADDFF....',
      '...DAAAAAAAAAAD.....',
      '...DASDAAAADSAD.....',
      '...DADDAAAADDAD.....',
      '...DAAADDDDAAAD.....',
      '...DAAAAAAAAAAD.....',
      '....DAAAAAAAAD......',
      '....DAACCCCAAD......',
      '....DAACCCCAADDD....',
      '....DAACCCCAADAAD...',
      '....DAAACCAAADAAD...',
      '.....DAAAAAAADDAD...',
      '.....DDDD.DDDD.DD...',
      '....................',
    ]],
  },

  seaotter: {
    accent: { F: '#9AA7B5' },
    frames: [[
      '....................',
      '....................',
      '....DD........DD....',
      '...DAAD......DAAD...',
      '...DAAADDDDDDAAAD...',
      '....DAAAAAAAAAAD....',
      '...DAAAAAAAAAAAAD...',
      '...DASDAAAAAADSAD...',
      '...DADDAAAAAADDAD...',
      '...DAAACCCCCCAAAD...',
      '....DAACCDDCCAAD....',
      '.....DDAAAAAADD.....',
      '....DAACCCCCCAAD....',
      '...DAACCFFFFCCAAD...',
      '...DAACFFFFFFCAAD...',
      '...DAACCFFFFCCAAD...',
      '....DAACCCCCCAAD....',
      '.DDDDAAAAAAAAAADDDD.',
      '.DBBDDDDD..DDDDDBBD.',
      '.DDD............DDD.',
    ]],
  },

  bluedragon: {
    accent: { F: '#4A7FD0', G: '#BFE0F5' },
    frames: [[
      '....................',
      '....................',
      '....................',
      '.DD.....DDDD.....DD.',
      'DFFD...DFAAFD...DFFD',
      'DFFFD.DFFAAFFD.DFFFD',
      '.DFFDDFFAAAAFFDDFFD.',
      '..DFFFFAASSAAFFFFD..',
      '...DFFAADDDDAAFFD...',
      '.DD.DFAAAAAAAAFD.DD.',
      'DFFDDFAAGGGGAAFDDFFD',
      'DFFFDFAAGGGGAAFDFFFD',
      '.DFFFFAAGGGGAAFFFFD.',
      '..DFFFAAGGGGAAFFFD..',
      '...DDFAAAGGAAAFDD...',
      '.....DFAAAAAAFD.....',
      '......DFFAAFFD......',
      '.......DFFFFD.......',
      '........DDDD........',
      '....................',
    ]],
  },

  shoebill: {
    accent: { F: '#C9B48A' },
    frames: [[
      '.........DD.........',
      '........D..D........',
      '.......DDDDDD.......',
      '......DAAAAAAD......',
      '.....DASDAADSAD.....',
      '.....DADDAADDAD.....',
      '.....DAAAAAAAAD.....',
      '.....DFFFFFFFFD.....',
      '....DFFFFFFFFFFD....',
      '....DFFFDDDDFFFD....',
      '....DFFFFFFFFFFD....',
      '.....DDFFFFFFDD.....',
      '.......DDDDDD.......',
      '......DAAAAAAD......',
      '.....DAACCCCAAD.....',
      '.....DAACCCCAAD.....',
      '.....DAAACCAAAD.....',
      '.....DAAAAAAAAD.....',
      '......DFD..DFD......',
      '.....DFFD..DFFD.....',
    ]],
  },

  sawfish: {
    accent: { F: '#C9D4DC' },
    frames: [[
      '....................',
      '....................',
      '....................',
      '....................',
      '..............DDD...',
      '.........DDDDDDDDD..',
      '........DAAAAAAAAAD.',
      '.F.F.F.FDAAAAAAAAAAD',
      'DFFFFFFFDASDAAAAAAAD',
      'DFFFFFFFDADDAAAAAAAD',
      '.F.F.F.FDAAAAAAAAAAD',
      '........DAAAAAAAAAAD',
      '........DCCCCCCCCCAD',
      '.........DCCCCCCCDD.',
      '..........DDDDDDD...',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
    ]],
  },

  // ──────────── 精靈 ────────────
  sprite_moss: {
    accent: { F: '#7FBF8F', G: '#A9DBB4' },
    frames: [[
      '....................',
      '.........FF.........',
      '........FF..........',
      '.......FFF..........',
      '......FDDDDF........',
      '.....DFAAAAFD.......',
      '....DFAAAAAAFD......',
      '...DFAAAAAAAAFD.....',
      '...DAASDAADSAAD.....',
      '...DAADDAADDAAD.....',
      '...DFAAAAAAAAFD.....',
      '...DFAAADDAAAFD.....',
      '....DFAAAAAAFD......',
      '.....DFAAAAFD.......',
      '......DFFFFD........',
      '.......DDDD.........',
      '....................',
      '...G..........G.....',
      '..GGG........GGG....',
      '...G..........G.....',
    ]],
  },

  sprite_cloud: {
    accent: { F: '#8FD3E8' },
    frames: [[
      '....................',
      '....................',
      '.......DDDD.DDD.....',
      '...DDDDCCCCDDCCCDD..',
      '..DCCCCCCCCCCCCCCD..',
      '.DCCCCCCCCCCCCCCCCD.',
      '.DCCSDCCCCCCCCDSCCD.',
      '.DCCDDCCCCCCCCDDCCD.',
      '.DCCCCCCCDDCCCCCCCD.',
      '.DCCCCCCCCCCCCCCCCD.',
      '..DCCCCCCCCCCCCCCD..',
      '...DDCCCCCCCCCCDD...',
      '.....DDDDDDDDDD.....',
      '......F...F...F.....',
      '.....FFF.FFF.FFF....',
      '......F...F...F.....',
      '....................',
      '....................',
      '....................',
      '....................',
    ]],
  },

  sprite_flame: {
    accent: { F: '#F2A03C', G: '#F7D774' },
    frames: [[
      '.........F..........',
      '........FF..........',
      '.......FFFF.........',
      '......FFGGFF........',
      '.....DFGGGGFD.......',
      '....DFAGGGGAFD......',
      '...DFAAAAAAAAFD.....',
      '...DFASDAADSAFD.....',
      '...DFADDAADDAFD.....',
      '...DFAAAAAAAAFD.....',
      '...DFAAADDAAAFD.....',
      '...DFAAAAAAAAFD.....',
      '....DFAAAAAAFD......',
      '.....DFAAAAFD.......',
      '......DFFFFD........',
      '.......DDDD.........',
      '....................',
      '....................',
      '....................',
      '....................',
    ]],
  },

  sprite_star: {
    accent: { F: '#F7D774' },
    frames: [[
      '.........D..........',
      '........DFD.........',
      '........DFD.........',
      '.......DFFFD........',
      'DDDD...DFFFD...DDDD.',
      'DFFFDDDFFFFFDDDFFFD.',
      '.DFFFFFFFFFFFFFFFD..',
      '..DFFFFFFFFFFFFFD...',
      '...DFFSDFFFFDSFFD...',
      '...DFFDDFFFFDDFFD...',
      '...DFFFFFDDFFFFFD...',
      '....DFFFFFFFFFFD....',
      '....DFFFFFFFFFFD....',
      '...DFFFDDDDDDFFFD...',
      '..DFFFD......DFFFD..',
      '.DFFFD........DFFFD.',
      '.DDDD..........DDDD.',
      '....................',
      '....................',
      '....................',
    ]],
  },

  // ──────────── 精靈：神話生物 ────────────
  kitsune: {                                   // 九尾狐：身後六條蓬尾扇形展開（金色尾尖）
    accent: { F: '#F0C64A' },
    frames: [
      [
        '.......FF..FF.......',
        '......DFFDDFFD......',
        '....FFDAADDAADFF....',
        '...DFFDAADDAADFFD...',
        '.FFDBBDAADDAADBBDFF.',
        'DAADBBDAADDAADBBDAAD',
        'DAADBBDAADDAADBBDAAD',
        '.DADBBDAADDAADBBDAD.',
        '...DDDAAAAAAAADDD...',
        '......DAAAAAAD......',
        '...DADDDDDDDDDDAD...',
        '..DABAAAAAAAAAABAD..',
        '..DAAAAAAAAAAAAAAD..',
        '..DAAAAAAAAAAAAAAD..',
        '..DASSDAAAAAADSSAD..',
        '..DADDDAAAAAADDDAD..',
        '..DAAAAAADDAAAAAAD..',
        '...DAAAADDDDAAAAD...',
        '....DDEEEEEEEEDD....',
        '.....DEEEEEEEED.....',
      ],
      [
        '.......FF..FF.......',
        '......DFFDDFFD......',
        '....FFDBBDDBBDFF....',
        '...DFFDBBDDBBDFFD...',
        '.FFDAADBBDDBBDAADFF.',
        'DBBDAADBBDDBBDAADBBD',
        'DBBDAADBBDDBBDAADBBD',
        '.DBDAADBBDDBBDAADBD.',
        '...DDDBBBBBBBBDDD...',
        '......DBBBBBBD......',
        '...DADDDDDDDDDDAD...',
        '..DABAAAAAAAAAABAD..',
        '..DAAAAAAAAAAAAAAD..',
        '..DAAAAAAAAAAAAAAD..',
        '..DASSDAAAAAADSSAD..',
        '..DADDDAAAAAADDDAD..',
        '..DAAAAAADDAAAAAAD..',
        '...DAAAADDDDAAAAD...',
        '....DDEEEEEEEEDD....',
        '.....DEEEEEEEED.....',
      ],
    ],
  },

  phoenix: {                                   // 不死鳥：金紅火焰羽翼 + 帶火星尾羽
    accent: { F: '#F04E32', G: '#FFD24A' },
    frames: [
      [
        '..G..............G..',
        '.....G........G.....',
        '........DDDD........',
        '.......DAAAAD.......',
        '......DASDDSAD......',
        '......DAAGGAAD......',
        '.......DDGGDD.......',
        '..DDDD.DAAAAD.DDDD..',
        '.DFFFFDDAAAADDFFFFD.',
        'DFGGFFDDAGGADDFFGGFD',
        'DFFGGFFDAGGADFFGGFFD',
        '.DFFFFDDAGGADDFFFFD.',
        '..DDDD.DAAAAD.DDDD..',
        '.......DAAAAD.......',
        '......DFAAAAFD......',
        '.....DFFAAAAFFD.....',
        '....DFFGGAAGGFFD....',
        '...DFFD.DFFD.DFFD...',
        '....GG...GG...GG....',
        '.....G....G....G....',
      ],
      [
        '.....G........G.....',
        '..G..............G..',
        '........DDDD........',
        '.......DAAAAD.......',
        '......DASDDSAD......',
        '......DAAGGAAD......',
        '.......DDGGDD.......',
        '..DDDD.DAAAAD.DDDD..',
        '.DFGGFDDAAAADDFGGFD.',
        'DFFFFFDDAGGADDFFFFFD',
        'DFGGFFFDAGGADFFFGGFD',
        '.DFFFFDDAGGADDFFFFD.',
        '..DDDD.DAAAAD.DDDD..',
        '.......DAAAAD.......',
        '......DFAAAAFD......',
        '.....DFFAAAAFFD.....',
        '....DFFGGAAGGFFD....',
        '...DFFD.DFFD.DFFD...',
        '....GG...GG...GG....',
        '...G.G...G.G...G.G..',
      ],
    ],
  },

  qilin: {                                     // 麒麟：額上單角 + 鱗片身 + 牛尾
    accent: { F: '#E8C56A' },
    frames: [
      [
        '.........FF.........',
        '.........FF.........',
        '........DFFD........',
        '...DD...DFFD...DD...',
        '..DAAD.DDDDDD.DAAD..',
        '..DAAADDAAAADDAAAD..',
        '...DAAAAAAAAAAAAD...',
        '...DASDAAAAAADSAD...',
        '...DADDAAAAAADDAD...',
        '...DAAAAADDAAAAAD...',
        '....DAAAADDAAAAD....',
        '.....DDAAAAAADD.....',
        '....DBABABABABAD....',
        '...DABABABABABAD..DD',
        '...DBABABABABABD.DBD',
        '...DABABABABABAD.DBD',
        '...DBABABABABABD.DBD',
        '...DABABABABABAD.DBD',
        '....DAAD..DAAD.DBBD.',
        '....DDDD..DDDD.DDDD.',
      ],
      [
        '.........FF.........',
        '.........FF.........',
        '........DFFD........',
        '...DD...DFFD...DD...',
        '..DAAD.DDDDDD.DAAD..',
        '..DAAADDAAAADDAAAD..',
        '...DAAAAAAAAAAAAD...',
        '...DASDAAAAAADSAD...',
        '...DADDAAAAAADDAD...',
        '...DAAAAADDAAAAAD...',
        '....DAAAADDAAAAD....',
        '.....DDAAAAAADD.....',
        '....DABABABABABD....',
        '...DBABABABABABD..DD',
        '...DABABABABABAD.DBD',
        '...DBABABABABABD.DBD',
        '...DABABABABABAD.DBD',
        '...DBABABABABABD.DBD',
        '....DAAD..DAAD.DBBD.',
        '....DDDD..DDDD.DDDD.',
      ],
    ],
  },

  baize: {                                     // 白澤：雪白身、雙彎角、身上三隻小眼睛（會眨）
    accent: { F: '#D8C49A' },
    frames: [
      [
        '..DFFD........DFFD..',
        '.DFFD..........DFFD.',
        '.DFD............DFD.',
        '..DFD..........DFD..',
        '...DFFDDDDDDDDFFD...',
        '...DCCCCCCCCCCCCD...',
        '...DCCCCCCCCCCCCD...',
        '...DCSDCCCCCCDSCD...',
        '...DCDDCCCCCCDDCD...',
        '...DCCCCCDDCCCCCD...',
        '....DCCCCDDCCCCD....',
        '.....DDCCCCCCDD.....',
        '...DCCCCCCCCCCCCD...',
        '...DCDDCCCCCCDDCD...',
        '...DCSDCCCCCCSDCD...',
        '...DCCCCCCCCCCCCD...',
        '...DCCCCCDDCCCCCD...',
        '...DAACCCSDCCCAAD...',
        '.....DCCD.DCCD..DD..',
        '.....DDDD.DDDD..DD..',
      ],
      [
        '..DFFD........DFFD..',
        '.DFFD..........DFFD.',
        '.DFD............DFD.',
        '..DFD..........DFD..',
        '...DFFDDDDDDDDFFD...',
        '...DCCCCCCCCCCCCD...',
        '...DCCCCCCCCCCCCD...',
        '...DCSDCCCCCCDSCD...',
        '...DCDDCCCCCCDDCD...',
        '...DCCCCCDDCCCCCD...',
        '....DCCCCDDCCCCD....',
        '.....DDCCCCCCDD.....',
        '...DCCCCCCCCCCCCD...',
        '...DCCCCCCCCCCCCD...',
        '...DCDDCCCCCCDDCD...',
        '...DCCCCCCCCCCCCD...',
        '...DCCCCCCCCCCCCD...',
        '...DAACCCDDCCCAAD...',
        '.....DCCD.DCCD..DD..',
        '.....DDDD.DDDD..DD..',
      ],
    ],
  },

  dijiang: {                                   // 帝江：無臉布囊身、四翅六足、體內透紅光
    accent: { F: '#E0604A' },
    frames: [
      [
        '....................',
        '.DD..............DD.',
        'DCCD............DCCD',
        'DCCD............DCCD',
        'DCCDDDDDDDDDDDDDDCCD',
        '.DD.DAAAAAAAAAAD.DD.',
        '....DAAAAFFAAAAD....',
        '.DD.DAAAFFFFAAAD.DD.',
        'DCCDDAAAFFFFAAADDCCD',
        'DCCDDAAAFFFFAAADDCCD',
        'DCCDDAAAFFFFAAADDCCD',
        '.DD.DAAAAFFAAAAD.DD.',
        '....DAAAAAAAAAAD....',
        '....DAAAAAAAAAAD....',
        '....DAAAAAAAAAAD....',
        '....DDDDDDDDDDDD....',
        '.....D.D.D.D.D.D....',
        '.....D.D.D.D.D.D....',
        '.....D.D.D.D.D.D....',
        '....................',
      ],
      [
        '.DD..............DD.',
        'DCCD............DCCD',
        'DCCD............DCCD',
        'DCCDDDDDDDDDDDDDDCCD',
        '.DD.DAAAAAAAAAAD.DD.',
        '....DAAAAAAAAAAD....',
        '....DAAAAAAAAAAD....',
        '.DD.DAAAAFFAAAAD.DD.',
        'DCCDDAAAFFFFAAADDCCD',
        'DCCDDAAAFFFFAAADDCCD',
        'DCCDDAAAAFFAAAADDCCD',
        '.DD.DAAAAAAAAAAD.DD.',
        '....DAAAAAAAAAAD....',
        '....DAAAAAAAAAAD....',
        '....DAAAAAAAAAAD....',
        '....DDDDDDDDDDDD....',
        '....D.D.D.D.D.D.....',
        '....D.D.D.D.D.D.....',
        '....D.D.D.D.D.D.....',
        '....................',
      ],
    ],
  },

  kelpie: {                                    // 凱爾派：水馬，鬃毛如海藻般垂墜滴水
    accent: { F: '#3E6B52', G: '#9FD6E0' },
    frames: [
      [
        '......D......D......',
        '.....DAD....DAD.....',
        '..FFFDDDDDDDDDDFFF..',
        '.FFFFDAAAAAAAADFFFF.',
        '.FDFFDAAAAAAAADFFDF.',
        '.FDFFDAAAAAAAADFFDF.',
        '.FDFFDASDAADSADFFDF.',
        '.FDFFDADDAADDADFFDF.',
        '.FDFFDAAAAAAAADFFDF.',
        '.FDFFDAAAAAAAADFFDF.',
        '.FDFFDDAAAAAADDFFDF.',
        '.FDFF.DAAAAAAD.FFDF.',
        '.FDFF.DADDDDAD.FFDF.',
        '.FDFF.DAAAAAAD.FFDF.',
        '.FDF...DAAAAD...FDF.',
        '.FF....DAAAAD....FF.',
        '.G.....DAAAAD.....G.',
        '......DAAAAAAD......',
        '.....DAAAAAAAAD.....',
        '.....DDDD..DDDD.....',
      ],
      [
        '......D......D......',
        '.....DAD....DAD.....',
        '..FFFDDDDDDDDDDFFF..',
        '.FFFFDAAAAAAAADFFFF.',
        '.FDFFDAAAAAAAADFFDF.',
        '.FDFFDAAAAAAAADFFDF.',
        '.FDFFDASDAADSADFFDF.',
        '.FDFFDADDAADDADFFDF.',
        '.FDFFDAAAAAAAADFFDF.',
        '.FDFFDAAAAAAAADFFDF.',
        '.FDFFDDAAAAAADDFFDF.',
        '.FDFF.DAAAAAAD.FFDF.',
        '.FDFF.DADDDDAD.FFDF.',
        '.FDFF.DAAAAAAD.FFDF.',
        '.FDFF..DAAAAD..FFDF.',
        '.FDF...DAAAAD...FDF.',
        '.FF....DAAAAD....FF.',
        '.G....DAAAAAAD....G.',
        '.....DAAAAAAAAD.....',
        '.....DDDD..DDDD.....',
      ],
    ],
  },

  ouroboros: {                                 // 銜尾蛇：身體圍成環、頭咬住自己的尾巴
    frames: [
      [
        '....DDDDDDD.........',
        '..DDAAAAAAADD.......',
        '..DASSDAAADAAAAAD...',
        '..DADDAADDDAAAAAAD..',
        '.DAABBBBBBBBBBBBAAD.',
        '.DABBAD......DABBAD.',
        'DABBAD........DABBAD',
        'DABBD..........DBBAD',
        'DABBD..........DBBAD',
        'DABD............DBAD',
        'DABD............DBAD',
        'DABBD..........DBBAD',
        'DABBD..........DBBAD',
        'DABBAD........DABBAD',
        '.DABBAD......DABBAD.',
        '.DAABBBBBBBBBBBBAAD.',
        '..DAABBBBBBBBBBAAD..',
        '...DAABBBBBBBBAAD...',
        '....DDAAAAAAAADD....',
        '......DDDDDDDD......',
      ],
      [
        '....DDDDDDD.........',
        '..DDBBBBBBBDD.......',
        '..DBSSDBBBDBBBBBD...',
        '..DBDDBBDDDBBBBBBD..',
        '.DBBAAAAAAAAAAAABBD.',
        '.DBAABD......DBAABD.',
        'DBAABD........DBAABD',
        'DBAAD..........DAABD',
        'DBAAD..........DAABD',
        'DBAD............DABD',
        'DBAD............DABD',
        'DBAAD..........DAABD',
        'DBAAD..........DAABD',
        'DBAABD........DBAABD',
        '.DBAABD......DBAABD.',
        '.DBBAAAAAAAAAAAABBD.',
        '..DBBAAAAAAAAAABBD..',
        '...DBBAAAAAAAABBD...',
        '....DDBBBBBBBBDD....',
        '......DDDDDDDD......',
      ],
    ],
  },

  basilisk: {                                  // 巴西利斯克：蛇王，頭戴雞冠形黃金王冠，腹部貼地
    accent: { F: '#F0C64A' },
    frames: [
      [
        '.....F...F...F......',
        '....FFF.FFF.FFF.....',
        '...DFFFFFFFFFFFFD...',
        '...DDDDDDDDDDDDDD...',
        '...DAAAAAAAAAAAAD...',
        '...DASSDAAAADSSAD...',
        '...DADDDAAAADDDAD...',
        '...DAAAAAAAAAAAAD...',
        '....DAAADDDDAAAD....',
        '.....DDAAAAAADD.....',
        '.......DAAAAD.......',
        '.......DAAAAD.......',
        '......DAAAAAAD......',
        '.....DAAAAAAAAD.....',
        '....DAABBBBBBAAD....',
        '...DAABBDDDDBBAAD...',
        '..DAABBDAAAADBBAAD..',
        '.DAABBDAAAAAADBBAAD.',
        '.DAAAAAAAAAAAAAAAAD.',
        '.DDDDDDDDDDDDDDDDDD.',
      ],
      [
        '.....F...F...F......',
        '....FFF.FFF.FFF.....',
        '...DFFFFFFFFFFFFD...',
        '...DDDDDDDDDDDDDD...',
        '...DAAAAAAAAAAAAD...',
        '...DASSDAAAADSSAD...',
        '...DADDDAAAADDDAD...',
        '...DAAAAAAAAAAAAD...',
        '....DAAADDDDAAAD....',
        '.....DDAAAAAADD.....',
        '.......DAAAAD.......',
        '.......DAAAAD.......',
        '......DAAAAAAD......',
        '.....DAAAAAAAAD.....',
        '....DBBAAAAAABBD....',
        '...DBBAADDDDAABBD...',
        '..DBBAADBBBBDAABBD..',
        '.DBBAADBBBBBBDAABBD.',
        '.DAAAAAAAAAAAAAAAAD.',
        '.DDDDDDDDDDDDDDDDDD.',
      ],
    ],
  },
  behemoth: {                                  // 貝希摩斯：前高後低巨獸，前伸巨角 + 背脊骨刺
    accent: { F: '#D8C49A' },
    frames: [
      [
        '....................',
        '....................',
        'DFFD................',
        'DFDFD...............',
        '.DFDFD..............',
        'DFFDFFD.F.F.F.......',
        'DFFDFFDDDDDDD.F.F...',
        '.DFFDFDAAAAAAADDDD..',
        '..DDDASSDAAAAAAAAADD',
        '..DAAADDAAAAAAAAAAAD',
        '.DAAAAAAAAAAAAAAAAAD',
        'DAADDAAAAAAAAAAAAAAD',
        'DAAAAAAAAAAAAAAAAAAD',
        '.DAAAAAAAAAAAAAAAAD.',
        '.DAAAAAAAAAAAAAAAAD.',
        '..DDAAADDDDDDAAADD..',
        '...DAAD......DAAD...',
        '...DAAD......DAAD...',
        '...DAAD......DAAD...',
        '...DDDD......DDDD...',
      ],
      [
        '....................',
        '....................',
        'DFFD................',
        'DFDFD...............',
        '.DFDFD..............',
        'DFFDFFD.F.F.F.......',
        'DFFDFFDDDDDDD.F.F...',
        '.DFFDFDAAAAAAADDDD..',
        '..DDDASSDAAAAAAAAADD',
        '..DAAADDAAAAAAAAAAAD',
        '.DAAAAAAAAAAAAAAAAAD',
        'DAADDAAAAAAAAAAAAAAD',
        'DAAAAAAAAAAAAAAAAAAD',
        '.DAAAAAAAAAAAAAAAAD.',
        '.DBBAAAAAAAAAAAABBD.',
        '..DDAAADDDDDDAAADD..',
        '...DAAD......DAAD...',
        '...DAAD......DAAD...',
        '...DAAD......DAAD...',
        '...DDDD......DDDD...',
      ],
    ],
  },

  ammit: {                                     // 阿米特：鱷魚頭 + 獅子前身 + 河馬後身，三段拼接
    accent: { F: '#8FBF7A' },
    frames: [
      [
        '....................',
        '....................',
        '....................',
        '....................',
        '....................',
        '....................',
        '........DDDDD.......',
        '.......DBBBBBBD.....',
        '.......DBBBBBBDDDD..',
        '..DDDDDBBBBBBDCCCCD.',
        '.DFFSFFDBBBBBDCCCCCD',
        'DFFFFFFDBAAAABDCCCCD',
        'DDDDDDDDBAAAABDCCCCD',
        'DFFFFFFDBAAAABDCCCCD',
        '.DDDDDDDDAAAAADCCCCD',
        '........DAAAAADCCCCD',
        '........DAAAAADCCCCD',
        '........DAAAAADCCCCD',
        '.........DAAD.DCCCD.',
        '.........DDDD.DDDDD.',
      ],
      [
        '....................',
        '....................',
        '....................',
        '....................',
        '....................',
        '....................',
        '........DDDDD.......',
        '.......DBBBBBBD.....',
        '.......DBBBBBBDDDD..',
        '..DDDDDBBBBBBDCCCCD.',
        '.DFFSFFDBBBBBDCCCCCD',
        'DFFFFFFDBAAAABDCCCCD',
        'DDDDDDDDBAAAABDCCCCD',
        '.......DBAAAABDCCCCD',
        'DFFFFFFDDAAAAADCCCCD',
        'DDDDDDD.DAAAAADCCCCD',
        '........DAAAAADCCCCD',
        '........DAAAAADCCCCD',
        '.........DAAD.DCCCD.',
        '.........DDDD.DDDDD.',
      ],
    ],
  },

  jianbird: {                                  // 比翼鳥：兩隻對比色的半身緊貼共用中心，左右各一單翼
    accent: { F: '#E8A54C' },
    frames: [
      [
        '....................',
        '.....DDDDDDDDDD.....',
        '....DBBBBDDCCCCD....',
        '....DBSBBDDCCSCD....',
        '....DBDBBDDCCDCD....',
        '...FDBBBBDDCCCCDF...',
        '....DBBBBDDCCCCD....',
        'DDDDDBBBBDDCCCCDDDDD',
        'DBBDDBBBBDDCCCCDDCCD',
        'DBBDDBBBBDDCCCCDDCCD',
        'DBBDDBBBBDDCCCCDDCCD',
        'DDDDDBBBBDDCCCCDDDDD',
        '....DBBBBDDCCCCD....',
        '....DBBBBDDCCCCD....',
        '.....DBBBDDCCCD.....',
        '.....DBBBDDCCCD.....',
        '......DBBDDCCD......',
        '......DDDDDDDD......',
        '.......DD..DD.......',
        '......DDD..DDD......',
      ],
      [
        '....................',
        '.....DDDDDDDDDD.....',
        '....DBBBBDDCCCCD....',
        '....DBSBBDDCCSCD....',
        '....DBDBBDDCCDCD....',
        '...FDBBBBDDCCCCDF...',
        '....DBBBBDDCCCCD....',
        '....DBBBBDDCCCCD....',
        'DDDDDBBBBDDCCCCDDDDD',
        'DBBDDBBBBDDCCCCDDCCD',
        'DBBDDBBBBDDCCCCDDCCD',
        'DDDDDBBBBDDCCCCDDDDD',
        '....DBBBBDDCCCCD....',
        '....DBBBBDDCCCCD....',
        '.....DBBBDDCCCD.....',
        '.....DBBBDDCCCD.....',
        '......DBBDDCCD......',
        '......DDDDDDDD......',
        '.......DD..DD.......',
        '......DDD..DDD......',
      ],
    ],
  },

  goldencrow: {                                // 三足金烏：圓滾滾黑鳥、頭頂火苗、身下三隻腳
    accent: { F: '#F5C542' },
    frames: [
      [
        '.........F..........',
        '........FFF.........',
        '.......FFFFF........',
        '.......DFFFD........',
        '......DDDDDDDD......',
        '....DDAAAAAAAADD....',
        '...DAAAAAAAAAAAAD...',
        '...DASSDAAAADSSAD...',
        '...DADDDAAAADDDAD...',
        '..DAAAAAFFFFAAAAAD..',
        '..DAAAAAADDAAAAAAD..',
        '..DAAAAAAAAAAAAAAD..',
        '..DBBAAAAAAAAAABBD..',
        '..DBBAAAAAAAAAABBD..',
        '...DBBAAAAAAAABBD...',
        '....DDAAAAAAAADD....',
        '.....DDDDDDDDDD.....',
        '......D...D...D.....',
        '......D...D...D.....',
        '.....DDD.DDD.DDD....',
      ],
      [
        '........F...........',
        '.......FFFF.........',
        '.......FFFFF........',
        '.......DFFFD........',
        '......DDDDDDDD......',
        '....DDAAAAAAAADD....',
        '...DAAAAAAAAAAAAD...',
        '...DASSDAAAADSSAD...',
        '...DADDDAAAADDDAD...',
        '..DAAAAAFFFFAAAAAD..',
        '..DAAAAAADDAAAAAAD..',
        '..DBBAAAAAAAAAABBD..',
        '..DBBAAAAAAAAAABBD..',
        '..DBBAAAAAAAAAABBD..',
        '...DBBAAAAAAAABBD...',
        '....DDAAAAAAAADD....',
        '.....DDDDDDDDDD.....',
        '......D...D...D.....',
        '......D...D...D.....',
        '.....DDD.DDD.DDD....',
      ],
    ],
  },
  thunderbird: {                               // 雷鳥：雙翼平伸，兩側 Z 字形閃電
    accent: { F: '#F5D34A' },
    frames: [
      [
        '....................',
        '........DDDD........',
        '.......DAAAAD.......',
        '......DASDDSAD......',
        '......DAAFFAAD......',
        '.......DDFFDD.......',
        '.......DAAAAD.......',
        'FFFF...DAAAAD...FFFF',
        '...FDDDDDDDDDDDDF...',
        '..FDAAAAAAAAAAAADF..',
        '.FDAAAAAAAAAAAAAADF.',
        'FFFDAAAAAAAAAAAADFFF',
        '....DDDDDDDDDDDD....',
        '.......DAAAAD.......',
        '.......DAAAAD.......',
        '......DAAAAAAD......',
        '......DAAAAAAD......',
        '......DDAAAADD......',
        '.......DD..DD.......',
        '......DDD..DDD......',
      ],
      [
        '....................',
        '........DDDD........',
        '.......DAAAAD.......',
        '......DASDDSAD......',
        '......DAAFFAAD......',
        '.......DDFFDD.......',
        '.......DAAAAD.......',
        'F.F.F..DAAAAD..F.F.F',
        '....DDDDDDDDDDDDD...',
        '..FDAAAAAAAAAAAADF..',
        '.FDAAAAAAAAAAAAAADF.',
        'F.FDAAAAAAAAAAAADF.F',
        '...DDDDDDDDDDDDD....',
        '.......DAAAAD.......',
        '.......DAAAAD.......',
        '......DAAAAAAD......',
        '......DAAAAAAD......',
        '......DDAAAADD......',
        '.......DD..DD.......',
        '......DDD..DDD......',
      ],
    ],
  },

  carbuncle: {                                 // 寶石獸：長耳小獸，額頭正中一顆紅色菱形寶石
    accent: { F: '#E0483F' },
    frames: [
      [
        '..DDD..........DDD..',
        '..DCD..........DCD..',
        '..DCD..........DCD..',
        '..DCD..........DCD..',
        '..DCDDDDDDDDDDDDCD..',
        '...DAAAAAFFAAAAAD...',
        '...DAAAAFFFFAAAAD...',
        '...DAAAAAFFAAAAAD...',
        '...DASSDAAAADSSAD...',
        '...DADDDAAAADDDAD...',
        '...DAAAAADDAAAAAD...',
        '....DAAAADDAAAAD....',
        '.....DDAAAAAADD.....',
        '....DAAAAAAAAAAD....',
        '....DAAACCCCAAAD....',
        '....DAAACCCCAAAD....',
        '....DAAAACCAAAAD....',
        '.....DAAAAAAAAD.....',
        '.....DAAD..DAAD.....',
        '.....DDDD..DDDD.....',
      ],
      [
        '..DDD..........DDD..',
        '..DCD..........DCD..',
        '..DCD..........DCD..',
        '..DCD..........DCD..',
        '..DCDDDDDDDDDDDDCD..',
        '...DAAAAACFAAAAAD...',
        '...DAAAACFFFAAAAD...',
        '...DAAAAAFFAAAAAD...',
        '...DASSDAAAADSSAD...',
        '...DADDDAAAADDDAD...',
        '...DAAAAADDAAAAAD...',
        '....DAAAADDAAAAD....',
        '.....DDAAAAAADD.....',
        '....DAAAAAAAAAAD....',
        '....DAAACCCCAAAD....',
        '....DAAACCCCAAAD....',
        '....DAAAACCAAAAD....',
        '.....DAAAAAAAAD.....',
        '.....DAAD..DAAD.....',
        '.....DDDD..DDDD.....',
      ],
    ],
  },

  jormungandr: {                               // 耶夢加得：起伏盤繞的粗蛇身，蛇頭兩顆大獠牙（萌版）
    frames: [
      [
        '....................',
        '.DDDD...............',
        'DAAAAD..............',
        'DASSAD..............',
        'DADDAD..............',
        'DAEAED..............',
        'DAEAEDDDDDDDDDDDD...',
        'DAAAAAAAAAAAAAAAAD..',
        'DAAAAAAAAAAAAAAAAAD.',
        'DDDDDDDDDDDDDDAAAAD.',
        '.............DAAAAD.',
        '..DDDDDDDDDDDDAAAAD.',
        '.DAAAAAAAAAAAAAAAAD.',
        'DAAAAAAAAAAAAAAAAAD.',
        'DAAAADDDDDDDDDDDDDD.',
        'DAAAAD..............',
        'DAAAAD..............',
        '.DAAAD..............',
        '.DAAD...............',
        '..DD................',
      ],
      [
        '.DDDD...............',
        'DAAAAD..............',
        'DASSAD..............',
        'DADDAD..............',
        'DAAAAD..............',
        'DAEAED..............',
        'DDAAADDDDDDDDDDDD...',
        'DAAAAAAAAAAAAAAAAD..',
        'DAAAAAAAAAAAAAAAAAD.',
        'DDDDDDDDDDDDDDAAAAD.',
        '.............DAAAAD.',
        '..DDDDDDDDDDDDAAAAD.',
        '.DAAAAAAAAAAAAAAAAD.',
        'DAAAAAAAAAAAAAAAAAD.',
        'DAAAADDDDDDDDDDDDDD.',
        'DAAAAD..............',
        'DAAAAD..............',
        '.DAAAD..............',
        '.DAAD...............',
        '..DD................',
      ],
    ],
  },

  ratatoskr: {                                 // 世界樹松鼠：誇張大門牙 + 背後蓬鬆巨尾、頭頂兩根耳毛
    frames: [
      [
        '....................',
        '.D....D.............',
        '.DD..DD.....DDD.....',
        'DAADDAAD...DBBBD....',
        'DAAAAAAD..DBBABBD...',
        'DASSDAAD.DBBBABBD...',
        'DADDDAAD.DBBBABBD...',
        'DAAAAAADDBBBABBBD...',
        'DAADDAADDBBBABBBD...',
        'DAEEEEADDBBBABBBD...',
        'DAEEEEADDBBBABBBD...',
        'DDAAAADDDBBBABBD....',
        '.DAAAAD.DBBBABBD....',
        '.DAAAAD.DBBBBD......',
        '.DAAAAAD.DBBD.......',
        '.DAAAAAD............',
        '.DAACCAD............',
        '.DAACCAD............',
        '.DDAAADD............',
        '..DD.DD.............',
      ],
      [
        '....................',
        '.D....D.............',
        '.DD..DD.....DDD.....',
        'DAADDAAD...DBABBD...',
        'DAAAAAAD..DBABBBD...',
        'DASSDAAD.DBBABBBD...',
        'DADDDAAD.DBBABBBD...',
        'DAAAAAADDBBBBABBD...',
        'DAADDAADDBBBBABBD...',
        'DAEEEEADDBBBBABBD...',
        'DAEEEEADDBBBBABBD...',
        'DDAAAADDDBBABBBD....',
        '.DAAAAD.DBBABBBD....',
        '.DAAAAD.DBBABD......',
        '.DAAAAAD.DBBD.......',
        '.DAAAAAD............',
        '.DAACCAD............',
        '.DAACCAD............',
        '.DDAAADD............',
        '..DD.DD.............',
      ],
    ],
  },
};

// 每階「已實作」的 key（用來當未知 key 的 fallback 池）
const IMPLEMENTED = Object.keys(SPRITES).reduce((acc, k) => { acc[k] = true; return acc; }, {});
const TIER_POOL = Object.fromEntries(
  TIER_ORDER.filter((t) => t !== 'egg').map((t) => [t, Object.keys(SPECIES[t] || {}).filter((k) => IMPLEMENTED[k])])
);

/**
 * 未知／未實作的 species_key 一律 fallback 到同階已實作的物種（依 hue 穩定挑選），
 * 同階也沒有就退到 'firefly'。永遠不會回傳空白。
 */
export function resolveSprite(tier, key, hue = 0) {
  if (key && SPRITES[key]) return key;
  const pool = TIER_POOL[tier] || [];
  if (pool.length) return pool[Math.abs(Math.round(hue)) % pool.length];
  const all = Object.keys(SPRITES);
  return all[Math.abs(Math.round(hue)) % all.length] || 'firefly';
}

// ══════════════════════════════════════════════════════════
//  蛋
// ══════════════════════════════════════════════════════════
const EGG_FRAME = [
  '....................',
  '........DDDD........',
  '.......DACCAD.......',
  '......DACCAAAD......',
  '......DACCAAAD......',
  '.....DAACAAAAAD.....',
  '.....DAAAAAAAAD.....',
  '....DAAAAAAAAAAD....',
  '....DAAAAAAAAAAD....',
  '...DAAAAAAAAAAAAD...',
  '...DAAAAAAAAAAAAD...',
  '...DAAAAAAAAAAAAD...',
  '...DAAAAAAAAAAAAD...',
  '....DAAAAAAAAAAD....',
  '....DAAAAAAAAAAD....',
  '.....DAAAAAAAAD.....',
  '......DAAAAAAD......',
  '.......DDDDDD.......',
  '....................',
  '....................',
];

// 花紋：蛋殼上的像素點（[x, y, 顏色字母]）
const EGG_PATTERN = {
  dots: [[7, 8, 'C'], [11, 7, 'C'], [13, 10, 'C'], [6, 11, 'C'], [10, 13, 'C'], [8, 15, 'C'], [12, 14, 'C']],
  stripes: [
    [6, 7, 'B'], [7, 8, 'B'], [8, 9, 'B'], [9, 10, 'B'], [10, 11, 'B'], [11, 12, 'B'], [12, 13, 'B'],
    [10, 7, 'B'], [11, 8, 'B'], [12, 9, 'B'], [13, 10, 'B'], [6, 12, 'B'], [7, 13, 'B'], [8, 14, 'B'],
  ],
  speckle: [
    [6, 9, 'B'], [9, 8, 'B'], [12, 9, 'B'], [7, 12, 'B'], [10, 11, 'B'], [13, 12, 'B'],
    [8, 14, 'B'], [11, 15, 'B'], [6, 15, 'B'], [14, 11, 'B'], [9, 16, 'B'],
  ],
  swirl: [
    [7, 9, 'C'], [8, 8, 'C'], [9, 9, 'C'], [8, 10, 'C'],
    [12, 12, 'C'], [13, 11, 'C'], [14, 12, 'C'], [13, 13, 'C'],
    [8, 14, 'C'], [9, 13, 'C'], [10, 14, 'C'],
  ],
  plain: [],
};

const CRACK1 = [[7, 6], [8, 7], [7, 8], [8, 9], [7, 10], [8, 11]];
const CRACK2 = [[12, 8], [11, 9], [12, 10], [11, 11], [12, 12], [11, 13]];

function Pix({ pts, color, k }) {
  return <>{pts.map(([x, y], i) => <rect key={`${k}${i}`} x={x} y={y} width={1} height={1} fill={color} />)}</>;
}

/**
 * <Egg /> — 2 格晃動（左右各偏 1 像素）。越接近孵化晃得越頻繁。
 * daysLeft：距離孵化還差幾次打卡（App.jsx 傳 HATCH_DAYS - days）
 */
export function Egg({ hue = 40, pattern = 'dots', daysLeft = HATCH_AT, size = 120 }) {
  const tick = useTick();
  const P = pixelPalette(hue);
  const days = HATCH_AT - daysLeft;
  const crack1 = days >= CRACK1_AT;
  const crack2 = days >= CRACK2_AT;

  // 晃動頻率：快孵化了 → 每格都晃；還早 → 每 3 格才晃一次
  const div = daysLeft <= 2 ? 1 : daysLeft <= 4 ? 2 : 3;
  const dx = REDUCED ? 0 : (Math.floor(tick / div) % 2 === 0 ? -1 : 1);
  const marks = EGG_PATTERN[pattern] || EGG_PATTERN.plain;

  return (
    <svg
      width={size} height={size} viewBox="0 0 20 20" role="img" aria-label="蛋"
      shapeRendering="crispEdges" style={{ display: 'block', overflow: 'visible' }}
    >
      <g transform={`translate(${dx} 0)`}>
        {gridRects(EGG_FRAME, P, 'e')}
        {marks.map(([x, y, c], i) => <rect key={`m${i}`} x={x} y={y} width={1} height={1} fill={P[c]} />)}
        {crack1 && <Pix pts={CRACK1} color={P.D} k="c1" />}
        {crack2 && <Pix pts={CRACK2} color={P.D} k="c2" />}
      </g>
    </svg>
  );
}

// ══════════════════════════════════════════════════════════
//  孵化：一次性碎片飛散動畫（5 格 × 400ms = 2s）
// ══════════════════════════════════════════════════════════
const POKE_FRAMES = 4;      // 點一下 → happy 播 4 格
const SHARDS = [
  [[8, 8], [11, 8], [7, 11], [12, 11]],
  [[6, 6], [13, 6], [5, 12], [14, 12]],
  [[4, 4], [15, 4], [3, 14], [16, 14]],
  [[2, 2], [17, 2], [1, 16], [18, 16]],
  [],
];
const HATCH_DY = [6, 4, 2, 0, 0];

// ══════════════════════════════════════════════════════════
//  <Pet />
// ══════════════════════════════════════════════════════════
export function Pet({ pet, days = 0, size = 120, health = 'ok', motion = null }) {
  const tick = useTick();
  const [pokeTick, setPokeTick] = useState(-99);
  const [hatchStart, setHatchStart] = useState(-99);
  const wasEgg = useRef(null);

  const hatched = !!(pet && pet.hatched_at) && (pet.species_tier || 'egg') !== 'egg';

  // 蛋 → 生物 的瞬間觸發一次孵化動畫（以全域幀數計時，與逐格時脈同步）
  useEffect(() => {
    if (!pet) return;
    if (wasEgg.current === true && hatched && !REDUCED) setHatchStart(tickN);
    wasEgg.current = !hatched;
  }, [pet, hatched]);

  if (!pet) return <svg width={size} height={size} viewBox="0 0 20 20" />;

  const hue = Number(pet.hue) || 0;
  const pattern = pet.pattern || 'plain';
  const tier = pet.species_tier || 'egg';

  // 未孵化 → 畫蛋
  if (!hatched) {
    return <Egg hue={hue} pattern={pattern} daysLeft={Math.max(0, HATCH_AT - days)} size={size} />;
  }

  const key = resolveSprite(tier, pet.species_key, hue);
  const sprite = SPRITES[key];
  const P = pixelPalette(hue, health);
  const accent = sprite.accent || {};
  const colors = { ...P, F: accent.F || '#E9A0A8', G: accent.G || '#FFFDF9' };
  if (health === 'weak' || health === 'dead') { colors.F = P.B; colors.G = P.C; }

  const small = size <= 48;
  const stage = stageIndex(days);
  const pad = STAGE_PAD[stage];

  const hatchAge = tick - hatchStart;
  const hatching = !REDUCED && hatchAge >= 0 && hatchAge < SHARDS.length;
  const pokeAge = tick - pokeTick;
  const happy = !hatching && !REDUCED && pokeAge >= 0 && pokeAge < POKE_FRAMES;

  const state = hatching ? 'hatch'
    : happy ? 'happy'
      : motion === 'eating' ? 'eating'
        : health === 'hungry' ? 'hungry'
          : (health === 'weak' || health === 'dead') ? 'weak'
            : 'idle';

  // 小尺寸與虛弱狀態把幀率降到 1.25fps
  const div = small || state === 'weak' ? 2 : 1;
  const f = REDUCED ? 0 : Math.floor(tick / div);

  const frames = sprite.frames;
  const multi = frames.length > 1;

  // ── 逐格決定：畫哪一張、位移多少、要不要眨眼 ──
  let grid = frames[0];
  let dy = 0;
  let blink = false;
  let opacity = 1;
  const extras = [];

  if (state === 'hatch') {
    const i = Math.min(SHARDS.length - 1, Math.max(0, hatchAge));
    dy = HATCH_DY[i];
    SHARDS[i].forEach(([x, y], n) => extras.push(
      <rect key={`sh${n}`} x={x} y={y} width={2} height={2} fill={n % 2 ? P.C : P.A} />
    ));
  } else if (state === 'happy') {
    grid = multi ? frames[f % frames.length] : frames[0];
    dy = f % 2 === 0 ? -3 : -1;
    if (!small) extras.push(<Overlay key="h1" name="heart" x={13} y={0} k="h1" />);
    if (!small && f % 2 === 0) extras.push(<Overlay key="h2" name="note" x={2} y={1} k="h2" />);
  } else if (state === 'hungry') {
    grid = frames[0];
    dy = 1;                                     // 垂頭
    blink = f % 4 === 3;
    if (!small) extras.push(<Overlay key="b" name="bowl" x={0} y={16} k="b" />);
    if (!small && f % 2 === 0) extras.push(<Overlay key="d" name="drop" x={16} y={2} k="d" />);
  } else if (state === 'weak') {
    grid = frames[0];
    dy = f % 8 === 0 ? -1 : 0;                  // 動作幅度極小
    blink = f % 3 !== 0;                        // 大多時候半閉眼
    opacity = f % 7 === 0 ? 0.45 : 1;           // 偶爾閃爍一下
    if (!small) extras.push(<Overlay key="d" name="drop" x={16} y={2} k="d" />);
  } else if (state === 'eating') {
    grid = multi ? frames[f % frames.length] : frames[0];
    dy = f % 2 === 0 ? 0 : -1;
    extras.push(<Overlay key="f" name="berry" x={f % 3 === 0 ? 16 : 14} y={9} k="f" />);
  } else {
    // idle：單張圖 → 6 拍循環（浮動 ×2 + 眨眼 ×1）；多張圖 → 依序輪播
    if (multi) {
      grid = frames[f % frames.length];
    } else {
      const slot = f % 6;
      dy = slot === 1 || slot === 3 ? -1 : 0;
      blink = slot === 5;
    }
  }

  const paint = blink ? { ...colors, S: colors.D } : colors;
  const label = speciesLabel(tier, key) + (health !== 'ok' ? `（${HEALTH_LABEL[health]}）` : '');

  return (
    <svg
      width={size} height={size}
      viewBox={`${-pad} ${-pad} ${20 + pad * 2} ${20 + pad * 2}`}
      role="img" aria-label={label}
      shapeRendering="crispEdges"
      onClick={() => setPokeTick(tickN)}
      style={{ display: 'block', overflow: 'visible', cursor: small ? 'inherit' : 'pointer' }}
    >
      <g opacity={opacity}>
        <g transform={`translate(0 ${dy})`}>{gridRects(grid, paint, 'p')}</g>
        {extras}
      </g>
    </svg>
  );
}

export default Pet;
