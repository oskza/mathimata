"""One-time, reviewed layout migration. Normal builds use the stored promptBlocks.
Ranges are inclusive PDF-extraction line numbers; originals remain untouched.
"""
from pathlib import Path
import json,re,textwrap
ROOT=Path(__file__).resolve().parents[2]
CODE={
'2017:Β1':[(5,9)],'2017:Β2':[(3,14)],'2017:Β4':[(4,8)],
'2018:Α2':[(1,6)],'2018:Β1':[(2,4)],'2018:Β3':[(3,10)],
'2019:Α3':[(7,13)],'2019:Β1':[(1,5)],'2019:Β3':[(1,7)],
'2020:Β1':[(3,20)],'2020:Β2':[(2,15)],
'2021:Β1':[(2,5)],'2021:Β2':[(3,7),(15,15)],
'2022:Β1':[(1,1),(3,3),(6,9)],'2022:Β2':[(1,5)],'2022:Β3':[(8,13)],
'2023:Β1':[(1,5)],'2023:Β2':[(4,9)],
'2024:Β3':[(2,4)],'2025:Β1':[(1,4)],'2025:Β2':[(4,8)],'2025:Β3':[(3,7)],
'2026:Β1':[(4,10)],'2026:Β2':[(2,12)],'2026:Β3':[(2,8)]}
LAYOUT={
'programming':{'2017:Γ':[(6,9),(24,26)],'2018:Β2':[(1,3)],'2018:Δ':[(3,8)],'2019:Β2':[(8,13)],'2020:Α2':[(3,6)],'2021:Γ':[(3,7)],'2022:Γ':[(4,7)],'2023:Β3':[(7,11)],'2024:Β2':[(1,2)],'2024:Δ':[(3,7)]},
'networks':{'2009:4.Α':[(8,14)],'2010:Γ3':[(3,6)],'2010:Δ2':[(6,12)],'2011:Δ2':[(19,36)],'2012:Γ3':[(3,7)],'2013:Γ1':[(10,40)],'2013:Γ2':[(4,5)],'2014:Γ1':[(5,20)],'2014:Γ2':[(5,5)],'2015:Γ1':[(6,21)],'2015:Γ2':[(4,8)],'2015:Δ1':[(18,24)],'2016:Γ2':[(3,9),(21,40)],'2016:Δ':[(4,11)],'2017:Γ1':[(2,11)],'2017:Δ':[(13,23),(28,33)],'2018:Γ':[(18,25)],'2019:Γ':[(13,20)],'2020:Δ':[(4,19)],'2021:Γ':[(4,20)],'2022:Δ':[(3,12)],'2023:Γ2':[(3,12)],'2024:Γ':[(4,13),(19,24)],'2025:Β1':[(5,11)],'2025:Γ':[(5,17)],'2025:Δ':[(5,12)],'2026:Γ':[(10,18)],'2026:Δ':[(15,23)]}}
LABEL=re.compile(r'^((?:[Α-Ω]\d+\.?|[α-ωΑ-Ω][.)]|\d+[.)]|\(\d+\)|[•●▪]))\s+(.*)$')
def prose(text):
 # Only join hyphenated Greek words across a PDF line break.
 text=re.sub(r'([α-ωάέήίόύώϊϋΐΰ])[-‐]\s*\n\s*([α-ωάέήίόύώϊϋΐΰ])',r'\1\2',text)
 return re.sub(r'\s+',' ',text).strip()
def paragraphs(lines):
 blocks=[];pending=[];label=None
 def flush():
  nonlocal pending,label
  if pending:
   b={'type':'paragraph','text':prose('\n'.join(pending))}
   if label:
    if not blocks or blocks[-1]['type']!='list':blocks.append({'type':'list','items':[]})
    blocks[-1]['items'].append({'label':label,'blocks':[b]})
   else:blocks.append(b)
  pending=[];label=None
 for raw in lines:
  s=raw.strip()
  if not s:
   if pending and re.search(r'[.:;;!?)»]$',pending[-1].strip()):flush()
   continue
  if re.fullmatch(r'\(?Μονάδ(?:ες|α)\s+\d+\)?',s):
   flush();blocks.append({'type':'note','text':s});continue
  m=LABEL.match(s)
  if m:
   flush();label=m[1];pending=[m[2]]
  else:
   if s.startswith(('Σημείωση:', 'Να αναπτύξετε πρόγραμμα', 'Να γράψετε πρόγραμμα')):flush()
   pending.append(raw)
 flush();return blocks

def migrate(q,course):
 key=f"{q['year']}:{q['key']}"
 text=q['original'] if course=='networks' and q.get('preserveLayout') else q['prompt']
 if not q.get('preserveLayout'):return paragraphs(text.splitlines())
 lines=text.splitlines();spans=[(a,b,'pre') for a,b in LAYOUT[course].get(key,[])]
 if course=='programming':spans += [(a,b,'code') for a,b in CODE.get(key,[])]
 blocks=[];cursor=0
 for a,b,kind in sorted(spans):
  assert cursor<=a<=b<len(lines),(key,a,b)
  blocks.extend(paragraphs(lines[cursor:a]))
  blocks.append({'type':kind,'text':textwrap.dedent('\n'.join(l.rstrip() for l in lines[a:b+1])).strip('\n')})
  cursor=b+1
 blocks.extend(paragraphs(lines[cursor:]));return blocks

