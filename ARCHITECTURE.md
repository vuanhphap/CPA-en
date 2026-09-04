# Kiến trúc — CPA English Trainer V8

## Hình dạng hệ thống

```
Trình duyệt (site tĩnh, PWA, ES module — không có build step)
├── index.html → js/main.js (13 module)
├── data/*.json                 corpus đóng gói; nâng cấp được từ máy chủ theo phiên bản
└── localStorage                nguồn sự thật khi ngoại tuyến, tách theo user_id
        │  supabase-js (anon key + JWT người dùng)
        ▼
Supabase
├── auth.users / profiles           danh tính, mục tiêu học
├── study_progress / daily_stats    trạng thái SRS + counter (realtime)
├── study_sessions / exam_attempts  lịch sử
├── learning_events                 log bất biến, CHỈ ghi qua RPC có hạn mức
├── usage_quota                     đếm hạn mức ghi theo ngày
├── content_packs / content_items   corpus có phiên bản, đọc công khai
└── user_roles                      phân quyền, tách khỏi bảng học tập
```

## Bố cục module

| Module | Dòng | Trách nhiệm |
|---|---:|---|
| `util` | 52 | selector, escape, định dạng, phát âm — không phụ thuộc gì |
| `runtime` | 48 | trạng thái dùng chung; **0 import** (mắt xích phá vòng phụ thuộc) |
| `store` | 114 | localStorage, tách hồ sơ, hàng đợi event |
| `srs` | 74 | SM-2, điểm điểm yếu, hàng đợi ôn |
| `sessions` | 57 | vòng đời phiên học |
| `content` | 199 | corpus, nạp trễ, nâng cấp theo phiên bản |
| `analytics` | 53 | thống kê dashboard |
| `sync` | 287 | Supabase, realtime, đẩy event có hạn mức |
| `auth` | 366 | danh tính, hồ sơ, gộp dữ liệu khách |
| `views_home` | 232 | tổng quan, tiến trình, mục yếu, cài đặt |
| `views_study` | 147 | SRS, family, collocation, cụm & câu, từ điển |
| `views_practice` | 218 | quiz, luyện câu, luyện đề |
| `main` | 135 | định tuyến, nối sự kiện, khởi động |

Các module do `qa/split_modules.py` sinh ra từ `qa/app.legacy.js`. Import được **suy
ra tự động** bằng cách quét ký hiệu mà mỗi module thực sự dùng của module khác —
không viết tay, nên không có import thừa hay thiếu.

## Bốn quyết định đáng chú ý

### 1. Event log là nguồn sự thật, `daily_stats` chỉ là cache

`daily_stats` là counter cộng dồn. Hai thiết bị cùng học ngoại tuyến rồi cùng đồng bộ
sẽ ghi đè lẫn nhau — lost update kinh điển. Mỗi lượt học giờ sinh một hàng bất biến
trong `learning_events` với `event_id` do client cấp, nên đẩy lại bao nhiêu lần cũng
không nhân đôi. RPC `rebuild_daily_stats()` dựng lại counter bằng `greatest()`.

`learning_events` **không có policy update/delete**, kể cả cho chính chủ.

### 2. Ghi qua RPC, không insert thẳng

RLS trả lời được câu "hàng này có phải của bạn không", nhưng không trả lời được câu
"bạn đã ghi bao nhiêu hàng". Một tài khoản hợp lệ vẫn có thể bơm hàng triệu hàng.
V8 xoá policy insert của `learning_events`; mọi ghi đi qua `log_learning_events()`,
hàm này đếm hạn mức ngày (5.000 event), chặn payload > 500/lần, kẹp `duration_seconds`
ở 2 giờ, và từ chối event có thời điểm ở tương lai hoặc quá 90 ngày trước.

Chạm trần thì client dừng thử lại tới nửa đêm thay vì quay vòng; event nằm nguyên
trong hàng đợi và lên vào ngày hôm sau.

### 3. Không tự động chiếm dữ liệu của hồ sơ khách

V6 tự gộp tiến trình khách vào tài khoản đầu tiên đăng nhập trên máy đó. Trên máy
dùng chung, người đăng nhập trước nuốt luôn tiến trình của người học trước, im lặng
và không hoàn tác được. Giờ tài khoản mới bắt đầu từ hồ sơ trắng và app hỏi rõ một lần.

### 4. Corpus: bản tĩnh trước, nâng cấp sau

Việc kiểm tra phiên bản **không bao giờ** được chặn đường khởi động. JSON đóng gói
luôn hiển thị trước — nhanh, chạy được cả khi ngoại tuyến và cả khi máy chủ chết.
Đối chiếu `content_manifest()` chạy ngầm sau 800 ms; chỉ khi máy chủ có phiên bản cao
hơn bản đóng gói thì mới tải và thay tại chỗ. Nội dung ôn thi không phải dữ liệu cá
nhân nên `content_items` cho `anon` đọc.

Khởi động tải 637 KB thay vì 2,7 MB (giảm 76%): `topic_vocab.json` và `exams.json`
chỉ tải khi vào đúng tab.

## Kiểm thử

147 test chạy được trên **cả hai** bản, và phải cho kết quả giống hệt nhau:

```bash
npm --prefix qa i
node qa/test_v7.js && node qa/test_v8.js && node qa/test_flows.js              # js/*.js
MODE=legacy node qa/test_v7.js  # ...                                          # bản IIFE cũ
python3 qa/check_modules.py     # bắt lỗi import tĩnh trước khi chạy
```

`qa/harness.js` dựng jsdom rồi gán global trình duyệt vào Node, nhờ đó `import()` của
Node nạp được ES module thật — jsdom không hỗ trợ `<script type="module">`.
`qa/check_modules.py` quét tĩnh hai lớp lỗi mà ESM hay dính: gán vào ký hiệu đã import,
và dùng ký hiệu của module khác mà quên import.

## Cập nhật nội dung ôn thi mà không deploy lại

```bash
export SUPABASE_URL=https://<ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service_role_key>   # KHÔNG bao giờ đưa vào repo

python3 tools/push_content.py --list          # xem pack nào đã đổi
python3 tools/push_content.py --dry-run core  # xem trước
python3 tools/push_content.py --all           # đẩy
```

Script so checksum trước, chỉ đẩy pack thực sự đổi, ghi `content_items` xong mới tăng
`version` (ngược lại client sẽ thấy version mới trong khi nội dung còn nạp dở và tải
về bản thiếu), và dọn mục đã bị xoá khỏi nguồn. Client tự nhận bản mới ở lần mở kế tiếp.

## Còn nợ

1. **Realtime chỉ nghe, chưa giải quyết xung đột hai chiều** — hai tab cùng sửa một
   thẻ trong vài giây vẫn có thể lệch tới lần sync sau.
2. **Chưa có chỉ số vận hành** — không biết bao nhiêu người chạm trần hạn mức, hay
   pack nào đang lỗi tải. Cần một view đếm theo ngày cho admin.
3. **Chưa test trên trình duyệt thật** — xem "Chưa kiểm thử được ở đây" trong QA_REPORT_V7.md.
4. **Chưa có CI** — 147 test và hai script kiểm tra tĩnh đang phải chạy tay.
