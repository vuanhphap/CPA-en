/* views_study.js — Màn hình học: SRS, word family, collocation, cụm & câu, từ điển.
   Tệp này do qa/split_modules.py sinh ra từ app.js. */
import { $, $$, esc, fmtDate, norm, shuffled, speak, speakSlow, unique } from './util.js';
import { data, state } from './runtime.js';
import { localProgress, saveState, setLocalProgress } from './store.js';
import { buildStudyQueue } from './srs.js';
import { ensureLiveSession, sessionModeForStudy } from './sessions.js';
import {
  collocationRow,
  exampleFor,
  gloss,
  ipaOf,
  meaningOf,
  relatedCollocations
} from './content.js';
import { recordReview } from './sync.js';
import { startQuiz } from './views_practice.js';
import { navigate } from './main.js';

export let studyQueue = [];

export let studyIndex = 0;

export function studyDetails(item,key){
  if(item._type==='question')return [['Câu corpus',item.text||'—'],['Từ/cụm trọng tâm',item.focus_term||'—'],['Nghĩa',item.focus_meaning_vi||meaningOf(item.focus_term)||'—'],['Năm',item.year||'—'],['Nguồn',item.source_fidelity||'Exam corpus sentence']];
  const g=gloss(key), ip=ipaOf(key), phrase=collocationRow(key);
  const glossRows=[];
  if(ip)glossRows.push(['IPA (en-US)',`/${ip}/`]);
  if(phrase?.meaning_vi)glossRows.push(['Nghĩa tiếng Việt',phrase.meaning_vi]);
  else if(g)glossRows.push(['Nghĩa tiếng Việt',`${g[1]}${g[0]?` (${g[0]})`:''}`]);
  if(g?.[2])glossRows.push(['Ví dụ/ghi chú',g[2]]);
  const ex=exampleFor(key);
  const exRows=ex?[['Câu từ corpus đề',`"${ex.text}" (${ex.year}; ${ex.source_fidelity||'corpus'})`]]:[];
  if(item._type==='family')return [...glossRows,['Topic',item.topic],['Đã thấy trong đề',item.forms_seen_in_exam_count],['Mở rộng nên học',item.recommended_new_forms],['Năm prompt',item.prompt_years],['Ngữ cảnh đề',item.example_prompt_context],...exRows];
  if(item._type==='collocation')return [...glossRows,['Topic',item.topic],['Subtopic',item.subtopic],['Nguồn',item.source_type||item.evidence_basis],['Tần suất đề',item.exam_freq],['Năm xuất hiện',item.years||'—'],['Ngữ cảnh',item.example_context||'—'],...exRows];
  const rel=relatedCollocations(key,5); const relRow=rel.length?[['Cụm nên học',rel.map(x=>x.term_fixed_phrase).join(' · ')]]:[];
  return [...glossRows,['CPA/Topic',item.cpa_subtopic||item.topic],['Word family',item.word_family||item.lemma||'—'],...relRow,['Tần suất đề',item.exam_freq],['Số năm',item.years_count],['Năm xuất hiện',item.years],['Mức ưu tiên',item.tier||item.v2_tier],['Nguồn',item.source_status||item.source_basis],...exRows];
}

