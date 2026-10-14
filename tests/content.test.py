"""Content and extensibility checks. No student or imported code is executed."""
import ast,json,re,shutil,subprocess,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class ContentTests(unittest.TestCase):
 def test_curated_programs_have_valid_structure(self):
  bank=json.loads((ROOT/'data/courses/programming.json').read_text());checked=0
  for q in bank['questions']:
   if q['type']!='reading':continue
   code=q['explanation']
   if not re.match(r'(?:def |[A-Za-z_]\w*\s*=|#)',code):continue
   # Convert print statements only for a syntax check; do not run Python 2 as Python 3.
   code=re.sub(r'(?m)^(\s*)print (.+)$',r'\1print(\2)',code)
   with self.subTest(question=q['id']):ast.parse(code)
   checked+=1
  self.assertGreaterEqual(checked,25)
 def test_prompt_formatting_preserves_source_content(self):
  # Reviewed table transcriptions and the two code lists change layout explicitly.
  overrides={'2017:Α3','2017:Γ','2018:Β2','2019:Β2','2020:Α2','2021:Γ','2022:Γ','2023:Β3','2024:Β2'}
  def flatten(blocks):
   out=[]
   for b in blocks:
    if b['type']=='list':
     for item in b['items']:out.extend([item['label'],flatten(item['blocks'])])
    elif b['type']=='table':out.extend(b['headers']+sum(b['rows'],[]))
    else:out.append(b['text'])
   return ' '.join(out)
  def compact(text):
   text=re.sub(r'([α-ωάέήίόύώϊϋΐΰ])[-‐]\s*\n\s*([α-ωάέήίόύώϊϋΐΰ])',r'\1\2',text)
   return re.sub(r'\s+','',text)
  for course in ['programming','networks']:
   bank=json.loads((ROOT/f'data/courses/{course}.json').read_text())
   for q in bank['questions']:
    with self.subTest(question=q['id']):
     self.assertTrue(q['promptBlocks'])
     if course=='programming' and f"{q['year']}:{q['key']}" in overrides:continue
     source=q['original'] if course=='networks' and q.get('preserveLayout') else q['prompt']
     self.assertEqual(compact(source),compact(flatten(q['promptBlocks'])))
 def test_generic_course_and_extension_build(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'scripts').mkdir();(root/'data/courses').mkdir(parents=True)
   shutil.copy(ROOT/'scripts/build_data.py',root/'scripts/build_data.py')
   def write(p,v):(root/p).write_text(json.dumps(v))
   course={'id':'mathematics','input':'data/courses/math.json','script':'data/courses/math.js','extensions':['data/custom.json']}
   write('data/course-registry.json',{'courses':[course],'sourceKinds':{'custom':'Custom','workbook':'Workbook'}})
   question={'id':'math:custom:1','subjectId':'mathematics','sourceKind':'custom','collectionId':'teacher','key':'1','type':'fields','prompt':'2+2','explanation':'4','fields':[{'label':'Result','kind':'number','answers':['4']}],'answerSources':[{'author':'Test author'}],'sections':['12.1'],'chapters':['12']}
   write('data/courses/math.json',{'subjectId':'mathematics','chapters':{'12':'Chapter'},'sections':{'12.1':['Section',1]},'collections':{},'questions':[]})
   write('data/custom.json',{'subjectId':'mathematics','collections':{'teacher':{'title':'Teacher','kind':'custom'}},'questions':[question]})
   run=lambda:subprocess.run(['python3',str(root/'scripts/build_data.py')],capture_output=True,text=True)
   result=run();self.assertEqual(result.returncode,0,result.stderr)
   self.assertIn('math:custom:1',(root/'data/courses/math.js').read_text())
   self.assertIn('"year":null',(root/'data/courses/math.js').read_text())
   old=(root/'data/courses/math.js').read_text()
   write('data/custom.json',{'subjectId':'mathematics','collections':{'teacher':{'title':'Teacher','kind':'custom'}},'questions':[question,question]})
   self.assertNotEqual(run().returncode,0)
   self.assertEqual((root/'data/courses/math.js').read_text(),old)
if __name__=='__main__':unittest.main()
