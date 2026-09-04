/* QA thiết kế & triển khai — chống tái phát 9 lỗi tìm được khi soát bản thiết kế.
 *
 * Phần lớn test ở đây là kiểm tra TĨNH trên tệp nguồn, không phải kiểm tra DOM. Lý do:
 * những lỗi nặng nhất (CSP chặn script nội tuyến, CSP chặn Google Fonts) KHÔNG lộ ra
 * khi chạy tại máy hay trong jsdom — chúng chỉ lộ trên bản deploy thật, đúng lúc
 * người dùng thật đang dùng. Nên phải bắt chúng ở mức tệp.
 *
 * Chạy: node qa/test_design.js
 */
const fs = require('fs');
const path = require('path');
const { boot, sleep, makeReporter, ROOT } = require('./harness.js');

const R = makeReporter('QA thiết kế & triển khai');
const ok = R.ok;
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
// Phải bỏ chú thích trước khi soát, nếu không chính câu chú thích giải thích lỗi
// lại bị tính là lỗi — dương tính giả, và nó dạy người đọc bỏ qua test.
const stripHtmlComments = s => s.replace(/<!--[\s\S]*?-->/g, '');
const stripCssComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

function contrast(a, b) {
  const lum = h => {
    h = h.replace('#', '');
    const [r, g, b2] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
    const f = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b2);
  };
  const [L1, L2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (L1 + 0.05) / (L2 + 0.05);
}
function token(css, block, name) {
  const start = css.indexOf(block);
  const seg = css.slice(start, start + 900);
  const m = seg.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})'));
  return m && m[1];
}

