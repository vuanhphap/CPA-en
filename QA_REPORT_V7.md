# QA V7 — báo cáo kiểm thử

Ngày: 2026-09-03 · Phạm vi: chuyển từ app một người dùng sang nền tảng web nhiều người dùng.

## Cách kiểm thử

Không dựng được trình duyệt headless trong môi trường sandbox (tải Chromium bị chặn bởi
chính sách mạng), nên thay bằng **jsdom chạy chính `app.js` thật**, với Supabase giả lập
và `fetch` đọc corpus từ đĩa. Cách này bắt được lỗi runtime thật ở luồng khởi động, điều
hướng và danh tính — thứ mà kiểm tra cú pháp tĩnh không thấy được.

```bash
npm i jsdom && node qa/test_v7.js
```

Kết quả: **51 đạt / 0 lỗi**.

| Nhóm | Test | Nội dung |
|---|---:|---|
| Khởi động & tải dữ liệu | 6 | không lỗi JS, dashboard render, dataset nặng không tải sớm |
| Lazy-load theo view | 3 | topic_vocab và exams chỉ tải khi vào đúng tab |
| Giao diện danh tính (khách) | 5 | trạng thái avatar, hiện/ẩn mục menu, badge đồng bộ |
| Hộp thoại đăng nhập | 7 | chuyển tab, hiện/ẩn ô nhập theo ngữ cảnh |
| Kiểm tra đầu vào | 5 | độ dài mật khẩu, ô xác nhận, tham số gọi signUp |
| Đo độ mạnh mật khẩu | 2 | phân mức yếu/mạnh |
| OAuth | 3 | render nút, gọi hàm, truyền redirectTo |
| Quên mật khẩu | 1 | gọi resetPasswordForEmail |
| Event log | 4 | eventQueue tồn tại, state lên version 3, client_id ổn định |
| Đăng nhập | 6 | giao diện đổi trạng thái, gọi RPC rebuild_daily_stats |
| Hồ sơ | 3 | dialog mở, điền sẵn mục tiêu, avatar cập nhật theo tên |
| Đăng xuất | 2 | gọi signOut, quay lại trạng thái khách |
| Tách hồ sơ | 2 | khoá localStorage riêng, không còn cờ tự chiếm dữ liệu |
| Duyệt hết tab | 2 | cả 12 tab render, không phát sinh lỗi JS |

## Lỗi do test bắt được (đã sửa)

**1. `requestIdleCallback is not a function`**
Mã viết `if('requestIdleCallback' in window)`. Phép kiểm tra này đúng cả khi giá trị là
`undefined`, nên ở môi trường có khoá nhưng không có hàm (Safari cũ, một số WebView,
môi trường có polyfill dở) sẽ ném TypeError ngay lúc khởi động.
→ Đổi sang `typeof window.requestIdleCallback === 'function'`.

**2. `client_id` không được tạo cho tới lượt học đầu tiên**
Định danh thiết bị chỉ sinh ra lần đầu `queueEvent()` chạy. Người dùng mở app, đăng nhập,
đồng bộ mà chưa học lượt nào thì chưa có định danh thiết bị để truy vết event trùng.
→ Gọi `clientId()` ngay trong `init()`.

## Kiểm tra bảo mật

| Hạng mục | Kết quả |
|---|---|
| `service_role` key trong repo | không có (chỉ có anon/publishable key, đúng thiết kế) |
| RLS trên bảng mới `learning_events` | bật, có select + insert, **cố ý không có update/delete** |
| RLS trên `user_roles` | bật, chỉ cho đọc hàng của chính mình; cấp quyền chỉ qua service-role |
| RPC `delete_my_account` | `revoke from public, anon`, chỉ `authenticated` chạy được |
| RPC `rebuild_daily_stats` | như trên, tự lấy `auth.uid()` chứ không nhận user_id từ tham số |
| View `v_user_daily`, `v_user_overview` | `security_invoker = true` — RLS vẫn áp dụng (view thường bị bỏ sót chỗ này) |
| CSP | có trong `vercel.json`; `connect-src` chỉ mở cho self và `*.supabase.co` |

Lý do dùng view thường thay vì materialized view: **materialized view không tôn trọng RLS**.
Đặt dữ liệu học của mọi người vào một materialized view rồi cho client đọc là rò dữ liệu
chéo giữa các tài khoản.

## Hiệu năng

| Chỉ số | V6 | V7 |
|---|---:|---:|
| Tải trước khi hiện màn hình đầu | 2,7 MB | **637 KB** |
| Số request lúc khởi động | 14 | 11 |
| File tải mà không mã nào dùng | 92 KB | 0 |

`topic_vocab.json` (1,7 MB) và `exams.json` (272 KB) chuyển sang tải theo tab, kèm trạng
thái đang tải và nút thử lại khi mạng hỏng; sau đó nạp ngầm lúc trình duyệt rảnh nên lần
vào tab đầu tiên hầu như không phải chờ.

## Chưa kiểm thử được ở đây

Những mục sau cần môi trường thật, phải tự chạy tay sau khi deploy:

- Gửi và nhận email xác nhận thật (cần SMTP)
- Luồng OAuth đầy đủ (cần provider thật đã cấu hình)
- RLS thật trên Postgres: **đăng nhập bằng hai tài khoản khác nhau và xác nhận không bên
  nào thấy dữ liệu của bên kia** — đây là mục quan trọng nhất trong danh sách này
- Hành vi service worker qua nhiều lần deploy
- Cài đặt PWA trên iOS/Android thật
- Sync thật giữa hai thiết bị cùng học ngoại tuyến rồi cùng lên mạng
