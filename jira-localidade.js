(function () {
  'use strict';

  const CF_ID = 18388; // IS Ubicación - cf[18388]
  const PROJECTS = ['IS', 'ISS', 'SSHP'];

  const PAGE_SIZE = 50;
  const MAX_PAGES = 6;
  const MAX_RESULTS = 100;
  const HIDE_RESOLVED = true;
  const OPEN_FILTER = 'statusCategory != Done';
  const ORDER_BY = 'updated DESC';

  // Highlight (palavras do summary)
  const KEYWORDS_MAX = 6;
  const KEYWORDS_MIN_LEN = 5;
  const KEYWORDS_STOP = new Set([
    'para','com','sem','uma','umas','uns','não','nao','que','por','pra','pro',
    'the','and','with','without','from','this','that','isso','essa','este','esta',
    'solicitar','solicitação','solicitacao','acesso','liberação','liberacao',
    'problema','erro','falha','sistema','cliente','usuário','usuario','conta'
  ]);

  const IDS = {
    style: 'ml_loc_style_bm',
    overlay: 'ml_loc_overlay_bm',
    modal: 'ml_loc_modal_bm',
    btn: 'ml_loc_btn_bm'
  };

  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const getIssueKey = () => {
    const m = location.pathname.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/);
    return m ? m[1] : '';
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
      #${IDS.modal} .b{padding:12px 16px 16px;}
      #${IDS.modal} .meta{opacity:.85;font-size:12px;margin-top:6px;word-break:break-word}
      #${IDS.modal} button{background:#2c2f36;color:#fff;border:0;border-radius:8px;padding:8px 10px;cursor:pointer;font-weight:900;}
      #${IDS.modal} a{color:#7ab7ff;text-decoration:none;}
      #${IDS.modal} a:hover{text-decoration:underline;}
      #${IDS.modal} table{width:100%;border-collapse:collapse;margin-top:10px;}
      #${IDS.modal} th,#${IDS.modal} td{border-bottom:1px solid #2c2f36;padding:10px 8px;font-size:13px;vertical-align:top;}
      #${IDS.modal} th{position:sticky;top:0;background:#1d1f23;text-align:left;}
      #${IDS.modal} .pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#2c2f36;font-size:12px;}
      #${IDS.modal} .err{color:#ffb4b4;background:#2a1d1d;border:1px solid #5a2a2a;padding:10px;border-radius:8px;}
      #${IDS.modal} .warn{color:#ffe2a8;background:#2a2418;border:1px solid #5a4a22;padding:10px;border-radius:8px;}
      #${IDS.modal} code{white-space:pre-wrap}
      #${IDS.modal} .kw{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;background:#3a2f11;border:1px solid #6b5a1d;color:#ffe2a8;font-size:12px}
      #${IDS.modal} .hl{background:rgba(255,226,168,.12)}
      #${IDS.modal} .kwh{padding:1px 4px;border-radius:6px;background:rgba(255,226,168,.18);border:1px solid rgba(255,226,168,.25)}
      #${IDS.modal} .actions a{margin-right:10px}
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

  async function getIssueSummary(issueKey){
    const url = `${location.origin}/rest/api/3/issue/${issueKey}?fields=summary`;
    const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
    if(!r.ok) throw new Error(`HTTP ${r.status} ao ler summary do ticket atual`);
    const j = await r.json();
    return String(j?.fields?.summary || '').trim();
  }

  async function getAssetFromIssue(issueKey){
    const url = `${location.origin}/rest/api/3/issue/${issueKey}?fields=customfield_${CF_ID}`;
    const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
    if(!r.ok) throw new Error(`HTTP ${r.status} ao ler customfield_${CF_ID}`);
    const j = await r.json();
    const v = j?.fields?.[`customfield_${CF_ID}`];
    const obj = Array.isArray(v) ? v[0] : v;
    const objectId = obj?.objectId;
    const workspaceId = obj?.workspaceId;
    if(!objectId || !workspaceId){
      throw new Error(`customfield_${CF_ID} sem objectId/workspaceId (formato inesperado).`);
    }
    return { objectId: String(objectId), workspaceId: String(workspaceId) };
  }

  async function getConnectedTicketsPage(workspaceId, objectId, startAt){
    const url =
      `${location.origin}/gateway/api/jsm/assets/workspace/${encodeURIComponent(workspaceId)}` +
      `/v1/objectconnectedtickets/${encodeURIComponent(objectId)}/paginatedtickets` +
      `?hideResolved=${HIDE_RESOLVED ? 'true' : 'false'}` +
      `&limit=${PAGE_SIZE}` +
      `&startAt=${startAt}`;

    const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
    if(!r.ok) throw new Error(`HTTP ${r.status} ao consultar paginatedtickets`);
    return r.json();
  }

  function extractIssueKeysFromConnectedTickets(data){
    const keys = new Set();

    const walk = (x) => {
      if(x == null) return;
      if(Array.isArray(x)){ x.forEach(walk); return; }
      if(typeof x === 'object'){
        for(const [k,v] of Object.entries(x)){
          if((k === 'issueKey' || k === 'key') && typeof v === 'string' && /^[A-Z][A-Z0-9_]+-\d+$/.test(v)){
            keys.add(v);
          } else {
            walk(v);
          }
        }
      }
    };
    walk(data);

    if(keys.size === 0){
      const s = JSON.stringify(data);
      for(const m of s.matchAll(/"issueKey"\s*:\s*"([A-Z][A-Z0-9_]+-\d+)"/g)) keys.add(m[1]);
      for(const m of s.matchAll(/"key"\s*:\s*"([A-Z][A-Z0-9_]+-\d+)"/g)) keys.add(m[1]);
    }

    return [...keys];
  }

  function buildKeywords(summary){
    const clean = summary
      .toLowerCase()
      .replace(/[#()[\]{}.,;:!?/\\|'"`~@%^&*_+=<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if(!clean) return [];

    const parts = clean.split(' ')
      .map(w => w.trim())
      .filter(w => w.length >= KEYWORDS_MIN_LEN)
      .filter(w => !KEYWORDS_STOP.has(w));

    const freq = new Map();
    for(const w of parts) freq.set(w, (freq.get(w) || 0) + 1);

    return [...freq.entries()]
      .sort((a,b) => b[1]-a[1] || b[0].length-a[0].length)
      .slice(0, KEYWORDS_MAX)
      .map(([w]) => w);
  }

  function highlightSummary(summary, keywords){
    if(!keywords.length) return esc(summary);
    let html = esc(summary);
    for(const kw of keywords){
      const re = new RegExp(`\\b(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'ig');
      html = html.replace(re, '<span class="kwh">$1</span>');
    }
    return html;
  }

  function matchScore(summary, keywords){
    if(!keywords.length) return 0;
    const s = String(summary || '').toLowerCase();
    let score = 0;
    for(const kw of keywords){
      if(s.includes(kw)) score++;
    }
    return score;
  }

  async function searchByJql(jql){
    const url = `${location.origin}/rest/api/3/search/jql`;
    const payload = { jql, maxResults: MAX_RESULTS, fields: ["summary","status","assignee","issuetype","project","updated"] };

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

  async function run(){
    const issueKey = getIssueKey();
    if(!issueKey){
      alert('Abra um ticket (/browse/XXX-123) para usar.');
      return;
    }

    const modal = openModal('Tickets abertos da mesma localidade', `Atual: ${issueKey}`);

    const load = async () => {
      try{
        modal.setBody('Lendo ticket atual / localidade…');

        const [summaryCurrent, asset] = await Promise.all([
          getIssueSummary(issueKey),
          getAssetFromIssue(issueKey),
        ]);

        const { objectId, workspaceId } = asset;

        const keywords = buildKeywords(summaryCurrent);
        const kwLabel = keywords.length ? keywords.join(', ') : '—';

        modal.setSubtitle(`Localidade (objectId): ${objectId} • Atual: ${issueKey} • Keywords: ${kwLabel}`);

        modal.setBody('Buscando tickets vinculados…');

        let allKeys = [];
        for(let page=0; page<MAX_PAGES; page++){
          const startAt = page * PAGE_SIZE;
          const data = await getConnectedTicketsPage(workspaceId, objectId, startAt);
          const keys = extractIssueKeysFromConnectedTickets(data);

          allKeys.push(...keys);

          if(keys.length < PAGE_SIZE) break;
        }

        allKeys = [...new Set(allKeys)]
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

        modal.setBody(`
          Buscando detalhes…
          <div class="meta actions">
            <a href="${esc(issuesUrl)}" target="_blank" rel="noopener">Abrir busca no Jira</a>
          </div>
          <div class="meta">
            Keys: ${Math.min(allKeys.length,400)}${allKeys.length>400?` (limitado de ${allKeys.length})`:""}<br/>
            JQL: <code>${esc(jql)}</code>
          </div>
        `);

        const data = await searchByJql(jql);
        let issues = data.issues || [];

        if(!issues.length){
          modal.setBody(`<div><b>Nenhum ticket aberto</b> encontrado.</div><div class="meta">JQL: <code>${esc(jql)}</code></div>`);
          return;
        }

        issues = issues
          .map(i => ({
            issue: i,
            score: matchScore(i?.fields?.summary || '', keywords),
            updated: i?.fields?.updated || ''
          }))
          .sort((a,b) => (b.score - a.score) || (String(b.updated).localeCompare(String(a.updated))))
          .map(x => x.issue);

        const rows = issues.map(i=>{
          const f = i.fields || {};
          const link = `${location.origin}/browse/${i.key}`;
          const score = matchScore(f.summary || '', keywords);

          return `
            <tr class="${score ? 'hl' : ''}">
              <td style="width:170px">
                <a target="_blank" rel="noopener" href="${esc(link)}">${esc(i.key)}</a>
                <div class="meta">${esc(f.project?.key||'')} • ${esc(f.issuetype?.name||'')}</div>
                ${score ? `<span class="kw">possível duplicado (${score})</span>` : ``}
              </td>
              <td>${highlightSummary(f.summary||'', keywords)}</td>
              <td style="width:160px"><span class="pill">${esc(f.status?.name||'')}</span></td>
              <td style="width:220px">${esc(f.assignee?.displayName||'—')}</td>
            </tr>
          `;
        }).join('');

        modal.setBody(`
          <div><b>${issues.length}</b> ticket(s) em aberto. <span class="meta">Ordenado por match+updated.</span></div>
          <table>
            <thead>
              <tr>
                <th style="width:170px">Key</th>
                <th>Resumo</th>
                <th style="width:160px">Status</th>
                <th style="width:220px">Responsável</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="meta">
            Localidade (objectId): ${esc(objectId)}<br/>
            Keywords: ${esc(kwLabel)}<br/>
            JQL: <code>${esc(jql)}</code>
          </div>
        `);

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
    if(location.pathname.startsWith('/browse/')) ensureButton();
    else document.getElementById(IDS.btn)?.remove();
  };

  tick();
  setInterval(tick, 1000);
})();
