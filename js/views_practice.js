/* views_practice.js — Màn hình luyện thi: quiz tự chấm, luyện câu đề, luyện đề gốc.
   Tệp này do qa/split_modules.py sinh ra từ app.js. */
import { $, $$, esc, fmtMin, norm, nowIso, sample, shuffled, toast, unique } from './util.js';
import {
  currentUser,
  data,
  db,
  drillState,
  examRawText,
  examRemaining,
  examTimer,
  quiz,
  quizSessionId,
  setDrillState,
  setExamRawText,
  setExamRemaining,
  setExamTimer,
  setLiveSessionId,
  setQuiz,
  setQuizSessionId
} from './runtime.js';
import { EXAM_DRAFT_PREFIX, dailyLocal, queueEvent, saveState } from './store.js';
import {
  appendCompletedSession,
  finishLiveSession,
  finishLocalSession,
  startLocalSession
} from './sessions.js';
import { collocationRow } from './content.js';
import { cloudUpsertDaily, recordReview, syncSessions } from './sync.js';
import { navigate } from './main.js';

export function drillPool(mode,year){
  const y=year?Number(year):null;
  const src=mode==='wf'?data.wf:mode==='tr'?data.tr:mode==='tle'?data.tle:mode==='tlv'?data.tlv:[];
  return (y?src.filter(x=>x.year===y):src);
}

export function renderDrills(){
  const years=unique([...data.wf,...data.tr,...data.tle,...data.tlv].map(x=>x.year)).sort();
  $('#content').innerHTML=`<div class="notice" style="border-color:#7a3b3b;background:#2a1616;color:#f3a2a2"><b>Đáp án ở đây là tự soạn, không phải đáp án chính thức.</b> Bản đề gốc không kèm đáp án — chỉ có đề. 257 câu (word formation, viết lại câu, dịch hai chiều) dưới đây có đáp án/bản dịch mẫu do soạn dựa trên ngữ pháp và thuật ngữ chuẩn, chưa đối chiếu được với đáp án Hội đồng thi. Câu nào có nghi vấn OCR sẽ hiện cảnh báo ⚠ riêng ngay tại câu đó.</div>
  <div class="toolbar" style="margin-top:14px">
    <label>Dạng bài<select id="drillMode">
      <option value="wf">Word formation — chia dạng từ (95 câu)</option>
      <option value="tr">Viết lại câu (73 câu)</option>
      <option value="tle">Dịch Anh → Việt (42 câu)</option>
      <option value="tlv">Dịch Việt → Anh (47 câu)</option>
    </select></label>
    <label>Năm<select id="drillYear"><option value="">Tất cả</option>${years.map(y=>`<option>${y}</option>`).join('')}</select></label>
    <button class="primary" id="drillStart">Bắt đầu</button>
  </div>
  <div id="drillArea"></div>`;
  $('#drillStart').onclick=()=>startDrill($('#drillMode').value,$('#drillYear').value);
}

export async function startDrill(mode,year){
  const pool=shuffled(drillPool(mode,year));
  if(!pool.length){$('#drillArea').innerHTML='<div class="card empty">Không có câu nào khớp bộ lọc.</div>';return;}
  setDrillState({mode,pool,index:0,correct:0,wrong:0,started:Date.now()});
  finishLiveSession();drillState.sessionId=startLocalSession(mode==='wf'?'word_formation':mode==='tr'?'sentence_transform':'translation',{surface:'drills',year:year||null});
  renderDrillItem();
}

