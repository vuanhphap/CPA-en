/* sync.js — Supabase: khởi tạo client, đồng bộ hai chiều, realtime, đẩy event có hạn mức.
   Tệp này do qa/split_modules.py sinh ra từ app.js. */
import { $, CFG, dateKey, endOfDayMs, itemId, nowIso, setSyncBadge, toast } from './util.js';
import {
  activeView,
  currentUser,
  data,
  db,
  drillState,
  liveSessionId,
  profile,
  quiz,
  realtimeLive,
  setCurrentUser,
  setDb,
  setProfile,
  setRealtimeLive,
  state
} from './runtime.js';
import {
  dailyLocal,
  localProgress,
  queueEvent,
  saveState,
  setLocalProgress,
  switchStateScope
} from './store.js';
import { sm2 } from './srs.js';
import { SESSION_MODES, touchSession } from './sessions.js';
import {
  displayName,
  loadProfile,
  maybeOfferGuestMerge,
  openRecovery,
  updateAuthUI
} from './auth.js';
import { navigate } from './main.js';

export function initSupabase(){
  if(!window.supabase?.createClient || !CFG.supabaseUrl || !CFG.supabasePublishableKey) return;
  setDb(window.supabase.createClient(CFG.supabaseUrl, CFG.supabasePublishableKey, {
    auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true,flowType:'pkce'},
    global:{headers:{'x-client-info':`cpa-english-trainer/${CFG.appVersion||'v7'}`}}
  }));
  db.auth.onAuthStateChange(async (event,session)=>{
    const next=session?.user||null;
    const changed=(currentUser?.id||null)!==(next?.id||null);
    setCurrentUser(next);
    if(event==='PASSWORD_RECOVERY'){setTimeout(openRecovery,200);}
    if(changed){switchStateScope(currentUser?.id||null);setProfile(null);}
    if(currentUser)await loadProfile();
    updateAuthUI();
    if(currentUser){startRealtime();setTimeout(()=>syncAll().then(()=>maybeOfferGuestMerge()),0);}
    else stopRealtime();
    if(changed&&data.core.length)setTimeout(()=>navigate(activeView),0);
  });
}

