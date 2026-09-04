# Soát bản thiết kế — 11 lỗi, đã sửa hết

Bản thiết kế chỉ đụng `styles.css` và `index.html`; thư mục `js/` giữ nguyên
byte-for-byte. 147 test hành vi vẫn xanh ngay từ đầu, nên **không có lỗi chức năng**.
Toàn bộ lỗi nằm ở lớp triển khai — và hai lỗi nặng nhất chỉ lộ ra trên bản deploy thật.

## Vì sao chạy tại máy vẫn thấy bình thường

Header `Content-Security-Policy` chỉ tồn tại khi deploy qua Vercel (`vercel.json`).
Chạy `python3 -m http.server` tại máy thì không có header đó, nên mọi thứ trông ổn.
Lỗi 1 và 2 sẽ nổ đúng lúc người dùng thật vào trang.

## Lỗi chặn deploy

**1. Google Fonts bị CSP chặn.** `index.html` nạp Plus Jakarta Sans và Newsreader từ
`fonts.googleapis.com`, nhưng CSP là `style-src 'self'` và `font-src 'self'`. Trên
Vercel, cả stylesheet lẫn tệp font đều bị chặn — toàn bộ thiết kế rơi về font hệ
thống. Service worker cũng bỏ qua request khác origin nên ngoại tuyến mất font, mâu
thuẫn với chính kiến trúc offline-first của app.

*Sửa:* tự host cả hai bộ chữ trong `fonts/` (224 KB, có subset tiếng Việt riêng cho cả
hai), service worker precache. Giữ nguyên hai bộ chữ mà thiết kế đã chọn — chỉ đổi
cách nạp.

**2. Nút chuyển sáng/tối hoàn toàn không hoạt động.** CSP là
`script-src 'self' https://cdn.jsdelivr.net`, không có `'unsafe-inline'`. Cả hai khối
`<script>` nội tuyến trong `index.html` đều bị chặn: chủ đề không đọc được từ
localStorage, và nút chuyển không gắn được sự kiện. Nền tối trở thành bất khả dụng.

*Sửa:* chuyển logic sang `theme.js`, tệp riêng cùng origin, nạp đồng bộ trong `<head>`
trước stylesheet để vẫn đặt được `data-theme` trước khi CSS vẽ.

## Lỗi tiếp cận và trải nghiệm

**3. Viền ô nhập và viền nút đáp án chỉ 1.36–1.62:1.** WCAG 1.4.11 yêu cầu ≥3:1 cho
ranh giới thành phần. Ô nhập và nút đáp án quiz gần như tàng hình trên nền sáng. Với
app ngồi học 30–60 phút mỗi ngày thì đây không phải chuyện nhỏ.
*Sửa:* `--line2` từ `#d9cbb6` → `#8f7c60` (sáng) và `#463d31` → `#7d7060` (tối). Giữ
nguyên tông ấm, chỉ tăng độ đậm. Giờ đạt 3.43–4.02:1.

**4. Bỏ qua cài đặt hệ điều hành.** Script cũ mặc định cứng `'light'`. Người để máy ở
chế độ tối vẫn bị chói mỗi lần mở app.
*Sửa:* chưa chọn thủ công thì theo `prefers-color-scheme`, và đổi theo khi hệ điều
hành đổi.

**5. Nút chủ đề không có phản hồi trạng thái.** Nhãn cố định `"Đổi nền sáng/tối"`, không
có `aria-pressed`. Người dùng trình đọc màn hình không biết đang ở chế độ nào.
*Sửa:* cập nhật biểu tượng, `aria-label` và `aria-pressed` theo trạng thái thật.

## Lỗi đồng bộ thương hiệu

**6. `manifest.webmanifest` còn màu navy cũ** `#0b1220`. Cài làm PWA thì màn hình chờ
xanh navy trong khi app màu kem — lệch hẳn.
*Sửa:* đổi `theme_color` và `background_color` sang `#faf6f0`.

