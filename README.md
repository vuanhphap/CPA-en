# CPA English Trainer

App học tiếng Anh CPA offline-first, dựng từ corpus 14 đề thi (2010–2020, 2022–2024) và
workbook từ vựng V2. Nhiều người dùng đăng ký tài khoản riêng, tiến trình đồng bộ qua
Supabase, triển khai qua GitHub Pages (phát triển) và Vercel (domain thật).

**Bắt đầu ở đâu:** [DEPLOYMENT.md](DEPLOYMENT.md) để dựng hệ thống,
[ARCHITECTURE.md](ARCHITECTURE.md) để hiểu vì sao nó được thiết kế như vậy.

Đây là bản **gộp** hai nguồn: khung sườn nhiều-file + Supabase + GitHub Pages của bản
upload trước, cộng với lớp nội dung luyện đề đã kiểm chứng (word formation, viết lại câu,
dịch, nghĩa tiếng Việt, ngân hàng câu ví dụ thật) từ bản single-file trước đó. Mục
"Đã sửa khi gộp" bên dưới liệt kê đúng những gì thay đổi so với bản upload gốc.

## Cảnh báo quan trọng nhất: đáp án tự soạn, không phải đáp án chính thức

**Corpus OCR gốc không có đáp án — chỉ có đề.** 257 câu ở mục "Luyện câu đề thi" (95 word
formation + 73 viết lại câu + 89 câu dịch hai chiều) có đáp án/bản dịch mẫu **do soạn dựa
trên ngữ pháp và thuật ngữ chuẩn**, không đối chiếu được với đáp án của Hội đồng thi. App
có banner đỏ nhắc lại điều này ngay đầu mục đó. 3 câu word formation + 1 câu viết lại câu
có sai khác giữa OCR gốc và bản dùng để ra đáp án (nghi OCR đọc sai) — được đánh dấu ⚠
ngay tại câu, kèm giải thích.

Tương tự, Quiz tự chấm (Core/Word Family/Collocation/Cloze) sinh câu hỏi từ **cấu trúc dữ
liệu V2** (nhãn topic, họ từ, cụm từ), không phải đáp án chính thức của đề. Riêng "Luyện đề
gốc" (đọc nguyên đề theo năm) không tự chấm gì cả — chỉ lưu bài làm tự do + điểm tự chấm.

## Nội dung dữ liệu

| Nguồn | Số lượng | Ghi chú |
|---|---|---|
| Từ vựng toàn corpus | 4.225 từ | tần suất, số năm, mức ưu tiên — đối chiếu khớp 100% với workbook gốc |
| Core CPA | 192 mục | 207 mục (gồm cả collocation) có nghĩa tiếng Việt soạn tay |
| Word families | 78 gốc | trích từ phần chia dạng từ trong đề |
| Collocations | 237 cụm | 113 cụm có bằng chứng corpus + 124 cụm mở rộng chuẩn để học; nhãn nguồn tách biệt |
| General expansion (NGSL) | 309 mục | mở rộng ngoài đề, gắn nhãn tách biệt — không phải bằng chứng đề thi trực tiếp |
| Ngân hàng câu từ corpus | 472 câu | 416 câu khớp trực tiếp OCR; 56 câu đã chuẩn hóa/clean từ OCR. Sau QA: 440 câu dùng để học, 32 câu nhiễu bị loại khỏi active learning |
| Word formation có đáp án | 95 câu | 92/95 chắc chắn, 3 câu đánh dấu ⚠ |
| Viết lại câu có đáp án mẫu | 73 câu | 72/73 đối chiếu khớp câu gốc |
| Dịch Anh→Việt / Việt→Anh | 42 / 47 câu | đã soát lại thuật ngữ kiểm toán/kế toán |
| Đề gốc đầy đủ | 14 năm | giữ nguyên dấu tiếng Việt như OCR đọc được (xem giới hạn bên dưới) |

Đây là **bản trích chọn lọc**, không phải toàn văn mọi câu recoverable trong đề — nhiều câu
OCR hỏng tới mức không dịch/chấm lại đáng tin nên bị bỏ qua có chủ đích.

