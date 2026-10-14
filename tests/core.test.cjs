const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../core.js');
const root = path.resolve(__dirname, '..');
const bank = JSON.parse(fs.readFileSync(path.join(root, 'data/courses/networks.json'), 'utf8'));
const source = JSON.parse(fs.readFileSync(path.join(root, 'data/source-records.json'), 'utf8'));
const q = id => bank.questions.find(q => q.legacyId === id);
test('all 18 exams and all 236 original records are represented once', () => {
  assert.equal(bank.questions.length, 236);
  assert.equal(new Set(bank.questions.map(q => q.id)).size, 236);
  assert.deepEqual([...new Set(bank.questions.map(q => q.year))].sort(), Array.from({ length: 18 }, (_, i) => 2009 + i));
  for (const r of source.records) assert.ok(q(`${r.year}-${r.key}`));
});
test('every question has a supported input type, solution and existing local resources', () => {
  for (const question of bank.questions) {
    assert.ok(['boolean', 'choice', 'match', 'order', 'fields', 'reading'].includes(question.type));
    assert.ok(question.explanation.trim(), question.id);
    assert.ok(fs.existsSync(path.join(root, question.source)), question.id);
    for (const file of question.images) assert.ok(fs.existsSync(path.join(root, file)), file);
    for (const ref of question.bookRefs) assert.ok(ref.page > 0 && bank.sections[ref.section]);
    if (question.type === 'fields') {
      assert.ok(question.fields.length);
      for (const field of question.fields) assert.ok(field.rule || field.answers.length, question.id + field.label);
    }
    if (question.type === 'choice') assert.ok(question.options.some(o => o.id === question.correct), question.id);
    if (question.type === 'match') for (const item of question.items) assert.ok(question.options.some(o => o.id === item.correct), question.id);
  }
});
test('answer normalization is permissive about format but strict about value', () => {
  const f = (kind, answers) => ({ kind, answers });
  assert.ok(core.checkField(f('number', ['10000']), '10.000 bytes'));
  assert.ok(core.checkField(f('number', ['0']), '0'));
  assert.equal(core.checkField(f('number', ['0']), ''), false);
  assert.equal(core.checkField(f('number', ['25']), '25anything'), false);
  assert.ok(core.checkField(f('binary', ['11111111111111111111111111100000']), '11111111.11111111.11111111.11100000'));
  assert.equal(core.checkField(f('binary', ['101']), '102'), false);
  assert.ok(core.checkField(f('mask', ['255.255.255.224', '/27']), '/27'));
  assert.ok(core.checkField(f('ip', ['192.168.1.0']), '192.168.001.000'));
  assert.equal(core.checkField(f('ip', ['192.168.1.0']), '192.168.1.256'), false);
  assert.ok(core.checkField(f('mac', ['51-3E-AA']), '51:3e:aa'));
  assert.equal(core.checkField(f('mac', ['51-3E-AA']), 'xx513eaa'), false);
  assert.ok(core.checkField(f('hex', ['0x2b41']), '0X2B41'));
  assert.ok(core.checkField(f('set', ['ektor, biomatiko']), 'biomatiko, ektor'));
  assert.equal(core.checkField(f('set', ['ektor, biomatiko']), 'ektor, ektor, biomatiko'), false);
  assert.ok(core.checkField(f('text', ['έμμεση']), 'ΕΜΜΕΣΗ'));
});
test('SMTP accepts dynamic ports, validates reversed ports and rejects collisions', () => {
  const question = q('2014-Γ1');
  const good = ['50000', '25', '25', '50000', '50001', '25', '25', '50001'];
  assert.equal(core.grade(question, good).status, 'correct');
  assert.equal(core.grade(question, ['50000', '25', '25', '50000', '50000', '25', '25', '50000']).status, 'wrong');
  assert.equal(core.grade(question, ['25', '25', '25', '25', '50000', '25', '25', '50000']).status, 'wrong');
  assert.equal(core.grade(question, ['50000', '25', '25', '1234', '50001', '25', '25', '50001']).status, 'wrong');
});
test('2019 fragmentation respects 8-byte alignment, not just MTU minus header', () => {
  const question = q('2019-Γ');
  const value = label => Number(question.fields.find(f => f.label === label).answers[0]);
  assert.equal(value('1ο τμήμα · Δεδομένα'), 776);
  assert.equal(value('1ο τμήμα · Συνολικό μήκος'), 796);
  assert.equal(value('2ο τμήμα · Σχετική θέση'), 97);
  assert.equal(value('3ο τμήμα · Σχετική θέση'), 194);
  assert.equal(value('3ο τμήμα · Δεδομένα'), 228);
  assert.equal(776 + 776 + 228 + 20, 1800);
});
test('2026 fragmentation and subnet solutions are mathematically consistent', () => {
  const fragment = q('2026-Δ');
  const v = label => Number(fragment.fields.find(f => f.label === label).answers[0]);
  assert.equal(v('1ο τμήμα · Συνολικό μήκος'), 1496);
  assert.equal(v('2ο τμήμα · Σχετική θέση'), 184);
  assert.equal(v('3ο τμήμα · Συνολικό μήκος'), 1080);
  assert.equal(v('Συνολικό μήκος αρχικού πακέτου'), 4024);
  const subnet = q('2026-Γ');
  assert.deepEqual(subnet.fields.find(f => f.label === 'Νέα μάσκα υποδικτύων').answers, ['255.255.255.240', '/28']);
  assert.equal(subnet.fields.find(f => f.label === '16ο υποδίκτυο · διεύθυνση δικτύου').answers[0], '192.168.50.240');
  assert.equal(subnet.fields.find(f => f.label === '16ο υποδίκτυο · τελευταίος Η/Υ').answers[0], '192.168.50.254');
});
test('reference input for every objectively graded question passes', () => {
  for (const question of bank.questions) {
    if (question.type === 'reading' || question.reviewOnly) continue;
    let values = question.correct;
    if (question.type === 'match') values = question.items.map(i => i.correct);
    if (question.type === 'fields') values = question.fields.map((f, i) => f.rule === 'client-port' ? String(50000 + i) : f.rule === 'same' ? String(50000 + f.other) : f.answers[0]);
    assert.equal(core.grade(question, values).status, 'correct', question.id);
  }
});
test('ambiguities, reading and revealed solutions do not affect the graded percentage', () => {
  assert.equal(core.grade(q('2012-Α2'), 'β').status, 'studied');
  assert.equal(core.grade(q('2026-Β2'), []).status, 'studied');
  const questions = ['2026-Α1.α', '2026-Α1.β', '2026-Β2', '2012-Α2', '2025-Β2'].map(q);
  const legacyResponses = { '2026-Α1.α': { result: { status: 'correct' } }, '2026-Α1.β': { result: { status: 'wrong' } }, '2026-Β2': { result: { status: 'studied' } }, '2012-Α2': { result: { status: 'studied' } } };
  const responses=Object.fromEntries(Object.entries(legacyResponses).map(([id,r])=>[q(id).id,r]));
  assert.deepEqual(core.summary(questions, responses), { correct: 1, wrong: 1, studied: 2, unanswered: 1, total: 5, graded: 2, percent: 50 });
});
test('filters combine correctly; full-year mode ignores unrelated filters', () => {
  const filtered = core.filterQuestions(bank.questions, { mode: 'practice', chapters: ['3'], sections: ['3.2'], types: ['fields'], year: '2026', syllabus: true });
  assert.deepEqual(filtered.map(q => q.legacyId), ['2026-Δ']);
  const year = core.filterQuestions(bank.questions, { mode: 'year', year: '2026', chapters: ['8'], types: ['reading'], syllabus: true });
  assert.equal(year.length, bank.questions.filter(q => q.year === 2026).length);
  const syllabus = core.filterQuestions(bank.questions, { mode: 'practice', syllabus: true });
  assert.ok(syllabus.every(q => q.chapters.every(c => c < 7)));
  assert.ok(!syllabus.some(q => q.id === '2014-Α3'));
  assert.ok(!syllabus.some(q => q.id === '2020-Α1.δ'));
  const wrong = core.filterQuestions(bank.questions, { mode: 'mistakes' }, new Set([q('2026-Δ').id, q('2025-Γ').id]));
  assert.deepEqual(wrong.map(q => q.legacyId).sort(), ['2025-Γ', '2026-Δ']);
});
test('shuffle preserves membership without mutating the bank', () => {
  const input = [1, 2, 3, 4, 5], copy = input.slice();
  const result = core.shuffle(input, () => 0);
  assert.deepEqual(input, copy); assert.deepEqual(result.slice().sort(), copy); assert.notDeepEqual(result, copy);
});

 test('matching accepts both network-layer protocols in the ambiguous 2011 item', () => {
  const q = require('../data/courses/networks.json').questions.find(q => q.legacyId === '2011-Α2');
  const core = require('../core.js');
  assert.equal(core.grade(q, ['ε','α','β','δ']).status, 'correct');
  assert.equal(core.grade(q, ['ε','α','γ','δ']).status, 'correct');
  assert.equal(core.grade(q, ['ε','α','α','δ']).status, 'wrong');
});
const programming = require('../data/courses/programming.json');
test('course banks are disjoint, every answer has provenance, and Pascal exams are absent', () => {
  const all=[...bank.questions,...programming.questions];
  assert.equal(new Set(all.map(q=>q.id)).size,352);
  assert.equal(programming.questions.length,116);
  assert.ok(programming.questions.every(q=>q.year>=2017 && q.language==='python2' && !/\bpascal\b/i.test(q.original)));
  for(const item of all) for(const ref of item.answerSources) assert.ok(fs.existsSync(path.join(root,ref.path)),item.id);
  for(const item of programming.questions) {
    assert.ok(item.sections.length); assert.ok(item.sections.every(s=>programming.sections[s]));
    if(item.type==='reading'||item.reviewOnly)continue;
    const values=item.type==='fields' ? item.fields.map(f=>f.answers[0]) : item.type==='match' ? item.items.map(i=>i.correct) : item.correct;
    assert.equal(core.grade(item,values).status,'correct',item.id);
  }
});
test('code answers preserve case, token boundaries and string contents without execution', () => {
  const code=a=>({kind:'code',answers:[a]});
  assert.ok(core.checkField(code('A[j-1]'),'A [ j - 1 ]'));
  assert.ok(core.checkField(code("['MARIA', 'NIKOS']"),'["MARIA","NIKOS"]'));
  assert.equal(core.checkField(code('N'),'n'),false);
  assert.equal(core.checkField(code('not x'),'notx'),false);
  assert.equal(core.checkField(code("''"),"' '"),false);
  assert.equal(core.checkField(code("''"),"'"),false);
  assert.equal(core.checkField(code("'A B'"),"'AB'"),false);
  assert.equal(core.checkField(code('False'),'false'),false);
  assert.ok(core.checkField({kind:'sequence',answers:['1 2 3']},'[1, 2, 3]'));
  assert.equal(core.checkField({kind:'sequence',answers:['1 2 3']},'1 3 2'),false);
  assert.ok(core.checkField({kind:'decimal',answers:['1.232']},'1,232'));
  assert.equal(core.checkField({kind:'decimal',answers:['1.232']},'1232'),false);
});
test('source collections, tags and subject filters also handle yearless authored questions', () => {
  const exam={...programming.questions[0],id:'sample:exam',collectionId:'sample-exam'};
  const custom={...exam,id:'sample:custom',sourceKind:'custom',collectionId:'teacher-1',year:null,tags:['revision']};
  const workbook={...exam,id:'sample:workbook',sourceKind:'workbook',collectionId:'book-1',year:exam.year};
  const all=[exam,custom,workbook,...bank.questions];
  assert.deepEqual(core.filterQuestions(all,{subjectId:'programming',sourceKind:'custom',tag:'revision'}).map(q=>q.id),[custom.id]);
  assert.deepEqual(core.filterQuestions(all,{subjectId:'programming',collectionId:'book-1'}).map(q=>q.id),[workbook.id]);
  assert.deepEqual(core.filterQuestions(all,{subjectId:'programming',mode:'year',year:exam.year,collectionId:'sample-exam',sourceKind:'custom'}).map(q=>q.id),[exam.id]);
});
