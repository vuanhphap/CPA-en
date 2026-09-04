# CPA English Trainer — QA hai vòng

Ngày kiểm định: 2026-09-03

Phạm vi: source code, dữ liệu JSON, SRS, quiz, IPA, collocation, câu học từ corpus, bản dịch mẫu chuyên môn và schema Supabase.

## Vòng 1 — logic học + dữ liệu học thuật

### Lỗi phát hiện và đã sửa

1. **`Từ mới/ngày` thực chất là mỗi phiên**: mở lại Học SRS có thể lấy thêm một lô mới. Đã đổi sang `remainingNew = quota - daily.new_items`.
2. **Thẻ chưa đến hạn vẫn nằm trong queue**: bản cũ nối `future` vào cuối hàng đợi. Đã loại bỏ; SRS chỉ đưa thẻ đến hạn + quota từ mới còn lại.
3. **Ngày học dùng UTC**: `toISOString().slice(0,10)` có thể ghi nhầm ngày ở Việt Nam từ 00:00–06:59. Đã dùng ngày lịch địa phương.
4. **SM-2 bị pha hệ số tự chế**: Hard nhân 0,75 và Easy nhân thêm 1,3 nhưng README gọi là SM-2 chuẩn. Đã bỏ hai hệ số này; lịch hiện theo SM-2 quality 0–5.
5. **Shuffle thiên lệch**: `sort(() => Math.random()-.5)` được thay bằng Fisher–Yates.
6. **Quiz collocation có thể có nhiều đáp án hợp lý** khi chỉ khoét một từ rồi lấy distractor ngẫu nhiên từ các cụm khác. Đã đổi sang:
   - cloze bằng **cả collocation** trong câu corpus chất lượng cao; hoặc
   - chọn **collocation đầy đủ từ nghĩa tiếng Việt**, loại các nghĩa trùng khi có thể.
7. **Quiz cloze lấy từ bất kỳ trong câu**, đôi khi là từ quá chung. Đã chuyển sang `focus_term` đã xếp hạng trước.
8. **IPA eSpeak quá hẹp/allophonic** (`ɾ`, `ɐ`, v.v.) cho mục tiêu học từ. Đã chuyển sang broad/phonemic en-US IPA từ CMUdict cho 4.510 mục; 36 mục hợp lệ ngoài CMUdict dùng fallback kiểm soát; 56 mục OCR/tên không chắc bị bỏ IPA thay vì dạy sai.
9. **Thuật ngữ chuyên môn dễ gây nhầm** được chỉnh và thêm note, gồm `financial reporting`, `going concern`, `sales volume`, `audit engagement`, `public accounting firm`, `reasonable assurance`, `material misstatement`, v.v.
10. **Auth offline**: nếu CDN Supabase chưa tải, nút đăng nhập có thể gọi `db.auth` trên `null`. Đã thêm guard; local learning vẫn hoạt động.

### Test vòng 1

- `node --check`: app/config/service worker đạt.
- 14 file JSON parse được.
- Test logic instrumented: SM-2, ngày địa phương, quota từ mới/ngày, future-card exclusion, 200 collocation quiz + 200 cloze quiz: **0 lỗi**.
- IPA coverage: Core word 100%, Collocation 100%, Word Family root 100%.

## Vòng 2 — tính truy vết nguồn + backend/cloud

### Lỗi phát hiện và đã sửa

1. **Câu học bị mô tả là “nguyên văn” quá mức**. Đối chiếu trực tiếp `sentences.json` với `exams.json`:
   - 416/472 câu khớp trực tiếp OCR/whitespace;
   - 56/472 câu là bản normalize/clean từ OCR.
   Đã thêm `source_fidelity` và sửa wording UI/README.
