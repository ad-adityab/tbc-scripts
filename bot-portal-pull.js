// The 40L Question — incremental portal job pull (read-only). v3.2, 5 Oct 2026 (CR-039 + CR-061 JDs; CR-090: v3.1 was v3 with
// two backticks removed from this comment so the fingerprint loader can wrap the file. LOCKED by house rule 11: no edit without A's OK).
// v3.2 (5 Oct 2026, A: "issue of white space in the role name"): every text field the portal gives (role, company, labels,
// experience, stage names) is trimmed and inner runs of spaces collapsed to one, in the list-level facts and in the job object.
// The portal returned "Senior Director " and "Manager  " (trailing spaces); the run's hand-copied write lost them and G7 failed
// (run 20261005-2004). JD text is left as it is.
// Built by the Placement Q&A chat. Replaces the v1 "pull everything" script.
//
// PRINCIPLE (A, 25 Sep 2026): never re-read what we already have. The Jobs tab of the live Sheet is
// the memory. A pull costs ONE list call (the same request the portal makes when a student opens
// "Manage All Jobs") plus ONE detail call per job that is NEW or whose list-level facts CHANGED.
// The closed list is never read again: a job that leaves the active list, or whose deadline passes,
// is marked closed from the Sheet alone, with no portal call.
//
// WHEN TO RUN (superseded by CR-042 and the SOP in claude/bot-sop-portal-check.md): only when there is a reason — a pending row in the Sheet's Signals tab (the updater
// chat adds one when the CAC mentions a new company, a deadline change or a JD change in the group),
// or when A asks. Never on a timer.
//
// v3 (26 Sep 2026): also collects each new or changed job's JD (A: "no one rule fits all"): the role-page
// description text, every attached file (.docx read in the page; .pdf read with pdf.js from cdnjs), and any links.
// Files are read in memory, never saved. Pay lines may appear in JD text: they go ONLY to the private sheet,
// never to the public Jobs tab (A, 26 Sep 2026, until the login exists).
// OUTPUT LIMITS: the javascript tool truncates long results and times out after ~45 s. So the script runs in the
// background, keeps its result in window.__PULL, and when done writes it into the page as one <article> that the
// get_page_text tool can read in full. Poll with window.__PULL_STATUS until it says "done".
// HOW TO RUN: in Chrome, open https://placements.isb.edu logged in as A. Set KNOWN (below) from the
// Jobs tab, then run this in the page (Claude in Chrome javascript tool). It returns a JSON string:
//   {pulled_at, new:[job…], changed:[{job, fields_changed}…], gone:[application_id…], unchanged:n}
//
// WHY A WHITELIST: the job-detail response also embeds the logged-in student's own profile
// (education, work history, past CTC, DOB, contact). Nothing outside the fields below may leave the page.
// Never add salary/CTC, staff names (cbd_label, process_coordinator), student fields or per-student status.
//
// AUTH: the portal keeps {token: "<JWT>"} in localStorage._token and sends it as x-access-token,
// token and "Authorization: Bearer <JWT>". The JWT lasts ~4 weeks; then A logs in again.
// Never print or save the token.

// KNOWN = what the Jobs tab already holds for OPEN jobs: application_id → list-level facts.
// Fill it from the Sheet before running, e.g. {"1f6be11f-…": {deadline_ist:"2026-09-28 10:00",
//   shortlist_expected:"2026-10-15", role:"Consultant", exp_min:"1y", exp_max:"5y"}, …}
const KNOWN = window.__KNOWN || {};

window.__PULL_STATUS = "running";
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function unzipEntry(buf, name){ const dv = new DataView(buf); let eocd = -1; for (let i = buf.byteLength - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; } if (eocd < 0) return null;
  const n = dv.getUint16(eocd + 10, true); let off = dv.getUint32(eocd + 16, true);
  for (let k = 0; k < n; k++){ const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true), nlen = dv.getUint16(off + 28, true), xlen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
    const fname = new TextDecoder().decode(new Uint8Array(buf, off + 46, nlen));
    if (fname === name){ const lnl = dv.getUint16(lho + 26, true), lxl = dv.getUint16(lho + 28, true); const data = new Uint8Array(buf, lho + 30 + lnl + lxl, csize);
      if (method === 0) return new TextDecoder().decode(data);
      return new TextDecoder().decode(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()); }
    off += 46 + nlen + xlen + clen; } return null; }
const dec = s => s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&nbsp;|&#160;/g," ").replace(/&#10;/g,"\n");
const docxText = x => dec(x.replace(/<w:tab\/>/g,"\t").replace(/<\/w:p>/g,"\n").replace(/<w:br\/>/g,"\n").replace(/<[^>]+>/g,"")).replace(/\n{3,}/g,"\n\n").trim();
const htmlText = h => dec(String(h || "").replace(/<br\s*\/?>/gi,"\n").replace(/<\/(p|div|li|h\d)>/gi,"\n").replace(/<li[^>]*>/gi,"• ").replace(/<[^>]+>/g,"")).replace(/\n{3,}/g,"\n\n").trim();
async function pdfText(buf){
  if (!window.__pdfjs){ window.__pdfjs = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs"); window.__pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs"; }
  const doc = await window.__pdfjs.getDocument({data: new Uint8Array(buf)}).promise; const out = [];
  for (let i = 1; i <= Math.min(doc.numPages, 12); i++){ const tc = await (await doc.getPage(i)).getTextContent(); let line = "", lastY = null; const lines = [];
    for (const it of tc.items){ const y = Math.round(it.transform[5]); if (lastY !== null && Math.abs(y - lastY) > 3){ lines.push(line); line = ""; } line += (line && !line.endsWith(" ") ? " " : "") + it.str; lastY = y; }
    lines.push(line); out.push(lines.join("\n")); }
  return out.join("\n\n").trim(); }
