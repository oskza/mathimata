"""Import the supplied local PDFs. Runtime and subsequent builds use portable JSON.
Requires pdftotext only when reimporting PDFs. Never executes code from an exam.
"""
from pathlib import Path
import json,re,shutil,subprocess,collections
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT.parent
MANIFEST=json.loads((ROOT/'data/imports/manifest.json').read_text())
TRANSLATE=str.maketrans({'∆':'Δ','Ω':'Ω','µ':'μ','\u037e':';','\u2e02':'','\x07':'','൅':'+'})
def text(row):return (ROOT/row['text']).read_text().translate(TRANSLATE)
def row(s,i):return next(r for r in MANIFEST if r['text']==f'data/imports/{s}-{i:03}.txt')
def copy(src,dst):
 dest=ROOT/dst;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(WORK/src,dest);return dst

def cleaned(t):
 lines=[]
 for line in t.splitlines():
  if re.search(r'ΑΡΧΗ .*ΣΕΛ|ΤΕΛΟΣ .*ΣΕΛ|Σελίδα \d|Κάνιγγος|Πλατεία Κάνιγγος|210-3304429|info@|Γ΄ ΤΑΞΗΣ ΗΜΕΡΗΣΙΩΝ &',line):continue
  lines.append(line.rstrip())
 return re.sub(r'\n[ \t]*\n(?:[ \t]*\n)+','\n\n','\n'.join(lines)).strip()
def main_blocks(t):
 pat=r'(?im)^\s*Θ[Εέ]Μ?Α?\s+([ΑAΒBΓΔ1-4])(?:ο)?[.)]?[^\S\n]*(?:\n|$)'
 # Most documents spell Θέμα with lowercase letters.
 pat=r'(?im)^[ \t\f]*Θ[Εέ][Μμ][Αα][ \t]+([ΑAΒBΓΔ1-4])(?:ο)?[.)]?[ \t]*(?:\n|$)'
 ms=list(re.finditer(pat,t));out={}
 for j,m in enumerate(ms):
  k=m[1].translate(str.maketrans({'A':'Α','B':'Β','1':'1','2':'2','3':'3','4':'4'}));end=ms[j+1].start() if j+1<len(ms) else len(t)
  out[k]=(t[m.end():end],m.end())
 return out

def sub_blocks(t):
 ms=list(re.finditer(r'(?m)^[ \t\f]*([ΑAΒBΓΔ])[.]?(\d+)[.)]?(?=[ \t\n]|$)',t));out={}
 for j,m in enumerate(ms):
  k=m[1].replace('A','Α').replace('B','Β')+m[2];end=ms[j+1].start() if j+1<len(ms) else len(t)
  next_main=re.search(r'(?im)^[ \t\f]*Θ[Εέ][Μμ][Αα]\s+[ΑAΒBΓΔ]', t[m.end():end])
  if next_main:end=m.end()+next_main.start()
  out[k]=(t[m.end():end],m.end())
 return out

def pages(t,start,end):return list(range(t[:start].count('\f')+1,t[:max(start,end-1)].count('\f')+2))
def answer_info(s,year,primary,key):
 r=row(s,primary);t=text(r); blocks=sub_blocks(t); main=main_blocks(t)
 base=key.split('.')[0]; found=blocks.get(base) if re.search(r'\d',base) else main.get(base)
 if not found:found=main.get(base[0])
 if not found:found=(t,0)
 excerpt,start=found;ps=pages(t,start,start+len(excerpt))
 return {'sourceId':f'{s}-answers-{year}-{primary}','path':f'assets/{s}/answers/{Path(r["path"]).name}','pages':ps,'label':Path(r['path']).name},cleaned(excerpt)

NET_PRIMARY={2009:5,2010:7,2011:9,2012:11,2013:14,2014:16,2015:18,2016:22,2017:27,2018:30,2019:36,2020:42,2021:48,2022:53,2023:58,2024:60,2025:72,2026:74}
PROG_PRIMARY={2010:4,2012:6,2013:8,2014:10,2015:13,2016:15,2017:17,2018:22,2019:27,2020:30,2021:33,2022:38,2023:49,2024:51,2025:62,2026:70}
PROG_EXAMS={2010:3,2012:5,2013:7,2014:9,2015:11,2016:14,2017:16,2018:18,2019:23,2020:28,2021:32,2022:41,2023:42,2024:50,2025:58,2026:69}
PROG_PRIMARY={y:i for y,i in PROG_PRIMARY.items() if y>=2017}
PROG_EXAMS={y:i for y,i in PROG_EXAMS.items() if y>=2017}
# Transcribed from the selected supplied answer sheets, never inferred from question wording.
BOOL={2010:'ΣΣΣΛΛ',2012:'ΣΛΛΣΣ',2013:'ΛΛΣΛΣ',2014:'ΣΣΛΣΛΣ',2015:'ΣΛΛΣΣΣ',2016:'ΣΛΛΣΣΣ',2017:'ΣΛΣΣΛ',2018:'ΣΣΛΣΛ',2019:'ΛΣΛΣΣ',2020:'ΣΛΛΣΣ',2021:'ΣΣΛΣΛ',2022:'ΛΣΣΛΣ',2023:'ΣΛΛΣΣ',2024:'ΣΛΛΛΣ',2025:'ΣΣΛΛΣ',2026:'ΣΛΣΛΣ'}
MATCH={2010:'δ α β ε γ',2012:'ε γ α στ β',2013:'β ε στ α δ',2014:'β γ ε στ δ',2015:'γ δ α ζ β ε',2016:'β στ α ζ γ δ',2017:'στ γ δ α β',2019:'δ γ α β',2021:'δ α ε στ β',2022:'ε στ γ α β',2023:'β α στ ε γ',2024:'β στ δ γ α',2025:'δ γ β α στ',2026:'γ β α ε στ'}

