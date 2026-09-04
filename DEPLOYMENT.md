# Triển khai CPA English Trainer

App là site tĩnh thuần (không build step). Supabase lo danh tính + dữ liệu người dùng.
GitHub Pages dùng cho giai đoạn phát triển; Vercel dùng khi gắn domain thật.

---

## 0. Thứ tự nên làm

```
Supabase (schema + auth)  →  GitHub (repo + Pages)  →  Vercel (domain)
```

Làm Supabase trước, vì cả GitHub Pages lẫn Vercel đều cần biết URL cuối cùng để
điền vào danh sách redirect. Mỗi lần thêm một domain mới, quay lại bước 1.4.

---

## 1. Supabase

### 1.1 Tạo project
Tạo project ở khu vực **Singapore (ap-southeast-1)** cho độ trễ tốt nhất từ Việt Nam.
Ghi lại `Project URL` và `anon/publishable key` (Settings → API).

### 1.2 Chạy schema
Mở **SQL Editor**, dán toàn bộ `supabase/schema.sql`, bấm Run.
File này viết theo kiểu idempotent — chạy lại nhiều lần không mất dữ liệu.

Kiểm tra sau khi chạy:

```sql
-- Mỗi bảng phải có policy. learning_events cố ý chỉ có 2 (select + insert).
select tablename, count(*) from pg_policies where schemaname='public' group by 1 order by 1;

-- Trigger tự tạo profile khi có user mới
select tgname from pg_trigger where tgrelid='auth.users'::regclass;

-- View tổng hợp chạy được
select * from public.v_user_overview;
```

### 1.3 Bật xác nhận email
**Authentication → Providers → Email**: bật `Confirm email`.
Không bật thì bất kỳ ai cũng đăng ký được bằng email của người khác.

### 1.4 Khai báo URL (bước hay bị quên nhất)
**Authentication → URL Configuration**:

| Trường | Giá trị |
|---|---|
| Site URL | domain chính thức, vd `https://cpa-english.vercel.app` |
| Redirect URLs | thêm **từng** URL sẽ dùng, mỗi dòng một cái |

Cần thêm đủ:
```
http://localhost:8080
http://localhost:8080/
https://<user>.github.io/cpa-english-trainer/
https://<project>.vercel.app/
https://domain-cua-ban.com/
```

Thiếu URL nào thì link xác nhận email và link đặt lại mật khẩu về URL đó sẽ báo
`redirect_to is not allowed`.

### 1.5 OAuth (tuỳ chọn)
Nếu muốn nút "Tiếp tục với Google/GitHub":
**Authentication → Providers** → bật provider, dán Client ID/Secret, và khai
callback `https://<project-ref>.supabase.co/auth/v1/callback` ở phía Google/GitHub.

Không định bật thì sửa `config.js`, để `oauthProviders` rỗng — nút sẽ tự biến mất:

```js
oauthProviders: (env.OAUTH_PROVIDERS || '').split(',').map(s=>s.trim()).filter(Boolean),
```

### 1.6 Giới hạn gửi email
SMTP mặc định của Supabase chỉ khoảng **3–4 email/giờ**, chỉ đủ để tự thử.
Khi mở cho người dùng thật, bắt buộc gắn SMTP riêng (Resend, SendGrid, Amazon SES)
ở **Authentication → SMTP Settings**, nếu không người dùng sẽ không nhận được
email xác nhận và bạn sẽ tưởng là app hỏng.

---

## 2. GitHub (giai đoạn phát triển)

```bash
git init
git add .
git commit -m "CPA English Trainer v7 — multi-user"
git branch -M main
git remote add origin https://github.com/<user>/cpa-english-trainer.git
git push -u origin main
```

**Settings → Pages → Source: GitHub Actions**. Workflow `.github/workflows/pages.yml`
đã có sẵn, push lên `main` là tự deploy.

URL sẽ là `https://<user>.github.io/cpa-english-trainer/` — nhớ thêm vào mục 1.4.

### Test tại máy trước khi push
```bash
python3 -m http.server 8080
# mở http://localhost:8080
```
Không mở bằng `file://`: `fetch()` bị chặn bởi CORS và service worker không đăng ký được.

### Chạy bộ kiểm thử
```bash
npm --prefix qa i

# 147 test hành vi, chạy trên bản đang ship (js/*.js)
node qa/test_v7.js && node qa/test_v8.js && node qa/test_flows.js

# ...và trên bản IIFE cũ. Hai lần chạy PHẢI cho kết quả giống hệt nhau.
MODE=legacy node qa/test_v7.js && MODE=legacy node qa/test_v8.js && MODE=legacy node qa/test_flows.js

# Kiểm tra tĩnh: bắt lỗi import của ES module trước khi chạy
python3 qa/check_modules.py

# Kiểm tra dữ liệu và logic thuần
node qa/test_v6.js && node qa/test_logic.js && python3 qa/test_data.py
```

