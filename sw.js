/* Service worker V7.
   Thay đổi so với V6: KHÔNG còn cache-first cho toàn bộ. HTML/JS/CSS dùng
   network-first, nếu không thì người dùng deploy bản mới mà máy khách vẫn chạy
   bản cũ vĩnh viễn cho tới khi tự xoá cache — lỗi kinh điển của PWA tĩnh.
   Dữ liệu corpus (data/*.json) là bất biến theo phiên bản nên vẫn cache-first. */
const VERSION='v10-20260904';
const SHELL_CACHE=`cpa-shell-${VERSION}`;
const DATA_CACHE=`cpa-data-${VERSION}`;

// V8: app.js đã tách thành js/*.js (ES module). Phải precache đủ 13 tệp, nếu không
// lần tải thứ hai sẽ phải đi mạng cho từng module và mất lợi thế offline.
const MODULES=['util','runtime','store','srs','sessions','content','analytics',
  'sync','auth','views_home','views_study','views_practice','main'].map(m=>`js/${m}.js`);
// Font tự host phải precache: thiếu nó thì lần mở ngoại tuyến đầu tiên rơi về font
// hệ thống, chữ nhảy và bố cục lệch. theme.js cũng phải có, nếu không mở offline sẽ
// mất luôn chế độ nền tối.
const FONTS=['pjs-latin-400','pjs-latin-500','pjs-latin-600','pjs-latin-700','pjs-latin-800',
  'pjs-viet-400','pjs-viet-500','pjs-viet-600','pjs-viet-700','pjs-viet-800',
  'news-400','news-500','news-600','news-400i','news-viet-400','news-viet-500','news-viet-600']
  .map(f=>`fonts/${f}.woff2`);
const SHELL=['./','index.html','styles.css','theme.js','config.js','vendor/supabase-js-2.112.4.js','manifest.webmanifest','icon.svg','404.html',
  'data/manifest.json',...MODULES,...FONTS];
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
