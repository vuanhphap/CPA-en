/* LƯU Ý: test này chạy trên qa/app.legacy.js — bản IIFE trước khi tách module.
   Giữ lại vì nó kiểm tra phần LOGIC THUẦN (SM-2, weakness, readiness, dựng pool câu
   hỏi) mà việc tách module không đụng tới, và vì nó là mốc đối chiếu lịch sử.
   Test hành vi của bản đang ship nằm ở test_v7 / test_v8 / test_flows, chạy được
   trên cả hai bản qua qa/harness.js. */
const fs=require('fs'),vm=require('vm'),path=require('path');
process.env.TZ='Asia/Ho_Chi_Minh';
const root=path.resolve(__dirname,'..');
let src=fs.readFileSync(path.join(root,'qa','app.legacy.js'),'utf8');
src=src.replace("document.addEventListener('DOMContentLoaded',init);",`window.__TEST__={sm2,dateKey,shuffled,buildStudyQueue,makeCollocationQuestion,makeClozeQuestion,buildChunkPool,sentenceIndex,setData:(d)=>{data=d;_sentIdx=null;},setState:(s)=>{state=s;},setChunkMode:(m)=>{chunkMode=m;}};`);
const store={};const context={console,Date,Intl,Math,JSON,Set,Map,Promise,Blob,URL,window:{CPA_CONFIG:{},addEventListener:()=>{}},document:{addEventListener:()=>{},querySelector:()=>null,querySelectorAll:()=>[]},localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=String(v)},navigator:{},location:{hash:'',origin:'http://x',pathname:'/'},confirm:()=>true,setTimeout,clearTimeout,setInterval,clearInterval};context.window.document=context.document;context.window.localStorage=context.localStorage;vm.createContext(context);vm.runInContext(src,context,{filename:'app.legacy.js'});
const T=context.window.__TEST__,load=f=>JSON.parse(fs.readFileSync(path.join(root,'data',f),'utf8'));const data={core:load('core_cpa.json'),topic:load('topic_vocab.json'),families:load('word_families.json'),collocations:load('collocations.json'),general:load('general_expansion.json'),topics:load('topic_summary.json'),exams:load('exams.json'),glosses:load('glosses.json'),ipa:load('ipa.json'),sentences:load('sentences.json'),wf:load('drills_wf.json'),tr:load('drills_tr.json'),tle:load('drills_tle.json'),tlv:load('drills_tlv.json')};T.setData(data);
let failures=[];const ok=(c,m)=>{if(!c)failures.push(m)};
let p={};p=T.sm2(p,4);ok(p.interval_days===1&&p.repetitions===1,'SM-2 rep1');p=T.sm2(p,4);ok(p.interval_days===6&&p.repetitions===2,'SM-2 rep2');p=T.sm2(p,4);ok(p.interval_days===15&&p.repetitions===3,'SM-2 rep3');let bad=T.sm2(p,1);ok(bad.repetitions===0&&bad.interval_days===1&&bad.lapses===1,'SM-2 fail reset');
ok(T.dateKey(new Date('2026-09-02T18:30:00Z'))==='2026-09-03','local date key');
const newCore=data.core.filter(x=>x.type==='Word').slice(0,20);T.setData({...data,core:newCore});// Ngày phải lấy động. Bản trước cắm cứng '2026-09-03' nên hôm sau dailyLocal()
// không khớp khoá, trả về bản ghi rỗng, và test tự hỏng dù app không đổi gì.
// Phải dùng chính T.dateKey() chứ không phải toISOString(): dateKey lấy ngày theo
// giờ địa phương (đã ghim Asia/Ho_Chi_Minh ở đầu tệp), còn toISOString lấy ngày UTC.
// Hai cái lệch nhau trong khoảng 17-24h UTC, và test sẽ hỏng đúng buổi tối.
const TODAY=T.dateKey();
let state={version:1,progress:{},daily:{[TODAY]:{reviews:10,new_items:10,correct_count:10,wrong_count:0,study_seconds:1,exam_attempts:0,best_exam_score:null}},settings:{newPerDay:15},createdAt:new Date().toISOString()};T.setState(state);let q=T.buildStudyQueue('core','');ok(q.length===5,'daily new limit');const id='word:'+newCore[0].entry.toLowerCase();state.progress[id]={item_key:newCore[0].entry,item_type:'word',last_reviewed_at:new Date().toISOString(),due_at:new Date(Date.now()+5*86400000).toISOString()};T.setState(state);q=T.buildStudyQueue('core','');ok(!q.some(x=>x.entry===newCore[0].entry),'future card excluded');
T.setData(data);T.setState({version:1,progress:{},daily:{},settings:{newPerDay:15},createdAt:new Date().toISOString()});const byId=new Map(data.sentences.map(s=>[s.id,s]));
for(let i=0;i<300;i++){let x=T.makeCollocationQuestion();ok(x.options.length===4,'coll option count');ok(new Set(x.options.map(s=>s.toLowerCase())).size===4,'coll unique options');ok(x.options.some(o=>o.toLowerCase()===x.answer.toLowerCase()),'coll answer included');}
for(let i=0;i<300;i++){let x=T.makeClozeQuestion();ok(x.options.length===4,'cloze option count');ok(new Set(x.options.map(s=>s.toLowerCase())).size===4,'cloze unique options');if(x.kind==='cloze'){const s=byId.get(x.item.item_key.replace(/^sentence:/,''));ok(s&&s.quality==='high'&&s.source_fidelity==='Exact OCR','cloze source gate');}}
T.setChunkMode('sentence');const pool=T.buildChunkPool('sentence');ok(pool.every(x=>x.quality==='high'),'chunk quality gate');for(const arr of Object.values(T.sentenceIndex()))ok(arr.every(x=>x.quality==='high'),'example index quality gate');
console.log(JSON.stringify({failures,count:failures.length,collocations:data.collocations.length,sentences:data.sentences.length,activeSentencePool:pool.length},null,2));if(failures.length)process.exit(1);
