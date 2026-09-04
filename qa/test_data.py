from pathlib import Path
import json,re,collections,subprocess,sys
root=Path(__file__).resolve().parents[1]
issues=[]
def load(n):return json.load(open(root/'data'/n,encoding='utf-8'))
core,topic,fam,coll,sents,exams,ipa=(load('core_cpa.json'),load('topic_vocab.json'),load('word_families.json'),load('collocations.json'),load('sentences.json'),load('exams.json'),load('ipa.json'))
for n,v,e in [('core',core,192),('topic',topic,4225),('families',fam,78),('collocations',coll,237),('sentences',sents,472),('exams',exams,14)]:
    if len(v)!=e:issues.append(f'{n}: {len(v)} != {e}')
if len({x['term_fixed_phrase'].lower() for x in coll})!=len(coll):issues.append('duplicate collocations')
if any(x['source_type'] not in {'Corpus confirmed','Learning expansion'} for x in coll):issues.append('bad collocation source label')
if any(x['source_type']=='Learning expansion' and (x.get('exam_freq') or x.get('years_count')) for x in coll):issues.append('expansion claims corpus frequency')
for term in [x['entry'].lower() for x in core if x.get('type')=='Word']+[x['term_fixed_phrase'].lower() for x in coll]+[x['root'].lower() for x in fam]:
    if term not in ipa:issues.append('missing high-priority IPA: '+term)
    elif 'ɾ' in ipa[term] or 'ɐ' in ipa[term]:issues.append('narrow eSpeak allophone in high-priority IPA: '+term)
for x in sents:
    if x['quality'] not in {'high','low'}:issues.append('bad sentence quality '+x['id'])
    if x['source_fidelity'] not in {'Exact OCR','Normalized/cleaned from OCR'}:issues.append('bad fidelity '+x['id'])
    if x.get('focus_term') and x['focus_term'].lower() not in x['text'].lower():issues.append('focus not in sentence '+x['id'])
app=(root/'qa'/'app.legacy.js').read_text(encoding='utf-8')
for needle in ['remainingNew',"q.kind==='cloze'?'question':q.kind","s.source_fidelity==='Exact OCR'","s.quality!=='low'"]:
    if needle not in app:issues.append('missing logic gate: '+needle)
for f in ['qa/app.legacy.js','config.js','sw.js']:
    r=subprocess.run(['node','--check',str(root/f)],capture_output=True,text=True)
    if r.returncode:issues.append('syntax '+f+': '+r.stderr)
print(json.dumps({'issues':issues,'count':len(issues),'sentence_quality':dict(collections.Counter(x['quality'] for x in sents)),'sentence_fidelity':dict(collections.Counter(x['source_fidelity'] for x in sents)),'ipa_count':len(ipa)},ensure_ascii=False,indent=2))
sys.exit(1 if issues else 0)