export function renderStudy(){
  const topics=unique(data.core.map(x=>x.cpa_subtopic).concat(data.topic.map(x=>x.topic))).sort();
  $('#content').innerHTML=`<div class="toolbar">
    <label>Nhóm học<select id="studyMode"><option value="smart">✨ Smart Study</option><option value="weak">⚠️ Weak Review</option><option value="core">Core CPA</option><option value="all">Toàn bộ Topic Vocab</option><option value="families">Word Family</option><option value="collocations">Collocation</option></select></label>
    <label>Chủ đề<select id="studyTopic"><option value="">Tất cả</option>${topics.map(t=>`<option>${esc(t)}</option>`).join('')}</select></label>
    <label>Từ mới/ngày<input id="newPerDay" type="number" min="0" max="50" value="${state.settings.newPerDay??15}"></label>
    <button class="secondary" id="shuffleStudy">Xáo trộn</button>
  </div><div id="studyArea"></div>`;
  $('#studyMode').value=state.settings.studyMode||'core';$('#studyTopic').value=state.settings.topic||'';
  const reload=()=>{state.settings.studyMode=$('#studyMode').value;state.settings.topic=$('#studyTopic').value;state.settings.newPerDay=Number($('#newPerDay').value||0);saveState();ensureLiveSession(sessionModeForStudy(state.settings.studyMode),{study_mode:state.settings.studyMode});studyQueue=buildStudyQueue(state.settings.studyMode,state.settings.topic);studyIndex=0;renderStudyCard();};
  $('#studyMode').onchange=reload;$('#studyTopic').onchange=reload;$('#newPerDay').onchange=reload;$('#shuffleStudy').onclick=()=>{studyQueue=shuffled(studyQueue);studyIndex=0;renderStudyCard();};reload();
}

export function renderStudyCard(){
  const area=$('#studyArea'); if(!studyQueue.length){area.innerHTML='<div class="card empty">Không còn thẻ đến hạn hoặc suất từ mới hôm nay đã dùng hết. Các thẻ tương lai được giữ đúng lịch SRS.</div>';return;}
  const item=studyQueue[studyIndex%studyQueue.length], type=item._type, key=item._key, p=localProgress(type,key), details=studyDetails(item,key),display=item._display||key,speakText=item._speak||display,displayIpa=item.focus_ipa||ipaOf(display);
  const note=p?.metadata?.note_vi||'';
  area.innerHTML=`<div class="card study-card">
    <div><div class="stat-line"><span>${studyIndex+1}/${studyQueue.length}</span><span class="pill">${esc(type)}</span><span>${p?.status||'new'} · ${p?.repetitions||0} reps</span><span>Due: ${p?.due_at?fmtDate(p.due_at):'mới'}</span></div>
    <div class="study-term">${esc(display)}</div>${displayIpa?`<div class="ipa">/${esc(displayIpa)}/</div>`:''}<div class="study-sub">${esc(item.cpa_subtopic||item.topic||'')}</div>
    <div class="button-row" style="justify-content:center;margin-top:12px"><button class="secondary" id="speakBtn">${type==='question'?'🔊 Câu':'🔊 Từ/cụm'}</button><button class="secondary" id="slowBtn">🐢 Chậm</button>${exampleFor(key)?'<button class="secondary" id="speakSentenceBtn">🔊 Câu</button>':''}<button class="secondary" id="revealBtn">Hiện chi tiết</button></div>
    <div id="studyDetails" class="details hidden">${details.map(([a,b])=>`<div class="detail-row"><span>${esc(a)}</span><div>${esc(b||'—')}</div></div>`).join('')}
      <label class="field">Ghi chú / nghĩa Việt của bạn<textarea class="note-input" id="noteVi" placeholder="Tự ghi nghĩa, ví dụ, mẹo nhớ…">${esc(note)}</textarea></label>
    </div></div>
    <div><div class="srs-actions"><button data-q="1">Again<br><small>1 ngày</small></button><button data-q="3">Hard</button><button data-q="4">Good</button><button data-q="5">Easy</button></div></div>
  </div>`;
  $('#speakBtn').onclick=()=>speak(speakText); $('#slowBtn').onclick=()=>speakSlow(speakText); const ex=exampleFor(key); if($('#speakSentenceBtn')&&ex)$('#speakSentenceBtn').onclick=()=>speak(ex.text,.82); $('#revealBtn').onclick=()=>$('#studyDetails').classList.toggle('hidden');
  $$('.srs-actions button').forEach(btn=>btn.onclick=async()=>{
    const n=$('#noteVi'); if(n){const prev=localProgress(type,key)||{};prev.metadata={...(prev.metadata||{}),note_vi:n.value};setLocalProgress(type,key,prev);}
    await recordReview(type,item,Number(btn.dataset.q),10); studyIndex++; renderStudyCard();
  });
}

