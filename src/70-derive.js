  // =========================
  // DERIVE — transitions + modal + execução
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

  function openDeriveModal({ teams, onSubmit, suggestedTeamValue }) {
    document.getElementById(IDS.dModal)?.remove();
    document.getElementById(IDS.dOverlay)?.remove();

    const overlay = document.createElement('div');
    overlay.id = IDS.dOverlay;

    const modal = document.createElement('div');
    modal.id = IDS.dModal;

    modal.innerHTML = `
      <div class="dh">
        <div>
          <div class="title">Derivar para outro time</div>
          <div class="meta">Selecione o time e confirme.</div>
        </div>
        <div style="display:flex;gap:8px">
          <button id="ml_d_close" class="btnSecondary">Fechar</button>
        </div>
      </div>
      <div class="db">
        <div style="font-weight:900;margin-bottom:6px">Times</div>
        <div class="teamgrid" id="ml_d_teams"></div>

        <div style="font-weight:900;margin:12px 0 6px;display:flex;gap:8px;align-items:baseline;">
          <span>Coment&aacute;rio (observa&ccedil;&atilde;o interna)</span>
          <span id="ml_d_comment_btnwrap" style="margin-left:auto;font-weight:400;"></span>
        </div>
        <textarea id="ml_d_comment">${esc(DERIVE_COMMENT_DEFAULT)}</textarea>

        <div id="ml_d_iss_wrap" class="issWrap" style="display:none;">
          <label class="issLabel">
            <input type="checkbox" id="ml_d_iss" />
            <span><b>Tambem criar tarefa de troubleshooting (ISS)</b><br/>
            <span class="issHint">Cria uma Tarefa no projeto ${esc(ISS_TASK_PROJECT)} com voce como respons&aacute;vel, copia a descri&ccedil;&atilde;o e a localidade, e a vincula a este ticket.</span></span>
          </label>
        </div>

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
    const issWrap   = modal.querySelector('#ml_d_iss_wrap');
    const issCheck  = modal.querySelector('#ml_d_iss');
    let selected = null;

    const refreshIssVisibility = () => {
      const offer = selected && shouldOfferIssTask(selected.value);
      if(offer){
        issWrap.style.display = '';
      } else {
        issWrap.style.display = 'none';
        issCheck.checked = false;
      }
    };

    teams.forEach(t => {
      const b = document.createElement('button');
      b.className = 'teambtn';
      const isSuggested = !!(suggestedTeamValue && t.value === suggestedTeamValue);
      b.textContent = t.value + (isSuggested ? '  (sugerido)' : '');
      if(isSuggested){
        b.style.borderColor = 'var(--ml-blue, #4f8cff)';
        b.style.boxShadow = '0 0 0 2px rgba(79,140,255,0.18) inset';
      }
      b.onclick = () => {
        selected = t;
        [...teamsWrap.querySelectorAll('.teambtn')].forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        refreshIssVisibility();
      };
      teamsWrap.appendChild(b);

      // Auto-seleciona o sugerido (se houver)
      if(isSuggested && !selected){
        selected = t;
        b.classList.add('active');
        // pequeno delay pra garantir que o issWrap exista
        setTimeout(refreshIssVisibility, 0);
      }
    });

    // Anexa o botao de Snippets no textarea de comentario + slash expander + hint
    try{
      const ta = modal.querySelector('#ml_d_comment');
      const wrap = modal.querySelector('#ml_d_comment_btnwrap');
      if(ta && wrap){
        const sb = buildSnippetsButton(ta, { label: 'Snippets' });
        wrap.appendChild(sb);
      }
      if(ta){
        attachSlashExpander(ta);
        // Hint dos /comandos abaixo do textarea
        const hintBox = document.createElement('div');
        hintBox.id = 'ml_d_slash_hint';
        ta.parentNode?.insertBefore(hintBox, ta.nextSibling);
        renderSlashCommandsHint(hintBox, { textarea: ta });
      }
    }catch(_){}

    modal.querySelector('#ml_d_submit').addEventListener('click', async () => {
      if(!selected){
        alert('Selecione um time.');
        return;
      }
      const comment = modal.querySelector('#ml_d_comment').value || DERIVE_COMMENT_DEFAULT;
      const createIssTask = !!(issCheck && issCheck.checked && shouldOfferIssTask(selected.value));

      // Desabilita imediatamente botoes pra evitar duplo-click (que ja causou criar varias
      // ISS duplicadas em alguns cenarios). Mostra loading state no botao.
      const btn = modal.querySelector('#ml_d_submit');
      const btnCancel = modal.querySelector('#ml_d_cancel');
      const originalLabel = btn?.textContent || 'Derivar';
      if(btn){
        btn.disabled = true;
        btn.style.opacity = '.7';
        btn.style.cursor = 'not-allowed';
        btn.textContent = createIssTask ? 'Derivando + criando ISS...' : 'Derivando...';
      }
      if(btnCancel){
        btnCancel.disabled = true;
        btnCancel.style.opacity = '.5';
        btnCancel.style.cursor = 'not-allowed';
      }
      // Bloqueia overlay (clique fora nao deve fechar enquanto rola)
      const overlayEl = document.getElementById(IDS.dOverlay);
      if(overlayEl){
        overlayEl.style.pointerEvents = 'none';
      }

      try{
        await onSubmit({ team: selected, comment, createIssTask });
        close();
      }catch(e){
        // Em caso de erro, restaurar botoes pra usuario poder tentar de novo
        if(btn){
          btn.disabled = false;
          btn.style.opacity = '';
          btn.style.cursor = '';
          btn.textContent = originalLabel;
        }
        if(btnCancel){
          btnCancel.disabled = false;
          btnCancel.style.opacity = '';
          btnCancel.style.cursor = '';
        }
        if(overlayEl) overlayEl.style.pointerEvents = '';
        console.error('[jira-localidade][derive] erro no submit:', e);
        alert('Erro ao derivar: ' + (e.message || e));
      }
    });

    document.body.appendChild(overlay);
    document.body.appendChild(modal);
  }

  // Toast de sucesso pos-derive. Non-blocking (nao trava UI como alert()).
  // Mensagem pode ser multilinha (\n vira <br>).
  function showDeriveSuccessToast(msg){
    try{
      document.getElementById('ml_derive_toast')?.remove();
      const t = document.createElement('div');
      t.id = 'ml_derive_toast';
      t.style.cssText = `
        position: fixed; top: 18px; right: 18px; z-index: 2147483647;
        background: linear-gradient(180deg, #2f8f48, #246a36);
        color: #fff; padding: 12px 18px; border-radius: 10px;
        border: 1px solid #2c7a3e;
        font: 600 13px var(--ml-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
        box-shadow: 0 12px 30px rgba(0,0,0,.5);
        max-width: 420px; line-height: 1.45;
        animation: mlToastIn .25s cubic-bezier(.16,.84,.44,1);
      `;
      const body = String(msg || 'OK').split('\n').map(line => line.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))).join('<br>');
      t.innerHTML = `<div style="display:flex;gap:8px;align-items:flex-start;"><div style="font-size:16px;">&#10003;</div><div>${body}<div style="margin-top:6px;font-weight:500;font-size:11px;opacity:.85;">A pagina sera recarregada em instantes...</div></div></div>`;
      document.body.appendChild(t);
    }catch(_){}
  }

  // Agenda recarregamento da pagina pos-derive (1.5s pra dar tempo do toast aparecer).
  // Bloqueia interacao com a pagina nesse intervalo pra evitar o usuario tentar
  // continuar e ter mudanca de contexto inesperada.
  function scheduleReloadAfterDerive(){
    try{
      // Veu sutil sobre a pagina
      const veil = document.createElement('div');
      veil.id = 'ml_reload_veil';
      veil.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,.25);
        z-index: 2147483640; pointer-events: all;
      `;
      document.body.appendChild(veil);
    }catch(_){}
    setTimeout(() => { try{ location.reload(); }catch(_){} }, 1500);
  }

  // Remove o assignee atual do ticket (atribui pra "nenhum"). Usado apos derivar
  // pra liberar o chamado pra fila do novo time. Best-effort.
  async function jiraUnassign(issueKey){
    const url = `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/assignee`;
    const r = await fetch(url, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Accept':'application/json', 'Content-Type':'application/json' },
      body: JSON.stringify({ accountId: null })
    });
    if(!r.ok){
      const txt = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status} ao desatribuir ${issueKey}: ${txt.slice(0, 250)}`);
    }
    return true;
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

  // Heuristica simples: testa as regras `DERIVE_TEAM_SUGGESTIONS` na ordem
  // contra summary + description (case-insensitive). Primeira que casar vence.
  // Retorna o `value` do time (ex: "IS-SHIP-NATS-N1") ou null se nada bater.
  function suggestTeamForText(text){
    if(!Array.isArray(DERIVE_TEAM_SUGGESTIONS) || !DERIVE_TEAM_SUGGESTIONS.length) return null;
    const t = String(text || '').toLowerCase();
    if(!t.trim()) return null;
    for(const rule of DERIVE_TEAM_SUGGESTIONS){
      const kw = String(rule.keyword || '').toLowerCase().trim();
      if(!kw) continue;
      if(t.includes(kw)) return String(rule.team || '').trim() || null;
    }
    return null;
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

      // Calcula sugestao de time baseada no summary + description (best-effort).
      let suggestedTeamValue = null;
      try{
        const issue = await getIssueFields(issueKey, ['summary', 'description']);
        const summary = String(issue?.fields?.summary || '');
        const descText = descriptionToText(issue?.fields?.description) || '';
        suggestedTeamValue = suggestTeamForText(`${summary}\n${descText}`);
        // Garante que o time sugerido esta na lista filtrada (allowlist)
        if(suggestedTeamValue && !teams.find(t => t.value === suggestedTeamValue)){
          suggestedTeamValue = null;
        }
      }catch(e){ console.warn('[jira-localidade] sugestao de time falhou:', e); }

      openDeriveModal({
        teams,
        suggestedTeamValue,
        onSubmit: async ({ team, comment, createIssTask }) => {
          // 1) Derivar primeiro (fonte da verdade). Se falhar, lanca erro pro
          // handler do botao reabilitar a UI e mostrar mensagem.
          await jiraDoDerive(issueKey, deriveTr.id, team.id, comment || DERIVE_COMMENT_DEFAULT);

          // 1.4) Unassign best-effort (libera ticket pra fila do novo time)
          let unassignMsg = '';
          if(DERIVE_UNASSIGN_AFTER){
            try{
              await jiraUnassign(issueKey);
              unassignMsg = `\nAssignee removido (ticket liberado pra fila do novo time).`;
            }catch(e){
              console.warn('[jira-localidade][derive] unassign falhou (nao critico):', e);
              unassignMsg = `\n[!] Nao foi possivel remover seu nome como responsavel: ${e.message || e}`;
            }
          }

          // 1.5) Unwatch best-effort com retry (nao bloqueia se falhar)
          let unwatchMsg = '';
          if(DERIVE_UNWATCH_AFTER){
            try{
              const me = await jiraGetMyself();
              const res = await jiraUnwatchIssueRobust(issueKey, me.accountId);
              if(res.ok){
                unwatchMsg = `\nVoce parou de acompanhar este ticket${res.attempts > 1 ? ` (${res.attempts} tentativa(s) por causa do auto-watch do Jira)` : ''}.`;
              } else {
                unwatchMsg = `\n[!] Voce CONTINUA como watcher mesmo apos ${res.attempts} tentativa(s).\n` +
                  `O Jira esta re-adicionando voce automaticamente (configuracao pessoal "Autowatch").\n` +
                  `Solucao definitiva: acesse Perfil > Personal Settings > desmarque "Autowatch".`;
              }
            }catch(e){
              console.warn('[jira-localidade][derive] unwatch falhou (nao critico):', e);
              unwatchMsg = `\n[!] Falha ao remover watcher: ${e.message || e}`;
            }
          }

          // 2) Se o checkbox NAO estava marcado, finaliza so com toast + reload.
          if(!createIssTask){
            showDeriveSuccessToast(`Derivado para ${team.value}.${unassignMsg}${unwatchMsg}`);
            scheduleReloadAfterDerive();
            return;
          }

          // 3) Criar tarefa ISS vinculada
          try{
            const { newKey, linkType, attachmentsReport, commentsReport, descReport, template } = await createIssTaskFromIssue(issueKey);
            const link = `${location.origin}/browse/${newKey}`;

            // Comentario interno no ticket ORIGINAL (best-effort)
            try{
              await addInternalComment(issueKey, `Tarefa de troubleshooting criada e vinculada: ${newKey} (${link}).`);
            }catch(e){
              console.warn('[jira-localidade] falha ao comentar no ticket original:', e);
            }

            // Detalhes vao pro console pra debug, toast mostra o essencial
            console.log('[jira-localidade][derive] sucesso:', {
              source: issueKey, target: team.value, newKey, linkType,
              attachmentsReport, commentsReport, descReport
            });

            const extras = [];
            if(attachmentsReport && attachmentsReport.copied > 0) extras.push(`${attachmentsReport.copied} anexo(s)`);
            if(commentsReport && commentsReport.copied > 0) extras.push(`${commentsReport.copied} comentario(s)`);
            const extrasTxt = extras.length ? ` (${extras.join(' + ')})` : '';
            const tmplLine = (template && template.source === 'rule' && template.ruleLabel)
              ? `\nTemplate: ${template.ruleLabel} (${template.key})`
              : '';

            // Abre ISS em nova aba imediatamente (sem confirm bloqueante)
            window.open(link, '_blank', 'noopener');
            showDeriveSuccessToast(`Derivado + ISS ${newKey} criada${extrasTxt}. Aberta em nova aba.${tmplLine}`);
            scheduleReloadAfterDerive();
          }catch(e){
            // Caso a ISS falhe mas o derive ja foi - importante alertar com modal pra nao perder
            console.error('[jira-localidade][derive] derive OK mas ISS falhou:', e);
            alert(`Derivado com sucesso, MAS falhou ao criar tarefa ISS:\n\n${e.message || e}\n\nVoce pode criar a tarefa manualmente ou tentar novamente.`);
            scheduleReloadAfterDerive();
          }
        }
      });
    }catch(e){
      alert('Falha ao abrir derivação: ' + (e.message || e));
    }
  }
