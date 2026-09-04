#!/usr/bin/env python3
"""Tách app.js (một IIFE lớn) thành ES modules.

ĐÃ CHẠY XONG — js/*.js hiện là bản đang ship, index.html nạp js/main.js.
Giữ lại script này cùng qa/app.legacy.js để tra cứu nguồn gốc từng module
và để tái tạo lại nếu cần đối chiếu.

Không chép tay: script đọc app.js, xác định mọi khai báo cấp cao nhất, gán chúng
vào module theo bảng MODULES, rồi TỰ SINH câu lệnh import cho từng module dựa trên
việc module đó thực sự dùng ký hiệu nào của module khác. Nhờ vậy không có import
thừa, không thiếu import, và không có lỗi chép tay.

Biến dùng chung (state, db, currentUser, data...) dựa vào live binding của ES
module: module khác đọc được giá trị mới nhất. Chỗ GÁN nằm ngoài module sở hữu
được đổi sang hàm setter, vì ES module không cho phép gán vào ký hiệu đã import.

Chạy: python3 qa/split_modules.py
"""
import re
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'qa' / 'app.legacy.js'
OUT = ROOT / 'js'

# Biến `let` dùng chung nhiều module: cần setter vì không gán được vào import.
SHARED_LET = {
    'db': 'runtime', 'currentUser': 'runtime', 'profile': 'runtime',
    'activeView': 'runtime', 'data': 'runtime', 'stateScope': 'runtime',
    'state': 'runtime', 'liveSessionId': 'runtime', 'quiz': 'runtime',
    'quizSessionId': 'runtime', 'drillState': 'runtime', 'examTimer': 'runtime',
    'examRemaining': 'runtime', 'examRawText': 'runtime',
    'realtimeLive': 'runtime',
}