export function renderDrillItem(){
  const d=drillState; const area=$('#drillArea'); if(!area) return;
  if(d.index>=d.pool.length) return finishDrill();
  const it=d.pool[d.index];
  const head=`<div class="stat-line"><span>${d.index+1}/${d.pool.length}</span><span class="pill">Đề ${it.year}</span><span>Đúng ${d.correct} · Sai ${d.wrong}</span></div>`;
  if(d.mode==='wf'){
    area.innerHTML=`<div class="card">${head}<div class="quiz-question" style="font-size:19px">${esc(it.sentence).replace('___','<b style="color:var(--accent)">▁▁▁▁▁</b>')}</div>
      <div class="pill warn" style="font-size:13px;padding:6px 10px">${esc(it.root)}</div>
      ${it.note?`<div class="notice" style="margin-top:10px">⚠ ${esc(it.note)}</div>`:''}
      <div class="button-row" style="margin-top:14px"><input id="drillInput" placeholder="Gõ dạng đúng của từ…" style="flex:1;min-width:200px"><button class="primary" id="drillCheck">Kiểm tra</button></div>
      <div id="drillVerdict"></div></div>`;
    const inp=$('#drillInput'); inp.focus();
    const check=()=>{
      const v=norm(inp.value); if(!v) return;
      const ok=[norm(it.answer),...(it.alternates||[]).map(norm)].includes(v);
      ok?d.correct++:d.wrong++; inp.disabled=true; $('#drillCheck').disabled=true;
      $('#drillVerdict').innerHTML=`<div class="${ok?'success-note':'notice'}" style="margin-top:12px">${ok?'✓ Đúng':'✗ Chưa đúng'} — đáp án: <b>${esc(it.sentence.replace('___',it.answer))}</b>${it.alternates&&it.alternates.length?`<br>Cũng chấp nhận: ${esc(it.alternates.join(', '))}`:''}</div>
        <button class="primary" id="drillNext" style="margin-top:10px">Câu tiếp →</button>`;
      $('#drillNext').onclick=()=>{d.index++;renderDrillItem();}; $('#drillNext').focus();
    };
    $('#drillCheck').onclick=check; inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();check();}};
  } else if(d.mode==='tr'){
    area.innerHTML=`<div class="card">${head}<div class="quiz-question" style="font-size:18px">${esc(it.original)}</div>
      ${it.keyword?`<div class="pill warn" style="font-size:13px;padding:6px 10px">${esc(it.keyword)} — không đổi dạng</div>`:''}
      ${it.note?`<div class="notice" style="margin-top:10px">⚠ ${esc(it.note)}</div>`:''}
      <p class="muted" style="font-family:Georgia,serif;font-size:16px;margin-top:14px">${esc(it.lead)} …</p>
      <textarea id="drillInput" rows="3" placeholder="Viết câu của bạn…"></textarea>
      <div class="button-row" style="margin-top:10px"><button class="secondary" id="drillReveal">Xem đáp án mẫu</button></div>
      <div id="drillVerdict"></div></div>`;
    $('#drillInput').focus();
    $('#drillReveal').onclick=()=>{
      $('#drillVerdict').innerHTML=`<div class="success-note" style="margin-top:12px">${esc(it.model)}</div>
        <div class="button-row" style="margin-top:10px"><span class="muted small" style="align-self:center">Tự chấm:</span>
        <button class="secondary" id="sgOk">Đúng</button><button class="secondary" id="sgNo">Chưa đạt</button></div>`;
      $('#sgOk').onclick=()=>{d.correct++;d.index++;renderDrillItem();};
      $('#sgNo').onclick=()=>{d.wrong++;d.index++;renderDrillItem();};
    };
  } else {
    const isEn2Vn=d.mode==='tle';
    area.innerHTML=`<div class="card">${head}<div class="quiz-question" style="font-size:18px">${esc(it.source)}</div>
      <textarea id="drillInput" rows="4" placeholder="${isEn2Vn?'Dịch sang tiếng Việt…':'Dịch sang tiếng Anh…'}"></textarea>
      <div class="button-row" style="margin-top:10px"><button class="secondary" id="drillReveal">Xem bản dịch mẫu</button></div>
      <div id="drillVerdict"></div></div>`;
    $('#drillInput').focus();
    $('#drillReveal').onclick=()=>{
      $('#drillVerdict').innerHTML=`<div class="success-note" style="margin-top:12px">${esc(it.model)}</div>
        <div class="button-row" style="margin-top:10px"><span class="muted small" style="align-self:center">Tự chấm:</span>
        <button class="secondary" id="sgOk">Sát nghĩa</button><button class="secondary" id="sgNo">Lệch nhiều</button></div>`;
      $('#sgOk').onclick=()=>{d.correct++;d.index++;renderDrillItem();};
      $('#sgNo').onclick=()=>{d.wrong++;d.index++;renderDrillItem();};
    };
  }
}

