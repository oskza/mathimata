(() => {
  'use strict';
  const catalog = window.QUIZ_CATALOG, core = window.QuizCore;
  let data, course, loadToken = 0, requestedCourseId = null;
  const loadingScripts = new Map();
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const typeLabels = { boolean: 'Σωστό / Λάθος', choice: 'Πολλαπλής επιλογής', match: 'Αντιστοίχιση', fields: 'Συμπλήρωση', order: 'Σειρά ενεργειών', reading: 'Ανάπτυξη' };
  const mistakesByCourse = new Map();
  let mistakes = new Set();
  let session = [], position = 0, responses = {}, mode = 'practice', sessionMode = 'practice', candidates = [], currentView = 'setup';
  let selectedChapters = new Set(), selectedSections = new Set(), selectedTypes = new Set();
  const sectionCompare = (a, b) => a.localeCompare(b, undefined, { numeric: true });
  let allSections = [];
  const bookLinks = q => q.bookRefs.map(ref => `<a class="book-link" href="${escape(course.book)}#page=${ref.pdfPage || ref.page + 1}" target="_blank" rel="noopener" title="${escape(ref.title)}">§${escape(ref.section)} · σελ. ${ref.page} ↗</a>`).join('');
  const currentQuestion = () => session[position];
  const response = q => responses[q.id] || (responses[q.id] = { values: q.type === 'boolean' || q.type === 'choice' ? null : [], result: null, revealed: false });
  function setView(view) {
    currentView = view;
    ['setup', 'quiz', 'results'].forEach(name => $(name + '-view').hidden = name !== view);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function getFilters() {
    return { subjectId: course.id, sourceKind: 'exam', collectionId: mode === 'year' ? $('exam-filter').value : '', mode, year: $('year-filter').value, syllabus: $('syllabus-filter').checked,
      chapters: [...selectedChapters], sections: [...selectedSections], types: [...selectedTypes] };
  }
  function renderParagraphs() {
    const search = core.normalize($('paragraph-search').value);
    const sections = allSections.filter(s => (!selectedChapters.size || selectedChapters.has(s.split('.')[0])) &&
      core.normalize(s + ' ' + data.sections[s][0]).includes(search));
    $('paragraph-filters').innerHTML = sections.length ? sections.map(s => `<label class="paragraph-choice"><input type="checkbox" value="${escape(s)}" ${selectedSections.has(s) ? 'checked' : ''}><span><b>${s.includes('legacy') ? 'Παλαιότερη ύλη · κεφ. ' + s.split('.')[0] : escape(s)}</b> — ${escape(data.sections[s][0])}</span></label>`).join('') : '<p class="helper">Δεν βρέθηκαν παράγραφοι.</p>';
    $('paragraph-count').textContent = selectedSections.size ? `${selectedSections.size} επιλεγμένες` : 'Όλες';
  }
  function renderFilters() {
    $('chapter-filters').innerHTML = Object.entries(data.chapters).map(([id, label]) => `<label class="chapter-choice"><input type="checkbox" value="${id}" ${selectedChapters.has(id) ? 'checked' : ''}><span><b>${id}.</b> ${escape(label)}</span></label>`).join('');
    $('type-filters').innerHTML = Object.entries(typeLabels).map(([id, label]) => `<label class="type-choice"><input type="checkbox" value="${id}" ${selectedTypes.has(id) ? 'checked' : ''}><span>${label}</span></label>`).join('');
    renderParagraphs(); updateSelection();
  }
  function updateSelection() {
    if (!data || !course) return;
    candidates = core.filterQuestions(data.questions, getFilters(), mistakes);
    const isYear = mode === 'year';
    $('topic-filters').disabled = isYear;
    $('topic-filters').hidden = isYear;
    $('practice-options').hidden = isYear;
    $('year-note').hidden = !isYear;
    $('exam-picker').hidden = !isYear;
    $('mistake-count').textContent = mistakes.size;
    $('available-count').textContent = candidates.length;
    const count = isYear || $('question-count').value === 'all' ? candidates.length : Math.min(Number($('question-count').value), candidates.length);
    $('session-size').textContent = `${count} στο επόμενο σετ`;
    $('start-button').disabled = !count;
    $('start-button').innerHTML = (isYear ? 'Ξεκίνα τα θέματα του ' + $('year-filter').value : mode === 'mistakes' ? 'Δούλεψε ξανά τα λάθη σου' : 'Ξεκίνα την εξάσκηση') + ' <span aria-hidden="true">→</span>';
    $('selection-description').textContent = isYear ? 'Ολόκληρη η εξέταση, με τα κοινά δεδομένα κάθε άσκησης.' : mode === 'mistakes' ? 'Μια δεύτερη προσπάθεια στις ερωτήσεις που σε δυσκόλεψαν.' : 'Αυθεντικά θέματα που ταιριάζουν στη δική σου επιλογή ύλης.';
    $('empty-state').hidden = !!count;
    $('empty-state').textContent = mode === 'mistakes' && !mistakes.size ? 'Δεν έχεις καταγεγραμμένα λάθη σε αυτή την επίσκεψη. Ξεκίνα ένα σετ ελεύθερης εξάσκησης.' : 'Δεν υπάρχουν ερωτήσεις με αυτόν τον συνδυασμό. Άλλαξε ή επανάφερε τα φίλτρα.';
    $('type-breakdown').innerHTML = Object.entries(typeLabels).map(([type, label]) => {
      const n = candidates.filter(q => q.type === type).length;
      return n ? `<span>${label} <b>${n}</b></span>` : '';
    }).join('') || '<p class="muted text-sm">Καμία διαθέσιμη ερώτηση.</p>';
  }
  function start(questions) {
    if (!data || !course || course.id !== $('course-filter').value) { syncCourseSelection(); return; }
    let pool = questions || candidates;
    if (!pool.length) return;
    sessionMode = questions ? 'mistakes' : mode;
    pool = pool.slice().sort((a, b) => sessionMode === 'year' ? a.order - b.order : b.year - a.year || a.order - b.order);
    if (sessionMode !== 'year' && $('shuffle-filter').checked) pool = core.shuffle(pool);
    const limit = questions || sessionMode === 'year' || $('question-count').value === 'all' ? pool.length : Number($('question-count').value);
    session = pool.slice(0, limit); position = 0; responses = {};
    $('session-label').textContent = course.title + ' · ' + (sessionMode === 'year' ? `Θέματα ${session[0].year}` : sessionMode === 'mistakes' ? 'Επανάληψη λαθών' : 'Προσωπικό σετ εξάσκησης');
    setView('quiz'); renderQuestion();
  }
  function readValues() {
    const q = currentQuestion(); if (!q) return; const r = response(q);
    if (['fields', 'match', 'order'].includes(q.type)) r.values = [...$('answer-inputs').querySelectorAll('[data-answer]')].map(el => el.value);
    return r.values;
  }
  function answerControls(q, r) {
    const disabled = r.result ? 'disabled' : '';
    if (q.type === 'boolean' || q.type === 'choice') {
      const options = q.type === 'boolean' ? [{ id: true, label: 'Σωστό' }, { id: false, label: 'Λάθος' }] : q.options;
      return `<div class="answer-options ${q.type === 'boolean' ? 'boolean' : ''}">${options.map(o => {
        const selected = r.values === o.id;
        const state = r.result && !q.reviewOnly ? o.id === q.correct ? ' is-correct' : selected ? ' is-wrong' : '' : '';
        return `<button type="button" class="answer-option${selected ? ' selected' : ''}${state}" data-choice="${escape(o.id)}" aria-pressed="${selected}" ${disabled}><span class="option-letter">${q.type === 'boolean' ? o.id ? 'Σ' : 'Λ' : escape(o.id)}</span><span>${escape(o.label)}</span>${state ? `<span class="ml-auto" aria-hidden="true">${o.id === q.correct ? '✓' : '×'}</span>` : ''}</button>`;
      }).join('')}</div>`;
    }
    if (q.type === 'reading') return '';
    if (q.type === 'fields') return `<div class="answer-fields">${q.fields.map((field, i) => `<label class="answer-field" for="answer-${i}"><span>${escape(field.label)}</span><input id="answer-${i}" class="text-input" data-answer="${i}" type="text" ${['number', 'hex'].includes(field.kind) ? 'inputmode="text"' : ''} value="${escape(r.values[i] || '')}" autocomplete="off" spellcheck="false" ${disabled}>${field.kind === 'mask' ? '<small>Δεκαδική μορφή ή /πρόθεμα</small>' : field.kind === 'binary' ? '<small>Δυαδικά ψηφία, με ή χωρίς τελείες</small>' : ''}<span id="field-result-${i}" class="field-result"></span></label>`).join('')}</div>`;
    const order = q.type === 'order';
    const items = order ? q.correct.map((id, i) => ({ id: i, label: `${i + 1}ο βήμα` })) : q.items;
    const options = order ? q.items : q.options;
    const reference = `<div class="matching-reference" aria-label="${order ? 'Ενέργειες' : 'Στήλη Β'}">${options.map(o => `<div><b>${escape(o.id)}.</b><span>${escape(o.label)}</span></div>`).join('')}</div>`;
    return reference + `<div class="match-inputs">${items.map((item, i) => `<label class="answer-field" for="answer-${i}"><span>${order ? '' : escape(item.id) + '. '}${escape(item.label)}</span><select id="answer-${i}" data-answer="${i}" class="select-input" ${disabled}><option value="">Επιλογή</option>${options.map(o => `<option value="${escape(o.id)}" ${r.values[i] === o.id ? 'selected' : ''}>${escape(o.id)}</option>`).join('')}</select><span id="field-result-${i}" class="field-result"></span></label>`).join('')}</div>`;
  }
  // Only known block types become markup; all question content remains escaped text.
  function renderBlocks(blocks) {
    return blocks.map(block => {
      if (block.type === 'list') return `<ol class="prompt-list" role="list">${block.items.map(item => `<li><span class="prompt-marker">${escape(item.label)}</span><div>${renderBlocks(item.blocks)}</div></li>`).join('')}</ol>`;
      if (block.type === 'table') return `<div class="prompt-table-scroll" tabindex="0" role="region" aria-label="Πίνακας εκφώνησης"><table><thead><tr>${block.headers.map(cell => `<th scope="col">${escape(cell)}</th>`).join('')}</tr></thead><tbody>${block.rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      if (block.type === 'code') return `<pre><code>${escape(block.text)}</code></pre>`;
      if (block.type === 'pre') return `<pre class="prompt-layout">${escape(block.text)}</pre>`;
      return `<p${block.type === 'note' ? ' class="prompt-note"' : ''}>${escape(block.text)}</p>`;
    }).join('');
  }
  function renderQuestion(focus = true) {
    const q = currentQuestion(), r = response(q);
    $('question-meta').innerHTML = `<span class="pill">${escape(catalog.sourceKinds[q.sourceKind])} ${q.year || ''}</span><span class="pill">${typeLabels[q.type]}</span>${q.inSyllabus ? '<span class="pill">Εντός ύλης</span>' : '<span class="pill">Εκτός / μικτή ύλη</span>'}${q.reviewOnly ? '<span class="pill">Χωρίς βαθμολογία</span>' : ''}`;
    $('question-title').textContent = `${q.sourceKind === 'exam' ? 'Θέμα' : 'Άσκηση'} ${q.key}`;
    $('question-sections').textContent = q.sections.map(s => s.includes('legacy') ? data.sections[s][0] : `§${s} · ${data.sections[s][0]}`).join(' / ');
    $('question-prompt').innerHTML = q.promptBlocks ? renderBlocks(q.promptBlocks) : q.preserveLayout ? `<pre>${escape(q.original)}</pre>` : `<p>${escape(q.prompt)}</p>`;
    $('question-note').hidden = !q.note && !q.reviewOnly;
    $('question-note').textContent = q.note || (q.reviewOnly ? 'Η παλαιότερη διατύπωση έχει ασάφεια. Δοκίμασε την απάντησή σου και δες την εξήγηση, χωρίς βαθμολόγηση.' : '');
    $('question-figure').innerHTML = q.showFigure ? `<details open class="source-details"><summary>Σχήμα της εκφώνησης</summary>${q.images.map((src, i) => `<a href="${src}" target="_blank" rel="noopener" aria-label="Μεγέθυνση σχήματος σε νέα καρτέλα"><img class="question-source-image" src="${src}" alt="Πρωτότυπη σελίδα ${q.pages[i]} του ${q.year}, με το σχήμα της άσκησης" loading="lazy"></a>`).join('')}</details>` : '';
    $('answer-inputs').innerHTML = answerControls(q, r);
    $('answer-error').textContent = '';
    $('answer-form').hidden = q.type === 'reading';
    $('check-button').hidden = ['boolean', 'choice', 'reading'].includes(q.type) || !!r.result;
    $('check-button').textContent = q.reviewOnly ? 'Δες την ενδεικτική λύση' : 'Έλεγχος απάντησης';
    $('reveal-button').hidden = !!r.result;
    $('reveal-button').textContent = q.type === 'reading' ? 'Εμφάνιση ενδεικτικής απάντησης' : 'Αποκάλυψη λύσης χωρίς βαθμολογία';
    $('question-sources').innerHTML = `<div class="source-links">${(q.pages || []).map(p => `<a class="book-link" href="${escape(q.source)}#page=${p}" target="_blank" rel="noopener">Πρωτότυπο PDF · σελ. ${p} ↗</a>`).join('')}${bookLinks(q)}${answerLinks(q)}</div>`;
    renderFeedback(q, r); renderSession();
    $('previous-button').disabled = position === 0;
    $('next-button').textContent = position === session.length - 1 ? 'Αποτελέσματα →' : 'Επόμενη →';
    if (focus) { $('question-card').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
  }
  function renderFeedback(q, r) {
    const el = $('feedback'); el.hidden = !r.result;
    if (!r.result) { el.innerHTML = ''; return; }
    const status = r.result.status;
    el.className = 'feedback ' + status;
    const heading = status === 'correct' ? '✓ Σωστή απάντηση!' : status === 'wrong' ? 'Μια ευκαιρία για επανάληψη' : q.answerStatus === 'partial' ? 'Σχετική θεωρία · μερική τεκμηρίωση' : 'Ενδεικτική απάντηση';
    const count = status !== 'studied' && r.result.total > 1 ? `<p class="text-sm mb-3">${r.result.correctCount} από ${r.result.total} πεδία σωστά.</p>` : '';
    const correctChoice = (q.type === 'choice' || q.type === 'boolean') && !q.reviewOnly ? `<p class="text-sm mb-3"><b>Σωστό:</b> ${q.type === 'boolean' ? q.correct ? 'Σωστό' : 'Λάθος' : escape(q.correct + ' · ' + q.options.find(o => o.id === q.correct).label)}</p>` : '';
    el.innerHTML = `<h2>${heading}</h2>${count}${correctChoice}<div class="explanation${q.solutionLayout ? ' code-solution' : ''}">${escape(q.explanation)}</div>${q.supplement ? `<details class="source-details"><summary>Συμπληρωματική εξήγηση από το βιβλίο</summary><div class="explanation">${escape(q.supplement)}</div></details>` : ''}<div class="book-links">${answerLinks(q)}${bookLinks(q)}</div>${q.type === 'reading' || status === 'studied' ? '<p class="helper">Δεν συμμετέχει στη βαθμολογία του σετ.</p>' : ''}`;
    const items = q.type === 'fields' ? q.fields.map((f, i) => ({ expected: core.expected(f, r.values), ok: r.result.items[i]?.ok })) : q.type === 'match' ? q.items.map((o, i) => ({ expected: (o.accepted || [o.correct]).map(id => id + ' · ' + q.options.find(x => x.id === id).label).join(' ή '), ok: r.result.items[i]?.ok })) : q.type === 'order' ? q.correct.map((id, i) => ({ expected: id, ok: r.result.items[i]?.ok })) : [];
    items.forEach((item, i) => {
      const target = $('field-result-' + i), input = $('answer-' + i);
      if (!target) return;
      target.textContent = status === 'studied' ? `Ενδεικτικά: ${item.expected}` : item.ok ? '✓ Σωστό' : `Σωστό: ${item.expected}`;
      if (status !== 'studied') { target.classList.toggle('wrong', !item.ok); input.classList.add(item.ok ? 'is-correct' : 'is-wrong'); }
    });
  }
  function renderSession() {
    const stats = core.summary(session, responses);
    $('question-position').textContent = `Ερώτηση ${position + 1} από ${session.length}`;
    const completed = session.length - stats.unanswered;
    $('progress-percent').textContent = `${completed} ολοκληρωμένες`;
    $('progress-fill').style.width = `${100 * completed / session.length}%`;
    $('live-stats').innerHTML = `<div class="live-stat"><span>Σωστές</span><b>${stats.correct}</b></div><div class="live-stat"><span>Για επανάληψη</span><b>${stats.wrong}</b></div><div class="live-stat"><span>Μελετήθηκαν</span><b>${stats.studied}</b></div><div class="live-stat"><span>Αναπάντητες</span><b>${stats.unanswered}</b></div>`;
    $('question-navigation').innerHTML = session.map((q, i) => `<button class="${i === position ? 'active ' : ''}${responses[q.id]?.result?.status || ''}" data-position="${i}" aria-label="Ερώτηση ${i + 1}: ${q.year}, θέμα ${escape(q.key)}" ${i === position ? 'aria-current="step"' : ''}>${i + 1}</button>`).join('');
  }
  function submitAnswer() {
    const q = currentQuestion(), r = response(q);
    if (r.result) return;
    readValues();
    if (Array.isArray(r.values) && (!r.values.length || r.values.some(value => !String(value).trim()))) {
      $('answer-error').textContent = 'Συμπλήρωσε όλα τα πεδία για έλεγχο. Μπορείς επίσης να προχωρήσεις χωρίς απάντηση.';
      const blank = [...$('answer-inputs').querySelectorAll('[data-answer]')].find(el => !el.value.trim());
      blank?.focus(); return;
    }
    r.result = core.grade(q, r.values);
    if (r.result.status === 'wrong') mistakes.add(q.id);
    if (r.result.status === 'correct') mistakes.delete(q.id);
    renderQuestion(false);
    $('feedback').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function reveal() {
    const q = currentQuestion(), r = response(q);
    if (r.result) return;
    readValues(); r.revealed = true; r.result = { status: 'studied', items: [], total: 0, correctCount: 0 };
    renderQuestion(false); $('feedback').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function move(index) {
    readValues();
    // Open questions can be skipped freely; only revealing a solution counts as studied.
    if (index >= session.length) return finish();
    position = Math.max(0, index); renderQuestion();
  }
  function finish() {
    readValues(); const stats = core.summary(session, responses);
    const wrong = session.filter(q => responses[q.id]?.result?.status === 'wrong');
    const unanswered = session.filter(q => !responses[q.id]?.result);
    $('results-view').innerHTML = `<div class="panel results-card"><p class="eyebrow">ΚΑΘΕ ΠΡΟΣΠΑΘΕΙΑ ΜΕΤΡΑΕΙ</p><h1>Ένα βήμα πιο κοντά.</h1><p class="muted">${stats.graded ? `Σωστές ${stats.correct} από ${stats.graded} βαθμολογημένες ερωτήσεις (${stats.percent}%).` : 'Δεν έχεις βαθμολογημένες απαντήσεις σε αυτό το σετ.'}</p><div class="results-metrics">${[['correct', 'Σωστές'], ['wrong', 'Για επανάληψη'], ['studied', 'Μελετήθηκαν'], ['unanswered', 'Αναπάντητες']].map(([key, label]) => `<div class="result-metric"><strong>${stats[key]}</strong><span>${label}</span></div>`).join('')}</div><p class="helper">Κάθε ερώτηση μετρά μία φορά. Στα σύνθετα θέματα απαιτούνται όλα τα ελεγχόμενα πεδία σωστά. Η ανάπτυξη και οι αποκαλύψεις λύσεων δεν βαθμολογούνται· δεν πρόκειται για βαθμό Πανελλαδικών.</p><div class="flex flex-wrap gap-3 mt-6">${wrong.length ? `<button id="retry-wrong" class="button-primary">Επανάληψη ${wrong.length} λαθών ↻</button>` : ''}${unanswered.length ? '<button id="continue-session" class="button-secondary">Συνέχισε τις αναπάντητες</button>' : ''}<button id="new-session" class="button-secondary">Νέο σετ →</button></div><div class="divider"></div><h2 class="section-title">Η διαδρομή σου</h2><div class="result-list">${session.map((q, i) => { const status = responses[q.id]?.result?.status; return `<button class="result-item" data-result-position="${i}"><span><b>${q.year || 'Άσκηση'} · ${escape(q.key)}</b><br><small>${typeLabels[q.type]}</small></span><span>${({ correct: '✓ Σωστή', wrong: '↻ Για επανάληψη', studied: 'Μελετήθηκε' })[status] || 'Αναπάντητη'}</span></button>`; }).join('')}</div></div>`;
    setView('results'); $('results-view').focus({ preventScroll: true });
    $('retry-wrong')?.addEventListener('click', () => start(wrong));
    $('continue-session')?.addEventListener('click', () => { position = session.indexOf(unanswered[0]); setView('quiz'); renderQuestion(); });
    $('new-session').addEventListener('click', showSetup);
  }
  function showSetup() { if (currentView === 'quiz') readValues(); updateSelection(); setView('setup'); }
  function resetFilters() {
    selectedChapters.clear(); selectedSections.clear(); selectedTypes.clear(); mode = 'practice';
    document.querySelector('[name="mode"][value="practice"]').checked = true;
    $('year-filter').value = 'all'; $('syllabus-filter').checked = false; $('question-count').value = '20';
    $('shuffle-filter').checked = true; $('paragraph-search').value = ''; renderExams(); renderFilters();
  }
  function toggle(set, value, checked) { checked ? set.add(value) : set.delete(value); }
  const answerLinks = q => (q.answerSources || []).map(ref => ref.path ? `<a class="book-link" href="${escape(ref.path)}#page=${ref.pages?.[0] || 1}" target="_blank" rel="noopener" title="${escape(ref.label)}">Πηγή απάντησης · ${escape(ref.label)} ↗</a>` : `<span class="helper">Απάντηση: ${escape(ref.author)}</span>`).join('');
  function renderExams() {
    const year = $('year-filter').value;
    $('exam-filter').innerHTML = Object.entries(data.collections).filter(([,c]) => c.kind === 'exam' && String(c.year) === year).map(([id,c]) => `<option value="${escape(id)}">${escape(c.title)}</option>`).join('');
  }
  function loadScript(src) {
    if (!loadingScripts.has(src)) {
      const pending = new Promise((resolve,reject) => {
        const script=document.createElement('script'); script.src=src;
        script.onload=resolve;
        script.onerror=()=>{script.remove();reject(new Error('Δεν φορτώθηκαν οι ερωτήσεις. Έλεγξε ότι διατηρήθηκαν όλοι οι φάκελοι της εφαρμογής.'));};
        document.head.append(script);
      }).catch(error => { loadingScripts.delete(src); throw error; });
      loadingScripts.set(src,pending);
    }
    return loadingScripts.get(src);
  }
  function clearCourseView() {
    data=null; course=null; candidates=[]; session=[]; responses={}; position=0; allSections=[];
    selectedChapters.clear(); selectedSections.clear(); selectedTypes.clear();
    setView('setup');
    for (const id of ['chapter-filters','paragraph-filters','type-filters','type-breakdown','year-filter','exam-filter','course-sources','question-sources','answer-inputs','feedback','results-view']) $(id).replaceChildren();
    for (const id of ['total-bank','total-years','total-chapters','available-count']) $(id).textContent='—';
    $('session-size').textContent=''; $('year-range').textContent=''; $('mistake-count').textContent='0';
    $('paragraph-count').textContent='Όλες'; $('selection-description').textContent='Φόρτωση του επιλεγμένου μαθήματος…';
    $('empty-state').hidden=true; $('course-book').hidden=true; $('start-button').disabled=true;
    document.querySelector('.filter-panel').inert=true;
  }
  function syncCourseSelection() {
    const id=$('course-filter').value;
    if (id && id!==course?.id && id!==requestedCourseId) selectCourse(id);
  }
  async function selectCourse(id) {
    const token=++loadToken; requestedCourseId=id; clearCourseView(); $('course-retry').hidden=true;
    $('course-status').textContent='Φόρτωση ερωτήσεων…'; $('topic-filters').disabled=true;
    try {
      const selected=catalog.courses.find(c=>c.id===id);
      if (!selected) throw new Error('Το επιλεγμένο μάθημα δεν είναι διαθέσιμο.');
      if (!window.QUIZ_BANKS?.[id]) await loadScript(selected.script);
      if (token!==loadToken) return;
      // Browser form restoration can change a select without firing change.
      if ($('course-filter').value!==id) { requestedCourseId=null; syncCourseSelection(); return; }
      const bank=window.QUIZ_BANKS?.[id];
      if (!bank || bank.subjectId!==id || bank.questions.some(q=>q.subjectId!==id)) {
        loadingScripts.delete(selected.script); delete window.QUIZ_BANKS?.[id];
        throw new Error('Τα δεδομένα δεν αντιστοιχούν στο επιλεγμένο μάθημα. Δοκίμασε ξανά τη φόρτωση.');
      }
      course=selected;
      // Keep the extensible bank schema; this release presents national exams only.
      data={...bank, questions:bank.questions.filter(q=>q.sourceKind==='exam')};
      requestedCourseId=null;
      mistakes=mistakesByCourse.get(id) || new Set(); mistakesByCourse.set(id,mistakes);
      session=[];responses={};position=0;setView('setup');
      allSections=[...new Set(data.questions.flatMap(q=>q.sections))].sort(sectionCompare);
      const years=[...new Set(data.questions.filter(q=>q.sourceKind==='exam').map(q=>q.year))].sort((a,b)=>b-a);
      $('total-bank').textContent=data.questions.length; $('total-years').textContent=years.length; $('total-chapters').textContent=Object.keys(data.chapters).length;
      $('year-range').textContent=years.length ? `${Math.min(...years)} — ${Math.max(...years)}` : 'Δεν υπάρχουν θέματα Πανελλαδικών';
      $('year-filter').innerHTML='<option value="all">Όλα τα έτη</option>'+years.map(y=>`<option value="${y}">${y}</option>`).join('');
      document.querySelector('[name="mode"][value="year"]').disabled=!years.length;
      $('course-book').href=course.book; $('course-book').hidden=!course.book;
      $('course-sources').innerHTML=`<p><b>${escape(course.title)}</b> · ${escape(course.grade)} · ${escape(course.specialtyLabel)}</p><p>${escape(data.sourceNote)}</p><p><a href="${escape(course.syllabusSource)}" target="_blank" rel="noopener">Αρχείο εξεταστέας ύλης ↗</a> · <a href="${escape(course.book)}" target="_blank" rel="noopener">Βιβλίο μαθήματος ↗</a></p><p>Οι παραπομπές σε λύσεις εμφανίζονται σε κάθε ερώτηση. Οι παλιότερες παραπομπές σε βιβλία μπορεί να αφορούν διαφορετική έκδοση.</p>`;
      $('course-status').textContent=course.grade+' · '+data.questions.length+' ερωτήσεις';
      document.title=course.title+' / εξάσκηση'; resetFilters(); document.querySelector('.filter-panel').inert=false;
    } catch (error) { if(token===loadToken) { requestedCourseId=null; clearCourseView(); $('course-status').textContent=error.message; $('selection-description').textContent='Δεν είναι διαθέσιμα τα θέματα του επιλεγμένου μαθήματος.'; $('course-retry').hidden=false; } }
  }
  function renderCourses() {
    const previous=$('course-filter').value || course?.id;
    const specialty=$('specialty-filter').value;
    const courses=catalog.courses.filter(c=>!specialty || c.specialtyIds.includes(specialty));
    $('course-filter').innerHTML=courses.map(c=>`<option value="${escape(c.id)}">${escape(c.title)}</option>`).join('');
    if(courses.length) { $('course-filter').value=courses.some(c=>c.id===previous) ? previous : courses[0].id; syncCourseSelection(); }
  }
  const specialties=new Map(Object.entries(catalog.specialties));
  $('specialty-filter').innerHTML='<option value="">Όλοι οι τομείς</option>'+[...specialties].map(([id,label])=>`<option value="${escape(id)}">${escape(label)}</option>`).join('');
  $('specialty-filter').addEventListener('change',renderCourses);
  $('course-filter').addEventListener('input',syncCourseSelection);
  $('course-filter').addEventListener('change',syncCourseSelection);
  window.addEventListener('pageshow',syncCourseSelection);
  $('course-retry').addEventListener('click',()=>selectCourse($('course-filter').value));
  $('exam-filter').addEventListener('change',updateSelection);
  document.querySelectorAll('[name="mode"]').forEach(input => input.addEventListener('change', event => {
    mode = event.target.value;
    const all = $('year-filter').querySelector('[value="all"]'); all.disabled = mode === 'year';
    if (mode === 'year' && $('year-filter').value === 'all') $('year-filter').value = [...$('year-filter').options].find(o=>o.value!=='all')?.value || 'all';
    renderExams();
    updateSelection();
  }));
  $('chapter-filters').addEventListener('change', event => { toggle(selectedChapters, event.target.value, event.target.checked); selectedSections = new Set([...selectedSections].filter(s => !selectedChapters.size || selectedChapters.has(s.split('.')[0]))); renderParagraphs(); updateSelection(); });
  $('paragraph-filters').addEventListener('change', event => { toggle(selectedSections, event.target.value, event.target.checked); $('paragraph-count').textContent = selectedSections.size ? `${selectedSections.size} επιλεγμένες` : 'Όλες'; updateSelection(); });
  $('type-filters').addEventListener('change', event => { toggle(selectedTypes, event.target.value, event.target.checked); updateSelection(); });
  $('paragraph-search').addEventListener('input', renderParagraphs);
  $('year-filter').addEventListener('change',()=>{renderExams();updateSelection();});
  ['syllabus-filter', 'question-count', 'shuffle-filter'].forEach(id => $(id).addEventListener('change', updateSelection));
  $('clear-chapters').addEventListener('click', () => { selectedChapters.clear(); renderFilters(); });
  $('clear-paragraphs').addEventListener('click', () => { selectedSections.clear(); renderParagraphs(); updateSelection(); });
  $('reset-filters').addEventListener('click', () => { $('year-filter').querySelector('[value="all"]').disabled = false; resetFilters(); });
  $('start-button').addEventListener('click', () => start());
  $('back-to-setup').addEventListener('click', showSetup); $('home-button').addEventListener('click', showSetup);
  $('answer-form').addEventListener('submit', event => { event.preventDefault(); submitAnswer(); });
  $('answer-inputs').addEventListener('input', readValues);
  $('answer-inputs').addEventListener('change', readValues);
  $('answer-inputs').addEventListener('click', event => { const button = event.target.closest('[data-choice]'); if (!button || button.disabled) return; const q = currentQuestion(); response(q).values = q.type === 'boolean' ? button.dataset.choice === 'true' : button.dataset.choice; submitAnswer(); });
  $('reveal-button').addEventListener('click', reveal);
  $('previous-button').addEventListener('click', () => move(position - 1)); $('next-button').addEventListener('click', () => move(position + 1)); $('finish-button').addEventListener('click', finish);
  $('question-navigation').addEventListener('click', event => { const button = event.target.closest('[data-position]'); if (button) move(Number(button.dataset.position)); });
  $('results-view').addEventListener('click', event => { const button = event.target.closest('[data-result-position]'); if (button) { position = Number(button.dataset.resultPosition); setView('quiz'); renderQuestion(); } });
  $('about-button').addEventListener('click', () => $('about-dialog').showModal()); $('close-about').addEventListener('click', () => $('about-dialog').close());
  $('about-dialog').addEventListener('click', event => { if (event.target === $('about-dialog')) { const r = $('about-dialog').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('about-dialog').close(); } });
  renderCourses();
})();
