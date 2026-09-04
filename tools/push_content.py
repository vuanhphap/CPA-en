#!/usr/bin/env python3
"""Đẩy corpus JSON lên bảng content_items của Supabase và tăng số phiên bản.

Đây là mảnh còn thiếu của tính năng "corpus có phiên bản": bảng đã sẵn sàng từ
migration V8, nhưng chưa có công cụ nạp nên vẫn phải sửa nội dung bằng cách deploy
lại. Có script này thì sửa nội dung ôn thi không cần đụng vào code.

Cần SERVICE-ROLE key vì RLS chỉ cho admin ghi. Key này KHÔNG BAO GIỜ được đưa vào
repo hay vào trình duyệt — chỉ chạy tại máy hoặc trong CI có secret.

    export SUPABASE_URL=https://<ref>.supabase.co
    export SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

    python3 tools/push_content.py --list              # xem trạng thái từng pack
    python3 tools/push_content.py --dry-run core      # xem trước, không ghi
    python3 tools/push_content.py core glosses        # đẩy vài pack
    python3 tools/push_content.py --all               # đẩy tất cả

Sau khi đẩy, client sẽ tự phát hiện phiên bản mới ở lần mở kế tiếp và thay nội dung
tại chỗ; không cần deploy lại app.
"""
import argparse
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'

# pack_id -> (tệp nguồn, trường dùng làm khoá mục)
# Khoá mục phải ổn định giữa các lần đẩy, nếu không mỗi lần nạp sẽ tạo hàng mới
# thay vì cập nhật hàng cũ.
PACKS = {
    'core':         ('core_cpa.json',       'entry'),
    'topic':        ('topic_vocab.json',    'word'),
    'families':     ('word_families.json',  'root'),
    'collocations': ('collocations.json',   'term_fixed_phrase'),
    'topics':       ('topic_summary.json',  'topic'),
    'sentences':    ('sentences.json',      None),
    'exams':        ('exams.json',          'year'),
    'wf':           ('drills_wf.json',      None),
    'tr':           ('drills_tr.json',      None),
    'tle':          ('drills_tle.json',     None),
    'tlv':          ('drills_tlv.json',     None),
}

TITLES = {
    'core': 'Core CPA vocabulary', 'topic': 'Từ vựng theo chủ đề',
    'families': 'Word families', 'collocations': 'Collocations',
    'topics': 'Tóm tắt chủ đề', 'sentences': 'Câu corpus',
    'exams': 'Đề gốc OCR', 'wf': 'Drill word formation',
    'tr': 'Drill viết lại câu', 'tle': 'Drill dịch Anh–Việt',
    'tlv': 'Drill dịch Việt–Anh',
}

BATCH = 500


def env(name):
    v = os.environ.get(name)
    if not v:
        sys.exit(f'Thiếu biến môi trường {name}. Xem phần chú thích đầu tệp.')
    return v.rstrip('/')


def request(method, path, key, base, body=None, prefer=None):
    url = f'{base}/rest/v1/{path}'
    data = json.dumps(body).encode() if body is not None else None
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
    }
    if prefer:
        headers['Prefer'] = prefer
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:400]
        if e.code in (401, 403):
            sys.exit(f'{e.code} — key không đủ quyền. Phải dùng SERVICE-ROLE key, '
                     f'không phải anon key.\n{detail}')
        if 'content_items' in detail and 'does not exist' in detail:
            sys.exit('Bảng content_items chưa có. Chạy supabase/schema.sql (khối V8) trước.')
        sys.exit(f'HTTP {e.code} khi {method} {path}\n{detail}')


def load_pack(pack):
    filename, key_field = PACKS[pack]
    rows = json.loads((DATA / filename).read_text(encoding='utf-8'))
    if not isinstance(rows, list):
        sys.exit(f'{filename} không phải mảng JSON — pack chỉ nhận mảng.')
    items, seen = [], {}
    for i, row in enumerate(rows):
        if key_field and isinstance(row, dict) and row.get(key_field) not in (None, ''):
            base_key = str(row[key_field])[:180]
        else:
            base_key = f'{pack}-{i:06d}'
        # Khoá phải duy nhất trong pack; corpus có mục trùng tên nên phải hậu tố.
        n = seen.get(base_key, 0)
        seen[base_key] = n + 1
        item_key = base_key if n == 0 else f'{base_key}#{n}'
        items.append({'pack_id': pack, 'item_key': item_key,
                      'payload': row, 'sort_order': i})
    return items


