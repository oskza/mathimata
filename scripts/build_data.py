"""Validate all configured course banks and optional collections; emit offline scripts.
No PDF tools, network access, third-party modules or application edits are needed.
"""
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[1]
def read(path):return json.loads((ROOT/path).read_text())
def validate_blocks(blocks):
 assert isinstance(blocks,list) and blocks,'Empty prompt blocks'
 for block in blocks:
  kind=block['type']
  assert kind in ('paragraph','note','code','pre','list','table'),kind
  if kind=='list':
   assert block['items']
   for item in block['items']:
    assert isinstance(item['label'],str)
    validate_blocks(item['blocks'])
  elif kind=='table':
   assert block['headers'] and block['rows']
   assert all(isinstance(cell,str) for cell in block['headers'])
   assert all(len(row)==len(block['headers']) and all(isinstance(cell,str) for cell in row) for row in block['rows'])
  else:assert isinstance(block['text'],str) and block['text'].strip()

def validate(bank,course,kinds,seen):
 assert bank['subjectId']==course['id'],'Course mismatch'
 for cid,c in bank['collections'].items():assert c['kind'] in kinds,(cid,'Unknown source kind')
 for q in bank['questions']:
  for key,value in {'year':None,'sections':[],'chapters':[],'pages':[],'images':[],'bookRefs':[],'source':'','tags':[],'inSyllabus':False,'original':q.get('prompt',''),'order':0}.items():q.setdefault(key,value)
  assert q['id'] not in seen,('Duplicate question ID',q['id'])
  seen.add(q['id']);assert q['subjectId']==course['id'],q['id']
  assert q['sourceKind'] in kinds and q['collectionId'] in bank['collections'],q['id']
  assert bank['collections'][q['collectionId']]['kind']==q['sourceKind'],q['id']
  assert q['type'] in ['boolean','choice','match','fields','order','reading'],q['id']
  if 'promptBlocks' in q:validate_blocks(q['promptBlocks'])
  assert q['prompt'] and q.get('explanation') and q['answerSources'],('Missing content/provenance',q['id'])
  assert all(s in bank['sections'] for s in q['sections']),q['id']
  assert all(str(c) in bank['chapters'] for c in q['chapters']),q['id']
  assert q['sourceKind']!='exam' or isinstance(q['year'],int),q['id']
  for ref in q['answerSources']:
   if ref.get('path'):assert (ROOT/ref['path']).is_file(),ref['path']
   else:assert ref.get('author'),('Custom answers require attribution',q['id'])
  if q.get('source'):assert (ROOT/q['source']).is_file(),q['source']
  for img in q.get('images',[]):assert (ROOT/img).is_file(),img
  if q['type']=='boolean':assert isinstance(q['correct'],bool),q['id']
  if q['type']=='choice':assert q['correct'] in [o['id'] for o in q['options']],q['id']
  if q['type']=='match':assert all(i['correct'] in [o['id'] for o in q['options']] for i in q['items']),q['id']
  if q['type']=='fields':assert q['fields'] and all(f.get('answers') or f.get('rule') for f in q['fields']),q['id']

def main():
 registry=read('data/course-registry.json');seen=set();courseids=set();outputs=[]
 for course in registry['courses']:
  assert re.fullmatch(r'[a-z][a-z0-9-]*',course['id']) and course['id'] not in courseids
  courseids.add(course['id']);bank=read(course['input'])
  for extension in course.get('extensions',[]):
   extra=read(extension)
   assert extra['subjectId']==course['id']
   for id,c in extra.get('collections',{}).items():
    assert id not in bank['collections'],('Duplicate collection',id);bank['collections'][id]=c
   bank['questions'].extend(extra['questions'])
  validate(bank,course,registry['sourceKinds'],seen)
  outputs.append((ROOT/course['script'],'window.QUIZ_BANKS = window.QUIZ_BANKS || {};\nwindow.QUIZ_BANKS['+json.dumps(course['id'])+'] = '+json.dumps(bank,ensure_ascii=False,separators=(',',':'))+';\n'))
  course['questionCount']=len(bank['questions'])
 # Write only after every course passes validation.
 for path,content in outputs:path.write_text(content)
 (ROOT/'data/catalog.js').write_text('window.QUIZ_CATALOG = '+json.dumps(registry,ensure_ascii=False,separators=(',',':'))+';\n')
 print('Validated',len(seen),'questions in',len(courseids),'courses')
if __name__=='__main__':main()