(async () => {
  const html = read('index.html');
  const css = read('styles.css');
  const csp = (read('vercel.json').match(/"default-src[^"]*"/) || [''])[0];

  console.log('\n[1] CSP không được chặn thứ gì app cần');
  {
    // Đây là lỗi nguy hiểm nhất trong cả đợt soát: chạy tại máy thì mọi thứ bình
    // thường, deploy lên Vercel mới hỏng, vì header CSP chỉ tồn tại ở đó.
    ok('CSP không cho script nội tuyến (giữ nguyên, đúng về bảo mật)',
      !/script-src[^;]*unsafe-inline/.test(csp));
    for (const f of ['index.html', '404.html']) {
      const src = stripHtmlComments(read(f));
      const inlineScripts = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)];
      ok(`${f} không còn <script> nội tuyến`, inlineScripts.length === 0,
        `còn ${inlineScripts.length}`);
    }
    ok('404.html chuyển hướng không cần JavaScript',
      /http-equiv="refresh"/i.test(read('404.html')));
    ok('404.html vẫn có liên kết thủ công khi meta refresh bị chặn',
      /<a href="\.\/"/.test(read('404.html')));
  }

  console.log('\n[2] Font phải chạy được sau CSP và khi ngoại tuyến');
  {
    ok('CSP chỉ cho font cùng origin (giữ nguyên)', /font-src 'self'/.test(csp));
    ok('index.html không nạp Google Fonts', !/googleapis|gstatic/.test(stripHtmlComments(html)));
    ok('styles.css không nạp Google Fonts', !/googleapis|gstatic/.test(stripCssComments(css)));

    const refs = [...css.matchAll(/url\('(fonts\/[^']+)'\)/g)].map(m => m[1]);
    ok('Có @font-face tự host', refs.length >= 10, `${refs.length} tệp`);
    const missing = refs.filter(f => !fs.existsSync(path.join(ROOT, f)));
    ok('Mọi tệp font đều có thật trong repo', missing.length === 0, missing.join(', '));

    // Không có subset tiếng Việt thì dấu tiếng Việt rơi về font hệ thống và chữ nhảy.
    ok('Plus Jakarta Sans có subset tiếng Việt', refs.some(f => /pjs-viet/.test(f)));
    ok('Newsreader có subset tiếng Việt', refs.some(f => /news-viet/.test(f)));
    ok('unicode-range tiếng Việt được khai báo', /U\+1EA0-1EF9/.test(css));
    ok('Dùng font-display:swap để không chặn hiển thị',
      (css.match(/font-display:swap/g) || []).length === refs.length);

    const sw = read('sw.js');
    ok('Service worker precache font', /FONTS/.test(sw) && /fonts\//.test(sw));
    ok('Service worker precache theme.js', /'theme\.js'/.test(sw));
    ok('Service worker vẫn bỏ qua request khác origin',
      /url\.origin!==location\.origin/.test(sw));
  }

  console.log('\n[3] Chủ đề sáng/tối');
  {
    ok('theme.js là tệp riêng cùng origin', fs.existsSync(path.join(ROOT, 'theme.js')));
    ok('theme.js nạp trong <head>',
      html.indexOf('theme.js') < html.indexOf('</head>'));
    ok('theme.js nạp TRƯỚC stylesheet để không nháy nền sai màu',
      html.indexOf('theme.js') < html.indexOf('styles.css'));
    ok('theme.js không defer/async (phải chặn trước khi vẽ)',
      !/<script[^>]*theme\.js[^>]*(defer|async)/.test(html));

    const tjs = read('theme.js');
    ok('Tôn trọng cài đặt hệ điều hành khi người dùng chưa chọn',
      /prefers-color-scheme/.test(tjs));
    ok('Cập nhật aria-label theo trạng thái', /aria-label/.test(tjs));
    ok('Có aria-pressed cho nút bật/tắt', /aria-pressed/.test(tjs));
    ok('Đổi cả màu thanh trình duyệt', /theme-color/.test(tjs));
    ok('CSS có nhánh nền tối', /\[data-theme="dark"\]/.test(css));
  }

  console.log('\n[4] Tương phản đạt WCAG');
  {
    const L = s => token(css, ':root{', s), D = s => token(css, '[data-theme="dark"]', s);
    const checks = [
      ['sáng: chữ chính', L('text'), L('bg'), 4.5],
      ['sáng: chữ phụ', L('muted'), L('bg'), 4.5],
      ['sáng: nhấn', L('accent'), L('bg'), 4.5],
      // WCAG 1.4.11: ranh giới thành phần (viền ô nhập, viền nút đáp án) cần ≥3:1.
      // Bản thiết kế để 1.36:1 — ô nhập gần như tàng hình.
      ['sáng: viền ô nhập trên nền chìm', L('line2'), L('panel2'), 3.0],
      ['sáng: viền ô nhập trên nền nổi', L('line2'), L('panel'), 3.0],
      ['tối: chữ chính', D('text'), D('bg'), 4.5],
      ['tối: chữ phụ', D('muted'), D('bg'), 4.5],
      ['tối: nhấn', D('accent'), D('bg'), 4.5],
      ['tối: viền ô nhập trên nền chìm', D('line2'), D('panel2'), 3.0],
      ['tối: viền ô nhập trên nền nổi', D('line2'), D('panel'), 3.0],
    ];
    for (const [label, fg, bg, need] of checks) {
      const v = fg && bg ? contrast(fg, bg) : 0;
      ok(`${label} ≥ ${need}:1`, v >= need, `được ${v.toFixed(2)}:1 (${fg}/${bg})`);
    }
  }

  console.log('\n[5] Màu thương hiệu đồng bộ giữa các tệp');
  {
    const man = JSON.parse(read('manifest.webmanifest'));
    const bg = token(css, ':root{', 'bg');
    ok('manifest theme_color khớp nền app', man.theme_color.toLowerCase() === bg.toLowerCase(),
      `${man.theme_color} vs ${bg}`);
    ok('manifest background_color khớp nền app',
      man.background_color.toLowerCase() === bg.toLowerCase());
    ok('meta theme-color trong HTML khớp',
      new RegExp(`content="${bg}"`, 'i').test(html));
    const icon = read('icon.svg');
    ok('icon.svg không còn bảng màu navy cũ', !/0b1220|63a4ff|b99cff/i.test(icon));
    ok('icon.svg dùng màu nhấn hiện tại',
      icon.toLowerCase().includes(token(css, ':root{', 'accent').toLowerCase()));
  }

  console.log('\n[6] App vẫn chạy đúng sau khi sửa');
  {
    const t = await boot();
    ok('Không lỗi JS khi khởi động', t.jsErrors.length === 0, t.jsErrors.slice(0, 2).join(' | '));
    ok('Tổng quan render', !t.$('#content').innerHTML.includes('Đang nạp'));
    ok('Nút chủ đề vẫn tồn tại', !!t.$('#themeToggle'));

    await t.goto('study');
    ok('Màn hình học render', !!t.$('.study-term'));
    ok('Đủ bốn mức SM-2', t.$$('.srs-actions button').length === 4);

    await t.goto('quiz');
    t.$$('.quiz-start')[0].dispatchEvent(new t.window.Event('click'));
    await sleep(400);
    ok('Quiz render câu hỏi', !!t.$('.quiz-question'));
    ok('Quiz có phương án', t.$$('.option').length >= 2);

    const views = ['dashboard', 'history', 'weak', 'families', 'collocations',
      'chunks', 'dictionary', 'drills', 'exams', 'settings'];
    let broken = [];
    for (const v of views) {
      await t.goto(v);
      if (t.$('#content').innerHTML.length < 120) broken.push(v);
    }
    ok('Toàn bộ màn hình còn lại render', broken.length === 0, broken.join(', '));
    ok('Duyệt hết không sinh lỗi JS', t.jsErrors.length === 0, t.jsErrors.slice(0, 2).join(' | '));
  }

  console.log('\n[7] Điểm neo giữa HTML và JS còn nguyên');
  {
    const js = fs.readdirSync(path.join(ROOT, 'js'))
      .map(f => read(path.join('js', f))).join('\n');
    const wanted = [...new Set([...js.matchAll(/\$\('#([A-Za-z][\w-]*)'\)/g)].map(m => m[1]))];
    const inHtml = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
    const madeByJs = new Set([...js.matchAll(/id="([\w-]+)"/g)].map(m => m[1]));
    const orphan = wanted.filter(i => !inHtml.has(i) && !madeByJs.has(i) && i !== 'offlineBanner');
    ok('Không id nào bị thiết kế xoá mất', orphan.length === 0, orphan.join(', '));
  }

  console.log('\n[8] Sẵn sàng cho Cloudflare Pages');
  {
    // Cloudflare Pages KHÔNG đọc vercel.json. Thiếu _headers thì bản deploy trên
    // Cloudflare chạy hoàn toàn không CSP — mọi biện pháp bảo mật lặng lẽ biến mất.
    ok('Có _headers cho Cloudflare Pages', fs.existsSync(path.join(ROOT, '_headers')));
    ok('Có _redirects cho Cloudflare Pages', fs.existsSync(path.join(ROOT, '_redirects')));

    const headers = read('_headers');
    const vercelCsp = (read('vercel.json').match(/"(default-src[^"]*)"/) || [])[1];
    const cfCsp = (headers.match(/Content-Security-Policy: (.+)/) || [])[1];
    ok('CSP của Cloudflare khớp CSP của Vercel',
      vercelCsp && cfCsp && vercelCsp.trim() === cfCsp.trim(),
      'hai nền tảng đang khác nhau');

    for (const h of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy',
                     'Strict-Transport-Security', 'Permissions-Policy']) {
      ok(`_headers có ${h}`, headers.includes(h));
    }
    ok('Corpus được cache vĩnh viễn', /\/data\/\*[\s\S]{0,120}immutable/.test(headers));
    ok('Font được cache vĩnh viễn', /\/fonts\/\*[\s\S]{0,120}immutable/.test(headers));
    ok('Mã ứng dụng luôn kiểm tra lại', /\/js\/\*[\s\S]{0,120}must-revalidate/.test(headers));
    ok('sw.js không bị cache', /\/sw\.js[\s\S]{0,160}must-revalidate/.test(headers));
  }

  console.log('\n[9] Không còn phụ thuộc script bên ngoài');
  {
    const csp = (read('vercel.json').match(/"(default-src[^"]*)"/) || [])[1];
    ok('CSP script-src chỉ còn self', /script-src 'self'(;|$)/.test(csp), csp);
    ok('index.html không nạp script từ CDN ngoài',
      !/<script[^>]+src="https?:\/\//.test(stripHtmlComments(html)));
    const vendored = fs.existsSync(path.join(ROOT, 'vendor'))
      && fs.readdirSync(path.join(ROOT, 'vendor')).filter(f => f.endsWith('.js'));
    ok('SDK Supabase được tự host', vendored && vendored.length === 1, JSON.stringify(vendored));
    ok('Tên tệp SDK có gắn số phiên bản', vendored && /\d+\.\d+\.\d+\.js$/.test(vendored[0]),
      vendored && vendored[0]);
    ok('index.html trỏ đúng tệp SDK đã tự host',
      vendored && html.includes(`vendor/${vendored[0]}`));
    ok('Service worker precache SDK', /vendor\//.test(read('sw.js')));
  }

  console.log('\n[10] Chống lạm dụng phía máy chủ');
  {
    const sql = read('supabase/schema.sql');
    ok('Có hạn mức cho RPC nặng', /consume_heavy_rpc/.test(sql));
    ok('rebuild_daily_stats gọi qua hạn mức',
      /rebuild_daily_stats[\s\S]{0,900}consume_heavy_rpc/.test(sql));
    ok('days_back bị kẹp, client không tự ý quét 10 năm',
      /days_back := least\(greatest/.test(sql));
    ok('Ghi event vẫn qua RPC có hạn mức', /log_learning_events/.test(sql));

    // Khoá anon nằm công khai trong mã nguồn; mở corpus cho anon là bộ khuếch đại
    // băng thông tính tiền trên hoá đơn Supabase.
    // schema.sql là migration nối tiếp: khối V8 cũ vẫn nằm trong tệp dù V10 đã drop
    // và tạo lại chính sách đó. Quét cả tệp sẽ khớp câu lệnh ĐÃ BỊ THAY THẾ và báo
    // sai. Chỉ xét định nghĩa CUỐI CÙNG — đó mới là cái có hiệu lực sau khi chạy.
    const lastPolicy = (body) => {
      const all = [...sql.matchAll(new RegExp('create policy ' + body + '[\\\\s\\\\S]*?;', 'g'))];
      return all.length ? all[all.length - 1][0] : '';
    };
    ok('content_items KHÔNG cho khách vô danh đọc',
      !/to anon/.test(lastPolicy('content_items_read')),
      lastPolicy('content_items_read').slice(0, 120));
    ok('content_packs KHÔNG cho khách vô danh đọc',
      !/to anon/.test(lastPolicy('content_packs_read')));
    ok('content_manifest đã thu hồi quyền của anon',
      /revoke execute on function public\.content_manifest\(\) from anon/.test(sql));
    ok('Có view chỉ số hạn mức cho admin', /v_quota_usage/.test(sql));

    ok('Client hiểu mã -1 là bị hạn mức, không phải lỗi',
      /Number\(pulled\)>=0/.test(read('js/sync.js')));
  }

  R.done();
})().catch(e => { console.error('LỖI HARNESS:', e); process.exit(1); });
