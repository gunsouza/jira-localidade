  // =========================
  // RUNTIME — botão flutuante, atalho de teclado, bootstrap
  // =========================
  async function runApp(){
    const issueKey = getIssueKey();
    if(!issueKey){
      alert('Abra um ticket (/browse/XXX-123) ou /queues/issue/XXX-123 para usar.');
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
    // Botao "Lote" aparece em /issues e /queues (independente de ter ticket aberto).
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

    // Localidade
    if(_parsedShortcuts.length && matchesAnyShortcut(ev, _parsedShortcuts)){
      const key = getIssueKey();
      if(!key) return;
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