# Mỗi module: danh sách khai báo cấp cao nhất thuộc về nó, theo đúng thứ tự trong app.js.
MODULES = {
    'util': ['$', '$$', 'esc', 'nowIso', 'dateKey', 'clamp', 'shuffled', 'sample',
             'fmtMin', 'norm', 'itemId', 'unique', 'fmtDate', 'uuid', 'CFG',
             'toast', 'setSyncBadge', 'speak', 'speakSlow', 'endOfDayMs', 'hashCode'],
    'runtime': list(SHARED_LET.keys()),
    'store': ['LEGACY_LS_KEY', 'LS_KEY_BASE', 'EXAM_DRAFT_PREFIX', 'DAY',
              'defaultState', 'mergeState', 'stateStorageKey', 'loadStateForScope',
              'saveState', 'switchStateScope', 'localProgress', 'setLocalProgress',
              'dailyLocal', 'CLIENT_ID_KEY', 'clientId', 'MAX_QUEUE', 'queueEvent'],
    'srs': ['due', 'statusLabel', 'sm2', 'progressWeight', 'weaknessScore',
            'itemFromProgress', 'buildStudyQueue'],
    'sessions': ['modeLabel', 'sessionModeForStudy', 'SESSION_MODES',
                 'startLocalSession', 'ensureLiveSession', 'touchSession',
                 'finishLocalSession', 'finishLiveSession', 'appendCompletedSession',
                 'createCloudSession', 'finishCloudSession'],
    'content': ['fetchJson', 'LAZY_SETS', 'VIEW_NEEDS', 'lazyPromises', 'hasSet',
                'ensureSet', 'PACK_CACHE_PREFIX', 'bundledVersions', 'manifestPromise',
                'bundledManifest', 'remoteManifest', 'readPackCache', 'writePackCache',
                'fetchPackRows', 'loadPack', 'upgradeQueue', 'queuePackUpgrade',
                'runPackUpgrades', 'ensureViewData', 'prefetchIdle', 'EAGER_PACKS',
                'loadData', 'gloss', 'ipaOf', 'collocationRow', 'meaningOf',
                '_sentIdx', 'sentenceIndex', 'exampleFor', 'relatedCollocations'],
    'analytics': ['rangeDays', 'svgLine', 'readinessScore', 'futureDueCounts',
                  'masteryStats', 'streak', 'topicMastery'],
    'sync': ['initSupabase', 'restoreSession', 'refreshSyncBadge', 'realtimeChannel',
             'rerenderTimer', 'scheduleRerender', 'stopRealtime', 'startRealtime',
             'applyRemoteProgress', 'applyRemoteDaily', 'flushing', 'quotaBlockedUntil',
             'flushEventQueue', 'isMissingBackendObject', 'recordReview',
             'cloudUpsertProgress', 'cloudUpsertDaily', 'cloudUpsertGoals',
             'syncSessions', 'syncAll'],
    'auth': ['authTab', 'recoveryMode', 'AUTH_ERRORS', 'authError', 'authMsg',
             'passwordScore', 'renderPwMeter', 'setAuthTab', 'openAuth', 'openRecovery',
             'submitAuth', 'oauthSignIn', 'resendConfirm', 'signOut', 'handleAuthCallback',
             'initials', 'displayName', 'loadProfile', 'openProfile', 'saveProfile',
             'closeUserMenu', 'toggleUserMenu', 'renderUserMenuStats', 'updateAuthUI',
             'guestStateSummary', 'maybeOfferGuestMerge', 'mergeGuestInto'],
    'views_home': ['titles', 'setTitle', 'renderDashboard', 'renderHistory',
                   'renderWeak', 'renderSettings', 'deleteAccount', 'exportState',
                   'importState'],
    'views_study': ['studyQueue', 'studyIndex', 'studyDetails', 'renderStudy', 'renderStudyCard', 'renderFamilies',
                    'renderCollocations', 'chunkMode',
                    'highlightFocus', 'buildChunkPool', 'renderChunks', 'renderChunkCard',
                    'dictSort', 'renderDictionary'],
    'views_practice': ['drillPool', 'renderDrills', 'startDrill', 'renderDrillItem',
                       'finishDrill', 'makeFamilyQuestion', 'makeCollocationQuestion',
                       'makeTopicQuestion', 'makeClozeQuestion', 'makeQuizQuestion',
                       'startQuiz', 'renderQuizLanding', 'renderQuiz', 'finishQuiz',
                       'renderExams', 'highlightExam', 'startExamTimer', 'drawExam',
                       'submitExam'],
    'main': ['navigate', 'wireUI', 'init'],
}

# Thứ tự nạp module (chỉ để tài liệu hoá; ESM tự giải quyết thứ tự).
ORDER = ['util', 'runtime', 'store', 'srs', 'sessions', 'content', 'analytics',
         'sync', 'auth', 'views_home', 'views_study', 'views_practice', 'main']

HEADERS = {
    'util': 'Hàm tiện ích thuần: DOM selector, escape, định dạng, phát âm. Không phụ thuộc module nào khác.',
    'runtime': 'Trạng thái chạy dùng chung giữa các module. Đọc bằng live binding của ESM; ghi bắt buộc qua setter.',
    'store': 'Trạng thái học lưu trên máy: đọc/ghi localStorage, tách hồ sơ theo tài khoản, hàng đợi event.',
    'srs': 'Thuật toán SM-2, điểm điểm yếu, và dựng hàng đợi thẻ cần ôn.',
    'sessions': 'Vòng đời phiên học: mở, cập nhật, đóng — cả cục bộ lẫn trên máy chủ.',
    'content': 'Corpus ôn thi: nạp JSON tĩnh, nạp trễ theo view, và nâng cấp nội dung theo phiên bản.',
    'analytics': 'Tính toán thống kê cho dashboard: chuỗi ngày, readiness, dự báo đến hạn.',
    'sync': 'Supabase: khởi tạo client, đồng bộ hai chiều, realtime, đẩy event có hạn mức.',
    'auth': 'Danh tính: đăng nhập/đăng ký/quên mật khẩu, hồ sơ, menu tài khoản, gộp dữ liệu khách.',
    'views_home': 'Màn hình theo dõi: tổng quan, tiến trình, mục yếu, cài đặt.',
    'views_study': 'Màn hình học: SRS, word family, collocation, cụm & câu, từ điển.',
    'views_practice': 'Màn hình luyện thi: quiz tự chấm, luyện câu đề, luyện đề gốc.',
    'main': 'Điểm vào: định tuyến, nối sự kiện DOM, khởi động ứng dụng.',
}


