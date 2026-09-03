/* content.js — Corpus ôn thi: nạp JSON tĩnh, nạp trễ theo view, và nâng cấp nội dung theo phiên bản.
   Tệp này do qa/split_modules.py sinh ra từ app.js. */
import { $, esc, norm, nowIso, toast, unique } from './util.js';
import { activeView, data, db, drillState, quiz, setData } from './runtime.js';
import { navigate } from './main.js';

export async function fetchJson(path){ const r=await fetch(path); if(!r.ok) throw new Error(`Không tải được ${path}`); return r.json(); }

export const LAZY_SETS={
  topic:{file:'data/topic_vocab.json',label:'từ điển corpus'},
  exams:{file:'data/exams.json',label:'đề gốc'}
};

export const VIEW_NEEDS={study:['topic'],dictionary:['topic'],weak:['topic'],exams:['exams'],settings:['topic','exams']};

export const lazyPromises={};

export function hasSet(k){return Array.isArray(data[k])&&data[k].length>0;}

export function ensureSet(k){
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

export const PACK_CACHE_PREFIX='cpa_pack_';

export let bundledVersions=null;

export let manifestPromise=null;

export async function bundledManifest(){
  if(bundledVersions)return bundledVersions;
  try{bundledVersions=await fetchJson('data/manifest.json');}
  catch{bundledVersions={};}
  return bundledVersions;
}

export function remoteManifest(){
  if(!db||typeof db.rpc!=='function')return Promise.resolve({});
  if(!manifestPromise)manifestPromise=db.rpc('content_manifest')
    .then(({data:rows,error})=>{
      if(error)return {};
      const out={};for(const r of rows||[])out[r.pack_id]=r;return out;
    })
    .catch(()=>({}));
  return manifestPromise;
}

export function readPackCache(pack){
  try{
    const obj=JSON.parse(localStorage.getItem(PACK_CACHE_PREFIX+pack)||'null');
    return (obj&&Array.isArray(obj.rows))?obj:null;
  }catch{return null;}
}

export function writePackCache(pack,version,rows){
  try{localStorage.setItem(PACK_CACHE_PREFIX+pack,JSON.stringify({version,rows,cached_at:nowIso()}));}
  catch{/* localStorage đầy: bỏ qua, lần sau tải lại từ mạng */}
}

export async function fetchPackRows(pack){
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

export async function loadPack(pack,file){
  const bundled=await bundledManifest();
  const bundledVer=Number(bundled[pack]||1);
  const cached=readPackCache(pack);
  queuePackUpgrade(pack,bundledVer);
  if(cached&&Number(cached.version)>bundledVer)return cached.rows;
  return fetchJson(file);
}

export const upgradeQueue=new Map();

export function queuePackUpgrade(pack,bundledVer){
  if(upgradeQueue.has(pack))return;
  upgradeQueue.set(pack,bundledVer);
}

export async function runPackUpgrades(){
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

export async function ensureViewData(view){
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

export function prefetchIdle(){
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

export const EAGER_PACKS={core:'data/core_cpa.json',families:'data/word_families.json',
  collocations:'data/collocations.json',topics:'data/topic_summary.json',
  sentences:'data/sentences.json',wf:'data/drills_wf.json',tr:'data/drills_tr.json',
  tle:'data/drills_tle.json',tlv:'data/drills_tlv.json'};

export async function loadData(){
  const names=Object.keys(EAGER_PACKS);
  const [glosses,ipa,...packs]=await Promise.all([
    fetchJson('data/glosses.json'),
    fetchJson('data/ipa.json'),
    ...names.map(n=>loadPack(n,EAGER_PACKS[n]))
  ]);
  const loaded={};names.forEach((n,i)=>loaded[n]=packs[i]);
  setData({...data,...loaded,glosses,ipa,topic:[],exams:[]});
}

export function gloss(term){ return data.glosses[norm(term)] || null; }

export function ipaOf(term){return data.ipa[norm(term)]||'';}

export function collocationRow(term){return data.collocations.find(x=>norm(x.term_fixed_phrase)===norm(term))||null;}

export function meaningOf(term){const c=collocationRow(term);if(c?.meaning_vi)return c.meaning_vi;const g=gloss(term);return g?.[1]||'';}

export let _sentIdx=null;

export function sentenceIndex(){
  if(_sentIdx) return _sentIdx;
  _sentIdx={};
  data.sentences.filter(s=>s.quality!=='low').forEach(s=>{ unique((s.text.toLowerCase().match(/[a-z][a-z'-]+/g))||[]).forEach(w=>{(_sentIdx[w]=_sentIdx[w]||[]).push(s);}); });
  return _sentIdx;
}

export function exampleFor(term){
  if(!term) return null;
  const t=norm(term);
  if(t.includes(' ')){ const hit=data.sentences.find(s=>s.quality!=='low'&&s.text.toLowerCase().includes(t)); return hit||null; }
  const ids=sentenceIndex()[t]; return ids&&ids.length?ids[0]:null;
}

export function relatedCollocations(term,limit=5){
  const t=norm(term); if(!t)return [];
  return data.collocations.filter(c=>norm(c.term_fixed_phrase).split(/\s+/).includes(t)||norm(c.term_fixed_phrase).includes(t)).slice(0,limit);
}
