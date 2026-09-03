/* main.js — Điểm vào: định tuyến, nối sự kiện DOM, khởi động ứng dụng.
   Tệp này do qa/split_modules.py sinh ra từ app.js. */
import { $, $$, CFG, esc, toast } from './util.js';
import {
  activeView,
  currentUser,
  drillState,
  examTimer,
  quiz,
  quizSessionId,
  setActiveView,
  setDrillState,
  setExamTimer,
  setLiveSessionId,
  setQuiz,
  setQuizSessionId
} from './runtime.js';
import { clientId, saveState } from './store.js';
import { finishLiveSession, finishLocalSession } from './sessions.js';
import { ensureViewData, loadData, prefetchIdle } from './content.js';
import { flushEventQueue, initSupabase, restoreSession, syncAll } from './sync.js';
import {
  closeUserMenu,
  handleAuthCallback,
  initials,
  oauthSignIn,
  openAuth,
  openProfile,
  renderPwMeter,
  resendConfirm,
  saveProfile,
  setAuthTab,
  signOut,
  submitAuth,
  toggleUserMenu
} from './auth.js';
import {
  renderDashboard,
  renderHistory,
  renderSettings,
  renderWeak,
  setTitle,
  titles
} from './views_home.js';
import {
  renderChunks,
  renderCollocations,
  renderDictionary,
  renderFamilies,
  renderStudy
} from './views_study.js';
import { renderDrills, renderExams, renderQuiz, renderQuizLanding } from './views_practice.js';

export async function navigate(view,resetQuiz=true){
  const prevView=activeView;if(prevView!==view&&(prevView==='study'||prevView==='chunks'))finishLiveSession();
  setActiveView(view);setTitle(view);$$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#sidebar').classList.remove('open');$('#menuButton')?.setAttribute('aria-expanded','false');closeUserMenu();
  if(view!=='exams'){clearInterval(examTimer);setExamTimer(null);}
  if(view!=='quiz'&&resetQuiz){if(quizSessionId)finishLocalSession(quizSessionId);setQuiz(null);setQuizSessionId(null);if(prevView==='quiz')setLiveSessionId(null);}
  if(view!=='drills'){if(drillState?.sessionId)finishLocalSession(drillState.sessionId);setDrillState(null);}
  location.hash=view==='dashboard'?'':view;
  if(!await ensureViewData(view))return;
  if(activeView!==view)return; // người dùng đã chuyển tab khác trong lúc chờ tải
  ({dashboard:renderDashboard,history:renderHistory,study:renderStudy,families:renderFamilies,collocations:renderCollocations,chunks:renderChunks,dictionary:renderDictionary,quiz:()=>quiz?renderQuiz():renderQuizLanding(),drills:renderDrills,exams:renderExams,weak:renderWeak,settings:renderSettings}[view]||renderDashboard)();
}

export function wireUI(){
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

export async function init(){
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
