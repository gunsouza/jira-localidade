  // =========================
  // BACKUP REMINDER
  //
  // Configs ficam no localStorage do navegador. Pra evitar que o usuario perca tudo
  // (limpar cache, trocar PC, etc), avisamos periodicamente pra ele exportar (botao
  // Exportar em Settings gera um JSON com tudo).
  //
  // - Verifica no bootstrap: se faz mais de N dias do ultimo backup, mostra banner.
  // - Banner discreto no canto inferior direito, com botoes:
  //     [Exportar agora]  -> ja gera o download
  //     [Lembrar em 7 dias] -> snooza
  //     [Desativar lembrete] -> apaga reminder (pode reativar em Settings)
  // - O usuario marca "feito" automaticamente quando clica em Exportar no Settings.
  // =========================

  const _BR_KEY_LAST  = 'ml_loc_backup_last_at';     // ISO date string
  const _BR_KEY_SNOOZE = 'ml_loc_backup_snooze_until'; // ISO date string

  function markBackupDone(){
    try{ localStorage.setItem(_BR_KEY_LAST, new Date().toISOString()); }catch(_){}
    try{ localStorage.removeItem(_BR_KEY_SNOOZE); }catch(_){}
    document.getElementById('ml_backup_reminder')?.remove();
  }

  function snoozeBackupReminder(days){
    const d = Number(days) > 0 ? Number(days) : BACKUP_REMIND_SNOOZE_DAYS;
    const until = new Date(Date.now() + d * 24 * 60 * 60 * 1000);
    try{ localStorage.setItem(_BR_KEY_SNOOZE, until.toISOString()); }catch(_){}
    document.getElementById('ml_backup_reminder')?.remove();
  }

  function _daysSince(iso){
    if(!iso) return Infinity;
    const t = new Date(iso).getTime();
    if(!t) return Infinity;
    return (Date.now() - t) / (1000 * 60 * 60 * 24);
  }

  function shouldShowBackupReminder(){
    if(!BACKUP_REMIND_ENABLED) return false;
    // Se snoozado, aguarda
    try{
      const snz = localStorage.getItem(_BR_KEY_SNOOZE);
      if(snz){
        const t = new Date(snz).getTime();
        if(t && t > Date.now()) return false;
      }
    }catch(_){}
    // Ultimo backup
    let last = null;
    try{ last = localStorage.getItem(_BR_KEY_LAST); }catch(_){}
    // Se nunca exportou, considera baseado em quando o usuario instalou (LS_KEY criado).
    // Como nao temos data de "instalacao", usamos fallback: aguardamos pelo menos N dias
    // antes do primeiro lembrete, marcando "now" como referencia se nao existir.
    if(!last){
      try{ localStorage.setItem(_BR_KEY_LAST, new Date().toISOString()); }catch(_){}
      return false;
    }
    return _daysSince(last) >= BACKUP_REMIND_INTERVAL_DAYS;
  }

  // Exporta as configs em JSON (mesmo formato do botao Exportar do Settings).
  // Retorna true se OK.
  function _doBackupExport(){
    try{
      const raw = localStorage.getItem('ml_loc_settings_v1') || '{}';
      const obj = JSON.parse(raw);
      const payload = {
        _meta: {
          generator: 'jira-localidade',
          exportedAt: new Date().toISOString(),
          origin: location.origin
        },
        settings: obj
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jira-localidade-settings-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return true;
    }catch(e){
      console.warn('[jira-localidade][backup] falha ao exportar:', e);
      return false;
    }
  }

  function showBackupReminderBanner(){
    if(document.getElementById('ml_backup_reminder')) return;

    let lastIso = null;
    try{ lastIso = localStorage.getItem(_BR_KEY_LAST); }catch(_){}
    const daysAgo = lastIso ? Math.floor(_daysSince(lastIso)) : null;

    const banner = document.createElement('div');
    banner.id = 'ml_backup_reminder';
    banner.style.cssText = `
      position: fixed;
      bottom: 18px; left: 18px;
      z-index: 2147483646;
      max-width: min(380px, calc(100vw - 40px));
      background: linear-gradient(180deg, #1f2433, #161a26);
      color: var(--ml-text, #e6e9ef);
      border: 1px solid var(--ml-border, #2a2f40);
      border-left: 4px solid #fbbf24;
      border-radius: 12px;
      padding: 14px 16px;
      box-shadow: 0 12px 32px rgba(0,0,0,.5);
      font-family: var(--ml-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: 12.5px;
      line-height: 1.45;
      animation: mlBrIn .28s cubic-bezier(.16,.84,.44,1);
    `;
    const lastText = daysAgo == null
      ? 'voce ainda nao fez backup'
      : `ultimo backup ha <b>${daysAgo} dia${daysAgo === 1 ? '' : 's'}</b>`;
    banner.innerHTML = `
      <div style="display:flex; align-items:flex-start; gap:10px;">
        <div style="font-size:22px; line-height:1;">&#x1F4BE;</div>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:700; font-size:13px; margin-bottom:4px;">Hora de fazer backup das configuracoes!</div>
          <div style="color: var(--ml-text-mut, #a8aebd); margin-bottom: 10px;">
            Suas configs (snippets, atalhos, regras) ficam s&oacute; neste navegador &mdash; ${lastText}.<br/>
            Exporte agora pra n&atilde;o perder se limpar cache ou trocar de m&aacute;quina.
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button id="ml_br_export" style="
              background: linear-gradient(180deg, #4f8cff, #2c5fc7);
              color: #fff; border: 1px solid #2c5fc7;
              padding: 6px 12px; border-radius: 6px;
              font: 600 12px var(--ml-font); cursor: pointer;
            ">Exportar agora</button>
            <button id="ml_br_snooze" style="
              background: transparent; color: var(--ml-text-mut);
              border: 1px solid var(--ml-border, #2a2f40);
              padding: 6px 12px; border-radius: 6px;
              font: 500 12px var(--ml-font); cursor: pointer;
            ">Lembrar em ${BACKUP_REMIND_SNOOZE_DAYS} dias</button>
            <button id="ml_br_disable" style="
              background: transparent; color: var(--ml-text-dim, #8b92a3);
              border: 0; padding: 6px 4px; font: 500 11px var(--ml-font); cursor: pointer; text-decoration: underline;
            ">Desativar</button>
          </div>
        </div>
        <button id="ml_br_close" title="Fechar (sera mostrado novamente em breve)" style="
          background: transparent; color: var(--ml-text-dim); border: 0;
          font-size: 16px; cursor: pointer; line-height: 1; padding: 0;
        ">&times;</button>
      </div>
    `;

    document.body.appendChild(banner);

    banner.querySelector('#ml_br_export').onclick = () => {
      const ok = _doBackupExport();
      if(ok){
        markBackupDone();
        // Toast de confirmacao
        try{ if(typeof showStatusAppliedToast === 'function') showStatusAppliedToast('Backup exportado! Salve o arquivo em local seguro.'); }catch(_){}
      } else {
        alert('Falha ao exportar backup. Tente pelo Localidade > Configuracoes > Exportar.');
      }
    };
    banner.querySelector('#ml_br_snooze').onclick = () => snoozeBackupReminder();
    banner.querySelector('#ml_br_disable').onclick = () => {
      try{
        const cur = loadSettings();
        cur.BACKUP_REMIND_ENABLED = false;
        localStorage.setItem('ml_loc_settings_v1', JSON.stringify(cur));
      }catch(_){}
      document.getElementById('ml_backup_reminder')?.remove();
      alert('Lembrete de backup desativado.\n\nPra reativar, va em Localidade > Configuracoes > Avancado.');
    };
    banner.querySelector('#ml_br_close').onclick = () => {
      // Fecha sem snooze (vai aparecer de novo na proxima sessao)
      document.getElementById('ml_backup_reminder')?.remove();
    };
  }

  // Hook conveniente pro bootstrap chamar.
  // Atraso para nao competir com renderizacao inicial.
  function maybeShowBackupReminder(){
    try{
      if(!shouldShowBackupReminder()) return;
      // Aguarda 4s pra nao atrapalhar o load inicial do Jira
      setTimeout(() => {
        // Re-checa (usuario pode ter exportado no meio tempo)
        if(shouldShowBackupReminder()) showBackupReminderBanner();
      }, 4000);
    }catch(e){
      console.warn('[jira-localidade][backup] erro no reminder:', e);
    }
  }

  // Adiciona animacao CSS (1x)
  (function _addBackupReminderCSS(){
    if(document.getElementById('ml_br_css')) return;
    const s = document.createElement('style');
    s.id = 'ml_br_css';
    s.textContent = `
      @keyframes mlBrIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    `;
    document.head.appendChild(s);
  })();