def checksum(items):
    h = hashlib.sha256()
    for it in items:
        h.update(json.dumps(it['payload'], sort_keys=True, ensure_ascii=False).encode())
    return h.hexdigest()[:32]


def current_packs(key, base):
    rows = request('GET', 'content_packs?select=pack_id,version,checksum,item_count',
                   key, base) or []
    return {r['pack_id']: r for r in rows}


def push(pack, key, base, dry=False, force=False):
    items = load_pack(pack)
    sums = checksum(items)
    existing = current_packs(key, base).get(pack)

    if existing and existing.get('checksum') == sums and not force:
        print(f'  {pack:13} không đổi (v{existing["version"]}, {len(items)} mục) — bỏ qua')
        return False

    version = (existing['version'] + 1) if existing else 1
    print(f'  {pack:13} {len(items)} mục → v{version}'
          f'{" [DRY-RUN]" if dry else ""}')
    if dry:
        return True

    # Ghi items trước, xong mới tăng version. Ngược lại thì client sẽ thấy version
    # mới trong khi nội dung còn đang nạp dở và tải về bản không đầy đủ.
    for i in range(0, len(items), BATCH):
        chunk = items[i:i + BATCH]
        request('POST', 'content_items?on_conflict=pack_id,item_key', key, base,
                body=chunk, prefer='resolution=merge-duplicates,return=minimal')
        print(f'      {min(i + BATCH, len(items))}/{len(items)}', end='\r')
    print(' ' * 30, end='\r')

    # Dọn mục đã bị xoá khỏi nguồn, nếu không pack sẽ phình dần qua các lần đẩy.
    keys = {it['item_key'] for it in items}
    server = request('GET', f'content_items?pack_id=eq.{pack}&select=item_key', key, base) or []
    stale = [r['item_key'] for r in server if r['item_key'] not in keys]
    for s in stale:
        request('DELETE', f'content_items?pack_id=eq.{pack}&item_key=eq.{s}', key, base,
                prefer='return=minimal')
    if stale:
        print(f'      đã xoá {len(stale)} mục không còn trong nguồn')

    request('POST', 'content_packs?on_conflict=pack_id', key, base, body=[{
        'pack_id': pack, 'version': version, 'title': TITLES.get(pack, pack),
        'item_count': len(items), 'checksum': sums, 'is_active': True,
        'published_at': 'now()',
    }], prefer='resolution=merge-duplicates,return=minimal')
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('packs', nargs='*', help=f'tên pack: {", ".join(PACKS)}')
    ap.add_argument('--all', action='store_true', help='đẩy toàn bộ pack')
    ap.add_argument('--list', action='store_true', help='chỉ xem trạng thái')
    ap.add_argument('--dry-run', action='store_true', help='xem trước, không ghi')
    ap.add_argument('--force', action='store_true', help='đẩy cả khi nội dung không đổi')
    a = ap.parse_args()

    base, key = env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY')

    if a.list:
        server = current_packs(key, base)
        print(f'{"pack":14}{"local":>8}{"server":>9}{"version":>9}  trạng thái')
        for p in PACKS:
            local = len(load_pack(p))
            s = server.get(p)
            state = 'chưa đẩy' if not s else (
                'khớp' if s.get('checksum') == checksum(load_pack(p)) else 'ĐÃ ĐỔI')
            print(f'{p:14}{local:>8}{(s["item_count"] if s else 0):>9}'
                  f'{("v" + str(s["version"])) if s else "—":>9}  {state}')
        return

    targets = list(PACKS) if a.all else a.packs
    if not targets:
        ap.error('cần nêu tên pack, hoặc dùng --all / --list')
    unknown = [p for p in targets if p not in PACKS]
    if unknown:
        sys.exit(f'Pack không tồn tại: {unknown}. Có: {", ".join(PACKS)}')

    print(f'Đẩy lên {base}')
    changed = sum(push(p, key, base, a.dry_run, a.force) for p in targets)
    print(f'\n{changed}/{len(targets)} pack có thay đổi.')
    if changed and not a.dry_run:
        print('Client sẽ tự nhận nội dung mới ở lần mở kế tiếp — không cần deploy lại.')


if __name__ == '__main__':
    main()