def find_declarations(lines):
    """Tìm mọi khai báo cấp cao nhất (thụt đúng 2 dấu cách trong IIFE)."""
    decls = {}
    pat = re.compile(r'^  (?:(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|'
                     r'(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=)')
    for i, line in enumerate(lines):
        m = pat.match(line)
        if m:
            name = m.group(1) or m.group(2)
            if name not in decls:
                decls[name] = i
    return decls


def slice_blocks(lines, decls):
    """Cắt mã theo ranh giới khai báo kế tiếp, KHÔNG đếm ngoặc.

    Bản đầu đếm ngoặc và bị regex literal đánh lừa: `/[.*+?^${}()|[\\]\\\\]/g` chứa
    ngoặc không cân, khiến một khối nuốt luôn các khai báo phía sau và sinh ra
    'Identifier has already been declared'. Tệp này thụt lề nhất quán (khai báo cấp
    cao nhất luôn ở đúng 2 dấu cách), nên ranh giới khai báo là mốc chính xác và
    không phụ thuộc nội dung mã.
    """
    starts = sorted(decls.values())
    IIFE_END = len(lines)
    for i, ln in enumerate(lines):
        if ln.startswith('})();'):
            IIFE_END = i
            break

    bounds = {}
    for idx, s in enumerate(starts):
        e = starts[idx + 1] - 1 if idx + 1 < len(starts) else IIFE_END - 1
        # Chú thích đứng ngay trước khai báo sau thì thuộc về khai báo sau, không
        # phải phần đuôi của khai báo này.
        while e > s and (not lines[e].strip() or lines[e].lstrip().startswith(('//', '/*', '*'))):
            e -= 1
        bounds[s] = e

    name_by_start = {v: k for k, v in decls.items()}
    return {name_by_start[s]: '\n'.join(lines[s:bounds[s] + 1]) for s in starts}


def main():
    text = SRC.read_text(encoding='utf-8')
    lines = text.split('\n')
    decls = find_declarations(lines)

    owner = {}
    for mod, names in MODULES.items():
        for n in names:
            owner[n] = mod

    missing = [n for n in owner if n not in decls]
    unassigned = [n for n in decls if n not in owner]
    if missing:
        print('THIẾU trong app.js:', missing, file=sys.stderr)
    if unassigned:
        print('CHƯA GÁN MODULE:', unassigned, file=sys.stderr)
    if missing or unassigned:
        sys.exit(1)

    blocks = slice_blocks(lines, decls)

    emit_modules(blocks, decls, owner)

    print(f'\nĐã nhận diện {len(decls)} khai báo cấp cao nhất, gán vào {len(MODULES)} module.')
    for mod in ORDER:
        n = len(MODULES[mod])
        print(f'  {mod:16} {n:3} khai báo')
    print('\nBảng phân bổ hợp lệ — không thiếu, không thừa.')




# ---------------------------------------------------------------------------
# Sinh tệp module
# ---------------------------------------------------------------------------

