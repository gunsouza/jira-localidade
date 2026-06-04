  // =========================
  // ACOES DE STATUS (antigo "Atribuir & iniciar")
  //
  // O usuario cadastra varias acoes em Configuracoes -> Acoes de Status.
  // Cada acao tem:
  //   - label:      texto que aparece no menu (ex: "Em andamento", "Waiting for customer")
  //   - transition: nome EXATO da transicao no Jira
  //   - comment:    mensagem (multilinha) que vai no comentario da transicao
  //   - internal:   true=obs interna; false=publico (visivel ao cliente)
  //   - assignToMe: true=atribui o ticket pra voce antes da transicao
  //
  // O botao flutuante verde "Mudar status":
  //   - 0 acoes: oferece abrir Configuracoes
  //   - 1 acao : mostra o nome da acao e executa direto
  //   - N acoes: mostra "Mudar status (N)" e abre menu pra escolher
  //
  // Fluxo de execucao (por acao):
  //   1) GET  /rest/api/3/myself
  //   2) GET  /rest/api/3/issue/{key}/transitions?expand=transitions.fields
  //   3) (opcional) PUT /rest/api/3/issue/{key}/assignee
  //   4) (se houver campos required) modal generico pra preencher
  //   5) POST /rest/api/3/issue/{key}/transitions
  //      -> comment + fields no MESMO payload (resolve validadores customizados)
  // =========================

  async function jiraAssignIssue(issueKey, accountId){
    const url = `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/assignee`;
    const r = await fetch(url, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Accept':'application/json', 'Content-Type':'application/json' },
      body: JSON.stringify({ accountId })
    });
    if(!r.ok){
      const txt = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status} ao atribuir ${issueKey}: ${txt.slice(0, 250)}`);
    }
    return true;
  }

  // Procura pela transicao desejada (nome configurado). Retorna undefined se nao achar.
  function pickTransitionByName(transitionsResponse, targetName){
    const transitions = transitionsResponse?.transitions || [];
    const target = String(targetName || '').trim().toLowerCase();
    if(!target) return undefined;
    return transitions.find(t => String(t.name || '').trim().toLowerCase() === target)
        || transitions.find(t => String(t.name || '').toLowerCase().includes(target));
  }

  // Aplica transicao com payload completo. opts:
  //   commentText?: string - vai como update.comment[].add
  //   internal?: boolean   - true => obs interna; false (default) => publico/visivel ao cliente
  //   fields?: object      - { fieldKey: value } para campos obrigatorios extras
  async function jiraApplyTransitionWithFields(issueKey, transitionId, opts){
    opts = opts || {};
    const url = `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`;
    const payload = { transition: { id: String(transitionId) } };
    if(opts.fields && Object.keys(opts.fields).length){
      payload.fields = opts.fields;
    }
    if(opts.commentText){
      payload.update = payload.update || {};
      const addObj = { body: textToAdfParagraphs(opts.commentText) };
      // Service Desk: usa property sd.public.comment para diferenciar publico/interno.
      // internal=true => obs interna; internal=false => publico (visivel ao cliente).
      addObj.properties = [{ key: "sd.public.comment", value: { internal: !!opts.internal } }];
      payload.update.comment = [{ add: addObj }];
    }
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Accept':'application/json', 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    if(!r.ok){
      const txt = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status} ao aplicar transicao em ${issueKey}: ${txt.slice(0, 350)}`);
    }
    return true;
  }

  // Modal dinamico para preencher os campos obrigatorios de uma transicao (alem de comment).
  // Recebe um map { fieldKey: fieldMeta } (apenas os required), defaults { me, defaultComment, internalComment }.
  // Retorna Promise<{ fields, comment } | null> (null = cancelado).
  function promptForTransitionFields(fieldsMap, opts){
    opts = opts || {};
    const me = opts.me || {};
    const defaultComment = String(opts.defaultComment || '');
    const internalComment = !!opts.internalComment;

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'mlCapOverlay';
      const modal = document.createElement('div');
      modal.className = 'mlCapModal';
      modal.style.maxWidth = 'min(560px, 96vw)';

      const fieldEntries = Object.entries(fieldsMap || {});
      const otherFields = fieldEntries.filter(([k]) => k !== 'comment');
      const needsComment = !!fieldsMap?.comment?.required;

      const renderField = ([key, meta]) => {
        const label = meta?.name || key;
        const type = meta?.schema?.type || 'string';
        const allowed = Array.isArray(meta?.allowedValues) ? meta.allowedValues : null;

        // Pre-preencher "responsavel" / "assignee" com o usuario logado
        const isUserField = (type === 'user' || /respons|asign|assign/i.test(label));
        const defaultUser = (isUserField && me.accountId) ? me.accountId : '';

        if(allowed && allowed.length){
          // Select com valores permitidos
          const opts = allowed.map(v => {
            const val = v.id || v.value || '';
            const lbl = v.name || v.value || v.id || '';
            return `<option value="${esc(String(val))}">${esc(String(lbl))}</option>`;
          }).join('');
          return `
            <div style="margin-bottom: 12px;">
              <label style="display:block;font-size:12px;font-weight:600;color:var(--ml-text-mut, #c1c5d2);margin-bottom:4px;">
                ${esc(label)} <span style="color:#fca5a5;">*</span>
              </label>
              <select data-fk="${esc(key)}" data-ftype="option" style="width:100%;background:var(--ml-bg-0, #0e111c);color:var(--ml-text);border:1px solid var(--ml-line);border-radius:8px;padding:8px 10px;font-size:13px;">
                <option value="">— escolha —</option>
                ${opts}
              </select>
            </div>`;
        }

        if(isUserField){
          return `
            <div style="margin-bottom: 12px;">
              <label style="display:block;font-size:12px;font-weight:600;color:var(--ml-text-mut, #c1c5d2);margin-bottom:4px;">
                ${esc(label)} <span style="color:#fca5a5;">*</span>
              </label>
              <input type="text" data-fk="${esc(key)}" data-ftype="user" value="${esc(defaultUser)}"
                placeholder="accountId do usuario"
                style="width:100%;background:var(--ml-bg-0, #0e111c);color:var(--ml-text);border:1px solid var(--ml-line);border-radius:8px;padding:8px 10px;font-size:13px;" />
              ${defaultUser ? `<div style="font-size:11px;color:var(--ml-text-dim, #a8aebd);margin-top:4px;">Pre-preenchido com voce (${esc(me.displayName || '')}).</div>` : ''}
            </div>`;
        }

        // Generico: text
        return `
          <div style="margin-bottom: 12px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--ml-text-mut, #c1c5d2);margin-bottom:4px;">
              ${esc(label)} <span style="color:#fca5a5;">*</span>
            </label>
            <input type="text" data-fk="${esc(key)}" data-ftype="string" value=""
              style="width:100%;background:var(--ml-bg-0, #0e111c);color:var(--ml-text);border:1px solid var(--ml-line);border-radius:8px;padding:8px 10px;font-size:13px;" />
          </div>`;
      };

      modal.innerHTML = `
        <div class="capHead">
          <div>
            <div class="capTitle">Campos obrigatorios da transicao</div>
            <div class="capMeta">Esta transicao do workflow exige os campos abaixo antes de aplicar.</div>
          </div>
          <div class="capActions">
            <button id="ml_ptf_cancel" class="ghost">Cancelar</button>
          </div>
        </div>
        <div class="capBody" style="padding-bottom: 16px;">
          ${otherFields.map(renderField).join('') || '<div class="muted" style="margin-bottom:8px;">Apenas o comentario e obrigatorio.</div>'}

          <div style="margin-bottom: 12px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--ml-text-mut, #c1c5d2);margin-bottom:4px;">
              Comentario
              ${internalComment
                ? '<span style="font-size:11px;font-weight:600;color:#fbbf24;margin-left:6px;">(obs INTERNA)</span>'
                : '<span style="font-size:11px;font-weight:600;color:#60a5fa;margin-left:6px;">(PUBLICO - visivel ao cliente)</span>'}
              ${needsComment ? '<span style="color:#fca5a5;margin-left:4px;">*</span>' : '<span style="font-size:11px;font-weight:400;color:var(--ml-text-dim);margin-left:4px;">(opcional)</span>'}
            </label>
            <textarea data-fk="comment" style="width:100%;min-height:80px;background:var(--ml-bg-0, #0e111c);color:var(--ml-text);border:1px solid var(--ml-line);border-radius:8px;padding:10px;font-family:inherit;font-size:13px;resize:vertical;">${esc(defaultComment)}</textarea>
            <div style="font-size:11px;color:var(--ml-text-dim, #a8aebd);margin-top:4px;">
              Voce pode mudar entre publico/interno em <b>Configuracoes &rarr; Atribuir &amp; iniciar</b>.
            </div>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
            <button id="ml_ptf_cancel2" class="ghost">Cancelar</button>
            <button id="ml_ptf_apply" class="primary">Aplicar transicao</button>
          </div>
        </div>
      `;
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const close = (val) => { overlay.remove(); resolve(val); };
      overlay.addEventListener('click', (e) => { if(e.target === overlay) close(null); });
      modal.querySelector('#ml_ptf_cancel').onclick = () => close(null);
      modal.querySelector('#ml_ptf_cancel2').onclick = () => close(null);

      modal.querySelector('#ml_ptf_apply').onclick = () => {
        const fields = {};
        let valid = true;
        for(const [key, meta] of otherFields){
          const el = modal.querySelector(`[data-fk="${CSS.escape(key)}"]`);
          if(!el) continue;
          const v = String(el.value || '').trim();
          if(!v){ valid = false; el.style.borderColor = '#fca5a5'; continue; }
          el.style.borderColor = '';

          const ftype = el.getAttribute('data-ftype');
          if(ftype === 'option'){
            // Determina se a transicao espera id (mais comum) ou value
            fields[key] = { id: v };
          } else if(ftype === 'user'){
            fields[key] = { accountId: v };
          } else {
            fields[key] = v;
          }
        }
        if(!valid){
          alert('Preencha todos os campos obrigatorios.');
          return;
        }
        const commentEl = modal.querySelector('[data-fk="comment"]');
        const comment = String(commentEl?.value || '').trim();
        if(needsComment && !comment){
          commentEl.style.borderColor = '#fca5a5';
          alert('O comentario e obrigatorio para esta transicao.');
          return;
        }
        close({ fields, comment });
      };
    });
  }

  // Le os fields da transicao (precisa de ?expand=transitions.fields no GET).
  // Retorna { [fieldKey]: meta } apenas dos required:true.
  function getRequiredFieldsOfTransition(trData, transitionId){
    const list = trData?.transitions || [];
    const t = list.find(x => String(x.id) === String(transitionId));
    const fields = t?.fields || {};
    const out = {};
    for(const [k, meta] of Object.entries(fields)){
      if(meta?.required) out[k] = meta;
    }
    return out;
  }

  // Modal pra escolher transicao quando a configurada nao existe naquele ticket.
  // Aparece como FALLBACK do menu "Mudar status" (acao com transicao invalida).
  // Retorna Promise<{ id, name } | null>. null = usuario cancelou.
  function pickTransitionInteractive(transitions, opts){
    opts = opts || {};
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'mlCapOverlay';
      overlay.id = 'ml_pick_tr_overlay';
      const modal = document.createElement('div');
      modal.className = 'mlCapModal';
      modal.style.maxWidth = 'min(560px, 96vw)';

      const triedName = String(opts.triedName || '').trim();

      modal.innerHTML = `
        <div class="ch">
          <div>
            <div class="title">Transicao "${esc(triedName || '?')}" nao existe neste ticket</div>
            <div class="subtitle">Escolha uma das transicoes disponiveis abaixo (sem mensagem padrao).<br>
              Pra evitar isso, abra <b>Configuracoes &rarr; Acoes de Status</b> e ajuste o nome da transicao.</div>
          </div>
          <button id="ml_pt_cancel" class="ghost">Cancelar (Esc)</button>
        </div>
        <div class="cb" style="overflow-y:auto;">
          ${transitions.length ? `
            <div style="display:flex; flex-direction: column; gap: 6px;">
              ${transitions.map(t => `
                <button class="ghost ml-pt-opt" data-id="${esc(String(t.id))}" data-name="${esc(t.name || '')}"
                  style="text-align:left; padding: 12px 14px; font-size: 13px;">
                  <b>${esc(t.name || '(sem nome)')}</b>
                  <span style="color: var(--ml-text-dim); font-size: 11.5px; margin-left: 6px;">
                    &rarr; ${esc(t.to?.name || '')}
                  </span>
                </button>
              `).join('')}
            </div>
          ` : `<div class="warn">Nenhuma transicao disponivel para este ticket.</div>`}
        </div>
      `;
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const close = (val) => {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
        resolve(val);
      };
      const onKey = (e) => { if(e.key === 'Escape') close(null); };
      document.addEventListener('keydown', onKey, true);
      modal.querySelector('#ml_pt_cancel').onclick = () => close(null);
      overlay.addEventListener('click', (e) => { if(e.target === overlay) close(null); });
      modal.querySelectorAll('.ml-pt-opt').forEach(b => {
        b.onclick = () => close({ id: b.getAttribute('data-id'), name: b.getAttribute('data-name') });
      });
    });
  }

  // Executa uma acao de status especifica.
  // action: { label, transition, comment, internal, assignToMe }
  // Estrategia robusta pra workflows com validadores customizados:
  //   1) Le transicoes com fields (?expand=transitions.fields)
  //   2) (opcional) Atribui o ticket pro usuario - se action.assignToMe
  //   3) Identifica campos required da transicao escolhida
  //   4) Se ha required nao-comment: abre modal pra preencher (com defaults inteligentes)
  //   5) Aplica transicao COM comment + fields no MESMO payload (resolve validadores)
  //   6) Se ainda falhar, faz fallback (tenta sem fields, depois mostra erro detalhado)
  async function runStatusAction(issueKey, action, opts){
    opts = opts || {};
    action = action || {};
    const log = (m) => console.log(`[jira-localidade][status][${action.label || '?'}] ${m}`);

    if(!action.transition) throw new Error('Acao sem nome de transicao configurado.');

    // 1) /myself
    const me = await jiraGetMyself();
    const accountId = me?.accountId;
    if(!accountId) throw new Error('Nao foi possivel identificar o usuario atual (/myself).');
    log(`me=${me.displayName} accountId=${accountId}`);

    // 2) Lista transicoes disponiveis
    const trData = await jiraGetTransitions(issueKey);
    const found = pickTransitionByName(trData, action.transition);
    let chosenTransition = null;
    if(found){
      chosenTransition = { id: found.id, name: found.name };
    } else {
      // Fallback interativo (transicao da acao nao existe neste ticket)
      const choice = await pickTransitionInteractive(trData?.transitions || [], { triedName: action.transition });
      if(!choice) throw new Error('cancelado');
      chosenTransition = choice;
    }
    log(`transition=${chosenTransition.name} (${chosenTransition.id})`);

    // 3) Le campos required da transicao
    const requiredFields = getRequiredFieldsOfTransition(trData, chosenTransition.id);
    const otherRequired = Object.fromEntries(
      Object.entries(requiredFields).filter(([k]) => k !== 'comment')
    );
    log(`required fields: ${Object.keys(requiredFields).join(', ') || '(nenhum)'}`);

    // 4) Atribui (se action.assignToMe)
    if(action.assignToMe !== false){
      await jiraAssignIssue(issueKey, accountId);
      log('assignee atualizado');
    }

    // 5) Monta comentario default + campos extras
    const defaultComment = String(opts.comment || action.comment || '').trim();
    let extraFields = {};
    let commentForTransition = defaultComment;
    const isInternal = action.internal === true;

    const hasOtherRequired = Object.keys(otherRequired).length > 0;
    const commentIsRequired = !!requiredFields?.comment?.required;

    if(hasOtherRequired || (commentIsRequired && !defaultComment)){
      const filled = await promptForTransitionFields(requiredFields, {
        me,
        defaultComment,
        internalComment: isInternal
      });
      if(!filled) throw new Error('cancelado');
      extraFields = filled.fields || {};
      if(filled.comment) commentForTransition = filled.comment;
    }

    // 6) Aplica transicao com comment + fields inline
    try{
      await jiraApplyTransitionWithFields(issueKey, chosenTransition.id, {
        commentText: commentForTransition,
        internal: isInternal,
        fields: extraFields
      });
      log(`transicao aplicada (comment ${isInternal ? 'INTERNO' : 'PUBLICO'} + fields inline)`);
    }catch(e){
      const msg = String(e?.message || '');
      const is400 = /HTTP 400/.test(msg);
      if(is400 && Object.keys(extraFields).length){
        log('400 com fields - tentando fallback sem fields...');
        try{
          await jiraApplyTransitionWithFields(issueKey, chosenTransition.id, {
            commentText: commentForTransition,
            internal: isInternal,
            fields: {}
          });
          log('transicao aplicada (fallback sem fields)');
        }catch(e2){
          throw new Error(`${e.message}\n\nFallback tambem falhou: ${e2.message}`);
        }
      } else {
        throw e;
      }
    }

    if(!opts.silent){
      alert(`${action.label || chosenTransition.name} aplicado em ${issueKey}.${action.assignToMe !== false ? `\nAtribuido a ${me.displayName}` : ''}\nStatus -> ${chosenTransition.name}`);
    }
    return { ok: true, transition: chosenTransition, accountId, displayName: me.displayName };
  }

  // Toast leve (top direito) que some sozinho. Usado apos aplicar status com sucesso.
  function showStatusAppliedToast(msg){
    try{
      document.getElementById('ml_st_toast')?.remove();
      const t = document.createElement('div');
      t.id = 'ml_st_toast';
      t.style.cssText = `
        position: fixed; top: 18px; right: 18px; z-index: 2147483647;
        background: linear-gradient(180deg, #2f8f48, #246a36);
        color: #fff; padding: 10px 16px; border-radius: 8px;
        border: 1px solid #2c7a3e; font: 600 12.5px var(--ml-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
        box-shadow: 0 8px 22px rgba(0,0,0,.4);
        animation: mlToastIn .25s cubic-bezier(.16,.84,.44,1);
      `;
      t.textContent = '\u2713 ' + String(msg || 'OK');
      document.body.appendChild(t);
      setTimeout(() => { t.style.transition = 'opacity .3s ease'; t.style.opacity = '0'; }, 2400);
      setTimeout(() => { t.remove(); }, 2900);
    }catch(_){}
  }

  // Helper: encontra a "acao cadastrada" pra uma transicao especifica.
  // Match por transition NAME (normalizado).
  function _findActionForTransition(transitionName){
    const norm = (s) => String(s || '').trim().toLowerCase();
    const target = norm(transitionName);
    if(!target) return null;
    const actions = Array.isArray(STATUS_ACTIONS) ? STATUS_ACTIONS : [];
    return actions.find(a => norm(a.transition) === target) || null;
  }

  // Modal unificado "Mudar status" (estilo Derivar).
  // - Carrega transicoes REAIS disponiveis no ticket (via API)
  // - Pra cada transicao, mostra um botao. Se ha acao cadastrada, exibe badge "mensagem pronta"
  // - Selecionar -> pre-preenche textarea com mensagem da acao + checkboxes (interno/atribuir)
  // - Aplicar -> runStatusAction com overrides do modal
  async function openStatusMenu(issueKey){
    if(!issueKey){
      alert('Nao consegui detectar o ticket atual.');
      return;
    }

    // Cleanup de versoes anteriores que ficaram em DOM
    document.getElementById('ml_status_menu_overlay')?.remove();
    document.getElementById('ml_status_modal')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'mlCapOverlay';
    overlay.id = 'ml_status_menu_overlay';

    const modal = document.createElement('div');
    modal.className = 'mlCapModal';
    modal.id = 'ml_status_modal';
    modal.style.cssText = 'max-width: min(720px, 96vw);';

    modal.innerHTML = `
      <div class="ch">
        <div>
          <div class="title">Mudar status &mdash; ${esc(issueKey)}</div>
          <div class="subtitle" id="ml_st_subtitle">Carregando transicoes disponiveis...</div>
        </div>
        <button id="ml_st_close" class="ghost">Fechar (Esc)</button>
      </div>
      <div class="cb" style="display:flex; flex-direction:column; gap:14px; overflow-y:auto;">
        <div>
          <div style="font-weight:700; margin-bottom:8px; font-size:12.5px; color:var(--ml-text-mut);">Selecione o novo status</div>
          <div id="ml_st_grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:8px;">
            <div style="grid-column: 1 / -1; padding: 24px; text-align:center; color:var(--ml-text-dim); border:1px dashed var(--ml-border); border-radius:8px;">
              <span class="ml-spinner">&#x21bb;</span> Carregando...
            </div>
          </div>
        </div>
        <div id="ml_st_details" style="display:none;">
          <div style="display:flex; gap:8px; align-items:baseline; margin-bottom:6px;">
            <span id="ml_st_msg_label" style="font-weight:700;">Comentario</span>
            <span id="ml_st_snip_wrap" style="margin-left:auto;"></span>
          </div>
          <textarea id="ml_st_comment" placeholder="Mensagem (opcional). Suporta /comandos de snippets." style="width:100%; min-height: 120px; padding:10px; border-radius:8px; border:1px solid var(--ml-border); background:var(--ml-bg-2); color:var(--ml-text); font-family: inherit; font-size: 12.5px; line-height: 1.45;"></textarea>
          <div id="ml_st_slash_hint" style="margin-top:4px;"></div>

          <div style="display:flex; gap:18px; margin-top:12px; flex-wrap:wrap; font-size:12.5px;">
            <label class="checkbox" style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" id="ml_st_internal" />
              <span>Comentario <b>INTERNO</b> (so a equipe ve)</span>
            </label>
            <label class="checkbox" style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" id="ml_st_assign" />
              <span>Atribuir o ticket <b>pra mim</b></span>
            </label>
          </div>
        </div>

        <div style="display:flex; gap:10px; justify-content:flex-end; padding-top:6px; border-top:1px solid var(--ml-border); margin-top:auto;">
          <button id="ml_st_settings" class="ghost">Editar acoes (settings)</button>
          <button id="ml_st_cancel" class="ghost">Cancelar</button>
          <button id="ml_st_apply" class="btnPrimary" disabled>Aplicar</button>
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const $ = (sel) => modal.querySelector(sel);
    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => { if(e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (e) => { if(e.target === overlay) close(); });
    $('#ml_st_close').onclick = close;
    $('#ml_st_cancel').onclick = close;
    $('#ml_st_settings').onclick = () => { close(); try{ openSettingsModal(); }catch(_){} };

    // Anexa snippets button + slash expander no textarea
    try{
      const ta = $('#ml_st_comment');
      const wrap = $('#ml_st_snip_wrap');
      if(ta && wrap){
        const sb = buildSnippetsButton(ta, { label: 'Snippets' });
        wrap.appendChild(sb);
      }
      if(ta){
        attachSlashExpander(ta);
        renderSlashCommandsHint($('#ml_st_slash_hint'), { textarea: ta });
      }
    }catch(_){}

    let selectedTransition = null; // { id, name, action? }

    const refreshDetails = () => {
      const details = $('#ml_st_details');
      const apply = $('#ml_st_apply');
      if(!selectedTransition){
        details.style.display = 'none';
        apply.disabled = true;
        return;
      }
      details.style.display = '';
      apply.disabled = false;
      const t = selectedTransition;
      const a = t.action || {};
      const ta = $('#ml_st_comment');
      const internalChk = $('#ml_st_internal');
      const assignChk = $('#ml_st_assign');
      // Pre-preenche somente se a textarea estiver vazia (ou eh primeira selecao)
      if(!ta.value || ta.dataset.lastTr !== String(t.id)){
        ta.value = String(a.comment || '');
        ta.dataset.lastTr = String(t.id);
      }
      internalChk.checked = a.internal === true;
      assignChk.checked = a.assignToMe !== false;
      $('#ml_st_msg_label').innerHTML = `Comentario para <b>${esc(t.name)}</b>${a.label && a.label !== t.name ? ` <span style="color:var(--ml-text-dim);font-weight:400;">(acao "${esc(a.label)}")</span>` : ''}`;
    };

    const renderGrid = (transitions, statusName) => {
      const grid = $('#ml_st_grid');
      const subtitle = $('#ml_st_subtitle');
      if(statusName){
        subtitle.innerHTML = `Status atual: <b>${esc(statusName)}</b>. Selecione pra qual status mudar e edite a mensagem antes de aplicar.`;
      } else {
        subtitle.textContent = 'Selecione pra qual status mudar e edite a mensagem antes de aplicar.';
      }

      // Filtra transicoes que devem ficar escondidas (admin define via STATUS_HIDDEN_TRANSITIONS)
      const normTr = (s) => String(s || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[\s\-_/]+/g, ' ').trim();
      const hidden = new Set((STATUS_HIDDEN_TRANSITIONS || []).map(normTr));
      const visible = transitions.filter(t => !hidden.has(normTr(t.name)));

      if(!visible.length){
        grid.innerHTML = `<div style="grid-column: 1 / -1; padding: 24px; text-align:center; color:#fca5a5; border:1px dashed var(--ml-border); border-radius:8px;">Nenhuma transicao disponivel neste ticket.</div>`;
        return;
      }

      // Anota cada transicao com a acao cadastrada (se houver)
      const annotated = visible.map(t => ({
        id: String(t.id),
        name: String(t.name || ''),
        toName: String(t.to?.name || ''),
        action: _findActionForTransition(t.name)
      }));
      // Ordena: as com mensagem cadastrada primeiro
      annotated.sort((a, b) => {
        const aHasMsg = !!(a.action && String(a.action.comment || '').trim()) ? 1 : 0;
        const bHasMsg = !!(b.action && String(b.action.comment || '').trim()) ? 1 : 0;
        return bHasMsg - aHasMsg;
      });

      grid.innerHTML = annotated.map((t, i) => {
        const a = t.action;
        const msg = String(a?.comment || '').trim();
        const tags = [];
        if(a?.internal) tags.push(`<span style="background:rgba(251,191,36,0.18);color:#fbbf24;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;">INTERNA</span>`);
        if(a && a.assignToMe !== false) tags.push(`<span style="background:rgba(34,197,94,0.18);color:#22c55e;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;">ATRIBUIR</span>`);
        return `
          <button type="button" class="ml-st-opt" data-idx="${i}"
            style="text-align:left; padding:10px 12px; border-radius:8px;
                   background: var(--ml-bg-2); color: var(--ml-text);
                   border:1px solid var(--ml-border); cursor:pointer; font: inherit;
                   transition: background .12s, border-color .12s;
                   display: flex; flex-direction: column; gap: 6px;">
            <div style="font-weight:700; font-size: 12.5px;">${esc(a?.label || t.name)}</div>
            <div style="font-size: 10.5px; color: var(--ml-text-dim); font-family: var(--ml-mono);">
              ${esc(t.name)}${t.toName ? ` &rarr; ${esc(t.toName)}` : ''}
            </div>
            ${msg ? `
              <div style="font-size:11px; color:var(--ml-text-mut); line-height:1.45;
                          background: rgba(96,165,250,0.08); border-left: 2px solid #60a5fa;
                          padding: 5px 8px; border-radius: 4px;
                          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
                          white-space: pre-wrap;">${esc(msg)}</div>
            ` : `
              <div style="font-size:10.5px; color:var(--ml-text-dim); font-style:italic;">
                ${a ? '(sem mensagem padrao - voce escreve na hora)' : '(sem cadastro - voce escreve na hora)'}
              </div>
            `}
            ${tags.length ? `<div style="display:flex; gap:4px; flex-wrap:wrap;">${tags.join('')}</div>` : ''}
          </button>
        `;
      }).join('');

      grid.querySelectorAll('.ml-st-opt').forEach(btn => {
        btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--ml-bg-3, #1f2433)'; btn.style.borderColor = 'var(--ml-blue, #4f8cff)'; });
        btn.addEventListener('mouseleave', () => { if(!btn.classList.contains('active')){ btn.style.background = 'var(--ml-bg-2)'; btn.style.borderColor = 'var(--ml-border)'; } });
        btn.onclick = () => {
          const idx = Number(btn.getAttribute('data-idx'));
          selectedTransition = annotated[idx];
          grid.querySelectorAll('.ml-st-opt').forEach(b => {
            b.classList.remove('active');
            b.style.background = 'var(--ml-bg-2)';
            b.style.borderColor = 'var(--ml-border)';
          });
          btn.classList.add('active');
          btn.style.background = 'var(--ml-blue-soft, rgba(79,140,255,0.15))';
          btn.style.borderColor = 'var(--ml-blue, #4f8cff)';
          refreshDetails();
        };
      });
    };

    // Carrega transicoes + status atual em paralelo
    try{
      const [trData, issueData] = await Promise.all([
        jiraGetTransitions(issueKey),
        getIssueAllFields(issueKey).catch(() => null)
      ]);
      const transitions = trData?.transitions || [];
      const statusName = issueData?.fields?.status?.name || '';
      renderGrid(transitions, statusName);
    }catch(e){
      $('#ml_st_grid').innerHTML = `<div style="grid-column: 1 / -1; padding:16px; color:#fca5a5;">Erro ao carregar transicoes: ${esc(e.message || String(e))}</div>`;
    }

    // Apply
    $('#ml_st_apply').onclick = async () => {
      if(!selectedTransition) return;
      const t = selectedTransition;
      const a = t.action || {};
      const comment = String($('#ml_st_comment').value || '');
      const internal = !!$('#ml_st_internal').checked;
      const assignToMe = !!$('#ml_st_assign').checked;

      // Monta acao virtual com overrides do modal
      const effectiveAction = {
        label: a.label || t.name,
        transition: t.name,
        comment,
        internal,
        assignToMe
      };

      const applyBtn = $('#ml_st_apply');
      applyBtn.disabled = true;
      applyBtn.textContent = 'Aplicando...';

      try{
        await runStatusAction(issueKey, effectiveAction, { silent: true });
        close();
        // Pequeno toast no canto, nao bloqueante
        showStatusAppliedToast(`Status alterado pra "${t.toName || t.name}"`);
      }catch(e){
        if(String(e.message) !== 'cancelado'){
          alert(`Falha ao aplicar "${effectiveAction.label}": ${e.message || e}`);
        }
        applyBtn.disabled = false;
        applyBtn.textContent = 'Aplicar';
      }
    };
  }

  // Botao flutuante "Status" - so em pagina de issue individual.
  // Mantem ID antigo (ml_loc_assign_btn) pra nao acumular botoes em rebuilds.
  function ensureStatusButton(){
    const issueKey = getIssueKey();
    const existing = document.getElementById('ml_loc_assign_btn');
    if(!issueKey){
      existing?.remove();
      return;
    }
    if(existing) return;

    const actions = Array.isArray(STATUS_ACTIONS) ? STATUS_ACTIONS : [];
    const hasAny = actions.length > 0;

    const btn = document.createElement('button');
    btn.id = 'ml_loc_assign_btn';
    btn.type = 'button';
    // Texto: SEMPRE "Mudar status" pra deixar claro qual e a funcao do botao.
    // O nome da acao especifica aparece no menu (ou no title quando ha so 1).
    btn.textContent = '\u21bb Mudar status';
    btn.title = hasAny
      ? (actions.length === 1
        ? `Aplicar "${actions[0].label || actions[0].transition}" neste ticket`
        : `Abrir menu de ${actions.length} acao(oes) de status`)
      : 'Cadastre acoes em Configuracoes -> Acoes de Status';
    btn.style.cssText = `
      position: fixed; right: 18px; bottom: 78px; z-index: 2147483646;
      padding: 9px 16px; border-radius: 999px;
      border: 1px solid #2c7a3e;
      background: linear-gradient(180deg, #2f8f48, #246a36); color: #fff;
      font: 600 12.5px var(--ml-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      letter-spacing: .2px; cursor: pointer;
      box-shadow: 0 6px 16px rgba(0,0,0,.35);
      transition: transform .15s ease, box-shadow .2s ease, filter .15s ease;
    `;
    btn.onmouseenter = () => { btn.style.transform = 'translateY(-1px)'; btn.style.filter = 'brightness(1.05)'; };
    btn.onmouseleave = () => { btn.style.transform = ''; btn.style.filter = ''; };

    btn.onclick = () => openStatusMenu(getIssueKey());

    document.body.appendChild(btn);
  }

  // Aliases pra compat com codigo anterior (95-runtime.js)
  const ensureAssignAndStartButton = ensureStatusButton;
  async function runAssignAndStart(issueKey, opts){
    return openStatusMenu(issueKey);
  }
