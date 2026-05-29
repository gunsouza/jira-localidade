(function () {
  'use strict';

  // Expor app para debug
  window.ML_LOC_APP = window.ML_LOC_APP || {};
  const APP = window.ML_LOC_APP;

  // =========================
  // CONFIG
  // =========================
  const CF_ASSET = 18388;
  const CF_RES_TEAM = 15613;

  const PROJECTS = ['IS', 'ISS', 'SSHP'];

  const PAGE_SIZE = 50;
  const MAX_PAGES = 6;
  const MAX_RESULTS = 100;

  const HIDE_RESOLVED = true;
  const OPEN_FILTER = 'statusCategory != Done';
  const ORDER_BY = 'updated DESC';

  const DESC_PREVIEW_LEN = 240;
  const DUP_LABEL_MAX_TOKENS = 3;

  const CACHE_TTL_MS = 2 * 60 * 1000;

  const IDS = {
    style: 'ml_loc_style_bm',
    overlay: 'ml_loc_overlay_bm',
    modal: 'ml_loc_modal_bm',
    btn: 'ml_loc_btn_bm'
  };

  // =========================
  // CACHE
  // =========================
  window.ML_LOC_CACHE = window.ML_LOC_CACHE || { byObject: {} };

  function cacheGet(objectId) {
    const e = window.ML_LOC_CACHE.byObject[String(objectId)];
    if (!e) return null;
    if (Date.now() - e.ts > CACHE_TTL_MS) return null;
    return e;
  }
  function cacheSet(objectId, data) {
    window.ML_LOC_CACHE.byObject[String(objectId)] = { ts: Date.now(), ...data };
  }

  // =========================
  // HELPERS
  // =========================
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function getIssueKey() {
    let m = location.pathname.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/);
    if (m) return m[1];
    m = location.pathname.match(/\/queues\/issue\/([A-Z][A-Z0-9_]+-\d+)/);
    if (m) return m[1];
    return '';
  }

  function uniq(arr) { return [...new Set(arr)]; }

  function ensureStyle() {
    if (document.getElementById(IDS.style)) return;
    const st = document.createElement('style');
    st.id = IDS.style;
    st.textContent = `
      #${IDS.btn}{
        position:fixed; right:18px; bottom:18px; z-index:9999997;
        background:#2c6bed; color:#fff; border:0; border-radius:999px;
        padding:10px 14px; font-weight:900; cursor:pointer;
        box-shadow:0 10px 24px rgba(0,0,0,.35);
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      }
      #${IDS.btn}:hover{filter:brightness(1.05)}
      #${IDS.overlay}{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999998;}
      #${IDS.modal}{
        position:fixed; top:6vh; left:50%; transform:translateX(-50%);
        width:min(1100px,94vw); max-height:88vh; overflow:auto;
        background:#1d1f23; color:#e6e6e6; border:1px solid #333;
        border-radius:12px; z-index:9999999; box-shadow:0 10px 30px rgba(0,0,0,.45);
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      }
      #${IDS.modal} .h{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #2c2f36;}
      #${IDS.modal} .b{padding:12px 16px 16px;}
      #${IDS.modal} button{background:#2c2f36;color:#fff;border:0;border-radius:8px;padding:8px 10px;cursor:pointer;font-weight:900;}
      #${IDS.modal} .err{color:#ffb4b4;background:#2a1d1d;border:1px solid #5a2a2a;padding:10px;border-radius:8px;}
      #${IDS.modal} .meta{opacity:.85;font-size:12px;margin-top:6px;word-break:break-word}
    `;
    document.head.appendChild(st);
  }

  function openModal(title, subtitle) {
    document.getElementById(IDS.modal)?.remove();
    document.getElementById(IDS.overlay)?.remove();

    ensureStyle();

    const overlay = document.createElement('div');
    overlay.id = IDS.overlay;

    const modal = document.createElement('div');
    modal.id = IDS.modal;
    modal.innerHTML = `
      <div class="h">
        <div>
          <div style="font-size:16px;font-weight:950">${esc(title)}</div>
          <div class="meta" id="ml_loc_sub">${esc(subtitle || '')}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button id="ml_loc_close">Fechar</button>
        </div>
      </div>
      <div class="b" id="ml_loc_body">Carregando…</div>
    `;

    const close = () => { modal.remove(); overlay.remove(); };
    overlay.addEventListener('click', close);
    modal.querySelector('#ml_loc_close').addEventListener('click', close);

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    return {
      setBody: (html) => { document.getElementById('ml_loc_body').innerHTML = html; },
      setSubtitle: (t) => { document.getElementById('ml_loc_sub').textContent = t; },
    };
  }

  async function getIssueFields(issueKey, fields) {
    const url = `${location.origin}/rest/api/3/issue/${issueKey}?fields=${encodeURIComponent(fields.join(','))}`;
    const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
    const txt = await r.text().catch(()=> '');
    if(!r.ok) throw new Error(`HTTP ${r.status} getIssueFields: ${txt.slice(0,200)}`);
    return JSON.parse(txt);
  }

  function descriptionToText(desc){
    if(!desc) return '';
    if(typeof desc === 'string') return desc.replace(/\s+/g,' ').trim();
    try{
      let out = '';
      const walk = (n) => {
        if(!n) return;
        if(Array.isArray(n)) return n.forEach(walk);
        if(typeof n === 'object'){
          if(n.type === 'text' && typeof n.text === 'string') out += n.text + ' ';
          if(n.content) walk(n.content);
        }
      };
      walk(desc);
      return out.replace(/\s+/g,' ').trim();
    }catch{ return ''; }
  }

  // ---- Assets calls ----
  async function getConnectedTicketsPage(workspaceId, objectId, startAt){
    const url =
      `${location.origin}/gateway/api/jsm/assets/workspace/${encodeURIComponent(workspaceId)}` +
      `/v1/objectconnectedtickets/${encodeURIComponent(objectId)}/paginatedtickets` +
      `?hideResolved=${HIDE_RESOLVED ? 'true' : 'false'}` +
      `&limit=${PAGE_SIZE}` +
      `&startAt=${startAt}`;

    const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
    const txt = await r.text().catch(()=> '');
    if(!r.ok) throw new Error(`HTTP ${r.status} paginatedtickets: ${txt.slice(0,200)}`);
    return JSON.parse(txt);
  }

  function extractIssueKeysFromConnectedTickets(data){
    const keys = new Set();
    const walk = (x) => {
      if(x == null) return;
      if(Array.isArray(x)) return x.forEach(walk);
      if(typeof x === 'object'){
        for(const [k,v] of Object.entries(x)){
          if((k === 'issueKey' || k === 'key') && typeof v === 'string' && /^[A-Z][A-Z0-9_]+-\d+$/.test(v)) keys.add(v);
          else walk(v);
        }
      }
    };
    walk(data);
    return [...keys];
  }

  async function getConnectedTicketsKeys(workspaceId, objectId){
    const cached = cacheGet(objectId);
    if (cached && cached.keys) return cached.keys;

    let allKeys = [];
    for(let page=0; page<MAX_PAGES; page++){
      const startAt = page * PAGE_SIZE;
      const data = await getConnectedTicketsPage(workspaceId, objectId, startAt);
      const keys = extractIssueKeysFromConnectedTickets(data);
      allKeys.push(...keys);
      if(keys.length < PAGE_SIZE) break;
    }
    allKeys = uniq(allKeys);
    cacheSet(objectId, { ...(cached || {}), keys: allKeys });
    return allKeys;
  }

  async function getAssetFromIssue(issueKey){
    const issue = await getIssueFields(issueKey, [`customfield_${CF_ASSET}`]);
    const v = issue?.fields?.[`customfield_${CF_ASSET}`];
    const obj = Array.isArray(v) ? v[0] : v;
    const objectId = obj?.objectId;
    const workspaceId = obj?.workspaceId;
    if(!objectId || !workspaceId) throw new Error('customfield_18388 sem objectId/workspaceId');
    return { objectId: String(objectId), workspaceId: String(workspaceId) };
  }

  // Very simple identifiers just for not failing open (keeps behavior)
  function extractIdentifiersFromText(text){
    const t = String(text || '');
    const m = t.match(/\b\d{1,3}\s+(?:câmeras|cameras|camera)\b/i);
    if(m){
      const n = (m[0].match(/\d{1,3}/)||[])[0];
      return [{ type:'QTY:CAMERA', value:`QTY:CAMERA=${n}`, weight:5 }];
    }
    return [];
  }
  function intersectByExtraction(cur, other){
    const map = new Map(cur.map(x=>[x.value.toUpperCase(), x]));
    const hits = [];
    for(const it of other){
      if(map.has(it.value.toUpperCase())) hits.push(map.get(it.value.toUpperCase()));
    }
    return hits;
  }
  function scoreHits(hits){ return hits.reduce((a,x)=>a+(x.weight||1),0); }

  async function searchByJql(jql){
    const url = `${location.origin}/rest/api/3/search/jql`;
    const payload = { jql, maxResults: MAX_RESULTS, fields: ["summary","description","updated"] };
    const r = await fetch(url, {
      method:'POST',
      credentials:'same-origin',
      headers:{ 'Accept':'application/json', 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    const txt = await r.text().catch(()=> '');
    if(!r.ok) throw new Error(`HTTP ${r.status} search/jql: ${txt.slice(0,200)}`);
    return JSON.parse(txt);
  }

  async function runDuplicates(){
    const issueKey = getIssueKey();
    if(!issueKey){
      alert('Não encontrei a issue key na URL.');
      return;
    }

    const modal = openModal('Tickets abertos da mesma localidade', `Atual: ${issueKey}`);

    try{
      modal.setBody('Buscando localidade...');
      const [issueCurrent, asset] = await Promise.all([
        getIssueFields(issueKey, ["summary","description"]),
        getAssetFromIssue(issueKey)
      ]);

      const summaryCurrent = String(issueCurrent?.fields?.summary || '').trim();
      const descCurrent = descriptionToText(issueCurrent?.fields?.description);
      const currentText = `${summaryCurrent}\n${descCurrent}`.trim();

      const currentIds = extractIdentifiersFromText(currentText);

      const { objectId, workspaceId } = asset;
      modal.setSubtitle(`Localidade (objectId): ${objectId} • Atual: ${issueKey} • IDs: ${currentIds.map(x=>x.value).join(', ')||'—'}`);

      modal.setBody('Buscando tickets vinculados (Assets)...');
      let allKeys = await getConnectedTicketsKeys(workspaceId, objectId);
      allKeys = allKeys.filter(k => PROJECTS.includes(k.split('-')[0])).filter(k => k !== issueKey);

      const quotedKeys = allKeys.slice(0, 200).map(k => `"${k}"`).join(',');
      const proj = PROJECTS.map(p => `"${p}"`).join(',');
      const jql = `project in (${proj}) AND key in (${quotedKeys}) AND ${OPEN_FILTER} ORDER BY ${ORDER_BY}`;

      modal.setBody(`Buscando detalhes via JQL...<div class="meta"><code>${esc(jql)}</code></div>`);
      const data = await searchByJql(jql);

      const issues = data.issues || [];
      const rows = issues.slice(0, 50).map(i=>{
        const f=i.fields||{};
        const text = `${f.summary||''}\n${descriptionToText(f.description)}`;
        const otherIds = extractIdentifiersFromText(text);
        const hits = intersectByExtraction(currentIds, otherIds);
        const score = scoreHits(hits);
        return `<div style="padding:10px;border-bottom:1px solid #2c2f36">
          <b>${esc(i.key)}</b> - ${esc(f.summary||'')}
          <div class="meta">match: ${score} • hits: ${hits.map(h=>h.value).join(', ')||'—'}</div>
        </div>`;
      }).join('');

      modal.setBody(rows || '<div class="warn">Nenhum ticket retornado.</div>');
    }catch(e){
      const msg = e && e.message ? e.message : String(e);
      modal.setBody(`<div class="err">Erro: ${esc(msg)}</div>`);
      alert('Erro ao abrir Localidade: ' + msg);
      console.error(e);
    }
  }

  function ensureButton(){
    ensureStyle();
    if(document.getElementById(IDS.btn)) return;
    const b = document.createElement('button');
    b.id = IDS.btn;
    b.textContent = 'Localidade';
    b.title = 'Listar tickets abertos da mesma localidade';
    b.addEventListener('click', runDuplicates);
    document.body.appendChild(b);
  }

  // self-test
  APP.runDuplicates = runDuplicates;
  APP.selfTest = () => ({
    hasButton: !!document.getElementById(IDS.btn),
    issueKey: getIssueKey(),
    ok: true
  });

  const tick = () => {
    const key = getIssueKey();
    if(key) ensureButton();
    else document.getElementById(IDS.btn)?.remove();
  };

  tick();
  setInterval(tick, 1000);
})();
