# Triển khai trên Cloudflare và chuyện chống DDoS

## Điều quan trọng nhất, nói trước

**Đặt web sau Cloudflare KHÔNG bảo vệ Supabase.**

Trình duyệt gọi thẳng `https://<ref>.supabase.co`. Traffic đó không đi qua Cloudflare,
không qua Vercel, không qua bất kỳ CDN nào của bạn.

```
Người dùng ──► Cloudflare Pages ──► HTML, CSS, JS, font, corpus JSON
   │                                 (CDN hấp thụ, băng thông không giới hạn)
   │
   └──────────► <ref>.supabase.co ── đăng nhập, tiến trình học, đồng bộ
                     ▲
                     └── ĐI THẲNG. Cloudflare không nhìn thấy gì ở đây.
```

Nghĩa là: phần tĩnh gần như miễn nhiễm DDoS, còn phần thật sự tốn tiền và có thể gục
thì vẫn phơi ra. Đó mới là chỗ cần lo, và cũng là chỗ phần lớn hướng dẫn trên mạng bỏ qua.

## Phần tĩnh: an toàn, gần như không phải làm gì

Cloudflare Pages băng thông không giới hạn ở gói miễn phí, có sẵn chống DDoS tầng 3/4 và
7. Một đợt flood vào trang chủ chỉ làm tốn băng thông của Cloudflare, không phải của bạn.

Repo đã sẵn sàng: `_headers` và `_redirects` là định dạng của Cloudflare Pages.
**Cloudflare KHÔNG đọc `vercel.json`** — thiếu `_headers` thì bản deploy chạy hoàn toàn
không có CSP mà không hề báo lỗi. `qa/test_design.js` có test đối chiếu CSP giữa hai tệp;
sửa một bên mà quên bên kia thì test đỏ.

```
Cloudflare Pages → Connect to Git → chọn repo
  Framework preset:  None
  Build command:     (để trống)
  Build output:      /
```

Không có build step, nên deploy chỉ là chép tệp.

## Phần Supabase: đây mới là việc phải làm

### Lớp 1 — trong chính database (đã có sẵn trong repo)

Chạy `supabase/schema.sql` là có, không phụ thuộc CDN nào:

| Cơ chế | Chặn được gì |
|---|---|
| `log_learning_events()` với hạn mức 5.000 event/ngày | bơm dữ liệu học giả |
| tối đa 500 event mỗi lần gọi | payload khổng lồ |
| `consume_heavy_rpc()` — cách nhau ≥20 giây, ≤120 lần/ngày | gọi lặp `rebuild_daily_stats` làm nghẽn CPU |
| `days_back` bị kẹp trong 1–400 | client tự ý yêu cầu quét 10 năm |
| `content_items` chỉ cho tài khoản đã đăng nhập đọc | kéo corpus 1,7 MB vô hạn bằng khoá anon công khai |
| RLS trên mọi bảng | đọc dữ liệu người khác |
| `learning_events` không có policy update/delete | sửa lịch sử học |

Vì sao đóng `content_items` với khách vô danh: khoá anon nằm công khai trong mã nguồn
theo đúng thiết kế. Mở corpus cho `anon` biến nó thành bộ khuếch đại băng thông tính
tiền trên hoá đơn Supabase. Người chưa đăng nhập vẫn học bình thường — họ đọc JSON tĩnh
đóng gói sẵn do CDN phục vụ, miễn phí và không giới hạn.

### Lớp 2 — cấu hình trong Supabase Dashboard

Những mục này **không** nằm trong repo, phải tự bật:

1. **Auth → Rate Limits.** Đặt giới hạn cho `signup`, `signin`, `token refresh`,
   `password recovery`. Mặc định khá rộng rãi.
2. **Auth → bật CAPTCHA** (hCaptcha hoặc Cloudflare Turnstile). Đây là biện pháp hiệu
   quả nhất chống đăng ký hàng loạt, và nó chặn đúng chỗ: trước khi email được gửi.
3. **SMTP riêng.** SMTP mặc định ~3–4 email/giờ. Một đợt spam đăng ký sẽ đốt sạch hạn
   mức và người dùng thật không nhận được email xác nhận.
4. **Bật Point-in-Time Recovery** (gói Pro) để còn đường lùi.
5. **Đặt cảnh báo chi phí.** DDoS vào một dự án serverless thường không làm sập — nó
   làm bạn nhận hoá đơn.

### Lớp 3 — đưa Supabase ra sau Cloudflare (nếu muốn WAF thật)

Chỉ khi nào cần rate-limit tầng mạng cho API:

1. Supabase (gói Pro) → Settings → Custom Domains → gắn `api.domain-cua-ban.com`.
2. Trỏ DNS bản ghi đó qua Cloudflare, **bật đám mây cam** (proxied).
3. Đổi `SUPABASE_URL` trong `config.js` sang domain mới.
4. Sửa CSP ở **cả** `_headers` **và** `vercel.json`:
   `connect-src 'self' https://api.domain-cua-ban.com wss://api.domain-cua-ban.com`
5. Bật Cloudflare **Rate Limiting Rules** cho `/auth/v1/*`, và **WAF** ở chế độ theo dõi
   trước, chỉ chuyển sang chặn sau khi xem log vài ngày.

Sau bước này traffic API mới thật sự đi qua Cloudflare.

**Cân nhắc trước khi làm:** thêm một chặng mạng nữa nghĩa là thêm một chỗ có thể hỏng
và thêm độ trễ. Với vài trăm người học thì Lớp 1 và Lớp 2 là đủ. Chỉ làm Lớp 3 khi đã
thật sự bị tấn công, hoặc khi lượng người dùng đủ lớn để đáng công.

## Nên chọn nền tảng nào

Repo chạy được cả hai, không cần sửa gì.

| | Cloudflare Pages | Vercel |
|---|---|---|
| Băng thông gói miễn phí | không giới hạn | 100 GB/tháng |
| Rủi ro khi bị flood | tốn băng thông của Cloudflare | có thể vượt hạn mức hoặc phát sinh phí |
| Tệp cấu hình | `_headers`, `_redirects` | `vercel.json` |
| Độ trễ ở Việt Nam | có PoP tại Hà Nội và TP.HCM | PoP Singapore |

Với đúng nỗi lo của bạn — DDoS và chi phí bất ngờ — **Cloudflare Pages là lựa chọn hợp
lý hơn**: băng thông không giới hạn nghĩa là một đợt flood vào phần tĩnh không thể sinh
ra hoá đơn.

## Kiểm tra sau khi deploy

```bash
# 1. Header có thật sự được áp dụng không
curl -sI https://domain-cua-ban.com | grep -i "content-security-policy\|strict-transport"

# 2. Mở DevTools → Console, tìm dòng "Refused to load".
#    Không có dòng nào = CSP không chặn nhầm thứ app cần.

# 3. Ngoại tuyến: DevTools → Network → Offline, tải lại trang.
#    App phải vẫn học được và vẫn ĐÚNG FONT (nếu rơi về font hệ thống là precache lỗi).

# 4. Khách vô danh không đọc được corpus từ database
curl -s "https://<ref>.supabase.co/rest/v1/content_items?select=item_key&limit=1" \
     -H "apikey: <anon_key>"      # phải trả về mảng rỗng hoặc lỗi quyền

# 5. Hạn mức RPC nặng có chặn gọi dồn (chạy trong SQL Editor khi đã đăng nhập)
#    select public.consume_heavy_rpc(20);   -- true
#    select public.consume_heavy_rpc(20);   -- false
```

Mục 4 là mục dễ bỏ qua nhất và cũng là mục tốn tiền nhất nếu sai.
