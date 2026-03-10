# VAT-98 — Manga Glossary (Phase 2 / Pass 1)

- Ticket: https://linktovn.atlassian.net/browse/VAT-98
- Parent Epic: https://linktovn.atlassian.net/browse/VAT-85
- Date: 2026-03-10
- Scope: Copy/localization cho Manga surfaces (không mở rộng sang VAT-102/VAT-106)

## 1) Glossary chuẩn (VI/EN/ZH)

| Concept | English | Vietnamese | Chinese (Simplified) |
|---|---|---|---|
| Manga mode | Manga mode | Chế độ Manga | Manga 模式 |
| Manga run history | Manga Run History | Lịch sử chạy Manga | Manga 运行历史 |
| Regenerate | Regenerate | Tái tạo | 重新生成 |
| Source item | Source item | Mục nguồn | 来源项 |
| Valid Manga source | Valid Manga source | Nguồn Manga hợp lệ | 有效的 Manga 来源 |
| Chapter continuity | Chapter continuity | Tính liên tục theo chương | 章节连续性 |
| Style lock | Style lock | Khóa phong cách | 风格锁定 |
| Conflict policy | Conflict policy | Chính sách xung đột | 冲突策略 |

## 2) Quy tắc thống nhất thuật ngữ

1. UI public ưu tiên dùng "Manga" (viết hoa) thay vì trộn "quick manga" trong câu hiển thị.
2. Tránh tiếng Anh kỹ thuật lẫn trong VI/ZH khi có thuật ngữ tương đương rõ ràng.
3. Duy trì consistency cho cụm:
   - `chapter continuity` ↔ `tính liên tục theo chương` ↔ `章节连续性`
   - `style lock` ↔ `khóa phong cách` ↔ `风格锁定`
4. Giữ nguyên tên mode sản phẩm: `Manga Quick Start` (tên feature/entry), không dịch tự do.

## 3) Mapping old -> new (pass này)

- `Quick Manga History` -> `Manga Run History`
- `No quick manga runs yet for this filter` -> `No Manga runs yet for this filter`
- `Selected history item is not a valid quick manga source` -> `Selected history item is not a valid Manga source`
- `Quick manga regenerate failed` -> `Failed to regenerate Manga output`
- VI/ZH: loại bỏ trộn từ như `run`, `regenerate`, `quick manga` trong các câu người dùng cuối tại khu vực history/regenerate.

## 4) Ghi chú baseline Phase 1

- Kế thừa baseline Phase 1 từ VAT-85 (CTA + entry mode + create modal selector) để đồng bộ copy trong luồng discoverability -> create -> workspace.
- Pass này chỉ xử lý VAT-98 (copy/localization/glossary), không động vào scope IA/onboarding/template của các ticket khác.
