/* views_home.js — Màn hình theo dõi: tổng quan, tiến trình, mục yếu, cài đặt.
   Tệp này do qa/split_modules.py sinh ra từ app.js. */
import {
  $,
  $$,
  CFG,
  clamp,
  dateKey,
  esc,
  fmtDate,
  fmtMin,
  nowIso,
  speak,
  toast,
  unique
} from './util.js';
import {
  currentUser,
  data,
  db,
  quiz,
  setCurrentUser,
  setProfile,
  setState,
  state
} from './runtime.js';
import {
  DAY,
  dailyLocal,
  defaultState,
  mergeState,
  saveState,
  stateStorageKey,
  switchStateScope
} from './store.js';
import { due, weaknessScore } from './srs.js';
import { modeLabel } from './sessions.js';
import {
  futureDueCounts,
  masteryStats,
  rangeDays,
  readinessScore,
  streak,
  svgLine,
  topicMastery
} from './analytics.js';
import { cloudUpsertGoals, syncAll } from './sync.js';
import { openAuth, openProfile, signOut, updateAuthUI } from './auth.js';
import { navigate } from './main.js';

export const titles = {
  dashboard:['Tổng quan','Mục tiêu hôm nay, readiness, xu hướng và lịch ôn.'],
  history:['Tiến trình học','Lịch sử phiên học và dữ liệu tiến bộ theo thời gian.'],
  study:['Học SRS','Ôn đúng lúc theo tần suất đề và mức độ ưu tiên CPA.'],
  families:['Word Family','78 gốc từ được trích từ phần Word Formation của đề.'],
  collocations:['Collocation','237 cụm: tách rõ cụm xác nhận trong corpus và cụm mở rộng nên học.'],
  chunks:['Cụm & câu','Học theo chunk: nghe cụm/câu, nhìn IPA, làm cloze và ghi nhớ trong ngữ cảnh corpus đề CPA.'],
  dictionary:['Từ điển','Tra cứu toàn bộ 4.225 từ trong corpus, lọc theo chủ đề/năm/mức ưu tiên.'],
  quiz:['Quiz tự chấm','Quiz sinh từ dữ liệu V2; đáp án xác định từ nhãn/family/collocation trong nguồn.'],
  drills:['Luyện câu đề thi','Word formation, viết lại câu, dịch — trích nguyên văn Part II các đề, có đáp án/bản dịch mẫu tự soạn.'],
  exams:['Luyện đề gốc','Đề OCR theo năm. Không tự chấm khi corpus không có đáp án chính thức.'],
  weak:['Câu/từ yếu','Tập trung các mục sai nhiều, lapse nhiều hoặc đến hạn ôn.'],
  settings:['Dữ liệu & cài đặt','Backup, đồng bộ cloud và quản lý dữ liệu học.']
};

export function setTitle(view){ $('#viewTitle').textContent=titles[view]?.[0]||view; $('#viewSubtitle').textContent=titles[view]?.[1]||''; }

