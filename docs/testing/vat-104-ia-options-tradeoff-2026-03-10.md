# VAT-104 — Đề xuất 3 phương án IA use-case-first + đánh giá trade-off

- Ticket: https://linktovn.atlassian.net/browse/VAT-104
- Parent: https://linktovn.atlassian.net/browse/VAT-102
- Date: 2026-03-10
- Strategy: `code_light` (không đổi runtime/API, chỉ chốt phương án IA ở mức thiết kế)

## 1) Jira context (read-first)

- Summary: **[Sub-task] Đề xuất 2-3 phương án IA use-case-first + đánh giá trade-off**
- Status at start: **To Do**
- Scope issue này: chỉ đề xuất option IA + trade-off; **không** implement UI/runtime trong VAT-104.

## 2) Input context từ VAT-103 (as-is pain points)

Dựa trên artifact VAT-103 (`docs/testing/vat-103-ia-pain-points-discoverability-2026-03-10.md`):

1. Intent model chưa tách rõ ở top-level IA (story vs manga).
2. Entry semantics đang phân tán qua card + modal + query flag (`quickManga=1`).
3. Discoverability phụ thuộc implementation detail nhiều hơn user mental model.
4. Telemetry discovery có baseline nhưng thiếu taxonomy cho “chọn hành trình”.

## 3) Mục tiêu option design cho VAT-104

- Tăng discoverability theo **use-case-first** (user chọn mục tiêu trước).
- Giữ continuity kỹ thuật hiện tại (`mode: novel-promotion`, quick manga API lane, query compatibility).
- Giảm rủi ro rollout bằng thay đổi theo lớp IA shell trước, runtime sau.

## 4) 3 phương án IA use-case-first

## Option A — Minimal overlay (giữ IA kỹ thuật, thêm hướng dẫn use-case)

### Mô tả
Giữ nguyên cấu trúc IA hiện tại; chỉ tăng label/copy/tooltip để giải thích journey Story/Manga.

### Ưu điểm
- Rủi ro thấp nhất.
- Triển khai nhanh.
- Không ảnh hưởng flow tạo project hiện hữu.

### Nhược điểm
- Chỉ “trang điểm” discoverability, chưa giải quyết gốc vấn đề IA.
- User vẫn phải hiểu nhiều chi tiết kỹ thuật ngầm.
- Khó mở rộng taxonomy analytics theo intent rõ ràng.

### Khi nào phù hợp
- Cần hotfix UX cực nhanh, nguồn lực rất hạn chế.

## Option B — Semantic IA shell (khuyến nghị)

### Mô tả
Đổi lớp điều hướng/entry theo use-case-first (Story journey, Manga journey), nhưng giữ routing + runtime contract phía dưới.

### Ưu điểm
- Cân bằng tốt giữa UX và rủi ro kỹ thuật.
- Giải quyết trực tiếp pain point discoverability ở top-level IA.
- Tạo nền để chuẩn hóa telemetry theo hành trình user.

### Nhược điểm
- Cần thiết kế lại IA shell + copy + trạng thái điều hướng.
- Cần quản lý chặt mapping semantic intent -> technical mode để tránh drift.

### Khi nào phù hợp
- Muốn cải thiện UX có ý nghĩa nhưng vẫn giữ rollout an toàn, theo pha.

## Option C — Full domain IA refactor (Story/Manga tách lane end-to-end)

### Mô tả
Tách IA + runtime thành domain lane rõ ràng từ entry đến task orchestration và analytics taxonomy riêng.

### Ưu điểm
- IA sạch nhất theo use-case-first.
- Mental model rõ, dễ scale nhiều use-case mới.

### Nhược điểm
- Chi phí và rủi ro cao nhất.
- Đòi hỏi migration rộng (routing, mode contract, analytics, tài liệu, test).
- Không phù hợp mục tiêu `code_light` của VAT-104.

### Khi nào phù hợp
- Có window refactor lớn + kế hoạch migration đầy đủ nhiều sprint.

## 5) Trade-off matrix (tóm tắt)

| Tiêu chí | Option A | Option B | Option C |
|---|---|---|---|
| Discoverability improvement | Thấp | Cao | Rất cao |
| Rủi ro kỹ thuật | Rất thấp | Trung bình-thấp | Cao |
| Effort | Thấp | Trung bình | Cao |
| Tương thích runtime hiện tại | Rất cao | Cao | Trung bình-thấp |
| Phù hợp `code_light` VAT-104 | Cao | **Cao (best fit)** | Thấp |

## 6) Đề xuất chốt cho VAT-104

**Chọn Option B (Semantic IA shell)** làm target direction cho phase build tiếp theo, với lý do:

1. Đạt mục tiêu use-case-first rõ rệt hơn Option A.
2. Không tạo blast radius lớn như Option C.
3. Phù hợp constraint hiện tại: giữ API/runtime contract và rollout theo pha.

## 7) Boundary của VAT-104 (đã tuân thủ)

- ✅ Có đề xuất 3 phương án IA use-case-first.
- ✅ Có đánh giá trade-off có cấu trúc + recommendation.
- ✅ Không thay đổi code runtime/API/DB.
- ✅ Artifact dùng làm input cho sub-task chốt target IA và migration checklist (VAT-105).
