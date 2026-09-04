/* Khởi tạo giao diện trước khi CSS được vẽ và nối nút đổi sáng/tối.
   Tách khỏi HTML để tuân thủ Content Security Policy trên Vercel. */
(function () {
  const LIGHT_COLOR = '#faf6f0';
  const DARK_COLOR = '#15120e';

  function applyTheme(theme, persist) {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.style.colorScheme = next;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'dark' ? DARK_COLOR : LIGHT_COLOR);
    if (persist) {
      try { localStorage.setItem('cpa-theme', next); } catch (_) {}
    }
  }

  let initial = 'light';
  try { initial = localStorage.getItem('cpa-theme') || 'light'; } catch (_) {}
  applyTheme(initial, false);

  document.addEventListener('DOMContentLoaded', function () {
    const button = document.getElementById('themeToggle');
    if (!button) return;
    button.addEventListener('click', function () {
      const current = document.documentElement.getAttribute('data-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark', true);
    });
  });
})();
