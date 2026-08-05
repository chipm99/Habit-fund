# 像素電子雞規格（Pet.jsx）

給下一位工程師：照這份文件填資料，就能產出與現有物種同等品質的像素生物。
所有美術資料都在 `src/Pet.jsx` 的 `SPRITES` 物件裡，**不需要碰渲染引擎**。

---

## 1. 網格與渲染

| 項目 | 值 |
|---|---|
| 網格 | **20 × 20**（`GRID` 常數） |
| 每列字元數 | **必須剛好 20**（不足會靠左對齊、右邊留白，容易畫歪） |
| 列數 | 20（少寫的列視為全透明） |
| 渲染 | SVG `<rect>`＋`shapeRendering="crispEdges"`，`viewBox="0 0 20 20"` |
| 效能 | 同色的水平連續像素會合併成單一 `<rect>`（run-length），一隻約 70–110 個節點 |
| 禁止 | 反鋸齒、漸層、模糊陰影、CSS transition 補間、外部圖檔、canvas |

`.`（半形句點）＝透明。空白字元也視為透明，但**請一律用 `.`**，比較好對齊。

---

## 2. 字母 → 顏色對照

顏色由寵物的 `hue` 生成（`pixelPalette(hue, health)`），所以同一張圖在不同寵物身上會是不同色相。

| 字母 | 意義 | 來源 |
|---|---|---|
| `A` | 主色（身體） | `hsl(h, 58%, 68%)` |
| `B` | 暗部（陰影、條紋） | `hsl(h, 46%, 48%)` |
| `C` | 亮部（肚皮、翅膀、高光） | `hsl(h, 62%, 86%)` |
| `D` | 深色輪廓 | `hsl(h, 40%, 25%)` |
| `E` | 白（白色斑紋，例如黑熊胸前 V 字） | `#FFFDF9` |
| `S` | **眼睛高光**（白，眨眼時自動變成 `D`） | `#FFFDF9` |
| `F` | 物種重點色 1 | `SPRITES[key].accent.F`，預設 `#E9A0A8`（鼻子粉） |
| `G` | 物種重點色 2 | `SPRITES[key].accent.G`，預設 `#FFFDF9` |

規則：
- **每隻限 4–6 色**。實務上是 `A B C D` ＋眼睛（`S`/`D`）＋最多一個 `F`。顏色一多就不像像素風。
- 眼睛的白點**一定要用 `S`**，不能用 `E`——自動眨眼是靠把 `S` 換成 `D` 實作的。
- `health` 會自動改色：`hungry` 降飽和、`weak`/`dead` 幾乎去彩且 `F`/`G` 併入 `B`/`C`。**不要在圖裡自己畫「虛弱版」。**

---

## 3. frames 格式

```js
SPRITES = {
  myspecies: {
    accent: { F: '#F0C64A', G: '#FFF3B8' },   // 可省略
    frames: [
      [ /* 20 個字串，每個 20 字元 */ ],       // frame 0
      [ /* 選填：frame 1 */ ],
    ],
  },
}
```

### 幾張 frame？

| frames 長度 | 引擎行為 |
|---|---|
| **1 張**（推薦，多數物種用這個） | 自動產生 6 拍 idle 循環：`平 → 上移1px → 平 → 上移1px → 平 → 眨眼`。約 2.4 秒一輪 |
| **2 張以上** | 依序輪播，每格 400ms。翅膀拍動、觸手擺動這種**必須有第二張**的才用 |

目前用 2 張的：`firefly`（翅膀收/展）、`swallowtail`（拍翅）、`damselfly`（上下翅交替）。

---

## 4. 動畫與狀態

逐格切換，全站共用**一顆 400ms 的 interval**（`FRAME_MS`，= 2.5fps）。低幀率的跳動感就是電子雞的味道，不要改成 CSS transition。

| 狀態 | 觸發 | 表現 |
|---|---|---|
| `idle` | 預設 | 見上表 |
| `happy` | **點擊寵物** | 整體上移 3px / 1px 交替 4 格，頭上冒像素愛心＋音符 |
| `hungry` | `health='hungry'` | 垂頭（下移 1px）、旁邊出現像素飯碗、頭上水滴閃爍 |
| `weak` | `health='weak'/'dead'` | 去彩、動作幅度極小、半閉眼、每 7 格閃爍一次（opacity 0.45） |
| `eating` | `motion='eating'` | 莓果像素靠近嘴巴，身體上下 1px（App.jsx 目前未使用，介面預留） |
| `hatch` | `hatched_at` 由 null 變成有值 | 5 格一次性動畫：蛋殼碎片向外飛散＋生物由下往上蹦出（dy 6→4→2→0→0） |

