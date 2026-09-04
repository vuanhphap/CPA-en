(() => {
  'use strict';

  const CFG = window.CPA_CONFIG || {};
  const LEGACY_LS_KEY = 'cpa_english_trainer_state_v1';
  const LS_KEY_BASE = 'cpa_english_trainer_state_v2';
  const EXAM_DRAFT_PREFIX = 'cpa_exam_draft_';
  const DAY = 86400000;
  const titles = {
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

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const esc = (v='') => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const nowIso = () => new Date().toISOString();
  const dateKey = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const shuffled = arr => {const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const sample = arr => arr[Math.floor(Math.random()*arr.length)];
  const fmtMin = sec => `${Math.round((sec||0)/60)} phút`;
  const norm = s => String(s||'').trim().toLowerCase();
  const itemId = (type,key) => `${type}:${norm(key)}`;
  const unique = arr => [...new Set(arr.filter(Boolean))];
  const fmtDate = iso => iso ? new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(iso)) : '—';

  let db = null;
  let currentUser = null;
  let profile = null;
  let activeView = 'dashboard';
  let data = {core:[],topic:[],families:[],collocations:[],general:[],topics:[],exams:[],glosses:{},ipa:{},sentences:[],wf:[],tr:[],tle:[],tlv:[]};
  let stateScope = 'guest';
  let state = loadStateForScope(stateScope);
  let liveSessionId = null;
  let studyQueue = [];
  let studyIndex = 0;
  let quiz = null;
  let quizSessionId = null;
  let examTimer = null;
  let examRemaining = 90*60;
  let examRawText = '';

  function defaultState(){
    return {
      version:3,
      ownerId:null,
      progress:{},
      daily:{},
      sessions:{},
      eventQueue:[],
      settings:{
        studyMode:'core',topic:'',newPerDay:15,speechRate:.88,
        analyticsDays:30,dailyMinutesGoal:30,dailyReviewsGoal:30,
        targetExamDate:'',guestName:''
      },
      settingsUpdatedAt:null,lastSync:null,createdAt:nowIso()
    };
  }
  function mergeState(raw){
    const d=defaultState(),r=raw||{},sessions=r.sessions||{};
    for(const x of Object.values(sessions)){if(x&&!x.ended_at&&x.started_at){x.ended_at=x.updated_at||x.started_at;const total=Number(x.item_count||0);if(x.score==null&&total)x.score=Number(x.correct_count||0)/total*100;x.synced=false;}}
    return {...d,...r,version:3,progress:r.progress||{},daily:r.daily||{},sessions,eventQueue:Array.isArray(r.eventQueue)?r.eventQueue:[],settings:{...d.settings,...(r.settings||{})}};
  }
  function stateStorageKey(scope=stateScope){
    if(scope==='guest') return `${LS_KEY_BASE}:guest`;
    return `${LS_KEY_BASE}:${scope.replace(':','_')}`;
  }
  function loadStateForScope(scope='guest'){
    try{
      const direct=localStorage.getItem(stateStorageKey(scope));
      if(direct) return mergeState(JSON.parse(direct));
      if(scope==='guest'){
        const legacy=localStorage.getItem(LEGACY_LS_KEY);
        if(legacy){
          const migrated=mergeState(JSON.parse(legacy));
          localStorage.setItem(stateStorageKey(scope),JSON.stringify(migrated));
          return migrated;
        }
      }
      return defaultState();
    }catch{return defaultState();}
  }
  function saveState(){localStorage.setItem(stateStorageKey(),JSON.stringify(state));}
  function switchStateScope(userId=null){
    try{saveState();}catch{}
    const next=userId?`user:${userId}`:'guest';
    if(next===stateScope){state.ownerId=userId||null;return;}
    const key=stateStorageKey(next);
    let loaded=null;
    try{const raw=localStorage.getItem(key);if(raw)loaded=mergeState(JSON.parse(raw));}catch{}
    // V7: KHÔNG tự động chiếm tiến trình của hồ sơ khách nữa. Máy tính dùng chung
    // (thư viện, máy cơ quan) sẽ khiến người đăng nhập đầu tiên nuốt luôn dữ liệu của
    // người học trước đó. Tài khoản mới bắt đầu từ hồ sơ trắng; maybeOfferGuestMerge()
    // sẽ hỏi rõ ràng có muốn gộp dữ liệu khách hay không.
    if(!loaded) loaded=defaultState();
    stateScope=next;state=loaded;state.ownerId=userId||null;saveState();
    liveSessionId=null;
  }
  function toast(msg){ const el=$('#toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),2600); }
  function setSyncBadge(kind,text){ const el=$('#syncBadge'); el.className=`sync-badge ${kind}`; el.textContent=text; }
  function setTitle(view){ $('#viewTitle').textContent=titles[view]?.[0]||view; $('#viewSubtitle').textContent=titles[view]?.[1]||''; }
  function speak(text,rate=null){
    if(!('speechSynthesis' in window)) return toast('Trình duyệt không hỗ trợ đọc tiếng Anh.');
    speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang='en-US';
    u.rate=Number(rate ?? state.settings.speechRate ?? .88); u.pitch=1;
    const voices=speechSynthesis.getVoices?.()||[];
    u.voice=voices.find(v=>/^en-US$/i.test(v.lang)&&/Samantha|Ava|Google US English|Microsoft/i.test(v.name)) || voices.find(v=>/^en-US/i.test(v.lang)) || voices.find(v=>/^en/i.test(v.lang)) || null;
    speechSynthesis.speak(u);
  }
  function speakSlow(text){speak(text,.68);}
  function due(p){return !p?.due_at || new Date(p.due_at) <= new Date();}
  function statusLabel(p){return p?.status || 'new';}

  const uuid=()=>globalThis.crypto?.randomUUID?.() || `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const modeLabel=m=>({vocabulary:'SRS từ vựng',word_family:'Word Family',collocation:'Collocation',cloze:'Cloze / câu',mock_exam:'Luyện đề',review:'Ôn tập',word_formation:'Word Formation',sentence_transform:'Viết lại câu',translation:'Dịch',smart_review:'Smart Study',weak_review:'Weak Review'}[m]||m||'Phiên học');
  const sessionModeForStudy=m=>m==='families'?'word_family':m==='collocations'?'collocation':m==='weak'?'weak_review':m==='smart'?'smart_review':'vocabulary';
  function startLocalSession(mode,metadata={}){
    const id=uuid(); const t=nowIso();
    state.sessions[id]={id,mode,started_at:t,ended_at:null,item_count:0,correct_count:0,wrong_count:0,score:null,duration_seconds:0,metadata,updated_at:t,synced:false};
    saveState();return id;
  }
  function ensureLiveSession(mode,metadata={}){
    const cur=liveSessionId&&state.sessions[liveSessionId];
    if(cur&&!cur.ended_at&&cur.mode===mode)return liveSessionId;
    finishLiveSession(); liveSessionId=startLocalSession(mode,metadata); return liveSessionId;
  }
  function touchSession(id,correct=null,seconds=0){
    const x=id&&state.sessions[id];if(!x)return;
    x.item_count=Number(x.item_count||0)+1;
    if(correct===true)x.correct_count=Number(x.correct_count||0)+1;
    if(correct===false)x.wrong_count=Number(x.wrong_count||0)+1;
    x.duration_seconds=Number(x.duration_seconds||0)+Number(seconds||0);
    x.updated_at=nowIso();x.synced=false;saveState();
  }
  function finishLocalSession(id,override={}){
    const x=id&&state.sessions[id];if(!x)return null;
    if(!x.ended_at)x.ended_at=nowIso();
    Object.assign(x,override);
    const total=Number(x.item_count||0),correct=Number(x.correct_count||0);
    if(total===0&&!override.forceKeep){delete state.sessions[id];saveState();return null;}
    if(x.score==null&&total)x.score=correct/total*100;
    if(!Number(x.duration_seconds||0)&&x.started_at)x.duration_seconds=Math.max(0,Math.round((Date.now()-Date.parse(x.started_at))/1000));
    x.updated_at=nowIso();x.synced=false;saveState();return x;
  }
  function finishLiveSession(){if(liveSessionId){finishLocalSession(liveSessionId);liveSessionId=null;if(currentUser)syncSessions().catch(console.warn);}}
  function appendCompletedSession(mode,result={},metadata={}){
    const id=startLocalSession(mode,metadata),x=state.sessions[id];
    x.item_count=Number(result.total||0);x.correct_count=Number(result.correct||0);x.wrong_count=Math.max(0,Number(result.wrong??(x.item_count-x.correct_count)));
    x.duration_seconds=Number(result.seconds||0);x.score=result.score!=null?Number(result.score):(x.item_count?x.correct_count/x.item_count*100:null);
    if(result.started_at)x.started_at=result.started_at;return finishLocalSession(id);
  }
  function progressWeight(p){return p?.status==='mastered'?1:p?.status==='review'?0.7:p?.status==='learning'?0.35:0;}
  function weaknessScore(p){
    const c=Number(p?.correct_count||0),w=Number(p?.wrong_count||0),a=c+w,err=a?w/a:0;
    const lapse=Math.min(25,Number(p?.lapses||0)*7);
    const duePts=due(p)?12:0;
    const overdue=p?.due_at?Math.min(10,Math.max(0,(Date.now()-Date.parse(p.due_at))/DAY)):0;
    const avg=a?Number(p?.total_time_seconds||0)/a:0,slow=Math.min(8,Math.max(0,(avg-10)/2));
    return Math.round(clamp(err*45+lapse+duePts+overdue+slow,0,100));
  }
  function itemFromProgress(p){
    if(!p)return null;const k=norm(p.item_key);
    if(p.item_type==='word'){
      const x=data.core.find(v=>v.type==='Word'&&norm(v.entry)===k) || data.topic.find(v=>norm(v.word)===k);
      return x?{...x,_type:'word',_key:x.entry||x.word,topic:x.cpa_subtopic||x.topic||p.topic||''}:null;
    }
    if(p.item_type==='family'){const x=data.families.find(v=>norm(v.root)===k);return x?{...x,_type:'family',_key:x.root}:null;}
    if(p.item_type==='collocation'){const x=data.collocations.find(v=>norm(v.term_fixed_phrase)===k);return x?{...x,_type:'collocation',_key:x.term_fixed_phrase}:null;}
    if(p.item_type==='question'&&String(p.item_key||'').startsWith('sentence:')){const id=String(p.item_key).replace(/^sentence:/,'');const x=data.sentences.find(v=>String(v.id)===id);return x?{...x,_type:'question',_key:p.item_key,item_key:p.item_key,_display:x.focus_term||`Câu ${x.year||''}`,_speak:x.text,topic:x.topic||p.topic||'',source_status:'Exam corpus sentence'}:null;}
    return null;
  }
  function rangeDays(n){
    const sessionByDay={};
    for(const x of Object.values(state.sessions||{})){if(!x.started_at||!x.ended_at)continue;const k=dateKey(new Date(x.started_at));const a=sessionByDay[k]||(sessionByDay[k]={reviews:0,study_seconds:0,correct_count:0,wrong_count:0});a.reviews+=Number(x.item_count||0);a.study_seconds+=Number(x.duration_seconds||0);a.correct_count+=Number(x.correct_count||0);a.wrong_count+=Number(x.wrong_count||0);}
    const out=[];const today=new Date();today.setHours(12,0,0,0);
    for(let i=n-1;i>=0;i--){const d=new Date(today.getTime()-i*DAY),k=dateKey(d),x=state.daily[k]||{},ss=sessionByDay[k]||{};const reviews=Math.max(Number(x.reviews||0),Number(ss.reviews||0)),seconds=Math.max(Number(x.study_seconds||0),Number(ss.study_seconds||0)),correct=Math.max(Number(x.correct_count||0),Number(ss.correct_count||0)),wrong=Math.max(Number(x.wrong_count||0),Number(ss.wrong_count||0)),total=correct+wrong;out.push({date:k,label:new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit'}).format(d),reviews,minutes:seconds/60,accuracy:total?correct/total*100:null,new_items:Number(x.new_items||0),exam:Number(x.best_exam_score||0)});}return out;
  }
  function svgLine(rows,key,suffix=''){
    const vals=rows.map(r=>r[key]).filter(v=>v!=null&&Number.isFinite(v));if(!vals.length)return '<div class="empty">Chưa đủ dữ liệu.</div>';
    const max=Math.max(...vals,1),min=Math.min(...vals,0),span=Math.max(1,max-min),W=720,H=180,P=20;
    const pts=rows.map((r,i)=>{const v=r[key];if(v==null)return null;const x=P+(W-2*P)*(rows.length===1?0:i/(rows.length-1)),y=H-P-(H-2*P)*(v-min)/span;return `${x.toFixed(1)},${y.toFixed(1)}`;}).filter(Boolean).join(' ');
    return `<svg class="trend-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"><line x1="${P}" y1="${H-P}" x2="${W-P}" y2="${H-P}" class="chart-axis"/><polyline points="${pts}" class="chart-line"/></svg><div class="chart-legend"><span>${esc(rows[0]?.label||'')}</span><b>${Math.round(vals[vals.length-1]*10)/10}${suffix}</b><span>${esc(rows[rows.length-1]?.label||'')}</span></div>`;
  }
  function readinessScore(){
    const weighted=(list,type,keyFn)=>{if(!list.length)return 0;let s=0;for(const x of list)s+=progressWeight(localProgress(type,keyFn(x)));return s/list.length*100;};
    const core=data.core.filter(x=>x.type==='Word');
    const coreM=weighted(core,'word',x=>x.entry),famM=weighted(data.families,'family',x=>x.root),colM=weighted(data.collocations,'collocation',x=>x.term_fixed_phrase);
    const activeSentences=data.sentences.filter(x=>x.quality!=='low'),qM=activeSentences.length?activeSentences.reduce((s,x)=>s+progressWeight(localProgress('question',`sentence:${x.id}`)),0)/activeSentences.length*100:0;
    const m=masteryStats(),active14=rangeDays(14).filter(x=>x.minutes>0||x.reviews>0).length,consistency=Math.min(100,active14/10*100);
    const exams=Object.values(state.sessions).filter(x=>x.mode==='mock_exam'&&x.score!=null);const exam=exams.length?Math.max(...exams.map(x=>Number(x.score||0))):0;
    const score=Math.round(coreM*.30+famM*.15+colM*.15+qM*.15+m.accuracy*.10+consistency*.05+exam*.10);
    return {score,parts:{core:Math.round(coreM),families:Math.round(famM),collocations:Math.round(colM),cloze:Math.round(qM),accuracy:m.accuracy,consistency:Math.round(consistency),exam:Math.round(exam)}};
  }
  function futureDueCounts(n=7){
    const rows=[];for(let i=0;i<n;i++){const d=new Date();d.setHours(23,59,59,999);d.setDate(d.getDate()+i);rows.push({date:dateKey(d),label:i===0?'Hôm nay':i===1?'Ngày mai':new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit'}).format(d),count:0});}
    for(const p of Object.values(state.progress)){if(!p.due_at)continue;const diff=Math.floor((new Date(p.due_at).setHours(0,0,0,0)-new Date().setHours(0,0,0,0))/DAY);if(diff>=0&&diff<n)rows[diff].count++;}
    return rows;
  }

  async function fetchJson(path){ const r=await fetch(path); if(!r.ok) throw new Error(`Không tải được ${path}`); return r.json(); }

  // V7: corpus nặng 2,9 MB. Trước đây tải hết trước khi app khởi động — trên 3G/4G
  // người dùng nhìn màn hình trắng rất lâu. Giờ chỉ tải phần dùng ngay, phần nặng
  // (topic_vocab 1,7 MB, exams 272 KB) tải khi vào đúng view cần.
  const LAZY_SETS={
    topic:{file:'data/topic_vocab.json',label:'từ điển corpus'},
    exams:{file:'data/exams.json',label:'đề gốc'}
  };
  const VIEW_NEEDS={study:['topic'],dictionary:['topic'],weak:['topic'],exams:['exams'],settings:['topic','exams']};
  const lazyPromises={};
  function hasSet(k){return Array.isArray(data[k])&&data[k].length>0;}
  function ensureSet(k){
    if(hasSet(k))return Promise.resolve(data[k]);
    if(!lazyPromises[k])lazyPromises[k]=loadPack(k,LAZY_SETS[k].file)
      .then(rows=>{data[k]=rows;return rows;})
      .catch(err=>{delete lazyPromises[k];throw err;});
    return lazyPromises[k];
  }

  /* ---------- V8: corpus có phiên bản ----------
     Mục tiêu: sửa nội dung ôn thi mà không phải deploy lại app.

     Nguyên tắc: KHÔNG BAO GIỜ để việc kiểm tra phiên bản chặn đường khởi động.
     JSON tĩnh kèm theo bản build luôn là thứ hiển thị trước — nhanh, chạy được cả
     khi ngoại tuyến và cả khi máy chủ chết. Việc đối chiếu phiên bản chạy ngầm; chỉ
     khi máy chủ thật sự có bản mới hơn bản đóng gói thì mới tải và thay tại chỗ.
     Nội dung ôn thi không phải dữ liệu cá nhân nên đọc được cả khi chưa đăng nhập. */
  const PACK_CACHE_PREFIX='cpa_pack_';
  let bundledVersions=null;
  let manifestPromise=null;

  async function bundledManifest(){
    if(bundledVersions)return bundledVersions;
    try{bundledVersions=await fetchJson('data/manifest.json');}
    catch{bundledVersions={};}
    return bundledVersions;
  }
  function remoteManifest(){
    if(!db||typeof db.rpc!=='function')return Promise.resolve({});
    if(!manifestPromise)manifestPromise=db.rpc('content_manifest')
      .then(({data:rows,error})=>{
        if(error)return {};
        const out={};for(const r of rows||[])out[r.pack_id]=r;return out;
      })
      .catch(()=>({}));
    return manifestPromise;
  }
  function readPackCache(pack){
    try{
      const obj=JSON.parse(localStorage.getItem(PACK_CACHE_PREFIX+pack)||'null');
      return (obj&&Array.isArray(obj.rows))?obj:null;
    }catch{return null;}
  }
  function writePackCache(pack,version,rows){
    try{localStorage.setItem(PACK_CACHE_PREFIX+pack,JSON.stringify({version,rows,cached_at:nowIso()}));}
    catch{/* localStorage đầy: bỏ qua, lần sau tải lại từ mạng */}
  }
  async function fetchPackRows(pack){
    const PAGE=1000,out=[];
    for(let from=0;;from+=PAGE){
      const {data:rows,error}=await db.from('content_items')
        .select('payload').eq('pack_id',pack).order('sort_order',{ascending:true})
        .range(from,from+PAGE-1);
      if(error)throw error;
      if(!rows?.length)break;
      out.push(...rows.map(r=>r.payload));
      if(rows.length<PAGE)break;
    }
    return out;
  }

  /* Trả về NGAY nội dung tốt nhất đang có tại máy (cache mới hơn bản đóng gói, hoặc
     chính bản đóng gói), rồi hẹn kiểm tra bản mới ở chế độ nền. */
  async function loadPack(pack,file){
    const bundled=await bundledManifest();
    const bundledVer=Number(bundled[pack]||1);
    const cached=readPackCache(pack);
    queuePackUpgrade(pack,bundledVer);
    if(cached&&Number(cached.version)>bundledVer)return cached.rows;
    return fetchJson(file);
  }

  const upgradeQueue=new Map();
  function queuePackUpgrade(pack,bundledVer){
    if(upgradeQueue.has(pack))return;
    upgradeQueue.set(pack,bundledVer);
  }
  async function runPackUpgrades(){
    if(!db||!upgradeQueue.size)return;
    const manifest=await remoteManifest().catch(()=>({}));
    if(!Object.keys(manifest).length){upgradeQueue.clear();return;}
    let changed=false;
    for(const [pack,bundledVer] of [...upgradeQueue]){
      upgradeQueue.delete(pack);
      const remote=manifest[pack];
      if(!remote)continue;
      const remoteVer=Number(remote.version||0);
      const cached=readPackCache(pack);
      const haveVer=Math.max(bundledVer,Number(cached?.version||0));
      if(remoteVer<=haveVer)continue;
      try{
        const rows=await fetchPackRows(pack);
        if(!rows.length)continue;
        writePackCache(pack,remoteVer,rows);
        if(pack in data){data[pack]=rows;changed=true;}
      }catch(e){console.warn(`Không nâng cấp được pack "${pack}":`,e.message);}
    }
    if(changed){
      toast('Nội dung học vừa được cập nhật bản mới.');
      if(!quiz&&!drillState&&activeView!=='exams')navigate(activeView);
    }
  }
  async function ensureViewData(view){
    const need=(VIEW_NEEDS[view]||[]).filter(k=>!hasSet(k));
    if(!need.length)return true;
    $('#content').innerHTML=`<div class="loading"><span class="spinner"></span> Đang tải ${need.map(k=>LAZY_SETS[k].label).join(' và ')}…</div>`;
    try{ await Promise.all(need.map(ensureSet)); return true; }
    catch(e){
      $('#content').innerHTML=`<div class="card"><h2>Không tải được dữ liệu</h2><p class="bad">${esc(e.message||e)}</p><p class="muted small">Kiểm tra kết nối mạng rồi bấm thử lại. Các mục đã tải vẫn học được bình thường khi ngoại tuyến.</p><button class="primary" id="retryData">Thử lại</button></div>`;
      const btn=$('#retryData'); if(btn)btn.onclick=()=>navigate(view);
      return false;
    }
  }
  function prefetchIdle(){
    // Kiểm tra bản nội dung mới là một RPC rất nhẹ — chạy sớm để người dùng nhận được
    // nội dung cập nhật ngay trong phiên này, không phải đợi hết 3 giây prefetch.
    setTimeout(()=>runPackUpgrades().catch(()=>{}),800);
    // Nạp ngầm corpus nặng thì để lúc trình duyệt rảnh.
    const run=()=>{for(const k of Object.keys(LAZY_SETS))ensureSet(k).catch(()=>{});};
    // Safari cũ và một số WebView không có requestIdleCallback; kiểm tra kiểu hàm,
    // vì `'requestIdleCallback' in window` vẫn đúng khi giá trị là undefined.
    if(typeof window.requestIdleCallback==='function')window.requestIdleCallback(run,{timeout:6000});
    else setTimeout(run,3000);
  }

  // Các pack nạp ngay lúc khởi động. glosses/ipa là object tra cứu, không phải mảng,
  // nên đi đường fetchJson thẳng — chúng không nằm trong cơ chế pack có phiên bản.
  const EAGER_PACKS={core:'data/core_cpa.json',families:'data/word_families.json',
    collocations:'data/collocations.json',topics:'data/topic_summary.json',
    sentences:'data/sentences.json',wf:'data/drills_wf.json',tr:'data/drills_tr.json',
    tle:'data/drills_tle.json',tlv:'data/drills_tlv.json'};

  async function loadData(){
    const names=Object.keys(EAGER_PACKS);
    const [glosses,ipa,...packs]=await Promise.all([
      fetchJson('data/glosses.json'),
      fetchJson('data/ipa.json'),
      ...names.map(n=>loadPack(n,EAGER_PACKS[n]))
    ]);
    const loaded={};names.forEach((n,i)=>loaded[n]=packs[i]);
    data={...data,...loaded,glosses,ipa,topic:[],exams:[]};
  }
  function gloss(term){ return data.glosses[norm(term)] || null; }
  function ipaOf(term){return data.ipa[norm(term)]||'';}
  function collocationRow(term){return data.collocations.find(x=>norm(x.term_fixed_phrase)===norm(term))||null;}
  function meaningOf(term){const c=collocationRow(term);if(c?.meaning_vi)return c.meaning_vi;const g=gloss(term);return g?.[1]||'';}

  function initSupabase(){
    if(!window.supabase?.createClient || !CFG.supabaseUrl || !CFG.supabasePublishableKey) return;
    db=window.supabase.createClient(CFG.supabaseUrl, CFG.supabasePublishableKey, {
      auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true,flowType:'pkce'},
      global:{headers:{'x-client-info':`cpa-english-trainer/${CFG.appVersion||'v7'}`}}
    });
    db.auth.onAuthStateChange(async (event,session)=>{
      const next=session?.user||null;
      const changed=(currentUser?.id||null)!==(next?.id||null);
      currentUser=next;
      if(event==='PASSWORD_RECOVERY'){setTimeout(openRecovery,200);}
      if(changed){switchStateScope(currentUser?.id||null);profile=null;}
      if(currentUser)await loadProfile();
      updateAuthUI();
      if(currentUser){startRealtime();setTimeout(()=>syncAll().then(()=>maybeOfferGuestMerge()),0);}
      else stopRealtime();
      if(changed&&data.core.length)setTimeout(()=>navigate(activeView),0);
    });
  }
  async function restoreSession(){
    if(!db){updateAuthUI();return;}
    const {data:sessionData}=await db.auth.getSession();
    currentUser=sessionData?.session?.user||null;
    switchStateScope(currentUser?.id||null);
    if(currentUser)await loadProfile();
    updateAuthUI();
    if(currentUser){startRealtime();await syncAll();await maybeOfferGuestMerge();}
  }

  /* ---------- V8: Realtime ----------
     Không có lớp này, hai tab (hoặc điện thoại + máy tính) đang mở cùng lúc sẽ hiển
     thị lệch nhau cho tới lần sync thủ công sau. Chỉ nghe study_progress và
     daily_stats; learning_events cố ý không phát vì nó ghi liên tục và client
     không dùng tới, phát đi chỉ tạo bão message. */
  let realtimeChannel=null;
  let realtimeLive=false;
  let rerenderTimer=null;
  /* Một chỗ duy nhất quyết định nội dung badge. Trước đây startRealtime() và syncAll()
     cùng ghi badge, và syncAll() chạy sau nên luôn xoá mất chữ "đồng bộ sống". */
  function refreshSyncBadge(){
    if(!currentUser)return setSyncBadge('offline','● Đang học ngoại tuyến');
    setSyncBadge('online',realtimeLive?`● Đồng bộ sống: ${displayName()}`:`● Đồng bộ: ${displayName()}`);
  }
  function scheduleRerender(){
    clearTimeout(rerenderTimer);
    // Gộp nhiều thay đổi dồn dập thành một lần vẽ lại, và không vẽ đè lên màn hình
    // đang có thao tác dở (đang làm quiz, đang làm bài thi, đang chấm thẻ).
    rerenderTimer=setTimeout(()=>{
      const busy=quiz||drillState||activeView==='exams';
      if(busy)return;
      if(['dashboard','history','weak','settings'].includes(activeView))navigate(activeView);
    },900);
  }
  function stopRealtime(){
    realtimeLive=false;
    if(!realtimeChannel)return;
    try{db?.removeChannel?.(realtimeChannel);}catch{}
    realtimeChannel=null;
  }
  function startRealtime(){
    if(!db||!currentUser||typeof db.channel!=='function')return;
    stopRealtime();
    const mine=`user_id=eq.${currentUser.id}`;
    try{
      realtimeChannel=db.channel(`user-${currentUser.id}`)
        .on('postgres_changes',{event:'*',schema:'public',table:'study_progress',filter:mine},p=>applyRemoteProgress(p.new))
        .on('postgres_changes',{event:'*',schema:'public',table:'daily_stats',filter:mine},p=>applyRemoteDaily(p.new))
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles',filter:mine},p=>{
          if(!p.new)return;profile={...(profile||{}),...p.new};updateAuthUI();
        })
        .subscribe(status=>{
          realtimeLive=(status==='SUBSCRIBED');
          refreshSyncBadge();
        });
    }catch(e){console.warn('Realtime không khả dụng:',e.message);}
  }
  function applyRemoteProgress(row){
    if(!row?.item_key||!row?.item_type)return;
    const id=itemId(row.item_type,row.item_key),local=state.progress[id];
    // Thiết bị này vừa ghi xong thì bỏ qua echo của chính mình.
    if(local&&Date.parse(local.updated_at||0)>=Date.parse(row.updated_at||0))return;
    state.progress[id]=row;saveState();scheduleRerender();
  }
  function applyRemoteDaily(row){
    if(!row?.study_date)return;
    const cur=state.daily[row.study_date]||{};
    // Counter luôn lấy giá trị lớn hơn: thiết bị kia có thể đang ở giữa phiên học.
    state.daily[row.study_date]={
      reviews:Math.max(Number(cur.reviews||0),Number(row.reviews||0)),
      new_items:Math.max(Number(cur.new_items||0),Number(row.new_items||0)),
      correct_count:Math.max(Number(cur.correct_count||0),Number(row.correct_count||0)),
      wrong_count:Math.max(Number(cur.wrong_count||0),Number(row.wrong_count||0)),
      study_seconds:Math.max(Number(cur.study_seconds||0),Number(row.study_seconds||0)),
      exam_attempts:Math.max(Number(cur.exam_attempts||0),Number(row.exam_attempts||0)),
      best_exam_score:Math.max(Number(cur.best_exam_score||0),Number(row.best_exam_score||0))||null,
      updated_at:row.updated_at||nowIso()};
    saveState();scheduleRerender();
  }

  function localProgress(type,key){return state.progress[itemId(type,key)] || null;}
  function setLocalProgress(type,key,p){state.progress[itemId(type,key)]={...p,item_key:key,item_type:type,updated_at:nowIso()}; saveState();}

  function sm2(prev, quality){
    const p={ease_factor:Number(prev?.ease_factor||2.5),interval_days:Number(prev?.interval_days||0),repetitions:Number(prev?.repetitions||0),lapses:Number(prev?.lapses||0),correct_count:Number(prev?.correct_count||0),wrong_count:Number(prev?.wrong_count||0)};
    if(quality<3){p.repetitions=0;p.interval_days=1;p.lapses+=1;p.wrong_count+=1;}
    else{
      p.correct_count+=1;
      p.repetitions+=1;
      if(p.repetitions===1)p.interval_days=1;
      else if(p.repetitions===2)p.interval_days=6;
      else p.interval_days=Math.max(1,Math.round((p.interval_days||6)*p.ease_factor));
      p.ease_factor=Math.max(1.3,p.ease_factor+(0.1-(5-quality)*(0.08+(5-quality)*0.02)));
    }
    p.status=p.repetitions>=5 && p.interval_days>=21?'mastered':p.repetitions>=2?'review':'learning';
    p.last_reviewed_at=nowIso(); p.due_at=new Date(Date.now()+p.interval_days*DAY).toISOString();
    return p;
  }

  function dailyLocal(){
    const k=dateKey(); if(!state.daily[k]) state.daily[k]={reviews:0,new_items:0,correct_count:0,wrong_count:0,study_seconds:0,exam_attempts:0,best_exam_score:null}; return state.daily[k];
  }
  /* ---------- V7: event log append-only ----------
     daily_stats là counter tổng hợp — hai thiết bị cùng học offline rồi cùng sync sẽ
     ghi đè nhau và mất số liệu. Mỗi lượt học giờ sinh thêm một event bất biến; khi
     mạng lỗi thì event nằm trong hàng đợi local và được đẩy lên ở lần sync sau. */
  const CLIENT_ID_KEY='cpa_client_id';
  function clientId(){
    let id=localStorage.getItem(CLIENT_ID_KEY);
    if(!id){id=uuid();localStorage.setItem(CLIENT_ID_KEY,id);}
    return id;
  }
  const MAX_QUEUE=2000;
  function queueEvent(ev){
    state.eventQueue=state.eventQueue||[];
    state.eventQueue.push({
      event_id:uuid(),event_type:ev.type,item_key:ev.itemKey||null,item_type:ev.itemType||null,
      topic:ev.topic||null,quality:ev.quality==null?null:clamp(Math.round(ev.quality),0,5),
      is_correct:ev.correct==null?null:!!ev.correct,is_new_item:!!ev.isNew,
      duration_seconds:Math.max(0,Math.round(ev.seconds||0)),session_id:ev.sessionId||null,
      occurred_at:nowIso(),event_date:dateKey(),client_id:clientId(),metadata:ev.metadata||{}
    });
    if(state.eventQueue.length>MAX_QUEUE)state.eventQueue=state.eventQueue.slice(-MAX_QUEUE);
    saveState();
  }
  let flushing=false;
  let quotaBlockedUntil=0;
  async function flushEventQueue(){
    if(!db||!currentUser||flushing)return;
    if(Date.now()<quotaBlockedUntil)return;
    const queue=state.eventQueue||[];
    if(!queue.length)return;
    flushing=true;
    try{
      // V8: ghi qua RPC thay vì insert thẳng. RLS chỉ trả lời "hàng này có phải của
      // bạn không", không trả lời "bạn đã ghi bao nhiêu hàng" — nên insert trực tiếp
      // vẫn cho phép một tài khoản hợp lệ bơm hàng triệu hàng. RPC đếm hạn mức/ngày.
      const CHUNK=200;
      while(state.eventQueue.length){
        const batch=state.eventQueue.slice(0,CHUNK);
        const {data:res,error}=await db.rpc('log_learning_events',{events:batch});
        if(error){
          if(isMissingBackendObject(error)){
            // Dự án chưa chạy migration V8 → thử lại kiểu cũ một lần, rồi thôi.
            const {error:legacy}=await db.from('learning_events')
              .upsert(batch.map(e=>({...e,user_id:currentUser.id})),{onConflict:'event_id',ignoreDuplicates:true});
            if(legacy&&isMissingBackendObject(legacy)){state.eventQueue=[];saveState();break;}
            if(legacy){console.warn('Event push hoãn lại:',legacy.message);break;}
            state.eventQueue=state.eventQueue.slice(batch.length);saveState();continue;
          }
          console.warn('Event push hoãn lại:',error.message);
          break;
        }
        const r=Array.isArray(res)?res[0]:res;
        if(r&&Number(r.accepted)===0&&Number(r.rejected)>0&&Number(r.quota_used)>=Number(r.quota_limit)){
          // Đụng trần hạn mức ngày: ngừng thử lại tới nửa đêm thay vì quay vòng vô ích.
          quotaBlockedUntil=endOfDayMs();
          toast('Đã chạm hạn mức ghi trong ngày. Tiến trình vẫn lưu trên máy và sẽ đồng bộ vào ngày mai.');
          break;
        }
        state.eventQueue=state.eventQueue.slice(batch.length);
        saveState();
      }
    }finally{flushing=false;}
  }
  function isMissingBackendObject(err){
    const m=String(err?.message||'');
    return /does not exist|schema cache|Could not find the function|PGRST202/i.test(m);
  }
  function endOfDayMs(){const d=new Date();d.setHours(24,0,0,0);return d.getTime();}

  async function recordReview(type,item,quality,seconds=0){
    const key=item.entry || item.root || item.term_fixed_phrase || item.word || item.item_key;
    const prev=localProgress(type,key)||{};
    const wasNew=!prev.last_reviewed_at;
    const next={...prev,...sm2(prev,quality),topic:item.topic||item.cpa_subtopic||prev.topic||'',total_time_seconds:Number(prev.total_time_seconds||0)+seconds,metadata:{...(prev.metadata||{}),source:item.source_status||item.evidence_basis||''}};
    setLocalProgress(type,key,next);
    const day=dailyLocal(); day.reviews+=1; if(wasNew)day.new_items+=1; if(quality<3)day.wrong_count+=1;else day.correct_count+=1; day.study_seconds+=seconds; day.updated_at=nowIso();
    touchSession(liveSessionId,quality>=3,seconds); saveState();
    queueEvent({type:'review',itemKey:key,itemType:type,topic:next.topic,quality,correct:quality>=3,isNew:wasNew,seconds,sessionId:liveSessionId});
    if(currentUser) await Promise.allSettled([cloudUpsertProgress(key,type,next),cloudUpsertDaily(day),flushEventQueue()]);
  }

  async function cloudUpsertProgress(key,type,p){
    if(!db||!currentUser)return;
    const payload={user_id:currentUser.id,item_key:key,item_type:type,topic:p.topic||'',status:p.status||'new',ease_factor:Number(p.ease_factor||2.5),interval_days:Number(p.interval_days||0),repetitions:Number(p.repetitions||0),lapses:Number(p.lapses||0),due_at:p.due_at||nowIso(),last_reviewed_at:p.last_reviewed_at||null,correct_count:Number(p.correct_count||0),wrong_count:Number(p.wrong_count||0),total_time_seconds:Number(p.total_time_seconds||0),metadata:p.metadata||{},updated_at:p.updated_at||nowIso()};
    const {error}=await db.from('study_progress').upsert(payload,{onConflict:'user_id,item_key,item_type'}); if(error) throw error;
  }
  async function cloudUpsertDaily(day,studyDate=dateKey()){
    if(!db||!currentUser)return;
    const payload={user_id:currentUser.id,study_date:studyDate,reviews:Number(day.reviews||0),new_items:Number(day.new_items||0),correct_count:Number(day.correct_count||0),wrong_count:Number(day.wrong_count||0),study_seconds:Number(day.study_seconds||0),exam_attempts:Number(day.exam_attempts||0),best_exam_score:day.best_exam_score==null?null:Number(day.best_exam_score),updated_at:day.updated_at||nowIso()};
    let {error}=await db.from('daily_stats').upsert(payload,{onConflict:'user_id,study_date'});
    if(error){const legacy={...payload};delete legacy.updated_at;({error}=await db.from('daily_stats').upsert(legacy,{onConflict:'user_id,study_date'}));}
    if(error)throw error;
  }
  async function cloudUpsertGoals(){
    if(!db||!currentUser)return;
    const payload={user_id:currentUser.id,daily_minutes_goal:Number(state.settings.dailyMinutesGoal||30),daily_new_items_goal:Number(state.settings.newPerDay??15),daily_reviews_goal:Number(state.settings.dailyReviewsGoal||30),target_exam_date:state.settings.targetExamDate||null,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Bangkok',updated_at:state.settingsUpdatedAt||nowIso()};
    const {error}=await db.from('profiles').upsert(payload,{onConflict:'user_id'});if(error)console.warn('Profile goals sync skipped:',error.message);
  }
  async function syncSessions(){
    if(!db||!currentUser)return;
    const {data:remote,error}=await db.from('study_sessions').select('*').eq('user_id',currentUser.id).order('started_at',{ascending:false}).limit(500);if(error){console.warn('Session pull skipped:',error.message);return;}
    for(const r of remote||[]){const l=state.sessions[r.id];if(!l||Date.parse(r.updated_at||r.ended_at||r.started_at||0)>Date.parse(l.updated_at||0))state.sessions[r.id]={...r,mode:r.metadata?.client_mode||r.mode,synced:true};}
    const pending=Object.values(state.sessions).filter(x=>!x.synced||!remote?.some(r=>r.id===x.id));
    for(const x of pending){
      const payload={id:x.id,user_id:currentUser.id,mode:SESSION_MODES.has(x.mode)?x.mode:'review',started_at:x.started_at,ended_at:x.ended_at,item_count:Number(x.item_count||0),correct_count:Number(x.correct_count||0),wrong_count:Number(x.wrong_count||0),score:x.score==null?null:Number(x.score),duration_seconds:Number(x.duration_seconds||0),metadata:{...(x.metadata||{}),client_mode:x.mode},updated_at:x.updated_at||nowIso()};
      let {error:e}=await db.from('study_sessions').upsert(payload,{onConflict:'id'});if(e){const legacy={...payload};delete legacy.updated_at;({error:e}=await db.from('study_sessions').upsert(legacy,{onConflict:'id'}));}
      if(!e)x.synced=true;else console.warn('Session push skipped:',e.message);
    }
  }
  async function syncAll(){
    if(!db||!currentUser)return;
    setSyncBadge('syncing','● Đang đồng bộ…');
    try{
      const {data:rows,error}=await db.from('study_progress').select('*').eq('user_id',currentUser.id); if(error)throw error;
      for(const row of rows||[]){
        const id=itemId(row.item_type,row.item_key),local=state.progress[id];
        const remoteTime=Date.parse(row.updated_at||0),localTime=Date.parse(local?.updated_at||0);
        if(!local||remoteTime>localTime)state.progress[id]=row;else if(localTime>remoteTime)await cloudUpsertProgress(row.item_key,row.item_type,local);
      }
      const {data:days,error:de}=await db.from('daily_stats').select('*').eq('user_id',currentUser.id).order('study_date',{ascending:false}).limit(180);if(de)throw de;
      for(const d of days||[]){
        const local=state.daily[d.study_date],remote={reviews:Number(d.reviews||0),new_items:Number(d.new_items||0),correct_count:Number(d.correct_count||0),wrong_count:Number(d.wrong_count||0),study_seconds:Number(d.study_seconds||0),exam_attempts:Number(d.exam_attempts||0),best_exam_score:d.best_exam_score==null?null:Number(d.best_exam_score),updated_at:d.updated_at||d.study_date};
        if(local&&!local.updated_at){const merged={reviews:Math.max(Number(local.reviews||0),remote.reviews),new_items:Math.max(Number(local.new_items||0),remote.new_items),correct_count:Math.max(Number(local.correct_count||0),remote.correct_count),wrong_count:Math.max(Number(local.wrong_count||0),remote.wrong_count),study_seconds:Math.max(Number(local.study_seconds||0),remote.study_seconds),exam_attempts:Math.max(Number(local.exam_attempts||0),remote.exam_attempts),best_exam_score:Math.max(Number(local.best_exam_score||0),Number(remote.best_exam_score||0))||null,updated_at:nowIso()};state.daily[d.study_date]=merged;await cloudUpsertDaily(merged,d.study_date);}
        else if(!local||Date.parse(remote.updated_at||0)>Date.parse(local.updated_at||0))state.daily[d.study_date]=remote;
        else if(Date.parse(local.updated_at||0)>Date.parse(remote.updated_at||0))await cloudUpsertDaily(local,d.study_date);
      }
      try{const {data:prof}=await db.from('profiles').select('*').eq('user_id',currentUser.id).maybeSingle();if(prof){const rt=Date.parse(prof.updated_at||0),lt=Date.parse(state.settingsUpdatedAt||0);if(rt>lt){state.settings.dailyMinutesGoal=Number(prof.daily_minutes_goal||30);state.settings.newPerDay=Number(prof.daily_new_items_goal??15);state.settings.dailyReviewsGoal=Number(prof.daily_reviews_goal||30);state.settings.targetExamDate=prof.target_exam_date||'';state.settingsUpdatedAt=prof.updated_at;}else if(lt>rt)await cloudUpsertGoals();}else await cloudUpsertGoals();}catch(e){console.warn('Profile pull skipped:',e.message);}
      await syncSessions();
      await flushEventQueue();
      // Dồn lại daily_stats từ event log ở phía máy chủ: counter theo ngày trở nên
      // idempotent, không còn phụ thuộc thứ tự sync của từng thiết bị.
      try{
        const {data:pulled}=await db.rpc('rebuild_daily_stats',{days_back:120});
        if(pulled!=null){
          const {data:fresh}=await db.from('daily_stats').select('*').eq('user_id',currentUser.id).order('study_date',{ascending:false}).limit(180);
          for(const d of fresh||[]){
            const cur=state.daily[d.study_date]||{};
            state.daily[d.study_date]={
              reviews:Math.max(Number(cur.reviews||0),Number(d.reviews||0)),
              new_items:Math.max(Number(cur.new_items||0),Number(d.new_items||0)),
              correct_count:Math.max(Number(cur.correct_count||0),Number(d.correct_count||0)),
              wrong_count:Math.max(Number(cur.wrong_count||0),Number(d.wrong_count||0)),
              study_seconds:Math.max(Number(cur.study_seconds||0),Number(d.study_seconds||0)),
              exam_attempts:Math.max(Number(cur.exam_attempts||0),Number(d.exam_attempts||0)),
              best_exam_score:Math.max(Number(cur.best_exam_score||0),Number(d.best_exam_score||0))||null,
              updated_at:d.updated_at||nowIso()};
          }
        }
      }catch(e){/* Dự án chưa chạy migration V7 — bỏ qua, daily_stats vẫn hoạt động như V6. */}
      state.lastSync=nowIso();saveState();
      refreshSyncBadge();
      if(['dashboard','history','settings'].includes(activeView))navigate(activeView);
    }catch(e){
      console.error(e);
      setSyncBadge('offline','● Đồng bộ lỗi — vẫn lưu trên máy');
      const m=String(e.message||e);
      toast(/Failed to fetch|NetworkError/i.test(m)?'Mất mạng. Tiến trình vẫn được lưu trên máy và sẽ tự đồng bộ sau.':`Đồng bộ lỗi: ${m}`);
    }
  }

  function masteryStats(){
    const ps=Object.values(state.progress); const mastered=ps.filter(p=>p.status==='mastered').length; const dueNow=ps.filter(due).length;
    const correct=ps.reduce((s,p)=>s+Number(p.correct_count||0),0), wrong=ps.reduce((s,p)=>s+Number(p.wrong_count||0),0);
    return {tracked:ps.length,mastered,dueNow,accuracy:correct+wrong?Math.round(correct/(correct+wrong)*100):0};
  }
  function streak(){
    let n=0,d=new Date(); for(;;){const k=dateKey(d); if(state.daily[k]?.study_seconds>0 || state.daily[k]?.reviews>0)n++; else if(n===0 && k===dateKey()){} else break; d=new Date(d.getTime()-DAY); if(n>3650)break;} return n;
  }
  function topicMastery(){
    const out={};
    for(const [id,p] of Object.entries(state.progress)){ const t=p.topic||'Khác'; if(!out[t])out[t]={reviewed:0,mastered:0,wrong:0};out[t].reviewed++;if(p.status==='mastered')out[t].mastered++;out[t].wrong+=Number(p.wrong_count||0); }
    return out;
  }

  function renderDashboard(){
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

  function renderHistory(){
    const sessions=Object.values(state.sessions).filter(x=>x.ended_at).sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at));
    const modes=unique(sessions.map(x=>x.mode)).sort();
    $('#content').innerHTML=`<div class="toolbar"><label>Loại phiên<select id="historyMode"><option value="">Tất cả</option>${modes.map(m=>`<option value="${esc(m)}">${esc(modeLabel(m))}</option>`).join('')}</select></label><label>Khoảng thời gian<select id="historyDays"><option value="7">7 ngày</option><option value="30">30 ngày</option><option value="90">90 ngày</option><option value="3650">Toàn bộ</option></select></label></div><div id="historyArea"></div>`;
    $('#historyDays').value=String(state.settings.historyDays||30);
    const draw=()=>{const mode=$('#historyMode').value,days=Number($('#historyDays').value),cut=Date.now()-days*DAY;state.settings.historyDays=days;saveState();const list=sessions.filter(x=>(!mode||x.mode===mode)&&Date.parse(x.started_at)>=cut);const sec=list.reduce((a,x)=>a+Number(x.duration_seconds||0),0),items=list.reduce((a,x)=>a+Number(x.item_count||0),0),scored=list.filter(x=>x.score!=null),avg=scored.length?Math.round(scored.reduce((a,x)=>a+Number(x.score||0),0)/scored.length):0;$('#historyArea').innerHTML=`<div class="grid kpis"><div class="card kpi"><div class="label">Số phiên</div><div class="value">${list.length}</div></div><div class="card kpi"><div class="label">Thời gian</div><div class="value accent">${Math.round(sec/360)/10} giờ</div></div><div class="card kpi"><div class="label">Mục đã luyện</div><div class="value good">${items}</div></div><div class="card kpi"><div class="label">Điểm TB</div><div class="value warning">${avg}%</div></div></div><div class="card" style="margin-top:14px"><div class="table-wrap"><table><thead><tr><th>Bắt đầu</th><th>Chế độ</th><th>Số mục</th><th>Đúng</th><th>Sai</th><th>Điểm</th><th>Thời gian</th><th>Sync</th></tr></thead><tbody>${list.slice(0,500).map(x=>`<tr><td>${fmtDate(x.started_at)}</td><td>${esc(modeLabel(x.mode))}</td><td>${x.item_count||0}</td><td>${x.correct_count||0}</td><td>${x.wrong_count||0}</td><td>${x.score==null?'—':Math.round(x.score)+'%'}</td><td>${fmtMin(x.duration_seconds||0)}</td><td>${x.synced?'Cloud':'Local'}</td></tr>`).join('')||'<tr><td colspan="8">Chưa có phiên học trong khoảng này.</td></tr>'}</tbody></table></div></div>`;};
    $('#historyMode').onchange=draw;$('#historyDays').onchange=draw;draw();
  }

  function buildStudyQueue(filter='core',topicFilter=''){
    let items=[];
    if(filter==='weak'){
      return Object.values(state.progress).map(p=>({p,item:itemFromProgress(p)})).filter(x=>x.item&&(Number(x.p.wrong_count||0)>0||Number(x.p.lapses||0)>0||due(x.p))).sort((a,b)=>weaknessScore(b.p)-weaknessScore(a.p)).map(x=>x.item).slice(0,80);
    }
    if(filter==='smart'){
      const weak=Object.values(state.progress).map(p=>({p,item:itemFromProgress(p)})).filter(x=>x.item&&due(x.p)).sort((a,b)=>weaknessScore(b.p)-weaknessScore(a.p)).map(x=>x.item).slice(0,35);
      const seen=new Set(weak.map(x=>`${x._type}:${norm(x._key)}`));
      const core=data.core.filter(x=>x.type==='Word').map(x=>({...x,_type:'word',_key:x.entry,topic:x.cpa_subtopic||''}));
      const remainingNew=Math.max(0,Number(state.settings.newPerDay??15)-Number(dailyLocal().new_items||0));
      const fresh=core.filter(x=>!localProgress('word',x._key)).sort((a,b)=>Number(b.v2_priority||b.exam_freq||0)-Number(a.v2_priority||a.exam_freq||0)).slice(0,remainingNew);
      return [...weak,...fresh.filter(x=>!seen.has(`word:${norm(x._key)}`))].slice(0,60);
    }
    if(filter==='core')items=data.core.filter(x=>x.type==='Word').map(x=>({...x,_type:'word',_key:x.entry,topic:x.cpa_subtopic||''}));
    else if(filter==='all')items=data.topic.map(x=>({...x,_type:'word',_key:x.word}));
    else if(filter==='families')items=data.families.map(x=>({...x,_type:'family',_key:x.root}));
    else if(filter==='collocations')items=data.collocations.map(x=>({...x,_type:'collocation',_key:x.term_fixed_phrase}));
    if(topicFilter)items=items.filter(x=>norm(x.topic||x.cpa_subtopic).includes(norm(topicFilter)));
    const dueItems=[],newItems=[];
    for(const x of items){const p=localProgress(x._type,x._key);if(p?.last_reviewed_at){if(due(p))dueItems.push(x);}else newItems.push(x);}
    dueItems.sort((a,b)=>(localProgress(a._type,a._key)?.due_at||'').localeCompare(localProgress(b._type,b._key)?.due_at||''));
    newItems.sort((a,b)=>Number(b.v2_priority||b.v2_priority_score||b.exam_freq||0)-Number(a.v2_priority||a.v2_priority_score||a.exam_freq||0));
    const remainingNew=Math.max(0,Number(state.settings.newPerDay??15)-Number(dailyLocal().new_items||0));
    return [...dueItems,...newItems.slice(0,remainingNew)].slice(0,100);
  }
  let _sentIdx=null;
  function sentenceIndex(){
    if(_sentIdx) return _sentIdx;
    _sentIdx={};
    data.sentences.filter(s=>s.quality!=='low').forEach(s=>{ unique((s.text.toLowerCase().match(/[a-z][a-z'-]+/g))||[]).forEach(w=>{(_sentIdx[w]=_sentIdx[w]||[]).push(s);}); });
    return _sentIdx;
  }
  function exampleFor(term){
    if(!term) return null;
    const t=norm(term);
    if(t.includes(' ')){ const hit=data.sentences.find(s=>s.quality!=='low'&&s.text.toLowerCase().includes(t)); return hit||null; }
    const ids=sentenceIndex()[t]; return ids&&ids.length?ids[0]:null;
  }
  function relatedCollocations(term,limit=5){
    const t=norm(term); if(!t)return [];
    return data.collocations.filter(c=>norm(c.term_fixed_phrase).split(/\s+/).includes(t)||norm(c.term_fixed_phrase).includes(t)).slice(0,limit);
  }
  function studyDetails(item,key){
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
  function renderStudy(){
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
  function renderStudyCard(){
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

  function renderFamilies(){
    const topics=unique(data.families.map(x=>x.topic)).sort();
    $('#content').innerHTML=`<div class="toolbar"><label>Tìm<input class="search" id="famSearch" placeholder="finance, manage, produce…"></label><label>Topic<select id="famTopic"><option value="">Tất cả</option>${topics.map(t=>`<option>${esc(t)}</option>`).join('')}</select></label><button class="primary" id="famQuiz">Quiz Word Family</button></div><div id="famTable"></div>`;
    const draw=()=>{const q=norm($('#famSearch').value),t=$('#famTopic').value;const rows=data.families.filter(x=>(!q||norm(JSON.stringify(x)).includes(q))&&(!t||x.topic===t)).map(x=>`<tr><td><b>${esc(x.root)}</b><div class="ipa small">${ipaOf(x.root)?`/${esc(ipaOf(x.root))}/`:''}</div><button class="chip-btn secondary tiny speak-fam" data-term="${esc(x.root)}">🔊</button><br><span class="pill">${esc(x.tier)}</span></td><td>${esc(x.topic)}</td><td>${esc(x.forms_seen_in_exam_count||'')}</td><td>${esc(x.recommended_new_forms||'—')}</td><td>${esc(x.prompt_years)}</td><td>${esc(x.example_prompt_context||'')}</td></tr>`).join('');$('#famTable').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Root + IPA</th><th>Topic</th><th>Forms đã thấy</th><th>Forms mở rộng</th><th>Năm prompt</th><th>Ngữ cảnh đề</th></tr></thead><tbody>${rows}</tbody></table></div><div class="footnote">“Forms mở rộng” là phần học bổ sung được workbook V2 gắn nhãn, không phải khẳng định đã xuất hiện trong đề.</div>`;$$('.speak-fam').forEach(b=>b.onclick=()=>speak(b.dataset.term));};
    $('#famSearch').oninput=draw;$('#famTopic').onchange=draw;$('#famQuiz').onclick=()=>startQuiz('family');draw();
  }

  function renderCollocations(){
    const topics=unique(data.collocations.map(x=>x.topic)).sort();
    $('#content').innerHTML=`<div class="toolbar"><label>Tìm<input class="search" id="colSearch" placeholder="financial statements, audit report…"></label><label>Topic<select id="colTopic"><option value="">Tất cả</option>${topics.map(t=>`<option>${esc(t)}</option>`).join('')}</select></label><label>Nguồn<select id="colSource"><option value="">Tất cả</option><option>Corpus confirmed</option><option>Learning expansion</option></select></label><button class="primary" id="colQuiz">Quiz Collocation</button><button class="secondary" id="goChunks">Học theo cụm/câu</button></div><div id="colCount" class="muted small"></div><div id="colTable"></div>`;
    const draw=()=>{const q=norm($('#colSearch').value),t=$('#colTopic').value,src=$('#colSource').value;const list=data.collocations.filter(x=>(!q||norm(JSON.stringify(x)).includes(q))&&(!t||x.topic===t)&&(!src||x.source_type===src));$('#colCount').textContent=`${list.length} cụm · ${data.collocations.filter(x=>x.source_type==='Corpus confirmed').length} xác nhận trong corpus · ${data.collocations.filter(x=>x.source_type==='Learning expansion').length} cụm mở rộng`;const rows=list.map(x=>`<tr><td><b>${esc(x.term_fixed_phrase)}</b><div class="ipa small">${x.ipa?`/${esc(x.ipa)}/`:''}</div><div class="button-row"><button class="chip-btn secondary tiny speak-col" data-term="${esc(x.term_fixed_phrase)}">🔊</button><button class="chip-btn secondary tiny slow-col" data-term="${esc(x.term_fixed_phrase)}">🐢</button></div></td><td>${esc(x.meaning_vi||'—')}</td><td>${esc(x.topic)}<br><span class="pill ${x.source_type==='Corpus confirmed'?'high':'warn'}">${esc(x.source_type||'')}</span></td><td>${esc(x.subtopic)}</td><td>${x.exam_freq||0}</td><td>${esc(x.years||'—')}</td><td>${esc(x.example_context||'—')}${x.academic_note?`<div class="academic-note small">🎓 ${esc(x.academic_note)}</div>`:''}</td></tr>`).join('');$('#colTable').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Cụm + IPA</th><th>Nghĩa</th><th>Topic / nguồn</th><th>Subtopic</th><th>Freq</th><th>Năm</th><th>Context</th></tr></thead><tbody>${rows}</tbody></table></div><div class="footnote">Learning expansion = collocation chuẩn nên học thêm; không được tính như bằng chứng đã xuất hiện trực tiếp trong đề.</div>`; $$('.speak-col').forEach(b=>b.onclick=()=>speak(b.dataset.term));$$('.slow-col').forEach(b=>b.onclick=()=>speakSlow(b.dataset.term));};
    $('#colSearch').oninput=draw;$('#colTopic').onchange=draw;$('#colSource').onchange=draw;$('#colQuiz').onclick=()=>startQuiz('collocation');$('#goChunks').onclick=()=>navigate('chunks');draw();
  }

  let chunkMode='phrase',chunkIndex=0,chunkPool=[];
  function highlightFocus(text,focus){if(!focus)return esc(text);const safe=esc(text),needle=esc(focus);return safe.replace(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),m=>`<mark>${m}</mark>`);}
  function buildChunkPool(mode){
    if(mode==='phrase')return data.collocations.slice().sort((a,b)=>(b.source_type==='Corpus confirmed')-(a.source_type==='Corpus confirmed')||Number(b.v2_priority||0)-Number(a.v2_priority||0));
    return data.sentences.filter(s=>s.quality!=='low'&&s.focus_term&&s.text&&s.text.length<360);
  }
  function renderChunks(){
    ensureLiveSession(chunkMode==='phrase'?'collocation':'cloze',{surface:'chunks'});
    $('#content').innerHTML=`<div class="toolbar"><label>Chế độ<select id="chunkMode"><option value="phrase">Học theo cụm</option><option value="sentence">Học theo câu</option></select></label><label>Lọc<input class="search" id="chunkSearch" placeholder="audit, financial, tax…"></label><button class="secondary" id="chunkShuffle">Xáo trộn</button></div><div id="chunkArea"></div>`;
    $('#chunkMode').value=chunkMode; const reload=()=>{chunkMode=$('#chunkMode').value;ensureLiveSession(chunkMode==='phrase'?'collocation':'cloze',{surface:'chunks'});const q=norm($('#chunkSearch').value);chunkPool=buildChunkPool(chunkMode).filter(x=>!q||norm(JSON.stringify(x)).includes(q));chunkIndex=0;renderChunkCard();};$('#chunkMode').onchange=reload;$('#chunkSearch').oninput=reload;$('#chunkShuffle').onclick=()=>{chunkPool=shuffled(chunkPool);chunkIndex=0;renderChunkCard();};reload();
  }
  function renderChunkCard(){
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

  let dictSort={key:'v2_priority',dir:-1};
  function renderDictionary(){
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

  let drillState=null;
  function drillPool(mode,year){
    const y=year?Number(year):null;
    const src=mode==='wf'?data.wf:mode==='tr'?data.tr:mode==='tle'?data.tle:mode==='tlv'?data.tlv:[];
    return (y?src.filter(x=>x.year===y):src);
  }
  function renderDrills(){
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
  async function startDrill(mode,year){
    const pool=shuffled(drillPool(mode,year));
    if(!pool.length){$('#drillArea').innerHTML='<div class="card empty">Không có câu nào khớp bộ lọc.</div>';return;}
    drillState={mode,pool,index:0,correct:0,wrong:0,started:Date.now()};
    finishLiveSession();drillState.sessionId=startLocalSession(mode==='wf'?'word_formation':mode==='tr'?'sentence_transform':'translation',{surface:'drills',year:year||null});
    renderDrillItem();
  }
  function renderDrillItem(){
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
  async function finishDrill(){
    const d=drillState; const seconds=Math.round((Date.now()-d.started)/1000);
    finishLocalSession(d.sessionId,{item_count:d.pool.length,correct_count:d.correct,wrong_count:d.wrong,score:d.pool.length?d.correct/d.pool.length*100:0,duration_seconds:seconds});if(currentUser)syncSessions();
    const day=dailyLocal(); day.study_seconds+=seconds; day.reviews+=d.pool.length; day.correct_count+=d.correct; day.wrong_count+=d.wrong; day.updated_at=nowIso(); saveState();if(currentUser)cloudUpsertDaily(day).catch(console.warn);
    $('#drillArea').innerHTML=`<div class="card" style="text-align:center"><div class="study-term">${d.pool.length?Math.round(d.correct/d.pool.length*100):0}%</div><h2>${d.correct}/${d.pool.length} đúng (tự chấm)</h2><p class="muted">Thời gian: ${fmtMin(seconds)}</p><div class="button-row" style="justify-content:center"><button class="primary" id="drillAgain">Làm lại</button></div></div>`;
    $('#drillAgain').onclick=()=>{drillState=null;renderDrills();};
  }
  function makeFamilyQuestion(){
    const f=sample(data.families.filter(x=>String(x.full_study_family||'').includes(','))); const members=String(f.full_study_family||'').split(',').map(s=>s.trim()).filter(x=>norm(x)!==norm(f.root)); const correct=sample(members); const distract=[];
    while(distract.length<3){const other=sample(data.families.filter(x=>x.root!==f.root));const opts=String(other.full_study_family||other.root).split(',').map(s=>s.trim()).filter(Boolean);const o=sample(opts);if(o&&norm(o)!==norm(correct)&&!distract.some(x=>norm(x)===norm(o)))distract.push(o);}
    return {kind:'family',prompt:`Từ nào thuộc word family của “${f.root}”?`,answer:correct,options:shuffled([correct,...distract]),item:f,explain:`Family học: ${f.full_study_family}`};
  }
  function makeCollocationQuestion(){
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
  function makeTopicQuestion(){
    const c=sample(data.core.filter(x=>x.type==='Word'&&x.cpa_subtopic));const correct=c.cpa_subtopic;const pool=unique(data.core.map(x=>x.cpa_subtopic)).filter(x=>x!==correct);return {kind:'word',prompt:`Trong hệ thống V2, “${c.entry}” được ưu tiên vào nhóm CPA nào?`,answer:correct,options:shuffled([correct,...shuffled(pool).slice(0,3)]),item:c,explain:`V2 classification: ${c.entry} → ${c.cpa_subtopic}; freq ${c.exam_freq}, ${c.years_count} năm.`};
  }
  function makeClozeQuestion(){
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
  function makeQuizQuestion(mode){if(mode==='family')return makeFamilyQuestion();if(mode==='collocation')return makeCollocationQuestion();if(mode==='cloze')return makeClozeQuestion();if(mode==='core')return makeTopicQuestion();return sample([makeFamilyQuestion,makeCollocationQuestion,makeTopicQuestion,makeClozeQuestion])();}
  const SESSION_MODES=new Set(['vocabulary','word_family','collocation','cloze','mock_exam','review','word_formation','sentence_transform','translation']);
  async function createCloudSession(mode){if(!db||!currentUser)return null;const m=SESSION_MODES.has(mode)?mode:(mode==='family'?'word_family':mode==='core'?'vocabulary':'review');const {data:r,error}=await db.from('study_sessions').insert({user_id:currentUser.id,mode:m,item_count:0}).select().single();if(error){console.warn(error);return null;}return r.id;}
  async function finishCloudSession(id,result){if(!id||!db||!currentUser)return;await db.from('study_sessions').update({ended_at:nowIso(),item_count:result.total,correct_count:result.correct,wrong_count:result.total-result.correct,score:result.total?result.correct/result.total*100:0,duration_seconds:result.seconds||0}).eq('id',id).eq('user_id',currentUser.id);}
  async function startQuiz(mode='mixed'){
    finishLiveSession();quiz={mode,index:0,total:10,correct:0,started:Date.now(),current:null,answered:false};quizSessionId=startLocalSession(mode==='family'?'word_family':mode==='core'?'vocabulary':mode==='collocation'?'collocation':mode==='cloze'?'cloze':'review',{surface:'quiz'});liveSessionId=quizSessionId;navigate('quiz',false);renderQuiz();
  }
  function renderQuizLanding(){
    $('#content').innerHTML=`<div class="grid three"><div class="card"><h2>Core CPA</h2><p class="muted">Nhận diện nhóm nghiệp vụ từ nhãn V2.</p><button class="primary quiz-start" data-mode="core">Bắt đầu 10 câu</button></div><div class="card"><h2>Word Family</h2><p class="muted">Chọn dạng từ thuộc cùng family.</p><button class="primary quiz-start" data-mode="family">Bắt đầu 10 câu</button></div><div class="card"><h2>Collocation</h2><p class="muted">Luyện collocation bằng ngữ cảnh câu đề hoặc đối chiếu nghĩa; nguồn corpus/mở rộng được gắn nhãn rõ.</p><button class="primary quiz-start" data-mode="collocation">Bắt đầu 10 câu</button></div><div class="card"><h2>Điền từ câu corpus</h2><p class="muted">Quiz chỉ dùng các câu khớp trực tiếp OCR của đề và đã qua bộ lọc chất lượng; không dùng câu tự dựng.</p><button class="primary quiz-start" data-mode="cloze">Bắt đầu 10 câu</button></div></div><div class="notice" style="margin-top:14px">Quiz tự chấm này được sinh từ cấu trúc dữ liệu V2, không phải “đáp án chính thức” của đề thi gốc.</div>`;$$('.quiz-start').forEach(b=>b.onclick=()=>startQuiz(b.dataset.mode));
  }
  function renderQuiz(){
    if(!quiz){renderQuizLanding();return;} if(quiz.index>=quiz.total){return finishQuiz();} if(!quiz.current)quiz.current=makeQuizQuestion(quiz.mode);
    const q=quiz.current;$('#content').innerHTML=`<div class="card quiz-box"><div class="section-head"><div><span class="pill">${esc(quiz.mode)}</span> <span class="muted small">Câu ${quiz.index+1}/${quiz.total}</span></div><strong>${quiz.correct} đúng</strong></div><div class="progressbar"><span style="width:${quiz.index/quiz.total*100}%"></span></div><div class="quiz-question">${esc(q.prompt)}</div><div class="options">${q.options.map(o=>`<button class="option" data-option="${esc(o)}">${esc(o)}</button>`).join('')}</div><div id="quizExplain" class="source-box hidden"></div><button id="nextQuiz" class="primary hidden" style="margin-top:14px">Câu tiếp theo →</button></div>`;
    $$('.option').forEach(b=>b.onclick=async()=>{if(quiz.answered)return;quiz.answered=true;const ok=norm(b.dataset.option)===norm(q.answer);if(ok){b.classList.add('correct');quiz.correct++;}else{b.classList.add('wrong');$$('.option').find(x=>norm(x.dataset.option)===norm(q.answer))?.classList.add('correct');}const e=$('#quizExplain');e.textContent=q.explain;e.classList.remove('hidden');$('#nextQuiz').classList.remove('hidden');await recordReview(q.kind==='cloze'?'question':q.kind,q.item,ok?4:1,8);});
    $('#nextQuiz').onclick=()=>{quiz.index++;quiz.current=null;quiz.answered=false;renderQuiz();};
  }
  async function finishQuiz(){const r={total:quiz.total,correct:quiz.correct,seconds:Math.round((Date.now()-quiz.started)/1000)};finishLocalSession(quizSessionId,{item_count:r.total,correct_count:r.correct,wrong_count:r.total-r.correct,score:r.correct/r.total*100,duration_seconds:r.seconds});liveSessionId=null;if(currentUser)syncSessions();const pct=Math.round(r.correct/r.total*100);quiz=null;quizSessionId=null;$('#content').innerHTML=`<div class="card quiz-box" style="text-align:center"><div class="study-term">${pct}%</div><h2>${r.correct}/${r.total} câu đúng</h2><p class="muted">Thời gian: ${Math.round(r.seconds/60)} phút</p><div class="button-row" style="justify-content:center"><button class="primary" id="againQuiz">Làm lại</button><button class="secondary" id="goWeak">Ôn mục yếu</button></div></div>`;$('#againQuiz').onclick=()=>renderQuizLanding();$('#goWeak').onclick=()=>navigate('weak');}

  function renderExams(){
    const years=data.exams.map(x=>x.year).sort((a,b)=>b-a);const current=years[0];
    $('#content').innerHTML=`<div class="toolbar"><label>Năm<select id="examYear">${years.map(y=>`<option>${y}</option>`).join('')}</select></label><label>Tìm trong đề<input class="search" id="examSearch" placeholder="ví dụ: audit, financial…"></label><button class="secondary" id="resetTimer">Reset 90:00</button><div class="timer" id="timer">90:00</div></div><div class="notice">Đề hiển thị từ OCR scan. Corpus hiện không cung cấp đáp án chính thức đầy đủ, vì vậy app lưu bài làm và điểm tự chấm; không tự gán đúng/sai cho đề gốc.</div><div id="examArea" style="margin-top:14px"></div>`;
    $('#examYear').value=current;$('#examYear').onchange=()=>drawExam(Number($('#examYear').value));$('#resetTimer').onclick=()=>startExamTimer(90*60);
    $('#examSearch').oninput=()=>highlightExam($('#examSearch').value);
    drawExam(current);startExamTimer(90*60);
  }
  function highlightExam(q){
    const box=$('.exam-paper'); if(!box||!examRawText)return;
    if(!q||q.trim().length<2){box.innerHTML=esc(examRawText);return;}
    const re=new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');
    box.innerHTML=esc(examRawText).replace(re,m=>`<mark>${m}</mark>`);
  }
  function startExamTimer(sec){clearInterval(examTimer);examRemaining=sec;const tick=()=>{const m=Math.floor(examRemaining/60),s=examRemaining%60;const el=$('#timer');if(el)el.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;if(examRemaining<=0){clearInterval(examTimer);toast('Hết 90 phút.');}examRemaining--;};tick();examTimer=setInterval(tick,1000);}
  function drawExam(year){const e=data.exams.find(x=>x.year===year),draft=JSON.parse(localStorage.getItem(EXAM_DRAFT_PREFIX+year)||'{}');examRawText=e.text;$('#examArea').innerHTML=`<div class="exam-layout"><div class="exam-paper">${esc(e.text)}</div><div class="card exam-pad"><h3>Bài làm / ghi chú</h3><textarea id="examAnswers" placeholder="Ghi đáp án theo số câu, ví dụ: 1. consume\n2. compatriot…">${esc(draft.answers||'')}</textarea><div class="grid two" style="margin-top:10px"><label class="field">Điểm tự chấm<input id="examScore" type="number" min="0" step="0.25" value="${draft.score??''}"></label><label class="field">Điểm tối đa<input id="examMax" type="number" min="1" step="0.25" value="${draft.max_score??10}"></label></div><div class="button-row" style="margin-top:10px"><button class="secondary" id="saveExamDraft">Lưu nháp</button><button class="primary" id="submitExam">Kết thúc & lưu lịch sử</button></div><div class="source-box">Nguồn: OCR đề ${year}; thời gian gốc: 90 phút.</div></div></div>`;
    const save=()=>{localStorage.setItem(EXAM_DRAFT_PREFIX+year,JSON.stringify({answers:$('#examAnswers').value,score:$('#examScore').value,max_score:$('#examMax').value,updated_at:nowIso()}));toast('Đã lưu nháp trên thiết bị.');};$('#saveExamDraft').onclick=save;$('#examAnswers').oninput=()=>localStorage.setItem(EXAM_DRAFT_PREFIX+year,JSON.stringify({answers:$('#examAnswers').value,score:$('#examScore').value,max_score:$('#examMax').value,updated_at:nowIso()}));$('#submitExam').onclick=()=>submitExam(year);
    if($('#examSearch')&&$('#examSearch').value) highlightExam($('#examSearch').value);
  }
  async function submitExam(year){
    const score=Number($('#examScore').value||0),max=Number($('#examMax').value||10),answers=$('#examAnswers').value,duration=Math.max(0,90*60-Math.max(0,examRemaining));const pct=max?score/max*100:0;const day=dailyLocal();day.exam_attempts=(day.exam_attempts||0)+1;day.best_exam_score=day.best_exam_score==null?pct:Math.max(Number(day.best_exam_score),pct);day.study_seconds+=duration;day.updated_at=nowIso();const examSession=appendCompletedSession('mock_exam',{total:1,correct:pct>=60?1:0,wrong:pct>=60?0:1,seconds:duration,score:pct,started_at:new Date(Date.now()-duration*1000).toISOString()},{exam_year:year,self_scored:true});saveState();
    queueEvent({type:'exam_submit',itemKey:`exam:${year}`,itemType:'question',correct:pct>=60,seconds:duration,sessionId:examSession?.id||null,metadata:{exam_year:year,score:pct,self_scored:true}});localStorage.setItem(EXAM_DRAFT_PREFIX+year,JSON.stringify({answers,score,max_score:max,updated_at:nowIso()}));
    if(currentUser&&db){const {error}=await db.from('exam_attempts').insert({user_id:currentUser.id,exam_key:`cpa-english-${year}-ocr`,exam_year:year,submitted_at:nowIso(),score,max_score:max,duration_seconds:duration,answers:{free_text:answers},metadata:{scoring:'self-scored; no official answer key in source corpus'}});if(error)toast('Lưu cloud lỗi: '+error.message);else await cloudUpsertDaily(day);}toast(`Đã lưu bài ${year}: ${score}/${max} (${Math.round(pct)}%).`);navigate('dashboard');
  }

  function renderWeak(){
    const rows=Object.values(state.progress).filter(p=>Number(p.wrong_count||0)>0||Number(p.lapses||0)>0||due(p)).sort((a,b)=>weaknessScore(b)-weaknessScore(a));
    const avg=rows.length?Math.round(rows.reduce((s,p)=>s+weaknessScore(p),0)/rows.length):0;
    $('#content').innerHTML=`<div class="grid kpis"><div class="card kpi"><div class="label">Mục cần chú ý</div><div class="value warning">${rows.length}</div></div><div class="card kpi"><div class="label">Weakness trung bình</div><div class="value">${avg}/100</div></div><div class="card kpi"><div class="label">Sai ≥2 lần</div><div class="value bad">${rows.filter(p=>Number(p.wrong_count||0)>=2).length}</div></div><div class="card kpi"><div class="label">Đang đến hạn</div><div class="value accent">${rows.filter(due).length}</div></div></div>
      <div class="card" style="margin-top:14px"><div class="section-head"><div><h2>Danh sách ưu tiên ôn</h2><p class="muted small">Score kết hợp tỷ lệ sai, lapse, quá hạn và thời gian phản hồi.</p></div><button class="primary" id="reviewWeak">Ôn đúng danh sách này</button></div><div class="table-wrap"><table><thead><tr><th>Weak score</th><th>Mục</th><th>Loại</th><th>Topic</th><th>Đúng</th><th>Sai</th><th>Lapse</th><th>Due</th></tr></thead><tbody>${rows.slice(0,300).map(p=>`<tr><td><span class="weak-score">${weaknessScore(p)}</span></td><td><b>${esc(p.item_key)}</b></td><td>${esc(p.item_type)}</td><td>${esc(p.topic||'')}</td><td>${p.correct_count||0}</td><td>${p.wrong_count||0}</td><td>${p.lapses||0}</td><td>${fmtDate(p.due_at)}</td></tr>`).join('')||'<tr><td colspan="8">Chưa có mục yếu.</td></tr>'}</tbody></table></div></div>`;
    $('#reviewWeak').onclick=()=>{state.settings.studyMode='weak';state.settings.topic='';saveState();navigate('study');};
  }

  function renderSettings(){
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
      const owner=state.ownerId;state=defaultState();state.ownerId=owner;saveState();
      toast('Đã xoá tiến trình trên máy.');navigate('settings');
    };
    if($('#deleteAccount'))$('#deleteAccount').onclick=deleteAccount;
  }

  async function deleteAccount(){
    if(!db||!currentUser)return;
    const typed=prompt(`Hành động này KHÔNG thể hoàn tác: xoá tài khoản ${currentUser.email} cùng toàn bộ tiến trình trên máy chủ.\n\nGõ chính xác XOA TAI KHOAN để xác nhận:`);
    if(typed!=='XOA TAI KHOAN')return toast('Đã huỷ.');
    try{
      const {error}=await db.rpc('delete_my_account');
      if(error)throw error;
      try{localStorage.removeItem(stateStorageKey());}catch{}
      await db.auth.signOut();
      currentUser=null;profile=null;switchStateScope(null);updateAuthUI();
      toast('Đã xoá tài khoản và toàn bộ dữ liệu trên máy chủ.');
      navigate('dashboard');
    }catch(e){
      toast(/function|does not exist/i.test(String(e.message))
        ? 'Máy chủ chưa cài hàm delete_my_account (chạy migration V7 trong supabase/schema.sql).'
        : 'Xoá tài khoản lỗi: '+e.message);
    }
  }
  function exportState(){const blob=new Blob([JSON.stringify({exported_at:nowIso(),data_version:CFG.dataVersion,state},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`cpa-progress-${dateKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  async function importState(ev){const file=ev.target.files?.[0];if(!file)return;try{const obj=JSON.parse(await file.text());state=mergeState(obj.state||obj);state.ownerId=currentUser?.id||null;saveState();toast('Import thành công.');renderSettings();if(currentUser)syncAll();}catch(e){toast('File backup không hợp lệ.');}}

  async function navigate(view,resetQuiz=true){
    const prevView=activeView;if(prevView!==view&&(prevView==='study'||prevView==='chunks'))finishLiveSession();
    activeView=view;setTitle(view);$$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#sidebar').classList.remove('open');$('#menuButton')?.setAttribute('aria-expanded','false');closeUserMenu();
    if(view!=='exams'){clearInterval(examTimer);examTimer=null;}
    if(view!=='quiz'&&resetQuiz){if(quizSessionId)finishLocalSession(quizSessionId);quiz=null;quizSessionId=null;if(prevView==='quiz')liveSessionId=null;}
    if(view!=='drills'){if(drillState?.sessionId)finishLocalSession(drillState.sessionId);drillState=null;}
    location.hash=view==='dashboard'?'':view;
    if(!await ensureViewData(view))return;
    if(activeView!==view)return; // người dùng đã chuyển tab khác trong lúc chờ tải
    ({dashboard:renderDashboard,history:renderHistory,study:renderStudy,families:renderFamilies,collocations:renderCollocations,chunks:renderChunks,dictionary:renderDictionary,quiz:()=>quiz?renderQuiz():renderQuizLanding(),drills:renderDrills,exams:renderExams,weak:renderWeak,settings:renderSettings}[view]||renderDashboard)();
  }

  /* ==================== V7 AUTH / IDENTITY ==================== */

  let authTab='signin';
  let recoveryMode=false;

  const AUTH_ERRORS={
    'Invalid login credentials':'Email hoặc mật khẩu không đúng.',
    'Email not confirmed':'Email chưa được xác nhận. Kiểm tra hộp thư (cả mục Spam) hoặc bấm "Gửi lại email xác nhận".',
    'User already registered':'Email này đã có tài khoản. Chuyển sang tab Đăng nhập.',
    'Password should be at least 6 characters':`Mật khẩu tối thiểu ${CFG.minPasswordLength||8} ký tự.`,
    'For security purposes, you can only request this after':'Bạn thao tác quá nhanh. Đợi khoảng 1 phút rồi thử lại.',
    'Email rate limit exceeded':'Đã gửi quá nhiều email. Thử lại sau ít phút.',
    'Signups not allowed for this instance':'Dự án Supabase đang tắt đăng ký. Bật lại ở Authentication → Providers.'
  };
  function authError(msg=''){
    for(const [k,v] of Object.entries(AUTH_ERRORS)) if(msg.includes(k)) return v;
    return msg||'Có lỗi xảy ra, thử lại sau.';
  }
  function authMsg(text,kind=''){const el=$('#authMessage');el.className=`form-message ${kind}`;el.textContent=text;}

  function passwordScore(pw){
    if(!pw)return 0;
    let s=0;
    if(pw.length>=8)s++;
    if(pw.length>=12)s++;
    if(/[a-z]/.test(pw)&&/[A-Z]/.test(pw))s++;
    if(/\d/.test(pw)&&/[^A-Za-z0-9]/.test(pw))s++;
    return clamp(s,0,4);
  }
  function renderPwMeter(){
    const pw=$('#authPassword').value,s=passwordScore(pw);
    $('#pwMeter').className=`pw-meter s${s}`;
    $('#pwHint').textContent=authTab==='signup'?(['','Quá yếu','Tạm được','Khá','Mạnh'][s]||''):'';
  }

  function setAuthTab(tab){
    authTab=tab;recoveryMode=false;
    $$('#authTabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    const isReset=tab==='reset',isSignup=tab==='signup';
    $('#authTitle').textContent=isReset?'Đặt lại mật khẩu':isSignup?'Tạo tài khoản':'Đăng nhập';
    $('#authSubmit').textContent=isReset?'Gửi link đặt lại':isSignup?'Tạo tài khoản':'Đăng nhập';
    $('#fieldName').classList.toggle('hidden',!isSignup);
    $('#fieldTerms').classList.toggle('hidden',!isSignup);
    $('#fieldPassword').classList.toggle('hidden',isReset);
    $('#oauthRow').classList.toggle('hidden',isReset);
    $('#orLine').classList.toggle('hidden',isReset);
    $('#resendConfirm').classList.add('hidden');
    $('#authPassword').setAttribute('autocomplete',isSignup?'new-password':'current-password');
    $('#authIntro').textContent=isReset
      ? 'Nhập email đã đăng ký. Chúng tôi gửi link đặt lại mật khẩu; mở link đó ngay trên trình duyệt này.'
      : isSignup
        ? 'Tạo tài khoản để đồng bộ tiến trình SRS, lịch sử phiên học và mục tiêu giữa các thiết bị.'
        : 'Không đăng nhập vẫn học được bình thường. Đăng nhập để đồng bộ tiến trình giữa điện thoại và máy tính.';
    authMsg('');renderPwMeter();
  }

  function openAuth(tab='signin'){
    if(!db) authMsg('Chưa kết nối được máy chủ. Bạn vẫn học và lưu tiến trình trên máy này bình thường.','');
    setAuthTab(tab);
    if(!db)authMsg('Chưa kết nối được máy chủ. Bạn vẫn học và lưu tiến trình trên máy này bình thường.','');
    $('#authEmail').value=$('#authEmail').value||currentUser?.email||'';
    $('#authPassword').value='';
    closeUserMenu();
    $('#authDialog').showModal();
    setTimeout(()=>$('#authEmail').focus(),50);
  }

  function openRecovery(){
    setAuthTab('signin');recoveryMode=true;
    $('#authTitle').textContent='Đặt mật khẩu mới';
    $('#authIntro').textContent='Nhập mật khẩu mới cho tài khoản của bạn.';
    $('#authSubmit').textContent='Lưu mật khẩu mới';
    $('#fieldPassword').classList.remove('hidden');
    $('#oauthRow').classList.add('hidden');$('#orLine').classList.add('hidden');
    $('#authEmail').closest('label').classList.add('hidden');
    $('#authPassword').setAttribute('autocomplete','new-password');
    $('#authDialog').showModal();
    setTimeout(()=>$('#authPassword').focus(),50);
  }

  async function submitAuth(){
    if(!db)return toast('Chưa kết nối được máy chủ. Thử lại khi có mạng.');
    const email=$('#authEmail').value.trim(),password=$('#authPassword').value;
    const minLen=CFG.minPasswordLength||8;
    const btn=$('#authSubmit');btn.disabled=true;
    try{
      if(recoveryMode){
        if(password.length<minLen)return authMsg(`Mật khẩu tối thiểu ${minLen} ký tự.`,'err');
        authMsg('Đang cập nhật…');
        const {error}=await db.auth.updateUser({password});
        if(error)return authMsg(authError(error.message),'err');
        recoveryMode=false;history.replaceState(null,'',location.pathname+location.hash);
        authMsg('Đã đổi mật khẩu. Bạn đang đăng nhập.','ok');
        setTimeout(()=>$('#authDialog').close(),900);
        return;
      }
      if(authTab==='reset'){
        if(!email)return authMsg('Nhập email trước đã.','err');
        authMsg('Đang gửi link…');
        const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:CFG.authRedirectUrl});
        if(error)return authMsg(authError(error.message),'err');
        return authMsg('Đã gửi link đặt lại. Mở email và bấm link ngay trên trình duyệt này.','ok');
      }
      if(!email||!password)return authMsg('Nhập đủ email và mật khẩu.','err');

      if(authTab==='signup'){
        if(password.length<minLen)return authMsg(`Mật khẩu tối thiểu ${minLen} ký tự.`,'err');
        if(!$('#authAgree').checked)return authMsg('Cần tích ô xác nhận trước khi tạo tài khoản.','err');
        authMsg('Đang tạo tài khoản…');
        const display_name=$('#authName').value.trim()||email.split('@')[0];
        const {data:res,error}=await db.auth.signUp({email,password,options:{emailRedirectTo:CFG.authRedirectUrl,data:{display_name}}});
        if(error)return authMsg(authError(error.message),'err');
        if(res.session){authMsg('Tạo tài khoản thành công.','ok');setTimeout(()=>$('#authDialog').close(),800);}
        else{authMsg('Đã tạo tài khoản. Mở email để xác nhận rồi quay lại đăng nhập.','ok');$('#resendConfirm').classList.remove('hidden');}
        return;
      }

      authMsg('Đang đăng nhập…');
      const {error}=await db.auth.signInWithPassword({email,password});
      if(error){
        authMsg(authError(error.message),'err');
        if(error.message.includes('Email not confirmed'))$('#resendConfirm').classList.remove('hidden');
        return;
      }
      authMsg('Đăng nhập thành công.','ok');
      setTimeout(()=>$('#authDialog').close(),500);
    }catch(e){authMsg(authError(e.message||String(e)),'err');}
    finally{btn.disabled=false;}
  }

  async function oauthSignIn(provider){
    if(!db)return toast('Chưa kết nối được máy chủ.');
    authMsg(`Đang chuyển sang ${provider}…`);
    const {error}=await db.auth.signInWithOAuth({provider,options:{redirectTo:CFG.authRedirectUrl}});
    if(error)authMsg(`${authError(error.message)} (Provider "${provider}" có thể chưa được bật trong Supabase.)`,'err');
  }

  async function resendConfirm(){
    if(!db)return;
    const email=$('#authEmail').value.trim();
    if(!email)return authMsg('Nhập email trước đã.','err');
    const {error}=await db.auth.resend({type:'signup',email,options:{emailRedirectTo:CFG.authRedirectUrl}});
    authMsg(error?authError(error.message):'Đã gửi lại email xác nhận.',error?'err':'ok');
  }

  async function signOut(){
    if(!db)return;
    finishLiveSession();
    await flushEventQueue().catch(()=>{});
    stopRealtime();
    await db.auth.signOut();
    currentUser=null;profile=null;
    switchStateScope(null);
    updateAuthUI();closeUserMenu();
    toast('Đã đăng xuất. Đang dùng hồ sơ khách trên máy này.');
    navigate('dashboard');
  }

  /* ---------- Xử lý link xác nhận email / đặt lại mật khẩu ---------- */
  async function handleAuthCallback(){
    const hash=location.hash.slice(1);
    const search=new URLSearchParams(location.search);
    const hp=new URLSearchParams(hash.includes('=')?hash:'');
    const err=hp.get('error_description')||search.get('error_description');
    if(err){toast(decodeURIComponent(err).slice(0,140));history.replaceState(null,'',location.pathname);return;}
    const type=hp.get('type')||search.get('type');
    if(type==='recovery'){
      // Supabase SDK (detectSessionInUrl) đã đổi token thành session; chỉ cần mở form đổi mật khẩu.
      history.replaceState(null,'',location.pathname);
      setTimeout(openRecovery,300);
      return;
    }
    if(type==='signup'||type==='magiclink'||hp.get('access_token')){
      history.replaceState(null,'',location.pathname);
      toast('Xác nhận email thành công. Tiến trình sẽ được đồng bộ.');
    }
  }

  /* ---------- Hồ sơ người dùng ---------- */
  function initials(name,email){
    const src=(name||email||'?').trim();
    const parts=src.split(/[\s._-]+/).filter(Boolean);
    if(parts.length>=2)return (parts[0][0]+parts[parts.length-1][0]).toUpperCase();
    return src.slice(0,2).toUpperCase();
  }
  function displayName(){
    return profile?.display_name || currentUser?.user_metadata?.display_name || currentUser?.user_metadata?.full_name || currentUser?.email?.split('@')[0] || 'Khách';
  }
  async function loadProfile(){
    if(!db||!currentUser){profile=null;return;}
    try{
      const {data:row}=await db.from('profiles').select('*').eq('user_id',currentUser.id).maybeSingle();
      profile=row||null;
      if(!profile){
        const seed={user_id:currentUser.id,display_name:displayName(),avatar_hue:Math.abs(hashCode(currentUser.id))%361};
        const {data:created}=await db.from('profiles').upsert(seed,{onConflict:'user_id'}).select().maybeSingle();
        profile=created||seed;
      }
      if(profile){
        state.settings.dailyMinutesGoal=Number(profile.daily_minutes_goal??state.settings.dailyMinutesGoal??30);
        state.settings.dailyReviewsGoal=Number(profile.daily_reviews_goal??state.settings.dailyReviewsGoal??30);
        state.settings.newPerDay=Number(profile.daily_new_items_goal??state.settings.newPerDay??15);
        state.settings.targetExamDate=profile.target_exam_date||state.settings.targetExamDate||'';
        saveState();
      }
      db.from('profiles').update({last_seen_at:nowIso(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||null}).eq('user_id',currentUser.id).then(()=>{},()=>{});
    }catch(e){console.warn('Profile load skipped:',e.message);}
  }
  const hashCode=s=>{let h=0;for(let i=0;i<s.length;i++){h=(h<<5)-h+s.charCodeAt(i);h|=0;}return h;};

  function openProfile(){
    closeUserMenu();
    const hue=profile?.avatar_hue??210;
    $('#profileName').value=profile?.display_name||displayName();
    $('#profileHue').value=hue;
    $('#profileAvatar').textContent=initials($('#profileName').value,currentUser?.email);
    $('#profileAvatar').style.setProperty('--avatar-hue',hue);
    $('#profileMinutes').value=state.settings.dailyMinutesGoal||30;
    $('#profileReviews').value=state.settings.dailyReviewsGoal||30;
    $('#profileNew').value=state.settings.newPerDay??15;
    $('#profileExamDate').value=state.settings.targetExamDate||'';
    $('#profileScope').textContent=currentUser
      ? `Tài khoản: ${currentUser.email}. Mục tiêu được lưu lên máy chủ và áp dụng trên mọi thiết bị.`
      : 'Bạn đang ở chế độ khách. Tên hiển thị và mục tiêu chỉ lưu trên máy này; đăng nhập để đồng bộ.';
    $('#profileName').closest('.profile-head').classList.toggle('hidden',false);
    $('#profileMessage').textContent='';
    $('#profileDialog').showModal();
  }
  async function saveProfile(){
    const name=$('#profileName').value.trim().slice(0,60);
    const hue=Number($('#profileHue').value||210);
    state.settings.dailyMinutesGoal=clamp(Number($('#profileMinutes').value||30),5,240);
    state.settings.dailyReviewsGoal=clamp(Number($('#profileReviews').value||30),5,300);
    state.settings.newPerDay=clamp(Number($('#profileNew').value||0),0,50);
    state.settings.targetExamDate=$('#profileExamDate').value||'';
    state.settings.guestName=currentUser?state.settings.guestName:(name||'');
    state.settingsUpdatedAt=nowIso();saveState();
    if(currentUser&&db){
      profile={...(profile||{}),display_name:name||displayName(),avatar_hue:hue};
      const {error}=await db.from('profiles').upsert({
        user_id:currentUser.id,display_name:profile.display_name,avatar_hue:hue,
        daily_minutes_goal:state.settings.dailyMinutesGoal,daily_reviews_goal:state.settings.dailyReviewsGoal,
        daily_new_items_goal:state.settings.newPerDay,target_exam_date:state.settings.targetExamDate||null,
        timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||null,updated_at:nowIso()
      },{onConflict:'user_id'});
      if(error){$('#profileMessage').className='form-message err';$('#profileMessage').textContent='Lưu lên máy chủ lỗi: '+error.message;return;}
    }
    updateAuthUI();
    $('#profileDialog').close();
    toast('Đã lưu hồ sơ và mục tiêu.');
    if(['dashboard','settings'].includes(activeView))navigate(activeView);
  }

  /* ---------- Menu người dùng ---------- */
  function closeUserMenu(){const d=$('#userDropdown');if(d){d.classList.add('hidden');$('#userMenuBtn')?.setAttribute('aria-expanded','false');}}
  function toggleUserMenu(){
    const d=$('#userDropdown'),open=d.classList.contains('hidden');
    d.classList.toggle('hidden',!open);
    $('#userMenuBtn').setAttribute('aria-expanded',String(open));
    if(open)renderUserMenuStats();
  }
  function renderUserMenuStats(){
    const m=masteryStats(),s=streak();
    $('#menuStats').innerHTML=`
      <div><b>${m.tracked}</b><small>ĐANG HỌC</small></div>
      <div><b class="good">${m.mastered}</b><small>THUỘC</small></div>
      <div><b class="accent">${s}</b><small>NGÀY LIÊN TIẾP</small></div>`;
  }

  function updateAuthUI(){
    const name=currentUser?displayName():(state.settings.guestName||'Khách');
    const hue=currentUser?(profile?.avatar_hue??210):215;
    const ini=currentUser?initials(name,currentUser.email):'👤';
    const btn=$('#avatarInitial'),wrap=$('#userMenuBtn');
    btn.textContent=ini;
    wrap.style.setProperty('--avatar-hue',hue);
    wrap.classList.toggle('guest',!currentUser);
    const big=$('#avatarLarge');big.textContent=ini;big.style.setProperty('--avatar-hue',hue);big.classList.toggle('guest',!currentUser);
    $('#menuName').textContent=name;
    $('#menuEmail').textContent=currentUser?currentUser.email:'Chưa đăng nhập — dữ liệu chỉ lưu trên máy này';
    $('#menuAuth').classList.toggle('hidden',!!currentUser);
    $('#menuSignOut').classList.toggle('hidden',!currentUser);
    $('#menuSync').classList.toggle('hidden',!currentUser);
    $('#authButton').textContent=currentUser?'Tài khoản & đồng bộ':'Đăng nhập / Đăng ký';
    refreshSyncBadge();
  }

  /* ---------- Chuyển tiến trình khách vào tài khoản (có hỏi ý kiến) ---------- */
  function guestStateSummary(){
    try{
      const raw=localStorage.getItem(`${LS_KEY_BASE}:guest`);
      if(!raw)return null;
      const g=mergeState(JSON.parse(raw));
      const items=Object.keys(g.progress||{}).length,sessions=Object.keys(g.sessions||{}).length;
      const secs=Object.values(g.daily||{}).reduce((s,d)=>s+Number(d.study_seconds||0),0);
      if(!items&&!sessions)return null;
      return {state:g,items,sessions,minutes:Math.round(secs/60)};
    }catch{return null;}
  }
  async function maybeOfferGuestMerge(){
    if(!currentUser)return;
    const askedKey=`${LS_KEY_BASE}:merge_asked:${currentUser.id}`;
    if(localStorage.getItem(askedKey))return;
    const g=guestStateSummary();
    if(!g)return;
    localStorage.setItem(askedKey,'1');
    $('#mergeSummary').textContent=`Trên máy này có tiến trình học ở chế độ khách: ${g.items} mục SRS, ${g.sessions} phiên học, khoảng ${g.minutes} phút. Bạn có muốn gộp vào tài khoản ${currentUser.email}?`;
    $('#mergeDialog').showModal();
    $('#mergeYes').onclick=async()=>{
      $('#mergeDialog').close();
      mergeGuestInto(g.state);
      localStorage.removeItem(`${LS_KEY_BASE}:guest`);
      toast('Đã gộp tiến trình khách vào tài khoản.');
      await syncAll();
      navigate(activeView);
    };
    $('#mergeNo').onclick=()=>{$('#mergeDialog').close();toast('Giữ nguyên. Hồ sơ khách vẫn nằm riêng trên máy này.');};
  }
  function mergeGuestInto(guest){
    // SRS: giữ bản có last_reviewed_at mới hơn; đếm lượt thì cộng dồn.
    for(const [id,gp] of Object.entries(guest.progress||{})){
      const cur=state.progress[id];
      if(!cur){state.progress[id]=gp;continue;}
      const gTime=Date.parse(gp.last_reviewed_at||gp.updated_at||0),cTime=Date.parse(cur.last_reviewed_at||cur.updated_at||0);
      const base=gTime>cTime?gp:cur;
      state.progress[id]={...base,
        correct_count:Number(cur.correct_count||0)+Number(gp.correct_count||0),
        wrong_count:Number(cur.wrong_count||0)+Number(gp.wrong_count||0),
        lapses:Math.max(Number(cur.lapses||0),Number(gp.lapses||0)),
        total_time_seconds:Number(cur.total_time_seconds||0)+Number(gp.total_time_seconds||0),
        updated_at:nowIso()};
    }
    for(const [day,gd] of Object.entries(guest.daily||{})){
      const cur=state.daily[day];
      if(!cur){state.daily[day]={...gd,updated_at:nowIso()};continue;}
      state.daily[day]={reviews:Number(cur.reviews||0)+Number(gd.reviews||0),new_items:Number(cur.new_items||0)+Number(gd.new_items||0),
        correct_count:Number(cur.correct_count||0)+Number(gd.correct_count||0),wrong_count:Number(cur.wrong_count||0)+Number(gd.wrong_count||0),
        study_seconds:Number(cur.study_seconds||0)+Number(gd.study_seconds||0),exam_attempts:Number(cur.exam_attempts||0)+Number(gd.exam_attempts||0),
        best_exam_score:Math.max(Number(cur.best_exam_score||0),Number(gd.best_exam_score||0))||null,updated_at:nowIso()};
    }
    for(const [id,gs] of Object.entries(guest.sessions||{})) if(!state.sessions[id]) state.sessions[id]={...gs,synced:false};
    saveState();
  }

  function wireUI(){
    $$('#nav button').forEach(b=>b.onclick=()=>navigate(b.dataset.view));
    $('#menuButton').onclick=()=>{const open=$('#sidebar').classList.toggle('open');$('#menuButton').setAttribute('aria-expanded',String(open));};
    $('#authButton').onclick=()=>currentUser?openProfile():openAuth('signin');
    $('#quickSync').onclick=()=>currentUser?syncAll():openAuth('signin');

    // Menu người dùng
    $('#userMenuBtn').onclick=e=>{e.stopPropagation();toggleUserMenu();};
    document.addEventListener('click',e=>{if(!e.target.closest('.user-menu'))closeUserMenu();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeUserMenu();});
    $('#menuProfile').onclick=openProfile;
    $('#menuSync').onclick=()=>{closeUserMenu();syncAll();};
    $('#menuSettings').onclick=()=>navigate('settings');
    $('#menuAuth').onclick=()=>openAuth('signin');
    $('#menuSignOut').onclick=signOut;

    // Hộp thoại đăng nhập
    $$('#authTabs button').forEach(b=>b.onclick=()=>setAuthTab(b.dataset.tab));
    $('#authClose').onclick=()=>$('#authDialog').close();
    $('#authSubmit').onclick=submitAuth;
    $('#resendConfirm').onclick=resendConfirm;
    $('#continueGuest').onclick=()=>{$('#authDialog').close();toast('Đang học ở chế độ khách. Tiến trình lưu trên máy này.');};
    $('#authPassword').oninput=renderPwMeter;
    $('#togglePassword').onclick=()=>{const i=$('#authPassword');i.type=i.type==='password'?'text':'password';$('#togglePassword').textContent=i.type==='password'?'👁':'🙈';};
    [$('#authEmail'),$('#authPassword'),$('#authName')].forEach(el=>el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();submitAuth();}}));
    const providers=CFG.oauthProviders||[];
    $$('#oauthRow .oauth').forEach(b=>{
      if(!providers.includes(b.dataset.provider)){b.remove();return;}
      b.onclick=()=>oauthSignIn(b.dataset.provider);
    });
    if(!$('#oauthRow').children.length){$('#oauthRow').classList.add('hidden');$('#orLine').classList.add('hidden');}

    // Hồ sơ
    $('#profileClose').onclick=()=>$('#profileDialog').close();
    $('#profileSave').onclick=saveProfile;
    $('#profileHue').oninput=e=>$('#profileAvatar').style.setProperty('--avatar-hue',e.target.value);
    $('#profileName').oninput=e=>$('#profileAvatar').textContent=initials(e.target.value,currentUser?.email);

    // Trạng thái mạng
    window.addEventListener('online',()=>{$('#offlineBanner')?.remove();if(currentUser)syncAll();});
    window.addEventListener('offline',()=>{
      if($('#offlineBanner'))return;
      const el=document.createElement('div');el.id='offlineBanner';el.className='offline-banner';
      el.textContent='Mất mạng — vẫn học được, tiến trình sẽ đồng bộ khi có mạng lại.';
      document.body.appendChild(el);
    });
  }

  async function init(){
    try{
      clientId(); // định danh thiết bị, dùng để truy vết event trùng khi sync nhiều máy
      wireUI();
      initSupabase();
      await handleAuthCallback();
      await loadData();
      await restoreSession();
      const initial=location.hash.replace('#','');
      await navigate(titles[initial]?initial:'dashboard');
      prefetchIdle();
      if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.warn);
      setInterval(()=>{if(currentUser&&navigator.onLine)flushEventQueue().catch(()=>{});},60000);
    }catch(e){
      console.error(e);
      $('#content').innerHTML=`<div class="card"><h2>Không khởi động được app</h2><p class="bad">${esc(e.message||e)}</p><p class="muted small">Nếu bạn đang mở trực tiếp bằng file:// thì hãy chạy qua HTTP/HTTPS. Nếu đang online, thử tải lại trang.</p><button class="primary" onclick="location.reload()">Tải lại</button></div>`;
    }
  }
  window.addEventListener('hashchange',()=>{const v=location.hash.replace('#','')||'dashboard';if(titles[v]&&v!==activeView)navigate(v);});
  window.addEventListener('beforeunload',()=>{finishLiveSession();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){try{saveState();}catch{}}else if(currentUser&&navigator.onLine)flushEventQueue().catch(()=>{});});
  document.addEventListener('DOMContentLoaded',init);
})();