def p(text):return {'type':'paragraph','text':text}
def code(text):return {'type':'code','text':text}
def table(headers,rows):return {'type':'table','headers':headers,'rows':rows}
def items(values):return {'type':'list','items':[{'label':label,'blocks':[code(text)]} for label,text in values]}

for course in ['programming','networks']:
 path=ROOT/f'data/courses/{course}.json';bank=json.loads(path.read_text())
 for q in bank['questions']:q['promptBlocks']=migrate(q,course)
 if course=='programming':
  bykey={f"{q['year']}:{q['key']}":q for q in bank['questions']}
  # Repair letter spacing introduced by PDF extraction, without changing wording.
  repairs={
   '2017:Β1':{'προ γράμματο ς':'προγράμματος','υπάρχο υν':'υπάρχουν','υπογραμμισ μένα':'υπογραμμισμένα','έχο υν':'έχουν','σ το':'στο','σ ας':'σας','το υς':'τους','πο υ':'που','αντιστο ιχο ύν':'αντιστοιχούν','σ τα':'στα','το υ':'του','τμήματο ς':'τμήματος','σ ε':'σε','αριθμ ό':'αριθμό','σ υμπληρω θεί':'συμπληρωθεί','ώσ τε':'ώστε','σω σ τά':'σωστά','ταξ ινό μησ η':'ταξινόμηση'},
   '2017:Β3':{'τ ο τριπλάσιό':'το τριπλάσιό'},
   '2017:Γ':{'τ ον παρακάτω':'τον παρακάτω'},
   '2017:Δ':{'το ν μέσο':'τον μέσο'},
   '2018:Β2':{'παρακά τω':'παρακάτω'},
   '2020:Α2':{'το ν αριθμό':'τον αριθμό'},
   '2021:Δ':{'τη ς Ελλάδας':'της Ελλάδας'}
  }
  def repair(blocks,replacements):
   for b in blocks:
    if b['type']=='list':
     for item in b['items']:repair(item['blocks'],replacements)
    elif b['type']=='paragraph':
     for old,new in replacements.items():b['text']=b['text'].replace(old,new)
  for key,replacements in repairs.items():repair(bykey[key]['promptBlocks'],replacements)
  def replace(key,oldtype,new):
   blocks=bykey[key]['promptBlocks'];index=next(i for i,b in enumerate(blocks) if b['type']==oldtype);blocks[index]=new
  bykey['2017:Α3']['promptBlocks']=[p('Να γράψετε στο τετράδιό σας το αποτέλεσμα που εμφανίζεται στην οθόνη μετά την εκτέλεση καθεμιάς από τις παρακάτω εντολές:'),items([('α.','range(2,10)'),('β.','range(2,10,3)'),('γ.','a = "abc"\nprint a*2'),('δ.','x=2\ny=3\nprint 2*x+y'),('ε.','a=2\nprint a**3')]),{'type':'note','text':'Μονάδες 5'}]
  replace('2020:Α2','pre',items([('1.','a = 5\nwhile a-1!=4:\n    print a\n    a+=1'),('2.','i = 3\nwhile i<=12:\n    i+=2\n    print i'),('3.','y = 2\nwhile y>-3:\n    print y\n    y-=1')]))
  replace('2018:Β2','pre',table(['Θέση']+list(map(str,range(14))),[['Α']+list(map(str,[1,1,2,3,5,8,13,21,34,55,89,94,96,99]))]))
  replace('2024:Β2','pre',table(['Θέση']+list(map(str,range(10))),[['Τιμή']+list(map(str,[235,181,145,98,73,42,31,29,12,7]))]))
  replace('2017:Γ','pre',table(['Τύπος οχήματος','Μέλη ΚΤΕΟ','Μη μέλη ΚΤΕΟ'],[['Φορτηγά','70 ευρώ','80 ευρώ'],['Επιβατικά','40 ευρώ','50 ευρώ'],['Μοτοσυκλέτες','25 ευρώ','30 ευρώ']]))
  replace('2021:Γ','pre',table(['Τύπος εμβολίου','Ηλικία'],[['Τύπος 1','Από 40 έως και 50'],['Τύπος 2','Από 51 έως και 60'],['Τύπος 3','Από 61 έως και 70'],['Τύπος 4','Άνω των 70']]))
  replace('2022:Γ','pre',table(['Αριθμός τεμαχίων','Τιμή ανά τεμάχιο'],[['1 έως και 3','120 ευρώ'],['από 4 έως και 6','100 ευρώ'],['πάνω από 6','70 ευρώ']]))
  for key,values in [('2019:Β2',['55','34','5','2','2','1']),('2023:Β3',['7','8','3','4','‐2'])]:
   replace(key,'pre',table(['Πέρασμα']+[str(i+1) for i in range(len(values))],[['Αρχική λίστα Α']+values]+[[f'{i}ο πέρασμα'+(' (μον. 2)' if key.startswith('2019') else '')]+['']*len(values) for i in range(1,len(values))]))
 path.write_text(json.dumps(bank,ensure_ascii=False,indent=2)+'\n')
 print(course,len(bank['questions']),'formatted prompts')