export function renderFamilies(){
  const topics=unique(data.families.map(x=>x.topic)).sort();
  $('#content').innerHTML=`<div class="toolbar"><label>Tìm<input class="search" id="famSearch" placeholder="finance, manage, produce…"></label><label>Topic<select id="famTopic"><option value="">Tất cả</option>${topics.map(t=>`<option>${esc(t)}</option>`).join('')}</select></label><button class="primary" id="famQuiz">Quiz Word Family</button></div><div id="famTable"></div>`;
  const draw=()=>{const q=norm($('#famSearch').value),t=$('#famTopic').value;const rows=data.families.filter(x=>(!q||norm(JSON.stringify(x)).includes(q))&&(!t||x.topic===t)).map(x=>`<tr><td><b>${esc(x.root)}</b><div class="ipa small">${ipaOf(x.root)?`/${esc(ipaOf(x.root))}/`:''}</div><button class="chip-btn secondary tiny speak-fam" data-term="${esc(x.root)}">🔊</button><br><span class="pill">${esc(x.tier)}</span></td><td>${esc(x.topic)}</td><td>${esc(x.forms_seen_in_exam_count||'')}</td><td>${esc(x.recommended_new_forms||'—')}</td><td>${esc(x.prompt_years)}</td><td>${esc(x.example_prompt_context||'')}</td></tr>`).join('');$('#famTable').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Root + IPA</th><th>Topic</th><th>Forms đã thấy</th><th>Forms mở rộng</th><th>Năm prompt</th><th>Ngữ cảnh đề</th></tr></thead><tbody>${rows}</tbody></table></div><div class="footnote">“Forms mở rộng” là phần học bổ sung được workbook V2 gắn nhãn, không phải khẳng định đã xuất hiện trong đề.</div>`;$$('.speak-fam').forEach(b=>b.onclick=()=>speak(b.dataset.term));};
  $('#famSearch').oninput=draw;$('#famTopic').onchange=draw;$('#famQuiz').onclick=()=>startQuiz('family');draw();
}

export function renderCollocations(){
  const topics=unique(data.collocations.map(x=>x.topic)).sort();
  $('#content').innerHTML=`<div class="toolbar"><label>Tìm<input class="search" id="colSearch" placeholder="financial statements, audit report…"></label><label>Topic<select id="colTopic"><option value="">Tất cả</option>${topics.map(t=>`<option>${esc(t)}</option>`).join('')}</select></label><label>Nguồn<select id="colSource"><option value="">Tất cả</option><option>Corpus confirmed</option><option>Learning expansion</option></select></label><button class="primary" id="colQuiz">Quiz Collocation</button><button class="secondary" id="goChunks">Học theo cụm/câu</button></div><div id="colCount" class="muted small"></div><div id="colTable"></div>`;
  const draw=()=>{const q=norm($('#colSearch').value),t=$('#colTopic').value,src=$('#colSource').value;const list=data.collocations.filter(x=>(!q||norm(JSON.stringify(x)).includes(q))&&(!t||x.topic===t)&&(!src||x.source_type===src));$('#colCount').textContent=`${list.length} cụm · ${data.collocations.filter(x=>x.source_type==='Corpus confirmed').length} xác nhận trong corpus · ${data.collocations.filter(x=>x.source_type==='Learning expansion').length} cụm mở rộng`;const rows=list.map(x=>`<tr><td><b>${esc(x.term_fixed_phrase)}</b><div class="ipa small">${x.ipa?`/${esc(x.ipa)}/`:''}</div><div class="button-row"><button class="chip-btn secondary tiny speak-col" data-term="${esc(x.term_fixed_phrase)}">🔊</button><button class="chip-btn secondary tiny slow-col" data-term="${esc(x.term_fixed_phrase)}">🐢</button></div></td><td>${esc(x.meaning_vi||'—')}</td><td>${esc(x.topic)}<br><span class="pill ${x.source_type==='Corpus confirmed'?'high':'warn'}">${esc(x.source_type||'')}</span></td><td>${esc(x.subtopic)}</td><td>${x.exam_freq||0}</td><td>${esc(x.years||'—')}</td><td>${esc(x.example_context||'—')}${x.academic_note?`<div class="academic-note small">🎓 ${esc(x.academic_note)}</div>`:''}</td></tr>`).join('');$('#colTable').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Cụm + IPA</th><th>Nghĩa</th><th>Topic / nguồn</th><th>Subtopic</th><th>Freq</th><th>Năm</th><th>Context</th></tr></thead><tbody>${rows}</tbody></table></div><div class="footnote">Learning expansion = collocation chuẩn nên học thêm; không được tính như bằng chứng đã xuất hiện trực tiếp trong đề.</div>`; $$('.speak-col').forEach(b=>b.onclick=()=>speak(b.dataset.term));$$('.slow-col').forEach(b=>b.onclick=()=>speakSlow(b.dataset.term));};
  $('#colSearch').oninput=draw;$('#colTopic').onchange=draw;$('#colSource').onchange=draw;$('#colQuiz').onclick=()=>startQuiz('collocation');$('#goChunks').onclick=()=>navigate('chunks');draw();
}