**Giới hạn OCR tiếng Việt:** bản quét đọc tiếng Anh tốt nhưng đọc tiếng Việt kém hẳn — dấu
thanh bị nhận sai hàng loạt (vd. "được" → "duge"). Đây là lỗi của bản quét gốc, tab "Luyện
đề gốc" hiển thị đúng những gì OCR đọc được, không tự ý sửa.

## Tính năng

- SRS kiểu SM-2 thật (không phải Leitner đơn giản) cho từ vựng / word family / collocation
- **IPA en-US cho 4.546 từ/cụm** (ưu tiên phonemic IPA từ CMUdict; fallback có kiểm soát) + nút 🔊 đọc bằng Web Speech API trên thiết bị
- **Học theo cụm & câu:** nghe cụm, nghe câu từ corpus đề, tô sáng focus term, cloze và SRS theo câu; câu nhiễu OCR bị loại khỏi active learning
- Học SRS có nghĩa tiếng Việt + câu ví dụ thật khi có, ghi chú riêng của người học
- Quiz tự chấm 4 chế độ: Core CPA, Word Family, Collocation, **Điền từ câu thật (mới)**
- **Luyện câu đề thi (mới):** word formation tự chấm, viết lại câu/dịch tự đối chiếu bản mẫu
- **Từ điển (mới):** tra cứu/lọc/sắp xếp toàn bộ 4.225 từ, có nghĩa tiếng Việt khi có
- Luyện đề gốc: đọc nguyên văn theo năm, **tìm & highlight trong đề (mới)**, hẹn giờ 90 phút, bài làm tự do
- Dashboard V6: readiness, mục tiêu ngày, biểu đồ 7/30/90 ngày, heatmap 12 tuần, dự báo SRS 7 ngày
- Câu/từ yếu V6: Weakness Score + queue ôn yếu thật; Smart Study tự ưu tiên thẻ yếu/đến hạn
- Tiến trình học V6: session history offline/cloud, lọc theo chế độ và thời gian
- Offline-first (localStorage), export/import JSON, PWA (service worker + manifest)
- Supabase Auth (email/password) + đồng bộ tiến trình đa thiết bị

## Có gì mới ở V7 (nhiều người dùng)

Bản V6 chạy tốt cho một người trên một máy. V7 sửa những chỗ sẽ vỡ khi có người lạ
đăng ký dùng:

**Danh tính**
- Đăng nhập / Tạo tài khoản / Quên mật khẩu tách thành 3 tab, thông báo lỗi bằng tiếng
  Việt thay vì ném nguyên chuỗi lỗi của Supabase ra màn hình
- Đặt lại mật khẩu qua email và xử lý luôn link `type=recovery` khi người dùng bấm vào
- Gửi lại email xác nhận khi đăng nhập gặp lỗi "email chưa xác nhận"
- Đăng nhập Google/GitHub (tự ẩn nếu chưa bật provider trong Supabase)
- Menu tài khoản: avatar, tên hiển thị, chỉ số nhanh, đăng xuất — thay cho việc phải
  chui vào hộp thoại mới đăng xuất được
- Hồ sơ sửa được: tên hiển thị, màu đại diện, mục tiêu học; đồng bộ qua bảng `profiles`
- Trigger `handle_new_user` tự tạo hàng `profiles` khi có user mới, kèm backfill cho
  các user đã đăng ký từ trước

**Toàn vẹn dữ liệu**
- Bảng `learning_events` append-only: mỗi lượt học là một hàng bất biến, `event_id` do
  client sinh nên đẩy lại bao nhiêu lần cũng không nhân đôi
- Hàng đợi ngoại tuyến: mất mạng thì event nằm chờ và tự đẩy lên khi có mạng lại
- RPC `rebuild_daily_stats()` dựng lại thống kê ngày từ event log, dùng `greatest()` nên
  không bao giờ tụt số khi hai thiết bị cùng đồng bộ
- **Bỏ cơ chế tự chiếm dữ liệu hồ sơ khách.** V6 gộp thẳng tiến trình khách vào tài
  khoản đầu tiên đăng nhập — trên máy dùng chung là mất dữ liệu của người khác. Giờ hỏi
  rõ một lần và cho chọn.
