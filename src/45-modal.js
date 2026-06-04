  // =========================
  // BASE MODAL
  // =========================
  function openModal(title, subtitle) {
    document.getElementById(IDS.modal)?.remove();
    document.getElementById(IDS.overlay)?.remove();

    ensureStyle();

    const overlay = document.createElement('div');
    overlay.id = IDS.overlay;

    const modal = document.createElement('div');
    modal.id = IDS.modal;
    modal.innerHTML = `
      <div class="h">
        <div>
          <div class="title"><span class="titleDot"></span>${esc(title)}</div>
          <div class="subtitle" id="ml_loc_sub">${esc(subtitle || '')}</div>
        </div>
        <div class="headerActions">
          <button id="ml_loc_settings" class="gear" title="Configuracoes">&#9881;</button>
          <button id="ml_loc_close">Fechar</button>
        </div>
      </div>
      <div class="b" id="ml_loc_body">Carregando…</div>
    `;

    const close = () => { modal.remove(); overlay.remove(); };
    overlay.addEventListener('click', close);
    modal.querySelector('#ml_loc_close').addEventListener('click', close);
    modal.querySelector('#ml_loc_settings').addEventListener('click', () => openSettingsModal());

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    return {
      setBody: (html) => { document.getElementById('ml_loc_body').innerHTML = html; },
      setSubtitle: (t) => { document.getElementById('ml_loc_sub').textContent = t; },
      close
    };
  }

  function closeModal(){
    document.getElementById(IDS.modal)?.remove();
    document.getElementById(IDS.overlay)?.remove();
  }

  function isModalOpen(){
    return !!document.getElementById(IDS.modal);
  }
