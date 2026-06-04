  // =========================
  // JIRA ASSETS — CONNECTED TICKETS
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

  // Busca o nome legivel ("label"/"name") de um objeto Asset por workspaceId+objectId.
  // Retorna string vazia se nao conseguir resolver (best-effort).
  async function getAssetName(workspaceId, objectId){
    if(!workspaceId || !objectId) return '';
    try{
      const url = `${location.origin}/gateway/api/jsm/assets/workspace/${encodeURIComponent(workspaceId)}/v1/object/${encodeURIComponent(objectId)}`;
      const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
      if(!r.ok) return '';
      const d = await r.json();
      return d?.label || d?.name || d?.objectKey || '';
    }catch(_){ return ''; }
  }