- `delete_my_account()`: người dùng tự xoá tài khoản và toàn bộ dữ liệu
- `user_roles` + `has_role()` để sau này thêm admin mà không phải nới RLS bảng học tập

**Hiệu năng**
- Corpus tải theo nhu cầu: **637 KB lúc khởi động thay vì 2,7 MB (giảm 76%)**;
  `topic_vocab.json` và `exams.json` chỉ tải khi vào tab cần, rồi nạp ngầm lúc rảnh
- Bỏ `general_expansion.json` khỏi luồng tải — không có mã nào đọc tới nó
- Service worker chuyển vỏ app sang network-first: deploy bản mới là máy khách nhận
  được ngay, thay vì kẹt bản cũ cho tới khi tự xoá cache

**Giao diện & tiếp cận**
- Sidebar chia nhóm Theo dõi / Học / Luyện thi / Khác
- Link bỏ qua điều hướng, viền focus rõ, nhãn ARIA, tôn trọng `prefers-reduced-motion`
- Trạng thái tải riêng cho từng phần thay vì một màn hình trắng chung
- Biểu ngữ mất mạng, thông báo lỗi phân biệt "mất mạng" với "lỗi máy chủ"
- Thẻ meta SEO/Open Graph, icon PWA, lối tắt trong manifest

**Kiểm thử**
- `qa/test_v7.js`: 51 test chạy `app.js` thật trong jsdom với Supabase giả lập, phủ
  luồng danh tính, lazy-load, tách hồ sơ và render toàn bộ 12 tab

## Đã sửa khi gộp

1. **Lỗi chí mạng:** `app.js` bản upload gọi `data/*.json.gzbin` (qua `DecompressionStream`)
   nhưng thư mục `data/` chỉ có file `.json` thường — mọi request 404, **app không load được
   dữ liệu, không khởi động nổi**. Đã bỏ hẳn cơ chế gzip thủ công này (GitHub Pages/Fastly
   đã tự nén gzip ở tầng HTTP, không cần tự làm lại và không cần lo trình duyệt cũ không hỗ
   trợ `DecompressionStream`), chuyển sang fetch JSON thường. `sw.js` cũng sửa theo.
2. **Lỗ hổng bảo mật:** `supabase/schema.sql` bật `row level security` trên cả 5 bảng nhưng
   **không kèm policy nào** — nghĩa là bật RLS mà không có policy thì mọi truy cập đều bị
   từ chối theo mặc định, kể cả chính chủ user. Đã thêm đầy đủ policy select/insert/update/
   delete theo `auth.uid() = user_id` cho cả 5 bảng, viết an toàn để chạy lại nhiều lần
   (`drop policy if exists` trước mỗi `create policy`).
3. **Bug điều hướng có sẵn:** dispatcher của `navigate()` viết
   `quiz:()=>quiz?renderQuiz():renderQuizLanding` — thiếu cặp `()` sau `renderQuizLanding`,
   nên khi `quiz` là `null`, hàm chỉ *trả về tham chiếu hàm* thay vì *gọi* nó — tab "Quiz tự
   chấm" không hiện gì ở lần bấm đầu tiên (màn hình cũ đứng yên). Đã sửa.
4. Bổ sung toàn bộ lớp nội dung từ bản trước: `glosses.json` (207 nghĩa tiếng Việt),
   `sentences.json` (472 câu thật), `drills_wf/tr/tle/tlv.json` (257 câu có đáp án tự soạn,
   kèm cột cảnh báo cho 4 câu có nghi vấn OCR).
5. Thêm 2 view mới: **Từ điển** (tra cứu toàn bộ 4.225 từ) và **Luyện câu đề thi** (word
   formation/viết lại câu/dịch), thêm chế độ quiz **Điền từ câu thật**, thêm ô tìm+highlight
   trong "Luyện đề gốc", wire nghĩa tiếng Việt vào thẻ học SRS.
6. Mở rộng `study_sessions.mode` CHECK constraint để nhận các mode luyện tập mới
   (`word_formation`, `sentence_transform`, `translation`, `cloze`).

