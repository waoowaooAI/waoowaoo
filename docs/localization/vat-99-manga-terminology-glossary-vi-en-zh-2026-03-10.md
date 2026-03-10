# VAT-99 — Audit & Glossary thuật ngữ Manga (VI/EN/ZH)

- Ticket: https://linktovn.atlassian.net/browse/VAT-99
- Story cha: https://linktovn.atlassian.net/browse/VAT-98
- Epic: https://linktovn.atlassian.net/browse/VAT-85
- Ngày: 2026-03-10
- Scope pass này: **chỉ VAT-99** (audit + glossary), không mở rộng sang VAT-100/VAT-101.

## 1) Mục tiêu VAT-99

Thiết lập bộ thuật ngữ Manga chuẩn cho 3 locale **VI/EN/ZH**, làm baseline để các pass tiếp theo đồng bộ copy UI mà không mâu thuẫn ngôn ngữ.

## 2) Nguồn audit

- `messages/en/novel-promotion.json`
- `messages/vi/novel-promotion.json`
- `messages/zh/novel-promotion.json`
- Tài liệu nền đã có: `docs/localization/vat-98-manga-glossary-2026-03-10.md`

## 3) Glossary chuẩn (canonical)

| Concept | English (canonical) | Vietnamese (canonical) | Chinese Simplified (canonical) |
|---|---|---|---|
| Manga mode | Manga mode | Chế độ Manga | Manga 模式 |
| Manga run history | Manga Run History | Lịch sử chạy Manga | Manga 运行历史 |
| Valid Manga source | Valid Manga source | Nguồn Manga hợp lệ | 有效的 Manga 来源 |
| Regenerate Manga output | Regenerate Manga output | Tái tạo đầu ra Manga | 重新生成 Manga 输出 |
| Chapter continuity | Chapter continuity | Tính liên tục theo chương | 章节连续性 |
| Style lock | Style lock | Khóa phong cách | 风格锁定 |
| Conflict policy | Conflict policy | Chính sách xung đột | 冲突策略 |
| Source run | Source run | Lần chạy nguồn | 来源运行 |
| Source stage | Source stage | Bước nguồn | 来源阶段 |

## 4) Rule dùng thuật ngữ

1. UI public ưu tiên dùng từ **Manga** nhất quán (không trộn `quick manga` trong user-facing copy VI/EN/ZH của luồng này).
2. Không pha trộn thuật ngữ nội bộ kỹ thuật vào câu người dùng cuối khi đã có từ tương đương rõ nghĩa.
3. Tên feature/entry chính thức giữ nguyên: **Manga Quick Start** (product name), không dịch tự do.
4. Cụm continuity và style lock phải map ổn định theo bảng canonical ở trên.

## 5) Mapping kiểm soát (old -> canonical)

- `Quick Manga History` -> `Manga Run History`
- `No quick manga runs yet for this filter` -> `No Manga runs yet for this filter`
- `Selected history item is not a valid quick manga source` -> `Selected history item is not a valid Manga source`
- `Quick manga regenerate failed` -> `Failed to regenerate Manga output`

## 6) Kết quả audit VAT-99

### 6.1 EN
- Khu vực `quickManga.history` và `quickManga.regenerate` đã bám canonical tốt.
- Chưa phát hiện chuỗi `quick manga` user-facing trong file EN thuộc phạm vi VAT-99.

### 6.2 VI
- Khu vực history/regenerate đã đồng nhất “Manga”, “nguồn Manga hợp lệ”, “tái tạo Manga”.
- Một số từ mượn kỹ thuật (ví dụ `Preset`, `Profile`) tồn tại nhưng không gây mâu thuẫn glossary lõi của VAT-99.

### 6.3 ZH
- Khu vực history/regenerate bám canonical ổn định.
- Có trộn thuật ngữ EN ở một số nhãn control (`Style Lock`) nhưng không ảnh hưởng các key cốt lõi history/regenerate của pass VAT-99.
- Khuyến nghị đưa vào VAT-100 để làm sạch tiếp ở tầng UX copy controls nếu Product/Design xác nhận.

## 7) Đầu ra VAT-99

- Artefact glossary/audit đã tạo: tài liệu này.
- Baseline này là nguồn tham chiếu cho các pass triển khai tiếp theo (VAT-100).