export function renderDashboard(){
  const m=masteryStats(),today=dailyLocal(),tm=topicMastery(),ready=readinessScore();
  const days=Number(state.settings.analyticsDays||30),trend=rangeDays(days),future=futureDueCounts(7);
  const goalMin=Number(state.settings.dailyMinutesGoal||30),goalReviews=Number(state.settings.dailyReviewsGoal||30),goalNew=Number(state.settings.newPerDay??15);
  const pctMin=clamp(Math.round((Number(today.study_seconds||0)/60)/Math.max(1,goalMin)*100),0,100),pctRev=clamp(Math.round(Number(today.reviews||0)/Math.max(1,goalReviews)*100),0,100),pctNew=clamp(Math.round(Number(today.new_items||0)/Math.max(1,goalNew)*100),0,100);
  const topicRows=Object.entries(tm).sort((a,b)=>b[1].reviewed-a[1].reviewed).slice(0,8).map(([t,x])=>{const pct=x.reviewed?Math.round(x.mastered/x.reviewed*100):0;return `<div class="topic-row"><span>${esc(t)}</span><div class="bar"><span style="width:${pct}%"></span></div><b>${pct}%</b></div>`;}).join('')||'<div class="empty">Chưa có dữ liệu học.</div>';
  const heat=rangeDays(84),maxHeat=Math.max(1,...heat.map(x=>x.minutes));
  const heatHtml=heat.map(x=>`<div class="heat-cell h${Math.min(4,Math.ceil(x.minutes/maxHeat*4))}" title="${x.date}: ${Math.round(x.minutes)} phút · ${x.reviews} lượt"></div>`).join('');
  const weak=Object.values(state.progress).filter(p=>Number(p.wrong_count||0)>0||Number(p.lapses||0)>0).sort((a,b)=>weaknessScore(b)-weaknessScore(a)).slice(0,5);
  const weakHtml=weak.map(p=>`<div class="weak-mini"><div><b>${esc(p.item_key)}</b><small>${esc(p.topic||p.item_type)}</small></div><span class="weak-score">${weaknessScore(p)}</span></div>`).join('')||'<div class="muted small">Chưa có lỗi lặp lại.</div>';
  const sessions=Object.values(state.sessions).filter(x=>x.ended_at).sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at)).slice(0,5);
  const sessionHtml=sessions.map(x=>`<tr><td>${fmtDate(x.started_at)}</td><td>${esc(modeLabel(x.mode))}</td><td>${x.item_count||0}</td><td>${x.score==null?'—':Math.round(x.score)+'%'}</td><td>${fmtMin(x.duration_seconds||0)}</td></tr>`).join('');
  const target=state.settings.targetExamDate?new Date(`${state.settings.targetExamDate}T12:00:00`):null,daysLeft=target?Math.ceil((target-Date.now())/DAY):null;
  $('#content').innerHTML=`
    <div class="grid kpis">
      <div class="card kpi"><div class="label">CPA Readiness</div><div class="value ${ready.score>=75?'good':ready.score>=50?'warning':'accent'}">${ready.score}/100</div><div class="hint">Core ${ready.parts.core}% · Accuracy ${ready.parts.accuracy}%</div></div>
      <div class="card kpi"><div class="label">Đến hạn ôn</div><div class="value warning">${m.dueNow}</div><div class="hint">Trong ${m.tracked} mục đã học</div></div>
      <div class="card kpi"><div class="label">Đã thành thạo</div><div class="value good">${m.mastered}</div><div class="hint">SM-2: ≥5 lần + interval ≥21 ngày</div></div>
      <div class="card kpi"><div class="label">Streak</div><div class="value">${streak()} ngày</div><div class="hint">${daysLeft==null?'Chưa đặt ngày thi':daysLeft>=0?`Còn ${daysLeft} ngày tới mục tiêu`:'Đã qua ngày mục tiêu'}</div></div>
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="card"><div class="section-head"><h2>Mục tiêu hôm nay</h2><button class="primary" id="smartStudy">▶ Học thông minh</button></div>
        <div class="goal-row"><span>Thời gian</span><div class="progressbar"><span style="width:${pctMin}%"></span></div><b>${Math.round(Number(today.study_seconds||0)/60)}/${goalMin} phút</b></div>
        <div class="goal-row"><span>Lượt ôn</span><div class="progressbar"><span style="width:${pctRev}%"></span></div><b>${today.reviews||0}/${goalReviews}</b></div>
        <div class="goal-row"><span>Từ mới</span><div class="progressbar"><span style="width:${pctNew}%"></span></div><b>${today.new_items||0}/${goalNew}</b></div>
        <div class="button-row" style="margin-top:14px"><button class="secondary" data-go="weak">Ôn điểm yếu</button><button class="secondary" data-go="quiz">Quiz 10 câu</button><button class="secondary" data-go="drills">Luyện câu đề</button></div>
      </div>
      <div class="card"><div class="section-head"><h2>Readiness breakdown</h2><span class="pill">ước tính từ dữ liệu học</span></div>
        <div class="readiness-grid">${Object.entries({Core:ready.parts.core,'Word Family':ready.parts.families,Collocation:ready.parts.collocations,Cloze:ready.parts.cloze,Accuracy:ready.parts.accuracy,'Đều đặn':ready.parts.consistency,'Mock exam':ready.parts.exam}).map(([k,v])=>`<div><span>${esc(k)}</span><b>${v}%</b><div class="bar"><span style="width:${v}%"></span></div></div>`).join('')}</div>
      </div>
    </div>
    <div class="card" style="margin-top:14px"><div class="section-head"><h2>Xu hướng học tập</h2><div class="segmented"><button data-days="7">7 ngày</button><button data-days="30">30 ngày</button><button data-days="90">90 ngày</button></div></div>
      <div class="grid two"><div><h3>Phút học/ngày</h3>${svgLine(trend,'minutes',' phút')}</div><div><h3>Accuracy/ngày</h3>${svgLine(trend,'accuracy','%')}</div></div>
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="card"><div class="section-head"><h2>Heatmap 12 tuần</h2><span class="muted small">đậm hơn = học nhiều hơn</span></div><div class="heatmap">${heatHtml}</div></div>
      <div class="card"><div class="section-head"><h2>SRS 7 ngày tới</h2><span class="muted small">khối lượng đến hạn</span></div><div class="due-bars">${future.map(x=>{const max=Math.max(1,...future.map(v=>v.count));return `<div><span>${esc(x.label)}</span><div class="bar"><span style="width:${Math.round(x.count/max*100)}%"></span></div><b>${x.count}</b></div>`;}).join('')}</div></div>
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="card"><div class="section-head"><h2>Điểm yếu nổi bật</h2><button class="secondary" data-go="weak">Xem tất cả</button></div>${weakHtml}</div>
      <div class="card"><h2>Mastery theo chủ đề</h2><div class="topic-list">${topicRows}</div></div>
    </div>
    <div class="card" style="margin-top:14px"><div class="section-head"><h2>Phiên học gần đây</h2><span class="muted small">${Object.keys(state.sessions).length} phiên được lưu local/offline</span></div><div class="table-wrap"><table><thead><tr><th>Ngày</th><th>Chế độ</th><th>Mục</th><th>Điểm</th><th>Thời gian</th></tr></thead><tbody>${sessionHtml||'<tr><td colspan="5">Chưa có phiên học hoàn tất.</td></tr>'}</tbody></table></div></div>`;
  $$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  $$('.segmented [data-days]').forEach(b=>{b.classList.toggle('active',Number(b.dataset.days)===days);b.onclick=()=>{state.settings.analyticsDays=Number(b.dataset.days);saveState();renderDashboard();};});
  $('#smartStudy').onclick=()=>{state.settings.studyMode='smart';state.settings.topic='';saveState();navigate('study');};
}