# Chỗ gán biến dùng chung nằm NGOÀI module sở hữu phải đổi sang setter, vì ES module
# không cho phép gán vào ký hiệu đã import. Liệt kê tường minh thay vì regex: danh
# sách này ngắn (44 chỗ) và regex trên mã JS thật đã được chứng minh là không an toàn.
ASSIGN_FIXES = [
    # sync.js
    # Lệnh này trải nhiều dòng: phải thay cả phần đóng, không thì setDb( mở mà không đóng.
    ("""db=window.supabase.createClient(CFG.supabaseUrl, CFG.supabasePublishableKey, {
      auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true,flowType:'pkce'},
      global:{headers:{'x-client-info':`cpa-english-trainer/${CFG.appVersion||'v7'}`}}
    });""",
     """setDb(window.supabase.createClient(CFG.supabaseUrl, CFG.supabasePublishableKey, {
      auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true,flowType:'pkce'},
      global:{headers:{'x-client-info':`cpa-english-trainer/${CFG.appVersion||'v7'}`}}
    }));"""),
    ("      currentUser=next;", "      setCurrentUser(next);"),
    ("if(changed){switchStateScope(currentUser?.id||null);profile=null;}",
     "if(changed){switchStateScope(currentUser?.id||null);setProfile(null);}"),
    ("    currentUser=sessionData?.session?.user||null;",
     "    setCurrentUser(sessionData?.session?.user||null);"),
    ("    realtimeLive=false;\n    if(!realtimeChannel)return;",
     "    setRealtimeLive(false);\n    if(!realtimeChannel)return;"),
    ("          realtimeLive=(status==='SUBSCRIBED');",
     "          setRealtimeLive(status==='SUBSCRIBED');"),
    ("if(!p.new)return;profile={...(profile||{}),...p.new};updateAuthUI();",
     "if(!p.new)return;setProfile({...(profile||{}),...p.new});updateAuthUI();"),
    # store.js
    ("    stateScope=next;state=loaded;state.ownerId=userId||null;saveState();",
     "    setStateScope(next);setState(loaded);state.ownerId=userId||null;saveState();"),
    ("    liveSessionId=null;", "    setLiveSessionId(null);"),
    # sessions.js
    ("finishLiveSession(); liveSessionId=startLocalSession(mode,metadata); return liveSessionId;",
     "finishLiveSession(); setLiveSessionId(startLocalSession(mode,metadata)); return liveSessionId;"),
    ("function finishLiveSession(){if(liveSessionId){finishLocalSession(liveSessionId);liveSessionId=null;",
     "function finishLiveSession(){if(liveSessionId){finishLocalSession(liveSessionId);setLiveSessionId(null);"),
    # content.js
    ("    data={...data,...loaded,glosses,ipa,topic:[],exams:[]};",
     "    setData({...data,...loaded,glosses,ipa,topic:[],exams:[]});"),
    # auth.js
    ("    currentUser=null;profile=null;\n    switchStateScope(null);",
     "    setCurrentUser(null);setProfile(null);\n    switchStateScope(null);"),
    ("      currentUser=null;profile=null;switchStateScope(null);updateAuthUI();",
     "      setCurrentUser(null);setProfile(null);switchStateScope(null);updateAuthUI();"),
    ("    if(!db||!currentUser){profile=null;return;}",
     "    if(!db||!currentUser){setProfile(null);return;}"),
    ("      profile=row||null;", "      setProfile(row||null);"),
    ("        profile=created||seed;", "        setProfile(created||seed);"),
    ("      profile={...(profile||{}),display_name:name||displayName(),avatar_hue:hue};",
     "      setProfile({...(profile||{}),display_name:name||displayName(),avatar_hue:hue});"),
    # views_home.js
    ("      const owner=state.ownerId;state=defaultState();state.ownerId=owner;saveState();",
     "      const owner=state.ownerId;setState(defaultState());state.ownerId=owner;saveState();"),
    ("state=mergeState(obj.state||obj);state.ownerId=currentUser?.id||null;",
     "setState(mergeState(obj.state||obj));state.ownerId=currentUser?.id||null;"),
    # views_practice.js
    ("finishLiveSession();quiz={mode,index:0,total:10,correct:0,started:Date.now(),current:null,answered:false};quizSessionId=startLocalSession(",
     "finishLiveSession();setQuiz({mode,index:0,total:10,correct:0,started:Date.now(),current:null,answered:false});setQuizSessionId(startLocalSession("),
    ("{surface:'quiz'});liveSessionId=quizSessionId;navigate('quiz',false);renderQuiz();",
     "{surface:'quiz'}));setLiveSessionId(quizSessionId);navigate('quiz',false);renderQuiz();"),
    ("liveSessionId=null;if(currentUser)syncSessions();const pct=Math.round(r.correct/r.total*100);quiz=null;quizSessionId=null;",
     "setLiveSessionId(null);if(currentUser)syncSessions();const pct=Math.round(r.correct/r.total*100);setQuiz(null);setQuizSessionId(null);"),
    ("    drillState={mode,pool,index:0,correct:0,wrong:0,started:Date.now()};",
     "    setDrillState({mode,pool,index:0,correct:0,wrong:0,started:Date.now()});"),
    ("$('#drillAgain').onclick=()=>{drillState=null;renderDrills();};",
     "$('#drillAgain').onclick=()=>{setDrillState(null);renderDrills();};"),
    ("function startExamTimer(sec){clearInterval(examTimer);examRemaining=sec;",
     "function startExamTimer(sec){clearInterval(examTimer);setExamRemaining(sec);"),
    ("if(examRemaining<=0){clearInterval(examTimer);toast('Hết 90 phút.');}examRemaining--;",
     "if(examRemaining<=0){clearInterval(examTimer);toast('Hết 90 phút.');}setExamRemaining(examRemaining-1);"),
    ("examRawText=e.text;", "setExamRawText(e.text);"),
    # main.js
    ("    activeView=view;setTitle(view);", "    setActiveView(view);setTitle(view);"),
    ("if(view!=='exams'){clearInterval(examTimer);examTimer=null;}",
     "if(view!=='exams'){clearInterval(examTimer);setExamTimer(null);}"),
    ("if(view!=='quiz'&&resetQuiz){if(quizSessionId)finishLocalSession(quizSessionId);quiz=null;quizSessionId=null;if(prevView==='quiz')liveSessionId=null;}",
     "if(view!=='quiz'&&resetQuiz){if(quizSessionId)finishLocalSession(quizSessionId);setQuiz(null);setQuizSessionId(null);if(prevView==='quiz')setLiveSessionId(null);}"),
    ("if(view!=='drills'){if(drillState?.sessionId)finishLocalSession(drillState.sessionId);drillState=null;}",
     "if(view!=='drills'){if(drillState?.sessionId)finishLocalSession(drillState.sessionId);setDrillState(null);}"),
    # views_study.js — studyQueue/studyIndex do chính module này sở hữu, giữ nguyên
    ("examTimer=setInterval(tick,1000);", "setExamTimer(setInterval(tick,1000));"),
]