def import_programming():
 questions=[]
 for year,idx in PROG_EXAMS.items():
  if year < 2017: continue # Pascal exams are explicitly excluded from the application.
  r=row('programming',idx);raw=text(r);raw=re.split(r'Επισημάνσεις για τα θέματα|ΟΔΗΓΙΕΣ ΓΙΑ ΤΟΥΣ',raw)[0];main=main_blocks(raw)
  assert all(k in main for k in ['Α','Β','Γ','Δ']),(year,main.keys())
  records=[]
  for letter,(block,offset) in main.items():
   subs=sub_blocks(block)
   # Keep shared code/data with all its subquestions, especially historic trace tables.
   first=re.search(r'(?m)^\s*[ΑAΒB][.]?\d+[.]',block)
   common=cleaned(block[:first.start()]) if first else cleaned(block)
   if letter in ['Γ','Δ'] or letter=='Β' and len(common)>20:
    records.append((letter,block,offset))
   else:
    for key,(body,off) in subs.items(): records.append((key,body,offset+off))
  for key,body,offset in records:
   bodyclean=cleaned(body)
   ref,solution=answer_info('programming',year,PROG_PRIMARY[year],key)
   q={'id':f'programming:exam:{year}:{key}','subjectId':'programming','year':year,'key':key,'order':len(questions),'sourceKind':'exam','collectionId':f'programming-exam-{year}','language':'pascal' if year<=2016 else 'python2','sections':[],'chapters':[], 'inSyllabus':False,'classificationStatus':'pending','source':f'assets/programming/exams/{Path(r["path"]).name}','pages':pages(raw,offset,offset+len(body)),'original':bodyclean,'prompt':bodyclean,'images':[],'bookRefs':[],'answerSources':[ref],'answerExcerpt':solution,'explanation':solution,'answerStatus':'provided','type':'reading','preserveLayout':True,'solutionLayout':True}
   if key=='Α1':
    ms=list(re.finditer(r'(?m)^\s*(στ|[αβγδε])[.)][ \t]*',body));assert len(ms)==len(BOOL[year]),(year,len(ms))
    for j,m in enumerate(ms):
     statement=cleaned(body[m.end():ms[j+1].start() if j+1<len(ms) else len(body)])
     statement=re.sub(r'Μονάδες\s+\d+','',statement).strip()
     sub={**q,'id':q['id']+'.'+m[1],'key':key+'.'+m[1],'order':len(questions),'type':'boolean','correct':BOOL[year][j]=='Σ','prompt':re.sub(r'\s+',' ',statement),'original':statement,'preserveLayout':False,'explanation':f'Στο παρεχόμενο αρχείο απαντήσεων: {"Σωστό" if BOOL[year][j]=="Σ" else "Λάθος"}.','answerExcerpt':''}
     questions.append(sub)
   else:
    if key=='Α2' and year in MATCH:
     correct=MATCH[year].split();opts=re.findall(r'(?:^|\s)(στ|[αβγδεζ])[.)]\s+',body)
     opts=list(dict.fromkeys(opts));assert set(correct)<=set(opts),(year,opts)
     q.update(type='match',items=[{'id':str(i+1),'label':f'Στοιχείο {i+1} της στήλης Α','correct':a} for i,a in enumerate(correct)],options=[{'id':a,'label':f'Επιλογή {a} της στήλης Β (βλ. πίνακα)'} for a in opts])
    questions.append(q)
 return questions

if __name__=='__main__':
 # Copy the user-supplied answer files; retain alternate solutions for cross-checking.
 for r in MANIFEST:
  if not re.search(r'/20\d\d/',r['path']):continue
  s=r['subject']
  if s=='programming' and int(re.search(r'/([12][0-9]{3})/',r['path'])[1])<2017:continue
  isexam= s=='programming' and r in [row(s,i) for i in PROG_EXAMS.values()] or s=='networks' and '/Απαντησεις/' not in r['path']
  copy(r['path'],f'assets/{s}/{"exams" if isexam else "answers"}/{Path(r["path"]).name}')
 for s,dirname in [('networks','Δικτυα Υπολογιστων - Γ ΕΠΑΛ'),('programming','Προγραμματισμος Υπολογιστων - Γ ΕΠΑΛ')]:copy(dirname+'/Υλη.md',f'data/courses/{s}-syllabus.md')
 copy(row('programming',0)['path'],'assets/programming/book.pdf')
 qs=import_programming()
 (ROOT/'data/programming-import.json').write_text(json.dumps(qs,ensure_ascii=False,indent=2))
 print('Imported programming:',len(qs),dict(collections.Counter(q['type'] for q in qs)))
