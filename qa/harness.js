/* Harness dùng chung cho toàn bộ test.
 *
 * Giải quyết vấn đề: jsdom KHÔNG hỗ trợ <script type="module">, nên không thể test
 * bản tách module bằng cách nạp index.html như trình duyệt. Cách đi vòng: dựng jsdom
 * để lấy DOM, gán các global của trình duyệt (window/document/localStorage/fetch...)
 * vào globalThis của Node, rồi để Node tự import ESM. Module chạy trong Node nhưng
 * nhìn thấy đúng DOM của jsdom.
 *
 * Nhờ vậy CÙNG một bộ test chạy được trên cả hai bản:
 *   MODE=legacy  → nạp app.js  (một IIFE, bản đang ship)
 *   MODE=module  → nạp js/main.js (bản tách module)
 * Hai bản phải cho kết quả giống hệt nhau thì việc refactor mới được coi là an toàn.
 *
 * Node cache module theo đường dẫn, nên mỗi lần boot() phải có bản sao js/ riêng —
 * không thì trạng thái của lần boot trước rò sang lần sau và test sẽ nói dối.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const MODE = process.env.MODE || 'legacy';

let bootCounter = 0;
const tmpRoots = [];

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- Supabase giả lập ---------- */
function makeFakeSupabase(opts = {}) {
  const log = { rpc: [], upsert: {}, insert: {}, update: {}, select: [], auth: [], channels: [] };
  const session = { current: null };
  let authCb = null;
  const rows = opts.rows || {};

  const chain = (table) => {
    let range = null;
    const c = {
      select() { log.select.push(table); return c; },
      eq() { return c; },
      order() { return c; },
      range(a, b) {
        range = [a, b];
        if (table !== 'content_items') return Promise.resolve({ data: [], error: null });
        if (opts.packError) return Promise.resolve({ data: null, error: { message: opts.packError } });
        const r = range[0] === 0 ? (opts.packRows || []) : [];
        return Promise.resolve({ data: r.map(p => ({ payload: p })), error: null });
      },
      limit() { return Promise.resolve({ data: rows[table] || [], error: null }); },
      maybeSingle() { return Promise.resolve({ data: (rows[table] || [])[0] || null, error: null }); },
      single() { return Promise.resolve({ data: (rows[table] || [])[0] || null, error: null }); },
      insert(p) { (log.insert[table] = log.insert[table] || []).push(p); return c; },
      update(p) { (log.update[table] = log.update[table] || []).push(p); return c; },
      upsert(p, o) {
        (log.upsert[table] = log.upsert[table] || []).push({ payload: p, opts: o });
        if (opts.failTable === table) return Promise.resolve({ data: null, error: { message: opts.failMessage || 'boom' } });
        return Promise.resolve({ data: null, error: null });
      },
      then(res) { return Promise.resolve({ data: rows[table] || [], error: null }).then(res); }
    };
    return c;
  };

  return {
    log, session,
    fireAuth: (event, s) => { session.current = s; authCb && authCb(event, s); },
    client: {
      from: chain,
      rpc: (name, args) => {
        log.rpc.push([name, args]);
        if (opts.rpcHandler) return Promise.resolve(opts.rpcHandler(name, args));
        if (opts.failRpc === name) return Promise.resolve({ data: null, error: { message: opts.failMessage || 'network down' } });
        if (name === 'content_manifest') return Promise.resolve({ data: opts.manifest || [], error: null });
        if (name === 'log_learning_events') {
          const n = (args?.events || []).length;
          if (opts.quotaFull) return Promise.resolve({ data: [{ accepted: 0, rejected: n, quota_used: 5000, quota_limit: 5000 }], error: null });
          return Promise.resolve({ data: [{ accepted: n, rejected: 0, quota_used: n, quota_limit: 5000 }], error: null });
        }
        return Promise.resolve({ data: 0, error: null });
      },
      channel: (name) => {
        const ch = {
          name, handlers: [],
          on(ev, filter, cb) { ch.handlers.push({ ev, filter, cb }); return ch; },
          subscribe(cb) { ch.subscribed = true; cb && cb('SUBSCRIBED'); return ch; },
          unsubscribe() { ch.subscribed = false; return Promise.resolve(); }
        };
        log.channels.push(ch);
        return ch;
      },
      removeChannel: (ch) => { if (ch) ch.subscribed = false; return Promise.resolve(); },
      auth: {
        getSession: () => Promise.resolve({ data: { session: session.current } }),
        onAuthStateChange: cb => { authCb = cb; return { data: { subscription: { unsubscribe() { } } } }; },
        signInWithPassword: p => { log.auth.push(['signInWithPassword', p]); return Promise.resolve({ error: null }); },
        signUp: p => { log.auth.push(['signUp', p]); return Promise.resolve({ data: { session: null }, error: null }); },
        signInWithOAuth: p => { log.auth.push(['signInWithOAuth', p]); return Promise.resolve({ error: null }); },
        resetPasswordForEmail: (e, o) => { log.auth.push(['resetPasswordForEmail', e, o]); return Promise.resolve({ error: null }); },
        updateUser: p => { log.auth.push(['updateUser', p]); return Promise.resolve({ error: null }); },
        resend: p => { log.auth.push(['resend', p]); return Promise.resolve({ error: null }); },
        signOut: () => { log.auth.push(['signOut']); session.current = null; return Promise.resolve({ error: null }); }
      }
    }
  };
}

/* ---------- Gán global của trình duyệt vào Node ----------
   Chỉ cần cho chế độ module: mã ESM chạy trong Node nên `document` phải là global
   của Node, không phải thuộc tính của một window nào đó. */