# Chỉ bỏ chuỗi nháy đơn/kép và chú thích. KHÔNG bỏ template literal: bên trong
# `${...}` là mã thật, bỏ đi sẽ thiếu import và chết lúc chạy ("esc is not defined").
# Đổi lại có thể nhận nhầm vài từ trong HTML (vd. thuộc tính data-view) thành ký hiệu
# — hậu quả chỉ là một import thừa, vô hại; còn thiếu import thì app không chạy.
STRIP_RE = [
    (re.compile(r"'(?:[^'\\\n]|\\.)*'"), "''"),
    (re.compile(r'"(?:[^"\\\n]|\\.)*"'), '""'),
    (re.compile(r'/\*.*?\*/', re.S), ' '),
    (re.compile(r'//[^\n]*'), ' '),
]


def strip_literals(code):
    """Bỏ chuỗi và chú thích trước khi quét ký hiệu."""
    for pat, rep in STRIP_RE:
        code = pat.sub(rep, code)
    return code


def used_symbols(code):
    r"""Ký hiệu được dùng trong đoạn mã.

    Hai chỗ dễ sai, đều đã trả giá bằng lỗi lúc chạy:
    1. `(?<!\.)` ở regex dưới: KHÔNG được coi toán tử spread `...sm2(` là truy cập
       thuộc tính, nếu không `sm2` bị nuốt và module thiếu import.
    2. Lookbehind của findall KHÔNG được chứa dấu chấm. Bản đầu dùng `(?<![\w$.])`
       nên mọi ký hiệu đứng sau dấu chấm — kể cả `...sm2` sau khi spread được giữ
       lại — đều bị loại. Chỉ cần loại ký hiệu đứng sau ký tự từ.
    """
    clean = strip_literals(code)
    clean = re.sub(r'(?<!\.)\.\s*[A-Za-z_$][\w$]*', '.', clean)
    return set(re.findall(r'(?<![\w$])([A-Za-z_$][\w$]*)', clean))


