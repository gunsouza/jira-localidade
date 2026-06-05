  // =========================
  // JIRA CORE API (issues, search, comments, links)
  // =========================
  async function getIssueFields(issueKey, fields) {
    const url = `${location.origin}/rest/api/3/issue/${issueKey}?fields=${encodeURIComponent(fields.join(','))}`;
    const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
    const txt = await r.text().catch(()=> '');
    if(!r.ok) throw new Error(`HTTP ${r.status} ao ler campos do ticket: ${txt.slice(0,200)}`);
    return JSON.parse(txt);
  }

  // Preview leve de um ticket: campos essenciais pra UI rapida.
  // Faz uma chamada extra (em paralelo) na Assets API pra resolver o NOME legivel do asset
  // (do contrario so temos o objectId numerico).
  // Cache em sessionStorage por 5min: economiza calls quando re-busca a mesma key.
  const _PREVIEW_CACHE_KEY = 'ml_loc_preview_cache_v1';
  const _PREVIEW_TTL_MS = 5 * 60 * 1000;
  function _readPreviewCache(){
    try { return JSON.parse(sessionStorage.getItem(_PREVIEW_CACHE_KEY) || '{}'); } catch(_) { return {}; }
  }
  function _writePreviewCache(obj){
    try { sessionStorage.setItem(_PREVIEW_CACHE_KEY, JSON.stringify(obj)); } catch(_) {}
  }
  async function getIssuePreview(issueKey){
    // Cache hit?
    const cache = _readPreviewCache();
    const hit = cache[issueKey];
    if(hit && (Date.now() - hit.t) < _PREVIEW_TTL_MS){
      return hit.data;
    }

    const fields = [
      'summary','status','priority','assignee','description','issuetype',
      `customfield_${CF_ASSET}`,
      `customfield_${CF_RES_TEAM}`
    ];
    const data = await getIssueFields(issueKey, fields);
    const f = data.fields || {};
    const asset = f[`customfield_${CF_ASSET}`];
    const assetArr = Array.isArray(asset) ? asset : (asset ? [asset] : []);
    let assetLabel = assetArr.map(a => a?.objectKey || a?.label || a?.name).filter(Boolean).join(', ');
    if(!assetLabel && assetArr.length){
      const names = await Promise.all(assetArr.map(a => getAssetName(a?.workspaceId, a?.objectId)));
      assetLabel = names.filter(Boolean).join(', ');
      if(!assetLabel) assetLabel = assetArr.map(a => a?.objectId).filter(Boolean).join(', ');
    }
    const resTeam = f[`customfield_${CF_RES_TEAM}`];
    const result = {
      key: data.key || issueKey,
      summary: f.summary || '(sem titulo)',
      status: f.status?.name || '',
      statusColor: f.status?.statusCategory?.colorName || 'medium-gray',
      priority: f.priority?.name || '',
      priorityIcon: f.priority?.iconUrl || '',
      assignee: f.assignee?.displayName || 'Nao atribuido',
      issuetype: f.issuetype?.name || '',
      issuetypeIcon: f.issuetype?.iconUrl || '',
      asset: assetLabel,
      resolutionTeam: resTeam?.value || resTeam?.name || '',
      descriptionAdf: f.description || null
    };

    // Salva no cache (limita a 50 entradas mais recentes)
    cache[issueKey] = { t: Date.now(), data: result };
    const entries = Object.entries(cache).sort((a,b) => b[1].t - a[1].t).slice(0, 50);
    _writePreviewCache(Object.fromEntries(entries));
    return result;
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

  // Busca info compacta de varios chamados de uma vez (para o modal Gerenciador).
  // Faz JQL "key in (...)" e retorna [{ key, summary, status, priority, assignee,
  //   issuetype, asset (texto), resTeam }]. Asset e resolvido em paralelo via Assets API.
  // Pagina internamente se houver muitas keys (limite JQL ~ algumas centenas).
  async function getIssuesBatchInfo(keys){
    if(!Array.isArray(keys) || !keys.length) return [];

    const fieldList = [
      'summary','status','priority','assignee','issuetype',
      `customfield_${CF_ASSET}`,
      `customfield_${CF_RES_TEAM}`
    ];

    const out = [];
    const CHUNK = 100; // safe pra JQL
    for(let i = 0; i < keys.length; i += CHUNK){
      const slice = keys.slice(i, i + CHUNK);
      const quoted = slice.map(k => `"${k}"`).join(',');
      const jql = `key in (${quoted})`;
      const url = `${location.origin}/rest/api/3/search/jql`;
      const payload = { jql, maxResults: CHUNK, fields: fieldList };
      try{
        const r = await fetch(url, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Accept':'application/json', 'Content-Type':'application/json' },
          body: JSON.stringify(payload)
        });
        if(!r.ok){
          // Falha no chunk: emite stubs pra nao perder visibilidade
          for(const k of slice) out.push({ key: k, error: `HTTP ${r.status}` });
          continue;
        }
        const data = await r.json();
        for(const issue of (data.issues || [])){
          const f = issue.fields || {};
          const assetArr = (() => {
            const a = f[`customfield_${CF_ASSET}`];
            return Array.isArray(a) ? a : (a ? [a] : []);
          })();
          // Asset inline (pode vir vazio - resolvemos via Assets API depois, async)
          let assetInline = assetArr.map(a => a?.objectKey || a?.label || a?.name).filter(Boolean).join(', ');
          const resTeam = f[`customfield_${CF_RES_TEAM}`];
          out.push({
            key: issue.key,
            summary: f.summary || '(sem titulo)',
            status: f.status?.name || '',
            statusColor: f.status?.statusCategory?.colorName || 'medium-gray',
            priority: f.priority?.name || '',
            priorityIcon: f.priority?.iconUrl || '',
            assignee: f.assignee?.displayName || '',
            issuetype: f.issuetype?.name || '',
            issuetypeIcon: f.issuetype?.iconUrl || '',
            asset: assetInline,
            assetArr,
            resTeam: resTeam?.value || resTeam?.name || ''
          });
        }
      }catch(e){
        for(const k of slice) out.push({ key: k, error: String(e.message || e) });
      }
    }

    // Resolve nomes legiveis de asset (so para os que vieram sem nome inline).
    // Paraleliza, mas com cap de 6 concorrentes pra nao matar a Assets API.
    const pending = out.filter(o => !o.asset && Array.isArray(o.assetArr) && o.assetArr.length);
    const POOL = 6;
    let idx = 0;
    async function worker(){
      while(idx < pending.length){
        const obj = pending[idx++];
        try{
          const names = await Promise.all(obj.assetArr.map(a => getAssetName(a?.workspaceId, a?.objectId)));
          obj.asset = names.filter(Boolean).join(', ');
          if(!obj.asset) obj.asset = obj.assetArr.map(a => a?.objectId).filter(Boolean).join(', ');
        }catch(_){ /* deixa vazio */ }
      }
    }
    await Promise.all(Array.from({ length: Math.min(POOL, pending.length) }, worker));

    return out;
  }

  // Remove o usuario (accountId) da lista de watchers do ticket.
  // Idempotente: 204 ou 404 (nao era watcher) sao considerados sucesso.
  async function jiraUnwatchIssue(issueKey, accountId){
    if(!accountId) throw new Error('accountId obrigatorio para unwatch');
    const url = `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/watchers?accountId=${encodeURIComponent(accountId)}`;
    const r = await fetch(url, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    });
    if(!r.ok && r.status !== 404){
      const txt = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status} ao unwatch ${issueKey}: ${txt.slice(0, 200)}`);
    }
    return true;
  }

  // Lista watchers do ticket.
  async function jiraGetWatchers(issueKey){
    const url = `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/watchers`;
    const r = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    });
    const txt = await r.text().catch(() => '');
    if(!r.ok) throw new Error(`HTTP ${r.status} ao listar watchers: ${txt.slice(0, 200)}`);
    const data = JSON.parse(txt);
    return data.watchers || [];
  }

  // Unwatch robusto: tenta remover, confirma via GET, retry com delay caso o Jira
  // tenha re-adicionado por:
  //   (a) "auto-watch on comment" - configuracao pessoal que adiciona o autor de comentarios
  //   (b) workflow post-function - alguns workflows adicionam watchers conforme o time/status
  //
  // Estrategia:
  //   - delay inicial (initialDelayMs) pra dar tempo de post-functions server-side rodarem
  //   - N tentativas (maxAttempts) com delayMs entre cada
  //   - aviso scheduleLate: dispara um unwatch extra apos delayLateMs (fire-and-forget)
  //     pra cobrir post-functions que rodam segundos apos a transicao
  //
  // Devolve { ok, attempts, reAdded }.
  async function jiraUnwatchIssueRobust(issueKey, accountId, opts){
    opts = opts || {};
    const maxAttempts    = opts.maxAttempts    || 5;
    const delayMs        = opts.delayMs        || 1200;
    const initialDelayMs = opts.initialDelayMs ?? 1500;
    const log = (m) => console.log(`[jira-localidade][unwatch] ${issueKey} ${m}`);

    // Delay inicial: workflow post-functions normalmente rodam dentro de ~1-2s da transicao.
    // Esperar antes da 1a tentativa aumenta MUITO a taxa de sucesso na 1a.
    if(initialDelayMs > 0){
      log(`aguardando ${initialDelayMs}ms iniciais (post-functions server-side)...`);
      await new Promise(r => setTimeout(r, initialDelayMs));
    }

    let reAdded = false;
    for(let attempt = 1; attempt <= maxAttempts; attempt++){
      try{
        await jiraUnwatchIssue(issueKey, accountId);
      }catch(e){
        log(`tentativa ${attempt} falhou: ${e.message}`);
        if(attempt === maxAttempts) throw e;
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }

      // Confirma com GET
      let watchers;
      try{
        watchers = await jiraGetWatchers(issueKey);
      }catch(e){
        log(`falha ao validar via GET watchers (assumindo sucesso): ${e.message}`);
        scheduleLateUnwatch(issueKey, accountId);
        return { ok: true, attempts: attempt, reAdded };
      }

      const stillThere = (watchers || []).some(w => String(w.accountId) === String(accountId));
      if(!stillThere){
        log(`removido com sucesso (tentativa ${attempt}/${maxAttempts}).`);
        // Bonus: agenda uma checagem tardia (cobre post-functions lentas)
        const flushLate = scheduleLateUnwatch(issueKey, accountId);
        return { ok: true, attempts: attempt, reAdded, flushLate };
      }

      // Ainda esta na lista - aguarda e tenta de novo
      reAdded = true;
      log(`ainda como watcher apos tentativa ${attempt} - aguardando ${delayMs}ms e tentando de novo...`);
      if(attempt < maxAttempts) await new Promise(r => setTimeout(r, delayMs));
    }

    log(`falhou apos ${maxAttempts} tentativas - agendando ultima tentativa tardia (20s)...`);
    const flushLate = scheduleLateUnwatch(issueKey, accountId);
    return { ok: false, attempts: maxAttempts, reAdded: true, flushLate };
  }

  // Fire-and-forget: agenda 1 tentativa extra de unwatch ~20s depois.
  // Cobre post-functions/automations que adicionam watcher com delay maior que o nosso retry sincrono.
  // Roda silenciosamente em background (so loga no console).
  //
  // Retorna { flush: async () => ... } pra forcar execucao imediata
  // (com buffer pequeno pra dar tempo das post-functions rodarem). Usar antes
  // de location.reload() pra que a verificacao tardia nao seja morta pelo reload.
  function scheduleLateUnwatch(issueKey, accountId){
    const FLUSH_BUFFER_MS = 3500; // tempo extra antes do check no flush() (post-functions costumam rodar em 1-3s)
    const SCHED_DELAY_MS  = 20000;
    let executed = false;

    const doCheck = async () => {
      if(executed) return;
      executed = true;
      try{
        const watchers = await jiraGetWatchers(issueKey);
        const stillThere = (watchers || []).some(w => String(w.accountId) === String(accountId));
        if(!stillThere){
          console.log(`[jira-localidade][unwatch-late] ${issueKey} - ja nao e watcher, nada a fazer.`);
          return;
        }
        await jiraUnwatchIssue(issueKey, accountId);
        console.log(`[jira-localidade][unwatch-late] ${issueKey} - removido na verificacao tardia (post-function lenta).`);
      }catch(e){
        console.warn(`[jira-localidade][unwatch-late] ${issueKey} falhou (silencioso):`, e);
      }
    };

    const handle = setTimeout(doCheck, SCHED_DELAY_MS);

    return async function flush(){
      clearTimeout(handle);
      // Buffer curto antes do check pra dar chance das post-functions rodarem.
      // Sem isso, podemos ver o watcher ANTES do post-function readicionar.
      await new Promise(r => setTimeout(r, FLUSH_BUFFER_MS));
      await doCheck();
    };
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
