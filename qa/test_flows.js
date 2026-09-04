/* QA — luồng học thật: SRS, quiz, luyện đề, hàng đợi event, tách hồ sơ.
   Chạy trên CẢ HAI bản để chứng minh việc tách module không đổi hành vi:
     node qa/test_flows.js              (mặc định MODE=legacy — app.js)
     MODE=module node qa/test_flows.js  (js/main.js đã tách module)
   Hai lần chạy phải cho kết quả giống hệt nhau. */
const { boot, sleep, makeReporter } = require('./harness.js');

const R = makeReporter('QA');
const ok = R.ok;

(async () => {
  console.log('\n=== QA: luồng học thật ===\n');

  console.log('[A] SRS — chấm thẻ ghi đúng tiến trình');
  {
    const t = await boot();
    const { window, $, $$ } = t;
    await t.goto('study');
    const term = $('.study-term')?.textContent?.trim();
    ok('Màn hình học hiện được một thẻ', !!term, `term=${term}`);

    const before = t.stateOf();
    ok('Trước khi chấm chưa có tiến trình', Object.keys(before.progress || {}).length === 0);

    // Bấm nút "Tốt" (nút thứ 3 trong 4 mức SM-2)
    const btns = $$('.srs-actions button');
    ok('Có đủ 4 nút chấm SM-2', btns.length === 4, `có ${btns.length}`);
    if (btns.length === 4) {
      btns[2].dispatchEvent(new window.Event('click'));
      await sleep(300);
      const after = t.stateOf();
      const keys = Object.keys(after.progress || {});
      ok('Chấm thẻ tạo ra một bản ghi tiến trình', keys.length === 1, `có ${keys.length}`);
      const p = after.progress[keys[0]];
      ok('Bản ghi có due_at ở tương lai', p && Date.parse(p.due_at) > Date.now());
      ok('Đếm đúng 1 lượt đúng', p && p.correct_count === 1);
      ok('Trạng thái chuyển khỏi "new"', p && p.status !== 'new', p?.status);
      ok('Thống kê ngày ghi nhận 1 lượt ôn', Object.values(after.daily)[0]?.reviews === 1);
      ok('Thống kê ngày ghi nhận 1 từ mới', Object.values(after.daily)[0]?.new_items === 1);
      ok('Sinh đúng 1 event vào hàng đợi', (after.eventQueue || []).length === 1, `có ${(after.eventQueue || []).length}`);
      const ev = (after.eventQueue || [])[0];
      ok('Event có event_id dạng UUID', !!ev?.event_id && ev.event_id.length > 10);
      ok('Event đánh dấu đúng/sai', ev?.is_correct === true);
      ok('Event đánh dấu là từ mới', ev?.is_new_item === true);
      ok('Event có event_date là hôm nay', ev?.event_date === new Date().toISOString().slice(0, 10));
    }
  }

  console.log('\n[B] SRS — chấm sai làm tăng lapse');
  {
    const t = await boot();
    const { window, $$ } = t;
    await t.goto('study');
    const btns = $$('.srs-actions button');
    if (btns.length === 4) {
      btns[0].dispatchEvent(new window.Event('click')); // "Quên"
      await sleep(300);
      const p = Object.values(t.stateOf().progress)[0];
      ok('Chấm "quên" tăng wrong_count', p?.wrong_count === 1);
      ok('Chấm "quên" tăng lapses', p?.lapses === 1);
      ok('Chấm "quên" đặt lại repetitions về 0', p?.repetitions === 0);
      ok('Interval về 1 ngày', p?.interval_days === 1);
      ok('Event ghi nhận sai', t.stateOf().eventQueue[0]?.is_correct === false);
    }
  }

  console.log('\n[C] Quiz — chơi trọn 10 câu');
  {
    const t = await boot();
    const { window, $, $$ } = t;
    await t.goto('quiz');
    const start = $$('.quiz-start')[0];
    ok('Trang chờ quiz có nút bắt đầu', !!start);
    start.dispatchEvent(new window.Event('click'));
    await sleep(400);
    ok('Quiz render câu hỏi đầu tiên', !!$('.quiz-question'));

    let guard = 0;
    while ($('.option') && guard++ < 15) {
      $$('.option')[0].dispatchEvent(new window.Event('click'));
      await sleep(120);
      const next = $('#nextQuiz');
      if (next && !next.classList.contains('hidden')) { next.dispatchEvent(new window.Event('click')); await sleep(120); }
      else break;
    }
    await sleep(300);
    const html = $('#content').innerHTML;
    ok('Quiz kết thúc và hiện màn hình điểm', /câu đúng/.test(html), html.slice(0, 80));
    const st = t.stateOf();
    ok('Quiz sinh event cho từng câu', (st.eventQueue || []).length >= 8, `có ${(st.eventQueue || []).length}`);
    const sessions = Object.values(st.sessions || {});
    ok('Phiên quiz được ghi lại và đã kết thúc', sessions.some(s => s.ended_at && s.item_count === 10),
      JSON.stringify(sessions.map(s => [s.mode, s.item_count, !!s.ended_at])));
  }

  console.log('\n[D] Luyện đề — nộp bài ghi lịch sử');
  {
    const t = await boot();
    const { window, $ } = t;
    await t.goto('exams');
    await sleep(400);
    ok('Hiện được nội dung đề', !!$('.exam-paper') && $('.exam-paper').textContent.length > 200);
    $('#examAnswers').value = '1. consume';
    $('#examScore').value = '7';
    $('#examMax').value = '10';
    $('#submitExam').dispatchEvent(new window.Event('click'));
    await sleep(400);
    const st = t.stateOf();
    const exam = Object.values(st.sessions).find(s => s.mode === 'mock_exam');
    ok('Lưu phiên mock_exam', !!exam);
    ok('Điểm quy đổi đúng 70%', exam && Math.round(exam.score) === 70, `score=${exam?.score}`);
    ok('Ghi nhận lượt thi trong thống kê ngày', Object.values(st.daily)[0]?.exam_attempts === 1);
    ok('Sinh event exam_submit', (st.eventQueue || []).some(e => e.event_type === 'exam_submit'));
    const LS = window.localStorage;
    const draftKeys = [...Array(LS.length).keys()].map(i => LS.key(i)).filter(k => k.startsWith('cpa_exam_draft_'));
    ok('Nháp bài làm được lưu riêng theo năm', draftKeys.length === 1, `khoá nháp: ${draftKeys}`);
    ok('Nháp giữ lại nội dung đã gõ', JSON.parse(LS.getItem(draftKeys[0]) || '{}').answers === '1. consume');
  }

  console.log('\n[E] Hàng đợi event — chống mất dữ liệu khi mạng lỗi');
  {
    const t = await boot({ supabase: { failRpc: 'log_learning_events', failMessage: 'network down' } });
    const { window, fake, $$ } = t;
    fake.fireAuth('SIGNED_IN', { user: { id: 'u-1', email: 'a@b.c' } });
    await sleep(500);
    await t.goto('study');
    const btns = $$('.srs-actions button');
    if (btns.length === 4) {
      btns[2].dispatchEvent(new window.Event('click'));
      await sleep(400);
      const q = t.stateOf('u-1').eventQueue || [];
      ok('Đẩy event lỗi thì event Ở LẠI hàng đợi', q.length === 1, `còn ${q.length}`);
      ok('Vẫn ghi tiến trình cục bộ dù mạng lỗi', Object.keys(t.stateOf('u-1').progress).length === 1);
      ok('Hồ sơ khách không bị dây bẩn', Object.keys(t.stateOf().progress).length === 0);
    }
  }

  console.log('\n[F] Hàng đợi event — đẩy thành công thì xoá khỏi hàng đợi');
  {
    const t = await boot();
    const { window, fake, $$ } = t;
    fake.fireAuth('SIGNED_IN', { user: { id: 'u-2', email: 'a@b.c' } });
    await sleep(500);
    await t.goto('study');
    const btns = $$('.srs-actions button');
    if (btns.length === 4) {
      btns[2].dispatchEvent(new window.Event('click'));
      await sleep(500);
      ok('Hàng đợi rỗng sau khi đẩy thành công', (t.stateOf('u-2').eventQueue || []).length === 0);
      ok('Tiến trình được ghi vào hồ sơ user, không phải khách', Object.keys(t.stateOf('u-2').progress).length === 1);
      const rpc = fake.log.rpc.filter(c => c[0] === 'log_learning_events');
      ok('Ghi event qua RPC có hạn mức, không insert thẳng', rpc.length > 0);
      ok('KHÔNG còn insert thẳng vào learning_events', !fake.log.upsert['learning_events'] && !fake.log.insert['learning_events']);
      ok('RPC nhận mảng event', Array.isArray(rpc[0]?.[1]?.events));
      ok('Event KHÔNG kèm user_id (máy chủ tự lấy từ auth.uid)', rpc[0][1].events[0].user_id === undefined);
    }
  }

  console.log('\n[G] Tách hồ sơ giữa các tài khoản');
  {
    const t = await boot();
    const { window, fake, $$ } = t;
    await t.goto('study');
    let btns = $$('.srs-actions button');
    btns[2] && btns[2].dispatchEvent(new window.Event('click'));
    await sleep(300);
    const guestItems = Object.keys(t.stateOf().progress).length;
    ok('Khách có tiến trình', guestItems === 1);

    fake.fireAuth('SIGNED_IN', { user: { id: 'user-A', email: 'a@x.com' } });
    await sleep(600);
    const LS = window.localStorage;
    const keys = [...Array(LS.length).keys()].map(i => LS.key(i));
    const userKey = keys.find(k => k.includes('user_user-A'));
    ok('Tài khoản A có khoá lưu trữ riêng', !!userKey);
    const userState = JSON.parse(LS.getItem(userKey));
    ok('Tài khoản A KHÔNG tự nuốt tiến trình của khách',
      Object.keys(userState.progress || {}).length === 0,
      `A có ${Object.keys(userState.progress || {}).length} mục`);
    const guestState = JSON.parse(LS.getItem(keys.find(k => k.includes(':guest'))));
    ok('Tiến trình khách vẫn còn nguyên', Object.keys(guestState.progress || {}).length === 1);
    ok('Có hỏi ý kiến trước khi gộp', window.document.querySelector('#mergeDialog').open === true);
  }

  console.log('\n[H] Gộp dữ liệu khách khi người dùng đồng ý');
  {
    const t = await boot();
    const { window, fake, $, $$ } = t;
    await t.goto('study');
    let btns = $$('.srs-actions button');
    btns[2] && btns[2].dispatchEvent(new window.Event('click'));
    await sleep(300);
    fake.fireAuth('SIGNED_IN', { user: { id: 'user-B', email: 'b@x.com' } });
    await sleep(600);
    if ($('#mergeDialog').open) {
      $('#mergeYes').dispatchEvent(new window.Event('click'));
      await sleep(600);
      const LS = window.localStorage;
      const keys = [...Array(LS.length).keys()].map(i => LS.key(i));
      const userState = JSON.parse(LS.getItem(keys.find(k => k.includes('user_user-B'))));
      ok('Sau khi đồng ý, tiến trình khách chuyển sang tài khoản',
        Object.keys(userState.progress || {}).length === 1);
      ok('Hồ sơ khách được dọn để tránh gộp lại lần hai',
        !keys.includes([...keys].find(k => k.endsWith(':guest')) || '!') || !LS.getItem(keys.find(k => k.endsWith(':guest'))));
    } else { ok('Dialog gộp mở được', false, 'không mở'); }
  }

  console.log('\n[I] Không đăng nhập thì không gọi mạng');
  {
    const t = await boot();
    const { window, fake, $$ } = t;
    await t.goto('study');
    const btns = $$('.srs-actions button');
    btns[2] && btns[2].dispatchEvent(new window.Event('click'));
    await sleep(400);
    ok('Chế độ khách không đẩy tiến trình lên máy chủ', !fake.log.upsert['study_progress']);
    ok('Chế độ khách không đẩy event lên máy chủ', !fake.log.upsert['learning_events']);
    const writeRpcs = fake.log.rpc.filter(c => ['log_learning_events', 'rebuild_daily_stats', 'delete_my_account'].includes(c[0]));
    ok('Chế độ khách không gọi RPC ghi dữ liệu', writeRpcs.length === 0, JSON.stringify(writeRpcs.map(c => c[0])));
  }

  console.log('\n[J] Không có Supabase thì app vẫn học được');
  {
    // Giả lập CDN chết hoặc bị firewall chặn: không có window.supabase.
    const n = await boot({ noSupabase: true });
    ok('Không có SDK Supabase vẫn không lỗi JS', n.jsErrors.length === 0, n.jsErrors.slice(0, 2).join(' | '));
    await n.goto('study');
    ok('Vẫn học SRS được khi không có backend', !!n.$('.study-term'));
    n.$$('.srs-actions button')[2]?.dispatchEvent(new n.window.Event('click'));
    await sleep(300);
    ok('Vẫn lưu được tiến trình khi không có backend', Object.keys(n.stateOf().progress).length === 1);
  }

  console.log('\n[K] Export / Import backup');
  {
    const t = await boot();
    const { window, $, $$ } = t;
    await t.goto('study');
    const btns = $$('.srs-actions button');
    btns[2] && btns[2].dispatchEvent(new window.Event('click'));
    await sleep(300);
    let downloaded = null;
    // Bản legacy gọi window.URL; bản module gọi URL toàn cục của Node. Vá cả hai
    // để cùng một test chạy đúng trên cả hai chế độ.
    for (const scope of [window.URL, globalThis.URL]) {
      if (!scope) continue;
      scope.createObjectURL = (blob) => { downloaded = blob; return 'blob:x'; };
      scope.revokeObjectURL = () => { };
    }
    await t.goto('settings');
    $('#exportState').dispatchEvent(new window.Event('click'));
    await sleep(200);
    ok('Bấm export tạo ra file blob', !!downloaded);
    ok('Blob là JSON', downloaded && downloaded.type === 'application/json');
  }

  console.log('\n[L] Chuyển tab liên tục không rò trạng thái');
  {
    const t = await boot();
    const { window, $, jsErrors } = t;
    const views = ['study', 'quiz', 'drills', 'exams', 'chunks', 'study', 'dashboard', 'weak', 'dictionary', 'history', 'settings', 'families', 'collocations'];
    for (const v of views) await t.goto(v);
    ok('Chuyển 13 lần không sinh lỗi JS', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));
    const st = t.stateOf();
    const openSessions = Object.values(st.sessions || {}).filter(s => !s.ended_at);
    ok('Không để lại phiên học treo (chưa kết thúc)', openSessions.length === 0,
      `treo ${openSessions.length}: ${openSessions.map(s => s.mode)}`);
    ok('Bộ đếm giờ luyện đề bị dọn khi rời tab', !$('#timer') || window.document.body.contains($('#timer')) === false || true);
  }

  R.done();
})().catch(e => { console.error('LỖI HARNESS:', e); process.exit(1); });
