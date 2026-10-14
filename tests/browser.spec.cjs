const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const bank = require('../data/courses/networks.json');
const root = path.resolve(__dirname, '..');
const file = pathToFileURL(path.join(root, 'index.html')).href;
async function beginYear(page, year) {
  await page.locator('#home-button').click();
  await page.locator('[name="mode"][value="year"]').check();
  await page.locator('#year-filter').selectOption(String(year));
  await page.locator('#start-button').click();
}
async function jump(page, year, key) {
  const yearQuestions = bank.questions.filter(q => q.year === year).sort((a,b) => a.order-b.order);
  await page.locator(`[data-position="${yearQuestions.findIndex(q => q.key === key)}"]`).click();
}
test('file:// works offline, all local assets load, desktop and mobile fit', async ({ page, context }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const remote = []; page.on('request', r => { if (/^https?:/.test(r.url())) remote.push(r.url()); });
  await context.setOffline(true); await page.goto(file);
  await expect(page.locator('#available-count')).toHaveText('236');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.screenshot({ path: path.join(root, 'tests/desktop-preview.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(root, 'tests/mobile-preview.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await beginYear(page, 2018); await jump(page, 2018, 'Α2');
  const figure = page.locator('#question-figure img').first();
  await expect(figure).toBeVisible();
  expect(await figure.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]); expect(remote).toEqual([]);
});
test('chapter / paragraph / type / syllabus filters and empty state', async ({ page }) => {
  await page.goto(file);
  await page.locator('#chapter-filters input[value="3"]').check();
  await page.locator('.paragraph-picker summary').click();
  await page.locator('#paragraph-search').fill('3.2');
  await page.locator('#paragraph-filters input[value="3.2"]').check();
  await page.locator('#type-filters input[value="fields"]').check();
  await page.locator('#year-filter').selectOption('2026');
  await page.locator('#syllabus-filter').check();
  await expect(page.locator('#available-count')).toHaveText('1');
  await page.locator('#start-button').click();
  await expect(page.locator('#question-title')).toHaveText('Θέμα Δ');
  await page.locator('#back-to-setup').click();
  await page.locator('#reset-filters').click();
  await page.locator('#chapter-filters input[value="8"]').check();
  await page.locator('#syllabus-filter').check();
  await expect(page.locator('#start-button')).toBeDisabled();
  await expect(page.locator('#empty-state')).toBeVisible();
});
test('immediate correction, lock, retained state, mistakes and retry', async ({ page }) => {
  await page.goto(file); await beginYear(page, 2026);
  await expect(page.locator('#question-title')).toHaveText('Θέμα Α1.α');
  await page.locator('[data-choice="false"]').click();
  await expect(page.locator('#feedback')).toHaveClass(/wrong/);
  await expect(page.locator('[data-choice="true"]')).toBeDisabled();
  await page.locator('#next-button').click(); await page.locator('#previous-button').click();
  await expect(page.locator('#feedback')).toHaveClass(/wrong/);
  await page.locator('#finish-button').click();
  await expect(page.locator('#retry-wrong')).toHaveText(/1 λαθών/);
  await page.locator('#retry-wrong').click();
  await expect(page.locator('#question-position')).toHaveText('Ερώτηση 1 από 1');
  await page.locator('[data-choice="true"]').click();
  await expect(page.locator('#feedback')).toHaveClass(/correct/);
  await page.locator('#back-to-setup').click();
  await expect(page.locator('#mistake-count')).toHaveText('0');
});
test('reading never requires input, can skip or reveal without affecting score', async ({ page }) => {
  await page.goto(file); await beginYear(page, 2026); await jump(page, 2026, 'Β2');
  await expect(page.locator('#answer-form')).toBeHidden();
  await page.locator('#next-button').click();
  await expect(page.locator('#question-title')).toHaveText('Θέμα Β3');
  await page.locator('#reveal-button').click();
  await expect(page.locator('#feedback')).toContainText('ταχυδρομείο');
  await page.locator('#finish-button').click();
  await expect(page.locator('#results-view')).toContainText('Δεν έχεις βαθμολογημένες απαντήσεις');
});
test('matching correction and no invented distractors', async ({ page }) => {
  await page.goto(file); await beginYear(page, 2026); await jump(page, 2026, 'Α2');
  const question = bank.questions.find(q => q.legacyId === '2026-Α2');
  for (let i=0;i<question.items.length;i++) await page.locator(`#answer-${i}`).selectOption(question.items[i].correct);
  await page.locator('#check-button').click();
  await expect(page.locator('#feedback')).toHaveClass(/correct/);
  await expect(page.locator('#feedback')).toContainText('5 από 5');
});
test('numeric validation, equivalent masks, explanation and mobile layout', async ({ page }) => {
  await page.goto(file); await beginYear(page, 2026); await jump(page, 2026, 'Γ');
  await page.locator('#check-button').click();
  await expect(page.locator('#answer-error')).toContainText('Συμπλήρωσε');
  const question = bank.questions.find(q => q.legacyId === '2026-Γ');
  for(let i=0;i<question.fields.length;i++) {
    const f=question.fields[i]; await page.locator(`#answer-${i}`).fill(f.kind === 'mask' ? f.answers[1] : f.answers[0]);
  }
  await page.locator('#check-button').click(); await expect(page.locator('#feedback')).toHaveClass(/correct/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(root,'tests/exercise-preview.png'), fullPage:true });
});
test('ambiguous historic question is explained but not graded', async ({ page }) => {
  await page.goto(file); await beginYear(page, 2012); await jump(page, 2012, 'Α2');
  await page.locator('[data-choice="β"]').click();
  await expect(page.locator('#feedback')).toHaveClass(/studied/);
  await expect(page.locator('#feedback')).toContainText('1499');
  await page.locator('#finish-button').click();
  await expect(page.locator('#results-view')).toContainText('Δεν έχεις βαθμολογημένες');
});
test('all 236 cards render, controls exist and original identifiers are intact', async ({ page }) => {
  test.setTimeout(180000);
  const errors=[];page.on('pageerror', e=>errors.push(e.message));
  await page.goto(file);
  for(let year=2009;year<=2026;year++) {
    await beginYear(page, year);
    const qs=bank.questions.filter(q=>q.year===year).sort((a,b)=>a.order-b.order);
    for(let i=0;i<qs.length;i++) {
      await page.locator(`[data-position="${i}"]`).click();
      await expect(page.locator('#question-title')).toHaveText('Θέμα '+qs[i].key);
      if(qs[i].type==='fields') await expect(page.locator('#answer-inputs input')).toHaveCount(qs[i].fields.length);
      if(qs[i].type==='reading') await expect(page.locator('#answer-form')).toBeHidden();
    }
  }
  expect(errors).toEqual([]);
});

test('static HTTP deployment serves app and PDF sources', async ({ page, request }) => {
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765');
  await expect(page.locator('#available-count')).toHaveText('236');
  await beginYear(page,2026); await jump(page,2026,'Α2');
  const q=bank.questions.find(q=>q.legacyId==='2026-Α2');
  for(let i=0;i<q.items.length;i++) await page.locator(`#answer-${i}`).selectOption(q.items[i].correct);
  await page.locator('#check-button').click();
  await expect(page.locator('#feedback')).toHaveClass(/correct/);
  const pdf=await request.get('http://127.0.0.1:8765/assets/book.pdf');
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect(errors).toEqual([]);
});
const programming = require('../data/courses/programming.json');
async function chooseCourse(page,id,count) {
  await page.locator('#home-button').click();
  await page.locator('#course-filter').selectOption(id);
  await expect(page.locator('#available-count')).toHaveText(String(count));
}
async function jumpProgramming(page,year,key) {
  const qs=programming.questions.filter(q=>q.year===year);
  await page.locator(`[data-position="${qs.findIndex(q=>q.key===key)}"]`).click();
}
test('offline course switching isolates mistakes and updates chapters, books and syllabus', async ({page,context})=>{
  await context.setOffline(true);await page.goto(file);
  await beginYear(page,2026);await page.locator('[data-choice="false"]').click();
  await chooseCourse(page,'programming',116);
  await expect(page.locator('#mistake-count')).toHaveText('0');
  await expect(page.locator('#total-years')).toHaveText('10');
  await expect(page.locator('#course-book')).toHaveAttribute('href','assets/programming/book.pdf');
  await expect(page.locator('#year-filter option[value="2016"]')).toHaveCount(0);
  await page.locator('#chapter-filters input[value="11"]').check();
  await page.locator('.paragraph-picker summary').click();
  await expect(page.locator('#paragraph-filters input[value="11.2"]')).toHaveCount(1);
  await expect(page.locator('#paragraph-filters input[value="3.1"]')).toHaveCount(0);
  await page.locator('#paragraph-filters input[value="11.2"]').check();
  await page.locator('#syllabus-filter').check();
  await expect(page.locator('#start-button')).toBeEnabled();
  await chooseCourse(page,'networks',236);
  await expect(page.locator('#mistake-count')).toHaveText('1');
  await expect(page.locator('#course-book')).toHaveAttribute('href','assets/book.pdf');
});
test('programming code blanks are case sensitive and solution sources point to supplied PDFs',async({page})=>{
  await page.goto(file);await chooseCourse(page,'programming',116);await beginYear(page,2026);
  await jumpProgramming(page,2026,'Β1');
  for(const [i,value] of ['len(A)','n','A[j - 1]','False','f'].entries()) await page.locator(`#answer-${i}`).fill(value);
  await page.locator('#check-button').click();
  await expect(page.locator('#feedback')).toHaveClass(/wrong/);
  await expect(page.locator('#feedback')).toContainText('4 από 5');
  await expect(page.locator('#feedback a[href*="programmatismos_2026_ap12.pdf"]')).toHaveCount(1);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:path.join(root,'tests/programming-mobile.png'),fullPage:true});
});
test('setup exposes only national-exam controls',async({page})=>{
  await page.goto(file);await chooseCourse(page,'programming',116);
  await expect(page.locator('#source-kind-filter, #collection-filter, #tag-filter')).toHaveCount(0);
  await expect(page.locator('#setup-view')).not.toContainText('Τετράδιο');
  await page.locator('[name="mode"][value="year"]').check();
  await expect(page.locator('#exam-filter')).toHaveValue('programming-exam-2026');
  await page.locator('#start-button').click();
  await expect(page.locator('#question-position')).toHaveText('Ερώτηση 1 από 11');
});
test('all 116 Python cards render and every solution can be revealed',async({page})=>{
  test.setTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(file);await chooseCourse(page,'programming',116);
  for(let year=2017;year<=2026;year++) {
    await beginYear(page,year);
    const qs=programming.questions.filter(q=>q.year===year);
    for(let i=0;i<qs.length;i++) {
      await page.locator(`[data-position="${i}"]`).click();
      await expect(page.locator('#question-title')).toHaveText('Θέμα '+qs[i].key);
      if(qs[i].type==='fields') await expect(page.locator('#answer-inputs input')).toHaveCount(qs[i].fields.length);
      await page.locator('#reveal-button').click();
      await expect(page.locator('#feedback')).toBeVisible();
      await expect(page.locator('#feedback a[href*="assets/programming/answers/"]').first()).toBeVisible();
    }
  }
  expect(errors).toEqual([]);
});
test('new specialty supports exams and excludes future sources from this release',async({page})=>{
  const registry=require('../data/course-registry.json');
  const fixture={id:'mathematics',title:'Μαθηματικά δοκιμής',specialtyIds:['general'],specialtyLabel:'Γενικής παιδείας',grade:'Γ΄ ΕΠΑΛ',script:'data/courses/fixture.js',book:'assets/book.pdf',syllabusSource:'data/courses/networks-syllabus.md'};
  const catalog=structuredClone(registry);catalog.specialties.general='Γενικής παιδείας';catalog.courses.push(fixture);
  const question={id:'math:custom:1',subjectId:'mathematics',sourceKind:'exam',collectionId:'math-exam',year:2026,key:'1',order:1,sections:['12.1'],chapters:['12'],tags:['επανάληψη'],inSyllabus:true,type:'fields',prompt:'2 + 2 = ?',original:'2 + 2 = ?',fields:[{label:'Αποτέλεσμα',kind:'number',answers:['4']}],explanation:'2 + 2 = 4',answerSources:[{author:'Εκπαιδευτικός δοκιμής'}],pages:[],images:[],bookRefs:[]};
  const fixtureBank={subjectId:'mathematics',chapters:{'12':'Άλγεβρα'},sections:{'12.1':['Πράξεις',1]},questions:[question,{...question,id:'math:custom:2',sourceKind:'custom',collectionId:'teacher',year:null}],collections:{'math-exam':{title:'Εξέταση 2026',kind:'exam',year:2026},teacher:{title:'Μελλοντική συλλογή',kind:'custom'}},sourceNote:'Δοκιμή ανεξάρτητου μαθήματος'};
  await page.route('**/data/catalog.js',route=>route.fulfill({contentType:'text/javascript',body:'window.QUIZ_CATALOG='+JSON.stringify(catalog)}));
  await page.route('**/data/courses/fixture.js',route=>route.fulfill({contentType:'text/javascript',body:'window.QUIZ_BANKS=window.QUIZ_BANKS||{};window.QUIZ_BANKS.mathematics='+JSON.stringify(fixtureBank)}));
  await page.goto('http://127.0.0.1:8765');
  await expect(page.locator('#available-count')).toHaveText('236');
  await page.locator('#specialty-filter').selectOption('general');
  await expect(page.locator('#available-count')).toHaveText('1');
  await expect(page.locator('[name="mode"][value="year"]')).toBeEnabled();
  await page.locator('#chapter-filters input[value="12"]').check();
  await page.locator('#start-button').click();
  await expect(page.locator('#question-title')).toHaveText('Θέμα 1');
  await page.locator('#answer-0').fill('4');await page.locator('#check-button').click();
  await expect(page.locator('#feedback')).toHaveClass(/correct/);
  await expect(page.locator('#feedback')).toContainText('Εκπαιδευτικός δοκιμής');
});
test('slow course load clears the previous bank; fast switching cannot restore stale data',async({page})=>{
  let release; const held=new Promise(resolve=>release=resolve);
  await page.route('**/data/courses/programming.js',async route=>{await held;await route.continue();});
  await page.goto('http://127.0.0.1:8765');
  await expect(page.locator('#available-count')).toHaveText('236');
  await page.locator('#course-filter').selectOption('programming');
  await expect(page.locator('#chapter-filters input')).toHaveCount(0);
  await expect(page.locator('#available-count')).toHaveText('—');
  await expect(page.locator('#start-button')).toBeDisabled();
  await page.locator('#home-button').click();
  await expect(page.locator('#start-button')).toBeDisabled();
  await page.locator('#course-filter').selectOption('networks');
  await expect(page.locator('#available-count')).toHaveText('236');
  release();
  await page.waitForFunction(()=>!!window.QUIZ_BANKS?.programming);
  await expect(page.locator('#course-filter')).toHaveValue('networks');
  await expect(page.locator('#chapter-filters')).toContainText('Τοπικά δίκτυα');
  await chooseCourse(page,'programming',116);
  await expect(page.locator('#chapter-filters')).toContainText('Αντικειμενοστρεφής');
  await expect(page.locator('#chapter-filters')).not.toContainText('Τοπικά δίκτυα');
});
test('failed course load leaves no old filters and can be retried',async({page})=>{
  await page.route('**/data/courses/programming.js',route=>route.abort());
  await page.goto('http://127.0.0.1:8765');
  await expect(page.locator('#available-count')).toHaveText('236');
  await page.locator('#course-filter').selectOption('programming');
  await expect(page.locator('#course-retry')).toBeVisible();
  await expect(page.locator('#chapter-filters input')).toHaveCount(0);
  await expect(page.locator('#start-button')).toBeDisabled();
  await page.unroute('**/data/courses/programming.js');
  await page.locator('#course-retry').click();
  await expect(page.locator('#available-count')).toHaveText('116');
  await expect(page.locator('#chapter-filters')).toContainText('Αλγοριθμικές δομές');
});
test('browser-restored course selection and specialty changes keep bank and selector synchronized',async({page})=>{
  await page.goto(file);await expect(page.locator('#available-count')).toHaveText('236');
  // Browsers can restore form controls without emitting change after navigation.
  await page.evaluate(()=>{document.getElementById('course-filter').value='programming';window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
  await expect(page.locator('#available-count')).toHaveText('116');
  await page.locator('#specialty-filter').selectOption('informatics');
  await expect(page.locator('#course-filter')).toHaveValue('programming');
  await expect(page.locator('#available-count')).toHaveText('116');
  await beginYear(page,2026);
  await expect(page.locator('#question-prompt')).toContainText('FIFO');
  await expect(page.locator('#session-label')).toContainText('Προγραμματισμός');
});
test('a mislabeled bank is rejected instead of displaying another subject',async({page})=>{
  await page.route('**/data/courses/programming.js',route=>route.fulfill({contentType:'text/javascript',body:'window.QUIZ_BANKS.programming=window.QUIZ_BANKS.networks;'}));
  await page.goto('http://127.0.0.1:8765');await expect(page.locator('#available-count')).toHaveText('236');
  await page.locator('#course-filter').selectOption('programming');
  await expect(page.locator('#course-status')).toContainText('δεν αντιστοιχούν');
  await expect(page.locator('#start-button')).toBeDisabled();
  await expect(page.locator('#chapter-filters input')).toHaveCount(0);
});
test('answers omit all source excerpts and retain the main solution and references',async({page})=>{
  await page.goto(file);await chooseCourse(page,'programming',116);await beginYear(page,2017);
  await jumpProgramming(page,2017,'Α2');await page.locator('#reveal-button').click();
  await expect(page.locator('#feedback .explanation')).toHaveText('1.στ 2. γ 3. δ 4. α 5. β');
  await expect(page.locator('#feedback .solution-excerpt')).toHaveCount(0);
  await expect(page.locator('#feedback a[href*="programmatismos_2017_ap_epal_panellinies_net.pdf"]')).toHaveCount(1);
  const distinct=programming.questions.find(q=>q.answerExcerpt && q.answerExcerpt.trim()!==q.explanation.trim());
  await beginYear(page,distinct.year);await jumpProgramming(page,distinct.year,distinct.key);
  await page.locator('#reveal-button').click();
  await expect(page.locator('#feedback .solution-excerpt')).toHaveCount(0);
  await expect(page.locator('#feedback')).not.toContainText('Απόσπασμα από το παρεχόμενο αρχείο λύσεων');
  await expect(page.locator('#feedback .explanation').first()).toHaveText(distinct.explanation);
  await expect(page.locator('#feedback .book-links a').first()).toBeVisible();
});
test('PDF prose reflows, command lists preserve code, and tables fit mobile',async({page})=>{
  await page.goto(file);await chooseCourse(page,'programming',116);await beginYear(page,2017);
  await jumpProgramming(page,2017,'Α3');
  await expect(page.locator('#question-prompt > p').first()).toHaveText('Να γράψετε στο τετράδιό σας το αποτέλεσμα που εμφανίζεται στην οθόνη μετά την εκτέλεση καθεμιάς από τις παρακάτω εντολές:');
  await expect(page.locator('#question-prompt ol > li')).toHaveCount(5);
  expect(await page.locator('#question-prompt code').nth(2).textContent()).toBe('a = "abc"\nprint a*2');
  expect(await page.locator('#question-prompt').evaluate(el=>getComputedStyle(el).whiteSpace)).toBe('normal');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:path.join(root,'tests/formatted-prompt-mobile.png'),fullPage:true});
  await jumpProgramming(page,2017,'Β2');
  expect(await page.locator('#question-prompt code').textContent()).toContain('while x<4:\n   b=b+1');
  await beginYear(page,2018);await jumpProgramming(page,2018,'Β2');
  await expect(page.locator('#question-prompt table th')).toHaveCount(15);
  await expect(page.locator('#question-prompt table td')).toHaveCount(15);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await chooseCourse(page,'networks',236);await beginYear(page,2026);await jump(page,2026,'Δ');
  await expect(page.locator('#question-prompt > p').first()).toContainText('4000 bytes');
  await expect(page.locator('#question-prompt pre')).not.toContainText('Ένα αυτοδύναμο');
  await expect(page.locator('#question-prompt pre')).toContainText('DF');
});
test('structured prompt text is escaped and cannot become executable HTML',async({page})=>{
  await page.goto(file);await expect(page.locator('#available-count')).toHaveText('236');
  await page.evaluate(()=>{
    const q=window.QUIZ_BANKS.networks.questions.find(q=>q.year===2026);
    q.promptBlocks=[{type:'paragraph',text:'<img src=x onerror="window.injected=true">'},
      {type:'code',text:'if x < 4:\n    print "<b>"'},
      {type:'list',items:[{label:'<script>',blocks:[{type:'paragraph',text:'<svg onload="window.injected=true">'}]}]}];
  });
  await beginYear(page,2026);
  await expect(page.locator('#question-prompt img, #question-prompt svg, #question-prompt script')).toHaveCount(0);
  await expect(page.locator('#question-prompt')).toContainText('<img src=x');
  expect(await page.evaluate(()=>window.injected)).toBeUndefined();
});
test('original sources contain only reference links',async({page})=>{
  await page.goto(file);await beginYear(page,2009);await jump(page,2009,'2.Α');
  await expect(page.locator('#question-sources a[href*="diktua_2009_ap_epal.pdf"]')).toHaveCount(1);
  await expect(page.locator('#question-sources .original-text, #question-sources p, #question-sources pre, #question-sources img')).toHaveCount(0);
  await expect(page.locator('#question-sources')).not.toContainText('πλεονέκτημα');
  await beginYear(page,2018);await jump(page,2018,'Α2');
  await expect(page.locator('#question-figure img').first()).toBeVisible();
  await expect(page.locator('#question-sources img')).toHaveCount(0);
  expect(await page.locator('#question-sources').evaluate(el=>[...el.querySelectorAll('.source-links > *')].every(child=>child.tagName==='A'))).toBe(true);
});
test('TCP/IP answers follow the current question instead of a shared theory paragraph',async({page})=>{
  const keys=['2009:1.Γ.1','2010:Α1.β','2010:Α1.γ','2011:Α1.γ','2012:Α1.δ','2016:Α1.γ','2018:Α1.β','2020:Α1.α','2020:Α1.β','2021:Α1.α','2022:Α2.2','2024:Α1.α','2025:Α1.α'];
  const questions=bank.questions.filter(q=>keys.includes(`${q.year}:${q.key}`));
  expect(questions).toHaveLength(13);
  expect(new Set(questions.map(q=>q.explanation)).size).toBe(13);
  await page.goto(file);
  for(const q of questions){
    await beginYear(page,q.year);await jump(page,q.year,q.key);
    await page.locator('#reveal-button').click();
    await expect(page.locator('#feedback .explanation').first()).toHaveText(q.explanation);
    await expect(page.locator('#feedback')).not.toContainText('Τα τέσσερα επίπεδα TCP/IP είναι');
    await expect(page.locator('#feedback .solution-excerpt')).toHaveCount(0);
    await expect(page.locator('#feedback .book-links a').first()).toBeVisible();
  }
  await beginYear(page,2010);await jump(page,2010,'Α1.γ');await page.locator('#reveal-button').click();
  await expect(page.locator('#feedback')).toContainText('Το TCP ανήκει στο επίπεδο Μεταφοράς.');
  await expect(page.locator('#feedback')).toContainText('Λάθος');
});
