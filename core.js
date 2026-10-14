/* Pure quiz operations shared by the browser and the automated tests. */
(function (root) {
  'use strict';
  const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  function number(value) {
    let s = fold(value).replace(/\s*(bytes?|bits?|octets?|οκταδες)\s*$/u, '').trim();
    if (/^[+-]?\d{1,3}(?:[.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
    if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(s)) return NaN;
    return Number(s.replace(',', '.'));
  }
  function normalize(value, kind = 'text') {
    if (kind === 'decimal') {
      const s=String(value ?? '').trim().replace(',', '.');
      return /^[+-]?\d+(?:\.\d+)?$/.test(s) ? Number(s) : null;
    }
    if (kind === 'code') {
      const source = String(value ?? '').trim().replace(/[‘’ˈ]/g, "'").replace(/[“”]/g, '"').replace(/[−–‐]/g, '-');
      const tokens = source.match(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|[\p{L}_][\p{L}\p{N}_]*|\d+(?:\.\d+)?|\*\*|\/\/|==|!=|<=|>=|[^\s]/gu) || [];
      if (tokens.some(t => /^['"]/.test(t) && (t.length < 2 || t.at(-1) !== t[0]))) return null;
      return JSON.stringify(tokens.map(t => /^['"]/.test(t) ? 'string:' + t.slice(1,-1).replace(/\\(['"])/g, '$1') : t));
    }
    if (kind === 'literal') return String(value ?? '').trim().replace(/^(['"‘“])(.*)['"’”]$/s, '$2');
    if (kind === 'sequence') {
      const parts = String(value ?? '').trim().replace(/^\[/, '').replace(/\]$/, '').split(/[,;\s]+/).filter(Boolean);
      return parts.length && parts.every(x => /^[+-]?\d+(?:\.\d+)?$/.test(x)) ? parts.map(Number).join(',') : null;
    }
    let s = fold(value);
    if (kind === 'number') return number(value);
    if (kind === 'binary') {
      s = s.replace(/[.\s]/g, '');
      return /^[01]+$/.test(s) ? s : null;
    }
    if (kind === 'ip' || kind === 'mask') {
      s = s.replace(/\s/g, '');
      if (kind === 'mask' && /^\/(?:[0-9]|[12][0-9]|3[0-2])$/.test(s)) return s;
      const parts = s.split('.');
      return parts.length === 4 && parts.every(x => /^\d{1,3}$/.test(x) && +x <= 255)
        ? parts.map(Number).join('.') : null;
    }
    if (kind === 'mac') {
      s = s.replace(/[-:.\s]/g, '');
      return /^[0-9a-f]+$/.test(s) ? s : null;
    }
    if (kind === 'hex') {
      s = s.replace(/×/g, 'x');
      if (/^0x[\da-f]+$/.test(s)) return parseInt(s.slice(2), 16);
      if (/^\d+$/.test(s)) return Number(s);
      return null;
    }
    if (kind === 'set') return s.split(/[,;\s]+/).filter(Boolean).sort().join(',');
    if (kind === 'expression') return s.replace(/\s/g, '').replace(/−|–/g, '-').replace(/\*\*/g, '^');
    return s.replace(/\s+/g, ' ').replace(/[.;]$/g, '');
  }
  function expected(field, values) {
    if (field.rule === 'same') return values?.[field.other] || 'Ίδια θύρα με την αντίστοιχη πηγή του πελάτη';
    if (field.rule === 'client-port') return field.differentFrom === undefined ? 'Ακέραιος 1024–65535' : 'Διαφορετική θύρα πελάτη, 1024–65535';
    return field.answers.join(' ή ');
  }
  function checkField(field, value, values = []) {
    if (String(value ?? '').trim() === '') return false;
    if (field.rule === 'same') return Number.isInteger(number(value)) && number(value) === number(values[field.other]);
    if (field.rule === 'client-port') {
      const v = number(value);
      return Number.isInteger(v) && v >= 1024 && v <= 65535 &&
        (field.differentFrom === undefined || v !== number(values[field.differentFrom]));
    }
    const actual = normalize(value, field.kind);
    return actual !== null && !(typeof actual === 'number' && !Number.isFinite(actual)) &&
      field.answers.some(answer => actual === normalize(answer, field.kind));
  }
  function grade(question, values) {
    let items;
    if (question.type === 'boolean' || question.type === 'choice') {
      items = [{ ok: values === question.correct, expected: question.correct }];
    } else if (question.type === 'fields') {
      items = question.fields.map((f, i) => ({ ok: checkField(f, values[i], values), expected: expected(f, values) }));
    } else if (question.type === 'match') {
      items = question.items.map((item, i) => ({ ok: (item.accepted || [item.correct]).includes(values[i]),
        expected: (item.accepted || [item.correct]).map(id => id + ' · ' + question.options.find(o => o.id === id).label).join(' ή ') }));
    } else if (question.type === 'order') {
      items = question.correct.map((id, i) => ({ ok: values[i] === id, expected: id }));
    } else return { status: 'studied', items: [], correctCount: 0, total: 0 };
    const correctCount = items.filter(i => i.ok).length;
    return { status: question.reviewOnly ? 'studied' : correctCount === items.length ? 'correct' : 'wrong',
      items, correctCount, total: items.length };
  }
  function filterQuestions(questions, filters, mistakes = new Set()) {
    return questions.filter(q => {
      if (filters.subjectId && q.subjectId !== filters.subjectId) return false;
      if (filters.mode === 'year') return q.sourceKind === 'exam' && q.year === Number(filters.year) && (!filters.collectionId || q.collectionId === filters.collectionId);
      if (filters.sourceKind && q.sourceKind !== filters.sourceKind) return false;
      if (filters.collectionId && q.collectionId !== filters.collectionId) return false;
      if (filters.tag && !(q.tags || []).includes(filters.tag)) return false;
      if (filters.mode === 'mistakes' && !mistakes.has(q.id)) return false;
      if (filters.year && filters.year !== 'all' && q.year !== Number(filters.year)) return false;
      if (filters.syllabus && !q.inSyllabus) return false;
      if (filters.chapters?.length && !q.chapters.some(c => filters.chapters.includes(String(c)))) return false;
      if (filters.sections?.length && !q.sections.some(s => filters.sections.includes(s))) return false;
      if (filters.types?.length && !filters.types.includes(q.type)) return false;
      return true;
    });
  }
  function shuffle(items, rng = Math.random) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  }
  function summary(session, responses) {
    const counts = { correct: 0, wrong: 0, studied: 0, unanswered: 0, total: session.length };
    session.forEach(q => { const status = responses[q.id]?.result?.status; counts[status || 'unanswered']++; });
    counts.graded = counts.correct + counts.wrong;
    counts.percent = counts.graded ? Math.round(100 * counts.correct / counts.graded) : null;
    return counts;
  }
  const api = { normalize, number, checkField, expected, grade, filterQuestions, shuffle, summary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QuizCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