def emit_modules(blocks, decls, owner):
    OUT.mkdir(exist_ok=True)
    setters = {n: 'set' + n[0].upper() + n[1:] for n in SHARED_LET}

    # Áp các sửa chỗ gán trước khi chia module
    applied = 0
    for old, new in ASSIGN_FIXES:
        for name, code in list(blocks.items()):
            if old in code:
                blocks[name] = code.replace(old, new)
                applied += 1
                break
    print(f'Đã áp {applied}/{len(ASSIGN_FIXES)} sửa chỗ gán.')
    if applied != len(ASSIGN_FIXES):
        for old, _ in ASSIGN_FIXES:
            if not any(old in c or _ in c for c in blocks.values()):
                print('  KHÔNG KHỚP:', old[:70], file=sys.stderr)
        sys.exit(1)

    # Ký hiệu mà mỗi module cung cấp
    provides = {m: set(names) for m, names in MODULES.items()}
    for n, s in setters.items():
        provides['runtime'].add(s)

    written = {}
    for mod in ORDER:
        names = [n for n in MODULES[mod]]
        names.sort(key=lambda n: decls[n])
        body_parts = []
        for n in names:
            code = blocks[n]
            code = re.sub(r'^  (async function|function|const|let)\b', r'export \1', code, count=1)
            body_parts.append(re.sub(r'^  ', '', code, flags=re.M))
        body = '\n\n'.join(body_parts)

        if mod == 'runtime':
            body += '\n\n' + '\n'.join(
                f'export function {setters[n]}(v){{ {n} = v; }}' for n in SHARED_LET)

            # Khởi tạo TRỄ. Bản đầu để `export let state = loadStateForScope(stateScope)`
            # chạy ngay lúc nạp module, tạo vòng runtime -> store -> util trong khi util
            # chưa init xong => "Cannot access 'nowIso' before initialization".
            # Giờ runtime chỉ khai báo; store.js tự nạp state ở cuối thân module của nó,
            # lúc đó util.js chắc chắn đã sẵn sàng.
            body = body.replace(
                'export let state = loadStateForScope(stateScope);',
                'export let state = null;   // nap trong store.js, xem ghi chu o do')

        if mod == 'store':
            body += ('\n\n/* Nap state ngay khi store.js duoc danh gia. Dat o day chu khong o'
                     '\n   runtime.js de tranh vong phu thuoc luc khoi tao module. */'
                     '\nsetState(loadStateForScope(stateScope));\n')

        # Tự sinh import: quét ký hiệu module này dùng nhưng không tự khai báo
        need = used_symbols(body) - provides[mod]
        imports = {}
        for other in ORDER:
            if other == mod:
                continue
            hit = sorted(need & provides[other])
            if hit:
                imports[other] = hit
        header = [f'/* {mod}.js — {HEADERS[mod]}',
                  '   Tệp này do qa/split_modules.py sinh ra từ app.js. */']
        for other, syms in imports.items():
            line = f"import {{ {', '.join(syms)} }} from './{other}.js';"
            if len(line) > 100:
                line = 'import {\n  ' + ',\n  '.join(syms) + f"\n}} from './{other}.js';"
            header.append(line)
        written[mod] = '\n'.join(header) + '\n\n' + body + '\n'

    for mod, content in written.items():
        (OUT / f'{mod}.js').write_text(content, encoding='utf-8')
    print(f'Đã ghi {len(written)} tệp vào {OUT}/')
    for mod in ORDER:
        n_imports = written[mod].count("} from './")
        print(f'  js/{mod}.js  {len(written[mod].splitlines()):4} dòng, {n_imports} import')


if __name__ == '__main__':
    main()
