// bot-sop-lib.js -- SOP-PJC v1.4, lib v1.3 (The 40L Question, portal job check). Gates G1-G8, row builder, report text.
// CR-090, approved by A on 27 Sep 2026. v1.1 (28 Sep 2026, A: "yes"): G5 accepts a pay entry with no figure when it is a word-for-word quote from the JD. v1.1.1 (28 Sep 2026): same code, no backslash-u escapes (the run copies this file through a tool call that turned them into characters; run 20260928-1854 HALTed). v1.2 (1 Oct 2026, A: "make sure that this doesn't happen again"): G5 treats a figure in the JD as stated pay only when it reads as pay (runs 20261001-1452 and -1455 FAILed on a firm's "annual revenue over $24 billion" line). The leak checks G4 and G8 keep the broad pattern. v1.3 (5 Oct 2026, A: "make sure that we are handling this issue for once and forever. for other fields"): every value the plan writes (all 28 Jobs cells, the private pay row, a signal's outcome) is normalised, trimmed with inner runs of spaces collapsed, newlines kept only in jd_summary, so stray whitespace from the portal or from the run's own typing can never make a written cell differ from its read-back (run 20261005-2004 FAILed G7 on "Senior Director " / "Manager  "). LOCKED (house rule 11): any change needs A's explicit OK and a new fingerprint.
// Runs inside A's logged-in placements.isb.edu tab, loaded through the fingerprint loader. Never prints the portal token.
// Every gate returns {pass, gate, reason}. The AI does not judge a gate; it reads pass.
// This file must never contain a backtick, a dollar-brace or a backslash-u escape, because the loader wraps it in String.raw and the run copies it through a tool call.
(function (G) {
  var SHEET = '1jYGom0VNH6-tZUqfWOhMgvWy1G6ZCSEby5FODONx7bI';
  var COLS = ['application_id','company','role','cluster','deadline_ist','job_type','function_group','industry','counter','blue_tag','exp_min','exp_max','exp_min_flexible','exp_max_flexible','shortlist_expected','broadcast_at','apply_on_company_website','company_website_link','cover_letter_eoi','cgpa_required','locations','work_type','interview_mode','stages','listing_status','company_short','jd_summary','jd_sources'];
  var SIG_COLS = ['id','logged_at','company','kind','what_the_group_said','source','status','outcome','checked_at'];
  var JOB_KEYS = COLS.slice(0, 25).concat(['jd']);
  var LETTERS = 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z AA AB'.split(' ');
  var PAY_WORDS = /₹|\bINR\b|\bRs\.?\s?\d|\blakhs?\b|\blacs?\b|\bLPA\b|\bCTC\b|salary|compensation|\bbonus|\$|\bUSD\b|per annum|fixed pay|variable pay|stipend/i;
  var PAY_FIGURE = /(₹|\bINR\b|\bRs\.?|\bUSD\b|\$|\bCTC\b)\s*[:\-]?\s*\d|\d[\d,.]*\s*(LPA\b|lakhs?\b|lacs?\b|crores?\b|INR\b|USD\b|per annum)/i;
  // v1.2: pay words that make a nearby figure count as stated pay (G5 only; G4 and G8 stay broad because they guard against leaks).
  var PAY_CONTEXT = /\bCTC\b|salary|compensation|remuneration|stipend|package|\bpay\b|per annum|\bLPA\b|lakhs?\b|lacs?\b|\bbase\b|\bbonus\b|\bfixed\b|\bvariable\b/i;
  var SIZE_WORD = /^[\d,.]*\s*(billion|million|trillion|bn|mn)\b/i;
  var RE = {
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    deadline: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    day: /^(\d{4}-\d{2}-\d{2})?$/,
    broadcast: /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/,
    yesno: /^(Yes|No)?$/,
    flex: /^(Flexible|Rigid)?$/,
    stages: /^([^>*]+?( \*)?)( > [^>*]+?( \*)?)*$/,
    jwt: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./
  };
  function ok(gate, reason) { return {pass: true, gate: gate, reason: reason || 'ok'}; }
  function no(gate, reason) { return {pass: false, gate: gate, reason: String(reason).slice(0, 300)}; }
  function s(v) { return v === null || v === undefined ? '' : String(v); }
  // v1.3: the only whitespace a written cell may carry is single spaces between words (and newlines between jd_summary lines).
  function norm(v, keepLines) {
    var x = s(v);
    if (keepLines) return x.split('\n').map(function (l) { return l.replace(/[^\S\n]+/g, ' ').trim(); }).filter(function (l) { return l; }).join('\n');
    return x.replace(/\s+/g, ' ').trim();
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ist(ms) {
    var d = new Date((ms === undefined ? Date.now() : ms) + 19800000);
    var day = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    var hm = pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
    return {iso: day + 'T' + hm + ':' + pad(d.getUTCSeconds()) + '+05:30', min: day + ' ' + hm, day: day};
  }
  async function sha256(text) {
    var b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }
  function parseCSV(t) {
    var rows = [], row = [], cell = '', q = false, i = 0;
    for (; i < t.length; i++) {
      var c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  async function tab(name) {
    var u = 'https://docs.google.com/spreadsheets/d/' + SHEET + '/gviz/tq?tqx=out:csv&headers=1&sheet=' + name + '&cb=' + Date.now();
    var r = await fetch(u, {cache: 'no-store'});
    if (!r.ok) throw new Error('Sheet tab ' + name + ' HTTP ' + r.status);
    var text = await r.text();
    return {text: text, rows: parseCSV(text)};
  }

  // S1: read the live Sheet (public tabs). No portal call.
  async function snapshot() {
    var J = await tab('Jobs'), S = await tab('Signals'), M = await tab('Meta'), Q = await tab('QA');
    var snap = {header: J.rows[0] || [], jobs: J.rows.slice(1), sigHeader: S.rows[0] || [], signals: S.rows.slice(1),
      meta: M.rows.slice(1), qaHeader: Q.rows[0] || [], hash: await sha256(J.text + String.fromCharCode(0) + S.text + String.fromCharCode(0) + M.text), taken_at: ist().iso};
    var ci = snap.qaHeader.indexOf('company');
    var names = {};
    Q.rows.slice(1).forEach(function (r) { if (ci >= 0 && r[ci]) names[r[ci].trim()] = 1; });
    snap.qaCompanies = Object.keys(names);
    G.__SNAP = snap;
    return snap;
  }
  function rowObj(r) { var o = {}; COLS.forEach(function (c, i) { o[c] = s(r[i]); }); return o; }
  function metaRow(snap, key) { for (var i = 0; i < snap.meta.length; i++) if (snap.meta[i][0] === key) return i + 2; return -1; }

  // G1
  function checkSnapshot(snap) {
    var g = 'G1 checkSnapshot';
    if (!snap || !snap.header) return no(g, 'no snapshot');
    if (snap.header.join('|') !== COLS.join('|')) return no(g, 'Jobs header is not the 28 expected columns in order: ' + snap.header.join(','));
    if (snap.sigHeader.join('|') !== SIG_COLS.join('|')) return no(g, 'Signals header changed: ' + snap.sigHeader.join(','));
    if (!snap.jobs.length) return no(g, 'Jobs tab came back empty');
    if (metaRow(snap, 'jobs_pulled_at') < 0) return no(g, 'Meta has no jobs_pulled_at');
    if (snap.qaHeader.indexOf('company') < 0) return no(g, 'QA tab has no company column');
    var seen = {};
    for (var i = 0; i < snap.jobs.length; i++) {
      var r = snap.jobs[i], n = i + 2;
      if (r.length !== 28) return no(g, 'Jobs row ' + n + ' has ' + r.length + ' cells');
      if (!RE.uuid.test(r[0])) return no(g, 'Jobs row ' + n + ' application_id is not a portal id');
      if (seen[r[0]]) return no(g, 'duplicate application_id in rows ' + seen[r[0]] + ' and ' + n);
      seen[r[0]] = n;
      if (!RE.deadline.test(r[4])) return no(g, 'Jobs row ' + n + ' deadline_ist is not YYYY-MM-DD HH:MM');
      if (r[24] !== 'open' && r[24] !== 'closed') return no(g, 'Jobs row ' + n + ' listing_status is ' + r[24]);
    }
    return ok(g, snap.jobs.length + ' jobs, ' + snap.signals.length + ' signals, snapshot ' + snap.hash.slice(0, 12));
  }
  // KNOWN for the pull script: open rows only (the script's own rule).
  function known(snap) {
    var k = {};
    snap.jobs.forEach(function (r) { var o = rowObj(r); if (o.listing_status === 'open') k[o.application_id] = {deadline_ist: o.deadline_ist, shortlist_expected: o.shortlist_expected, role: o.role, exp_min: o.exp_min, exp_max: o.exp_max}; });
    G.__KNOWN = k;
    return k;
  }

  // G2: the portal session is live. Reads the token's expiry only; never returns or prints the token.
  function checkSession(getRaw) {
    var g = 'G2 checkSession';
    try {
      var raw = getRaw ? getRaw() : G.localStorage.getItem('_token');
      if (!raw) return no(g, 'login expired: no portal session. A logs in on Chrome; Claude never does');
      var t = JSON.parse(raw).token || '';
      var parts = t.split('.');
      if (parts.length !== 3) return no(g, 'login expired: session token is malformed');
      var p = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (!p.exp || p.exp * 1000 < Date.now() + 120000) return no(g, 'login expired. A logs in on Chrome; Claude never does');
      return ok(g, 'session valid until ' + ist(p.exp * 1000).min + ' IST');
    } catch (e) { return no(g, 'login expired: session unreadable'); }
  }

  // G3: the pull's result is complete, whitelisted, and carries no token.
  function checkPull(pull, knownMap, tokenRaw) {
    var g = 'G3 checkPull', k = knownMap || {};
    if (!pull || typeof pull !== 'object') return no(g, 'no pull result');
    var keys = Object.keys(pull).sort().join(',');
    if (keys !== 'changed,gone,new,pulled_at,unchanged') return no(g, 'result keys are ' + keys);
    if (isNaN(Date.parse(pull.pulled_at))) return no(g, 'pulled_at is not a time');
    if (!Array.isArray(pull.new) || !Array.isArray(pull.changed) || !Array.isArray(pull.gone) || typeof pull.unchanged !== 'number') return no(g, 'result parts have the wrong types');
    var size = pull.unchanged + pull.new.length + pull.changed.length;
    if (size < 1 || size > 200) return no(g, 'active list size ' + size + ' is outside 1-200');
    for (var i = 0; i < pull.gone.length; i++) if (!k[pull.gone[i]]) return no(g, 'gone id ' + pull.gone[i] + ' was not an open job');
    var jobs = pull.new.map(function (j) { return {job: j, isNew: true}; }).concat(pull.changed.map(function (c) { return {job: c && c.job, isNew: false, c: c}; }));
    for (i = 0; i < jobs.length; i++) {
      var j = jobs[i].job;
      if (!j) return no(g, 'a changed entry has no job');
      if (!jobs[i].isNew) { if (Object.keys(jobs[i].c).sort().join(',') !== 'fields_changed,job') return no(g, 'changed entry has extra fields'); if (!k[j.application_id]) return no(g, 'changed id ' + j.application_id + ' was not an open job'); }
      else if (k[j.application_id]) return no(g, 'new id ' + j.application_id + ' was already open');
      var extra = Object.keys(j).filter(function (x) { return JOB_KEYS.indexOf(x) < 0; });
      if (extra.length) return no(g, 'fields outside the whitelist: ' + extra.join(','));
      if (!RE.uuid.test(s(j.application_id)) || !s(j.company).trim() || !s(j.role).trim()) return no(g, 'a job lacks id, company or role');
      if (!RE.deadline.test(s(j.deadline_ist))) return no(g, j.application_id + ' deadline ' + s(j.deadline_ist) + ' is not YYYY-MM-DD HH:MM');
      if (!Array.isArray(j.stages)) return no(g, j.application_id + ' stages is not a list');
      if (!j.jd || Object.keys(j.jd).sort().join(',') !== 'description,files,links') return no(g, j.application_id + ' JD block is missing or has extra fields');
      for (var f = 0; f < j.jd.files.length; f++) if (Object.keys(j.jd.files[f]).some(function (x) { return ['file', 'kind', 'text', 'error'].indexOf(x) < 0; })) return no(g, j.application_id + ' JD file has extra fields');
    }
    var all = JSON.stringify(pull);
    if (RE.jwt.test(all)) return no(g, 'a token-like string is in the result');
    try { var t = tokenRaw !== undefined ? tokenRaw : JSON.parse(G.localStorage.getItem('_token')).token; if (t && all.indexOf(t.slice(-24)) >= 0) return no(g, 'the portal token is in the result'); } catch (e) {}
    return ok(g, 'list ' + size + ': new ' + pull.new.length + ', changed ' + pull.changed.length + ', gone ' + pull.gone.length + ', unchanged ' + pull.unchanged);
  }

  function stagesText(st) {
    return st.slice().sort(function (a, b) { return a.seq - b.seq; }).map(function (x) { return s(x.name).replace(/\s+/g, ' ').trim() + (x.eliminative ? ' *' : ''); }).join(' > ');
  }
  function jdText(j) { return [s(j.jd && j.jd.description)].concat(((j.jd && j.jd.files) || []).map(function (f) { return s(f.text); })).join('\n'); }
  function stripLegal(name) { return s(name).replace(/[,.]?\s*(Private Limited|Pvt\.? Ltd\.?|Limited|Ltd\.?|Inc\.?|LLP|India)\s*$/i, '').replace(/[,.]?\s*(Private Limited|Pvt\.? Ltd\.?|Limited|Ltd\.?|Inc\.?|LLP|India)\s*$/i, '').trim(); }
  // v1.1: a words-only pay entry must be a word-for-word quote from the JD (spacing, case and curly quotes ignored).
  function quoteText(v) { return s(v).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function isQuote(entry, src) { var q = quoteText(entry); return q.length >= 12 && quoteText(src).indexOf(q) >= 0; }
  // v1.2: does the JD state pay? A figure counts only when it is not a company-size figure (billion, million, trillion)
  // and either names LPA / lakh / per annum itself or sits within 80 characters of a pay word.
  function statesPay(src) {
    var re = new RegExp(PAY_FIGURE.source, 'gi'), m;
    while ((m = re.exec(src))) {
      if (SIZE_WORD.test(src.slice(m.index + m[0].length))) continue;
      if (/LPA|lakh|lac|per annum/i.test(m[0])) return true;
      if (PAY_CONTEXT.test(src.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80))) return true;
    }
    return false;
  }
  function allowedShort(snap, legal) {
    var fromZ = null;
    snap.jobs.forEach(function (r) { if (r[1] === legal && r[25]) fromZ = r[25]; });
    if (fromZ) return [fromZ];
    return snap.qaCompanies.concat([stripLegal(legal)]);
  }

  // G5: the only fields the AI writes. judg = {jobs:{id:{company_short, jd_summary, jd_sources}}, pay:{id:{compensation_as_stated_in_JD, where_it_appears}}, signals:{id:{status, outcome}}}
  function checkJudgment(judg, pull, snap, privateIds) {
    var g = 'G5 checkJudgment';
    if (!judg || typeof judg !== 'object') return no(g, 'no judgment object');
    if (Object.keys(judg).sort().join(',') !== 'jobs,pay,signals') return no(g, 'judgment must have exactly jobs, pay, signals');
    if (!Array.isArray(privateIds)) return no(g, 'private sheet ids were not supplied');
    var jobs = pull.new.concat(pull.changed.map(function (c) { return c.job; }));
    var ids = jobs.map(function (j) { return j.application_id; });
    var extra = Object.keys(judg.jobs).concat(Object.keys(judg.pay)).filter(function (x) { return ids.indexOf(x) < 0; });
    if (extra.length) return no(g, 'judgment for ids the pull did not return: ' + extra.join(','));
    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i], id = j.application_id, x = judg.jobs[id];
      if (!x || Object.keys(x).sort().join(',') !== 'company_short,jd_sources,jd_summary') return no(g, id + ' needs exactly company_short, jd_summary, jd_sources');
      var allowed = allowedShort(snap, j.company);
      if (allowed.indexOf(x.company_short) < 0) return no(g, id + ' company_short "' + x.company_short + '" is not an existing name; allowed: ' + allowed.slice(-8).join(' | '));
      var lines = s(x.jd_summary).split('\n');
      if (lines.length < 3 || lines.length > 7) return no(g, id + ' jd_summary has ' + lines.length + ' lines (3-7)');
      for (var L = 0; L < lines.length; L++) if (!lines[L].trim() || lines[L].length > 300) return no(g, id + ' jd_summary line ' + (L + 1) + ' is empty or over 300 characters');
      if (PAY_WORDS.test(x.jd_summary)) return no(g, id + ' jd_summary contains a pay word');
      if (!s(x.jd_sources).trim() || x.jd_sources.length > 200 || /\n/.test(x.jd_sources) || PAY_WORDS.test(x.jd_sources)) return no(g, id + ' jd_sources is empty, too long, multi-line or has a pay word');
      var src = jdText(j), p = judg.pay[id];
      if (privateIds.indexOf(id) >= 0) { if (p) return no(g, id + ' already has a private pay row; do not add another'); continue; }
      if (!p || Object.keys(p).sort().join(',') !== 'compensation_as_stated_in_JD,where_it_appears') return no(g, id + ' needs exactly one private pay entry');
      var comp = s(p.compensation_as_stated_in_JD).trim();
      if (!comp || !s(p.where_it_appears).trim()) return no(g, id + ' pay entry is empty');
      if (comp === 'Not stated') { if (statesPay(src)) return no(g, id + ' pay says Not stated but the JD states pay: a figure next to a pay word (CTC, salary, compensation, stipend, LPA, per annum, fixed, variable, base, bonus); quote that pay line exactly'); }
      else {
        var nums = comp.match(/\d[\d,.]*/g) || [];
        if (!nums.length) { if (isQuote(comp, src)) continue; return no(g, id + ' pay entry has no figure and is not a word-for-word quote from the JD; quote the JD pay words exactly, or write Not stated if the JD has none'); }
        var flat = src.replace(/[,\s]/g, '');
        for (var n = 0; n < nums.length; n++) if (flat.indexOf(nums[n].replace(/[,.]+$/, '').replace(/,/g, '')) < 0) return no(g, id + ' pay figure ' + nums[n] + ' does not appear in the JD text');
      }
    }
    var pending = snap.signals.filter(function (r) { return r[6] === 'pending'; }).map(function (r) { return r[0]; });
    var sk = Object.keys(judg.signals);
    if (sk.sort().join(',') !== pending.slice().sort().join(',')) return no(g, 'signals judged (' + sk.join(',') + ') must be exactly the pending ones (' + pending.join(',') + ')');
    for (i = 0; i < sk.length; i++) {
      var v = judg.signals[sk[i]];
      if (!v || Object.keys(v).sort().join(',') !== 'outcome,status') return no(g, 'signal ' + sk[i] + ' needs exactly status and outcome');
      if (v.status !== 'confirmed' && v.status !== 'still_pending') return no(g, 'signal ' + sk[i] + ' status must be confirmed or still_pending');
      if (!s(v.outcome).trim() || v.outcome.length > 200 || /\n/.test(v.outcome) || PAY_WORDS.test(v.outcome)) return no(g, 'signal ' + sk[i] + ' outcome is empty, too long, multi-line or has a pay word');
    }
    return ok(g, jobs.length + ' jobs, ' + Object.keys(judg.pay).length + ' pay rows, ' + sk.length + ' signals');
  }

  // S4: the exact writes. Order: private pay, Jobs, Signals, Meta last.
  function buildPlan(snap, pull, judg, nowMs) {
    var now = ist(nowMs), ops = [], idx = {}, counts = {new: 0, changed: 0, closed: 0, signals: 0}, report = {new: [], changed: [], closed: [], confirmed: []};
    snap.jobs.forEach(function (r, i) { idx[r[0]] = i; });
    var next = snap.jobs.length + 2;
    function fullRow(j, prev) {
      var x = judg.jobs[j.application_id];
      var row = COLS.slice(0, 23).map(function (c) { return norm(j[c]); });
      row.push(stagesText(j.stages), 'open', norm(x.company_short), norm(x.jd_summary, true), norm(x.jd_sources));
      if (prev && prev[25] && row[25] !== norm(prev[25])) row[25] = norm(prev[25]);
      return row;
    }
    var jobs = pull.new.map(function (j) { return {j: j, isNew: true}; }).concat(pull.changed.map(function (c) { return {j: c.job, isNew: false, f: c.fields_changed}; }));
    jobs.forEach(function (e) {
      var j = e.j, p = judg.pay[j.application_id];
      if (p) ops.push({book: 'private', kind: 'append', range: 'Sheet1!A:E', values: [[norm(j.application_id), norm(j.company), norm(p.compensation_as_stated_in_JD), norm(p.where_it_appears), now.day]]});
    });
    var touched = {};
    jobs.forEach(function (e) {
      var j = e.j, at = idx[j.application_id], short = judg.jobs[j.application_id].company_short;
      if (at === undefined) {
        ops.push({book: 'public', kind: 'update', range: 'Jobs!A' + next + ':AB' + next, values: [fullRow(j, null)]}); next++;
        counts.new++; report.new.push(short);
      } else {
        var r = at + 2, row = fullRow(j, snap.jobs[at]);
        ops.push({book: 'public', kind: 'update', range: 'Jobs!A' + r + ':AB' + r, values: [row]});
        touched[j.application_id] = 1;
        if (e.isNew) { counts.new++; report.new.push(short + ' (reopened)'); }
        else { counts.changed++; report.changed.push(short + ((e.f || []).indexOf('deadline_ist') >= 0 ? ' deadline ' + j.deadline_ist : '')); }
      }
    });
    snap.jobs.forEach(function (r, i) {
      if (r[24] !== 'open' || touched[r[0]]) return;
      if (pull.gone.indexOf(r[0]) >= 0 || r[4] < now.min) { ops.push({book: 'public', kind: 'update', range: 'Jobs!Y' + (i + 2), values: [['closed']]}); counts.closed++; report.closed.push(r[25] || r[1]); }
    });
    snap.signals.forEach(function (r, i) {
      var v = judg.signals[r[0]];
      if (!v) return;
      ops.push({book: 'public', kind: 'update', range: 'Signals!G' + (i + 2) + ':I' + (i + 2), values: [[v.status, norm(v.outcome), now.iso]]});
      counts.signals++; if (v.status === 'confirmed') report.confirmed.push(r[2]);
    });
    ops.push({book: 'public', kind: 'update', range: 'Meta!B' + metaRow(snap, 'jobs_pulled_at'), values: [[now.iso]]});
    var plan = {sop_version: '1.3', snapshot: snap.hash.slice(0, 12), made_at: now.iso, counts: counts, report: report, ops: ops};
    G.__PLAN = plan;
    return plan;
  }

  // G4: every write is well-formed and cannot duplicate.
  function checkRows(plan, snap) {
    var g = 'G4 checkRows', ranges = {}, ids = {};
    snap.jobs.forEach(function (r) { ids[r[0]] = 1; });
    if (!plan.ops.length || !/^Meta!B\d+$/.test(plan.ops[plan.ops.length - 1].range)) return no(g, 'Meta is not the last write');
    var lastPrivate = -1, firstPublic = plan.ops.length;
    for (var i = 0; i < plan.ops.length; i++) {
      var o = plan.ops[i];
      if (o.book === 'private') lastPrivate = i; else if (firstPublic === plan.ops.length) firstPublic = i;
      if (o.book === 'public' && ranges[o.range]) return no(g, 'two writes to ' + o.range);
      ranges[o.range] = 1;
      if (o.book === 'private') {
        if (o.range !== 'Sheet1!A:E' || o.values[0].length !== 5) return no(g, 'private write is malformed');
        continue;
      }
      var m = /^Jobs!A(\d+):AB(\d+)$/.exec(o.range);
      if (m) {
        var row = o.values[0], n = +m[1];
        if (m[1] !== m[2] || row.length !== 28) return no(g, o.range + ' is not one 28-cell row');
        if (row.some(function (c) { return typeof c !== 'string'; })) return no(g, o.range + ' has a non-text cell');
        if (!RE.uuid.test(row[0])) return no(g, o.range + ' id is not a portal id');
        if (n > snap.jobs.length + 1 && ids[row[0]]) return no(g, o.range + ' would add a duplicate of ' + row[0]);
        if (ids[row[0]] === 2) return no(g, row[0] + ' is written twice');
        ids[row[0]] = 2;
        if (n <= snap.jobs.length + 1 && snap.jobs[n - 2][0] !== row[0]) return no(g, o.range + ' would overwrite a different job');
        if (!RE.deadline.test(row[4]) || !RE.day.test(row[14]) || !RE.broadcast.test(row[15])) return no(g, o.range + ' has a badly formatted date');
        if (!RE.yesno.test(row[9]) || !RE.yesno.test(row[16]) || !RE.yesno.test(row[18]) || !RE.yesno.test(row[19])) return no(g, o.range + ' has a Yes/No cell with another value');
        if (!RE.flex.test(row[12]) || !RE.flex.test(row[13])) return no(g, o.range + ' has a Flexible/Rigid cell with another value');
        if (!RE.stages.test(row[23])) return no(g, o.range + ' stages string is malformed');
        if (row[24] !== 'open') return no(g, o.range + ' listing_status must be open');
        if (row.some(function (c) { return PAY_FIGURE.test(c); }) || PAY_WORDS.test(row[26])) return no(g, o.range + ' contains pay');
        continue;
      }
      if (/^Jobs!Y\d+$/.test(o.range)) { if (o.values[0][0] !== 'closed') return no(g, o.range + ' closure is not "closed"'); continue; }
      if (/^Signals!G\d+:I\d+$/.test(o.range) || /^Meta!B\d+$/.test(o.range)) continue;
      return no(g, 'unexpected range ' + o.range);
    }
    if (lastPrivate > firstPublic) return no(g, 'private writes must come first');
    return ok(g, plan.ops.length + ' writes: new ' + plan.counts.new + ', changed ' + plan.counts.changed + ', closed ' + plan.counts.closed + ', signals ' + plan.counts.signals);
  }

  // G7: read the public Sheet again and compare every written cell. privateRead = rows read back from Sheet1 (array of 5-cell arrays).
  async function compareWrite(plan, privateRead) {
    var g = 'G7 compareWrite', snap = await snapshot(), bad = [];
    function cell(tabRows, a1col, r) { var c = LETTERS.indexOf(a1col); var row = tabRows[r - 2]; return row ? s(row[c]) : undefined; }
    plan.ops.forEach(function (o) {
      if (o.book === 'private') {
        var want = o.values[0].map(s).join('|');
        if (!Array.isArray(privateRead) || !privateRead.some(function (r) { return r.map(s).join('|') === want; })) bad.push('private ' + o.values[0][0]);
        return;
      }
      var m = /^(\w+)!([A-Z]+)(\d+)(?::([A-Z]+)\d+)?$/.exec(o.range), rows = m[1] === 'Jobs' ? snap.jobs : m[1] === 'Signals' ? snap.signals : snap.meta;
      var c0 = LETTERS.indexOf(m[2]);
      o.values[0].forEach(function (v, k) { if (cell(rows, LETTERS[c0 + k], +m[3]) !== s(v)) bad.push(m[1] + '!' + LETTERS[c0 + k] + m[3]); });
    });
    return bad.length ? no(g, bad.length + ' cells differ: ' + bad.slice(0, 12).join(', ')) : ok(g, 'every written cell matches');
  }

  // S8: the notification, built from counts and names only.
  function notifyText(plan) {
    var r = plan.report, parts = [];
    if (r.new.length) parts.push(r.new.length + ' new: ' + r.new.join(', '));
    if (r.changed.length) parts.push('changed: ' + r.changed.join(', '));
    if (r.confirmed.length) parts.push('group signal confirmed: ' + r.confirmed.join(', '));
    if (!parts.length) return '';
    var t = '40L portal check: ' + parts.join('; ') + '.';
    if (r.closed.length) t += '\nClosed: ' + r.closed.length + '.';
    return t;
  }
  // G8
  function checkNotify(text) {
    var g = 'G8 checkNotify';
    if (text === '') return ok(g, 'nothing changed: send nothing');
    if (PAY_WORDS.test(text) || PAY_FIGURE.test(text)) return no(g, 'notification contains pay');
    if (text.split('\n').length > 2 || text.length > 400) return no(g, 'notification is longer than 2 lines or 400 characters');
    return ok(g, 'send it');
  }

  G.SOP = {version: '1.3', COLS: COLS, ist: ist, sha256: sha256, parseCSV: parseCSV, snapshot: snapshot, checkSnapshot: checkSnapshot, known: known,
    checkSession: checkSession, checkPull: checkPull, checkJudgment: checkJudgment, statesPay: statesPay, norm: norm, buildPlan: buildPlan, checkRows: checkRows,
    compareWrite: compareWrite, notifyText: notifyText, checkNotify: checkNotify, stagesText: stagesText, stripLegal: stripLegal};
  return 'SOP lib v1.3 ready';
})(typeof window !== 'undefined' ? window : globalThis);
