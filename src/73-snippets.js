  // =========================
  // SNIPPETS DE COMENTARIO
  // Banco de textos pre-definidos por usuario (localStorage). Exposto como popover
  // ancorado em qualquer textarea do plugin atraves de attachSnippetsButton().
  // =========================

  // Helper: insere o snippet no textarea respeitando a escolha do usuario
  // (substituir / anexar / cancelar). Mostra um mini-prompt visual quando ja ha
  // texto digitado; se vazio, insere direto.
  function _applySnippetToTextarea(textarea, snippetText){
    return new Promise((resolve) => {
      const cur = String(textarea.value || '');
      if(!cur.trim()){
        textarea.value = snippetText;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
        resolve('inserted');
        return;
      }

      // Mini-modal pra escolher comportamento
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed; inset: 0;
        background: rgba(9, 12, 23, 0.55);
        backdrop-filter: blur(2px);
        z-index: 2147483647;
        display: flex; align-items: center; justify-content: center;
        font-family: var(--ml-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      `;
      const box = document.createElement('div');
      box.style.cssText = `
        background: var(--ml-panel, #161a26);
        color: var(--ml-text, #e6e9ef);
        border: 1px solid var(--ml-line, #242938);
        border-radius: 12px;
        padding: 18px 20px;
        max-width: 420px; width: 92%;
        box-shadow: 0 18px 50px rgba(0,0,0,.5);
      `;
      box.innerHTML = `
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 6px;">Inserir snippet</div>
        <div style="font-size: 12.5px; color: var(--ml-text-dim, #a8aebd); margin-bottom: 14px;">
          Ja existe texto neste campo. Como quer inserir o snippet?
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">
          <button data-act="cancel" class="ghost" style="font-size:12.5px;padding:6px 14px;">Cancelar</button>
          <button data-act="append" class="primary" style="font-size:12.5px;padding:6px 14px;">Adicionar no fim</button>
          <button data-act="replace" class="danger" style="font-size:12.5px;padding:6px 14px;">Substituir tudo</button>
        </div>
      `;
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      const close = (act) => {
        overlay.remove();
        if(act === 'append'){
          textarea.value = cur.replace(/\s+$/, '') + '\n\n' + snippetText;
        } else if(act === 'replace'){
          textarea.value = snippetText;
        } else {
          resolve('cancelled');
          return;
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
        resolve(act);
      };

      box.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-act]');
        if(b) close(b.getAttribute('data-act'));
      });
      overlay.addEventListener('click', (ev) => {
        if(ev.target === overlay) close('cancel');
      });
    });
  }

  // Cria um botao "Snippets" que, ao clicar, abre um popover ancorado proximo do textarea
  // listando os snippets salvos. Clicar num snippet chama _applySnippetToTextarea.
  // O botao retornado deve ser anexado pelo caller onde fizer sentido (acima/abaixo do textarea).
  function buildSnippetsButton(textarea, opts){
    opts = opts || {};
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost ml-snippets-btn';
    btn.textContent = opts.label || 'Snippets';
    btn.style.cssText = 'font-size:12px;padding:4px 10px;';

    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      // Re-le sempre (usuario pode ter editado no settings em outra aba)
      let snippets = [];
      try{
        const raw = localStorage.getItem('ml_loc_settings_v1');
        if(raw){
          const s = JSON.parse(raw);
          if(Array.isArray(s.COMMENT_SNIPPETS)){
            snippets = s.COMMENT_SNIPPETS.filter(x => x && x.text);
          }
        }
      }catch(_){}
      // Fallback ao que esta em memoria (caso settings ainda nao tenha sido salvo)
      if(!snippets.length && Array.isArray(COMMENT_SNIPPETS)){
        snippets = COMMENT_SNIPPETS;
      }

      // Remove popover existente se for o mesmo botao (toggle)
      const existing = document.getElementById('ml_snip_popover');
      if(existing && existing.dataset.owner === btn.dataset.uid){
        existing.remove();
        return;
      }
      existing?.remove();

      const uid = btn.dataset.uid || ('s' + Math.random().toString(36).slice(2));
      btn.dataset.uid = uid;

      const pop = document.createElement('div');
      pop.id = 'ml_snip_popover';
      pop.dataset.owner = uid;
      pop.style.cssText = `
        position: fixed;
        background: var(--ml-panel, #161a26);
        color: var(--ml-text, #e6e9ef);
        border: 1px solid var(--ml-line, #242938);
        border-radius: 10px;
        padding: 8px;
        max-width: 360px; width: 320px; max-height: 320px; overflow-y: auto;
        box-shadow: 0 14px 36px rgba(0,0,0,.45);
        z-index: 2147483647;
        font-family: var(--ml-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
        font-size: 12.5px;
      `;

      if(!snippets.length){
        pop.innerHTML = `
          <div style="padding: 14px 12px; color: var(--ml-text-dim, #a8aebd); text-align: center;">
            Nenhum snippet cadastrado.<br>
            <span style="font-size: 11px;">Configure em <b>Configuracoes &rarr; Snippets</b>.</span>
          </div>`;
      } else {
        pop.innerHTML = snippets.map((s, i) => `
          <div class="ml-snip-row" data-idx="${i}" style="
            padding: 8px 10px; border-radius: 7px; cursor: pointer;
            border-bottom: 1px solid var(--ml-line-soft, #1f2433);
          ">
            <div style="font-weight: 600; margin-bottom: 2px; display:flex; align-items: center; gap: 6px;">
              <span>${esc(s.name || (s.text || '').slice(0, 30))}</span>
              ${s.command ? `<code style="font-size:10.5px;padding:1px 6px;border-radius:4px;background:rgba(79,140,255,0.16);color:var(--ml-blue, #4f8cff);font-family:var(--ml-mono, ui-monospace, monospace);">${esc(s.command)}</code>` : ''}
            </div>
            <div style="color: var(--ml-text-dim, #a8aebd); font-size: 11.5px; line-height: 1.35;
              display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
              ${esc(s.text)}
            </div>
          </div>
        `).join('');
      }

      document.body.appendChild(pop);

      // Posiciona ancorado embaixo do botao (ou em cima se nao couber)
      const r = btn.getBoundingClientRect();
      pop.style.left = Math.max(8, Math.min(window.innerWidth - 340, r.left)) + 'px';
      const popH = pop.getBoundingClientRect().height;
      const below = r.bottom + 6;
      pop.style.top = (below + popH > window.innerHeight - 8 ? Math.max(8, r.top - popH - 6) : below) + 'px';

      // Hover style + click handler
      pop.querySelectorAll('.ml-snip-row').forEach(row => {
        row.addEventListener('mouseenter', () => { row.style.background = 'var(--ml-line-soft, #1f2433)'; });
        row.addEventListener('mouseleave', () => { row.style.background = ''; });
        row.addEventListener('click', async () => {
          const i = Number(row.getAttribute('data-idx'));
          const s = snippets[i];
          if(!s) return;
          pop.remove();
          await _applySnippetToTextarea(textarea, s.text);
        });
      });

      // Fechar ao clicar fora
      const onDocClick = (e) => {
        if(!pop.contains(e.target) && e.target !== btn){
          pop.remove();
          document.removeEventListener('click', onDocClick, true);
        }
      };
      setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
    });

    return btn;
  }

  // Conveniencia: ja anexa o botao "Snippets" depois (ou antes) do textarea informado.
  // place: 'after' (default) | 'before'. Retorna o botao criado.
  function attachSnippetsButton(textarea, place){
    if(!textarea) return null;
    const btn = buildSnippetsButton(textarea, {});
    btn.style.marginTop = '6px';
    if(place === 'before'){
      textarea.parentNode?.insertBefore(btn, textarea);
    } else {
      textarea.parentNode?.insertBefore(btn, textarea.nextSibling);
    }
    return btn;
  }
