  // =========================
  // SETTINGS modal (formulario de configuracoes)
  // =========================
  function openSettingsModal(){
    document.getElementById(IDS.sModal)?.remove();
    document.getElementById(IDS.sOverlay)?.remove();

    ensureStyle();

    const overlay = document.createElement('div');
    overlay.id = IDS.sOverlay;

    const modal = document.createElement('div');
    modal.id = IDS.sModal;

    const cur = SETTINGS;
    const def = DEFAULTS;
    const cacheMin = Math.round((cur.CACHE_TTL_MS || def.CACHE_TTL_MS) / 60000);

    modal.innerHTML = `
      <div class="sh">
        <div>
          <div class="title">&#9881; Configuracoes</div>
          <div class="meta">Salvo neste navegador. Apos salvar, a pagina recarrega para aplicar.</div>
        </div>
        <div style="display:flex;gap:8px">
          <button id="ml_s_close">Fechar</button>
        </div>
      </div>
      <div class="ml-s-tabs" role="tablist" aria-label="Categorias de configuracoes">
        <button class="ml-s-tab" data-tab-target="status" role="tab"><span class="ml-s-tab-ic">&#x21bb;</span><span>Mudar Status</span></button>
        <button class="ml-s-tab" data-tab-target="derive" role="tab"><span class="ml-s-tab-ic">&#x1F501;</span><span>Derivar</span></button>
        <button class="ml-s-tab" data-tab-target="snippets" role="tab"><span class="ml-s-tab-ic">&#x26A1;</span><span>Snippets &amp; Atalhos</span></button>
        <button class="ml-s-tab" data-tab-target="iss" role="tab"><span class="ml-s-tab-ic">&#x1F4CB;</span><span>Criar ISS</span></button>
        <button class="ml-s-tab" data-tab-target="confluence" role="tab"><span class="ml-s-tab-ic">&#x1F4D6;</span><span>Confluence</span></button>
        <button class="ml-s-tab" data-tab-target="advanced" role="tab"><span class="ml-s-tab-ic">&#x2699;</span><span>Avancado</span></button>
      </div>
      <div class="sb">
        <div id="ml_s_err" class="err"></div>
        <div id="ml_s_ok" class="ok"></div>

        <div id="ml_s_tab_hint" class="ml-s-tab-hint"></div>

        <div class="grid">

          <div class="group full" data-tab="advanced">
            <h4>Projetos & busca</h4>
            <div class="grid">
              <div>
                <label>Projetos considerados (chaves separadas por virgula)</label>
                <input type="text" id="ml_s_projects" value="${esc((cur.PROJECTS || def.PROJECTS).join(', '))}" />
                <div class="hint">Ex: IS, ISS, SSHP. Apenas tickets desses projetos aparecem em Duplicados.</div>
              </div>
              <div>
                <label>Custom field IS Ubicacion (cf id)</label>
                <input type="number" id="ml_s_cf_asset" value="${cur.CF_ASSET}" />
                <div class="hint">Customfield ID do Assets/IS Ubicacion (padrao ${def.CF_ASSET}).</div>
              </div>
              <div>
                <label>Custom field Resolution Team (cf id)</label>
                <input type="number" id="ml_s_cf_team" value="${cur.CF_RES_TEAM}" />
                <div class="hint">Customfield ID do Resolution team IS (padrao ${def.CF_RES_TEAM}).</div>
              </div>
              <div>
                <label>Filtro de "em aberto" (JQL parcial)</label>
                <input type="text" id="ml_s_open" value="${esc(cur.OPEN_FILTER)}" />
                <div class="hint">Ex: <code>statusCategory != Done</code> ou <code>resolution is empty</code>.</div>
              </div>
              <div>
                <label>Ordenacao (JQL parcial)</label>
                <input type="text" id="ml_s_order" value="${esc(cur.ORDER_BY)}" />
                <div class="hint">Ex: <code>updated DESC</code>.</div>
              </div>
              <div>
                <label class="checkbox"><input type="checkbox" id="ml_s_hideres" ${cur.HIDE_RESOLVED ? 'checked' : ''} /> Esconder tickets resolvidos do Assets</label>
                <div class="hint">Quando ligado, a API de tickets vinculados ja vem filtrada.</div>
              </div>
            </div>
          </div>

          <div class="group full" data-tab="advanced">
            <h4>Cache & paginacao</h4>
            <div class="grid">
              <div>
                <label>TTL do cache (minutos)</label>
                <input type="number" id="ml_s_cachemin" value="${cacheMin}" min="0" />
                <div class="hint">Tempo que o resultado de cada localidade fica em cache (sessionStorage). 0 desliga.</div>
              </div>
              <div>
                <label>Tickets por pagina (Assets)</label>
                <input type="number" id="ml_s_pagesize" value="${cur.PAGE_SIZE}" min="10" max="200" />
                <div class="hint">Padrao ${def.PAGE_SIZE}.</div>
              </div>
              <div>
                <label>Maximo de paginas (Assets)</label>
                <input type="number" id="ml_s_maxpages" value="${cur.MAX_PAGES}" min="1" max="50" />
                <div class="hint">Padrao ${def.MAX_PAGES}. Total = pagina x tickets.</div>
              </div>
              <div>
                <label>Maximo de issues no search (JQL)</label>
                <input type="number" id="ml_s_maxres" value="${cur.MAX_RESULTS}" min="10" max="500" />
                <div class="hint">Padrao ${def.MAX_RESULTS}.</div>
              </div>
            </div>
          </div>

          <div class="group full" data-tab="derive">
            <h4>Derivar</h4>
            <div class="grid">
              <div>
                <label>Nome da transicao de derivar</label>
                <input type="text" id="ml_s_derive_tr" value="${esc(cur.DERIVE_TRANSITION_NAME)}" />
                <div class="hint">Nome exato da transicao no Jira. Padrao "${def.DERIVE_TRANSITION_NAME}".</div>
              </div>
              <div class="full">
                <label>Comentario padrao da derivacao (obs interna, aceita varias linhas)</label>
                <textarea id="ml_s_derive_msg" style="min-height: 80px;">${esc(cur.DERIVE_COMMENT_DEFAULT)}</textarea>
                <div class="hint">Pre-preenche o campo de comentario nos modais Derivar e Gerenciador. Pode usar quebras de linha.</div>
              </div>
              <div class="full">
                <label>Allowlist de times (um por linha)</label>
                <textarea id="ml_s_teams">${esc((cur.DERIVE_TEAMS_ALLOWLIST || def.DERIVE_TEAMS_ALLOWLIST).join('\n'))}</textarea>
                <div class="hint">So times nessa lista aparecem como opcao para derivar.</div>
              </div>
              <div class="full">
                <label class="checkbox">
                  <input type="checkbox" id="ml_s_unwatch" ${cur.DERIVE_UNWATCH_AFTER !== false ? 'checked' : ''} />
                  Deixar de acompanhar (unwatch) o ticket apos derivar
                </label>
                <div class="hint">
                  <b>Marcado (padrao):</b> apos cada derivacao (single ou lote), voce e removido da lista de watchers do ticket
                  e <b>nao recebera mais notificacoes</b> dele. Recomendado pra evitar caixa de entrada cheia de tickets que ja sairam da sua fila.<br/>
                  <b>Desmarcado:</b> voce continua como watcher e recebe notificacoes mesmo apos derivar.
                </div>
              </div>
            </div>
          </div>

          <div class="group full" data-tab="iss">
            <h4>Criar tarefa ISS (checkbox no Derive)</h4>
            <div class="grid">
              <div class="full">
                <label>Times que disparam o checkbox (um por linha)</label>
                <textarea id="ml_s_iss_triggers">${esc((cur.ISS_TASK_TRIGGER_TEAMS || []).join('\n'))}</textarea>
                <div class="hint">Vazio = checkbox nunca aparece. Coloque o nome <b>exato</b> do(s) time(s) (ex: <code>IS-SHIP-FIELDSERVICE</code>) que, quando selecionados no Derive, devem oferecer "criar tarefa de troubleshooting".</div>
              </div>
              <div>
                <label>Projeto da tarefa</label>
                <input type="text" id="ml_s_iss_project" value="${esc(cur.ISS_TASK_PROJECT)}" />
                <div class="hint">Padrao "${esc(def.ISS_TASK_PROJECT)}".</div>
              </div>
              <div>
                <label>Tipo da tarefa (issuetype name)</label>
                <input type="text" id="ml_s_iss_type" value="${esc(cur.ISS_TASK_ISSUETYPE)}" />
                <div class="hint">Padrao "${esc(def.ISS_TASK_ISSUETYPE)}" (ou "Task" em ingles).</div>
              </div>
              <div class="full">
                <label>Template do summary</label>
                <input type="text" id="ml_s_iss_summary" value="${esc(cur.ISS_TASK_SUMMARY_TEMPLATE)}" />
                <div class="hint">Use <code>{key}</code> como placeholder pro key do ticket atual. Padrao "<code>${esc(def.ISS_TASK_SUMMARY_TEMPLATE)}</code>".</div>
              </div>
              <div>
                <label>Demanda - customfield ID</label>
                <input type="number" id="ml_s_iss_dem_cf" value="${cur.ISS_TASK_DEMANDA_CF}" />
                <div class="hint">Padrao ${def.ISS_TASK_DEMANDA_CF}.</div>
              </div>
              <div>
                <label>Demanda - valor</label>
                <input type="text" id="ml_s_iss_dem_val" value="${esc(cur.ISS_TASK_DEMANDA_VALUE)}" />
                <div class="hint">Padrao "${esc(def.ISS_TASK_DEMANDA_VALUE)}".</div>
              </div>
              <div>
                <label>Service - customfield ID</label>
                <input type="number" id="ml_s_iss_svc_cf" value="${cur.ISS_TASK_SERVICE_CF}" />
                <div class="hint">Padrao ${def.ISS_TASK_SERVICE_CF}.</div>
              </div>
              <div>
                <label>Service - valor</label>
                <input type="text" id="ml_s_iss_svc_val" value="${esc(cur.ISS_TASK_SERVICE_VALUE)}" />
                <div class="hint">Padrao "${esc(def.ISS_TASK_SERVICE_VALUE)}".</div>
              </div>
              <div>
                <label>Resolution team da tarefa criada</label>
                <input type="text" id="ml_s_iss_res" value="${esc(cur.ISS_TASK_RESOLUTION_TEAM)}" />
                <div class="hint">Padrao "${esc(def.ISS_TASK_RESOLUTION_TEAM)}".</div>
              </div>
              <div>
                <label>Nome do link type (deixe vazio para auto-descobrir)</label>
                <input type="text" id="ml_s_iss_link" value="${esc(cur.ISS_TASK_LINK_TYPE_NAME || '')}" />
                <div class="hint">Vazio = procura pelo inward "vinculad". Se nao achar, coloque o nome do link type (ex: <code>Caused</code> ou <code>Vinculado</code>).</div>
              </div>
              <div class="full">
                <label>Issue modelo (ISS-XXXX) - opcional, mas recomendado</label>
                <input type="text" id="ml_s_iss_model" value="${esc(cur.ISS_TASK_MODEL_ISSUE || '')}" placeholder="ex: ISS-12345" />
                <div class="hint">Se preenchido, <b>copia o formato exato</b> dos custom fields Demanda/Service/Resolution Team de uma tarefa ISS existente. Use isso se voce vir erros como "Especifique o valor para Service na matriz" (validadores customizados do plugin de matriz nao aceitam <code>{value:"..."}</code> construido pelo nome - copiar de uma issue boa resolve).</div>
              </div>
              <div>
                <label class="checkbox"><input type="checkbox" id="ml_s_iss_atts" ${cur.ISS_TASK_COPY_ATTACHMENTS !== false ? 'checked' : ''} /> Copiar anexos do ticket original para a tarefa ISS</label>
                <div class="hint">Best-effort: se algum anexo falhar, os outros vao. Falhas aparecem no console e no resumo final.</div>
              </div>
              <div>
                <label class="checkbox"><input type="checkbox" id="ml_s_iss_comments" ${cur.ISS_TASK_COPY_COMMENTS !== false ? 'checked' : ''} /> Copiar comentarios do ticket original (1 digest interno na ISS)</label>
                <div class="hint">Compila TODOS os comentarios (publicos + internos) em UM unico comentario <b>interno</b> na nova tarefa, com autor + data + visibilidade original. Evita poluir o historico com varios comments.</div>
              </div>
            </div>
          </div>

          <div class="group full" data-tab="snippets">
            <h4>Snippets de comentario</h4>
            <div class="grid">
              <div class="full">
                <div class="hint" style="margin-bottom: 8px;">
                  Banco de textos pre-definidos por usuario.
                  <b>3 jeitos de usar:</b>
                  (1) bot&atilde;o <b>Snippets</b> em qualquer textarea (Derivar, Gerenciador);
                  (2) atalho <b>Quick Comment</b> (Alt+C) que abre um popover de busca;
                  (3) digitar o <b>/comando</b> direto no textarea + Espa&ccedil;o/Tab/Enter para expandir.
                  <br/>Ex: cadastra <code>/ola</code> &rarr; <code>Ola, tudo bem?</code>. Ao digitar <code>/ola </code> vira <code>Ola, tudo bem?</code>.
                </div>
                <div id="ml_s_snip_list"></div>
                <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center;">
                  <button id="ml_s_snip_add" class="ghost">+ Adicionar snippet</button>
                  <button id="ml_s_snip_import_tb" class="ghost" title="Importa em massa de um JSON (gerado pelo Text Blaze Scraper ou TSV/CSV manual)">
                    &#x2B07; Importar do Text Blaze
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="group full" data-tab="derive">
            <h4>Sugestoes de time pra Derivar</h4>
            <div class="grid">
              <div class="full">
                <div class="hint" style="margin-bottom: 8px;">
                  Regras simples de palavra-chave: ao abrir o modal de Derivar, o script analisa <b>summary + description</b>
                  do ticket e <b>pre-seleciona</b> o time conforme a primeira regra que casar.
                  Comparacao case-insensitive. Voce pode mudar livremente apos a sugestao.
                </div>
                <div id="ml_s_sugg_list"></div>
                <button id="ml_s_sugg_add" class="ghost" style="margin-top: 8px;">+ Adicionar regra</button>
              </div>
            </div>
          </div>

          <div class="group full" data-tab="status">
            <h4>Acoes de Status</h4>
            <div class="grid">
              <div class="full">
                <div class="hint" style="margin-bottom: 10px;">
                  Cadastre quantas <b>acoes de status</b> quiser. O botao verde "Status" no ticket abre um <b>menu</b>
                  com todas elas, e voce escolhe qual aplicar.<br/>
                  Cada acao tem sua <b>propria mensagem</b>, define se e <b>publico ou interno</b>,
                  e se <b>atribui o ticket pra voce</b>.<br/>
                  <b>Exemplos uteis:</b> "Em andamento", "Waiting for customer", "Waiting for support", "Resolvido".
                </div>
                <div id="ml_s_status_list"></div>
                <button id="ml_s_status_add" class="ghost" style="margin-top: 8px;">+ Adicionar acao de status</button>
              </div>
              <div class="full">
                <label>Atalhos de teclado para abrir o menu (um por linha)</label>
                <textarea id="ml_s_as_shortcuts">${esc((Array.isArray(cur.STATUS_MENU_SHORTCUTS) && cur.STATUS_MENU_SHORTCUTS.length ? cur.STATUS_MENU_SHORTCUTS : (Array.isArray(cur.ASSIGN_AND_START_SHORTCUTS) && cur.ASSIGN_AND_START_SHORTCUTS.length ? cur.ASSIGN_AND_START_SHORTCUTS : def.STATUS_MENU_SHORTCUTS)).join('\n'))}</textarea>
                <div class="hint">
                  Padrao: <code>${esc((def.STATUS_MENU_SHORTCUTS || []).join(', '))}</code>.<br/>
                  Se houver so 1 acao cadastrada, o atalho executa direto. Com mais de 1, abre o menu.
                </div>
              </div>
            </div>
          </div>

          <div class="group full" data-tab="confluence">
            <h4>Tshoot Confluence (chip lateral)</h4>
            <div class="grid">
              <div class="full">
                <div class="hint" style="margin-bottom: 10px;">
                  As regras sao mantidas <b>centralmente pelo admin</b> (Gustavo).
                  Voce pode ajustar <b>apenas a URL</b> caso o link do Confluence mude.<br/>
                  Pra <b>adicionar uma nova regra</b> ou alterar criterios, fale com o admin com o exemplo do ticket.
                </div>
                <div id="ml_s_conf_list"></div>
                <details style="margin-top: 14px;">
                  <summary style="cursor:pointer; font-size:12px; color:var(--ml-text-mut);">
                    &#x1F527; Ferramentas de admin (gerar nova regra)
                  </summary>
                  <div style="margin-top:10px; padding:10px; background:var(--ml-bg-2); border:1px dashed var(--ml-border); border-radius:6px;">
                    <div class="hint" style="margin-bottom: 8px;">
                      O <b>Inspetor</b> le os campos do ticket aberto e gera o snippet JS pra colar em
                      <code>src/10-config.js</code> -&gt; <code>DEFAULTS.CONFLUENCE_RULES</code>.
                    </div>
                    <button id="ml_s_conf_inspect" class="btnPrimary" style="padding: 7px 12px; font-size: 12px;">
                      &#x1F4CB; Inspecionar ticket atual
                    </button>
                  </div>
                </details>
              </div>
            </div>
          </div>

          <div class="group full" data-tab="snippets">
            <h4>Comentario rapido com snippet</h4>
            <div class="grid">
              <div class="full">
                <label>Atalhos de teclado (um por linha)</label>
                <textarea id="ml_s_qc_shortcuts">${esc((Array.isArray(cur.QUICK_COMMENT_SHORTCUTS) && cur.QUICK_COMMENT_SHORTCUTS.length ? cur.QUICK_COMMENT_SHORTCUTS : def.QUICK_COMMENT_SHORTCUTS).join('\n'))}</textarea>
                <div class="hint">
                  Abre um popover de busca pra postar um snippet como observacao interna no ticket atual em 1-2 cliques (sem precisar abrir Localidade).
                  Padrao: <code>${esc((def.QUICK_COMMENT_SHORTCUTS || []).join(', '))}</code>.
                  Tambem ha botao flutuante (icone) na lateral direita.
                </div>
              </div>
            </div>
          </div>

          <div class="group full" data-tab="advanced">
            <h4>Backup das configuracoes</h4>
            <div class="grid">
              <div class="full">
                <div class="hint" style="margin-bottom:8px;">
                  Suas configs ficam <b>so neste navegador</b> (localStorage). Se voce limpar cache,
                  trocar de PC ou de navegador, vai perder. O plugin pode lembrar voce de exportar
                  periodicamente um JSON com tudo (botao <b>Exportar</b> abaixo).
                </div>
              </div>
              <div>
                <label style="display:flex; align-items:center; gap:8px;">
                  <input type="checkbox" id="ml_s_backup_enabled" ${cur.BACKUP_REMIND_ENABLED !== false ? 'checked' : ''} />
                  <span>Lembrar-me periodicamente de fazer backup</span>
                </label>
                <div class="hint">Mostra um banner discreto quando ja passou tempo demais do ultimo backup.</div>
              </div>
              <div>
                <label>Intervalo entre lembretes (dias)</label>
                <input type="number" id="ml_s_backup_days" value="${Number(cur.BACKUP_REMIND_INTERVAL_DAYS) > 0 ? Number(cur.BACKUP_REMIND_INTERVAL_DAYS) : def.BACKUP_REMIND_INTERVAL_DAYS}" min="1" max="365" />
                <div class="hint">Padrao: ${def.BACKUP_REMIND_INTERVAL_DAYS} dias.</div>
              </div>
            </div>
          </div>

          <div class="group full" data-tab="advanced">
            <h4>Interface</h4>
            <div class="grid">
              <div class="full">
                <label>Atalhos de teclado (um por linha, varios em paralelo)</label>
                <textarea id="ml_s_shortcuts">${esc((Array.isArray(cur.SHORTCUTS) && cur.SHORTCUTS.length ? cur.SHORTCUTS : (cur.SHORTCUT ? [cur.SHORTCUT] : def.SHORTCUTS)).join('\n'))}</textarea>
                <div class="hint">
                  Aceita varios atalhos ao mesmo tempo (todos abrem/fecham o popup).
                  Padrao: <code>${esc((def.SHORTCUTS || []).join(', '))}</code>.<br/>
                  <b>Mac:</b> a tecla <b>Option</b> (&#8997;) funciona como <code>Alt</code>. <code>Cmd</code> = <code>Meta</code>.<br/>
                  <b>Aviso:</b> evite <code>Cmd+Shift+I</code> e <code>Cmd+Shift+C</code> no Mac (conflitam com DevTools do Chrome).
                </div>
              </div>
              <div>
                <label>Preview de descricao (caracteres)</label>
                <input type="number" id="ml_s_preview" value="${cur.DESC_PREVIEW_LEN}" min="60" max="2000" />
                <div class="hint">Comprimento do preview de descricao em cada card de duplicado.</div>
              </div>
            </div>
          </div>

        </div>

        <div class="actions">
          <button id="ml_s_export" class="ghost" title="Exportar todas as configuracoes para um arquivo JSON">Exportar</button>
          <button id="ml_s_import" class="ghost" title="Importar configuracoes de um arquivo JSON exportado anteriormente">Importar</button>
          <input type="file" id="ml_s_import_file" accept="application/json,.json" style="display:none;" />
          <button id="ml_s_reset" class="danger" title="Apagar tudo e voltar ao padrao">Resetar para padrao</button>
          <button id="ml_s_cancel">Cancelar</button>
          <button id="ml_s_save" class="primary">Salvar e recarregar pagina</button>
        </div>
      </div>
    `;

    const close = () => { modal.remove(); overlay.remove(); };
    overlay.addEventListener('click', close);
    modal.querySelector('#ml_s_close').addEventListener('click', close);
    modal.querySelector('#ml_s_cancel').addEventListener('click', close);

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    // ---- Tabs ----
    const TAB_HINTS = {
      status:     '<b>Mudar Status</b> &mdash; Configure as a&ccedil;&otilde;es que aparecem no modal quando voc&ecirc; clica em "Mudar status" no ticket. Cada a&ccedil;&atilde;o tem sua mensagem padr&atilde;o, p&uacute;blico/interno e se atribui pra voc&ecirc;.',
      derive:     '<b>Derivar</b> &mdash; Times dispon&iacute;veis pra derivar tickets, mensagem padr&atilde;o e sugest&otilde;es autom&aacute;ticas (baseadas em palavras-chave do ticket).',
      snippets:   '<b>Snippets &amp; Atalhos</b> &mdash; Mensagens pr&eacute;-cadastradas com <code>/comandos</code> pra digitar r&aacute;pido em qualquer textarea + atalho do <i>Coment&aacute;rio r&aacute;pido</i>.',
      iss:        '<b>Criar ISS</b> &mdash; Configura&ccedil;&atilde;o do checkbox "Criar tarefa ISS" que aparece no Derive quando voc&ecirc; deriva pra times espec&iacute;ficos (ex: SE).',
      confluence: '<b>Confluence</b> &mdash; Regras que ligam tipo do ticket a um link de troubleshooting no Confluence (chip lateral &#x1F4D6;). Regras s&atilde;o mantidas pelo admin; voc&ecirc; pode ajustar URL se o link mudar.',
      advanced:   '<b>Avan&ccedil;ado</b> &mdash; Configura&ccedil;&otilde;es t&eacute;cnicas: projetos considerados, custom fields, paginat&ccedil;&atilde;o, cache e atalhos gerais. <b>S&oacute; mexa se souber o que est&aacute; fazendo.</b>'
    };
    const TAB_STORAGE_KEY = 'ml_loc_settings_last_tab';
    const tabBtns = modal.querySelectorAll('.ml-s-tab');
    const groups  = modal.querySelectorAll('.group[data-tab]');
    const hintBox = modal.querySelector('#ml_s_tab_hint');

    function activateTab(name){
      // Atualiza botoes
      tabBtns.forEach(b => {
        if(b.dataset.tabTarget === name) b.classList.add('active');
        else b.classList.remove('active');
      });
      // Mostra/esconde grupos
      groups.forEach(g => {
        if(g.dataset.tab === name) g.setAttribute('data-active', '');
        else g.removeAttribute('data-active');
      });
      // Atualiza hint
      hintBox.innerHTML = TAB_HINTS[name] || '';
      // Persiste preferencia
      try{ localStorage.setItem(TAB_STORAGE_KEY, name); }catch(_){}
      // Volta scroll pro topo do body
      const sb = modal.querySelector('.sb');
      if(sb) sb.scrollTop = 0;
    }

    tabBtns.forEach(b => {
      b.addEventListener('click', (e) => { e.preventDefault(); activateTab(b.dataset.tabTarget); });
    });

    // Tab inicial: a ultima usada, ou status como default
    const initialTab = (() => {
      try{
        const saved = localStorage.getItem(TAB_STORAGE_KEY);
        if(saved && TAB_HINTS[saved]) return saved;
      }catch(_){}
      return 'status';
    })();
    activateTab(initialTab);

    // ---- Listas dinamicas: Snippets ----
    const snipList = modal.querySelector('#ml_s_snip_list');
    const snipAdd  = modal.querySelector('#ml_s_snip_add');
    const renderSnipRow = (s) => {
      const row = document.createElement('div');
      row.className = 'ml-s-listrow';
      row.style.cssText = 'display:grid;grid-template-columns: 200px 130px 1fr auto;gap:8px;margin-bottom:8px;align-items:start;';
      row.innerHTML = `
        <input type="text" class="snip-name" placeholder="Nome (ex: Aguardando site)" value="${esc(s?.name || '')}" />
        <input type="text" class="snip-cmd" placeholder="/comando" value="${esc(s?.command || '')}" />
        <textarea class="snip-text" placeholder="Texto do comentario..." style="min-height: 60px;">${esc(s?.text || '')}</textarea>
        <button type="button" class="snip-rm danger ghost" title="Remover" style="padding:4px 10px;height:32px;">x</button>
      `;
      // Auto-prefix '/' se o usuario digitar sem
      const cmdInput = row.querySelector('.snip-cmd');
      cmdInput.addEventListener('blur', () => {
        const v = String(cmdInput.value || '').trim();
        if(v && !v.startsWith('/')) cmdInput.value = '/' + v;
        // Remove espacos: comandos nao podem ter espaco
        cmdInput.value = cmdInput.value.replace(/\s+/g, '');
      });
      row.querySelector('.snip-rm').onclick = () => row.remove();
      snipList.appendChild(row);
    };
    (Array.isArray(cur.COMMENT_SNIPPETS) ? cur.COMMENT_SNIPPETS : []).forEach(renderSnipRow);
    if(snipAdd) snipAdd.onclick = (e) => { e.preventDefault(); renderSnipRow({}); };

    // ---- Importar Text Blaze (ou TSV manual) ----
    const snipImportTb = modal.querySelector('#ml_s_snip_import_tb');
    if(snipImportTb){
      snipImportTb.onclick = (e) => {
        e.preventDefault();
        openTextBlazeImportModal((parsed) => {
          // Adiciona ao final das linhas existentes (usuario decide salvar)
          parsed.forEach(s => renderSnipRow(s));
          // Scrolla pro fim da lista pra mostrar que adicionou
          snipList.lastElementChild?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      };
    }

    // ---- Listas dinamicas: Acoes de Status ----
    const statusList = modal.querySelector('#ml_s_status_list');
    const statusAdd  = modal.querySelector('#ml_s_status_add');
    const renderStatusRow = (a) => {
      a = a || {};
      const row = document.createElement('div');
      row.className = 'ml-s-listrow ml-s-status-row';
      row.style.cssText = 'display:grid;grid-template-columns: 180px 180px 1fr auto;gap:8px;margin-bottom:10px;align-items:start;padding:10px;background:var(--ml-bg-2);border:1px solid var(--ml-border);border-radius:8px;';
      row.innerHTML = `
        <div>
          <div style="font-size:10.5px;color:var(--ml-text-mut);margin-bottom:2px;">Rotulo (texto do botao)</div>
          <input type="text" class="status-label" placeholder="Ex: Em andamento" value="${esc(a.label || '')}" />
        </div>
        <div>
          <div style="font-size:10.5px;color:var(--ml-text-mut);margin-bottom:2px;">Transicao (nome EXATO no Jira)</div>
          <input type="text" class="status-tr" placeholder="Ex: Em andamento" value="${esc(a.transition || '')}" />
        </div>
        <div>
          <div style="font-size:10.5px;color:var(--ml-text-mut);margin-bottom:2px;">Comentario (multilinha)</div>
          <textarea class="status-comment" placeholder="Mensagem que vai no comentario quando aplicar esta acao..." style="min-height: 80px;">${esc(a.comment || '')}</textarea>
          <div style="display:flex;gap:14px;margin-top:6px;font-size:11.5px;">
            <label class="checkbox" style="display:flex;align-items:center;gap:5px;">
              <input type="checkbox" class="status-internal" ${a.internal === true ? 'checked' : ''} />
              <span>Obs interna (so a equipe)</span>
            </label>
            <label class="checkbox" style="display:flex;align-items:center;gap:5px;">
              <input type="checkbox" class="status-assign" ${a.assignToMe !== false ? 'checked' : ''} />
              <span>Atribuir pra mim</span>
            </label>
          </div>
        </div>
        <button type="button" class="status-rm danger ghost" title="Remover" style="padding:4px 10px;height:32px;align-self:start;">x</button>
      `;
      row.querySelector('.status-rm').onclick = () => row.remove();
      statusList.appendChild(row);
    };
    (Array.isArray(cur.STATUS_ACTIONS) ? cur.STATUS_ACTIONS : []).forEach(renderStatusRow);
    // Migration visual: se a lista esta vazia mas existe config legada, pre-popula com 1 entry
    if(!statusList.children.length){
      const legacyTr = String(cur.ASSIGN_AND_START_TRANSITION || '').trim();
      if(legacyTr){
        renderStatusRow({
          label:      legacyTr,
          transition: legacyTr,
          comment:    String(cur.ASSIGN_AND_START_COMMENT || ''),
          internal:   cur.ASSIGN_AND_START_COMMENT_INTERNAL === true,
          assignToMe: true
        });
      }
    }
    if(statusAdd) statusAdd.onclick = (e) => { e.preventDefault(); renderStatusRow({}); };

    // ---- Tshoot Confluence: regras builtin (read-only) + URL editavel ----
    const confList    = modal.querySelector('#ml_s_conf_list');
    const confInspect = modal.querySelector('#ml_s_conf_inspect');
    const builtinRules = Array.isArray(def.CONFLUENCE_RULES) ? def.CONFLUENCE_RULES : [];
    const urlOverrides = (cur.CONFLUENCE_URL_OVERRIDES && typeof cur.CONFLUENCE_URL_OVERRIDES === 'object')
      ? cur.CONFLUENCE_URL_OVERRIDES : {};

    if(!builtinRules.length){
      confList.innerHTML = `<div class="hint" style="padding:12px; background:var(--ml-bg-2); border-radius:6px;">
        Nenhuma regra cadastrada. Fale com o admin pra adicionar.
      </div>`;
    } else {
      builtinRules.forEach(r => {
        const label = String(r.label || '').trim();
        const defaultUrl = String(r.url || '').trim();
        const currentUrl = String(urlOverrides[label] || defaultUrl);
        const isOverridden = !!urlOverrides[label] && urlOverrides[label] !== defaultUrl;
        const critsTxt = (r.match || [])
          .map(c => `<code style="background:rgba(148,163,184,.12);padding:1px 6px;border-radius:4px;">${esc(c.field)}</code> = <b>${esc(c.value)}</b>${c.mode === 'contains' ? ' <i>(contem)</i>' : ''}`)
          .join(' &nbsp;<span style="color:var(--ml-text-dim)">E</span>&nbsp; ');

        const row = document.createElement('div');
        row.className = 'ml-s-conf-row';
        row.dataset.label = label;
        row.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:10px;padding:12px;background:var(--ml-bg-2);border:1px solid var(--ml-border);border-radius:8px;';
        row.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:14px;">&#x1F4D6;</span>
            <b style="font-size:13.5px;">${esc(label)}</b>
            ${isOverridden ? '<span style="margin-left:auto;font-size:10.5px;padding:2px 8px;border-radius:4px;background:rgba(251,191,36,.15);color:#fbbf24;font-weight:600;">URL ALTERADA</span>' : ''}
          </div>
          <div style="font-size:11.5px;color:var(--ml-text-mut);line-height:1.5;">
            Criterios: ${critsTxt || '<i>(nenhum)</i>'}
          </div>
          <div>
            <div style="font-size:10.5px;color:var(--ml-text-mut);margin-bottom:3px;display:flex;align-items:center;gap:8px;">
              <span>URL do Confluence</span>
              ${isOverridden ? `<button type="button" class="conf-reset ghost" style="padding:1px 8px;font-size:10.5px;height:auto;">resetar pra padrao</button>` : ''}
            </div>
            <input type="url" class="conf-url" placeholder="${esc(defaultUrl)}" value="${esc(currentUrl)}" data-default="${esc(defaultUrl)}" style="font-family:var(--ml-mono);font-size:11.5px;" />
          </div>
        `;
        const urlInput = row.querySelector('.conf-url');
        const resetBtn = row.querySelector('.conf-reset');
        if(resetBtn){
          resetBtn.onclick = (e) => {
            e.preventDefault();
            urlInput.value = defaultUrl;
            urlInput.dispatchEvent(new Event('input', { bubbles: true }));
          };
        }
        confList.appendChild(row);
      });
    }

    if(confInspect){
      confInspect.onclick = async (e) => {
        e.preventDefault();
        try{
          const rule = await openConfluenceFieldInspector(getIssueKey() || '');
          if(rule){
            showAdminSnippetModal(rule);
          }
        }catch(err){
          alert('Falha no inspetor: ' + (err.message || err));
        }
      };
    }

    // ---- Listas dinamicas: Sugestoes de time ----
    const suggList = modal.querySelector('#ml_s_sugg_list');
    const suggAdd  = modal.querySelector('#ml_s_sugg_add');
    const renderSuggRow = (r) => {
      const row = document.createElement('div');
      row.className = 'ml-s-listrow';
      row.style.cssText = 'display:grid;grid-template-columns: 1fr 1fr auto;gap:8px;margin-bottom:8px;align-items:center;';
      row.innerHTML = `
        <input type="text" class="sugg-kw" placeholder="Palavra-chave (ex: camera offline)" value="${esc(r?.keyword || '')}" />
        <input type="text" class="sugg-team" placeholder="Time (ex: IS-SHIP-SE-N2)" value="${esc(r?.team || '')}" />
        <button type="button" class="sugg-rm danger ghost" title="Remover" style="padding:4px 10px;height:32px;">x</button>
      `;
      row.querySelector('.sugg-rm').onclick = () => row.remove();
      suggList.appendChild(row);
    };
    (Array.isArray(cur.DERIVE_TEAM_SUGGESTIONS) ? cur.DERIVE_TEAM_SUGGESTIONS : []).forEach(renderSuggRow);
    if(suggAdd) suggAdd.onclick = (e) => { e.preventDefault(); renderSuggRow({}); };

    const errEl = modal.querySelector('#ml_s_err');
    const okEl  = modal.querySelector('#ml_s_ok');
    const showErr = (msg) => { errEl.textContent = msg; errEl.classList.add('show'); okEl.classList.remove('show'); modal.scrollTop = 0; };
    const showOk  = (msg) => { okEl.textContent = msg;  okEl.classList.add('show'); errEl.classList.remove('show'); modal.scrollTop = 0; };

    modal.querySelector('#ml_s_save').addEventListener('click', () => {
      try{
        const projects = String(modal.querySelector('#ml_s_projects').value || '')
          .split(',').map(s => s.trim()).filter(Boolean);
        const teams = String(modal.querySelector('#ml_s_teams').value || '')
          .split(/\r?\n/).map(s => s.trim()).filter(Boolean);

        const cfAsset = Number(modal.querySelector('#ml_s_cf_asset').value);
        const cfTeam  = Number(modal.querySelector('#ml_s_cf_team').value);
        const cacheMinN = Number(modal.querySelector('#ml_s_cachemin').value);
        const pageSize  = Number(modal.querySelector('#ml_s_pagesize').value);
        const maxPages  = Number(modal.querySelector('#ml_s_maxpages').value);
        const maxRes    = Number(modal.querySelector('#ml_s_maxres').value);
        const previewN  = Number(modal.querySelector('#ml_s_preview').value);

        if(!projects.length) return showErr('Informe pelo menos um projeto.');
        if(!Number.isInteger(cfAsset) || cfAsset <= 0) return showErr('cf id de IS Ubicacion invalido.');
        if(!Number.isInteger(cfTeam)  || cfTeam  <= 0) return showErr('cf id de Resolution team invalido.');
        if(!Number.isInteger(cacheMinN) || cacheMinN < 0) return showErr('TTL do cache invalido.');
        if(!Number.isInteger(pageSize) || pageSize < 1) return showErr('Tickets por pagina invalido.');
        if(!Number.isInteger(maxPages) || maxPages < 1) return showErr('Maximo de paginas invalido.');
        if(!Number.isInteger(maxRes)   || maxRes   < 1) return showErr('Maximo de issues invalido.');
        if(!Number.isInteger(previewN) || previewN < 30) return showErr('Preview de descricao deve ser >= 30.');

        const shortcutLines = String(modal.querySelector('#ml_s_shortcuts').value || '')
          .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const shortcutsArr = shortcutLines.length ? shortcutLines : DEFAULTS.SHORTCUTS.slice();
        const badShortcut = shortcutsArr.find(s => !parseShortcut(s));
        if(badShortcut) return showErr(`Atalho invalido: "${badShortcut}". Ex: Alt+L, Cmd+Shift+L, Ctrl+Shift+K.`);

        // Atalhos do menu "Status"
        const asShortcutLines = String(modal.querySelector('#ml_s_as_shortcuts').value || '')
          .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const badAsShortcut = asShortcutLines.find(s => !parseShortcut(s));
        if(badAsShortcut) return showErr(`Atalho invalido (menu Status): "${badAsShortcut}". Ex: Alt+I, Cmd+Shift+E.`);

        // Atalhos do "Comentario rapido"
        const qcShortcutLines = String(modal.querySelector('#ml_s_qc_shortcuts').value || '')
          .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const badQcShortcut = qcShortcutLines.find(s => !parseShortcut(s));
        if(badQcShortcut) return showErr(`Atalho invalido (Comentario rapido): "${badQcShortcut}". Ex: Alt+C, Cmd+Shift+C.`);

        // ISS Task fields
        const issTriggers = String(modal.querySelector('#ml_s_iss_triggers').value || '')
          .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const issDemCf = Number(modal.querySelector('#ml_s_iss_dem_cf').value);
        const issSvcCf = Number(modal.querySelector('#ml_s_iss_svc_cf').value);
        if(!Number.isInteger(issDemCf) || issDemCf <= 0) return showErr('Demanda - customfield ID invalido.');
        if(!Number.isInteger(issSvcCf) || issSvcCf <= 0) return showErr('Service - customfield ID invalido.');

        const values = {
          CF_ASSET: cfAsset,
          CF_RES_TEAM: cfTeam,
          PROJECTS: projects,
          PAGE_SIZE: pageSize,
          MAX_PAGES: maxPages,
          MAX_RESULTS: maxRes,
          HIDE_RESOLVED: !!modal.querySelector('#ml_s_hideres').checked,
          OPEN_FILTER: String(modal.querySelector('#ml_s_open').value || '').trim() || DEFAULTS.OPEN_FILTER,
          ORDER_BY: String(modal.querySelector('#ml_s_order').value || '').trim() || DEFAULTS.ORDER_BY,
          DESC_PREVIEW_LEN: previewN,
          DUP_LABEL_MAX_TOKENS: DEFAULTS.DUP_LABEL_MAX_TOKENS,
          CACHE_TTL_MS: cacheMinN * 60 * 1000,
          DERIVE_TRANSITION_NAME: String(modal.querySelector('#ml_s_derive_tr').value || '').trim() || DEFAULTS.DERIVE_TRANSITION_NAME,
          DERIVE_COMMENT_DEFAULT: String(modal.querySelector('#ml_s_derive_msg').value || '').trim() || DEFAULTS.DERIVE_COMMENT_DEFAULT,
          DERIVE_TEAMS_ALLOWLIST: teams.length ? teams : DEFAULTS.DERIVE_TEAMS_ALLOWLIST,
          DERIVE_UNWATCH_AFTER: !!modal.querySelector('#ml_s_unwatch').checked,
          SHORTCUTS: shortcutsArr,
          SHORTCUT: shortcutsArr[0],
          ISS_TASK_TRIGGER_TEAMS: issTriggers,
          ISS_TASK_PROJECT: String(modal.querySelector('#ml_s_iss_project').value || '').trim() || DEFAULTS.ISS_TASK_PROJECT,
          ISS_TASK_ISSUETYPE: String(modal.querySelector('#ml_s_iss_type').value || '').trim() || DEFAULTS.ISS_TASK_ISSUETYPE,
          ISS_TASK_SUMMARY_TEMPLATE: String(modal.querySelector('#ml_s_iss_summary').value || '').trim() || DEFAULTS.ISS_TASK_SUMMARY_TEMPLATE,
          ISS_TASK_DEMANDA_CF: issDemCf,
          ISS_TASK_DEMANDA_VALUE: String(modal.querySelector('#ml_s_iss_dem_val').value || '').trim() || DEFAULTS.ISS_TASK_DEMANDA_VALUE,
          ISS_TASK_SERVICE_CF: issSvcCf,
          ISS_TASK_SERVICE_VALUE: String(modal.querySelector('#ml_s_iss_svc_val').value || '').trim() || DEFAULTS.ISS_TASK_SERVICE_VALUE,
          ISS_TASK_RESOLUTION_TEAM: String(modal.querySelector('#ml_s_iss_res').value || '').trim() || DEFAULTS.ISS_TASK_RESOLUTION_TEAM,
          ISS_TASK_LINK_TYPE_NAME: String(modal.querySelector('#ml_s_iss_link').value || '').trim(),
          ISS_TASK_MODEL_ISSUE: String(modal.querySelector('#ml_s_iss_model').value || '').trim().toUpperCase(),
          ISS_TASK_COPY_ATTACHMENTS: !!modal.querySelector('#ml_s_iss_atts').checked,
          ISS_TASK_COPY_COMMENTS:    !!modal.querySelector('#ml_s_iss_comments').checked,

          // Backup reminder
          BACKUP_REMIND_ENABLED: !!modal.querySelector('#ml_s_backup_enabled').checked,
          BACKUP_REMIND_INTERVAL_DAYS: (() => {
            const v = Number(modal.querySelector('#ml_s_backup_days').value);
            return Number.isFinite(v) && v >= 1 ? v : DEFAULTS.BACKUP_REMIND_INTERVAL_DAYS;
          })(),

          // Snippets
          COMMENT_SNIPPETS: (() => {
            const rows = [...modal.querySelectorAll('#ml_s_snip_list .ml-s-listrow')]
              .map(row => ({
                name: String(row.querySelector('.snip-name').value || '').trim(),
                command: (() => {
                  let c = String(row.querySelector('.snip-cmd').value || '').trim().replace(/\s+/g, '');
                  if(c && !c.startsWith('/')) c = '/' + c;
                  return c;
                })(),
                text: String(row.querySelector('.snip-text').value || '').trim()
              }))
              .filter(s => s.text); // texto obrigatorio
            // Valida comandos: apenas /[\w-]+, e nao podem repetir
            const seen = new Map();
            for(const s of rows){
              if(!s.command) continue;
              if(!/^\/[\w-]+$/.test(s.command)){
                throw new Error(`Comando invalido: "${s.command}". Use apenas letras, numeros, underscore ou hifen apos a "/".`);
              }
              const k = s.command.toLowerCase();
              if(seen.has(k)) throw new Error(`Comando duplicado: ${s.command}.`);
              seen.set(k, true);
            }
            return rows;
          })(),

          // Sugestoes de time
          DERIVE_TEAM_SUGGESTIONS: [...modal.querySelectorAll('#ml_s_sugg_list .ml-s-listrow')]
            .map(row => ({
              keyword: String(row.querySelector('.sugg-kw').value || '').trim(),
              team:    String(row.querySelector('.sugg-team').value || '').trim()
            }))
            .filter(r => r.keyword && r.team),

          // Tshoot Confluence: overrides de URL por label (so URL diferente do default vira override)
          CONFLUENCE_URL_OVERRIDES: (() => {
            const out = {};
            modal.querySelectorAll('#ml_s_conf_list .ml-s-conf-row').forEach(row => {
              const label = String(row.dataset.label || '').trim();
              const inp = row.querySelector('.conf-url');
              if(!label || !inp) return;
              const currentUrl  = String(inp.value || '').trim();
              const defaultUrl  = String(inp.dataset.default || '').trim();
              if(!currentUrl) return; // vazio = usa default
              if(currentUrl === defaultUrl) return; // igual ao default = sem override
              if(!/^https?:\/\//i.test(currentUrl)){
                throw new Error(`URL invalida em "${label}": ${currentUrl}`);
              }
              out[label] = currentUrl;
            });
            return out;
          })(),

          // Acoes de Status (lista)
          STATUS_ACTIONS: (() => {
            const rows = [...modal.querySelectorAll('#ml_s_status_list .ml-s-status-row')]
              .map(row => ({
                label:      String(row.querySelector('.status-label').value || '').trim(),
                transition: String(row.querySelector('.status-tr').value || '').trim(),
                comment:    String(row.querySelector('.status-comment').value || ''),
                internal:   !!row.querySelector('.status-internal').checked,
                assignToMe: !!row.querySelector('.status-assign').checked
              }))
              .filter(a => a.transition); // sem transicao = ignora
            // Label default = transition (se vazio)
            rows.forEach(a => { if(!a.label) a.label = a.transition; });
            return rows;
          })(),
          STATUS_MENU_SHORTCUTS: (() => {
            const lines = String(modal.querySelector('#ml_s_as_shortcuts').value || '')
              .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            return lines.length ? lines : DEFAULTS.STATUS_MENU_SHORTCUTS.slice();
          })(),
          QUICK_COMMENT_SHORTCUTS: (() => {
            const lines = String(modal.querySelector('#ml_s_qc_shortcuts').value || '')
              .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            return lines.length ? lines : DEFAULTS.QUICK_COMMENT_SHORTCUTS.slice();
          })()
        };

        const ok = saveSettings(values);
        if(!ok) return showErr('Nao foi possivel salvar (localStorage cheio ou bloqueado).');

        cacheClear();
        showOk('Salvo. Recarregando a pagina em 1.2s...');
        setTimeout(() => { location.reload(); }, 1200);
      }catch(e){
        showErr('Erro ao salvar: ' + (e.message || e));
      }
    });

    modal.querySelector('#ml_s_reset').addEventListener('click', () => {
      if(!confirm('Apagar todas as configuracoes salvas e voltar para os padroes? A pagina sera recarregada.')) return;
      resetSettings();
      cacheClear();
      location.reload();
    });

    // Exportar settings em JSON (download)
    modal.querySelector('#ml_s_export').addEventListener('click', () => {
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
        // Marca a data do ultimo backup pra zerar o lembrete periodico
        try{ if(typeof markBackupDone === 'function') markBackupDone(); }catch(_){}
        showOk('Configuracoes exportadas. Arquivo baixado.');
      }catch(e){
        showErr('Falha ao exportar: ' + (e.message || e));
      }
    });

    // Importar settings de um JSON
    const importBtn = modal.querySelector('#ml_s_import');
    const importFile = modal.querySelector('#ml_s_import_file');
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', async () => {
      const f = importFile.files?.[0];
      if(!f) return;
      try{
        const txt = await f.text();
        const data = JSON.parse(txt);
        const incoming = data?.settings || data;
        if(!incoming || typeof incoming !== 'object') throw new Error('JSON invalido (sem objeto settings).');
        const meta = data?._meta;
        const msg = meta
          ? `Importar configuracoes geradas em ${esc(meta.exportedAt || '?')} (${esc(meta.origin || '?')})?\nIsto vai SOBRESCREVER suas configuracoes atuais e recarregar a pagina.`
          : `Importar configuracoes deste arquivo JSON?\nIsto vai SOBRESCREVER suas configuracoes atuais e recarregar a pagina.`;
        if(!confirm(msg)){ importFile.value = ''; return; }
        const ok = saveSettings(incoming);
        if(!ok) throw new Error('Nao foi possivel salvar (localStorage cheio?).');
        showOk('Importado. Recarregando em 1.2s...');
        setTimeout(() => location.reload(), 1200);
      }catch(e){
        showErr('Falha ao importar: ' + (e.message || e));
      }finally{
        importFile.value = '';
      }
    });
  }

  // =========================
  // IMPORT TEXT BLAZE: modal pra colar JSON (gerado pelo scraper) ou TSV/CSV manual
  // =========================
  function openTextBlazeImportModal(onConfirm){
    document.getElementById('ml_tb_import_overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ml_tb_import_overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000050;';

    const modal = document.createElement('div');
    modal.id = 'ml_tb_import_modal';
    modal.style.cssText = [
      'position:fixed','top:8vh','left:50%','transform:translateX(-50%)',
      'width:min(720px,94vw)','max-height:84vh','overflow:hidden',
      'background:var(--ml-bg-1)','color:var(--ml-text)',
      'border:1px solid var(--ml-border)','border-radius:var(--ml-radius)',
      'z-index:10000051','display:flex','flex-direction:column'
    ].join(';');

    modal.innerHTML = `
      <div class="sh" style="flex-shrink:0;">
        <div>
          <div class="title">&#x2B07; Importar snippets do Text Blaze</div>
          <div class="meta">Cole o JSON gerado pelo scraper, ou uma lista manual.</div>
        </div>
        <button id="ml_tb_close">Fechar</button>
      </div>
      <div class="sb" style="flex:1;overflow-y:auto;">
        <div class="ml-s-tab-hint" style="margin-bottom:14px;">
          <b>3 jeitos de gerar a entrada:</b><br/>
          1) <b>Bookmarklet/Userscript</b> (recomendado): instale o <code>tools/textblaze-scraper.user.js</code> no Tampermonkey,
             abra <a href="https://dashboard.blaze.today/" target="_blank">dashboard.blaze.today</a>, clique no botao roxo
             "Capturar snippets" e cole aqui o JSON gerado.<br/>
          2) <b>JSON manual</b>: array no formato <code>[{"command":"/ola","name":"Saudacao","text":"Ola, tudo bem?"}]</code>.<br/>
          3) <b>Lista simples</b>: uma linha por snippet no formato <code>/comando | nome | texto</code> (separador <code>|</code> ou <code>tab</code>).
        </div>

        <label>Conteudo:</label>
        <textarea id="ml_tb_input" placeholder='Cole aqui...

Exemplos:
[{"command":"/ola","name":"Saudacao","text":"Ola, tudo bem?"}]

ou

/ola | Saudacao | Ola, tudo bem?
/obg | Agradecimento | Obrigado pelo retorno!' style="width:100%;min-height:200px;font-family:var(--ml-mono,monospace);font-size:12px;"></textarea>

        <div id="ml_tb_preview" style="margin-top:14px;display:none;">
          <div style="font-size:12px;font-weight:700;color:var(--ml-text-mut);margin-bottom:6px;">
            Preview: <span id="ml_tb_count">0</span> snippets sera(o) adicionado(s)
          </div>
          <div id="ml_tb_preview_list" style="max-height:240px;overflow-y:auto;background:var(--ml-bg-0);border:1px solid var(--ml-border);border-radius:6px;padding:8px;font-size:12px;"></div>
          <div style="margin-top:8px;font-size:11px;color:var(--ml-text-mut);">
            <b>Importante:</b> os snippets sao adicionados ao final da lista atual. Voce ainda precisa clicar <b>"Salvar"</b>
            no modal de Configuracoes pra persistir.
          </div>
        </div>

        <div id="ml_tb_err" style="display:none;margin-top:12px;color:#ffd8d8;background:var(--ml-red-soft);border:1px solid var(--ml-red);padding:10px 12px;border-radius:6px;font-size:12px;"></div>

        <div class="actions" style="margin-top:18px;">
          <button id="ml_tb_cancel" class="ghost">Cancelar</button>
          <button id="ml_tb_validate">Validar</button>
          <button id="ml_tb_import" class="primary" disabled style="opacity:.5;">Importar</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    const close = () => { overlay.remove(); modal.remove(); };
    overlay.onclick = close;
    modal.querySelector('#ml_tb_close').onclick = close;
    modal.querySelector('#ml_tb_cancel').onclick = close;

    const input = modal.querySelector('#ml_tb_input');
    const errBox = modal.querySelector('#ml_tb_err');
    const previewBox = modal.querySelector('#ml_tb_preview');
    const previewList = modal.querySelector('#ml_tb_preview_list');
    const previewCount = modal.querySelector('#ml_tb_count');
    const importBtn = modal.querySelector('#ml_tb_import');

    let parsed = [];

    const showErr = (msg) => { errBox.textContent = msg; errBox.style.display = 'block'; };
    const hideErr = () => { errBox.style.display = 'none'; };
    const setImportEnabled = (on) => {
      importBtn.disabled = !on;
      importBtn.style.opacity = on ? '' : '.5';
      importBtn.style.cursor = on ? '' : 'not-allowed';
    };

    const validate = () => {
      hideErr();
      const raw = (input.value || '').trim();
      if(!raw){ showErr('Cole algum conteudo primeiro.'); previewBox.style.display='none'; setImportEnabled(false); return; }

      parsed = parseTextBlazeInput(raw);
      if(!parsed.length){
        showErr('Nao consegui interpretar nada. Confira o formato (veja exemplos acima).');
        previewBox.style.display = 'none';
        setImportEnabled(false);
        return;
      }
      previewCount.textContent = parsed.length;
      previewList.innerHTML = parsed.map(s => `
        <div style="padding:6px 8px;border-bottom:1px solid var(--ml-border);">
          <code style="color:var(--ml-blue);">${esc(s.command || '(sem cmd)')}</code>
          <b style="margin-left:8px;">${esc(s.name || '(sem nome)')}</b>
          <div style="color:var(--ml-text-mut);font-size:11px;margin-top:2px;white-space:pre-wrap;">${esc((s.text || '').slice(0, 160))}${s.text && s.text.length > 160 ? '...' : ''}</div>
        </div>
      `).join('');
      previewBox.style.display = 'block';
      setImportEnabled(true);
    };

    modal.querySelector('#ml_tb_validate').onclick = validate;
    input.addEventListener('input', () => { hideErr(); setImportEnabled(false); previewBox.style.display='none'; });

    importBtn.onclick = () => {
      if(!parsed.length) return;
      try{ onConfirm(parsed); }catch(e){ showErr('Erro ao adicionar: ' + (e.message || e)); return; }
      close();
    };
  }

  // Parser flexivel: tenta JSON primeiro, depois TSV/pipe.
  function parseTextBlazeInput(raw){
    // Tentativa 1: JSON puro (array ou {snippets: [...]})
    try{
      const j = JSON.parse(raw);
      const arr = Array.isArray(j) ? j : (Array.isArray(j?.snippets) ? j.snippets : null);
      if(arr){
        return arr.map(normalizeSnippet).filter(s => s.command || s.name || s.text);
      }
    }catch(_){ /* nao eh json, segue */ }

    // Tentativa 2: linhas com separador pipe ou tab
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const out = [];
    for(const line of lines){
      // Separadores aceitos (em ordem de prioridade): tab, pipe duplo, pipe simples
      let parts;
      if(line.includes('\t')) parts = line.split('\t');
      else if(line.includes('||')) parts = line.split('||');
      else if(line.includes('|')) parts = line.split('|');
      else parts = [line]; // 1 campo so = vira o texto

      parts = parts.map(p => p.trim());

      // Layouts aceitos:
      // 3 campos: cmd | nome | texto    (ordem padrao)
      // 2 campos: cmd | texto           (sem nome -> usa cmd como nome)
      // 1 campo:  texto                 (sem cmd nem nome)
      let command = '', name = '', text = '';
      if(parts.length >= 3){
        command = parts[0]; name = parts[1]; text = parts.slice(2).join(' | ');
      }else if(parts.length === 2){
        command = parts[0]; text = parts[1];
      }else{
        text = parts[0];
      }

      // Se o primeiro campo nao comeca com / e parece texto longo, tenta swap: pode ser "nome | texto"
      if(parts.length === 2 && !/^\//.test(command) && command.length > 30){
        text = parts.join(' '); command = '';
      }
      // Auto-prefixa / no command
      if(command && !command.startsWith('/')) command = '/' + command;
      if(command) command = command.replace(/\s+/g, '');

      const norm = normalizeSnippet({ command, name, text });
      if(norm.command || norm.text) out.push(norm);
    }
    return out;
  }

  function normalizeSnippet(s){
    s = s || {};
    let command = String(s.command || s.shortcut || s.cmd || '').trim();
    let name    = String(s.name || s.label || s.title || '').trim();
    let text    = String(s.text || s.content || s.body || s.snippet || '').trim();

    if(command && !command.startsWith('/')) command = '/' + command;
    command = command.replace(/\s+/g, '');

    // Fallback de nome: usa o command sem /
    if(!name && command) name = command.replace(/^\//, '');
    // Fallback final: primeira palavra do texto
    if(!name && text) name = text.split(/\s+/).slice(0, 3).join(' ').slice(0, 40);

    return { command, name, text };
  }
