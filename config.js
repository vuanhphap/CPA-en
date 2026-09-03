/* Cấu hình runtime.
   - GitHub Pages / mở file tĩnh: dùng giá trị mặc định bên dưới.
   - Vercel: build step ghi đè bằng window.__ENV (xem DEPLOYMENT.md, mục "Vercel").
   Khóa publishable/anon của Supabase là khóa CÔNG KHAI, an toàn để nằm trong repo:
   mọi quyền truy cập dữ liệu do RLS quyết định. TUYỆT ĐỐI không đặt service_role key ở đây. */
(() => {
  const env = window.__ENV || {};
  const DEFAULTS = {
    supabaseUrl: 'https://apefwcrsizqxpxhmsxmy.supabase.co',
    supabasePublishableKey: 'sb_publishable_RtragNIWIxRCErSzUTpROw_wZ0rOSuI'
  };
  window.CPA_CONFIG = {
    supabaseUrl: env.SUPABASE_URL || DEFAULTS.supabaseUrl,
    supabasePublishableKey: env.SUPABASE_ANON_KEY || DEFAULTS.supabasePublishableKey,
    appName: 'CPA English Trainer',
    appVersion: 'v8-production',
    dataVersion: '2026-09-03-v8-production',
    // Bật/tắt nút đăng nhập mạng xã hội. Chỉ bật khi đã cấu hình provider trong Supabase.
    oauthProviders: (env.OAUTH_PROVIDERS || '').split(',').map(s => s.trim()).filter(Boolean),
    // URL mà Supabase redirect về sau khi xác nhận email / reset mật khẩu.
    authRedirectUrl: `${location.origin}${location.pathname}`,
    minPasswordLength: 8,
    sourceNote: 'Nguồn học: bộ đề CPA tiếng Anh 2010–2020, 2022–2024 đã OCR và workbook V2. Mục mở rộng (NGSL) được gắn nhãn riêng, tách khỏi bằng chứng đề thi trực tiếp. 257 đáp án/bản dịch mẫu ở mục Luyện câu đề thi là tự soạn — nguồn OCR không kèm đáp án chính thức.'
  };
})();
