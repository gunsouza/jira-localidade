  // =========================
  // CRIAR TAREFA ISS (chamado a partir do checkbox no Derive)
  //
  // Fluxo:
  //   1) GET /myself              -> accountId do responsavel
  //   2) GET issue (full)         -> description (ADF) + customfield Asset (raw)
  //   3) (opcional) descobre link type pelo inward "vinculad"
  //   4) POST /rest/api/3/issue   -> cria a Tarefa no projeto ISS
  //   5) POST /rest/api/3/issueLink -> liga "new IS_LINKED_BY currentTicket"
  //
  // Todos os valores fixos sao configuraveis via Configuracoes -> "Criar tarefa ISS".
  // =========================

  async function jiraGetMyself(){
    const r = await fetch(`${location.origin}/rest/api/3/myself`, {
      credentials:'same-origin', headers:{ Accept:'application/json' }
    });
    const txt = await r.text().catch(()=> '');
    if(!r.ok) throw new Error(`HTTP ${r.status} /myself: ${txt.slice(0,200)}`);
    return JSON.parse(txt);
  }

  async function getIssueFullForCopy(issueKey){
    // Pega description (ADF), priority (para manter), asset (raw) e anexos.
    const url = `${location.origin}/rest/api/3/issue/${issueKey}?fields=description,priority,attachment,customfield_${CF_ASSET}`;
    const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
    const txt = await r.text().catch(()=> '');
    if(!r.ok) throw new Error(`HTTP ${r.status} ao ler ticket origem: ${txt.slice(0,200)}`);
    return JSON.parse(txt);
  }

  // Le project e descobre os IDs (project ID e o ID do issuetype pelo nome).
  // A UI do Jira sempre manda IDs no payload, e o validador "matriz" exige IDs - nao aceita keys/names.
  async function getProjectAndIssueTypeIds(projectKey, issuetypeName){
    const r = await fetch(`${location.origin}/rest/api/3/project/${encodeURIComponent(projectKey)}`, {
      credentials:'same-origin', headers:{ Accept:'application/json' }
    });
    const txt = await r.text().catch(()=> '');
    if(!r.ok) throw new Error(`HTTP ${r.status} ao ler projeto ${projectKey}: ${txt.slice(0,200)}`);
    const d = JSON.parse(txt);
    const its = d?.issueTypes || [];
    const it = its.find(t => t.name === issuetypeName);
    if(!it) throw new Error(`Issue type "${issuetypeName}" nao existe em ${projectKey}. Vistos: ${its.map(t=>t.name).join(', ')}`);
    return { projectId: String(d.id), issuetypeId: String(it.id) };
  }

  // Le campos custom RAW de uma issue modelo (para herdar formato exato de Demanda/Service/etc).
  async function getIssueRawFields(issueKey, cfIds){
    const fieldsParam = cfIds.map(id => `customfield_${id}`).join(',');
    const url = `${location.origin}/rest/api/3/issue/${issueKey}?fields=${fieldsParam}`;
    const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
    const txt = await r.text().catch(()=> '');
    if(!r.ok) throw new Error(`HTTP ${r.status} ao ler issue modelo ${issueKey}: ${txt.slice(0,200)}`);
    const data = JSON.parse(txt);
    return data.fields || {};
  }

  // Le TODOS os campos da issue modelo (para copiar TODOS os customfields preenchidos).
  // Inclui expand=names para sabermos o nome humano e podermos filtrar campos como Sprint/Epic Link
  // que nao podem ser setados via REST direta.
  async function getIssueAllFields(issueKey){
    const url = `${location.origin}/rest/api/3/issue/${issueKey}?fields=*all&expand=names`;
    const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
    const txt = await r.text().catch(()=> '');
    if(!r.ok) throw new Error(`HTTP ${r.status} ao ler issue modelo ${issueKey} (full): ${txt.slice(0,200)}`);
    return JSON.parse(txt);
  }

  // Retorna o "schema" de campos disponiveis na tela de criacao de um project/issuetype.
  // Tenta a API nova (paginada) e cai na API legacy. Retorna { fieldKey: meta } ou null.
  async function getCreateMetaFields(projectKey, issuetypeName){
    const log = (msg, ...args) => console.log(`[jira-localidade][createmeta] ${msg}`, ...args);
    const warn = (msg, ...args) => console.warn(`[jira-localidade][createmeta] ${msg}`, ...args);

    // 1) Nova API com paginacao: lista os issuetypes do projeto (procura por nome).
    let issueTypeId = null;
    try{
      let startAt = 0;
      const pageSize = 50;
      while(true){
        const u = `${location.origin}/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes?startAt=${startAt}&maxResults=${pageSize}`;
        const r = await fetch(u, { credentials:'same-origin', headers:{ Accept:'application/json' }});
        if(!r.ok){ warn(`(novo) issuetypes HTTP ${r.status} em startAt=${startAt}`); break; }
        const d = await r.json();
        const list = d?.values || d?.issueTypes || [];
        log(`(novo) issuetypes pagina startAt=${startAt} -> ${list.length} itens (total=${d?.total ?? '?'}, isLast=${d?.isLast ?? '?'})`);
        const it = list.find(v => v.name === issuetypeName);
        if(it){ issueTypeId = it.id; log(`(novo) achou "${issuetypeName}" id=${it.id}`); break; }
        if(d?.isLast || list.length < pageSize) break;
        startAt += pageSize;
        if(startAt > 1000) break; // sanity
      }
    }catch(e){ warn('(novo) erro listando issuetypes:', e); }

    if(issueTypeId){
      try{
        const out = {};
        let startAt = 0;
        const pageSize = 100;
        while(true){
          const u = `${location.origin}/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes/${issueTypeId}?startAt=${startAt}&maxResults=${pageSize}`;
          const r = await fetch(u, { credentials:'same-origin', headers:{ Accept:'application/json' }});
          if(!r.ok){ warn(`(novo) fields HTTP ${r.status} em startAt=${startAt}`); break; }
          const d = await r.json();
          const list = d?.values || d?.fields || [];
          log(`(novo) fields pagina startAt=${startAt} -> ${list.length} itens (total=${d?.total ?? '?'}, isLast=${d?.isLast ?? '?'})`);
          for(const f of list){ if(f.fieldId) out[f.fieldId] = f; }
          if(d?.isLast || list.length < pageSize) break;
          startAt += pageSize;
          if(startAt > 5000) break;
        }
        if(Object.keys(out).length){
          log(`(novo) total ${Object.keys(out).length} campos para ${projectKey}/${issuetypeName}`);
          return out;
        }
        warn(`(novo) 0 campos retornados para issuetypeId=${issueTypeId}`);
      }catch(e){ warn('(novo) erro listando fields:', e); }
    }

    // 2) API legacy
    try{
      const url = `${location.origin}/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(projectKey)}&issuetypeNames=${encodeURIComponent(issuetypeName)}&expand=projects.issuetypes.fields`;
      const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
      if(!r.ok){ warn(`(legacy) HTTP ${r.status}`); return null; }
      const d = await r.json();
      const fields = ((d?.projects || [])[0]?.issuetypes || [])[0]?.fields || {};
      if(Object.keys(fields).length){
        log(`(legacy) total ${Object.keys(fields).length} campos`);
        return fields;
      }
      warn('(legacy) 0 campos. Raw:', d);
    }catch(e){ warn('(legacy) erro:', e); }

    return null;
  }

  // Helper: detecta valor "vazio na pratica" mesmo que tenha shape (ADF vazio, objeto sem keys etc.).
  function isEmptyForCopy(v){
    if(v == null) return true;
    if(Array.isArray(v)){
      if(!v.length) return true;
      return v.every(isEmptyForCopy);
    }
    if(typeof v === 'string') return v.trim() === '';
    if(typeof v === 'object'){
      if(isAdfDoc(v)){
        let text = '';
        const walk = (n) => {
          if(!n) return;
          if(Array.isArray(n)) return n.forEach(walk);
          if(typeof n === 'object'){
            if(n.type === 'text' && typeof n.text === 'string') text += n.text;
            if(n.content) walk(n.content);
          }
        };
        walk(v.content);
        return text.trim() === '';
      }
      if(!Object.keys(v).length) return true;
      // Objetos shape-only (so meta keys/values vazios)
      const meaningful = ['value','id','accountId','objectId','workspaceId','name','groupId','key'];
      const hasMeaningful = meaningful.some(k => v[k] != null && v[k] !== '');
      if(!hasMeaningful){
        // verifica se algum sub-valor tem conteudo
        return Object.values(v).every(isEmptyForCopy);
      }
    }
    return false;
  }

  // Customfields que tipicamente NAO podem ser copiados via API REST de create
  // (sao gerenciados por Jira/plugins e exigem chamadas especiais).
  const CF_NAME_SKIP_PATTERNS = [
    /\bsprint\b/i,
    /\bepic\s*link\b/i,
    /\bparent\s*link\b/i,
    /\brank\b/i,
    /\bflagged\b/i,
    /\bstart\s*date\b/i,
    /\bteam\b.*\bfield\b/i,
    /\brequest\s*type\b/i,
    /\bdevelopment\b/i,
    /\bissue\s*color\b/i,
    /^satisfaction/i,
    /^impacted services$/i,
    /^affected services$/i
  ];

  function shouldCopyCustomField(cfKey, cfName){
    if(!cfKey || !cfKey.startsWith('customfield_')) return false;
    if(!cfName) return true;
    return !CF_NAME_SKIP_PATTERNS.some(rx => rx.test(cfName));
  }

  // Detecta um documento ADF (Atlassian Document Format) usado em campos rich-text.
  function isAdfDoc(v){
    return v && typeof v === 'object' && v.type === 'doc' && Array.isArray(v.content);
  }

  function emptyAdfDoc(version){
    return { type: 'doc', version: version || 1, content: [{ type: 'paragraph' }] };
  }

  // Extrai TODO o texto util de um ADF, perdendo formato/elementos rich (mentions, panels, links, etc).
  // Usado para "achatar" a descricao quando o plugin custom rejeita ADF complexo.
  function adfToPlainText(adf){
    if(!adf) return '';
    const lines = [];
    let cur = '';
    const flushPara = () => { if(cur.trim()) lines.push(cur.trim()); cur = ''; };
    const walk = (n) => {
      if(!n) return;
      if(Array.isArray(n)) return n.forEach(walk);
      if(typeof n !== 'object') return;
      const t = n.type;
      if(t === 'text' && typeof n.text === 'string'){ cur += n.text; return; }
      if(t === 'hardBreak'){ cur += '\n'; return; }
      if(t === 'mention'){ cur += `@${n.attrs?.text || n.attrs?.displayName || n.attrs?.id || ''} `; return; }
      if(t === 'emoji'){ cur += (n.attrs?.shortName || n.attrs?.text || ''); return; }
      if(t === 'inlineCard' || t === 'blockCard'){ cur += (n.attrs?.url || ''); return; }
      if(t === 'paragraph' || t === 'heading' || t === 'blockquote' || t === 'panel' ||
         t === 'codeBlock'  || t === 'listItem' || t === 'taskItem'){
        if(n.content) walk(n.content);
        flushPara();
        return;
      }
      if(n.content) walk(n.content);
    };
    walk(adf.content || adf);
    flushPara();
    return lines.join('\n\n');
  }

  // Converte texto puro em um ADF simples (so paragraphs e textos). Bem aceito por validadores estritos.
  function plainTextToSimpleAdf(text){
    const t = String(text || '').trim();
    if(!t) return { version:1, type:'doc', content:[{ type:'paragraph' }]};
    const paras = t.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    return {
      version: 1,
      type: 'doc',
      content: paras.map(p => ({
        type: 'paragraph',
        content: [{ type: 'text', text: p }]
      }))
    };
  }

  const META_KEYS_TO_STRIP = new Set([
    'self', 'iconUrl', 'iconURI', 'avatarUrls', 'expand',
    'displayName', 'emailAddress', 'active', 'timeZone', 'accountType',
    'description', 'subtaskField'
  ]);

  // Sanitiza um valor RAW de customfield (vindo de GET) para uso em payload de criacao.
  // Funciona para: ADF rich-text, Asset/Insight, User, Group, Select/Multi/Cascading,
  // e tipos desconhecidos (limpa apenas metadados).
  function sanitizeCustomFieldValue(v){
    if(v == null) return v;
    if(Array.isArray(v)) return v.map(sanitizeCustomFieldValue);
    if(typeof v !== 'object') return v;

    // 1) ADF rich-text: preserva integral. Validadores customizados costumam
    //    exigir conteudo de verdade, nao apenas estrutura ADF valida. Usuario pode
    //    editar/limpar manualmente apos a criacao.
    if(isAdfDoc(v)){
      return v;
    }

    // 2) Asset / Insight object (IS Ubicacion etc.)
    if(v.workspaceId || v.objectId){
      const out = {};
      if(v.workspaceId) out.workspaceId = v.workspaceId;
      if(v.id)          out.id          = String(v.id);
      if(v.objectId)    out.objectId    = String(v.objectId);
      return out;
    }

    // 3) User picker (atlassian)
    if(v.accountId){
      return { accountId: v.accountId };
    }

    // 4) Group picker
    if(v.groupId){
      const out = {};
      if(v.name)    out.name    = v.name;
      out.groupId = v.groupId;
      return out;
    }

    // 5) Select / Multi-select / Cascading
    if(v.value !== undefined || v.child !== undefined || v.id !== undefined){
      const out = {};
      if(v.id !== undefined && v.id !== null)       out.id    = String(v.id);
      if(v.value !== undefined && v.value !== null) out.value = v.value;
      if(v.child)                                   out.child = sanitizeCustomFieldValue(v.child);
      return out;
    }

    // 6) Default: strip meta keys e recursa
    const out = {};
    for(const [k, val] of Object.entries(v)){
      if(META_KEYS_TO_STRIP.has(k)) continue;
      const cleaned = sanitizeCustomFieldValue(val);
      if(cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }

  // Alias para nao quebrar chamadas existentes
  const sanitizeSelectValue = sanitizeCustomFieldValue;

  // Copia anexos do srcKey para o dstKey. Best-effort: anota erros e continua.
  async function copyAttachmentsBetweenIssues(srcKey, attachments, dstKey){
    if(!Array.isArray(attachments) || !attachments.length) return { copied:0, total:0, errors:[] };
    let copied = 0;
    const errors = [];
    for(const att of attachments){
      const name = att?.filename || 'attachment';
      try{
        const fileResp = await fetch(att.content, { credentials:'same-origin' });
        if(!fileResp.ok) throw new Error(`HTTP ${fileResp.status} no download`);
        const blob = await fileResp.blob();

        const fd = new FormData();
        fd.append('file', blob, name);

        const up = await fetch(`${location.origin}/rest/api/3/issue/${dstKey}/attachments`, {
          method:'POST',
          credentials:'same-origin',
          headers:{ 'X-Atlassian-Token':'no-check', 'Accept':'application/json' },
          body: fd
        });
        if(!up.ok){
          const t = await up.text().catch(()=>'');
          throw new Error(`HTTP ${up.status} no upload: ${t.slice(0,200)}`);
        }
        copied++;
      }catch(e){
        console.warn(`[jira-localidade] anexo "${name}" nao copiado:`, e);
        errors.push(`${name}: ${e.message || e}`);
      }
    }
    return { copied, total: attachments.length, errors };
  }

  async function listJiraLinkTypes(){
    const r = await fetch(`${location.origin}/rest/api/3/issueLinkType`, {
      credentials:'same-origin', headers:{ Accept:'application/json' }
    });
    const txt = await r.text().catch(()=> '');
    if(!r.ok) throw new Error(`HTTP ${r.status} issueLinkType: ${txt.slice(0,200)}`);
    return JSON.parse(txt);
  }

  // Resolve o nome do link type a usar. Prefere o configurado; senao auto-descobre
  // pelo inward label que contem "vinculad" (cobre "e vinculado pelo", "vinculado por", etc).
  async function resolveIssTaskLinkTypeName(){
    if(ISS_TASK_LINK_TYPE_NAME) return ISS_TASK_LINK_TYPE_NAME;
    const data = await listJiraLinkTypes();
    const types = data.issueLinkTypes || [];
    const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const byInward = types.find(t => norm(t.inward).includes('vinculad'));
    if(byInward) return byInward.name;
    const byOutward = types.find(t => norm(t.outward).includes('vincul'));
    if(byOutward) return byOutward.name;
    throw new Error('Nao foi possivel auto-descobrir o tipo de link "vinculado pelo". Configure em Configuracoes -> "Criar tarefa ISS" -> "Nome do link type".');
  }

  async function jiraCreateIssue(payload){
    // IMPORTANTE: usar os mesmos query params da UI do Jira.
    // - updateHistory=true: registra no recent
    // - applyDefaultValues=false: NAO aplica defaults do screen config (evita validadores
    //   custom como o "matriz" que retornam "All fields are required to create the task").
    const url = `${location.origin}/rest/api/3/issue?updateHistory=true&applyDefaultValues=false`;
    const bodyStr = JSON.stringify(payload);
    const r = await fetch(url, {
      method:'POST',
      credentials:'same-origin',
      headers:{ 'Accept':'application/json', 'Content-Type':'application/json' },
      body: bodyStr
    });
    const txt = await r.text().catch(()=> '');
    if(!r.ok){
      // Diagnostico forte: salva payload e response em window e tenta copiar pro clipboard.
      try{
        window.__JL_LAST_PAYLOAD__  = payload;
        window.__JL_LAST_RESPONSE__ = txt;
        if(navigator?.clipboard?.writeText){
          await navigator.clipboard.writeText(bodyStr).catch(()=>{});
        }
      }catch(_){}
      console.error('[jira-localidade] CREATE FALHOU. Payload completo abaixo (copiado para o clipboard):');
      console.error(bodyStr);
      console.error('[jira-localidade] RESPONSE:', txt);
      const err = new Error(`HTTP ${r.status} ao criar issue: ${txt.slice(0,400)}`);
      err.payload  = payload;
      err.response = txt;
      throw err;
    }
    return JSON.parse(txt);
  }

  // Atualiza apenas a description de uma issue ja criada. Validadores custom
  // tipicamente nao rodam em PUT (so no create), entao podemos "enriquecer" a descricao depois.
  async function jiraUpdateDescription(issueKey, adfDoc){
    const url = `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}`;
    const r = await fetch(url, {
      method:'PUT',
      credentials:'same-origin',
      headers:{ 'Accept':'application/json', 'Content-Type':'application/json' },
      body: JSON.stringify({ fields: { description: adfDoc } })
    });
    if(!r.ok){
      const t = await r.text().catch(()=>'');
      throw new Error(`HTTP ${r.status} ao atualizar description: ${t.slice(0,200)}`);
    }
    return true;
  }

  // Adiciona um comentario a uma issue. Usado como ultimo recurso para preservar a description original.
  // opts.internal=true marca o comentario como observacao interna (sd.public.comment).
  async function jiraAddComment(issueKey, adfDoc, opts){
    const url = `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`;
    const body = { body: adfDoc };
    if(opts && opts.internal){
      body.properties = [{ key: 'sd.public.comment', value: { internal: true } }];
    }
    const r = await fetch(url, {
      method:'POST',
      credentials:'same-origin',
      headers:{ 'Accept':'application/json', 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
    if(!r.ok){
      const t = await r.text().catch(()=>'');
      throw new Error(`HTTP ${r.status} ao adicionar comment: ${t.slice(0,200)}`);
    }
    return true;
  }

  // Pagina todos os comentarios de uma issue. Endpoint: /rest/api/3/issue/{key}/comment
  // Retorna array de { id, author, body (ADF), created, jsdPublic }.
  // Ordena cronologicamente (mais antigo primeiro) pra preservar a leitura natural.
  async function getAllIssueComments(issueKey){
    const all = [];
    const PAGE = 100;
    let startAt = 0;
    // Salvaguarda: maximo 20 paginas (= 2000 comments) pra nao travar
    for(let page = 0; page < 20; page++){
      const url = `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?startAt=${startAt}&maxResults=${PAGE}&orderBy=created`;
      const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
      const txt = await r.text().catch(()=>'');
      if(!r.ok) throw new Error(`HTTP ${r.status} ao ler comments: ${txt.slice(0,200)}`);
      const j = JSON.parse(txt);
      const arr = Array.isArray(j.comments) ? j.comments : [];
      all.push(...arr);
      const total = Number(j.total) || all.length;
      startAt += arr.length;
      if(arr.length < PAGE || startAt >= total) break;
    }
    return all;
  }

  // Formata data ISO para "DD/MM/YYYY HH:MM" no fuso local.
  function _formatCommentDate(iso){
    try{
      const d = new Date(iso);
      if(isNaN(d.getTime())) return String(iso || '');
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const yyyy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2,'0');
      const mi = String(d.getMinutes()).padStart(2,'0');
      return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
    }catch{ return String(iso || ''); }
  }

  // Monta UM documento ADF que contem o digest de todos os comentarios.
  // Formato (compacto e legivel):
  //
  //   Heading h3: "Comentarios herdados de IS-XXX (N total)"
  //   Para cada comment:
  //     Heading h4: "[i] @autor - DD/MM/YYYY HH:MM [interno/publico]"
  //     Parágrafo: <texto extraido do ADF original>
  //     Rule (separador)
  //   Heading h4 final: "Fim dos comentarios herdados."
  function buildCommentsDigestAdf(srcKey, comments){
    const content = [];
    const headerText = `Comentarios herdados de ${srcKey} (${comments.length} ${comments.length === 1 ? 'comentario' : 'comentarios'})`;
    content.push({
      type: 'heading', attrs: { level: 3 },
      content: [{ type: 'text', text: headerText }]
    });

    if(!comments.length){
      content.push({ type: 'paragraph', content: [{ type: 'text', text: '(nenhum comentario no ticket origem)' }] });
      return { type: 'doc', version: 1, content };
    }

    comments.forEach((c, idx) => {
      const author = c?.author?.displayName || c?.author?.emailAddress || 'desconhecido';
      const when = _formatCommentDate(c?.created);
      // jsdPublic: true = publico (visivel cliente); false = interno
      const visibility = (c?.jsdPublic === false) ? 'interno' : 'publico';
      const headerLine = `[${idx + 1}] ${author} - ${when} [${visibility}]`;

      content.push({
        type: 'heading', attrs: { level: 4 },
        content: [{ type: 'text', text: headerLine }]
      });

      const bodyText = descriptionToText(c?.body) || '(sem conteudo de texto)';
      // textToAdfParagraphs ja retorna { type: 'doc', content: [...] } - extraimos content
      const bodyAdf = textToAdfParagraphs(bodyText);
      const blocks = Array.isArray(bodyAdf?.content) ? bodyAdf.content : [];
      blocks.forEach(b => content.push(b));

      content.push({ type: 'rule' });
    });

    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Fim dos comentarios herdados.' }]
    });

    return { type: 'doc', version: 1, content };
  }

  // Coleta os comentarios do source e os adiciona como UM unico comentario INTERNO
  // no destino. Best-effort: retorna o relatorio sem lancar excecao em caso de falha.
  async function copyCommentsAsDigest(srcKey, dstKey){
    const report = { copied: 0, total: 0, mode: 'digest', error: null };
    try{
      const comments = await getAllIssueComments(srcKey);
      report.total = comments.length;
      if(!comments.length){
        report.mode = 'skipped-empty';
        return report;
      }
      const adf = buildCommentsDigestAdf(srcKey, comments);
      await jiraAddComment(dstKey, adf, { internal: true });
      report.copied = comments.length;
      return report;
    }catch(e){
      report.error = String(e.message || e);
      return report;
    }
  }

  async function jiraCreateLink(typeName, inwardKey, outwardKey){
    const r = await fetch(`${location.origin}/rest/api/3/issueLink`, {
      method:'POST',
      credentials:'same-origin',
      headers:{ 'Accept':'application/json', 'Content-Type':'application/json' },
      body: JSON.stringify({
        type: { name: typeName },
        inwardIssue:  { key: inwardKey },
        outwardIssue: { key: outwardKey }
      })
    });
    const txt = await r.text().catch(()=> '');
    if(!r.ok) throw new Error(`HTTP ${r.status} ao linkar: ${txt.slice(0,300)}`);
    return true;
  }

  // Orquestra a criacao completa da tarefa ISS a partir de um ticket de origem.
  // Retorna { newKey, linkType, attachmentsReport } em caso de sucesso. Lanca em caso de erro.
  // onProgress(stage:string) opcional para feedback de UI.
  // Resolve qual configuracao usar pra criar a tarefa ISS, baseado nas regras Confluence.
  // Cada regra pode definir:
  //   - issTemplate: 'ISS-XXXX' (template-based: copia Demanda, Service, ResTeam do ticket)
  //   - issService:  'Nome do Service' (value-based: usa essa string direto, mais simples)
  //   - issDemanda:  'Nome da Demanda' (opcional, default = ISS_TASK_DEMANDA_VALUE)
  //   - issResolutionTeam: 'IS-SHIP-...' (opcional, default = ISS_TASK_RESOLUTION_TEAM)
  //
  // Primeira regra que matchar E tiver alguma config ISS vence. Se nenhuma matchar,
  // PERGUNTA pro usuario qual Service usar (lista os Services conhecidos das regras).
  //
  // Retorna: { templateKey, overrides: { service?, demanda?, resTeam? }, source, rule }
  async function _resolveEffectiveIssConfig(sourceIssueKey){
    try{
      const rules = Array.isArray(CONFLUENCE_RULES) ? CONFLUENCE_RULES : [];
      const relevantRules = rules.filter(r => r && (r.issTemplate || r.issService || r.issDemanda || r.issResolutionTeam));
      if(!relevantRules.length){
        return { templateKey: ISS_TASK_MODEL_ISSUE, overrides: {}, source: 'default', rule: null };
      }
      const issueData = await _confGetIssueData(sourceIssueKey);
      if(!issueData){
        console.log(`[jira-localidade][iss-config] sem dados de ${sourceIssueKey}, usando default`);
        return { templateKey: ISS_TASK_MODEL_ISSUE, overrides: {}, source: 'default-fallback', rule: null };
      }
      for(const r of relevantRules){
        if(_confRuleMatches(r, issueData, false)){
          const overrides = {};
          if(r.issService) overrides.service = String(r.issService).trim();
          if(r.issDemanda) overrides.demanda = String(r.issDemanda).trim();
          if(r.issResolutionTeam) overrides.resTeam = String(r.issResolutionTeam).trim();
          // Se a regra tem issTemplate, usa template-based (mais robusto).
          // Senao, usa value-based (e ignora template default tambem -- o overrides
          // ja contem o Service especifico dessa categoria).
          const templateKey = r.issTemplate ? r.issTemplate : null;
          console.log(`[jira-localidade][iss-config] match "${r.label}" -> ${templateKey ? `template=${templateKey}` : `service="${overrides.service || '?'}"`}`);
          return { templateKey, overrides, source: 'rule', rule: r };
        }
      }
      // Nenhuma regra casou. Pergunta ao usuario qual Service usar.
      console.log(`[jira-localidade][iss-config] nenhuma regra casou em ${sourceIssueKey}, perguntando ao usuario`);
      const chosen = await _askUserForIssService(sourceIssueKey, relevantRules);
      if(chosen === null){
        throw new Error('Criacao de ISS cancelada pelo usuario.');
      }
      return {
        templateKey: null, // sempre value-based quando vem do prompt (mais simples)
        overrides: { service: chosen },
        source: 'user-prompt',
        rule: null
      };
    }catch(e){
      // Erros de cancelamento devem propagar; outros caem no default
      if(String(e.message || '').includes('cancelada pelo usuario')) throw e;
      console.warn('[jira-localidade][iss-config] erro resolvendo config, usando default:', e);
      return { templateKey: ISS_TASK_MODEL_ISSUE, overrides: {}, source: 'default-error', rule: null };
    }
  }

  // Modal sincrono (Promise) pedindo ao usuario qual Service usar quando o plugin
  // nao consegue identificar a categoria automaticamente. Lista os Services unicos
  // que aparecem nas regras CONFLUENCE_RULES como sugestao, mas tambem permite digitar.
  function _askUserForIssService(sourceIssueKey, rules){
    return new Promise((resolve) => {
      // Coleta Services unicos das regras pra sugerir
      const knownServices = [...new Set(
        rules.map(r => r.issService).filter(Boolean)
      )].sort();

      document.getElementById('ml_iss_svc_overlay')?.remove();
      document.getElementById('ml_iss_svc_modal')?.remove();

      const overlay = document.createElement('div');
      overlay.id = 'ml_iss_svc_overlay';
      overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483640;backdrop-filter:blur(2px);`;

      const modal = document.createElement('div');
      modal.id = 'ml_iss_svc_modal';
      modal.style.cssText = `
        position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        z-index:2147483641;
        background: var(--ml-bg, #161a26); color: var(--ml-text, #e6e9ef);
        border:1px solid var(--ml-border, #2a2f40); border-radius:12px;
        padding:22px; min-width:420px; max-width:520px;
        box-shadow: 0 24px 50px rgba(0,0,0,.6);
        font: 13px var(--ml-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      `;

      const optionsHtml = knownServices.length
        ? knownServices.map(s => `
          <button class="ml-svc-opt" data-svc="${s.replace(/"/g, '&quot;')}" style="
            display:block; width:100%; text-align:left;
            background: rgba(255,255,255,.04); color: var(--ml-text, #e6e9ef);
            border: 1px solid var(--ml-border, #2a2f40);
            padding: 10px 14px; border-radius: 8px; margin-bottom: 6px;
            cursor: pointer; font: 600 13px var(--ml-font);
            transition: background .15s, border-color .15s;
          " onmouseover="this.style.background='rgba(79,140,255,.18)';this.style.borderColor='#4f8cff';"
             onmouseout="this.style.background='rgba(255,255,255,.04)';this.style.borderColor='var(--ml-border, #2a2f40)';">
            ${s}
          </button>
        `).join('')
        : '<div style="color:var(--ml-text-dim);">Nenhum Service conhecido nas regras.</div>';

      modal.innerHTML = `
        <div style="margin-bottom:14px;">
          <div style="font-size:15px;font-weight:700;margin-bottom:4px;">Categoria nao identificada automaticamente</div>
          <div style="color:var(--ml-text-mut,#a8aebd);font-size:12.5px;">
            Nao consegui identificar a categoria SE do ticket <b>${sourceIssueKey}</b> baseado nas regras configuradas.
            Qual <b>Service</b> usar na ISS?
          </div>
        </div>

        <div style="margin-bottom:14px;">${optionsHtml}</div>

        <div style="margin-bottom:14px;">
          <label style="display:block; font-size:11px; color:var(--ml-text-mut); margin-bottom:4px; text-transform:uppercase; letter-spacing:.5px;">
            Ou digite outro Service:
          </label>
          <input type="text" id="ml_svc_custom" placeholder="Ex: CCTV, Control Acceso, ..." style="
            width:100%; padding:8px 12px;
            background: rgba(255,255,255,.05); color: var(--ml-text);
            border: 1px solid var(--ml-border, #2a2f40); border-radius:6px;
            font: 13px var(--ml-font);
          " />
        </div>

        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button id="ml_svc_cancel" style="
            background: transparent; color: var(--ml-text-mut);
            border: 1px solid var(--ml-border, #2a2f40);
            padding: 8px 14px; border-radius: 6px;
            font: 500 12px var(--ml-font); cursor: pointer;
          ">Cancelar</button>
          <button id="ml_svc_confirm" style="
            background: linear-gradient(180deg, #4f8cff, #2c5fc7);
            color: #fff; border: 1px solid #2c5fc7;
            padding: 8px 14px; border-radius: 6px;
            font: 600 12px var(--ml-font); cursor: pointer;
          ">Usar Service digitado</button>
        </div>
      `;

      document.body.appendChild(overlay);
      document.body.appendChild(modal);

      const cleanup = () => { modal.remove(); overlay.remove(); };

      // Cliques nos botoes de sugestao = escolheu direto
      modal.querySelectorAll('.ml-svc-opt').forEach(b => {
        b.addEventListener('click', () => {
          const svc = b.getAttribute('data-svc');
          cleanup();
          resolve(svc);
        });
      });

      modal.querySelector('#ml_svc_confirm').addEventListener('click', () => {
        const v = String(modal.querySelector('#ml_svc_custom').value || '').trim();
        if(!v){
          alert('Digite o nome do Service ou clique numa das opcoes acima.');
          return;
        }
        cleanup();
        resolve(v);
      });

      modal.querySelector('#ml_svc_cancel').addEventListener('click', () => {
        cleanup();
        resolve(null); // cancelado
      });

      overlay.addEventListener('click', () => {
        cleanup();
        resolve(null);
      });

      // Foco no input pra digitar direto
      setTimeout(() => modal.querySelector('#ml_svc_custom')?.focus(), 50);
    });
  }

  async function createIssTaskFromIssue(sourceIssueKey, onProgress){
    const progress = typeof onProgress === 'function' ? onProgress : () => {};

    // Decide template/overrides baseados em regras Confluence (mapeamento por categoria SE).
    progress('Avaliando qual configuracao ISS usar para este chamado...');
    const tmpl = await _resolveEffectiveIssConfig(sourceIssueKey);
    const effectiveTemplate = tmpl.templateKey;
    const ruleOverrides = tmpl.overrides || {};

    progress(`Lendo ticket origem, modelo (${effectiveTemplate || '(value-based)'}) e schema de criacao...`);
    const baseTasks = [
      jiraGetMyself(),
      getIssueFullForCopy(sourceIssueKey),
      resolveIssTaskLinkTypeName(),
      getProjectAndIssueTypeIds(ISS_TASK_PROJECT, ISS_TASK_ISSUETYPE)
    ];
    if(effectiveTemplate){
      // So precisamos das IDs/values exatas de Demanda, Service e ResTeam da modelo.
      baseTasks.push(getIssueRawFields(effectiveTemplate, [ISS_TASK_DEMANDA_CF, ISS_TASK_SERVICE_CF, CF_RES_TEAM]));
    }
    const [me, source, linkTypeName, projInfo, modelFields] = await Promise.all(baseTasks);

    const assigneeAccountId = me?.accountId;
    if(!assigneeAccountId) throw new Error('Nao foi possivel identificar o usuario atual (/myself).');

    const description = source?.fields?.description || null;
    const sourceAttachments = source?.fields?.attachment || [];

    // Asset: descobrimos que o formato completo {workspaceId, id, objectId} eh aceito.
    const rawAsset = source?.fields?.[`customfield_${CF_ASSET}`];
    const assetArr = Array.isArray(rawAsset) ? rawAsset : (rawAsset ? [rawAsset] : []);
    if(!assetArr.length) throw new Error(`Ticket ${sourceIssueKey} nao tem "IS Ubicacion" preenchido.`);
    const assetForCreate = assetArr.map(a => {
      const out = {};
      if(a.workspaceId) out.workspaceId = a.workspaceId;
      if(a.id) out.id = a.id;
      if(a.objectId) out.objectId = a.objectId;
      return out;
    });

    const summary = String(ISS_TASK_SUMMARY_TEMPLATE).replace(/\{key\}/g, sourceIssueKey);

    // Resolve Demanda/Service/ResTeam. Preferimos os RAW da modelo (preserva ID, value
    // e estrutura array vs single - critico pro Service que e array em algumas Jiras).
    let demandaVal, serviceVal, resTeamVal;
    if(modelFields){
      const cfD = modelFields[`customfield_${ISS_TASK_DEMANDA_CF}`];
      const cfS = modelFields[`customfield_${ISS_TASK_SERVICE_CF}`];
      const cfR = modelFields[`customfield_${CF_RES_TEAM}`];
      if(!cfD) throw new Error(`Issue modelo ${effectiveTemplate} nao tem Demanda preenchida.`);
      if(!cfS) throw new Error(`Issue modelo ${effectiveTemplate} nao tem Service preenchida.`);
      if(!cfR) throw new Error(`Issue modelo ${effectiveTemplate} nao tem Resolution Team preenchida.`);
      demandaVal = sanitizeCustomFieldValue(cfD);
      serviceVal = sanitizeCustomFieldValue(cfS);
      resTeamVal = sanitizeCustomFieldValue(cfR);
    } else {
      // Value-based: sem ticket-modelo, usa strings diretamente. Pode falhar em Jiras
      // com validadores customizados. Overrides vindos das regras Confluence tem
      // prioridade sobre os defaults globais.
      const demandaValue = ruleOverrides.demanda || ISS_TASK_DEMANDA_VALUE;
      const serviceValue = ruleOverrides.service || ISS_TASK_SERVICE_VALUE;
      const resTeamValue = ruleOverrides.resTeam || ISS_TASK_RESOLUTION_TEAM;
      demandaVal = { value: demandaValue };
      serviceVal = [{ value: serviceValue }];
      resTeamVal = { value: resTeamValue };
    }

    // Monta payload MINIMAL no formato exato que a UI do Jira envia (capturado via debug).
    // Diferencas chave que descobrimos olhando o payload + URL da UI:
    //   - project por ID, nao key
    //   - issuetype por ID, nao name
    //   - assignee por {id}, igual a UI (o accountId tambem funciona, mas seguimos igual)
    //   - "update": {} (a UI sempre envia)
    //   - "externalToken" randomico (a UI envia para evitar duplo-submit)
    //   - SEM copiar customfields fantasma
    //   - URL com ?updateHistory=true&applyDefaultValues=false (ver jiraCreateIssue)
    const fieldsPayload = {
      project: { id: projInfo.projectId },
      issuetype: { id: projInfo.issuetypeId },
      summary,
      assignee: { id: assigneeAccountId },
      [`customfield_${CF_ASSET}`]: assetForCreate,
      [`customfield_${ISS_TASK_DEMANDA_CF}`]: demandaVal,
      [`customfield_${ISS_TASK_SERVICE_CF}`]: serviceVal,
      [`customfield_${CF_RES_TEAM}`]: resTeamVal
    };
    if(description) fieldsPayload.description = description;

    // Prioridade: copia da origem (usuario pediu "Prioridade nao mudamos"). Mantemos
    // a estrutura completa que a UI envia: {id, name, iconUrl} - alguns plugins olham name.
    const sourcePriority = source?.fields?.priority;
    if(sourcePriority && sourcePriority.id){
      const p = { id: String(sourcePriority.id) };
      if(sourcePriority.name)    p.name    = sourcePriority.name;
      if(sourcePriority.iconUrl) p.iconUrl = sourcePriority.iconUrl;
      fieldsPayload.priority = p;
    }

    const payload = {
      fields: fieldsPayload,
      update: {},
      externalToken: String(Math.random())
    };

    console.groupCollapsed(`[jira-localidade] Criando ISS task (de ${sourceIssueKey})`);
    console.log(`project=${ISS_TASK_PROJECT} (id=${projInfo.projectId}), issuetype=${ISS_TASK_ISSUETYPE} (id=${projInfo.issuetypeId})`);
    console.log(`modelo: ${effectiveTemplate || '(sem modelo, fallback por value)'} [origem: ${tmpl.source}${tmpl.rule ? ` "${tmpl.rule.label}"` : ''}]`);
    console.log('payload:', JSON.parse(JSON.stringify(payload)));
    console.groupEnd();

    progress('Criando tarefa ISS...');

    // Helpers para construir variantes da DESCRIPTION (asset esta OK).
    const titleOnlyAdf = { version:1, type:'doc', content:[{ type:'paragraph', content:[{ type:'text', text: summary }]}]};

    // Descricao "achatada": pega texto do ADF original e gera ADF simples (so paragraphs).
    // Plugins custom tipicamente aceitam isso (sem mentions, panels, links rich, etc).
    let plainDescAdf = null;
    if(description){
      const txt = adfToPlainText(description);
      if(txt && txt.trim()) plainDescAdf = plainTextToSimpleAdf(txt);
    }

    const buildFields = (descVal) => {
      const f = {
        project:   fieldsPayload.project,
        issuetype: fieldsPayload.issuetype,
        summary,
        assignee:  { id: assigneeAccountId },
        [`customfield_${CF_ASSET}`]:            assetForCreate,
        [`customfield_${ISS_TASK_DEMANDA_CF}`]: demandaVal,
        [`customfield_${ISS_TASK_SERVICE_CF}`]: serviceVal,
        [`customfield_${CF_RES_TEAM}`]:         resTeamVal
      };
      if(descVal) f.description = descVal;
      if(fieldsPayload.priority) f.priority = fieldsPayload.priority;
      return f;
    };
    const buildPayload = (descVal) => ({
      fields: buildFields(descVal),
      update: {},
      externalToken: String(Math.random())
    });

    // Como descobrimos que o plugin custom dropa silenciosamente description rica,
    // criamos direto com description "so titulo" (rapida, sempre passa) e enriquecemos
    // a descricao via PUT logo depois. Mantemos as outras como fallback POR SE acaso
    // o plugin um dia parar de bloquear (= autocura).
    const attempts = [];
    attempts.push({ label: 'description so titulo (rapido)',                    payload: buildPayload(titleOnlyAdf) });
    if(plainDescAdf) attempts.push({ label: 'description em texto puro',         payload: buildPayload(plainDescAdf) });
    if(description)  attempts.push({ label: 'description original (ADF rico)',  payload: buildPayload(description) });

    let created = null;
    let usedVariant = null;
    let lastErr = null;
    for(const at of attempts){
      progress(`Criando tarefa ISS (tentando "${at.label}")...`);
      try{
        console.log(`[jira-localidade] tentativa: ${at.label}`);
        created = await jiraCreateIssue(at.payload);
        usedVariant = at.label;
        break;
      }catch(e){
        const isPluginErr = /All fields are required|matriz/i.test(String(e.response || e.message || ''));
        lastErr = e;
        if(!isPluginErr) throw e;
        console.warn(`[jira-localidade] tentativa "${at.label}" rejeitada pelo plugin. Tentando proxima...`);
      }
    }
    if(!created) throw lastErr || new Error('Todas as tentativas falharam.');

    if(usedVariant && usedVariant !== attempts[0].label){
      console.warn(`[jira-localidade] SUCESSO usando variante: "${usedVariant}". Tentativas mais completas falharam.`);
    } else {
      console.log('[jira-localidade] SUCESSO no payload completo.');
    }

    const newKey = created?.key;
    if(!newKey) throw new Error('Issue criada mas resposta sem "key".');
    createIssTaskFromIssue.__lastVariantUsed = usedVariant;

    progress(`Vinculando ${newKey} ao ${sourceIssueKey}...`);
    await jiraCreateLink(linkTypeName, newKey, sourceIssueKey);

    // POS-CRIACAO: sempre re-aplicar a descricao via PUT, mesmo quando o create
    // retornou 201 com a description "rica". Motivo: o plugin custom pode aceitar
    // o POST (status 201) mas dropar SILENCIOSAMENTE o campo description, salvando
    // apenas o summary. Como validadores custom tipicamente so rodam em CREATE,
    // um PUT subsequente costuma persistir a descricao corretamente.
    //
    // Cascata: tenta ADF original -> texto puro (ADF simples). Ultimo recurso: comentario.
    let descReport = { method: 'skipped', detail: 'ticket origem sem descricao' };
    if(description){
      const tryVariants = [
        { label: 'PUT description (ADF original)', adf: description },
        plainDescAdf && { label: 'PUT description (texto puro)', adf: plainDescAdf }
      ].filter(Boolean);

      let putOk = false;
      for(const v of tryVariants){
        progress(`Garantindo descricao em ${newKey}: ${v.label}...`);
        try{
          console.log(`[jira-localidade] ${v.label}`);
          await jiraUpdateDescription(newKey, v.adf);
          descReport = { method: 'update-after-create', detail: v.label };
          putOk = true;
          break;
        }catch(e){
          console.warn(`[jira-localidade] ${v.label} falhou: ${e.message || e}`);
        }
      }

      if(!putOk){
        // Ultimo recurso: adiciona descricao como comentario (validador nao roda em comments).
        progress(`Adicionando descricao original como comentario em ${newKey}...`);
        try{
          const commentBody = {
            version:1, type:'doc',
            content: [
              { type:'paragraph', content:[{ type:'text', text: `Descrição original copiada de ${sourceIssueKey}:`, marks:[{ type:'strong' }]}]},
              ...((description?.content) || plainDescAdf?.content || [])
            ]
          };
          await jiraAddComment(newKey, commentBody);
          descReport = { method: 'comment-fallback', detail: 'description original colocada como comentario' };
        }catch(e){
          console.warn(`[jira-localidade] criar comment com descricao falhou: ${e.message || e}`);
          descReport = { method: 'failed', detail: 'description nao foi copiada (nem update, nem comment funcionaram)' };
        }
      }
    }
    createIssTaskFromIssue.__lastDescReport = descReport;

    let attachmentsReport = { copied: 0, total: 0, errors: [], skipped: true };
    if(ISS_TASK_COPY_ATTACHMENTS && sourceAttachments.length){
      progress(`Copiando ${sourceAttachments.length} anexo(s) para ${newKey}...`);
      try{
        attachmentsReport = await copyAttachmentsBetweenIssues(sourceIssueKey, sourceAttachments, newKey);
        attachmentsReport.skipped = false;
      }catch(e){
        attachmentsReport = { copied: 0, total: sourceAttachments.length, errors: [String(e.message || e)], skipped: false };
      }
    } else if(ISS_TASK_COPY_ATTACHMENTS){
      attachmentsReport.skipped = false;
    }

    // Copia comentarios como digest (1 comment interno consolidado).
    // Feito DEPOIS dos anexos pra eles ficarem na nova issue antes do digest aparecer
    // no historico - assim quem ler ja ve "tem anexo + tem o digest contextualizando".
    let commentsReport = { copied: 0, total: 0, mode: 'skipped-disabled', error: null };
    if(ISS_TASK_COPY_COMMENTS){
      progress('Copiando comentarios do ticket origem como digest...');
      commentsReport = await copyCommentsAsDigest(sourceIssueKey, newKey);
    }

    return {
      newKey,
      linkType: linkTypeName,
      attachmentsReport,
      commentsReport,
      descReport,
      template: { key: effectiveTemplate, source: tmpl.source, ruleLabel: tmpl.rule?.label || null }
    };
  }

  function shouldOfferIssTask(teamValue){
    if(!ISS_TASK_TRIGGER_TEAMS.length) return false;
    if(!teamValue) return false;
    const t = String(teamValue).trim();
    return ISS_TASK_TRIGGER_TEAMS.some(name => String(name).trim() === t);
  }
