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
      await onSubmit({ team: selected, comment, createIssTask });
      close();
    });

    document.body.appendChild(overlay);
    document.body.appendChild(modal);
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
          // 1) Derivar primeiro (fonte da verdade). Se falhar, abortar.
          try{
            await jiraDoDerive(issueKey, deriveTr.id, team.id, comment || DERIVE_COMMENT_DEFAULT);
          }catch(e){
            alert('Falha ao derivar: ' + (e.message || e));
            return;
          }

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

          // 2) Se o checkbox estava marcado, tentar criar a tarefa ISS.
          if(!createIssTask){
            alert('Derivado com sucesso.' + unassignMsg + unwatchMsg);
            return;
          }

          try{
            const { newKey, linkType, attachmentsReport, commentsReport, descReport } = await createIssTaskFromIssue(issueKey);
            const link = `${location.origin}/browse/${newKey}`;

            // Adiciona comentario interno no ticket ORIGINAL avisando que a tarefa foi criada.
            // Best-effort: nao falha o fluxo se nao conseguir.
            let originalCommentOk = false;
            try{
              await addInternalComment(issueKey, `Tarefa de troubleshooting criada e vinculada: ${newKey} (${link}).`);
              originalCommentOk = true;
            }catch(e){
              console.warn('[jira-localidade] falha ao comentar no ticket original:', e);
            }

            let msg = `Derivado com sucesso.${unassignMsg}${unwatchMsg}\nTarefa ${newKey} criada e vinculada (${linkType}).`;
            if(originalCommentOk){
              msg += `\nComentario adicionado em ${issueKey} mencionando ${newKey}.`;
            }

            if(descReport){
              if(descReport.method === 'skipped'){
                msg += `\nDescricao: ticket original sem descricao para copiar.`;
              } else if(descReport.method === 'update-after-create'){
                const isPlain = /texto puro/i.test(descReport.detail);
                msg += `\nDescricao: copiada${isPlain ? ' (texto puro - formato simplificado)' : ' integralmente'}.`;
              } else if(descReport.method === 'comment-fallback'){
                msg += `\nDescricao: nao foi possivel setar no campo. Adicionada como COMENTARIO em ${newKey}.`;
              } else if(descReport.method === 'failed'){
                msg += `\n[!] Descricao NAO foi copiada (plugin bloqueou tudo). Edite manualmente.`;
              }
            }
            if(attachmentsReport && !attachmentsReport.skipped){
              if(attachmentsReport.total === 0){
                msg += `\nNenhum anexo no ticket original.`;
              } else if(attachmentsReport.errors.length){
                msg += `\nAnexos: ${attachmentsReport.copied}/${attachmentsReport.total} copiados (${attachmentsReport.errors.length} falha(s) - ver console).`;
              } else {
                msg += `\nAnexos: ${attachmentsReport.copied}/${attachmentsReport.total} copiados.`;
              }
            }
            if(commentsReport){
              if(commentsReport.mode === 'skipped-empty'){
                msg += `\nComentarios: ticket origem sem comentarios.`;
              } else if(commentsReport.mode === 'skipped-disabled'){
                // nao mostra nada (feature desligada)
              } else if(commentsReport.error){
                msg += `\n[!] Comentarios: falha ao copiar (${commentsReport.error}).`;
              } else {
                msg += `\nComentarios: ${commentsReport.copied} herdado(s) (digest interno adicionado em ${newKey}).`;
              }
            }
            msg += `\n\nAbrir ${newKey} em nova aba?`;
            if(confirm(msg)){
              window.open(link, '_blank', 'noopener');
            }
          }catch(e){
            alert(`Derivado com sucesso, MAS falhou ao criar tarefa ISS:\n\n${e.message || e}\n\nVoce pode criar a tarefa manualmente ou tentar novamente.`);
          }
        }
      });
    }catch(e){
      alert('Falha ao abrir derivação: ' + (e.message || e));
    }
  }
