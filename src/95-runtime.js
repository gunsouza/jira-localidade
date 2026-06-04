  // =========================
  // RUNTIME — botão flutuante, atalho de teclado, bootstrap
  // =========================
  async function runApp(){
    const issueKey = getIssueKey();
    if(!issueKey){
      // Sem ticket aberto: abre o modal mesmo assim com um conteudo neutro,
      // dando acesso ao botao de Configuracoes (gear) no header e a busca por key.
      const modal = openModal('Localidade', 'Nenhum ticket detectado nesta pagina.');
      modal.setBody(`
        <div style="padding: 14px 0;">
          <div style="background:var(--ml-bg-2); border:1px dashed var(--ml-border); border-radius:8px; padding:16px; margin-bottom:14px;">
            <div style="font-weight:700; margin-bottom:6px;">Sem ticket aberto</div>
            <div class="meta" style="margin-bottom:10px;">
              As acoes principais (Duplicados, Derivar, Criar ISS, Mudar Status) precisam de um ticket aberto.
              Abra um chamado <code>/browse/XXX-123</code> ou use o <b>Gerenciador de fila</b> em uma tela de fila/busca.
            </div>
            <div style="font-size:12px; color:var(--ml-text-mut);">
              Por enquanto voce pode acessar as <b>&#9881; Configuracoes</b> no canto superior direito deste modal.
            </div>
          </div>

          <div style="margin-bottom:10px;">
            <label style="display:block; font-size:12px; font-weight:700; color:var(--ml-text-mut); margin-bottom:6px;">
              Abrir ticket diretamente (cole a key):
            </label>
            <div style="display:flex; gap:8px;">
              <input id="ml_loc_jumpkey" type="text" placeholder="Ex: IS-123456" style="flex:1; background:var(--ml-bg-0); color:var(--ml-text); border:1px solid var(--ml-border-2); border-radius:6px; padding:9px 12px; font-size:13px;" />
              <button id="ml_loc_jumpgo" class="primary">Abrir</button>
            </div>
            <div class="meta" style="margin-top:6px;">Abre em nova aba.</div>
          </div>
        </div>
      `);
      const jumpInput = document.getElementById('ml_loc_jumpkey');
      const jumpBtn   = document.getElementById('ml_loc_jumpgo');
      const goJump = () => {
        const k = String(jumpInput.value || '').trim().toUpperCase();
        if(!/^[A-Z]+-\d+$/.test(k)){ jumpInput.focus(); return; }
        window.open(`${location.origin}/browse/${k}`, '_blank', 'noopener');
      };
      jumpBtn?.addEventListener('click', goJump);
      jumpInput?.addEventListener('keydown', (e) => { if(e.key === 'Enter'){ e.preventDefault(); goJump(); } });
      setTimeout(() => jumpInput?.focus(), 50);
      return;
    }
    const modal = openModal('Localidade', `Ticket atual: ${issueKey}`);
    await renderHome(modal, issueKey);
  }

  function toggleApp(){
    if(isModalOpen()){
      closeModal();
    } else {
      runApp();
    }
  }

  function ensureButton(){
    ensureStyle();
    if(document.getElementById(IDS.btn)) return;
    const b = document.createElement('button');
    b.id = IDS.btn;
    b.textContent = 'Localidade';
    b.title = `Ações por localidade (duplicados/derivar) — atalhos: ${SHORTCUTS.join(' ou ')}`;
    b.addEventListener('click', runApp);
    document.body.appendChild(b);
  }

  const _tick = () => {
    const key = getIssueKey();
    if(key) ensureButton();
    else document.getElementById(IDS.btn)?.remove();
    // Botao "Gerenciador" aparece em /issues e /queues (independente de ter ticket aberto).
    try { ensureBatchButton(); } catch(_) {}
    // Botao "Status" (antigo "Atribuir & iniciar") so em paginas de issue individual.
    try { ensureStatusButton(); } catch(_) {}
    // Chip(s) lateral(is) com link de Tshoot do Confluence (se alguma regra matchar).
    try { ensureConfluenceChip(); } catch(_) {}
    // Botao "Comentario rapido" so em paginas de issue individual.
    try { ensureQuickCommentButton(); } catch(_) {}
  };

  // Atalhos de teclado globais (ignora quando focado em input/textarea/contenteditable).
  const _parsedShortcuts = parseShortcuts(SHORTCUTS);
  const _parsedStatusMenuShortcuts = parseShortcuts(STATUS_MENU_SHORTCUTS);
  const _parsedQuickCommentShortcuts = parseShortcuts(QUICK_COMMENT_SHORTCUTS);
  document.addEventListener('keydown', (ev) => {
    if(isTypingTarget(ev.target)) return;

    // Localidade (funciona mesmo sem ticket: abre modal neutro com acesso a Configuracoes)
    if(_parsedShortcuts.length && matchesAnyShortcut(ev, _parsedShortcuts)){
      ev.preventDefault();
      ev.stopPropagation();
      toggleApp();
      return;
    }

    // Menu de Status (abre menu se >1 acao; executa direto se 1; oferece config se 0)
    if(_parsedStatusMenuShortcuts.length && matchesAnyShortcut(ev, _parsedStatusMenuShortcuts)){
      const key = getIssueKey();
      if(!key) return;
      ev.preventDefault();
      ev.stopPropagation();
      openStatusMenu(key);
      return;
    }

    // Comentario rapido
    if(_parsedQuickCommentShortcuts.length && matchesAnyShortcut(ev, _parsedQuickCommentShortcuts)){
      const key = getIssueKey();
      if(!key) return;
      ev.preventDefault();
      ev.stopPropagation();
      openQuickCommentPopover();
      return;
    }
  }, true);

  _tick();
  setInterval(_tick, 1000);

  // Lembrete periodico de backup das configs (configs ficam so neste navegador).
  try { maybeShowBackupReminder(); } catch(_) {}