export let chunkMode='phrase',chunkIndex=0,chunkPool=[];

export function highlightFocus(text,focus){if(!focus)return esc(text);const safe=esc(text),needle=esc(focus);return safe.replace(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),m=>`<mark>${m}</mark>`);}

export function buildChunkPool(mode){
  if(mode==='phrase')return data.collocations.slice().sort((a,b)=>(b.source_type==='Corpus confirmed')-(a.source_type==='Corpus confirmed')||Number(b.v2_priority||0)-Number(a.v2_priority||0));
  return data.sentences.filter(s=>s.quality!=='low'&&s.focus_term&&s.text&&s.text.length<360);
}

export function renderChunks(){
  ensureLiveSession(chunkMode==='phrase'?'collocation':'cloze',{surface:'chunks'});
  $('#content').innerHTML=`<div class="toolbar"><label>Chế độ<select id="chunkMode"><option value="phrase">Học theo cụm</option><option value="sentence">Học theo câu</option></select></label><label>Lọc<input class="search" id="chunkSearch" placeholder="audit, financial, tax…"></label><button class="secondary" id="chunkShuffle">Xáo trộn</button></div><div id="chunkArea"></div>`;
  $('#chunkMode').value=chunkMode; const reload=()=>{chunkMode=$('#chunkMode').value;ensureLiveSession(chunkMode==='phrase'?'collocation':'cloze',{surface:'chunks'});const q=norm($('#chunkSearch').value);chunkPool=buildChunkPool(chunkMode).filter(x=>!q||norm(JSON.stringify(x)).includes(q));chunkIndex=0;renderChunkCard();};$('#chunkMode').onchange=reload;$('#chunkSearch').oninput=reload;$('#chunkShuffle').onclick=()=>{chunkPool=shuffled(chunkPool);chunkIndex=0;renderChunkCard();};reload();
}