蛋（`<Egg />`）：2 格晃動，左右各偏 1px。晃動頻率隨孵化接近而變快（`daysLeft<=2` 每格晃、`<=4` 每 2 格、其餘每 3 格）。裂痕直接以像素畫在蛋殼上。

### 降級點

| 情境 | 行為 | 位置 |
|---|---|---|
| `prefers-reduced-motion: reduce` | `useTick()` 永遠回傳 0 → 凍結在 frame 0；孵化／點擊動畫不觸發 | `REDUCED` 常數 + `useTick()` |
| 小尺寸（`size <= 48`，例如 Today 頁 32px 縮圖） | 幀率減半 → 800ms；不畫愛心／飯碗／水滴等覆蓋物 | `Pet()` 內 `small` 變數 |
| 虛弱 | 幀率同樣減半 | 同上 `div` |

---

## 5. 成長階段

階段不縮放像素（會破壞方格感），改用 **viewBox 留白**：`STAGE_PAD = [3.2, 1.8, 0.6, 0]`（幼→成熟）。整張圖等比放大，像素仍然是正方形。

---

## 6. 怎麼新增一個物種（完整範例）

**Step 1** — 在 `SPECIES[tier]` 加上 key 與中文名：

```js
export const SPECIES = {
  rare: { /* ... */, tapir: '馬來貘' },
};
```

**Step 2** — 在 `SPRITES` 加上像素圖。從既有的同科動物複製一張最省事（貓/狗/熊/水獺共用同一套「圓臉四足」骨架：頭 rows 4–11、身體 rows 12–18、眼睛在 rows 7–8 的 cols 5–6 與 13–14）：

```js
  tapir: {
    accent: { F: '#E9A0A8' },
    frames: [[
      '....................',
      '....................',
      '....DD........DD....',   // 耳朵
      '...DAAD......DAAD...',
      '...DAAADDDDDDAAAD...',   // 頭頂
      '....DAAAAAAAAAAD....',
      '...DAAAAAAAAAAAAD...',
      '...DASDAAAAAADSAD...',   // 眼睛上排（S = 高光）
      '...DADDAAAAAADDAD...',   // 眼睛下排
      '...DAAAAAFFAAAAAD...',   // 鼻子
      '...DAAAADAADAAAAD...',   // 嘴
      '....DAAAAAAAAAAD....',
      '.....DDEEEEEEDD.....',   // 馬來貘的白肚圍
      '.....DEEEEEEEED.....',
      '.....DEEEEEEEED.....',
      '.....DEEEEEEEED.....',
      '.....DAAACCAAAD.....',
      '.....DAAAAAAAAD.....',
      '.....DDDD..DDDD.....',   // 腳
      '....................',
    ]],
  },
```

**Step 3** — 檢查每列剛好 20 字元：

```bash
node -e "const s=require('fs').readFileSync('src/Pet.jsx','utf8').split('\n');
s.forEach((l,i)=>{const m=l.match(/^\s*'([.A-Z ]+)',?\s*$/);
if(m&&m[1].length!==20)console.log('LINE '+(i+1)+' len='+m[1].length)})"
```

**Step 4** — 在瀏覽器看實際大小（100px 與 32px 都要看）。判準：方塊感明確、剪影一眼認得出物種、32px 縮圖不糊成一團。

不用改 `resolveSprite()`／`TIER_POOL`——它們是從 `SPRITES` 自動推導的。

---

## 7. 怎麼新增一個狀態 / motion

1. 在 `Pet()` 的 `state` 判斷式加一個分支（`hatch > happy > eating > hungry > weak > idle` 的優先序）。
2. 在下面的 `if (state === ...)` 鏈加一段，設定 `grid` / `dy` / `blink` / `opacity` / `extras`。
3. 需要新的小圖示（食物、道具）就加進 `OV`（覆蓋物用**固定色**，不隨 hue 變）。

---

## 8. 相容性鐵則

- **`species_key` 一旦寫進 DB 就不可刪改**，包含 `sprite_moss` / `sprite_cloud` / `sprite_flame` / `sprite_star`。
- 未實作／未知的 key 由 `resolveSprite(tier, key, hue)` fallback 到**同階已實作**的物種（依 hue 穩定挑選），同階都沒有才退到全體第一個。**永遠不會空白或 crash。**
- 匯出介面（`Pet` / `Egg` 的 props、`HATCH_DAYS` 等常數與純函式）是 App.jsx 的相依，不可改名。