(async () => {
  const t = JSON.parse(localStorage._token).token;
  const H = {'Content-Type':'application/json','Accept':'application/json','x-access-token':t,'token':t,'Authorization':'Bearer '+t};
  const body = {company:"0",groupFunction:"0",jobTitle:"0",industryGroup:"0",jobStatus:"0",daySlot:"0",jobDaySlot:"0",sortBy:"0"};
  const L = await (await fetch('/ssms/api/sk-applications/student/active',{method:'POST',headers:H,body:JSON.stringify(body)})).json();
  const list = L.applicationDetails || [];

  // v3.2: stray whitespace in the portal's text never reaches the Sheet.
  const clean = v => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v;
  // Facts the list call already gives us. If none of these moved, the detail can't have mattered to us.
  const facts = j => ({deadline_ist:clean(j.application_deadline), shortlist_expected:clean(j.shortlist_expected_date || ""),
                       role:clean(j.job_role_name), exp_min:clean(j.min_experience), exp_max:clean(j.max_experience)});
  const seen = new Set(), todo = [], out = {pulled_at:new Date().toISOString(), new:[], changed:[], gone:[], unchanged:0};
  for (const j of list){
    seen.add(j.application_id);
    const k = KNOWN[j.application_id];
    if (!k){ todo.push([j, null]); continue; }
    const f = facts(j), diff = Object.keys(f).filter(x => String(f[x]) !== String(k[x] ?? ""));
    if (diff.length) todo.push([j, diff]); else out.unchanged++;
  }
  out.gone = Object.keys(KNOWN).filter(id => !seen.has(id));   // left the active list → mark closed, no call

  for (const [j, diff] of todo){
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000)); // 2–4 s between records
    const D = await (await fetch('/ssms/api/sk-applications/' + j.application_id, {headers:H})).json();
    const p = (D.json_data || {}).job_posting_details || {};
    const st = ((D.json_data || {}).hiring_workflow_details || {}).stages || [];
    const job = {
      application_id: j.application_id, company: j.registered_company_name, role: j.job_role_name,
      cluster: j.tiering_day_label, deadline_ist: j.application_deadline, job_type: j.job_type_label,
      function_group: D.cas_function_grouping_label || null, industry: j.recruiter_industry_label,
      counter: j.job_counter, blue_tag: j.blue_tag_job,
      exp_min: j.min_experience, exp_max: j.max_experience,
      exp_min_flexible: j.is_min_exp_flexible, exp_max_flexible: j.is_max_exp_flexible,
      shortlist_expected: j.shortlist_expected_date, broadcast_at: (j.broadcasted_time || '').slice(0, 16),
      apply_on_company_website: p.apply_on_website || null, company_website_link: p.website || null,
      cover_letter_eoi: p.eoi || null, cgpa_required: p.cgpa_required || null,
      locations: p.city || null, work_type: p.work_type || null, interview_mode: p.mode_of_interview || null,
      stages: st.map(s => ({seq: s.stage_sequence_number, name: clean(s.name), eliminative: s.eliminative === 'Yes'})),
      listing_status: 'open'
    };
    for (const k of Object.keys(job)) job[k] = clean(job[k]);
    // JD: every source the firm used (CR-061). Text only; files are never saved.
    const jd = {description: htmlText(p.description), links: [...new Set([...String(p.description || "").matchAll(/href="([^"]+)"/g)].map(m => m[1]))], files: []};
    for (const d of (p.jd_docs || [])){
      await sleep(1500 + Math.random() * 1500);
      try {
        const r = await fetch('/ssms/api/files/get-resource/' + encodeURIComponent(d.uuid), {headers: {'x-access-token': t, 'token': t, 'Authorization': 'Bearer ' + t}});
        const ct = r.headers.get('content-type') || '', buf = await r.arrayBuffer();
        let text = null, kind = 'other';
        if (/wordprocessingml/.test(ct) || /\.docx$/i.test(d.file)){ kind = 'docx'; const x = await unzipEntry(buf, 'word/document.xml'); text = x ? docxText(x) : null; }
        else if (/pdf/.test(ct) || /\.pdf$/i.test(d.file)){ kind = 'pdf'; text = await pdfText(buf); }
        jd.files.push({file: d.file, kind, text});
      } catch (e){ jd.files.push({file: d.file, kind: 'error', text: null, error: String(e).slice(0, 120)}); }
    }
    job.jd = jd;
    if (diff) out.changed.push({job, fields_changed: diff}); else out.new.push(job);
  }
  window.__PULL = out;
  // Put the whole result on the page so get_page_text can read it (the javascript tool truncates long output).
  const art = document.createElement('article'); art.id = '__pullout'; art.style.whiteSpace = 'pre-wrap';
  art.textContent = JSON.stringify(out, null, 1); document.body.innerHTML = ''; document.body.appendChild(art);
  window.__PULL_STATUS = "done";
})().catch(e => { window.__PULL_STATUS = "error: " + String(e).slice(0, 200); });
