/* QA V7 — danh tính, nạp trễ corpus, event log.
   Chạy trên CẢ HAI bản để chứng minh việc tách module không đổi hành vi:
     node qa/test_v7.js              (mặc định MODE=legacy — app.js)
     MODE=module node qa/test_v7.js  (js/main.js đã tách module)
   Hai lần chạy phải cho kết quả giống hệt nhau. */
const { boot, sleep, makeReporter } = require('./harness.js');

const R = makeReporter('QA V7');
const ok = R.ok;

(async () => {
  console.log('\n=== QA V7: identity, lazy-load, event log ===\n');
  const t = await boot();
    const { window, fake, fetched, jsErrors: consoleErrors } = t;
  const $ = t.$, $$ = t.$$;

  console.log('[1] Khởi động & tải dữ liệu');
  ok('Không có lỗi JS khi khởi động', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  ok('Dashboard render được (không kẹt ở màn hình loading)',
    !!$('#content') && !$('#content').innerHTML.includes('Đang nạp dữ liệu'));
  ok('KHÔNG tải topic_vocab.json lúc khởi động (1,7 MB phải là lazy)',
    !fetched.includes('data/topic_vocab.json'), `đã tải: ${fetched.filter(f => f.includes('topic_vocab'))}`);
  ok('KHÔNG tải exams.json lúc khởi động',
    !fetched.includes('data/exams.json'));
  ok('CÓ tải core_cpa.json lúc khởi động', fetched.includes('data/core_cpa.json'));
  ok('Không còn tải general_expansion.json (dữ liệu chết)',
    !fetched.includes('data/general_expansion.json'));

  console.log('\n[2] Lazy-load theo view');
  window.location.hash = 'dictionary';
  window.dispatchEvent(new window.Event('hashchange'));
  await new Promise(r => setTimeout(r, 700));
  ok('Vào Từ điển thì mới tải topic_vocab.json', fetched.includes('data/topic_vocab.json'));
  ok('Từ điển render ra nội dung', $('#content').innerHTML.length > 400);

  window.location.hash = 'exams';
  window.dispatchEvent(new window.Event('hashchange'));
  await new Promise(r => setTimeout(r, 700));
  ok('Vào Luyện đề thì mới tải exams.json', fetched.includes('data/exams.json'));

  console.log('\n[3] Giao diện danh tính (chế độ khách)');
  ok('Nút avatar tồn tại', !!$('#userMenuBtn'));
  ok('Avatar ở trạng thái khách', $('#userMenuBtn').classList.contains('guest'));
  ok('Menu hiện "Đăng nhập"', !$('#menuAuth').classList.contains('hidden'));
  ok('Menu ẩn "Đăng xuất"', $('#menuSignOut').classList.contains('hidden'));
  ok('Badge báo đang ngoại tuyến', /ngoại tuyến/i.test($('#syncBadge').textContent));

  console.log('\n[4] Hộp thoại đăng nhập');
  $('#authButton').dispatchEvent(new window.Event('click'));
  await new Promise(r => setTimeout(r, 120));
  ok('Dialog mở', $('#authDialog').open === true);
  ok('Mặc định là tab Đăng nhập', $('#authTitle').textContent.includes('Đăng nhập'));
  ok('Tab Đăng nhập ẩn ô Tên hiển thị', $('#fieldName').classList.contains('hidden'));

  $$tab('signup');
  ok('Tab Tạo tài khoản hiện ô Tên hiển thị', !$('#fieldName').classList.contains('hidden'));
  ok('Tab Tạo tài khoản hiện ô xác nhận điều khoản', !$('#fieldTerms').classList.contains('hidden'));

  $$tab('reset');
  ok('Tab Quên mật khẩu ẩn ô mật khẩu', $('#fieldPassword').classList.contains('hidden'));
  ok('Tab Quên mật khẩu ẩn nút OAuth', $('#oauthRow').classList.contains('hidden'));

  function $$tab(name) {
    const b = [...window.document.querySelectorAll('#authTabs button')].find(x => x.dataset.tab === name);
    b.dispatchEvent(new window.Event('click'));
  }

  console.log('\n[5] Kiểm tra đầu vào');
  $$tab('signup');
  $('#authEmail').value = 'test@example.com';
  $('#authPassword').value = 'short';
  $('#authAgree').checked = true;
  $('#authSubmit').dispatchEvent(new window.Event('click'));
  await new Promise(r => setTimeout(r, 120));
  ok('Chặn mật khẩu ngắn hơn 8 ký tự', /tối thiểu/i.test($('#authMessage').textContent));

  $('#authPassword').value = 'DuMatKhau123!';
  $('#authAgree').checked = false;
  $('#authSubmit').dispatchEvent(new window.Event('click'));
  await new Promise(r => setTimeout(r, 120));
  ok('Chặn khi chưa tích ô xác nhận', /tích ô/i.test($('#authMessage').textContent));

  $('#authAgree').checked = true;
  $('#authSubmit').dispatchEvent(new window.Event('click'));
  await new Promise(r => setTimeout(r, 200));
  const signUpCall = fake.log.auth.find(c => c[0] === 'signUp');
  ok('Gọi signUp khi hợp lệ', !!signUpCall);
  ok('signUp gửi kèm display_name', !!signUpCall?.[1]?.options?.data?.display_name);
  ok('signUp có emailRedirectTo', !!signUpCall?.[1]?.options?.emailRedirectTo);

  console.log('\n[6] Thanh đo độ mạnh mật khẩu');
  $('#authPassword').value = 'abc';
  $('#authPassword').dispatchEvent(new window.Event('input'));
  ok('Mật khẩu yếu → mức thấp', /s0|s1/.test($('#pwMeter').className));
  $('#authPassword').value = 'RatManh#2026xyz';
  $('#authPassword').dispatchEvent(new window.Event('input'));
  ok('Mật khẩu mạnh → mức cao', /s4/.test($('#pwMeter').className), $('#pwMeter').className);

  console.log('\n[7] OAuth');
  const gbtn = window.document.querySelector('#oauthRow .oauth[data-provider="google"]');
  ok('Nút Google được render', !!gbtn);
  if (gbtn) {
    $$tab('signin');
    gbtn.dispatchEvent(new window.Event('click'));
    await new Promise(r => setTimeout(r, 150));
    const c = fake.log.auth.find(x => x[0] === 'signInWithOAuth');
    ok('Bấm Google gọi signInWithOAuth', !!c);
    ok('OAuth truyền redirectTo', !!c?.[1]?.options?.redirectTo);
  }

  console.log('\n[8] Quên mật khẩu');
  $$tab('reset');
  $('#authEmail').value = 'quen@example.com';
  $('#authSubmit').dispatchEvent(new window.Event('click'));
  await new Promise(r => setTimeout(r, 200));
  ok('Gọi resetPasswordForEmail', !!fake.log.auth.find(c => c[0] === 'resetPasswordForEmail'));

  console.log('\n[9] Event log append-only');
  const LS = window.localStorage;
  const key = [...Array(LS.length).keys()].map(i => LS.key(i)).find(k => k.includes('state_v2:guest'));
  ok('State khách được lưu vào localStorage', !!key);
  if (key) {
    const st = JSON.parse(LS.getItem(key));
    ok('State có hàng đợi eventQueue', Array.isArray(st.eventQueue));
    ok('State đã lên version 3', st.version === 3);
  }
  ok('Có client_id ổn định cho thiết bị', !!LS.getItem('cpa_client_id'));

  console.log('\n[10] Đăng nhập → giao diện đổi trạng thái');
  fake.fireAuth('SIGNED_IN', { user: { id: 'u-123', email: 'hocvien@example.com', user_metadata: { display_name: 'Học Viên' } } });
  await new Promise(r => setTimeout(r, 600));
  ok('Avatar bỏ trạng thái khách', !$('#userMenuBtn').classList.contains('guest'));
  ok('Menu hiện email người dùng', $('#menuEmail').textContent.includes('hocvien@example.com'));
  ok('Menu hiện nút Đăng xuất', !$('#menuSignOut').classList.contains('hidden'));
  ok('Menu ẩn nút Đăng nhập', $('#menuAuth').classList.contains('hidden'));
  ok('Badge chuyển sang trạng thái đồng bộ', /Đồng bộ/i.test($('#syncBadge').textContent));
  ok('Gọi RPC rebuild_daily_stats khi sync', !!fake.log.rpc.find(c => c[0] === 'rebuild_daily_stats'));

  console.log('\n[11] Hồ sơ');
  $('#menuProfile').dispatchEvent(new window.Event('click'));
  await new Promise(r => setTimeout(r, 150));
  ok('Dialog hồ sơ mở được', $('#profileDialog').open === true);
  ok('Điền sẵn mục tiêu phút/ngày', Number($('#profileMinutes').value) > 0);
  $('#profileName').value = 'Tên Mới';
  $('#profileName').dispatchEvent(new window.Event('input'));
  ok('Avatar cập nhật theo tên', $('#profileAvatar').textContent.length >= 1);

  console.log('\n[12] Đăng xuất');
  $('#profileDialog').close();
  $('#menuSignOut').dispatchEvent(new window.Event('click'));
  await new Promise(r => setTimeout(r, 500));
  ok('Gọi signOut', !!fake.log.auth.find(c => c[0] === 'signOut'));
  ok('Quay lại trạng thái khách', $('#userMenuBtn').classList.contains('guest'));

  console.log('\n[13] Không rò dữ liệu giữa các hồ sơ');
  const keys = [...Array(LS.length).keys()].map(i => LS.key(i));
  ok('Hồ sơ khách và hồ sơ user lưu tách khoá riêng',
    keys.some(k => k.includes(':guest')) && keys.some(k => k.includes('user_u-123')),
    keys.join(','));
  ok('Không còn cờ tự chiếm dữ liệu legacy_claimed', !keys.some(k => k.includes('legacy_claimed')));

  console.log('\n[14] Duyệt hết các tab');
  const views = ['dashboard', 'history', 'study', 'families', 'collocations', 'chunks', 'dictionary', 'quiz', 'drills', 'exams', 'weak', 'settings'];
  let broken = [];
  for (const v of views) {
    window.location.hash = v;
    window.dispatchEvent(new window.Event('hashchange'));
    await new Promise(r => setTimeout(r, 260));
    const html = $('#content').innerHTML;
    if (html.length < 120 || /Không khởi động được|Không tải được/.test(html)) broken.push(v);
  }
  ok('Tất cả 12 tab render được', broken.length === 0, `hỏng: ${broken.join(', ')}`);
  ok('Không phát sinh lỗi JS sau khi duyệt hết', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  R.done();
})().catch(e => { console.error('LỖI HARNESS:', e); process.exit(1); });