---

## 3. Vercel (khi gắn domain)

### 3.1 Import
Vercel → Add New Project → Import repo. Cấu hình:

| Trường | Giá trị |
|---|---|
| Framework Preset | **Other** |
| Build Command | *(để trống)* |
| Output Directory | `.` |
| Install Command | *(để trống)* |

`vercel.json` đã kèm security header và chính sách cache
(corpus `data/*.json` cache vĩnh viễn; `app.js`/`config.js` luôn kiểm tra lại).

### 3.2 Env var (tuỳ chọn)
Muốn tách config khỏi repo thì thêm ở Vercel Environment Variables và tạo một file
`env.js` sinh lúc build, nạp **trước** `config.js`:

```html
<script src="env.js"></script>
<script src="config.js"></script>
```

```js
// env.js
window.__ENV = { SUPABASE_URL: '...', SUPABASE_ANON_KEY: '...', OAUTH_PROVIDERS: 'google' };
```

Không bắt buộc: anon key là khoá công khai theo thiết kế, RLS mới là thứ bảo vệ dữ liệu.
**Tuyệt đối không** đưa `service_role` key vào bất kỳ file nào trong repo.

### 3.3 Domain
Vercel → Settings → Domains → thêm domain, trỏ DNS theo hướng dẫn.
Xong thì quay lại **mục 1.4** thêm domain mới vào Redirect URLs của Supabase.

---

## 4. Checklist trước khi mở cho người dùng thật

**Bảo mật**
- [ ] `select tablename, count(*) from pg_policies where schemaname='public' group by 1;` — mọi bảng đều có policy
- [ ] Đăng nhập bằng 2 tài khoản khác nhau, xác nhận mỗi bên chỉ thấy dữ liệu của mình
- [ ] Không có `service_role` key trong repo: `grep -rn "service_role" .`
- [ ] Bật `Confirm email`
- [ ] Bật 2FA cho chính tài khoản Supabase và GitHub của bạn

**Vận hành**
- [ ] Gắn SMTP riêng (mục 1.6)
- [ ] Bật Point-in-Time Recovery hoặc lên lịch backup (gói Pro)
- [ ] Thử luồng quên mật khẩu từ đầu đến cuối trên domain thật
- [ ] Thử trên điện thoại thật: đăng ký → xác nhận email → học → đăng nhập ở máy khác → kiểm tra tiến trình có sang không

**Pháp lý / nội dung**
- [ ] Trang giới thiệu nói rõ 257 đáp án mẫu là **tự soạn**, không phải đáp án chính thức của hội đồng thi
- [ ] Có chính sách quyền riêng tư nếu thu thập email (đang có: email + tiến trình học)
- [ ] Nút xoá tài khoản chạy được (Cài đặt → Vùng nguy hiểm) — cần đã chạy migration V7

---

## 5. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| `redirect_to is not allowed` | URL chưa có trong Redirect URLs (mục 1.4) |
| Đăng nhập xong không thấy dữ liệu | RLS bật mà thiếu policy — chạy lại `schema.sql` |
| Không nhận được email xác nhận | Chạm trần SMTP mặc định — gắn SMTP riêng (mục 1.6) |
| Deploy bản mới mà máy khách vẫn chạy bản cũ | Service worker cũ. V7 đã chuyển vỏ app sang network-first; nếu vẫn kẹt thì đổi `VERSION` trong `sw.js` |
| `learning_events does not exist` trong console | Chưa chạy migration V7. App vẫn chạy được, chỉ mất lớp chống mất số liệu đa thiết bị |
| Đồng bộ lỗi khi mất mạng | Bình thường — event nằm trong hàng đợi và tự đẩy lên khi có mạng lại |

---

## 6. Cập nhật nội dung ôn thi sau khi đã chạy

Từ V8, sửa nội dung không cần deploy lại app.

```bash
export SUPABASE_URL=https://<ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

python3 tools/push_content.py --list           # pack nào đã đổi so với máy chủ
python3 tools/push_content.py --dry-run --all  # xem trước, không ghi
python3 tools/push_content.py core exams       # đẩy vài pack
python3 tools/push_content.py --all            # đẩy tất cả
```

Quy trình: sửa tệp trong `data/` → chạy `--list` để xác nhận đúng pack đã đổi →
`--dry-run` → đẩy thật. Người dùng nhận nội dung mới ở lần mở app kế tiếp.

**Service-role key bỏ qua toàn bộ RLS.** Chỉ dùng tại máy hoặc trong CI có secret;
không đưa vào repo, không đưa xuống trình duyệt, và xoay key nếu lỡ để lộ.
