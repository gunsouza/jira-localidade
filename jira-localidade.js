(function () {
  'use strict';

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

  // Cache (ms)
  const CACHE_TTL_MS = 2 * 60 * 1000;

  const IDS = {
    style: 'ml_loc_style_bm',
    overlay: 'ml_loc_overlay_bm',
    modal: 'ml_loc_modal_bm',
    btn: 'ml_loc_btn_bm'
  };

  // --- global cache ---
  window.ML_LOC_CACHE = window.ML_LOC_CACHE || { byObject: {} };
  const cacheGet = (objectId) => {
    const e = window.ML_LOC_CACHE.byObject[String(objectId)];
    if (!e) return null;
    if (Date.now() - e.ts > CACHE_TTL_MS) return null;
    return e;
  };
  const cacheSet = (objectId, data) => {
    window.ML_LOC_CACHE.byObject[String(objectId)] = { ts: Date.now(), ...data };
  };

  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const getIssueKey = () => {
    let m = location.pathname.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/);
    if (m) return m[1];
    m = location.pathname.match(/\/queues\/issue\/([A-Z][A-Z0-9_]+-\d+)/);
    if (m) return m[1];
    return '';
  };

  const ensureStyle = () => {
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
      #${IDS.modal} .b{padding:0}
      #${IDS.modal} button{background:#2c2f36;color:#fff;border:0;border-radius:8px;padding:8px 10px;cursor:pointer;font-weight:900;}
      #${IDS.modal} a{color:#7ab7ff;text-decoration:none;}
      #${IDS.modal} a:hover{text-decoration:underline;}
      #${IDS.modal} .err{color:#ffb4b4;background:#2a1d1d;border:1px solid #5a2a2a;padding:10px;border-radius:8px;margin:12px 16px;}
      #${IDS.modal} .warn{color:#ffe2a8;background:#2a2418;border:1px solid #5a4a22;padding:10px;border-radius:8px;margin:12px 16px;}
      #${IDS.modal} .meta{opacity:.85;font-size:12px;margin-top:6px;word-break:break-word}
      #${IDS.modal} code{white-space:pre-wrap}

      #${IDS.modal} .topbar{position:sticky; top:0; z-index:3; background:#1d1f23; border-bottom:1px solid #2c2f36; padding:12px 16px;}
      #${IDS.modal} .toprow{display:flex; gap:12px; align-items:flex-start; justify-content:space-between; flex-wrap:wrap;}
      #${IDS.modal} .counts{display:flex; gap:10px; flex-wrap:wrap; align-items:center; font-size:12px; opacity:.9;}
      #${IDS.modal} .countpill{background:#22252b;border:1px solid #2c2f36;border-radius:999px;padding:2px 10px;}

      #${IDS.modal} .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
      #${IDS.modal} .chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#22252b;border:1px solid #2c2f36;color:#e6e6e6;font-size:12px;cursor:pointer;user-select:none;}
      #${IDS.modal} .chip:hover{border-color:#3b82f6}
      #${IDS.modal} .chip.active{background:#17335f;border-color:#2c6bed}
      #${IDS.modal} .chip.clear{background:#2a1d1d;border-color:#5a2a2a}

      #${IDS.modal} .list{padding:12px 16px 16px 16px}
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
      #${IDS.modal} .actions{display:flex; gap:8px; flex-wrap:wrap; align-items:center}
      #${IDS.modal} .primary{background:#2c6bed}
      #${IDS.modal} .danger{background:#7a1f1f}
      #${IDS.modal} .disabled{opacity:.55; cursor:not-allowed}
      #${IDS.modal} .detailsBtn{background:#22252b;border:1px solid #2c2f36}
      #${IDS.modal} .detailsBtn:hover{border-color:#3b82f6}

      #${IDS.modal} .expand{margin-top:10px;background:#121417;border:1px solid #2c2f36;border-radius:10px;padding:10px;}
      #${IDS.modal} .expand .title{font-weight:900;font-size:12px;opacity:.9;margin-bottom:6px}
      #${IDS.modal} .fulldesc{white-space:pre-wrap; line-height:1.35; font-size:13px; opacity:.95;}
      #${IDS.modal} .compare{display:grid; grid-template-columns:1fr; gap:10px; margin-bottom:10px;}
      #${IDS.modal} .box{background:#0f1114; border:1px solid #2c2f36; border-radius:10px; padding:10px;}
      #${IDS.modal} .box .title{font-weight:900;font-size:12px;opacity:.9;margin-bottom:6px}
    `;
    document.head.appendChild(st);
  };

  const removeModal = () => {
    document.getElementById(IDS.modal)?.remove();
    document.getElementById(IDS.overlay)?.remove();
  };

  const openModal = (title, subtitle) => {
    removeModal();
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
          <button id="ml_loc_reload">Recarregar</button>
          <button id="ml_loc_close">Fechar</button>
        </div>
      </div>
      <div class="b" id="ml_loc_body">Carregando…</div>
    `;

    const close = () => removeModal();
    overlay.addEventListener('click', close);
    modal.querySelector('#ml_loc_close').addEventListener('click', close);

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    return {
      setBody: (html) => { document.getElementById('ml_loc_body').innerHTML = html; },
      setSubtitle: (t) => { document.getElementById('ml_loc_sub').textContent = t; },
      onReload: (fn) => { document.getElementById('ml_loc_reload').onclick = fn; }
    };
  };

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

  // Link duplicate: outward duplicates inward => inward shows "is duplicated by"
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

  async function getIssueFields(issueKey, fields) {
    const url = `${location.origin}/rest/api/3/issue/${issueKey}?fields=${encodeURIComponent(fields.join(','))}`;
    const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
    if(!r.ok) throw new Error(`HTTP ${r.status} ao ler campos do ticket`);
    return r.json();
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
    }catch{
      return '';
    }
  }

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

  function normalizeToken(t){ return String(t).trim(); }

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
      const v = normalizeToken(it.value);
      const prev = byVal.get(v);
      if(!prev || it.weight > prev.weight) byVal.set(v, { ...it, value: v });
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

  async function getAssetFromIssue(issueKey){
    const issue = await getIssueFields(issueKey, [`customfield_${CF_ASSET}`]);
    const v = issue?.fields?.[`customfield_${CF_ASSET}`];
    const obj = Array.isArray(v) ? v[0] : v;
    const objectId = obj?.objectId;
    const workspaceId = obj?.workspaceId;
    if(!objectId || !workspaceId){
      throw new Error(`customfield_${CF_ASSET} sem objectId/workspaceId (formato inesperado).`);
    }
    return { objectId: String(objectId), workspaceId: String(workspaceId) };
  }

  async function getConnectedTicketsKeys(workspaceId, objectId){
    // cache keys
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

  async function searchIssuesWithCache(objectId, jql){
    const cached = cacheGet(objectId);
    if (cached && cached.jql === jql && cached.issues) return cached.issues;
    const data = await searchByJql(jql);
    const issues = data.issues || [];
    cacheSet(objectId, { ...(cached || {}), jql, issues });
    return issues;
  }

  function computeCounts(items){
    let withMatch = 0, strong = 0, ipOnly = 0;
    for(const it of items){
      if(it.score > 0) withMatch++;
      if(it.strongMatch) strong++;
      if(it.ipOnlyMatch) ipOnly++;
    }
    return { total: items.length, withMatch, strong, ipOnly };
  }

  function applyFilterToCards(container, filterValue){
    const cards = [...container.querySelectorAll('.card[data-hits]')];
    for(const card of cards){
      const hits = (card.getAttribute('data-hits') || '').split('|').filter(Boolean);
      const show = !filterValue || hits.includes(filterValue);
      card.style.display = show ? '' : 'none';
      const exp = card.querySelector('.expand');
      if(exp) exp.remove();
    }
  }

  function formatPreview(text){
    const t = String(text || '').trim();
    if(!t) return '';
    return t.length > DESC_PREVIEW_LEN ? t.slice(0, DESC_PREVIEW_LEN) + '…' : t;
  }

  function renderIssueCard(item){
    const { issue, hits, score, strongMatch, ipOnlyMatch } = item;
    const f = issue.fields || {};
    const key = issue.key;
    const link = `${location.origin}/browse/${key}`;
    const preview = formatPreview(item.descText);

    const rt = f[`customfield_${CF_RES_TEAM}`];
    const resTeam = (rt && (rt.value || rt.name)) ? (rt.value || rt.name) : (rt ? String(rt) : '—');
    const assignee = f.assignee?.displayName || '—';

    const hitVals = hits.map(h => h.value);
    const hitAttr = hitVals.join('|');

    const labelTokens = hitVals.slice(0, DUP_LABEL_MAX_TOKENS).join(', ');
    const dupLabel = score ? `match: ${labelTokens || 'IDs'}` : '';

    const badges = [
      score ? `<span class="badge dup">${esc(dupLabel)}</span>` : '',
      strongMatch ? `<span class="badge strong">forte</span>` : '',
      ipOnlyMatch ? `<span class="badge ip">ip</span>` : '',
      `<span class="badge">${esc(resTeam)}</span>`,
      `<button class="detailsBtn" data-details="1" title="Ver detalhes">Detalhes</button>`
    ].filter(Boolean).join('');

    const idsHtml = hitVals.length
      ? hitVals.slice(0, 8).map(v => `<span class="idpill">${esc(v)}</span>`).join('')
      : `<span class="muted">sem IDs em comum</span>`;

    const fullEsc = esc(item.descText || '');

    return `
      <div class="card"
           data-key="${esc(key)}"
           data-link="${esc(link)}"
           data-full="${fullEsc}"
           data-hits="${esc(hitAttr)}"
           data-hitstext="${esc(hitVals.join('|'))}">
        <div class="line1">
          <div class="kblock">
            <div class="key"><a href="${esc(link)}" target="_blank" rel="noopener">${esc(key)}</a></div>
            <div class="muted">${esc(f.project?.key||'')} • ${esc(f.issuetype?.name||'')}</div>
          </div>
          <div style="flex:1;min-width:260px">
            <div class="summary">${esc(f.summary || '')}</div>
            <div class="muted">${esc(assignee)}</div>
          </div>
          <div class="badges">${badges}</div>
        </div>
        <div class="line2">
          <div class="desc">${preview ? esc(preview) : '<span class="muted">sem descrição</span>'}</div>
          <div class="ids">${idsHtml}</div>
        </div>
      </div>
    `;
  }

  async function run(){
    const issueKey = getIssueKey();
    if(!issueKey){
      alert('Abra um ticket (/browse/XXX-123) ou /queues/issue/XXX-123 para usar.');
      return;
    }

    const modal = openModal('Tickets abertos da mesma localidade', `Atual: ${issueKey}`);

    const load = async () => {
      try{
        modal.setBody(`<div class="meta" style="padding:12px 16px">Lendo ticket atual / localidade…</div>`);

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

        modal.setBody(`<div class="meta" style="padding:12px 16px">Buscando tickets vinculados…</div>`);

        let allKeys = await getConnectedTicketsKeys(workspaceId, objectId);

        allKeys = allKeys
          .filter(k => PROJECTS.includes(k.split('-')[0]))
          .filter(k => k !== issueKey);

        if(!allKeys.length){
          modal.setBody(`<div class="warn">Nenhum ticket (IS/ISS/SSHP) encontrado nos vinculados para este asset.</div>`);
          return;
        }

        const quotedKeys = allKeys.slice(0, 400).map(k => `"${k}"`).join(',');
        const proj = PROJECTS.map(p => `"${p}"`).join(',');

        const jql =
          `project in (${proj}) ` +
          `AND key in (${quotedKeys}) ` +
          `AND ${OPEN_FILTER} ` +
          `ORDER BY ${ORDER_BY}`;

        const issuesUrl = `${location.origin}/issues/?jql=${encodeURIComponent(jql)}`;

        modal.setBody(`<div class="meta" style="padding:12px 16px">Buscando detalhes…</div>`);

        const issues = await searchIssuesWithCache(objectId, jql);

        if(!issues.length){
          modal.setBody(`<div class="warn">Nenhum ticket aberto encontrado para esta localidade.</div>`);
          return;
        }

        const items = issues.map(issue => {
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
                <a href="${esc(issuesUrl)}" target="_blank" rel="noopener">Abrir busca no Jira</a>
                <button id="ml_loc_comment" class="disabled">Obs interna (0)</button>
                <button id="ml_loc_linkdup" class="disabled danger">Vincular duplicado (0)</button>
              </div>
            </div>
            <div class="meta">Clique em um ID para filtrar. Clique no card para selecionar. “Vincular duplicado” cria link Duplicate (selecionados).</div>
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

            const setEnabled = (btn, enabled) => {
              if(enabled){
                btn.classList.remove('disabled');
                btn.classList.add('primary');
                btn.disabled = false;
              } else {
                btn.classList.add('disabled');
                btn.classList.remove('primary');
                btn.disabled = false;
              }
            };
            setEnabled(commentBtn, selected.size > 0);
            if(selected.size > 0){
              linkBtn.classList.remove('disabled');
              linkBtn.disabled = false;
            } else {
              linkBtn.classList.add('disabled');
              linkBtn.disabled = false;
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
              const hitVals = (card.getAttribute('data-hitstext') || '').split('|').filter(Boolean);

              const currentHtml = currentIds.length
                ? currentIds.slice(0, 12).map(it => `<span class="idpill">${esc(it.value)}</span>`).join('')
                : `<span class="muted">nenhum</span>`;

              const hitsHtml = hitVals.length
                ? hitVals.slice(0, 12).map(v => `<span class="idpill">${esc(v)}</span>`).join('')
                : `<span class="muted">nenhum</span>`;

              card.insertAdjacentHTML('beforeend', `
                <div class="expand">
                  <div class="title">IDs do ticket atual</div>
                  <div class="ids">${currentHtml}</div>
                  <div class="title" style="margin-top:10px">IDs em comum</div>
                  <div class="ids">${hitsHtml}</div>
                  <div class="title" style="margin-top:10px">Descrição completa</div>
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

            }catch(e){
              alert('Falha ao comentar: ' + (e.message || e));
              commentBtn.textContent = oldText;
            }finally{
              commentBtn.disabled = false;
              refreshButtons();
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
              // cria links em série (menos risco de rate limit)
              for(const k of selectedKeys){
                await linkDuplicate(issueKey, k);
              }
              linkBtn.textContent = 'Vinculado!';
              setTimeout(() => { linkBtn.textContent = oldText; }, 900);

            }catch(e){
              alert('Falha ao vincular: ' + (e.message || e));
              linkBtn.textContent = oldText;
            }finally{
              linkBtn.disabled = false;
              refreshButtons();
            }
          });

          refreshButtons();
        }, 0);

      }catch(e){
        modal.setBody(`<div class="err">Erro: ${esc(e.message || String(e))}</div>`);
      }
    };

    modal.onReload(load);
    await load();
  }

  function ensureButton(){
    ensureStyle();
    if(document.getElementById(IDS.btn)) return;
    const b = document.createElement('button');
    b.id = IDS.btn;
    b.textContent = 'Localidade';
    b.title = 'Listar tickets abertos da mesma localidade';
    b.addEventListener('click', run);
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
