/* auth.js — Danh tính: đăng nhập/đăng ký/quên mật khẩu, hồ sơ, menu tài khoản, gộp dữ liệu khách.
   Tệp này do qa/split_modules.py sinh ra từ app.js. */
import { $, $$, CFG, clamp, hashCode, nowIso, toast } from './util.js';
import {
  activeView,
  currentUser,
  data,
  db,
  profile,
  setCurrentUser,
  setProfile,
  state
} from './runtime.js';
import { LS_KEY_BASE, mergeState, saveState, switchStateScope } from './store.js';
import { finishLiveSession } from './sessions.js';
import { masteryStats, streak } from './analytics.js';
import { flushEventQueue, refreshSyncBadge, stopRealtime, syncAll } from './sync.js';
import { navigate } from './main.js';

export let authTab='signin';

export let recoveryMode=false;

export const AUTH_ERRORS={
  'Invalid login credentials':'Email hoặc mật khẩu không đúng.',
  'Email not confirmed':'Email chưa được xác nhận. Kiểm tra hộp thư (cả mục Spam) hoặc bấm "Gửi lại email xác nhận".',
  'User already registered':'Email này đã có tài khoản. Chuyển sang tab Đăng nhập.',
  'Password should be at least 6 characters':`Mật khẩu tối thiểu ${CFG.minPasswordLength||8} ký tự.`,
  'For security purposes, you can only request this after':'Bạn thao tác quá nhanh. Đợi khoảng 1 phút rồi thử lại.',
  'Email rate limit exceeded':'Đã gửi quá nhiều email. Thử lại sau ít phút.',
  'Signups not allowed for this instance':'Dự án Supabase đang tắt đăng ký. Bật lại ở Authentication → Providers.'
};

export function authError(msg=''){
  for(const [k,v] of Object.entries(AUTH_ERRORS)) if(msg.includes(k)) return v;
  return msg||'Có lỗi xảy ra, thử lại sau.';
}

export function authMsg(text,kind=''){const el=$('#authMessage');el.className=`form-message ${kind}`;el.textContent=text;}

export function passwordScore(pw){
  if(!pw)return 0;
  let s=0;
  if(pw.length>=8)s++;
  if(pw.length>=12)s++;
  if(/[a-z]/.test(pw)&&/[A-Z]/.test(pw))s++;
  if(/\d/.test(pw)&&/[^A-Za-z0-9]/.test(pw))s++;
  return clamp(s,0,4);
}

export function renderPwMeter(){
  const pw=$('#authPassword').value,s=passwordScore(pw);
  $('#pwMeter').className=`pw-meter s${s}`;
  $('#pwHint').textContent=authTab==='signup'?(['','Quá yếu','Tạm được','Khá','Mạnh'][s]||''):'';
}

export function setAuthTab(tab){
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

export function openAuth(tab='signin'){
  if(!db) authMsg('Chưa kết nối được máy chủ. Bạn vẫn học và lưu tiến trình trên máy này bình thường.','');
  setAuthTab(tab);
  if(!db)authMsg('Chưa kết nối được máy chủ. Bạn vẫn học và lưu tiến trình trên máy này bình thường.','');
  $('#authEmail').value=$('#authEmail').value||currentUser?.email||'';
  $('#authPassword').value='';
  closeUserMenu();
  $('#authDialog').showModal();
  setTimeout(()=>$('#authEmail').focus(),50);
}

export function openRecovery(){
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

export async function submitAuth(){
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

export async function oauthSignIn(provider){
  if(!db)return toast('Chưa kết nối được máy chủ.');
  authMsg(`Đang chuyển sang ${provider}…`);
  const {error}=await db.auth.signInWithOAuth({provider,options:{redirectTo:CFG.authRedirectUrl}});
  if(error)authMsg(`${authError(error.message)} (Provider "${provider}" có thể chưa được bật trong Supabase.)`,'err');
}

export async function resendConfirm(){
  if(!db)return;
  const email=$('#authEmail').value.trim();
  if(!email)return authMsg('Nhập email trước đã.','err');
  const {error}=await db.auth.resend({type:'signup',email,options:{emailRedirectTo:CFG.authRedirectUrl}});
  authMsg(error?authError(error.message):'Đã gửi lại email xác nhận.',error?'err':'ok');
}

export async function signOut(){
  if(!db)return;
  finishLiveSession();
  await flushEventQueue().catch(()=>{});
  stopRealtime();
  await db.auth.signOut();
  setCurrentUser(null);setProfile(null);
  switchStateScope(null);
  updateAuthUI();closeUserMenu();
  toast('Đã đăng xuất. Đang dùng hồ sơ khách trên máy này.');
  navigate('dashboard');
}

export async function handleAuthCallback(){
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

export function initials(name,email){
  const src=(name||email||'?').trim();
  const parts=src.split(/[\s._-]+/).filter(Boolean);
  if(parts.length>=2)return (parts[0][0]+parts[parts.length-1][0]).toUpperCase();
  return src.slice(0,2).toUpperCase();
}

export function displayName(){
  return profile?.display_name || currentUser?.user_metadata?.display_name || currentUser?.user_metadata?.full_name || currentUser?.email?.split('@')[0] || 'Khách';
}

export async function loadProfile(){
  if(!db||!currentUser){setProfile(null);return;}
  try{
    const {data:row}=await db.from('profiles').select('*').eq('user_id',currentUser.id).maybeSingle();
    setProfile(row||null);
    if(!profile){
      const seed={user_id:currentUser.id,display_name:displayName(),avatar_hue:Math.abs(hashCode(currentUser.id))%361};
      const {data:created}=await db.from('profiles').upsert(seed,{onConflict:'user_id'}).select().maybeSingle();
      setProfile(created||seed);
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

export function openProfile(){
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

export async function saveProfile(){
  const name=$('#profileName').value.trim().slice(0,60);
  const hue=Number($('#profileHue').value||210);
  state.settings.dailyMinutesGoal=clamp(Number($('#profileMinutes').value||30),5,240);
  state.settings.dailyReviewsGoal=clamp(Number($('#profileReviews').value||30),5,300);
  state.settings.newPerDay=clamp(Number($('#profileNew').value||0),0,50);
  state.settings.targetExamDate=$('#profileExamDate').value||'';
  state.settings.guestName=currentUser?state.settings.guestName:(name||'');
  state.settingsUpdatedAt=nowIso();saveState();
  if(currentUser&&db){
    setProfile({...(profile||{}),display_name:name||displayName(),avatar_hue:hue});
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

export function closeUserMenu(){const d=$('#userDropdown');if(d){d.classList.add('hidden');$('#userMenuBtn')?.setAttribute('aria-expanded','false');}}

export function toggleUserMenu(){
  const d=$('#userDropdown'),open=d.classList.contains('hidden');
  d.classList.toggle('hidden',!open);
  $('#userMenuBtn').setAttribute('aria-expanded',String(open));
  if(open)renderUserMenuStats();
}

export function renderUserMenuStats(){
  const m=masteryStats(),s=streak();
  $('#menuStats').innerHTML=`
    <div><b>${m.tracked}</b><small>ĐANG HỌC</small></div>
    <div><b class="good">${m.mastered}</b><small>THUỘC</small></div>
    <div><b class="accent">${s}</b><small>NGÀY LIÊN TIẾP</small></div>`;
}

export function updateAuthUI(){
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

export function guestStateSummary(){
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

export async function maybeOfferGuestMerge(){
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

export function mergeGuestInto(guest){
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
