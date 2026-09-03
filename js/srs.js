/* srs.js — Thuật toán SM-2, điểm điểm yếu, và dựng hàng đợi thẻ cần ôn.
   Tệp này do qa/split_modules.py sinh ra từ app.js. */
import { $, clamp, norm, nowIso } from './util.js';
import { data, state } from './runtime.js';
import { DAY, dailyLocal, localProgress } from './store.js';

export function due(p){return !p?.due_at || new Date(p.due_at) <= new Date();}

export function statusLabel(p){return p?.status || 'new';}

export function progressWeight(p){return p?.status==='mastered'?1:p?.status==='review'?0.7:p?.status==='learning'?0.35:0;}

export function weaknessScore(p){
  const c=Number(p?.correct_count||0),w=Number(p?.wrong_count||0),a=c+w,err=a?w/a:0;
  const lapse=Math.min(25,Number(p?.lapses||0)*7);
  const duePts=due(p)?12:0;
  const overdue=p?.due_at?Math.min(10,Math.max(0,(Date.now()-Date.parse(p.due_at))/DAY)):0;
  const avg=a?Number(p?.total_time_seconds||0)/a:0,slow=Math.min(8,Math.max(0,(avg-10)/2));
  return Math.round(clamp(err*45+lapse+duePts+overdue+slow,0,100));
}

export function itemFromProgress(p){
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

export function sm2(prev, quality){
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

export function buildStudyQueue(filter='core',topicFilter=''){
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