Đã kiểm thử toàn bộ bằng cách chạy app qua HTTP server thật (không phải `file://`) và click
qua từng tab bằng trình duyệt headless: cả 4 chế độ quiz, cả 4 dạng luyện đề, tra cứu từ
điển, tìm kiếm trong đề gốc, chấm thẻ SRS + tồn tại qua reload trang, và giao diện mobile —
không còn lỗi console/JS nào (ngoại trừ việc script Supabase từ CDN không tải được trong
môi trường sandbox không có mạng ngoài — sẽ tải bình thường khi lên GitHub Pages thật).

## Triển khai

Hướng dẫn đầy đủ ở **[DEPLOYMENT.md](DEPLOYMENT.md)** — Supabase → GitHub → Vercel,
kèm checklist trước khi mở cho người dùng thật và bảng xử lý sự cố.

Tóm tắt:

```bash
# 1. Supabase: dán supabase/schema.sql vào SQL Editor, chạy
#    rồi Authentication → URL Configuration → thêm mọi domain sẽ dùng
# 2. GitHub
git init && git add . && git commit -m "v7" && git push -u origin main
#    Settings → Pages → Source: GitHub Actions
# 3. Vercel: Import repo, Framework = Other, Build Command để trống, Output = .

# Chạy thử tại máy (đừng mở bằng file://)
python3 -m http.server 8080
```

Hai chỗ hay quên nhất, đều nằm ở Supabase:
- **Redirect URLs** phải liệt kê từng domain (localhost, github.io, vercel.app, domain
  riêng). Thiếu cái nào thì link xác nhận email về domain đó sẽ báo lỗi.
- **SMTP mặc định chỉ ~3–4 email/giờ.** Mở cho người dùng thật thì phải gắn SMTP riêng,
  nếu không sẽ tưởng app hỏng trong khi thực ra là hết hạn mức gửi mail.

## Theo dõi tiến trình học

Không đăng nhập vẫn học bình thường (lưu trong `localStorage` của trình duyệt). Đăng nhập
(nút "Đăng nhập để đồng bộ") để tiến trình đồng bộ hai chiều qua Supabase — cùng tài khoản
mở trên máy khác sẽ thấy lại đúng lịch ôn SRS, điểm quiz/luyện câu, và lịch sử luyện đề.
Tab "Dữ liệu & cài đặt" có nút export/import JSON để backup độc lập với cloud, và nút xoá
tiến trình local (không đụng tới dữ liệu cloud).

## Cấu trúc thư mục

```
cpa-english-trainer/
├── index.html, styles.css, config.js, app.js, sw.js, manifest.webmanifest, 404.html
├── data/
│   ├── core_cpa.json, topic_vocab.json*, word_families.json, collocations.json
│   ├── general_expansion.json (không dùng), topic_summary.json, exams.json*
│   └── glosses.json, ipa.json, sentences.json, drills_wf.json, drills_tr.json, drills_tle.json, drills_tlv.json
├── supabase/schema.sql
└── .github/workflows/pages.yml
```

## V4 — IPA, audio và học theo cụm/câu

- `data/ipa.json`: 4.546 mục IPA en-US. 4.510 mục dùng CMUdict phonemic IPA; 36 mục hợp lệ ngoài CMUdict dùng fallback/phiên âm kiểm soát. 56 mục OCR/tên không chắc chắn bị bỏ IPA thay vì dạy phát âm có thể sai.
- Âm thanh dùng Web Speech API (`speechSynthesis`) nên không phải tải hàng nghìn MP3; giọng thực tế phụ thuộc iOS/Android/Windows/macOS.
- Collocation tăng từ 62 lên 237. Mọi dòng đều có `source_type`: `Corpus confirmed` hoặc `Learning expansion`, để không nhầm cụm mở rộng với cụm đã xuất hiện trực tiếp trong đề.
- `sentences.json` có 472 câu nguồn, bổ sung `focus_term`, `focus_ipa`, `focus_meaning_vi`, `topic`, `quality`, `source_fidelity`. 416 câu khớp trực tiếp OCR; 56 câu là bản clean/normalize. Quiz tự chấm chỉ dùng câu `Exact OCR` + `high`; chế độ học câu dùng toàn bộ câu `high`.


