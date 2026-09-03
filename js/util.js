/* util.js — Hàm tiện ích thuần: DOM selector, escape, định dạng, phát âm. Không phụ thuộc module nào khác.
   Tệp này do qa/split_modules.py sinh ra từ app.js. */
import { state } from './runtime.js';

export const CFG = window.CPA_CONFIG || {};

export const $ = (s, root=document) => root.querySelector(s);

export const $$ = (s, root=document) => [...root.querySelectorAll(s)];

export const esc = (v='') => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

export const nowIso = () => new Date().toISOString();

export const dateKey = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

export const clamp = (n,a,b) => Math.max(a,Math.min(b,n));

export const shuffled = arr => {const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};

export const sample = arr => arr[Math.floor(Math.random()*arr.length)];

export const fmtMin = sec => `${Math.round((sec||0)/60)} phút`;

export const norm = s => String(s||'').trim().toLowerCase();

export const itemId = (type,key) => `${type}:${norm(key)}`;

export const unique = arr => [...new Set(arr.filter(Boolean))];

export const fmtDate = iso => iso ? new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(iso)) : '—';

export function toast(msg){ const el=$('#toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),2600); }

export function setSyncBadge(kind,text){ const el=$('#syncBadge'); el.className=`sync-badge ${kind}`; el.textContent=text; }

export function speak(text,rate=null){
  if(!('speechSynthesis' in window)) return toast('Trình duyệt không hỗ trợ đọc tiếng Anh.');
  speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang='en-US';
  u.rate=Number(rate ?? state.settings.speechRate ?? .88); u.pitch=1;
  const voices=speechSynthesis.getVoices?.()||[];
  u.voice=voices.find(v=>/^en-US$/i.test(v.lang)&&/Samantha|Ava|Google US English|Microsoft/i.test(v.name)) || voices.find(v=>/^en-US/i.test(v.lang)) || voices.find(v=>/^en/i.test(v.lang)) || null;
  speechSynthesis.speak(u);
}

export function speakSlow(text){speak(text,.68);}

export const uuid=()=>globalThis.crypto?.randomUUID?.() || `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;

export function endOfDayMs(){const d=new Date();d.setHours(24,0,0,0);return d.getTime();}

export const hashCode=s=>{let h=0;for(let i=0;i<s.length;i++){h=(h<<5)-h+s.charCodeAt(i);h|=0;}return h;};