export function renderHistory(){
  const sessions=Object.values(state.sessions).filter(x=>x.ended_at).sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at));
  const modes=unique(sessions.map(x=>x.mode)).sort();
  $('#content').innerHTML=`<div class="toolbar"><label>Loại phiên<select id="historyMode"><option value="">Tất cả</option>${modes.map(m=>`<option value="${esc(m)}">${esc(modeLabel(m))}</option>`).join('')}</select></label><label>Khoảng thời gian<select id="historyDays"><option value="7">7 ngày</option><option value="30">30 ngày</option><option value="90">90 ngày</option><option value="3650">Toàn bộ</option></select></label></div><div id="historyArea"></div>`;
  $('#historyDays').value=String(state.settings.historyDays||30);
  const draw=()=>{const mode=$('#historyMode').value,days=Number($('#historyDays').value),cut=Date.now()-days*DAY;state.settings.historyDays=days;saveState();const list=sessions.filter(x=>(!mode||x.mode===mode)&&Date.parse(x.started_at)>=cut);const sec=list.reduce((a,x)=>a+Number(x.duration_seconds||0),0),items=list.reduce((a,x)=>a+Number(x.item_count||0),0),scored=list.filter(x=>x.score!=null),avg=scored.length?Math.round(scored.reduce((a,x)=>a+Number(x.score||0),0)/scored.length):0;$('#historyArea').innerHTML=`<div class="grid kpis"><div class="card kpi"><div class="label">Số phiên</div><div class="value">${list.length}</div></div><div class="card kpi"><div class="label">Thời gian</div><div class="value accent">${Math.round(sec/360)/10} giờ</div></div><div class="card kpi"><div class="label">Mục đã luyện</div><div class="value good">${items}</div></div><div class="card kpi"><div class="label">Điểm TB</div><div class="value warning">${avg}%</div></div></div><div class="card" style="margin-top:14px"><div class="table-wrap"><table><thead><tr><th>Bắt đầu</th><th>Chế độ</th><th>Số mục</th><th>Đúng</th><th>Sai</th><th>Điểm</th><th>Thời gian</th><th>Sync</th></tr></thead><tbody>${list.slice(0,500).map(x=>`<tr><td>${fmtDate(x.started_at)}</td><td>${esc(modeLabel(x.mode))}</td><td>${x.item_count||0}</td><td>${x.correct_count||0}</td><td>${x.wrong_count||0}</td><td>${x.score==null?'—':Math.round(x.score)+'%'}</td><td>${fmtMin(x.duration_seconds||0)}</td><td>${x.synced?'Cloud':'Local'}</td></tr>`).join('')||'<tr><td colspan="8">Chưa có phiên học trong khoảng này.</td></tr>'}</tbody></table></div></div>`;};
  $('#historyMode').onchange=draw;$('#historyDays').onchange=draw;draw();
}