export function renderChunkCard(){
  const a=$('#chunkArea');if(!chunkPool.length){a.innerHTML='<div class="card empty">Không có mục phù hợp.</div>';return;}const x=chunkPool[chunkIndex%chunkPool.length];
  if(chunkMode==='phrase'){
    const ex=exampleFor(x.term_fixed_phrase);a.innerHTML=`<div class="card chunk-card"><div class="stat-line"><span>${chunkIndex+1}/${chunkPool.length}</span><span class="pill ${x.source_type==='Corpus confirmed'?'high':'warn'}">${esc(x.source_type)}</span><span>${esc(x.topic)}</span></div><div class="study-term">${esc(x.term_fixed_phrase)}</div>${x.ipa?`<div class="ipa">/${esc(x.ipa)}/</div>`:''}<h3>${esc(x.meaning_vi||'')}</h3>${x.academic_note?`<div class="academic-note">🎓 ${esc(x.academic_note)}</div>`:''}<div class="button-row center"><button class="secondary" id="chunkSpeak">🔊 Nghe cụm</button><button class="secondary" id="chunkSlow">🐢 Nghe chậm</button>${ex?'<button class="secondary" id="chunkSentence">🔊 Nghe câu</button>':''}</div>${ex?`<div class="context-card"><div class="muted small">Câu trong đề ${ex.year}</div><div class="sentence-text">${highlightFocus(ex.text,x.term_fixed_phrase)}</div></div>`:`<div class="source-box">Cụm mở rộng để học; chưa có câu exact-match trong ngân hàng câu đã lọc.</div>`}<div class="srs-actions"><button data-q="1">Again</button><button data-q="3">Hard</button><button data-q="4">Good</button><button data-q="5">Easy</button></div><div class="button-row center"><button class="secondary" id="chunkPrev">←</button><button class="secondary" id="chunkNext">→</button></div></div>`;
    $('#chunkSpeak').onclick=()=>speak(x.term_fixed_phrase);$('#chunkSlow').onclick=()=>speakSlow(x.term_fixed_phrase);if($('#chunkSentence')&&ex)$('#chunkSentence').onclick=()=>speak(ex.text,.80);$$('#chunkArea .srs-actions button').forEach(b=>b.onclick=async()=>{await recordReview('collocation',x,Number(b.dataset.q),15);chunkIndex++;renderChunkCard();});
  }else{
    const focus=x.focus_term,cloze=x.text.replace(new RegExp(focus.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),'_____');a.innerHTML=`<div class="card chunk-card"><div class="stat-line"><span>${chunkIndex+1}/${chunkPool.length}</span><span>${x.year}</span><span>${esc(x.topic||'')}</span><span class="pill">${esc(x.source_fidelity||'Corpus')}</span></div><div class="context-card"><div class="muted small">Nghe trước, sau đó đọc và nhớ theo ngữ cảnh</div><div class="sentence-text" id="sentenceFull">${highlightFocus(x.text,focus)}</div><div class="sentence-text hidden" id="sentenceCloze">${esc(cloze)}</div></div><div class="focus-box"><b>${esc(focus)}</b>${x.focus_ipa?` <span class="ipa">/${esc(x.focus_ipa)}/</span>`:''}<div>${esc(x.focus_meaning_vi||'')}</div></div><div class="button-row center"><button class="secondary" id="sentSpeak">🔊 Nghe câu</button><button class="secondary" id="sentSlow">🐢 Nghe chậm</button><button class="secondary" id="focusSpeak">🔊 Từ/cụm</button><button class="secondary" id="clozeBtn">Cloze</button></div><div class="srs-actions"><button data-q="1">Again</button><button data-q="3">Hard</button><button data-q="4">Good</button><button data-q="5">Easy</button></div><div class="button-row center"><button class="secondary" id="chunkPrev">←</button><button class="secondary" id="chunkNext">→</button></div></div>`;
    $('#sentSpeak').onclick=()=>speak(x.text,.82);$('#sentSlow').onclick=()=>speak(x.text,.68);$('#focusSpeak').onclick=()=>speak(focus);$('#clozeBtn').onclick=()=>{$('#sentenceFull').classList.toggle('hidden');$('#sentenceCloze').classList.toggle('hidden');};$$('#chunkArea .srs-actions button').forEach(b=>b.onclick=async()=>{await recordReview('question',{item_key:`sentence:${x.id}`,topic:x.topic||'',source_status:'Exam corpus sentence'},Number(b.dataset.q),20);chunkIndex++;renderChunkCard();});
  }
  $('#chunkPrev').onclick=()=>{chunkIndex=(chunkIndex-1+chunkPool.length)%chunkPool.length;renderChunkCard();};$('#chunkNext').onclick=()=>{chunkIndex=(chunkIndex+1)%chunkPool.length;renderChunkCard();};
}

export let dictSort={key:'v2_priority',dir:-1};

