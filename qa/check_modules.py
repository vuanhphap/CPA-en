#!/usr/bin/env python3
"""Bắt lỗi 'Assignment to constant variable' TRƯỚC khi chạy.

ES module không cho gán vào ký hiệu đã import. Nếu bỏ sót một chỗ gán khi tách
module, lỗi chỉ lộ ra lúc chạy đúng nhánh mã đó — có thể là nhánh hiếm. Script này
quét tĩnh mọi module và liệt kê hết một lượt.
"""
import re, pathlib, sys

JS = pathlib.Path(__file__).resolve().parent.parent / 'js'
STRIP = [(re.compile(r"'(?:[^'\\\n]|\\.)*'"), "''"),
         (re.compile(r'"(?:[^"\\\n]|\\.)*"'), '""'),
         (re.compile(r'/\*.*?\*/', re.S), ' '),
         (re.compile(r'//[^\n]*'), ' ')]

def strip(code):
    for p, r in STRIP:
        code = p.sub(r, code)
    return code

bad = []
for f in sorted(JS.glob('*.js')):
    src = f.read_text(encoding='utf-8')
    imported = set()
    for m in re.finditer(r'import\s*\{([^}]*)\}\s*from', src, re.S):
        imported |= {s.strip() for s in m.group(1).split(',') if s.strip()}
    body = strip(src)
    for name in sorted(imported):
        # gán trần: name = / += / -= / ++ / --  (không phải ==, ===, =>, thuộc tính)
        pat = re.compile(r'(?<![\w$.])' + re.escape(name) + r'\s*(?:=(?![=>])|\+\+|--|\+=|-=)')
        for m in pat.finditer(body):
            line_no = body[:m.start()].count('\n') + 1
            snippet = src.split('\n')[line_no - 1].strip()[:100]
            bad.append((f.name, line_no, name, snippet))

# --- Thiếu import: dùng ký hiệu của module khác mà không import ---
# Chính xác vì chỉ đối chiếu với tập ký hiệu export cấp cao nhất; biến cục bộ
# trong hàm không nằm trong tập này nên không tạo báo động giả.
import collections
owner = {}
srcs = {}
for f in sorted(JS.glob('*.js')):
    srcs[f.name] = f.read_text(encoding='utf-8')
    for m in re.finditer(r'^export (?:async function|function|const|let)\s+([A-Za-z_$][\w$]*)', srcs[f.name], re.M):
        owner[m.group(1)] = f.name

missing = []
for fn, src in srcs.items():
    imported = set()
    for m in re.finditer(r'import\s*\{([^}]*)\}\s*from', src, re.S):
        imported |= {s.strip() for s in m.group(1).split(',') if s.strip()}
    body = strip(src)
    body = re.sub(r'^import\s*\{[^}]*\}\s*from[^\n]*$', '', body, flags=re.M)
    body = re.sub(r'(?<!\.)\.\s*[A-Za-z_$][\w$]*', '.', body)
    used = set(re.findall(r'(?<![\w$.])([A-Za-z_$][\w$]*)', body))
    for name in sorted(used):
        if name in owner and owner[name] != fn and name not in imported:
            missing.append((fn, name, owner[name]))

if missing:
    print(f'THIẾU {len(missing)} import (sẽ ném ReferenceError lúc chạy):\n')
    for fn, name, src_mod in missing:
        print(f'  {fn} dùng `{name}` (của {src_mod}) nhưng không import')
    sys.exit(1)

if bad:
    print(f'PHÁT HIỆN {len(bad)} chỗ gán vào ký hiệu đã import (sẽ ném TypeError lúc chạy):\n')
    for fn, ln, name, sn in bad:
        print(f'  {fn}:{ln}  gán vào `{name}`')
        print(f'      {sn}')
    sys.exit(1)
print('✓ Không có chỗ nào gán vào ký hiệu đã import.')
