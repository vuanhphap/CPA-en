/* Chủ đề sáng/tối.

   Tệp riêng chứ KHÔNG phải <script> nội tuyến: CSP trong vercel.json là
   `script-src 'self' https://cdn.jsdelivr.net`, không có 'unsafe-inline'. Mọi
   script nội tuyến đều bị chặn trên bản deploy thật — hệ quả là chủ đề không đọc
   được từ localStorage và nút chuyển sáng/tối hoàn toàn không hoạt động.

   Nạp đồng bộ trong <head>, TRƯỚC stylesheet, để đặt data-theme xong rồi CSS mới
   vẽ. Nếu để tới lúc module ESM chạy thì người dùng nền tối thấy một nháy trắng
   chói mắt ở mỗi lần tải trang. */
(function () {
  var KEY = 'cpa-theme';
  var LIGHT = '#faf6f0', DARK = '#15120e';

  function stored() {
    try { var v = localStorage.getItem(KEY); return (v === 'light' || v === 'dark') ? v : null; }
    catch (e) { return null; }
  }
  function systemPref() {
    try { return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
    catch (e) { return 'light'; }
  }
  // Chưa chọn gì thì theo hệ điều hành. Bản trước mặc định cứng 'light', nên người
  // để máy ở chế độ tối vẫn bị chói mỗi lần mở app.
  function resolve() { return stored() || systemPref(); }

  function apply(theme) {
    var el = document.documentElement;
    el.setAttribute('data-theme', theme);
    el.style.colorScheme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? DARK : LIGHT);
    var btn = document.getElementById('themeToggle');
    if (btn) {
      var label = theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối';
      btn.textContent = theme === 'dark' ? '☀' : '☾';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    }
  }

  apply(resolve());   // chạy ngay, trước khi CSS vẽ

  function wire() {
    apply(resolve());   // gắn lại nhãn/biểu tượng khi nút đã có trong DOM
    var btn = document.getElementById('themeToggle');
    if (btn && !btn.dataset.wired) {
      btn.dataset.wired = '1';
      btn.addEventListener('click', function () {
        var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(KEY, next); } catch (e) {}
        apply(next);
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  // Người dùng chưa chọn thủ công thì đổi theo khi hệ điều hành đổi chế độ.
  try {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (!stored()) apply(systemPref());
    });
  } catch (e) {}
})();