export async function restoreSession(){
  if(!db){updateAuthUI();return;}
  const {data:sessionData}=await db.auth.getSession();
  setCurrentUser(sessionData?.session?.user||null);
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

export let realtimeChannel=null;

export let rerenderTimer=null;
/* Một chỗ duy nhất quyết định nội dung badge. Trước đây startRealtime() và syncAll()
   cùng ghi badge, và syncAll() chạy sau nên luôn xoá mất chữ "đồng bộ sống". */

export function refreshSyncBadge(){
  if(!currentUser)return setSyncBadge('offline','● Đang học ngoại tuyến');
  setSyncBadge('online',realtimeLive?`● Đồng bộ sống: ${displayName()}`:`● Đồng bộ: ${displayName()}`);
}

export function scheduleRerender(){
  clearTimeout(rerenderTimer);
  // Gộp nhiều thay đổi dồn dập thành một lần vẽ lại, và không vẽ đè lên màn hình
  // đang có thao tác dở (đang làm quiz, đang làm bài thi, đang chấm thẻ).
  rerenderTimer=setTimeout(()=>{
    const busy=quiz||drillState||activeView==='exams';
    if(busy)return;
    if(['dashboard','history','weak','settings'].includes(activeView))navigate(activeView);
  },900);
}

export function stopRealtime(){
  setRealtimeLive(false);
  if(!realtimeChannel)return;
  try{db?.removeChannel?.(realtimeChannel);}catch{}
  realtimeChannel=null;
}

export function startRealtime(){
  if(!db||!currentUser||typeof db.channel!=='function')return;
  stopRealtime();
  const mine=`user_id=eq.${currentUser.id}`;
  try{
    realtimeChannel=db.channel(`user-${currentUser.id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'study_progress',filter:mine},p=>applyRemoteProgress(p.new))
      .on('postgres_changes',{event:'*',schema:'public',table:'daily_stats',filter:mine},p=>applyRemoteDaily(p.new))
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles',filter:mine},p=>{
        if(!p.new)return;setProfile({...(profile||{}),...p.new});updateAuthUI();
      })
      .subscribe(status=>{
        setRealtimeLive(status==='SUBSCRIBED');
        refreshSyncBadge();
      });
  }catch(e){console.warn('Realtime không khả dụng:',e.message);}
}

export function applyRemoteProgress(row){
  if(!row?.item_key||!row?.item_type)return;
  const id=itemId(row.item_type,row.item_key),local=state.progress[id];
  // Thiết bị này vừa ghi xong thì bỏ qua echo của chính mình.
  if(local&&Date.parse(local.updated_at||0)>=Date.parse(row.updated_at||0))return;
  state.progress[id]=row;saveState();scheduleRerender();
}

export function applyRemoteDaily(row){
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

export let flushing=false;

export let quotaBlockedUntil=0;

export async function flushEventQueue(){
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

export function isMissingBackendObject(err){
  const m=String(err?.message||'');
  return /does not exist|schema cache|Could not find the function|PGRST202/i.test(m);
}

export async function recordReview(type,item,quality,seconds=0){
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

export async function cloudUpsertProgress(key,type,p){
  if(!db||!currentUser)return;
  const payload={user_id:currentUser.id,item_key:key,item_type:type,topic:p.topic||'',status:p.status||'new',ease_factor:Number(p.ease_factor||2.5),interval_days:Number(p.interval_days||0),repetitions:Number(p.repetitions||0),lapses:Number(p.lapses||0),due_at:p.due_at||nowIso(),last_reviewed_at:p.last_reviewed_at||null,correct_count:Number(p.correct_count||0),wrong_count:Number(p.wrong_count||0),total_time_seconds:Number(p.total_time_seconds||0),metadata:p.metadata||{},updated_at:p.updated_at||nowIso()};
  const {error}=await db.from('study_progress').upsert(payload,{onConflict:'user_id,item_key,item_type'}); if(error) throw error;
}

export async function cloudUpsertDaily(day,studyDate=dateKey()){
  if(!db||!currentUser)return;
  const payload={user_id:currentUser.id,study_date:studyDate,reviews:Number(day.reviews||0),new_items:Number(day.new_items||0),correct_count:Number(day.correct_count||0),wrong_count:Number(day.wrong_count||0),study_seconds:Number(day.study_seconds||0),exam_attempts:Number(day.exam_attempts||0),best_exam_score:day.best_exam_score==null?null:Number(day.best_exam_score),updated_at:day.updated_at||nowIso()};
  let {error}=await db.from('daily_stats').upsert(payload,{onConflict:'user_id,study_date'});
  if(error){const legacy={...payload};delete legacy.updated_at;({error}=await db.from('daily_stats').upsert(legacy,{onConflict:'user_id,study_date'}));}
  if(error)throw error;
}

export async function cloudUpsertGoals(){
  if(!db||!currentUser)return;
  const payload={user_id:currentUser.id,daily_minutes_goal:Number(state.settings.dailyMinutesGoal||30),daily_new_items_goal:Number(state.settings.newPerDay??15),daily_reviews_goal:Number(state.settings.dailyReviewsGoal||30),target_exam_date:state.settings.targetExamDate||null,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Bangkok',updated_at:state.settingsUpdatedAt||nowIso()};
  const {error}=await db.from('profiles').upsert(payload,{onConflict:'user_id'});if(error)console.warn('Profile goals sync skipped:',error.message);
}

export async function syncSessions(){
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

export async function syncAll(){
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
      // -1 nghĩa là máy chủ từ chối vì hạn mức chống lạm dụng, KHÔNG phải lỗi. Bỏ qua
      // lần dồn này; tiến trình vẫn nằm an toàn trên máy và lần sync sau sẽ dồn lại.
      if(pulled!=null && Number(pulled)>=0){
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