export function renderDictionary(){
  const topics=unique(data.topic.map(x=>x.topic)).sort();
  const years=unique(data.topic.flatMap(x=>String(x.years||'').split(',').map(y=>y.trim()))).filter(Boolean).sort();
  $('#content').innerHTML=`<div class="toolbar">
    <label>Tìm<input class="search" id="dictSearch" placeholder="từ tiếng Anh hoặc nghĩa tiếng Việt…"></label>
    <label>Chủ đề<select id="dictTopic"><option value="">Tất cả</option>${topics.map(t=>`<option>${esc(t)}</option>`).join('')}</select></label>
    <label>Ưu tiên<select id="dictTier"><option value="">Tất cả</option><option>A - Rất cao</option><option>B - Cao</option><option>C - Trung bình</option><option>D - Thấp</option></select></label>
    <label>Có trong đề năm<select id="dictYear"><option value="">Tất cả</option>${years.map(y=>`<option>${y}</option>`).join('')}</select></label>
    <label class="checkbox"><input type="checkbox" id="dictCore"> chỉ Core CPA</label>
  </div><div id="dictCount" class="muted small" style="margin-bottom:8px"></div><div id="dictTable"></div>`;
  const coreSet=new Set(data.core.filter(x=>x.type==='Word').map(x=>norm(x.entry)));
  const draw=()=>{
    const q=norm($('#dictSearch').value), t=$('#dictTopic').value, tier=$('#dictTier').value, yr=$('#dictYear').value, onlyCore=$('#dictCore').checked;
    let rows=data.topic;
    if(t) rows=rows.filter(x=>x.topic===t);
    if(tier) rows=rows.filter(x=>x.v2_tier===tier);
    if(yr) rows=rows.filter(x=>String(x.years||'').includes(yr));
    if(onlyCore) rows=rows.filter(x=>coreSet.has(norm(x.word)));
    if(q) rows=rows.filter(x=>{const g=gloss(x.word);return norm(x.word).includes(q)||norm(x.word_family).includes(q)||(g&&norm(g[1]).includes(q));});
    rows=rows.slice().sort((a,b)=>{const k=dictSort.key;const av=a[k],bv=b[k];const c=typeof av==='number'?av-bv:String(av||'').localeCompare(String(bv||''));return c*dictSort.dir;});
    $('#dictCount').textContent=`${rows.length.toLocaleString('vi-VN')} từ`;
    const shown=rows.slice(0,500);
    $('#dictTable').innerHTML=`<div class="table-wrap"><table><thead><tr>
        <th data-k="word">Từ + IPA</th><th data-k="word_family">Họ từ</th><th data-k="topic">Chủ đề</th>
        <th data-k="exam_freq">Tần suất</th><th data-k="years_count">Số năm</th><th data-k="v2_priority">Ưu tiên</th><th>Nghĩa</th></tr></thead>
        <tbody>${shown.map(x=>{const g=gloss(x.word),ip=ipaOf(x.word);return `<tr><td><b>${esc(x.word)}</b>${coreSet.has(norm(x.word))?' <span class="pill high">CPA</span>':''}<div class="ipa small">${ip?`/${esc(ip)}/`:''}</div><button class="chip-btn secondary tiny speak-dict" data-term="${esc(x.word)}">🔊</button></td><td>${esc(x.word_family)}</td><td class="small">${esc(x.topic)}</td><td>${x.exam_freq}</td><td>${x.years_count}</td><td><span class="pill">${esc(x.v2_tier)}</span></td><td class="small">${g?esc(g[1]):'<span class="muted">—</span>'}</td></tr>`;}).join('')}</tbody></table></div>
        ${rows.length>500?`<div class="footnote">… còn ${(rows.length-500).toLocaleString('vi-VN')} từ nữa, lọc hẹp lại hoặc tìm kiếm để xem.</div>`:''}`;
    $$('#dictTable th[data-k]').forEach(th=>th.onclick=()=>{const k=th.dataset.k;dictSort=dictSort.key===k?{key:k,dir:-dictSort.dir}:{key:k,dir:-1};draw();}); $$('.speak-dict').forEach(b=>b.onclick=()=>speak(b.dataset.term));
  };
  $('#dictSearch').oninput=draw;$('#dictTopic').onchange=draw;$('#dictTier').onchange=draw;$('#dictYear').onchange=draw;$('#dictCore').onchange=draw;
  draw();
}
