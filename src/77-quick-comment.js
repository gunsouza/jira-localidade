  // =========================
  // COMENTARIO RAPIDO COM SNIPPET
  //
  // Popover compacto + atalho de teclado que permite postar uma observacao interna
  // no ticket atual em 1-2 cliques, sem abrir o modal Localidade.
  //
  // Fluxo:
  //   1) Usuario aciona (Alt+C / Cmd+Shift+C / botao flutuante)
  //   2) Popover abre no canto direito da tela
  //   3) Lista de snippets cadastrados (busca por nome)
  //   4) Clica num snippet -> texto carrega no textarea (editavel)
  //   5) Botao "Postar obs interna" -> POST /comment com properties internal=true
  // =========================

  // Le snippets do localStorage diretamente (versao mais fresca, caso usuario
  // tenha editado em outra aba).
  function _readSnippetsFresh(){
    try{
      const raw = localStorage.getItem('ml_loc_settings_v1');
      if(raw){
        const s = JSON.parse(raw);
        if(Array.isArray(s.COMMENT_SNIPPETS)){
          return s.COMMENT_SNIPPETS.filter(x => x && x.text);
        }
      }
    }catch(_){}
    return Array.isArray(COMMENT_SNIPPETS) ? COMMENT_SNIPPETS : [];
  }

  function _qcEsc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function openQuickCommentPopover(){
    const issueKey = getIssueKey();
    if(!issueKey){
      alert('Abra um ticket pra usar o comentario rapido.');
      return;
    }

    // Toggle se ja existe
    const existing = document.getElementById('ml_qc_overlay');
    if(existing){ existing.remove(); return; }

    ensureStyle();

    const overlay = document.createElement('div');
    overlay.id = 'ml_qc_overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(9, 12, 23, 0.45);
      backdrop-filter: blur(2px);
      z-index: 2147483647;
      display: flex; align-items: flex-start; justify-content: center;
      padding-top: 8vh;
      font-family: var(--ml-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
    `;

    const box = document.createElement('div');
    box.id = 'ml_qc_box';
    box.style.cssText = `
      background: var(--ml-panel, #161a26);
      color: var(--ml-text, #e6e9ef);
      border: 1px solid var(--ml-line, #242938);
      border-radius: 14px;
      padding: 18px 20px;
      max-width: min(620px, 96vw); width: 96%;
      box-shadow: 0 22px 60px rgba(0,0,0,.55);
      max-height: 80vh;
      overflow: auto;
    `;

    const snippets = _readSnippetsFresh();

    box.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <div style="font-weight:700;font-size:15px;">Comentario rapido em ${_qcEsc(issueKey)}</div>
        <span style="background: rgba(79,140,255,.18); color: var(--ml-blue, #4f8cff); padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;">obs interna</span>
        <button id="ml_qc_close" style="margin-left:auto;background:transparent;border:1px solid var(--ml-line, #242938);color:var(--ml-text-dim, #a8aebd);padding:4px 10px;border-radius:8px;cursor:pointer;font-size:12px;">Fechar (Esc)</button>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <input id="ml_qc_search" type="text" placeholder="Buscar snippet por nome..." autocomplete="off"
          style="flex:1;background:var(--ml-bg-0, #0e111c);color:var(--ml-text);border:1px solid var(--ml-line);border-radius:8px;padding:8px 12px;font-size:13px;outline:none;" />
        <button id="ml_qc_settings" class="ghost" style="font-size:12px;padding:6px 12px;" title="Editar snippets em Configuracoes">Editar lista</button>
      </div>

      <div id="ml_qc_list" style="display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto;margin-bottom:12px;border:1px solid var(--ml-line);border-radius:8px;padding:6px;background:var(--ml-bg-0, #0e111c);">
        ${snippets.length === 0
          ? `<div style="padding:24px 12px;text-align:center;color:var(--ml-text-dim, #a8aebd);font-size:12.5px;">
              Nenhum snippet cadastrado.<br/>
              <button id="ml_qc_settings_empty" class="primary" style="margin-top:10px;font-size:12px;padding:6px 14px;">Configurar agora</button>
            </div>`
          : snippets.map((s, i) => `
            <div class="ml-qc-row" data-idx="${i}" data-name="${_qcEsc((s.name || '').toLowerCase())}" data-text="${_qcEsc((s.text || '').toLowerCase())}" data-cmd="${_qcEsc((s.command || '').toLowerCase())}"
              style="padding:8px 10px;border-radius:6px;cursor:pointer;font-size:12.5px;">
              <div style="font-weight:600;margin-bottom:2px;display:flex;align-items:center;gap:6px;">
                <span>${_qcEsc(s.name || (s.text || '').slice(0, 30))}</span>
                ${s.command ? `<code style="font-size:10.5px;padding:1px 6px;border-radius:4px;background:rgba(79,140,255,0.16);color:var(--ml-blue, #4f8cff);font-family:var(--ml-mono, ui-monospace, monospace);">${_qcEsc(s.command)}</code>` : ''}
              </div>
              <div style="color:var(--ml-text-dim, #a8aebd);font-size:11.5px;line-height:1.4;
                display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                ${_qcEsc(s.text)}
              </div>
            </div>
          `).join('')
        }
      </div>

      <label style="font-size:12px;font-weight:600;color:var(--ml-text-mut, #c1c5d2);display:block;margin-bottom:6px;">
        Texto do coment&aacute;rio
        <span style="color:var(--ml-text-dim, #a8aebd);font-weight:400;">(edit&aacute;vel antes de postar)</span>
      </label>
      <textarea id="ml_qc_text" placeholder="Clique num snippet acima, digite /comando + Espaco, ou escreva direto..."
        style="width:100%;min-height:120px;background:var(--ml-bg-0, #0e111c);color:var(--ml-text);border:1px solid var(--ml-line);border-radius:8px;padding:10px 12px;font-family:inherit;font-size:13px;resize:vertical;outline:none;"></textarea>
      <div id="ml_qc_slash_hint"></div>

      <div id="ml_qc_status" style="margin-top:10px;font-size:12px;color:var(--ml-text-dim, #a8aebd);min-height:18px;"></div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
        <button id="ml_qc_cancel" class="ghost" style="font-size:12.5px;padding:6px 14px;">Cancelar</button>
        <button id="ml_qc_post" class="primary" style="font-size:12.5px;padding:6px 16px;">Postar obs interna (Cmd+Enter)</button>
      </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if(e.target === overlay) close(); });
    box.querySelector('#ml_qc_close').onclick = close;
    box.querySelector('#ml_qc_cancel').onclick = close;

    // Atalho Esc fecha (Cmd+Enter posta)
    const onKey = (e) => {
      if(e.key === 'Escape'){ e.preventDefault(); close(); document.removeEventListener('keydown', onKey, true); return; }
      if((e.metaKey || e.ctrlKey) && e.key === 'Enter'){
        e.preventDefault();
        box.querySelector('#ml_qc_post')?.click();
      }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('remove', () => document.removeEventListener('keydown', onKey, true));

    // Abrir settings
    const goSettings = () => {
      close();
      try{ openSettingsModal(); }catch(_){ alert('Abra Localidade -> engrenagem -> Snippets de comentario.'); }
    };
    box.querySelector('#ml_qc_settings').onclick = goSettings;
    box.querySelector('#ml_qc_settings_empty')?.addEventListener('click', goSettings);

    // Lista: clique carrega no textarea
    const ta = box.querySelector('#ml_qc_text');
    box.querySelectorAll('.ml-qc-row').forEach(row => {
      row.addEventListener('mouseenter', () => { row.style.background = 'var(--ml-line-soft, #1f2433)'; });
      row.addEventListener('mouseleave', () => { row.style.background = ''; });
      row.addEventListener('click', () => {
        const i = Number(row.getAttribute('data-idx'));
        const s = snippets[i];
        if(!s) return;
        ta.value = s.text;
        ta.focus();
        // Visual feedback
        box.querySelectorAll('.ml-qc-row').forEach(r => r.style.outline = '');
        row.style.outline = '2px solid var(--ml-blue, #4f8cff)';
      });
    });

    // Slash expander + hint dos /comandos
    try{
      attachSlashExpander(ta);
      const hintBox = box.querySelector('#ml_qc_slash_hint');
      if(hintBox) renderSlashCommandsHint(hintBox, { textarea: ta });
    }catch(_){}

    // Busca: filtra por nome, comando ou texto
    const search = box.querySelector('#ml_qc_search');
    search.addEventListener('input', () => {
      const q = String(search.value || '').toLowerCase().trim();
      box.querySelectorAll('.ml-qc-row').forEach(row => {
        if(!q){ row.style.display = ''; return; }
        const name = row.getAttribute('data-name') || '';
        const text = row.getAttribute('data-text') || '';
        const cmd  = row.getAttribute('data-cmd')  || '';
        row.style.display = (name.includes(q) || text.includes(q) || cmd.includes(q)) ? '' : 'none';
      });
    });
    setTimeout(() => search.focus(), 30);

    // Postar
    box.querySelector('#ml_qc_post').onclick = async () => {
      const txt = String(ta.value || '').trim();
      const status = box.querySelector('#ml_qc_status');
      if(!txt){
        status.style.color = '#fca5a5';
        status.textContent = 'Escreva ou selecione um snippet primeiro.';
        return;
      }
      const postBtn = box.querySelector('#ml_qc_post');
      postBtn.disabled = true;
      status.style.color = '';
      status.textContent = 'Postando...';
      try{
        await addInternalComment(issueKey, txt);
        status.style.color = '#86efac';
        status.textContent = `Postado em ${issueKey}.`;
        setTimeout(close, 700);
      }catch(e){
        status.style.color = '#fca5a5';
        status.textContent = 'Falha: ' + (e.message || e);
        postBtn.disabled = false;
      }
    };
  }

  // Botao flutuante de "Comentario rapido" foi REMOVIDO da UI em v1.17.3
  // (o local foi ocupado pelo chip Tshoot Confluence). O recurso continua disponivel
  // apenas via atalho de teclado (QUICK_COMMENT_SHORTCUTS, default Alt+C / Cmd+Shift+K).
  // Mantemos a funcao no-op pra nao quebrar callers existentes.
  function ensureQuickCommentButton(){
    // Garante que botao antigo de versoes anteriores seja removido se ainda estiver no DOM.
    document.getElementById('ml_loc_qc_btn')?.remove();
  }
