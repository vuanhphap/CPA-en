# vendor/

## `supabase-js-2.112.4.js`

Bản UMD của `@supabase/supabase-js@2.112.4`, lấy nguyên vẹn từ npm, không sửa gì.

Trước đây tệp này được nạp từ `cdn.jsdelivr.net`. Đổi sang tự host vì ba lý do, xếp
theo mức nghiêm trọng:

1. **Chuỗi cung ứng.** CSP cho phép `script-src https://cdn.jsdelivr.net` mà không có
   `integrity`. Nếu CDN bị chiếm hoặc gói bị đầu độc, mã lạ chạy với toàn quyền trên
   phiên đăng nhập của mọi người dùng — bao gồm token Supabase.
2. **Mạng bị chặn.** Nhiều mạng doanh nghiệp và một số ISP chặn CDN công cộng. Người
   dùng ở đó mở app sẽ thấy trang trắng, không phải "mất đồng bộ" mà là hỏng hẳn.
3. **Nhất quán với offline-first.** Font đã tự host; để riêng SDK phụ thuộc mạng ngoài
   là mâu thuẫn với chính kiến trúc của app.

Đổi lại: phải tự cập nhật khi có bản vá bảo mật. Quy trình:

```bash
npm view @supabase/supabase-js versions --json | tail -5   # xem bản mới
npm i @supabase/supabase-js@<phiên bản>
cp node_modules/@supabase/supabase-js/dist/umd/supabase.js \
   vendor/supabase-js-<phiên bản>.js
# sửa đường dẫn trong index.html và danh sách SHELL trong sw.js
# xoá tệp phiên bản cũ, chạy lại toàn bộ test
```

Đặt tên kèm số phiên bản để không bao giờ phải đoán đang chạy bản nào.
