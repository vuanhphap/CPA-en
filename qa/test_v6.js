/* LƯU Ý: test này chạy trên qa/app.legacy.js — bản IIFE trước khi tách module.
   Giữ lại vì nó kiểm tra phần LOGIC THUẦN (SM-2, weakness, readiness, dựng pool câu
   hỏi) mà việc tách module không đụng tới, và vì nó là mốc đối chiếu lịch sử.
   Test hành vi của bản đang ship nằm ở test_v7 / test_v8 / test_flows, chạy được
   trên cả hai bản qua qa/harness.js. */
const fs=require('fs'),vm=require('vm'),path=require('path');
process.env.TZ='Asia/Ho_Chi_Minh';
const root=path.resolve(__dirname,'..');
let src=fs.readFileSync(path.join(root,'qa','app.legacy.js'),'utf8');
src=src.replace("document.addEventListener('DOMContentLoaded',init);",`window.__V6TEST__={
  weaknessScore,readinessScore,buildStudyQueue,rangeDays,startLocalSession,touchSession,finishLocalSession,
  switchStateScope,saveState,mergeState,defaultState,
  setData:(d)=>{data=d;_sentIdx=null;},setState:(s)=>{state=mergeState(s);},getState:()=>state,getScope:()=>stateScope
};`);
const store={};
const context={console,Date,Intl,Math,JSON,Set,Map,Promise,Blob,URL,globalThis:null,
 window:{CPA_CONFIG:{},addEventListener:()=>{}},document:{addEventListener:()=>{},querySelector:()=>null,querySelectorAll:()=>[]},
 localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k]},navigator:{},
 location:{hash:'',origin:'http://x',pathname:'/'},confirm:()=>true,setTimeout,clearTimeout,setInterval,clearInterval};
context.globalThis=context;context.window.document=context.document;context.window.localStorage=context.localStorage;
vm.createContext(context);vm.runInContext(src,context,{filename:'app.legacy.js'});
const T=context.window.__V6TEST__,load=f=>JSON.parse(fs.readFileSync(path.join(root,'data',f),'utf8'));
const full={core:load('core_cpa.json'),topic:load('topic_vocab.json'),families:load('word_families.json'),collocations:load('collocations.json'),general:load('general_expansion.json'),topics:load('topic_summary.json'),exams:load('exams.json'),glosses:load('glosses.json'),ipa:load('ipa.json'),sentences:load('sentences.json'),wf:load('drills_wf.json'),tr:load('drills_tr.json'),tle:load('drills_tle.json'),tlv:load('drills_tlv.json')};
let failures=[];const ok=(c,m)=>{if(!c)failures.push(m)};

// Weakness score must rank repeated failures above a clean due card.
const duePast=new Date(Date.now()-3*86400000).toISOString();
const weak={item_key:'audit',item_type:'word',correct_count:2,wrong_count:4,lapses:3,due_at:duePast,total_time_seconds:100,status:'learning'};
const clean={item_key:'tax',item_type:'word',correct_count:8,wrong_count:0,lapses:0,due_at:duePast,total_time_seconds:40,status:'review'};
ok(T.weaknessScore(weak)>T.weaknessScore(clean),'weakness ranking');

// Smart queue: weak due first + remaining new quota only.
const core=full.core.filter(x=>x.type==='Word').slice(0,8);T.setData({...full,core});
const wk=core[0].entry.toLowerCase();
T.setState({progress:{['word:'+wk]:{...weak,item_key:core[0].entry,topic:core[0].cpa_subtopic,last_reviewed_at:new Date().toISOString()}},daily:{},settings:{newPerDay:1}});
let q=T.buildStudyQueue('smart','');
ok(q.length===2,'smart queue weak + quota new');
ok(q[0]._key===core[0].entry,'smart queue weak first');
let wq=T.buildStudyQueue('weak','');ok(wq.length===1&&wq[0]._key===core[0].entry,'real weak queue');
T.setState({progress:{['word:'+wk]:{...weak,item_key:core[0].entry,topic:core[0].cpa_subtopic,last_reviewed_at:new Date().toISOString()}},daily:{},settings:{newPerDay:0}});q=T.buildStudyQueue('smart','');ok(q.length===1,'zero new quota respected');
const sent=full.sentences.find(x=>x.quality==='high');T.setData(full);T.setState({progress:{['question:sentence:'+sent.id]:{item_key:'sentence:'+sent.id,item_type:'question',topic:sent.topic||'',correct_count:0,wrong_count:2,lapses:2,due_at:duePast,last_reviewed_at:new Date().toISOString()}},daily:{},settings:{newPerDay:0}});wq=T.buildStudyQueue('weak','');ok(wq.length===1&&wq[0]._type==='question'&&wq[0]._display,'weak sentence returns to review queue');

// Local session survives and contributes to analytics even offline.
let sid=T.startLocalSession('review',{test:true});T.touchSession(sid,true,30);T.touchSession(sid,false,30);T.finishLocalSession(sid);
let st=T.getState();ok(st.sessions[sid].item_count===2&&st.sessions[sid].correct_count===1&&st.sessions[sid].wrong_count===1,'local session counts');
let today=T.rangeDays(1)[0];ok(today.reviews>=2&&today.minutes>=1,'session contributes analytics');

// Readiness should react to mastered learning state and exam evidence.
const mini={...full,core:[{type:'Word',entry:'audit',cpa_subtopic:'Audit'}],families:[{root:'finance'}],collocations:[{term_fixed_phrase:'audit evidence'}],sentences:[{id:'1',quality:'high'}]};T.setData(mini);
const mastered=(key,type)=>({item_key:key,item_type:type,status:'mastered',correct_count:5,wrong_count:0,lapses:0,due_at:new Date(Date.now()+86400000).toISOString(),last_reviewed_at:new Date().toISOString()});
const rs={progress:{'word:audit':mastered('audit','word'),'family:finance':mastered('finance','family'),'collocation:audit evidence':mastered('audit evidence','collocation'),'question:sentence:1':mastered('sentence:1','question')},daily:{},sessions:{},settings:{newPerDay:0}};
T.setState(rs);const exam=T.startLocalSession('mock_exam');T.finishLocalSession(exam,{item_count:1,correct_count:1,wrong_count:0,score:80,duration_seconds:5400});
let ready=T.readinessScore();ok(ready.score>=85,'readiness high when all learning dimensions mastered');

// Per-user local namespace: user A data must not leak into guest profile.
T.setState({progress:{'word:audit':mastered('audit','word')},daily:{},sessions:{},settings:{newPerDay:1}});T.saveState();
T.switchStateScope('user-a');let ua=T.getState();ua.progress['word:only-a']=mastered('only-a','word');T.saveState();
T.switchStateScope(null);ok(!T.getState().progress['word:only-a'],'user data isolated from guest');
T.switchStateScope('user-a');ok(!!T.getState().progress['word:only-a'],'user scoped state persists');

console.log(JSON.stringify({failures,count:failures.length,weakScore:T.weaknessScore(weak),cleanScore:T.weaknessScore(clean),readiness:ready.score,smartQueue:q.map(x=>x._key)},null,2));
if(failures.length)process.exit(1);
