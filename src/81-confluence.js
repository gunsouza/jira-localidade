  // =========================
  // TSHOOT CONFLUENCE
  //
  // Le os campos do ticket atual e, se algum bater com uma regra em CONFLUENCE_RULES,
  // mostra um chip lateral com o link do procedimento no Confluence.
  //
  // Estrutura de cada regra (em SETTINGS.CONFLUENCE_RULES):
  //   { label, url, match: [{ field, value, mode? }, ...] }
  //
  // O 'field' pode ser:
  //   - Nome humano: "Object Type", "Problem Hardware", "Service", "Request Type" etc.
  //     (resolvido via expand=names do GET issue)
  //   - customfield_XXXX direto
  //
  // Inclui um INSPETOR de campos (modal) pra o usuario:
  //   1) Ver TODOS os campos do ticket aberto, com nome legivel + valor.
  //   2) Marcar quais campos virar criterios de match.
  //   3) Auto-gerar a regra (label + criterios prontos).
  // Acessivel via Configuracoes -> Tshoot Confluence -> "Inspecionar ticket atual".
  // =========================

  // --- Normalizacao de valores pra comparacao tolerante (case + acentos + hifens) ---
  function _confNorm(s){
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
      .toLowerCase()
      .replace(/[\s\-_/]+/g, ' ')                       // hifens/espacos viram 1 espaco
      .trim();
  }

  // Extrai valor "legivel" de um valor de field do Jira (pode ser objeto, array, string).
  // Lida com option {value, name}, user {displayName}, array de options, etc.
  function _confExtractFieldValue(v){
    if(v == null) return '';
    if(typeof v === 'string') return v;
    if(typeof v === 'number' || typeof v === 'boolean') return String(v);
    if(Array.isArray(v)){
      return v.map(_confExtractFieldValue).filter(Boolean).join(', ');
    }
    if(typeof v === 'object'){
      // Os campos mais comuns:
      if(v.value)       return String(v.value);
      if(v.name)        return String(v.name);
      if(v.displayName) return String(v.displayName);
      if(v.requestType?.name) return String(v.requestType.name); // sd request type
      if(v.label)       return String(v.label);
      return '';
    }
    return '';
  }

  // Resolve "Object Type" -> customfield_XXXX usando o expand=names do GET issue.
  // 'names' e o objeto { customfield_XXXX: "Object Type", summary: "Summary", ... }
  function _confResolveFieldKey(fieldNameOrKey, namesObj){
    const target = _confNorm(fieldNameOrKey);
    if(!target) return null;
    if(/^customfield_\d+$/i.test(fieldNameOrKey)) return fieldNameOrKey; // ja e a key
    if(!namesObj) return fieldNameOrKey; // fallback: tenta usar direto
    // Procura match case-insensitive nos names
    for(const [k, label] of Object.entries(namesObj)){
      if(_confNorm(label) === target) return k;
    }
    return null;
  }

  // Verifica se TODOS os criterios de uma regra batem com o issue.
  // Se debug=true, logga cada criterio (passou/falhou + esperado/obtido) no console.
  function _confRuleMatches(rule, issueData, debug){
    const fields = issueData?.fields || {};
    const names = issueData?.names || {};
    const log = (...args) => { if(debug) console.log('[jira-localidade][confluence]', ...args); };
    let allOk = true;
    for(const crit of (rule.match || [])){
      const key = _confResolveFieldKey(crit.field, names);
      if(!key){
        log(`  [${rule.label}] x criterio "${crit.field}": CAMPO NAO ENCONTRADO no issue (verifique nomes via expand=names)`);
        allOk = false;
        continue;
      }
      const raw = fields[key];
      const got = _confExtractFieldValue(raw);
      if(!got){
        log(`  [${rule.label}] x criterio "${crit.field}" (${key}): VAZIO no ticket`);
        allOk = false;
        continue;
      }
      const a = _confNorm(got);
      // value pode ser string OU array de strings (OR entre eles, igual SQL "IN").
      const candidates = Array.isArray(crit.value)
        ? crit.value.map(v => _confNorm(v))
        : [_confNorm(crit.value)];
      const ok = (crit.mode === 'contains')
        ? candidates.some(b => a.includes(b))
        : candidates.some(b => a === b);
      if(ok){
        log(`  [${rule.label}] OK ${crit.field} = "${got}"`);
      } else {
        const expected = Array.isArray(crit.value) ? `[${crit.value.join(', ')}]` : crit.value;
        log(`  [${rule.label}] x criterio "${crit.field}" (${key}): esperado=${expected}, obtido="${got}" (${a})`);
        allOk = false;
      }
    }
    return allOk;
  }

  // Cache simples por sessao do GET issue (eviTar refetch a cada _tick).
  const _CONF_ISSUE_CACHE = new Map();
  async function _confGetIssueData(issueKey){
    if(_CONF_ISSUE_CACHE.has(issueKey)) return _CONF_ISSUE_CACHE.get(issueKey);
    const p = (async () => {
      try{
        return await getIssueAllFields(issueKey);
      }catch(e){
        console.warn('[jira-localidade][confluence] falha lendo issue', issueKey, e);
        return null;
      }
    })();
    _CONF_ISSUE_CACHE.set(issueKey, p);
    // limpa cache em ~3min pra nao guardar pra sempre
    setTimeout(() => _CONF_ISSUE_CACHE.delete(issueKey), 3 * 60 * 1000);
    return p;
  }

  // Mantem os chips em sync com o ticket aberto + regras configuradas.
  // Idempotente (pode chamar a cada _tick sem custo se ja renderizou).
  let _CONF_LAST_RENDERED = { key: null, sig: null };
  async function ensureConfluenceChip(){
    const issueKey = getIssueKey();
    const wrapId = 'ml_loc_confluence_wrap';
    const existing = document.getElementById(wrapId);

    if(!issueKey){
      existing?.remove();
      _CONF_LAST_RENDERED = { key: null, sig: null };
      return;
    }

    // Filtra regras invisiveis (noChip=true). Essas existem so pra mapping ISS
    // (ex: "Camera CCTV", "Detector de Metales") e nao tem link de troubleshooting.
    const rules = (Array.isArray(CONFLUENCE_RULES) ? CONFLUENCE_RULES : []).filter(r => !r.noChip);
    if(!rules.length){
      existing?.remove();
      _CONF_LAST_RENDERED = { key: null, sig: null };
      return;
    }

    // Le os fields (cache de sessao)
    const issueData = await _confGetIssueData(issueKey);
    if(!issueData){ existing?.remove(); return; }

    // Quais regras batem? Loga detalhe so 1x por ticket pra ajudar debug.
    const debugNow = (_CONF_LAST_RENDERED.key !== issueKey);
    if(debugNow) console.log(`[jira-localidade][confluence] avaliando ${rules.length} regra(s) em ${issueKey}...`);
    const matched = rules.filter(r => _confRuleMatches(r, issueData, debugNow));
    if(debugNow){
      console.log(`[jira-localidade][confluence] resultado em ${issueKey}: ${matched.length} regra(s) bateram.`);
      // Se NENHUMA regra bateu, dumpa todos os campos preenchidos pra ajudar debug.
      if(!matched.length && rules.length){
        const fields = issueData?.fields || {};
        const names = issueData?.names || {};
        const dump = [];
        for(const [k, v] of Object.entries(fields)){
          const got = _confExtractFieldValue(v);
          if(!got) continue;
          if(got.length > 120) continue;
          dump.push({ field: names[k] || k, key: k, value: got });
        }
        console.log(`[jira-localidade][confluence] campos preenchidos em ${issueKey} (use o nome de "field" nas regras):`);
        console.table(dump);
      }
    }
    const sig = `${issueKey}|${matched.map(r => r.label + '@' + r.url).join('||')}`;

    if(_CONF_LAST_RENDERED.sig === sig && existing) return; // ja renderizado
    _CONF_LAST_RENDERED = { key: issueKey, sig };

    existing?.remove();
    if(!matched.length) return;

    // Empilha verticalmente no canto inferior direito, ACIMA do botao "Mudar status"
    // (Mudar status fica em bottom:78px; status menu shortcut acima em bottom:138px).
    const wrap = document.createElement('div');
    wrap.id = wrapId;
    wrap.style.cssText = `
      position: fixed;
      right: 18px;
      bottom: 138px;
      z-index: 2147483646;
      display: flex;
      flex-direction: column-reverse;
      gap: 8px;
      align-items: flex-end;
      font-family: var(--ml-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
    `;

    // Pequena util pra escurecer uma cor hex (#RRGGBB) -> gradiente do chip
    const _darken = (hex, pct) => {
      const m = /^#?([a-f0-9]{6})$/i.exec(String(hex || '').trim());
      if(!m) return hex || '#a87015';
      const n = parseInt(m[1], 16);
      const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - pct)));
      const g = Math.max(0, Math.round(((n >> 8)  & 255) * (1 - pct)));
      const b = Math.max(0, Math.round(( n        & 255) * (1 - pct)));
      return `rgb(${r},${g},${b})`;
    };
    // Heuristica: emoji costuma ter codepoint > 0x2300; letras/texto curto sao tratados diferente.
    const _isPureText = (s) => {
      if(!s) return false;
      const code = s.codePointAt(0) || 0;
      return code < 0x2300;
    };

    matched.forEach(r => {
      const chip = document.createElement('a');
      chip.href = r.url;
      chip.target = '_blank';
      chip.rel = 'noopener noreferrer';
      chip.title = `Tshoot: ${r.label} - Abrir no Confluence (nova aba)`;
      const icon = String(r.icon || '\u{1F4D6}');
      const color = String(r.color || '#d18a1f').trim();
      const colorDark = _darken(color, 0.25);
      const isText = _isPureText(icon);
      chip.style.cssText = `
        display: inline-flex; align-items: center; justify-content: center;
        width: 42px; height: 42px;
        border-radius: 50%;
        border: 1px solid ${colorDark};
        background: linear-gradient(180deg, ${color}, ${colorDark});
        color: #fff;
        font: ${isText ? '800 19px' : 'normal 20px'} var(--ml-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
        line-height: 1;
        letter-spacing: ${isText ? '0' : 'normal'};
        text-decoration: none;
        text-shadow: ${isText ? '0 1px 2px rgba(0,0,0,.35)' : 'none'};
        box-shadow: 0 6px 16px rgba(0,0,0,.35);
        transition: transform .15s ease, filter .15s ease;
        cursor: pointer;
      `;
      chip.textContent = icon;
      chip.onmouseenter = () => { chip.style.transform = 'translateY(-1px)'; chip.style.filter = 'brightness(1.08)'; };
      chip.onmouseleave = () => { chip.style.transform = ''; chip.style.filter = ''; };
      wrap.appendChild(chip);
    });

    document.body.appendChild(wrap);
  }

  // Limpa cache de issue (uso publico, ex: apos o usuario salvar settings).
  function clearConfluenceIssueCache(){
    _CONF_ISSUE_CACHE.clear();
    _CONF_LAST_RENDERED = { key: null, sig: null };
  }

  // Mostra modal com snippet JS pronto pra o admin colar em DEFAULTS.CONFLUENCE_RULES.
  function showAdminSnippetModal(rule){
    const iconLine = rule.icon ? `\n        icon:  ${JSON.stringify(rule.icon)},` : `\n        icon:  '\\u{1F4D6}', // emoji do chip (ex: \\u{1F6A8} sirene, \\u{1F4F9} camera, \\u{1F4F6} wifi)`;
    const snippet = `      {
        label: ${JSON.stringify(rule.label)},${iconLine}
        url:   ${JSON.stringify(rule.url)},
        match: [
${rule.match.map(c => `          { field: ${JSON.stringify(c.field)}, value: ${JSON.stringify(c.value)}${c.mode === 'contains' ? `, mode: 'contains'` : ''} }`).join(',\n')}
        ]
      },`;

      const overlay = document.createElement('div');
      overlay.className = 'mlCapOverlay';
      const modal = document.createElement('div');
      modal.className = 'mlCapModal';
      modal.style.cssText = 'max-width: min(720px, 96vw);';
      modal.innerHTML = `
        <div class="ch">
          <div>
            <div class="title">Snippet pronto pra colar</div>
            <div class="subtitle">Cole este bloco dentro de <code>DEFAULTS.CONFLUENCE_RULES</code> em
              <code>src/10-config.js</code>, rode <code>./build.sh</code> e distribua o novo userscript.</div>
          </div>
          <button id="ml_ass_close" class="ghost">Fechar (Esc)</button>
        </div>
        <div class="cb" style="display:flex; flex-direction:column; gap:10px;">
          <textarea id="ml_ass_snip" readonly rows="14" style="width:100%; font-family: var(--ml-mono); font-size: 12px; padding:10px; border-radius:8px; background:#000; color:#cbd5e1; border:1px solid var(--ml-border);">${esc(snippet)}</textarea>
          <div style="display:flex; gap:8px;">
            <button id="ml_ass_copy" class="btnPrimary">&#x1F4CB; Copiar pra clipboard</button>
            <div id="ml_ass_msg" style="align-self:center;font-size:11.5px;color:var(--ml-text-mut);"></div>
          </div>
          <div class="hint" style="font-size:11px; color:var(--ml-text-mut);">
            Localizacao no codigo:
            <code>src/10-config.js</code> &rarr; bloco <code>DEFAULTS = {...}</code> &rarr; key <code>CONFLUENCE_RULES: [</code>...adicione aqui<code>]</code>.
          </div>
        </div>
      `;
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const close = () => {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
      };
      const onKey = (e) => { if(e.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey, true);
      overlay.addEventListener('click', (e) => { if(e.target === overlay) close(); });
      modal.querySelector('#ml_ass_close').onclick = close;
      modal.querySelector('#ml_ass_copy').onclick = async () => {
        try{
          await navigator.clipboard.writeText(snippet);
          modal.querySelector('#ml_ass_msg').textContent = 'Copiado!';
          setTimeout(() => { try{ modal.querySelector('#ml_ass_msg').textContent = ''; }catch(_){}; }, 1800);
        }catch(e){
          const ta = modal.querySelector('#ml_ass_snip');
          ta.focus(); ta.select();
          modal.querySelector('#ml_ass_msg').textContent = 'Selecione e Cmd/Ctrl+C.';
        }
      };
  }

  // ===== INSPETOR DE CAMPOS =====
  // Abre modal que lista TODOS os campos preenchidos do ticket atual, com nome legivel.
  // Usuario marca quais virar criterio + escreve label + URL -> volta a regra montada.
  // Retorna Promise<rule | null>. rule = { label, url, match: [{field, value}, ...] }
  function openConfluenceFieldInspector(prefillIssueKey){
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'mlCapOverlay';
      overlay.id = 'ml_conf_insp_overlay';
      const modal = document.createElement('div');
      modal.className = 'mlCapModal';
      modal.style.cssText = 'max-width: min(780px, 96vw);';
      modal.innerHTML = `
        <div class="ch">
          <div>
            <div class="title">Inspecionar campos do ticket</div>
            <div class="subtitle">Cole a chave do ticket (ex: IS-1031430) e clique <b>Carregar</b>.
              Depois, marque os campos que devem virar criterios da regra Tshoot.</div>
          </div>
          <button id="ml_ci_cancel" class="ghost">Cancelar (Esc)</button>
        </div>
        <div class="cb" style="overflow-y:auto; display:flex; flex-direction:column; gap:14px;">
          <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
            <div style="flex:1; min-width:220px;">
              <div style="font-size:11.5px; color:var(--ml-text-mut, #888); margin-bottom:4px;">Chave do ticket</div>
              <input id="ml_ci_key" type="text" placeholder="IS-XXXXX" value="${esc(prefillIssueKey || getIssueKey() || '')}"
                style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid var(--ml-border, #2a2f40); background:var(--ml-bg-2, #0f1320); color:var(--ml-text, #e6e9ef); font:13px var(--ml-font);" />
            </div>
            <button id="ml_ci_load" class="btnPrimary" style="padding:9px 16px;">Carregar campos</button>
          </div>
          <div id="ml_ci_status" style="font-size:12px; color:var(--ml-text-mut);"></div>
          <div id="ml_ci_fields" style="display:none; flex-direction:column; gap:6px; max-height:340px; overflow-y:auto; padding-right:6px;"></div>
          <div id="ml_ci_form" style="display:none; border-top:1px solid var(--ml-border, #2a2f40); padding-top:12px; display:flex; flex-direction:column; gap:8px;">
            <div>
              <div style="font-size:11.5px; color:var(--ml-text-mut); margin-bottom:4px;">Label (titulo que aparece no chip)</div>
              <input id="ml_ci_label" type="text" placeholder="Ex: Botao de Panico"
                style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid var(--ml-border); background:var(--ml-bg-2); color:var(--ml-text);" />
            </div>
            <div>
              <div style="font-size:11.5px; color:var(--ml-text-mut); margin-bottom:4px;">URL do Confluence</div>
              <input id="ml_ci_url" type="url" placeholder="https://mercadolibre.atlassian.net/wiki/spaces/ISS/pages/..."
                style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid var(--ml-border); background:var(--ml-bg-2); color:var(--ml-text);" />
            </div>
            <div id="ml_ci_picked" style="font-size:11.5px; color:var(--ml-text-mut);"></div>
            <div style="display:flex; gap:8px; justify-content:flex-end;">
              <button id="ml_ci_save" class="btnPrimary">Gerar snippet JS</button>
            </div>
          </div>
        </div>
      `;
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const $ = (sel) => modal.querySelector(sel);
      const close = (val) => {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
        resolve(val);
      };
      const onKey = (e) => { if(e.key === 'Escape') close(null); };
      document.addEventListener('keydown', onKey, true);
      $('#ml_ci_cancel').onclick = () => close(null);
      overlay.addEventListener('click', (e) => { if(e.target === overlay) close(null); });

      const picked = new Map(); // key -> { field, value, label }
      const refreshPicked = () => {
        const list = [...picked.values()];
        if(!list.length){
          $('#ml_ci_picked').innerHTML = '<i>Nenhum criterio marcado ainda. Clique em "Usar" nos campos acima.</i>';
        } else {
          $('#ml_ci_picked').innerHTML = '<b>Criterios marcados (AND):</b><br>' + list.map(p =>
            `&middot; <b>${esc(p.label)}</b> = <code style="background:rgba(148,163,184,.15);padding:1px 6px;border-radius:4px;">${esc(p.value)}</code>`
          ).join('<br>');
        }
      };
      refreshPicked();

      const loadFields = async () => {
        const key = String($('#ml_ci_key').value || '').trim().toUpperCase();
        if(!key){ $('#ml_ci_status').textContent = 'Informe a chave do ticket.'; return; }
        $('#ml_ci_status').textContent = `Carregando campos de ${key}...`;
        $('#ml_ci_fields').style.display = 'none';
        $('#ml_ci_form').style.display = 'none';
        try{
          const data = await getIssueAllFields(key);
          const fields = data?.fields || {};
          const names = data?.names || {};
          const rows = [];
          for(const [fkey, fval] of Object.entries(fields)){
            const label = names[fkey] || fkey;
            const value = _confExtractFieldValue(fval);
            if(!value) continue; // pula vazios
            // skip campos muito longos (description, comment) ou tecnicos demais
            if(value.length > 200) continue;
            if(['description','attachment','comment','watches','votes','worklog','issuelinks','subtasks','project','status','resolution','priority','reporter','creator','issuetype','assignee','timetracking','progress','aggregateprogress'].some(s => fkey.toLowerCase().includes(s))) {
              // mantemos alguns que sao uteis: project, status, priority - opcional
              if(!['project','status','priority','assignee','reporter','issuetype','resolution'].includes(fkey)) continue;
            }
            rows.push({ key: fkey, label, value });
          }
          // Ordena: customfields preenchidos primeiro (mais relevantes)
          rows.sort((a, b) => {
            const aIsCf = /^customfield_/.test(a.key) ? 0 : 1;
            const bIsCf = /^customfield_/.test(b.key) ? 0 : 1;
            return aIsCf - bIsCf || a.label.localeCompare(b.label);
          });

          if(!rows.length){
            $('#ml_ci_status').innerHTML = '<span style="color:#fca5a5;">Nenhum campo preenchido encontrado.</span>';
            return;
          }

          $('#ml_ci_status').textContent = `${rows.length} campos preenchidos em ${key}. Clique em "Usar" pra adicionar como criterio.`;
          $('#ml_ci_fields').style.display = 'flex';
          $('#ml_ci_fields').innerHTML = rows.map(r => `
            <div data-fk="${esc(r.key)}" style="display:flex; align-items:center; gap:10px; padding:8px 12px; background:var(--ml-bg-2, #0f1320); border:1px solid var(--ml-border, #2a2f40); border-radius:8px;">
              <div style="flex:1; min-width:0;">
                <div style="font-weight:600; font-size:12.5px; display:flex; align-items:center; gap:8px;">
                  <span>${esc(r.label)}</span>
                  <code style="font-size:10.5px; padding:1px 6px; border-radius:4px; background:rgba(148,163,184,.12); color:var(--ml-text-mut);">${esc(r.key)}</code>
                </div>
                <div style="font-size:11.5px; color:var(--ml-text-dim); margin-top:2px; word-break:break-word;">${esc(r.value)}</div>
              </div>
              <button class="ml-ci-use ghost" data-label="${esc(r.label)}" data-value="${esc(r.value)}" data-key="${esc(r.key)}" style="padding:4px 10px; font-size:11.5px;">Usar</button>
            </div>
          `).join('');

          $('#ml_ci_fields').querySelectorAll('.ml-ci-use').forEach(btn => {
            btn.onclick = () => {
              const fk = btn.getAttribute('data-key');
              const lbl = btn.getAttribute('data-label');
              const val = btn.getAttribute('data-value');
              if(picked.has(fk)){
                picked.delete(fk);
                btn.textContent = 'Usar';
                btn.classList.remove('btnPrimary');
                btn.classList.add('ghost');
              } else {
                picked.set(fk, { field: lbl, value: val, label: lbl });
                btn.textContent = 'Marcado';
                btn.classList.add('btnPrimary');
                btn.classList.remove('ghost');
              }
              refreshPicked();
            };
          });

          $('#ml_ci_form').style.display = 'flex';
        }catch(e){
          $('#ml_ci_status').innerHTML = `<span style="color:#fca5a5;">Erro: ${esc(e.message || String(e))}</span>`;
        }
      };

      $('#ml_ci_load').onclick = loadFields;
      $('#ml_ci_key').addEventListener('keydown', (e) => { if(e.key === 'Enter') loadFields(); });

      $('#ml_ci_save').onclick = () => {
        const label = String($('#ml_ci_label').value || '').trim();
        const url   = String($('#ml_ci_url').value || '').trim();
        if(!label){ alert('Informe o label do chip.'); return; }
        if(!url || !/^https?:\/\//i.test(url)){ alert('Informe uma URL valida do Confluence.'); return; }
        const list = [...picked.values()];
        if(!list.length){ alert('Marque pelo menos 1 criterio.'); return; }
        const rule = {
          label,
          url,
          match: list.map(p => ({ field: p.field, value: p.value, mode: 'exact' }))
        };
        close(rule);
      };

      // Auto-carrega se ja temos uma key no campo
      if($('#ml_ci_key').value.trim()){
        setTimeout(loadFields, 100);
      }
    });
  }
