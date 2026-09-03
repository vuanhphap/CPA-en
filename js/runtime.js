/* runtime.js — Trạng thái chạy dùng chung giữa các module. Đọc bằng live binding của ESM; ghi bắt buộc qua setter.
   Tệp này do qa/split_modules.py sinh ra từ app.js. */

export let db = null;

export let currentUser = null;

export let profile = null;

export let activeView = 'dashboard';

export let data = {core:[],topic:[],families:[],collocations:[],general:[],topics:[],exams:[],glosses:{},ipa:{},sentences:[],wf:[],tr:[],tle:[],tlv:[]};

export let stateScope = 'guest';

export let state = null;   // nap trong store.js, xem ghi chu o do

export let liveSessionId = null;

export let quiz = null;

export let quizSessionId = null;

export let examTimer = null;

export let examRemaining = 90*60;

export let examRawText = '';

export let realtimeLive=false;

export let drillState=null;

export function setDb(v){ db = v; }
export function setCurrentUser(v){ currentUser = v; }
export function setProfile(v){ profile = v; }
export function setActiveView(v){ activeView = v; }
export function setData(v){ data = v; }
export function setStateScope(v){ stateScope = v; }
export function setState(v){ state = v; }
export function setLiveSessionId(v){ liveSessionId = v; }
export function setQuiz(v){ quiz = v; }
export function setQuizSessionId(v){ quizSessionId = v; }
export function setDrillState(v){ drillState = v; }
export function setExamTimer(v){ examTimer = v; }
export function setExamRemaining(v){ examRemaining = v; }
export function setExamRawText(v){ examRawText = v; }
export function setRealtimeLive(v){ realtimeLive = v; }
