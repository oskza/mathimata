"""Package the validated runtime with only its referenced assets, not import staging."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json,runpy
root=Path(__file__).resolve().parents[1]
runpy.run_path(str(root/'scripts/build_data.py'),run_name='__main__')
registry=json.loads((root/'data/course-registry.json').read_text())
files=set(('index.html','app.js','core.js','styles/app.css','assets/favicon.svg','data/catalog.js','README.md','docs/CONTENT.md','netlify.toml'))
for course in registry['courses']:
    files.update(p for p in (course['script'],course.get('book'),course.get('syllabusSource')) if p)
    bank=json.loads((root/course['input']).read_text())
    questions=bank['questions']
    for extension in course.get('extensions',[]):questions+=json.loads((root/extension).read_text())['questions']
    for q in questions:
        if q.get('source'):files.add(q['source'])
        files.update(q.get('images',[]))
        files.update(ref['path'] for ref in q['answerSources'] if ref.get('path'))
target=root.parent/'diktya-quiz-netlify.zip'
with ZipFile(target,'w',ZIP_DEFLATED) as bundle:
    for name in sorted(files):bundle.write(root/name,name)
    assert bundle.testzip() is None
print(f'{target.name}: {len(files)} files, {target.stat().st_size / 1024 / 1024:.1f} MiB')