## V5 — kiểm định hai vòng (2026-09-03)

Bản này đã qua hai vòng QA độc lập. Chi tiết xem `QA_REPORT.md`. Các sửa quan trọng:

- SRS dùng lịch SM-2 chuẩn theo quality 0–5; bỏ các hệ số Hard/Easy tự chế trước đây.
- `Từ mới/ngày` giờ là giới hạn theo **ngày lịch địa phương**, không phải mỗi lần mở phiên học. Thẻ chưa đến hạn không còn bị nhét vào cuối hàng đợi.
- Sửa `dateKey()` trước đây dùng UTC, có thể ghi sai ngày tại Việt Nam trong khoảng 00:00–06:59.
- Quiz collocation bỏ kiểu distractor từ rời có thể tạo nhiều đáp án hợp lý; ưu tiên cloze trên câu corpus chất lượng cao hoặc chọn cả collocation từ nghĩa.
- Quiz cloze chỉ lấy câu `Exact OCR` + `high`, và lưu cloud dưới `item_type=question` để khớp CHECK constraint của Supabase.
- IPA chuyển từ eSpeak narrow/allophonic sang learner-friendly broad/phonemic IPA từ CMUdict cho các mục có thể xác minh.
- Chuẩn hóa một số thuật ngữ chuyên môn: `financial reporting`, `going concern`, `sales volume`, `public accounting firm`, `audit engagement`…; thêm ghi chú phân biệt thuật ngữ dễ nhầm.
- Hai bản dịch mẫu kỹ thuật được chỉnh để sát thuật ngữ hơn: `financial reporting` và trách nhiệm của `management` trong audit engagement.
- 32 câu có dấu hiệu OCR/grammar không đủ tin cậy bị loại khỏi học câu và quiz; vẫn giữ trong file nguồn để truy vết.

## V6 — Learning Analytics + nền tảng multi-user (2026-09-03)

V6 tập trung biến app từ bộ công cụ luyện bài thành hệ thống điều phối việc học:

- **Dashboard 7/30/90 ngày**: phút học/ngày, accuracy/ngày, heatmap 12 tuần, SRS due forecast 7 ngày.
- **CPA Readiness Score 0–100**: tổng hợp Core CPA, Word Family, Collocation, câu/cloze corpus, accuracy, tính đều đặn và mock exam. Đây là chỉ số nội bộ để theo dõi xu hướng, không phải dự báo điểm thi chính thức.
- **Weakness Score**: ưu tiên theo tỷ lệ sai, lapse, due/quá hạn và thời gian phản hồi. Nút `Ôn đúng danh sách này` tạo **weak queue thật**, không còn chỉ chuyển về Core SRS.
- **Smart Study**: tự gom thẻ yếu/đến hạn trước, sau đó bổ sung đúng quota từ mới còn lại trong ngày.
- **Mục tiêu học cá nhân**: phút/ngày, lượt ôn/ngày, từ mới/ngày, ngày thi mục tiêu.
- **Session History**: lưu phiên SRS/quiz/chunk/drill/mock exam ngay cả khi offline; có tab `Tiến trình học` để lọc 7/30/90 ngày/toàn bộ.
- **Local profile isolation**: cache localStorage được namespace theo `user_id`; nhiều tài khoản dùng cùng trình duyệt không dùng chung một state.
- **Supabase profile goals + session sync**: mục tiêu và lịch sử phiên gắn theo `user_id`, tiếp tục được bảo vệ bằng RLS.
- `daily_stats` và `study_sessions` có `updated_at` server-side để chuẩn bị cho sync nhiều client.

### Lưu ý khi nâng từ V5

V6 tự đọc state V5 (`cpa_english_trainer_state_v1`) và migrate sang state V2. Khi tài khoản đầu tiên đăng nhập trên thiết bị có dữ liệu V5/guest, app sẽ claim bản local cũ vào tài khoản đó một lần; các tài khoản đăng nhập sau có cache tách riêng.