export function renderWeak(){
  const rows=Object.values(state.progress).filter(p=>Number(p.wrong_count||0)>0||Number(p.lapses||0)>0||due(p)).sort((a,b)=>weaknessScore(b)-weaknessScore(a));
  const avg=rows.length?Math.round(rows.reduce((s,p)=>s+weaknessScore(p),0)/rows.length):0;
  $('#content').innerHTML=`<div class="grid kpis"><div class="card kpi"><div class="label">Mục cần chú ý</div><div class="value warning">${rows.length}</div></div><div class="card kpi"><div class="label">Weakness trung bình</div><div class="value">${avg}/100</div></div><div class="card kpi"><div class="label">Sai ≥2 lần</div><div class="value bad">${rows.filter(p=>Number(p.wrong_count||0)>=2).length}</div></div><div class="card kpi"><div class="label">Đang đến hạn</div><div class="value accent">${rows.filter(due).length}</div></div></div>
    <div class="card" style="margin-top:14px"><div class="section-head"><div><h2>Danh sách ưu tiên ôn</h2><p class="muted small">Score kết hợp tỷ lệ sai, lapse, quá hạn và thời gian phản hồi.</p></div><button class="primary" id="reviewWeak">Ôn đúng danh sách này</button></div><div class="table-wrap"><table><thead><tr><th>Weak score</th><th>Mục</th><th>Loại</th><th>Topic</th><th>Đúng</th><th>Sai</th><th>Lapse</th><th>Due</th></tr></thead><tbody>${rows.slice(0,300).map(p=>`<tr><td><span class="weak-score">${weaknessScore(p)}</span></td><td><b>${esc(p.item_key)}</b></td><td>${esc(p.item_type)}</td><td>${esc(p.topic||'')}</td><td>${p.correct_count||0}</td><td>${p.wrong_count||0}</td><td>${p.lapses||0}</td><td>${fmtDate(p.due_at)}</td></tr>`).join('')||'<tr><td colspan="8">Chưa có mục yếu.</td></tr>'}</tbody></table></div></div>`;
  $('#reviewWeak').onclick=()=>{state.settings.studyMode='weak';state.settings.topic='';saveState();navigate('study');};
}

