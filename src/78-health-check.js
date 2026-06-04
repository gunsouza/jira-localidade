  // =========================
  // HEALTH CHECK: valida configuracoes contra a instancia Jira atual.
  //
  // Roda em background quando o modal abre. Verifica:
  //   - Custom fields configurados existem (CF_ASSET, CF_RES_TEAM, Demanda, Service)
  //   - Project ISS existe
  //   - Issuetype "Tarefa" existe em ISS
  //
  // Resultado fica em sessionStorage por 30min pra nao re-rodar a cada abertura.
  // =========================

  const HEALTH_CACHE_KEY = 'ml_loc_health_v1';
  const HEALTH_CACHE_TTL_MS = 30 * 60 * 1000;

  // Lista todos os fields do Jira (paginacao nao se aplica - retorna lista completa).
  async function listAllFields(){
    const r = await fetch(`${location.origin}/rest/api/3/field`, {
      credentials:'same-origin', headers:{ Accept:'application/json' }
    });
    if(!r.ok) throw new Error(`HTTP ${r.status} listando campos`);
    return r.json();
  }

  // Verifica se um project existe via GET /rest/api/3/project/{key}.
  async function projectExists(key){
    if(!key) return false;
    try{
      const r = await fetch(`${location.origin}/rest/api/3/project/${encodeURIComponent(key)}`, {
        credentials:'same-origin', headers:{ Accept:'application/json' }
      });
      return r.ok;
    }catch(_){ return false; }
  }

  // Verifica se um issuetype existe num project (procura pelo name).
  async function issueTypeExists(projectKey, issuetypeName){
    if(!projectKey || !issuetypeName) return false;
    try{
      const r = await fetch(`${location.origin}/rest/api/3/project/${encodeURIComponent(projectKey)}`, {
        credentials:'same-origin', headers:{ Accept:'application/json' }
      });
      if(!r.ok) return false;
      const d = await r.json();
      return (d.issueTypes || []).some(t => t.name === issuetypeName);
    }catch(_){ return false; }
  }

  async function runHealthCheck(){
    const issues = [];
    const ok = [];

    // 1) Custom fields configurados
    let allFields = [];
    try{
      allFields = await listAllFields();
    }catch(e){
      issues.push({ severity:'error', msg:`Nao foi possivel listar campos do Jira: ${e.message || e}`, hint:'Sessao expirada? Recarregue a pagina.' });
    }
    const fieldIds = new Set(allFields.map(f => f.id));
    const fieldByCfId = (cf) => allFields.find(f => f.id === `customfield_${cf}`);

    const cfList = [
      { name:'IS Ubicacion (asset)',         cfId: CF_ASSET },
      { name:'Resolution Team',              cfId: CF_RES_TEAM },
      { name:'Demanda (criar tarefa ISS)',   cfId: ISS_TASK_DEMANDA_CF },
      { name:'Service (criar tarefa ISS)',   cfId: ISS_TASK_SERVICE_CF }
    ];
    for(const cf of cfList){
      const fid = `customfield_${cf.cfId}`;
      const meta = fieldByCfId(cf.cfId);
      if(!fieldIds.size){
        // ja reportamos erro de listAllFields; nao acumulamos
      } else if(!meta){
        issues.push({
          severity:'warn',
          msg:`Custom field "${cf.name}" (${fid}) NAO encontrado no Jira atual.`,
          hint:'Configuracoes -> Projetos & busca / Criar tarefa ISS -> ajuste o ID do customfield.'
        });
      } else {
        ok.push(`${cf.name} OK (${meta.name || fid})`);
      }
    }

    // 2) Project ISS
    const projOk = await projectExists(ISS_TASK_PROJECT);
    if(!projOk){
      issues.push({
        severity:'warn',
        msg:`Projeto "${ISS_TASK_PROJECT}" nao existe ou voce nao tem acesso.`,
        hint:'Configuracoes -> Criar tarefa ISS -> "Projeto ISS".'
      });
    } else {
      ok.push(`Projeto ${ISS_TASK_PROJECT} OK`);

      // 3) Issuetype Tarefa em ISS (so checa se project existe)
      const itOk = await issueTypeExists(ISS_TASK_PROJECT, ISS_TASK_ISSUETYPE);
      if(!itOk){
        issues.push({
          severity:'warn',
          msg:`Issuetype "${ISS_TASK_ISSUETYPE}" nao existe em ${ISS_TASK_PROJECT}.`,
          hint:'Configuracoes -> Criar tarefa ISS -> "Issuetype".'
        });
      } else {
        ok.push(`Issuetype ${ISS_TASK_ISSUETYPE} em ${ISS_TASK_PROJECT} OK`);
      }
    }

    return { issues, ok, checkedAt: Date.now() };
  }

  // Wrapper com cache em sessionStorage.
  async function runHealthCheckCached(){
    try{
      const raw = sessionStorage.getItem(HEALTH_CACHE_KEY);
      if(raw){
        const cached = JSON.parse(raw);
        if(cached?.checkedAt && (Date.now() - cached.checkedAt) < HEALTH_CACHE_TTL_MS){
          return cached;
        }
      }
    }catch(_){}
    const result = await runHealthCheck();
    try{ sessionStorage.setItem(HEALTH_CACHE_KEY, JSON.stringify(result)); }catch(_){}
    return result;
  }

  function clearHealthCache(){
    try{ sessionStorage.removeItem(HEALTH_CACHE_KEY); }catch(_){}
  }