> **V7 đã bỏ hành vi claim tự động này.** Trên máy dùng chung, nó khiến người đăng nhập trước nuốt luôn tiến trình của người học trước đó mà không hỏi. Giờ tài khoản mới bắt đầu từ hồ sơ trắng và app hỏi rõ một lần nếu phát hiện có dữ liệu khách trên máy.

**Sau khi deploy V6 phải chạy lại `supabase/schema.sql`** để thêm các cột goal/`updated_at` và trigger mới. App có fallback cho một số schema cũ, nhưng đầy đủ analytics/cloud history chỉ hoạt động đúng sau migration.

## V7 — Nền tảng web nhiều người dùng (2026-09-03)

V6 dựng xong phần móng cho multi-user. V7 sửa những chỗ sẽ vỡ khi có người lạ thật sự
đăng ký dùng, và cắt thời gian tải lần đầu.

### Ba lỗi thiết kế được sửa

**1. Tự chiếm dữ liệu hồ sơ khách.** V6 gộp thẳng tiến trình khách vào tài khoản đầu tiên
đăng nhập trên máy đó. Trên máy dùng chung, người đăng nhập trước nuốt luôn tiến trình của
người học trước, im lặng và không hoàn tác được. V7 bắt đầu từ hồ sơ trắng và hỏi rõ một lần.

**2. Counter theo ngày mất số liệu khi đồng bộ nhiều thiết bị.** `daily_stats` là counter
cộng dồn, hai thiết bị cùng học ngoại tuyến rồi cùng sync sẽ ghi đè nhau. V7 thêm
`learning_events` append-only với `event_id` do client sinh, đồng bộ bằng
`upsert ... ignoreDuplicates`, và RPC `rebuild_daily_stats()` dựng lại counter bằng
`greatest()` nên không bao giờ tụt số.

**3. Tải 2,7 MB trước khi hiện được màn hình đầu.** Với người dùng mới trên 4G, đó là vài
giây màn hình trắng ngay ở ấn tượng đầu tiên. Giờ tải 637 KB (giảm 76%), phần nặng tải theo
tab và nạp ngầm lúc trình duyệt rảnh.

### Thêm mới

| Nhóm | Nội dung |
|---|---|
| Danh tính | Tab Đăng nhập/Đăng ký/Quên mật khẩu, đặt lại mật khẩu qua email, gửi lại email xác nhận, OAuth Google/GitHub, thông báo lỗi tiếng Việt |
| Hồ sơ | Menu tài khoản có avatar và chỉ số nhanh, sửa tên hiển thị và màu đại diện, mục tiêu học đồng bộ qua `profiles` |
| Cơ sở dữ liệu | `learning_events`, `user_roles`, `has_role()`, `delete_my_account()`, `rebuild_daily_stats()`, view `v_user_daily` / `v_user_overview`, trigger `handle_new_user` + backfill |
| Ngoại tuyến | Hàng đợi event chờ đẩy, biểu ngữ mất mạng, phân biệt lỗi mạng với lỗi máy chủ |
| Service worker | Vỏ app network-first (deploy bản mới là nhận ngay), corpus vẫn cache-first |
| Tiếp cận | Link bỏ qua điều hướng, viền focus, nhãn ARIA, tôn trọng `prefers-reduced-motion` |
| Triển khai | `vercel.json` với CSP và chính sách cache, `DEPLOYMENT.md` |
| Kiểm thử | `qa/test_v7.js` — 51 test chạy `app.js` thật trong jsdom |

### Bắt buộc khi nâng từ V6

1. **Chạy lại `supabase/schema.sql`** (khối V7 ở cuối file, idempotent). Chưa chạy thì app
   vẫn hoạt động nhưng mất lớp chống mất số liệu đa thiết bị và nút xoá tài khoản.
2. **Thêm mọi domain vào Redirect URLs** của Supabase.
3. **Gắn SMTP riêng** trước khi mở cho người dùng thật — SMTP mặc định chỉ ~3–4 email/giờ.

---

## V8 — Hạn mức, realtime, corpus có phiên bản, tách module (2026-09-03)

### Bốn thay đổi