export function renderSettings(){
  const pending=(state.eventQueue||[]).length;
  const unsynced=Object.values(state.sessions).filter(x=>!x.synced).length;
  const account=currentUser
    ? `<p>Đang đăng nhập: <b>${esc(currentUser.email)}</b> ${currentUser.email_confirmed_at||currentUser.confirmed_at?'<span class="badge-inline ok">đã xác nhận</span>':'<span class="badge-inline warn">chưa xác nhận email</span>'}</p>
       <p class="muted small">Tiến trình đồng bộ qua Supabase, mỗi tài khoản bị RLS khoá riêng — không ai đọc được dữ liệu của bạn kể cả khi biết ID.</p>
       <ul class="small muted"><li>Lần đồng bộ gần nhất: ${state.lastSync?fmtDate(state.lastSync)+' '+new Date(state.lastSync).toLocaleTimeString('vi-VN'):'chưa có'}</li><li>Event chờ đẩy lên: ${pending}</li><li>Phiên học chưa đồng bộ: ${unsynced}</li></ul>`
    : `<p>Bạn đang học ở <b>chế độ khách</b>. Toàn bộ tiến trình chỉ nằm trong trình duyệt này — xoá cache trình duyệt là mất.</p>
       <p class="muted small">Tạo tài khoản để giữ tiến trình và học tiếp trên điện thoại.</p>`;

  $('#content').innerHTML=`<div class="settings-grid">
    <div class="card"><h2>Tài khoản &amp; đồng bộ</h2>${account}
      <div class="button-row">
        ${currentUser?'<button class="primary" id="settingsSync">Đồng bộ ngay</button><button class="secondary" id="settingsProfile">Hồ sơ &amp; mục tiêu</button><button class="secondary" id="settingsSignOut">Đăng xuất</button>'
                     :'<button class="primary" id="settingsAuth">Đăng nhập / Đăng ký</button><button class="secondary" id="settingsProfile">Đặt mục tiêu</button>'}
      </div>
    </div>

    <div class="card"><h2>Mục tiêu học</h2>
      <div class="grid two">
        <label class="field">Phút/ngày<input id="goalMinutes" type="number" min="5" max="240" value="${state.settings.dailyMinutesGoal||30}"></label>
        <label class="field">Lượt ôn/ngày<input id="goalReviews" type="number" min="5" max="300" value="${state.settings.dailyReviewsGoal||30}"></label>
        <label class="field">Từ mới/ngày<input id="goalNew" type="number" min="0" max="50" value="${state.settings.newPerDay??15}"></label>
        <label class="field">Ngày thi mục tiêu<input id="targetExam" type="date" value="${esc(state.settings.targetExamDate||'')}"></label>
      </div>
      <button class="primary" id="saveGoals" style="margin-top:12px">Lưu mục tiêu</button>
    </div>

    <div class="card"><h2>Sao lưu thủ công</h2>
      <p class="muted small">File export gồm tiến trình SRS, thống kê ngày, mục tiêu và lịch sử phiên học. Dùng khi đổi máy hoặc muốn giữ bản chép riêng.</p>
      <div class="button-row"><button class="primary" id="exportState">Tải file backup</button><label class="secondary" style="cursor:pointer">Nạp file backup<input id="importState" type="file" accept="application/json" class="hidden"></label></div>
    </div>

    <div class="card"><h2>Phát âm</h2>
      <label class="field">Tốc độ đọc<input id="speechRate" type="range" min="0.55" max="1.05" step="0.05" value="${state.settings.speechRate||.88}"></label>
      <div id="speechRateVal">${state.settings.speechRate||.88}×</div>
      <button class="secondary" id="testVoice">🔊 Nghe thử</button>
    </div>

    <div class="card"><h2>Dữ liệu nguồn</h2>
      <ul class="small"><li>Core CPA: ${data.core.length}</li><li>Từ vựng corpus: ${data.topic.length||'chưa tải'}</li><li>Word families: ${data.families.length}</li><li>Collocations: ${data.collocations.length}</li><li>Câu corpus: ${data.sentences.length}</li><li>Đề OCR: ${data.exams.length||'chưa tải'}</li><li>Phiên học trên máy: ${Object.keys(state.sessions).length}</li></ul>
      <p class="tiny muted">Phiên bản dữ liệu: ${esc(CFG.dataVersion||'')}</p>
      <p class="source-box">${esc(CFG.sourceNote||'')}</p>
    </div>

    <div class="card danger-zone"><h2>Vùng nguy hiểm</h2>
      <p class="muted small">Xoá tiến trình trên máy chỉ ảnh hưởng hồ sơ đang mở (${currentUser?'tài khoản hiện tại':'chế độ khách'}); dữ liệu trên máy chủ vẫn còn và sẽ tải lại khi đồng bộ.</p>
      <div class="button-row">
        <button class="danger" id="resetLocal">Xoá tiến trình trên máy</button>
        ${currentUser?'<button class="danger" id="deleteAccount">Xoá vĩnh viễn tài khoản</button>':''}
      </div>
    </div>
  </div>`;

  $('#exportState').onclick=exportState;$('#importState').onchange=importState;
  if($('#settingsAuth'))$('#settingsAuth').onclick=()=>openAuth('signin');
  if($('#settingsSync'))$('#settingsSync').onclick=syncAll;
  if($('#settingsProfile'))$('#settingsProfile').onclick=openProfile;
  if($('#settingsSignOut'))$('#settingsSignOut').onclick=signOut;
  $('#saveGoals').onclick=()=>{
    state.settings.dailyMinutesGoal=clamp(Number($('#goalMinutes').value||30),5,240);
    state.settings.dailyReviewsGoal=clamp(Number($('#goalReviews').value||30),5,300);
    state.settings.newPerDay=clamp(Number($('#goalNew').value||0),0,50);
    state.settings.targetExamDate=$('#targetExam').value||'';
    state.settingsUpdatedAt=nowIso();saveState();
    if(currentUser)cloudUpsertGoals();
    toast('Đã lưu mục tiêu học.');
  };
  if($('#speechRate'))$('#speechRate').oninput=e=>{state.settings.speechRate=Number(e.target.value);saveState();$('#speechRateVal').textContent=e.target.value+'×';};
  if($('#testVoice'))$('#testVoice').onclick=()=>speak('The auditor reviewed the financial statements.');
  $('#resetLocal').onclick=()=>{
    if(!confirm('Xoá toàn bộ tiến trình của hồ sơ đang mở trên máy này?'))return;
    const owner=state.ownerId;setState(defaultState());state.ownerId=owner;saveState();
    toast('Đã xoá tiến trình trên máy.');navigate('settings');
  };
  if($('#deleteAccount'))$('#deleteAccount').onclick=deleteAccount;
}