const BROWSER_GLOBALS = ['window', 'document', 'localStorage', 'fetch', 'navigator',
  'location', 'history', 'Event', 'CustomEvent', 'Blob', 'URL', 'FileReader',
  'HTMLElement', 'HTMLDialogElement', 'Node', 'getComputedStyle', 'alert', 'confirm',
  'prompt', 'requestAnimationFrame', 'cancelAnimationFrame', 'speechSynthesis',
  'SpeechSynthesisUtterance', 'crypto', 'btoa', 'atob'];

function installGlobals(window) {
  for (const k of BROWSER_GLOBALS) {
    try {
      Object.defineProperty(globalThis, k, {
        value: window[k], writable: true, configurable: true, enumerable: false
      });
    } catch { /* một số global của Node không ghi đè được; bỏ qua */ }
  }
}

/* ---------- boot ---------- */
async function boot(opts = {}) {
  bootCounter++;
  const vc = new VirtualConsole();
  const jsErrors = [];
  vc.on('jsdomError', e => jsErrors.push(String(e.message || e)));
  if (process.env.VERBOSE) vc.on('error', (...a) => jsErrors.push(a.join(' ')));

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace(/<script[^>]*src="https:\/\/cdn[^"]*"[^>]*><\/script>/, '')
    .replace(/<script[^>]*src="(config\.js|app\.js|js\/main\.js)"[^>]*><\/script>/g, '');

  const dom = new JSDOM(html, {
    url: 'http://localhost:8080/', runScripts: 'outside-only',
    pretendToBeVisual: true, virtualConsole: vc
  });
  const { window } = dom;

  const fetched = [];
  window.fetch = async (url) => {
    const rel = String(url).replace(/^https?:\/\/[^/]+\//, '');
    fetched.push(rel);
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
  };

  const fake = opts.noSupabase ? null : makeFakeSupabase(opts.supabase || opts);
  if (fake) window.supabase = { createClient: () => fake.client };
  window.speechSynthesis = { cancel() { }, speak() { }, getVoices: () => [] };
  window.SpeechSynthesisUtterance = function () { };
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  window.confirm = () => opts.confirmValue !== undefined ? opts.confirmValue : true;
  window.prompt = () => opts.promptValue ?? '';
  window.scrollTo = () => { };
  window.requestIdleCallback = undefined;
  // Node có URL riêng, không có createObjectURL/revokeObjectURL của trình duyệt.
  // Bổ sung vào URL của jsdom để mã export/backup chạy được ở cả hai chế độ.
  if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:stub';
  if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = () => { };

  const configSrc = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');

  if (MODE === 'module') {
    // Bản sao riêng cho mỗi lần boot: Node cache ESM theo đường dẫn, dùng chung
    // thư mục sẽ khiến trạng thái của lần boot trước rò sang lần sau.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `cpa-boot-${bootCounter}-`));
    tmpRoots.push(tmp);
    fs.cpSync(path.join(ROOT, 'js'), path.join(tmp, 'js'), { recursive: true });
    // Cố ý KHÔNG gỡ global sau khi boot xong. Mã module tham chiếu `document` trần
    // (vd. `$ = (s, root = document) => ...` — tham số mặc định được tính lúc GỌI,
    // không phải lúc định nghĩa), nên gỡ global sẽ làm mọi lệnh gọi sau đó chết.
    // Mỗi lần boot ghi đè global bằng window mới; do đó chỉ instance boot gần nhất
    // hoạt động đúng ở chế độ module, và test phải dùng xong instance này rồi mới boot tiếp.
    installGlobals(window);
    window.eval(configSrc);
    globalThis.window = window;
    await import(pathToFileURL(path.join(tmp, 'js', 'main.js')).href);
  } else {
    window.eval(configSrc);
    window.eval(fs.readFileSync(path.join(ROOT, 'qa', 'app.legacy.js'), 'utf8'));
  }

  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await sleep(opts.settle ?? 900);

  return {
    window, fake, fetched, jsErrors, dom,
    $: s => window.document.querySelector(s),
    $$: s => [...window.document.querySelectorAll(s)],
    goto: async (view) => {
      window.location.hash = view;
      window.dispatchEvent(new window.Event('hashchange'));
      await sleep(400);
    },
    stateOf: (uid = null) => {
      const key = uid ? `cpa_english_trainer_state_v2:user_${uid}` : 'cpa_english_trainer_state_v2:guest';
      const raw = window.localStorage.getItem(key);
      if (raw === null) {
        const have = [...Array(window.localStorage.length).keys()].map(i => window.localStorage.key(i));
        throw new Error(`Không có state cho hồ sơ ${uid || 'guest'}. Khoá hiện có: ${have.join(', ')}`);
      }
      return JSON.parse(raw);
    }
  };
}

function cleanup() {
  for (const d of tmpRoots) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);

/* ---------- Bộ đếm kết quả ---------- */
function makeReporter(title) {
  let pass = 0, fail = 0;
  const failures = [];
  return {
    section: (s) => console.log(`\n${s}`),
    ok: (name, cond, detail = '') => {
      if (cond) { pass++; console.log(`  ✓ ${name}`); }
      else { fail++; failures.push(name); console.log(`  ✗ ${name} ${detail}`); }
    },
    done: () => {
      console.log(`\n${'='.repeat(52)}`);
      console.log(`${title} [${MODE}]: ${pass} đạt / ${fail} lỗi`);
      console.log('='.repeat(52));
      process.exit(fail ? 1 : 0);
    }
  };
}

module.exports = { boot, sleep, makeReporter, MODE, ROOT, makeFakeSupabase };