export async function finishDrill(){
  const d=drillState; const seconds=Math.round((Date.now()-d.started)/1000);
  finishLocalSession(d.sessionId,{item_count:d.pool.length,correct_count:d.correct,wrong_count:d.wrong,score:d.pool.length?d.correct/d.pool.length*100:0,duration_seconds:seconds});if(currentUser)syncSessions();
  const day=dailyLocal(); day.study_seconds+=seconds; day.reviews+=d.pool.length; day.correct_count+=d.correct; day.wrong_count+=d.wrong; day.updated_at=nowIso(); saveState();if(currentUser)cloudUpsertDaily(day).catch(console.warn);
  $('#drillArea').innerHTML=`<div class="card" style="text-align:center"><div class="study-term">${d.pool.length?Math.round(d.correct/d.pool.length*100):0}%</div><h2>${d.correct}/${d.pool.length} đúng (tự chấm)</h2><p class="muted">Thời gian: ${fmtMin(seconds)}</p><div class="button-row" style="justify-content:center"><button class="primary" id="drillAgain">Làm lại</button></div></div>`;
  $('#drillAgain').onclick=()=>{setDrillState(null);renderDrills();};
}

export function makeFamilyQuestion(){
  const f=sample(data.families.filter(x=>String(x.full_study_family||'').includes(','))); const members=String(f.full_study_family||'').split(',').map(s=>s.trim()).filter(x=>norm(x)!==norm(f.root)); const correct=sample(members); const distract=[];
  while(distract.length<3){const other=sample(data.families.filter(x=>x.root!==f.root));const opts=String(other.full_study_family||other.root).split(',').map(s=>s.trim()).filter(Boolean);const o=sample(opts);if(o&&norm(o)!==norm(correct)&&!distract.some(x=>norm(x)===norm(o)))distract.push(o);}
  return {kind:'family',prompt:`Từ nào thuộc word family của “${f.root}”?`,answer:correct,options:shuffled([correct,...distract]),item:f,explain:`Family học: ${f.full_study_family}`};
}