**7. `icon.svg` còn gradient xanh dương/tím trên nền navy**, không liên quan gì tới bảng
màu kem/đất nung mới.
*Sửa:* vẽ lại theo bảng màu hiện tại.

**8. `404.html` dùng script nội tuyến để chuyển hướng** → CSP chặn nốt, trang 404 đứng im.
*Sửa:* dùng `<meta http-equiv="refresh">`, kèm liên kết thủ công phòng khi cả meta
refresh bị chặn.

## Lỗi trong bộ kiểm thử (sót từ đợt tách module trước, không phải lỗi thiết kế)

**9. `qa/test_data.py` vẫn trỏ vào `app.js`** đã bị xoá khi tách module → crash.
*Sửa:* trỏ sang `qa/app.legacy.js`.

**10. `qa/test_logic.js` cắm cứng ngày `'2026-09-03'`.** Hôm sau `dailyLocal()` không
khớp khoá, trả về bản ghi rỗng, và test tự hỏng dù app không đổi gì. Một test chỉ đúng
đúng ngày viết ra nó thì tệ hơn không có test.
*Sửa:* lấy ngày động.

**11. Bản sửa đầu của chính mục 10 vẫn sai.** Dùng `toISOString().slice(0,10)` là ngày
**UTC**, còn `dailyLocal()` dùng ngày theo **giờ Việt Nam**. Hai cái lệch nhau trong
khoảng 17–24h UTC, nên test sẽ hỏng đúng buổi tối.
*Sửa:* dùng chính `T.dateKey()` của app.

## Chống tái phát

`qa/test_design.js` — 51 test, phần lớn là kiểm tra **tĩnh trên tệp nguồn** chứ không
phải kiểm tra DOM, vì hai lỗi nặng nhất không lộ ra trong jsdom hay khi chạy tại máy:

| Nhóm | Nội dung |
|---|---:|
| CSP | không còn `<script>` nội tuyến trong bất kỳ tệp HTML nào; 404 chuyển hướng không cần JS |
| Font | không còn Google Fonts; mọi tệp `@font-face` tồn tại thật; có subset tiếng Việt; SW precache |
| Chủ đề | `theme.js` nạp trong `<head>` trước stylesheet, không defer; tôn trọng hệ điều hành; có `aria-pressed` |
| Tương phản | tính tỉ số WCAG trực tiếp từ token CSS, cả sáng lẫn tối, cả chữ lẫn ranh giới thành phần |
| Thương hiệu | manifest, meta, icon phải cùng màu với token `--bg`/`--accent` |
| Chức năng | app vẫn render đủ 13 màn hình, không lỗi JS |
| Điểm neo | không `id` nào bị thiết kế xoá mất |

## Kết quả

```
Bản module (đang ship):  51 + 38 + 58 + 51 = 198 đạt / 0 lỗi
Bản IIFE  (đối chiếu):   51 + 38 + 58      = 147 đạt / 0 lỗi
test_v6, test_logic, test_data, check_modules: đạt
```

## Còn phải tự làm trước khi mở cho người thật

Những việc này môi trường ở đây không làm được, và chúng là rủi ro lớn nhất còn lại:

1. **Xem bằng mắt trên trình duyệt thật.** jsdom không render CSS — nó không biết chữ
   có tràn không, nền tối có chỗ nào chìm không, bố cục trên điện thoại có vỡ không.
2. **Kiểm tra CSP thật sau khi deploy.** Mở DevTools → Console trên bản Vercel, tìm dòng
   `Refused to load`. Đây là cách duy nhất chắc chắn lỗi 1 và 2 đã hết.
3. **Đăng ký hai tài khoản khác nhau** và xác nhận không bên nào thấy dữ liệu bên kia —
   phép thử duy nhất chứng minh RLS chạy đúng.
4. **Gắn SMTP riêng.** SMTP mặc định của Supabase chỉ ~3–4 email/giờ.

