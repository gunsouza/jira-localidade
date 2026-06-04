  // =========================
  // QUEUE BATCH ACTIONS — Gerenciador: derivar/criar ISS em lote em /issues e /queues
  //
  // UX:
  //   - Botao "Lote" aparece quando voce esta numa pagina /issues?filter=... ou /queues/...
  //   - Click abre modal:
  //       1) Lista de keys: auto-detectada do DOM + permite colar livre
  //       2) Cada key tem checkbox (todas marcadas por padrao)
  //       3) Acao: Derivar para time X (com comentario padrao) [+ checkbox criar ISS p/ cada]
  //   - Executa em loop com progresso ao vivo + log de erros por ticket
  // =========================

  function isQueueOrIssuesPage(){
    // Se ja tem um ticket aberto (browse/X ou queues/issue/X), nao mostra "Gerenciador"
    // - usuario quer "Localidade" pra acoes daquele chamado.
    if(getIssueKey()) return false;
    return /\/(issues|queues)(\b|\/|\?|$)/.test(location.pathname);
  }

  // Extrai issue keys visiveis no DOM via varios seletores (Issue Navigator, queues, etc).
  function getQueueKeysFromDom(){
    const keys = new Set();

    // 1) [data-issue-key] (mais comum)
    document.querySelectorAll('[data-issue-key]').forEach(el => {
      const k = el.getAttribute('data-issue-key');
      if(k && /^[A-Z][A-Z0-9_]+-\d+$/.test(k)) keys.add(k);
    });

    // 2) Links /browse/X-Y
    document.querySelectorAll('a[href*="/browse/"]').forEach(a => {
      const m = (a.getAttribute('href') || '').match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/);
      if(m) keys.add(m[1]);
    });

    // 3) Texto puro com keys (fallback ultra-permissivo - so pega visiveis em <a> ou <span>)
    return [...keys].sort((a, b) => {
      const [ap, an] = a.split('-'); const [bp, bn] = b.split('-');
      if(ap !== bp) return ap.localeCompare(bp);
      return parseInt(an, 10) - parseInt(bn, 10);
    });
  }

  // Extrai keys de um texto livre (cola de qualquer lugar).
  function extractKeysFromText(txt){
    const all = String(txt || '').match(/[A-Z][A-Z0-9_]+-\d+/g) || [];
    return [...new Set(all)];
  }

  // Le a lista de TIMES disponiveis na transicao Derivar de uma issue qualquer (precisa de 1 issue
  // ativa pra pegar os allowedValues do customfield Resolution Team na transicao).
  // Como sao opcoes globais do customfield, qualquer issue serve - cacheamos por sessao.
  const _TEAMS_CACHE_KEY = 'ml_loc_teams_cache_v1';
  async function getDeriveTeamsFromAnyKey(sampleKey){
    try{
      const raw = sessionStorage.getItem(_TEAMS_CACHE_KEY);
      if(raw){
        const c = JSON.parse(raw);
        if(c?.teams && (Date.now() - c.t) < 30*60*1000) return c.teams;
      }
    }catch(_){}

    const data = await jiraGetTransitions(sampleKey);
    const tr = pickDeriveTransition(data);
    if(!tr) throw new Error(`Transicao "${DERIVE_TRANSITION_NAME}" nao disponivel em ${sampleKey}.`);
    const allowed = getAllowedResolutionTeams(tr);
    const teams = filterTeamsAllowlist(allowed);
    if(!teams.length) throw new Error('Nenhum time da allowlist encontrado nas opcoes.');
    try{ sessionStorage.setItem(_TEAMS_CACHE_KEY, JSON.stringify({ teams, t: Date.now() })); }catch(_){}
    return teams;
  }

  function ensureBatchButton(){
    if(!isQueueOrIssuesPage()){
      document.getElementById('ml_batch_btn')?.remove();
      return;
    }
    ensureStyle();
    if(document.getElementById('ml_batch_btn')) return;
    const b = document.createElement('button');
    b.id = 'ml_batch_btn';
    b.textContent = 'Gerenciador';
    b.title = 'Aplicar acoes em massa (derivar / criar ISS) nesta tela';
    Object.assign(b.style, {
      position: 'fixed', right: '18px', bottom: '70px', zIndex: '9999997',
      background: 'linear-gradient(135deg, #34c578, #28a366)', color: '#fff',
      border: '0', borderRadius: '999px', padding: '11px 18px',
      fontWeight: '700', cursor: 'pointer',
      boxShadow: '0 12px 28px rgba(52,197,120,.35), 0 4px 10px rgba(0,0,0,.30)',
      fontFamily: 'var(--ml-font, system-ui)', fontSize: '13px', letterSpacing: '.2px'
    });
    b.addEventListener('click', openBatchModal);
    document.body.appendChild(b);
  }

  // ============= MODAL DE LOTE =============
  // opts.initialKeys: lista pre-populada (ex: vinda do Duplicados). Quando passada,
  //                   nao tentamos detectar do DOM (a lista ja vem pronta).
  function openBatchModal(opts){
    opts = opts || {};
    document.getElementById('ml_batch_modal')?.remove();
    document.getElementById('ml_batch_overlay')?.remove();

    ensureStyle();

    const overlay = document.createElement('div');
    overlay.id = 'ml_batch_overlay';
    overlay.className = 'mlCapOverlay';

    const modal = document.createElement('div');
    modal.id = 'ml_batch_modal';
    modal.className = 'mlCapModal';
    modal.style.maxWidth = 'min(900px, 96vw)';

    const detected = Array.isArray(opts.initialKeys) ? [...opts.initialKeys] : getQueueKeysFromDom();
    const sourceLabel = opts.sourceLabel || (Array.isArray(opts.initialKeys) ? 'Recebido do contexto anterior' : 'Detectado automaticamente da pagina');

    modal.innerHTML = `
      <div class="ch">
        <div>
          <div class="title"><span class="titleDot" style="background:#34c578;box-shadow:0 0 0 4px rgba(52,197,120,.18);"></span>Gerenciador de fila</div>
          <div class="subtitle">Derive ou crie tarefas ISS para varios chamados de uma vez.</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="ml_batch_close">Fechar</button>
        </div>
      </div>
      <div class="cb">
        <div class="capHint">
          <b>Como funciona:</b>
          <ol>
            <li>${esc(sourceLabel)}: <b>${detected.length}</b> chamado(s) (todos <b>desmarcados</b> por seguranca).</li>
            <li>Voce pode <b>colar mais keys</b> (uma por linha ou separadas por virgula/espaco) e clicar "Adicionar".</li>
            <li>Use o filtro pra achar e <b>marque</b> os chamados que quer processar (ou "Marcar todos").</li>
            <li>Escolha a acao (Derivar para time X / com ISS) e clique "Executar".</li>
          </ol>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center;">
          <input type="text" id="ml_batch_paste" placeholder="Cole aqui mais keys: IS-123, IS-456..." style="flex:1;min-width:220px;padding:8px 12px;background:var(--ml-bg-0);color:var(--ml-text);border:1px solid var(--ml-border-2);border-radius:var(--ml-radius-sm);font-size:12.5px;outline:none;" />
          <button id="ml_batch_add" class="btnSecondary">Adicionar</button>
          <button id="ml_batch_redetect" class="btnSecondary">Re-detectar do DOM</button>
          <button id="ml_batch_clear" class="btnSecondary">Limpar lista</button>
        </div>

        <div style="background:var(--ml-bg-0);border:1px solid var(--ml-border);border-radius:var(--ml-radius-sm);padding:10px;margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;align-items:center;flex-wrap:wrap;gap:8px;">
            <div style="font-size:12px;font-weight:700;color:var(--ml-text-mut);display:flex;align-items:center;gap:8px;">
              Chamados (<span id="ml_batch_count">0</span>) <span id="ml_batch_sel_count" style="color:var(--ml-text-dim);font-weight:400;"></span>
              <span id="ml_batch_loading" style="color:var(--ml-text-dim);font-weight:400;display:none;"><span class="mlSpin"></span> carregando detalhes...</span>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
              <input type="text" id="ml_batch_filter" placeholder="Filtrar (key, titulo, localidade...)"
                style="padding:4px 10px;background:var(--ml-bg-2);color:var(--ml-text);border:1px solid var(--ml-border-2);border-radius:6px;font-size:11.5px;outline:none;min-width:200px;" />
              <button id="ml_batch_check_all" class="btnSecondary" style="font-size:11px;padding:4px 10px;">Marcar todos</button>
              <button id="ml_batch_uncheck_all" class="btnSecondary" style="font-size:11px;padding:4px 10px;">Desmarcar todos</button>
            </div>
          </div>
          <div id="ml_batch_list" style="max-height:340px;overflow-y:auto;"></div>
        </div>

        <div style="background:var(--ml-bg-2);border:1px solid var(--ml-border);border-radius:var(--ml-radius-sm);padding:14px;margin-bottom:12px;">
          <div style="font-size:12px;font-weight:700;color:var(--ml-text-mut);margin-bottom:10px;">Acao</div>

          <label style="font-size:12px;font-weight:700;color:var(--ml-text-mut);">Time de destino</label>
          <div id="ml_batch_teams" style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 12px;"><span class="muted">Carregando times...</span></div>

          <label style="font-size:12px;font-weight:700;color:var(--ml-text-mut);display:flex;align-items:center;gap:8px;">
            <span>Comentario (observacao interna)</span>
            <span id="ml_batch_comment_btnwrap" style="margin-left:auto;font-weight:400;"></span>
          </label>
          <textarea id="ml_batch_comment" style="width:100%;min-height:70px;background:var(--ml-bg-0);color:var(--ml-text);border:1px solid var(--ml-border-2);border-radius:var(--ml-radius-sm);padding:10px;font-family:inherit;font-size:13px;resize:vertical;outline:none;margin-top:6px;">${esc(DERIVE_COMMENT_DEFAULT)}</textarea>

          <div style="margin-top:14px;padding:10px 12px;border:1px dashed var(--ml-blue);border-radius:var(--ml-radius-sm);background:var(--ml-blue-soft);">
            <label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;font-size:13px;">
              <input type="checkbox" id="ml_batch_iss_chk" style="margin-top:3px;transform:scale(1.18);accent-color:var(--ml-blue);" />
              <span>
                <b>Tambem criar tarefa ISS para cada chamado</b>
                <div class="muted" style="margin-top:4px;">So ativa quando o time selecionado esta em <code>ISS_TASK_TRIGGER_TEAMS</code> (Configuracoes). Pode demorar - cada chamado vira 1 ISS.</div>
              </span>
            </label>
          </div>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
          <button id="ml_batch_cancel" class="btnSecondary">Cancelar</button>
          <button id="ml_batch_run" class="btnPrimary">Executar</button>
        </div>

        <div id="ml_batch_progress" style="margin-top:14px;"></div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    // Anexa botao de Snippets ao textarea de comentario + slash expander + hint
    try{
      const ta = modal.querySelector('#ml_batch_comment');
      const wrap = modal.querySelector('#ml_batch_comment_btnwrap');
      if(ta && wrap){
        wrap.appendChild(buildSnippetsButton(ta, { label: 'Snippets' }));
      }
      if(ta){
        attachSlashExpander(ta);
        const hintBox = document.createElement('div');
        ta.parentNode?.insertBefore(hintBox, ta.nextSibling);
        renderSlashCommandsHint(hintBox, { textarea: ta });
      }
    }catch(_){}

    // STATE
    let keys = [...detected];
    // Default: nenhum marcado (mais seguro - usuario marca o que quer processar).
    let selected = new Set();
    let teams = [];
    let chosenTeam = null;
    let info = {};       // { key: { summary, status, asset, ... } } - preenchido em background
    let filterText = ''; // filtro de busca local

    const close = () => { modal.remove(); overlay.remove(); };
    overlay.addEventListener('click', close);
    modal.querySelector('#ml_batch_close').onclick = close;
    modal.querySelector('#ml_batch_cancel').onclick = close;

    function updateSelCount(){
      const el = modal.querySelector('#ml_batch_sel_count');
      if(el) el.textContent = `- ${selected.size} marcado(s)`;
    }

    function matchesFilter(k){
      if(!filterText) return true;
      const q = filterText.toLowerCase();
      if(k.toLowerCase().includes(q)) return true;
      const i = info[k];
      if(!i) return false;
      return [i.summary, i.asset, i.resTeam, i.status, i.assignee, i.issuetype]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    }

    function statusColorCss(catColor){
      // Jira status categories: 'green' (done), 'yellow' (in progress), 'blue-gray'/'medium-gray' (todo)
      switch(catColor){
        case 'green':       return 'background:rgba(52,197,120,.18);color:#86efac;border:1px solid rgba(52,197,120,.35);';
        case 'yellow':      return 'background:rgba(251,191,36,.18);color:#fcd34d;border:1px solid rgba(251,191,36,.35);';
        case 'blue-gray':   return 'background:rgba(79,140,255,.18);color:#93c5fd;border:1px solid rgba(79,140,255,.35);';
        default:            return 'background:rgba(148,163,184,.18);color:#cbd5e1;border:1px solid rgba(148,163,184,.30);';
      }
    }

    function renderList(){
      modal.querySelector('#ml_batch_count').textContent = keys.length;
      updateSelCount();
      const listEl = modal.querySelector('#ml_batch_list');
      if(!keys.length){
        listEl.innerHTML = `<div class="capEmpty">Nenhum chamado ainda. Cole keys ou redetecte do DOM.</div>`;
        return;
      }

      const visibleKeys = keys.filter(matchesFilter);

      // Tabela com header sticky
      const rows = visibleKeys.map(k => {
        const i = info[k] || {};
        const link = `${location.origin}/browse/${k}`;
        const statusPill = i.status
          ? `<span style="font-size:10.5px;padding:1px 8px;border-radius:999px;font-weight:600;${statusColorCss(i.statusColor)}">${esc(i.status)}</span>`
          : '';
        const priorityImg = i.priorityIcon
          ? `<img src="${esc(i.priorityIcon)}" alt="${esc(i.priority || '')}" title="${esc(i.priority || '')}" style="width:14px;height:14px;vertical-align:middle;" />`
          : '';
        const typeImg = i.issuetypeIcon
          ? `<img src="${esc(i.issuetypeIcon)}" alt="${esc(i.issuetype || '')}" title="${esc(i.issuetype || '')}" style="width:14px;height:14px;vertical-align:middle;" />`
          : '';
        const summary = i.summary || (i.error ? `<span style="color:#fca5a5;">${esc(i.error)}</span>` : '<span class="muted">carregando...</span>');
        const asset = i.asset
          ? `<span style="background:var(--ml-bg-2);padding:1px 8px;border-radius:6px;border:1px solid var(--ml-border);font-size:11px;">${esc(i.asset)}</span>`
          : '<span class="muted" style="font-size:11px;">-</span>';
        const team = i.resTeam
          ? `<span style="font-size:11px;color:var(--ml-text);">${esc(i.resTeam)}</span>`
          : '<span class="muted" style="font-size:11px;">-</span>';

        return `
          <tr data-key="${esc(k)}" style="border-bottom:1px solid var(--ml-border);">
            <td style="padding:6px 8px;width:28px;vertical-align:top;">
              <input type="checkbox" data-key="${esc(k)}" ${selected.has(k) ? 'checked' : ''} style="accent-color:var(--ml-green);transform:scale(1.1);" />
            </td>
            <td style="padding:6px 8px;width:120px;vertical-align:top;">
              <div style="display:flex;align-items:center;gap:4px;">
                ${typeImg}
                <a href="${esc(link)}" target="_blank" rel="noopener" style="color:var(--ml-blue);font-family:var(--ml-mono);font-size:12px;text-decoration:none;font-weight:600;">${esc(k)}</a>
                ${priorityImg}
              </div>
              <div style="margin-top:4px;">${statusPill}</div>
            </td>
            <td style="padding:6px 8px;vertical-align:top;font-size:12px;line-height:1.35;">
              ${esc(summary)}
              ${i.assignee ? `<div style="font-size:10.5px;color:var(--ml-text-dim);margin-top:3px;">Atribuido: ${esc(i.assignee)}</div>` : ''}
            </td>
            <td style="padding:6px 8px;vertical-align:top;width:160px;">${asset}</td>
            <td style="padding:6px 8px;vertical-align:top;width:160px;">${team}</td>
          </tr>
        `;
      }).join('');

      listEl.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
          <thead>
            <tr style="position:sticky;top:0;background:var(--ml-bg-2);z-index:2;">
              <th style="padding:8px;text-align:left;font-size:11px;color:var(--ml-text-mut);border-bottom:1px solid var(--ml-border);width:28px;"></th>
              <th style="padding:8px;text-align:left;font-size:11px;color:var(--ml-text-mut);border-bottom:1px solid var(--ml-border);">Chave / Status</th>
              <th style="padding:8px;text-align:left;font-size:11px;color:var(--ml-text-mut);border-bottom:1px solid var(--ml-border);">Resumo</th>
              <th style="padding:8px;text-align:left;font-size:11px;color:var(--ml-text-mut);border-bottom:1px solid var(--ml-border);">Localidade</th>
              <th style="padding:8px;text-align:left;font-size:11px;color:var(--ml-text-mut);border-bottom:1px solid var(--ml-border);">Time resolutor</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="5" class="capEmpty" style="padding:20px;text-align:center;">Nenhum chamado bate com o filtro.</td></tr>`}</tbody>
        </table>
      `;

      listEl.querySelectorAll('input[type="checkbox"][data-key]').forEach(cb => {
        cb.addEventListener('change', () => {
          const k = cb.getAttribute('data-key');
          if(cb.checked) selected.add(k); else selected.delete(k);
          updateSelCount();
        });
      });
    }

    async function loadDetails(targetKeys){
      const need = targetKeys.filter(k => !info[k]);
      if(!need.length) return;
      const loadingEl = modal.querySelector('#ml_batch_loading');
      if(loadingEl) loadingEl.style.display = '';
      try{
        const list = await getIssuesBatchInfo(need);
        for(const item of list){ info[item.key] = item; }
        // Marca os que nem voltaram na resposta (existiam mas falharam)
        for(const k of need){ if(!info[k]) info[k] = { key: k, error: 'nao retornou' }; }
        renderList();
      }catch(e){
        console.warn('[jira-localidade][batch] falha ao carregar detalhes:', e);
        for(const k of need){ if(!info[k]) info[k] = { key: k, error: e.message || String(e) }; }
        renderList();
      }finally{
        if(loadingEl) loadingEl.style.display = 'none';
      }
    }

    renderList();
    if(keys.length) loadDetails(keys);

    // Filtro local
    modal.querySelector('#ml_batch_filter').addEventListener('input', (e) => {
      filterText = String(e.target.value || '').trim();
      renderList();
    });

    modal.querySelector('#ml_batch_add').onclick = () => {
      const txt = modal.querySelector('#ml_batch_paste').value || '';
      const newKeys = extractKeysFromText(txt);
      const addedKeys = [];
      for(const k of newKeys){
        if(!keys.includes(k)){ keys.push(k); addedKeys.push(k); }
      }
      modal.querySelector('#ml_batch_paste').value = '';
      keys.sort();
      renderList();
      if(addedKeys.length){
        progressLog(`+ ${addedKeys.length} chamado(s) adicionado(s).`);
        loadDetails(addedKeys);
        if(!teams.length) loadTeams(); // tenta recarregar se ainda nao tinha
      }
    };
    modal.querySelector('#ml_batch_redetect').onclick = () => {
      const fresh = getQueueKeysFromDom();
      const addedKeys = [];
      for(const k of fresh){
        if(!keys.includes(k)){ keys.push(k); addedKeys.push(k); }
      }
      keys.sort();
      renderList();
      progressLog(`Re-deteccao do DOM: ${fresh.length} encontrados, ${addedKeys.length} adicionados.`);
      if(addedKeys.length){
        loadDetails(addedKeys);
        if(!teams.length) loadTeams();
      }
    };
    modal.querySelector('#ml_batch_clear').onclick = () => {
      if(!keys.length) return;
      if(!confirm(`Limpar lista de ${keys.length} chamado(s)?`)) return;
      keys = []; selected.clear(); info = {}; renderList();
    };
    modal.querySelector('#ml_batch_check_all').onclick   = () => {
      // marca apenas os visiveis no filtro
      const visible = keys.filter(matchesFilter);
      visible.forEach(k => selected.add(k));
      renderList();
    };
    modal.querySelector('#ml_batch_uncheck_all').onclick = () => {
      const visible = keys.filter(matchesFilter);
      visible.forEach(k => selected.delete(k));
      renderList();
    };

    // CARREGAR TIMES (precisa de 1 chamado de exemplo cujo workflow tenha a transicao Derivar).
    // Nem todo projeto tem a transicao (ex: ALM nao tem), entao priorizamos projetos suportados
    // (PROJECTS) e fazemos fallback tentando ate N samples.
    async function loadTeams(){
      if(!keys.length){
        modal.querySelector('#ml_batch_teams').innerHTML = `<span class="muted">Adicione pelo menos 1 chamado de IS/ISS/SSHP para carregar os times.</span>`;
        return;
      }
      // Ordena: 1) projetos suportados primeiro (IS, ISS, SSHP); 2) demais por ultimo
      const ordered = [...keys].sort((a, b) => {
        const ap = PROJECTS.includes(String(a).split('-')[0]);
        const bp = PROJECTS.includes(String(b).split('-')[0]);
        if(ap && !bp) return -1;
        if(!ap && bp) return 1;
        return 0;
      });
      modal.querySelector('#ml_batch_teams').innerHTML = `<span class="muted"><span class="mlSpin"></span> Carregando times (tentando ${Math.min(ordered.length, 5)} chamado(s))...</span>`;

      const errors = [];
      // Tenta ate 5 keys diferentes
      for(const sample of ordered.slice(0, 5)){
        try{
          teams = await getDeriveTeamsFromAnyKey(sample);
          renderTeamsBar();
          return;
        }catch(e){
          errors.push(`${sample}: ${e.message || e}`);
        }
      }
      modal.querySelector('#ml_batch_teams').innerHTML = `
        <div class="muted" style="line-height:1.5;">
          Falha ao carregar times. Verifique se ao menos 1 chamado de IS/ISS/SSHP esta na lista.<br/>
          <details style="margin-top:6px;"><summary style="cursor:pointer;font-size:11px;">Ver detalhes (${errors.length} tentativa(s))</summary>
            <div style="font-family:var(--ml-mono);font-size:10.5px;margin-top:4px;color:#fca5a5;">
              ${errors.map(e => esc(e)).join('<br>')}
            </div>
          </details>
        </div>`;
    }
    loadTeams();

    function renderTeamsBar(){
      const bar = modal.querySelector('#ml_batch_teams');
      bar.innerHTML = teams.map(t => `<button class="teambtn" data-team="${esc(t.id)}" data-team-name="${esc(t.value)}">${esc(t.value)}</button>`).join('');
      bar.querySelectorAll('button.teambtn').forEach(btn => {
        // estilo basico (nao temos a classe teambtn de derive aqui)
        Object.assign(btn.style, {
          background: 'var(--ml-bg-3)', color: 'var(--ml-text)', border: '1px solid var(--ml-border-2)',
          borderRadius: '999px', padding: '6px 12px', cursor: 'pointer', fontWeight: '600', fontSize: '12px'
        });
        btn.onclick = () => {
          chosenTeam = { id: btn.getAttribute('data-team'), value: btn.getAttribute('data-team-name') };
          bar.querySelectorAll('button.teambtn').forEach(b => {
            b.style.background = 'var(--ml-bg-3)'; b.style.borderColor = 'var(--ml-border-2)';
          });
          btn.style.background = 'var(--ml-blue-soft)'; btn.style.borderColor = 'var(--ml-blue)';
        };
      });
    }

    function progressLog(line, color){
      const p = modal.querySelector('#ml_batch_progress');
      const div = document.createElement('div');
      div.style.cssText = `font-family:var(--ml-mono);font-size:12px;padding:4px 0;color:${color || 'var(--ml-text-mut)'};`;
      div.innerHTML = line;
      p.appendChild(div);
      p.scrollTop = p.scrollHeight;
    }

    // EXECUTAR
    modal.querySelector('#ml_batch_run').onclick = async () => {
      const targetKeys = [...selected];
      if(!targetKeys.length) { alert('Selecione pelo menos 1 chamado.'); return; }
      if(!chosenTeam){ alert('Selecione o time de destino.'); return; }
      const comment = modal.querySelector('#ml_batch_comment').value || DERIVE_COMMENT_DEFAULT;
      const wantIss = modal.querySelector('#ml_batch_iss_chk').checked;
      const issEligible = wantIss && (ISS_TASK_TRIGGER_TEAMS || []).map(s => String(s).trim()).includes(String(chosenTeam.value).trim());

      if(wantIss && !issEligible){
        if(!confirm(`O time "${chosenTeam.value}" NAO esta na lista ISS_TASK_TRIGGER_TEAMS.\nVamos derivar todos, mas SEM criar ISS. Continuar?`)) return;
      }

      const confirmMsg = `Vai processar ${targetKeys.length} chamado(s):\n  - Derivar para "${chosenTeam.value}"\n  - Comentario: "${comment}"${issEligible ? '\n  - Criar 1 ISS para cada' : ''}\n\nContinuar?`;
      if(!confirm(confirmMsg)) return;

      // Desabilita controles durante execucao
      modal.querySelector('#ml_batch_run').disabled = true;
      modal.querySelector('#ml_batch_run').innerHTML = `<span class="mlSpin"></span> Executando...`;

      const p = modal.querySelector('#ml_batch_progress');
      p.innerHTML = `<div style="font-weight:700;color:var(--ml-text);margin-bottom:8px;">Progresso (0/${targetKeys.length})</div>`;
      const counter = (i) => p.firstChild.textContent = `Progresso (${i}/${targetKeys.length})`;

      // Pega me uma vez (pra unwatch em loop)
      let myAccountId = null;
      if(DERIVE_UNWATCH_AFTER){
        try{
          const me = await jiraGetMyself();
          myAccountId = me?.accountId || null;
        }catch(e){
          progressLog(`<b style="color:#fbbf24;">[AVISO]</b> Falha ao obter /myself - unwatch desabilitado neste lote: ${esc(e.message || e)}`);
        }
      }

      let ok = 0, fail = 0, unwatched = 0;
      const issResults = [];

      for(let i = 0; i < targetKeys.length; i++){
        const key = targetKeys[i];
        counter(i);
        try{
          const tr = await jiraGetTransitions(key);
          const deriveTr = pickDeriveTransition(tr);
          if(!deriveTr) throw new Error(`Transicao "${DERIVE_TRANSITION_NAME}" nao disponivel`);
          await jiraDoDerive(key, deriveTr.id, chosenTeam.id, comment);
          progressLog(`<b style="color:#86efac;">[OK]</b> ${esc(key)} derivado para ${esc(chosenTeam.value)}`);
          ok++;

          // Unassign best-effort (libera ticket pra fila do novo time)
          if(DERIVE_UNASSIGN_AFTER){
            try{
              await jiraUnassign(key);
              progressLog(`     &#8627; <b style="color:#86efac;">[UNASSIGN]</b> assignee removido`);
            }catch(eUa){
              progressLog(`     &#8627; <b style="color:#fbbf24;">[UNASSIGN WARN]</b> ${esc(eUa.message || String(eUa))}`);
            }
          }

          // Unwatch best-effort com retry (Jira pode re-adicionar via auto-watch on comment
          // ou workflow post-function). No lote, usamos delays menores pra nao ficar muito
          // lento - alem de ja agendar uma tentativa tardia (20s) que cobre post-functions lentas.
          if(myAccountId){
            try{
              const res = await jiraUnwatchIssueRobust(key, myAccountId, {
                initialDelayMs: 400,
                maxAttempts: 3,
                delayMs: 900
              });
              if(res.ok){
                unwatched++;
                if(res.attempts > 1){
                  progressLog(`     &#8627; <b style="color:#86efac;">[UNWATCH]</b> removido (${res.attempts} tentativa(s) - tentativa tardia agendada)`);
                }
              } else {
                progressLog(`     &#8627; <b style="color:#fbbf24;">[UNWATCH WARN]</b> ainda watcher - tentativa tardia (20s) agendada em background`);
              }
            }catch(eUw){
              progressLog(`     &#8627; <b style="color:#fca5a5;">[UNWATCH FAIL]</b> ${esc(eUw.message || String(eUw))}`);
            }
          }

          if(issEligible){
            try{
              const r = await createIssTaskFromIssue(key, () => {});
              issResults.push({ key, newKey: r.newKey });
              progressLog(`     &#8627; ISS ${esc(r.newKey)} criada e vinculada (link: <a href="${esc(location.origin + '/browse/' + r.newKey)}" target="_blank" rel="noopener">${esc(r.newKey)}</a>)`, 'var(--ml-text)');
              if(r.commentsReport && r.commentsReport.copied > 0){
                progressLog(`         &#8627; <b style="color:#86efac;">[COMMENTS]</b> ${r.commentsReport.copied} comentario(s) herdado(s) como digest interno`);
              }
              try{ await addInternalComment(key, `Tarefa de troubleshooting criada e vinculada: ${r.newKey} (${location.origin}/browse/${r.newKey}).`); }catch(_){}
            }catch(eIss){
              progressLog(`     &#8627; <b style="color:#fca5a5;">[ISS FAIL]</b> ${esc(eIss.message || String(eIss))}`);
            }
          }
        }catch(e){
          progressLog(`<b style="color:#fca5a5;">[FAIL]</b> ${esc(key)}: ${esc(e.message || String(e))}`);
          fail++;
        }
      }
      counter(targetKeys.length);

      const summary = document.createElement('div');
      summary.style.cssText = `margin-top:12px;padding:10px 12px;border-radius:8px;font-weight:700;${
        fail === 0
          ? 'background:var(--ml-green-soft);border:1px solid var(--ml-green);color:#bdf0d2;'
          : 'background:var(--ml-amber-soft);border:1px solid var(--ml-amber);color:#ffeec3;'
      }`;
      summary.innerHTML = `Concluido: <b>${ok}</b> derivado(s)${
        DERIVE_UNWATCH_AFTER && myAccountId ? `, <b>${unwatched}</b> unwatch(s)` : ''
      }${issEligible ? `, <b>${issResults.length}</b> ISS(s) criada(s)` : ''}, <b>${fail}</b> falha(s).`;
      p.appendChild(summary);

      modal.querySelector('#ml_batch_run').innerHTML = 'Executar';
      modal.querySelector('#ml_batch_run').disabled = false;
    };
  }
