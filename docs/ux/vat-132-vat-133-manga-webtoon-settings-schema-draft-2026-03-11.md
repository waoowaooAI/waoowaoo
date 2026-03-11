# VAT-132/VAT-133 — Manga/Webtoon Settings Schema Draft (Anifun mapping)

## 1) Mục tiêu
Tài liệu này chuẩn hoá schema draft để team implement nhanh phần settings Manga/Webtoon dựa trên research Anifun đã capture.

- **Không đổi product behavior trong lane này**.
- Dùng làm artifact/spec implementation cho VAT-132/VAT-133.

## 2) Source of evidence (traceability)
- Jira reference: **VAT-132**, **VAT-133** (Anifun research attachment theo yêu cầu Anh Công).
- Evidence pack local:
  - `/Users/mrcagents/.openclaw/workspace/tmp/anifun-evidence-package-2026-03-11/anifun-ai-manga-generator-capture-2026-03-11`
- Inventory/report:
  - `INVENTORY.md`
  - `REPORT_VI.md`
- Panel templates captured: `panel-templates/*` (**13 templates**)
- Preset references captured: `preset-templates/*` (**6 presets**)

## 3) Artifact liên quan trong repo
- Mapping JSON: `docs/ux/layout_map.json`

## 4) Đề xuất schema (draft)

```ts
type MangaPanelLayoutId =
  | 'anifun_t01' | 'anifun_t02' | 'anifun_t03'
  | 'anifun_t04' | 'anifun_t05' | 'anifun_t06'
  | 'anifun_t07' | 'anifun_t08' | 'anifun_t09'
  | 'anifun_t10' | 'anifun_t11' | 'anifun_t12' | 'anifun_t13'

type MangaLayoutFamily =
  | 'cinematic-complex'
  | 'cinematic-zigzag'
  | 'cinematic-diagonal-focus'
  | 'single-splash'
  | 'dual-split'
  | 'triple-strip'
  | 'quad-grid-equal'
  | 'quad-grid-portrait'
  | 'quad-mixed-focus'
  | 'dense-six-panel'
  | 'quad-hero-bottom'
  | 'dual-hero-support'
  | 'triple-focus'

type MangaColorMode = 'auto' | 'full-color' | 'black-white' | 'limited-palette'

type MangaStylePreset =
  | 'auto'
  | 'action-battle'
  | 'romance-drama'
  | 'slice-of-life'
  | 'comedy-4koma'

interface MangaLayoutOption {
  panelLayoutId: MangaPanelLayoutId
  layoutFamily: MangaLayoutFamily
  panelSlotCount: number
  panelSlots: string[] // p1..pn
  narrativeIntent: string
  colorMode: MangaColorMode
  suggestedStylePresets: MangaStylePreset[]
  referencePresetId?: string
  sourceTemplateFile: string
  slotCountConfidence: 'high' | 'low'
}

interface MangaWebtoonSettingsV1 {
  enabled: boolean
  panelLayoutId: MangaPanelLayoutId | 'auto'
  colorMode: MangaColorMode
  stylePreset: MangaStylePreset
  referencePresetId?: string
  // reserved for continuity/settings evolution (VAT-133)
  controls?: {
    styleLock?: {
      enabled: boolean
      profile: 'auto' | 'line-consistent' | 'ink-contrast' | 'soft-tones'
      strength: number
    }
    chapterContinuity?: {
      mode: 'off' | 'chapter-strict' | 'chapter-flex'
      chapterId: string | null
      conflictPolicy: 'balanced' | 'prefer-style-lock' | 'prefer-chapter-context'
    }
  }
}
```

## 5) Mapping rules đề xuất (để implement nhanh)

### 5.1 UI -> runtime mapping
1. `panelLayoutId` chọn từ catalog `anifun_t01..anifun_t13`.
2. `layoutFamily` dùng cho:
   - filter group trong UI,
   - analytics dimensions,
   - fallback logic khi `panelLayoutId='auto'`.
3. `panelSlotCount` + `panelSlots` dùng để:
   - xác định expected panel rhythm,
   - build prompt directives theo số beat.
4. `colorMode` lấy trực tiếp từ settings; fallback `auto` nếu thiếu.
5. `stylePreset` lấy từ preset list hiện tại của VAT (`auto/action-battle/...`).
6. `referencePresetId` optional; chỉ dùng làm gợi ý visual tone (không bắt buộc ràng buộc generation).

### 5.2 Compatibility với runtime hiện tại
- Runtime hiện có quick-manga options:
  - `preset`, `layout`, `colorMode`
- Mapping bridge ngắn hạn đề xuất:
  - `panelLayoutId` -> `layout` (qua `layoutFamily`)
  - Ví dụ:
    - family `single-splash`/`dual-split`/`triple-strip` -> `splash-focus`
    - family `quad-grid-*` -> `four-koma`
    - family `cinematic-*`/`dense-six-panel` -> `cinematic`
- Mục tiêu: **không phá contract cũ**, chỉ add semantic layer cho VAT-132/VAT-133.

## 6) Ghi chú chất lượng dữ liệu
- `anifun_t04..anifun_t13`: slot count confidence **high** (template line-art rõ).
- `anifun_t01..anifun_t03`: confidence **low** vì thumbnail dạng render/texture, cần xác nhận lại bằng source vector/original nếu muốn exact slot geometry.
- Khuyến nghị implementation:
  1. cho phép chỉnh thủ công `panelSlotCount` trong seed data nếu team xác nhận thêm,
  2. giữ `layoutFamily` làm key ổn định, hạn chế phụ thuộc tuyệt đối vào slot count của 3 template đầu.

## 7) Đề xuất checklist implement (VAT-132/VAT-133)
1. Import JSON mapping vào config source (`layout_map.json` tương đương artifact này).
2. Render panel selector từ mapping, không hardcode 13 card.
3. Save payload theo `MangaWebtoonSettingsV1` (additive).
4. Thêm adapter map xuống quick-manga runtime hiện tại.
5. Bổ sung unit tests cho:
   - parser/validator mapping,
   - bridge `panelLayoutId -> layout`.
6. Không deploy trong lane spec này.

---

## Appendix A — File mapping chuẩn
- `docs/ux/layout_map.json`

## Appendix B — Reference preset IDs
- `anifun_preset_01_school_romance`
- `anifun_preset_02_superhero_food`
- `anifun_preset_03_cat_cafe_jp`
- `anifun_preset_04_confession_summer`
- `anifun_preset_05_busy_day_witch`
- `anifun_preset_06_sexy_beauty_day`
