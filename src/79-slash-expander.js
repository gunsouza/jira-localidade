  // =========================
  // SLASH-COMMAND EXPANDER
  //
  // Permite digitar /comando + Espaco|Tab|Enter num textarea pra expandir
  // direto pelo texto do snippet correspondente.
  //
  // Uso:
  //   const detach = attachSlashExpander(textareaEl);
  //   detach(); // remove o listener depois
  //
  // Helpers:
  //   getSlashCommands() -> [{command, text, name}]
  //   renderSlashCommandsHint(parent) -> insere uma div com a lista
  // =========================

  function getSlashCommands(){
    let snips = [];
    try{
      const raw = localStorage.getItem('ml_loc_settings_v1');
      if(raw){
        const s = JSON.parse(raw);
        if(Array.isArray(s.COMMENT_SNIPPETS)) snips = s.COMMENT_SNIPPETS;
      }
    }catch(_){}
    if(!snips.length && Array.isArray(COMMENT_SNIPPETS)) snips = COMMENT_SNIPPETS;
    return snips
      .filter(s => s && s.text && s.command && /^\/[\w-]+$/.test(s.command))
      .map(s => ({ command: s.command, text: s.text, name: s.name || s.command }));
  }

  // Captura keydown nos triggers (Espaco, Tab, Enter). Verifica se a "palavra"
  // imediatamente antes do cursor e um comando valido. Se for, substitui pelo texto
  // e cancela o caractere disparador (pra evitar inserir o espaco depois do snippet).
  // Excecao: se o snippet termina com espaco/quebra de linha, deixamos o trigger ser inserido normalmente.
  function attachSlashExpander(textarea){
    if(!textarea) return () => {};

    const handler = (ev) => {
      // Triggers que disparam expansao: Space, Tab, Enter
      const trigger = (ev.key === ' ' ? 'space' : (ev.key === 'Tab' ? 'tab' : (ev.key === 'Enter' ? 'enter' : null)));
      if(!trigger) return;

      const start = textarea.selectionStart || 0;
      // So expandimos quando o cursor esta no fim da palavra (sem selecao)
      if(textarea.selectionEnd !== start) return;

      const value = String(textarea.value || '');
      const before = value.slice(0, start);
      const after = value.slice(start);

      // Procura a "palavra" iniciada por '/' imediatamente antes do cursor.
      // Aceita /[\w-]+ (letras, numeros, underscore, hifen).
      const m = before.match(/(^|\s)(\/[\w-]+)$/);
      if(!m) return;

      const tokenStart = before.length - m[2].length;
      const command = m[2];

      const commands = getSlashCommands();
      const found = commands.find(c => c.command.toLowerCase() === command.toLowerCase());
      if(!found) return;

      // Match! Expande.
      ev.preventDefault();
      // Mantem o caractere trigger so se for Enter (quebra de linha pode fazer sentido)
      // e se o snippet ja terminar com algo
      const replacement = found.text;
      const newValue = value.slice(0, tokenStart) + replacement + after;
      textarea.value = newValue;

      // Posiciona cursor logo apos o texto inserido
      const newPos = tokenStart + replacement.length;
      try { textarea.setSelectionRange(newPos, newPos); } catch(_){}

      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      // Toast visual rapido (opcional, sutil) - so se houver pai com posicionamento
      try{
        const flash = document.createElement('div');
        flash.textContent = `${command} expandido`;
        flash.style.cssText = `
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
          background: rgba(34, 197, 94, 0.92); color: #fff;
          padding: 6px 14px; border-radius: 999px;
          font: 600 12px var(--ml-font, system-ui);
          z-index: 2147483647; pointer-events: none;
          box-shadow: 0 6px 16px rgba(0,0,0,.35);
          animation: mlFlash 1100ms ease forwards;
        `;
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 1200);
      }catch(_){}
    };

    textarea.addEventListener('keydown', handler);
    return () => textarea.removeEventListener('keydown', handler);
  }

  // Renderiza um pequeno hint listando os comandos disponiveis (chips clicaveis).
  // Util colocar logo abaixo de um textarea com slash expander ativo.
  function renderSlashCommandsHint(parent, opts){
    if(!parent) return;
    opts = opts || {};
    const targetTextarea = opts.textarea;
    const cmds = getSlashCommands();
    if(!cmds.length){
      parent.innerHTML = `<div style="font-size:11px;color:var(--ml-text-dim, #a8aebd);margin-top:6px;">
        Cadastre <b>/comandos</b> em Configuracoes &rarr; Snippets pra expandir texto rapido aqui.
      </div>`;
      return;
    }
    const chips = cmds.map(c => `
      <button type="button" class="ml-slash-chip" data-cmd="${esc(c.command)}"
        title="${esc(c.name)} - ${esc(c.text.slice(0, 80))}${c.text.length > 80 ? '...' : ''}"
        style="font-family: var(--ml-mono, ui-monospace, monospace); font-size: 11px;
          padding: 3px 8px; border-radius: 999px;
          background: var(--ml-bg-0, #0e111c); color: var(--ml-blue, #4f8cff);
          border: 1px solid var(--ml-line, #242938); cursor: pointer; margin-right: 4px; margin-bottom: 4px;">
        ${esc(c.command)}
      </button>
    `).join('');
    parent.innerHTML = `
      <div style="font-size:11px;color:var(--ml-text-dim, #a8aebd);margin-top:6px;">
        Comandos disponiveis (digite e pressione Espaco):
      </div>
      <div style="margin-top:4px;display:flex;flex-wrap:wrap;">${chips}</div>
    `;
    if(targetTextarea){
      parent.querySelectorAll('.ml-slash-chip').forEach(b => {
        b.addEventListener('click', () => {
          const c = b.getAttribute('data-cmd');
          const found = cmds.find(x => x.command === c);
          if(!found) return;
          // Insere o texto direto (sem digitar o comando)
          const start = targetTextarea.selectionStart || 0;
          const v = String(targetTextarea.value || '');
          const newV = v.slice(0, start) + found.text + v.slice(start);
          targetTextarea.value = newV;
          const pos = start + found.text.length;
          try { targetTextarea.setSelectionRange(pos, pos); } catch(_){}
          targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));
          targetTextarea.focus();
        });
      });
    }
  }

  // CSS de animacao do flash (uma vez)
  (function(){
    if(document.getElementById('ml_slash_flash_anim')) return;
    const st = document.createElement('style');
    st.id = 'ml_slash_flash_anim';
    st.textContent = `@keyframes mlFlash {
      0%   { opacity: 0; transform: translateX(-50%) translateY(8px); }
      18%  { opacity: 1; transform: translateX(-50%) translateY(0); }
      80%  { opacity: 1; }
      100% { opacity: 0; transform: translateX(-50%) translateY(-6px); }
    }`;
    document.head.appendChild(st);
  })();