**1. Ghi qua RPC có hạn mức, không insert thẳng.** RLS trả lời được câu "hàng này có
phải của bạn không" nhưng không trả lời được câu "bạn đã ghi bao nhiêu hàng" — một tài
khoản hợp lệ vẫn bơm được hàng triệu hàng. V8 xoá policy insert của `learning_events`;
mọi ghi đi qua `log_learning_events()`: hạn mức 5.000 event/ngày, chặn payload
>500/lần, kẹp `duration_seconds` ở 2 giờ, từ chối event ở tương lai hoặc quá 90 ngày
trước. Chạm trần thì client dừng thử lại tới nửa đêm; event nằm nguyên trong hàng đợi.

**2. Realtime.** Nghe `study_progress` và `daily_stats`, lọc theo `user_id`. Cố ý
**không** nghe `learning_events`: nó ghi liên tục, phát đi chỉ tạo bão message mà client
không dùng. Echo cũ hơn không ghi đè bản mới hơn ở máy; counter lấy `max` nên không tụt số.

**3. Corpus có phiên bản.** Sửa nội dung ôn thi không cần deploy lại
(`tools/push_content.py`). Nguyên tắc: kiểm tra phiên bản **không bao giờ** chặn khởi
động — JSON đóng gói hiện trước, đối chiếu manifest chạy ngầm sau 800 ms, chỉ thay khi
máy chủ thực sự mới hơn.

**4. Tách `app.js` thành 13 ES module.** Import được suy ra tự động bằng cách quét ký
hiệu (`qa/split_modules.py`), không viết tay nên không thừa không thiếu.

### Bốn bug do test bắt được

| Bug | Hậu quả |
|---|---|
| Badge realtime bị `syncAll()` ghi đè | hai chỗ cùng ghi badge, chỗ chạy sau xoá mất trạng thái "đồng bộ sống" |
| Kiểm tra bản nội dung mới nằm chung `setTimeout` 3 giây với prefetch corpus nặng | thực tế gần như không bao giờ chạy |
| `stateOf()` trong test đọc nhầm hồ sơ khách khi đã đăng nhập | một test đang **xanh giả** |
| `'requestIdleCallback' in window` đúng cả khi giá trị `undefined` | TypeError lúc khởi động trên Safari cũ / WebView |

### Ba cái bẫy gặp khi tách module

- **Đếm ngoặc để cắt khối bị regex literal đánh lừa.** `/[.*+?^${}()|[\]\\]/g` có ngoặc
  không cân nên một khối nuốt luôn khai báo phía sau. Bỏ đếm ngoặc, dùng ranh giới khai báo.
- **Xoá template literal khi quét ký hiệu** nuốt luôn mã trong `${...}` → thiếu import.
  Giữ nguyên template literal: thừa import thì vô hại, thiếu import thì app chết.
- **Regex lọc `.prop` ăn luôn toán tử spread `...sm2(`.**

Sau đó viết `qa/check_modules.py` quét tĩnh hai lớp lỗi ESM hay dính (gán vào ký hiệu
đã import; dùng ký hiệu chưa import) để bắt hết một lượt thay vì sửa từng lần crash.

### Cổng chặn khi refactor

`qa/harness.js` dựng jsdom rồi gán global trình duyệt vào Node, nhờ đó `import()` nạp
được ES module thật — **jsdom không hỗ trợ `<script type="module">`**, đây là mắt xích
bắt buộc phải có trước khi tách module.

Cùng 147 test chạy trên cả hai bản và cho kết quả giống hệt nhau:

```
LEGACY (qa/app.legacy.js): 51 + 38 + 58 = 147 đạt / 0 lỗi
MODULE (js/main.js):       51 + 38 + 58 = 147 đạt / 0 lỗi
```

Qua cổng rồi mới đổi `index.html` sang `js/main.js`.

### Bắt buộc khi nâng từ V7

1. **Chạy lại `supabase/schema.sql`** (khối V8 ở cuối, idempotent). Chưa chạy thì client
   tự lùi về cách ghi cũ, nhưng mất hạn mức, realtime và corpus có phiên bản.
2. **Bật Realtime** cho `study_progress` và `daily_stats` trong Supabase Dashboard.
3. **Xoay service-role key** nếu từng dùng nó ở đâu khác ngoài máy cá nhân.
