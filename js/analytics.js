/* analytics.js — Tính toán thống kê cho dashboard: chuỗi ngày, readiness, dự báo đến hạn.
   Tệp này do qa/split_modules.py sinh ra từ app.js. */
import { $, dateKey, esc } from './util.js';
import { data, state } from './runtime.js';
import { DAY, localProgress } from './store.js';
import { due, progressWeight } from './srs.js';

export function rangeDays(n){
  const sessionByDay={};
  for(const x of Object.values(state.sessions||{})){if(!x.started_at||!x.ended_at)continue;const k=dateKey(new Date(x.started_at));const a=sessionByDay[k]||(sessionByDay[k]={reviews:0,study_seconds:0,correct_count:0,wrong_count:0});a.reviews+=Number(x.item_count||0);a.study_seconds+=Number(x.duration_seconds||0);a.correct_count+=Number(x.correct_count||0);a.wrong_count+=Number(x.wrong_count||0);}
  const out=[];const today=new Date();today.setHours(12,0,0,0);
  for(let i=n-1;i>=0;i--){const d=new Date(today.getTime()-i*DAY),k=dateKey(d),x=state.daily[k]||{},ss=sessionByDay[k]||{};const reviews=Math.max(Number(x.reviews||0),Number(ss.reviews||0)),seconds=Math.max(Number(x.study_seconds||0),Number(ss.study_seconds||0)),correct=Math.max(Number(x.correct_count||0),Number(ss.correct_count||0)),wrong=Math.max(Number(x.wrong_count||0),Number(ss.wrong_count||0)),total=correct+wrong;out.push({date:k,label:new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit'}).format(d),reviews,minutes:seconds/60,accuracy:total?correct/total*100:null,new_items:Number(x.new_items||0),exam:Number(x.best_exam_score||0)});}return out;
}

export function svgLine(rows,key,suffix=''){
  const vals=rows.map(r=>r[key]).filter(v=>v!=null&&Number.isFinite(v));if(!vals.length)return '<div class="empty">Chưa đủ dữ liệu.</div>';
  const max=Math.max(...vals,1),min=Math.min(...vals,0),span=Math.max(1,max-min),W=720,H=180,P=20;
  const pts=rows.map((r,i)=>{const v=r[key];if(v==null)return null;const x=P+(W-2*P)*(rows.length===1?0:i/(rows.length-1)),y=H-P-(H-2*P)*(v-min)/span;return `${x.toFixed(1)},${y.toFixed(1)}`;}).filter(Boolean).join(' ');
  return `<svg class="trend-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"><line x1="${P}" y1="${H-P}" x2="${W-P}" y2="${H-P}" class="chart-axis"/><polyline points="${pts}" class="chart-line"/></svg><div class="chart-legend"><span>${esc(rows[0]?.label||'')}</span><b>${Math.round(vals[vals.length-1]*10)/10}${suffix}</b><span>${esc(rows[rows.length-1]?.label||'')}</span></div>`;
}

export function readinessScore(){
  const weighted=(list,type,keyFn)=>{if(!list.length)return 0;let s=0;for(const x of list)s+=progressWeight(localProgress(type,keyFn(x)));return s/list.length*100;};
  const core=data.core.filter(x=>x.type==='Word');
  const coreM=weighted(core,'word',x=>x.entry),famM=weighted(data.families,'family',x=>x.root),colM=weighted(data.collocations,'collocation',x=>x.term_fixed_phrase);
  const activeSentences=data.sentences.filter(x=>x.quality!=='low'),qM=activeSentences.length?activeSentences.reduce((s,x)=>s+progressWeight(localProgress('question',`sentence:${x.id}`)),0)/activeSentences.length*100:0;
  const m=masteryStats(),active14=rangeDays(14).filter(x=>x.minutes>0||x.reviews>0).length,consistency=Math.min(100,active14/10*100);
  const exams=Object.values(state.sessions).filter(x=>x.mode==='mock_exam'&&x.score!=null);const exam=exams.length?Math.max(...exams.map(x=>Number(x.score||0))):0;
  const score=Math.round(coreM*.30+famM*.15+colM*.15+qM*.15+m.accuracy*.10+consistency*.05+exam*.10);
  return {score,parts:{core:Math.round(coreM),families:Math.round(famM),collocations:Math.round(colM),cloze:Math.round(qM),accuracy:m.accuracy,consistency:Math.round(consistency),exam:Math.round(exam)}};
}

export function futureDueCounts(n=7){
  const rows=[];for(let i=0;i<n;i++){const d=new Date();d.setHours(23,59,59,999);d.setDate(d.getDate()+i);rows.push({date:dateKey(d),label:i===0?'Hôm nay':i===1?'Ngày mai':new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit'}).format(d),count:0});}
  for(const p of Object.values(state.progress)){if(!p.due_at)continue;const diff=Math.floor((new Date(p.due_at).setHours(0,0,0,0)-new Date().setHours(0,0,0,0))/DAY);if(diff>=0&&diff<n)rows[diff].count++;}
  return rows;
}

export function masteryStats(){
  const ps=Object.values(state.progress); const mastered=ps.filter(p=>p.status==='mastered').length; const dueNow=ps.filter(due).length;
  const correct=ps.reduce((s,p)=>s+Number(p.correct_count||0),0), wrong=ps.reduce((s,p)=>s+Number(p.wrong_count||0),0);
  return {tracked:ps.length,mastered,dueNow,accuracy:correct+wrong?Math.round(correct/(correct+wrong)*100):0};
}

export function streak(){
  let n=0,d=new Date(); for(;;){const k=dateKey(d); if(state.daily[k]?.study_seconds>0 || state.daily[k]?.reviews>0)n++; else if(n===0 && k===dateKey()){} else break; d=new Date(d.getTime()-DAY); if(n>3650)break;} return n;
}

export function topicMastery(){
  const out={};
  for(const [id,p] of Object.entries(state.progress)){ const t=p.topic||'Khác'; if(!out[t])out[t]={reviewed:0,mastered:0,wrong:0};out[t].reviewed++;if(p.status==='mastered')out[t].mastered++;out[t].wrong+=Number(p.wrong_count||0); }
  return out;
}
