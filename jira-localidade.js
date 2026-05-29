(function () {
  'use strict';

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

  // Derive
  const DERIVE_TRANSITION_NAME = 'Derive the other team';
  const DERIVE_COMMENT_DEFAULT = 'Ticket sendo derivado para fila correta de atendimento.';
  const DERIVE_TEAMS_ALLOWLIST = [
    "IS-SHIP-NATS-N1",
    "IS-SHIP-OPS",
    "IS-EXT-SIMPRESS",
    "IS-SHIP-FIELDSERVICE",
    "IS-SHIP-NETWORK"
  ];

  const IDS = {
    style: 'ml_loc_style_bm',
    overlay: 'ml_loc_overlay_bm',
    modal: 'ml_loc_modal_bm',
    btn: 'ml_loc_btn_bm',
    dOverlay: 'ml_loc_d_overlay',
    dModal: 'ml_loc_d_modal'
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

  const uniq = (arr) => [...new Set(arr)];

  // =========================
  // STYLE + BASE MODAL
  // =========================
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
      #${IDS.modal} a{color:#7ab7ff;text-decoration:none;}
      #${IDS.modal} a:hover{text-decoration:underline;}
      #${IDS.modal} .err{color:#ffb4b4;background:#2a1d1d;border:1px solid #5a2a2a;padding:10px;border-radius:8px;}
      #${IDS.modal} .warn{color:#ffe2a8;background:#2a2418;border:1px solid #5a4a22;padding:10px;border-radius:8px;}
      #${IDS.modal} .meta{opacity:.85;font-size:12px;margin-top:6px;word-break:break-word}
      #${IDS.modal} code{white-space:pre-wrap}

      /* Home cards */
      #${IDS.modal} .homeGrid{display:grid;grid-template-columns:1fr;gap:12px;}
      @media (min-width: 900px){ #${IDS.modal} .homeGrid{grid-template-columns:1fr 1fr;} }
      #${IDS.modal} .homeCard{
        border:1px solid #2c2f36;border-radius:14px;padding:14px;
        background:#16181c;
      }
      #${IDS.modal} .homeCard h3{margin:0 0 6px 0;font-size:16px;}
      #${IDS.modal} .homeCard p{margin:0;opacity:.85;font-size:13px;line-height:1.35;}
      #${IDS.modal} .homeCard .row{margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;}
      #${IDS.modal} .primary{background:#2c6bed}
      #${IDS.modal} .danger{background:#7a1f1f}
      #${IDS.modal} .ghost{background:#22252b;border:1px solid #2c2f36}
      #${IDS.modal} .disabled{opacity:.55;cursor:not-allowed}

      /* Duplicates layout */
      #${IDS.modal} .topbar{position:sticky; top:0; z-index:3; background:#1d1f23; border-bottom:1px solid #2c2f36; padding:12px 16px; margin:-12px -16px 12px -16px;}
      #${IDS.modal} .toprow{display:flex; gap:12px; align-items:flex-start; justify-content:space-between; flex-wrap:wrap;}
      #${IDS.modal} .counts{display:flex; gap:10px; flex-wrap:wrap; align-items:center; font-size:12px; opacity:.9;}
      #${IDS.modal} .countpill{background:#22252b;border:1px solid #2c2f36;border-radius:999px;padding:2px 10px;}
      #${IDS.modal} .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
      #${IDS.modal} .chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#22252b;border:1px solid #2c2f36;color:#e6e6e6;font-size:12px;cursor:pointer;user-select:none;}
      #${IDS.modal} .chip:hover{border-color:#3b82f6}
      #${IDS.modal} .chip.active{background:#17335f;border-color:#2c6bed}
      #${IDS.modal} .chip.clear{background:#2a1d1d;border-color:#5a2a2a}

      #${IDS.modal} .list{padding:0}
      #${IDS.modal} .card{border:1px solid #2c2f36;border-radius:12px;padding:10px 12px;margin-bottom:10px;background:#16181c;}
      #${IDS.modal} .card:hover{border-color:#3b82f6}
      #${IDS.modal} .card.sel{border-color:#2c6bed; box-shadow:0 0 0 2px rgba(44,107,237,.15) inset;}
      #${IDS.modal} .line1{display:flex; gap:10px; align-items:flex-start; justify-content:space-between; flex-wrap:wrap;}
      #${IDS.modal} .kblock{min-width:240px}
      #${IDS.modal} .key{font-weight:950; font-size:14px}
      #${IDS.modal} .summary{font-size:14px; font-weight:700}
      #${IDS.modal} .badges{display:flex; gap:8px; flex-wrap:wrap; align-items:center}
      #${IDS.modal} .badge{display:inline-block; padding:2px 10px; border-radius:999px;background:#22252b; border:1px solid #2c2f36; font-size:12px; opacity:.95;}
      #${IDS.modal} .badge.dup{background:#3a2f11;border-color:#6b5a1d;color:#ffe2a8;font-weight:800}
      #${IDS.modal} .badge.strong{background:#193b1a;border-color:#2f6b2f;color:#c9f7c9;font-weight:800}
      #${IDS.modal} .badge.ip{background:#1f2a44;border-color:#2c6bed;color:#cfe3ff;font-weight:800}
      #${IDS.modal} .line2{margin-top:8px;display:flex; gap:10px; align-items:flex-start; justify-content:space-between; flex-wrap:wrap;}
      #${IDS.modal} .desc{opacity:.92; font-size:13px; max-width:760px}
      #${IDS.modal} .ids{display:flex; gap:6px; flex-wrap:wrap; align-items:center}
      #${IDS.modal} .idpill{padding:1px 8px;border-radius:999px;background:rgba(255,226,168,.10);border:1px solid rgba(255,226,168,.22);font-size:12px; opacity:.95;}
      #${IDS.modal} .muted{opacity:.7; font-size:12px}
      #${IDS.modal} .detailsBtn{background:#22252b;border:1px solid #2c2f36}
      #${IDS.modal} .detailsBtn:hover{border-color:#3b82f6}
      #${IDS.modal} .expand{margin-top:10px;background:#121417;border:1px solid #2c2f36;border-radius:10px;padding:10px;}
      #${IDS.modal} .expand .title{font-weight:900;font-size:12px;opacity:.9;margin-bottom:6px}
      #${IDS.modal} .fulldesc{white-space:pre-wrap; line-height:1.35; font-size:13px; opacity:.95;}

      /* Derive modal */
      #${IDS.dOverlay}{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000000;}
      #${IDS.dModal}{
        position:fixed; top:12vh; left:50%; transform:translateX(-50%);
        width:min(720px,92vw); max-height:76vh; overflow:auto;
        background:#1d1f23; color:#e6e6e6; border:1px solid #333;
        border-radius:12px; z-index:10000001; box-shadow:0 10px 30px rgba(0,0,0,.45);
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      }
      #${IDS.dModal} .dh{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #2c2f36;}
      #${IDS.dModal} .db{padding:12px 16px 16px;}
      #${IDS.dModal} textarea{
        width:100%; min-height:90px; resize:vertical;
        background:#121417; color:#e6e6e6; border:1px solid #2c2f36;
        border-radius:10px; padding:10px; font-family:inherit; font-size:13px;
      }
      #${IDS.dModal} .teamgrid{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;}
      #${IDS.dModal} .teambtn{background:#22252b;border:1px solid #2c2f36;border-radius:999px;padding:6px 10px;cursor:pointer;font-weight:800;color:#e6e6e6;}
      #${IDS.dModal} .teambtn:hover{border-color:#3b82f6}
      #${IDS.dModal} .teambtn.active{background:#17335f;border-color:#2c6bed}
      #${IDS.dModal} .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:flex-end;margin-top:12px;}
      #${IDS.dModal} .btnPrimary{background:#2c6bed}
      #${IDS.dModal} .btnSecondary{background:#2c2f36}
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
      setSubtitle: (t) => { document.getElementById('ml_loc_sub').textContent = t; }
    };
  }

  // =========================
  // ADF / COMMENTS / LINKS
  // =========================
  function textToAdfParagraphs(text) {
    const lines = String(text || '').split(/\r?\n/);
    const content = lines.map(line => {
      const t = line === '' ? ' ' : line;
      return { type: "paragraph", content: [{ type: "text", text: t }] };
    });
    return { type: "doc", version: 1, content };
  }

  async function addInternalComment(issueKey, bodyText) {
    const url = `${location.origin}/rest/api/3/issue/${issueKey}/comment`;
    const payload = {
      body: textToAdfParagraphs(bodyText),
      properties: [{ key: "sd.public.comment", value: { internal: true } }]
    };
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Accept':'application/json', 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    const txt = await r.text().catch(()=> '');
    if(!r.ok) throw new Error(`HTTP ${r.status} ao comentar: ${txt.slice(0,300)}`);
    return JSON.parse(txt);
  }

  async function linkDuplicate(currentKey, duplicateKey) {
    const url = `${location.origin}/rest/api/3/issueLink`;
    const payload = {
      type: { name: "Duplicate" },
      outwardIssue: { key: currentKey },
      inwardIssue: { key: duplicateKey }
    };
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Accept':'application/json', 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    const txt = await r.text().catch(()=> '');
    if(!r.ok) throw new Error(`HTTP ${r.status} ao vincular: ${txt.slice(0,300)}`);
    return true;
  }

  // =========================
  // JIRA CORE API
  // =========================
  async function getIssueFields(issueKey, fields) {
    const url = `${location.origin}/rest/api/3/issue/${issueKey}?fields=${encodeURIComponent(fields.join(','))}`;
    const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
    const txt = await r.text().catch(()=> '');
    if(!r.ok) throw new Error(`HTTP ${r.status} ao ler campos do ticket: ${txt.slice(0,200)}`);
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

  async function searchByJql(jql){
    const url = `${location.origin}/rest/api/3/search/jql`;
    const payload = {
      jql,
      maxResults: MAX_RESULTS,
      fields: ["summary","description","assignee","issuetype","project","updated", `customfield_${CF_RES_TEAM}`]
    };
    const r = await fetch(url, {
      method:'POST',
      credentials:'same-origin',
      headers:{ 'Accept':'application/json', 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    const txt = await r.text().catch(()=> '');
    if(!r.ok) throw new Error(`HTTP ${r.status} no search/jql: ${txt.slice(0,250)}`);
    return JSON.parse(txt);
  }

  async function searchIssuesWithCache(objectId, jql){
    const cached = cacheGet(objectId);
    if (cached && cached.jql === jql && cached.issues) return cached.issues;
    const data = await searchByJql(jql);
    const issues = data.issues || [];
    cacheSet(objectId, { ...(cached || {}), jql, issues });
    return issues;
  }

  // =========================
  // ASSETS CONNECTED TICKETS
  // =========================
  async function getConnectedTicketsPage(workspaceId, objectId, startAt){
    const url =
      `${location.origin}/gateway/api/jsm/assets/workspace/${encodeURIComponent(workspaceId)}` +
      `/v1/objectconnectedtickets/${encodeURIComponent(objectId)}/paginatedtickets` +
      `?hideResolved=${HIDE_RESOLVED ? 'true' : 'false'}` +
      `&limit=${PAGE_SIZE}` +
      `&startAt=${startAt}`;

    const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
    const txt = await r.text().catch(()=> '');
    if(!r.ok) throw new Error(`HTTP ${r.status} ao consultar paginatedtickets: ${txt.slice(0,250)}`);
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

  // =========================
  // IDENTIFIERS (IDs + QTY)
  // =========================
  function normalizeForQty(s){
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[\(\)\[\]\{\},;:!?"'`]/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function extractQtyTokens(text){
    const t = normalizeForQty(text);
    const patterns = [
      { type: 'CAMERA', re: /\b(\d{1,3})\s+(?:camera|cameras)\b/g },
      { type: 'PRINTER', re: /\b(\d{1,3})\s+(?:impressora|impressoras)\b/g },
      { type: 'HANDHELD', re: /\b(\d{1,3})\s+(?:handheld|handhelds)\b/g },
      { type: 'NOTEBOOK', re: /\b(\d{1,3})\s+(?:notebook|notebooks)\b/g },
      { type: 'LEITOR', re: /\b(\d{1,3})\s+(?:leitor|leitores)\b/g },
      { type: 'AP', re: /\b(\d{1,3})\s+(?:ap|aps|access\s+point|access\s+points)\b/g },
    ];
    const out = [];
    for(const p of patterns){
      for(const m of t.matchAll(p.re)){
        out.push({ type: `QTY:${p.type}`, value: `QTY:${p.type}=${m[1]}`, weight: 5 });
      }
    }
    const byVal = new Map();
    for(const it of out) if(!byVal.has(it.value)) byVal.set(it.value, it);
    return [...byVal.values()];
  }

  function isPrivateIp(ip){
    const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if(!m) return false;
    const a = Number(m[1]), b = Number(m[2]);
    if(a === 10) return true;
    if(a === 192 && b === 168) return true;
    if(a === 172 && b >= 16 && b <= 31) return true;
    return false;
  }

  function extractIdentifiersFromText(text){
    const t = String(text || '');
    const found = [];

    found.push(...extractQtyTokens(t));

    const ipRe = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
    for(const m of t.matchAll(ipRe)){
      const ip = m[0];
      found.push({ type:'ip', value: ip, weight: isPrivateIp(ip) ? 4 : 3 });
    }

    const macRe = /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g;
    for(const m of t.matchAll(macRe)){
      found.push({ type:'mac', value: m[0].toUpperCase().replace(/-/g,':'), weight: 6 });
    }

    const zebzplRe = /\b(ZEB|ZPL)\s*[-_:]?\s*(\d{3,})\b/gi;
    for(const m of t.matchAll(zebzplRe)){
      found.push({ type: m[1].toUpperCase(), value: `${m[1].toUpperCase()}${m[2]}`, weight: 7 });
    }

    const selbRe = /\bSELB\b/gi;
    if(selbRe.test(t)) found.push({ type:'SELB', value:'SELB', weight: 2 });

    const serialLabelRe = /\b(?:S\/N|SN|N\/S|SERIAL(?:\s*NUMBER)?)[\s:#-]*([A-Z0-9]{6,24})\b/gi;
    for(const m of t.matchAll(serialLabelRe)){
      const s = m[1].toUpperCase();
      if(s.length >= 8) found.push({ type:'serial', value: s, weight: 7 });
    }

    const strongTokenRe = /\b[A-Z0-9]{10,24}\b/g;
    const up = t.toUpperCase();
    for(const m of up.matchAll(strongTokenRe)){
      const tok = m[0];
      if(/^\d+$/.test(tok)) continue;
      if((tok.match(/[A-Z]/g) || []).length < 2) continue;
      if((tok.match(/\d/g) || []).length < 2) continue;
      if(/^[0-9A-F]{12}$/.test(tok)) continue;
      found.push({ type:'serial?', value: tok, weight: 3 });
    }

    const byVal = new Map();
    for(const it of found){
      const v = it.value.trim();
      const prev = byVal.get(v);
      if(!prev || it.weight > prev.weight) byVal.set(v, it);
    }
    return [...byVal.values()].sort((a,b)=> b.weight - a.weight || a.value.localeCompare(b.value));
  }

  function intersectByExtraction(currentIds, otherIds){
    if(!currentIds.length || !otherIds.length) return [];
    const cur = new Map(currentIds.map(x => [x.value.toUpperCase(), x]));
    const hits = [];
    for(const it of otherIds){
      const k = it.value.toUpperCase();
      if(cur.has(k)) hits.push(cur.get(k));
    }
    return hits;
  }

  function scoreHits(hits){
    return hits.reduce((acc, x) => acc + (x.weight || 1), 0);
  }

  function isStrongHit(hit){
    const t = String(hit.type || '').toUpperCase();
    return (t === 'MAC' || t === 'ZEB' || t === 'ZPL' || t === 'SERIAL' || t === 'SERIAL?');
  }
  function isIpOnly(hits){
    return hits.length > 0 && hits.every(h => h.type === 'ip');
  }

  // =========================
  // DERIVE (Transitions)
  // =========================
  async function jiraGetTransitions(issueKey) {
    const url = `${location.origin}/rest/api/3/issue/${issueKey}/transitions?expand=transitions.fields`;
    const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
    const txt = await r.text().catch(()=> '');
    if(!r.ok) throw new Error(`HTTP ${r.status} transitions: ${txt.slice(0,250)}`);
    return JSON.parse(txt);
  }

  function pickDeriveTransition(transitionsResponse) {
    const transitions = transitionsResponse.transitions || [];
    const target = DERIVE_TRANSITION_NAME.trim().toLowerCase();
    return transitions.find(t => String(t.name||'').trim().toLowerCase() === target)
        || transitions.find(t => String(t.name||'').toLowerCase().includes('derive'))
        || null;
  }

  function getAllowedResolutionTeams(transition) {
    const fields = transition?.fields || {};
    const cf = fields[`customfield_${CF_RES_TEAM}`];
    return cf?.allowedValues || [];
  }

  function filterTeamsAllowlist(allowed) {
    const allow = new Set(DERIVE_TEAMS_ALLOWLIST.map(x => x.trim()));
    return allowed.filter(opt => allow.has(String(opt.value).trim()));
  }

  function openDeriveModal({ teams, onSubmit }) {
    document.getElementById(IDS.dModal)?.remove();
    document.getElementById(IDS.dOverlay)?.remove();

    const overlay = document.createElement('div');
    overlay.id = IDS.dOverlay;

    const modal = document.createElement('div');
    modal.id = IDS.dModal;

    modal.innerHTML = `
      <div class="dh">
        <div>
          <div style="font-size:16px;font-weight:950">Derivar para outro time</div>
          <div class="meta">Selecione o time e confirme.</div>
        </div>
        <div style="display:flex;gap:8px">
          <button id="ml_d_close" class="btnSecondary">Fechar</button>
        </div>
      </div>
      <div class="db">
        <div style="font-weight:900;margin-bottom:6px">Times</div>
        <div class="teamgrid" id="ml_d_teams"></div>

        <div style="font-weight:900;margin:12px 0 6px">Comentário (observação interna)</div>
        <textarea id="ml_d_comment">${DERIVE_COMMENT_DEFAULT}</textarea>

        <div class="row">
          <button id="ml_d_cancel" class="btnSecondary">Cancelar</button>
          <button id="ml_d_submit" class="btnPrimary">Derivar</button>
        </div>
      </div>
    `;

    const close = () => { modal.remove(); overlay.remove(); };
    overlay.addEventListener('click', close);
    modal.querySelector('#ml_d_close').addEventListener('click', close);
    modal.querySelector('#ml_d_cancel').addEventListener('click', close);

    const teamsWrap = modal.querySelector('#ml_d_teams');
    let selected = null;

    teams.forEach(t => {
      const b = document.createElement('button');
      b.className = 'teambtn';
      b.textContent = t.value;
      b.onclick = () => {
        selected = t;
        [...teamsWrap.querySelectorAll('.teambtn')].forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      };
      teamsWrap.appendChild(b);
    });

    modal.querySelector('#ml_d_submit').addEventListener('click', async () => {
      if(!selected){
        alert('Selecione um time.');
        return;
      }
      const comment = modal.querySelector('#ml_d_comment').value || DERIVE_COMMENT_DEFAULT;
      await onSubmit({ team: selected, comment });
      close();
    });

    document.body.appendChild(overlay);
    document.body.appendChild(modal);
  }

  async function jiraDoDerive(issueKey, transitionId, teamOptionId, internalCommentText) {
    const url = `${location.origin}/rest/api/3/issue/${issueKey}/transitions`;

    const payload = {
      transition: { id: String(transitionId) },
      fields: {
        [`customfield_${CF_RES_TEAM}`]: { id: String(teamOptionId) }
      },
      update: {
        comment: [{
          add: {
            body: textToAdfParagraphs(internalCommentText),
            properties: [{ key: "sd.public.comment", value: { internal: true } }]
          }
        }]
      }
    };

    const r = await fetch(url, {
      method:'POST',
      credentials:'same-origin',
      headers:{ 'Accept':'application/json', 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });

    const txt = await r.text().catch(()=> '');
    if(!r.ok) throw new Error(`HTTP ${r.status} ao derivar: ${txt.slice(0,300)}`);
    return true;
  }

  // =========================
  // RENDER: Home / Duplicates
  // =========================
  async function renderHome(modal, issueKey) {
    modal.setBody(`
      <div class="homeGrid">
        <div class="homeCard">
          <h3>Duplicados</h3>
          <p>Listar tickets da mesma localidade, filtrar por IDs, e vincular/registrar observação interna.</p>
          <div class="row">
            <button id="ml_home_dups" class="primary">Abrir duplicados</button>
          </div>
        </div>

        <div class="homeCard">
          <h3>Derivar</h3>
          <p>Derivar o ticket para um dos times permitidos (allowlist) e adicionar comentário padrão.</p>
          <div class="row">
            <button id="ml_home_derive" class="primary">Derivar agora</button>
          </div>
        </div>

        <div class="homeCard">
          <h3>Criar tarefa ISS (em breve)</h3>
          <p>Vamos adicionar após validarmos esse layout.</p>
          <div class="row">
            <button class="ghost disabled" disabled>Em breve</button>
          </div>
        </div>
      </div>
    `);

    document.getElementById('ml_home_dups').onclick = () => renderDuplicates(modal, issueKey);
    document.getElementById('ml_home_derive').onclick = () => openDeriveFlow(issueKey);
  }

  async function openDeriveFlow(issueKey) {
    try{
      const tr = await jiraGetTransitions(issueKey);
      const deriveTr = pickDeriveTransition(tr);
      if(!deriveTr){
        alert(`Transição "${DERIVE_TRANSITION_NAME}" não encontrada para este ticket.`);
        return;
      }
      const allowed = getAllowedResolutionTeams(deriveTr);
      const teams = filterTeamsAllowlist(allowed);
      if(!teams.length){
        alert('Nenhum time allowlist disponível nesta transição (verifique nomes).');
        return;
      }

      openDeriveModal({
        teams,
        onSubmit: async ({ team, comment }) => {
          await jiraDoDerive(issueKey, deriveTr.id, team.id, comment || DERIVE_COMMENT_DEFAULT);
          alert('Derivado com sucesso.');
        }
      });
    }catch(e){
      alert('Falha ao abrir derivação: ' + (e.message || e));
    }
  }

  async function renderDuplicates(modal, issueKey) {
    modal.setBody(`<div class="meta">Carregando duplicados…</div>`);

    const [issueCurrent, asset] = await Promise.all([
      getIssueFields(issueKey, ["summary","description"]),
      getAssetFromIssue(issueKey),
    ]);

    const summaryCurrent = String(issueCurrent?.fields?.summary || '').trim();
    const descCurrent = descriptionToText(issueCurrent?.fields?.description);
    const currentText = `${summaryCurrent}\n${descCurrent}`.trim();

    const currentIds = extractIdentifiersFromText(currentText);
    const idsLabel = currentIds.length ? currentIds.slice(0, 12).map(x => x.value).join(', ') : '—';

    const { objectId, workspaceId } = asset;
    modal.setSubtitle(`Localidade (objectId): ${objectId} • Atual: ${issueKey} • IDs: ${idsLabel}`);

    let allKeys = await getConnectedTicketsKeys(workspaceId, objectId);
    allKeys = allKeys.filter(k => PROJECTS.includes(k.split('-')[0])).filter(k => k !== issueKey);

    if(!allKeys.length){
      modal.setBody(`<div class="warn">Nenhum ticket (IS/ISS/SSHP) encontrado nos vinculados para este asset.</div>`);
      return;
    }

    const quotedKeys = allKeys.slice(0, 400).map(k => `"${k}"`).join(',');
    const proj = PROJECTS.map(p => `"${p}"`).join(',');
    const jql = `project in (${proj}) AND key in (${quotedKeys}) AND ${OPEN_FILTER} ORDER BY ${ORDER_BY}`;
    const issuesUrl = `${location.origin}/issues/?jql=${encodeURIComponent(jql)}`;

    const issues = await searchIssuesWithCache(objectId, jql);

    const items = (issues || []).map(issue => {
      const f = issue.fields || {};
      const descText = descriptionToText(f.description);
      const otherText = `${f.summary || ''}\n${descText}`;
      const otherIds = extractIdentifiersFromText(otherText);
      const hits = intersectByExtraction(currentIds, otherIds);
      const score = scoreHits(hits);
      const strongMatch = hits.some(isStrongHit);
      const ipOnlyMatch = isIpOnly(hits);
      return { issue, hits, score, strongMatch, ipOnlyMatch, descText };
    }).sort((a,b) => (b.score - a.score) || String(b.issue.fields?.updated||'').localeCompare(String(a.issue.fields?.updated||'')));

    const counts = computeCounts(items);

    const chipsHtml = currentIds.length
      ? currentIds.slice(0, 12).map(it => `<span class="chip" data-chip="${esc(it.value)}">${esc(it.value)}</span>`).join('')
      : `<span class="muted">Nenhum ID detectado no ticket atual.</span>`;

    const topbar = `
      <div class="topbar">
        <div class="toprow">
          <div class="counts">
            <span class="countpill">Total: <b>${counts.total}</b></span>
            <span class="countpill">Com match: <b>${counts.withMatch}</b></span>
            <span class="countpill">Match forte: <b>${counts.strong}</b></span>
            <span class="countpill">Só IP: <b>${counts.ipOnly}</b></span>
            <span class="countpill">Cache: <b>on</b></span>
          </div>
          <div class="actions">
            <button id="ml_dup_back" class="ghost">Voltar</button>
            <a href="${esc(issuesUrl)}" target="_blank" rel="noopener">Abrir busca no Jira</a>
            <button id="ml_loc_comment" class="disabled">Obs interna (0)</button>
            <button id="ml_loc_linkdup" class="disabled danger">Vincular duplicado (0)</button>
          </div>
        </div>
        <div class="meta">Clique em um ID para filtrar. Clique no card para selecionar. Use “Detalhes” para ver a descrição completa.</div>
        <div class="chips" id="ml_loc_chips">${chipsHtml}</div>
      </div>
    `;

    const listHtml = items.map(it => renderIssueCard(it)).join('');

    modal.setBody(`
      ${topbar}
      <div class="list" id="ml_loc_list">
        ${listHtml}
        <div class="meta" style="margin-top:10px">JQL: <code>${esc(jql)}</code></div>
      </div>
    `);

    document.getElementById('ml_dup_back').onclick = () => renderHome(modal, issueKey);

    setTimeout(() => {
      const chipWrap = document.getElementById('ml_loc_chips');
      const list = document.getElementById('ml_loc_list');
      const commentBtn = document.getElementById('ml_loc_comment');
      const linkBtn = document.getElementById('ml_loc_linkdup');
      if(!chipWrap || !list || !commentBtn || !linkBtn) return;

      let activeFilter = '';
      const selected = new Set();

      const refreshButtons = () => {
        commentBtn.textContent = `Obs interna (${selected.size})`;
        linkBtn.textContent = `Vincular duplicado (${selected.size})`;
        if(selected.size > 0){
          commentBtn.classList.remove('disabled'); commentBtn.classList.add('primary');
          linkBtn.classList.remove('disabled');
        } else {
          commentBtn.classList.add('disabled'); commentBtn.classList.remove('primary');
          linkBtn.classList.add('disabled');
        }
      };

      const updateClearChip = () => {
        const hasClear = !!chipWrap.querySelector('.chip.clear');
        if(activeFilter && !hasClear){
          chipWrap.insertAdjacentHTML('beforeend', `<span class="chip clear" data-chip="">Limpar filtro</span>`);
        }
        if(!activeFilter && hasClear){
          chipWrap.querySelector('.chip.clear')?.remove();
        }
      };

      chipWrap.addEventListener('click', (ev) => {
        const el = ev.target.closest('[data-chip]');
        if(!el) return;
        const v = el.getAttribute('data-chip') || '';
        activeFilter = (activeFilter === v) ? '' : v;

        [...chipWrap.querySelectorAll('.chip')].forEach(c => c.classList.remove('active'));
        if(activeFilter){
          const activeEl = [...chipWrap.querySelectorAll('.chip')].find(c => (c.getAttribute('data-chip')||'') === activeFilter);
          if(activeEl) activeEl.classList.add('active');
        }

        updateClearChip();
        applyFilterToCards(list, activeFilter);
      });

      list.addEventListener('click', (ev) => {
        const detailsBtn = ev.target.closest('[data-details="1"]');
        const card = ev.target.closest('.card');
        if(!card) return;

        if(detailsBtn){
          ev.preventDefault();
          ev.stopPropagation();
          const existing = card.querySelector('.expand');
          if(existing){ existing.remove(); return; }
          [...list.querySelectorAll('.expand')].forEach(e => e.remove());

          const full = card.getAttribute('data-full') || '';
          card.insertAdjacentHTML('beforeend', `
            <div class="expand">
              <div class="title">Descrição completa</div>
              <div class="fulldesc">${full || '<span class="muted">Sem descrição.</span>'}</div>
            </div>
          `);
          return;
        }

        if(ev.ctrlKey || ev.metaKey){
          const link = card.getAttribute('data-link');
          if(link) window.open(link, '_blank', 'noopener');
          return;
        }

        const key = card.getAttribute('data-key');
        if(selected.has(key)){
          selected.delete(key);
          card.classList.remove('sel');
        } else {
          selected.add(key);
          card.classList.add('sel');
        }
        refreshButtons();
      });

      commentBtn.addEventListener('click', async () => {
        if(selected.size === 0) return;
        commentBtn.disabled = true;
        const oldText = commentBtn.textContent;
        commentBtn.textContent = 'Comentando...';

        try{
          const selectedCards = [...list.querySelectorAll('.card.sel')];
          const lines = selectedCards.map(c => {
            const key = c.getAttribute('data-key');
            const link = `${location.origin}/browse/${key}`;
            const hits = (c.getAttribute('data-hitstext') || '').split('|').filter(Boolean);
            const hitsShow = hits.slice(0, 6).join(', ');
            return `- ${key} (${link})${hitsShow ? ` | IDs: ${hitsShow}` : ''}`;
          });

          const body =
`Possíveis duplicados na mesma localidade (Assets) [OBS INTERNA]:
Ticket atual: ${issueKey}

Tickets relacionados:
${lines.join('\n')}`;

          await addInternalComment(issueKey, body);

          commentBtn.textContent = 'OK!';
          setTimeout(() => { commentBtn.textContent = oldText; }, 900);
        } catch (e) {
          alert('Falha ao comentar: ' + (e.message || e));
          commentBtn.textContent = oldText;
        } finally {
          commentBtn.disabled = false;
        }
      });

      linkBtn.addEventListener('click', async () => {
        if(selected.size === 0) return;
        const selectedKeys = [...selected];
        const ok = confirm(`Vincular ${selectedKeys.length} ticket(s) como duplicado do ticket atual (${issueKey})?\n\nTipo: Duplicate (is duplicated by)`);
        if(!ok) return;

        linkBtn.disabled = true;
        const oldText = linkBtn.textContent;
        linkBtn.textContent = 'Vinculando...';

        try{
          for(const k of selectedKeys){
            await linkDuplicate(issueKey, k);
          }
          linkBtn.textContent = 'Vinculado!';
          setTimeout(() => { linkBtn.textContent = oldText; }, 900);
        } catch (e) {
          alert('Falha ao vincular: ' + (e.message || e));
          linkBtn.textContent = oldText;
        } finally {
          linkBtn.disabled = false;
        }
      });

      refreshButtons();
    }, 0);
  }

  // =========================
  // RUN: opens home
  // =========================
  async function runApp(){
    const issueKey = getIssueKey();
    if(!issueKey){
      alert('Abra um ticket (/browse/XXX-123) ou /queues/issue/XXX-123 para usar.');
      return;
    }
    const modal = openModal('Localidade', `Ticket atual: ${issueKey}`);
    await renderHome(modal, issueKey);
  }

  function ensureButton(){
    ensureStyle();
    if(document.getElementById(IDS.btn)) return;
    const b = document.createElement('button');
    b.id = IDS.btn;
    b.textContent = 'Localidade';
    b.title = 'Ações por localidade (duplicados/derivar)';
    b.addEventListener('click', runApp);
    document.body.appendChild(b);
  }

  const tick = () => {
    const key = getIssueKey();
    if(key) ensureButton();
    else document.getElementById(IDS.btn)?.remove();
  };

  tick();
  setInterval(tick, 1000);
})();
