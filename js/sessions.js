/* sessions.js — Vòng đời phiên học: mở, cập nhật, đóng — cả cục bộ lẫn trên máy chủ.
   Tệp này do qa/split_modules.py sinh ra từ app.js. */
import { nowIso, uuid } from './util.js';
import { currentUser, data, db, liveSessionId, setLiveSessionId, state } from './runtime.js';
import { saveState } from './store.js';
import { syncSessions } from './sync.js';

export const modeLabel=m=>({vocabulary:'SRS từ vựng',word_family:'Word Family',collocation:'Collocation',cloze:'Cloze / câu',mock_exam:'Luyện đề',review:'Ôn tập',word_formation:'Word Formation',sentence_transform:'Viết lại câu',translation:'Dịch',smart_review:'Smart Study',weak_review:'Weak Review'}[m]||m||'Phiên học');

export const sessionModeForStudy=m=>m==='families'?'word_family':m==='collocations'?'collocation':m==='weak'?'weak_review':m==='smart'?'smart_review':'vocabulary';

export function startLocalSession(mode,metadata={}){
  const id=uuid(); const t=nowIso();
  state.sessions[id]={id,mode,started_at:t,ended_at:null,item_count:0,correct_count:0,wrong_count:0,score:null,duration_seconds:0,metadata,updated_at:t,synced:false};
  saveState();return id;
}

export function ensureLiveSession(mode,metadata={}){
  const cur=liveSessionId&&state.sessions[liveSessionId];
  if(cur&&!cur.ended_at&&cur.mode===mode)return liveSessionId;
  finishLiveSession(); setLiveSessionId(startLocalSession(mode,metadata)); return liveSessionId;
}

export function touchSession(id,correct=null,seconds=0){
  const x=id&&state.sessions[id];if(!x)return;
  x.item_count=Number(x.item_count||0)+1;
  if(correct===true)x.correct_count=Number(x.correct_count||0)+1;
  if(correct===false)x.wrong_count=Number(x.wrong_count||0)+1;
  x.duration_seconds=Number(x.duration_seconds||0)+Number(seconds||0);
  x.updated_at=nowIso();x.synced=false;saveState();
}

export function finishLocalSession(id,override={}){
  const x=id&&state.sessions[id];if(!x)return null;
  if(!x.ended_at)x.ended_at=nowIso();
  Object.assign(x,override);
  const total=Number(x.item_count||0),correct=Number(x.correct_count||0);
  if(total===0&&!override.forceKeep){delete state.sessions[id];saveState();return null;}
  if(x.score==null&&total)x.score=correct/total*100;
  if(!Number(x.duration_seconds||0)&&x.started_at)x.duration_seconds=Math.max(0,Math.round((Date.now()-Date.parse(x.started_at))/1000));
  x.updated_at=nowIso();x.synced=false;saveState();return x;
}

export function finishLiveSession(){if(liveSessionId){finishLocalSession(liveSessionId);setLiveSessionId(null);if(currentUser)syncSessions().catch(console.warn);}}

export function appendCompletedSession(mode,result={},metadata={}){
  const id=startLocalSession(mode,metadata),x=state.sessions[id];
  x.item_count=Number(result.total||0);x.correct_count=Number(result.correct||0);x.wrong_count=Math.max(0,Number(result.wrong??(x.item_count-x.correct_count)));
  x.duration_seconds=Number(result.seconds||0);x.score=result.score!=null?Number(result.score):(x.item_count?x.correct_count/x.item_count*100:null);
  if(result.started_at)x.started_at=result.started_at;return finishLocalSession(id);
}

export const SESSION_MODES=new Set(['vocabulary','word_family','collocation','cloze','mock_exam','review','word_formation','sentence_transform','translation']);

export async function createCloudSession(mode){if(!db||!currentUser)return null;const m=SESSION_MODES.has(mode)?mode:(mode==='family'?'word_family':mode==='core'?'vocabulary':'review');const {data:r,error}=await db.from('study_sessions').insert({user_id:currentUser.id,mode:m,item_count:0}).select().single();if(error){console.warn(error);return null;}return r.id;}

export async function finishCloudSession(id,result){if(!id||!db||!currentUser)return;await db.from('study_sessions').update({ended_at:nowIso(),item_count:result.total,correct_count:result.correct,wrong_count:result.total-result.correct,score:result.total?result.correct/result.total*100:0,duration_seconds:result.seconds||0}).eq('id',id).eq('user_id',currentUser.id);}
