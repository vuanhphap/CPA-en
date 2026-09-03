/* store.js — Trạng thái học lưu trên máy: đọc/ghi localStorage, tách hồ sơ theo tài khoản, hàng đợi event.
   Tệp này do qa/split_modules.py sinh ra từ app.js. */
import { $, clamp, dateKey, itemId, nowIso, uuid } from './util.js';
import { setLiveSessionId, setState, setStateScope, state, stateScope } from './runtime.js';

export const LEGACY_LS_KEY = 'cpa_english_trainer_state_v1';

export const LS_KEY_BASE = 'cpa_english_trainer_state_v2';

export const EXAM_DRAFT_PREFIX = 'cpa_exam_draft_';

export const DAY = 86400000;

export function defaultState(){
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

export function mergeState(raw){
  const d=defaultState(),r=raw||{},sessions=r.sessions||{};
  for(const x of Object.values(sessions)){if(x&&!x.ended_at&&x.started_at){x.ended_at=x.updated_at||x.started_at;const total=Number(x.item_count||0);if(x.score==null&&total)x.score=Number(x.correct_count||0)/total*100;x.synced=false;}}
  return {...d,...r,version:3,progress:r.progress||{},daily:r.daily||{},sessions,eventQueue:Array.isArray(r.eventQueue)?r.eventQueue:[],settings:{...d.settings,...(r.settings||{})}};
}

export function stateStorageKey(scope=stateScope){
  if(scope==='guest') return `${LS_KEY_BASE}:guest`;
  return `${LS_KEY_BASE}:${scope.replace(':','_')}`;
}

export function loadStateForScope(scope='guest'){
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

export function saveState(){localStorage.setItem(stateStorageKey(),JSON.stringify(state));}

export function switchStateScope(userId=null){
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
  setStateScope(next);setState(loaded);state.ownerId=userId||null;saveState();
  setLiveSessionId(null);
}

export function localProgress(type,key){return state.progress[itemId(type,key)] || null;}

export function setLocalProgress(type,key,p){state.progress[itemId(type,key)]={...p,item_key:key,item_type:type,updated_at:nowIso()}; saveState();}

export function dailyLocal(){
  const k=dateKey(); if(!state.daily[k]) state.daily[k]={reviews:0,new_items:0,correct_count:0,wrong_count:0,study_seconds:0,exam_attempts:0,best_exam_score:null}; return state.daily[k];
}
/* ---------- V7: event log append-only ----------
   daily_stats là counter tổng hợp — hai thiết bị cùng học offline rồi cùng sync sẽ
   ghi đè nhau và mất số liệu. Mỗi lượt học giờ sinh thêm một event bất biến; khi
   mạng lỗi thì event nằm trong hàng đợi local và được đẩy lên ở lần sync sau. */

export const CLIENT_ID_KEY='cpa_client_id';

export function clientId(){
  let id=localStorage.getItem(CLIENT_ID_KEY);
  if(!id){id=uuid();localStorage.setItem(CLIENT_ID_KEY,id);}
  return id;
}

export const MAX_QUEUE=2000;

export function queueEvent(ev){
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

/* Nap state ngay khi store.js duoc danh gia. Dat o day chu khong o
   runtime.js de tranh vong phu thuoc luc khoi tao module. */
setState(loadStateForScope(stateScope));

