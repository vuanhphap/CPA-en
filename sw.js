/* Service worker V9.
   Kế thừa V8: KHÔNG còn cache-first cho toàn bộ. HTML/JS/CSS dùng
   network-first, nếu không thì người dùng deploy bản mới mà máy khách vẫn chạy
   bản cũ vĩnh viễn cho tới khi tự xoá cache — lỗi kinh điển của PWA tĩnh.
   Dữ liệu corpus (data/*.json) là bất biến theo phiên bản nên vẫn cache-first. */
const VERSION='v9-20260904';
const SHELL_CACHE=`cpa-shell-${VERSION}`;
const DATA_CACHE=`cpa-data-${VERSION}`;

// V8: app.js đã tách thành js/*.js (ES module). Phải precache đủ 13 tệp, nếu không
// lần tải thứ hai sẽ phải đi mạng cho từng module và mất lợi thế offline.
const MODULES=['util','runtime','store','srs','sessions','content','analytics',
  'sync','auth','views_home','views_study','views_practice','main'].map(m=>`js/${m}.js`);
const SHELL=['./','index.html','styles.css','config.js','js/theme.js','manifest.webmanifest','icon.svg','404.html',
  'data/manifest.json',...MODULES];
const DATA=['data/core_cpa.json','data/word_families.json','data/collocations.json','data/topic_summary.json',
  'data/glosses.json','data/ipa.json','data/sentences.json',
  'data/drills_wf.json','data/drills_tr.json','data/drills_tle.json','data/drills_tlv.json'];

self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const shell=await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL);
    const dataCache=await caches.open(DATA_CACHE);
    // Không để một file lỗi làm hỏng cả lần cài đặt.
    await Promise.allSettled(DATA.map(u=>dataCache.add(u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==SHELL_CACHE&&k!==DATA_CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',e=>{if(e.data==='SKIP_WAITING')self.skipWaiting();});

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);

  // Không đụng vào Supabase/CDN — để trình duyệt tự xử lý, tránh cache token.
  if(url.origin!==location.origin)return;

  // Dữ liệu corpus: cache-first, phục vụ offline.
  if(url.pathname.includes('/data/')){
    e.respondWith((async()=>{
      const hit=await caches.match(req);
      if(hit)return hit;
      const res=await fetch(req);
      if(res.ok)(await caches.open(DATA_CACHE)).put(req,res.clone());
      return res;
    })());
    return;
  }

  // Vỏ ứng dụng: network-first, có mạng thì luôn lấy bản mới nhất.
  e.respondWith((async()=>{
    try{
      const res=await fetch(req);
      if(res.ok)(await caches.open(SHELL_CACHE)).put(req,res.clone());
      return res;
    }catch{
      const hit=await caches.match(req);
      return hit || caches.match('index.html');
    }
  })());
});