export async function deleteAccount(){
  if(!db||!currentUser)return;
  const typed=prompt(`Hành động này KHÔNG thể hoàn tác: xoá tài khoản ${currentUser.email} cùng toàn bộ tiến trình trên máy chủ.\n\nGõ chính xác XOA TAI KHOAN để xác nhận:`);
  if(typed!=='XOA TAI KHOAN')return toast('Đã huỷ.');
  try{
    const {error}=await db.rpc('delete_my_account');
    if(error)throw error;
    try{localStorage.removeItem(stateStorageKey());}catch{}
    await db.auth.signOut();
    setCurrentUser(null);setProfile(null);switchStateScope(null);updateAuthUI();
    toast('Đã xoá tài khoản và toàn bộ dữ liệu trên máy chủ.');
    navigate('dashboard');
  }catch(e){
    toast(/function|does not exist/i.test(String(e.message))
      ? 'Máy chủ chưa cài hàm delete_my_account (chạy migration V7 trong supabase/schema.sql).'
      : 'Xoá tài khoản lỗi: '+e.message);
  }
}

export function exportState(){const blob=new Blob([JSON.stringify({exported_at:nowIso(),data_version:CFG.dataVersion,state},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`cpa-progress-${dateKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

export async function importState(ev){const file=ev.target.files?.[0];if(!file)return;try{const obj=JSON.parse(await file.text());setState(mergeState(obj.state||obj));state.ownerId=currentUser?.id||null;saveState();toast('Import thành công.');renderSettings();if(currentUser)syncAll();}catch(e){toast('File backup không hợp lệ.');}}