export function makeCollocationQuestion(){
  const candidates=data.collocations.filter(x=>x.term_fixed_phrase&&x.meaning_vi);
  // Prefer an authentic high-quality exam sentence: the learner recalls the whole chunk in context.
  const sentenceCandidates=data.sentences.filter(s=>s.quality!=='low'&&s.source_fidelity==='Exact OCR'&&s.focus_type==='collocation'&&s.focus_term);
  if(sentenceCandidates.length && Math.random()<.7){
    const ex=sample(sentenceCandidates); const c=collocationRow(ex.focus_term); if(c){
      const re=new RegExp(c.term_fixed_phrase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
      const display=ex.text.replace(re,'_____');
      const same=data.collocations.filter(x=>x.topic===c.topic&&norm(x.term_fixed_phrase)!==norm(c.term_fixed_phrase));
      const distract=unique(shuffled(same).map(x=>x.term_fixed_phrase)).slice(0,3);
      if(distract.length===3)return {kind:'collocation',prompt:`Điền cụm phù hợp vào câu đề ${ex.year}: ${display}`,answer:c.term_fixed_phrase,options:shuffled([c.term_fixed_phrase,...distract]),item:c,explain:`${c.term_fixed_phrase} = ${c.meaning_vi}. ${c.source_type==='Corpus confirmed'?`Cụm được xác nhận trong corpus (${c.years||'đề CPA'}).`:'Cụm mở rộng để học.'}`};
    }
  }
  // Fallback: meaning -> full collocation. Avoid duplicate Vietnamese meanings to keep one defensible answer.
  const counts=new Map();for(const x of candidates){const m=norm(x.meaning_vi);counts.set(m,(counts.get(m)||0)+1);}
  const uniqueMeaning=candidates.filter(x=>counts.get(norm(x.meaning_vi))===1); const c=sample(uniqueMeaning.length?uniqueMeaning:candidates);
  const same=candidates.filter(x=>x.topic===c.topic&&norm(x.term_fixed_phrase)!==norm(c.term_fixed_phrase)&&norm(x.meaning_vi)!==norm(c.meaning_vi));
  const fallback=candidates.filter(x=>norm(x.term_fixed_phrase)!==norm(c.term_fixed_phrase)&&norm(x.meaning_vi)!==norm(c.meaning_vi));
  const distract=unique(shuffled(same.length>=3?same:fallback).map(x=>x.term_fixed_phrase)).slice(0,3);
  return {kind:'collocation',prompt:`Chọn collocation phù hợp nhất với nghĩa: “${c.meaning_vi}”`,answer:c.term_fixed_phrase,options:shuffled([c.term_fixed_phrase,...distract]),item:c,explain:`${c.term_fixed_phrase} · ${c.source_type==='Corpus confirmed'?`xác nhận trong corpus; ${c.years||''}`:'mở rộng học thuật, không tính là bằng chứng đề'}.`};
}

export function makeTopicQuestion(){
  const c=sample(data.core.filter(x=>x.type==='Word'&&x.cpa_subtopic));const correct=c.cpa_subtopic;const pool=unique(data.core.map(x=>x.cpa_subtopic)).filter(x=>x!==correct);return {kind:'word',prompt:`Trong hệ thống V2, “${c.entry}” được ưu tiên vào nhóm CPA nào?`,answer:correct,options:shuffled([correct,...shuffled(pool).slice(0,3)]),item:c,explain:`V2 classification: ${c.entry} → ${c.cpa_subtopic}; freq ${c.exam_freq}, ${c.years_count} năm.`};
}

export function makeClozeQuestion(){
  const pool=data.sentences.filter(s=>s.quality!=='low'&&s.source_fidelity==='Exact OCR'&&s.focus_term&&s.text&&s.focus_type==='word');
  for(let tries=0;tries<50;tries++){
    const ex=sample(pool); if(!ex)break; const answer=ex.focus_term;
    const re=new RegExp('\\b'+answer.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i'); if(!re.test(ex.text))continue;
    const display=ex.text.replace(re,'_____');
    const peer=data.sentences.filter(s=>s.quality!=='low'&&s.source_fidelity==='Exact OCR'&&s.focus_type==='word'&&s.topic===ex.topic&&s.focus_term&&norm(s.focus_term)!==norm(answer));
    const all=data.sentences.filter(s=>s.quality!=='low'&&s.source_fidelity==='Exact OCR'&&s.focus_type==='word'&&s.focus_term&&norm(s.focus_term)!==norm(answer));
    const distract=unique(shuffled(peer.length>=3?peer:all).map(s=>s.focus_term)).filter(w=>Math.abs(w.length-answer.length)<=6).slice(0,3);
    if(distract.length<3)continue;
    return {kind:'cloze',prompt:`Điền từ trọng tâm vào câu trích đề ${ex.year}: ${display}`,answer,options:shuffled([answer,...distract]),item:{item_key:`sentence:${ex.id}`,topic:ex.topic||'',source_status:'Exam corpus sentence'},explain:`${answer}${ex.focus_meaning_vi?` = ${ex.focus_meaning_vi}`:''}. Câu nguồn: “${ex.text}”`};
  }
  return makeTopicQuestion();
}

export function makeQuizQuestion(mode){if(mode==='family')return makeFamilyQuestion();if(mode==='collocation')return makeCollocationQuestion();if(mode==='cloze')return makeClozeQuestion();if(mode==='core')return makeTopicQuestion();return sample([makeFamilyQuestion,makeCollocationQuestion,makeTopicQuestion,makeClozeQuestion])();}

export async function startQuiz(mode='mixed'){
  finishLiveSession();setQuiz({mode,index:0,total:10,correct:0,started:Date.now(),current:null,answered:false});setQuizSessionId(startLocalSession(mode==='family'?'word_family':mode==='core'?'vocabulary':mode==='collocation'?'collocation':mode==='cloze'?'cloze':'review',{surface:'quiz'}));setLiveSessionId(quizSessionId);navigate('quiz',false);renderQuiz();
}

export function renderQuizLanding(){
  $('#content').innerHTML=`<div class="grid three"><div class="card"><h2>Core CPA</h2><p class="muted">Nhận diện nhóm nghiệp vụ từ nhãn V2.</p><button class="primary quiz-start" data-mode="core">Bắt đầu 10 câu</button></div><div class="card"><h2>Word Family</h2><p class="muted">Chọn dạng từ thuộc cùng family.</p><button class="primary quiz-start" data-mode="family">Bắt đầu 10 câu</button></div><div class="card"><h2>Collocation</h2><p class="muted">Luyện collocation bằng ngữ cảnh câu đề hoặc đối chiếu nghĩa; nguồn corpus/mở rộng được gắn nhãn rõ.</p><button class="primary quiz-start" data-mode="collocation">Bắt đầu 10 câu</button></div><div class="card"><h2>Điền từ câu corpus</h2><p class="muted">Quiz chỉ dùng các câu khớp trực tiếp OCR của đề và đã qua bộ lọc chất lượng; không dùng câu tự dựng.</p><button class="primary quiz-start" data-mode="cloze">Bắt đầu 10 câu</button></div></div><div class="notice" style="margin-top:14px">Quiz tự chấm này được sinh từ cấu trúc dữ liệu V2, không phải “đáp án chính thức” của đề thi gốc.</div>`;$$('.quiz-start').forEach(b=>b.onclick=()=>startQuiz(b.dataset.mode));
}

export function renderQuiz(){
  if(!quiz){renderQuizLanding();return;} if(quiz.index>=quiz.total){return finishQuiz();} if(!quiz.current)quiz.current=makeQuizQuestion(quiz.mode);
  const q=quiz.current;$('#content').innerHTML=`<div class="card quiz-box"><div class="section-head"><div><span class="pill">${esc(quiz.mode)}</span> <span class="muted small">Câu ${quiz.index+1}/${quiz.total}</span></div><strong>${quiz.correct} đúng</strong></div><div class="progressbar"><span style="width:${quiz.index/quiz.total*100}%"></span></div><div class="quiz-question">${esc(q.prompt)}</div><div class="options">${q.options.map(o=>`<button class="option" data-option="${esc(o)}">${esc(o)}</button>`).join('')}</div><div id="quizExplain" class="source-box hidden"></div><button id="nextQuiz" class="primary hidden" style="margin-top:14px">Câu tiếp theo →</button></div>`;
  $$('.option').forEach(b=>b.onclick=async()=>{if(quiz.answered)return;quiz.answered=true;const ok=norm(b.dataset.option)===norm(q.answer);if(ok){b.classList.add('correct');quiz.correct++;}else{b.classList.add('wrong');$$('.option').find(x=>norm(x.dataset.option)===norm(q.answer))?.classList.add('correct');}const e=$('#quizExplain');e.textContent=q.explain;e.classList.remove('hidden');$('#nextQuiz').classList.remove('hidden');await recordReview(q.kind==='cloze'?'question':q.kind,q.item,ok?4:1,8);});
  $('#nextQuiz').onclick=()=>{quiz.index++;quiz.current=null;quiz.answered=false;renderQuiz();};
}

export async function finishQuiz(){const r={total:quiz.total,correct:quiz.correct,seconds:Math.round((Date.now()-quiz.started)/1000)};finishLocalSession(quizSessionId,{item_count:r.total,correct_count:r.correct,wrong_count:r.total-r.correct,score:r.correct/r.total*100,duration_seconds:r.seconds});setLiveSessionId(null);if(currentUser)syncSessions();const pct=Math.round(r.correct/r.total*100);setQuiz(null);setQuizSessionId(null);$('#content').innerHTML=`<div class="card quiz-box" style="text-align:center"><div class="study-term">${pct}%</div><h2>${r.correct}/${r.total} câu đúng</h2><p class="muted">Thời gian: ${Math.round(r.seconds/60)} phút</p><div class="button-row" style="justify-content:center"><button class="primary" id="againQuiz">Làm lại</button><button class="secondary" id="goWeak">Ôn mục yếu</button></div></div>`;$('#againQuiz').onclick=()=>renderQuizLanding();$('#goWeak').onclick=()=>navigate('weak');}

export function renderExams(){
  const years=data.exams.map(x=>x.year).sort((a,b)=>b-a);const current=years[0];
  $('#content').innerHTML=`<div class="toolbar"><label>Năm<select id="examYear">${years.map(y=>`<option>${y}</option>`).join('')}</select></label><label>Tìm trong đề<input class="search" id="examSearch" placeholder="ví dụ: audit, financial…"></label><button class="secondary" id="resetTimer">Reset 90:00</button><div class="timer" id="timer">90:00</div></div><div class="notice">Đề hiển thị từ OCR scan. Corpus hiện không cung cấp đáp án chính thức đầy đủ, vì vậy app lưu bài làm và điểm tự chấm; không tự gán đúng/sai cho đề gốc.</div><div id="examArea" style="margin-top:14px"></div>`;
  $('#examYear').value=current;$('#examYear').onchange=()=>drawExam(Number($('#examYear').value));$('#resetTimer').onclick=()=>startExamTimer(90*60);
  $('#examSearch').oninput=()=>highlightExam($('#examSearch').value);
  drawExam(current);startExamTimer(90*60);
}

export function highlightExam(q){
  const box=$('.exam-paper'); if(!box||!examRawText)return;
  if(!q||q.trim().length<2){box.innerHTML=esc(examRawText);return;}
  const re=new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');
  box.innerHTML=esc(examRawText).replace(re,m=>`<mark>${m}</mark>`);
}

export function startExamTimer(sec){clearInterval(examTimer);setExamRemaining(sec);const tick=()=>{const m=Math.floor(examRemaining/60),s=examRemaining%60;const el=$('#timer');if(el)el.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;if(examRemaining<=0){clearInterval(examTimer);toast('Hết 90 phút.');}setExamRemaining(examRemaining-1);};tick();setExamTimer(setInterval(tick,1000));}

export function drawExam(year){const e=data.exams.find(x=>x.year===year),draft=JSON.parse(localStorage.getItem(EXAM_DRAFT_PREFIX+year)||'{}');setExamRawText(e.text);$('#examArea').innerHTML=`<div class="exam-layout"><div class="exam-paper">${esc(e.text)}</div><div class="card exam-pad"><h3>Bài làm / ghi chú</h3><textarea id="examAnswers" placeholder="Ghi đáp án theo số câu, ví dụ: 1. consume\n2. compatriot…">${esc(draft.answers||'')}</textarea><div class="grid two" style="margin-top:10px"><label class="field">Điểm tự chấm<input id="examScore" type="number" min="0" step="0.25" value="${draft.score??''}"></label><label class="field">Điểm tối đa<input id="examMax" type="number" min="1" step="0.25" value="${draft.max_score??10}"></label></div><div class="button-row" style="margin-top:10px"><button class="secondary" id="saveExamDraft">Lưu nháp</button><button class="primary" id="submitExam">Kết thúc & lưu lịch sử</button></div><div class="source-box">Nguồn: OCR đề ${year}; thời gian gốc: 90 phút.</div></div></div>`;
  const save=()=>{localStorage.setItem(EXAM_DRAFT_PREFIX+year,JSON.stringify({answers:$('#examAnswers').value,score:$('#examScore').value,max_score:$('#examMax').value,updated_at:nowIso()}));toast('Đã lưu nháp trên thiết bị.');};$('#saveExamDraft').onclick=save;$('#examAnswers').oninput=()=>localStorage.setItem(EXAM_DRAFT_PREFIX+year,JSON.stringify({answers:$('#examAnswers').value,score:$('#examScore').value,max_score:$('#examMax').value,updated_at:nowIso()}));$('#submitExam').onclick=()=>submitExam(year);
  if($('#examSearch')&&$('#examSearch').value) highlightExam($('#examSearch').value);
}

export async function submitExam(year){
  const score=Number($('#examScore').value||0),max=Number($('#examMax').value||10),answers=$('#examAnswers').value,duration=Math.max(0,90*60-Math.max(0,examRemaining));const pct=max?score/max*100:0;const day=dailyLocal();day.exam_attempts=(day.exam_attempts||0)+1;day.best_exam_score=day.best_exam_score==null?pct:Math.max(Number(day.best_exam_score),pct);day.study_seconds+=duration;day.updated_at=nowIso();const examSession=appendCompletedSession('mock_exam',{total:1,correct:pct>=60?1:0,wrong:pct>=60?0:1,seconds:duration,score:pct,started_at:new Date(Date.now()-duration*1000).toISOString()},{exam_year:year,self_scored:true});saveState();
  queueEvent({type:'exam_submit',itemKey:`exam:${year}`,itemType:'question',correct:pct>=60,seconds:duration,sessionId:examSession?.id||null,metadata:{exam_year:year,score:pct,self_scored:true}});localStorage.setItem(EXAM_DRAFT_PREFIX+year,JSON.stringify({answers,score,max_score:max,updated_at:nowIso()}));
  if(currentUser&&db){const {error}=await db.from('exam_attempts').insert({user_id:currentUser.id,exam_key:`cpa-english-${year}-ocr`,exam_year:year,submitted_at:nowIso(),score,max_score:max,duration_seconds:duration,answers:{free_text:answers},metadata:{scoring:'self-scored; no official answer key in source corpus'}});if(error)toast('Lưu cloud lỗi: '+error.message);else await cloudUpsertDaily(day);}toast(`Đã lưu bài ${year}: ${score}/${max} (${Math.round(pct)}%).`);navigate('dashboard');
}
