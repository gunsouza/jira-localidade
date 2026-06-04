  // =========================
  // HOME view: mini-busca + cards de features
  // =========================
  async function renderHome(modal, issueKey) {
    modal.setBody(`
      <div class="homeWrap">
        <div id="ml_home_health"></div>

        <div>
          <div class="searchBox">
            <input type="text" id="ml_home_search_input" placeholder="Cole uma chave de ticket (ex: IS-1028327) e Enter para inspecionar..." spellcheck="false" />
            <button id="ml_home_search_btn" class="primary">Buscar</button>
            <button id="ml_home_search_clear" class="ghost" title="Limpar">Limpar</button>
          </div>
          <div class="hint" style="color: var(--ml-text-dim); font-size: 11px; margin-top: 6px;">
            Acesso rapido a qualquer ticket sem trocar de aba. Voce ve resumo, status, localidade e pode marcar como duplicado do ticket atual em 1 clique.
          </div>
          <div id="ml_home_clipboard" style="margin-top: 10px;"></div>
          <div id="ml_home_search_hist" style="margin-top: 10px;"></div>
          <div id="ml_home_search_result" style="margin-top: 12px;"></div>
        </div>

        <div class="homeGrid">
          <div class="homeCard">
            <div class="hcIcon">&#9783;</div>
            <h3>Duplicados</h3>
            <p>Lista tickets da mesma localidade com scoring de match. Filtra por IDs (IP/MAC/serial), vincula e comenta em lote.</p>
            <div class="row">
              <button id="ml_home_dups" class="primary">Abrir duplicados</button>
            </div>
          </div>

          <div class="homeCard">
            <div class="hcIcon">&#10142;</div>
            <h3>Derivar</h3>
            <p>Deriva para outro time da allowlist com comentario padrao. Para o time <b>IS-SHIP-SE-N2</b>, oferece criar tarefa ISS automaticamente.</p>
            <div class="row">
              <button id="ml_home_derive" class="primary">Derivar agora</button>
            </div>
          </div>

          <div class="homeCard">
            <div class="hcIcon">&#9881;</div>
            <h3>Criar tarefa ISS livre</h3>
            <p>Em breve: criar tarefa ISS com dropdowns dinamicos e templates salvos (pra casos que nao seguem o mapeamento Demand=Analisis/Service=cctv).</p>
            <div class="row">
              <button id="ml_home_iss_livre" class="ghost disabled" disabled>Em breve</button>
            </div>
          </div>
        </div>
      </div>
    `);

    document.getElementById('ml_home_dups').onclick   = () => renderDuplicates(modal, issueKey);
    document.getElementById('ml_home_derive').onclick = () => openDeriveFlow(issueKey);

    setupHomeSearch(issueKey);
    renderHealthBanner();
  }

  // ============= HEALTH BANNER =============
  async function renderHealthBanner(){
    const slot = document.getElementById('ml_home_health');
    if(!slot) return;
    slot.innerHTML = `<div class="healthBanner"><span class="mlSpin"></span><div class="hbBody"><div class="hbTitle">Validando configuracoes...</div></div></div>`;
    let h;
    try{
      h = await runHealthCheckCached();
    }catch(e){
      slot.innerHTML = `
        <div class="healthBanner error">
          <span class="hbIcon">&#9888;</span>
          <div class="hbBody">
            <div class="hbTitle">Health check falhou</div>
            <div class="muted" style="margin-top:4px;">${esc(e.message || String(e))}</div>
          </div>
        </div>`;
      return;
    }
    if(!h.issues.length){
      // Tudo OK — mostra um banner discreto e ja some apos 4s
      slot.innerHTML = `
        <div class="healthBanner ok">
          <span class="hbIcon">&#10003;</span>
          <div class="hbBody">
            <div class="hbTitle">Configuracoes validadas (${h.ok.length} itens OK)</div>
          </div>
        </div>`;
      setTimeout(() => { if(slot.firstChild) slot.firstChild.style.display = 'none'; }, 4000);
      return;
    }
    const hasError = h.issues.some(i => i.severity === 'error');
    const cls = hasError ? 'error' : 'warn';
    const icon = hasError ? '&#9888;' : '&#9888;';
    slot.innerHTML = `
      <div class="healthBanner ${cls}">
        <span class="hbIcon">${icon}</span>
        <div class="hbBody">
          <div class="hbTitle">${h.issues.length} problema(s) detectado(s) na configuracao</div>
          <ul class="hbList">
            ${h.issues.map(i => `
              <li>
                <span class="sev ${i.severity === 'error' ? 'err' : 'warn'}">[${i.severity.toUpperCase()}]</span>
                ${esc(i.msg)}
                ${i.hint ? `<div class="muted" style="margin-left: 8px; margin-top: 2px;">${esc(i.hint)}</div>` : ''}
              </li>
            `).join('')}
          </ul>
          <div class="hbActions">
            <button id="ml_health_settings" class="ghost" style="font-size:12px;padding:6px 12px;">Abrir Configuracoes</button>
            <button id="ml_health_recheck" class="ghost" style="font-size:12px;padding:6px 12px;">Re-checar</button>
          </div>
        </div>
      </div>`;
    document.getElementById('ml_health_settings').onclick = () => openSettingsModal();
    document.getElementById('ml_health_recheck').onclick = () => { clearHealthCache(); renderHealthBanner(); };
  }

  // Historico das ultimas keys buscadas (max 8). Persiste em localStorage.
  const _SEARCH_HIST_KEY = 'ml_loc_search_hist_v1';
  function _readSearchHist(){
    try { return JSON.parse(localStorage.getItem(_SEARCH_HIST_KEY) || '[]'); } catch(_) { return []; }
  }
  function _writeSearchHist(arr){
    try { localStorage.setItem(_SEARCH_HIST_KEY, JSON.stringify(arr.slice(0, 8))); } catch(_) {}
  }
  function _pushSearchHist(key){
    const cur = _readSearchHist().filter(k => k !== key);
    cur.unshift(key);
    _writeSearchHist(cur);
  }

  // ============= MINI-BUSCA (sabor C) =============
  function setupHomeSearch(currentIssueKey){
    const input   = document.getElementById('ml_home_search_input');
    const btn     = document.getElementById('ml_home_search_btn');
    const clrBtn  = document.getElementById('ml_home_search_clear');
    const result  = document.getElementById('ml_home_search_result');
    const histBox = document.getElementById('ml_home_search_hist');
    const clipBar = document.getElementById('ml_home_clipboard');
    if(!input || !btn || !result) return;

    const renderHistory = () => {
      if(!histBox) return;
      const hist = _readSearchHist();
      if(!hist.length){ histBox.innerHTML = ''; return; }
      histBox.innerHTML = `<div class="hint" style="margin-bottom: 6px;">Buscas recentes:</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${hist.map(k => `<button class="ghost" data-hist-key="${esc(k)}" style="font-size:11px;padding:4px 10px;font-family:var(--ml-mono);">${esc(k)}</button>`).join('')}
        </div>`;
      histBox.querySelectorAll('[data-hist-key]').forEach(b => {
        b.onclick = () => {
          input.value = b.getAttribute('data-hist-key');
          doSearch();
        };
      });
    };

    const doSearch = async () => {
      const raw = String(input.value || '').trim();
      const key = raw.toUpperCase().match(/[A-Z][A-Z0-9_]+-\d+/)?.[0];
      if(!key){
        result.innerHTML = `<div class="err" style="margin:0;">Cole uma chave valida (ex: <code>IS-1028327</code>).</div>`;
        return;
      }
      result.innerHTML = `<div class="searchResult"><span class="mlSpin"></span> Buscando ${esc(key)}...</div>`;
      try{
        const p = await getIssuePreview(key);
        renderPreview(result, p, currentIssueKey);
        _pushSearchHist(key);
        renderHistory();
      }catch(e){
        result.innerHTML = `<div class="err" style="margin:0;">Falha ao buscar <code>${esc(key)}</code>: ${esc(e.message || String(e))}</div>`;
      }
    };

    btn.onclick = doSearch;
    clrBtn.onclick = () => { input.value = ''; result.innerHTML = ''; input.focus(); };
    input.onkeydown = (ev) => { if(ev.key === 'Enter'){ ev.preventDefault(); doSearch(); }};
    setTimeout(() => input.focus(), 50);

    renderHistory();

    // Auto-detect: se o clipboard tem uma key Jira (e nao e a current), oferece buscar.
    if(clipBar && navigator?.clipboard?.readText){
      navigator.clipboard.readText().then(txt => {
        const k = String(txt || '').toUpperCase().match(/[A-Z][A-Z0-9_]+-\d+/)?.[0];
        if(!k || k === currentIssueKey) return;
        clipBar.innerHTML = `
          <div style="display:flex;gap:10px;align-items:center;padding:10px 14px;background:var(--ml-blue-soft);border:1px solid var(--ml-blue-line);border-radius:var(--ml-radius-sm);font-size:12.5px;">
            &#128203; Voce tem <code>${esc(k)}</code> no clipboard.
            <button id="ml_clip_use" class="primary" style="font-size:12px;padding:4px 12px;margin-left:auto;">Buscar</button>
            <button id="ml_clip_dismiss" class="ghost" style="font-size:12px;padding:4px 10px;">Ignorar</button>
          </div>`;
        clipBar.querySelector('#ml_clip_use').onclick = () => { input.value = k; doSearch(); clipBar.innerHTML = ''; };
        clipBar.querySelector('#ml_clip_dismiss').onclick = () => { clipBar.innerHTML = ''; };
      }).catch(() => { /* silently ignore - usuario pode nao ter dado permissao */ });
    }
  }

  function renderPreview(container, p, currentIssueKey){
    const link = `${location.origin}/browse/${p.key}`;
    const isCurrent = currentIssueKey && (currentIssueKey === p.key);

    let descText = '';
    if(p.descriptionAdf){
      try { descText = adfToPlainText(p.descriptionAdf); } catch(_){}
    }
    const COLLAPSE_AT = 600;
    const isLong = descText.length > COLLAPSE_AT;
    const descShort = isLong ? (descText.slice(0, COLLAPSE_AT).trim() + ' ...') : descText;

    container.innerHTML = `
      <div class="searchResult">
        <div class="srHead">
          <div style="flex:1; min-width: 240px;">
            <div class="srKey"><a href="${esc(link)}" target="_blank" rel="noopener">${esc(p.key)}</a></div>
            <div class="srSum">${esc(p.summary)}</div>
            <div class="srBadges">
              ${p.status         ? `<span class="srBadge status">${esc(p.status)}</span>` : ''}
              ${p.priority       ? `<span class="srBadge prio">${esc(p.priority)}</span>` : ''}
              ${p.asset          ? `<span class="srBadge loc">&#128205; ${esc(p.asset)}</span>` : ''}
              ${p.resolutionTeam ? `<span class="srBadge">&#128101; ${esc(p.resolutionTeam)}</span>` : ''}
              ${p.issuetype      ? `<span class="srBadge">${esc(p.issuetype)}</span>` : ''}
              <span class="srBadge">${esc(p.assignee)}</span>
            </div>
          </div>
        </div>
        ${descText
          ? `<div class="srDesc" id="ml_sr_desc" style="max-height:none;white-space:pre-wrap;">${esc(descShort)}</div>
             ${isLong ? `<button id="ml_sr_more" class="ghost" style="margin-top:8px;font-size:12px;">Ver descricao completa (${descText.length} chars)</button>` : ''}`
          : '<div class="muted" style="margin-top:10px;">(Sem descricao no ticket)</div>'
        }
        <div class="srActions">
          <button class="primary" id="ml_sr_open">Abrir em nova aba</button>
          ${(!isCurrent && currentIssueKey) ? `<button id="ml_sr_dup">Marcar ${esc(currentIssueKey)} como duplicado deste</button>` : ''}
          ${isCurrent ? `<span class="muted">(este e o ticket atual)</span>` : ''}
        </div>
        <div id="ml_sr_msg" style="margin-top:10px;"></div>
      </div>
    `;

    document.getElementById('ml_sr_open').onclick = () => window.open(link, '_blank', 'noopener');

    const moreBtn = document.getElementById('ml_sr_more');
    if(moreBtn){
      let expanded = false;
      moreBtn.onclick = () => {
        const el = document.getElementById('ml_sr_desc');
        expanded = !expanded;
        el.textContent = expanded ? descText : descShort;
        moreBtn.textContent = expanded ? 'Recolher' : `Ver descricao completa (${descText.length} chars)`;
      };
    }

    const dupBtn = document.getElementById('ml_sr_dup');
    if(dupBtn){
      dupBtn.onclick = async () => {
        if(!confirm(`Marcar ${currentIssueKey} como duplicado de ${p.key}?\n\nIsso:\n  - cria o link "duplicates"\n  - adiciona um comentario interno em ambos.`)) return;
        dupBtn.disabled = true;
        dupBtn.innerHTML = `<span class="mlSpin"></span> Vinculando...`;
        const msg = document.getElementById('ml_sr_msg');
        try{
          await linkDuplicate(currentIssueKey, p.key);
          try { await addInternalComment(currentIssueKey, `Marcado como duplicado de ${p.key}.`); } catch(_){}
          try { await addInternalComment(p.key, `${currentIssueKey} foi marcado como duplicado deste chamado.`); } catch(_){}
          msg.innerHTML = `<div class="srBadge" style="background: var(--ml-green-soft); border-color: var(--ml-green); color:#bdf0d2;">&#10003; Vinculado com sucesso</div>`;
          dupBtn.innerHTML = 'Vinculado';
        }catch(e){
          msg.innerHTML = `<div class="err" style="margin:0;">Falha: ${esc(e.message || String(e))}</div>`;
          dupBtn.disabled = false;
          dupBtn.textContent = `Marcar ${currentIssueKey} como duplicado deste`;
        }
      };
    }
  }