---

# Đợt 2 — chuẩn bị cho Cloudflare và chống lạm dụng

Câu hỏi "có triển khai trên Cloudflare được không, tao lo bị DDoS" làm lộ thêm 4 vấn đề.

**12. Cloudflare Pages không đọc `vercel.json`.** Deploy lên Cloudflare hôm nay là chạy
hoàn toàn **không có CSP, không có HSTS, không có chính sách cache** — và không có cảnh
báo nào. Toàn bộ phần bảo mật vừa sửa ở đợt 1 lặng lẽ biến mất.
*Sửa:* thêm `_headers` và `_redirects`. `qa/test_design.js` đối chiếu CSP giữa hai tệp,
sửa một bên mà quên bên kia thì test đỏ.

**13. SDK Supabase nạp từ jsdelivr, không có `integrity`.** CSP cho phép
`script-src https://cdn.jsdelivr.net`. CDN bị chiếm hoặc gói bị đầu độc thì mã lạ chạy
với toàn quyền trên phiên đăng nhập của mọi người dùng. Thêm nữa, nhiều mạng doanh
nghiệp chặn CDN công cộng — người dùng ở đó mở app thấy trang trắng.
*Sửa:* tự host `vendor/supabase-js-2.112.4.js` (208 KB, 54 KB sau gzip), tên tệp gắn số
phiên bản. CSP siết còn `script-src 'self'` — không còn nguồn script bên ngoài nào.

**14. `rebuild_daily_stats()` không có giới hạn.** Nó quét toàn bộ `learning_events`
của người dùng trong 120 ngày rồi gộp nhóm, và client gọi nó ở mỗi lần đồng bộ. Một tài
khoản hợp lệ gọi lặp trong vòng lặp là đủ làm nghẽn CPU của database. RLS không giúp gì
ở đây — kẻ tấn công đang truy cập đúng dữ liệu của chính họ.
*Sửa:* `consume_heavy_rpc()` — hai lần gọi phải cách nhau ≥20 giây, tối đa 120 lần/ngày.
`days_back` bị kẹp trong 1–400. Trả về `-1` khi bị từ chối; client hiểu đó là "bỏ qua
lần này", không phải lỗi.

**15. `content_items` mở cho khách vô danh đọc.** Đây là quyết định của chính tôi ở V8,
với lý do "nội dung ôn thi là công khai". Đúng về nội dung nhưng sai về chịu tải: khoá
anon nằm công khai trong mã nguồn theo thiết kế, nên bất kỳ ai cũng kéo được gói từ
vựng 1,7 MB lặp vô hạn. Đó là bộ khuếch đại băng thông tính tiền trên hoá đơn Supabase.
*Sửa:* chỉ tài khoản đã đăng nhập mới đọc được `content_items` và gọi được
`content_manifest()`. Người chưa đăng nhập vẫn học bình thường bằng JSON tĩnh do CDN
phục vụ — miễn phí và không giới hạn.

**16. Test tự nó sai.** Test kiểm tra `content_items` bằng cách quét cả `schema.sql`,
nhưng tệp này là migration nối tiếp: chính sách V8 cũ vẫn nằm đó dù V10 đã `drop` và
tạo lại. Test khớp phải câu lệnh **đã bị thay thế** và báo đỏ oan.
*Sửa:* chỉ xét định nghĩa **cuối cùng** của mỗi policy — đó mới là cái có hiệu lực.

## Kết quả sau đợt 2

```
Bản module (đang ship):  51 + 38 + 58 + 78 = 225 đạt / 0 lỗi
Bản IIFE  (đối chiếu):   51 + 38 + 58      = 147 đạt / 0 lỗi
test_v6, test_logic, test_data, check_modules: đạt
```

Chi tiết về mô hình mối đe doạ và ba lớp phòng thủ: xem `CLOUDFLARE.md`.
