/* QA V8 — hạn mức ghi, realtime, corpus có phiên bản.
   Chạy trên CẢ HAI bản để chứng minh việc tách module không đổi hành vi:
     node qa/test_v8.js              (mặc định MODE=legacy — app.js)
     MODE=module node qa/test_v8.js  (js/main.js đã tách module)
   Hai lần chạy phải cho kết quả giống hệt nhau. */
const { boot, sleep, makeReporter } = require('./harness.js');

const R = makeReporter('QA V8');
const ok = R.ok;

(async () => {
  console.log('\n=== QA V8: hạn mức, realtime, corpus có phiên bản ===\n');

  console.log('[1] Hạn mức ghi');
  {
    const t = await boot();
    const { window, fake, $$ } = t;
    fake.fireAuth('SIGNED_IN', { user: { id: 'q1', email: 'a@b.c' } });
    await sleep(500);
    await t.goto('study');
    $$('.srs-actions button')[2]?.dispatchEvent(new window.Event('click'));
    await sleep(500);
    const call = fake.log.rpc.find(c => c[0] === 'log_learning_events');
    ok('Event đi qua RPC log_learning_events', !!call);
    ok('Không insert thẳng vào learning_events (đã đóng policy insert)',
      !fake.log.insert['learning_events'] && !fake.log.upsert['learning_events']);
    ok('Payload không kèm user_id (máy chủ tự lấy auth.uid)', call?.[1]?.events?.[0]?.user_id === undefined);
    ok('Hàng đợi rỗng sau khi RPC nhận', (t.stateOf('q1').eventQueue || []).length === 0);
  }

  console.log('\n[2] Chạm trần hạn mức thì dừng thử lại, không mất dữ liệu');
  {
    const t = await boot({ quotaFull: true });
    const { window, fake, $$ } = t;
    fake.fireAuth('SIGNED_IN', { user: { id: 'q2', email: 'a@b.c' } });
    await sleep(500);
    await t.goto('study');
    $$('.srs-actions button')[2]?.dispatchEvent(new window.Event('click'));
    await sleep(500);
    ok('Event vẫn nằm trong hàng đợi khi bị từ chối', (t.stateOf('q2').eventQueue || []).length === 1);
    ok('Tiến trình học vẫn được lưu bình thường', Object.keys(t.stateOf('q2').progress).length === 1);
    const before = fake.log.rpc.filter(c => c[0] === 'log_learning_events').length;
    $$('.srs-actions button')[2]?.dispatchEvent(new window.Event('click'));
    await sleep(500);
    const after = fake.log.rpc.filter(c => c[0] === 'log_learning_events').length;
    ok('Không quay vòng gọi lại RPC sau khi chạm trần', after === before, `${before} → ${after}`);
    ok('Người dùng được báo bằng toast', /hạn mức/i.test(window.document.querySelector('#toast').textContent));
  }

  console.log('\n[3] Realtime — vòng đời kênh');
  {
    const t = await boot();
    const { window, fake } = t;
    ok('Chưa đăng nhập thì không mở kênh realtime', fake.log.channels.length === 0);
    fake.fireAuth('SIGNED_IN', { user: { id: 'rt1', email: 'a@b.c' } });
    await sleep(600);
    ok('Đăng nhập thì mở đúng 1 kênh', fake.log.channels.length === 1, `có ${fake.log.channels.length}`);
    const ch = fake.log.channels[0];
    ok('Kênh đặt tên theo user', ch.name.includes('rt1'));
    ok('Kênh đã subscribe', ch.subscribed === true);
    const tables = ch.handlers.map(h => h.filter?.table);
    ok('Nghe study_progress', tables.includes('study_progress'));
    ok('Nghe daily_stats', tables.includes('daily_stats'));
    ok('KHÔNG nghe learning_events (tránh bão message)', !tables.includes('learning_events'));
    ok('Mọi handler đều lọc theo user_id của chính mình',
      ch.handlers.every(h => h.filter?.filter === 'user_id=eq.rt1'),
      JSON.stringify(ch.handlers.map(h => h.filter?.filter)));
    ok('Badge báo đang đồng bộ sống', /sống/i.test(window.document.querySelector('#syncBadge').textContent));
  }

  console.log('\n[4] Realtime — nhận thay đổi từ thiết bị khác');
  {
    const t = await boot();
    const { window, fake } = t;
    fake.fireAuth('SIGNED_IN', { user: { id: 'rt2', email: 'a@b.c' } });
    await sleep(600);
    const ch = fake.log.channels[0];
    const progHandler = ch.handlers.find(h => h.filter?.table === 'study_progress').cb;

    const future = new Date(Date.now() + 60000).toISOString();
    progHandler({ new: { item_key: 'audit', item_type: 'word', status: 'review', due_at: future, updated_at: future, correct_count: 3 } });
    await sleep(200);
    const st = t.stateOf('rt2');
    ok('Thay đổi từ máy khác được ghi vào state', !!st.progress['word:audit']);
    ok('Giữ nguyên số liệu máy kia gửi', st.progress['word:audit']?.correct_count === 3);

    // Echo cũ hơn không được ghi đè bản mới hơn ở máy này
    progHandler({ new: { item_key: 'audit', item_type: 'word', status: 'new', correct_count: 0, updated_at: '2000-01-01T00:00:00.000Z' } });
    await sleep(200);
    ok('Bản cũ hơn KHÔNG ghi đè bản mới hơn tại máy',
      t.stateOf('rt2').progress['word:audit']?.correct_count === 3);

    const dailyHandler = ch.handlers.find(h => h.filter?.table === 'daily_stats').cb;
    const today = new Date().toISOString().slice(0, 10);
    dailyHandler({ new: { study_date: today, reviews: 42, study_seconds: 600, updated_at: new Date().toISOString() } });
    await sleep(200);
    ok('Thống kê ngày nhận được từ máy khác', t.stateOf('rt2').daily[today]?.reviews === 42);
    dailyHandler({ new: { study_date: today, reviews: 5, study_seconds: 10, updated_at: new Date().toISOString() } });
    await sleep(200);
    ok('Counter lấy giá trị lớn hơn, không tụt số', t.stateOf('rt2').daily[today]?.reviews === 42);
  }

  console.log('\n[5] Realtime — đóng kênh khi đăng xuất');
  {
    const t = await boot();
    const { window, fake, $ } = t;
    fake.fireAuth('SIGNED_IN', { user: { id: 'rt3', email: 'a@b.c' } });
    await sleep(600);
    const ch = fake.log.channels[0];
    ok('Kênh đang mở', ch.subscribed === true);
    $('#menuSignOut').dispatchEvent(new window.Event('click'));
    await sleep(600);
    ok('Đăng xuất thì đóng kênh (không rò kết nối)', ch.subscribed === false);
  }

  console.log('\n[6] Corpus có phiên bản — không chặn khởi động');
  {
    const t = await boot({ manifest: [] });
    const { window, fetched, $ } = t;
    ok('Khởi động vẫn dùng JSON tĩnh', fetched.includes('data/core_cpa.json'));
    ok('Có đọc manifest đóng gói', fetched.includes('data/manifest.json'));
    ok('Dashboard render bình thường', !$('#content').innerHTML.includes('Đang nạp'));
  }

  console.log('\n[7] Corpus có phiên bản — máy chủ có bản mới thì thay tại chỗ');
  {
    const newRows = [{ entry: 'TU_MOI_TU_MAY_CHU', type: 'Word', cpa_subtopic: 'Audit', v2_priority: 9 }];
    const t = await boot({
      manifest: [{ pack_id: 'core', version: 5, title: 'Core', item_count: 1, checksum: 'x' }],
      packRows: newRows
    });
    const { window, fake } = t;
    await sleep(1200); // chờ prefetchIdle chạy nâng cấp nền
    const cached = JSON.parse(window.localStorage.getItem('cpa_pack_core') || 'null');
    ok('Pack mới được tải và cache lại', !!cached, 'không có cache');
    ok('Cache ghi đúng số phiên bản máy chủ', cached?.version === 5);
    ok('Cache chứa nội dung mới', cached?.rows?.[0]?.entry === 'TU_MOI_TU_MAY_CHU');
    ok('Có gọi content_manifest', fake.log.rpc.some(c => c[0] === 'content_manifest'));
    ok('Có đọc bảng content_items', fake.log.select.includes('content_items'));
  }

  console.log('\n[8] Corpus có phiên bản — bản cũ hơn thì KHÔNG tải');
  {
    const t = await boot({
      manifest: [{ pack_id: 'core', version: 1, title: 'Core', item_count: 1 }],
      packRows: [{ entry: 'KHONG_DUOC_DUNG' }]
    });
    const { window, fake } = t;
    await sleep(1200);
    ok('Không tải pack khi phiên bản máy chủ không mới hơn bản đóng gói',
      !fake.log.select.includes('content_items'));
    ok('Không ghi cache thừa', !window.localStorage.getItem('cpa_pack_core'));
  }

  console.log('\n[9] Corpus có phiên bản — máy chủ lỗi thì vẫn chạy bằng bản tĩnh');
  {
    const t = await boot({
      manifest: [{ pack_id: 'core', version: 9 }],
      packError: 'permission denied'
    });
    const { window, jsErrors, $ } = t;
    await sleep(1200);
    ok('Lỗi tải pack không làm hỏng app', jsErrors.length === 0, jsErrors.slice(0, 2).join('|'));
    await t.goto('study');
    ok('Vẫn học được bằng nội dung đóng gói', !!$('.study-term'));
    ok('Không ghi cache khi tải lỗi', !window.localStorage.getItem('cpa_pack_core'));
  }

  console.log('\n[10] Dùng cache khi cache mới hơn bản đóng gói');
  {
    const t = await boot({ manifest: [] });
    const { window } = t;
    window.localStorage.setItem('cpa_pack_exams', JSON.stringify({
      version: 99, rows: [{ year: 2099, text: 'DE THI TU CACHE ' + 'x'.repeat(300) }], cached_at: new Date().toISOString()
    }));
    await t.goto('exams');
    await sleep(500);
    const html = window.document.querySelector('#content').innerHTML;
    ok('Ưu tiên cache có phiên bản cao hơn bản đóng gói', /2099/.test(html), html.slice(0, 120));
  }

  R.done();
})().catch(e => { console.error('LỖI HARNESS:', e); process.exit(1); });