2. **32 câu có OCR/grammar không đủ tin cậy** được gắn `quality=low` và loại khỏi active sentence learning/quiz. File nguồn vẫn giữ để truy vết.
3. **Quiz tự chấm câu** giờ chỉ dùng câu `quality=high` **và** `source_fidelity=Exact OCR`: còn 388 câu đủ điều kiện nghiêm ngặt.
4. **Ví dụ hiển thị trên thẻ** trước đây có thể lấy câu `low`. `sentenceIndex()` và `exampleFor()` giờ chỉ lấy câu high-quality.
5. **Bug cloud của cloze**: `recordReview('cloze', ...)` xung đột CHECK `study_progress.item_type IN (word,family,collocation,question)`. Đã map cloze → `question`.
6. **Schema Supabase thực tế lệch source project**: `study_sessions` trên cloud còn thiếu `cloze`, `word_formation`, `sentence_transform`, `translation`. Đã áp migration thực tế.
7. **RLS backend thực tế** có 3 policy ở 4 bảng; source project kỳ vọng đủ CRUD. Đã bổ sung DELETE policy. Kiểm tra sau migration: cả 5 bảng có 4 policy.
8. Chỉnh 2 model translation chuyên môn:
   - `financial reporting` → nhấn đúng **việc lập và trình bày báo cáo tài chính**, không đồng nhất với `financial statements`;
   - trách nhiệm trong audit contract → `entity's management`, tránh dịch cứng thành `Board of Management`.

### Test vòng 2

- 300 collocation quiz + 300 cloze quiz: **0 lỗi option/answer/source gate**.
- Sentence active pool: 440 câu high-quality.
- Auto-cloze strict pool: 388 câu high + Exact OCR.
- HTTP runtime smoke test bằng `python -m http.server`: index, CSS, JS, SW, manifest và các data file chính đều trả **HTTP 200**.
- Backend:
  - `study_sessions_mode_check` đã có 9 mode: vocabulary, word_family, collocation, cloze, mock_exam, review, word_formation, sentence_transform, translation.
  - profiles, study_progress, study_sessions, exam_attempts, daily_stats: **4 RLS policies/bảng**.

## Kết quả cuối

- Core CPA: 192
- Topic vocab: 4.225
- Word families: 78
- Collocations: 237 = 113 corpus + 124 learning expansion
- IPA: 4.546 mục; 4.169/4.225 từ topic có IPA (98,67%); Core/Family/Collocation 100%
- Sentences: 472 nguồn; 440 high-quality; 32 low; 416 Exact OCR; 56 normalized/cleaned
- Exams OCR: 14
- JSON invalid: 0
- JS syntax errors: 0
- QA logic failures cuối: 0

## Giới hạn kiểm thử

Môi trường sandbox chặn Chromium/Playwright điều hướng tới localhost bằng `ERR_BLOCKED_BY_ADMINISTRATOR`, nên vòng hiện tại không thể làm full visual click-through bằng browser engine. Thay thế đã thực hiện: HTTP server thật + kiểm tra HTTP 200 asset, Node VM instrumented chạy trực tiếp logic `app.js`, static syntax, data-integrity tests và kiểm tra schema Supabase thật. Các script tái chạy nằm trong `qa/`.

## V6 — kiểm thử analytics / multi-user

Bổ sung `qa/test_v6.js` với các kiểm tra:

- Weakness Score xếp mục sai/lapse cao trên mục sạch chỉ đến hạn.
- Smart Study lấy mục yếu/đến hạn trước và tuân thủ quota từ mới còn lại.
- Weak Review tạo queue đúng từ progress thay vì quay về Core SRS.
- Session offline ghi đúng item/correct/wrong và được dùng cho analytics.
- CPA Readiness phản ứng theo mastery/accuracy/mock exam.
- State local tách theo user: dữ liệu của `user-a` không rò sang guest và được phục hồi khi đăng nhập lại profile đó.

Kết quả: `qa/test_logic.js`, `qa/test_v6.js`, `qa/test_data.py` đều 0 lỗi.
