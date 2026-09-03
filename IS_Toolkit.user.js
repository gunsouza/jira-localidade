// ==UserScript==
// @name         IS Toolkit
// @namespace    https://github.com/gunsouza/jira-localidade
// @version      1.65.0
// @description  IS Toolkit — Ferramentas de atendimento N1 para o Jira: duplicados por localidade, derivacao automatica, criacao de ISS, status rapido, snippets, chips de documentacao e gerenciador de fila em lote.
// @author       gunsouza
// @match        https://*.atlassian.net/*
// @match        https://web.whatsapp.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @connect      furycloud.io
// @connect      melisystems.com
// @connect      verdi-flows.melisystems.com
// @connect      grid.melioffice.com
// @noframes
// @homepageURL  https://github.com/gunsouza/jira-localidade
// @updateURL    https://raw.githubusercontent.com/gunsouza/jira-localidade/main/IS_Toolkit.user.js
// @downloadURL  https://raw.githubusercontent.com/gunsouza/jira-localidade/main/IS_Toolkit.user.js
// ==/UserScript==

(function () {
    'use strict';

    // =========================
    // MODO WHATSAPP WEB
    // Quando o script roda em web.whatsapp.com, ele NAO carrega o toolkit do Jira.
    // Em vez disso: (1) sinaliza presenca (heartbeat) pra o Jira saber que ha uma aba
    // do WhatsApp aberta; (2) escuta requisicoes do Jira (GM storage compartilhado) e
    // NAVEGA a propria aba pra conversa — reusando a aba ja aberta.
    // =========================
    if(location.hostname === 'web.whatsapp.com'){
      try{ _waWebSideInit(); }catch(e){ console.warn('[is-toolkit][wa-web] init falhou:', e); }
      return;
    }
    function _waWebSideInit(){
      const _set = (k,v) => { try{ if(typeof GM_setValue!=='undefined') GM_setValue(k,v); }catch(_){} };
      const _get = (k,d) => { try{ return (typeof GM_getValue!=='undefined') ? GM_getValue(k,d) : d; }catch(_){ return d; } };
      const pageLoad = Date.now();
      // Ao receber uma requisicao do Jira: CONFIRMA (ack) que esta aba vai atender e
      // navega pra conversa. O ack (event-driven) funciona mesmo com a aba em segundo
      // plano — diferente de um heartbeat por timer, que o navegador estrangula no fundo.
      // Abre a conversa e tenta trazer a aba pra frente. Usa uma NOTIFICACAO clicavel:
      // clicar numa notificacao conta como gesto do usuario, entao o window.focus() funciona
      // (o navegador bloqueia foco de aba em segundo plano sem gesto). Quem usa WhatsApp Web
      // normalmente ja concedeu permissao de notificacao, entao funciona de primeira.
      const _waNotifyAndOpen = (url) => {
        let navigated = false;
        const go = () => {
          if(navigated) return; navigated = true;
          try{ window.focus(); }catch(_){}
          if(location.href !== url) location.href = url;
        };
        try{
          if('Notification' in window && Notification.permission === 'granted'){
            const n = new Notification('Suporte IS — abrir conversa', {
              body: 'Clique para ir à conversa no WhatsApp Web.',
              tag: 'ml-wa-open', renotify: true
            });
            n.onclick = () => { try{ window.focus(); }catch(_){} try{ n.close(); }catch(_){} go(); };
            setTimeout(go, 5000); // se nao clicar, abre mesmo assim (em segundo plano)
            return;
          }
        }catch(_){}
        go();
      };
      const handle = (raw) => {
        try{
          const req = (typeof raw === 'string') ? JSON.parse(raw) : raw;
          if(req && req.url && (Date.now() - (req.ts || 0) < 30000)){
            _set('ml_wa_ack', req.ts);
            _waNotifyAndOpen(req.url);
          }
        }catch(_){}
      };
      let wired = false;
      try{
        if(typeof GM_addValueChangeListener !== 'undefined'){
          GM_addValueChangeListener('ml_wa_request', (name, oldV, newV) => handle(newV));
          wired = true;
        }
      }catch(_){}
      if(!wired){
        // Fallback por polling (so processa requisicoes criadas APOS o load desta pagina).
        let last = 0;
        setInterval(() => {
          const raw = _get('ml_wa_request', null);
          if(!raw) return;
          try{
            const req = (typeof raw === 'string') ? JSON.parse(raw) : raw;
            if(req && req.ts && req.ts > pageLoad && req.ts !== last){ last = req.ts; handle(raw); }
          }catch(_){}
        }, 1500);
      }
    }

    // =========================
    // SETTINGS storage (localStorage da origem do Jira)
    // Definido antes de 10-config.js para que loadSettings esteja disponivel
    // no momento em que as constantes globais de config sao avaliadas.
    // =========================
    // Storage: usa GM_setValue/GM_getValue (Tampermonkey) para persistir mesmo quando
    // o browser limpa dados de site ao fechar (comum em ambientes corporativos).
    // Fallback para localStorage caso GM nao esteja disponivel.
    const _STORAGE_KEY = 'ml_loc_settings_v1';

    function _gmGet(key){
      try{ return (typeof GM_getValue !== 'undefined') ? GM_getValue(key, null) : null; }catch{ return null; }
    }
    function _gmSet(key, val){
      try{ if(typeof GM_setValue !== 'undefined'){ GM_setValue(key, val); return true; } }catch{}
      return false;
    }
    function _gmDel(key){
      try{ if(typeof GM_deleteValue !== 'undefined') GM_deleteValue(key); }catch{}
    }

    function loadSettings(defaults){
      try{
        // Tenta GM storage primeiro (persiste entre sessoes de browser)
        let raw = _gmGet(_STORAGE_KEY);
        // Fallback: migra dados antigos do localStorage se GM estiver vazio
        if(raw === null || raw === undefined){
          const lsRaw = localStorage.getItem(_STORAGE_KEY);
          if(lsRaw){
            raw = lsRaw;
            // Migra para GM storage e limpa localStorage
            _gmSet(_STORAGE_KEY, lsRaw);
            try{ localStorage.removeItem(_STORAGE_KEY); }catch{}
          }
        }
        const stored = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
        if(!stored || typeof stored !== 'object') return { ...defaults };
        return { ...defaults, ...stored };
      }catch{
        return { ...defaults };
      }
    }

    function saveSettings(values){
      try{
        const serialized = JSON.stringify(values || {});
        if(_gmSet(_STORAGE_KEY, serialized)) return true;
        // Fallback para localStorage
        localStorage.setItem(_STORAGE_KEY, serialized);
        return true;
      }catch{
        return false;
      }
    }

    function resetSettings(){
      _gmDel(_STORAGE_KEY);
      try{ localStorage.removeItem(_STORAGE_KEY); }catch{}
    }
    // =========================
    // CONFIG (defaults + overrides via Configuracoes)
    // Os valores 'DEFAULTS' sao a configuracao "out of the box".
    // 'SETTINGS' aplica overrides salvos pelo usuario (modal de Configuracoes).
    // Para alterar, abra o modal "Localidade" e clique na engrenagem.
    // =========================
    const DEFAULTS = {
      CF_ASSET: 18388,
      CF_RES_TEAM: 15613,

      PROJECTS: ['IS', 'ISS', 'SSHP'],

      PAGE_SIZE: 50,
      MAX_PAGES: 6,
      MAX_RESULTS: 100,

      HIDE_RESOLVED: true,
      OPEN_FILTER: 'statusCategory != Done',
      ORDER_BY: 'updated DESC',

      DESC_PREVIEW_LEN: 240,
      DUP_LABEL_MAX_TOKENS: 3,

      CACHE_TTL_MS: 2 * 60 * 1000,

      DERIVE_TRANSITION_NAME: 'Derive the other team',
      DERIVE_COMMENT_DEFAULT: 'Ticket sendo derivado para fila correta de atendimento.',
      // Apos derivar (single ou lote), remove voce da lista de watchers do ticket
      // (DELETE /rest/api/3/issue/{key}/watchers?accountId=...). Voce para de receber
      // notificacoes daquele ticket. Best-effort: nao bloqueia o fluxo se falhar.
      DERIVE_UNWATCH_AFTER: true,
      // Apos derivar, remove o assignee atual (volta o ticket pra fila do novo time).
      // Default true porque, ao derivar pra outro time, o esperado e que QUALQUER pessoa
      // do novo time possa pegar o ticket -- deixar atribuido pra voce confunde.
      DERIVE_UNASSIGN_AFTER: true,
      DERIVE_TEAMS_ALLOWLIST: [
        "IS-SHIP-NATS-N1",
        "IS-SHIP-OPS",
        "IS-EXT-SIMPRESS",
        "IS-SHIP-FIELDSERVICE",
        "IS-SHIP-NETWORK",
        "IS-SHIP-SE-N2",
        "IS-PRINTERS"
      ],

      // Atalhos de teclado para abrir/fechar o popup. Aceita varios em paralelo
      // (assim o mesmo build funciona pro Windows e pro Mac sem ajuste).
      // No Mac: Alt = Option (mesma tecla fisica). Cmd = Meta.
      // Defaults sem conflito com Chrome DevTools no Mac.
      SHORTCUTS: ['Alt+L', 'Cmd+Shift+L', 'Ctrl+Shift+L'],
      SHORTCUT: 'Alt+L', // legacy

      // ---- Auto-reload da pagina (o Jira daqui nao atualiza em tempo real) ----
      // Intervalo padrao em segundos. O liga/desliga fica num botao flutuante e eh
      // POR ABA (sessionStorage); o intervalo padrao eh global.
      // Bloco fica escondido do usuario final por padrao (Task interna de 2026-08-27): o botao
      // flutuante confundia gente que nao usava a feature. O codigo continua funcionando pra
      // quem quiser ligar via Configuracoes -> Auto-reload -> "Mostrar botao flutuante".
      AUTO_RELOAD_BUTTON_VISIBLE: false,
      AUTO_RELOAD_INTERVAL_SEC: 60,
      // Se true, toda aba do Jira ja abre com o auto-reload ligado. Default false
      // (voce liga manualmente por aba). Pausas de seguranca configuraveis abaixo.
      AUTO_RELOAD_AUTOSTART: false,
      AUTO_RELOAD_PAUSE_TYPING: true, // nao recarrega enquanto digita
      AUTO_RELOAD_PAUSE_MODAL: true,  // nao recarrega com modal do toolkit aberto

      // ---- Criar tarefa ISS (checkbox que aparece no Derive quando o time selecionado esta em ISS_TASK_TRIGGER_TEAMS) ----
      // Vazio = checkbox nunca aparece. Configure em Configuracoes -> "Criar tarefa ISS".
      ISS_TASK_TRIGGER_TEAMS: ["IS-SHIP-SE-N2", "IS-PRINTERS"],
      // ---- Override de ISS por TIME de destino ----
      // Quando o time pra onde estamos derivando estiver aqui, a ISS e criada
      // value-based com estes valores (tem prioridade sobre regras Confluence e sobre
      // o modelo/defaults globais). Serve pra times cujo Service difere do padrao CCTV.
      // Formato: { "IS-TIME": { service?, demanda?, resTeam? } }.
      ISS_TASK_TEAM_OVERRIDES: {
        "IS-PRINTERS": { service: 'Impresora', demanda: 'Analisis' }
      },
      ISS_TASK_PROJECT: 'ISS',
      ISS_TASK_ISSUETYPE: 'Tarefa',
      ISS_TASK_SUMMARY_TEMPLATE: 'Troubleshooting {key}',
      ISS_TASK_DEMANDA_CF: 15779,
      ISS_TASK_DEMANDA_VALUE: 'Analisis',
      ISS_TASK_SERVICE_CF: 12758,
      ISS_TASK_SERVICE_VALUE: 'CCTV',
      ISS_TASK_RESOLUTION_TEAM: 'IS-SHIP-NATS-N1',
      // Nome do link type Jira. Se vazio, auto-descobre buscando inward contendo "vinculad".
      ISS_TASK_LINK_TYPE_NAME: '',
      // Issue ISS modelo: se preenchido, copiamos os RAW values de Demanda/Service/Resolution Team
      // direto dela. Util quando o Jira tem validadores customizados (ex: "Especifique o valor para
      // Service na matriz") que rejeitam {value: "..."} construido pelo nome.
      ISS_TASK_MODEL_ISSUE: 'ISS-19104',
      // Copiar anexos do ticket que estamos derivando para a tarefa ISS criada (best-effort).
      ISS_TASK_COPY_ATTACHMENTS: true,
      // Quando true, ao criar uma tarefa ISS o plugin baixa todos os comentarios do
      // ticket origem e adiciona UM UNICO comentario-resumo (interno) na nova tarefa
      // contendo: autor, data, visibilidade original e o texto. Mais compacto que
      // 1-para-1 e evita poluicao do historico.
      ISS_TASK_COPY_COMMENTS: true,
      // Fecha a tarefa ISS automaticamente apos cria-la (aplica a transicao de Done).
      // O script detecta automaticamente qual transicao leva ao status "Done".
      // Util quando a ISS e criada apenas para registrar/troubleshoot e ja pode ser fechada.
      ISS_TASK_AUTO_CLOSE: true,
      // Texto preenchido no campo "Solution" ao fechar a ISS automaticamente.
      ISS_TASK_AUTO_CLOSE_SOLUTION: 'Troubleshooting vinculado e tarefa encerrada',

      // ---- Snippets de comentario (banco reutilizavel por usuario) ----
      // Cada snippet eh { name: string, text: string }. Usados em qualquer textarea
      // de comentario do plugin (Derivar, Obs interna em Duplicados, Lote).
      COMMENT_SNIPPETS: [],

      // ---- Sugestoes de time pra Derivar (heuristica por palavra-chave) ----
      // Cada regra eh { keyword: string, team: string }. Comparacao case-insensitive
      // contra summary + description do ticket atual. Primeira que casar vence.
      DERIVE_TEAM_SUGGESTIONS: [],

      // ---- Tshoot Confluence (chip lateral com link de troubleshooting) ----
      // Lista mantida CENTRALMENTE neste arquivo (admin = quem build do plugin).
      // Cada regra:
      //   {
      //     label, url, icon?, color?,
      //     match: [{ field, value, mode? }, ...],
      //     // OPCIONAIS pra criacao de ISS:
      //     issTemplate?:        'ISS-XXXXX',     // template-based (mais robusto)
      //     issService?:         'CCTV',          // value-based (mais simples, ver abaixo)
      //     issDemanda?:         'Analisis',      // override do default
      //     issResolutionTeam?:  'IS-SHIP-...'    // override do default
      //   }
      //   - field: nome humano ("Object Type") ou customfield_XXXX
      //   - value: comparacao case-insensitive + ignora acentos/hifens
      //   - mode:  'exact' (default) | 'contains'
      //   - match e AND entre criterios. Multiplas regras podem matchar (mostra varios chips).
      //
      // Criacao de ISS por categoria SE (novidade da v1.20.2+):
      //   Quando o usuario clica em "Criar ISS" (via Derivar ou outro fluxo) a partir
      //   de um chamado que MATCHA esta regra, o plugin usa os campos issXxx pra preencher
      //   a tarefa ISS. PRIMEIRA regra que casa vence (ordem importa).
      //
      //   Duas formas de mapear:
      //   1) issTemplate='ISS-XXXX' (template-based): o plugin LE o ticket referenciado e
      //      copia Demanda, Service, ResTeam dele. Mais robusto pra Jiras com validadores
      //      customizados que rejeitam strings. Requer 1 ticket-modelo por categoria.
      //   2) issService='CCTV' (value-based): o plugin usa o nome direto como string.
      //      Mais simples (sem precisar criar tickets-modelo), mas pode falhar em alguns
      //      Jiras se houver validators rigidos.
      //
      //   Pode combinar: se a regra tem AMBOS issTemplate e issService, template vence.
      //   Se nenhuma regra casar, usa ISS_TASK_MODEL_ISSUE / ISS_TASK_*_VALUE default.
      //
      //   Ex - Botao de Panico: issTemplate=ISS-19469 -> cria ISS com Service=Control Acceso
      //   Ex - Camera:          issService='CCTV'     -> cria ISS com Service=CCTV
      //
      // Pra adicionar uma nova regra:
      //   1) No Jira, abra um ticket exemplo
      //   2) Use o "Inspetor de campos" no Settings -> Tshoot Confluence
      //   3) Marque os criterios e gere o snippet JS
      //   4) Cole o snippet aqui dentro do array
      //   5) Rebuild (./build.sh) e distribua pra equipe
      //
      // Usuarios podem sobrescrever apenas a URL (ex: link do Confluence mudou)
      // via SETTINGS.CONFLUENCE_URL_OVERRIDES = { "<label da regra>": "https://..." }
      CONFLUENCE_RULES: [
        {
          label: 'Botao de Panico',
          icon:  '\u{1F6A8}', // sirene
          url:   'https://mercadolibre.atlassian.net/wiki/spaces/ISS/pages/3089432930/Bot+o+de+P+nico',
          match: [
            // Tickets de "Botao de Panico" e Alarma compartilham o mesmo troubleshooting
            { field: 'Object Type', value: ['Boton de panico', 'Alarma'] }
          ],
          // Quando criamos uma tarefa ISS a partir deste tipo de chamado, usamos este
          // ticket como TEMPLATE (copia Demanda, Service, Resolution Team).
          // Pra Botao de Panico: Service = "Control Acceso", Demand = "Analisis", ResTeam = SHIP-NATS-N1.
          issTemplate: 'ISS-19469'
        },
        // ---- REGRAS DE MAPPING ISS (noChip=true: nao mostram chip lateral) ----
        // Servem apenas pra resolver "qual Service usar quando criar ISS" baseado no
        // Object Type do ticket origem. Sao avaliadas DEPOIS da regra de Botao de Panico
        // (que tem template proprio), entao se um ticket bate em ambos, o template vence.
        //
        // IMPORTANTE: a ORDEM importa. Primeira regra que casa = vence. Por isso "Botao
        // de Panico" (com template) vem antes desses mappings genericos.
        {
          label: 'ISS Mapping: Control Acceso',
          noChip: true,
          match: [
            { field: 'Object Type', value: ['Alarma', 'Detector de Metales', 'Lector biometrico', 'Torniquete - Molinete'] }
          ],
          issService: 'Control Acceso'
        },
        {
          label: 'ISS Mapping: CCTV',
          noChip: true,
          match: [
            { field: 'Object Type', value: ['Camara - CCTV', 'Desktop - CCTV', 'Video Wall'] }
          ],
          issService: 'CCTV'
        },
        // ---- FIM mapping ISS ----

        {
          // PYMES = Pesar Y Medir (cubadores de Mercado Envios).
          // Ha 2 fornecedoras (Sick e Toledo). Como o ticket nao distingue automaticamente,
          // mostramos AMBOS os chips quando bate Cubiscan. Analista escolhe baseado no site.
          // Usando 'contains' pra tolerar variacoes ("Cubiscan (Bascula)", "Cubiscan v2", etc).
          label: 'PYMES Sick',
          icon:  'S',
          color: '#d18a1f',  // dourado-laranja
          url:   'https://mercadolibre.atlassian.net/wiki/spaces/ISS/pages/4030332933/Troubleshooting+SICK+-+Cubador+Din+mico',
          match: [
            { field: 'Object Type', value: 'Cubiscan', mode: 'contains' }
          ]
        },
        {
          label: 'PYMES Toledo',
          icon:  'T',
          color: '#8b5cf6',  // roxo (diferencia da Sick)
          url:   'https://mercadolibre.atlassian.net/wiki/spaces/ISS/pages/4274946367/Toledo+Cubador+Est+tico+-+Troubleshooting',
          match: [
            { field: 'Object Type', value: 'Cubiscan', mode: 'contains' }
          ]
        },

        // ---- CHIPS DE DOCUMENTACAO SE (adicionados em jun/2026) ----
        // Cada chip abre a pagina de troubleshooting do Confluence correspondente.
        // Match por Object Type (valor exato do Assets no Jira).
        // Use Configuracoes -> Confluence -> "Inspecionar ticket atual" para ajustar os campos
        // caso os valores abaixo nao batam com os do seu Jira.

        {
          // Camera SE: CCTV e equipamentos de videomonitoramento
          label: 'Camera SE',
          icon:  '\u{1F4F9}', // camera de video
          url:   'https://mercadolibre.atlassian.net/wiki/spaces/ISS/pages/1836487895/C+mera+-+SE',
          match: [
            { field: 'Object Type', value: ['Camara - CCTV', 'Desktop - CCTV', 'Video Wall'] }
          ]
        },
        {
          // Catracas: torniquetes e molinetes de acesso
          label: 'Catracas',
          icon:  '\u{1F6C2}', // controle de passagem (catraca)
          url:   'https://mercadolibre.atlassian.net/wiki/spaces/ISS/pages/3237675598/Checklist+N1+Catracas+offline',
          match: [
            { field: 'Object Type', value: 'Torniquete - Molinete' }
          ]
        },
        {
          // Morpho: leitores biometricos (impressao digital / facial)
          // Usa Object Type — mesma logica das ISS Mapping rules (ja validada).
          label: 'Morpho',
          icon:  '\u{1FAC6}', // mao biometrica (Morpho)
          url:   'https://mercadolibre.atlassian.net/wiki/spaces/ISS/pages/3237380943/Morpho+no+funciona+Offline+checklist+N1',
          match: [
            { field: 'Object Type', value: 'Lector biometrico' }
          ]
        },
        {
          // Lenel: sistema de controle de acesso (software/servidor)
          // Se o Object Type do seu Jira tiver nome diferente, ajuste via Configuracoes -> Confluence.
          label: 'Lenel',
          icon:  '\u{1FAA9}', // cartao de identificacao/cracha (Lenel)
          url:   'https://mercadolibre.atlassian.net/wiki/spaces/ISS/pages/2012807295/Crear+usuario+para+acceder+a+LENEL',
          match: [
            { field: 'Object Type', value: 'Lenel', mode: 'contains' }
          ]
        },
        {
          // Totem Shipping: tablets usados como totens no Mercado Envios.
          // Diferente dos tickets de SE, esses NAO usam Object Type — usam:
          //   Object origin = "Mercado Envios" (origem do equipamento)
          //   Problem Hardware = "Tablet" (hardware do totem)
          label: 'Totem Shipping',
          icon:  '\u{1F5A5}', // monitor/totem
          url:   'https://mercadolibre.atlassian.net/wiki/spaces/ISS/pages/4280746756/Funcionalidades+totens+Shipping',
          match: [
            { field: 'Object origin', value: 'Mercado Envios', mode: 'contains' },
            { field: 'Problem Hardware', value: 'Tablet' }
          ]
        }
      ],
      // Overrides de URL (so URL pode ser editado pelo usuario final).
      // Map { label -> url }. Vazio = usa a URL do DEFAULTS.
      CONFLUENCE_URL_OVERRIDES: {},

      // ---- Acoes de Status ----
      // Cada acao representa um "botao rapido" que aplica uma transicao no ticket atual,
      // com mensagem proprio e configuracoes especificas (publico/interno, atribuir pra mim).
      // O botao flutuante "Status" abre um menu com TODAS as acoes configuradas;
      // se houver so 1, executa direto.
      //
      // Estrutura de cada acao:
      //   {
      //     label: 'Em andamento',                       // texto que aparece no menu
      //     transition: 'In progress',                   // nome EXATO da TRANSICAO (nao do status final)
      //     comment: 'Atendimento sendo realizado...',   // mensagem (multilinha) - usuario pode editar na hora
      //     internal: false,                             // true=obs interna; false=publico
      //     assignToMe: true                             // se deve atribuir pra voce ao aplicar
      //   }
      //
      // O modal "Mudar status" mostra TODAS as transicoes disponiveis no ticket atual,
      // marcando as que tem mensagem pre-cadastrada com badge. Pra transicoes sem cadastro,
      // o usuario digita a mensagem manualmente.
      STATUS_ACTIONS: [
        {
          label: 'Em andamento',
          transition: 'In progress',
          comment: '',
          internal: false,
          assignToMe: true
        },
        {
          label: 'Aguardando cliente',
          transition: 'Request information',
          comment: '',
          internal: false,
          assignToMe: false
        },
        {
          label: 'Aguardando suporte',
          transition: 'Accionar SRE para gestion de IC',
          comment: '',
          internal: false,
          assignToMe: false
        },
        {
          label: 'Pending partner action',
          transition: 'Pending partner action',
          comment: '',
          internal: false,
          assignToMe: false
        }
      ],

      // ---- Vincular + Fechar (tela de Duplicados) ----
      // Transicao aplicada em cada ticket apos vincula-lo como duplicado. {vinculado} = key do
      // ticket que permanece aberto; {meu_nome} = quem esta logado. Campos exigidos pela
      // transicao (Resolucao, custom fields, etc.) sao pedidos na hora via formulario generico.
      DUPLICATE_CLOSE_TRANSITION: 'Resolve',
      DUPLICATE_CLOSE_COMMENT: 'Chamado duplicado e sendo atendido através do: {vinculado}\n\nAtenciosamente,',
      DUPLICATE_CLOSE_INTERNAL: false,

      // Label adicionado automaticamente a cada ticket processado (para metricas de uso).
      // Filtre no Jira com: labels = "is-toolkit"
      USAGE_LABEL: 'is-toolkit',

      // ---- Marcação de uso num campo de texto livre (complementa o USAGE_LABEL) ----
      // Alguns times filtram/relatam por um campo de texto ("Categorias" ou outro) em vez
      // de labels. Se configurado, toda ação relevante do toolkit acrescenta USAGE_MARK_TEXT
      // ao final do valor atual do campo (sem apagar o que já estava escrito). Idempotente:
      // se o marcador já estiver presente, não duplica.
      // 0 = desligado (nenhuma escrita nesse campo). Descubra o ID em Configuracoes → Avancado.
      CF_USAGE_MARK: 0,
      USAGE_MARK_TEXT: '[IS-Toolkit]',

      // Atalhos para abrir o menu de Status (ou executar direto se houver 1 acao).
      // Cmd+Shift+I conflita com Chrome DevTools no Mac, entao usamos Cmd+Shift+E.
      STATUS_MENU_SHORTCUTS: ['Alt+I', 'Cmd+Shift+E', 'Ctrl+Shift+I'],

      // Transicoes que NUNCA devem aparecer no modal "Mudar status" mesmo que o Jira
      // retorne como disponivel (ex: acoes de plugins/automacoes que confundem o usuario).
      // Match case-insensitive + ignora acentos/hifens.
      STATUS_HIDDEN_TRANSITIONS: [
        'Accionar SRE para gestion de IC'
      ],

      // ---- Backup reminder ----
      // Configs ficam no localStorage do navegador, NAO sincronizam entre maquinas/perfis.
      // Pra evitar perder tudo (limpar cache, trocar PC, etc), o plugin lembra periodicamente
      // de exportar (botao Exportar do Settings gera um JSON).
      BACKUP_REMIND_ENABLED: true,
      BACKUP_REMIND_INTERVAL_DAYS: 30,
      BACKUP_REMIND_SNOOZE_DAYS: 7, // ao clicar "Lembrar depois"

      // ---- Comentario rapido com snippet (1 click) ----
      // Cmd+Shift+C conflita com inspect element do DevTools no Mac, entao usamos Cmd+Shift+K.
      QUICK_COMMENT_SHORTCUTS: ['Alt+C', 'Cmd+Shift+K', 'Ctrl+Shift+K'],

      // ---- Auditoria de Ticket (IA via n8n) ----
      // URL do webhook n8n que recebe os dados do ticket e retorna a analise.
      // Fixa pra todo o time (workflow central "ist-ticket-audit" no verdi-flows) — ninguem
      // precisa configurar isso na instalacao. Deixe vazio pra desabilitar o card de auditoria,
      // ou troque aqui em Configuracoes -> Avancado -> Integracoes se o endpoint mudar de lugar.
      AUDIT_WEBHOOK_URL: 'http://verdi-flows.melisystems.com/webhook/ist-ticket-audit',

      // ---- Central do Grid (dashboard de arquivos usados pelo time) ----
      // Link fixo pra central de Grid do time. Aparece como atalho na Home do toolkit.
      GRID_CENTRAL_URL: 'https://grid.adminml.com/d/01KT9SR6G0F092GPTSE1G9DR71/view',

      // ---- Campos customizados de auditoria (IDs por instancia Jira) ----
      // Preenchidos via "Descobrir campos" em Configuracoes → Integrações.
      // 0 = nao configurado (campo ignorado na auditoria).
      CF_CATEGORY:        0,
      CF_SUBCATEGORY:     0,
      CF_REQUEST_TYPE:    0,
      CF_USER_VALIDATION: 0,
      CF_SOLUTION_TYPE:   0,
      // Flag "Changed priority" (No/Yes): quando Yes, indica que houve reclassificacao
      // de prioridade (mesmo aplicada por automacao). A auditoria cobra justificativa.
      CF_CHANGED_PRIORITY: 26266,

      // ---- Acionamento via WhatsApp (botao flutuante) ----
      // Abre wa.me com o telefone do "Contact phone" e uma mensagem pre-escrita.
      // O WhatsApp nao permite enviar automaticamente por link — a mensagem fica pronta e o usuario aperta Enter.
      // CF_CONTACT_PHONE: ID do customfield "Contact phone". 0 = ler da pagina (DOM).
      CF_CONTACT_PHONE: 0,
      // Codigo do pais: inferido pela LOCALIDADE (BR/MX/CO/CL/AR/PE). Se a pessoa colocar "+"
      // no telefone, respeita o codigo dela. Este valor eh so o FALLBACK quando nao dah pra inferir.
      WHATSAPP_COUNTRY_CODE: '55',
      // Placeholders: {key} = chave do chamado, {reporter} = nome do relator, {firstname} = primeiro nome.
      WHATSAPP_MSG_TEMPLATE: 'Olá! Aqui é do suporte IS (Mercado Livre), referente ao chamado {key}. Podemos falar sobre ele?',

      // ---- Atalho Cmd+Shift+A (Atribuir + In Progress) ----
      // Atalho de teclado para assumir o ticket e mover para In Progress.
      ASSIGN_SHORTCUT: 'Cmd+Shift+A',
      // Comentario publico postado automaticamente ao mover o ticket para In Progress.
      ASSIGN_COMMENT: 'Iniciando atendimento.',

      // ---- Assistente de setup inicial ----
      // true depois que o usuario passa pelo wizard (Salvar ou Pular). Usado junto com
      // _IS_FRESH_INSTALL pra decidir se mostra o wizard automaticamente no primeiro uso
      // (instalacoes que ja tinham configuracao salva antes desta versao NUNCA sao
      // interrompidas por ele, mesmo com esta flag em false).
      SETUP_WIZARD_DONE: false
    };

    // Calculado ANTES de loadSettings() (que migra localStorage -> GM e teria mascarado o resultado):
    // true so quando NUNCA existiu configuracao salva neste navegador/perfil — ou seja, so dispara
    // o wizard automatico pra instalacoes genuinamente novas, nunca pra quem ja usa o toolkit.
    const _IS_FRESH_INSTALL = (_gmGet(_STORAGE_KEY) == null) && !localStorage.getItem(_STORAGE_KEY);

    const SETTINGS = loadSettings(DEFAULTS);

    const CF_ASSET = SETTINGS.CF_ASSET;
    const CF_RES_TEAM = SETTINGS.CF_RES_TEAM;

    const PROJECTS = Array.isArray(SETTINGS.PROJECTS) && SETTINGS.PROJECTS.length
      ? SETTINGS.PROJECTS
      : DEFAULTS.PROJECTS;

    const PAGE_SIZE = SETTINGS.PAGE_SIZE;
    const MAX_PAGES = SETTINGS.MAX_PAGES;
    const MAX_RESULTS = SETTINGS.MAX_RESULTS;

    const HIDE_RESOLVED = SETTINGS.HIDE_RESOLVED;
    const OPEN_FILTER = SETTINGS.OPEN_FILTER;
    const ORDER_BY = SETTINGS.ORDER_BY;

    const GRID_CENTRAL_URL = SETTINGS.GRID_CENTRAL_URL || DEFAULTS.GRID_CENTRAL_URL;

    const DESC_PREVIEW_LEN = SETTINGS.DESC_PREVIEW_LEN;
    const DUP_LABEL_MAX_TOKENS = SETTINGS.DUP_LABEL_MAX_TOKENS;

    const CACHE_TTL_MS = SETTINGS.CACHE_TTL_MS;

    const DERIVE_TRANSITION_NAME = SETTINGS.DERIVE_TRANSITION_NAME;
    const DERIVE_COMMENT_DEFAULT = SETTINGS.DERIVE_COMMENT_DEFAULT;
    // Default true. Se nunca setou, undefined -> true; se setou false, respeita.
    const DERIVE_UNWATCH_AFTER = (SETTINGS.DERIVE_UNWATCH_AFTER !== false);
    const DERIVE_UNASSIGN_AFTER = (SETTINGS.DERIVE_UNASSIGN_AFTER !== false);
    // Une DEFAULTS (lista central, mantida por quem builda o plugin) com o que o
    // usuario tem salvo. Assim, quando um time novo entra nos DEFAULTS (ex: IS-PRINTERS),
    // ele aparece pra todos apos reinstalar, sem precisar mexer em Configuracoes,
    // mesmo pra quem ja tinha uma allowlist salva no storage do Tampermonkey.
    const mergeTeams = (defaults, saved) => {
      const out = [];
      const seen = new Set();
      for(const t of [...(Array.isArray(defaults) ? defaults : []), ...(Array.isArray(saved) ? saved : [])]){
        const v = String(t || '').trim();
        if(!v || seen.has(v)) continue;
        seen.add(v);
        out.push(v);
      }
      return out;
    };
    const DERIVE_TEAMS_ALLOWLIST = mergeTeams(DEFAULTS.DERIVE_TEAMS_ALLOWLIST, SETTINGS.DERIVE_TEAMS_ALLOWLIST);

    // Resolve atalhos: prefere SHORTCUTS (array). Cai em SHORTCUT (string legada). Cai em DEFAULTS.
    const SHORTCUTS = (() => {
      const arr = SETTINGS.SHORTCUTS;
      if(Array.isArray(arr) && arr.length){
        return arr.map(s => String(s || '').trim()).filter(Boolean);
      }
      if(typeof SETTINGS.SHORTCUT === 'string' && SETTINGS.SHORTCUT.trim()){
        return [SETTINGS.SHORTCUT.trim()];
      }
      return DEFAULTS.SHORTCUTS.slice();
    })();
    // Mantemos SHORTCUT como "o primeiro" so para exibir no title do botao.
    const SHORTCUT = SHORTCUTS[0] || DEFAULTS.SHORTCUT;

    const ISS_TASK_TRIGGER_TEAMS = mergeTeams(DEFAULTS.ISS_TASK_TRIGGER_TEAMS, SETTINGS.ISS_TASK_TRIGGER_TEAMS);
    // Override de ISS por time (une o do usuario sobre o default, chave a chave).
    const ISS_TASK_TEAM_OVERRIDES = Object.assign(
      {},
      (DEFAULTS.ISS_TASK_TEAM_OVERRIDES && typeof DEFAULTS.ISS_TASK_TEAM_OVERRIDES === 'object') ? DEFAULTS.ISS_TASK_TEAM_OVERRIDES : {},
      (SETTINGS.ISS_TASK_TEAM_OVERRIDES && typeof SETTINGS.ISS_TASK_TEAM_OVERRIDES === 'object') ? SETTINGS.ISS_TASK_TEAM_OVERRIDES : {}
    );
    const ISS_TASK_PROJECT = SETTINGS.ISS_TASK_PROJECT || DEFAULTS.ISS_TASK_PROJECT;
    const ISS_TASK_ISSUETYPE = SETTINGS.ISS_TASK_ISSUETYPE || DEFAULTS.ISS_TASK_ISSUETYPE;
    const ISS_TASK_SUMMARY_TEMPLATE = SETTINGS.ISS_TASK_SUMMARY_TEMPLATE || DEFAULTS.ISS_TASK_SUMMARY_TEMPLATE;
    const ISS_TASK_DEMANDA_CF = SETTINGS.ISS_TASK_DEMANDA_CF || DEFAULTS.ISS_TASK_DEMANDA_CF;
    const ISS_TASK_DEMANDA_VALUE = SETTINGS.ISS_TASK_DEMANDA_VALUE || DEFAULTS.ISS_TASK_DEMANDA_VALUE;
    const ISS_TASK_SERVICE_CF = SETTINGS.ISS_TASK_SERVICE_CF || DEFAULTS.ISS_TASK_SERVICE_CF;
    const ISS_TASK_SERVICE_VALUE = SETTINGS.ISS_TASK_SERVICE_VALUE || DEFAULTS.ISS_TASK_SERVICE_VALUE;
    const ISS_TASK_RESOLUTION_TEAM = SETTINGS.ISS_TASK_RESOLUTION_TEAM || DEFAULTS.ISS_TASK_RESOLUTION_TEAM;
    const ISS_TASK_LINK_TYPE_NAME = (SETTINGS.ISS_TASK_LINK_TYPE_NAME || '').trim();
    // Para o modelo, se o usuario tem '' salvo de uma versao antiga, caimos no default novo (ISS-19104).
    const ISS_TASK_MODEL_ISSUE = (SETTINGS.ISS_TASK_MODEL_ISSUE || DEFAULTS.ISS_TASK_MODEL_ISSUE || '').trim();
    const ISS_TASK_COPY_ATTACHMENTS = (SETTINGS.ISS_TASK_COPY_ATTACHMENTS !== false);
    const ISS_TASK_COPY_COMMENTS    = (SETTINGS.ISS_TASK_COPY_COMMENTS !== false);
    const ISS_TASK_AUTO_CLOSE          = (SETTINGS.ISS_TASK_AUTO_CLOSE !== false); // default=true se nao salvo
    const ISS_TASK_AUTO_CLOSE_SOLUTION = String(SETTINGS.ISS_TASK_AUTO_CLOSE_SOLUTION || 'Troubleshooting vinculado e tarefa encerrada').trim();

    // Snippets de comentario: lista de {name, text}
    const COMMENT_SNIPPETS = Array.isArray(SETTINGS.COMMENT_SNIPPETS)
      ? SETTINGS.COMMENT_SNIPPETS.filter(s => s && typeof s === 'object' && s.text)
      : [];

    // Sugestoes de time pra Derivar: lista de {keyword, team}
    const DERIVE_TEAM_SUGGESTIONS = Array.isArray(SETTINGS.DERIVE_TEAM_SUGGESTIONS)
      ? SETTINGS.DERIVE_TEAM_SUGGESTIONS.filter(r => r && typeof r === 'object' && r.keyword && r.team)
      : [];

    // Regras Tshoot Confluence: vem do DEFAULTS (admin), com overrides de URL via SETTINGS.
    // Usuarios NAO podem adicionar/remover regras, so editar URL.
    const CONFLUENCE_RULES = (() => {
      const base = Array.isArray(DEFAULTS.CONFLUENCE_RULES) ? DEFAULTS.CONFLUENCE_RULES : [];
      const overrides = (SETTINGS.CONFLUENCE_URL_OVERRIDES && typeof SETTINGS.CONFLUENCE_URL_OVERRIDES === 'object')
        ? SETTINGS.CONFLUENCE_URL_OVERRIDES : {};
      return base
        // Aceita regras "noChip" (sem url) que existem so pra mapping ISS, alem das normais.
        .filter(r => r && typeof r === 'object' && (r.url || r.noChip) && Array.isArray(r.match) && r.match.length)
        .map(r => {
          const overrideUrl = String(overrides[r.label] || '').trim();
          const out = {
            label: String(r.label || 'Tshoot').trim(),
            icon:  String(r.icon || '').trim(),
            color: String(r.color || '').trim(), // default '' -> dourado padrao
            url:   overrideUrl || String(r.url || '').trim(),
            noChip: r.noChip === true,
            match: r.match
              .filter(c => c && c.field && c.value != null)
              .map(c => ({
                field: String(c.field).trim(),
                // value pode ser string ou array de strings (OR semantics).
                value: Array.isArray(c.value) ? c.value.map(v => String(v).trim()).filter(Boolean) : String(c.value).trim(),
                mode:  (c.mode === 'contains' ? 'contains' : 'exact')
              }))
          };
          // Opcional: configuracao de criacao de ISS por categoria SE.
          // - issTemplate: 'ISS-XXXX' (template-based, mais robusto pra validators)
          // - issService:  'CCTV', 'Control Acceso', etc (value-based, mais simples)
          // - issDemanda:  override do default 'Analisis' (opcional)
          // - issResolutionTeam: override do default 'IS-SHIP-NATS-N1' (opcional)
          if(r.issTemplate && typeof r.issTemplate === 'string'){
            out.issTemplate = r.issTemplate.trim().toUpperCase();
          }
          if(r.issService && typeof r.issService === 'string'){
            out.issService = r.issService.trim();
          }
          if(r.issDemanda && typeof r.issDemanda === 'string'){
            out.issDemanda = r.issDemanda.trim();
          }
          if(r.issResolutionTeam && typeof r.issResolutionTeam === 'string'){
            out.issResolutionTeam = r.issResolutionTeam.trim();
          }
          return out;
        })
        .filter(r => r.match.length);
    })();

    // Acoes de Status (lista). Comportamento (igual DERIVE_TEAMS_ALLOWLIST):
    //   - Se SETTINGS.STATUS_ACTIONS for um array NAO-vazio, usa o do usuario.
    //   - Senao, cai no DEFAULTS.STATUS_ACTIONS (lista padrao do admin).
    const STATUS_ACTIONS = (() => {
      const raw = (Array.isArray(SETTINGS.STATUS_ACTIONS) && SETTINGS.STATUS_ACTIONS.length)
        ? SETTINGS.STATUS_ACTIONS
        : [];
      let arr = raw
        .filter(a => a && typeof a === 'object' && a.transition)
        .map(a => ({
          label:      String(a.label || a.transition).trim(),
          transition: String(a.transition).trim(),
          comment:    String(a.comment || ''),
          internal:   a.internal === true,
          assignToMe: a.assignToMe !== false // default true
        }));

      // Fallback: usa DEFAULTS.STATUS_ACTIONS (lista padrao do admin)
      if(!arr.length){
        const defs = Array.isArray(DEFAULTS.STATUS_ACTIONS) ? DEFAULTS.STATUS_ACTIONS : [];
        arr = defs.map(a => ({
          label:      String(a.label || a.transition).trim(),
          transition: String(a.transition).trim(),
          comment:    String(a.comment || ''),
          internal:   a.internal === true,
          assignToMe: a.assignToMe !== false
        }));
      }
      return arr;
    })();

    const STATUS_MENU_SHORTCUTS = (() => {
      const arr = SETTINGS.STATUS_MENU_SHORTCUTS;
      if(Array.isArray(arr) && arr.length){
        return arr.map(s => String(s || '').trim()).filter(Boolean);
      }
      return DEFAULTS.STATUS_MENU_SHORTCUTS.slice();
    })();

    // Backup reminder
    const BACKUP_REMIND_ENABLED = (SETTINGS.BACKUP_REMIND_ENABLED !== false); // default true
    const BACKUP_REMIND_INTERVAL_DAYS = (Number(SETTINGS.BACKUP_REMIND_INTERVAL_DAYS) > 0)
      ? Number(SETTINGS.BACKUP_REMIND_INTERVAL_DAYS)
      : DEFAULTS.BACKUP_REMIND_INTERVAL_DAYS;
    const BACKUP_REMIND_SNOOZE_DAYS = (Number(SETTINGS.BACKUP_REMIND_SNOOZE_DAYS) > 0)
      ? Number(SETTINGS.BACKUP_REMIND_SNOOZE_DAYS)
      : DEFAULTS.BACKUP_REMIND_SNOOZE_DAYS;

    // Lista de nomes de transicao que devem ser escondidas no modal Mudar status.
    // Default vem de DEFAULTS.STATUS_HIDDEN_TRANSITIONS. Usuario pode estender via SETTINGS.
    const STATUS_HIDDEN_TRANSITIONS = (() => {
      const fromUser = Array.isArray(SETTINGS.STATUS_HIDDEN_TRANSITIONS) ? SETTINGS.STATUS_HIDDEN_TRANSITIONS : [];
      const fromDef  = Array.isArray(DEFAULTS.STATUS_HIDDEN_TRANSITIONS) ? DEFAULTS.STATUS_HIDDEN_TRANSITIONS : [];
      // Une, deduplica, normaliza
      const all = [...fromUser, ...fromDef]
        .map(s => String(s || '').trim())
        .filter(Boolean);
      return [...new Set(all)];
    })();

    const QUICK_COMMENT_SHORTCUTS = (() => {
      const arr = SETTINGS.QUICK_COMMENT_SHORTCUTS;
      if(Array.isArray(arr) && arr.length){
        return arr.map(s => String(s || '').trim()).filter(Boolean);
      }
      return DEFAULTS.QUICK_COMMENT_SHORTCUTS.slice();
    })();

    const IDS = {
      style: 'ml_loc_style_bm',
      overlay: 'ml_loc_overlay_bm',
      modal: 'ml_loc_modal_bm',
      btn: 'ml_loc_btn_bm',
      dOverlay: 'ml_loc_d_overlay',
      dModal: 'ml_loc_d_modal',
      sOverlay: 'ml_loc_s_overlay',
      sModal: 'ml_loc_s_modal'
    };
    // =========================
    // UTILS
    // =========================
    const esc = (s) => String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    function getIssueKey() {
      // 1) /browse/IS-XXX
      let m = location.pathname.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/);
      if (m) return m[1];
      // 2) /queues/issue/IS-XXX (Service Desk)
      m = location.pathname.match(/\/queues\/issue\/([A-Z][A-Z0-9_]+-\d+)/);
      if (m) return m[1];
      // 3) Issue Navigator com painel aberto: ?selectedIssue=IS-XXX
      try {
        const params = new URLSearchParams(location.search);
        const sel = params.get('selectedIssue');
        if (sel && /^[A-Z][A-Z0-9_]+-\d+$/.test(sel)) return sel;
      } catch(_) {}
      // 4) Hash: #...selectedIssue=IS-XXX
      const hashMatch = (location.hash || '').match(/selectedIssue=([A-Z][A-Z0-9_]+-\d+)/);
      if (hashMatch) return hashMatch[1];
      // 5) DOM: breadcrumb/header do painel de issue aberto no Issue Navigator
      //    procuramos por um link/breadcrumb que aparece quando um ticket esta sendo visualizado.
      //    Heuristica: o issue aberto e o unico que tem um link [href*='/browse/X-Y'] dentro de um
      //    container de breadcrumb/header proximo ao topo direito.
      try {
        const candidates = document.querySelectorAll('[data-testid*="breadcrumb"] a[href*="/browse/"], [data-testid*="issue-view"] a[href*="/browse/"], a[data-testid*="link-with-icon"][href*="/browse/"]');
        for (const a of candidates) {
          const href = a.getAttribute('href') || '';
          const mm = href.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/);
          if (mm) return mm[1];
        }
      } catch(_) {}
      return '';
    }

    const uniq = (arr) => [...new Set(arr)];

    function descriptionToText(desc){
      if(!desc) return '';
      if(typeof desc === 'string') return desc.replace(/\s+/g,' ').trim();
      try{
        let out = '';
        const walk = (n) => {
          if(!n) return;
          if(Array.isArray(n)) return n.forEach(walk);
          if(typeof n === 'object'){
            if(n.type === 'text' && typeof n.text === 'string') out += n.text + ' ';
            if(n.content) walk(n.content);
          }
        };
        walk(desc);
        return out.replace(/\s+/g,' ').trim();
      }catch{ return ''; }
    }

    // Converte plain text em ADF preservando espacamento natural:
    //   - Linha em branco (\n\n+) entre blocos -> paragrafos separados
    //     (renderiza com margin entre eles, como "linha em branco")
    //   - Quebra simples (\n) dentro de um bloco -> hardBreak (quebra dentro do mesmo paragrafo)
    // Antes (cada \n = paragrafo), 1 Enter parecia 2 linhas em branco no Jira.
    function textToAdfParagraphs(text) {
      const raw = String(text || '');
      // Split em blocos separados por 1+ linhas em branco
      const blocks = raw.split(/\r?\n[ \t]*\r?\n+/);
      const content = blocks.map(block => {
        const lines = block.split(/\r?\n/);
        const inline = [];
        lines.forEach((line, i) => {
          if(i > 0) inline.push({ type: 'hardBreak' });
          if(line) inline.push({ type: 'text', text: line });
        });
        if(!inline.length) inline.push({ type: 'text', text: ' ' });
        return { type: 'paragraph', content: inline };
      });
      if(!content.length) content.push({ type: 'paragraph', content: [{ type: 'text', text: ' ' }] });
      return { type: 'doc', version: 1, content };
    }

    // Parses a shortcut string like "Alt+L" or "Ctrl+Shift+K" into a matcher.
    function parseShortcut(spec){
      const parts = String(spec || '').split('+').map(s => s.trim()).filter(Boolean);
      if(!parts.length) return null;
      const key = parts.pop().toLowerCase();
      const need = { alt:false, ctrl:false, shift:false, meta:false };
      for(const p of parts){
        const k = p.toLowerCase();
        if(k === 'alt') need.alt = true;
        else if(k === 'ctrl' || k === 'control') need.ctrl = true;
        else if(k === 'shift') need.shift = true;
        else if(k === 'meta' || k === 'cmd' || k === 'command') need.meta = true;
      }
      return { key, need };
    }

    function matchesShortcut(ev, parsed){
      if(!parsed) return false;
      // Para letras e digitos, usamos ev.code (estavel entre layouts/Mac Option).
      // Para outras teclas (Enter, Escape, ArrowUp, etc.), caimos no ev.key.
      let keyOk = false;
      const expected = parsed.key;
      if(expected.length === 1 && /^[a-z]$/.test(expected)){
        keyOk = (ev.code === 'Key' + expected.toUpperCase());
      } else if(expected.length === 1 && /^[0-9]$/.test(expected)){
        keyOk = (ev.code === 'Digit' + expected);
      } else {
        keyOk = ((ev.key || '').toLowerCase() === expected);
      }
      if(!keyOk) return false;
      if(!!ev.altKey   !== parsed.need.alt)   return false;
      if(!!ev.ctrlKey  !== parsed.need.ctrl)  return false;
      if(!!ev.shiftKey !== parsed.need.shift) return false;
      if(!!ev.metaKey  !== parsed.need.meta)  return false;
      return true;
    }

    // Aceita varios atalhos. Retorna array de objetos parsed (ignora invalidos).
    function parseShortcuts(specs){
      const arr = Array.isArray(specs) ? specs : [specs];
      return arr.map(parseShortcut).filter(Boolean);
    }

    function matchesAnyShortcut(ev, parsedArr){
      if(!Array.isArray(parsedArr)) return false;
      for(const p of parsedArr){
        if(matchesShortcut(ev, p)) return true;
      }
      return false;
    }

    function isTypingTarget(target){
      if(!target) return false;
      const tag = (target.tagName || '').toLowerCase();
      if(tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if(target.isContentEditable) return true;
      return false;
    }
    // =========================
    // CACHE (in-memory + sessionStorage persistence)
    // Sobrevive a F5 dentro da mesma aba; zera ao fechar a aba.
    // =========================
    const CACHE_KEY = 'ml_loc_cache_v1';
    let _cache = null;

    function _loadCache(){
      if(_cache) return _cache;
      try{
        const raw = sessionStorage.getItem(CACHE_KEY);
        _cache = raw ? JSON.parse(raw) : { byObject: {} };
        if(!_cache || typeof _cache !== 'object' || !_cache.byObject) _cache = { byObject: {} };
      }catch{
        _cache = { byObject: {} };
      }
      return _cache;
    }

    function _saveCache(){
      if(!_cache) return;
      try{
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(_cache));
      }catch{
        // sessionStorage cheio ou bloqueado — segue funcionando só em memória
      }
    }

    function cacheGet(objectId) {
      const cache = _loadCache();
      const e = cache.byObject[String(objectId)];
      if (!e) return null;
      if (Date.now() - e.ts > CACHE_TTL_MS) return null;
      return e;
    }

    function cacheSet(objectId, data) {
      const cache = _loadCache();
      cache.byObject[String(objectId)] = { ts: Date.now(), ...data };
      _saveCache();
    }

    function cacheClear(){
      _cache = { byObject: {} };
      try{ sessionStorage.removeItem(CACHE_KEY); }catch{}
    }
    // =========================
    // STYLE — design system v2
    // =========================

  // ======================================================
  // TOAST CENTRALIZADO — showToast(msg, type?, duration?)
  //   type: 'success'|'error'|'warn'|'info'  default: 'success'
  //   duration: ms  default: 3000  (0 = permanente)
  // ======================================================
  function showToast(msg, type, duration){
    type = type || 'success';
    duration = duration != null ? duration : 3000;
    const C = {
      success:{ bg:'linear-gradient(135deg,#1a5c35,#133d23)',border:'#2dd870',icon:'&#10003;',color:'#86efac' },
      error:  { bg:'linear-gradient(135deg,#5c1a1a,#3d1313)',border:'#f05a5a',icon:'&#9888;', color:'#fca5a5' },
      warn:   { bg:'linear-gradient(135deg,#5c421a,#3d2c13)',border:'#f5bc3a',icon:'&#9888;', color:'#fde68a' },
      info:   { bg:'linear-gradient(135deg,#1a3a5c,#132a3d)',border:'#6090f0',icon:'&#8505;', color:'#93c5fd' }
    };
    const c = C[type] || C.success;
    let stack = document.getElementById('ml_toast_stack');
    if(!stack){
      stack = document.createElement('div');
      stack.id = 'ml_toast_stack';
      stack.style.cssText = 'position:fixed;top:18px;right:18px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;align-items:flex-end;pointer-events:none;max-width:400px;';
      document.body.appendChild(stack);
    }
    const t = document.createElement('div');
    t.style.cssText = `background:${c.bg};color:#fff;border:1px solid ${c.border};border-radius:14px;padding:12px 16px;font:600 13px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.55);line-height:1.45;pointer-events:all;display:flex;gap:10px;align-items:flex-start;animation:mlToastIn .25s cubic-bezier(.34,1.56,.64,1);max-width:400px;`;
    const safeMsg = String(msg||'').replace(/[<>&]/g,ch=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[ch])).replace(/\n/g,'<br>');
    t.innerHTML = `<span style="font-size:16px;line-height:1;color:${c.color};flex-shrink:0;">${c.icon}</span><span style="flex:1;">${safeMsg}</span><button onclick="this.parentElement.remove()" style="background:transparent;border:0;color:rgba(255,255,255,.45);font-size:16px;cursor:pointer;padding:0;line-height:1;flex-shrink:0;">&times;</button>`;
    stack.appendChild(t);
    if(duration>0) setTimeout(()=>{ t.style.transition='opacity .35s ease,transform .35s ease'; t.style.opacity='0'; t.style.transform='translateX(10px)'; setTimeout(()=>t.remove(),380); }, duration);
    if(!document.getElementById('ml_toast_anim')){ const s=document.createElement('style'); s.id='ml_toast_anim'; s.textContent='@keyframes mlToastIn{from{opacity:0;transform:translateX(14px) scale(.95);}to{opacity:1;transform:translateX(0) scale(1);}}'; document.head.appendChild(s); }
    return t;
  }


  // ======================================================
  // USAGE LABEL — addUsageLabel(issueKey)
  // Adiciona o label USAGE_LABEL ao ticket (best-effort, nao bloqueia o fluxo).
  // Lê os labels atuais, adiciona o novo se ainda não existir, e salva via PUT.
  // Usado para metrificar o uso da ferramenta: labels = "is-toolkit" no JQL.
  // ======================================================
  async function addUsageLabel(issueKey){
    if(!USAGE_LABEL || !issueKey) return;
    try{
      const data = await getIssueFields(issueKey, ['labels']);
      const current = data?.fields?.labels || [];
      if(current.includes(USAGE_LABEL)) return; // ja tem, nada a fazer
      const updated = [...current, USAGE_LABEL];
      await fetch(`${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { labels: updated } })
      });
    }catch(e){
      console.warn('[is-toolkit][label]', issueKey, e.message || e);
    }
  }

  // ======================================================
  // _markToolkitUsage(issueKey) — ponto ÚNICO de marcação de uso.
  // Faz DUAS coisas, best-effort (nunca lança, nunca bloqueia o fluxo que chamou):
  //   1) addUsageLabel — label "is-toolkit" (existente).
  //   2) Se CF_USAGE_MARK estiver configurado (>0), acrescenta USAGE_MARK_TEXT ao
  //      final do valor atual do campo de texto livre (sem apagar o que já tinha).
  //      Idempotente: não duplica se o marcador já estiver presente.
  // Chamado a partir de TODAS as ações que efetivamente tocam um ticket (derivar,
  // status, comentário — interno ou de fechamento, vincular duplicado, auditoria,
  // aplicar sugestão do modo auditoria) — ver os pontos de chamada nas funções de
  // baixo nível (jiraDoDerive, jiraApplyTransitionWithFields, addInternalComment) e
  // nos pontos específicos do modo auditoria/coaching.
  // ======================================================
  async function _markToolkitUsage(issueKey){
    if(!issueKey) return;
    await addUsageLabel(issueKey).catch(() => {});
    const cfId = Number(SETTINGS.CF_USAGE_MARK || DEFAULTS.CF_USAGE_MARK || 0);
    if(!cfId) return;
    try{
      const mark = String(SETTINGS.USAGE_MARK_TEXT || DEFAULTS.USAGE_MARK_TEXT || '').trim();
      if(!mark) return;
      const fieldKey = `customfield_${cfId}`;
      const data = await getIssueFields(issueKey, [fieldKey]);
      const current = String(data?.fields?.[fieldKey] ?? '').trim();
      if(current.includes(mark)) return; // ja marcado nesta issue — nao duplica a cada acao
      const updated = current ? `${current} ${mark}` : mark;
      await fetch(`${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { [fieldKey]: updated } })
      });
    }catch(e){
      console.warn('[is-toolkit][usage-field]', issueKey, e.message || e);
    }
  }

  function ensureStyle() {
      if (document.getElementById(IDS.style)) return;
      const st = document.createElement('style');
      st.id = IDS.style;
      st.textContent = `
        /* ============= TOKENS ============= */
        :root {
          --ml-bg-0:#080a0f;--ml-bg-1:#0e1118;--ml-bg-2:#141720;--ml-bg-3:#1a1e29;--ml-bg-4:#212534;
          --ml-border:#252a38;--ml-border-2:#2e3448;--ml-border-hi:#404660;
          --ml-text:#edf0f7;--ml-text-mut:#b0b8cc;--ml-text-dim:#7a839a;
          --ml-blue:#6090f0;--ml-blue-2:#4f7ee8;--ml-blue-3:#3a6cd8;
          --ml-blue-soft:rgba(96,144,240,.13);--ml-blue-line:rgba(96,144,240,.4);
          --ml-blue-glow:rgba(96,144,240,.22);
          --ml-green:#2dd870;--ml-green-soft:rgba(45,216,112,.13);
          --ml-amber:#f5bc3a;--ml-amber-soft:rgba(245,188,58,.13);
          --ml-red:#f05a5a;--ml-red-soft:rgba(240,90,90,.13);
          --ml-purple:#a78bfa;--ml-purple-soft:rgba(167,139,250,.13);
          --ml-radius-xs:6px;--ml-radius-sm:10px;--ml-radius:14px;--ml-radius-lg:18px;--ml-radius-xl:24px;--ml-radius-pill:999px;
          --ml-shadow-sm:0 2px 10px rgba(0,0,0,.35);
          --ml-shadow:0 8px 30px rgba(0,0,0,.50),0 2px 8px rgba(0,0,0,.30);
          --ml-shadow-lg:0 20px 60px rgba(0,0,0,.60),0 4px 20px rgba(0,0,0,.40);
          --ml-shadow-blue:0 8px 24px rgba(96,144,240,.25);
          --ml-font:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
          --ml-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Roboto Mono",monospace;
        }

        /* ============= BOTAO FLUTUANTE ============= */
        #${IDS.btn}{
          position:fixed;right:20px;bottom:70px;z-index:9999997;
          background:linear-gradient(135deg,var(--ml-blue),var(--ml-blue-3));
          color:#fff;border:0;border-radius:var(--ml-radius-pill);
          padding:12px 22px;font-weight:700;cursor:pointer;
          box-shadow:var(--ml-shadow-blue),0 4px 12px rgba(0,0,0,.40);
          font-family:var(--ml-font);font-size:13px;letter-spacing:.3px;
          transition:transform .18s cubic-bezier(.34,1.56,.64,1),box-shadow .2s ease,filter .15s ease;
        }
        #${IDS.btn}:hover{transform:translateY(-3px) scale(1.03);box-shadow:0 16px 36px rgba(96,144,240,.40),0 6px 14px rgba(0,0,0,.40);filter:brightness(1.08);}
        #${IDS.btn}:active{transform:translateY(-1px) scale(1.01);}

        /* ============= OVERLAY + MODAL BASE ============= */
        #${IDS.overlay}, #${IDS.dOverlay}, #${IDS.sOverlay}, .mlCapOverlay {
          position:fixed; inset:0;
          background:rgba(4,6,12,.68);
          backdrop-filter:blur(9px) saturate(1.2);-webkit-backdrop-filter:blur(9px) saturate(1.2);
          z-index: 9999998;
        }
        #${IDS.dOverlay}, #${IDS.sOverlay}, .mlCapOverlay { z-index: 10000000; }

        #${IDS.modal}, #${IDS.dModal}, #${IDS.sModal}, .mlCapModal {
          position:fixed; left:50%; transform: translateX(-50%);
          background:var(--ml-bg-1);color:var(--ml-text);
          border:1px solid var(--ml-border-2);
          border-radius:var(--ml-radius-xl);
          box-shadow:var(--ml-shadow-lg),0 0 0 1px rgba(255,255,255,.04) inset;
          font-family:var(--ml-font);
          overflow:hidden;
          animation:mlPop .22s cubic-bezier(.16,.84,.44,1);
        }
        @keyframes mlPop{from{opacity:0;transform:translate(-50%,10px) scale(.97);}to{opacity:1;transform:translate(-50%,0) scale(1);}}

        #${IDS.modal}  { top: 5vh; width: min(1120px, 95vw); max-height: 90vh; z-index: 9999999; display:flex; flex-direction:column; }
        #${IDS.dModal} { top:10vh; width: min( 740px, 92vw); max-height: 80vh; z-index:10000001; display:flex; flex-direction:column; }
        #${IDS.sModal} { top: 5vh; width: min( 860px, 95vw); max-height: 90vh; z-index:10000001; display:flex; flex-direction:column; }
        .mlCapModal    { top: 4vh; width: min(1040px, 96vw); max-height: 92vh; z-index:10000001; display:flex; flex-direction:column; }

        /* ============= HEADER COMUM ============= */
        #${IDS.modal} .h, #${IDS.dModal} .dh, #${IDS.sModal} .sh, .mlCapModal .ch {
          display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
          padding:20px 24px;flex-shrink:0;position:relative;
          background:linear-gradient(180deg,var(--ml-bg-3) 0%,var(--ml-bg-2) 50%,var(--ml-bg-1) 100%);
          border-bottom:1px solid var(--ml-border-2);
        }
        #${IDS.modal} .h::before,#${IDS.dModal} .dh::before,#${IDS.sModal} .sh::before,.mlCapModal .ch::before{
          content:'';position:absolute;top:0;left:0;right:0;height:2px;
          background:linear-gradient(90deg,var(--ml-blue),var(--ml-purple),transparent);
        }
        #${IDS.modal} .h .title, #${IDS.dModal} .dh .title, #${IDS.sModal} .sh .title, .mlCapModal .ch .title{
          font-size: 17px; font-weight: 800; letter-spacing:.2px;
          display:flex; align-items:center; gap:10px;
        }
        #${IDS.modal} .h .subtitle, #${IDS.dModal} .dh .subtitle, #${IDS.sModal} .sh .subtitle, .mlCapModal .ch .subtitle{
          color: var(--ml-text-dim); font-size: 12px; margin-top: 4px; line-height:1.4;
        }
        #${IDS.modal} .h .titleDot{
          width:8px; height:8px; border-radius:50%;
          background: var(--ml-blue); box-shadow: 0 0 0 4px var(--ml-blue-soft);
        }

        /* ============= BODY COMUM (rolavel) ============= */
        #${IDS.modal} .b, #${IDS.dModal} .db, #${IDS.sModal} .sb, .mlCapModal .cb {
          padding: 18px 22px 22px;
          overflow-y: auto;
          flex: 1 1 auto;
        }

        /* ============= LINKS / TEXTOS ============= */
        #${IDS.modal} a, #${IDS.dModal} a, #${IDS.sModal} a, .mlCapModal a {
          color: var(--ml-blue); text-decoration: none; transition: color .15s ease;
        }
        #${IDS.modal} a:hover, #${IDS.dModal} a:hover, #${IDS.sModal} a:hover, .mlCapModal a:hover { color: #87aaf7; text-decoration: underline; }
        #${IDS.modal} .meta, #${IDS.dModal} .meta, #${IDS.sModal} .meta, .mlCapModal .meta {
          color: var(--ml-text-dim); font-size: 12px; line-height: 1.5; word-break: break-word;
        }
        #${IDS.modal} code, .mlCapModal code { font-family: var(--ml-mono); white-space: pre-wrap; }

        /* ============= BOTOES (sistema) ============= */
        .mlBtn,#${IDS.modal} button,#${IDS.dModal} button,#${IDS.sModal} button,.mlCapModal button{
          background:var(--ml-bg-3);color:var(--ml-text);border:1px solid var(--ml-border-2);
          border-radius:var(--ml-radius-sm);padding:8px 16px;font-weight:600;
          cursor:pointer;font-family:var(--ml-font);font-size:13px;
          transition:background .15s ease,border-color .15s ease,transform .15s cubic-bezier(.34,1.56,.64,1),box-shadow .15s ease;
        }
        .mlBtn:hover,#${IDS.modal} button:hover,#${IDS.dModal} button:hover,#${IDS.sModal} button:hover,.mlCapModal button:hover{
          background:var(--ml-bg-4);border-color:var(--ml-border-hi);transform:translateY(-1px);
        }
        .mlBtn:active,#${IDS.modal} button:active,#${IDS.dModal} button:active,#${IDS.sModal} button:active,.mlCapModal button:active{transform:translateY(0);}

        .primary,#${IDS.modal} .primary,#${IDS.dModal} .btnPrimary,#${IDS.sModal} .primary,.mlCapModal .btnPrimary{
          background:linear-gradient(135deg,var(--ml-blue),var(--ml-blue-3));border-color:transparent;color:#fff;
          box-shadow:var(--ml-shadow-blue);
        }
        .primary:hover,#${IDS.modal} .primary:hover,#${IDS.dModal} .btnPrimary:hover,#${IDS.sModal} .primary:hover,.mlCapModal .btnPrimary:hover{
          background:linear-gradient(135deg,var(--ml-blue-2),var(--ml-blue-3));border-color:transparent;
          box-shadow:0 8px 24px rgba(96,144,240,.45);
        }
        .ghost, #${IDS.modal} .ghost { background: transparent; border-color: var(--ml-border-2); color: var(--ml-text-mut); }
        .ghost:hover, #${IDS.modal} .ghost:hover { background: var(--ml-bg-3); color: var(--ml-text); }
        .danger, #${IDS.modal} .danger, #${IDS.sModal} .danger { background: var(--ml-red); border-color: transparent; color:#fff; }
        .danger:hover, #${IDS.modal} .danger:hover, #${IDS.sModal} .danger:hover { background: #d94a4a; }
        .disabled, #${IDS.modal} .disabled { opacity: .50; cursor: not-allowed; pointer-events: none; }

        /* ============= GEAR BUTTON ============= */
        #${IDS.modal} .headerActions { display:flex; gap:8px; align-items:center; }
        #${IDS.modal} .gear {
          background: transparent; color: var(--ml-text-mut);
          border:1px solid var(--ml-border-2); border-radius: var(--ml-radius-sm);
          width: 36px; height: 36px; padding:0;
          display:inline-flex; align-items:center; justify-content:center;
          font-size: 16px; cursor: pointer; transition: all .15s ease;
        }
        #${IDS.modal} .gear:hover { color: #fff; border-color: var(--ml-blue); background: var(--ml-blue-soft); }

        /* ============= ALERTAS ============= */
        #${IDS.modal} .err, #${IDS.sModal} .err {
          color:#ffd8d8; background: var(--ml-red-soft); border:1px solid var(--ml-red);
          padding:12px 14px; border-radius: var(--ml-radius); font-size: 13px; line-height: 1.5;
        }
        #${IDS.modal} .warn { color:#ffe7b8; background: var(--ml-amber-soft); border:1px solid var(--ml-amber); padding:12px 14px; border-radius: var(--ml-radius); }
        #${IDS.sModal} .err  { display:none; margin-bottom:12px; } #${IDS.sModal} .err.show  { display:block; }
        #${IDS.sModal} .ok   { color:#c7f0d6; background: var(--ml-green-soft); border:1px solid var(--ml-green); padding:10px 12px; border-radius:var(--ml-radius); margin-bottom:12px; display:none; font-size:13px; }
        #${IDS.sModal} .ok.show { display:block; }

        /* ============= HOME ============= */
        #${IDS.modal} .homeWrap { display: flex; flex-direction: column; gap: 18px; }

        /* Health banner */
        #${IDS.modal} .healthBanner {
          padding: 12px 16px;
          border-radius: var(--ml-radius);
          background: var(--ml-bg-2);
          border: 1px solid var(--ml-border);
          display: flex; gap: 12px; align-items: flex-start;
        }
        #${IDS.modal} .healthBanner.ok    { border-color: var(--ml-green); background: var(--ml-green-soft); }
        #${IDS.modal} .healthBanner.warn  { border-color: var(--ml-amber); background: var(--ml-amber-soft); }
        #${IDS.modal} .healthBanner.error { border-color: var(--ml-red);   background: var(--ml-red-soft); }
        #${IDS.modal} .healthBanner .hbIcon { font-size: 18px; line-height:1; padding-top: 2px; }
        #${IDS.modal} .healthBanner .hbBody { flex:1; min-width: 0; }
        #${IDS.modal} .healthBanner .hbTitle { font-weight: 700; font-size: 13px; }
        #${IDS.modal} .healthBanner .hbList  { margin: 6px 0 0 0; padding: 0; list-style: none; font-size: 12px; line-height: 1.55; color: var(--ml-text-mut); }
        #${IDS.modal} .healthBanner .hbList li { margin-top: 4px; }
        #${IDS.modal} .healthBanner .hbList .sev { font-weight: 700; }
        #${IDS.modal} .healthBanner .hbList .sev.warn { color: #ffd791; }
        #${IDS.modal} .healthBanner .hbList .sev.err  { color: #ffadad; }
        #${IDS.modal} .healthBanner .hbActions { margin-top: 8px; display:flex; gap:8px; }
        #${IDS.modal} .searchBox {
          display:flex; gap:10px; align-items:stretch;
          padding: 14px 16px;
          background: linear-gradient(180deg, var(--ml-bg-3), var(--ml-bg-2));
          border: 1px solid var(--ml-border);
          border-radius: var(--ml-radius-lg);
        }
        #${IDS.modal} .searchBox input{
          flex:1; min-width: 0;
          background: var(--ml-bg-1); color: var(--ml-text);
          border:1px solid var(--ml-border-2); border-radius: var(--ml-radius-sm);
          padding: 10px 14px; font-family: var(--ml-mono); font-size: 13px;
          outline: none; transition: border-color .15s, box-shadow .15s;
        }
        #${IDS.modal} .searchBox input::placeholder { color: var(--ml-text-dim); font-family: var(--ml-font); }
        #${IDS.modal} .searchBox input:focus{
          border-color: var(--ml-blue); box-shadow: 0 0 0 3px var(--ml-blue-soft);
        }
        #${IDS.modal} .searchBox .hint { color: var(--ml-text-dim); font-size: 11px; margin-top: 6px; }
        #${IDS.modal} .searchResult {
          background: var(--ml-bg-2);
          border: 1px solid var(--ml-border);
          border-radius: var(--ml-radius);
          padding: 14px 16px;
          animation: mlPop .15s ease-out;
        }
        #${IDS.modal} .searchResult .srHead { display:flex; gap:10px; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; }
        #${IDS.modal} .searchResult .srKey { font-weight: 800; font-size: 14px; color: var(--ml-blue); }
        #${IDS.modal} .searchResult .srSum { font-weight: 700; font-size: 14px; margin-top: 4px; }
        #${IDS.modal} .searchResult .srBadges { display:flex; gap:6px; flex-wrap: wrap; margin-top: 8px; }
        #${IDS.modal} .srBadge { display:inline-flex; align-items:center; gap:4px; padding: 3px 10px; border-radius: 999px; background: var(--ml-bg-3); border:1px solid var(--ml-border-2); font-size: 11px; }
        #${IDS.modal} .srBadge.status { background: var(--ml-blue-soft); border-color: var(--ml-blue-line); color:#cfe1ff; }
        #${IDS.modal} .srBadge.prio   { background: var(--ml-amber-soft); border-color: var(--ml-amber); color:#ffeec3; }
        #${IDS.modal} .srBadge.loc    { background: var(--ml-green-soft); border-color: var(--ml-green); color:#bdf0d2; }
        #${IDS.modal} .searchResult .srDesc {
          margin-top: 10px; color: var(--ml-text-mut);
          font-size: 13px; line-height: 1.55;
          white-space: pre-wrap; word-wrap: break-word;
          padding: 10px 12px; background: var(--ml-bg-0); border:1px solid var(--ml-border);
          border-radius: var(--ml-radius-sm);
        }
        #${IDS.modal} .searchResult .srActions { display:flex; gap:8px; margin-top: 14px; flex-wrap: wrap; }

        #${IDS.modal} .homeGrid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }
        /* 2 colunas a partir de 760px — com os 4 cards de hoje da um 2x2 simetrico
           em vez de "3 numa fileira + 1 sozinho" (era o que acontecia com 3 colunas). */
        @media (min-width: 760px){ #${IDS.modal} .homeGrid{ grid-template-columns: 1fr 1fr; } }

        #${IDS.modal} .homeCard {
          position: relative;
          border:1px solid var(--ml-border-2);border-radius:var(--ml-radius-lg);
          padding:20px;overflow:hidden;
          background:linear-gradient(145deg,var(--ml-bg-3) 0%,var(--ml-bg-2) 60%,var(--ml-bg-1) 100%);
          display:flex;flex-direction:column;gap:10px;
          transition:transform .22s cubic-bezier(.34,1.56,.64,1),border-color .2s ease,box-shadow .2s ease;
        }
        #${IDS.modal} .homeCard::after{content:'';position:absolute;inset:0;border-radius:inherit;background:linear-gradient(135deg,var(--ml-blue-soft),transparent 60%);opacity:0;transition:opacity .2s ease;pointer-events:none;}
        #${IDS.modal} .homeCard:hover{
          transform:translateY(-4px) scale(1.01);border-color:var(--ml-blue-line);
          box-shadow:0 16px 40px rgba(0,0,0,.40),0 0 20px var(--ml-blue-glow);
        }
        #${IDS.modal} .homeCard:hover::after{opacity:1;}
        #${IDS.modal} .homeCard .hcIcon {
          width: 36px; height: 36px; border-radius: var(--ml-radius-sm);
          background: var(--ml-blue-soft); border: 1px solid var(--ml-blue-line); color: var(--ml-blue);
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 18px; margin-bottom: 4px;
        }
        #${IDS.modal} .homeCard h3 { margin: 2px 0 0; font-size: 15px; font-weight: 700; letter-spacing: .1px; }
        #${IDS.modal} .homeCard p  { margin: 0; color: var(--ml-text-mut); font-size: 12.5px; line-height: 1.5; flex: 1 1 auto; }
        #${IDS.modal} .homeCard .row { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; }

        /* ============= DUPLICATES ============= */
        #${IDS.modal} .topbar {
          position: sticky; top: 0; z-index: 3;
          background: var(--ml-bg-1);
          border-bottom: 1px solid var(--ml-border);
          padding: 14px 0 12px 0;
          margin: -18px 0 16px 0;
        }
        #${IDS.modal} .toprow { display:flex; gap:12px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
        #${IDS.modal} .counts { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        #${IDS.modal} .countpill {
          background: var(--ml-bg-3); border:1px solid var(--ml-border-2);
          border-radius: 999px; padding: 4px 12px; font-size: 12px; color: var(--ml-text-mut);
        }
        #${IDS.modal} .chips { display:flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
        #${IDS.modal} .chip{
          display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:var(--ml-radius-pill);
          background:var(--ml-bg-3);border:1px solid var(--ml-border-2);
          color:var(--ml-text-mut);font-size:11.5px;font-weight:600;cursor:pointer;user-select:none;
          transition:all .18s cubic-bezier(.34,1.56,.64,1);
        }
        #${IDS.modal} .chip:hover{border-color:var(--ml-blue-line);color:var(--ml-text);transform:translateY(-1px);}
        #${IDS.modal} .chip.active{background:var(--ml-blue-soft);border-color:var(--ml-blue);color:#cfe1ff;box-shadow:0 0 10px var(--ml-blue-glow);}
        #${IDS.modal} .chip.clear{background:var(--ml-red-soft);border-color:var(--ml-red);color:#ffcfcf;}

        #${IDS.modal} .list { padding: 0; }
        #${IDS.modal} .card{
          border:1px solid var(--ml-border-2);border-radius:var(--ml-radius-lg);
          padding:14px 16px;margin-bottom:10px;
          background:linear-gradient(145deg,var(--ml-bg-3),var(--ml-bg-2));
          transition:border-color .18s ease,transform .18s cubic-bezier(.34,1.56,.64,1),box-shadow .18s ease;
        }
        #${IDS.modal} .card:hover{border-color:var(--ml-blue-line);transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.35),0 0 12px var(--ml-blue-glow);}
        #${IDS.modal} .card.sel{border-color:var(--ml-blue);box-shadow:0 0 0 2px var(--ml-blue-soft) inset,0 8px 20px rgba(0,0,0,.25);}

        #${IDS.modal} .line1 { display:flex; gap:10px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
        #${IDS.modal} .kblock { min-width: 240px; }
        #${IDS.modal} .key { font-weight: 800; font-size: 14px; color: var(--ml-blue); }
        #${IDS.modal} .summary { font-size: 14px; font-weight: 600; line-height: 1.4; margin-top: 2px; }

        #${IDS.modal} .badges { display:flex; gap:6px; flex-wrap: wrap; align-items: center; }
        #${IDS.modal} .badge {
          display:inline-block; padding: 3px 10px; border-radius: 999px;
          background: var(--ml-bg-3); border:1px solid var(--ml-border-2);
          font-size: 11px; font-weight: 600; color: var(--ml-text-mut);
        }
        #${IDS.modal} .badge.dup    { background: var(--ml-amber-soft); border-color: var(--ml-amber); color:#ffeec3; }
        #${IDS.modal} .badge.strong { background: var(--ml-green-soft); border-color: var(--ml-green); color:#bdf0d2; }
        #${IDS.modal} .badge.ip     { background: var(--ml-blue-soft);  border-color: var(--ml-blue);  color:#cfe1ff; }

        #${IDS.modal} .line2 { margin-top: 10px; display:flex; gap:10px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
        #${IDS.modal} .desc { color: var(--ml-text-mut); font-size: 13px; line-height: 1.5; max-width: 760px; }
        #${IDS.modal} .ids { display:flex; gap:5px; flex-wrap: wrap; align-items: center; }
        #${IDS.modal} .idpill {
          padding: 2px 9px; border-radius: 999px;
          background: var(--ml-amber-soft); border: 1px solid var(--ml-amber);
          color: #ffeec3; font-size: 11px; font-weight: 600;
        }
        #${IDS.modal} .muted { color: var(--ml-text-dim); font-size: 12px; }
        #${IDS.modal} .detailsBtn { background: transparent; border:1px solid var(--ml-border-2); color: var(--ml-text-mut); }
        #${IDS.modal} .detailsBtn:hover { border-color: var(--ml-blue); color:#fff; }
        #${IDS.modal} .expand {
          margin-top: 12px;
          background: var(--ml-bg-0); border: 1px solid var(--ml-border);
          border-radius: var(--ml-radius); padding: 12px 14px;
        }
        #${IDS.modal} .expand .title { font-weight: 700; font-size: 12px; color: var(--ml-text-dim); margin-bottom: 6px; }
        #${IDS.modal} .fulldesc { white-space: pre-wrap; line-height: 1.5; font-size: 13px; color: var(--ml-text); }

        /* ============= DERIVE MODAL ============= */
        #${IDS.dModal} textarea {
          width: 100%; min-height: 96px; resize: vertical;
          background: var(--ml-bg-0); color: var(--ml-text); border: 1px solid var(--ml-border-2);
          border-radius: var(--ml-radius-sm); padding: 12px 14px; font-family: inherit; font-size: 13px;
          outline: none; transition: border-color .15s, box-shadow .15s;
        }
        #${IDS.dModal} textarea:focus { border-color: var(--ml-blue); box-shadow: 0 0 0 3px var(--ml-blue-soft); }
        #${IDS.dModal} .teamgrid { display:flex; gap:8px; flex-wrap: wrap; margin: 12px 0 14px 0; }
        #${IDS.dModal} .teambtn {
          background: var(--ml-bg-3); color: var(--ml-text);
          border:1px solid var(--ml-border-2); border-radius: 999px;
          padding: 7px 14px; cursor: pointer; font-weight: 600; font-size: 12.5px;
          transition: all .15s ease;
        }
        #${IDS.dModal} .teambtn:hover { border-color: var(--ml-blue); }
        #${IDS.dModal} .teambtn.active { background: var(--ml-blue-soft); border-color: var(--ml-blue); color:#cfe1ff; }
        #${IDS.dModal} .row { display:flex; gap:10px; flex-wrap: wrap; align-items: center; justify-content: flex-end; margin-top: 16px; }
        #${IDS.dModal} .btnPrimary { background: var(--ml-blue); color:#fff; border-color: transparent; }
        #${IDS.dModal} .btnSecondary { background: var(--ml-bg-3); }
        #${IDS.dModal} .issWrap {
          margin-top: 16px; padding: 14px;
          border:1px dashed var(--ml-blue); border-radius: var(--ml-radius);
          background: var(--ml-blue-soft);
        }
        #${IDS.dModal} .issLabel { display:flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 13px; line-height: 1.5; }
        #${IDS.dModal} .issLabel input[type="checkbox"] { margin-top: 3px; transform: scale(1.18); accent-color: var(--ml-blue); }
        #${IDS.dModal} .issHint { color: var(--ml-text-mut); font-size: 12px; margin-top: 4px; }

        /* ============= SETTINGS MODAL ============= */
        #${IDS.sModal} .grid { display:grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 720px){ #${IDS.sModal} .grid { grid-template-columns: 1fr 1fr; gap: 14px; } }
        #${IDS.sModal} .full { grid-column: 1/-1; }
        #${IDS.sModal} label { display:block; font-size: 12px; font-weight: 700; color: var(--ml-text-mut); margin-bottom: 6px; letter-spacing: .15px; }
        #${IDS.sModal} input[type="text"], #${IDS.sModal} input[type="number"], #${IDS.sModal} textarea {
          width: 100%; box-sizing: border-box;
          background: var(--ml-bg-0); color: var(--ml-text); border: 1px solid var(--ml-border-2);
          border-radius: var(--ml-radius-sm); padding: 9px 12px; font-family: inherit; font-size: 13px;
          outline: none; transition: border-color .15s, box-shadow .15s;
        }
        #${IDS.sModal} input:focus, #${IDS.sModal} textarea:focus { border-color: var(--ml-blue); box-shadow: 0 0 0 3px var(--ml-blue-soft); }
        #${IDS.sModal} textarea { min-height: 84px; resize: vertical; font-family: var(--ml-mono); }
        #${IDS.sModal} .hint { font-size: 11px; color: var(--ml-text-dim); margin-top: 4px; line-height: 1.4; }
        #${IDS.sModal} .group {
          border: 1px solid var(--ml-border); border-radius: var(--ml-radius);
          padding: 14px; background: var(--ml-bg-2);
        }
        #${IDS.sModal} .group h4 { margin: 0 0 12px; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; color: var(--ml-text-dim); font-weight: 800; }
        #${IDS.sModal} .checkbox { display:flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
        #${IDS.sModal} .checkbox input { margin: 0; accent-color: var(--ml-blue); transform: scale(1.1); }
        #${IDS.sModal} .actions { display:flex; gap:10px; flex-wrap: wrap; justify-content: flex-end; margin-top: 18px; }
        #${IDS.sModal} .primary { background: var(--ml-blue); border-color: transparent; }

        /* ============= SETTINGS TABS ============= */
        #${IDS.sModal} .ml-s-tabs {
          display: flex; flex-wrap: wrap; gap: 2px;
          padding: 0 18px;
          flex-shrink: 0; /* nao deixa o flex layout comprimir as abas */
          background: var(--ml-bg-1);
          border-bottom: 1px solid var(--ml-border);
          overflow-x: auto; scrollbar-width: thin;
        }
        #${IDS.sModal} .ml-s-tab {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 11px 14px;
          background: transparent; color: var(--ml-text-mut);
          border: 0; border-bottom: 2px solid transparent;
          font: 600 12.5px var(--ml-font);
          cursor: pointer; white-space: nowrap;
          transition: color .15s ease, background .15s ease, border-color .15s ease;
        }
        #${IDS.sModal} .ml-s-tab:hover { color: var(--ml-text); background: rgba(255,255,255,0.025); }
        #${IDS.sModal} .ml-s-tab.active {
          color: var(--ml-text);
          border-bottom-color: var(--ml-blue);
          background: rgba(79,140,255,0.06);
        }
        #${IDS.sModal} .ml-s-tab-ic { font-size: 14px; line-height: 1; }
        #${IDS.sModal} .group[data-tab]:not([data-active]) { display: none; }
        /* Hint do header da tab atual (mostrado dentro da .sb) */
        #${IDS.sModal} .ml-s-tab-hint {
          background: linear-gradient(180deg, var(--ml-bg-2), var(--ml-bg-1));
          border: 1px solid var(--ml-border); border-left: 3px solid var(--ml-blue);
          border-radius: var(--ml-radius-sm);
          padding: 10px 14px; margin-bottom: 14px;
          font-size: 12.5px; color: var(--ml-text-mut); line-height: 1.5;
        }
        #${IDS.sModal} .ml-s-tab-hint b { color: var(--ml-text); }

        /* ============= DEBUG CAPTURE MODAL ============= */
        .mlCapModal .capStatus { padding: 10px 14px; border-radius: var(--ml-radius-sm); margin-bottom: 12px; font-size: 13px; }
        .mlCapModal .capStatus.on  { background: var(--ml-green-soft); border:1px solid var(--ml-green); }
        .mlCapModal .capStatus.off { background: var(--ml-bg-3); border: 1px solid var(--ml-border-2); }
        .mlCapModal .capActions { display:flex; gap:8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center; }
        .mlCapModal .btnPrimary  { padding: 9px 16px; }
        .mlCapModal .btnSecondary{ padding: 6px 12px; font-size: 12px; }
        .mlCapModal .capHint {
          background: var(--ml-bg-0); border: 1px solid var(--ml-border);
          border-radius: var(--ml-radius-sm); padding: 12px 14px; margin-bottom: 12px;
          font-size: 12.5px; line-height: 1.6; color: var(--ml-text-mut);
        }
        .mlCapModal .capHint code { background: #000; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
        .mlCapModal .capHint ol { margin: 8px 0 0 20px; padding: 0; }
        .mlCapModal .capFilters { display:flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
        .mlCapModal .capFilters input[type="text"], .mlCapModal .capFilters input:not([type]) {
          flex:1; min-width: 220px;
          padding: 8px 12px; background: var(--ml-bg-0); color: var(--ml-text);
          border:1px solid var(--ml-border-2); border-radius: var(--ml-radius-sm); font-size: 12.5px;
          outline: none; transition: border-color .15s;
        }
        .mlCapModal .capFilters input:focus { border-color: var(--ml-blue); box-shadow: 0 0 0 3px var(--ml-blue-soft); }
        .mlCapModal .capRadio { display:flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; color: var(--ml-text-mut); }
        .mlCapModal .capRadio input { accent-color: var(--ml-blue); }
        .mlCapModal .capList { display:flex; flex-direction: column; gap: 6px; }
        .mlCapModal .capEmpty { color: var(--ml-text-dim); text-align: center; padding: 32px; background: var(--ml-bg-0); border-radius: var(--ml-radius-sm); border: 1px dashed var(--ml-border-2); }
        .mlCapModal .capItem  { background: var(--ml-bg-0); border:1px solid var(--ml-border); border-radius: var(--ml-radius-sm); padding: 10px 12px; }
        .mlCapModal .capItemHead { display:flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .mlCapModal .capStat { padding: 3px 10px; border-radius: 6px; font-weight: 800; font-size: 11px; font-family: var(--ml-mono); min-width: 36px; text-align: center; }
        .mlCapModal .capStat.ok   { background: var(--ml-green-soft); color: #94f0b8; }
        .mlCapModal .capStat.warn { background: var(--ml-amber-soft); color: #ffe09e; }
        .mlCapModal .capStat.fail { background: var(--ml-red-soft);   color: #ffadad; }
        .mlCapModal .capSize { font-size: 11px; color: var(--ml-text-dim); font-family: var(--ml-mono); }
        .mlCapModal .capUrl  { flex:1; min-width: 200px; font-family: var(--ml-mono); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ml-text-mut); }
        .mlCapModal .capTime { font-size: 11px; color: var(--ml-text-dim); font-family: var(--ml-mono); }
        .mlCapModal .capBody { margin-top: 10px; background: #000; padding: 10px; border-radius: var(--ml-radius-sm); max-height: 400px; overflow: auto; }
        .mlCapModal .capBody pre { margin: 0; font-size: 11px; color: #cbd5e1; white-space: pre-wrap; word-break: break-all; font-family: var(--ml-mono); }
        .mlCapModal .capLabel { font-size: 11px; font-weight: 700; color: var(--ml-text-dim); margin-bottom: 6px; }

        /* ============= SCROLLBAR ============= */
        #${IDS.modal} *::-webkit-scrollbar, #${IDS.dModal} *::-webkit-scrollbar, #${IDS.sModal} *::-webkit-scrollbar, .mlCapModal *::-webkit-scrollbar { width: 10px; height: 10px; }
        #${IDS.modal} *::-webkit-scrollbar-thumb, #${IDS.dModal} *::-webkit-scrollbar-thumb, #${IDS.sModal} *::-webkit-scrollbar-thumb, .mlCapModal *::-webkit-scrollbar-thumb { background: var(--ml-bg-4); border-radius: 999px; }
        #${IDS.modal} *::-webkit-scrollbar-thumb:hover, #${IDS.dModal} *::-webkit-scrollbar-thumb:hover, #${IDS.sModal} *::-webkit-scrollbar-thumb:hover, .mlCapModal *::-webkit-scrollbar-thumb:hover { background: var(--ml-border-hi); }
        #${IDS.modal} *::-webkit-scrollbar-track, #${IDS.dModal} *::-webkit-scrollbar-track, #${IDS.sModal} *::-webkit-scrollbar-track, .mlCapModal *::-webkit-scrollbar-track { background: transparent; }

        /* ============= LOADING SPINNER ============= */
        .mlSpin {
          display:inline-block; width: 14px; height: 14px;
          border: 2px solid var(--ml-border-hi); border-top-color: var(--ml-blue);
          border-radius:50%;animation:mlSpin .7s cubic-bezier(.4,0,.2,1) infinite;vertical-align:middle;
        }
        @keyframes mlSpin{to{transform:rotate(360deg);}}
      `;
      document.head.appendChild(st);
    }
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
    // =========================
    // JIRA CORE API (issues, search, comments, links)
    // =========================
    async function getIssueFields(issueKey, fields) {
      const url = `${location.origin}/rest/api/3/issue/${issueKey}?fields=${encodeURIComponent(fields.join(','))}`;
      const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
      const txt = await r.text().catch(()=> '');
      if(!r.ok) throw new Error(`HTTP ${r.status} ao ler campos do ticket: ${txt.slice(0,200)}`);
      return JSON.parse(txt);
    }

    // Lista global de prioridades do Jira (Highest/High/Medium/... ou o esquema custom da instancia).
    // Cacheada em memoria pra sessao inteira — as opcoes de prioridade nao mudam em runtime.
    let _priorityListCache = null;
    async function getAllPriorities(){
      if(_priorityListCache) return _priorityListCache;
      const url = `${location.origin}/rest/api/3/priority`;
      const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
      const txt = await r.text().catch(()=> '');
      if(!r.ok) throw new Error(`HTTP ${r.status} ao listar prioridades: ${txt.slice(0,200)}`);
      _priorityListCache = JSON.parse(txt);
      return _priorityListCache;
    }

    // Muda a prioridade de um ticket direto (campo padrao "priority", sem passar por transicao).
    async function setIssuePriority(issueKey, priorityId){
      const url = `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}`;
      const r = await fetch(url, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Accept':'application/json', 'Content-Type':'application/json' },
        body: JSON.stringify({ fields: { priority: { id: String(priorityId) } } })
      });
      if(!r.ok){
        const txt = await r.text().catch(()=> '');
        throw new Error(`HTTP ${r.status} ao mudar prioridade de ${issueKey}: ${txt.slice(0,250)}`);
      }
      _markToolkitUsage(issueKey).catch(()=>{});
      return true;
    }

    // Preview leve de um ticket: campos essenciais pra UI rapida.
    // Faz uma chamada extra (em paralelo) na Assets API pra resolver o NOME legivel do asset
    // (do contrario so temos o objectId numerico).
    // Cache em sessionStorage por 5min: economiza calls quando re-busca a mesma key.
    const _PREVIEW_CACHE_KEY = 'ml_loc_preview_cache_v1';
    const _PREVIEW_TTL_MS = 5 * 60 * 1000;
    function _readPreviewCache(){
      try { return JSON.parse(sessionStorage.getItem(_PREVIEW_CACHE_KEY) || '{}'); } catch(_) { return {}; }
    }
    function _writePreviewCache(obj){
      try { sessionStorage.setItem(_PREVIEW_CACHE_KEY, JSON.stringify(obj)); } catch(_) {}
    }
    async function getIssuePreview(issueKey){
      // Cache hit?
      const cache = _readPreviewCache();
      const hit = cache[issueKey];
      if(hit && (Date.now() - hit.t) < _PREVIEW_TTL_MS){
        return hit.data;
      }

      const fields = [
        'summary','status','priority','assignee','description','issuetype',
        `customfield_${CF_ASSET}`,
        `customfield_${CF_RES_TEAM}`
      ];
      const data = await getIssueFields(issueKey, fields);
      const f = data.fields || {};
      const asset = f[`customfield_${CF_ASSET}`];
      const assetArr = Array.isArray(asset) ? asset : (asset ? [asset] : []);
      let assetLabel = assetArr.map(a => a?.objectKey || a?.label || a?.name).filter(Boolean).join(', ');
      if(!assetLabel && assetArr.length){
        const names = await Promise.all(assetArr.map(a => getAssetName(a?.workspaceId, a?.objectId)));
        assetLabel = names.filter(Boolean).join(', ');
        if(!assetLabel) assetLabel = assetArr.map(a => a?.objectId).filter(Boolean).join(', ');
      }
      const resTeam = f[`customfield_${CF_RES_TEAM}`];
      const result = {
        key: data.key || issueKey,
        summary: f.summary || '(sem titulo)',
        status: f.status?.name || '',
        statusColor: f.status?.statusCategory?.colorName || 'medium-gray',
        priority: f.priority?.name || '',
        priorityIcon: f.priority?.iconUrl || '',
        assignee: f.assignee?.displayName || 'Nao atribuido',
        issuetype: f.issuetype?.name || '',
        issuetypeIcon: f.issuetype?.iconUrl || '',
        asset: assetLabel,
        resolutionTeam: resTeam?.value || resTeam?.name || '',
        descriptionAdf: f.description || null
      };

      // Salva no cache (limita a 50 entradas mais recentes)
      cache[issueKey] = { t: Date.now(), data: result };
      const entries = Object.entries(cache).sort((a,b) => b[1].t - a[1].t).slice(0, 50);
      _writePreviewCache(Object.fromEntries(entries));
      return result;
    }

    async function searchByJql(jql){
      const url = `${location.origin}/rest/api/3/search/jql`;
      const payload = {
        jql,
        maxResults: MAX_RESULTS,
        fields: ["summary","description","assignee","issuetype","project","updated","priority", `customfield_${CF_RES_TEAM}`, `customfield_${CF_ASSET}`]
      };
      const r = await fetch(url, {
        method:'POST',
        credentials:'same-origin',
        headers:{ 'Accept':'application/json', 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
      const txt = await r.text().catch(()=> '');
      if(!r.ok) throw new Error(`HTTP ${r.status} no search/jql: ${txt.slice(0,250)}`);
      return JSON.parse(txt);
    }

    async function searchIssuesWithCache(objectId, jql){
      const cached = cacheGet(objectId);
      if (cached && cached.jql === jql && cached.issues) return cached.issues;
      const data = await searchByJql(jql);
      const issues = data.issues || [];
      cacheSet(objectId, { ...(cached || {}), jql, issues });
      return issues;
    }

    // Busca info compacta de varios chamados de uma vez (para o modal Gerenciador).
    // Faz JQL "key in (...)" e retorna [{ key, summary, status, priority, assignee,
    //   issuetype, asset (texto), resTeam }]. Asset e resolvido em paralelo via Assets API.
    // Pagina internamente se houver muitas keys (limite JQL ~ algumas centenas).
    async function getIssuesBatchInfo(keys){
      if(!Array.isArray(keys) || !keys.length) return [];

      const fieldList = [
        'summary','status','priority','assignee','issuetype',
        `customfield_${CF_ASSET}`,
        `customfield_${CF_RES_TEAM}`
      ];

      const out = [];
      const CHUNK = 100; // safe pra JQL
      for(let i = 0; i < keys.length; i += CHUNK){
        const slice = keys.slice(i, i + CHUNK);
        const quoted = slice.map(k => `"${k}"`).join(',');
        const jql = `key in (${quoted})`;
        const url = `${location.origin}/rest/api/3/search/jql`;
        const payload = { jql, maxResults: CHUNK, fields: fieldList };
        try{
          const r = await fetch(url, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Accept':'application/json', 'Content-Type':'application/json' },
            body: JSON.stringify(payload)
          });
          if(!r.ok){
            // Falha no chunk: emite stubs pra nao perder visibilidade
            for(const k of slice) out.push({ key: k, error: `HTTP ${r.status}` });
            continue;
          }
          const data = await r.json();
          for(const issue of (data.issues || [])){
            const f = issue.fields || {};
            const assetArr = (() => {
              const a = f[`customfield_${CF_ASSET}`];
              return Array.isArray(a) ? a : (a ? [a] : []);
            })();
            // Asset inline (pode vir vazio - resolvemos via Assets API depois, async)
            let assetInline = assetArr.map(a => a?.objectKey || a?.label || a?.name).filter(Boolean).join(', ');
            const resTeam = f[`customfield_${CF_RES_TEAM}`];
            out.push({
              key: issue.key,
              summary: f.summary || '(sem titulo)',
              status: f.status?.name || '',
              statusColor: f.status?.statusCategory?.colorName || 'medium-gray',
              priority: f.priority?.name || '',
              priorityId: f.priority?.id || '',
              priorityIcon: f.priority?.iconUrl || '',
              assignee: f.assignee?.displayName || '',
              issuetype: f.issuetype?.name || '',
              issuetypeIcon: f.issuetype?.iconUrl || '',
              asset: assetInline,
              assetArr,
              resTeam: resTeam?.value || resTeam?.name || ''
            });
          }
        }catch(e){
          for(const k of slice) out.push({ key: k, error: String(e.message || e) });
        }
      }

      // Resolve nomes legiveis de asset (so para os que vieram sem nome inline).
      // Paraleliza, mas com cap de 6 concorrentes pra nao matar a Assets API.
      const pending = out.filter(o => !o.asset && Array.isArray(o.assetArr) && o.assetArr.length);
      const POOL = 6;
      let idx = 0;
      async function worker(){
        while(idx < pending.length){
          const obj = pending[idx++];
          try{
            const names = await Promise.all(obj.assetArr.map(a => getAssetName(a?.workspaceId, a?.objectId)));
            obj.asset = names.filter(Boolean).join(', ');
            if(!obj.asset) obj.asset = obj.assetArr.map(a => a?.objectId).filter(Boolean).join(', ');
          }catch(_){ /* deixa vazio */ }
        }
      }
      await Promise.all(Array.from({ length: Math.min(POOL, pending.length) }, worker));

      return out;
    }

    // Remove o usuario (accountId) da lista de watchers do ticket.
    // Idempotente: 204 ou 404 (nao era watcher) sao considerados sucesso.
    async function jiraUnwatchIssue(issueKey, accountId){
      if(!accountId) throw new Error('accountId obrigatorio para unwatch');
      const url = `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/watchers?accountId=${encodeURIComponent(accountId)}`;
      const r = await fetch(url, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
      });
      if(!r.ok && r.status !== 404){
        const txt = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status} ao unwatch ${issueKey}: ${txt.slice(0, 200)}`);
      }
      return true;
    }

    // Lista watchers do ticket.
    async function jiraGetWatchers(issueKey){
      const url = `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/watchers`;
      const r = await fetch(url, {
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
      });
      const txt = await r.text().catch(() => '');
      if(!r.ok) throw new Error(`HTTP ${r.status} ao listar watchers: ${txt.slice(0, 200)}`);
      const data = JSON.parse(txt);
      return data.watchers || [];
    }

    // Unwatch robusto: tenta remover, confirma via GET, retry com delay caso o Jira
    // tenha re-adicionado por:
    //   (a) "auto-watch on comment" - configuracao pessoal que adiciona o autor de comentarios
    //   (b) workflow post-function - alguns workflows adicionam watchers conforme o time/status
    //
    // Estrategia:
    //   - delay inicial (initialDelayMs) pra dar tempo de post-functions server-side rodarem
    //   - N tentativas (maxAttempts) com delayMs entre cada
    //   - aviso scheduleLate: dispara um unwatch extra apos delayLateMs (fire-and-forget)
    //     pra cobrir post-functions que rodam segundos apos a transicao
    //
    // Devolve { ok, attempts, reAdded }.
    async function jiraUnwatchIssueRobust(issueKey, accountId, opts){
      opts = opts || {};
      const maxAttempts    = opts.maxAttempts    || 5;
      const delayMs        = opts.delayMs        || 1200;
      const initialDelayMs = opts.initialDelayMs ?? 1500;
      const log = (m) => console.log(`[jira-localidade][unwatch] ${issueKey} ${m}`);

      // Delay inicial: workflow post-functions normalmente rodam dentro de ~1-2s da transicao.
      // Esperar antes da 1a tentativa aumenta MUITO a taxa de sucesso na 1a.
      if(initialDelayMs > 0){
        log(`aguardando ${initialDelayMs}ms iniciais (post-functions server-side)...`);
        await new Promise(r => setTimeout(r, initialDelayMs));
      }

      let reAdded = false;
      for(let attempt = 1; attempt <= maxAttempts; attempt++){
        try{
          await jiraUnwatchIssue(issueKey, accountId);
        }catch(e){
          log(`tentativa ${attempt} falhou: ${e.message}`);
          if(attempt === maxAttempts) throw e;
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }

        // Confirma com GET
        let watchers;
        try{
          watchers = await jiraGetWatchers(issueKey);
        }catch(e){
          log(`falha ao validar via GET watchers (assumindo sucesso): ${e.message}`);
          scheduleLateUnwatch(issueKey, accountId);
          return { ok: true, attempts: attempt, reAdded };
        }

        const stillThere = (watchers || []).some(w => String(w.accountId) === String(accountId));
        if(!stillThere){
          log(`removido com sucesso (tentativa ${attempt}/${maxAttempts}).`);
          // Bonus: agenda uma checagem tardia (cobre post-functions lentas)
          const flushLate = scheduleLateUnwatch(issueKey, accountId);
          return { ok: true, attempts: attempt, reAdded, flushLate };
        }

        // Ainda esta na lista - aguarda e tenta de novo
        reAdded = true;
        log(`ainda como watcher apos tentativa ${attempt} - aguardando ${delayMs}ms e tentando de novo...`);
        if(attempt < maxAttempts) await new Promise(r => setTimeout(r, delayMs));
      }

      log(`falhou apos ${maxAttempts} tentativas - agendando ultima tentativa tardia (20s)...`);
      const flushLate = scheduleLateUnwatch(issueKey, accountId);
      return { ok: false, attempts: maxAttempts, reAdded: true, flushLate };
    }

    // Fire-and-forget: agenda 1 tentativa extra de unwatch ~20s depois.
    // Cobre post-functions/automations que adicionam watcher com delay maior que o nosso retry sincrono.
    // Roda silenciosamente em background (so loga no console).
    //
    // Retorna { flush: async () => ... } pra forcar execucao imediata
    // (com buffer pequeno pra dar tempo das post-functions rodarem). Usar antes
    // de location.reload() pra que a verificacao tardia nao seja morta pelo reload.
    function scheduleLateUnwatch(issueKey, accountId){
      const FLUSH_BUFFER_MS = 3500; // tempo extra antes do check no flush() (post-functions costumam rodar em 1-3s)
      const SCHED_DELAY_MS  = 20000;
      let executed = false;

      const doCheck = async () => {
        if(executed) return;
        executed = true;
        try{
          const watchers = await jiraGetWatchers(issueKey);
          const stillThere = (watchers || []).some(w => String(w.accountId) === String(accountId));
          if(!stillThere){
            console.log(`[jira-localidade][unwatch-late] ${issueKey} - ja nao e watcher, nada a fazer.`);
            return;
          }
          await jiraUnwatchIssue(issueKey, accountId);
          console.log(`[jira-localidade][unwatch-late] ${issueKey} - removido na verificacao tardia (post-function lenta).`);
        }catch(e){
          console.warn(`[jira-localidade][unwatch-late] ${issueKey} falhou (silencioso):`, e);
        }
      };

      const handle = setTimeout(doCheck, SCHED_DELAY_MS);

      return async function flush(){
        clearTimeout(handle);
        // Buffer curto antes do check pra dar chance das post-functions rodarem.
        // Sem isso, podemos ver o watcher ANTES do post-function readicionar.
        await new Promise(r => setTimeout(r, FLUSH_BUFFER_MS));
        await doCheck();
      };
    }

    async function addInternalComment(issueKey, bodyText) {
      const url = `${location.origin}/rest/api/3/issue/${issueKey}/comment`;
      const payload = {
        body: textToAdfParagraphs(bodyText),
        properties: [{ key: "sd.public.comment", value: { internal: true } }]
      };
      const r = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Accept':'application/json', 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
      const txt = await r.text().catch(()=> '');
      if(!r.ok) throw new Error(`HTTP ${r.status} ao comentar: ${txt.slice(0,300)}`);
      _markToolkitUsage(issueKey).catch(()=>{});
      return JSON.parse(txt);
    }

    async function linkDuplicate(currentKey, duplicateKey) {
      const url = `${location.origin}/rest/api/3/issueLink`;
      const payload = {
        type: { name: "Duplicate" },
        outwardIssue: { key: currentKey },
        inwardIssue: { key: duplicateKey }
      };
      const r = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Accept':'application/json', 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
      const txt = await r.text().catch(()=> '');
      if(!r.ok) throw new Error(`HTTP ${r.status} ao vincular: ${txt.slice(0,300)}`);
      return true;
    }
    // =========================
    // JIRA ASSETS — CONNECTED TICKETS
    // =========================
    async function getConnectedTicketsPage(workspaceId, objectId, startAt){
      const url =
        `${location.origin}/gateway/api/jsm/assets/workspace/${encodeURIComponent(workspaceId)}` +
        `/v1/objectconnectedtickets/${encodeURIComponent(objectId)}/paginatedtickets` +
        `?hideResolved=${HIDE_RESOLVED ? 'true' : 'false'}` +
        `&limit=${PAGE_SIZE}` +
        `&startAt=${startAt}`;

      const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
      const txt = await r.text().catch(()=> '');
      if(!r.ok) throw new Error(`HTTP ${r.status} ao consultar paginatedtickets: ${txt.slice(0,250)}`);
      return JSON.parse(txt);
    }

    function extractIssueKeysFromConnectedTickets(data){
      const keys = new Set();
      const walk = (x) => {
        if(x == null) return;
        if(Array.isArray(x)) return x.forEach(walk);
        if(typeof x === 'object'){
          for(const [k,v] of Object.entries(x)){
            if((k === 'issueKey' || k === 'key') && typeof v === 'string' && /^[A-Z][A-Z0-9_]+-\d+$/.test(v)) keys.add(v);
            else walk(v);
          }
        }
      };
      walk(data);
      return [...keys];
    }

    async function getConnectedTicketsKeys(workspaceId, objectId){
      const cached = cacheGet(objectId);
      if (cached && cached.keys) return cached.keys;

      let allKeys = [];
      for(let page=0; page<MAX_PAGES; page++){
        const startAt = page * PAGE_SIZE;
        const data = await getConnectedTicketsPage(workspaceId, objectId, startAt);
        const keys = extractIssueKeysFromConnectedTickets(data);
        allKeys.push(...keys);
        if(keys.length < PAGE_SIZE) break;
      }
      allKeys = uniq(allKeys);
      cacheSet(objectId, { ...(cached || {}), keys: allKeys });
      return allKeys;
    }

    async function getAssetFromIssue(issueKey){
      const issue = await getIssueFields(issueKey, [`customfield_${CF_ASSET}`]);
      const v = issue?.fields?.[`customfield_${CF_ASSET}`];
      const obj = Array.isArray(v) ? v[0] : v;
      const objectId = obj?.objectId;
      const workspaceId = obj?.workspaceId;
      if(!objectId || !workspaceId) throw new Error('customfield_18388 sem objectId/workspaceId');
      return { objectId: String(objectId), workspaceId: String(workspaceId) };
    }

    // Busca o nome legivel ("label"/"name") de um objeto Asset por workspaceId+objectId.
    // Retorna string vazia se nao conseguir resolver (best-effort).
    async function getAssetName(workspaceId, objectId){
      if(!workspaceId || !objectId) return '';
      try{
        const url = `${location.origin}/gateway/api/jsm/assets/workspace/${encodeURIComponent(workspaceId)}/v1/object/${encodeURIComponent(objectId)}`;
        const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
        if(!r.ok) return '';
        const d = await r.json();
        return d?.label || d?.name || d?.objectKey || '';
      }catch(_){ return ''; }
    }
    // =========================
    // IDENTIFIERS (IDs + quantidades de equipamentos)
    // =========================
    function normalizeForQty(s){
      return String(s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .replace(/[\(\)\[\]\{\},;:!?"'`]/g,' ')
        .replace(/\s+/g,' ')
        .trim();
    }

    function extractQtyTokens(text){
      const t = normalizeForQty(text);
      const patterns = [
        { type: 'CAMERA', re: /\b(\d{1,3})\s+(?:camera|cameras)\b/g },
        { type: 'PRINTER', re: /\b(\d{1,3})\s+(?:impressora|impressoras)\b/g },
        { type: 'HANDHELD', re: /\b(\d{1,3})\s+(?:handheld|handhelds)\b/g },
        { type: 'NOTEBOOK', re: /\b(\d{1,3})\s+(?:notebook|notebooks)\b/g },
        { type: 'LEITOR', re: /\b(\d{1,3})\s+(?:leitor|leitores)\b/g },
        { type: 'AP', re: /\b(\d{1,3})\s+(?:ap|aps|access\s+point|access\s+points)\b/g },
      ];
      const out = [];
      for(const p of patterns){
        for(const m of t.matchAll(p.re)){
          out.push({ type: `QTY:${p.type}`, value: `QTY:${p.type}=${m[1]}`, weight: 5 });
        }
      }
      const byVal = new Map();
      for(const it of out) if(!byVal.has(it.value)) byVal.set(it.value, it);
      return [...byVal.values()];
    }

    function isPrivateIp(ip){
      const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
      if(!m) return false;
      const a = Number(m[1]), b = Number(m[2]);
      if(a === 10) return true;
      if(a === 192 && b === 168) return true;
      if(a === 172 && b >= 16 && b <= 31) return true;
      return false;
    }

    function extractIdentifiersFromText(text){
      const t = String(text || '');
      const found = [];

      found.push(...extractQtyTokens(t));

      const ipRe = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
      for(const m of t.matchAll(ipRe)){
        const ip = m[0];
        found.push({ type:'ip', value: ip, weight: isPrivateIp(ip) ? 4 : 3 });
      }

      const macRe = /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g;
      for(const m of t.matchAll(macRe)){
        found.push({ type:'mac', value: m[0].toUpperCase().replace(/-/g,':'), weight: 6 });
      }

      const zebzplRe = /\b(ZEB|ZPL)\s*[-_:]?\s*(\d{3,})\b/gi;
      for(const m of t.matchAll(zebzplRe)){
        found.push({ type: m[1].toUpperCase(), value: `${m[1].toUpperCase()}${m[2]}`, weight: 7 });
      }

      // Seriais no formato [dígitos][letras][dígitos] sem prefixo SN (ex: 99J245103764)
      // Padrão: começa com 2+ dígitos, tem 1-3 letras no meio, termina com 6+ dígitos
      const mixedSerialRe = /\b(\d{2,4}[A-Z]{1,3}\d{6,12})\b/gi;
      for(const m of t.matchAll(mixedSerialRe)){
        const tok = m[1].toUpperCase();
        found.push({ type:'serial', value: tok, weight: 6 });
      }

      const selbRe = /\bSELB\b/gi;
      if(selbRe.test(t)) found.push({ type:'SELB', value:'SELB', weight: 2 });

      const serialLabelRe = /\b(?:S\/N|SN|N\/S|SERIAL(?:\s*NUMBER)?)[\s:#-]*([A-Z0-9]{6,24})\b/gi;
      for(const m of t.matchAll(serialLabelRe)){
        const s = m[1].toUpperCase();
        if(s.length >= 8) found.push({ type:'serial', value: s, weight: 7 });
      }

      // Tokens alfanuméricos sem prefixo reconhecido (ex: 99J245103764, XY1234567890)
      // Requer: 8-24 chars, pelo menos 1 letra, pelo menos 2 dígitos, não ser MAC puro
      const strongTokenRe = /\b[A-Z0-9]{8,24}\b/g;
      const up = t.toUpperCase();
      for(const m of up.matchAll(strongTokenRe)){
        const tok = m[0];
        if(/^\d+$/.test(tok)) continue;                        // só dígitos — não é serial
        if((tok.match(/[A-Z]/g) || []).length < 1) continue;    // precisa de pelo menos 1 letra
        if((tok.match(/\d/g) || []).length < 2) continue;       // precisa de pelo menos 2 dígitos
        if(/^[0-9A-F]{12}$/.test(tok)) continue;                // parece MAC — ignora
        if(/^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/i.test(tok)) continue; // UUID
        found.push({ type:'serial?', value: tok, weight: 3 });
      }

      const byVal = new Map();
      for(const it of found){
        const v = it.value.trim();
        const prev = byVal.get(v);
        if(!prev || it.weight > prev.weight) byVal.set(v, it);
      }
      return [...byVal.values()].sort((a,b)=> b.weight - a.weight || a.value.localeCompare(b.value));
    }

    function intersectByExtraction(currentIds, otherIds){
      if(!currentIds.length || !otherIds.length) return [];
      const cur = new Map(currentIds.map(x => [x.value.toUpperCase(), x]));
      const hits = [];
      for(const it of otherIds){
        const k = it.value.toUpperCase();
        if(cur.has(k)) hits.push(cur.get(k));
      }
      return hits;
    }

    function scoreHits(hits){
      return hits.reduce((acc, x) => acc + (x.weight || 1), 0);
    }

    function isStrongHit(hit){
      const t = String(hit.type || '').toUpperCase();
      return (t === 'MAC' || t === 'ZEB' || t === 'ZPL' || t === 'SERIAL' || t === 'SERIAL?');
    }

    function isIpOnly(hits){
      return hits.length > 0 && hits.every(h => h.type === 'ip');
    }
    // =========================
    // DERIVE — transitions + modal + execução
    // =========================
    async function jiraGetTransitions(issueKey) {
      const url = `${location.origin}/rest/api/3/issue/${issueKey}/transitions?expand=transitions.fields`;
      const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
      const txt = await r.text().catch(()=> '');
      if(!r.ok) throw new Error(`HTTP ${r.status} transitions: ${txt.slice(0,250)}`);
      return JSON.parse(txt);
    }

    function pickDeriveTransition(transitionsResponse) {
      const transitions = transitionsResponse.transitions || [];
      const target = DERIVE_TRANSITION_NAME.trim().toLowerCase();
      return transitions.find(t => String(t.name||'').trim().toLowerCase() === target)
          || transitions.find(t => String(t.name||'').toLowerCase().includes('derive'))
          || null;
    }

    function getAllowedResolutionTeams(transition) {
      const fields = transition?.fields || {};
      const cf = fields[`customfield_${CF_RES_TEAM}`];
      return cf?.allowedValues || [];
    }

    function filterTeamsAllowlist(allowed) {
      const allow = new Set(DERIVE_TEAMS_ALLOWLIST.map(x => x.trim()));
      return allowed.filter(opt => allow.has(String(opt.value).trim()));
    }

    function openDeriveModal({ teams, onSubmit, suggestedTeamValue, locationKey, fieldTechs }) {
      document.getElementById(IDS.dModal)?.remove();
      document.getElementById(IDS.dOverlay)?.remove();

      const overlay = document.createElement('div');
      overlay.id = IDS.dOverlay;

      const modal = document.createElement('div');
      modal.id = IDS.dModal;

      modal.innerHTML = `
        <div class="dh">
          <div>
            <div class="title">Derivar para outro time</div>
            <div class="meta">Selecione o time e confirme.</div>
          </div>
          <div style="display:flex;gap:8px">
            <button id="ml_d_close" class="btnSecondary">Fechar</button>
          </div>
        </div>
        <div class="db">
          <div style="font-weight:900;margin-bottom:6px">Times</div>
          <div class="teamgrid" id="ml_d_teams"></div>

          <div style="font-weight:900;margin:12px 0 6px;display:flex;gap:8px;align-items:baseline;">
            <span>Coment&aacute;rio (observa&ccedil;&atilde;o interna)</span>
            <span id="ml_d_comment_btnwrap" style="margin-left:auto;font-weight:400;"></span>
          </div>
          <textarea id="ml_d_comment">${esc(DERIVE_COMMENT_DEFAULT)}</textarea>

          <div id="ml_d_iss_wrap" class="issWrap" style="display:none;">
            <label class="issLabel">
              <input type="checkbox" id="ml_d_iss" />
              <span><b>Tambem criar tarefa de troubleshooting (ISS)</b><br/>
              <span class="issHint">Cria uma Tarefa no projeto ${esc(ISS_TASK_PROJECT)} com voce como respons&aacute;vel, copia a descri&ccedil;&atilde;o e a localidade, e a vincula a este ticket.</span></span>
            </label>

          </div>

          <div class="row">
            <button id="ml_d_cancel" class="btnSecondary">Cancelar</button>
            <button id="ml_d_submit" class="btnPrimary">Derivar</button>
          </div>
        </div>
      `;

      const close = () => { modal.remove(); overlay.remove(); };
      overlay.addEventListener('click', close);
      modal.querySelector('#ml_d_close').addEventListener('click', close);
      modal.querySelector('#ml_d_cancel').addEventListener('click', close);

      const teamsWrap = modal.querySelector('#ml_d_teams');
      const issWrap   = modal.querySelector('#ml_d_iss_wrap');
      const issCheck  = modal.querySelector('#ml_d_iss');
      let selected = null;

      const refreshIssVisibility = () => {
        const offer = selected && shouldOfferIssTask(selected.value);
        if(offer){
          issWrap.style.display = '';
        } else {
          issWrap.style.display = 'none';
          issCheck.checked = false;
        }
      };

      teams.forEach(t => {
        const b = document.createElement('button');
        b.className = 'teambtn';
        const isSuggested = !!(suggestedTeamValue && t.value === suggestedTeamValue);
        b.textContent = t.value + (isSuggested ? '  (sugerido)' : '');
        if(isSuggested){
          b.style.borderColor = 'var(--ml-blue, #4f8cff)';
          b.style.boxShadow = '0 0 0 2px rgba(79,140,255,0.18) inset';
        }
        b.onclick = () => {
          selected = t;
          [...teamsWrap.querySelectorAll('.teambtn')].forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          refreshIssVisibility();
        };
        teamsWrap.appendChild(b);

        // Auto-seleciona o sugerido (se houver)
        if(isSuggested && !selected){
          selected = t;
          b.classList.add('active');
          // pequeno delay pra garantir que o issWrap exista
          setTimeout(refreshIssVisibility, 0);
        }
      });

      // Anexa o botao de Snippets no textarea de comentario + slash expander + hint
      try{
        const ta = modal.querySelector('#ml_d_comment');
        const wrap = modal.querySelector('#ml_d_comment_btnwrap');
        if(ta && wrap){
          const sb = buildSnippetsButton(ta, { label: 'Snippets' });
          wrap.appendChild(sb);
        }
        if(ta){
          attachSlashExpander(ta);
          // Hint dos /comandos abaixo do textarea
          const hintBox = document.createElement('div');
          hintBox.id = 'ml_d_slash_hint';
          ta.parentNode?.insertBefore(hintBox, ta.nextSibling);
          renderSlashCommandsHint(hintBox, { textarea: ta });
        }
      }catch(_){}

      modal.querySelector('#ml_d_submit').addEventListener('click', async () => {
        if(!selected){
          showToast('Selecione um time antes de derivar.','warn',3000);
          return;
        }
        const comment = modal.querySelector('#ml_d_comment').value || DERIVE_COMMENT_DEFAULT;
        const createIssTask = !!(issCheck && issCheck.checked && shouldOfferIssTask(selected.value));

        // Desabilita imediatamente botoes pra evitar duplo-click (que ja causou criar varias
        // ISS duplicadas em alguns cenarios). Mostra loading state no botao.
        const btn = modal.querySelector('#ml_d_submit');
        const btnCancel = modal.querySelector('#ml_d_cancel');
        const originalLabel = btn?.textContent || 'Derivar';
        if(btn){
          btn.disabled = true;
          btn.style.opacity = '.7';
          btn.style.cursor = 'not-allowed';
          btn.textContent = createIssTask ? 'Derivando + criando ISS...' : 'Derivando...';
        }
        if(btnCancel){
          btnCancel.disabled = true;
          btnCancel.style.opacity = '.5';
          btnCancel.style.cursor = 'not-allowed';
        }
        // Bloqueia overlay (clique fora nao deve fechar enquanto rola)
        const overlayEl = document.getElementById(IDS.dOverlay);
        if(overlayEl){
          overlayEl.style.pointerEvents = 'none';
        }

        try{
          await onSubmit({ team: selected, comment, createIssTask });
          close();
        }catch(e){
          // Em caso de erro, restaurar botoes pra usuario poder tentar de novo
          if(btn){
            btn.disabled = false;
            btn.style.opacity = '';
            btn.style.cursor = '';
            btn.textContent = originalLabel;
          }
          if(btnCancel){
            btnCancel.disabled = false;
            btnCancel.style.opacity = '';
            btnCancel.style.cursor = '';
          }
          if(overlayEl) overlayEl.style.pointerEvents = '';
          console.error('[jira-localidade][derive] erro no submit:', e);
          showToast('Erro ao derivar: ' + (e.message || e),'error',5000);
        }
      });

      document.body.appendChild(overlay);
      document.body.appendChild(modal);
    }

    // Toast de sucesso pos-derive. Non-blocking (nao trava UI como alert()).
    // Mensagem pode ser multilinha (\n vira <br>).
    function showDeriveSuccessToast(msg){
      try{ showToast((msg||'OK')+'\nA pagina sera recarregada em instantes...','success',4000); }catch(_){}
      try{ const _leg = false; if(_leg){ const t = document.createElement('div'); t.id = 'ml_derive_toast';
        t.style.cssText = `
          position: fixed; top: 18px; right: 18px; z-index: 2147483647;
          background: linear-gradient(180deg, #2f8f48, #246a36);
          color: #fff; padding: 12px 18px; border-radius: 10px;
          border: 1px solid #2c7a3e;
          font: 600 13px var(--ml-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
          box-shadow: 0 12px 30px rgba(0,0,0,.5);
          max-width: 420px; line-height: 1.45;
          animation: mlToastIn .25s cubic-bezier(.16,.84,.44,1);
        `;
        const body = String(msg || 'OK').split('\n').map(line => line.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))).join('<br>');
        t.innerHTML = `<div style="display:flex;gap:8px;align-items:flex-start;"><div style="font-size:16px;">&#10003;</div><div>${body}<div style="margin-top:6px;font-weight:500;font-size:11px;opacity:.85;">A pagina sera recarregada em instantes...</div></div></div>`;
        document.body.appendChild(t); }}catch(_){}
    }

    // Agenda recarregamento da pagina pos-derive (1.5s pra dar tempo do toast aparecer).
    // Bloqueia interacao com a pagina nesse intervalo pra evitar o usuario tentar
    // continuar e ter mudanca de contexto inesperada.
    //
    // Se houver um `flushLate` pendente (do scheduleLateUnwatch), ele eh executado
    // ANTES do reload pra garantir que a verificacao tardia nao seja morta pelo
    // reload da pagina.
    async function scheduleReloadAfterDerive(opts){
      opts = opts || {};
      // Flush sincrono do unwatch tardio (sobreviver ao reload)
      if(typeof opts.flushLate === 'function'){
        try{ await opts.flushLate(); }catch(e){ console.warn('[jira-localidade][derive] flushLate falhou:', e); }
      }
      try{
        // Veu sutil sobre a pagina
        const veil = document.createElement('div');
        veil.id = 'ml_reload_veil';
        veil.style.cssText = `
          position: fixed; inset: 0; background: rgba(0,0,0,.25);
          z-index: 2147483640; pointer-events: all;
        `;
        document.body.appendChild(veil);
      }catch(_){}
      setTimeout(() => { try{ location.reload(); }catch(_){} }, 1500);
    }

    // Remove o assignee atual do ticket (atribui pra "nenhum"). Usado apos derivar
    // pra liberar o chamado pra fila do novo time. Best-effort.
    async function jiraUnassign(issueKey){
      const url = `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/assignee`;
      const r = await fetch(url, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Accept':'application/json', 'Content-Type':'application/json' },
        body: JSON.stringify({ accountId: null })
      });
      if(!r.ok){
        const txt = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status} ao desatribuir ${issueKey}: ${txt.slice(0, 250)}`);
      }
      return true;
    }

    async function jiraDoDerive(issueKey, transitionId, teamOptionId, internalCommentText, adfBodyOverride) {
      const url = `${location.origin}/rest/api/3/issue/${issueKey}/transitions`;

      const payload = {
        transition: { id: String(transitionId) },
        fields: {
          [`customfield_${CF_RES_TEAM}`]: { id: String(teamOptionId) }
        },
        update: {
          comment: [{
            add: {
              body: adfBodyOverride || textToAdfParagraphs(internalCommentText),
              properties: [{ key: "sd.public.comment", value: { internal: true } }]
            }
          }]
        }
      };

      const r = await fetch(url, {
        method:'POST',
        credentials:'same-origin',
        headers:{ 'Accept':'application/json', 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });

      const txt = await r.text().catch(()=> '');
      if(!r.ok) throw new Error(`HTTP ${r.status} ao derivar: ${txt.slice(0,300)}`);
      _markToolkitUsage(issueKey).catch(()=>{});
      return true;
    }


    // Cache de email → { accountId, displayName } para @mentions
    const EMAIL_ACCT_CACHE_KEY = 'field_email_acct_cache';

    async function jiraResolveEmailToAccount(email){
      if(!email) return null;
      try{
        const cache = JSON.parse(GM_getValue(EMAIL_ACCT_CACHE_KEY, '{}'));
        if(cache[email]) return cache[email];
        const url = `${location.origin}/rest/api/3/user/search?query=${encodeURIComponent(email)}&maxResults=5`;
        const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' } });
        if(!r.ok) return null;
        const users = await r.json();
        const match = users.find(u => u.emailAddress?.toLowerCase() === email.toLowerCase());
        if(match){
          const val = { accountId: match.accountId, displayName: match.displayName };
          cache[email] = val;
          GM_setValue(EMAIL_ACCT_CACHE_KEY, JSON.stringify(cache));
          return val;
        }
        return null;
      }catch(e){ console.warn('[is-toolkit] jiraResolveEmailToAccount falhou:', e); return null; }
    }

    // Constrói ADF com @mentions de field techs + texto de comentário base
    function buildAdfWithFieldMentions(commentText, techs){
      // techs: [{ displayName, accountId, turno, onShift }]
      const base = textToAdfParagraphs(commentText);
      const mentionInline = [];
      techs.forEach((t, i) => {
        if(i > 0) mentionInline.push({ type:'text', text:', ' });
        if(t.accountId){
          mentionInline.push({ type:'mention', attrs:{ id: t.accountId, text:'@'+t.displayName, accessLevel:'' } });
        } else {
          mentionInline.push({ type:'text', text: t.displayName });
        }
        const badge = t.turno ? ` (${t.turno}${t.onShift?' ● agora':''})` : '';
        if(badge) mentionInline.push({ type:'text', text: badge });
      });
      const mentionPara = {
        type: 'paragraph',
        content: [
          { type:'text', text:'Field techs ativos: ', marks:[{ type:'strong' }] },
          ...mentionInline
        ]
      };
      return { type:'doc', version:1, content:[ ...base.content, mentionPara ] };
    }

    // Heuristica simples: testa as regras `DERIVE_TEAM_SUGGESTIONS` na ordem
    // contra summary + description (case-insensitive). Primeira que casar vence.
    // Retorna o `value` do time (ex: "IS-SHIP-NATS-N1") ou null se nada bater.
    function suggestTeamForText(text){
      if(!Array.isArray(DERIVE_TEAM_SUGGESTIONS) || !DERIVE_TEAM_SUGGESTIONS.length) return null;
      const t = String(text || '').toLowerCase();
      if(!t.trim()) return null;
      for(const rule of DERIVE_TEAM_SUGGESTIONS){
        const kw = String(rule.keyword || '').toLowerCase().trim();
        if(!kw) continue;
        if(t.includes(kw)) return String(rule.team || '').trim() || null;
      }
      return null;
    }

    // =========================
    // FIELD CATALOG — lookup de técnicos de campo por localidade
    // =========================
    const FIELD_CATALOG_CACHE_KEY = 'field_catalog_v3';
    const FIELD_CATALOG_TS_KEY    = 'field_catalog_ts_v3';
    const FIELD_CATALOG_TTL_MS    = 6 * 60 * 60 * 1000; // 6h

    const FIELD_SHEET_ID  = '10KzLd63EYrJQV7YNNCnAtLuVigC0PyhejWmKNfaYxsI';
    const FIELD_DOC_ID    = '01KS93JM5QXXD0TD6ANMZSEEXK';
    const FIELD_SHEET_TAB = 'Controle Terceiro Meli';

    // Retorna array de objetos { nome, posicao, turno, horario, status, localidade } ativos.
    //
    // Estrategia: stale-while-revalidate. Se ha cache (de qualquer idade), devolve na hora.
    // Se o cache venceu (>6h), dispara uma atualizacao em BACKGROUND (nao bloqueia a UI) que
    // troca o cache pra proxima leitura. So bloqueia buscando a planilha quando NAO ha cache
    // nenhum (primeira vez) ou quando forceRefresh=true. Isso elimina a espera longa que
    // acontecia toda vez que o TTL expirava.
    function _readCatalogCache(){
      try{
        const c = JSON.parse(GM_getValue(FIELD_CATALOG_CACHE_KEY, 'null'));
        return Array.isArray(c) ? c : null;
      }catch(_){ return null; }
    }
    async function fetchFieldCatalog(forceRefresh) {
      const now = Date.now();
      const cached = _readCatalogCache();
      const ts = Number(GM_getValue(FIELD_CATALOG_TS_KEY, 0));
      const fresh = (now - ts) < FIELD_CATALOG_TTL_MS;

      if(!forceRefresh && cached){
        // Cache vencido → atualiza em background (uma vez por vez), mas devolve o atual ja.
        if(!fresh && !fetchFieldCatalog._refreshing){
          fetchFieldCatalog._refreshing = true;
          _fetchFieldCatalogNetwork()
            .catch(() => {})
            .finally(() => { fetchFieldCatalog._refreshing = false; });
        }
        return cached;
      }
      // Sem cache (primeira vez) ou refresh forcado: busca bloqueante.
      return _fetchFieldCatalogNetwork();
    }

    // Busca a planilha do Grid e atualiza o cache GM. Sempre resolve (nunca rejeita com throw).
    function _fetchFieldCatalogNetwork() {
      const now = Date.now();
      const url = `https://grid.melioffice.com/api/v1/sheets/${FIELD_SHEET_ID}?doc_id=${encodeURIComponent(FIELD_DOC_ID)}&range=${encodeURIComponent(FIELD_SHEET_TAB + '!A1:Z')}`;
      return new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          withCredentials: true,
          onload(resp) {
            try{
              const data = JSON.parse(resp.responseText);
              const values = data?.values || [];
              if(values.length < 2){ resolve([]); return; }
              const hdrs = values[0].map(h => String(h||'').trim().toLowerCase());
              const iNome      = hdrs.indexOf('terceiros');
              const iPosicao   = hdrs.indexOf('posicao');
              const iTurno     = hdrs.indexOf('turno');
              const iHorario   = hdrs.indexOf('horario');
              const iStatus    = hdrs.indexOf('status');
              const iLocalidade= hdrs.indexOf('localidade');
              const iIsResp    = hdrs.indexOf('is responsavel');
              const iLider     = hdrs.indexOf('lider');
              const iRegional  = hdrs.indexOf('regional');
              const iProvedor  = hdrs.indexOf('provedor');
              const iEmail     = hdrs.indexOf('email');
              const rows = values.slice(1)
                .filter(r => r.some(c => c))
                .map(r => ({
                  nome:       String(r[iNome]      || '').trim(),
                  posicao:    String(r[iPosicao]   || '').trim(),
                  turno:      String(r[iTurno]     || '').trim(),
                  horario:    String(r[iHorario]   || '').trim(),
                  status:     String(r[iStatus]    || '').trim(),
                  localidade: String(r[iLocalidade]|| '').trim().toUpperCase(),
                  isResp:     String(r[iIsResp]    || '').trim(),
                  lider:      String(r[iLider]     || '').trim(),
                  regional:   String(r[iRegional]  || '').trim(),
                  provedor:   String(r[iProvedor]  || '').trim(),
                  email:      String(r[iEmail]     || '').trim().toLowerCase(),
                }))
                .filter(r => r.nome && r.localidade);
              GM_setValue(FIELD_CATALOG_CACHE_KEY, JSON.stringify(rows));
              GM_setValue(FIELD_CATALOG_TS_KEY, String(now));
              resolve(rows);
            }catch(e){ console.warn('[is-toolkit][field-catalog] parse error:', e); resolve([]); }
          },
          onerror() { resolve([]); },
          ontimeout() { resolve([]); },
        });
      });
    }

    // Retorna true se agora (horário de SP, UTC-3) está dentro do turno descrito em `horario`
    // Exemplos: "5X2 22:00H AS 06:00H COM 01:00H DE INTERVALO", "SEG A SEX 14:20H AS 22:43H"
    function isOnShiftNow(horario) {
      if(!horario) return null;
      try {
        // Hora atual em São Paulo (America/Sao_Paulo = UTC-3, sem DST desde 2019)
        const spNow  = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const curDay  = spNow.getDay(); // 0=Dom … 6=Sab
        const curMins = spNow.getHours() * 60 + spNow.getMinutes();

        // Extrai start/end: "22:00H AS 06:00H" ou "14:20H AS 22:43H"
        const tm = horario.match(/(\d{1,2}):(\d{2})H?\s+[AÀ]S\s+(\d{1,2}):(\d{2})H?/i);
        if(!tm) return null;
        const startMins = parseInt(tm[1]) * 60 + parseInt(tm[2]);
        const endMins   = parseInt(tm[3]) * 60 + parseInt(tm[4]);

        // Verifica janela de horário (suporta virada de meia-noite)
        const inTime = startMins < endMins
          ? curMins >= startMins && curMins < endMins
          : curMins >= startMins || curMins < endMins;

        // Verifica dia da semana se houver padrão "SEG A SEX" / "TER A SAB"
        const dMap = { DOM:0, SEG:1, TER:2, QUA:3, QUI:4, SEX:5, SAB:6 };
        const dm = horario.match(/\b([A-Z]{3})\s+[AÀ]\s+([A-Z]{3})\b/i);
        if(dm) {
          const sd = dMap[dm[1].toUpperCase()], ed = dMap[dm[2].toUpperCase()];
          if(sd !== undefined && ed !== undefined) {
            const inDay = sd <= ed
              ? curDay >= sd && curDay <= ed
              : curDay >= sd || curDay <= ed;
            return inTime && inDay;
          }
        }

        // Escala rotativa (5X2, 6X1 etc.) ou padrão desconhecido → só verifica hora
        return inTime;
      } catch(_) { return null; }
    }

    // Aliases: nomes alternativos no Jira que mapeiam para códigos do Grid
    // Extrai o código de localidade (ex: BRXSP23, BRSP02) de qualquer formato de string.
    // Suporta formatos antigos ("BRXSP23 - XD Campinas") e novos ("BR_XD_CAMPINAS BRXSP23").
    // Retorna o código SEM prefixo BR (ex: "XSP23") para comparar com o catálogo.
    function extractLocationCode(raw){
      if(!raw) return '';
      const s = String(raw).trim().toUpperCase();
      // 1) Tenta extrair padrão BRXXX## explícito (ex: BRXSP23, BRSP10, BRSP02)
      const m = s.match(/\b(BR[A-Z]{1,6}\d{1,4})\b/);
      if(m) return m[1].replace(/^BR/, '');
      // 2) Fallback: primeiro token antes do traço (formato antigo sem prefixo BR)
      const firstToken = s.split(/\s*[-\u2013]\s*/)[0].trim().replace(/^BR/, '');
      return firstToken.split(/\s+/)[0]; // só o primeiro word-token
    }

    // Aliases de localidade → código canônico do Grid (SEM prefixo BR).
    // Todas as chaves são comparadas em MAIÚSCULAS. O resolvedor testa a string
    // original inteira (e variações normalizadas), então dá pra usar nomes limpos
    // como "BR_XD_BARUERI" em vez de depender do formato extraído.
    // Site Barueri / ARENA = BRXSP1 (XSP1). Variantes que aparecem no Jira/Assets:
    const LOCATION_ALIASES = {
      'ARENA': 'XSP1',
      'SSP5': 'XSP1',
      'SSP58': 'XSP1',
      'XSP27': 'XSP1',            // BRXSP27
      'BR_SVC_BARUERI': 'XSP1',
      'BR_XD_BARUERI': 'XSP1',    // casa "BR_XD_Barueri - ARENA" (parte antes do traço)
    };

    // Dada a string bruta da localidade, resolve o código canônico via LOCATION_ALIASES,
    // testando vários candidatos (código extraído, primeiro token, string completa,
    // parte antes do traço e versão sem espaços). Retorna codeOnly se nenhum casar.
    function resolveLocationAlias(raw, codeOnly, firstToken){
      const up = String(raw || '').trim().toUpperCase();
      const candidates = [
        codeOnly,
        firstToken,
        up,
        up.split(/\s*[-–]\s*/)[0].trim(), // parte antes do traço: "BR_XD_BARUERI - ARENA" → "BR_XD_BARUERI"
        up.split(/\s+/)[0],               // primeiro token: "BR_XD_BARUERI ARENA" → "BR_XD_BARUERI"
        up.replace(/\s+/g, ''),
      ];
      for(const c of candidates){
        if(c && Object.prototype.hasOwnProperty.call(LOCATION_ALIASES, c)) return LOCATION_ALIASES[c];
      }
      return codeOnly;
    }

    // Gera o conjunto de chaves candidatas de uma localidade bruta do Jira.
    // Nao ha padrao fixo: a sigla pode vir no comeco ("BRXSP18 - XD Santo Andre"),
    // no fim ("BR_SVC_ITAITINGA SCE1"), com ou sem prefixo BR, e alguns sites so tem
    // nome ("BR_XD_BARUERI ARENA" → resolvido por alias). Entao juntamos:
    //   - a chave resolvida por alias (nome inteiro / traco / espaco / codigo)
    //   - TODOS os tokens do nome (separados por espaco, traco ou underscore),
    //     nas formas com e sem prefixo BR.
    // A comparacao com o catalogo eh por IGUALDADE de token (nao substring), entao
    // "XSP1" nunca casa por engano com "XSP10".
    function locationCandidateKeys(raw){
      const up = String(raw || '').trim().toUpperCase();
      const set = new Set();
      const codeOnly = extractLocationCode(up);
      const aliasKey = resolveLocationAlias(up, codeOnly, codeOnly.split(/\s+/)[0]);
      if(aliasKey) set.add(aliasKey.replace(/^BR/, ''));
      if(codeOnly) set.add(codeOnly.replace(/^BR/, ''));
      up.split(/[\s\-–_]+/).forEach(tok => {
        const t = tok.trim();
        if(!t) return;
        set.add(t);                              // token cru (ex: "SCE1")
        if(/^BR[A-Z]/.test(t)) set.add(t.replace(/^BR/, '')); // ex: "BRXSP10" → "XSP10"
      });
      set.delete('');
      return set;
    }

    // Retorna as linhas do catalogo cuja Localidade casa com qualquer chave candidata.
    function catalogRowsForLocation(catalog, raw){
      if(!raw || !catalog?.length) return [];
      const keys = locationCandidateKeys(raw);
      return catalog.filter(r => keys.has(String(r.localidade || '').replace(/^BR/, '')));
    }

    // locationKey = objectKey do Jira. Casa a localidade contra o catalogo (robusto:
    // sigla em qualquer posicao, com/sem BR, ou por alias).
    function lookupFieldByLocation(catalog, locationKey) {
      return catalogRowsForLocation(catalog, locationKey);
    }

    async function openDeriveFlow(issueKey) {
      try{
        const tr = await jiraGetTransitions(issueKey);
        const deriveTr = pickDeriveTransition(tr);
        if(!deriveTr){
          showToast(`Transicao "${DERIVE_TRANSITION_NAME}" nao encontrada neste ticket.`,'warn',4000);
          return;
        }
        const allowed = getAllowedResolutionTeams(deriveTr);
        const teams = filterTeamsAllowlist(allowed);
        if(!teams.length){
          showToast('Nenhum time da allowlist disponivel nesta transicao.','warn',4000);
          return;
        }

        // Calcula sugestao de time baseada no summary + description (best-effort).
        let suggestedTeamValue = null;
        let locationKey = null;
        try{
          const issue = await getIssueFields(issueKey, ['summary', 'description', `customfield_${CF_ASSET}`]);
          const summary = String(issue?.fields?.summary || '');
          const descText = descriptionToText(issue?.fields?.description) || '';
          suggestedTeamValue = suggestTeamForText(`${summary}\n${descText}`);
          // Garante que o time sugerido esta na lista filtrada (allowlist)
          if(suggestedTeamValue && !teams.find(t => t.value === suggestedTeamValue)){
            suggestedTeamValue = null;
          }
          // Extrai objectKey da localidade (ex: "BRXSP18" ou "BRXSP18 - XD Santo André")
          const assetRaw = issue?.fields?.[`customfield_${CF_ASSET}`];
          const assetArr = Array.isArray(assetRaw) ? assetRaw : (assetRaw ? [assetRaw] : []);
          let objKey = assetArr.map(a => a?.objectKey || a?.label || a?.name).filter(Boolean)[0];
          // Fallback: se não veio inline, busca via Assets API
          if(!objKey && assetArr.length){
            try{
              const a = assetArr[0];
              objKey = await getAssetName(a?.workspaceId, a?.objectId);
            }catch(_){}
          }
          if(objKey) locationKey = String(objKey).trim().toUpperCase();
        }catch(e){ console.warn('[jira-localidade] sugestao de time falhou:', e); }

        // Busca técnicos de campo (best-effort, não bloqueia modal)
        let fieldTechs = [];
        if(locationKey){
          try{
            const catalog = await fetchFieldCatalog();
            fieldTechs = lookupFieldByLocation(catalog, locationKey);
          }catch(e){ console.warn('[is-toolkit][field-catalog] lookup falhou:', e); }
        }

        openDeriveModal({
          teams,
          suggestedTeamValue,
          locationKey,
          fieldTechs,
          onSubmit: async ({ team, comment, createIssTask }) => {
            // 1) Derivar primeiro (fonte da verdade). Se falhar, lanca erro pro
            // handler do botao reabilitar a UI e mostrar mensagem.
            await jiraDoDerive(issueKey, deriveTr.id, team.id, comment || DERIVE_COMMENT_DEFAULT);
            // marcação de uso (label + campo texto) agora acontece dentro do próprio jiraDoDerive

            // 1.4) Unassign best-effort (libera ticket pra fila do novo time)
            let unassignMsg = '';
            if(DERIVE_UNASSIGN_AFTER){
              try{
                await jiraUnassign(issueKey);
                unassignMsg = `\nAssignee removido (ticket liberado pra fila do novo time).`;
              }catch(e){
                console.warn('[jira-localidade][derive] unassign falhou (nao critico):', e);
                unassignMsg = `\n[!] Nao foi possivel remover seu nome como responsavel: ${e.message || e}`;
              }
            }

            // 1.5) Unwatch best-effort com retry (nao bloqueia se falhar)
            let unwatchMsg = '';
            let unwatchFlushLate = null;
            if(DERIVE_UNWATCH_AFTER){
              try{
                const me = await jiraGetMyself();
                const res = await jiraUnwatchIssueRobust(issueKey, me.accountId);
                unwatchFlushLate = res.flushLate || null;
                if(res.ok){
                  unwatchMsg = `\nVoce parou de acompanhar este ticket${res.attempts > 1 ? ` (${res.attempts} tentativa(s) por causa do auto-watch do Jira)` : ''}.`;
                } else {
                  unwatchMsg = `\n[!] Voce CONTINUA como watcher mesmo apos ${res.attempts} tentativa(s).\n` +
                    `O Jira esta re-adicionando voce automaticamente (configuracao pessoal "Autowatch").\n` +
                    `Solucao definitiva: acesse Perfil > Personal Settings > desmarque "Autowatch".`;
                }
              }catch(e){
                console.warn('[jira-localidade][derive] unwatch falhou (nao critico):', e);
                unwatchMsg = `\n[!] Falha ao remover watcher: ${e.message || e}`;
              }
            }

            // 2) Se o checkbox NAO estava marcado, finaliza so com toast + reload.
            if(!createIssTask){
              showDeriveSuccessToast(`Derivado para ${team.value}.${unassignMsg}${unwatchMsg}`);
              scheduleReloadAfterDerive({ flushLate: unwatchFlushLate });
              return;
            }

            // 3) Criar tarefa ISS vinculada
            try{
              const { newKey, linkType, attachmentsReport, commentsReport, descReport, template } = await createIssTaskFromIssue(issueKey, undefined, team?.value);
              const link = `${location.origin}/browse/${newKey}`;

              // Comentario interno no ticket ORIGINAL (best-effort)
              try{
                await addInternalComment(issueKey, `Tarefa de troubleshooting criada e vinculada: ${newKey} (${link}).`);
              }catch(e){
                console.warn('[jira-localidade] falha ao comentar no ticket original:', e);
              }

              // Detalhes vao pro console pra debug, toast mostra o essencial
              console.log('[jira-localidade][derive] sucesso:', {
                source: issueKey, target: team.value, newKey, linkType,
                attachmentsReport, commentsReport, descReport
              });

              const extras = [];
              if(attachmentsReport && attachmentsReport.copied > 0) extras.push(`${attachmentsReport.copied} anexo(s)`);
              if(commentsReport && commentsReport.copied > 0) extras.push(`${commentsReport.copied} comentario(s)`);
              const extrasTxt = extras.length ? ` (${extras.join(' + ')})` : '';
              const tmplLine = (template && template.source === 'rule' && template.ruleLabel)
                ? `\nTemplate: ${template.ruleLabel} (${template.key})`
                : '';

              // Auto-close: fecha sempre que ISS_TASK_AUTO_CLOSE=true
              // Só bloqueia se o conteúdo PRINCIPAL falhou (descrição ou comentários).
              // Erros de anexo não bloqueiam: são comuns por CDN/ADF e não afetam o troubleshoot.
              let autoCloseMsg = '';
              // Debug: sempre loga o estado do auto-close no console
              console.log(`[is-toolkit] auto-close: ISS_TASK_AUTO_CLOSE=${ISS_TASK_AUTO_CLOSE}, newKey=${newKey}`);
              if(ISS_TASK_AUTO_CLOSE){
                const hasDescFailure  = descReport?.method === 'failed';
                // Comentários e anexos NÃO bloqueiam — só a descrição é crítica
                if(commentsReport?.error) console.warn('[is-toolkit] auto-close: comentarios falharam (nao bloqueia):', commentsReport.error);
                if(attachmentsReport?.errors?.length) console.warn('[is-toolkit] auto-close: anexos falharam (nao bloqueia)');

                if(hasDescFailure){
                  autoCloseMsg = `\n[!] ISS NAO foi fechada (descricao nao copiada) — verifique manualmente.`;
                  console.warn('[is-toolkit] auto-close pulado: descricao falhou');
                } else {
                  try{
                    const closedTrName = await closeIssTaskAfterCreate(newKey);
                    autoCloseMsg = `\nISS fechada automaticamente (${closedTrName}).`;
                  }catch(eClose){
                    console.warn('[jira-localidade] auto-close falhou:', eClose);
                    const errMsg = String(eClose.message || eClose).slice(0, 200);
                  autoCloseMsg = `\n[!] Auto-close falhou: ${errMsg}`;
                  console.error('[is-toolkit] auto-close ERRO:', eClose);
                  }
                }
              }

              // Abre ISS em nova aba imediatamente (sem confirm bloqueante)
              window.open(link, '_blank', 'noopener');
              // Salva resultado no sessionStorage para mostrar APÓS o reload
              // (o reload acontece antes do toast sumir)
              try{
                sessionStorage.setItem('ist_autoclose_result', JSON.stringify({
                  issKey: newKey,
                  msg: autoCloseMsg || '\nISS fechada automaticamente.',
                  ok: !autoCloseMsg.includes('[!]'),
                  t: Date.now()
                }));
              }catch(_){}

              if(autoCloseMsg.includes('[!]')){
                showToast(`ISS ${newKey} criada${extrasTxt}.${autoCloseMsg}`, 'warn', 5000);
              } else {
                showDeriveSuccessToast(`Derivado + ISS ${newKey} criada${extrasTxt}.${autoCloseMsg}`);
              }
              scheduleReloadAfterDerive({ flushLate: unwatchFlushLate });
            }catch(e){
              // Cancelamento (usuario fechou o prompt de Service) - apenas finaliza derive ok
              if(String(e.message || '').includes('cancelada pelo usuario')){
                showDeriveSuccessToast(`Derivado para ${team.value}.${unassignMsg}${unwatchMsg}\nCriacao da ISS cancelada (categoria nao identificada).`);
                scheduleReloadAfterDerive({ flushLate: unwatchFlushLate });
                return;
              }
              // Erro real - alerta com modal pra nao perder a info
              console.error('[jira-localidade][derive] derive OK mas ISS falhou:', e);
              alert(`Derivado com sucesso, MAS falhou ao criar tarefa ISS:\n\n${e.message || e}\n\nVoce pode criar a tarefa manualmente ou tentar novamente.`);
              scheduleReloadAfterDerive({ flushLate: unwatchFlushLate });
            }
          }
        });
      }catch(e){
        alert('Falha ao abrir derivação: ' + (e.message || e));
      }
    }
    // =========================
    // CRIAR TAREFA ISS (chamado a partir do checkbox no Derive)
    //
    // Fluxo:
    //   1) GET /myself              -> accountId do responsavel
    //   2) GET issue (full)         -> description (ADF) + customfield Asset (raw)
    //   3) (opcional) descobre link type pelo inward "vinculad"
    //   4) POST /rest/api/3/issue   -> cria a Tarefa no projeto ISS
    //   5) POST /rest/api/3/issueLink -> liga "new IS_LINKED_BY currentTicket"
    //
    // Todos os valores fixos sao configuraveis via Configuracoes -> "Criar tarefa ISS".
    // =========================

    async function jiraGetMyself(){
      const r = await fetch(`${location.origin}/rest/api/3/myself`, {
        credentials:'same-origin', headers:{ Accept:'application/json' }
      });
      const txt = await r.text().catch(()=> '');
      if(!r.ok) throw new Error(`HTTP ${r.status} /myself: ${txt.slice(0,200)}`);
      return JSON.parse(txt);
    }

    // Substitui o placeholder {meu_nome} pelo nome de quem esta logado (via /myself),
    // pra templates de comentario (ASSIGN_COMMENT, STATUS_ACTIONS) nao precisarem de um
    // nome fixo hardcoded — cada analista que usar o mesmo template assina com o proprio nome.
    function _applyMyNamePlaceholder(text, me){
      if(!text) return text;
      const name = me?.displayName || '';
      return text.replace(/\{meu_nome\}/gi, name);
    }

    async function getIssueFullForCopy(issueKey){
      // Pega description (ADF), priority (para manter), asset (raw) e anexos.
      const url = `${location.origin}/rest/api/3/issue/${issueKey}?fields=description,priority,attachment,customfield_${CF_ASSET}`;
      const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
      const txt = await r.text().catch(()=> '');
      if(!r.ok) throw new Error(`HTTP ${r.status} ao ler ticket origem: ${txt.slice(0,200)}`);
      return JSON.parse(txt);
    }

    // Le project e descobre os IDs (project ID e o ID do issuetype pelo nome).
    // A UI do Jira sempre manda IDs no payload, e o validador "matriz" exige IDs - nao aceita keys/names.
    async function getProjectAndIssueTypeIds(projectKey, issuetypeName){
      const r = await fetch(`${location.origin}/rest/api/3/project/${encodeURIComponent(projectKey)}`, {
        credentials:'same-origin', headers:{ Accept:'application/json' }
      });
      const txt = await r.text().catch(()=> '');
      if(!r.ok) throw new Error(`HTTP ${r.status} ao ler projeto ${projectKey}: ${txt.slice(0,200)}`);
      const d = JSON.parse(txt);
      const its = d?.issueTypes || [];
      const it = its.find(t => t.name === issuetypeName);
      if(!it) throw new Error(`Issue type "${issuetypeName}" nao existe em ${projectKey}. Vistos: ${its.map(t=>t.name).join(', ')}`);
      return { projectId: String(d.id), issuetypeId: String(it.id) };
    }

    // Le campos custom RAW de uma issue modelo (para herdar formato exato de Demanda/Service/etc).
    async function getIssueRawFields(issueKey, cfIds){
      const fieldsParam = cfIds.map(id => `customfield_${id}`).join(',');
      const url = `${location.origin}/rest/api/3/issue/${issueKey}?fields=${fieldsParam}`;
      const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
      const txt = await r.text().catch(()=> '');
      if(!r.ok) throw new Error(`HTTP ${r.status} ao ler issue modelo ${issueKey}: ${txt.slice(0,200)}`);
      const data = JSON.parse(txt);
      return data.fields || {};
    }

    // Le TODOS os campos da issue modelo (para copiar TODOS os customfields preenchidos).
    // Inclui expand=names para sabermos o nome humano e podermos filtrar campos como Sprint/Epic Link
    // que nao podem ser setados via REST direta.
    async function getIssueAllFields(issueKey){
      const url = `${location.origin}/rest/api/3/issue/${issueKey}?fields=*all&expand=names`;
      const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
      const txt = await r.text().catch(()=> '');
      if(!r.ok) throw new Error(`HTTP ${r.status} ao ler issue modelo ${issueKey} (full): ${txt.slice(0,200)}`);
      return JSON.parse(txt);
    }

    // Retorna o "schema" de campos disponiveis na tela de criacao de um project/issuetype.
    // Tenta a API nova (paginada) e cai na API legacy. Retorna { fieldKey: meta } ou null.
    async function getCreateMetaFields(projectKey, issuetypeName){
      const log = (msg, ...args) => console.log(`[jira-localidade][createmeta] ${msg}`, ...args);
      const warn = (msg, ...args) => console.warn(`[jira-localidade][createmeta] ${msg}`, ...args);

      // 1) Nova API com paginacao: lista os issuetypes do projeto (procura por nome).
      let issueTypeId = null;
      try{
        let startAt = 0;
        const pageSize = 50;
        while(true){
          const u = `${location.origin}/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes?startAt=${startAt}&maxResults=${pageSize}`;
          const r = await fetch(u, { credentials:'same-origin', headers:{ Accept:'application/json' }});
          if(!r.ok){ warn(`(novo) issuetypes HTTP ${r.status} em startAt=${startAt}`); break; }
          const d = await r.json();
          const list = d?.values || d?.issueTypes || [];
          log(`(novo) issuetypes pagina startAt=${startAt} -> ${list.length} itens (total=${d?.total ?? '?'}, isLast=${d?.isLast ?? '?'})`);
          const it = list.find(v => v.name === issuetypeName);
          if(it){ issueTypeId = it.id; log(`(novo) achou "${issuetypeName}" id=${it.id}`); break; }
          if(d?.isLast || list.length < pageSize) break;
          startAt += pageSize;
          if(startAt > 1000) break; // sanity
        }
      }catch(e){ warn('(novo) erro listando issuetypes:', e); }

      if(issueTypeId){
        try{
          const out = {};
          let startAt = 0;
          const pageSize = 100;
          while(true){
            const u = `${location.origin}/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes/${issueTypeId}?startAt=${startAt}&maxResults=${pageSize}`;
            const r = await fetch(u, { credentials:'same-origin', headers:{ Accept:'application/json' }});
            if(!r.ok){ warn(`(novo) fields HTTP ${r.status} em startAt=${startAt}`); break; }
            const d = await r.json();
            const list = d?.values || d?.fields || [];
            log(`(novo) fields pagina startAt=${startAt} -> ${list.length} itens (total=${d?.total ?? '?'}, isLast=${d?.isLast ?? '?'})`);
            for(const f of list){ if(f.fieldId) out[f.fieldId] = f; }
            if(d?.isLast || list.length < pageSize) break;
            startAt += pageSize;
            if(startAt > 5000) break;
          }
          if(Object.keys(out).length){
            log(`(novo) total ${Object.keys(out).length} campos para ${projectKey}/${issuetypeName}`);
            return out;
          }
          warn(`(novo) 0 campos retornados para issuetypeId=${issueTypeId}`);
        }catch(e){ warn('(novo) erro listando fields:', e); }
      }

      // 2) API legacy
      try{
        const url = `${location.origin}/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(projectKey)}&issuetypeNames=${encodeURIComponent(issuetypeName)}&expand=projects.issuetypes.fields`;
        const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
        if(!r.ok){ warn(`(legacy) HTTP ${r.status}`); return null; }
        const d = await r.json();
        const fields = ((d?.projects || [])[0]?.issuetypes || [])[0]?.fields || {};
        if(Object.keys(fields).length){
          log(`(legacy) total ${Object.keys(fields).length} campos`);
          return fields;
        }
        warn('(legacy) 0 campos. Raw:', d);
      }catch(e){ warn('(legacy) erro:', e); }

      return null;
    }

    // Helper: detecta valor "vazio na pratica" mesmo que tenha shape (ADF vazio, objeto sem keys etc.).
    function isEmptyForCopy(v){
      if(v == null) return true;
      if(Array.isArray(v)){
        if(!v.length) return true;
        return v.every(isEmptyForCopy);
      }
      if(typeof v === 'string') return v.trim() === '';
      if(typeof v === 'object'){
        if(isAdfDoc(v)){
          let text = '';
          const walk = (n) => {
            if(!n) return;
            if(Array.isArray(n)) return n.forEach(walk);
            if(typeof n === 'object'){
              if(n.type === 'text' && typeof n.text === 'string') text += n.text;
              if(n.content) walk(n.content);
            }
          };
          walk(v.content);
          return text.trim() === '';
        }
        if(!Object.keys(v).length) return true;
        // Objetos shape-only (so meta keys/values vazios)
        const meaningful = ['value','id','accountId','objectId','workspaceId','name','groupId','key'];
        const hasMeaningful = meaningful.some(k => v[k] != null && v[k] !== '');
        if(!hasMeaningful){
          // verifica se algum sub-valor tem conteudo
          return Object.values(v).every(isEmptyForCopy);
        }
      }
      return false;
    }

    // Customfields que tipicamente NAO podem ser copiados via API REST de create
    // (sao gerenciados por Jira/plugins e exigem chamadas especiais).
    const CF_NAME_SKIP_PATTERNS = [
      /\bsprint\b/i,
      /\bepic\s*link\b/i,
      /\bparent\s*link\b/i,
      /\brank\b/i,
      /\bflagged\b/i,
      /\bstart\s*date\b/i,
      /\bteam\b.*\bfield\b/i,
      /\brequest\s*type\b/i,
      /\bdevelopment\b/i,
      /\bissue\s*color\b/i,
      /^satisfaction/i,
      /^impacted services$/i,
      /^affected services$/i
    ];

    function shouldCopyCustomField(cfKey, cfName){
      if(!cfKey || !cfKey.startsWith('customfield_')) return false;
      if(!cfName) return true;
      return !CF_NAME_SKIP_PATTERNS.some(rx => rx.test(cfName));
    }

    // Detecta um documento ADF (Atlassian Document Format) usado em campos rich-text.
    function isAdfDoc(v){
      return v && typeof v === 'object' && v.type === 'doc' && Array.isArray(v.content);
    }

    function emptyAdfDoc(version){
      return { type: 'doc', version: version || 1, content: [{ type: 'paragraph' }] };
    }

    // Extrai TODO o texto util de um ADF, perdendo formato/elementos rich (mentions, panels, links, etc).
    // Usado para "achatar" a descricao quando o plugin custom rejeita ADF complexo.
    function adfToPlainText(adf){
      if(!adf) return '';
      const lines = [];
      let cur = '';
      const flushPara = () => { if(cur.trim()) lines.push(cur.trim()); cur = ''; };
      const walk = (n) => {
        if(!n) return;
        if(Array.isArray(n)) return n.forEach(walk);
        if(typeof n !== 'object') return;
        const t = n.type;
        if(t === 'text' && typeof n.text === 'string'){ cur += n.text; return; }
        if(t === 'hardBreak'){ cur += '\n'; return; }
        if(t === 'mention'){ cur += `@${n.attrs?.text || n.attrs?.displayName || n.attrs?.id || ''} `; return; }
        if(t === 'emoji'){ cur += (n.attrs?.shortName || n.attrs?.text || ''); return; }
        if(t === 'inlineCard' || t === 'blockCard'){ cur += (n.attrs?.url || ''); return; }
        if(t === 'paragraph' || t === 'heading' || t === 'blockquote' || t === 'panel' ||
           t === 'codeBlock'  || t === 'listItem' || t === 'taskItem'){
          if(n.content) walk(n.content);
          flushPara();
          return;
        }
        if(n.content) walk(n.content);
      };
      walk(adf.content || adf);
      flushPara();
      return lines.join('\n\n');
    }

    // Converte texto puro em um ADF simples (so paragraphs e textos). Bem aceito por validadores estritos.
    function plainTextToSimpleAdf(text){
      const t = String(text || '').trim();
      if(!t) return { version:1, type:'doc', content:[{ type:'paragraph' }]};
      const paras = t.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
      return {
        version: 1,
        type: 'doc',
        content: paras.map(p => ({
          type: 'paragraph',
          content: [{ type: 'text', text: p }]
        }))
      };
    }

    const META_KEYS_TO_STRIP = new Set([
      'self', 'iconUrl', 'iconURI', 'avatarUrls', 'expand',
      'displayName', 'emailAddress', 'active', 'timeZone', 'accountType',
      'description', 'subtaskField'
    ]);

    // Sanitiza um valor RAW de customfield (vindo de GET) para uso em payload de criacao.
    // Funciona para: ADF rich-text, Asset/Insight, User, Group, Select/Multi/Cascading,
    // e tipos desconhecidos (limpa apenas metadados).
    function sanitizeCustomFieldValue(v){
      if(v == null) return v;
      if(Array.isArray(v)) return v.map(sanitizeCustomFieldValue);
      if(typeof v !== 'object') return v;

      // 1) ADF rich-text: preserva integral. Validadores customizados costumam
      //    exigir conteudo de verdade, nao apenas estrutura ADF valida. Usuario pode
      //    editar/limpar manualmente apos a criacao.
      if(isAdfDoc(v)){
        return v;
      }

      // 2) Asset / Insight object (IS Ubicacion etc.)
      if(v.workspaceId || v.objectId){
        const out = {};
        if(v.workspaceId) out.workspaceId = v.workspaceId;
        if(v.id)          out.id          = String(v.id);
        if(v.objectId)    out.objectId    = String(v.objectId);
        return out;
      }

      // 3) User picker (atlassian)
      if(v.accountId){
        return { accountId: v.accountId };
      }

      // 4) Group picker
      if(v.groupId){
        const out = {};
        if(v.name)    out.name    = v.name;
        out.groupId = v.groupId;
        return out;
      }

      // 5) Select / Multi-select / Cascading
      if(v.value !== undefined || v.child !== undefined || v.id !== undefined){
        const out = {};
        if(v.id !== undefined && v.id !== null)       out.id    = String(v.id);
        if(v.value !== undefined && v.value !== null) out.value = v.value;
        if(v.child)                                   out.child = sanitizeCustomFieldValue(v.child);
        return out;
      }

      // 6) Default: strip meta keys e recursa
      const out = {};
      for(const [k, val] of Object.entries(v)){
        if(META_KEYS_TO_STRIP.has(k)) continue;
        const cleaned = sanitizeCustomFieldValue(val);
        if(cleaned !== undefined) out[k] = cleaned;
      }
      return out;
    }

    // Alias para nao quebrar chamadas existentes
    const sanitizeSelectValue = sanitizeCustomFieldValue;

    // Copia anexos do srcKey para o dstKey. Best-effort: anota erros e continua.
    async function copyAttachmentsBetweenIssues(srcKey, attachments, dstKey){
      if(!Array.isArray(attachments) || !attachments.length) return { copied:0, total:0, errors:[] };
      let copied = 0;
      const errors = [];
      for(const att of attachments){
        const name = att?.filename || 'attachment';
        try{
          const fileResp = await fetch(att.content, { credentials:'same-origin' });
          if(!fileResp.ok) throw new Error(`HTTP ${fileResp.status} no download`);
          const blob = await fileResp.blob();

          const fd = new FormData();
          fd.append('file', blob, name);

          const up = await fetch(`${location.origin}/rest/api/3/issue/${dstKey}/attachments`, {
            method:'POST',
            credentials:'same-origin',
            headers:{ 'X-Atlassian-Token':'no-check', 'Accept':'application/json' },
            body: fd
          });
          if(!up.ok){
            const t = await up.text().catch(()=>'');
            throw new Error(`HTTP ${up.status} no upload: ${t.slice(0,200)}`);
          }
          copied++;
        }catch(e){
          console.warn(`[jira-localidade] anexo "${name}" nao copiado:`, e);
          errors.push(`${name}: ${e.message || e}`);
        }
      }
      return { copied, total: attachments.length, errors };
    }

    async function listJiraLinkTypes(){
      const r = await fetch(`${location.origin}/rest/api/3/issueLinkType`, {
        credentials:'same-origin', headers:{ Accept:'application/json' }
      });
      const txt = await r.text().catch(()=> '');
      if(!r.ok) throw new Error(`HTTP ${r.status} issueLinkType: ${txt.slice(0,200)}`);
      return JSON.parse(txt);
    }

    // Resolve o nome do link type a usar. Prefere o configurado; senao auto-descobre
    // pelo inward label que contem "vinculad" (cobre "e vinculado pelo", "vinculado por", etc).
    async function resolveIssTaskLinkTypeName(){
      if(ISS_TASK_LINK_TYPE_NAME) return ISS_TASK_LINK_TYPE_NAME;
      const data = await listJiraLinkTypes();
      const types = data.issueLinkTypes || [];
      const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      const byInward = types.find(t => norm(t.inward).includes('vinculad'));
      if(byInward) return byInward.name;
      const byOutward = types.find(t => norm(t.outward).includes('vincul'));
      if(byOutward) return byOutward.name;
      throw new Error('Nao foi possivel auto-descobrir o tipo de link "vinculado pelo". Configure em Configuracoes -> "Criar tarefa ISS" -> "Nome do link type".');
    }

    async function jiraCreateIssue(payload){
      // IMPORTANTE: usar os mesmos query params da UI do Jira.
      // - updateHistory=true: registra no recent
      // - applyDefaultValues=false: NAO aplica defaults do screen config (evita validadores
      //   custom como o "matriz" que retornam "All fields are required to create the task").
      // *** CORRECAO: applyDefaultValues=false removido (respeita validators do Jira) ***
      const url = `${location.origin}/rest/api/3/issue?updateHistory=true`;
      const bodyStr = JSON.stringify(payload);
      const r = await fetch(url, {
        method:'POST',
        credentials:'same-origin',
        headers:{ 'Accept':'application/json', 'Content-Type':'application/json' },
        body: bodyStr
      });
      const txt = await r.text().catch(()=> '');
      if(!r.ok){
        // Diagnostico forte: salva payload e response em window e tenta copiar pro clipboard.
        try{
          window.__JL_LAST_PAYLOAD__  = payload;
          window.__JL_LAST_RESPONSE__ = txt;
          if(navigator?.clipboard?.writeText){
            await navigator.clipboard.writeText(bodyStr).catch(()=>{});
          }
        }catch(_){}
        console.error('[jira-localidade] CREATE FALHOU. Payload completo abaixo (copiado para o clipboard):');
        console.error(bodyStr);
        console.error('[jira-localidade] RESPONSE:', txt);
        const err = new Error(`HTTP ${r.status} ao criar issue: ${txt.slice(0,400)}`);
        err.payload  = payload;
        err.response = txt;
        throw err;
      }
      return JSON.parse(txt);
    }

    // Atualiza apenas a description de uma issue ja criada. Validadores custom
    // tipicamente nao rodam em PUT (so no create), entao podemos "enriquecer" a descricao depois.
    async function jiraUpdateDescription(issueKey, adfDoc){
      const url = `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}`;
      const r = await fetch(url, {
        method:'PUT',
        credentials:'same-origin',
        headers:{ 'Accept':'application/json', 'Content-Type':'application/json' },
        body: JSON.stringify({ fields: { description: adfDoc } })
      });
      if(!r.ok){
        const t = await r.text().catch(()=>'');
        throw new Error(`HTTP ${r.status} ao atualizar description: ${t.slice(0,200)}`);
      }
      return true;
    }

    // Adiciona um comentario a uma issue. Usado como ultimo recurso para preservar a description original.
    // opts.internal=true marca o comentario como observacao interna (sd.public.comment).
    async function jiraAddComment(issueKey, adfDoc, opts){
      const url = `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`;
      const body = { body: adfDoc };
      if(opts && opts.internal){
        body.properties = [{ key: 'sd.public.comment', value: { internal: true } }];
      }
      const r = await fetch(url, {
        method:'POST',
        credentials:'same-origin',
        headers:{ 'Accept':'application/json', 'Content-Type':'application/json' },
        body: JSON.stringify(body)
      });
      if(!r.ok){
        const t = await r.text().catch(()=>'');
        throw new Error(`HTTP ${r.status} ao adicionar comment: ${t.slice(0,200)}`);
      }
      return true;
    }

    // Pagina todos os comentarios de uma issue. Endpoint: /rest/api/3/issue/{key}/comment
    // Retorna array de { id, author, body (ADF), created, jsdPublic }.
    // Ordena cronologicamente (mais antigo primeiro) pra preservar a leitura natural.
    async function getAllIssueComments(issueKey){
      const all = [];
      const PAGE = 100;
      let startAt = 0;
      // Salvaguarda: maximo 20 paginas (= 2000 comments) pra nao travar
      for(let page = 0; page < 20; page++){
        const url = `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?startAt=${startAt}&maxResults=${PAGE}&orderBy=created`;
        const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' }});
        const txt = await r.text().catch(()=>'');
        if(!r.ok) throw new Error(`HTTP ${r.status} ao ler comments: ${txt.slice(0,200)}`);
        const j = JSON.parse(txt);
        const arr = Array.isArray(j.comments) ? j.comments : [];
        all.push(...arr);
        const total = Number(j.total) || all.length;
        startAt += arr.length;
        if(arr.length < PAGE || startAt >= total) break;
      }
      return all;
    }

    // Edita (substitui o texto de) um comentário existente via API. Preserva a visibilidade.
    async function jiraEditComment(issueKey, commentId, adfDoc){
      const url = `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment/${encodeURIComponent(commentId)}`;
      const r = await fetch(url, {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Accept':'application/json', 'Content-Type':'application/json' },
        body: JSON.stringify({ body: adfDoc })
      });
      if(!r.ok){
        const t = await r.text().catch(()=> '');
        throw new Error(`HTTP ${r.status} ao editar comment: ${t.slice(0,200)}`);
      }
      return true;
    }

    // Localiza o comentário real do Jira a partir de uma "revisão" da auditoria
    // (que traz author + date + excerpt). Casa por autor+data e, como fallback, por excerpt.
    async function _auditFindComment(issueKey, review){
      const comments = await getAllIssueComments(issueKey);
      const rAuthor = String(review?.author || '').trim();
      const rDate = String(review?.date || '').trim().slice(0,16);
      let hit = comments.find(c =>
        (c.author?.displayName || '').trim() === rAuthor &&
        String(c.created || '').slice(0,16).replace('T',' ') === rDate);
      if(!hit && review?.excerpt){
        const ex = String(review.excerpt).replace(/\.\.\.$/,'').trim().slice(0,40).toLowerCase();
        if(ex) hit = comments.find(c => _adfToText(c.body, 300).toLowerCase().includes(ex));
      }
      return hit || null;
    }

    // Extrai os blocos de mídia (imagens) de um ADF, para preservá-los ao reescrever o texto.
    function _collectMediaBlocks(adf){
      const out = [];
      const walk = n => {
        if(!n || typeof n !== 'object') return;
        if(n.type === 'mediaSingle' || n.type === 'mediaGroup'){ out.push(n); return; }
        if(Array.isArray(n.content)) n.content.forEach(walk);
      };
      if(adf) walk(adf);
      return out;
    }

    // Abre uma área de revisão com o texto novo. Ao salvar, substitui SÓ o texto do
    // comentário (via API), mantendo as imagens existentes. Não salva nada até o usuário confirmar.
    function _auditShowReplacePreview(issueKey, comment, newText){
      document.getElementById('ml_cr_replace_ov')?.remove();
      const hasImg = (() => { try{ return _extractAttachmentIdsFromAdf(comment.body).size > 0; }catch(_){ return false; } })();
      const when = String(comment.created || '').slice(0,16).replace('T',' ');
      const ov = document.createElement('div');
      ov.id = 'ml_cr_replace_ov';
      ov.style.cssText = 'position:fixed;inset:0;z-index:2147483610;background:rgba(4,6,12,.6);display:flex;align-items:center;justify-content:center;padding:20px;';
      const box = document.createElement('div');
      box.style.cssText = 'background:var(--ml-bg-3,#161a26);color:var(--ml-text,#e6ecf6);border:1px solid var(--ml-border-2,#2a3550);border-radius:14px;width:min(620px,95vw);max-height:85vh;overflow:auto;padding:16px 18px;font-family:var(--ml-font,-apple-system,BlinkMacSystemFont,sans-serif);box-shadow:0 20px 60px rgba(0,0,0,.6);';
      box.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div style="font-weight:700;font-size:14px;">Revisar substituição do comentário</div>
          <button id="ml_cr_rp_x" style="background:none;border:none;color:var(--ml-text-dim);font-size:18px;cursor:pointer;line-height:1;">×</button>
        </div>
        <div style="font-size:12px;color:var(--ml-text-dim);margin-bottom:10px;line-height:1.5;">Revise/edite o texto abaixo. Ao salvar, substitui <b>só o texto</b> do comentário de ${esc(comment.author?.displayName || '?')} · ${esc(when)}.${hasImg ? ' <b>As imagens serão mantidas.</b>' : ''}</div>
        <textarea id="ml_cr_rp_text" style="width:100%;min-height:190px;background:var(--ml-bg-0,#0b0e15);color:var(--ml-text);border:1px solid var(--ml-border-2,#2a3550);border-radius:8px;padding:10px 12px;font:13px var(--ml-font,-apple-system,sans-serif);line-height:1.6;resize:vertical;outline:none;box-sizing:border-box;">${esc(newText)}</textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
          <button id="ml_cr_rp_cancel" style="font-size:12px;background:none;border:1px solid var(--ml-border-2,#2a3550);border-radius:6px;padding:6px 12px;cursor:pointer;color:var(--ml-text-dim);">Cancelar</button>
          <button id="ml_cr_rp_save" style="font-size:12px;background:#60a5fa;border:none;border-radius:6px;padding:6px 14px;cursor:pointer;color:#04121f;font-weight:700;">Salvar no comentário</button>
        </div>`;
      ov.appendChild(box);
      document.body.appendChild(ov);
      const close = () => ov.remove();
      box.querySelector('#ml_cr_rp_x').onclick = close;
      box.querySelector('#ml_cr_rp_cancel').onclick = close;
      ov.addEventListener('click', e => { if(e.target === ov) close(); });
      box.querySelector('#ml_cr_rp_text').focus();
      box.querySelector('#ml_cr_rp_save').onclick = async function(){
        const btn = this;
        const txt = box.querySelector('#ml_cr_rp_text').value.trim();
        if(!txt){ showToast('Texto vazio.', 'warn', 3000); return; }
        btn.disabled = true; btn.textContent = 'Salvando…';
        try{
          const base = textToAdfParagraphs(txt);
          const media = _collectMediaBlocks(comment.body);
          if(media.length) base.content = (base.content || []).concat(media);
          await jiraEditComment(issueKey, comment.id, base);
          close();
          showToast('Comentário atualizado no Jira.', 'success', 3000);
        }catch(e){
          btn.disabled = false; btn.textContent = 'Salvar no comentário';
          showToast('Erro ao salvar: ' + (e.message || e), 'error', 5000);
        }
      };
    }

    // Formata data ISO para "DD/MM/YYYY HH:MM" no fuso local.
    function _formatCommentDate(iso){
      try{
        const d = new Date(iso);
        if(isNaN(d.getTime())) return String(iso || '');
        const dd = String(d.getDate()).padStart(2,'0');
        const mm = String(d.getMonth()+1).padStart(2,'0');
        const yyyy = d.getFullYear();
        const hh = String(d.getHours()).padStart(2,'0');
        const mi = String(d.getMinutes()).padStart(2,'0');
        return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
      }catch{ return String(iso || ''); }
    }

    // Varre um nodo ADF (recursivamente) e devolve a lista de IDs de anexos
    // referenciados via 'media' / 'mediaSingle' / 'mediaInline' (anexos colados/embutidos no comentario).
    function _extractAttachmentIdsFromAdf(node, out){
      out = out || new Set();
      if(!node || typeof node !== 'object') return out;
      if((node.type === 'media' || node.type === 'mediaSingle' || node.type === 'mediaInline')){
        const id = node.attrs?.id;
        if(id) out.add(String(id));
      }
      if(Array.isArray(node.content)){
        node.content.forEach(c => _extractAttachmentIdsFromAdf(c, out));
      }
      return out;
    }

    // Monta UM documento ADF que contem o digest de todos os comentarios.
    // Formato (compacto e legivel):
    //
    //   Heading h3: "Comentarios herdados de IS-XXX (N total)"
    //   Para cada comment:
    //     Heading h4: "[i] @autor - DD/MM/YYYY HH:MM [interno/publico]"
    //     Parágrafo: <texto extraido do ADF original>
    //     Parágrafo: "📎 Anexos referenciados: file1.png, file2.jpg" (se houver)
    //     Rule (separador)
    //   Heading h4 final: "Fim dos comentarios herdados."
    //
    // `attachments` (opcional): lista do source pra resolver IDs em nomes de arquivo.
    function buildCommentsDigestAdf(srcKey, comments, attachments){
      const content = [];
      const attMap = new Map();
      (attachments || []).forEach(a => { if(a && a.id) attMap.set(String(a.id), a.filename || `anexo-${a.id}`); });

      const headerText = `Comentarios herdados de ${srcKey} (${comments.length} ${comments.length === 1 ? 'comentario' : 'comentarios'})`;
      content.push({
        type: 'heading', attrs: { level: 3 },
        content: [{ type: 'text', text: headerText }]
      });

      if(!comments.length){
        content.push({ type: 'paragraph', content: [{ type: 'text', text: '(nenhum comentario no ticket origem)' }] });
        return { type: 'doc', version: 1, content };
      }

      comments.forEach((c, idx) => {
        const author = c?.author?.displayName || c?.author?.emailAddress || 'desconhecido';
        const when = _formatCommentDate(c?.created);
        // jsdPublic: true = publico (visivel cliente); false = interno
        const visibility = (c?.jsdPublic === false) ? 'interno' : 'publico';
        const headerLine = `${author}  ·  ${when}  ·  ${visibility === "interno" ? "obs interna" : "publico"}`;

        content.push({
          type: 'heading', attrs: { level: 4 },
          content: [{ type: 'text', text: headerLine }]
        });

        // Copia o ADF original do comentário — preserva formatação (tabelas, negrito,
        // listas, código, etc.) exatamente como aparece no ticket de origem.
        // Imagens embutidas (media nodes) podem não renderizar na ISS (CDN/contexto diferente),
        // mas todo o restante da formatação é mantido fielmente.
        if(c?.body && c.body.type === 'doc' && Array.isArray(c.body.content) && c.body.content.length){
          c.body.content.forEach(b => content.push(b));
        } else {
          // Fallback para texto plano se o body não for ADF válido
          const bodyText = descriptionToText(c?.body) || '(sem conteudo)';
          const bodyAdf = textToAdfParagraphs(bodyText);
          (bodyAdf?.content || []).forEach(b => content.push(b));
        }

        content.push({ type: 'rule' });
      });

      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: 'Fim dos comentarios herdados.' }]
      });

      return { type: 'doc', version: 1, content };
    }

    // Coleta os comentarios do source e os adiciona como UM unico comentario INTERNO
    // no destino. Best-effort: retorna o relatorio sem lancar excecao em caso de falha.
    // `attachments` (opcional): lista de anexos do source pra resolver os ids
    // referenciados nos comentarios em nomes legiveis.
    async function copyCommentsAsDigest(srcKey, dstKey, attachments){
      const report = { copied: 0, total: 0, mode: 'digest', error: null };
      try{
        const comments = await getAllIssueComments(srcKey);
        report.total = comments.length;
        if(!comments.length){
          report.mode = 'skipped-empty';
          return report;
        }
        const adf = buildCommentsDigestAdf(srcKey, comments, attachments);
        await jiraAddComment(dstKey, adf, { internal: true });
        report.copied = comments.length;
        return report;
      }catch(e){
        report.error = String(e.message || e);
        return report;
      }
    }

    async function jiraCreateLink(typeName, inwardKey, outwardKey){
      const r = await fetch(`${location.origin}/rest/api/3/issueLink`, {
        method:'POST',
        credentials:'same-origin',
        headers:{ 'Accept':'application/json', 'Content-Type':'application/json' },
        body: JSON.stringify({
          type: { name: typeName },
          inwardIssue:  { key: inwardKey },
          outwardIssue: { key: outwardKey }
        })
      });
      const txt = await r.text().catch(()=> '');
      if(!r.ok) throw new Error(`HTTP ${r.status} ao linkar: ${txt.slice(0,300)}`);
      return true;
    }

    // Orquestra a criacao completa da tarefa ISS a partir de um ticket de origem.
    // Retorna { newKey, linkType, attachmentsReport } em caso de sucesso. Lanca em caso de erro.
    // onProgress(stage:string) opcional para feedback de UI.
    // Resolve qual configuracao usar pra criar a tarefa ISS, baseado nas regras Confluence.
    // Cada regra pode definir:
    //   - issTemplate: 'ISS-XXXX' (template-based: copia Demanda, Service, ResTeam do ticket)
    //   - issService:  'Nome do Service' (value-based: usa essa string direto, mais simples)
    //   - issDemanda:  'Nome da Demanda' (opcional, default = ISS_TASK_DEMANDA_VALUE)
    //   - issResolutionTeam: 'IS-SHIP-...' (opcional, default = ISS_TASK_RESOLUTION_TEAM)
    //
    // Primeira regra que matchar E tiver alguma config ISS vence. Se nenhuma matchar,
    // PERGUNTA pro usuario qual Service usar (lista os Services conhecidos das regras).
    //
    // Retorna: { templateKey, overrides: { service?, demanda?, resTeam? }, source, rule }
    async function _resolveEffectiveIssConfig(sourceIssueKey, destTeam){
      // Prioridade maxima: override por time de destino. Se estamos derivando pra um
      // time com override configurado (ex: IS-PRINTERS -> Service "Impresora"), usa
      // esses valores direto (value-based) e nem consulta regras Confluence nem pergunta.
      const teamKey = String(destTeam || '').trim();
      if(teamKey && ISS_TASK_TEAM_OVERRIDES && ISS_TASK_TEAM_OVERRIDES[teamKey]){
        const o = ISS_TASK_TEAM_OVERRIDES[teamKey] || {};
        const overrides = {};
        if(o.service) overrides.service = String(o.service).trim();
        if(o.demanda) overrides.demanda = String(o.demanda).trim();
        if(o.resTeam) overrides.resTeam = String(o.resTeam).trim();
        console.log(`[jira-localidade][iss-config] team-override "${teamKey}" -> service="${overrides.service || '?'}"`);
        return { templateKey: null, overrides, source: 'team-override', rule: null };
      }
      try{
        const rules = Array.isArray(CONFLUENCE_RULES) ? CONFLUENCE_RULES : [];
        const relevantRules = rules.filter(r => r && (r.issTemplate || r.issService || r.issDemanda || r.issResolutionTeam));
        if(!relevantRules.length){
          return { templateKey: ISS_TASK_MODEL_ISSUE, overrides: {}, source: 'default', rule: null };
        }
        // IMPORTANTE: forceRefresh=true pra garantir dados FRESCOS do ticket no momento
        // da criacao. Se o usuario mudou o Object Type recentemente, queremos ler o estado
        // atual pra mapear pro Service correto (nao usar o cache stale do chip).
        const issueData = await _confGetIssueData(sourceIssueKey, { forceRefresh: true });
        if(!issueData){
          console.log(`[jira-localidade][iss-config] sem dados de ${sourceIssueKey}, usando default`);
          return { templateKey: ISS_TASK_MODEL_ISSUE, overrides: {}, source: 'default-fallback', rule: null };
        }
        for(const r of relevantRules){
          if(_confRuleMatches(r, issueData, false)){
            const overrides = {};
            if(r.issService) overrides.service = String(r.issService).trim();
            if(r.issDemanda) overrides.demanda = String(r.issDemanda).trim();
            if(r.issResolutionTeam) overrides.resTeam = String(r.issResolutionTeam).trim();
            // Se a regra tem issTemplate, usa template-based (mais robusto).
            // Senao, usa value-based (e ignora template default tambem -- o overrides
            // ja contem o Service especifico dessa categoria).
            const templateKey = r.issTemplate ? r.issTemplate : null;
            console.log(`[jira-localidade][iss-config] match "${r.label}" -> ${templateKey ? `template=${templateKey}` : `service="${overrides.service || '?'}"`}`);
            return { templateKey, overrides, source: 'rule', rule: r };
          }
        }
        // Nenhuma regra casou. Pergunta ao usuario qual Service usar.
        console.log(`[jira-localidade][iss-config] nenhuma regra casou em ${sourceIssueKey}, perguntando ao usuario`);
        const chosen = await _askUserForIssService(sourceIssueKey, relevantRules);
        if(chosen === null){
          throw new Error('Criacao de ISS cancelada pelo usuario.');
        }
        return {
          templateKey: null, // sempre value-based quando vem do prompt (mais simples)
          overrides: { service: chosen },
          source: 'user-prompt',
          rule: null
        };
      }catch(e){
        // Erros de cancelamento devem propagar; outros caem no default
        if(String(e.message || '').includes('cancelada pelo usuario')) throw e;
        console.warn('[jira-localidade][iss-config] erro resolvendo config, usando default:', e);
        return { templateKey: ISS_TASK_MODEL_ISSUE, overrides: {}, source: 'default-error', rule: null };
      }
    }

    // Modal sincrono (Promise) pedindo ao usuario qual Service usar quando o plugin
    // nao consegue identificar a categoria automaticamente. Lista os Services unicos
    // que aparecem nas regras CONFLUENCE_RULES como sugestao, mas tambem permite digitar.
    function _askUserForIssService(sourceIssueKey, rules){
      return new Promise((resolve) => {
        // Coleta Services unicos das regras pra sugerir
        const knownServices = [...new Set(
          rules.map(r => r.issService).filter(Boolean)
        )].sort();

        document.getElementById('ml_iss_svc_overlay')?.remove();
        document.getElementById('ml_iss_svc_modal')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'ml_iss_svc_overlay';
        overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483640;backdrop-filter:blur(2px);`;

        const modal = document.createElement('div');
        modal.id = 'ml_iss_svc_modal';
        modal.style.cssText = `
          position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
          z-index:2147483641;
          background: var(--ml-bg, #161a26); color: var(--ml-text, #e6e9ef);
          border:1px solid var(--ml-border, #2a2f40); border-radius:12px;
          padding:22px; min-width:420px; max-width:520px;
          box-shadow: 0 24px 50px rgba(0,0,0,.6);
          font: 13px var(--ml-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
        `;

        const optionsHtml = knownServices.length
          ? knownServices.map(s => `
            <button class="ml-svc-opt" data-svc="${s.replace(/"/g, '&quot;')}" style="
              display:block; width:100%; text-align:left;
              background: rgba(255,255,255,.04); color: var(--ml-text, #e6e9ef);
              border: 1px solid var(--ml-border, #2a2f40);
              padding: 10px 14px; border-radius: 8px; margin-bottom: 6px;
              cursor: pointer; font: 600 13px var(--ml-font);
              transition: background .15s, border-color .15s;
            " onmouseover="this.style.background='rgba(79,140,255,.18)';this.style.borderColor='#4f8cff';"
               onmouseout="this.style.background='rgba(255,255,255,.04)';this.style.borderColor='var(--ml-border, #2a2f40)';">
              ${s}
            </button>
          `).join('')
          : '<div style="color:var(--ml-text-dim);">Nenhum Service conhecido nas regras.</div>';

        modal.innerHTML = `
          <div style="margin-bottom:14px;">
            <div style="font-size:15px;font-weight:700;margin-bottom:4px;">Categoria nao identificada automaticamente</div>
            <div style="color:var(--ml-text-mut,#a8aebd);font-size:12.5px;">
              Nao consegui identificar a categoria SE do ticket <b>${sourceIssueKey}</b> baseado nas regras configuradas.
              Qual <b>Service</b> usar na ISS?
            </div>
          </div>

          <div style="margin-bottom:14px;">${optionsHtml}</div>

          <div style="margin-bottom:14px;">
            <label style="display:block; font-size:11px; color:var(--ml-text-mut); margin-bottom:4px; text-transform:uppercase; letter-spacing:.5px;">
              Ou digite outro Service:
            </label>
            <input type="text" id="ml_svc_custom" placeholder="Ex: CCTV, Control Acceso, ..." style="
              width:100%; padding:8px 12px;
              background: rgba(255,255,255,.05); color: var(--ml-text);
              border: 1px solid var(--ml-border, #2a2f40); border-radius:6px;
              font: 13px var(--ml-font);
            " />
          </div>

          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button id="ml_svc_cancel" style="
              background: transparent; color: var(--ml-text-mut);
              border: 1px solid var(--ml-border, #2a2f40);
              padding: 8px 14px; border-radius: 6px;
              font: 500 12px var(--ml-font); cursor: pointer;
            ">Cancelar</button>
            <button id="ml_svc_confirm" style="
              background: linear-gradient(180deg, #4f8cff, #2c5fc7);
              color: #fff; border: 1px solid #2c5fc7;
              padding: 8px 14px; border-radius: 6px;
              font: 600 12px var(--ml-font); cursor: pointer;
            ">Usar Service digitado</button>
          </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(modal);

        const cleanup = () => { modal.remove(); overlay.remove(); };

        // Cliques nos botoes de sugestao = escolheu direto
        modal.querySelectorAll('.ml-svc-opt').forEach(b => {
          b.addEventListener('click', () => {
            const svc = b.getAttribute('data-svc');
            cleanup();
            resolve(svc);
          });
        });

        modal.querySelector('#ml_svc_confirm').addEventListener('click', () => {
          const v = String(modal.querySelector('#ml_svc_custom').value || '').trim();
          if(!v){
            alert('Digite o nome do Service ou clique numa das opcoes acima.');
            return;
          }
          cleanup();
          resolve(v);
        });

        modal.querySelector('#ml_svc_cancel').addEventListener('click', () => {
          cleanup();
          resolve(null); // cancelado
        });

        overlay.addEventListener('click', () => {
          cleanup();
          resolve(null);
        });

        // Foco no input pra digitar direto
        setTimeout(() => modal.querySelector('#ml_svc_custom')?.focus(), 50);
      });
    }

    // Fecha uma tarefa ISS recém-criada aplicando a transição "Done".
    // Detecta automaticamente pela statusCategory (key === 'done') do status destino.
    // Fallback: busca por nome da transição com padrão /done|close|resolv|fechar|conclu|finaliz/i.
    // Fecha uma ISS recém-criada aplicando transição(ões) até chegar no status Done.
    // Detecta e preenche automaticamente campos obrigatórios da transição (ex: Solution).
    // Estratégia multi-step: se não há transição direta pra Done, passa por In Progress primeiro.
    async function closeIssTaskAfterCreate(issueKey){
      // Aguarda 2s para evitar race condition após criação
      await new Promise(r => setTimeout(r, 2000));

      const isDoneTr = (t) =>
        t.to?.statusCategory?.key === 'done' ||
        t.to?.statusCategory?.colorName === 'green' ||
        /done|close|resolv|fechar|conclu|finaliz/i.test(t.name);

      const isProgressTr = (t) =>
        t.to?.statusCategory?.key === 'indeterminate' ||
        /progress|andamento|start|iniciar|begin/i.test(t.name);

      const norm = (s) => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

      // ── Descobre a key do campo Solution via campos da transição "Resolved" ──
      // Usando os campos da transição (doneTr.fields via ?expand=transitions.fields)
      // que é exatamente o que aparece no modal do Jira — mais confiável que names.
      // A busca em names tinha falso positivo: "resolution".includes("solution") = true.
      let solutionKey = null;
      // Será preenchido depois de encontrar doneTr — placeholder para o loop

      // ── Tenta aplicar a transição "Done" com múltiplas estratégias ─────
      // Ordem: ADF no payload → string no payload → sem Solution (se tudo falhar)
      const tryTransition = async (transitionId, solutionValue) => {
        const fieldsPayload = solutionKey && solutionValue != null
          ? { [solutionKey]: solutionValue }
          : {};
        const url = `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`;
        const body = { transition: { id: String(transitionId) } };
        if(Object.keys(fieldsPayload).length) body.fields = fieldsPayload;
        const r = await fetch(url, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if(!r.ok){
          const txt = await r.text().catch(()=>'');
          throw new Error(`HTTP ${r.status}: ${txt.slice(0, 250)}`);
        }
        return true;
      };

      // ── Loop: tenta direto ou em 2 passos (To Do → In Progress → Done) ─
      for(let step = 0; step < 2; step++){
        const trData = await jiraGetTransitions(issueKey);
        const transitions = trData.transitions || [];
        console.log(`[is-toolkit][auto-close] step ${step+1} transicoes:`, transitions.map(t=>`"${t.name}"`).join(', '));

        const doneTr = transitions.find(isDoneTr);
        if(doneTr){
          // Descobre solutionKey dos campos da transição (mais confiável que names)
          // Evita falso positivo: "resolution".includes("solution") = true
          if(!solutionKey){
            const trFields = doneTr.fields || {};
            const solEntry = Object.entries(trFields).find(([k, meta]) => {
              const n = norm(meta.name || k);
              // Usa match exato ou startsWith para evitar "resolution" → falso positivo
              return n === 'solution' || n === 'solucion' || n === 'solucao'
                || n.startsWith('soluc') || n.startsWith('solut');
            });
            solutionKey = solEntry?.[0] || null;
            console.log(`[is-toolkit][auto-close] solutionKey (via trFields): ${solutionKey || 'nao encontrado'}, campos: ${Object.keys(trFields).join(',')}`);
              }

          const strategies = [
            { label: 'ADF',    value: solutionKey ? textToAdfParagraphs(ISS_TASK_AUTO_CLOSE_SOLUTION) : null },
            { label: 'string', value: solutionKey ? ISS_TASK_AUTO_CLOSE_SOLUTION : null },
            { label: 'sem Solution', value: null }
          ];
          let lastErr = null;
          for(const s of strategies){
            try{
              await tryTransition(doneTr.id, s.value);
              console.log(`[is-toolkit][auto-close] ${issueKey} → "${doneTr.name}" OK (estrategia: ${s.label})`);
              return doneTr.name;
            }catch(e){
              console.warn(`[is-toolkit][auto-close] estrategia "${s.label}" falhou:`, e.message);
              lastErr = e;
            }
          }
          const solInfo = solutionKey ? `solutionKey=${solutionKey}` : 'solutionKey=NAO_ENCONTRADO';
          throw new Error(`${lastErr?.message || 'falha'} | ${solInfo}`);
        }

        if(step === 0){
          const inProg = transitions.find(isProgressTr);
          if(inProg){
            await tryTransition(inProg.id, null);
            console.log(`[is-toolkit][auto-close] ${issueKey} → "${inProg.name}" (intermediário)`);
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
        }

        throw new Error(`Nenhuma transicao "done" disponivel. Disponiveis: ${transitions.map(t=>`"${t.name}"`).join(', ')}`);
      }
    }

    async function createIssTaskFromIssue(sourceIssueKey, onProgress, destTeam){
      const progress = typeof onProgress === 'function' ? onProgress : () => {};

      // Decide template/overrides baseados em regras Confluence (mapeamento por categoria SE).
      progress('Avaliando qual configuracao ISS usar para este chamado...');
      const tmpl = await _resolveEffectiveIssConfig(sourceIssueKey, destTeam);
      const effectiveTemplate = tmpl.templateKey;
      const ruleOverrides = tmpl.overrides || {};

      progress(`Lendo ticket origem, modelo (${effectiveTemplate || '(value-based)'}) e schema de criacao...`);
      const baseTasks = [
        jiraGetMyself(),
        getIssueFullForCopy(sourceIssueKey),
        resolveIssTaskLinkTypeName(),
        getProjectAndIssueTypeIds(ISS_TASK_PROJECT, ISS_TASK_ISSUETYPE)
      ];
      if(effectiveTemplate){
        // So precisamos das IDs/values exatas de Demanda, Service e ResTeam da modelo.
        baseTasks.push(getIssueRawFields(effectiveTemplate, [ISS_TASK_DEMANDA_CF, ISS_TASK_SERVICE_CF, CF_RES_TEAM]));
      }
      const [me, source, linkTypeName, projInfo, modelFields] = await Promise.all(baseTasks);

      const assigneeAccountId = me?.accountId;
      if(!assigneeAccountId) throw new Error('Nao foi possivel identificar o usuario atual (/myself).');

      const description = source?.fields?.description || null;
      const sourceAttachments = source?.fields?.attachment || [];

      // Asset: descobrimos que o formato completo {workspaceId, id, objectId} eh aceito.
      const rawAsset = source?.fields?.[`customfield_${CF_ASSET}`];
      const assetArr = Array.isArray(rawAsset) ? rawAsset : (rawAsset ? [rawAsset] : []);
      if(!assetArr.length) throw new Error(`Ticket ${sourceIssueKey} nao tem "IS Ubicacion" preenchido.`);
      const assetForCreate = assetArr.map(a => {
        const out = {};
        if(a.workspaceId) out.workspaceId = a.workspaceId;
        if(a.id) out.id = a.id;
        if(a.objectId) out.objectId = a.objectId;
        return out;
      });

      const summary = String(ISS_TASK_SUMMARY_TEMPLATE).replace(/\{key\}/g, sourceIssueKey);

      // Resolve Demanda/Service/ResTeam. Preferimos os RAW da modelo (preserva ID, value
      // e estrutura array vs single - critico pro Service que e array em algumas Jiras).
      let demandaVal, serviceVal, resTeamVal;
      if(modelFields){
        const cfD = modelFields[`customfield_${ISS_TASK_DEMANDA_CF}`];
        const cfS = modelFields[`customfield_${ISS_TASK_SERVICE_CF}`];
        const cfR = modelFields[`customfield_${CF_RES_TEAM}`];
        if(!cfD) throw new Error(`Issue modelo ${effectiveTemplate} nao tem Demanda preenchida.`);
        if(!cfS) throw new Error(`Issue modelo ${effectiveTemplate} nao tem Service preenchida.`);
        if(!cfR) throw new Error(`Issue modelo ${effectiveTemplate} nao tem Resolution Team preenchida.`);
        demandaVal = sanitizeCustomFieldValue(cfD);
        serviceVal = sanitizeCustomFieldValue(cfS);
        resTeamVal = sanitizeCustomFieldValue(cfR);
      } else {
        // Value-based: sem ticket-modelo, usa strings diretamente. Pode falhar em Jiras
        // com validadores customizados. Overrides vindos das regras Confluence tem
        // prioridade sobre os defaults globais.
        const demandaValue = ruleOverrides.demanda || ISS_TASK_DEMANDA_VALUE;
        const serviceValue = ruleOverrides.service || ISS_TASK_SERVICE_VALUE;
        const resTeamValue = ruleOverrides.resTeam || ISS_TASK_RESOLUTION_TEAM;
        demandaVal = { value: demandaValue };
        serviceVal = [{ value: serviceValue }];
        resTeamVal = { value: resTeamValue };
      }

      // Monta payload MINIMAL no formato exato que a UI do Jira envia (capturado via debug).
      // Diferencas chave que descobrimos olhando o payload + URL da UI:
      //   - project por ID, nao key
      //   - issuetype por ID, nao name
      //   - assignee por {id}, igual a UI (o accountId tambem funciona, mas seguimos igual)
      //   - "update": {} (a UI sempre envia)
      //   - "externalToken" randomico (a UI envia para evitar duplo-submit)
      //   - SEM copiar customfields fantasma
      //   - URL com ?updateHistory=true&applyDefaultValues=false (ver jiraCreateIssue)
      const fieldsPayload = {
        project: { id: projInfo.projectId },
        issuetype: { id: projInfo.issuetypeId },
        summary,
        assignee: { id: assigneeAccountId },
        [`customfield_${CF_ASSET}`]: assetForCreate,
        [`customfield_${ISS_TASK_DEMANDA_CF}`]: demandaVal,
        [`customfield_${ISS_TASK_SERVICE_CF}`]: serviceVal,
        [`customfield_${CF_RES_TEAM}`]: resTeamVal
      };
      if(description) fieldsPayload.description = description;

      // Prioridade: copia da origem (usuario pediu "Prioridade nao mudamos"). Mantemos
      // a estrutura completa que a UI envia: {id, name, iconUrl} - alguns plugins olham name.
      const sourcePriority = source?.fields?.priority;
      if(sourcePriority && sourcePriority.id){
        const p = { id: String(sourcePriority.id) };
        if(sourcePriority.name)    p.name    = sourcePriority.name;
        if(sourcePriority.iconUrl) p.iconUrl = sourcePriority.iconUrl;
        fieldsPayload.priority = p;
      }

      const payload = {
        fields: fieldsPayload,
        update: {},
        externalToken: String(Math.random())
      };

      console.groupCollapsed(`[jira-localidade] Criando ISS task (de ${sourceIssueKey})`);
      console.log(`project=${ISS_TASK_PROJECT} (id=${projInfo.projectId}), issuetype=${ISS_TASK_ISSUETYPE} (id=${projInfo.issuetypeId})`);
      console.log(`modelo: ${effectiveTemplate || '(sem modelo, fallback por value)'} [origem: ${tmpl.source}${tmpl.rule ? ` "${tmpl.rule.label}"` : ''}]`);
      console.log('payload:', JSON.parse(JSON.stringify(payload)));
      console.groupEnd();

      progress('Criando tarefa ISS...');

      // Helpers para construir variantes da DESCRIPTION (asset esta OK).
      const titleOnlyAdf = { version:1, type:'doc', content:[{ type:'paragraph', content:[{ type:'text', text: summary }]}]};

      // Descricao "achatada": pega texto do ADF original e gera ADF simples (so paragraphs).
      // Plugins custom tipicamente aceitam isso (sem mentions, panels, links rich, etc).
      let plainDescAdf = null;
      if(description){
        const txt = adfToPlainText(description);
        if(txt && txt.trim()) plainDescAdf = plainTextToSimpleAdf(txt);
      }

      const buildFields = (descVal) => {
        const f = {
          project:   fieldsPayload.project,
          issuetype: fieldsPayload.issuetype,
          summary,
          assignee:  { id: assigneeAccountId },
          [`customfield_${CF_ASSET}`]:            assetForCreate,
          [`customfield_${ISS_TASK_DEMANDA_CF}`]: demandaVal,
          [`customfield_${ISS_TASK_SERVICE_CF}`]: serviceVal,
          [`customfield_${CF_RES_TEAM}`]:         resTeamVal
        };
        if(descVal) f.description = descVal;
        if(fieldsPayload.priority) f.priority = fieldsPayload.priority;
        return f;
      };
      const buildPayload = (descVal) => ({
        fields: buildFields(descVal),
        update: {},
        externalToken: String(Math.random())
      });

      // Como descobrimos que o plugin custom dropa silenciosamente description rica,
      // criamos direto com description "so titulo" (rapida, sempre passa) e enriquecemos
      // a descricao via PUT logo depois. Mantemos as outras como fallback POR SE acaso
      // o plugin um dia parar de bloquear (= autocura).
      const attempts = [];
      attempts.push({ label: 'description so titulo (rapido)',                    payload: buildPayload(titleOnlyAdf) });
      if(plainDescAdf) attempts.push({ label: 'description em texto puro',         payload: buildPayload(plainDescAdf) });
      if(description)  attempts.push({ label: 'description original (ADF rico)',  payload: buildPayload(description) });

      let created = null;
      let usedVariant = null;
      let lastErr = null;
      for(const at of attempts){
        progress(`Criando tarefa ISS (tentando "${at.label}")...`);
        try{
          console.log(`[jira-localidade] tentativa: ${at.label}`);
          created = await jiraCreateIssue(at.payload);
          usedVariant = at.label;
          break;
        }catch(e){
          const isPluginErr = /All fields are required|matriz/i.test(String(e.response || e.message || ''));
          lastErr = e;
          if(!isPluginErr) throw e;
          console.warn(`[jira-localidade] tentativa "${at.label}" rejeitada pelo plugin. Tentando proxima...`);
        }
      }
      if(!created) throw lastErr || new Error('Todas as tentativas falharam.');

      if(usedVariant && usedVariant !== attempts[0].label){
        console.warn(`[jira-localidade] SUCESSO usando variante: "${usedVariant}". Tentativas mais completas falharam.`);
      } else {
        console.log('[jira-localidade] SUCESSO no payload completo.');
      }

      const newKey = created?.key;
      if(!newKey) throw new Error('Issue criada mas resposta sem "key".');
      createIssTaskFromIssue.__lastVariantUsed = usedVariant;

      progress(`Vinculando ${newKey} ao ${sourceIssueKey}...`);
      await jiraCreateLink(linkTypeName, newKey, sourceIssueKey);

      // POS-CRIACAO: sempre re-aplicar a descricao via PUT, mesmo quando o create
      // retornou 201 com a description "rica". Motivo: o plugin custom pode aceitar
      // o POST (status 201) mas dropar SILENCIOSAMENTE o campo description, salvando
      // apenas o summary. Como validadores custom tipicamente so rodam em CREATE,
      // um PUT subsequente costuma persistir a descricao corretamente.
      //
      // Cascata: tenta ADF original -> texto puro (ADF simples). Ultimo recurso: comentario.
      let descReport = { method: 'skipped', detail: 'ticket origem sem descricao' };
      if(description){
        const tryVariants = [
          { label: 'PUT description (ADF original)', adf: description },
          plainDescAdf && { label: 'PUT description (texto puro)', adf: plainDescAdf }
        ].filter(Boolean);

        let putOk = false;
        for(const v of tryVariants){
          progress(`Garantindo descricao em ${newKey}: ${v.label}...`);
          try{
            console.log(`[jira-localidade] ${v.label}`);
            await jiraUpdateDescription(newKey, v.adf);
            descReport = { method: 'update-after-create', detail: v.label };
            putOk = true;
            break;
          }catch(e){
            console.warn(`[jira-localidade] ${v.label} falhou: ${e.message || e}`);
          }
        }

        if(!putOk){
          // Ultimo recurso: adiciona descricao como comentario (validador nao roda em comments).
          progress(`Adicionando descricao original como comentario em ${newKey}...`);
          try{
            const commentBody = {
              version:1, type:'doc',
              content: [
                { type:'paragraph', content:[{ type:'text', text: `Descrição original copiada de ${sourceIssueKey}:`, marks:[{ type:'strong' }]}]},
                ...((description?.content) || plainDescAdf?.content || [])
              ]
            };
            await jiraAddComment(newKey, commentBody);
            descReport = { method: 'comment-fallback', detail: 'description original colocada como comentario' };
          }catch(e){
            console.warn(`[jira-localidade] criar comment com descricao falhou: ${e.message || e}`);
            descReport = { method: 'failed', detail: 'description nao foi copiada (nem update, nem comment funcionaram)' };
          }
        }
      }
      createIssTaskFromIssue.__lastDescReport = descReport;

      let attachmentsReport = { copied: 0, total: 0, errors: [], skipped: true };
      if(ISS_TASK_COPY_ATTACHMENTS && sourceAttachments.length){
        progress(`Copiando ${sourceAttachments.length} anexo(s) para ${newKey}...`);
        try{
          attachmentsReport = await copyAttachmentsBetweenIssues(sourceIssueKey, sourceAttachments, newKey);
          attachmentsReport.skipped = false;
        }catch(e){
          attachmentsReport = { copied: 0, total: sourceAttachments.length, errors: [String(e.message || e)], skipped: false };
        }
      } else if(ISS_TASK_COPY_ATTACHMENTS){
        attachmentsReport.skipped = false;
      }

      // Copia comentarios como digest (1 comment interno consolidado).
      // Feito DEPOIS dos anexos pra eles ficarem na nova issue antes do digest aparecer
      // no historico - assim quem ler ja ve "tem anexo + tem o digest contextualizando".
      // Passamos sourceAttachments pra resolver IDs em nomes de arquivo no digest
      // ("Anexos referenciados: img1.png, doc.pdf").
      let commentsReport = { copied: 0, total: 0, mode: 'skipped-disabled', error: null };
      if(ISS_TASK_COPY_COMMENTS){
        progress('Copiando comentarios do ticket origem como digest...');
        commentsReport = await copyCommentsAsDigest(sourceIssueKey, newKey, sourceAttachments);
      }

      return {
        newKey,
        linkType: linkTypeName,
        attachmentsReport,
        commentsReport,
        descReport,
        template: { key: effectiveTemplate, source: tmpl.source, ruleLabel: tmpl.rule?.label || null }
      };
    }

    function shouldOfferIssTask(teamValue){
      if(!ISS_TASK_TRIGGER_TEAMS.length) return false;
      if(!teamValue) return false;
      const t = String(teamValue).trim();
      return ISS_TASK_TRIGGER_TEAMS.some(name => String(name).trim() === t);
    }
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
          const raw = _gmGet(_STORAGE_KEY) || localStorage.getItem(_STORAGE_KEY);
          if(raw){
            const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
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
    // =========================
    // DEBUG: Captura de payloads POST (para descobrir o que a UI do Jira envia)
    //
    // Como funciona:
    //   1) Monkey-patch em window.fetch (preservando o original)
    //   2) Todo POST passa por nos, gravamos url + body + status
    //   3) Filtros descartam telemetria, analytics, etc.
    //   4) UI lista os POSTs por tamanho do body (maior primeiro = mais provavel de ser create)
    //
    // Sobrevive ao fechar o modal: o state vive em escopo do IIFE.
    // =========================
    const _capState = {
      active: false,
      originalFetch: null,
      items: []
    };

    const _capSkipPatterns = [
      /\/properties\//,
      /\/frontend-exception/,
      /\/analytics/,
      /\/rgstr\?/,
      /atl-paas\.net/,
      /\/info\b/,
      /\/error\b/,
      /\/permitted\b/
    ];

    function _capShouldKeep(url, method){
      if(method !== 'POST') return false;
      if(!url) return false;
      return !_capSkipPatterns.some(p => p.test(url));
    }

    async function _capBodyToText(body){
      if(body == null) return '';
      if(typeof body === 'string') return body;
      try{
        if(body instanceof FormData){
          const lines = [];
          for(const [k, v] of body.entries()){
            lines.push(`${k}=${typeof v === 'string' ? v : `<${v?.constructor?.name || 'binary'}>`}`);
          }
          return lines.join('\n');
        }
        if(body instanceof URLSearchParams) return body.toString();
        if(body instanceof Blob) return await body.text();
        if(body instanceof ArrayBuffer) return new TextDecoder().decode(body);
        return JSON.stringify(body);
      }catch(e){
        return `<erro ao serializar body: ${e.message}>`;
      }
    }

    // *** CORRECAO DE SEGURANCA: window.fetch NAO e sobrescrito nesta build.
    // Use F12 -> Network para inspecionar requisicoes durante debug.
    function startCapture(){
      if(_capState.active) return false;
      _capState.active = true;
      console.warn('[jira-localidade][debug] Captura desabilitada. Use DevTools (F12 > Network).');
      return true;
    }

    function stopCapture(){
      if(!_capState.active) return false;
      _capState.active = false;
      return true;
    }

    function clearCaptured(){ _capState.items = []; }

    function openCaptureDebugModal(){
      document.getElementById('ml_cap_modal')?.remove();
      document.getElementById('ml_cap_overlay')?.remove();
      ensureStyle();

      const overlay = document.createElement('div');
      overlay.id = 'ml_cap_overlay';
      overlay.className = 'mlCapOverlay';

      const modal = document.createElement('div');
      modal.id = 'ml_cap_modal';
      modal.className = 'mlCapModal';

      let sortBy = 'time'; // 'time' | 'size'
      let filterText = '';

      const renderList = () => {
        let items = _capState.items.slice();
        if(filterText){
          const ft = filterText.toLowerCase();
          items = items.filter(it => it.url.toLowerCase().includes(ft) || it.body.toLowerCase().includes(ft));
        }
        if(sortBy === 'size') items.sort((a,b) => b.size - a.size);
        else items.sort((a,b) => b.idx - a.idx); // mais recente primeiro

        if(!items.length){
          return '<div class="capEmpty">Nenhum POST capturado.<br/>Clica em <b>Iniciar captura</b>, faz a acao no Jira, volta aqui e clica <b>Atualizar</b>.</div>';
        }
        return items.map(it => `
          <div class="capItem">
            <div class="capItemHead">
              <span class="capStat ${it.status >= 200 && it.status < 300 ? 'ok' : (it.status >= 400 ? 'fail' : 'warn')}">${it.status ?? '?'}</span>
              <span class="capSize">${it.size.toLocaleString('pt-BR')} bytes</span>
              <code class="capUrl" title="${esc(it.url)}">${esc(it.url)}</code>
              <span class="capTime">${esc(it.time)}</span>
              <button class="btnSecondary capCopy" data-idx="${it.idx}">Copiar body</button>
              <button class="btnSecondary capExpand" data-idx="${it.idx}">Ver</button>
            </div>
            <div class="capBody" id="ml_cap_body_${it.idx}" style="display:none;">
              <div class="capLabel">Request body:</div>
              <pre>${esc(it.body.slice(0, 8000))}${it.body.length > 8000 ? '\n... (truncado, body completo no clipboard ao copiar)' : ''}</pre>
              ${it.response ? `<div class="capLabel" style="margin-top:8px;">Response (primeiros 600 chars):</div><pre>${esc(it.response)}</pre>` : ''}
            </div>
          </div>
        `).join('');
      };

      const render = () => {
        modal.innerHTML = `
          <div class="ch">
            <div>
              <div class="title">Debug: capturar payloads POST</div>
              <div class="meta">Intercepta requests do Jira para inspecionar o que a UI envia.</div>
            </div>
            <button id="ml_cap_close" class="btnSecondary">Fechar</button>
          </div>
          <div class="cb">
            <div class="capStatus ${_capState.active ? 'on' : 'off'}">
              <b>Status:</b> ${_capState.active ? 'ATIVO (interceptando)' : 'INATIVO'}
              &nbsp;|&nbsp; <b>${_capState.items.length}</b> POST(s) capturado(s)
            </div>

            <div class="capActions">
              ${_capState.active
                ? `<button id="ml_cap_stop" class="btnPrimary">Parar captura</button>`
                : `<button id="ml_cap_start" class="btnPrimary">Iniciar captura</button>`
              }
              <button id="ml_cap_clear" class="btnSecondary">Limpar lista</button>
              <button id="ml_cap_refresh" class="btnSecondary">Atualizar</button>
            </div>

            <div class="capHint">
              <b>Como descobrir o payload do "+ Criar" manual:</b>
              <ol>
                <li>Clica em <b>Iniciar captura</b> aqui</li>
                <li>Vai no Jira, clica em <b>+ Criar</b>, preenche Projeto=<code>ISS</code>, Tipo=<code>Tarefa</code> (so o minimo obrigatorio)</li>
                <li>Clica <b>Criar</b> e aguarda a confirmacao</li>
                <li>Volta aqui, clica <b>Atualizar</b></li>
                <li>Ordena por <b>tamanho</b>: o request grande com <code>graphql</code> ou <code>issue</code> no URL e provavelmente o create</li>
                <li>Clica <b>Copiar body</b> e me manda o JSON</li>
              </ol>
            </div>

            <div class="capFilters">
              <input id="ml_cap_filter" placeholder="Filtrar por URL ou conteudo do body" value="${esc(filterText)}" />
              <label class="capRadio"><input type="radio" name="ml_cap_sort" value="time" ${sortBy==='time'?'checked':''}/> Mais recente</label>
              <label class="capRadio"><input type="radio" name="ml_cap_sort" value="size" ${sortBy==='size'?'checked':''}/> Maior body</label>
            </div>

            <div class="capList" id="ml_cap_list">${renderList()}</div>
          </div>
        `;
        attachHandlers();
      };

      const attachHandlers = () => {
        const $ = (id) => modal.querySelector(`#${id}`);
        $('ml_cap_close').onclick = () => { modal.remove(); overlay.remove(); };
        const sBtn = $('ml_cap_start'); if(sBtn) sBtn.onclick = () => { startCapture(); render(); };
        const pBtn = $('ml_cap_stop');  if(pBtn) pBtn.onclick = () => { stopCapture(); render(); };
        $('ml_cap_clear').onclick = () => { clearCaptured(); render(); };
        $('ml_cap_refresh').onclick = () => { $('ml_cap_list').innerHTML = renderList(); attachItemHandlers(); };

        const fInput = $('ml_cap_filter');
        fInput.oninput = () => { filterText = fInput.value || ''; $('ml_cap_list').innerHTML = renderList(); attachItemHandlers(); };

        modal.querySelectorAll('input[name="ml_cap_sort"]').forEach(r => {
          r.onchange = () => { sortBy = r.value; $('ml_cap_list').innerHTML = renderList(); attachItemHandlers(); };
        });

        attachItemHandlers();
      };

      const attachItemHandlers = () => {
        modal.querySelectorAll('.capCopy').forEach(b => {
          b.onclick = async () => {
            const idx = Number(b.dataset.idx);
            const it = _capState.items[idx];
            if(!it) return;
            try{
              await navigator.clipboard.writeText(it.body);
              const orig = b.textContent;
              b.textContent = 'Copiado!';
              setTimeout(() => b.textContent = orig, 1200);
            }catch{
              window.prompt('Copia o conteudo abaixo (Cmd+C):', it.body.slice(0, 4000));
            }
          };
        });
        modal.querySelectorAll('.capExpand').forEach(b => {
          b.onclick = () => {
            const idx = Number(b.dataset.idx);
            const el = modal.querySelector(`#ml_cap_body_${idx}`);
            if(el) el.style.display = el.style.display === 'none' ? '' : 'none';
          };
        });
      };

      overlay.onclick = () => { modal.remove(); overlay.remove(); };
      document.body.appendChild(overlay);
      document.body.appendChild(modal);
      render();
    }
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
      _markToolkitUsage(issueKey).catch(()=>{});
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

    // Modal pra escolher UMA prioridade de uma lista (usado no "Prioridade selecionados" dos
    // Duplicados). Retorna Promise<{ id, name } | null>. null = usuario cancelou.
    function pickPriorityInteractive(priorities, opts){
      opts = opts || {};
      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'mlCapOverlay';
        const modal = document.createElement('div');
        modal.className = 'mlCapModal';
        modal.style.maxWidth = 'min(420px, 96vw)';

        modal.innerHTML = `
          <div class="ch">
            <div>
              <div class="title">Aplicar prioridade a ${Number(opts.count)||0} ticket(s)</div>
              <div class="subtitle">Escolha a prioridade abaixo. Isso muda o campo Prioridade direto (sem passar por transi&ccedil;&atilde;o).</div>
            </div>
            <button id="ml_pp_cancel" class="ghost">Cancelar (Esc)</button>
          </div>
          <div class="cb">
            <select id="ml_pp_select" style="width:100%;background:var(--ml-bg-0);color:var(--ml-text);border:1px solid var(--ml-border-2);border-radius:var(--ml-radius-sm);padding:8px 10px;font-size:13px;margin-bottom:12px;">
              ${(priorities || []).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
            </select>
            <div style="display:flex;justify-content:flex-end;gap:8px;">
              <button id="ml_pp_cancel2" class="ghost">Cancelar</button>
              <button id="ml_pp_apply" class="primary">Aplicar</button>
            </div>
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
        modal.querySelector('#ml_pp_cancel').onclick = () => close(null);
        modal.querySelector('#ml_pp_cancel2').onclick = () => close(null);
        overlay.addEventListener('click', (e) => { if(e.target === overlay) close(null); });
        modal.querySelector('#ml_pp_apply').onclick = () => {
          const sel = modal.querySelector('#ml_pp_select');
          const id = sel.value;
          const name = sel.options[sel.selectedIndex]?.text || '';
          if(!id){ close(null); return; }
          close({ id, name });
        };
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
      const defaultComment = _applyMyNamePlaceholder(String(opts.comment || action.comment || '').trim(), me);
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
        showToast(`${action.label||chosenTransition.name} aplicado → ${chosenTransition.name}${action.assignToMe!==false?' · '+me.displayName:''}`,'success',3000);
      }
      return { ok: true, transition: chosenTransition, accountId, displayName: me.displayName };
    }

    // Toast leve (top direito) que some sozinho. Usado apos aplicar status com sucesso.
    function showStatusAppliedToast(msg){ try{ showToast(msg,'success',2800); }catch(_){} }

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
        showToast('Abra um ticket para usar esta acao.','warn',3000);
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
            <textarea id="ml_st_comment" placeholder="Mensagem a ser postada no ticket ao aplicar (opcional). Use /comando + Espaco para inserir um snippet." style="width:100%; min-height: 120px; padding:10px; border-radius:8px; border:1px solid var(--ml-border); background:var(--ml-bg-2); color:var(--ml-text); font-family: inherit; font-size: 12.5px; line-height: 1.45;"></textarea>
            <div id="ml_st_slash_hint" style="margin-top:4px;"></div>

            <div style="display:flex; gap:18px; margin-top:12px; flex-wrap:wrap; font-size:12.5px;">
              <label class="checkbox" style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                <input type="checkbox" id="ml_st_internal" />
                <span>Postar como <b>observa&ccedil;&atilde;o interna</b> (s&oacute; a equipe v&ecirc;)</span>
              </label>
              <label class="checkbox" style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                <input type="checkbox" id="ml_st_assign" />
                <span>Atribuir o ticket <b>pra mim</b></span>
              </label>
            </div>
          </div>

          <div style="display:flex; gap:10px; justify-content:flex-end; padding-top:6px; border-top:1px solid var(--ml-border); margin-top:auto;">
            <button id="ml_st_settings" class="ghost" title="Configurar mensagens e comportamento de cada acao">&#9881; Configurar a&ccedil;&otilde;es</button>
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
      $('#ml_st_settings').onclick = () => {
        // Abre settings POR CIMA sem fechar o modal de status
        try{
          openSettingsModal();
          // Eleva o z-index do settings para ficar na frente
          setTimeout(() => {
            const sM = document.getElementById(IDS.sModal);
            const sO = document.getElementById(IDS.sOverlay);
            if(sM) sM.style.zIndex = '10000020';
            if(sO) sO.style.zIndex = '10000019';
          }, 30);
        }catch(_){}
      };

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
          subtitle.innerHTML = `Status atual: <b style="color:var(--ml-text);">${esc(statusName)}</b> &mdash; clique em uma op&ccedil;&atilde;o abaixo para mudar.`;
        } else {
          subtitle.textContent = 'Clique em uma opção abaixo para mudar o status.';
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
        // isDeriveTransition: true quando o nome bate com DERIVE_TRANSITION_NAME
        const normTrName = (s) => String(s||'').trim().toLowerCase();
        const annotated = visible.map(t => ({
          id: String(t.id),
          name: String(t.name || ''),
          toName: String(t.to?.name || ''),
          action: _findActionForTransition(t.name),
          isDeriveTransition: normTrName(t.name) === normTrName(DERIVE_TRANSITION_NAME)
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
          const hasConfig = !!a;
          const badges = [];
          if(a?.internal) badges.push(`<span style="background:rgba(251,191,36,0.15);color:#fbbf24;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;border:1px solid rgba(251,191,36,0.3);">obs interna</span>`);
          if(a && a.assignToMe !== false) badges.push(`<span style="background:rgba(45,216,112,0.15);color:#2dd870;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;border:1px solid rgba(45,216,112,0.3);">atribui pra mim</span>`);
          // Transição Derive: visual especial indicando que abre o fluxo completo
          if(t.isDeriveTransition){
            return `
              <button type="button" class="ml-st-opt" data-idx="${i}" data-is-derive="1"
                style="text-align:left;padding:14px 16px;border-radius:14px;
                       background:linear-gradient(145deg,rgba(96,144,240,0.10),var(--ml-bg-2));
                       color:var(--ml-text);border:1px solid var(--ml-blue-line);
                       cursor:pointer;font:inherit;
                       transition:background .15s,border-color .15s,transform .15s cubic-bezier(.34,1.56,.64,1),box-shadow .15s;
                       display:flex;flex-direction:column;gap:8px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                  <div style="font-weight:700;font-size:13.5px;">&#x1F501; Derivar para outro time</div>
                  <span style="font-size:10px;font-weight:700;background:var(--ml-blue-soft);color:var(--ml-blue);padding:2px 8px;border-radius:20px;border:1px solid var(--ml-blue-line);white-space:nowrap;">fluxo completo</span>
                </div>
                <div style="font-size:12px;color:var(--ml-text-mut);line-height:1.45;">
                  Seleciona o time, cria ISS automaticamente (para SE-N2) e remove das notificações.
                </div>
              </button>
            `;
          }

          return `
            <button type="button" class="ml-st-opt" data-idx="${i}"
              style="text-align:left;padding:14px 16px;border-radius:14px;
                     background:linear-gradient(145deg,var(--ml-bg-3),var(--ml-bg-2));
                     color:var(--ml-text);border:1px solid var(--ml-border-2);
                     cursor:pointer;font:inherit;
                     transition:background .15s,border-color .15s,transform .15s cubic-bezier(.34,1.56,.64,1),box-shadow .15s;
                     display:flex;flex-direction:column;gap:8px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <div style="font-weight:700;font-size:13.5px;">${esc(a?.label || t.name)}</div>
                ${t.toName ? `<span style="font-size:10.5px;color:var(--ml-text-dim);background:var(--ml-bg-4);padding:2px 8px;border-radius:20px;border:1px solid var(--ml-border-2);white-space:nowrap;">&rarr; ${esc(t.toName)}</span>` : ''}
              </div>
              ${msg ? `
                <div style="font-size:12px;color:var(--ml-text-mut);line-height:1.5;
                            background:rgba(96,144,240,0.07);border-left:2px solid var(--ml-blue-line);
                            padding:6px 10px;border-radius:6px;
                            display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                  "${esc(msg)}"
                </div>
              ` : `
                <div style="font-size:11.5px;color:var(--ml-text-dim);font-style:italic;">
                  ${hasConfig ? 'Sem mensagem configurada — você digita na hora' : 'Ação não configurada — você digita na hora'}
                </div>
              `}
              ${badges.length ? `<div style="display:flex;gap:5px;flex-wrap:wrap;">${badges.join('')}</div>` : ''}
            </button>
          `;
        }).join('');

        grid.querySelectorAll('.ml-st-opt').forEach(btn => {
          btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--ml-bg-3, #1f2433)'; btn.style.borderColor = 'var(--ml-blue, #4f8cff)'; });
          btn.addEventListener('mouseleave', () => { if(!btn.classList.contains('active')){ btn.style.background = 'var(--ml-bg-2)'; btn.style.borderColor = 'var(--ml-border)'; } });
          btn.onclick = () => {
            const idx = Number(btn.getAttribute('data-idx'));
            const t = annotated[idx];

            // Transição Derive: fecha este modal e abre o fluxo completo de Derivar
            if(t.isDeriveTransition || btn.getAttribute('data-is-derive') === '1'){
              close();
              setTimeout(() => openDeriveFlow(issueKey), 80);
              return;
            }

            selectedTransition = t;
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

        // Verificacao pre-fechamento: auditoria pendente ou score baixo
        try{
          if(_isFinalTransition(t.name)){
            const cached = _loadAuditGM(issueKey);
            if(!cached){
              const go = confirm('⚠️ Este ticket não foi auditado.\n\nDeseja auditar antes de fechar?');
              if(go) return; // usuario clicou OK = quer auditar, cancela transicao
            } else {
              const updatedTs = await _getIssueUpdatedTs(issueKey);
              if(_isAuditStale(cached, updatedTs)){
                const go = confirm('⚠️ Este ticket foi alterado depois da última auditoria salva (auditoria desatualizada).\n\nDeseja reauditar antes de fechar?');
                if(go) return;
              } else if(cached.score < 60){
                const errs = (cached.items||[]).filter(i=>i.status==='error').map(i=>i.check).join(', ');
                const go = confirm(`⚠️ Score de auditoria: ${cached.score}/100\nPendências: ${errs || 'ver painel'}\n\nFechar mesmo assim?`);
                if(!go) return;
              }
            }
          }
        }catch(e){} // se falhar, deixar a transicao acontecer normalmente

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

    // Botao "Mudar status" removido — funcionalidade acessivel via IS Toolkit
    // (card na home) ou pelo atalho de teclado STATUS_MENU_SHORTCUTS.
    function ensureStatusButton(){
      document.getElementById('ml_loc_assign_btn')?.remove(); // limpa se sobrou de versao anterior
    }

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

    // Le snippets do GM storage (versao mais fresca, caso usuario
    // tenha editado em outra aba).
    function _readSnippetsFresh(){
      try{
        const raw = _gmGet(_STORAGE_KEY) || localStorage.getItem(_STORAGE_KEY);
        if(raw){
          const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
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
        showToast('Abra um ticket para usar o comentario rapido.','warn',3000);
        return;
      }

      // Toggle se ja existe (limpa o listener de teclado da instância anterior antes de remover)
      const existing = document.getElementById('ml_qc_overlay');
      if(existing){
        if(existing._qcOnKey) document.removeEventListener('keydown', existing._qcOnKey, true);
        existing.remove();
        return;
      }

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

      // close() é a ÚNICA saída — sempre desliga o listener de teclado antes de remover o overlay.
      // ('remove' não é um evento real disparado por Element.remove(), então não dá pra depender
      // dele: cada caminho de fechamento (Esc, X, Cancelar, clique fora, postar) passa por aqui.)
      const close = () => { document.removeEventListener('keydown', onKey, true); overlay.remove(); };
      overlay.addEventListener('click', (e) => { if(e.target === overlay) close(); });
      box.querySelector('#ml_qc_close').onclick = close;
      box.querySelector('#ml_qc_cancel').onclick = close;

      // Atalho Esc fecha (Cmd+Enter posta)
      const onKey = (e) => {
        if(e.key === 'Escape'){ e.preventDefault(); close(); return; }
        if((e.metaKey || e.ctrlKey) && e.key === 'Enter'){
          e.preventDefault();
          box.querySelector('#ml_qc_post')?.click();
        }
      };
      document.addEventListener('keydown', onKey, true);
      overlay._qcOnKey = onKey; // pra permitir limpeza no toggle-reabre (linha ~5332)

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
    // =========================
    // HEALTH CHECK: valida configuracoes contra a instancia Jira atual.
    //
    // Roda em background quando o modal abre. Verifica:
    //   - Custom fields configurados existem (CF_ASSET, CF_RES_TEAM, Demanda, Service)
    //   - Project ISS existe
    //   - Issuetype "Tarefa" existe em ISS
    //
    // Resultado fica em sessionStorage por 30min pra nao re-rodar a cada abertura.
    // =========================

    const HEALTH_CACHE_KEY = 'ml_loc_health_v1';
    const HEALTH_CACHE_TTL_MS = 30 * 60 * 1000;

    // Lista todos os fields do Jira (paginacao nao se aplica - retorna lista completa).
    async function listAllFields(){
      const r = await fetch(`${location.origin}/rest/api/3/field`, {
        credentials:'same-origin', headers:{ Accept:'application/json' }
      });
      if(!r.ok) throw new Error(`HTTP ${r.status} listando campos`);
      return r.json();
    }

    // Verifica se um project existe via GET /rest/api/3/project/{key}.
    async function projectExists(key){
      if(!key) return false;
      try{
        const r = await fetch(`${location.origin}/rest/api/3/project/${encodeURIComponent(key)}`, {
          credentials:'same-origin', headers:{ Accept:'application/json' }
        });
        return r.ok;
      }catch(_){ return false; }
    }

    // Verifica se um issuetype existe num project (procura pelo name).
    async function issueTypeExists(projectKey, issuetypeName){
      if(!projectKey || !issuetypeName) return false;
      try{
        const r = await fetch(`${location.origin}/rest/api/3/project/${encodeURIComponent(projectKey)}`, {
          credentials:'same-origin', headers:{ Accept:'application/json' }
        });
        if(!r.ok) return false;
        const d = await r.json();
        return (d.issueTypes || []).some(t => t.name === issuetypeName);
      }catch(_){ return false; }
    }

    async function runHealthCheck(){
      const issues = [];
      const ok = [];

      // 1) Custom fields configurados
      let allFields = [];
      try{
        allFields = await listAllFields();
      }catch(e){
        issues.push({ severity:'error', msg:`Nao foi possivel listar campos do Jira: ${e.message || e}`, hint:'Sessao expirada? Recarregue a pagina.' });
      }
      const fieldIds = new Set(allFields.map(f => f.id));
      const fieldByCfId = (cf) => allFields.find(f => f.id === `customfield_${cf}`);

      const cfList = [
        { name:'IS Ubicacion (asset)',         cfId: CF_ASSET },
        { name:'Resolution Team',              cfId: CF_RES_TEAM },
        { name:'Demanda (criar tarefa ISS)',   cfId: ISS_TASK_DEMANDA_CF },
        { name:'Service (criar tarefa ISS)',   cfId: ISS_TASK_SERVICE_CF }
      ];
      for(const cf of cfList){
        const fid = `customfield_${cf.cfId}`;
        const meta = fieldByCfId(cf.cfId);
        if(!fieldIds.size){
          // ja reportamos erro de listAllFields; nao acumulamos
        } else if(!meta){
          issues.push({
            severity:'warn',
            msg:`Custom field "${cf.name}" (${fid}) NAO encontrado no Jira atual.`,
            hint:'Configuracoes -> Projetos & busca / Criar tarefa ISS -> ajuste o ID do customfield.'
          });
        } else {
          ok.push(`${cf.name} OK (${meta.name || fid})`);
        }
      }

      // 2) Project ISS
      const projOk = await projectExists(ISS_TASK_PROJECT);
      if(!projOk){
        issues.push({
          severity:'warn',
          msg:`Projeto "${ISS_TASK_PROJECT}" nao existe ou voce nao tem acesso.`,
          hint:'Configuracoes -> Criar tarefa ISS -> "Projeto ISS".'
        });
      } else {
        ok.push(`Projeto ${ISS_TASK_PROJECT} OK`);

        // 3) Issuetype Tarefa em ISS (so checa se project existe)
        const itOk = await issueTypeExists(ISS_TASK_PROJECT, ISS_TASK_ISSUETYPE);
        if(!itOk){
          issues.push({
            severity:'warn',
            msg:`Issuetype "${ISS_TASK_ISSUETYPE}" nao existe em ${ISS_TASK_PROJECT}.`,
            hint:'Configuracoes -> Criar tarefa ISS -> "Issuetype".'
          });
        } else {
          ok.push(`Issuetype ${ISS_TASK_ISSUETYPE} em ${ISS_TASK_PROJECT} OK`);
        }
      }

      return { issues, ok, checkedAt: Date.now() };
    }

    // Wrapper com cache em sessionStorage.
    async function runHealthCheckCached(){
      try{
        const raw = sessionStorage.getItem(HEALTH_CACHE_KEY);
        if(raw){
          const cached = JSON.parse(raw);
          if(cached?.checkedAt && (Date.now() - cached.checkedAt) < HEALTH_CACHE_TTL_MS){
            return cached;
          }
        }
      }catch(_){}
      const result = await runHealthCheck();
      try{ sessionStorage.setItem(HEALTH_CACHE_KEY, JSON.stringify(result)); }catch(_){}
      return result;
    }

    function clearHealthCache(){
      try{ sessionStorage.removeItem(HEALTH_CACHE_KEY); }catch(_){}
    }
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
        const raw = _gmGet(_STORAGE_KEY) || localStorage.getItem(_STORAGE_KEY);
        if(raw){
          const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
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
    // =========================
    // AUDIT FEATURE — analise de ticket via IA (webhook n8n + Universal Chat Model)
    // =========================

    // Extrai texto plano de um nodo ADF (Atlassian Document Format)
    function _adfToText(node, maxLen){
      maxLen = maxLen || 3000;
      const parts = [];
      function walk(n){
        if(!n) return;
        if(n.type === 'text' && n.text) parts.push(n.text);
        if(n.type === 'mention' && n.attrs?.text) parts.push(n.attrs.text);
        (n.content || []).forEach(walk);
      }
      walk(node);
      return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, maxLen) || '(vazio)';
    }

    // Versao do conjunto de criterios/regras do prompt de auditoria — bump sempre que _buildAuditPrompt mudar
    // de forma que altere o veredito esperado (novo criterio, mudanca de rubrica, nova regra de escopo/guardrail).
    // Fica gravada em cada resultado (result._prompt_version) pra permitir comparar resultados entre versoes.
    const AUDIT_PROMPT_VERSION = '1.54.0';

    // Monta o prompt que sera enviado para a IA via webhook
    function _buildAuditPrompt(data, alreadyFixed){
      const f = data.fields || {};
      const key = data.key || '?';

      const summary      = f.summary || '(sem titulo)';
      const statusName   = f.status?.name || '?';
      const statusCatKey = f.status?.statusCategory?.key || '';
      const priority     = f.priority?.name || 'Nao definida';
      const assignee     = f.assignee?.displayName || 'Nao atribuido';
      const reporter     = f.reporter?.displayName || 'Desconhecido';
      const desc         = f.description ? _adfToText(f.description, 3000) : '(vazio)';
      const issueType    = f.issuetype?.name || 'Desconhecido';

      // Campos de categorizacao/tipificacao (customfields configuraveis, 0 = nao mapeado).
      // Ate a v1.53 esses IDs existiam nas Configuracoes mas nunca eram lidos aqui — a
      // auditoria nunca avaliava Categoria/Subcategoria/Tipo de solicitacao/Tipo de
      // resolucao/Validacao do usuario de fato. Isso passa a alimentar os criterios
      // "Categoria", "Solucao Efetiva" e "Validacao Usuario" abaixo.
      const _cfStr = v => {
        if(v == null) return '';
        if(typeof v === 'string') return v;
        if(typeof v === 'object') return String(v.value ?? v.name ?? v.id ?? '');
        return String(v);
      };
      const _readCf = key => {
        const id = Number(SETTINGS[key] || DEFAULTS[key] || 0);
        return id ? _cfStr(f[`customfield_${id}`]) : '';
      };
      const catCategoria   = _readCf('CF_CATEGORY');
      const catSubcategoria = _readCf('CF_SUBCATEGORY');
      const catRequestType = _readCf('CF_REQUEST_TYPE');
      const catUserValidation = _readCf('CF_USER_VALIDATION');
      const catSolutionType = _readCf('CF_SOLUTION_TYPE');
      const hasCategoryData = !!(catCategoria || catSubcategoria || catRequestType);

      // Ticket considerado aberto se nao estiver em status "done"
      const isClosed = statusCatKey === 'done'
        || /close|resolv|done|fechar|encerr|conclu|finaliz/i.test(statusName);

      // Helper: detecta autor bot
      const isBot = name => /automation|bot|system|jira\s*service|auto\s*assign|trigger/i.test(name || '');

      // Anexos (nomes de arquivo)
      const allAttachments = (f.attachment || []);
      const attachCount = allAttachments.length;
      const attachList  = allAttachments.slice(0, 8).map(a => a.filename).join(', ') || 'nenhum';

      // Separa comentarios por autor: relator vs analistas
      const allCommentsFull = (f.comment?.comments) || [];
      const reporterComments  = allCommentsFull.filter(c => c.author?.displayName === reporter);
      const analystComments   = allCommentsFull.filter(c => c.author?.displayName !== reporter && !isBot(c.author?.displayName));
      const botComments       = allCommentsFull.filter(c => isBot(c.author?.displayName));

      const fmtComment = (c, maxLen) => {
        const text = c.body ? _adfToText(c.body, maxLen || 600) : '';
        const who  = c.author?.displayName || '?';
        const when = (c.created || '').slice(0, 16).replace('T',' ');
        // Detecta imagens EMBUTIDAS neste comentario (media nodes do ADF). Isso liga a
        // imagem ao texto: o texto do comentario e a legenda/comprovacao da imagem.
        let mediaNote = '';
        try{
          const n = c.body ? _extractAttachmentIdsFromAdf(c.body).size : 0;
          if(n > 0) mediaNote = ` [CONTEM ${n} IMAGEM(NS) ANEXADA(S) NESTE COMENTARIO — o texto acima e a legenda/comprovacao dessa(s) imagem(ns)]`;
        }catch(_){}
        return `[${when} — ${who}]: ${text}${mediaNote}`;
      };

      const analystCommentsStr = analystComments.map(c => fmtComment(c, 600)).join('\n') || '(nenhum)';
      const reporterCommentsStr = reporterComments.map(c => fmtComment(c, 400)).join('\n') || '(nenhum)';

      // Changelog — filtra acoes de bots
      const changelog = data.changelog?.histories || [];

      // Transicoes de status feitas por humanos — com comentarios proximos pre-cruzados
      const WINDOW_MS = 30 * 60 * 1000; // 30 minutos
      const humanTransitions = changelog
        .filter(h => (h.items || []).some(i => i.field === 'status') && !isBot(h.author?.displayName));

      const statusHistory = humanTransitions.length
        ? humanTransitions.map(h => {
            const item  = h.items.find(i => i.field === 'status');
            const when  = (h.created || '').slice(0, 16).replace('T',' ');
            const tsH   = new Date(h.created || 0).getTime();
            // busca comentarios de analista dentro da janela de ±30min
            const nearby = allCommentsFull.filter(c => {
              if(isBot(c.author?.displayName)) return false;
              const tsC = new Date(c.created || 0).getTime();
              return Math.abs(tsC - tsH) <= WINDOW_MS;
            });
            const nearbyStr = nearby.length
              ? nearby.map(c => {
                  const who  = c.author?.displayName || '?';
                  const ct   = (c.created || '').slice(0, 16).replace('T',' ');
                  const txt  = c.body ? _adfToText(c.body, 400) : '';
                  return `      → Comentario [${ct} — ${who}]: ${txt}`;
                }).join('\n')
              : '      → Sem comentario justificando essa transicao (janela ±30 min)';
            return `${when}: "${item?.fromString}" → "${item?.toString}" (por ${h.author?.displayName || '?'})\n${nearbyStr}`;
          }).join('\n\n')
        : 'Nenhuma transicao de status por humanos';

      // Alteracoes de prioridade feitas por humanos — com comentarios proximos pre-cruzados
      const humanPrioChanges = changelog
        .filter(h => (h.items || []).some(i => i.field === 'priority') && !isBot(h.author?.displayName));

      const prioHistory = humanPrioChanges.length
        ? humanPrioChanges.map(h => {
            const item  = h.items.find(i => i.field === 'priority');
            const when  = (h.created || '').slice(0, 10);
            const tsH   = new Date(h.created || 0).getTime();
            const nearby = allCommentsFull.filter(c => {
              if(isBot(c.author?.displayName)) return false;
              const tsC = new Date(c.created || 0).getTime();
              return Math.abs(tsC - tsH) <= WINDOW_MS;
            });
            const nearbyStr = nearby.length
              ? nearby.map(c => {
                  const who = c.author?.displayName || '?';
                  const ct  = (c.created || '').slice(0, 16).replace('T',' ');
                  const txt = c.body ? _adfToText(c.body, 300) : '';
                  return `      → Comentario [${ct} — ${who}]: ${txt}`;
                }).join('\n')
              : '      → Sem comentario justificando essa mudanca (janela ±30 min)';
            return `${when}: ${item?.fromString} → ${item?.toString} (por ${h.author?.displayName || '?'})\n${nearbyStr}`;
          }).join('\n\n')
        : 'Sem alteracoes de prioridade por humanos';

      const prioChanges = humanPrioChanges; // mantém referência para o critério

      // Flag "Changed priority" (customfield configuravel): quando "Yes", indica que houve
      // reclassificacao de prioridade — mesmo aplicada por automacao — que o analista deve justificar.
      const _cpId = Number(SETTINGS.CF_CHANGED_PRIORITY || DEFAULTS.CF_CHANGED_PRIORITY || 0);
      let changedPriorityYes = false;
      if(_cpId){
        const cpv = f[`customfield_${_cpId}`];
        const cpStr = (cpv && typeof cpv === 'object') ? (cpv.value || cpv.name || '') : (cpv || '');
        changedPriorityYes = /^\s*(yes|sim|si|true)\s*$/i.test(String(cpStr));
      }

      // Reclassificações de Urgência e Impacto feitas por humanos
      const RECLASSIF_FIELDS = /^(urgencia|urgência|urgency|impacto|impact)$/i;
      const humanReclassifChanges = changelog
        .filter(h => (h.items || []).some(i => RECLASSIF_FIELDS.test(i.field || '') || RECLASSIF_FIELDS.test(i.fieldId || '')) && !isBot(h.author?.displayName));

      const reclassifHistory = humanReclassifChanges.length
        ? humanReclassifChanges.map(h => {
            const relItems = h.items.filter(i => RECLASSIF_FIELDS.test(i.field || '') || RECLASSIF_FIELDS.test(i.fieldId || ''));
            const when  = (h.created || '').slice(0, 16).replace('T',' ');
            const tsH   = new Date(h.created || 0).getTime();
            const nearby = allCommentsFull.filter(c => {
              if(isBot(c.author?.displayName)) return false;
              const tsC = new Date(c.created || 0).getTime();
              return Math.abs(tsC - tsH) <= WINDOW_MS;
            });
            const nearbyStr = nearby.length
              ? nearby.map(c => {
                  const who = c.author?.displayName || '?';
                  const ct  = (c.created || '').slice(0,16).replace('T',' ');
                  const txt = c.body ? _adfToText(c.body, 300) : '';
                  return `      → Comentario [${ct} — ${who}]: ${txt}`;
                }).join('\n')
              : '      → Sem comentario justificando essa mudanca (janela ±30 min)';
            const changesStr = relItems.map(i => `${i.field || i.fieldId}: "${i.fromString}" → "${i.toString}"`).join(', ');
            return `${when}: ${changesStr} (por ${h.author?.displayName || '?'})\n${nearbyStr}`;
          }).join('\n\n')
        : 'Sem alteracoes de Urgencia/Impacto por humanos';

      const issueTypeCtx = /request|service|solicit/i.test(issueType)
        ? 'Este e um ticket de REQUEST/servico: "Solucao Documentada" e "Solucao Efetiva" devem ser avaliados com menos rigor (o usuario pediu algo, nao reportou problema tecnico). Evidencias ainda sao importantes.'
        : /incident|bug|falha|erro/i.test(issueType)
        ? 'Este e um ticket de INCIDENT/BUG: exigir rigor maximo em Evidencias, Solucao Documentada e Solucao Efetiva.'
        : 'Avaliar com criterios padrao.';

      return `Voce e um auditor especializado em tickets de suporte tecnico de seguranca eletronica e TI da empresa Mercado Livre.
Analise o ticket abaixo com base nos CRITERIOS DE AUDITORIA e retorne um JSON estruturado.

=== DADOS DO TICKET ===
Chave: ${key}
Titulo: ${summary}
Tipo de ticket: ${issueType}
Status atual: ${statusName}${isClosed ? ' [FECHADO]' : ' [ABERTO]'}
Prioridade: ${priority}
Responsavel: ${assignee}
Relator (quem abriu): ${reporter}
Quantidade de anexos: ${attachCount}${attachCount > 0 ? ' (' + attachList + ')' : ''}
${attachCount > 0 ? 'OBS: varios desses anexos estao EMBUTIDOS nos comentarios dos analistas (veja os marcadores "[CONTEM N IMAGEM(NS)...]" ao lado de cada comentario). Nesses casos, o texto do comentario e a legenda/comprovacao da imagem — nao trate essas imagens como "sem descricao".' : ''}
${hasCategoryData ? `Categoria: ${catCategoria || '(vazio)'} | Subcategoria: ${catSubcategoria || '(vazio)'} | Tipo de solicitacao: ${catRequestType || '(vazio)'}` : ''}
${catSolutionType ? `Tipo de resolucao selecionado: ${catSolutionType}` : ''}
${catUserValidation ? `Campo "Validacao do usuario": ${catUserValidation}` : ''}

Descricao (escrita pelo relator "${reporter}"):
${desc}

Comentarios do RELATOR "${reporter}" (contexto, nao sao acoes do analista):
${reporterCommentsStr}

Comentarios dos ANALISTAS (o que foi efetivamente feito):
${analystCommentsStr}

Historico de transicoes de status (apenas acoes humanas):
${statusHistory}

Historico de prioridade (apenas acoes humanas, bots ignorados):
${prioHistory}

Historico de Urgencia/Impacto (apenas acoes humanas, bots ignorados):
${reclassifHistory}

Flag "Changed priority" (indica que a prioridade foi reclassificada, inclusive por automacao): ${changedPriorityYes ? 'SIM (Yes)' : 'NAO'}

=== REGRAS FUNDAMENTAIS ===
${(alreadyFixed && alreadyFixed.length) ? `=== ACOES JA REALIZADAS PELO ANALISTA NESTA SESSAO ===
O analista ja tomou acao nos seguintes criterios durante esta sessao de atendimento:
${alreadyFixed.map(c => `- ${c}: corrigido (substituição ou comentario ja enviado)`).join('\n')}
Para esses criterios, avalie com base no estado ATUAL do ticket e seja mais favoravel — prefira "ok" se nao houver problema evidente apos a correcao. Nao repita sugestoes que ja foram atendidas.

` : ''}IMPORTANTE — leia antes de avaliar:

A) BOTS IGNORADOS: Qualquer acao feita por "Automation for Jira", "Bot", "System" ou similar NAO deve ser avaliada nem mencionada. Esses itens ja foram filtrados nos dados acima. Nao cite bots.

B) DESCRICAO E DO RELATOR: A descricao foi escrita por "${reporter}", nao pelo analista. NAO penalize o analista pela descricao. Voce pode usar a descricao como contexto para avaliar a CONSISTENCIA do trabalho do analista, mas o score de "Descricao" deve ser no maximo "warn" mesmo se incompleta, nunca "error".

C) TICKET ABERTO — SEM COBRANCA DE SOLUCAO: O ticket esta ${isClosed ? 'FECHADO — avalie normalmente' : 'ABERTO (status: ' + statusName + '). Nao penalize pela ausencia de solucao ou validacao do usuario. Use "skip" com justificativa para: Solucao Documentada, Solucao Efetiva, Validacao Usuario, Qualidade Geral.'}.

D) EVIDENCIAS: Avalie SOMENTE as acoes do ANALISTA — comentarios com fotos, prints, logs, informacoes que o analista coletou, solicitou ou registrou. A descricao inicial do relator NAO conta como evidencia do analista.
CRITERIOS PRATICOS (seja pragmatico):
- ok: analista documentou contato com usuario E obteve/registrou alguma informacao tecnica (mesmo que brevemente), OU adicionou imagem/print como evidencia do atendimento.
- warn: analista interagiu mas o registro e vago demais para outro tecnico entender o que foi feito ou coletado.
- error: analista nao tomou nenhuma acao de coleta, comunicacao ou registro de evidencias.
NAO exija mais evidencias do que o analista ja forneceu. Se ele contactou, coletou informacoes e registrou o contato, isso e suficiente para "ok". Nao sugira prints adicionais se o problema ja foi tratado.

F) CANAIS DE COMUNICACAO: Google Chat e WhatsApp SAO canais oficiais deste time. NAO critique nem sinalize o uso desses canais como problema. Apenas critique canais claramente inadequados (email pessoal externo, redes sociais, etc).

G) SLA E VISITA TECNICA: NAO sugira SLAs especificos (ex: "24-48 horas", "3-7 dias") nem "visita tecnica" ou "atendimento presencial" a menos que esses termos ja estejam explicitamente mencionados no ticket.

H) IMAGENS E ANEXOS: Se o ticket tem imagens ou anexos, reconheca que existem mas NAO escreva frases como "analisaremos a imagem", "verificaremos o anexo", "vamos analisar o print" nos suggested_text ou closing_comment. As imagens sao contexto — nao promessa de analise futura. Se um analista enviou uma imagem como evidencia de contato, isso E a evidencia — nao ha nada a "analisar" depois.
   IMPORTANTE: anexos enviados PELO USUARIO (fotos/prints do problema) contam como EVIDENCIA VISUAL VALIDA e como contexto do chamado. NAO exija que o analista "confirme a analise dos anexos", NAO sugira comentario dizendo que os anexos foram analisados, e NAO penalize por falta de "analise dos anexos". Se ha anexos relevantes no ticket, considere a evidencia visual ja presente — trate como ponto positivo, nao como pendencia. Voce NAO ve o conteudo das imagens; entao nunca afirme o que elas mostram nem exija descricao do que elas contem.
   REGRA-CHAVE (texto = legenda da imagem): quando um comentario/texto do analista DESCREVE uma acao e ha um anexo/imagem associado, o TEXTO ja diz o que a imagem comprova — trate a imagem como a COMPROVACAO daquela acao, evidencia COMPLETA. Exemplos: "Contato realizado via WhatsApp" + print = o print e a prova do contato (ok); "Validado queda nas metricas" + imagem = a imagem e a validacao da queda (ok). NUNCA peça que o analista descreva de novo o que a imagem mostra nem "confirme" o anexo — o texto que acompanha ja e a confirmacao.
   IMAGENS COM LINK QUEBRADO (blob:): e comum um comentario referenciar uma imagem via link "blob:" que nao carrega mais fora do navegador original (o link e temporario). Isso NAO significa que a evidencia nao existia — trate o comentario associado (ex: "Contato realizado", "Validacao", "Metricas", "Taxa de impressao", "NOC acionado", "SEV4 criado", checagem de VPN/VLAN/DNS/latencia) como evidencia tecnica real mesmo com o link quebrado. NAO critique "falta de evidencia" so por causa do link nao carregar.

E) ESCRITA: Avalie apenas o texto original do ticket — nao penalize por truncamentos ou quebras que possam ter ocorrido no processamento. Se um texto parece incompleto, prefira "warn" a "error".

I) GUARDRAIL DE INTEGRIDADE: o objetivo desta auditoria e melhorar a qualidade REAL da documentacao — nao ensinar a "maquiar" o ticket pra passar na auditoria sem o trabalho correspondente ter sido feito. Se o atendimento foi genuinamente deficiente (sem evidencia nenhuma, resolucao incoerente com o problema, etapa claramente pulada), sinalize isso como um problema REAL a corrigir (warn/error de verdade) — nunca redija um suggested_text que simule uma qualidade que nao existiu. O suggested_text so pode compor texto a partir do que JA foi feito/coletado; se nao ha o que compor, deixe "" e diga isso no detail.

J) DELIMITACAO DE ESCOPO: voce avalia qualidade de DOCUMENTACAO, CATEGORIZACAO e COERENCIA do registro — voce NAO julga se a decisao tecnica em si foi a correta (ex: nao avalia se reiniciar o equipamento era a acao certa tecnicamente, so se isso esta bem registrado, categorizado e coerente com o que foi relatado). Nao extrapole pra opinar sobre a qualidade da decisao tecnica do analista.

K) ESCALONAMENTO (baixa confianca): se o caso for genuinamente ambiguo — informacao insuficiente pra decidir com seguranca, ou situacao que nao se encaixa claramente nas regras acima — NAO force um veredito confiante. Use "confidence":"baixa" nesse item, comece o "detail" com "[REVISAO HUMANA]" e descreva a pergunta pendente especifica que um analista humano precisaria responder. Isso vale mais do que "chutar" ok/error com confianca alta.

=== CONTEXTO DO TIPO DE TICKET ===
${issueTypeCtx}

=== CRITERIOS DE AUDITORIA ===
Avalie cada criterio e retorne "ok", "warn", "error" ou "skip":

1. EVIDENCIAS
   O ANALISTA adicionou evidencias (fotos, prints, logs, informacoes tecnicas coletadas) em seus comentarios?
   NAO considere a descricao inicial do relator como evidencia do analista.
   - ok: analista adicionou ou solicitou evidencias visuais/tecnicas explicitamente.
   - warn: analista mencionou o problema mas nao coletou/solicitou evidencias.
   - error: nenhuma acao do analista relacionada a coleta de evidencias.
   Se ticket aberto, avaliar apenas evidencias coletadas ate o momento.

2. DESCRICAO
   A descricao do relator esta clara e coerente com o tipo de problema/equipamento?
   Lembre: escrita pelo relator, max "warn", nunca "error".
   Use no "detail" o que esta vago ou faltando no relato original.
   Se warn, "suggested_text" pode ser uma descricao enriquecida — porem SOMENTE com informacoes JA COLETADAS no ticket (relato + comentarios do analista + dados obtidos durante o atendimento). Ver regra detalhada em "suggested_text" abaixo.

3. CATEGORIA
   ${hasCategoryData
     ? `Categoria/Subcategoria/Tipo de solicitacao atuais: "${catCategoria || '(vazio)'}" / "${catSubcategoria || '(vazio)'}" / "${catRequestType || '(vazio)'}".
   Compare com a CAUSA RAIZ REAL discutida nos comentarios dos analistas — nao so a queixa inicial do relator (o sintoma inicial pode nao refletir o que foi de fato investigado; ex: "instabilidade" pode virar "lentidao por sobrecarga de AP" ou "queda intermitente real" dependendo do que foi apurado).
   IMPORTANTE: a categoria inicial normalmente e preenchida pelo PROPRIO SOLICITANTE no portal ao abrir o chamado, nao pelo analista. O analista tem autonomia pra corrigir mas nem sempre corrige — uma categoria errada nao e automaticamente "culpa" do analista, mas se a causa raiz apurada e claramente diferente da categoria e o analista nao ajustou nem comentou, isso e um ajuste legitimo a sinalizar.
   - ok: categoria/subcategoria coerente com a causa raiz discutida, OU categoria inicial ficou desatualizada mas o analista corrigiu/comentou a divergencia.
   - warn: categoria parcialmente incoerente com o que foi apurado, sem correcao nem comentario.
   - error: categoria claramente incompativel com a causa raiz discutida (ex: aberto como um tipo de equipamento, mas a investigacao real foi sobre outro totalmente diferente) e nada foi ajustado/comentado.
   Se "warn"/"error", "suggested_text" = comentario sugerindo a recategorizacao correta com base no que foi apurado (nunca invente uma categoria que nao exista no ticket/contexto).`
     : 'Campos de categoria nao configurados nas Configuracoes (CF_CATEGORY/CF_SUBCATEGORY/CF_REQUEST_TYPE) — use "skip".'}

4. STATUS COMENTADO
   Para cada transicao de status no historico acima, ja estao listados os comentarios que ocorreram dentro de ±30 min.
   Se uma transicao ja aparece com "→ Comentario [...]", ela ESTA justificada — marque como ok.
   Apenas transicoes com "→ Sem comentario justificando" podem ser warn/error.
   Se TODAS as transicoes tem comentario proximo = ok. Se algumas faltam = warn. Se nenhuma tem = error.

5. ESCRITA
   Os comentarios dos ANALISTAS estao claros, profissionais e compreensiveis?
   Avalie apenas textos de analistas, nao do relator.

6. SOLUCAO DOCUMENTADA
   ${isClosed
     ? `Foi registrado O QUE o analista fez para resolver? Acoes de diagnostico e tratamento realizadas?
   RASTREABILIDADE: se o fechamento menciona algo tipo "carta de risco", handoff pra outro time, ticket vinculado, escalonamento, etc. SEM numero/link/referencia identificavel, isso e um ajuste a sinalizar (warn) — pedir que cite a referencia especifica.
   HANDOFF: se a resolucao foi handoff/redirecionamento pra outro time, NAO cobre do analista documentacao do diagnostico tecnico que e responsabilidade do OUTRO time — ele nao tem visibilidade da tratativa de quem recebeu. Cobre so que o handoff em si esteja registrado com referencia.`
     : 'Ticket ainda aberto. Use "skip".'}

7. SOLUCAO EFETIVA
   ${isClosed
     ? `A solucao documentada resolve de fato o problema da descricao? Ha coerencia entre problema e solucao?
   ${catSolutionType ? `CONSISTENCIA TIPO DE RESOLUCAO × NARRATIVA (o erro mais caro observado em auditorias reais): o tipo de resolucao selecionado e "${catSolutionType}". Cruze com o VERBO da acao relatada pelo analista:
   - "No technical intervention" (ou similar "sem intervencao tecnica"): valido quando a resolucao efetiva veio de OUTRO LUGAR (outro time/ticket vinculado, carta de risco, escalonamento formal) — mesmo que o analista tenha feito alguma acao tecnica que NAO foi o que resolveu.
   - "Invalid Channel" (canal invalido): valido quando a causa raiz real esta fora do escopo desta fila (ex: problema de sistema/software que foi so roteado/redirecionado pra outro time).
   - "Operational User Error" (erro operacional do usuario): valido quando a solucao foi so orientacao/instrucao ao usuario, sem nenhuma acao de sistema do analista.
   - "With technical intervention" (com intervencao tecnica): exige acao tecnica REAL e documentada (ex: reiniciar servico, instalar driver, trocar peca). Se o tipo escolhido e este mas o relato so descreve orientacao ou redirecionamento (sem acao tecnica de fato), isso E incoerencia real a sinalizar — nao invente uma acao tecnica que nao foi relatada.
   Se o tipo escolhido contradiz o verbo da acao relatada (ex: marcado "with technical intervention" mas o texto so diz "orientei o usuario a reiniciar"), marque warn/error e explique a incoerencia especifica no "detail".` : ''}`
     : 'Ticket ainda aberto. Use "skip".'}

8. VALIDACAO USUARIO
   ${isClosed
     ? `Houve confirmacao do usuario de que o problema foi resolvido, ou justificativa de N/A (ex: compliance)?${catUserValidation ? ` Campo "Validacao do usuario" no ticket: "${catUserValidation}" — considere esse valor como parte da avaliacao (ele deve refletir se e como o usuario foi validado/contatado; se estiver vazio ou incoerente com o que os comentarios descrevem, sinalize).` : ''}`
     : 'Ticket ainda aberto. Use "skip".'}

9. RECLASSIFICACAO (Prioridade, Urgencia, Impacto)
   ${(prioChanges.length || humanReclassifChanges.length || changedPriorityYes)
     ? `Houve reclassificacao (mudancas por humanos e/ou flag "Changed priority" = SIM):
   ${prioChanges.length ? `Prioridade: ${prioHistory}` : '(Prioridade: sem mudanca por humanos no changelog)'}
   ${humanReclassifChanges.length ? `Urgencia/Impacto: ${reclassifHistory}` : '(Urgencia/Impacto: sem mudanca por humanos)'}
   ${changedPriorityYes ? 'Flag "Changed priority" = SIM: a prioridade FOI reclassificada (possivelmente disparada por automacao apos acao do analista). Mesmo que a mudanca de prioridade nao apareca como acao humana no changelog, o analista DEVE ter justificado o motivo da reclassificacao. Trate como reclassificacao a ser justificada.' : ''}

   Avalie: ha comentario do analista justificando as mudancas dentro da janela de ±30 min?
   - ok: ha comentario explicando o motivo real das mudancas (impacto confirmado, solicitacao do usuario, analise tecnica etc).
   - warn: ha comentario mas nao explica os motivos das mudancas especificamente.
   - error: nenhum comentario justificando as mudancas (inclui: flag "Changed priority" = SIM sem nenhum comentario do analista explicando por que a prioridade mudou).
   Para warn/error, "suggested_text" deve ser um unico comentario cobrindo TODAS as mudancas detectadas, no formato:
   "Reclassificando [campo] de '[de]' para '[para]': [motivo baseado no contexto do ticket]. [outros campos se houver, mesma logica]." Se so houver o flag (sem valores de/para no changelog), use "Reclassificacao de prioridade: [motivo baseado no impacto/urgencia real descrito no ticket]."
   Use os dados reais do ticket (equipamento, problema, impacto real descrito) para tornar o comentario especifico. Seja conciso.`
     : 'Nenhuma reclassificacao (Prioridade/Urgencia/Impacto por humanos, nem flag "Changed priority"). Use "skip".'}

10. QUALIDADE GERAL
   ${isClosed
     ? 'Holistica: outra pessoa entenderia o que aconteceu, o que foi feito e o resultado?'
     : 'Ticket ainda aberto. Use "skip".'}

=== AVALIACAO ADICIONAL (NAO afeta o score) ===
TITULO (title_review): O titulo/summary do ticket "${summary}" e claro, especifico e coerente com a descricao do problema?
   - ok: titulo descreve bem o problema (equipamento + sintoma/local quando aplicavel). "suggested_text" = "".
   - warn: titulo generico, vago ou incompleto (ex: so "impressora", "erro", "problema"). Pode melhorar.
   - error: titulo discrepante da descricao (fala de uma coisa, descricao e de outra) ou totalmente inutil.
   Para warn/error, "suggested_text" = um titulo melhor em UMA LINHA (sem quebras), sintetizando o contexto do chamado a partir de TODAS as informacoes ja presentes no ticket (relato + dados coletados nos comentarios do analista): equipamento, sintoma, local/localidade. Use APENAS o que ja foi coletado, NUNCA invente nem coloque pendencias. "detail" = por que o titulo atual e fraco.
   Sinalize so DIVERGENCIAS RELEVANTES de escopo entre titulo e descricao (titulo fala de um problema, descricao de outro completamente diferente) — pequenas variacoes de wording ou faixas que quase coincidem NAO justificam warn/error.

=== INSTRUCOES DE RESPOSTA ===
Responda SOMENTE com JSON valido. Sem markdown. Sem texto fora do JSON.
"status" validos: "ok" | "warn" | "error" | "skip"
"confidence": "alta" | "media" | "baixa" — o quanto voce tem certeza deste veredito com base no que esta escrito no ticket.
  Use "baixa" sempre que o caso for genuinamente ambiguo ou a informacao disponivel for insuficiente pra decidir com seguranca — nesse caso, comece o "detail" com "[REVISAO HUMANA]" e descreva a pergunta pendente especifica (ver regra K). NAO force confianca "alta" so pra parecer decisivo.
"detail": especifico, cite o que voce viu no ticket.
"evidence_quote": uma citacao BREVE (max ~25 palavras), copiada literalmente da descricao ou de um comentario, que sustenta o veredito deste criterio — nunca uma recomendacao "solta" sem referencia ao texto que a motivou. Se "skip" ou se não há trecho específico aplicável (ex: ausência total de algo), deixe "".
"suggestion": se "warn" ou "error", acao concreta para corrigir. Se "ok" ou "skip", deixe "".
"suggested_text": se "warn" ou "error", escreva o rascunho de texto exato conforme o tipo do criterio:
  - "Descricao": escreva uma descricao enriquecida do chamado integrando TODAS as informacoes JA PRESENTES no ticket — o relato original do usuario MAIS os dados coletados nos comentarios do analista durante o atendimento (equipamento, sistema, local, sintoma, contexto). Escreva como uma descricao real do problema, em terceira pessoa, corrida. REGRA CRITICA: use APENAS o que ja foi coletado; se um dado NAO foi coletado, simplesmente nao o inclua. NUNCA escreva pendencias, perguntas ou placeholders (ex: "confirmar equipamento", "necessario saber o SO", "numero de serie a definir", "[campo]") — a descricao nao pode conter nada a confirmar. Se o ticket ainda nao tem informacao coletada suficiente para enriquecer o relato original de forma util, deixe "".
  - "Categoria": comentario sugerindo a recategorizacao correta com base na causa raiz apurada (ver regra do criterio 3). Nunca invente uma categoria que nao exista no contexto do ticket.
  - "Status Comentado": escreva o comentario que deveria ter sido adicionado na transicao de status. Use apenas contexto real do ticket. NAO sugira SLA nem "visita tecnica" se esses termos nao constam no ticket.
  - "Reclassificacao": escreva um unico comentario justificando TODAS as mudancas de classificacao detectadas (Prioridade, Urgencia e/ou Impacto) no formato: "Reclassificando [campo] de '[X]' para '[Y]': [motivo especifico baseado no ticket]. [campos adicionais se houver, mesma logica]." Seja conciso, use dados reais do ticket.
  - "Evidencias", "Solucao Documentada", "Solucao Efetiva", "Validacao Usuario", "Qualidade Geral", "Escrita": escreva o comentario ou texto que o tecnico deveria adicionar ao ticket para corrigir a pendencia.
  Seja pratico, adapte ao contexto real do ticket, use os nomes/dados ja presentes no ticket.
  Se "ok" ou "skip", deixe "".
  GUARDRAIL (regra I): nunca componha um suggested_text que simule um trabalho/qualidade que nao aconteceu de fato — se nao ha base real no ticket pra compor o texto, deixe "" e explique no "detail" que falta insumo real, em vez de inventar.

RUBRICA DE SCORE:
- Cada criterio (10 no total): ok=10 | warn=5 | error=0 | skip=10 (skip nao penaliza).
- Some os pontos → "score" de 0 a 100.

"closing_comment": ${isClosed
  ? 'Ticket ja esta fechado. Deixe "".'
  : `Escreva o modelo de comentario que o tecnico deve adicionar AO FECHAR o ticket. Use paragrafos separados por linha em branco (\\n\\n entre cada bloco). Estrutura:
  Paragrafo 1: O que foi identificado / problema resolvido (1-2 frases, usando dados reais do ticket).
  Paragrafo 2: O que foi feito / solucao aplicada (baseie-se nos comentarios do analista).
  Paragrafo 3: Instrucao ao usuario — SEMPRE use esta logica: "Caso o problema volte a ocorrer, por favor reabra este chamado ou crie um novo ticket com as novas informacoes." NAO sugira contato via Google Chat, WhatsApp ou outros canais externos.
  Linha final: "Atenciosamente," + nome do responsavel.
  Seja especifico com dados reais (equipamento, serial, acoes). Tom profissional e direto. Sem placeholders.`}

"comment_reviews": Revisao INFORMATIVA dos comentarios dos analistas — NAO afeta o score nem os criterios acima. O objetivo e apenas sugerir melhorias de escrita, nao penalizar.
  Para CADA comentario dos ANALISTAS (nao do relator, nao de bots), avalie individualmente:
  - "id": indice do comentario (0, 1, 2...)
  - "author": nome do autor
  - "date": data/hora do comentario (YYYY-MM-DD HH:mm)
  - "excerpt": primeiros 80 caracteres do comentario original
  - "status": "ok" se o comentario esta claro e profissional | "warn" se existe uma versao melhor que poderia ser escrita
  - "issue": se "warn", descreva em 1 frase o que poderia ser melhorado (clareza, precisao, tom, completude). Se "ok", deixe "".
  - "improved": se "warn", reescreva o comentario de forma mais clara, precisa e profissional — mantendo o conteudo original mas melhorando a forma. Se "ok", deixe "".
  Inclua apenas comentarios com "warn" (que tem sugestao de melhoria). Se todos estiverem bons, retorne array vazio [].
  Se nao houver comentarios de analistas, retorne array vazio [].

Formato exato (todo item de "items" e o "title_review" seguem {"check","status","confidence","detail","evidence_quote","suggestion","suggested_text"}):
{"score":0,"items":[{"check":"Evidencias","status":"ok","confidence":"alta","detail":"texto","evidence_quote":"","suggestion":"","suggested_text":""},{"check":"Descricao","status":"ok","confidence":"alta","detail":"texto","evidence_quote":"","suggestion":"","suggested_text":""},{"check":"Categoria","status":"skip","confidence":"alta","detail":"texto","evidence_quote":"","suggestion":"","suggested_text":""},{"check":"Status Comentado","status":"ok","confidence":"alta","detail":"texto","evidence_quote":"","suggestion":"","suggested_text":""},{"check":"Escrita","status":"ok","confidence":"alta","detail":"texto","evidence_quote":"","suggestion":"","suggested_text":""},{"check":"Solucao Documentada","status":"ok","confidence":"alta","detail":"texto","evidence_quote":"","suggestion":"","suggested_text":""},{"check":"Solucao Efetiva","status":"ok","confidence":"alta","detail":"texto","evidence_quote":"","suggestion":"","suggested_text":""},{"check":"Validacao Usuario","status":"ok","confidence":"alta","detail":"texto","evidence_quote":"","suggestion":"","suggested_text":""},{"check":"Reclassificacao","status":"skip","confidence":"alta","detail":"texto","evidence_quote":"","suggestion":"","suggested_text":""},{"check":"Qualidade Geral","status":"ok","confidence":"alta","detail":"texto","evidence_quote":"","suggestion":"","suggested_text":""}],"summary":"resumo de 1-2 frases do estado geral","closing_comment":"texto","title_review":{"status":"ok","confidence":"alta","detail":"texto","evidence_quote":"","suggestion":"","suggested_text":""},"comment_reviews":[{"id":0,"author":"nome","date":"2026-01-01 10:00","excerpt":"primeiros 80 chars...","status":"warn","issue":"o que esta impreciso","improved":"versao reescrita completa"}]}`;
    }

    // Abre o campo de comentario do Jira e preenche com o texto fornecido.
    // Estrategia: clica no botao "Add comment" do Jira para abrir o editor,
    // aguarda o contenteditable aparecer e insere o texto paragrafo a paragrafo.
    // Se nao conseguir encontrar o editor, cai no clipboard (texto ja copiado pelo caller).
    function _openJiraCommentWithText(text){
      // Seletores do botao "Adicionar comentario" no Jira Cloud
      const addBtnSelectors = [
        '[data-testid="comment-add-button"]',
        'button[aria-label*="omment"]',
        'button[aria-label*="oment"]',
        '#footer-comment-button',
        '.comment-add-button',
        '[data-testid="issue.activity.comment-add-button"]'
      ];

      let addBtn = null;
      for(const sel of addBtnSelectors){
        addBtn = document.querySelector(sel);
        if(addBtn) break;
      }

      if(addBtn){
        addBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        addBtn.click();
      }

      // Seletores do editor contenteditable do Jira (Atlassian Editor / ProseMirror)
      const editorSelectors = [
        '[data-testid="comment-input-wrapper"] div[contenteditable="true"]',
        '[data-testid="rich-text-editor-listener"] div[contenteditable="true"]',
        '.ak-editor-content-area div[contenteditable="true"]',
        '#comment-footer div[contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]'
      ];

      let attempts = 0;
      const tryFill = () => {
        let editor = null;
        for(const sel of editorSelectors){
          const el = document.querySelector(sel);
          // Precisa estar visível E fora de um campo de descrição/título — o fallback
          // genérico (`div[contenteditable="true"]`) casa com QUALQUER editor ProseMirror
          // aberto na página, então sem essa exclusão explícita ele podia escrever o
          // comentário dentro da descrição/título se esses campos estivessem em edição.
          if(el && el.offsetParent !== null && !el.closest('[data-testid*="description"],[data-testid*="summary"]')){
            editor = el;
            break;
          }
        }

        if(editor){
          editor.focus();
          // Limpa placeholder se houver (ProseMirror coloca <br> como placeholder)
          const isEmpty = editor.innerText.trim() === '' || editor.innerHTML === '<p><br></p>' || editor.innerHTML === '<br>';
          if(isEmpty) document.execCommand('selectAll', false);

          // Insere paragrafo a paragrafo
          const paragraphs = text.split(/\n\n+/);
          paragraphs.forEach((para, i) => {
            const lines = para.split('\n');
            lines.forEach((line, j) => {
              if(line) document.execCommand('insertText', false, line);
              if(j < lines.length - 1) document.execCommand('insertText', false, '\n');
            });
            if(i < paragraphs.length - 1) document.execCommand('insertParagraph', false);
          });

          showToast('✓ Comentário inserido no Jira', 'success', 3000);
        } else if(attempts < 20){
          attempts++;
          setTimeout(tryFill, 250);
        } else {
          // Fallback: texto ja esta no clipboard pelo caller
          showToast('Cole o comentário com Cmd+V (texto já copiado)', 'info', 5000);
        }
      };

      // Aguarda o editor renderizar apos o clique
      setTimeout(tryFill, addBtn ? 500 : 100);
    }

    // Executa a auditoria: coleta dados do ticket, chama webhook, exibe resultado
    // Núcleo da auditoria (sem UI): busca o ticket, monta o prompt, chama o webhook
    // (com retry em erro de gateway), parseia o resultado, salva cache/histórico e
    // marca uso. Usado tanto pelo runAudit (ticket único, com painel) quanto pela
    // auditoria em lote (Gerenciador de fila, sem painel — só progresso/score).
    // Lança erro em qualquer falha; quem chama decide como mostrar.
    async function _runAuditCore(issueKey, opts){
      opts = opts || {};
      const webhookUrl = SETTINGS.AUDIT_WEBHOOK_URL;
      if(!webhookUrl) throw new Error('Webhook de auditoria não configurado (Configurações → Avançado → Integrações).');

      // Busca ticket com changelog + campos relevantes
      const _cpId = Number(SETTINGS.CF_CHANGED_PRIORITY || DEFAULTS.CF_CHANGED_PRIORITY || 0);
      const fields = 'summary,description,priority,status,attachment,comment,issuetype,labels,assignee,reporter'
        + (_cpId ? `,customfield_${_cpId}` : '');
      const resp = await fetch(
        `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}?expand=changelog&fields=${fields}`,
        { credentials: 'same-origin', headers: { 'Accept': 'application/json' } }
      );
      if(!resp.ok) throw new Error(`Jira API HTTP ${resp.status}`);
      const data = await resp.json();

      const fixedChecks = _auditFixedChecks.get(issueKey);
      const prompt = _buildAuditPrompt(data, fixedChecks ? [...fixedChecks] : []);

      // Busca ate 3 anexos de imagem e codifica como base64
      const imgAttachments = (data.fields?.attachment || [])
        .filter(a => /\.(jpg|jpeg|png|gif|webp)$/i.test(a.filename))
        .slice(0, 3);
      const images = [];
      for(const att of imgAttachments){
        try{
          const ir = await fetch(att.content, { credentials: 'same-origin' });
          if(!ir.ok) continue;
          const blob = await ir.blob();
          const base64 = await new Promise(res => {
            const reader = new FileReader();
            reader.onloadend = () => res(reader.result.split(',')[1]);
            reader.readAsDataURL(blob);
          });
          images.push({ filename: att.filename, base64, mimeType: blob.type || 'image/jpeg' });
        }catch(e){}
      }

      // Envia para o webhook n8n via GM_xmlhttpRequest (bypassa CORS) com retry em 503
      const _callWebhook = () => new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'POST',
          url: webhookUrl,
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ prompt, issueKey, images }),
          timeout: 60000,
          onload(r){
            if(r.status < 200 || r.status >= 300){
              return reject(Object.assign(new Error(`Webhook HTTP ${r.status}: ${r.responseText?.slice(0,200)}`), { status: r.status }));
            }
            try{ resolve(JSON.parse(r.responseText)); }
            catch{ resolve({ result: r.responseText }); }
          },
          onerror(){ reject(new Error('Erro de rede ao chamar o webhook')); },
          ontimeout(){ reject(new Error('Timeout — webhook demorou mais de 60s')); }
        });
      });

      let wData, lastErr;
      for(let attempt = 1; attempt <= 3; attempt++){
        try{
          if(attempt > 1){
            const delay = attempt === 2 ? 3000 : 7000;
            if(opts.onRetry) opts.onRetry(attempt);
            await new Promise(r => setTimeout(r, delay));
          }
          wData = await _callWebhook();
          break;
        }catch(e){
          lastErr = e;
          if(e.status !== 503 && e.status !== 502 && e.status !== 504) throw e; // só retry em erros de gateway
        }
      }
      if(!wData) throw lastErr;

      // Extrai e parseia o JSON da resposta da IA
      let result;
      try{
        const raw = wData.result ?? wData.text ?? wData.output ?? JSON.stringify(wData);
        const clean = (typeof raw === 'string')
          ? raw.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim()
          : raw;
        result = (typeof clean === 'string') ? JSON.parse(clean) : clean;
      }catch(pe){
        throw new Error('Resposta da IA nao e JSON valido. Verifique o workflow no n8n.');
      }

      if(result && typeof result === 'object') result._prompt_version = AUDIT_PROMPT_VERSION;
      _saveAuditGM(issueKey, result);
      _saveScoreHistory(issueKey, result?.score ?? 0, result?.items);
      _markToolkitUsage(issueKey).catch(()=>{});
      return result;
    }

    async function runAudit(modal, issueKey){
      if(!SETTINGS.AUDIT_WEBHOOK_URL){
        showToast('Configure o Webhook de auditoria em Configuracoes → Avancado → Integracoes', 'warn');
        return;
      }

      const btn = document.getElementById('ml_home_audit');
      if(btn){ btn.disabled = true; btn.textContent = 'Analisando...'; }

      try{
        const result = await _runAuditCore(issueKey, {
          onRetry: (attempt) => { if(btn) btn.textContent = `Tentativa ${attempt}/3...`; }
        });
        showAuditPanel(modal, issueKey, result, true);
      }catch(e){
        showToast('Auditoria falhou: ' + (e.message || String(e)), 'error', 6000);
        if(btn){ btn.disabled = false; btn.textContent = 'Auditar'; }
      }
    }

    // Injeta badge de score no <h1> do titulo do ticket
    // Badge separado removido — score agora vive no arco SVG dentro do chip ambient
    function _injectScoreBadge(){ document.getElementById('ml_score_badge')?.remove(); }

    // Atualiza badge e chip ambient com novo score calculado em tempo real
    function _refreshScoreDisplay(newScore, items, onClickFn){
      try{
        _injectScoreBadge(newScore, onClickFn);
        _injectAuditAmbient(newScore, items, onClickFn);
        // Atualiza score no header da sidebar se estiver aberta
        const sidebarScore = document.querySelector('#ml_audit_hints_bar [data-ml-score]');
        if(sidebarScore){
          const c = newScore>=80?'#34c578':newScore>=50?'#f59e0b':'#ef4444';
          sidebarScore.textContent = String(newScore);
          sidebarScore.style.color = c;
        }
        // Atualiza cache em memória
        if(_auditCache) _auditCache.score = newScore;
      }catch(e){}
    }

    // Retorna true se o nome da transicao e uma transicao de fechamento/conclusao
    function _isFinalTransition(name){
      return /^(close|closed|resolve|resolved|done|encerr|finaliz|conclu)/i.test((name||'').trim());
    }

    // Historico de scores — guarda ultimos 30 resultados de auditoria
    function _saveScoreHistory(issueKey, score, items){
      try{
        const key = 'ml_audit_scores_v1';
        const raw = _gmGet(key);
        const hist = raw ? JSON.parse(raw) : [];
        const filtered = hist.filter(h => h.k !== issueKey);
        filtered.push({ k: issueKey, s: score, ts: Date.now(), w: (items||[]).filter(i=>i.status==='error').map(i=>i.check) });
        const trimmed = filtered.slice(-30);
        _gmSet(key, JSON.stringify(trimmed));
      }catch(e){}
    }

    function _loadScoreHistory(){
      try{ const raw = _gmGet('ml_audit_scores_v1'); return raw ? JSON.parse(raw) : []; }
      catch(e){ return []; }
    }

    // Exibe o painel de resultado da auditoria
    function showAuditPanel(modal, issueKey, result, fromRun){
      const score   = typeof result?.score === 'number' ? result.score : 0;
      const items   = Array.isArray(result?.items) ? result.items : [];
      const summary = result?.summary || '';

      const scoreColor = score >= 80 ? '#34c578' : score >= 50 ? '#f59e0b' : '#ef4444';
      const scoreLabel = score >= 80 ? 'Bom' : score >= 50 ? 'Regular' : 'Atencao';

      const iconMap  = { ok: '✅', warn: '⚠️', error: '❌', skip: '—' };
      const labelMap = { ok: 'OK', warn: 'Atenção', error: 'Pendente', skip: 'N/A' };
      const colorMap = { ok: '#34c578', warn: '#f59e0b', error: '#ef4444', skip: 'var(--ml-text-dim)' };

      const closingComment = (result?.closing_comment || '').trim();
      const closingBlock = closingComment ? `
        <details style="border-top:1px solid var(--ml-border);">
          <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;padding:11px 2px;font-size:13px;font-weight:600;">
            <span style="width:8px;height:8px;border-radius:50%;background:#60a5fa;flex:0 0 auto;"></span>
            Comentário de fechamento
            <span style="margin-left:auto;font-size:14px;color:var(--ml-text-dim);">›</span>
          </summary>
          <div style="padding:2px 2px 12px 20px;">
            <div style="display:flex;gap:6px;margin-bottom:8px;">
              <button id="ml_audit_copy_closing" style="font-size:11px;background:#60a5fa;border:none;border-radius:5px;padding:3px 12px;cursor:pointer;color:#04121f;font-weight:600;">Copiar (colar no campo Solução)</button>
            </div>
            <div style="font-size:10.5px;color:var(--ml-text-dim);margin-bottom:6px;">Este texto é a <b>solução</b> — cole no campo Solução ao encerrar o ticket.</div>
            <div id="ml_audit_closing_text" style="font-size:12.5px;color:var(--ml-text);line-height:1.6;">${closingComment.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n\n/g,'</p><p style="margin:8px 0 0;">').replace(/\n/g,'<br>')}</div>
          </div>
        </details>` : '';

      const itemsHtml = items.map((item, idx) => {
        const st = item.status || 'skip';
        const dot = colorMap[st];
        const isPending = st === 'warn' || st === 'error';
        const hasSugText = !!(item.suggested_text && item.suggested_text.trim());
        const isDesc = item.check === 'Descricao';
        const sugLabel = isDesc ? '📝 Descrição sugerida (com o que já foi coletado):' : '💡 Texto sugerido para adicionar:';
        const actionBtnLabel = isDesc ? 'Substituir no Jira' : 'Usar como comentário';
        const sugBlock = hasSugText ? `
          <div style="margin-top:8px;padding:8px 10px;background:var(--ml-bg-1);border-radius:6px;">
            <div style="font-size:11px;color:#8b9ab5;margin-bottom:5px;font-weight:600;">${sugLabel}</div>
            <div id="ml_sugtext_${idx}" style="font-size:12px;color:var(--ml-text);line-height:1.5;white-space:pre-wrap;">${(item.suggested_text||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
            <div style="display:flex;gap:6px;margin-top:7px;">
              <button id="ml_sugaction_${idx}" style="font-size:11px;background:#60a5fa;border:none;border-radius:5px;padding:3px 10px;cursor:pointer;color:#04121f;font-weight:600;">${actionBtnLabel}</button>
              <button id="ml_sugcopy_${idx}" style="font-size:11px;background:none;border:1px solid var(--ml-border);border-radius:5px;padding:3px 10px;cursor:pointer;color:var(--ml-text-dim);">Copiar</button>
            </div>
          </div>` : '';

        const isLowConf = item.confidence === 'baixa';
        const confBadge = isLowConf ? `<span title="Confiança baixa — vale revisão humana antes de aplicar" style="font-size:10px;color:#f59e0b;border:1px solid #f59e0b;border-radius:4px;padding:0 5px;white-space:nowrap;">baixa confiança</span>` : '';
        const evidenceBlock = (item.evidence_quote && item.evidence_quote.trim())
          ? `<div style="font-size:11.5px;color:var(--ml-text-dim);font-style:italic;line-height:1.5;margin-top:4px;border-left:2px solid var(--ml-border);padding-left:8px;">"${item.evidence_quote.replace(/</g,'&lt;').replace(/>/g,'&gt;')}"</div>`
          : '';

        if(isPending){
          return `
            <details data-st="${st}" open style="border-top:1px solid var(--ml-border);">
              <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px;padding:9px 2px;font-size:13px;">
                <span style="width:8px;height:8px;border-radius:50%;background:${dot};flex:0 0 auto;"></span>
                <span style="flex:1;font-weight:600;">${item.check || '?'}</span>
                ${confBadge}
                <span style="font-size:11px;color:${dot};white-space:nowrap;">${labelMap[st] || st}</span>
              </summary>
              <div style="padding:0 2px 12px 28px;">
                <div style="font-size:12.5px;color:var(--ml-text-dim);line-height:1.55;${hasSugText?'margin-bottom:8px;':''}">${item.detail || ''}</div>
                ${evidenceBlock}
                ${sugBlock}
              </div>
            </details>`;
        }
        // OK / N/A: linha compacta, discreta
        return `
          <div data-st="${st}" style="border-top:1px solid var(--ml-border);display:flex;align-items:center;gap:10px;padding:9px 2px;font-size:13px;color:var(--ml-text-dim);">
            <span style="width:8px;height:8px;border-radius:50%;background:${dot};flex:0 0 auto;"></span>
            <span style="flex:1;">${item.check || '?'}</span>
            <span style="font-size:11px;color:${dot};white-space:nowrap;">${labelMap[st] || st}</span>
          </div>`;
      }).join('');

      const _pendingCount = items.filter(i => i.status==='error' || i.status==='warn').length;
      const _okCount = items.filter(i => i.status==='ok').length;
      const _crCount = Array.isArray(result?.comment_reviews) ? result.comment_reviews.length : 0;
      const _crWarn  = Array.isArray(result?.comment_reviews) ? result.comment_reviews.filter(r => r.status==='warn').length : 0;

      modal.setBody(`
        <div style="padding:4px 0;">

          <!-- Cabecalho enxuto: score + resumo -->
          <div style="display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--ml-border);padding-bottom:12px;">
            <div style="width:48px;height:48px;border-radius:12px;background:${scoreColor}1e;display:flex;align-items:center;justify-content:center;flex:0 0 auto;">
              <span style="font-size:19px;font-weight:800;color:${scoreColor};line-height:1;">${score}</span>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-weight:700;font-size:13px;">${issueKey}</span>
                <span style="font-size:11px;color:${scoreColor};background:${scoreColor}1e;padding:1px 8px;border-radius:6px;">${scoreLabel}</span>
              </div>
              <div style="font-size:12.5px;color:var(--ml-text-dim);line-height:1.5;margin-top:2px;">${summary}</div>
            </div>
          </div>

          <div id="ml_audit_stale_banner"></div>

          <!-- Chips de contagem -->
          <div style="display:flex;gap:8px;flex-wrap:wrap;padding:12px 0;">
            ${_pendingCount ? `<span style="font-size:11.5px;color:#f59e0b;background:#f59e0b1e;padding:2px 10px;border-radius:20px;">${_pendingCount} pend&ecirc;ncia(s)</span>` : ''}
            ${_crWarn ? `<span style="font-size:11.5px;color:var(--ml-text-dim);background:var(--ml-bg-2);padding:2px 10px;border-radius:20px;">${_crWarn} sugest&atilde;o(&otilde;es) de escrita</span>` : ''}
            <span style="font-size:11.5px;color:var(--ml-text-dim);background:var(--ml-bg-2);padding:2px 10px;border-radius:20px;">${_okCount} ok</span>
          </div>

          <!-- Criterios -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin:2px 0 0;">
            <span style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ml-text-dim);" id="ml_audit_problem_count">Crit&eacute;rios</span>
            <button id="ml_audit_filter_toggle" style="font-size:11px;background:none;border:1px solid var(--ml-border);border-radius:5px;padding:2px 9px;cursor:pointer;color:var(--ml-text-dim);">S&oacute; pend&ecirc;ncias</button>
          </div>
          <div style="margin-top:2px;">${itemsHtml}</div>

          <!-- Modelo de fechamento (recolhido) -->
          ${closingBlock}

          <!-- Revisao de comentarios (recolhida) -->
          ${_crCount ? `
          <details id="ml_cr_details" style="border-top:1px solid var(--ml-border);">
            <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;padding:11px 2px;font-size:13px;font-weight:600;">
              <span style="width:8px;height:8px;border-radius:50%;background:${_crWarn?'#f59e0b':'#34c578'};flex:0 0 auto;"></span>
              Revis&atilde;o de coment&aacute;rios
              <span style="font-size:11px;font-weight:400;color:var(--ml-text-dim);">n&atilde;o afeta score</span>
              <span style="margin-left:auto;font-size:11.5px;color:var(--ml-text-dim);background:var(--ml-bg-2);padding:1px 8px;border-radius:20px;">${_crCount}</span>
            </summary>
            <div id="ml_comment_reviews_section" style="padding:2px 2px 4px 20px;"></div>
          </details>` : '<div id="ml_comment_reviews_section" style="display:none;"></div>'}

          <!-- Historico (recolhido) -->
          <details id="ml_hist_details" style="border-top:1px solid var(--ml-border);border-bottom:1px solid var(--ml-border);">
            <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;padding:11px 2px;font-size:13px;font-weight:600;">
              <span style="width:8px;height:8px;border-radius:50%;background:var(--ml-text-dim);flex:0 0 auto;"></span>
              Hist&oacute;rico de scores
              <span style="margin-left:auto;font-size:14px;color:var(--ml-text-dim);">›</span>
            </summary>
            <div id="ml_score_hist" style="padding:4px 2px 8px;"></div>
          </details>

          <!-- Acao -->
          <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;">
            <button class="ghost" id="ml_audit_back">&#8592; Voltar</button>
            <button class="ghost" id="ml_audit_rerun" style="font-size:12px;">&#x21BA; Reanalisar</button>
          </div>
        </div>
      `);

      document.getElementById('ml_audit_back').onclick  = () => renderHome(modal, issueKey);
      document.getElementById('ml_audit_rerun').onclick = () => { _removeAuditHints(); runAudit(modal, issueKey); };

      // Filtro: mostra tudo por padrão (OK compactos + pendências); botão alterna para "só pendências".
      try{
        let _showAll = true;
        const applyFilter = () => {
          document.querySelectorAll('[data-st]').forEach(el => {
            const st = el.getAttribute('data-st');
            el.style.display = (_showAll || st === 'warn' || st === 'error') ? '' : 'none';
          });
          const ftBtn = document.getElementById('ml_audit_filter_toggle');
          if(ftBtn) ftBtn.textContent = _showAll ? 'Só pendências' : 'Mostrar todos';
        };
        applyFilter();
        document.getElementById('ml_audit_filter_toggle')?.addEventListener('click', () => { _showAll = !_showAll; applyFilter(); });
      }catch(e){}

      // Aviso "auditoria desatualizada": ticket mudou depois deste resultado ter sido salvo.
      (async () => {
        try{
          if(!result?._ts) return; // resultado ainda nao persistido (ex: preview) - nada a comparar
          const updatedTs = await _getIssueUpdatedTs(issueKey);
          if(!_isAuditStale({ _ts: result._ts }, updatedTs)) return;
          const el = document.getElementById('ml_audit_stale_banner');
          if(el) el.innerHTML = `<div style="margin-top:10px;padding:8px 10px;background:#f59e0b1e;border:1px solid #f59e0b;border-radius:6px;font-size:12px;color:#f59e0b;">&#9888; Este ticket foi alterado depois desta an&aacute;lise. Considere reauditar antes de aplicar as sugest&otilde;es.</div>`;
        }catch(e){}
      })();

      // Historico de scores
      try{
        const hist = _loadScoreHistory();
        const histEl = document.getElementById('ml_score_hist');
        if(histEl && hist.length >= 2){
          const recent = hist.slice(-10);
          const W = 160, H = 28;
          const pts = recent.map((h,i) => {
            const x = recent.length === 1 ? W/2 : Math.round(i*(W/(recent.length-1)));
            const y = Math.round(H - (h.s/100)*H);
            const c = h.s>=80?'#34c578':h.s>=50?'#f59e0b':'#ef4444';
            return {x,y,c,s:h.s};
          });
          const polyline = pts.map(p=>`${p.x},${p.y}`).join(' ');
          const circles  = pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="3" fill="${p.c}" title="${p.s}"/>`).join('');
          const weakMap = {};
          hist.slice(-10).forEach(h => (h.w||[]).forEach(c => { weakMap[c]=(weakMap[c]||0)+1; }));
          const patterns = Object.entries(weakMap).filter(([,n])=>n>=3).sort((a,b)=>b[1]-a[1]);
          const patternHtml = patterns.length
            ? patterns.map(([c,n])=>`<span style="display:inline-block;margin:2px 4px 0 0;padding:1px 7px;border-radius:8px;background:#f59e0b22;border:1px solid #f59e0b;font-size:10px;color:#f59e0b;">⚠️ ${c} (${n}/10)</span>`).join('')
            : '';
          histEl.innerHTML = `
            <div style="font-size:11px;color:var(--ml-text-dim);margin-bottom:6px;">Últimos ${recent.length} tickets auditados</div>
            <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:240px;height:28px;display:block;overflow:visible;">
              <polyline points="${polyline}" fill="none" stroke="var(--ml-border)" stroke-width="1.5"/>
              ${circles}
            </svg>
            ${patternHtml ? `<div style="margin-top:6px;">${patternHtml}</div>` : ''}`;
        }
      }catch(e){}
      // Esconde a seção Histórico se não houver dados suficientes (nada renderizado).
      try{
        const _he = document.getElementById('ml_score_hist');
        const _hd = document.getElementById('ml_hist_details');
        if(_hd && (!_he || !_he.innerHTML.trim())) _hd.style.display = 'none';
      }catch(_){}

      // Revisao de comentarios dos analistas
      const commentReviews = Array.isArray(result?.comment_reviews) ? result.comment_reviews : [];
      const crSection = document.getElementById('ml_comment_reviews_section');
      if(crSection && commentReviews.length){
        const warnReviews = commentReviews.filter(r => r.status === 'warn');
        const crRows = commentReviews.map((r, i) => {
          const isWarn = r.status === 'warn';
          const improvedBlock = (isWarn && r.improved) ? `
            <div style="margin-top:8px;padding:8px 10px;background:var(--ml-bg-1);border-radius:6px;border-left:2px solid #f59e0b;">
              <div style="font-size:11px;color:#8b9ab5;margin-bottom:4px;font-weight:600;">✏️ Versão melhorada:</div>
              <div style="font-size:12px;color:var(--ml-text);line-height:1.5;white-space:pre-wrap;">${esc(r.improved||'')}</div>
              <div style="display:flex;gap:6px;margin-top:5px;">
                <button id="ml_cr_use_${i}" style="font-size:11px;background:#60a5fa;border:none;border-radius:5px;padding:3px 10px;cursor:pointer;color:#04121f;font-weight:600;">Substituir comentário</button>
                <button id="ml_cr_copy_${i}" style="font-size:11px;background:none;border:1px solid var(--ml-border);border-radius:4px;padding:2px 8px;cursor:pointer;color:var(--ml-text-dim);">Copiar</button>
              </div>
            </div>` : '';
          return `
            <div style="padding:10px 0;border-bottom:1px solid var(--ml-border);">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="font-size:14px;">${isWarn ? '⚠️' : '✅'}</span>
                <span style="font-size:12px;font-weight:600;color:var(--ml-text-dim);">${esc(r.author || '?')} · ${esc((r.date||'').slice(0,16))}</span>
              </div>
              <div style="font-size:12px;color:var(--ml-text-dim);font-style:italic;padding-left:22px;margin-bottom:${isWarn?'4px':'0'};">"${esc(r.excerpt||'')}"</div>
              ${isWarn ? `<div style="font-size:12px;color:#f59e0b;padding-left:22px;">${esc(r.issue||'')}</div>` : ''}
              ${improvedBlock ? `<div style="padding-left:22px;">${improvedBlock}</div>` : ''}
            </div>`;
        }).join('');

        // Header já está no <summary> do <details>; aqui só as linhas.
        crSection.innerHTML = crRows;

        // Liga botões de revisão de comentários
        commentReviews.forEach((r, i) => {
          if(!r.improved) return;
          document.getElementById(`ml_cr_copy_${i}`)?.addEventListener('click', function(){
            navigator.clipboard.writeText(r.improved).then(() => {
              this.textContent = '✓ Copiado!';
              setTimeout(() => { this.textContent = 'Copiar'; }, 2000);
            });
          });
          document.getElementById(`ml_cr_use_${i}`)?.addEventListener('click', async function(){
            const btn = this;
            const orig = btn.textContent;
            btn.disabled = true; btn.textContent = 'Localizando…';
            try{
              const comment = await _auditFindComment(issueKey, r);
              if(!comment) throw new Error('Não localizei o comentário original.');
              // Fecha o painel e abre a área de revisão com o texto novo (você valida e salva).
              try{ modal.close(); }catch(_){}
              _auditShowReplacePreview(issueKey, comment, r.improved);
              btn.disabled = false; btn.textContent = orig;
            }catch(e){
              btn.disabled = false; btn.textContent = orig;
              try{ navigator.clipboard.writeText(r.improved); }catch(_){}
              showToast('Não localizei o comentário (' + (e.message||e) + '). Texto copiado pra colar manualmente.', 'error', 6000);
            }
          });
        });
      }

      // Botao copiar comentario de fechamento
      document.getElementById('ml_audit_copy_closing')?.addEventListener('click', function(){
        navigator.clipboard.writeText(closingComment).then(() => {
          this.textContent = '✓ Copiado!';
          setTimeout(() => { this.textContent = 'Copiar'; }, 2000);
        });
      });

      // Recálculo de score em tempo real para o painel principal
      const _scoreValPanel = { ok:11, warn:6, error:0, skip:11 };
      const _fixedPanel = new Set();
      const _recalcPanel = () => {
        const newScore = Math.min(100, items.reduce((sum, it) => sum + (_fixedPanel.has(it.check) ? 11 : (_scoreValPanel[it.status] ?? 11)), 0));
        _refreshScoreDisplay(newScore, items.map(it => _fixedPanel.has(it.check) ? {...it, status:'ok'} : it), () => {
          // Reabre num modal NOVO — o objeto retornado por openModal() não tem .open()/.reopen(),
          // só setBody/setSubtitle/close, então reabrir precisa recriar o modal do zero.
          try{
            const m = openModal('IS Toolkit', `Ticket atual: ${issueKey}`);
            if(_auditCache) _auditCache.modal = m;
            showAuditPanel(m, issueKey, {
              score: newScore, items, closing_comment: closingComment, summary,
              comment_reviews: result?.comment_reviews || [], title_review: result?.title_review || null
            });
          }catch(e){ console.warn('[is-toolkit][audit] reabrir painel (recalc) falhou:', e); }
        });
      };

      // Botoes copiar + ação direta por item sugerido
      items.forEach((item, idx) => {
        const sugText = (item.suggested_text || '').trim();
        if(!sugText) return;

        // Copiar
        const copyBtn = document.getElementById(`ml_sugcopy_${idx}`);
        if(copyBtn){
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(sugText).then(() => {
              copyBtn.textContent = '✓ Copiado!';
              setTimeout(() => { copyBtn.textContent = 'Copiar'; }, 2000);
            }).catch(() => { copyBtn.textContent = 'Erro'; });
          };
        }

        // Ação direta
        const actionBtn = document.getElementById(`ml_sugaction_${idx}`);
        if(!actionBtn) return;
        if(item.check === 'Descricao'){
          // Substitui a descrição do ticket via API
          actionBtn.onclick = async () => {
            if(!confirm(`Substituir a descrição do ticket ${issueKey} pelo texto sugerido?`)) return;
            actionBtn.textContent = 'Salvando...';
            actionBtn.disabled = true;
            try{
              const adf = textToAdfParagraphs(sugText);
              const r = await fetch(`${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
                method: 'PUT', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ fields: { description: adf } })
              });
              if(!r.ok && r.status !== 204){
                const b = await r.text().catch(()=>'');
                throw new Error(`HTTP ${r.status}: ${b.slice(0,80)}`);
              }
              actionBtn.textContent = '✓ Salvo!';
              _fixedPanel.add(item.check);
              if(!_auditFixedChecks.has(issueKey)) _auditFixedChecks.set(issueKey, new Set());
              _auditFixedChecks.get(issueKey).add(item.check);
              _recalcPanel();
              showToast('Descrição atualizada no Jira', 'success', 3000);
            }catch(e){
              actionBtn.textContent = 'Erro';
              actionBtn.disabled = false;
              showToast('Erro ao salvar: ' + (e.message||e), 'error', 5000);
            }
          };
        } else {
          // Abre editor de comentário do Jira com o texto
          actionBtn.onclick = () => {
            navigator.clipboard.writeText(sugText).catch(()=>{});
            modal.close();
            _openJiraCommentWithText(sugText);
            _fixedPanel.add(item.check);
            if(!_auditFixedChecks.has(issueKey)) _auditFixedChecks.set(issueKey, new Set());
            _auditFixedChecks.get(issueKey).add(item.check);
            setTimeout(_recalcPanel, 300);
          };
        }
      });

      // Injeta sidebar vertical no ticket (só quando veio de runAudit, nao ao reabrir)
      if(fromRun) _showAuditHints(issueKey, score, items, modal, closingComment, result?.comment_reviews || [], result?.title_review || null);
    }

    // Cache em memória do último resultado (reabrir sem refazer na sessão atual)
    let _auditCache = null; // { issueKey, score, items, summary, modal }
    let _chipMinimized = false; // estado de minimização do chip ambient
    // Itens já corrigidos na sessão, por ticket. Persiste entre reanálises.
    // Map<issueKey, Set<check>>
    const _auditFixedChecks = new Map();

    // Cache persistente via GM_setValue (sobrevive reload/reinício)
    const _AUDIT_CACHE_PREFIX = 'ml_audit_v1_';
    const _AUDIT_CACHE_TTL    = 24 * 60 * 60 * 1000; // 24h

    function _saveAuditGM(issueKey, result){
      try{ _gmSet(_AUDIT_CACHE_PREFIX + issueKey, JSON.stringify({ ...result, _ts: Date.now() })); }catch(e){}
    }
    function _loadAuditGM(issueKey){
      try{
        const raw = _gmGet(_AUDIT_CACHE_PREFIX + issueKey);
        if(!raw) return null;
        const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if(Date.now() - (d._ts || 0) > _AUDIT_CACHE_TTL){ _gmDel(_AUDIT_CACHE_PREFIX + issueKey); return null; }
        return d;
      }catch(e){ return null; }
    }

    // Le apenas o timestamp "updated" da issue (chamada leve, 1 campo) — usado pra saber
    // se o ticket mudou depois da ultima auditoria salva (auditoria "desatualizada").
    async function _getIssueUpdatedTs(issueKey){
      try{
        const url = `${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=updated`;
        const r = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json' } });
        if(!r.ok) return null;
        const d = await r.json().catch(()=>null);
        const upd = d?.fields?.updated;
        return upd ? new Date(upd).getTime() : null;
      }catch(e){ return null; }
    }

    // Verdadeiro se o ticket foi modificado depois do timestamp salvo da ultima auditoria (cached._ts).
    // updatedTs = epoch ms (de _getIssueUpdatedTs) já resolvido; se null, não dá pra saber -> false (nao afirma o que nao sabe).
    function _isAuditStale(cached, updatedTs){
      if(!cached || !cached._ts || !updatedTs) return false;
      return updatedTs > cached._ts;
    }

    // Remove sidebar e tooltip apenas (mantém chip ambient visível)
    function _removeAuditSidebar(){
      document.getElementById('ml_audit_hints_bar')?.remove();
      document.getElementById('ml_hint_tip')?.remove();
    }

    // Remove sidebar, tooltip e chip ambient (usar em re-run / troca de ticket)
    function _removeAuditHints(){
      _removeAuditSidebar();
      document.getElementById('ml_audit_ambient')?.remove();
    }

    // Chip flutuante ambient — inclui arco SVG de progresso + botão minimizar
    function _injectAuditAmbient(score, items, onClickFn){
      document.getElementById('ml_audit_ambient')?.remove();
      const pending    = (items||[]).filter(i => i.status==='error'||i.status==='warn').length;
      const scoreColor = score>=80?'#34c578':score>=50?'#f59e0b':'#ef4444';

      // Arco SVG de progresso
      const r = 13, circ = +(2*Math.PI*r).toFixed(2);
      const offset = +(circ*(1-Math.max(0,Math.min(100,score))/100)).toFixed(2);
      const svgArc = `<svg width="34" height="34" viewBox="0 0 34 34" style="flex-shrink:0;display:block;">
        <circle cx="17" cy="17" r="${r}" fill="none" stroke="#2a2d3e" stroke-width="2.5"/>
        <circle cx="17" cy="17" r="${r}" fill="none" stroke="${scoreColor}" stroke-width="2.5"
          stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
          transform="rotate(-90 17 17)" stroke-linecap="round"/>
        <text x="17" y="22" text-anchor="middle" fill="${scoreColor}"
          font-size="10" font-weight="800"
          font-family="-apple-system,BlinkMacSystemFont,sans-serif">${score}</text>
      </svg>`;

      const chip = document.createElement('div');
      chip.id = 'ml_audit_ambient';
      chip.style.cssText = [
        'position:fixed',
        'bottom:72px',
        'right:18px',
        'z-index:9999996',
        'display:flex',
        'align-items:center',
        'gap:6px',
        `padding:${_chipMinimized ? '3px' : '3px 8px 3px 4px'}`,
        `background:#141728`,
        `border:1px solid ${scoreColor}55`,
        'border-radius:22px',
        'box-shadow:0 2px 12px #0008',
        'font-family:var(--ml-font,-apple-system,sans-serif)',
        'transition:opacity 0.2s',
        'opacity:0.93',
        'user-select:none'
      ].join(';');

      if(_chipMinimized){
        // Minimizado: só o arco, clicável
        chip.innerHTML = `<div id="ml_chip_arc" style="cursor:pointer;display:flex;">${svgArc}</div>`;
      } else {
        // Expandido: arco + texto + botão minimizar
        const pendingHtml = pending > 0
          ? `<span style="font-size:11px;color:#8b9ab5;">·</span>
             <span style="font-size:11px;color:#8b9ab5;">${pending} pendência${pending>1?'s':''}</span>`
          : `<span style="font-size:11px;color:#8b9ab5;">· ok</span>`;
        chip.innerHTML = `
          <div id="ml_chip_arc" style="cursor:pointer;display:flex;">${svgArc}</div>
          ${pendingHtml}
          <button id="ml_chip_toggle" title="Minimizar" style="
            background:none;border:none;padding:0 0 0 4px;cursor:pointer;
            color:#8b9ab5;font-size:13px;line-height:1;opacity:0.7;
          ">−</button>
        `;
      }

      chip.onmouseenter = () => { chip.style.opacity='1'; };
      chip.onmouseleave = () => { chip.style.opacity='0.93'; };
      document.body.appendChild(chip);

      // Arco clicável → abre painel de auditoria
      document.getElementById('ml_chip_arc')?.addEventListener('click', onClickFn);

      // Botão minimizar/expandir
      document.getElementById('ml_chip_toggle')?.addEventListener('click', e => {
        e.stopPropagation();
        _chipMinimized = true;
        _injectAuditAmbient(score, items, onClickFn);
      });

      // Clique no chip minimizado → expande
      if(_chipMinimized){
        chip.style.cursor = 'pointer';
        chip.addEventListener('click', () => {
          _chipMinimized = false;
          _injectAuditAmbient(score, items, onClickFn);
        });
      }
    }

    // Sidebar vertical lateral com pendencias e sugestoes de melhoria
    function _showAuditHints(issueKey, score, items, modal, closingCommentHint, commentReviews, titleReview){
      _removeAuditHints();
      _auditCache = { issueKey, score, items, modal, closingComment: closingCommentHint || '', commentReviews: commentReviews || [], titleReview: titleReview || null };

      // Função reutilizável para reabrir o painel de auditoria.
      // Reabre num modal NOVO (openModal() não retorna algo com .open()/.reopen()).
      const _reopenAuditPanel = () => {
        if(!_auditCache) return;
        const cache = _auditCache;
        try{
          const m = openModal('IS Toolkit', `Ticket atual: ${cache.issueKey}`);
          cache.modal = m;
          showAuditPanel(m, cache.issueKey, {
            score: cache.score, items: cache.items,
            closing_comment: cache.closingComment || '',
            summary: cache.summary || '',
            comment_reviews: cache.commentReviews || [],
            title_review: cache.titleReview || null
          });
        }catch(e){ console.warn('[is-toolkit][audit] reabrir painel (chip) falhou:', e); }
      };

      // Injeta badge de score no titulo do ticket
      _injectScoreBadge(score, _reopenAuditPanel);

      // Chip flutuante ambient (fora do popup, sempre visível na página).
      // Clicar no chip (que mostra o score %) reabre o painel grande da última análise.
      _injectAuditAmbient(score, items, _reopenAuditPanel);

      // A tela lateral (sidebar de pendências) foi REMOVIDA — o chip + o painel grande
      // cobrem o fluxo. Mantemos o cache e o chip; encerramos aqui.
    }

    // =========================
    // HOME view: mini-busca + cards de features
    // =========================

    // =========================
    // CHAMADO FORNECEDORA — extrai dados do ticket para copiar campo a campo
    // =========================
    async function openProviderModal(issueKey){
      // Abre modal de loading
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100020;display:flex;align-items:center;justify-content:center;';
      const box = document.createElement('div');
      box.style.cssText = 'background:#1e1e2e;color:#e0e0e0;border-radius:12px;padding:24px;max-width:520px;width:94%;font-family:var(--ml-font,sans-serif);font-size:13px;';
      box.innerHTML = '<p style="margin:0;color:#aaa;">⏳ Buscando dados do ticket…</p>';
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      overlay.addEventListener('click', e => { if(e.target === overlay) overlay.remove(); });

      try{
        const issue = await getIssueFields(issueKey, [
          'reporter', 'description', 'customfield_15614', 'summary'
        ]);
        const f = issue?.fields || {};

        // Dados
        const nome     = f.reporter?.displayName || '';
        const email    = f.reporter?.emailAddress || '';
        const telefone = (() => {
          const v = f['customfield_15614'];
          if(!v) return '';
          if(typeof v === 'string') return v.trim();
          if(typeof v === 'object') return (v.value || v.name || '').trim();
          return String(v).trim();
        })();

        // Serial: pega o de maior peso da descrição
        const descText = (() => {
          const d = f.description;
          if(!d) return '';
          if(typeof d === 'string') return d;
          // ADF
          function adfText(node){
            if(!node) return '';
            if(node.type === 'text') return node.text || '';
            return (node.content || []).map(adfText).join(' ');
          }
          return adfText(d);
        })();
        const tokens   = extractIdentifiersFromText(descText);
        const serialTk = tokens.find(t => t.type === 'serial' || t.type === 'serial?');
        const serial   = serialTk?.value || '';

        const rows = [
          { label: 'Ticket',   value: issueKey },
          { label: 'Nome',     value: nome },
          { label: 'Email',    value: email },
          { label: 'Telefone', value: telefone },
          { label: 'N° Série', value: serial },
        ];

        const rowsHtml = rows.map((r, i) => `
          <div style="display:flex;align-items:center;gap:10px;padding:9px 0;${i < rows.length-1 ? 'border-bottom:1px solid rgba(255,255,255,0.07)' : ''}">
            <span style="width:80px;flex-shrink:0;font-size:11px;color:#888;font-weight:600;text-transform:uppercase;">${r.label}</span>
            <span id="prov_val_${i}" style="flex:1;color:${r.value ? '#e0e0e0' : '#555'};font-size:13px;">${r.value || '—'}</span>
            <button onclick="(function(){
              var v = document.getElementById('prov_val_${i}');
              var txt = v ? v.textContent.trim() : '';
              if(!txt || txt === '—') return;
              navigator.clipboard.writeText(txt).then(function(){
                var b = document.getElementById('prov_copy_${i}');
                if(b){ b.textContent = '✓'; setTimeout(function(){ b.textContent = '📋'; }, 1200); }
              });
            })()"
              id="prov_copy_${i}"
              style="flex-shrink:0;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#aaa;cursor:${r.value ? 'pointer' : 'default'};padding:3px 8px;font-size:12px;opacity:${r.value ? '1' : '0.3'};"
              ${!r.value ? 'disabled' : ''}>📋</button>
          </div>
        `).join('');

        box.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <h3 style="margin:0;font-size:15px;color:#fff;">🖨️ Chamado Fornecedora</h3>
            <button onclick="this.closest('[style*=fixed]').remove()"
              style="background:transparent;border:none;color:#888;font-size:18px;cursor:pointer;line-height:1;">✕</button>
          </div>
          <p style="margin:0 0 14px;color:#888;font-size:12px;">Clique em 📋 para copiar cada campo individualmente.</p>
          <div style="background:#13131f;border-radius:8px;padding:4px 14px;">${rowsHtml}</div>
          <div style="margin-top:14px;text-align:right;">
            <button onclick="this.closest('[style*=fixed]').remove()"
              style="padding:7px 18px;border:1px solid #444;border-radius:6px;background:transparent;color:#ccc;cursor:pointer;font-size:13px;">Fechar</button>
          </div>
        `;
      }catch(e){
        box.innerHTML = `<p style="color:#ef9a9a;margin:0;">Erro ao buscar dados: ${e.message || e}</p>
          <div style="margin-top:12px;text-align:right;">
            <button onclick="this.closest('[style*=fixed]').remove()"
              style="padding:6px 14px;border:1px solid #444;border-radius:6px;background:transparent;color:#ccc;cursor:pointer;">Fechar</button>
          </div>`;
      }
    }

    async function renderHome(modal, issueKey) {
      modal.setBody(`
        <div class="homeWrap">
          <div id="ml_home_health"></div>

          <div>
            <div class="searchBox">
              <input type="text" id="ml_home_search_input" placeholder="Cole uma chave de ticket (ex: IS-1028327) e Enter para inspecionar..." spellcheck="false" />
              <button id="ml_home_search_btn" class="primary">Buscar</button>
              <button id="ml_home_search_clear" class="ghost" title="Limpar">Limpar</button>
            </div>
            <div class="hint" style="color: var(--ml-text-dim); font-size: 11px; margin-top: 6px;">
              Acesso rapido a qualquer ticket sem trocar de aba. Voce ve resumo, status, localidade e pode marcar como duplicado do ticket atual em 1 clique.
            </div>
            <div id="ml_home_clipboard" style="margin-top: 10px;"></div>
            <div id="ml_home_search_hist" style="margin-top: 10px;"></div>
            <div id="ml_home_search_result" style="margin-top: 12px;"></div>
          </div>

          <!-- min-height reserva o espaço do card de localidade pra ele não empurrar os botões ao carregar (evita layout shift) -->
          <div id="ml_home_location" style="min-height:112px;"></div>

          <div class="homeGrid">
            <div class="homeCard">
              <div class="hcIcon">&#x21BB;</div>
              <h3>Mudar Status</h3>
              <p>Aplica transi&ccedil;&otilde;es com mensagem pr&eacute;-configurada. A op&ccedil;&atilde;o <b>Derivar</b> abre o fluxo completo com sele&ccedil;&atilde;o de time e ISS autom&aacute;tico.</p>
              <div class="row">
                <button id="ml_home_status" class="primary">Mudar status</button>
              </div>
            </div>

            <div class="homeCard">
              <div class="hcIcon">&#9783;</div>
              <h3>Duplicados</h3>
              <p>Lista tickets da mesma localidade com scoring de match. Filtra por IDs (IP/MAC/serial), vincula e comenta em lote.</p>
              <div class="row">
                <button id="ml_home_dups" class="primary">Abrir duplicados</button>
              </div>
            </div>

            <div class="homeCard">
              <div class="hcIcon">&#10142;</div>
              <h3>Derivar</h3>
              <p>Atalho direto para derivar para outro time da allowlist, com ISS autom&aacute;tico para <b>IS-SHIP-SE-N2</b>.</p>
              <div class="row">
                <button id="ml_home_derive" class="primary">Derivar agora</button>
              </div>
            </div>

            <div class="homeCard">
              <div class="hcIcon">&#x1F50D;</div>
              <h3>Auditar Ticket</h3>
              <p>An&aacute;lise por IA (via n8n): evid&ecirc;ncias, consist&ecirc;ncia, qualidade do registro e pontos de melhoria.</p>
              ${(() => {
                const cached = _loadAuditGM(issueKey);
                const tsLabel = cached?._ts
                  ? new Date(cached._ts).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
                  : null;
                const scoreLabel = cached ? ` · ${cached.score}pts` : '';
                return `<div class="row" style="gap:8px;flex-wrap:wrap;">
                  <button id="ml_home_audit" class="primary" ${!SETTINGS.AUDIT_WEBHOOK_URL ? 'disabled title="Configure o Webhook em Configuracoes → Avancado → Integracoes"' : ''}>
                    ${!SETTINGS.AUDIT_WEBHOOK_URL ? 'Webhook n&atilde;o configurado' : (cached ? 'Reanalisar' : 'Auditar')}
                  </button>
                  ${tsLabel ? `<button id="ml_home_audit_cached" class="ghost" style="font-size:12px;">&#x23F1; ${tsLabel}${scoreLabel}</button>` : ''}
                  <span id="ml_home_audit_stale"></span>
                </div>`;
              })()}
          </div>

          ${GRID_CENTRAL_URL ? `
          <div style="margin-top:10px;">
            <a href="${esc(GRID_CENTRAL_URL)}" target="_blank" rel="noopener" class="primary" style="text-decoration:none;display:flex;align-items:center;justify-content:center;gap:6px;font-size:13px;padding:10px 18px;width:100%;box-sizing:border-box;">
              &#128194; Central Natis
            </a>
          </div>` : ''}
        </div>
      `);

      document.getElementById('ml_home_status').onclick  = () => { modal.close(); openStatusMenu(issueKey); };
      document.getElementById('ml_home_dups').onclick   = () => renderDuplicates(modal, issueKey);
      document.getElementById('ml_home_derive').onclick = () => openDeriveFlow(issueKey);
      if(SETTINGS.AUDIT_WEBHOOK_URL){
        document.getElementById('ml_home_audit').onclick = () => runAudit(modal, issueKey);
      }
      // Botão "Ver análise anterior" (carrega do GM sem chamar webhook)
      document.getElementById('ml_home_audit_cached')?.addEventListener('click', () => {
        const cached = _loadAuditGM(issueKey);
        if(!cached) return showToast('Cache expirado, rode uma nova análise.', 'warn');
        // Restaura cache em memória e abre painel
        _auditCache = {
          issueKey, score: cached.score, items: cached.items || [], summary: cached.summary || '', modal,
          closingComment: cached.closing_comment || '', commentReviews: cached.comment_reviews || [],
          titleReview: cached.title_review || null
        };
        showAuditPanel(modal, issueKey, cached, true);
      });

      // Aviso "auditoria desatualizada": ticket mudou depois da ultima auditoria salva.
      // Checagem assincrona (1 campo, nao bloqueia o render do Home) — so aparece se houver cache pra comparar.
      (async () => {
        try{
          const cached = _loadAuditGM(issueKey);
          if(!cached) return;
          const updatedTs = await _getIssueUpdatedTs(issueKey);
          if(!_isAuditStale(cached, updatedTs)) return;
          const el = document.getElementById('ml_home_audit_stale');
          if(el) el.innerHTML = `<span title="O ticket foi alterado depois desta análise" style="font-size:11px;color:#f59e0b;background:#f59e0b1e;padding:2px 10px;border-radius:20px;white-space:nowrap;">&#9888; auditoria desatualizada</span>`;
        }catch(e){}
      })();

      // Badge de score (sem clique) quando ha cache valido
      try{
        const cachedForBadge = _loadAuditGM(issueKey);
        if(cachedForBadge && typeof cachedForBadge.score === 'number'){
          _injectScoreBadge(cachedForBadge.score);
        }
      }catch(e){}

      setupHomeSearch(issueKey);
      renderHealthBanner();
      renderLocationCard(issueKey);
    }

    // ============= LOCATION CARD =============
    async function renderLocationCard(issueKey) {
      const slot = document.getElementById('ml_home_location');
      if(!slot) return;

      // Helpers compartilhados com o modal de derivar
      const _initials = name => name.trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
      const _avatarColor = name => {
        const colors = ['#2e7d32','#1565c0','#6a1b9a','#ad1457','#e65100','#00695c'];
        let h = 0; for(const c of name) h = (h*31 + c.charCodeAt(0)) & 0xffff;
        return colors[h % colors.length];
      };
      const _turnoBadge = t => {
        const map = { T1:['#1565c0','#1e2a4a'], T2:['#e65100','#3a1e00'], T3:['#9c27b0','#2a0e3a'] };
        const [fg, bg] = map[t] || ['#90a4ae','#1e2a2e'];
        return `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:26px;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700;background:${bg};color:${fg};border:1px solid ${fg}40">${t}</span>`;
      };
      const _cap = s => s.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');

      // 1) Busca localidade do ticket.
      // Cache por-ticket (sessionStorage): a localidade de um chamado nao muda, entao ao
      // revisitar o mesmo ticket (inclusive apos o auto-reload) pulamos a chamada ao Jira/Assets.
      let locationKey = null;
      let isResp = '', lider = '', regional = '', provedor = '';
      const _locCacheKey = 'ml_loc_key_' + issueKey;
      try{ const c = sessionStorage.getItem(_locCacheKey); if(c) locationKey = c; }catch(_){}
      if(!locationKey){
        try {
          const issue = await getIssueFields(issueKey, [`customfield_${CF_ASSET}`]);
          const assetRaw = issue?.fields?.[`customfield_${CF_ASSET}`];
          const assetArr = Array.isArray(assetRaw) ? assetRaw : (assetRaw ? [assetRaw] : []);
          let objKey = assetArr.map(a => a?.objectKey || a?.label || a?.name).filter(Boolean)[0];
          if(!objKey && assetArr.length){
            try{ objKey = await getAssetName(assetArr[0]?.workspaceId, assetArr[0]?.objectId); }catch(_){}
          }
          if(objKey) locationKey = String(objKey).trim().toUpperCase();
          if(locationKey){ try{ sessionStorage.setItem(_locCacheKey, locationKey); }catch(_){} }
        } catch(_) {}
      }

      if(!locationKey) { slot.style.minHeight = ''; slot.innerHTML = ''; return; }

      // Loading state
      // Extrai código e nome do novo formato ("BR_XD_CAMPINAS BRXSP23") e antigo ("BRXSP23 - XD Campinas")
      const locCode = (() => {
        const m = locationKey.match(/\b(BR[A-Z]{1,6}\d{1,4})\b/i);
        return m ? m[1].toUpperCase() : locationKey.split(/\s*[-–]\s*/)[0].trim().toUpperCase();
      })();
      const locName = (() => {
        if(locationKey.includes('-') || locationKey.includes('–')){
          return locationKey.split(/\s*[-–]\s*/).slice(1).join(' — ').trim();
        }
        // Novo formato: remove o código do final/começo pra obter o nome legível
        return locationKey.replace(/\b(BR[A-Z]{1,6}\d{1,4})\b/i, '').replace(/_/g, ' ').trim();
      })();
      slot.innerHTML = `<div style="margin-bottom:12px;border-radius:8px;background:#1a1f1a;border:1px solid rgba(255,255,255,0.08);padding:10px 14px;display:flex;align-items:center;gap:8px;color:#81c784;font-size:12px"><span>📍</span><span>Carregando info de <b>${locCode}</b>…</span></div>`;

      // 2) Busca catálogo
      let catalog = [];
      try { catalog = await fetchFieldCatalog(); } catch(_) {}

      // Casa a localidade contra o catálogo pelo matcher robusto (mesmo do derivar):
      // alias + todos os tokens do nome, sigla em qualquer posição, com/sem BR.
      const all = catalogRowsForLocation(catalog, locationKey);
      const ativos = all.filter(r => /ativo/i.test(r.status));

      // IS Responsável e Líder (pega do primeiro registro que tiver)
      const ref = all[0] || {};
      isResp    = String(ref.isResp    || (all[0]?.isResp)  || '').trim();
      lider     = String(ref.lider     || '').trim();
      regional  = String(ref.regional  || '').trim();
      provedor  = String(ref.provedor  || '').trim();

      // Busca esses campos no catalog com as colunas corretas
      // (fetchFieldCatalog mapeia: isResp via 'is responsavel', lider via 'lider')
      const refRow = all[0] || {};
      isResp   = _cap(String(refRow.isResp   || '').trim());
      lider    = _cap(String(refRow.lider    || '').trim());
      regional = String(refRow.regional || '').trim();
      provedor = String(refRow.provedor || '').trim();

      // 3) Renderiza card
      let html = `<div style="margin-bottom:12px;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);background:#1a1f1a">`;

      // Header da localidade
      html += `<div style="padding:9px 14px;background:#1e2d20;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(255,255,255,0.08)">`;
      html += `<span style="font-size:14px">📍</span>`;
      html += `<div style="flex:1;min-width:0">`;
      html += `<span style="font-size:13px;font-weight:700;color:#81c784">${locCode}</span>`;
      if(locName) html += `<span style="font-size:11px;color:#a5d6a7;margin-left:6px">${locName}</span>`;
      html += `</div>`;
      if(regional) html += `<span style="font-size:10px;font-weight:600;color:#80cbc4;background:rgba(128,203,196,0.12);padding:2px 8px;border-radius:8px;border:1px solid rgba(128,203,196,0.25)">${regional}</span>`;
      html += `</div>`;

      // Linha de metadados (IS Responsável + Líder)
      html += `<div style="padding:7px 14px;display:flex;gap:16px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,0.06);background:#1c211c">`;
      if(isResp)   html += `<span style="font-size:11px;color:#b0bec5"><span style="color:#546e7a;margin-right:4px">IS Resp:</span>${isResp}</span>`;
      if(lider)    html += `<span style="font-size:11px;color:#b0bec5"><span style="color:#546e7a;margin-right:4px">Líder:</span>${lider}</span>`;
      if(provedor) html += `<span style="font-size:11px;color:#b0bec5"><span style="color:#546e7a;margin-right:4px">Provedor:</span>${provedor}</span>`;
      html += `</div>`;

      // Seção Field Techs — sempre começa colapsado
      const fieldId = 'ml_field_' + locCode.replace(/\W/g,'_');
      const startCollapsed = true;
      html += `<div style="padding:6px 14px 4px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none" onclick="(function(){var b=document.getElementById('${fieldId}');var a=document.getElementById('${fieldId}_arr');if(!b)return;var c=b.style.display==='none';b.style.display=c?'':'none';a.textContent=c?'▾':'▸';})()">`;
      html += `<span style="font-size:10px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.5px">👷 Field</span>`;
      html += `<div style="display:flex;align-items:center;gap:6px">`;
      if(ativos.length) html += `<span style="font-size:10px;color:#69bb6e;font-weight:600">● ${ativos.length} ativo${ativos.length>1?'s':''}</span>`;
      else html += `<span style="font-size:10px;color:#ef9a9a">sem ativos</span>`;
      html += `<span id="${fieldId}_arr" style="font-size:11px;color:#546e7a">${startCollapsed?'▸':'▾'}</span>`;
      html += `</div></div>`;

      html += `<div id="${fieldId}" style="display:${startCollapsed?'none':''}">`;
      if(ativos.length){
        const turnoOrder = t => ({ T1:0, T2:1, T3:2 }[t] ?? 9);
        const ativosOrdenados = [...ativos].sort((a,b) => turnoOrder(a.turno) - turnoOrder(b.turno));
        ativosOrdenados.forEach((f, i) => {
          const isLast    = i === ativosOrdenados.length - 1;
          const bg        = _avatarColor(f.nome);
          const ini       = _initials(f.nome);
          const nom       = _cap(f.nome);
          const onShift   = isOnShiftNow(f.horario);
          html += `<div style="padding:5px 14px;display:flex;align-items:center;gap:8px;${!isLast?'border-bottom:1px solid rgba(255,255,255,0.05)':''}${onShift?' background:rgba(105,187,110,0.06);':''}">`;
          // Avatar com indicador de turno ativo
          html += `<div style="position:relative;width:26px;height:26px;flex-shrink:0">`;
          html += `<div style="width:26px;height:26px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff">${ini}</div>`;
          if(onShift) html += `<span style="position:absolute;bottom:-1px;right:-1px;width:8px;height:8px;border-radius:50%;background:#69bb6e;border:1.5px solid #1a1f1a"></span>`;
          html += `</div>`;
          html += `<div style="flex:1;min-width:0">`;
          html += `<div style="font-size:12px;font-weight:600;color:${onShift?'#c8e6c9':'#e0e0e0'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nom}${onShift?' <span style="font-size:10px;font-weight:400;color:#69bb6e">● em turno</span>':''}</div>`;
          if(f.posicao) html += `<div style="font-size:10px;color:#80cbc4">${f.posicao.charAt(0)+f.posicao.slice(1).toLowerCase()}</div>`;
          html += `</div>`;
          if(f.turno) html += _turnoBadge(f.turno);
          html += `</div>`;
        });
      } else if(all.length) {
        html += `<div style="padding:8px 14px;font-size:11px;color:#78909c">${all.length} cadastrado${all.length>1?'s':''}, nenhum ativo no momento.</div>`;
      } else {
        html += `<div style="padding:8px 14px;font-size:11px;color:#78909c">Nenhum técnico cadastrado para esta localidade.</div>`;
      }
      html += `</div>`; // fim colapsável

      html += `</div>`;
      slot.innerHTML = html;
    }

    // ============= HEALTH BANNER =============
    async function renderHealthBanner(){
      const slot = document.getElementById('ml_home_health');
      if(!slot) return;
      slot.innerHTML = `<div class="healthBanner"><span class="mlSpin"></span><div class="hbBody"><div class="hbTitle">Validando configuracoes...</div></div></div>`;
      let h;
      try{
        h = await runHealthCheckCached();
      }catch(e){
        slot.innerHTML = `
          <div class="healthBanner error">
            <span class="hbIcon">&#9888;</span>
            <div class="hbBody">
              <div class="hbTitle">Health check falhou</div>
              <div class="muted" style="margin-top:4px;">${esc(e.message || String(e))}</div>
            </div>
          </div>`;
        return;
      }
      if(!h.issues.length){
        // Tudo OK — mostra um banner discreto e ja some apos 4s
        slot.innerHTML = `
          <div class="healthBanner ok">
            <span class="hbIcon">&#10003;</span>
            <div class="hbBody">
              <div class="hbTitle">Configuracoes validadas (${h.ok.length} itens OK)</div>
            </div>
          </div>`;
        setTimeout(() => { if(slot.firstChild) slot.firstChild.style.display = 'none'; }, 4000);
        return;
      }
      const hasError = h.issues.some(i => i.severity === 'error');
      const cls = hasError ? 'error' : 'warn';
      const icon = hasError ? '&#9888;' : '&#9888;';
      slot.innerHTML = `
        <div class="healthBanner ${cls}">
          <span class="hbIcon">${icon}</span>
          <div class="hbBody">
            <div class="hbTitle">${h.issues.length} problema(s) detectado(s) na configuracao</div>
            <ul class="hbList">
              ${h.issues.map(i => `
                <li>
                  <span class="sev ${i.severity === 'error' ? 'err' : 'warn'}">[${i.severity.toUpperCase()}]</span>
                  ${esc(i.msg)}
                  ${i.hint ? `<div class="muted" style="margin-left: 8px; margin-top: 2px;">${esc(i.hint)}</div>` : ''}
                </li>
              `).join('')}
            </ul>
            <div class="hbActions">
              <button id="ml_health_settings" class="ghost" style="font-size:12px;padding:6px 12px;">Abrir Configuracoes</button>
              <button id="ml_health_recheck" class="ghost" style="font-size:12px;padding:6px 12px;">Re-checar</button>
            </div>
          </div>
        </div>`;
      document.getElementById('ml_health_settings').onclick = () => openSettingsModal();
      document.getElementById('ml_health_recheck').onclick = () => { clearHealthCache(); renderHealthBanner(); };
    }

    // Historico das ultimas keys buscadas (max 8). Persiste em localStorage.
    const _SEARCH_HIST_KEY = 'ml_loc_search_hist_v1';
    function _readSearchHist(){
      try { return JSON.parse(localStorage.getItem(_SEARCH_HIST_KEY) || '[]'); } catch(_) { return []; }
    }
    function _writeSearchHist(arr){
      try { localStorage.setItem(_SEARCH_HIST_KEY, JSON.stringify(arr.slice(0, 8))); } catch(_) {}
    }
    function _pushSearchHist(key){
      const cur = _readSearchHist().filter(k => k !== key);
      cur.unshift(key);
      _writeSearchHist(cur);
    }

    // ============= MINI-BUSCA (sabor C) =============
    function setupHomeSearch(currentIssueKey){
      const input   = document.getElementById('ml_home_search_input');
      const btn     = document.getElementById('ml_home_search_btn');
      const clrBtn  = document.getElementById('ml_home_search_clear');
      const result  = document.getElementById('ml_home_search_result');
      const histBox = document.getElementById('ml_home_search_hist');
      const clipBar = document.getElementById('ml_home_clipboard');
      if(!input || !btn || !result) return;

      const renderHistory = () => {
        if(!histBox) return;
        const hist = _readSearchHist();
        if(!hist.length){ histBox.innerHTML = ''; return; }
        histBox.innerHTML = `<div class="hint" style="margin-bottom: 6px;">Buscas recentes:</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${hist.map(k => `<button class="ghost" data-hist-key="${esc(k)}" style="font-size:11px;padding:4px 10px;font-family:var(--ml-mono);">${esc(k)}</button>`).join('')}
          </div>`;
        histBox.querySelectorAll('[data-hist-key]').forEach(b => {
          b.onclick = () => {
            input.value = b.getAttribute('data-hist-key');
            doSearch();
          };
        });
      };

      const doSearch = async () => {
        const raw = String(input.value || '').trim();
        const key = raw.toUpperCase().match(/[A-Z][A-Z0-9_]+-\d+/)?.[0];
        if(!key){
          result.innerHTML = `<div class="err" style="margin:0;">Cole uma chave valida (ex: <code>IS-1028327</code>).</div>`;
          return;
        }
        result.innerHTML = `<div class="searchResult"><span class="mlSpin"></span> Buscando ${esc(key)}...</div>`;
        try{
          const p = await getIssuePreview(key);
          renderPreview(result, p, currentIssueKey);
          _pushSearchHist(key);
          renderHistory();
        }catch(e){
          result.innerHTML = `<div class="err" style="margin:0;">Falha ao buscar <code>${esc(key)}</code>: ${esc(e.message || String(e))}</div>`;
        }
      };

      btn.onclick = doSearch;
      clrBtn.onclick = () => { input.value = ''; result.innerHTML = ''; input.focus(); };
      input.onkeydown = (ev) => { if(ev.key === 'Enter'){ ev.preventDefault(); doSearch(); }};
      setTimeout(() => input.focus(), 50);

      renderHistory();

      // Auto-detect: se o clipboard tem uma key Jira (e nao e a current), oferece buscar.
      if(clipBar && navigator?.clipboard?.readText){
        navigator.clipboard.readText().then(rawTxt => {
          const txt = String(rawTxt || '').trim();
          // Guard 1: clipboard grande = provavelmente codigo/texto longo, ignora
          if(!txt || txt.length > 200) return;
          // Guard 2: clipboard com aparencia de codigo (chaves, ponto-virgula, multiplas linhas)
          // tambem nao deve disparar auto-detect
          const looksLikeCode = /[{};()=<>]/.test(txt) || txt.split('\n').length > 3;
          if(looksLikeCode) return;
          // Guard 3: word boundary pra nao casar com substring no meio de algo
          const k = txt.toUpperCase().match(/\b([A-Z][A-Z0-9_]+-\d+)\b/)?.[0];
          if(!k || k === currentIssueKey) return;
          clipBar.innerHTML = `
            <div style="display:flex;gap:10px;align-items:center;padding:10px 14px;background:var(--ml-blue-soft);border:1px solid var(--ml-blue-line);border-radius:var(--ml-radius-sm);font-size:12.5px;">
              &#128203; Voce tem <code>${esc(k)}</code> no clipboard.
              <button id="ml_clip_use" class="primary" style="font-size:12px;padding:4px 12px;margin-left:auto;">Buscar</button>
              <button id="ml_clip_dismiss" class="ghost" style="font-size:12px;padding:4px 10px;">Ignorar</button>
            </div>`;
          clipBar.querySelector('#ml_clip_use').onclick = () => { input.value = k; doSearch(); clipBar.innerHTML = ''; };
          clipBar.querySelector('#ml_clip_dismiss').onclick = () => { clipBar.innerHTML = ''; };
        }).catch(() => { /* silently ignore - usuario pode nao ter dado permissao */ });
      }
    }

    function renderPreview(container, p, currentIssueKey){
      const link = `${location.origin}/browse/${p.key}`;
      const isCurrent = currentIssueKey && (currentIssueKey === p.key);

      let descText = '';
      if(p.descriptionAdf){
        try { descText = adfToPlainText(p.descriptionAdf); } catch(_){}
      }
      const COLLAPSE_AT = 600;
      const isLong = descText.length > COLLAPSE_AT;
      const descShort = isLong ? (descText.slice(0, COLLAPSE_AT).trim() + ' ...') : descText;

      container.innerHTML = `
        <div class="searchResult">
          <div class="srHead">
            <div style="flex:1; min-width: 240px;">
              <div class="srKey"><a href="${esc(link)}" target="_blank" rel="noopener">${esc(p.key)}</a></div>
              <div class="srSum">${esc(p.summary)}</div>
              <div class="srBadges">
                ${p.status         ? `<span class="srBadge status">${esc(p.status)}</span>` : ''}
                ${p.priority       ? `<span class="srBadge prio">${esc(p.priority)}</span>` : ''}
                ${p.asset          ? `<span class="srBadge loc">&#128205; ${esc(p.asset)}</span>` : ''}
                ${p.resolutionTeam ? `<span class="srBadge">&#128101; ${esc(p.resolutionTeam)}</span>` : ''}
                ${p.issuetype      ? `<span class="srBadge">${esc(p.issuetype)}</span>` : ''}
                <span class="srBadge">${esc(p.assignee)}</span>
              </div>
            </div>
          </div>
          ${descText
            ? `<div class="srDesc" id="ml_sr_desc" style="max-height:none;white-space:pre-wrap;">${esc(descShort)}</div>
               ${isLong ? `<button id="ml_sr_more" class="ghost" style="margin-top:8px;font-size:12px;">Ver descricao completa (${descText.length} chars)</button>` : ''}`
            : '<div class="muted" style="margin-top:10px;">(Sem descricao no ticket)</div>'
          }
          <div class="srActions">
            <button class="primary" id="ml_sr_open">Abrir em nova aba</button>
            ${(!isCurrent && currentIssueKey) ? `<button id="ml_sr_dup">Marcar ${esc(currentIssueKey)} como duplicado deste</button>` : ''}
            ${isCurrent ? `<span class="muted">(este e o ticket atual)</span>` : ''}
          </div>
          <div id="ml_sr_msg" style="margin-top:10px;"></div>
        </div>
      `;

      document.getElementById('ml_sr_open').onclick = () => window.open(link, '_blank', 'noopener');

      const moreBtn = document.getElementById('ml_sr_more');
      if(moreBtn){
        let expanded = false;
        moreBtn.onclick = () => {
          const el = document.getElementById('ml_sr_desc');
          expanded = !expanded;
          el.textContent = expanded ? descText : descShort;
          moreBtn.textContent = expanded ? 'Recolher' : `Ver descricao completa (${descText.length} chars)`;
        };
      }

      const dupBtn = document.getElementById('ml_sr_dup');
      if(dupBtn){
        dupBtn.onclick = async () => {
          if(!confirm(`Marcar ${currentIssueKey} como duplicado de ${p.key}?\n\nIsso:\n  - cria o link "duplicates"\n  - adiciona um comentario interno em ambos.`)) return;
          dupBtn.disabled = true;
          dupBtn.innerHTML = `<span class="mlSpin"></span> Vinculando...`;
          const msg = document.getElementById('ml_sr_msg');
          try{
            await linkDuplicate(currentIssueKey, p.key);
            try { await addInternalComment(currentIssueKey, `Marcado como duplicado de ${p.key}.`); } catch(_){}
            try { await addInternalComment(p.key, `${currentIssueKey} foi marcado como duplicado deste chamado.`); } catch(_){}
            msg.innerHTML = `<div class="srBadge" style="background: var(--ml-green-soft); border-color: var(--ml-green); color:#bdf0d2;">&#10003; Vinculado com sucesso</div>`;
            dupBtn.innerHTML = 'Vinculado';
          }catch(e){
            msg.innerHTML = `<div class="err" style="margin:0;">Falha: ${esc(e.message || String(e))}</div>`;
            dupBtn.disabled = false;
            dupBtn.textContent = `Marcar ${currentIssueKey} como duplicado deste`;
          }
        };
      }
    }
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

    // Cache de issue (evita refetch a cada _tick). TTL curto pra dados sempre frescos:
    // se o usuario muda o Object Type ou outro field pela UI do Jira, o chip refleete em
    // no maximo CONF_CACHE_TTL_MS (15s atualmente).
    const _CONF_ISSUE_CACHE = new Map();
    const CONF_CACHE_TTL_MS = 15 * 1000;
    async function _confGetIssueData(issueKey, opts){
      const forceRefresh = !!(opts && opts.forceRefresh);
      if(!forceRefresh && _CONF_ISSUE_CACHE.has(issueKey)) return _CONF_ISSUE_CACHE.get(issueKey);
      const p = (async () => {
        try{
          return await getIssueAllFields(issueKey);
        }catch(e){
          console.warn('[jira-localidade][confluence] falha lendo issue', issueKey, e);
          return null;
        }
      })();
      _CONF_ISSUE_CACHE.set(issueKey, p);
      setTimeout(() => _CONF_ISSUE_CACHE.delete(issueKey), CONF_CACHE_TTL_MS);
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
        bottom: 128px;
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

    // Limpa cache de issue. Sem argumento limpa tudo; com issueKey limpa so essa chave.
    // Tambem reseta o _CONF_LAST_RENDERED pra forcar re-render do chip no proximo _tick.
    function clearConfluenceIssueCache(issueKey){
      if(issueKey){
        _CONF_ISSUE_CACHE.delete(issueKey);
      } else {
        _CONF_ISSUE_CACHE.clear();
      }
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

    // =========================
    // FIELD DISCOVERY — descobre custom field IDs do ticket atual
    // =========================
    async function discoverJiraFields(){
      // Pega o issueKey da URL atual
      const m = location.pathname.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/);
      if(!m){
        alert('Abra um ticket Jira antes de usar a descoberta de campos.');
        return null;
      }
      const issueKey = m[1];
      try{
        // Busca em paralelo: schema de campos (nomes) + valores do ticket
        const [schemaRes, issueRes] = await Promise.all([
          fetch(`${location.origin}/rest/api/3/field`, { credentials:'same-origin', headers:{ Accept:'application/json' } }),
          fetch(`${location.origin}/rest/api/3/issue/${issueKey}?fields=*all`, { credentials:'same-origin', headers:{ Accept:'application/json' } })
        ]);
        if(!schemaRes.ok) throw new Error(`Schema HTTP ${schemaRes.status}`);
        if(!issueRes.ok)  throw new Error(`Issue HTTP ${issueRes.status}`);
        const schemaArr = await schemaRes.json();
        const data      = await issueRes.json();
        const fields    = data.fields || {};

        // Mapa id → nome humanizado  (ex: "customfield_19426" → "Categoria")
        const nameMap = {};
        (Array.isArray(schemaArr) ? schemaArr : []).forEach(f => {
          if(f.id && f.name) nameMap[f.id] = f.name;
        });

        // Helper: extrai valor legível de qualquer estrutura Jira
        function extractDisplay(v){
          if(v == null) return '';
          if(typeof v === 'string')  return v.length > 80 ? v.slice(0,80)+'…' : v;
          if(typeof v === 'number' || typeof v === 'boolean') return String(v);
          if(Array.isArray(v)){
            const parts = v.slice(0,3).map(item => extractDisplay(item)).filter(Boolean);
            return parts.join(', ') + (v.length > 3 ? ', …' : '');
          }
          if(typeof v === 'object'){
            const val = v.value ?? v.name ?? v.displayName ?? v.accountId ?? v.id ?? v.key;
            if(val != null) return String(val).slice(0,80);
            // Tenta children comuns
            if(v.requestType)   return extractDisplay(v.requestType);
            if(v.currentStatus) return extractDisplay(v.currentStatus);
            // Fallback: JSON resumido
            const j = JSON.stringify(v);
            return j.length > 80 ? j.slice(0,80)+'…' : j;
          }
          return '';
        }

        // Inclui TODOS os customfields, mesmo vazios (útil para identificar pelo nome)
        const customs = Object.entries(fields)
          .filter(([k]) => k.startsWith('customfield_'))
          .map(([k, v]) => {
            const id      = Number(k.replace('customfield_', ''));
            const display = extractDisplay(v);
            const name    = nameMap[k] || '';
            return { id, key: k, name, display, empty: !display };
          })
          .filter(c => c.name || !c.empty) // omite campos sem nome E vazios
          .sort((a, b) => a.id - b.id);

        return { issueKey, customs };
      }catch(e){
        alert('Erro ao buscar campos: ' + (e.message || e));
        return null;
      }
    }

    function openDiscoverModal(issueKey, customs, settingsModal){
      const ROLES = [
        { key: 'CF_CATEGORY',        label: 'Categoria' },
        { key: 'CF_SUBCATEGORY',     label: 'Subcategoria' },
        { key: 'CF_REQUEST_TYPE',    label: 'Tipo de solicitação' },
        { key: 'CF_USER_VALIDATION', label: 'Validação do usuário' },
        { key: 'CF_SOLUTION_TYPE',   label: 'Solução aplicada' },
        { key: 'CF_USAGE_MARK',      label: 'Categorias (marcação de uso — texto livre)' },
      ];

      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100010;display:flex;align-items:center;justify-content:center;';

      const box = document.createElement('div');
      box.style.cssText = 'background:#1e1e2e;color:#e0e0e0;border-radius:12px;padding:24px;max-width:700px;width:96%;max-height:85vh;overflow-y:auto;font-family:var(--ml-font,sans-serif);font-size:13px;';

      const assignMap = {}; // roleKey → cfId

      // Opções de campo pré-renderizadas para reutilizar nos selects
      const fieldOptions = customs.map(c => {
        const label = c.name
          ? `[${c.id}] ${c.name}${c.display ? ' — ' + c.display : ''}${c.empty ? ' (vazio)' : ''}`
          : `customfield_${c.id} — ${c.display}`;
        return { id: c.id, label, empty: c.empty };
      });

      box.innerHTML = `
        <h3 style="margin:0 0 4px;font-size:16px;color:#fff;">🔍 Descoberta de campos — ${issueKey}</h3>
        <p style="margin:0 0 14px;color:#aaa;">Digite parte do nome ou valor para filtrar. Selecione qual campo corresponde a cada critério.</p>
        ${ROLES.map(role => `
          <div style="margin-bottom:14px;">
            <label style="font-weight:600;display:block;margin-bottom:4px;color:#ccc;">${role.label}</label>
            <input type="text" data-search="${role.key}"
              placeholder="🔎 filtrar por nome ou valor..."
              style="width:100%;padding:5px 8px;border:1px solid #555;border-radius:6px 6px 0 0;border-bottom:none;background:#2a2a3e;color:#e0e0e0;font-size:12px;box-sizing:border-box;outline:none;" />
            <select data-role="${role.key}"
              style="width:100%;padding:6px 8px;border:1px solid #555;border-radius:0 0 6px 6px;background:#2a2a3e;color:#e0e0e0;font-size:13px;">
              <option value="0">(não mapear)</option>
              ${fieldOptions.map(o => `<option value="${o.id}" ${o.empty?'style="color:#999"':''}>${o.label}</option>`).join('')}
            </select>
          </div>
        `).join('')}
        <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
          <button id="disc_cancel" style="padding:7px 16px;border:1px solid #555;border-radius:6px;background:transparent;color:#e0e0e0;cursor:pointer;">Cancelar</button>
          <button id="disc_apply" style="padding:7px 16px;border:none;border-radius:6px;background:#0052cc;color:#fff;cursor:pointer;font-weight:600;">Aplicar</button>
        </div>
      `;

      // Filtro de busca em cada select
      box.querySelectorAll('input[data-search]').forEach(inp => {
        const role = inp.dataset.search;
        const sel  = box.querySelector(`select[data-role="${role}"]`);
        inp.addEventListener('input', () => {
          const q = inp.value.trim().toLowerCase();
          Array.from(sel.options).forEach(opt => {
            if(opt.value === '0'){ opt.hidden = false; return; }
            opt.hidden = q ? !opt.text.toLowerCase().includes(q) : false;
          });
          // Se só restar 1 opção (além de "não mapear"), seleciona automaticamente
          const visible = Array.from(sel.options).filter(o => !o.hidden && o.value !== '0');
          if(visible.length === 1) sel.value = visible[0].value;
        });
      });

      overlay.appendChild(box);
      document.body.appendChild(overlay);

      overlay.querySelector('#disc_cancel').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#disc_apply').addEventListener('click', () => {
        overlay.querySelectorAll('select[data-role]').forEach(sel => {
          const role = sel.dataset.role;
          const val  = Number(sel.value);
          const inputId = {
            CF_CATEGORY:        'ml_s_cf_category',
            CF_SUBCATEGORY:     'ml_s_cf_subcategory',
            CF_REQUEST_TYPE:    'ml_s_cf_request_type',
            CF_USER_VALIDATION: 'ml_s_cf_user_validation',
            CF_SOLUTION_TYPE:   'ml_s_cf_solution_type',
            CF_USAGE_MARK:      'ml_s_cf_usage_mark',
          }[role];
          if(inputId && settingsModal){
            const inp = settingsModal.querySelector('#' + inputId);
            if(inp) inp.value = val;
          }
        });
        overlay.remove();
      });
    }

    // =========================
    // ASSISTENTE DE SETUP INICIAL
    // Wizard curto pra configurar o essencial de uma instalacao nova: webhook de auditoria,
    // os customfields de categoria/subcategoria/etc. (reaproveitando openDiscoverModal —
    // os inputs ocultos abaixo usam os MESMOS ids que o modal de descoberta ja sabe preencher)
    // e o telefone de contato. Nada aqui e obrigatorio.
    // =========================
    function openSetupWizard(opts){
      opts = opts || {};
      document.getElementById('ml_setup_wizard_overlay')?.remove();

      const cur = SETTINGS;

      const overlay = document.createElement('div');
      overlay.id = 'ml_setup_wizard_overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100020;display:flex;align-items:center;justify-content:center;';

      const box = document.createElement('div');
      box.style.cssText = 'background:#1e1e2e;color:#e0e0e0;border-radius:12px;padding:24px;max-width:640px;width:96%;max-height:88vh;overflow-y:auto;font-family:var(--ml-font,sans-serif);font-size:13px;';

      box.innerHTML = `
        <h3 style="margin:0 0 4px;font-size:18px;color:#fff;">&#128075; Bem-vindo ao IS Toolkit</h3>
        <p style="margin:0 0 16px;color:#aaa;line-height:1.5;">
          Assistente rápido de configuração inicial — leva menos de 1 minuto. Nada aqui é obrigatório:
          pule o que não souber agora, você pode reabrir este assistente e configurar depois em
          Configurações → Avançado → "Assistente de setup inicial".
        </p>

        <div style="border-top:1px solid #3a3a4e;padding-top:14px;margin-top:6px;">
          <label style="font-weight:600;display:block;margin-bottom:4px;color:#ccc;">1. Webhook de auditoria por IA <span style="color:#888;font-weight:400;">(já vem preenchido — só troque se souber que mudou)</span></label>
          <input type="text" id="ml_wiz_webhook" placeholder="https://...n8n.../webhook/..." value="${esc(cur.AUDIT_WEBHOOK_URL || '')}"
            style="width:100%;padding:7px 9px;border:1px solid #555;border-radius:6px;background:#2a2a3e;color:#e0e0e0;font-size:12px;box-sizing:border-box;" />
          <div style="font-size:11px;color:#888;margin-top:4px;">É o endpoint central do time — a maioria não precisa tocar aqui. Deixe vazio pra desabilitar o card "Auditar Ticket".</div>
        </div>

        <div style="border-top:1px solid #3a3a4e;padding-top:14px;margin-top:14px;">
          <label style="font-weight:600;display:block;margin-bottom:6px;color:#ccc;">2. Campos do ticket usados na auditoria <span style="color:#888;font-weight:400;">(opcional)</span></label>
          <div style="font-size:11px;color:#888;margin-bottom:8px;">Abra um ticket Jira numa aba antes de clicar aqui — o assistente lê os customfields desse ticket pra você escolher qual é qual.</div>
          <button type="button" id="ml_wiz_discover" style="padding:7px 14px;border:1px solid #555;border-radius:6px;background:#2a2a3e;color:#e0e0e0;cursor:pointer;font-size:12px;">&#128269; Descobrir automaticamente</button>
          <div id="ml_wiz_discover_status" style="font-size:11px;color:#888;margin-top:6px;"></div>
          <!-- Inputs ocultos: mesmos ids que openDiscoverModal ja sabe preencher (reaproveita a logica de Configuracoes) -->
          <input type="hidden" id="ml_s_cf_category" value="${Number(cur.CF_CATEGORY)||0}" />
          <input type="hidden" id="ml_s_cf_subcategory" value="${Number(cur.CF_SUBCATEGORY)||0}" />
          <input type="hidden" id="ml_s_cf_request_type" value="${Number(cur.CF_REQUEST_TYPE)||0}" />
          <input type="hidden" id="ml_s_cf_user_validation" value="${Number(cur.CF_USER_VALIDATION)||0}" />
          <input type="hidden" id="ml_s_cf_solution_type" value="${Number(cur.CF_SOLUTION_TYPE)||0}" />
          <input type="hidden" id="ml_s_cf_usage_mark" value="${Number(cur.CF_USAGE_MARK)||0}" />
        </div>

        <div style="border-top:1px solid #3a3a4e;padding-top:14px;margin-top:14px;">
          <label style="font-weight:600;display:block;margin-bottom:4px;color:#ccc;">3. Telefone de contato (WhatsApp) <span style="color:#888;font-weight:400;">(opcional)</span></label>
          <input type="number" id="ml_wiz_cf_phone" min="0" value="${Number(cur.CF_CONTACT_PHONE)||0}"
            style="width:100%;padding:7px 9px;border:1px solid #555;border-radius:6px;background:#2a2a3e;color:#e0e0e0;font-size:12px;box-sizing:border-box;" />
          <div style="font-size:11px;color:#888;margin-top:4px;">ID do customfield "Contact phone". <b>0</b> = ler direto da tela do ticket (funciona na maioria dos casos — deixe 0 se não souber).</div>
        </div>

        <div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end;flex-wrap:wrap;">
          <button id="ml_wiz_skip" style="padding:7px 16px;border:1px solid #555;border-radius:6px;background:transparent;color:#e0e0e0;cursor:pointer;">Pular por agora</button>
          <button id="ml_wiz_save" style="padding:7px 16px;border:none;border-radius:6px;background:#0052cc;color:#fff;cursor:pointer;font-weight:600;">Salvar e recarregar</button>
        </div>
      `;

      overlay.appendChild(box);
      document.body.appendChild(overlay);

      box.querySelector('#ml_wiz_discover').addEventListener('click', async () => {
        const btn = box.querySelector('#ml_wiz_discover');
        const statusEl = box.querySelector('#ml_wiz_discover_status');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Buscando...';
        const result = await discoverJiraFields();
        btn.disabled = false;
        btn.textContent = orig;
        if(result){
          openDiscoverModal(result.issueKey, result.customs, box);
          statusEl.textContent = `Campos de ${result.issueKey} carregados acima — selecione e clique em "Aplicar".`;
        }
      });

      // "Pular" so marca o wizard como visto (nao muda nenhum valor) — nao interrompe de novo
      // automaticamente, mas continua acessivel em Configuracoes → Avancado quando quiser voltar.
      box.querySelector('#ml_wiz_skip').addEventListener('click', () => {
        try{ saveSettings({ ...SETTINGS, SETUP_WIZARD_DONE: true }); }catch(e){}
        overlay.remove();
      });

      box.querySelector('#ml_wiz_save').addEventListener('click', () => {
        const values = {
          ...SETTINGS,
          AUDIT_WEBHOOK_URL:  String(box.querySelector('#ml_wiz_webhook').value || '').trim(),
          CF_CATEGORY:        Math.max(0, Number(box.querySelector('#ml_s_cf_category').value)        || 0),
          CF_SUBCATEGORY:     Math.max(0, Number(box.querySelector('#ml_s_cf_subcategory').value)     || 0),
          CF_REQUEST_TYPE:    Math.max(0, Number(box.querySelector('#ml_s_cf_request_type').value)    || 0),
          CF_USER_VALIDATION: Math.max(0, Number(box.querySelector('#ml_s_cf_user_validation').value)  || 0),
          CF_SOLUTION_TYPE:   Math.max(0, Number(box.querySelector('#ml_s_cf_solution_type').value)    || 0),
          CF_USAGE_MARK:      Math.max(0, Number(box.querySelector('#ml_s_cf_usage_mark').value)       || 0),
          CF_CONTACT_PHONE:   Math.max(0, Number(box.querySelector('#ml_wiz_cf_phone').value)          || 0),
          SETUP_WIZARD_DONE: true
        };
        const ok = saveSettings(values);
        if(ok){
          const saveBtn = box.querySelector('#ml_wiz_save');
          saveBtn.disabled = true;
          saveBtn.textContent = '✓ Salvo — recarregando...';
          setTimeout(() => { try{ location.reload(); }catch(_){ overlay.remove(); } }, 900);
        } else {
          alert('Não foi possível salvar (GM storage indisponível).');
        }
      });
    }

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
          <button class="ml-s-tab" data-tab-target="autoreload" role="tab"><span class="ml-s-tab-ic">&#x23F1;</span><span>Auto-reload</span></button>
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
                  <textarea id="ml_s_teams">${esc(DERIVE_TEAMS_ALLOWLIST.join('\n'))}</textarea>
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
                  <textarea id="ml_s_iss_triggers">${esc(ISS_TASK_TRIGGER_TEAMS.join('\n'))}</textarea>
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
              </div>
              <details style="margin-top:6px;">
                <summary style="cursor:pointer;font-weight:700;color:var(--ml-text-mut);outline:none;">Avan&ccedil;ado (link type, issue modelo, c&oacute;pia e fechamento)</summary>
                <div class="grid" style="margin-top:10px;">
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
                  <label class="checkbox"><input type="checkbox" id="ml_s_iss_autoclose" ${cur.ISS_TASK_AUTO_CLOSE !== false ? 'checked' : ''} /> Fechar a ISS automaticamente apos criar</label>
                  <div class="hint">Quando ativado, a ISS e fechada assim que criada (a menos que descricao ou comentarios tenham falhado). Erros de anexo nao bloqueiam o fechamento.</div>
                  <label style="margin-top:10px;display:block;">Texto do campo "Solution" ao fechar</label>
                  <input type="text" id="ml_s_iss_autoclose_solution" value="${esc(cur.ISS_TASK_AUTO_CLOSE_SOLUTION || 'Troubleshooting vinculado e tarefa encerrada')}" />
                  <div class="hint">Preenchido automaticamente no campo Solution da transicao "Resolved" do ISS.</div>
                  <div class="hint">Compila TODOS os comentarios (publicos + internos) em UM unico comentario <b>interno</b> na nova tarefa, com autor + data + visibilidade original. Evita poluir o historico com varios comments.</div>
                </div>
                </div>
              </details>
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
                    <b>Exemplos uteis:</b> "Em andamento", "Waiting for customer", "Waiting for support", "Resolvido".<br/>
                    Use <code>{meu_nome}</code> na mensagem pra assinar com o nome de quem estiver logado &mdash; assim o mesmo template funciona pra qualquer analista do time, sem nome fixo.
                  </div>
                  <div id="ml_s_status_list"></div>
                  <button id="ml_s_status_add" class="ghost" style="margin-top: 8px;">+ Adicionar acao de status</button>
                </div>
                <div class="full">
                  <label>Atalhos de teclado para abrir o menu (um por linha)</label>
                  <textarea id="ml_s_as_shortcuts">${esc((Array.isArray(cur.STATUS_MENU_SHORTCUTS) && cur.STATUS_MENU_SHORTCUTS.length ? cur.STATUS_MENU_SHORTCUTS : def.STATUS_MENU_SHORTCUTS).join('\n'))}</textarea>
                  <div class="hint">
                    Padrao: <code>${esc((def.STATUS_MENU_SHORTCUTS || []).join(', '))}</code>.<br/>
                    Se houver so 1 acao cadastrada, o atalho executa direto. Com mais de 1, abre o menu.
                  </div>
                </div>
              </div>
            </div>

            <div class="group full" data-tab="status">
              <h4>Vincular + Fechar (Duplicados)</h4>
              <div class="grid">
                <div class="full">
                  <div class="hint" style="margin-bottom: 10px;">
                    Na tela de <b>Duplicados</b>, o botao <b>"Vincular + Fechar"</b> vincula o(s) ticket(s) selecionado(s) como
                    duplicado e, em seguida, aplica esta transicao de fechamento em cada um. Campos exigidos pela transicao
                    (Resolucao, campos custom, etc.) aparecem num formulario na hora — igual as outras Acoes de Status.
                  </div>
                </div>
                <div>
                  <label>Nome da transicao de fechamento</label>
                  <input type="text" id="ml_s_dupclose_transition" value="${esc(cur.DUPLICATE_CLOSE_TRANSITION || def.DUPLICATE_CLOSE_TRANSITION || '')}" placeholder="Resolve" />
                  <div class="hint">Nome exato da transicao no workflow (ex: <code>Resolve</code>). Se nao bater com o ticket, abre um seletor com as transicoes disponiveis.</div>
                </div>
                <div>
                  <label>Comentario &eacute; p&uacute;blico ou interno?</label>
                  <select id="ml_s_dupclose_internal">
                    <option value="0" ${cur.DUPLICATE_CLOSE_INTERNAL === false || cur.DUPLICATE_CLOSE_INTERNAL == null ? 'selected' : ''}>P&uacute;blico (vis&iacute;vel ao cliente)</option>
                    <option value="1" ${cur.DUPLICATE_CLOSE_INTERNAL === true ? 'selected' : ''}>Interno (obs)</option>
                  </select>
                </div>
                <div class="full">
                  <label>Mensagem de fechamento</label>
                  <textarea id="ml_s_dupclose_comment" style="min-height:70px;">${esc(cur.DUPLICATE_CLOSE_COMMENT || def.DUPLICATE_CLOSE_COMMENT || '')}</textarea>
                  <div class="hint">Placeholders: <code>{vinculado}</code> (key do ticket que ficou aberto, ao qual este foi marcado como duplicado), <code>{meu_nome}</code> (seu nome, via login do Jira).</div>
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
              <h4>Assistente de setup inicial</h4>
              <div class="grid">
                <div class="full">
                  <div class="hint" style="margin:0 0 8px;">
                    Reabre o assistente guiado (webhook de auditoria, campos do ticket e telefone de contato) —
                    o mesmo que aparece automaticamente numa instala&ccedil;&atilde;o nova.
                  </div>
                  <button type="button" id="ml_s_reopen_wizard" class="ghost" style="padding:6px 14px;font-size:13px;">
                    &#128075; Abrir assistente de setup
                  </button>
                </div>
              </div>
            </div>

            <div class="group full" data-tab="advanced">
              <h4>Integra&ccedil;&otilde;es</h4>
              <div class="grid">
                <div class="full">
                  <label>Webhook n8n &mdash; Auditoria de Ticket (IA)</label>
                  <input type="url" id="ml_s_audit_webhook" value="${esc(cur.AUDIT_WEBHOOK_URL || '')}" placeholder="https://verdiflow.../webhook/..." style="font-family:var(--ml-mono);font-size:12px;" />
                  <div class="hint">
                    URL do webhook n8n que recebe os dados do ticket e retorna a an&aacute;lise por IA.
                    J&aacute; vem preenchida com o endpoint central do time (fixo em <code>DEFAULTS</code>) &mdash; s&oacute; troque aqui se o workflow mudar de lugar.
                    Deixe vazio para desabilitar o card de auditoria na home.
                  </div>
                </div>
                <div class="full">
                  <label>Central do Grid (dashboard de arquivos do time)</label>
                  <input type="url" id="ml_s_grid_url" value="${esc(cur.GRID_CENTRAL_URL || '')}" placeholder="https://grid.adminml.com/d/..." style="font-family:var(--ml-mono);font-size:12px;" />
                  <div class="hint">Link do bot&atilde;o &quot;Central Natis&quot; que aparece na Home. Deixe vazio para esconder o atalho.</div>
                </div>
                <div class="full">
                  <label>Atalho &mdash; Assumir ticket + In Progress</label>
                  <input type="text" id="ml_s_assign_shortcut" value="${esc(cur.ASSIGN_SHORTCUT || def.ASSIGN_SHORTCUT || '')}" placeholder="${esc(def.ASSIGN_SHORTCUT || 'Cmd+Shift+A')}" />
                  <div class="hint">
                    Atalho para atribuir o ticket a voc&ecirc; e mover para <em>In Progress</em>.
                    Padr&atilde;o: <code>${esc(def.ASSIGN_SHORTCUT || 'Cmd+Shift+A')}</code>.
                    Modificadores aceitos: <code>Cmd</code>, <code>Ctrl</code>, <code>Shift</code>, <code>Alt</code>.
                    Exemplos: <code>Cmd+Shift+T</code>, <code>Ctrl+Shift+A</code>.
                  </div>
                </div>
                <div class="full">
                  <label>Coment&aacute;rio ao assumir ticket</label>
                  <textarea id="ml_s_assign_comment" rows="4" placeholder="${esc(def.ASSIGN_COMMENT || 'Iniciando atendimento.')}">${esc(cur.ASSIGN_COMMENT || def.ASSIGN_COMMENT || '')}</textarea>
                  <div class="hint">
                    Mensagem postada como coment&aacute;rio <strong>p&uacute;blico</strong> ao mover o ticket para <em>In Progress</em> via atalho.
                    Quebras de linha s&atilde;o preservadas. Padr&atilde;o: <code>${esc(def.ASSIGN_COMMENT || 'Iniciando atendimento.')}</code><br/>
                    Use <code>{meu_nome}</code> pra assinar automaticamente com o nome de quem est&aacute; logado no Jira &mdash; assim o mesmo texto serve pra qualquer analista, sem nome fixo.
                  </div>
                </div>
              </div>
            </div>

            <div class="group full" data-tab="advanced">
              <h4>Campos de Auditoria (Jira Custom Fields)</h4>
              <div class="grid">
                <div class="full" style="margin-bottom:4px;">
                  <div class="hint" style="margin:0 0 8px;">
                    Informe os IDs dos custom fields usados pela Auditoria. Deixe 0 para ignorar.<br/>
                    Use o bot&atilde;o abaixo para descobrir os IDs a partir de um ticket aberto.
                  </div>
                  <button type="button" id="ml_s_discover_fields" style="background:var(--ml-blue);color:#fff;border:none;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:13px;">
                    🔍 Descobrir campos do ticket atual
                  </button>
                </div>
                <div>
                  <label>Categoria (CF ID)</label>
                  <input type="number" id="ml_s_cf_category" value="${Number(cur.CF_CATEGORY)||0}" min="0" />
                  <div class="hint">Ex: customfield_<strong>10200</strong> → ID = 10200</div>
                </div>
                <div>
                  <label>Subcategoria (CF ID)</label>
                  <input type="number" id="ml_s_cf_subcategory" value="${Number(cur.CF_SUBCATEGORY)||0}" min="0" />
                </div>
                <div>
                  <label>Tipo de solicita&ccedil;&atilde;o (CF ID)</label>
                  <input type="number" id="ml_s_cf_request_type" value="${Number(cur.CF_REQUEST_TYPE)||0}" min="0" />
                </div>
                <div>
                  <label>Valida&ccedil;&atilde;o do usu&aacute;rio (CF ID)</label>
                  <input type="number" id="ml_s_cf_user_validation" value="${Number(cur.CF_USER_VALIDATION)||0}" min="0" />
                </div>
                <div>
                  <label>Solu&ccedil;&atilde;o aplicada (CF ID)</label>
                  <input type="number" id="ml_s_cf_solution_type" value="${Number(cur.CF_SOLUTION_TYPE)||0}" min="0" />
                </div>
                <div>
                  <label>Flag "Changed priority" (CF ID)</label>
                  <input type="number" id="ml_s_cf_changed_priority" value="${Number(cur.CF_CHANGED_PRIORITY)||0}" min="0" />
                  <div class="hint">Campo No/Yes que indica reclassifica&ccedil;&atilde;o de prioridade. Quando <b>Yes</b>, a auditoria cobra justificativa no crit&eacute;rio Reclassifica&ccedil;&atilde;o.</div>
                </div>
              </div>
            </div>

            <div class="group full" data-tab="advanced">
              <h4>Acionamento via WhatsApp</h4>
              <div class="grid">
                <div class="full">
                  <label>Mensagem padr&atilde;o (pr&eacute;-escrita no WhatsApp)</label>
                  <textarea id="ml_s_wa_msg" style="min-height:70px;">${esc(cur.WHATSAPP_MSG_TEMPLATE || def.WHATSAPP_MSG_TEMPLATE || '')}</textarea>
                  <div class="hint">Placeholders: <code>{key}</code> (chamado), <code>{reporter}</code> (relator, nome completo), <code>{firstname}</code> (s&oacute; o 1&ordm; nome do relator &mdash; use este se o ticket puder ter sido aberto por outra pessoa), <code>{summary}</code> (t&iacute;tulo), <code>{description}</code> (o que foi solicitado), <code>{meu_nome}</code> (seu nome, via login do Jira &mdash; evita assinatura fixa hardcoded). Dica: prefira <code>{firstname}</code> a <code>{reporter}</code>, e n&atilde;o fixe uma sauda&ccedil;&atilde;o como "Boa tarde" (nem sempre &eacute; verdade). O WhatsApp deixa a mensagem pronta &mdash; voc&ecirc; aperta Enter (n&atilde;o envia sozinho).</div>
                </div>
                <div>
                  <label>C&oacute;digo do pa&iacute;s (fallback)</label>
                  <input type="text" id="ml_s_wa_cc" value="${esc(String(cur.WHATSAPP_COUNTRY_CODE || def.WHATSAPP_COUNTRY_CODE || '55'))}" placeholder="55" />
                  <div class="hint">O c&oacute;digo &eacute; inferido pela <b>localidade</b> (BR 55 &middot; MX 52 &middot; CO 57 &middot; CL 56 &middot; AR 54 &middot; PE 51). Se a pessoa colocar <code>+</code> no telefone, respeita o dela. Este valor s&oacute; &eacute; usado quando n&atilde;o d&aacute; pra inferir.</div>
                </div>
                <div>
                  <label>"Contact phone" (CF ID)</label>
                  <input type="number" id="ml_s_cf_contact_phone" value="${Number(cur.CF_CONTACT_PHONE)||0}" min="0" />
                  <div class="hint">ID do customfield do telefone. <b>0</b> = ler da p&aacute;gina. Use "Descobrir campos" pra achar o ID (mais confi&aacute;vel).</div>
                </div>
              </div>
            </div>

            <div class="group full" data-tab="advanced">
              <h4>Marca&ccedil;&atilde;o de uso</h4>
              <div class="grid">
                <div>
                  <label>Campo de texto livre "Categorias" (CF ID)</label>
                  <input type="number" id="ml_s_cf_usage_mark" value="${Number(cur.CF_USAGE_MARK)||0}" min="0" />
                  <div class="hint"><b>0</b> = desligado. Al&eacute;m do label <code>is-toolkit</code> (sempre aplicado), toda a&ccedil;&atilde;o relevante (derivar, status, coment&aacute;rio, auditoria) acrescenta o marcador abaixo a este campo de texto &mdash; sem apagar o que j&aacute; estava escrito. Use "Descobrir campos" pra achar o ID.</div>
                </div>
                <div>
                  <label>Texto do marcador</label>
                  <input type="text" id="ml_s_usage_mark_text" value="${esc(String(cur.USAGE_MARK_TEXT || def.USAGE_MARK_TEXT || '[IS-Toolkit]'))}" />
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

            <div class="group full" data-tab="autoreload">
              <h4>Auto-reload da p&aacute;gina</h4>
              <div class="grid">
                <div class="full">
                  <div class="hint" style="margin-bottom:8px;">
                    O Jira daqui n&atilde;o atualiza filas/tickets em tempo real. O auto-reload recarrega a
                    p&aacute;gina sozinho. O liga/desliga fica num <b>bot&atilde;o flutuante</b> e &eacute; <b>por aba</b>
                    &mdash; ligar numa aba n&atilde;o afeta as outras. Aqui ficam os padr&otilde;es globais.
                  </div>
                </div>
                <div>
                  <label style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="ml_s_ar_button_visible" ${cur.AUTO_RELOAD_BUTTON_VISIBLE ? 'checked' : ''} />
                    <span>Mostrar bot&atilde;o flutuante</span>
                  </label>
                  <div class="hint">Desligado por padr&atilde;o (o bot&atilde;o &#8635; confundia quem n&atilde;o usa a feature). O auto-reload em si continua funcionando por baixo; isso s&oacute; esconde/mostra o bot&atilde;o de controle.</div>
                </div>
                <div>
                  <label>Intervalo (segundos)</label>
                  <input type="number" id="ml_s_ar_interval" value="${esc(String(_arLoadDefaultInterval() || cur.AUTO_RELOAD_INTERVAL_SEC || def.AUTO_RELOAD_INTERVAL_SEC || 60))}" min="5" max="3600" />
                  <div class="hint">Padr&atilde;o global (m&iacute;nimo 5s). Tamb&eacute;m d&aacute; pra mudar r&aacute;pido clicando com o <b>bot&atilde;o direito</b> no bot&atilde;o flutuante (quando vis&iacute;vel).</div>
                </div>
                <div>
                  <label style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="ml_s_ar_autostart" ${cur.AUTO_RELOAD_AUTOSTART ? 'checked' : ''} />
                    <span>Iniciar automaticamente em cada aba</span>
                  </label>
                  <div class="hint">Se ligado, toda aba do Jira j&aacute; abre recarregando. Padr&atilde;o desligado (voc&ecirc; liga por aba no bot&atilde;o).</div>
                </div>
                <div>
                  <label style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="ml_s_ar_pause_typing" ${cur.AUTO_RELOAD_PAUSE_TYPING !== false ? 'checked' : ''} />
                    <span>Pausar enquanto estou digitando</span>
                  </label>
                  <div class="hint">N&atilde;o recarrega com o foco num campo de texto (evita perder o que voc&ecirc; escreve).</div>
                </div>
                <div>
                  <label style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="ml_s_ar_pause_modal" ${cur.AUTO_RELOAD_PAUSE_MODAL !== false ? 'checked' : ''} />
                    <span>Pausar com um modal do IS Toolkit aberto</span>
                  </label>
                  <div class="hint">Protege a&ccedil;&otilde;es em andamento (derivar, lote, configura&ccedil;&otilde;es).</div>
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

      const _hardClose = () => { modal.remove(); overlay.remove(); };
      // Guarda de alteracoes nao salvas: marca "dirty" em qualquer input/change dentro
      // do modal; ao fechar/cancelar/clicar fora com pendencias, pede confirmacao.
      let _settingsDirty = false;
      const _markDirty = () => { _settingsDirty = true; };
      modal.addEventListener('input', _markDirty);
      modal.addEventListener('change', _markDirty);
      // Salvar/Reset/Importar recarregam a página (não chamam close()), então não disparam o aviso.
      const close = () => {
        if(_settingsDirty && !confirm('Há alterações não salvas nas Configurações. Descartar e fechar?')) return;
        _hardClose();
      };
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
        autoreload: '<b>Auto-reload</b> &mdash; Recarrega a p&aacute;gina automaticamente (o Jira daqui n&atilde;o atualiza em tempo real). Liga/desliga no bot&atilde;o flutuante, <b>por aba</b>. Aqui ficam o intervalo padr&atilde;o e as pausas de seguran&ccedil;a.',
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
            <textarea class="status-comment" placeholder="Mensagem que vai no comentario quando aplicar esta acao..." style="min-height: 110px; resize: vertical;">${esc(a.comment || '')}</textarea>
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

      // Botao de descoberta de campos de auditoria
      modal.querySelector('#ml_s_reopen_wizard')?.addEventListener('click', () => {
        try{ openSetupWizard({ forced: true }); }catch(e){ alert('Erro ao abrir o assistente: ' + (e.message || e)); }
      });

      modal.querySelector('#ml_s_discover_fields')?.addEventListener('click', async () => {
        const btn = modal.querySelector('#ml_s_discover_fields');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Buscando...';
        const result = await discoverJiraFields();
        btn.disabled = false;
        btn.textContent = orig;
        if(result) openDiscoverModal(result.issueKey, result.customs, modal);
      });

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

          // Atalho "Assumir ticket + In Progress"
          const assignShortcutVal = String(modal.querySelector('#ml_s_assign_shortcut')?.value || '').trim() || DEFAULTS.ASSIGN_SHORTCUT;
          if(!parseShortcut(assignShortcutVal)) return showErr(`Atalho invalido (Assumir ticket): "${assignShortcutVal}". Ex: Cmd+Shift+A, Ctrl+Shift+T.`);

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
            ISS_TASK_AUTO_CLOSE:          !!modal.querySelector('#ml_s_iss_autoclose').checked,
            ISS_TASK_AUTO_CLOSE_SOLUTION: String(modal.querySelector('#ml_s_iss_autoclose_solution')?.value || '').trim() || 'Troubleshooting vinculado e tarefa encerrada',

            // Auto-reload
            AUTO_RELOAD_BUTTON_VISIBLE: !!modal.querySelector('#ml_s_ar_button_visible')?.checked,
            AUTO_RELOAD_INTERVAL_SEC: (() => {
              const v = Number(modal.querySelector('#ml_s_ar_interval')?.value);
              return Number.isFinite(v) && v >= 5 ? Math.round(v) : DEFAULTS.AUTO_RELOAD_INTERVAL_SEC;
            })(),
            AUTO_RELOAD_AUTOSTART: !!modal.querySelector('#ml_s_ar_autostart')?.checked,
            AUTO_RELOAD_PAUSE_TYPING: !!modal.querySelector('#ml_s_ar_pause_typing')?.checked,
            AUTO_RELOAD_PAUSE_MODAL: !!modal.querySelector('#ml_s_ar_pause_modal')?.checked,

            // Backup reminder
            BACKUP_REMIND_ENABLED: !!modal.querySelector('#ml_s_backup_enabled').checked,
            BACKUP_REMIND_INTERVAL_DAYS: (() => {
              const v = Number(modal.querySelector('#ml_s_backup_days').value);
              return Number.isFinite(v) && v >= 1 ? v : DEFAULTS.BACKUP_REMIND_INTERVAL_DAYS;
            })(),

            // Snippets
            COMMENT_SNIPPETS: (() => {
              const rows = (() => {
                const uiRows = [...modal.querySelectorAll('#ml_s_snip_list .ml-s-listrow')]
                  .map(row => ({
                    name: String(row.querySelector('.snip-name').value || '').trim(),
                    command: (() => {
                      let c = String(row.querySelector('.snip-cmd').value || '').trim().replace(/\s+/g, '');
                      if(c && !c.startsWith('/')) c = '/' + c;
                      return c;
                    })(),
                    text: String(row.querySelector('.snip-text').value || '').trim()
                  }))
                  .filter(s => s.text);
                // Proteção contra wipeout: se a UI está vazia mas há snippets salvos,
                // mantém os existentes em vez de sobrescrever com [].
                // Isso evita perda acidental ao salvar configurações sem ver a aba Snippets.
                if(!uiRows.length){
                  try{
                    const rawSaved = _gmGet(_STORAGE_KEY) || localStorage.getItem(_STORAGE_KEY);
                    const saved = rawSaved ? (typeof rawSaved === 'string' ? JSON.parse(rawSaved) : rawSaved) : {};
                    if(Array.isArray(saved.COMMENT_SNIPPETS) && saved.COMMENT_SNIPPETS.length){
                      console.log('[is-toolkit] Snippets preservados do GM storage (lista UI vazia):', saved.COMMENT_SNIPPETS.length);
                      return saved.COMMENT_SNIPPETS;
                    }
                  }catch(_){}
                }
                return uiRows;
              })(); // texto obrigatorio
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
            DUPLICATE_CLOSE_TRANSITION: String(modal.querySelector('#ml_s_dupclose_transition')?.value || '').trim() || DEFAULTS.DUPLICATE_CLOSE_TRANSITION,
            DUPLICATE_CLOSE_COMMENT: String(modal.querySelector('#ml_s_dupclose_comment')?.value || '').replace(/\r\n/g,'\n'),
            DUPLICATE_CLOSE_INTERNAL: modal.querySelector('#ml_s_dupclose_internal')?.value === '1',
            QUICK_COMMENT_SHORTCUTS: (() => {
              const lines = String(modal.querySelector('#ml_s_qc_shortcuts').value || '')
                .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
              return lines.length ? lines : DEFAULTS.QUICK_COMMENT_SHORTCUTS.slice();
            })(),

            // Integracoes
            AUDIT_WEBHOOK_URL: String(modal.querySelector('#ml_s_audit_webhook')?.value || '').trim(),
            GRID_CENTRAL_URL: String(modal.querySelector('#ml_s_grid_url')?.value || '').trim(),

            // Campos de auditoria
            CF_CATEGORY:        Math.max(0, Number(modal.querySelector('#ml_s_cf_category')?.value)  || 0),
            CF_SUBCATEGORY:     Math.max(0, Number(modal.querySelector('#ml_s_cf_subcategory')?.value)  || 0),
            CF_REQUEST_TYPE:    Math.max(0, Number(modal.querySelector('#ml_s_cf_request_type')?.value)   || 0),
            CF_USER_VALIDATION: Math.max(0, Number(modal.querySelector('#ml_s_cf_user_validation')?.value)|| 0),
            CF_SOLUTION_TYPE:   Math.max(0, Number(modal.querySelector('#ml_s_cf_solution_type')?.value)  || 0),
            CF_CHANGED_PRIORITY: Math.max(0, Number(modal.querySelector('#ml_s_cf_changed_priority')?.value) || 0),
            CF_CONTACT_PHONE: Math.max(0, Number(modal.querySelector('#ml_s_cf_contact_phone')?.value) || 0),
            WHATSAPP_COUNTRY_CODE: String(modal.querySelector('#ml_s_wa_cc')?.value || '').replace(/\D/g,'') || DEFAULTS.WHATSAPP_COUNTRY_CODE,
            WHATSAPP_MSG_TEMPLATE: String(modal.querySelector('#ml_s_wa_msg')?.value || '').replace(/\r\n/g,'\n').trim() || DEFAULTS.WHATSAPP_MSG_TEMPLATE,
            ASSIGN_SHORTCUT: String(modal.querySelector('#ml_s_assign_shortcut')?.value || '').trim() || DEFAULTS.ASSIGN_SHORTCUT,
            ASSIGN_COMMENT: String(modal.querySelector('#ml_s_assign_comment')?.value || '').replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '') || DEFAULTS.ASSIGN_COMMENT,
            CF_USAGE_MARK: Math.max(0, Number(modal.querySelector('#ml_s_cf_usage_mark')?.value) || 0),
            USAGE_MARK_TEXT: String(modal.querySelector('#ml_s_usage_mark_text')?.value || '').trim() || DEFAULTS.USAGE_MARK_TEXT
          };

          const ok = saveSettings(values);
          if(!ok) return showErr('Nao foi possivel salvar (localStorage cheio ou bloqueado).');

          // Sincroniza o intervalo do auto-reload: padrao global + a aba atual (mantendo
          // o estado ligado/desligado desta aba). Assim o novo intervalo vale ja no reload.
          try{
            const arInt = values.AUTO_RELOAD_INTERVAL_SEC;
            if(!_gmSet(AR_DEFAULT_INT_KEY, String(arInt))){ try{ localStorage.setItem(AR_DEFAULT_INT_KEY, String(arInt)); }catch{} }
            const t = _arLoadTab() || {};
            t.intervalSec = arInt;
            sessionStorage.setItem(AR_STATE_KEY, JSON.stringify(t));
          }catch(_){}

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
          const rawGm = _gmGet(_STORAGE_KEY);
          const raw = (rawGm ? (typeof rawGm === 'string' ? rawGm : JSON.stringify(rawGm)) : null) || localStorage.getItem(_STORAGE_KEY) || '{}';
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
    // IMPORT TEXT BLAZE: modal autocontido pra colar JSON ou TSV manual
    // (usa estilos inline pra nao depender do CSS do modal pai)
    // =========================
    function openTextBlazeImportModal(onConfirm){
      document.getElementById('ml_tb_import_overlay')?.remove();
      document.getElementById('ml_tb_import_modal')?.remove();

      // Tokens de cor (fallback se variaveis nao estiverem definidas)
      const C = {
        bg0:'#0a0e17', bg1:'#0f172a', bg2:'#1e293b',
        border:'#2a3a55', text:'#e6ecf6', dim:'#9ca3af',
        blue:'#5b8def', red:'#ef4444', redSoft:'#3b1620',
        mono:'ui-monospace,SFMono-Regular,Menlo,monospace'
      };

      const overlay = document.createElement('div');
      overlay.id = 'ml_tb_import_overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:10000060;';

      const modal = document.createElement('div');
      modal.id = 'ml_tb_import_modal';
      modal.style.cssText = [
        'position:fixed','top:8vh','left:50%','transform:translateX(-50%)',
        'width:min(680px,94vw)','max-height:84vh',
        `background:${C.bg1}`, `color:${C.text}`,
        `border:1px solid ${C.border}`, 'border-radius:12px',
        'z-index:10000061','display:flex','flex-direction:column',
        'box-shadow:0 24px 60px rgba(0,0,0,.55)',
        'font:13px/1.45 system-ui,-apple-system,sans-serif'
      ].join(';');

      modal.innerHTML = `
        <!-- HEADER -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid ${C.border};flex-shrink:0;">
          <div>
            <div style="font-size:15px;font-weight:700;">&#x2B07; Importar snippets do Text Blaze</div>
            <div style="font-size:12px;color:${C.dim};margin-top:3px;">Cole abaixo o JSON do scraper ou uma lista manual.</div>
          </div>
          <button id="ml_tb_close" style="background:${C.bg2};color:${C.text};border:1px solid ${C.border};border-radius:6px;padding:6px 12px;font:600 12px system-ui;cursor:pointer;">Fechar</button>
        </div>

        <!-- BODY (rolavel) -->
        <div style="flex:1;overflow-y:auto;padding:18px 20px;">

          <!-- Tabs: Scraper / Manual -->
          <div id="ml_tb_tabs" style="display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid ${C.border};">
            <button data-mode="scraper" class="ml_tb_tab active" style="background:transparent;color:${C.text};border:0;border-bottom:2px solid ${C.blue};padding:8px 12px;font:600 12px system-ui;cursor:pointer;">
              \uD83E\uDD16 Do Scraper (JSON)
            </button>
            <button data-mode="manual" class="ml_tb_tab" style="background:transparent;color:${C.dim};border:0;border-bottom:2px solid transparent;padding:8px 12px;font:600 12px system-ui;cursor:pointer;">
              \u270F\uFE0F Manual (lista)
            </button>
          </div>

          <!-- Hint dinamico por tab (sem background fixo pra nao brigar com cards internos) -->
          <div id="ml_tb_hint" style="font-size:12px;color:${C.dim};line-height:1.5;margin-bottom:14px;"></div>

          <!-- Textarea unica -->
          <textarea id="ml_tb_input" spellcheck="false"
            style="width:100%;box-sizing:border-box;min-height:200px;max-height:340px;
                   background:${C.bg0};color:${C.text};border:1px solid ${C.border};border-radius:8px;
                   padding:10px 12px;font:12px ${C.mono};resize:vertical;"></textarea>

          <!-- Preview (aparece depois do Validar) -->
          <div id="ml_tb_preview" style="display:none;margin-top:14px;">
            <div style="font-size:12px;font-weight:700;color:${C.text};margin-bottom:6px;">
              \u2705 Preview: <span id="ml_tb_count">0</span> snippet(s) ser\u00e3o adicionados
            </div>
            <div id="ml_tb_preview_list" style="max-height:220px;overflow-y:auto;background:${C.bg0};border:1px solid ${C.border};border-radius:8px;"></div>
            <div style="margin-top:8px;font-size:11px;color:${C.dim};">
              <b>Lembre:</b> ap\u00f3s importar, ainda \u00e9 preciso clicar <b>"Salvar e recarregar p\u00e1gina"</b> nas Configura\u00e7\u00f5es.
            </div>
          </div>

          <!-- Erro -->
          <div id="ml_tb_err" style="display:none;margin-top:12px;color:#ffd8d8;background:${C.redSoft};border:1px solid ${C.red};padding:10px 12px;border-radius:8px;font-size:12px;"></div>
        </div>

        <!-- FOOTER fixo -->
        <div style="display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid ${C.border};background:${C.bg1};flex-shrink:0;">
          <button id="ml_tb_cancel" style="background:${C.bg2};color:${C.text};border:1px solid ${C.border};border-radius:6px;padding:8px 14px;font:600 12px system-ui;cursor:pointer;">Cancelar</button>
          <button id="ml_tb_validate" style="background:${C.bg2};color:${C.text};border:1px solid ${C.border};border-radius:6px;padding:8px 14px;font:600 12px system-ui;cursor:pointer;">Validar</button>
          <button id="ml_tb_import" disabled style="background:${C.blue};color:#fff;border:0;border-radius:6px;padding:8px 14px;font:600 12px system-ui;cursor:not-allowed;opacity:.5;">Importar</button>
        </div>
      `;

      document.body.appendChild(overlay);
      document.body.appendChild(modal);

      const close = () => { overlay.remove(); modal.remove(); };
      overlay.onclick = close;
      modal.querySelector('#ml_tb_close').onclick = close;
      modal.querySelector('#ml_tb_cancel').onclick = close;

      const input = modal.querySelector('#ml_tb_input');
      const hintBox = modal.querySelector('#ml_tb_hint');
      const errBox = modal.querySelector('#ml_tb_err');
      const previewBox = modal.querySelector('#ml_tb_preview');
      const previewList = modal.querySelector('#ml_tb_preview_list');
      const previewCount = modal.querySelector('#ml_tb_count');
      const importBtn = modal.querySelector('#ml_tb_import');

      // Bookmarklet com o scraper COMPLETO inline (URL-encoded).
      // Necessario porque dashboards modernos (como blaze.today) tem CSP estrito
      // que bloqueia carregar scripts externos via <script src=...>.
      // O placeholder %2F%2A%0A%20%2A%20Text%20Blaze%20-%3E%20Jira%20Localidade%20%28Snippet%20Scraper%29%20%E2%80%94%20versao%20BOOKMARKLET%0A%20%2A%0A%20%2A%20Este%20arquivo%20eh%20carregado%20dinamicamente%20quando%20o%20usuario%20clica%20no%0A%20%2A%20bookmarklet%20%22%F0%9F%93%8B%20Capturar%20TB%22%20arrastado%20pros%20favoritos.%0A%20%2A%0A%20%2A%20O%20bookmarklet%20em%20si%20eh%20apenas%20um%201-liner%20que%20faz%3A%0A%20%2A%20%20%20javascript%3A%28function%28%29%7Bvar%20s%3Ddocument.createElement%28%27script%27%29%3B%0A%20%2A%20%20%20s.src%3D%27https%3A%2F%2Fraw.githubusercontent.com%2Fgunsouza%2Fjira-localidade%2Fmain%2Ftools%2Ftextblaze-scraper.bookmarklet.js%3Fv%3D%27%2BDate.now%28%29%3B%0A%20%2A%20%20%20document.body.appendChild%28s%29%3B%7D%29%28%29%3B%0A%20%2A%0A%20%2A%20Diferencas%20pra%20versao%20.user.js%20%28Tampermonkey%29%3A%0A%20%2A%20%20-%20Sem%20header%20%3D%3DUserScript%3D%3D%0A%20%2A%20%20-%20Auto-executa%20o%20scrape%20ao%20carregar%20%28sem%20precisar%20clicar%20em%20botao%29%0A%20%2A%20%20-%20Se%20ja%20foi%20carregado%2C%20apenas%20re-executa%0A%20%2A%2F%0A%0A%28function%28%29%7B%0A%20%20%27use%20strict%27%3B%0A%0A%20%20const%20LOG%20%3D%20%28...a%29%20%3D%3E%20console.log%28%27%5Btb-scraper%5D%27%2C%20...a%29%3B%0A%0A%20%20%2F%2F%20Re-executa%20direto%20se%20ja%20carregou%20antes%20%28evita%20duplicar%20listeners%2FIDs%29%0A%20%20if%28window.__tbScraperStart%29%7B%0A%20%20%20%20LOG%28%27ja%20carregado%2C%20re-executando...%27%29%3B%0A%20%20%20%20window.__tbScraperStart%28%29%3B%0A%20%20%20%20return%3B%0A%20%20%7D%0A%0A%20%20function%20findSnippetRows%28%29%7B%0A%20%20%20%20const%20tries%20%3D%20%5B%0A%20%20%20%20%20%20%27a%5Bhref%2A%3D%22%2Fsnippet%2F%22%5D%27%2C%0A%20%20%20%20%20%20%27%5Bdata-test%3D%22snippet-row%22%5D%27%2C%0A%20%20%20%20%20%20%27%5Bdata-snippet-id%5D%27%2C%0A%20%20%20%20%20%20%27%5Brole%3D%22row%22%5D%27%2C%0A%20%20%20%20%20%20%27%5Brole%3D%22listitem%22%5D%27%2C%0A%20%20%20%20%20%20%27.MuiListItem-root%27%2C%0A%20%20%20%20%20%20%27li%5Bclass%2A%3D%22snippet%22%20i%5D%27%2C%0A%20%20%20%20%20%20%27div%5Bclass%2A%3D%22snippet-row%22%20i%5D%27%2C%0A%20%20%20%20%20%20%27div%5Bclass%2A%3D%22snippetItem%22%20i%5D%27%0A%20%20%20%20%5D%3B%0A%20%20%20%20for%28const%20sel%20of%20tries%29%7B%0A%20%20%20%20%20%20const%20found%20%3D%20document.querySelectorAll%28sel%29%3B%0A%20%20%20%20%20%20if%28found.length%20%3E%3D%202%29%7B%0A%20%20%20%20%20%20%20%20LOG%28%60achou%20%24%7Bfound.length%7D%20linhas%20usando%20seletor%20%22%24%7Bsel%7D%22%60%29%3B%0A%20%20%20%20%20%20%20%20return%20Array.from%28found%29%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%0A%20%20%20%20LOG%28%27nenhum%20seletor%20padrao%20casou.%20Heuristica%20por%20shortcut%20texto...%27%29%3B%0A%20%20%20%20const%20all%20%3D%20document.querySelectorAll%28%27a%2C%20%5Brole%3D%22button%22%5D%2C%20li%2C%20div%27%29%3B%0A%20%20%20%20const%20rows%20%3D%20%5B%5D%3B%0A%20%20%20%20const%20seen%20%3D%20new%20Set%28%29%3B%0A%20%20%20%20all.forEach%28el%20%3D%3E%20%7B%0A%20%20%20%20%20%20const%20txt%20%3D%20%28el.textContent%20%7C%7C%20%27%27%29.trim%28%29%3B%0A%20%20%20%20%20%20if%28%21txt%20%7C%7C%20txt.length%20%3E%20300%29%20return%3B%0A%20%20%20%20%20%20if%28%21%2F%5C%2F%5Ba-z%5D%5B%5Cw-%5D%7B0%2C30%7D%5Cb%2Fi.test%28txt%29%29%20return%3B%0A%20%20%20%20%20%20const%20hasChildShortcut%20%3D%20Array.from%28el.children%29.some%28c%20%3D%3E%20%2F%5C%2F%5Ba-z%5D%2Fi.test%28%28c.textContent%20%7C%7C%20%27%27%29%29%29%3B%0A%20%20%20%20%20%20if%28hasChildShortcut%29%20return%3B%0A%20%20%20%20%20%20if%28seen.has%28el%29%29%20return%3B%0A%20%20%20%20%20%20seen.add%28el%29%3B%0A%20%20%20%20%20%20rows.push%28el%29%3B%0A%20%20%20%20%7D%29%3B%0A%20%20%20%20LOG%28%60heuristica%20achou%20%24%7Brows.length%7D%20candidatos%60%29%3B%0A%20%20%20%20return%20rows%3B%0A%20%20%7D%0A%0A%20%20function%20extractShortcut%28row%29%7B%0A%20%20%20%20const%20txt%20%3D%20%28row.textContent%20%7C%7C%20%27%27%29.trim%28%29%3B%0A%20%20%20%20const%20m%20%3D%20txt.match%28%2F%5C%2F%5Ba-z%5D%5B%5Cw-%5D%7B0%2C40%7D%2Fi%29%3B%0A%20%20%20%20return%20m%20%3F%20m%5B0%5D%20%3A%20%27%27%3B%0A%20%20%7D%0A%0A%20%20function%20extractName%28row%29%7B%0A%20%20%20%20const%20cand%20%3D%20Array.from%28row.querySelectorAll%28%27%2A%27%29%29.map%28n%20%3D%3E%20%28n.textContent%20%7C%7C%20%27%27%29.trim%28%29%29%0A%20%20%20%20%20%20.filter%28t%20%3D%3E%20t%20%26%26%20t.length%20%3E%201%20%26%26%20t.length%20%3C%20120%20%26%26%20%21t.startsWith%28%27%2F%27%29%29%3B%0A%20%20%20%20return%20cand%5B0%5D%20%7C%7C%20%27%27%3B%0A%20%20%7D%0A%0A%20%20function%20findEditor%28%29%7B%0A%20%20%20%20const%20sels%20%3D%20%5B%0A%20%20%20%20%20%20%27.ProseMirror%27%2C%0A%20%20%20%20%20%20%27%5Bcontenteditable%3D%22true%22%5D%5Bclass%2A%3D%22editor%22%20i%5D%27%2C%0A%20%20%20%20%20%20%27%5Bcontenteditable%3D%22true%22%5D%27%2C%0A%20%20%20%20%20%20%27.cm-content%27%2C%0A%20%20%20%20%20%20%27textarea%5Bclass%2A%3D%22snippet%22%20i%5D%27%2C%0A%20%20%20%20%20%20%27textarea%27%0A%20%20%20%20%5D%3B%0A%20%20%20%20for%28const%20sel%20of%20sels%29%7B%0A%20%20%20%20%20%20const%20el%20%3D%20document.querySelector%28sel%29%3B%0A%20%20%20%20%20%20if%28el%20%26%26%20%28el.offsetWidth%20%3E%20200%20%7C%7C%20el.value%29%29%7B%0A%20%20%20%20%20%20%20%20return%20el%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%0A%20%20%20%20return%20null%3B%0A%20%20%7D%0A%0A%20%20function%20extractEditorText%28editor%29%7B%0A%20%20%20%20if%28%21editor%29%20return%20%27%27%3B%0A%20%20%20%20if%28editor.tagName%20%3D%3D%3D%20%27TEXTAREA%27%29%20return%20editor.value%20%7C%7C%20%27%27%3B%0A%20%20%20%20return%20%28editor.innerText%20%7C%7C%20editor.textContent%20%7C%7C%20%27%27%29.trim%28%29%3B%0A%20%20%7D%0A%0A%20%20function%20extractMainContentFallback%28%29%7B%0A%20%20%20%20const%20sidebarWidth%20%3D%20320%3B%0A%20%20%20%20const%20rightPanelStart%20%3D%20Math.max%28window.innerWidth%20-%20320%2C%20700%29%3B%0A%20%20%20%20const%20candidates%20%3D%20Array.from%28document.querySelectorAll%28%27div%2C%20article%2C%20section%2C%20p%27%29%29%3B%0A%20%20%20%20let%20best%20%3D%20null%3B%0A%20%20%20%20let%20bestScore%20%3D%200%3B%0A%20%20%20%20for%28const%20el%20of%20candidates%29%7B%0A%20%20%20%20%20%20const%20rect%20%3D%20el.getBoundingClientRect%28%29%3B%0A%20%20%20%20%20%20if%28rect.width%20%3C%20200%20%7C%7C%20rect.height%20%3C%2030%29%20continue%3B%0A%20%20%20%20%20%20if%28rect.left%20%3C%20sidebarWidth%29%20continue%3B%0A%20%20%20%20%20%20if%28rect.right%20%3E%20rightPanelStart%20%2B%20200%29%20continue%3B%0A%20%20%20%20%20%20const%20txt%20%3D%20%28el.innerText%20%7C%7C%20%27%27%29.trim%28%29%3B%0A%20%20%20%20%20%20if%28%21txt%20%7C%7C%20txt.length%20%3C%2020%20%7C%7C%20txt.length%20%3E%208000%29%20continue%3B%0A%20%20%20%20%20%20const%20hasInnerCandidate%20%3D%20Array.from%28el.children%29.some%28c%20%3D%3E%20%7B%0A%20%20%20%20%20%20%20%20const%20t%20%3D%20%28c.innerText%20%7C%7C%20%27%27%29.trim%28%29%3B%0A%20%20%20%20%20%20%20%20return%20t%20%26%26%20t.length%20%3E%20txt.length%20%2A%200.85%3B%0A%20%20%20%20%20%20%7D%29%3B%0A%20%20%20%20%20%20if%28hasInnerCandidate%29%20continue%3B%0A%20%20%20%20%20%20const%20score%20%3D%20txt.length%3B%0A%20%20%20%20%20%20if%28score%20%3E%20bestScore%29%7B%20bestScore%20%3D%20score%3B%20best%20%3D%20el%3B%20%7D%0A%20%20%20%20%7D%0A%20%20%20%20if%28%21best%29%20return%20%27%27%3B%0A%20%20%20%20const%20txt%20%3D%20%28best.innerText%20%7C%7C%20%27%27%29.trim%28%29%3B%0A%20%20%20%20LOG%28%60fallback%20main%20content%3A%20%24%7Btxt.length%7D%20chars%20%28score%3D%24%7BbestScore%7D%29%60%29%3B%0A%20%20%20%20return%20txt%3B%0A%20%20%7D%0A%0A%20%20async%20function%20tryEnterEditMode%28%29%7B%0A%20%20%20%20const%20editBtns%20%3D%20Array.from%28document.querySelectorAll%28%27button%2C%20%5Brole%3D%22button%22%5D%2C%20%5Brole%3D%22tab%22%5D%27%29%29%0A%20%20%20%20%20%20.filter%28b%20%3D%3E%20%7B%0A%20%20%20%20%20%20%20%20const%20txt%20%3D%20%28b.textContent%20%7C%7C%20%27%27%29.trim%28%29%3B%0A%20%20%20%20%20%20%20%20return%20%2F%5Eedit%24%2Fi.test%28txt%29%20%26%26%20b.offsetWidth%20%3E%200%20%26%26%20b.offsetHeight%20%3E%200%3B%0A%20%20%20%20%20%20%7D%29%3B%0A%20%20%20%20if%28editBtns.length%29%7B%0A%20%20%20%20%20%20try%7B%20editBtns%5B0%5D.click%28%29%3B%20await%20delay%28300%29%3B%20return%20true%3B%20%7Dcatch%28_%29%7B%7D%0A%20%20%20%20%7D%0A%20%20%20%20return%20false%3B%0A%20%20%7D%0A%0A%20%20async%20function%20delay%28ms%29%7B%20return%20new%20Promise%28r%20%3D%3E%20setTimeout%28r%2C%20ms%29%29%3B%20%7D%0A%0A%20%20async%20function%20openAndReadSnippet%28row%29%7B%0A%20%20%20%20const%20clickTarget%20%3D%20row.matches%28%27a%27%29%20%3F%20row%20%3A%20%28row.querySelector%28%27a%27%29%20%7C%7C%20row%29%3B%0A%20%20%20%20const%20beforeEditor%20%3D%20findEditor%28%29%3B%0A%20%20%20%20const%20beforeText%20%3D%20beforeEditor%20%3F%20extractEditorText%28beforeEditor%29%20%3A%20null%3B%0A%20%20%20%20try%7B%20clickTarget.click%28%29%3B%20%7Dcatch%28e%29%7B%20LOG%28%27falha%20ao%20clicar%27%2C%20e%29%3B%20return%20null%3B%20%7D%0A%20%20%20%20let%20editor%20%3D%20null%3B%0A%20%20%20%20for%28let%20i%20%3D%200%3B%20i%20%3C%2015%3B%20i%2B%2B%29%7B%0A%20%20%20%20%20%20await%20delay%28100%29%3B%0A%20%20%20%20%20%20const%20e%20%3D%20findEditor%28%29%3B%0A%20%20%20%20%20%20if%28e%20%26%26%20extractEditorText%28e%29%20%21%3D%3D%20beforeText%29%7B%20editor%20%3D%20e%3B%20break%3B%20%7D%0A%20%20%20%20%7D%0A%20%20%20%20if%28%21editor%29%20editor%20%3D%20findEditor%28%29%3B%0A%20%20%20%20let%20text%20%3D%20editor%20%3F%20extractEditorText%28editor%29%20%3A%20%27%27%3B%0A%20%20%20%20if%28%21text%20%7C%7C%20text.length%20%3C%205%29%7B%0A%20%20%20%20%20%20const%20entered%20%3D%20await%20tryEnterEditMode%28%29%3B%0A%20%20%20%20%20%20if%28entered%29%7B%0A%20%20%20%20%20%20%20%20await%20delay%28200%29%3B%0A%20%20%20%20%20%20%20%20editor%20%3D%20findEditor%28%29%3B%0A%20%20%20%20%20%20%20%20text%20%3D%20editor%20%3F%20extractEditorText%28editor%29%20%3A%20%27%27%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%0A%20%20%20%20if%28%21text%20%7C%7C%20text.length%20%3C%205%29%7B%0A%20%20%20%20%20%20text%20%3D%20extractMainContentFallback%28%29%3B%0A%20%20%20%20%7D%0A%20%20%20%20return%20text%3B%0A%20%20%7D%0A%0A%20%20function%20escapeHtml%28s%29%7B%0A%20%20%20%20return%20String%28s%20%3D%3D%20null%20%3F%20%27%27%20%3A%20s%29%0A%20%20%20%20%20%20.replace%28%2F%26%2Fg%2C%20%27%26amp%3B%27%29.replace%28%2F%3C%2Fg%2C%20%27%26lt%3B%27%29.replace%28%2F%3E%2Fg%2C%20%27%26gt%3B%27%29%0A%20%20%20%20%20%20.replace%28%2F%22%2Fg%2C%20%27%26quot%3B%27%29.replace%28%2F%27%2Fg%2C%20%27%26%2339%3B%27%29%3B%0A%20%20%7D%0A%0A%20%20function%20copyToClipboard%28text%29%7B%0A%20%20%20%20try%7B%0A%20%20%20%20%20%20navigator.clipboard.writeText%28text%29%3B%0A%20%20%20%20%20%20LOG%28%27JSON%20copiado%20pro%20clipboard%27%29%3B%0A%20%20%20%20%7Dcatch%28_%29%7B%0A%20%20%20%20%20%20const%20ta%20%3D%20document.createElement%28%27textarea%27%29%3B%0A%20%20%20%20%20%20ta.value%20%3D%20text%3B%20document.body.appendChild%28ta%29%3B%0A%20%20%20%20%20%20ta.select%28%29%3B%20document.execCommand%28%27copy%27%29%3B%20ta.remove%28%29%3B%0A%20%20%20%20%7D%0A%20%20%7D%0A%0A%20%20function%20downloadJson%28text%29%7B%0A%20%20%20%20const%20blob%20%3D%20new%20Blob%28%5Btext%5D%2C%20%7B%20type%3A%20%27application%2Fjson%27%20%7D%29%3B%0A%20%20%20%20const%20url%20%3D%20URL.createObjectURL%28blob%29%3B%0A%20%20%20%20const%20a%20%3D%20document.createElement%28%27a%27%29%3B%0A%20%20%20%20a.href%20%3D%20url%3B%0A%20%20%20%20a.download%20%3D%20%60textblaze-snippets-%24%7Bnew%20Date%28%29.toISOString%28%29.slice%280%2C10%29%7D.json%60%3B%0A%20%20%20%20document.body.appendChild%28a%29%3B%20a.click%28%29%3B%20a.remove%28%29%3B%0A%20%20%20%20setTimeout%28%28%29%20%3D%3E%20URL.revokeObjectURL%28url%29%2C%201000%29%3B%0A%20%20%7D%0A%0A%20%20function%20showResultPanel%28snippets%29%7B%0A%20%20%20%20document.getElementById%28%27tb_scraper_panel%27%29%3F.remove%28%29%3B%0A%20%20%20%20const%20json%20%3D%20JSON.stringify%28snippets%2C%20null%2C%202%29%3B%0A%20%20%20%20const%20panel%20%3D%20document.createElement%28%27div%27%29%3B%0A%20%20%20%20panel.id%20%3D%20%27tb_scraper_panel%27%3B%0A%20%20%20%20panel.style.cssText%20%3D%20%5B%0A%20%20%20%20%20%20%27position%3Afixed%27%2C%27top%3A60px%27%2C%27right%3A14px%27%2C%27z-index%3A2147483647%27%2C%0A%20%20%20%20%20%20%27background%3A%230b1220%27%2C%27color%3A%23e6ecf6%27%2C%27border%3A1px%20solid%20%232a3a55%27%2C%0A%20%20%20%20%20%20%27border-radius%3A12px%27%2C%27padding%3A14px%27%2C%27width%3Amin%28560px%2C%2090vw%29%27%2C%0A%20%20%20%20%20%20%27max-height%3A80vh%27%2C%27overflow%3Aauto%27%2C%27font%3A13px%20system-ui%2Csans-serif%27%2C%0A%20%20%20%20%20%20%27box-shadow%3A0%2012px%2040px%20rgba%280%2C0%2C0%2C.55%29%27%0A%20%20%20%20%5D.join%28%27%3B%27%29%3B%0A%20%20%20%20panel.innerHTML%20%3D%20%60%0A%20%20%20%20%20%20%3Cdiv%20style%3D%22display%3Aflex%3Bjustify-content%3Aspace-between%3Balign-items%3Acenter%3Bmargin-bottom%3A10px%3B%22%3E%0A%20%20%20%20%20%20%20%20%3Cdiv%20style%3D%22font-weight%3A700%3Bfont-size%3A14px%3B%22%3ECapturados%3A%20%24%7Bsnippets.length%7D%20snippets%3C%2Fdiv%3E%0A%20%20%20%20%20%20%20%20%3Cbutton%20id%3D%22tb_scraper_close%22%20style%3D%22background%3Atransparent%3Bcolor%3A%239ca3af%3Bborder%3A0%3Bfont-size%3A18px%3Bcursor%3Apointer%3B%22%3E%5Cu00d7%3C%2Fbutton%3E%0A%20%20%20%20%20%20%3C%2Fdiv%3E%0A%20%20%20%20%20%20%3Cdiv%20style%3D%22font-size%3A12px%3Bcolor%3A%239ca3af%3Bmargin-bottom%3A10px%3B%22%3E%0A%20%20%20%20%20%20%20%20JSON%20%3Cb%3Ecopiado%20automaticamente%3C%2Fb%3E%20pro%20clipboard.%20Cole%20no%20plugin%20Jira%3A%20%3Cb%3EConfiguracoes%20%5Cu2192%20Snippets%20%5Cu2192%20Importar%20do%20Text%20Blaze%3C%2Fb%3E.%0A%20%20%20%20%20%20%3C%2Fdiv%3E%0A%20%20%20%20%20%20%3Cdiv%20style%3D%22display%3Aflex%3Bgap%3A8px%3Bmargin-bottom%3A10px%3B%22%3E%0A%20%20%20%20%20%20%20%20%3Cbutton%20id%3D%22tb_scraper_copy%22%20style%3D%22background%3A%237c3aed%3Bcolor%3A%23fff%3Bborder%3A0%3Bborder-radius%3A6px%3Bpadding%3A8px%2012px%3Bfont-weight%3A600%3Bcursor%3Apointer%3B%22%3E%5CuD83D%5CuDCCB%20Copiar%20JSON%3C%2Fbutton%3E%0A%20%20%20%20%20%20%20%20%3Cbutton%20id%3D%22tb_scraper_download%22%20style%3D%22background%3A%230ea5e9%3Bcolor%3A%23fff%3Bborder%3A0%3Bborder-radius%3A6px%3Bpadding%3A8px%2012px%3Bfont-weight%3A600%3Bcursor%3Apointer%3B%22%3E%5Cu2B07%20Baixar%20.json%3C%2Fbutton%3E%0A%20%20%20%20%20%20%3C%2Fdiv%3E%0A%20%20%20%20%20%20%3Cdetails%20open%3E%0A%20%20%20%20%20%20%20%20%3Csummary%20style%3D%22cursor%3Apointer%3Bfont-size%3A12px%3Bcolor%3A%239ca3af%3Bmargin-bottom%3A6px%3B%22%3EPreview%20da%20lista%3C%2Fsummary%3E%0A%20%20%20%20%20%20%20%20%3Ctable%20style%3D%22width%3A100%25%3Bfont-size%3A11px%3Bborder-collapse%3Acollapse%3Bmargin-top%3A6px%3B%22%3E%0A%20%20%20%20%20%20%20%20%20%20%3Cthead%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%3Ctr%20style%3D%22border-bottom%3A1px%20solid%20%232a3a55%3Btext-align%3Aleft%3Bcolor%3A%239ca3af%3B%22%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%3Cth%20style%3D%22padding%3A4px%3B%22%3EShortcut%3C%2Fth%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%3Cth%20style%3D%22padding%3A4px%3B%22%3ENome%3C%2Fth%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%3Cth%20style%3D%22padding%3A4px%3B%22%3ETexto%20%28preview%29%3C%2Fth%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%3C%2Ftr%3E%0A%20%20%20%20%20%20%20%20%20%20%3C%2Fthead%3E%0A%20%20%20%20%20%20%20%20%20%20%3Ctbody%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%24%7Bsnippets.map%28s%20%3D%3E%20%60%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%3Ctr%20style%3D%22border-bottom%3A1px%20solid%20%231f2937%3B%22%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%3Ctd%20style%3D%22padding%3A4px%3Bfont-family%3Amonospace%3Bcolor%3A%23a78bfa%3B%22%3E%24%7BescapeHtml%28s.command%20%7C%7C%20%27-%27%29%7D%3C%2Ftd%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%3Ctd%20style%3D%22padding%3A4px%3B%22%3E%24%7BescapeHtml%28s.name%20%7C%7C%20%27-%27%29%7D%3C%2Ftd%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%3Ctd%20style%3D%22padding%3A4px%3Bcolor%3A%23cbd5e1%3B%22%3E%24%7BescapeHtml%28%28s.text%20%7C%7C%20%27%27%29.slice%280%2C%2060%29%29%7D%24%7Bs.text%20%26%26%20s.text.length%20%3E%2060%20%3F%20%27...%27%20%3A%20%27%27%7D%3C%2Ftd%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%3C%2Ftr%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%60%29.join%28%27%27%29%7D%0A%20%20%20%20%20%20%20%20%20%20%3C%2Ftbody%3E%0A%20%20%20%20%20%20%20%20%3C%2Ftable%3E%0A%20%20%20%20%20%20%3C%2Fdetails%3E%0A%20%20%20%20%20%20%3Cdetails%20style%3D%22margin-top%3A10px%3B%22%3E%0A%20%20%20%20%20%20%20%20%3Csummary%20style%3D%22cursor%3Apointer%3Bfont-size%3A12px%3Bcolor%3A%239ca3af%3B%22%3EVer%20JSON%20completo%3C%2Fsummary%3E%0A%20%20%20%20%20%20%20%20%3Ctextarea%20readonly%20style%3D%22width%3A100%25%3Bheight%3A200px%3Bmargin-top%3A6px%3Bbackground%3A%230a0e17%3Bcolor%3A%23e6ecf6%3Bborder%3A1px%20solid%20%231f2937%3Bborder-radius%3A6px%3Bpadding%3A8px%3Bfont-family%3Amonospace%3Bfont-size%3A11px%3B%22%3E%24%7BescapeHtml%28json%29%7D%3C%2Ftextarea%3E%0A%20%20%20%20%20%20%3C%2Fdetails%3E%0A%20%20%20%20%60%3B%0A%20%20%20%20document.body.appendChild%28panel%29%3B%0A%20%20%20%20panel.querySelector%28%27%23tb_scraper_close%27%29.onclick%20%3D%20%28%29%20%3D%3E%20panel.remove%28%29%3B%0A%20%20%20%20panel.querySelector%28%27%23tb_scraper_copy%27%29.onclick%20%3D%20%28%29%20%3D%3E%20copyToClipboard%28json%29%3B%0A%20%20%20%20panel.querySelector%28%27%23tb_scraper_download%27%29.onclick%20%3D%20%28%29%20%3D%3E%20downloadJson%28json%29%3B%0A%20%20%20%20copyToClipboard%28json%29%3B%0A%20%20%7D%0A%0A%20%20function%20showProgressToast%28text%29%7B%0A%20%20%20%20let%20t%20%3D%20document.getElementById%28%27tb_scraper_toast%27%29%3B%0A%20%20%20%20if%28%21t%29%7B%0A%20%20%20%20%20%20t%20%3D%20document.createElement%28%27div%27%29%3B%0A%20%20%20%20%20%20t.id%20%3D%20%27tb_scraper_toast%27%3B%0A%20%20%20%20%20%20t.style.cssText%20%3D%20%5B%0A%20%20%20%20%20%20%20%20%27position%3Afixed%27%2C%27top%3A14px%27%2C%27right%3A14px%27%2C%27z-index%3A2147483646%27%2C%0A%20%20%20%20%20%20%20%20%27background%3A%237c3aed%27%2C%27color%3A%23fff%27%2C%27border-radius%3A8px%27%2C%0A%20%20%20%20%20%20%20%20%27padding%3A10px%2016px%27%2C%27font%3A600%2013px%20system-ui%27%2C%0A%20%20%20%20%20%20%20%20%27box-shadow%3A0%206px%2016px%20rgba%28124%2C58%2C237%2C.4%29%27%0A%20%20%20%20%20%20%5D.join%28%27%3B%27%29%3B%0A%20%20%20%20%20%20document.body.appendChild%28t%29%3B%0A%20%20%20%20%7D%0A%20%20%20%20t.textContent%20%3D%20text%3B%0A%20%20%7D%0A%20%20function%20clearProgressToast%28%29%7B%20document.getElementById%28%27tb_scraper_toast%27%29%3F.remove%28%29%3B%20%7D%0A%0A%20%20async%20function%20startScrape%28%29%7B%0A%20%20%20%20try%7B%0A%20%20%20%20%20%20const%20rows%20%3D%20findSnippetRows%28%29%3B%0A%20%20%20%20%20%20if%28rows.length%20%3D%3D%3D%200%29%7B%0A%20%20%20%20%20%20%20%20alert%28%27Nao%20encontrei%20nenhum%20snippet%20na%20pagina.%5Cn%5CnDicas%3A%5Cn-%20Confira%20se%20voce%20esta%20no%20dashboard%20do%20Text%20Blaze%20%28dashboard.blaze.today%29%5Cn-%20Abra%20uma%20pasta%20de%20snippets%20%28clique%20na%20sidebar%29%5Cn-%20Abra%20o%20Console%20%28F12%29%20e%20veja%20os%20logs%20%5Btb-scraper%5D%27%29%3B%0A%20%20%20%20%20%20%20%20return%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20LOG%28%60processando%20%24%7Brows.length%7D%20linhas...%60%29%3B%0A%20%20%20%20%20%20const%20snippets%20%3D%20%5B%5D%3B%0A%20%20%20%20%20%20for%28let%20i%20%3D%200%3B%20i%20%3C%20rows.length%3B%20i%2B%2B%29%7B%0A%20%20%20%20%20%20%20%20const%20row%20%3D%20rows%5Bi%5D%3B%0A%20%20%20%20%20%20%20%20showProgressToast%28%60%5Cu23F3%20Capturando%20%24%7Bi%2B1%7D%2F%24%7Brows.length%7D...%60%29%3B%0A%20%20%20%20%20%20%20%20const%20command%20%3D%20extractShortcut%28row%29%3B%0A%20%20%20%20%20%20%20%20const%20name%20%3D%20extractName%28row%29%3B%0A%20%20%20%20%20%20%20%20const%20text%20%3D%20await%20openAndReadSnippet%28row%29%3B%0A%20%20%20%20%20%20%20%20if%28command%20%7C%7C%20name%29%7B%0A%20%20%20%20%20%20%20%20%20%20snippets.push%28%7B%20command%2C%20name%2C%20text%3A%20text%20%7C%7C%20%27%27%20%7D%29%3B%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20await%20delay%28150%29%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20clearProgressToast%28%29%3B%0A%20%20%20%20%20%20LOG%28%27total%20capturado%3A%27%2C%20snippets.length%2C%20snippets%29%3B%0A%20%20%20%20%20%20showResultPanel%28snippets%29%3B%0A%20%20%20%20%7Dcatch%28e%29%7B%0A%20%20%20%20%20%20clearProgressToast%28%29%3B%0A%20%20%20%20%20%20LOG%28%27ERRO%3A%27%2C%20e%29%3B%0A%20%20%20%20%20%20alert%28%27Erro%20durante%20captura%3A%20%27%20%2B%20%28e.message%20%7C%7C%20e%29%20%2B%20%27%5CnVer%20console%20%28F12%29%20pra%20detalhes.%27%29%3B%0A%20%20%20%20%7D%0A%20%20%7D%0A%0A%20%20%2F%2F%20Expoe%20pra%20que%20cliques%20subsequentes%20no%20bookmarklet%20apenas%20re-executem%0A%20%20window.__tbScraperStart%20%3D%20startScrape%3B%0A%0A%20%20%2F%2F%20Auto-executa%20na%20primeira%20vez%0A%20%20startScrape%28%29%3B%0A%7D%29%28%29%3B%0A eh substituido no build.sh pelo
      // conteudo de tools/textblaze-scraper.bookmarklet.js URL-encoded.
      // Bookmarklets bypassam CSP no Chrome/Firefox/Edge, entao eval() funciona.
      const TB_SCRAPER_ENCODED = '%2F%2A%0A%20%2A%20Text%20Blaze%20-%3E%20Jira%20Localidade%20%28Snippet%20Scraper%29%20%E2%80%94%20versao%20BOOKMARKLET%0A%20%2A%0A%20%2A%20Este%20arquivo%20eh%20carregado%20dinamicamente%20quando%20o%20usuario%20clica%20no%0A%20%2A%20bookmarklet%20%22%F0%9F%93%8B%20Capturar%20TB%22%20arrastado%20pros%20favoritos.%0A%20%2A%0A%20%2A%20O%20bookmarklet%20em%20si%20eh%20apenas%20um%201-liner%20que%20faz%3A%0A%20%2A%20%20%20javascript%3A%28function%28%29%7Bvar%20s%3Ddocument.createElement%28%27script%27%29%3B%0A%20%2A%20%20%20s.src%3D%27https%3A%2F%2Fraw.githubusercontent.com%2Fgunsouza%2Fjira-localidade%2Fmain%2Ftools%2Ftextblaze-scraper.bookmarklet.js%3Fv%3D%27%2BDate.now%28%29%3B%0A%20%2A%20%20%20document.body.appendChild%28s%29%3B%7D%29%28%29%3B%0A%20%2A%0A%20%2A%20Diferencas%20pra%20versao%20.user.js%20%28Tampermonkey%29%3A%0A%20%2A%20%20-%20Sem%20header%20%3D%3DUserScript%3D%3D%0A%20%2A%20%20-%20Auto-executa%20o%20scrape%20ao%20carregar%20%28sem%20precisar%20clicar%20em%20botao%29%0A%20%2A%20%20-%20Se%20ja%20foi%20carregado%2C%20apenas%20re-executa%0A%20%2A%2F%0A%0A%28function%28%29%7B%0A%20%20%27use%20strict%27%3B%0A%0A%20%20const%20LOG%20%3D%20%28...a%29%20%3D%3E%20console.log%28%27%5Btb-scraper%5D%27%2C%20...a%29%3B%0A%0A%20%20%2F%2F%20Re-executa%20direto%20se%20ja%20carregou%20antes%20%28evita%20duplicar%20listeners%2FIDs%29%0A%20%20if%28window.__tbScraperStart%29%7B%0A%20%20%20%20LOG%28%27ja%20carregado%2C%20re-executando...%27%29%3B%0A%20%20%20%20window.__tbScraperStart%28%29%3B%0A%20%20%20%20return%3B%0A%20%20%7D%0A%0A%20%20function%20findSnippetRows%28%29%7B%0A%20%20%20%20const%20tries%20%3D%20%5B%0A%20%20%20%20%20%20%27a%5Bhref%2A%3D%22%2Fsnippet%2F%22%5D%27%2C%0A%20%20%20%20%20%20%27%5Bdata-test%3D%22snippet-row%22%5D%27%2C%0A%20%20%20%20%20%20%27%5Bdata-snippet-id%5D%27%2C%0A%20%20%20%20%20%20%27%5Brole%3D%22row%22%5D%27%2C%0A%20%20%20%20%20%20%27%5Brole%3D%22listitem%22%5D%27%2C%0A%20%20%20%20%20%20%27.MuiListItem-root%27%2C%0A%20%20%20%20%20%20%27li%5Bclass%2A%3D%22snippet%22%20i%5D%27%2C%0A%20%20%20%20%20%20%27div%5Bclass%2A%3D%22snippet-row%22%20i%5D%27%2C%0A%20%20%20%20%20%20%27div%5Bclass%2A%3D%22snippetItem%22%20i%5D%27%0A%20%20%20%20%5D%3B%0A%20%20%20%20for%28const%20sel%20of%20tries%29%7B%0A%20%20%20%20%20%20const%20found%20%3D%20document.querySelectorAll%28sel%29%3B%0A%20%20%20%20%20%20if%28found.length%20%3E%3D%202%29%7B%0A%20%20%20%20%20%20%20%20LOG%28%60achou%20%24%7Bfound.length%7D%20linhas%20usando%20seletor%20%22%24%7Bsel%7D%22%60%29%3B%0A%20%20%20%20%20%20%20%20return%20Array.from%28found%29%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%0A%20%20%20%20LOG%28%27nenhum%20seletor%20padrao%20casou.%20Heuristica%20por%20shortcut%20texto...%27%29%3B%0A%20%20%20%20const%20all%20%3D%20document.querySelectorAll%28%27a%2C%20%5Brole%3D%22button%22%5D%2C%20li%2C%20div%27%29%3B%0A%20%20%20%20const%20rows%20%3D%20%5B%5D%3B%0A%20%20%20%20const%20seen%20%3D%20new%20Set%28%29%3B%0A%20%20%20%20all.forEach%28el%20%3D%3E%20%7B%0A%20%20%20%20%20%20const%20txt%20%3D%20%28el.textContent%20%7C%7C%20%27%27%29.trim%28%29%3B%0A%20%20%20%20%20%20if%28%21txt%20%7C%7C%20txt.length%20%3E%20300%29%20return%3B%0A%20%20%20%20%20%20if%28%21%2F%5C%2F%5Ba-z%5D%5B%5Cw-%5D%7B0%2C30%7D%5Cb%2Fi.test%28txt%29%29%20return%3B%0A%20%20%20%20%20%20const%20hasChildShortcut%20%3D%20Array.from%28el.children%29.some%28c%20%3D%3E%20%2F%5C%2F%5Ba-z%5D%2Fi.test%28%28c.textContent%20%7C%7C%20%27%27%29%29%29%3B%0A%20%20%20%20%20%20if%28hasChildShortcut%29%20return%3B%0A%20%20%20%20%20%20if%28seen.has%28el%29%29%20return%3B%0A%20%20%20%20%20%20seen.add%28el%29%3B%0A%20%20%20%20%20%20rows.push%28el%29%3B%0A%20%20%20%20%7D%29%3B%0A%20%20%20%20LOG%28%60heuristica%20achou%20%24%7Brows.length%7D%20candidatos%60%29%3B%0A%20%20%20%20return%20rows%3B%0A%20%20%7D%0A%0A%20%20function%20extractShortcut%28row%29%7B%0A%20%20%20%20const%20txt%20%3D%20%28row.textContent%20%7C%7C%20%27%27%29.trim%28%29%3B%0A%20%20%20%20const%20m%20%3D%20txt.match%28%2F%5C%2F%5Ba-z%5D%5B%5Cw-%5D%7B0%2C40%7D%2Fi%29%3B%0A%20%20%20%20return%20m%20%3F%20m%5B0%5D%20%3A%20%27%27%3B%0A%20%20%7D%0A%0A%20%20function%20extractName%28row%29%7B%0A%20%20%20%20const%20cand%20%3D%20Array.from%28row.querySelectorAll%28%27%2A%27%29%29.map%28n%20%3D%3E%20%28n.textContent%20%7C%7C%20%27%27%29.trim%28%29%29%0A%20%20%20%20%20%20.filter%28t%20%3D%3E%20t%20%26%26%20t.length%20%3E%201%20%26%26%20t.length%20%3C%20120%20%26%26%20%21t.startsWith%28%27%2F%27%29%29%3B%0A%20%20%20%20return%20cand%5B0%5D%20%7C%7C%20%27%27%3B%0A%20%20%7D%0A%0A%20%20function%20findEditor%28%29%7B%0A%20%20%20%20const%20sels%20%3D%20%5B%0A%20%20%20%20%20%20%27.ProseMirror%27%2C%0A%20%20%20%20%20%20%27%5Bcontenteditable%3D%22true%22%5D%5Bclass%2A%3D%22editor%22%20i%5D%27%2C%0A%20%20%20%20%20%20%27%5Bcontenteditable%3D%22true%22%5D%27%2C%0A%20%20%20%20%20%20%27.cm-content%27%2C%0A%20%20%20%20%20%20%27textarea%5Bclass%2A%3D%22snippet%22%20i%5D%27%2C%0A%20%20%20%20%20%20%27textarea%27%0A%20%20%20%20%5D%3B%0A%20%20%20%20for%28const%20sel%20of%20sels%29%7B%0A%20%20%20%20%20%20const%20el%20%3D%20document.querySelector%28sel%29%3B%0A%20%20%20%20%20%20if%28el%20%26%26%20%28el.offsetWidth%20%3E%20200%20%7C%7C%20el.value%29%29%7B%0A%20%20%20%20%20%20%20%20return%20el%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%0A%20%20%20%20return%20null%3B%0A%20%20%7D%0A%0A%20%20function%20extractEditorText%28editor%29%7B%0A%20%20%20%20if%28%21editor%29%20return%20%27%27%3B%0A%20%20%20%20if%28editor.tagName%20%3D%3D%3D%20%27TEXTAREA%27%29%20return%20editor.value%20%7C%7C%20%27%27%3B%0A%20%20%20%20return%20%28editor.innerText%20%7C%7C%20editor.textContent%20%7C%7C%20%27%27%29.trim%28%29%3B%0A%20%20%7D%0A%0A%20%20function%20extractMainContentFallback%28%29%7B%0A%20%20%20%20const%20sidebarWidth%20%3D%20320%3B%0A%20%20%20%20const%20rightPanelStart%20%3D%20Math.max%28window.innerWidth%20-%20320%2C%20700%29%3B%0A%20%20%20%20const%20candidates%20%3D%20Array.from%28document.querySelectorAll%28%27div%2C%20article%2C%20section%2C%20p%27%29%29%3B%0A%20%20%20%20let%20best%20%3D%20null%3B%0A%20%20%20%20let%20bestScore%20%3D%200%3B%0A%20%20%20%20for%28const%20el%20of%20candidates%29%7B%0A%20%20%20%20%20%20const%20rect%20%3D%20el.getBoundingClientRect%28%29%3B%0A%20%20%20%20%20%20if%28rect.width%20%3C%20200%20%7C%7C%20rect.height%20%3C%2030%29%20continue%3B%0A%20%20%20%20%20%20if%28rect.left%20%3C%20sidebarWidth%29%20continue%3B%0A%20%20%20%20%20%20if%28rect.right%20%3E%20rightPanelStart%20%2B%20200%29%20continue%3B%0A%20%20%20%20%20%20const%20txt%20%3D%20%28el.innerText%20%7C%7C%20%27%27%29.trim%28%29%3B%0A%20%20%20%20%20%20if%28%21txt%20%7C%7C%20txt.length%20%3C%2020%20%7C%7C%20txt.length%20%3E%208000%29%20continue%3B%0A%20%20%20%20%20%20const%20hasInnerCandidate%20%3D%20Array.from%28el.children%29.some%28c%20%3D%3E%20%7B%0A%20%20%20%20%20%20%20%20const%20t%20%3D%20%28c.innerText%20%7C%7C%20%27%27%29.trim%28%29%3B%0A%20%20%20%20%20%20%20%20return%20t%20%26%26%20t.length%20%3E%20txt.length%20%2A%200.85%3B%0A%20%20%20%20%20%20%7D%29%3B%0A%20%20%20%20%20%20if%28hasInnerCandidate%29%20continue%3B%0A%20%20%20%20%20%20const%20score%20%3D%20txt.length%3B%0A%20%20%20%20%20%20if%28score%20%3E%20bestScore%29%7B%20bestScore%20%3D%20score%3B%20best%20%3D%20el%3B%20%7D%0A%20%20%20%20%7D%0A%20%20%20%20if%28%21best%29%20return%20%27%27%3B%0A%20%20%20%20const%20txt%20%3D%20%28best.innerText%20%7C%7C%20%27%27%29.trim%28%29%3B%0A%20%20%20%20LOG%28%60fallback%20main%20content%3A%20%24%7Btxt.length%7D%20chars%20%28score%3D%24%7BbestScore%7D%29%60%29%3B%0A%20%20%20%20return%20txt%3B%0A%20%20%7D%0A%0A%20%20async%20function%20tryEnterEditMode%28%29%7B%0A%20%20%20%20const%20editBtns%20%3D%20Array.from%28document.querySelectorAll%28%27button%2C%20%5Brole%3D%22button%22%5D%2C%20%5Brole%3D%22tab%22%5D%27%29%29%0A%20%20%20%20%20%20.filter%28b%20%3D%3E%20%7B%0A%20%20%20%20%20%20%20%20const%20txt%20%3D%20%28b.textContent%20%7C%7C%20%27%27%29.trim%28%29%3B%0A%20%20%20%20%20%20%20%20return%20%2F%5Eedit%24%2Fi.test%28txt%29%20%26%26%20b.offsetWidth%20%3E%200%20%26%26%20b.offsetHeight%20%3E%200%3B%0A%20%20%20%20%20%20%7D%29%3B%0A%20%20%20%20if%28editBtns.length%29%7B%0A%20%20%20%20%20%20try%7B%20editBtns%5B0%5D.click%28%29%3B%20await%20delay%28300%29%3B%20return%20true%3B%20%7Dcatch%28_%29%7B%7D%0A%20%20%20%20%7D%0A%20%20%20%20return%20false%3B%0A%20%20%7D%0A%0A%20%20async%20function%20delay%28ms%29%7B%20return%20new%20Promise%28r%20%3D%3E%20setTimeout%28r%2C%20ms%29%29%3B%20%7D%0A%0A%20%20async%20function%20openAndReadSnippet%28row%29%7B%0A%20%20%20%20const%20clickTarget%20%3D%20row.matches%28%27a%27%29%20%3F%20row%20%3A%20%28row.querySelector%28%27a%27%29%20%7C%7C%20row%29%3B%0A%20%20%20%20const%20beforeEditor%20%3D%20findEditor%28%29%3B%0A%20%20%20%20const%20beforeText%20%3D%20beforeEditor%20%3F%20extractEditorText%28beforeEditor%29%20%3A%20null%3B%0A%20%20%20%20try%7B%20clickTarget.click%28%29%3B%20%7Dcatch%28e%29%7B%20LOG%28%27falha%20ao%20clicar%27%2C%20e%29%3B%20return%20null%3B%20%7D%0A%20%20%20%20let%20editor%20%3D%20null%3B%0A%20%20%20%20for%28let%20i%20%3D%200%3B%20i%20%3C%2015%3B%20i%2B%2B%29%7B%0A%20%20%20%20%20%20await%20delay%28100%29%3B%0A%20%20%20%20%20%20const%20e%20%3D%20findEditor%28%29%3B%0A%20%20%20%20%20%20if%28e%20%26%26%20extractEditorText%28e%29%20%21%3D%3D%20beforeText%29%7B%20editor%20%3D%20e%3B%20break%3B%20%7D%0A%20%20%20%20%7D%0A%20%20%20%20if%28%21editor%29%20editor%20%3D%20findEditor%28%29%3B%0A%20%20%20%20let%20text%20%3D%20editor%20%3F%20extractEditorText%28editor%29%20%3A%20%27%27%3B%0A%20%20%20%20if%28%21text%20%7C%7C%20text.length%20%3C%205%29%7B%0A%20%20%20%20%20%20const%20entered%20%3D%20await%20tryEnterEditMode%28%29%3B%0A%20%20%20%20%20%20if%28entered%29%7B%0A%20%20%20%20%20%20%20%20await%20delay%28200%29%3B%0A%20%20%20%20%20%20%20%20editor%20%3D%20findEditor%28%29%3B%0A%20%20%20%20%20%20%20%20text%20%3D%20editor%20%3F%20extractEditorText%28editor%29%20%3A%20%27%27%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%0A%20%20%20%20if%28%21text%20%7C%7C%20text.length%20%3C%205%29%7B%0A%20%20%20%20%20%20text%20%3D%20extractMainContentFallback%28%29%3B%0A%20%20%20%20%7D%0A%20%20%20%20return%20text%3B%0A%20%20%7D%0A%0A%20%20function%20escapeHtml%28s%29%7B%0A%20%20%20%20return%20String%28s%20%3D%3D%20null%20%3F%20%27%27%20%3A%20s%29%0A%20%20%20%20%20%20.replace%28%2F%26%2Fg%2C%20%27%26amp%3B%27%29.replace%28%2F%3C%2Fg%2C%20%27%26lt%3B%27%29.replace%28%2F%3E%2Fg%2C%20%27%26gt%3B%27%29%0A%20%20%20%20%20%20.replace%28%2F%22%2Fg%2C%20%27%26quot%3B%27%29.replace%28%2F%27%2Fg%2C%20%27%26%2339%3B%27%29%3B%0A%20%20%7D%0A%0A%20%20function%20copyToClipboard%28text%29%7B%0A%20%20%20%20try%7B%0A%20%20%20%20%20%20navigator.clipboard.writeText%28text%29%3B%0A%20%20%20%20%20%20LOG%28%27JSON%20copiado%20pro%20clipboard%27%29%3B%0A%20%20%20%20%7Dcatch%28_%29%7B%0A%20%20%20%20%20%20const%20ta%20%3D%20document.createElement%28%27textarea%27%29%3B%0A%20%20%20%20%20%20ta.value%20%3D%20text%3B%20document.body.appendChild%28ta%29%3B%0A%20%20%20%20%20%20ta.select%28%29%3B%20document.execCommand%28%27copy%27%29%3B%20ta.remove%28%29%3B%0A%20%20%20%20%7D%0A%20%20%7D%0A%0A%20%20function%20downloadJson%28text%29%7B%0A%20%20%20%20const%20blob%20%3D%20new%20Blob%28%5Btext%5D%2C%20%7B%20type%3A%20%27application%2Fjson%27%20%7D%29%3B%0A%20%20%20%20const%20url%20%3D%20URL.createObjectURL%28blob%29%3B%0A%20%20%20%20const%20a%20%3D%20document.createElement%28%27a%27%29%3B%0A%20%20%20%20a.href%20%3D%20url%3B%0A%20%20%20%20a.download%20%3D%20%60textblaze-snippets-%24%7Bnew%20Date%28%29.toISOString%28%29.slice%280%2C10%29%7D.json%60%3B%0A%20%20%20%20document.body.appendChild%28a%29%3B%20a.click%28%29%3B%20a.remove%28%29%3B%0A%20%20%20%20setTimeout%28%28%29%20%3D%3E%20URL.revokeObjectURL%28url%29%2C%201000%29%3B%0A%20%20%7D%0A%0A%20%20function%20showResultPanel%28snippets%29%7B%0A%20%20%20%20document.getElementById%28%27tb_scraper_panel%27%29%3F.remove%28%29%3B%0A%20%20%20%20const%20json%20%3D%20JSON.stringify%28snippets%2C%20null%2C%202%29%3B%0A%20%20%20%20const%20panel%20%3D%20document.createElement%28%27div%27%29%3B%0A%20%20%20%20panel.id%20%3D%20%27tb_scraper_panel%27%3B%0A%20%20%20%20panel.style.cssText%20%3D%20%5B%0A%20%20%20%20%20%20%27position%3Afixed%27%2C%27top%3A60px%27%2C%27right%3A14px%27%2C%27z-index%3A2147483647%27%2C%0A%20%20%20%20%20%20%27background%3A%230b1220%27%2C%27color%3A%23e6ecf6%27%2C%27border%3A1px%20solid%20%232a3a55%27%2C%0A%20%20%20%20%20%20%27border-radius%3A12px%27%2C%27padding%3A14px%27%2C%27width%3Amin%28560px%2C%2090vw%29%27%2C%0A%20%20%20%20%20%20%27max-height%3A80vh%27%2C%27overflow%3Aauto%27%2C%27font%3A13px%20system-ui%2Csans-serif%27%2C%0A%20%20%20%20%20%20%27box-shadow%3A0%2012px%2040px%20rgba%280%2C0%2C0%2C.55%29%27%0A%20%20%20%20%5D.join%28%27%3B%27%29%3B%0A%20%20%20%20panel.innerHTML%20%3D%20%60%0A%20%20%20%20%20%20%3Cdiv%20style%3D%22display%3Aflex%3Bjustify-content%3Aspace-between%3Balign-items%3Acenter%3Bmargin-bottom%3A10px%3B%22%3E%0A%20%20%20%20%20%20%20%20%3Cdiv%20style%3D%22font-weight%3A700%3Bfont-size%3A14px%3B%22%3ECapturados%3A%20%24%7Bsnippets.length%7D%20snippets%3C%2Fdiv%3E%0A%20%20%20%20%20%20%20%20%3Cbutton%20id%3D%22tb_scraper_close%22%20style%3D%22background%3Atransparent%3Bcolor%3A%239ca3af%3Bborder%3A0%3Bfont-size%3A18px%3Bcursor%3Apointer%3B%22%3E%5Cu00d7%3C%2Fbutton%3E%0A%20%20%20%20%20%20%3C%2Fdiv%3E%0A%20%20%20%20%20%20%3Cdiv%20style%3D%22font-size%3A12px%3Bcolor%3A%239ca3af%3Bmargin-bottom%3A10px%3B%22%3E%0A%20%20%20%20%20%20%20%20JSON%20%3Cb%3Ecopiado%20automaticamente%3C%2Fb%3E%20pro%20clipboard.%20Cole%20no%20plugin%20Jira%3A%20%3Cb%3EConfiguracoes%20%5Cu2192%20Snippets%20%5Cu2192%20Importar%20do%20Text%20Blaze%3C%2Fb%3E.%0A%20%20%20%20%20%20%3C%2Fdiv%3E%0A%20%20%20%20%20%20%3Cdiv%20style%3D%22display%3Aflex%3Bgap%3A8px%3Bmargin-bottom%3A10px%3B%22%3E%0A%20%20%20%20%20%20%20%20%3Cbutton%20id%3D%22tb_scraper_copy%22%20style%3D%22background%3A%237c3aed%3Bcolor%3A%23fff%3Bborder%3A0%3Bborder-radius%3A6px%3Bpadding%3A8px%2012px%3Bfont-weight%3A600%3Bcursor%3Apointer%3B%22%3E%5CuD83D%5CuDCCB%20Copiar%20JSON%3C%2Fbutton%3E%0A%20%20%20%20%20%20%20%20%3Cbutton%20id%3D%22tb_scraper_download%22%20style%3D%22background%3A%230ea5e9%3Bcolor%3A%23fff%3Bborder%3A0%3Bborder-radius%3A6px%3Bpadding%3A8px%2012px%3Bfont-weight%3A600%3Bcursor%3Apointer%3B%22%3E%5Cu2B07%20Baixar%20.json%3C%2Fbutton%3E%0A%20%20%20%20%20%20%3C%2Fdiv%3E%0A%20%20%20%20%20%20%3Cdetails%20open%3E%0A%20%20%20%20%20%20%20%20%3Csummary%20style%3D%22cursor%3Apointer%3Bfont-size%3A12px%3Bcolor%3A%239ca3af%3Bmargin-bottom%3A6px%3B%22%3EPreview%20da%20lista%3C%2Fsummary%3E%0A%20%20%20%20%20%20%20%20%3Ctable%20style%3D%22width%3A100%25%3Bfont-size%3A11px%3Bborder-collapse%3Acollapse%3Bmargin-top%3A6px%3B%22%3E%0A%20%20%20%20%20%20%20%20%20%20%3Cthead%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%3Ctr%20style%3D%22border-bottom%3A1px%20solid%20%232a3a55%3Btext-align%3Aleft%3Bcolor%3A%239ca3af%3B%22%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%3Cth%20style%3D%22padding%3A4px%3B%22%3EShortcut%3C%2Fth%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%3Cth%20style%3D%22padding%3A4px%3B%22%3ENome%3C%2Fth%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%3Cth%20style%3D%22padding%3A4px%3B%22%3ETexto%20%28preview%29%3C%2Fth%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%3C%2Ftr%3E%0A%20%20%20%20%20%20%20%20%20%20%3C%2Fthead%3E%0A%20%20%20%20%20%20%20%20%20%20%3Ctbody%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%24%7Bsnippets.map%28s%20%3D%3E%20%60%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%3Ctr%20style%3D%22border-bottom%3A1px%20solid%20%231f2937%3B%22%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%3Ctd%20style%3D%22padding%3A4px%3Bfont-family%3Amonospace%3Bcolor%3A%23a78bfa%3B%22%3E%24%7BescapeHtml%28s.command%20%7C%7C%20%27-%27%29%7D%3C%2Ftd%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%3Ctd%20style%3D%22padding%3A4px%3B%22%3E%24%7BescapeHtml%28s.name%20%7C%7C%20%27-%27%29%7D%3C%2Ftd%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%3Ctd%20style%3D%22padding%3A4px%3Bcolor%3A%23cbd5e1%3B%22%3E%24%7BescapeHtml%28%28s.text%20%7C%7C%20%27%27%29.slice%280%2C%2060%29%29%7D%24%7Bs.text%20%26%26%20s.text.length%20%3E%2060%20%3F%20%27...%27%20%3A%20%27%27%7D%3C%2Ftd%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%3C%2Ftr%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%60%29.join%28%27%27%29%7D%0A%20%20%20%20%20%20%20%20%20%20%3C%2Ftbody%3E%0A%20%20%20%20%20%20%20%20%3C%2Ftable%3E%0A%20%20%20%20%20%20%3C%2Fdetails%3E%0A%20%20%20%20%20%20%3Cdetails%20style%3D%22margin-top%3A10px%3B%22%3E%0A%20%20%20%20%20%20%20%20%3Csummary%20style%3D%22cursor%3Apointer%3Bfont-size%3A12px%3Bcolor%3A%239ca3af%3B%22%3EVer%20JSON%20completo%3C%2Fsummary%3E%0A%20%20%20%20%20%20%20%20%3Ctextarea%20readonly%20style%3D%22width%3A100%25%3Bheight%3A200px%3Bmargin-top%3A6px%3Bbackground%3A%230a0e17%3Bcolor%3A%23e6ecf6%3Bborder%3A1px%20solid%20%231f2937%3Bborder-radius%3A6px%3Bpadding%3A8px%3Bfont-family%3Amonospace%3Bfont-size%3A11px%3B%22%3E%24%7BescapeHtml%28json%29%7D%3C%2Ftextarea%3E%0A%20%20%20%20%20%20%3C%2Fdetails%3E%0A%20%20%20%20%60%3B%0A%20%20%20%20document.body.appendChild%28panel%29%3B%0A%20%20%20%20panel.querySelector%28%27%23tb_scraper_close%27%29.onclick%20%3D%20%28%29%20%3D%3E%20panel.remove%28%29%3B%0A%20%20%20%20panel.querySelector%28%27%23tb_scraper_copy%27%29.onclick%20%3D%20%28%29%20%3D%3E%20copyToClipboard%28json%29%3B%0A%20%20%20%20panel.querySelector%28%27%23tb_scraper_download%27%29.onclick%20%3D%20%28%29%20%3D%3E%20downloadJson%28json%29%3B%0A%20%20%20%20copyToClipboard%28json%29%3B%0A%20%20%7D%0A%0A%20%20function%20showProgressToast%28text%29%7B%0A%20%20%20%20let%20t%20%3D%20document.getElementById%28%27tb_scraper_toast%27%29%3B%0A%20%20%20%20if%28%21t%29%7B%0A%20%20%20%20%20%20t%20%3D%20document.createElement%28%27div%27%29%3B%0A%20%20%20%20%20%20t.id%20%3D%20%27tb_scraper_toast%27%3B%0A%20%20%20%20%20%20t.style.cssText%20%3D%20%5B%0A%20%20%20%20%20%20%20%20%27position%3Afixed%27%2C%27top%3A14px%27%2C%27right%3A14px%27%2C%27z-index%3A2147483646%27%2C%0A%20%20%20%20%20%20%20%20%27background%3A%237c3aed%27%2C%27color%3A%23fff%27%2C%27border-radius%3A8px%27%2C%0A%20%20%20%20%20%20%20%20%27padding%3A10px%2016px%27%2C%27font%3A600%2013px%20system-ui%27%2C%0A%20%20%20%20%20%20%20%20%27box-shadow%3A0%206px%2016px%20rgba%28124%2C58%2C237%2C.4%29%27%0A%20%20%20%20%20%20%5D.join%28%27%3B%27%29%3B%0A%20%20%20%20%20%20document.body.appendChild%28t%29%3B%0A%20%20%20%20%7D%0A%20%20%20%20t.textContent%20%3D%20text%3B%0A%20%20%7D%0A%20%20function%20clearProgressToast%28%29%7B%20document.getElementById%28%27tb_scraper_toast%27%29%3F.remove%28%29%3B%20%7D%0A%0A%20%20async%20function%20startScrape%28%29%7B%0A%20%20%20%20try%7B%0A%20%20%20%20%20%20const%20rows%20%3D%20findSnippetRows%28%29%3B%0A%20%20%20%20%20%20if%28rows.length%20%3D%3D%3D%200%29%7B%0A%20%20%20%20%20%20%20%20alert%28%27Nao%20encontrei%20nenhum%20snippet%20na%20pagina.%5Cn%5CnDicas%3A%5Cn-%20Confira%20se%20voce%20esta%20no%20dashboard%20do%20Text%20Blaze%20%28dashboard.blaze.today%29%5Cn-%20Abra%20uma%20pasta%20de%20snippets%20%28clique%20na%20sidebar%29%5Cn-%20Abra%20o%20Console%20%28F12%29%20e%20veja%20os%20logs%20%5Btb-scraper%5D%27%29%3B%0A%20%20%20%20%20%20%20%20return%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20LOG%28%60processando%20%24%7Brows.length%7D%20linhas...%60%29%3B%0A%20%20%20%20%20%20const%20snippets%20%3D%20%5B%5D%3B%0A%20%20%20%20%20%20for%28let%20i%20%3D%200%3B%20i%20%3C%20rows.length%3B%20i%2B%2B%29%7B%0A%20%20%20%20%20%20%20%20const%20row%20%3D%20rows%5Bi%5D%3B%0A%20%20%20%20%20%20%20%20showProgressToast%28%60%5Cu23F3%20Capturando%20%24%7Bi%2B1%7D%2F%24%7Brows.length%7D...%60%29%3B%0A%20%20%20%20%20%20%20%20const%20command%20%3D%20extractShortcut%28row%29%3B%0A%20%20%20%20%20%20%20%20const%20name%20%3D%20extractName%28row%29%3B%0A%20%20%20%20%20%20%20%20const%20text%20%3D%20await%20openAndReadSnippet%28row%29%3B%0A%20%20%20%20%20%20%20%20if%28command%20%7C%7C%20name%29%7B%0A%20%20%20%20%20%20%20%20%20%20snippets.push%28%7B%20command%2C%20name%2C%20text%3A%20text%20%7C%7C%20%27%27%20%7D%29%3B%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20await%20delay%28150%29%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20clearProgressToast%28%29%3B%0A%20%20%20%20%20%20LOG%28%27total%20capturado%3A%27%2C%20snippets.length%2C%20snippets%29%3B%0A%20%20%20%20%20%20showResultPanel%28snippets%29%3B%0A%20%20%20%20%7Dcatch%28e%29%7B%0A%20%20%20%20%20%20clearProgressToast%28%29%3B%0A%20%20%20%20%20%20LOG%28%27ERRO%3A%27%2C%20e%29%3B%0A%20%20%20%20%20%20alert%28%27Erro%20durante%20captura%3A%20%27%20%2B%20%28e.message%20%7C%7C%20e%29%20%2B%20%27%5CnVer%20console%20%28F12%29%20pra%20detalhes.%27%29%3B%0A%20%20%20%20%7D%0A%20%20%7D%0A%0A%20%20%2F%2F%20Expoe%20pra%20que%20cliques%20subsequentes%20no%20bookmarklet%20apenas%20re-executem%0A%20%20window.__tbScraperStart%20%3D%20startScrape%3B%0A%0A%20%20%2F%2F%20Auto-executa%20na%20primeira%20vez%0A%20%20startScrape%28%29%3B%0A%7D%29%28%29%3B%0A';
      const BOOKMARKLET_HREF = `javascript:(function(){try{(0,eval)(decodeURIComponent('${TB_SCRAPER_ENCODED}'));}catch(e){alert('Erro: '+e.message+'\\n\\nVoce esta no dashboard.blaze.today?');}})();void 0;`;

      // URL do userscript do scraper no GitHub (Tampermonkey detecta e oferece instalar)
      const USERSCRIPT_URL = 'https://raw.githubusercontent.com/gunsouza/jira-localidade/main/tools/textblaze-scraper.user.js';

      // Conteudo por tab
      const TAB_CONTENT = {
        scraper: {
          hint: `
            <!-- OPCAO A: Userscript Tampermonkey (RECOMENDADO pra blaze.today) -->
            <div style="background:linear-gradient(135deg,#0f3a2a,#093520);border:1px solid #10b981;border-radius:10px;padding:14px 16px;margin:-4px 0 14px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="background:#10b981;color:#053026;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:800;letter-spacing:.5px;">RECOMENDADO</span>
                <span style="font-size:13px;color:#fff;font-weight:700;">Opc\u00e3o A \u2014 Instalar no Tampermonkey</span>
              </div>
              <div style="font-size:12.5px;color:#a7f3d0;line-height:1.55;margin-bottom:10px;">
                O <b>dashboard.blaze.today</b> tem CSP restrita que <b>bloqueia bookmarklets</b> no Chrome moderno.
                Use o userscript: como voc\u00ea j\u00e1 tem Tampermonkey instalado, basta 1 clique.
              </div>
              <a href="${USERSCRIPT_URL}" target="_blank"
                 style="display:inline-block;background:#10b981;color:#053026;text-decoration:none;
                        padding:9px 16px;border-radius:6px;font-weight:800;font-size:13px;">
                \u{1F4E5} Instalar no Tampermonkey
              </a>
              <div style="font-size:11px;color:${C.dim};margin-top:8px;">
                \u279C Abre o arquivo no Tampermonkey, clique <b>"Instalar"</b>. Depois v\u00e1 ao dashboard.blaze.today e clique no bot\u00e3o roxo "Capturar snippets" que aparecer\u00e1 no canto superior direito.
              </div>
            </div>

            <!-- OPCAO B: Bookmarklet (alternativa pra outros sites/casos) -->
            <details style="margin-bottom:14px;">
              <summary style="cursor:pointer;font-size:12px;color:${C.dim};font-weight:600;padding:6px 0;">
                \u{1F4DA} Op\u00e7\u00e3o B \u2014 Bookmarklet (arrastar pros favoritos)
              </summary>
              <div style="margin-top:10px;padding:14px 16px;background:linear-gradient(135deg,#3b1e6e,#1e1340);border:1px solid #7c3aed;border-radius:10px;">
                <div style="font-size:11.5px;color:#c4b5fd;line-height:1.5;margin-bottom:10px;">
                  <b>Aviso:</b> bookmarklets <b>n\u00e3o funcionam</b> em <code>blaze.today</code> por causa do CSP do site.
                  Use s\u00f3 se voc\u00ea quiser testar o scraper em outro site (ou tiver navegador antigo onde bookmarklets bypassam CSP).
                </div>
                <div style="font-size:13px;color:#fff;margin-bottom:8px;">
                  <b>Arraste</b> este bot\u00e3o pra barra de favoritos:
                </div>
                <a id="ml_tb_bookmarklet" href="${BOOKMARKLET_HREF.replace(/"/g, '&quot;')}" draggable="true"
                   style="display:inline-block;background:#fff;color:#5b21b6;text-decoration:none;
                          padding:8px 14px;border-radius:6px;font-weight:800;font-size:13px;cursor:grab;
                          box-shadow:0 6px 16px rgba(0,0,0,.4);user-select:none;border:2px dashed #c4b5fd;">
                  \uD83D\uDCCB Capturar TB
                </a>
              </div>
            </details>

            <div style="font-size:12.5px;line-height:1.7;">
              <b>Depois de capturar (qualquer op\u00e7\u00e3o):</b><br/>
              \u279C O JSON \u00e9 <b>copiado automaticamente</b> pro clipboard.<br/>
              \u279C Volta aqui e cole no campo abaixo (Cmd/Ctrl+V) \u2192 Validar \u2192 Importar.
            </div>`,
          placeholder: `Cole aqui o JSON gerado pelo scraper. Exemplo:\n\n[\n  { "command": "/ola", "name": "Saudacao", "text": "Ola, tudo bem?" },\n  { "command": "/obg", "name": "Agradecimento", "text": "Obrigado pelo retorno!" }\n]`
        },
        manual: {
          hint: `<div style="background:${C.bg2};border-left:3px solid ${C.blue};border-radius:6px;padding:10px 12px;line-height:1.6;">
                   <b>Formato:</b> uma linha por snippet, separador <code>|</code> ou <kbd>Tab</kbd>.<br/>
                   Layout aceito:<br/>
                   \u2022 <code>/comando | nome | texto</code> (completo)<br/>
                   \u2022 <code>/comando | texto</code> (sem nome \u2014 vira o pr\u00f3prio comando)<br/>
                   \u2022 <code>texto</code> (s\u00f3 o texto, sem cmd)
                 </div>`,
          placeholder: `Cole uma linha por snippet. Exemplo:\n\n/ola | Saudacao | Ola, tudo bem?\n/obg | Agradecimento | Obrigado pelo retorno!\n/aguarda | Aguardando cliente | Aguardando retorno do cliente para prosseguir.`
        }
      };

      const setTab = (mode) => {
        modal.querySelectorAll('.ml_tb_tab').forEach(t => {
          const active = t.dataset.mode === mode;
          t.style.color = active ? C.text : C.dim;
          t.style.borderBottomColor = active ? C.blue : 'transparent';
          t.classList.toggle('active', active);
        });
        const tc = TAB_CONTENT[mode];
        hintBox.innerHTML = tc.hint;
        input.placeholder = tc.placeholder;
        // Quando ativa a tab scraper, intercepta click no link do bookmarklet
        // (so faz sentido se ele for ARRASTADO; clicar aqui no Jira nao tem efeito util)
        if(mode === 'scraper'){
          const link = hintBox.querySelector('#ml_tb_bookmarklet');
          if(link){
            link.addEventListener('click', (e) => {
              e.preventDefault();
              alert('\u2139\uFE0F Este bot\u00e3o serve pra ser ARRASTADO pra barra de favoritos.\n\nSe voc\u00ea clic\u00e1-lo aqui no Jira, ele tenta capturar snippets do Text Blaze - que n\u00e3o existe nesta p\u00e1gina.\n\nArraste pros favoritos primeiro. Depois abra dashboard.blaze.today e clique nele de l\u00e1.');
            });
          }
        }
      };
      modal.querySelectorAll('.ml_tb_tab').forEach(t => {
        t.addEventListener('click', () => setTab(t.dataset.mode));
      });
      setTab('scraper');

      let parsed = [];
      const showErr = (msg) => { errBox.textContent = msg; errBox.style.display = 'block'; };
      const hideErr = () => { errBox.style.display = 'none'; };
      const setImportEnabled = (on) => {
        importBtn.disabled = !on;
        importBtn.style.opacity = on ? '1' : '.5';
        importBtn.style.cursor = on ? 'pointer' : 'not-allowed';
      };

      const validate = () => {
        hideErr();
        const raw = (input.value || '').trim();
        if(!raw){
          showErr('Cole algum conteudo no campo acima primeiro.');
          previewBox.style.display='none'; setImportEnabled(false); return;
        }
        parsed = parseTextBlazeInput(raw);
        if(!parsed.length){
          showErr('Nao consegui interpretar nada. Confira o formato (veja a dica acima).');
          previewBox.style.display = 'none'; setImportEnabled(false); return;
        }
        previewCount.textContent = parsed.length;
        previewList.innerHTML = parsed.map((s, i) => `
          <div style="padding:8px 10px;${i > 0 ? `border-top:1px solid ${C.border};` : ''}">
            <div style="display:flex;gap:8px;align-items:baseline;margin-bottom:3px;">
              <code style="color:${C.blue};font-family:${C.mono};font-size:12px;">${esc(s.command || '(sem cmd)')}</code>
              <b style="font-size:12px;">${esc(s.name || '(sem nome)')}</b>
            </div>
            <div style="color:${C.dim};font-size:11px;white-space:pre-wrap;word-break:break-word;">${esc((s.text || '').slice(0, 180))}${s.text && s.text.length > 180 ? '...' : ''}</div>
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

      setTimeout(() => input.focus(), 50);
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
        const rawGm = _gmGet(_STORAGE_KEY);
        const raw = (rawGm ? (typeof rawGm === 'string' ? rawGm : JSON.stringify(rawGm)) : null) || localStorage.getItem(_STORAGE_KEY) || '{}';
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
          showToast('Falha ao exportar. Tente em Localidade > Configuracoes > Exportar.','error',5000);
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
        showToast('Lembrete de backup desativado. Para reativar: Configuracoes > Avancado.','info',4000);
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
    // =========================
    // DUPLICATES — UI helpers (compute, filter, card)
    // =========================
    function computeCounts(items){
      let withMatch = 0, strong = 0, ipOnly = 0;
      for(const it of items){
        if(it.score > 0) withMatch++;
        if(it.strongMatch) strong++;
        if(it.ipOnlyMatch) ipOnly++;
      }
      return { total: items.length, withMatch, strong, ipOnly };
    }

    function applyFilterToCards(container, filterValue){
      const cards = [...container.querySelectorAll('.card[data-hits]')];
      for(const card of cards){
        const hits = (card.getAttribute('data-hits') || '').split('|').filter(Boolean);
        const show = !filterValue || hits.includes(filterValue);
        card.style.display = show ? '' : 'none';
        card.querySelector('.expand')?.remove();
      }
    }

    function formatPreview(text){
      const t = String(text || '').trim();
      if(!t) return '';
      return t.length > DESC_PREVIEW_LEN ? t.slice(0, DESC_PREVIEW_LEN) + '…' : t;
    }

    function renderIssueCard(item){
      const { issue, hits, score, strongMatch, ipOnlyMatch } = item;
      const f = issue.fields || {};
      const key = issue.key;
      const link = `${location.origin}/browse/${key}`;
      const preview = formatPreview(item.descText);

      const rt = f[`customfield_${CF_RES_TEAM}`];
      const resTeam = (rt && (rt.value || rt.name)) ? (rt.value || rt.name) : (rt ? String(rt) : '—');
      const assignee = f.assignee?.displayName || '—';

      const assetRaw = f[`customfield_${CF_ASSET}`];
      const assetArr = Array.isArray(assetRaw) ? assetRaw : (assetRaw ? [assetRaw] : []);
      const locationLabel = assetArr.map(a => a?.objectKey || a?.label || a?.name).filter(Boolean).join(', ') || '—';

      const priorityName = f.priority?.name || '—';
      const priorityId = f.priority?.id || '';
      const priorityIcon = f.priority?.iconUrl || '';

      const hitVals = hits.map(h => h.value);
      const hitAttr = hitVals.join('|');
      const labelTokens = hitVals.slice(0, DUP_LABEL_MAX_TOKENS).join(', ');
      const dupLabel = score ? `match: ${labelTokens || 'IDs'}` : '';

      const badges = [
        score ? `<span class="badge dup">${esc(dupLabel)}</span>` : '',
        strongMatch ? `<span class="badge strong">forte</span>` : '',
        ipOnlyMatch ? `<span class="badge ip">ip</span>` : '',
        `<span class="badge">${esc(resTeam)}</span>`,
        `<span class="badge prioBadge" title="Prioridade">${priorityIcon ? `<img src="${esc(priorityIcon)}" alt="" style="width:12px;height:12px;vertical-align:middle;margin-right:3px;" />` : ''}${esc(priorityName)}</span>`,
        `<button class="detailsBtn" data-details="1" title="Ver detalhes">Detalhes</button>`
      ].filter(Boolean).join('');

      const idsHtml = hitVals.length
        ? hitVals.slice(0, 8).map(v => `<span class="idpill">${esc(v)}</span>`).join('')
        : `<span class="muted">sem IDs em comum</span>`;

      const fullEsc = esc(item.descText || '');

      return `
        <div class="card"
             data-key="${esc(key)}"
             data-link="${esc(link)}"
             data-full="${fullEsc}"
             data-hits="${esc(hitAttr)}"
             data-hitstext="${esc(hitVals.join('|'))}"
             data-location="${esc(locationLabel)}"
             data-priority-id="${esc(priorityId)}"
             data-priority-name="${esc(priorityName)}">
          <div class="line1">
            <div class="kblock">
              <div class="key"><a href="${esc(link)}" target="_blank" rel="noopener">${esc(key)}</a></div>
              <div class="muted">${esc(f.project?.key||'')} • ${esc(f.issuetype?.name||'')}</div>
            </div>
            <div style="flex:1;min-width:260px">
              <div class="summary">${esc(f.summary || '')}</div>
              <div class="muted">${esc(assignee)}</div>
            </div>
            <div class="badges">${badges}</div>
          </div>
          <div class="line2">
            <div class="desc">${preview ? esc(preview) : '<span class="muted">sem descrição</span>'}</div>
            <div class="ids">${idsHtml}</div>
          </div>
        </div>
      `;
    }
    // =========================
    // DUPLICATES — render principal + intera\u00e7\u00f5es
    // =========================
    async function renderDuplicates(modal, issueKey) {
      modal.setBody(`<div class="meta">Carregando duplicados…</div>`);

      const [issueCurrent, asset] = await Promise.all([
        getIssueFields(issueKey, ["summary","description","*all"]),
        getAssetFromIssue(issueKey),
      ]);

      const summaryCurrent = String(issueCurrent?.fields?.summary || '').trim();
      const descCurrent = descriptionToText(issueCurrent?.fields?.description);
      // Inclui campos de texto extras (ex: Serial Number, campos custom) para ampliar detecção
      const extraFieldsText = Object.values(issueCurrent?.fields || {})
        .filter(v => typeof v === 'string' && v.length > 2 && v.length < 200)
        .join(' ');
      const currentText = `${summaryCurrent}\n${descCurrent}\n${extraFieldsText}`.trim();

      const currentIds = extractIdentifiersFromText(currentText);
      const idsLabel = currentIds.length ? currentIds.slice(0, 12).map(x => x.value).join(', ') : '—';

      const { objectId, workspaceId } = asset;
      modal.setSubtitle(`Localidade (objectId): ${objectId} • Atual: ${issueKey} • IDs: ${idsLabel}`);

      let allKeys = await getConnectedTicketsKeys(workspaceId, objectId);
      allKeys = allKeys.filter(k => PROJECTS.includes(k.split('-')[0])).filter(k => k !== issueKey);

      if(!allKeys.length){
        modal.setBody(`<div class="warn">Nenhum ticket (${PROJECTS.join('/')}) encontrado nos vinculados para este asset.</div>`);
        return;
      }

      const quotedKeys = allKeys.slice(0, 400).map(k => `"${k}"`).join(',');
      const proj = PROJECTS.map(p => `"${p}"`).join(',');
      const jql = `project in (${proj}) AND key in (${quotedKeys}) AND ${OPEN_FILTER} ORDER BY ${ORDER_BY}`;
      const issuesUrl = `${location.origin}/issues/?jql=${encodeURIComponent(jql)}`;

      const issues = await searchIssuesWithCache(objectId, jql);

      const items = (issues || []).map(issue => {
        const f = issue.fields || {};
        const descText = descriptionToText(f.description);
        const otherText = `${f.summary || ''}\n${descText}`;
        const otherIds = extractIdentifiersFromText(otherText);
        const hits = intersectByExtraction(currentIds, otherIds);
        const score = scoreHits(hits);
        const strongMatch = hits.some(isStrongHit);
        const ipOnlyMatch = isIpOnly(hits);
        return { issue, hits, score, strongMatch, ipOnlyMatch, descText };
      }).sort((a,b) => (b.score - a.score) || String(b.issue.fields?.updated||'').localeCompare(String(a.issue.fields?.updated||'')));

      const counts = computeCounts(items);

      const chipsHtml = currentIds.length
        ? currentIds.slice(0, 12).map(it => `<span class="chip" data-chip="${esc(it.value)}">${esc(it.value)}</span>`).join('')
        : `<span class="muted">Nenhum ID detectado no ticket atual.</span>`;

      const topbar = `
        <div class="topbar">
          <div class="toprow">
            <div class="counts">
              <span class="countpill">Total: <b>${counts.total}</b></span>
              <span class="countpill">Com match: <b>${counts.withMatch}</b></span>
              <span class="countpill">Match forte: <b>${counts.strong}</b></span>
              <span class="countpill">Só IP: <b>${counts.ipOnly}</b></span>
              <span class="countpill">Cache: <b>on</b></span>
            </div>
            <div class="actions">
              <button id="ml_dup_back" class="ghost">Voltar</button>
              <a href="${esc(issuesUrl)}" target="_blank" rel="noopener">Abrir busca no Jira</a>
              <button id="ml_loc_comment" class="disabled">Obs interna (0)</button>
              <button id="ml_loc_linkdup" class="disabled danger">Vincular duplicado (0)</button>
              <button id="ml_loc_linkclose" class="disabled danger" title="Vincula como duplicado e ja aplica a transicao de fechamento configurada">Vincular + Fechar (0)</button>
              <button id="ml_loc_prio" class="disabled">Prioridade selecionados (0)</button>
              <button id="ml_loc_batch" class="disabled">Derivar selecionados (0)</button>
            </div>
          </div>
          <div class="meta">Clique em um ID para filtrar. Clique no card para selecionar. Use “Detalhes” para ver a descrição completa, a localidade e mudar a prioridade (individual ou em “Prioridade selecionados”).</div>
          <div class="chips" id="ml_loc_chips">${chipsHtml}</div>
        </div>
      `;

      const listHtml = items.map(it => renderIssueCard(it)).join('');

      modal.setBody(`
        ${topbar}
        <div class="list" id="ml_loc_list">
          ${listHtml}
          <div class="meta" style="margin-top:10px">JQL: <code>${esc(jql)}</code></div>
        </div>
      `);

      document.getElementById('ml_dup_back').onclick = () => renderHome(modal, issueKey);

      setTimeout(() => {
        const chipWrap = document.getElementById('ml_loc_chips');
        const list = document.getElementById('ml_loc_list');
        const commentBtn = document.getElementById('ml_loc_comment');
        const linkBtn = document.getElementById('ml_loc_linkdup');
        const linkCloseBtn = document.getElementById('ml_loc_linkclose');
        const prioBtn = document.getElementById('ml_loc_prio');
        const batchBtn = document.getElementById('ml_loc_batch');
        if(!chipWrap || !list || !commentBtn || !linkBtn || !linkCloseBtn || !prioBtn || !batchBtn) return;

        let activeFilter = '';
        const selected = new Set();

        const refreshButtons = () => {
          commentBtn.textContent = `Obs interna (${selected.size})`;
          linkBtn.textContent = `Vincular duplicado (${selected.size})`;
          linkCloseBtn.textContent = `Vincular + Fechar (${selected.size})`;
          prioBtn.textContent = `Prioridade selecionados (${selected.size})`;
          batchBtn.textContent = `Derivar selecionados (${selected.size})`;
          if(selected.size > 0){
            commentBtn.classList.remove('disabled'); commentBtn.classList.add('primary');
            linkBtn.classList.remove('disabled');
            linkCloseBtn.classList.remove('disabled');
            prioBtn.classList.remove('disabled');
            batchBtn.classList.remove('disabled'); batchBtn.classList.add('primary');
          } else {
            commentBtn.classList.add('disabled'); commentBtn.classList.remove('primary');
            linkBtn.classList.add('disabled');
            linkCloseBtn.classList.add('disabled');
            prioBtn.classList.add('disabled');
            batchBtn.classList.add('disabled'); batchBtn.classList.remove('primary');
          }
        };

        const updateClearChip = () => {
          const hasClear = !!chipWrap.querySelector('.chip.clear');
          if(activeFilter && !hasClear){
            chipWrap.insertAdjacentHTML('beforeend', `<span class="chip clear" data-chip="">Limpar filtro</span>`);
          }
          if(!activeFilter && hasClear){
            chipWrap.querySelector('.chip.clear')?.remove();
          }
        };

        chipWrap.addEventListener('click', (ev) => {
          const el = ev.target.closest('[data-chip]');
          if(!el) return;
          const v = el.getAttribute('data-chip') || '';
          activeFilter = (activeFilter === v) ? '' : v;

          [...chipWrap.querySelectorAll('.chip')].forEach(c => c.classList.remove('active'));
          if(activeFilter){
            const activeEl = [...chipWrap.querySelectorAll('.chip')].find(c => (c.getAttribute('data-chip')||'') === activeFilter);
            if(activeEl) activeEl.classList.add('active');
          }

          updateClearChip();
          applyFilterToCards(list, activeFilter);
        });

        list.addEventListener('click', (ev) => {
          const detailsBtn = ev.target.closest('[data-details="1"]');
          const card = ev.target.closest('.card');
          if(!card) return;

          if(detailsBtn){
            ev.preventDefault();
            ev.stopPropagation();
            const existing = card.querySelector('.expand');
            if(existing){ existing.remove(); return; }
            [...list.querySelectorAll('.expand')].forEach(e => e.remove());

            const full = card.getAttribute('data-full') || '';
            const cardKey = card.getAttribute('data-key') || '';
            const locationLabel = card.getAttribute('data-location') || '—';
            const curPrioId = card.getAttribute('data-priority-id') || '';
            const curPrioName = card.getAttribute('data-priority-name') || '—';
            card.insertAdjacentHTML('beforeend', `
              <div class="expand">
                <div class="title">Descrição completa</div>
                <div class="fulldesc">${full || '<span class="muted">Sem descrição.</span>'}</div>
                <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;align-items:flex-end;">
                  <div>
                    <div class="title" style="margin-bottom:2px;">Localidade</div>
                    <div class="muted">${esc(locationLabel)}</div>
                  </div>
                  <div>
                    <div class="title" style="margin-bottom:2px;">Prioridade</div>
                    <select class="prioSelect" data-cur="${esc(curPrioId)}" style="min-width:140px;background:var(--ml-bg-0);color:var(--ml-text);border:1px solid var(--ml-border-2);border-radius:var(--ml-radius-sm);padding:6px 8px;font-size:12.5px;">
                      <option value="">${esc(curPrioName)} (carregando...)</option>
                    </select>
                  </div>
                  <button class="prioSaveBtn btnSecondary" style="padding:6px 12px;">Salvar prioridade</button>
                  <span class="prioStatus muted"></span>
                </div>
              </div>
            `);

            const sel = card.querySelector('.prioSelect');
            const saveBtn = card.querySelector('.prioSaveBtn');
            const statusEl = card.querySelector('.prioStatus');
            getAllPriorities().then(list => {
              if(!sel.isConnected) return; // card pode ter sido re-renderizado nesse meio tempo
              sel.innerHTML = (list || []).map(p =>
                `<option value="${esc(p.id)}" ${String(p.id) === String(curPrioId) ? 'selected' : ''}>${esc(p.name)}</option>`
              ).join('') || `<option value="">${esc(curPrioName)}</option>`;
            }).catch(e => {
              sel.innerHTML = `<option value="">${esc(curPrioName)} (falha ao listar)</option>`;
              console.warn('[IS Toolkit][prioridade] falha ao listar prioridades:', e);
            });
            saveBtn.addEventListener('click', async () => {
              const newId = sel.value;
              if(!newId){ statusEl.textContent = 'Escolha uma prioridade.'; return; }
              saveBtn.disabled = true;
              statusEl.textContent = 'Salvando...';
              try{
                await setIssuePriority(cardKey, newId);
                const newName = sel.options[sel.selectedIndex]?.text || '';
                card.setAttribute('data-priority-id', newId);
                card.setAttribute('data-priority-name', newName);
                const badge = card.querySelector('.prioBadge');
                if(badge) badge.textContent = newName;
                statusEl.textContent = 'Prioridade atualizada!';
                setTimeout(() => { statusEl.textContent = ''; }, 2000);
              }catch(e){
                statusEl.textContent = 'Falha: ' + (e.message || e);
              }finally{
                saveBtn.disabled = false;
              }
            });
            return;
          }

          if(ev.ctrlKey || ev.metaKey){
            const link = card.getAttribute('data-link');
            if(link) window.open(link, '_blank', 'noopener');
            return;
          }

          const key = card.getAttribute('data-key');
          if(selected.has(key)){
            selected.delete(key);
            card.classList.remove('sel');
          } else {
            selected.add(key);
            card.classList.add('sel');
          }
          refreshButtons();
        });

        commentBtn.addEventListener('click', async () => {
          if(selected.size === 0) return;
          commentBtn.disabled = true;
          const oldText = commentBtn.textContent;
          commentBtn.textContent = 'Comentando...';

          try{
            const selectedCards = [...list.querySelectorAll('.card.sel')];
            const lines = selectedCards.map(c => {
              const key = c.getAttribute('data-key');
              const link = `${location.origin}/browse/${key}`;
              const hits = (c.getAttribute('data-hitstext') || '').split('|').filter(Boolean);
              const hitsShow = hits.slice(0, 6).join(', ');
              return `- ${key} (${link})${hitsShow ? ` | IDs: ${hitsShow}` : ''}`;
            });

            const body =
  `Possíveis duplicados na mesma localidade (Assets) [OBS INTERNA]:
  Ticket atual: ${issueKey}

  Tickets relacionados:
  ${lines.join('\n')}`;

            await addInternalComment(issueKey, body);

            commentBtn.textContent = 'OK!';
            setTimeout(() => { commentBtn.textContent = oldText; }, 900);
          } catch (e) {
            alert('Falha ao comentar: ' + (e.message || e));
            commentBtn.textContent = oldText;
          } finally {
            commentBtn.disabled = false;
          }
        });

        linkBtn.addEventListener('click', async () => {
          if(selected.size === 0) return;
          const selectedKeys = [...selected];
          const ok = confirm(`Vincular ${selectedKeys.length} ticket(s) como duplicado do ticket atual (${issueKey})?\n\nTipo: Duplicate (is duplicated by)`);
          if(!ok) return;

          linkBtn.disabled = true;
          const oldText = linkBtn.textContent;
          linkBtn.textContent = 'Vinculando...';

          try{
            for(const k of selectedKeys){
              await linkDuplicate(issueKey, k);
            }
            linkBtn.textContent = 'Vinculado!';
            setTimeout(() => { linkBtn.textContent = oldText; }, 900);
          } catch (e) {
            alert('Falha ao vincular: ' + (e.message || e));
            linkBtn.textContent = oldText;
          } finally {
            linkBtn.disabled = false;
          }
        });

        linkCloseBtn.addEventListener('click', async () => {
          if(selected.size === 0) return;
          const selectedKeys = [...selected];
          const transitionName = SETTINGS.DUPLICATE_CLOSE_TRANSITION || DEFAULTS.DUPLICATE_CLOSE_TRANSITION;
          const ok = confirm(
            `Vincular ${selectedKeys.length} ticket(s) como duplicado do ticket atual (${issueKey}) E aplicar a transicao "${transitionName}" em cada um?\n\n` +
            `Isso abre um formulario por ticket pra preencher os campos que a transicao exigir (ex: Resolucao).`
          );
          if(!ok) return;

          linkCloseBtn.disabled = true;
          const oldText = linkCloseBtn.textContent;

          const commentTmpl = String(SETTINGS.DUPLICATE_CLOSE_COMMENT || DEFAULTS.DUPLICATE_CLOSE_COMMENT || '');
          const internal = SETTINGS.DUPLICATE_CLOSE_INTERNAL === true;
          let okCount = 0, failCount = 0;

          for(const k of selectedKeys){
            linkCloseBtn.textContent = `Processando ${k}...`;
            try{
              await linkDuplicate(issueKey, k);
              const comment = commentTmpl.replace(/\{vinculado\}/gi, issueKey);
              await runStatusAction(k, {
                label: 'Vincular + Fechar',
                transition: transitionName,
                comment,
                internal,
                assignToMe: false
              });
              okCount++;
            }catch(e){
              failCount++;
              console.warn(`[IS Toolkit][Vincular+Fechar] falha em ${k}:`, e);
              if(String(e?.message||'') !== 'cancelado'){
                alert(`Falha em ${k}: ${e.message || e}`);
              }
            }
          }

          linkCloseBtn.textContent = `OK: ${okCount}${failCount ? ` · Falhou: ${failCount}` : ''}`;
          setTimeout(() => { linkCloseBtn.textContent = oldText; }, 1600);
          linkCloseBtn.disabled = false;
        });

        prioBtn.addEventListener('click', async () => {
          if(selected.size === 0) return;
          const selectedKeys = [...selected];
          let priorities = [];
          try{ priorities = await getAllPriorities(); }catch(e){
            alert('Falha ao listar prioridades: ' + (e.message || e));
            return;
          }
          if(!priorities.length){ alert('Nenhuma prioridade encontrada.'); return; }

          const choice = await pickPriorityInteractive(priorities, { count: selectedKeys.length });
          if(!choice) return;

          prioBtn.disabled = true;
          const oldText = prioBtn.textContent;
          let okCount = 0, failCount = 0;

          for(const k of selectedKeys){
            prioBtn.textContent = `Aplicando ${k}...`;
            try{
              await setIssuePriority(k, choice.id);
              const card = list.querySelector(`.card[data-key="${CSS.escape(k)}"]`);
              if(card){
                card.setAttribute('data-priority-id', choice.id);
                card.setAttribute('data-priority-name', choice.name);
                const badge = card.querySelector('.prioBadge');
                if(badge) badge.textContent = choice.name;
              }
              okCount++;
            }catch(e){
              failCount++;
              console.warn(`[IS Toolkit][Prioridade] falha em ${k}:`, e);
            }
          }

          prioBtn.textContent = `OK: ${okCount}${failCount ? ` · Falhou: ${failCount}` : ''}`;
          setTimeout(() => { prioBtn.textContent = oldText; }, 1600);
          prioBtn.disabled = false;
        });

        batchBtn.addEventListener('click', () => {
          if(selected.size === 0) return;
          // Reusa o modal Gerenciador do queue-batch.js, pre-populando com os duplicados selecionados.
          openBatchModal({
            initialKeys: [...selected],
            sourceLabel: `Selecionados em Duplicados de ${issueKey}`
          });
        });

        refreshButtons();
      }, 0);
    }
    // =========================
    // RUNTIME — botão flutuante, atalho de teclado, bootstrap
    // =========================
    async function runApp(){
      const issueKey = getIssueKey();
      if(!issueKey){
        // Sem ticket aberto: abre o modal mesmo assim com um conteudo neutro,
        // dando acesso ao botao de Configuracoes (gear) no header e a busca por key.
        const modal = openModal('IS Toolkit', 'Nenhum ticket detectado nesta pagina.');
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
      const modal = openModal('IS Toolkit', `Ticket atual: ${issueKey}`);
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
      b.textContent = 'IS Toolkit';
      b.title = `IS Toolkit — atalhos: ${SHORTCUTS.join(' ou ')}`;
      b.addEventListener('click', runApp);
      document.body.appendChild(b);
    }

    const PROVIDER_BTN_ID = 'ml_provider_fab';

    async function ensureProviderButton(issueKey){
      const existing = document.getElementById(PROVIDER_BTN_ID);
      try{
        // Usa o mesmo cache do Confluence (getIssueAllFields com expand=names)
        const issueData = await _confGetIssueData(issueKey);
        if(!issueData){ existing?.remove(); return; }
        const names  = issueData?.names  || {};
        const fields = issueData?.fields || {};
        // Resolve "Object Type" -> customfield_XXXX
        const objTypeKey = _confResolveFieldKey('Object Type', names);
        const objTypeVal = objTypeKey ? _confExtractFieldValue(fields[objTypeKey]) : '';
        const isaPrinter = /impresora|impressora|printer|thermal/i.test(objTypeVal);
        if(!isaPrinter){ existing?.remove(); return; }
        if(existing) return; // já existe, não recria
        const btn = document.createElement('button');
        btn.id = PROVIDER_BTN_ID;
        btn.title = 'Chamado Fornecedora (impressora)';
        btn.textContent = '🖨️';
        btn.style.cssText = [
          'position:fixed;right:20px;bottom:158px;z-index:9999996;',
          'width:42px;height:42px;border-radius:50%;border:none;',
          'background:linear-gradient(180deg,#c0392b,#922b21);',
          'color:#fff;font-size:20px;line-height:1;',
          'cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.4);',
          'display:flex;align-items:center;justify-content:center;',
          'transition:transform .15s ease,filter .15s ease;',
        ].join('');
        btn.onmouseenter = () => { btn.style.transform='translateY(-2px)'; btn.style.filter='brightness(1.1)'; };
        btn.onmouseleave = () => { btn.style.transform=''; btn.style.filter=''; };
        btn.addEventListener('click', () => openProviderModal(issueKey));
        document.body.appendChild(btn);
      }catch(_){ existing?.remove(); }
    }

    // =========================
    // ACIONAMENTO VIA WHATSAPP
    // Botao flutuante que pega o telefone do "Contact phone" e abre a conversa no
    // wa.me com a mensagem pre-escrita (o usuario so aperta Enter — WhatsApp nao
    // deixa enviar automaticamente por link).
    // =========================
    const WA_BTN_ID = 'ml_whatsapp_fab';

    // Código do país por prefixo da localidade (atendemos LATAM).
    const WA_CC_BY_COUNTRY = { BR:'55', MX:'52', CO:'57', CL:'56', AR:'54', PE:'51' };

    // Infere o código do país pelas 2 primeiras letras da localidade (BR_SVC_..., MXCDMX01, etc.).
    function _waCountryFromLocality(locationKey){
      const m = String(locationKey || '').trim().toUpperCase().match(/^([A-Z]{2})/);
      return (m && WA_CC_BY_COUNTRY[m[1]]) ? WA_CC_BY_COUNTRY[m[1]] : '';
    }

    // Normaliza um telefone para dígitos com código de país.
    // - Se o número já traz "+" (código explícito, ex: +52...), RESPEITA — só usa os dígitos.
    // - Senão, prefixa o código do país inferido da LOCALIDADE (ou o fallback configurado).
    // Não força +55: LATAM é resolvido pela localidade.
    function _waNormalizePhone(raw, ccFallback, locationKey){
      const rawStr = String(raw || '');
      const d = rawStr.replace(/\D/g, '');
      if(!d) return '';
      // "+" presente = a pessoa colocou o código do país. Confia nos dígitos como estão.
      if(rawStr.includes('+')) return d;
      // Número local: determina o CC pela localidade; fallback pro configurado.
      const cc = (_waCountryFromLocality(locationKey) || String(ccFallback || '55')).replace(/\D/g, '');
      // Só prefixa se parecer número local (<=11 dígitos); senão assume que já vem com CC.
      return d.length <= 11 ? cc + d : d;
    }

    // Procura um telefone perto de um rótulo "Contact phone" no DOM (fallback quando não há CF configurado).
    function _waPhoneFromDom(){
      const wanted = ['contact phone', 'telefone de contato', 'teléfono de contacto', 'telefono de contacto'];
      const els = document.querySelectorAll('span,div,label,dt,td,strong,h2,h3');
      for(const el of els){
        const t = (el.textContent || '').trim().toLowerCase();
        if(t.length > 40) continue;
        if(wanted.includes(t)){
          let c = el;
          for(let i = 0; i < 4 && c.parentElement; i++){
            c = c.parentElement;
            const m = (c.textContent || '').match(/\+?\d[\d\s()\-]{7,}\d/);
            if(m) return m[0];
          }
        }
      }
      return '';
    }

    async function _waOpen(issueKey){
      let phone = '', reporter = '', locationKey = '', desc = '', summary = '';
      try{ locationKey = sessionStorage.getItem('ml_loc_key_' + issueKey) || ''; }catch(_){}
      const cfId = Number(SETTINGS.CF_CONTACT_PHONE || DEFAULTS.CF_CONTACT_PHONE || 0);
      try{
        const fieldsWanted = ['reporter', 'description', 'summary', `customfield_${CF_ASSET}`].concat(cfId ? [`customfield_${cfId}`] : []);
        const issue = await getIssueFields(issueKey, fieldsWanted);
        reporter = issue?.fields?.reporter?.displayName || '';
        summary  = issue?.fields?.summary || '';
        try{ desc = issue?.fields?.description ? _adfToText(issue.fields.description, 500) : ''; }catch(_){}
        if(cfId){
          const v = issue?.fields?.[`customfield_${cfId}`];
          phone = (v && typeof v === 'object') ? (v.value || v.name || '') : (v || '');
        }
        if(!locationKey){
          const assetRaw = issue?.fields?.[`customfield_${CF_ASSET}`];
          const assetArr = Array.isArray(assetRaw) ? assetRaw : (assetRaw ? [assetRaw] : []);
          const objKey = assetArr.map(a => a?.objectKey || a?.label || a?.name).filter(Boolean)[0];
          if(objKey) locationKey = String(objKey);
        }
      }catch(e){
        // Antes isso era engolido em silencio — se os campos (reporter/summary/description)
        // vierem vazios na mensagem do WhatsApp, o erro real aparece aqui no console (F12).
        console.warn('[IS Toolkit][WhatsApp] falha ao buscar campos do ticket, mensagem vai sair com campos em branco:', e);
      }
      if(!phone) phone = _waPhoneFromDom();
      if(!phone){ showToast('Telefone de contato não encontrado neste ticket.', 'warn', 4000); return; }

      const num = _waNormalizePhone(phone, SETTINGS.WHATSAPP_COUNTRY_CODE || DEFAULTS.WHATSAPP_COUNTRY_CODE, locationKey);
      if(!num || num.length < 10){ showToast('Telefone inválido: ' + phone, 'warn', 4000); return; }

      // {meu_nome} = nome de quem está logado (via /myself) — mesma lógica do ASSIGN_COMMENT/STATUS_ACTIONS,
      // assim a mensagem de WhatsApp também não precisa de assinatura fixa hardcoded no template.
      let me = null;
      try{ me = await jiraGetMyself(); }catch(_){}
      const tmplRaw = String(SETTINGS.WHATSAPP_MSG_TEMPLATE || DEFAULTS.WHATSAPP_MSG_TEMPLATE || '');
      const tmpl = _applyMyNamePlaceholder(tmplRaw, me);
      const first = (reporter || '').split(/\s+/)[0] || '';
      // Substitui os campos curtos primeiro e colapsa só espaços/tabs repetidos (não newlines);
      // description/summary entram por último pra preservar as quebras de linha do relato.
      const msg = tmpl
        .replace(/\{key\}/g, issueKey)
        .replace(/\{reporter\}/g, reporter || '')
        .replace(/\{firstname\}/g, first)
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\{summary\}/g, summary || '')
        .replace(/\{description\}/g, desc || '')
        .trim();
      const q = `phone=${num}` + (msg ? `&text=${encodeURIComponent(msg)}` : '');
      const sendUrl = `https://web.whatsapp.com/send?${q}`;
      // Manda a requisicao e espera o ACK de uma aba do WhatsApp Web via EVENTO
      // (GM_addValueChangeListener) — leitura cross-tab por getValue pode vir atrasada/em cache.
      // Se alguem confirmar, ela reusa (navega sozinha). Se ninguem confirmar em ~1.4s, abre uma aba.
      const reqTs = Date.now();
      let _acked = false, _lid = null, _done = false;
      const _finish = (reused) => {
        if(_done) return; _done = true;
        try{ if(_lid != null && typeof GM_removeValueChangeListener !== 'undefined') GM_removeValueChangeListener(_lid); }catch(_){}
        if(reused){
          showToast('Conversa aberta na sua aba do WhatsApp Web — troque pra ela.', 'success', 3500);
        } else {
          window.open(sendUrl, 'ml_wa_web');
        }
      };
      try{
        if(typeof GM_addValueChangeListener !== 'undefined'){
          _lid = GM_addValueChangeListener('ml_wa_ack', (name, oldV, newV) => {
            if(Number(newV) === reqTs){ _acked = true; _finish(true); }
          });
        }
      }catch(_){}
      try{ _gmSet('ml_wa_request', JSON.stringify({ url: sendUrl, ts: reqTs })); }catch(_){}
      showToast('Abrindo no WhatsApp Web…', 'info', 1400);
      setTimeout(() => {
        if(_acked) return;
        // Backup: confere via getValue antes de decidir abrir nova aba.
        let ackVal = 0; try{ ackVal = Number(_gmGet('ml_wa_ack') || 0); }catch(_){}
        _finish(ackVal === reqTs);
      }, 1400);
    }

    function _waEnsureButton(issueKey){
      if(document.getElementById(WA_BTN_ID)) return;
      const btn = document.createElement('button');
      btn.id = WA_BTN_ID;
      btn.title = 'Acionar via WhatsApp (Contact phone)';
      // Glifo oficial do WhatsApp (silhueta do "fone + balão"), em vez do emoji genérico de balão de mensagem.
      btn.innerHTML = '<svg viewBox="0 0 448 512" width="20" height="20" fill="#fff" style="pointer-events:none;"><path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/></svg>';
      btn.style.cssText = [
        'position:fixed;right:20px;bottom:200px;z-index:9999996;',
        'width:42px;height:42px;border-radius:50%;border:none;',
        'background:linear-gradient(180deg,#25d366,#1da851);',
        'color:#fff;font-size:20px;line-height:1;',
        'cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.4);',
        'display:flex;align-items:center;justify-content:center;',
        'transition:transform .15s ease,filter .15s ease;',
      ].join('');
      btn.onmouseenter = () => { btn.style.transform='translateY(-2px)'; btn.style.filter='brightness(1.1)'; };
      btn.onmouseleave = () => { btn.style.transform=''; btn.style.filter=''; };
      btn.addEventListener('click', () => _waOpen(getIssueKey()));
      document.body.appendChild(btn);
    }

    let _setupWizardShown = false;

    const _tick = () => {
      try{ if(typeof _arEnsureButton === 'function') _arEnsureButton(); }catch(_){}
      try{ if(typeof _aiEnsureToggle === 'function') _aiEnsureToggle(); }catch(_){}
      const key = getIssueKey();
      if(key){ ensureButton(); ensureProviderButton(key); _waEnsureButton(key); }
      else { document.getElementById(IDS.btn)?.remove(); document.getElementById(PROVIDER_BTN_ID)?.remove(); document.getElementById(WA_BTN_ID)?.remove(); }

      // Assistente de setup inicial: so dispara automaticamente pra instalacoes genuinamente
      // novas (nunca salvaram configuracao neste navegador), uma unica vez por carregamento
      // de pagina, e so quando ha um ticket aberto (pro passo de "Descobrir campos" funcionar).
      if(key && _IS_FRESH_INSTALL && !SETTINGS.SETUP_WIZARD_DONE && !_setupWizardShown){
        _setupWizardShown = true;
        try{ openSetupWizard(); }catch(e){}
      }

      // Chip ambient (arco SVG + pendências): mantém visível enquanto há auditoria para este ticket
      try{
        document.getElementById('ml_score_badge')?.remove(); // remove badge legado se existir
        const chipEl = document.getElementById('ml_audit_ambient');
        if(!key){
          chipEl?.remove(); // fora de issue page
        } else if(chipEl && _auditCache && _auditCache.issueKey !== key){
          chipEl.remove(); // navegou para outro ticket
        } else if(!document.getElementById('ml_audit_ambient')){
          // Chip ausente — tenta recriar
          let sc = null, it = null, clickFn = null;
          if(_auditCache?.issueKey === key && typeof _auditCache.score === 'number'){
            sc = _auditCache.score; it = _auditCache.items || [];
            // Reabre num modal NOVO (openModal() não retorna algo com .open()/.reopen()).
            clickFn = () => {
              try{
                const m = openModal('IS Toolkit', `Ticket atual: ${key}`);
                _auditCache.modal = m;
                showAuditPanel(m, key, {
                  score: sc, items: it,
                  closing_comment: _auditCache.closingComment || '',
                  summary: _auditCache.summary || '',
                  comment_reviews: _auditCache.commentReviews || [],
                  title_review: _auditCache.titleReview || null
                });
              }catch(e){ console.warn('[is-toolkit][audit] reabrir painel (tick) falhou:', e); }
            };
          } else {
            const gm = _loadAuditGM(key);
            if(gm && typeof gm.score === 'number'){ sc = gm.score; it = gm.items || []; clickFn = () => toggleApp(); }
          }
          if(sc !== null) _injectAuditAmbient(sc, it, clickFn);
        }
      }catch(e){}
      // Botao "Gerenciador" aparece em /issues e /queues (independente de ter ticket aberto).
      try { ensureBatchButton(); } catch(_) {}
      // Botao "Status" (antigo "Atribuir & iniciar") so em paginas de issue individual.
      ensureStatusButton(); // limpa legado
      // Chip(s) lateral(is) com link de Tshoot do Confluence (se alguma regra matchar).
      try { ensureConfluenceChip(); } catch(_) {}
      // Botao "Comentario rapido" so em paginas de issue individual.
      try { ensureQuickCommentButton(); } catch(_) {}
    };

    // Atalhos de teclado globais (ignora quando focado em input/textarea/contenteditable).
    const _parsedShortcuts = parseShortcuts(SHORTCUTS);
    const _parsedStatusMenuShortcuts = parseShortcuts(STATUS_MENU_SHORTCUTS);
    const _parsedQuickCommentShortcuts = parseShortcuts(QUICK_COMMENT_SHORTCUTS);
    const _parsedAssignShortcut = parseShortcut(SETTINGS.ASSIGN_SHORTCUT || DEFAULTS.ASSIGN_SHORTCUT);
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

    // MutationObserver no <title>: detecta troca de ticket sem polling agressivo
    let _lastTitle = document.title;
    let _tickDebounce = null;
    const _debouncedTick = () => {
      clearTimeout(_tickDebounce);
      _tickDebounce = setTimeout(() => { _lastTitle = document.title; _tick(); }, 120);
    };
    try{
      const _obs = new MutationObserver(() => { if(document.title !== _lastTitle) _debouncedTick(); });
      _obs.observe(document.querySelector('title') || document.documentElement,
        { childList:true, subtree:true, characterData:true });
    }catch(_){}
    // =========================
    // AUTO-RELOAD (temporizador de recarga da pagina)
    // O Jira nao atualiza filas/tickets em tempo real; este modulo recarrega a pagina
    // a cada X segundos. Toggle num botao flutuante, com countdown visivel.
    // Pausa automaticamente enquanto o usuario digita ou com qualquer modal do toolkit
    // aberto (o que tambem cobre operacoes em lote — nunca recarrega no meio de uma acao).
    // =========================
    // Estado ligado/desligado é POR ABA: usa sessionStorage, que é isolado por aba e
    // sobrevive ao reload da mesma aba. Assim, ligar numa aba NÃO liga nas outras.
    const AR_STATE_KEY = 'ml_auto_reload_tab_v1';
    // Intervalo padrão é uma preferência GLOBAL (compartilhada): fica no GM storage.
    const AR_DEFAULT_INT_KEY = 'ml_auto_reload_int_v1';
    const AR_BTN_ID = 'ml_auto_reload_btn';
    let _arEnabled = false;
    let _arIntervalSec = 60;
    let _arRemaining = 0;
    let _arTimer = null;
    // Preferencias globais (do modal de Configuracoes).
    const _arAutostart   = !!SETTINGS.AUTO_RELOAD_AUTOSTART;
    const _arPauseTyping = SETTINGS.AUTO_RELOAD_PAUSE_TYPING !== false;
    const _arPauseModal  = SETTINGS.AUTO_RELOAD_PAUSE_MODAL !== false;

    // Estado por-aba (sessionStorage).
    function _arLoadTab(){
      try{
        const raw = sessionStorage.getItem(AR_STATE_KEY);
        return raw ? JSON.parse(raw) : null;
      }catch{ return null; }
    }
    function _arSaveTab(){
      try{
        sessionStorage.setItem(AR_STATE_KEY, JSON.stringify({ enabled: _arEnabled, intervalSec: _arIntervalSec }));
      }catch{}
    }
    // Intervalo padrão global (GM storage, com fallback localStorage).
    function _arLoadDefaultInterval(){
      try{
        let raw = _gmGet(AR_DEFAULT_INT_KEY);
        if(raw == null){ try{ raw = localStorage.getItem(AR_DEFAULT_INT_KEY); }catch{} }
        const n = parseInt(raw, 10);
        return isNaN(n) ? null : n;
      }catch{ return null; }
    }
    function _arSaveDefaultInterval(){
      try{
        const s = String(_arIntervalSec);
        if(!_gmSet(AR_DEFAULT_INT_KEY, s)){ try{ localStorage.setItem(AR_DEFAULT_INT_KEY, s); }catch{} }
      }catch{}
    }
    function _arIsTyping(){
      const el = document.activeElement;
      if(!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || el.isContentEditable === true;
    }
    function _arToolkitBusy(){
      // Qualquer modal/overlay do IS Toolkit aberto pausa o reload (inclui lote,
      // derivar, configuracoes, capturas, o seletor de Service da ISS, o comentario
      // rapido e as janelas do modo auditoria — senão um reload no meio da interação
      // fecha tudo e perde o que estava sendo preenchido/revisado).
      const sels = [
        '#'+IDS.modal, '#'+IDS.overlay, '#'+IDS.dOverlay, '#'+IDS.sOverlay, '.mlCapOverlay', '#ml_iss_svc_overlay',
        '#ml_qc_overlay', '#ml_ai_popover', '#ml_audit_hints_bar'
      ];
      for(const s of sels){ try{ if(document.querySelector(s)) return true; }catch{} }
      // Checklist de coaching / marcadores do modo auditoria inline (não têm id fixo —
      // são markers dinâmicos guardados em _AI.markers).
      if(typeof _AI !== 'undefined' && _AI.active && _AI.markers && _AI.markers.length) return true;
      return false;
    }
    function _arEnsureButton(){
      // Botao escondido por padrao (SETTINGS.AUTO_RELOAD_BUTTON_VISIBLE) — o auto-reload em si
      // (start/stop/timer) continua funcionando por baixo pra quem ja tinha ligado antes disso
      // via GM storage, so o controle visual fica oculto ate a pessoa reativar em Configuracoes.
      if(!SETTINGS.AUTO_RELOAD_BUTTON_VISIBLE){
        document.getElementById(AR_BTN_ID)?.remove();
        return;
      }
      if(document.getElementById(AR_BTN_ID)) return;
      const b = document.createElement('button');
      b.id = AR_BTN_ID;
      b.style.cssText = [
        // Ancorado logo acima do botao principal "IS Toolkit" (bottom:70px), sem gap.
        'position:fixed;right:20px;bottom:116px;z-index:9999996;',
        'min-width:58px;height:30px;padding:0 11px;border:none;border-radius:var(--ml-radius-pill,999px);',
        'color:#fff;font:700 11.5px var(--ml-font,-apple-system,BlinkMacSystemFont,sans-serif);',
        'cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35);opacity:.92;',
        'display:flex;align-items:center;justify-content:center;gap:5px;',
        'transition:transform .15s ease,filter .15s ease,opacity .15s ease;',
      ].join('');
      b.onmouseenter = () => { b.style.transform='translateY(-2px)'; b.style.filter='brightness(1.1)'; b.style.opacity='1'; };
      b.onmouseleave = () => { b.style.transform=''; b.style.filter=''; b.style.opacity='.92'; };
      b.addEventListener('click', _arToggle);
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); _arPromptInterval(); });
      document.body.appendChild(b);
      _arUpdateButton();
    }
    function _arUpdateButton(paused){
      const b = document.getElementById(AR_BTN_ID);
      if(!b) return;
      if(_arEnabled){
        b.style.background = paused
          ? 'linear-gradient(135deg,#b45309,#92400e)'
          : 'linear-gradient(135deg,#059669,#047857)';
        b.textContent = (paused ? '⏸ ' : '↻ ') + _arRemaining + 's';
        b.title = `Auto-reload LIGADO (a cada ${_arIntervalSec}s)${paused ? ' — pausado (digitando ou modal aberto)' : ''}.\nClique: desligar. Menu direito: mudar intervalo.`;
      } else {
        b.style.background = 'linear-gradient(135deg,#475569,#334155)';
        b.textContent = '↻ off';
        b.title = `Auto-reload DESLIGADO.\nClique: ligar (a cada ${_arIntervalSec}s). Menu direito: mudar intervalo.`;
      }
    }
    function _arStart(){
      _arRemaining = _arIntervalSec;
      if(_arTimer) clearInterval(_arTimer);
      _arTimer = setInterval(_arTickSecond, 1000);
      _arUpdateButton();
    }
    function _arStop(){
      if(_arTimer){ clearInterval(_arTimer); _arTimer = null; }
      _arUpdateButton();
    }
    function _arTickSecond(){
      if((_arPauseTyping && _arIsTyping()) || (_arPauseModal && _arToolkitBusy())){ _arUpdateButton(true); return; } // pausa, sem decrementar
      _arRemaining--;
      if(_arRemaining <= 0){
        _arSaveTab(); // garante que segue ligado apos o reload (nesta aba)
        try{ location.reload(); }catch{ location.href = location.href; }
        return;
      }
      _arUpdateButton();
    }
    function _arToggle(){
      _arEnabled = !_arEnabled;
      _arSaveTab(); // por-aba
      if(_arEnabled){ _arStart(); showToast(`Auto-reload ligado nesta aba: a cada ${_arIntervalSec}s.`, 'success', 2500); }
      else { _arStop(); showToast('Auto-reload desligado nesta aba.', 'info', 2000); }
    }
    function _arPromptInterval(){
      const val = prompt('Intervalo do auto-reload em segundos (mínimo 5):', String(_arIntervalSec));
      if(val == null) return;
      const n = parseInt(val, 10);
      if(isNaN(n) || n < 5){ showToast('Intervalo inválido (mínimo 5s).', 'warn', 3000); return; }
      _arIntervalSec = n;
      _arSaveTab();              // aplica nesta aba
      _arSaveDefaultInterval();  // e vira o padrão global das próximas abas
      if(_arEnabled) _arStart();
      else _arUpdateButton();
      showToast(`Intervalo do auto-reload: ${n}s.`, 'success', 2500);
    }
    (function _arInit(){
      const tab = _arLoadTab();               // estado desta aba (sessionStorage)
      const globalDef = _arLoadDefaultInterval();
      const baseInt = parseInt(SETTINGS.AUTO_RELOAD_INTERVAL_SEC || DEFAULTS.AUTO_RELOAD_INTERVAL_SEC || 60, 10);
      _arIntervalSec = Math.max(5, parseInt((tab && tab.intervalSec) || globalDef || baseInt, 10) || 60);
      // Se a aba ja tem estado salvo, respeita (inclusive desligado). Aba nova (sem estado):
      // liga se o autostart global estiver ativo.
      _arEnabled = tab ? !!tab.enabled : _arAutostart;
      if(_arEnabled && !tab) _arSaveTab(); // registra o estado desta aba
      _arRemaining = _arIntervalSec;
      _arEnsureButton();
      if(_arEnabled) _arStart();
    })();

    _tick();
    setInterval(_tick, 3000); // safety net — Observer cobre 95% dos casos

    // Lembrete periodico de backup das configs (configs ficam so neste navegador).
    try { maybeShowBackupReminder(); } catch(_) {}

    // Mostra resultado do auto-close após reload da página
    try{
      const raw = sessionStorage.getItem('ist_autoclose_result');
      if(raw){
        sessionStorage.removeItem('ist_autoclose_result');
        const r = JSON.parse(raw);
        if(r && (Date.now() - r.t) < 30000){ // máx 30s após o reload
          if(r.ok){
            showToast(`ISS ${r.issKey} fechada automaticamente.`, 'success', 5000);
          } else {
            // Inclui debug dos campos para diagnóstico
            showToast(`ISS ${r.issKey}:\n${r.msg}`, 'error', 0);
          }
        }
      }
    }catch(_){}
    // =========================
    // QUEUE BATCH ACTIONS — Gerenciador: derivar/criar ISS em lote em /issues e /queues
    //
    // UX:
    //   - Botao "Lote" aparece quando voce esta numa pagina /issues?filter=... ou /queues/...
    //   - Click abre modal:
    //       1) Lista de keys: auto-detectada do DOM + permite colar livre
    //       2) Cada key tem checkbox (todas marcadas por padrao)
    //       3) Acao: Derivar para time X (com comentario padrao) [+ checkbox criar ISS p/ cada]
    //   - Executa em loop com progresso ao vivo + log de erros por ticket
    // =========================

    function isQueueOrIssuesPage(){
      // Se ja tem um ticket aberto (browse/X ou queues/issue/X), nao mostra "Gerenciador"
      // - usuario quer "Localidade" pra acoes daquele chamado.
      if(getIssueKey()) return false;
      return /\/(issues|queues)(\b|\/|\?|$)/.test(location.pathname);
    }

    // Extrai issue keys visiveis no DOM via varios seletores (Issue Navigator, queues, etc).
    function getQueueKeysFromDom(){
      const keys = new Set();

      // 1) [data-issue-key] (mais comum)
      document.querySelectorAll('[data-issue-key]').forEach(el => {
        const k = el.getAttribute('data-issue-key');
        if(k && /^[A-Z][A-Z0-9_]+-\d+$/.test(k)) keys.add(k);
      });

      // 2) Links /browse/X-Y
      document.querySelectorAll('a[href*="/browse/"]').forEach(a => {
        const m = (a.getAttribute('href') || '').match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/);
        if(m) keys.add(m[1]);
      });

      // 3) Texto puro com keys (fallback ultra-permissivo - so pega visiveis em <a> ou <span>)
      return [...keys].sort((a, b) => {
        const [ap, an] = a.split('-'); const [bp, bn] = b.split('-');
        if(ap !== bp) return ap.localeCompare(bp);
        return parseInt(an, 10) - parseInt(bn, 10);
      });
    }

    // Extrai keys de um texto livre (cola de qualquer lugar).
    function extractKeysFromText(txt){
      const all = String(txt || '').match(/[A-Z][A-Z0-9_]+-\d+/g) || [];
      return [...new Set(all)];
    }

    // Le a lista de TIMES disponiveis na transicao Derivar de uma issue qualquer (precisa de 1 issue
    // ativa pra pegar os allowedValues do customfield Resolution Team na transicao).
    // Como sao opcoes globais do customfield, qualquer issue serve - cacheamos por sessao.
    const _TEAMS_CACHE_KEY = 'ml_loc_teams_cache_v1';
    async function getDeriveTeamsFromAnyKey(sampleKey){
      try{
        const raw = sessionStorage.getItem(_TEAMS_CACHE_KEY);
        if(raw){
          const c = JSON.parse(raw);
          if(c?.teams && (Date.now() - c.t) < 30*60*1000) return c.teams;
        }
      }catch(_){}

      const data = await jiraGetTransitions(sampleKey);
      const tr = pickDeriveTransition(data);
      if(!tr) throw new Error(`Transicao "${DERIVE_TRANSITION_NAME}" nao disponivel em ${sampleKey}.`);
      const allowed = getAllowedResolutionTeams(tr);
      const teams = filterTeamsAllowlist(allowed);
      if(!teams.length) throw new Error('Nenhum time da allowlist encontrado nas opcoes.');
      try{ sessionStorage.setItem(_TEAMS_CACHE_KEY, JSON.stringify({ teams, t: Date.now() })); }catch(_){}
      return teams;
    }

    function ensureBatchButton(){
      if(!isQueueOrIssuesPage()){
        document.getElementById('ml_batch_btn')?.remove();
        return;
      }
      ensureStyle();
      if(document.getElementById('ml_batch_btn')) return;
      const b = document.createElement('button');
      b.id = 'ml_batch_btn';
      b.textContent = 'Gerenciador';
      b.title = 'Aplicar acoes em massa (derivar / criar ISS) nesta tela';
      Object.assign(b.style, {
        position: 'fixed', right: '18px', bottom: '70px', zIndex: '9999997',
        background: 'linear-gradient(135deg, #34c578, #28a366)', color: '#fff',
        border: '0', borderRadius: '999px', padding: '11px 18px',
        fontWeight: '700', cursor: 'pointer',
        boxShadow: '0 12px 28px rgba(52,197,120,.35), 0 4px 10px rgba(0,0,0,.30)',
        fontFamily: 'var(--ml-font, system-ui)', fontSize: '13px', letterSpacing: '.2px'
      });
      b.addEventListener('click', openBatchModal);
      document.body.appendChild(b);
    }

    // Enquanto o Gerenciador de fila estiver aberto, bloqueia qualquer reload/fechamento
    // da aba (F5, fechar aba, navegação, e também um reload forçado por ferramenta externa
    // que atue via location/navegação) — evita perder o trabalho em andamento no meio do lote.
    // Guardamos a referência pra poder remover ao fechar ou reabrir o modal.
    let _batchUnloadHandler = null;
    function _batchBlockReload(e){
      e.preventDefault();
      e.returnValue = 'Você tem o Gerenciador de fila aberto no IS Toolkit. Sair da página agora pode perder o progresso.';
      return e.returnValue;
    }

    // ============= MODAL DE LOTE =============
    // opts.initialKeys: lista pre-populada (ex: vinda do Duplicados). Quando passada,
    //                   nao tentamos detectar do DOM (a lista ja vem pronta).
    function openBatchModal(opts){
      opts = opts || {};
      if(_batchUnloadHandler){ window.removeEventListener('beforeunload', _batchUnloadHandler); _batchUnloadHandler = null; }
      document.getElementById('ml_batch_modal')?.remove();
      document.getElementById('ml_batch_overlay')?.remove();

      ensureStyle();

      const overlay = document.createElement('div');
      overlay.id = 'ml_batch_overlay';
      overlay.className = 'mlCapOverlay';

      const modal = document.createElement('div');
      modal.id = 'ml_batch_modal';
      modal.className = 'mlCapModal';
      modal.style.maxWidth = 'min(900px, 96vw)';

      const detected = Array.isArray(opts.initialKeys) ? [...opts.initialKeys] : getQueueKeysFromDom();
      const sourceLabel = opts.sourceLabel || (Array.isArray(opts.initialKeys) ? 'Recebido do contexto anterior' : 'Detectado automaticamente da pagina');

      modal.innerHTML = `
        <div class="ch">
          <div>
            <div class="title"><span class="titleDot" style="background:#34c578;box-shadow:0 0 0 4px rgba(52,197,120,.18);"></span>Gerenciador de fila</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button id="ml_batch_settings" class="gear" title="Configuracoes">&#9881;</button>
            <button id="ml_batch_close">Fechar</button>
          </div>
        </div>
        <div class="cb">
          <details class="capHint" style="margin-bottom:10px;">
            <summary style="cursor:pointer;font-weight:700;color:var(--ml-text-mut);outline:none;">Como funciona</summary>
            <ol style="margin:8px 0 0;">
              <li>${esc(sourceLabel)}: <b>${detected.length}</b> chamado(s) (todos <b>desmarcados</b> por seguranca).</li>
              <li>Use o filtro pra achar e <b>marque</b> os chamados que quer processar (ou "Marcar todos").</li>
              <li>Escolha a acao (Derivar para time X / com ISS) e clique "Executar".</li>
              <li>Ou clique "Auditar selecionados" pra rodar a auditoria por IA nos marcados sem derivar nada (precisa do Webhook de auditoria configurado).</li>
              <li>Clique "Detalhes" num chamado pra ver a descri&ccedil;&atilde;o completa e mudar a prioridade individualmente, ou marque v&aacute;rios e use "Prioridade selecionados" pra aplicar a mesma prioridade em todos de uma vez.</li>
            </ol>
          </details>

          <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center;">
            <button id="ml_batch_redetect" class="btnSecondary" title="Re-detectar da página" style="padding:8px 11px;">&#8635;</button>
            <button id="ml_batch_clear" class="btnSecondary" title="Limpar lista" style="padding:8px 11px;">&#128465;</button>
          </div>

          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;align-items:center;flex-wrap:wrap;gap:8px;">
              <div style="font-size:12px;color:var(--ml-text-mut);display:flex;align-items:center;gap:8px;">
                <span id="ml_batch_count">0</span> chamado(s) <span id="ml_batch_sel_count" style="color:var(--ml-text-dim);"></span>
                <span id="ml_batch_loading" style="color:var(--ml-text-dim);display:none;"><span class="mlSpin"></span> carregando...</span>
              </div>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                <input type="text" id="ml_batch_filter" placeholder="Filtrar…"
                  style="padding:4px 10px;background:var(--ml-bg-2);color:var(--ml-text);border:1px solid var(--ml-border-2);border-radius:6px;font-size:11.5px;outline:none;min-width:160px;" />
                <button id="ml_batch_check_all" class="btnSecondary" style="font-size:11px;padding:4px 10px;">Marcar todos</button>
                <button id="ml_batch_uncheck_all" class="btnSecondary" style="font-size:11px;padding:4px 10px;">Desmarcar</button>
              </div>
            </div>
            <div id="ml_batch_list" style="max-height:340px;overflow-y:auto;border-top:1px solid var(--ml-border);"></div>
          </div>

          <div style="border-top:1px solid var(--ml-border);padding-top:14px;">
            <label id="ml_batch_teams_label" style="font-size:12px;color:var(--ml-text-mut);">Derivar para</label>
            <div id="ml_batch_teams" style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 4px;"><span class="muted">Carregando times...</span></div>
            <div id="ml_batch_teams_hint" style="display:none;font-size:11px;color:var(--ml-blue);margin:0 0 12px;">Time global desativado &mdash; voc&ecirc; definiu times por ticket na coluna <b>"Derivar para"</b>. Limpe os overrides (&#8629; usar time global) para reativar.</div>
            <div id="ml_batch_teams_spacer" style="margin-bottom:12px;"></div>

            <label style="font-size:12px;font-weight:700;color:var(--ml-text-mut);display:flex;align-items:center;gap:8px;">
              <span>Comentario (observacao interna)</span>
              <span id="ml_batch_comment_btnwrap" style="margin-left:auto;font-weight:400;"></span>
            </label>
            <textarea id="ml_batch_comment" style="width:100%;min-height:70px;background:var(--ml-bg-0);color:var(--ml-text);border:1px solid var(--ml-border-2);border-radius:var(--ml-radius-sm);padding:10px;font-family:inherit;font-size:13px;resize:vertical;outline:none;margin-top:6px;">${esc(DERIVE_COMMENT_DEFAULT)}</textarea>

            <label style="display:flex;align-items:center;gap:8px;margin-top:14px;font-size:13px;cursor:pointer;">
              <input type="checkbox" id="ml_batch_iss_chk" style="transform:scale(1.15);accent-color:var(--ml-blue);" />
              <span>Tamb&eacute;m criar tarefa ISS para cada chamado</span>
              <span title="So ativa quando o time selecionado esta em ISS_TASK_TRIGGER_TEAMS (Configuracoes). Cada chamado vira 1 ISS." style="color:var(--ml-text-dim);cursor:help;font-size:14px;line-height:1;">&#9432;</span>
            </label>
          </div>

          <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
            <button id="ml_batch_cancel" class="btnSecondary">Cancelar</button>
            <button id="ml_batch_prio_run" class="btnSecondary" title="Aplica uma prioridade escolhida a todos os chamados marcados (campo Prioridade direto, sem transicao).">&#9888; Prioridade selecionados</button>
            <button id="ml_batch_audit_run" class="btnSecondary" title="Roda a auditoria por IA em cada chamado marcado — não deriva, só analisa e salva o resultado." ${SETTINGS.AUDIT_WEBHOOK_URL ? '' : 'disabled'}>&#128269; Auditar selecionados</button>
            <button id="ml_batch_run" class="btnPrimary">Executar</button>
          </div>

          <div id="ml_batch_progress" style="margin-top:14px;"></div>
        </div>
      `;

      document.body.appendChild(overlay);
      document.body.appendChild(modal);

      // Anexa botao de Snippets ao textarea de comentario + slash expander + hint
      try{
        const ta = modal.querySelector('#ml_batch_comment');
        const wrap = modal.querySelector('#ml_batch_comment_btnwrap');
        if(ta && wrap){
          wrap.appendChild(buildSnippetsButton(ta, { label: 'Snippets' }));
        }
        if(ta){
          attachSlashExpander(ta);
          const hintBox = document.createElement('div');
          ta.parentNode?.insertBefore(hintBox, ta.nextSibling);
          renderSlashCommandsHint(hintBox, { textarea: ta });
        }
      }catch(_){}

      // STATE
      let keys = [...detected];
      // Default: nenhum marcado (mais seguro - usuario marca o que quer processar).
      let selected = new Set();
      let teams = [];
      let chosenTeam = null;
      let info = {};       // { key: { summary, status, asset, ... } } - preenchido em background
      let filterText = ''; // filtro de busca local
      let ticketFieldTechs = {}; // key → array de field techs do catálogo
      let perTicketTeam = {};    // key → {id, value} — override de time por ticket

      const close = () => {
        if(_batchUnloadHandler){ window.removeEventListener('beforeunload', _batchUnloadHandler); _batchUnloadHandler = null; }
        modal.remove(); overlay.remove();
      };
      overlay.addEventListener('click', close);
      modal.querySelector('#ml_batch_close').onclick = close;
      modal.querySelector('#ml_batch_cancel').onclick = close;
      modal.querySelector('#ml_batch_settings').onclick = () => openSettingsModal();

      // Ativa o bloqueio de reload/fechamento enquanto esta tela estiver aberta.
      _batchUnloadHandler = _batchBlockReload;
      window.addEventListener('beforeunload', _batchUnloadHandler);

      function updateSelCount(){
        const el = modal.querySelector('#ml_batch_sel_count');
        if(el) el.textContent = `- ${selected.size} marcado(s)`;
      }

      function matchesFilter(k){
        if(!filterText) return true;
        const q = filterText.toLowerCase();
        if(k.toLowerCase().includes(q)) return true;
        const i = info[k];
        if(!i) return false;
        return [i.summary, i.asset, i.resTeam, i.status, i.assignee, i.issuetype]
          .filter(Boolean).some(v => String(v).toLowerCase().includes(q));
      }

      function statusColorCss(catColor){
        // Jira status categories: 'green' (done), 'yellow' (in progress), 'blue-gray'/'medium-gray' (todo)
        switch(catColor){
          case 'green':       return 'background:rgba(52,197,120,.18);color:#86efac;border:1px solid rgba(52,197,120,.35);';
          case 'yellow':      return 'background:rgba(251,191,36,.18);color:#fcd34d;border:1px solid rgba(251,191,36,.35);';
          case 'blue-gray':   return 'background:rgba(79,140,255,.18);color:#93c5fd;border:1px solid rgba(79,140,255,.35);';
          default:            return 'background:rgba(148,163,184,.18);color:#cbd5e1;border:1px solid rgba(148,163,184,.30);';
        }
      }

      function renderList(){
        modal.querySelector('#ml_batch_count').textContent = keys.length;
        updateSelCount();
        const listEl = modal.querySelector('#ml_batch_list');
        if(!keys.length){
          listEl.innerHTML = `<div class="capEmpty">Nenhum chamado ainda. Cole keys ou redetecte do DOM.</div>`;
          return;
        }

        const visibleKeys = keys.filter(matchesFilter);

        // Mapa de quantos tickets compartilham a mesma localidade
        const locMap = {};
        for(const k of keys){
          const loc = info[k]?.asset;
          if(loc) locMap[loc] = (locMap[loc] || 0) + 1;
        }

        // Tabela com header sticky
        const rows = visibleKeys.map(k => {
          const i = info[k] || {};
          const link = `${location.origin}/browse/${k}`;
          const statusPill = i.status
            ? `<span style="font-size:10.5px;padding:1px 8px;border-radius:999px;font-weight:600;${statusColorCss(i.statusColor)}">${esc(i.status)}</span>`
            : '';
          const priorityImg = i.priorityIcon
            ? `<img src="${esc(i.priorityIcon)}" alt="${esc(i.priority || '')}" title="${esc(i.priority || '')}" style="width:14px;height:14px;vertical-align:middle;" />`
            : '';
          const typeImg = i.issuetypeIcon
            ? `<img src="${esc(i.issuetypeIcon)}" alt="${esc(i.issuetype || '')}" title="${esc(i.issuetype || '')}" style="width:14px;height:14px;vertical-align:middle;" />`
            : '';
          const summary = i.summary || (i.error ? `<span style="color:#fca5a5;">${esc(i.error)}</span>` : '<span class="muted">carregando...</span>');

          // Localidade: badge de field tech + contador de tickets na mesma loc
          const fts = ticketFieldTechs[k];
          const ativos = fts ? fts.filter(f => /ativo/i.test(f.status)) : null;
          const fieldBadge = ativos !== null
            ? ativos.length > 0
              ? `<span style="font-size:10px;background:rgba(52,197,120,.18);color:#86efac;border:1px solid rgba(52,197,120,.35);border-radius:5px;padding:1px 6px;white-space:nowrap;">● ${ativos.length} ativo${ativos.length>1?'s':''}</span>`
              : `<span style="font-size:10px;background:rgba(252,165,165,.1);color:#fca5a5;border:1px solid rgba(252,165,165,.3);border-radius:5px;padding:1px 6px;white-space:nowrap;">sem ativos</span>`
            : '';
          const locCount = (i.asset && locMap[i.asset] > 1)
            ? `<span style="font-size:10px;color:var(--ml-text-dim);">${locMap[i.asset]}× esta loc.</span>`
            : '';
          const asset = i.asset
            ? `<div style="display:flex;flex-direction:column;gap:3px;align-items:flex-start;">
                 <span style="background:var(--ml-bg-2);padding:1px 8px;border-radius:6px;border:1px solid var(--ml-border);font-size:11px;">${esc(i.asset)}</span>
                 ${fieldBadge}${locCount}
               </div>`
            : '<span class="muted" style="font-size:11px;">-</span>';

          const team = i.resTeam
            ? `<span style="font-size:11px;color:var(--ml-text);">${esc(i.resTeam)}</span>`
            : '<span class="muted" style="font-size:11px;">-</span>';

          // Coluna "Derivar para": override por ticket ou usa global
          const override = perTicketTeam[k];
          const effectiveTeam = override || chosenTeam;
          const destBtn = effectiveTeam
            ? `<button class="ml-override-btn" data-key="${esc(k)}"
                style="font-size:11px;padding:2px 8px;border-radius:6px;cursor:pointer;white-space:nowrap;
                  background:${override ? 'rgba(79,140,255,.18)' : 'rgba(255,255,255,.04)'};
                  border:1px solid ${override ? 'var(--ml-blue)' : 'var(--ml-border)'};
                  color:${override ? 'var(--ml-blue)' : 'var(--ml-text-dim)'};">
                ${esc(effectiveTeam.value)}${override ? ' ✎' : ''}
               </button>`
            : `<button class="ml-override-btn" data-key="${esc(k)}"
                style="font-size:11px;padding:2px 8px;border-radius:6px;cursor:pointer;border:1px dashed var(--ml-border-2);background:transparent;color:var(--ml-text-dim);">
                selecionar ✎
               </button>`;

          const curPrioId = i.priorityId || '';
          const curPrioName = i.priority || '—';

          return `
            <tr data-key="${esc(k)}" style="border-bottom:1px solid var(--ml-border);">
              <td style="padding:6px 8px;width:28px;vertical-align:top;">
                <input type="checkbox" data-key="${esc(k)}" ${selected.has(k) ? 'checked' : ''} style="accent-color:var(--ml-green);transform:scale(1.1);" />
              </td>
              <td style="padding:6px 8px;width:120px;vertical-align:top;">
                <div style="display:flex;align-items:center;gap:4px;">
                  ${typeImg}
                  <a href="${esc(link)}" target="_blank" rel="noopener" style="color:var(--ml-blue);font-family:var(--ml-mono);font-size:12px;text-decoration:none;font-weight:600;">${esc(k)}</a>
                  ${priorityImg}
                </div>
                <div style="margin-top:4px;">${statusPill}</div>
                <button class="rowDetailsBtn" data-key="${esc(k)}" style="margin-top:4px;font-size:10.5px;padding:1px 7px;border-radius:6px;border:1px dashed var(--ml-border-2);background:transparent;color:var(--ml-text-dim);cursor:pointer;">Detalhes</button>
              </td>
              <td style="padding:6px 8px;vertical-align:top;font-size:12px;line-height:1.35;">
                ${esc(summary)}
                ${i.assignee ? `<div style="font-size:10.5px;color:var(--ml-text-dim);margin-top:3px;">Atribuido: ${esc(i.assignee)}</div>` : ''}
              </td>
              <td style="padding:6px 8px;vertical-align:top;width:160px;">${asset}</td>
              <td style="padding:6px 8px;vertical-align:top;width:140px;">${team}</td>
              <td style="padding:6px 8px;vertical-align:top;width:150px;">${destBtn}</td>
            </tr>
            <tr class="rowExpand" data-expand-for="${esc(k)}" style="display:none;border-bottom:1px solid var(--ml-border);background:var(--ml-bg-1,rgba(255,255,255,.02));">
              <td></td>
              <td colspan="5" style="padding:10px 8px;">
                <div style="font-size:11px;color:var(--ml-text-mut);font-weight:700;margin-bottom:4px;">Descrição completa</div>
                <div class="rowFullDesc" style="font-size:12px;line-height:1.5;margin-bottom:10px;white-space:pre-wrap;">carregando...</div>
                <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
                  <div>
                    <div style="font-size:11px;color:var(--ml-text-mut);font-weight:700;margin-bottom:4px;">Localidade</div>
                    <div style="font-size:12px;">${esc(i.asset || '—')}</div>
                  </div>
                  <div>
                    <div style="font-size:11px;color:var(--ml-text-mut);font-weight:700;margin-bottom:4px;">Prioridade</div>
                    <select class="rowPrioSelect" data-key="${esc(k)}" data-cur="${esc(curPrioId)}" style="min-width:140px;background:var(--ml-bg-0);color:var(--ml-text);border:1px solid var(--ml-border-2);border-radius:var(--ml-radius-sm);padding:6px 8px;font-size:12.5px;">
                      <option value="">${esc(curPrioName)} (carregando...)</option>
                    </select>
                  </div>
                  <button class="rowPrioSaveBtn btnSecondary" data-key="${esc(k)}" style="padding:6px 12px;">Salvar prioridade</button>
                  <span class="rowPrioStatus muted" style="font-size:11px;"></span>
                </div>
              </td>
            </tr>
          `;
        }).join('');

        listEl.innerHTML = `
          <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
            <thead>
              <tr style="position:sticky;top:0;background:var(--ml-bg-2);z-index:2;">
                <th style="padding:8px;text-align:left;font-size:11px;color:var(--ml-text-mut);border-bottom:1px solid var(--ml-border);width:28px;"></th>
                <th style="padding:8px;text-align:left;font-size:11px;color:var(--ml-text-mut);border-bottom:1px solid var(--ml-border);">Chave / Status</th>
                <th style="padding:8px;text-align:left;font-size:11px;color:var(--ml-text-mut);border-bottom:1px solid var(--ml-border);">Resumo</th>
                <th style="padding:8px;text-align:left;font-size:11px;color:var(--ml-text-mut);border-bottom:1px solid var(--ml-border);">Localidade</th>
                <th style="padding:8px;text-align:left;font-size:11px;color:var(--ml-text-mut);border-bottom:1px solid var(--ml-border);">Time atual</th>
                <th style="padding:8px;text-align:left;font-size:11px;color:var(--ml-text-mut);border-bottom:1px solid var(--ml-border);">Derivar para ✎</th>
              </tr>
            </thead>
            <tbody>${rows || `<tr><td colspan="6" class="capEmpty" style="padding:20px;text-align:center;">Nenhum chamado bate com o filtro.</td></tr>`}</tbody>
          </table>
        `;

        listEl.querySelectorAll('input[type="checkbox"][data-key]').forEach(cb => {
          cb.addEventListener('change', () => {
            const k = cb.getAttribute('data-key');
            if(cb.checked) selected.add(k); else selected.delete(k);
            updateSelCount();
          });
        });

        // Override de time por ticket: abre mini-picker flutuante
        listEl.querySelectorAll('button.ml-override-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.ml-team-picker-popover').forEach(p => p.remove());
            if(!teams.length){ alert('Aguarde os times carregarem.'); return; }
            const k = btn.getAttribute('data-key');
            const picker = document.createElement('div');
            picker.className = 'ml-team-picker-popover';
            picker.style.cssText = 'position:fixed;z-index:10000020;background:var(--ml-bg-3);border:1px solid var(--ml-border-2);border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:4px;box-shadow:0 8px 28px rgba(0,0,0,.5);min-width:200px;max-height:260px;overflow-y:auto;';
            const rect = btn.getBoundingClientRect();
            picker.style.top = (rect.bottom + 6) + 'px';
            picker.style.left = Math.min(rect.left, window.innerWidth - 220) + 'px';
            // Opção para limpar override (usar global)
            const clearOpt = document.createElement('button');
            clearOpt.textContent = '↩ usar time global';
            clearOpt.style.cssText = 'text-align:left;padding:5px 10px;border-radius:6px;border:none;background:transparent;color:var(--ml-text-dim);cursor:pointer;font-size:12px;';
            clearOpt.onmouseenter = () => clearOpt.style.background = 'var(--ml-bg-2)';
            clearOpt.onmouseleave = () => clearOpt.style.background = 'transparent';
            clearOpt.onclick = () => { delete perTicketTeam[k]; picker.remove(); renderList(); };
            picker.appendChild(clearOpt);
            // Um botão por time disponível
            teams.forEach(t => {
              const tb = document.createElement('button');
              tb.textContent = t.value;
              const isActive = (perTicketTeam[k] || chosenTeam)?.id === t.id;
              tb.style.cssText = `text-align:left;padding:5px 10px;border-radius:6px;border:none;background:${isActive?'var(--ml-blue-soft)':'transparent'};color:${isActive?'var(--ml-blue)':'var(--ml-text)'};cursor:pointer;font-size:12px;font-weight:${isActive?'700':'400'};`;
              tb.onmouseenter = () => { if(!isActive) tb.style.background = 'var(--ml-bg-2)'; };
              tb.onmouseleave = () => { if(!isActive) tb.style.background = 'transparent'; };
              tb.onclick = () => { perTicketTeam[k] = { id: t.id, value: t.value }; picker.remove(); renderList(); };
              picker.appendChild(tb);
            });
            document.body.appendChild(picker);
            // Fecha ao clicar fora
            const closePicker = (ev) => { if(!picker.contains(ev.target)){ picker.remove(); document.removeEventListener('click', closePicker, true); } };
            setTimeout(() => document.addEventListener('click', closePicker, true), 0);
          });
        });

        // "Detalhes" por linha: expande descricao completa + localidade + prioridade editavel.
        listEl.querySelectorAll('button.rowDetailsBtn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const k = btn.getAttribute('data-key');
            const expandRow = listEl.querySelector(`tr.rowExpand[data-expand-for="${CSS.escape(k)}"]`);
            if(!expandRow) return;
            const isOpen = expandRow.style.display !== 'none';
            if(isOpen){ expandRow.style.display = 'none'; return; }
            expandRow.style.display = '';

            const descEl = expandRow.querySelector('.rowFullDesc');
            const sel = expandRow.querySelector('.rowPrioSelect');
            const saveBtn = expandRow.querySelector('.rowPrioSaveBtn');
            const statusEl = expandRow.querySelector('.rowPrioStatus');
            const curPrioId = sel.getAttribute('data-cur') || '';

            // Descricao completa: busca sob demanda (nao vem no batch inicial) e cacheia em info[k].
            if(info[k]?.descriptionText != null){
              descEl.textContent = info[k].descriptionText || '(sem descrição)';
            } else {
              try{
                const data = await getIssueFields(k, ['description']);
                const txt = descriptionToText(data?.fields?.description) || '';
                if(info[k]) info[k].descriptionText = txt;
                descEl.textContent = txt || '(sem descrição)';
              }catch(e){
                descEl.textContent = 'Falha ao carregar descrição: ' + (e.message || e);
              }
            }

            // Select de prioridade
            getAllPriorities().then(list => {
              if(!sel.isConnected) return;
              sel.innerHTML = (list || []).map(p =>
                `<option value="${esc(p.id)}" ${String(p.id) === String(curPrioId) ? 'selected' : ''}>${esc(p.name)}</option>`
              ).join('');
            }).catch(e => {
              console.warn('[IS Toolkit][prioridade] falha ao listar prioridades:', e);
            });

            saveBtn.onclick = async () => {
              const newId = sel.value;
              if(!newId){ statusEl.textContent = 'Escolha uma prioridade.'; return; }
              saveBtn.disabled = true;
              statusEl.textContent = 'Salvando...';
              try{
                await setIssuePriority(k, newId);
                const newName = sel.options[sel.selectedIndex]?.text || '';
                if(info[k]){ info[k].priority = newName; info[k].priorityId = newId; }
                statusEl.textContent = 'Atualizado!';
                setTimeout(() => { statusEl.textContent = ''; renderList(); }, 900);
              }catch(e){
                statusEl.textContent = 'Falha: ' + (e.message || e);
              }finally{
                saveBtn.disabled = false;
              }
            };
          });
        });

        updateGlobalTeamsState();
      }

      async function loadDetails(targetKeys){
        const need = targetKeys.filter(k => !info[k]);
        if(!need.length) return;
        const loadingEl = modal.querySelector('#ml_batch_loading');
        if(loadingEl) loadingEl.style.display = '';
        try{
          const list = await getIssuesBatchInfo(need);
          for(const item of list){ info[item.key] = item; }
          // Marca os que nem voltaram na resposta (existiam mas falharam)
          for(const k of need){ if(!info[k]) info[k] = { key: k, error: 'nao retornou' }; }
          renderList();
        }catch(e){
          console.warn('[jira-localidade][batch] falha ao carregar detalhes:', e);
          for(const k of need){ if(!info[k]) info[k] = { key: k, error: e.message || String(e) }; }
          renderList();
        }finally{
          if(loadingEl) loadingEl.style.display = 'none';
        }
        // Carrega field techs em paralelo (não bloqueia a exibição dos detalhes)
        loadFieldData(targetKeys).catch(()=>{});
      }

      async function loadFieldData(targetKeys){
        try{
          const catalog = await fetchFieldCatalog();
          if(!catalog?.length) return;
          let hasNewAtivos = false;
          for(const k of targetKeys){
            if(ticketFieldTechs[k]) continue; // já carregado
            const asset = info[k]?.asset;
            if(!asset) continue;
            const matches = lookupFieldByLocation(catalog, asset);
            ticketFieldTechs[k] = matches;
            if(matches.some(f => /ativo/i.test(f.status))) hasNewAtivos = true;
          }
          renderList();
          // Auto-sugerir IS-SHIP-FIELDSERVICE se algum ticket tem field tech ativo
          if(hasNewAtivos && !chosenTeam){
            const fsBtn = modal.querySelector('[data-team-name="IS-SHIP-FIELDSERVICE"]');
            if(fsBtn) fsBtn.click();
          }
        }catch(e){
          console.warn('[batch] loadFieldData falhou:', e);
        }
      }

      renderList();
      if(keys.length) loadDetails(keys);

      // Filtro local
      modal.querySelector('#ml_batch_filter').addEventListener('input', (e) => {
        filterText = String(e.target.value || '').trim();
        renderList();
      });

      modal.querySelector('#ml_batch_redetect').onclick = () => {
        const fresh = getQueueKeysFromDom();
        const addedKeys = [];
        for(const k of fresh){
          if(!keys.includes(k)){ keys.push(k); addedKeys.push(k); }
        }
        keys.sort();
        renderList();
        progressLog(`Re-deteccao do DOM: ${fresh.length} encontrados, ${addedKeys.length} adicionados.`);
        if(addedKeys.length){
          loadDetails(addedKeys);
          if(!teams.length) loadTeams();
        }
      };
      modal.querySelector('#ml_batch_clear').onclick = () => {
        if(!keys.length) return;
        if(!confirm(`Limpar lista de ${keys.length} chamado(s)?`)) return;
        keys = []; selected.clear(); info = {}; renderList();
      };
      modal.querySelector('#ml_batch_check_all').onclick   = () => {
        // marca apenas os visiveis no filtro
        const visible = keys.filter(matchesFilter);
        visible.forEach(k => selected.add(k));
        renderList();
      };
      modal.querySelector('#ml_batch_uncheck_all').onclick = () => {
        const visible = keys.filter(matchesFilter);
        visible.forEach(k => selected.delete(k));
        renderList();
      };

      // CARREGAR TIMES (precisa de 1 chamado de exemplo cujo workflow tenha a transicao Derivar).
      // Nem todo projeto tem a transicao (ex: ALM nao tem), entao priorizamos projetos suportados
      // (PROJECTS) e fazemos fallback tentando ate N samples.
      async function loadTeams(){
        if(!keys.length){
          modal.querySelector('#ml_batch_teams').innerHTML = `<span class="muted">Adicione pelo menos 1 chamado de IS/ISS/SSHP para carregar os times.</span>`;
          return;
        }
        // Prioridade para carregar times:
        //   1) IS / SSHP (têm a transição "Derive the other team")
        //   2) outros projetos suportados (ex: ISS — tarefas ISS NÃO têm a transição Derive)
        //   3) demais projetos
        const deriveProjects = PROJECTS.filter(p => p !== 'ISS'); // IS, SSHP, etc.
        const ordered = [...keys].sort((a, b) => {
          const projA = String(a).split('-')[0];
          const projB = String(b).split('-')[0];
          const scoreA = deriveProjects.includes(projA) ? 0 : (PROJECTS.includes(projA) ? 1 : 2);
          const scoreB = deriveProjects.includes(projB) ? 0 : (PROJECTS.includes(projB) ? 1 : 2);
          return scoreA - scoreB;
        });
        modal.querySelector('#ml_batch_teams').innerHTML = `<span class="muted"><span class="mlSpin"></span> Carregando times (tentando ${Math.min(ordered.length, 5)} chamado(s))...</span>`;

        const errors = [];
        // Tenta ate 5 keys diferentes
        for(const sample of ordered.slice(0, 5)){
          try{
            teams = await getDeriveTeamsFromAnyKey(sample);
            renderTeamsBar();
            return;
          }catch(e){
            errors.push(`${sample}: ${e.message || e}`);
          }
        }
        modal.querySelector('#ml_batch_teams').innerHTML = `
          <div class="muted" style="line-height:1.5;">
            Falha ao carregar times. A lista precisa ter ao menos 1 ticket <b>IS</b> ou <b>SSHP</b> (tarefas ISS nao possuem a transicao de Derivar).<br/>
            <details style="margin-top:6px;"><summary style="cursor:pointer;font-size:11px;">Ver detalhes (${errors.length} tentativa(s))</summary>
              <div style="font-family:var(--ml-mono);font-size:10.5px;margin-top:4px;color:#fca5a5;">
                ${errors.map(e => esc(e)).join('<br>')}
              </div>
            </details>
          </div>`;
      }
      loadTeams();

      function renderTeamsBar(){
        const bar = modal.querySelector('#ml_batch_teams');
        bar.innerHTML = teams.map(t => `<button class="teambtn" data-team="${esc(t.id)}" data-team-name="${esc(t.value)}">${esc(t.value)}</button>`).join('');
        bar.querySelectorAll('button.teambtn').forEach(btn => {
          // estilo basico (nao temos a classe teambtn de derive aqui)
          Object.assign(btn.style, {
            background: 'var(--ml-bg-3)', color: 'var(--ml-text)', border: '1px solid var(--ml-border-2)',
            borderRadius: '999px', padding: '6px 12px', cursor: 'pointer', fontWeight: '600', fontSize: '12px'
          });
          btn.onclick = () => {
            chosenTeam = { id: btn.getAttribute('data-team'), value: btn.getAttribute('data-team-name') };
            bar.querySelectorAll('button.teambtn').forEach(b => {
              b.style.background = 'var(--ml-bg-3)'; b.style.borderColor = 'var(--ml-border-2)';
            });
            btn.style.background = 'var(--ml-blue-soft)'; btn.style.borderColor = 'var(--ml-blue)';
            renderList(); // atualiza coluna "Derivar para"
          };
        });
        updateGlobalTeamsState();
      }

      // Quando ha overrides de time por ticket, o "Time de destino" global perde a
      // funcao (cada ticket ja tem seu time). Desativa a barra global e mostra hint.
      function _batchHasOverrides(){ return Object.keys(perTicketTeam).length > 0; }
      function updateGlobalTeamsState(){
        const bar   = modal.querySelector('#ml_batch_teams');
        const label = modal.querySelector('#ml_batch_teams_label');
        const hint  = modal.querySelector('#ml_batch_teams_hint');
        if(!bar) return;
        const off = _batchHasOverrides();
        bar.style.opacity = off ? '.4' : '';
        bar.style.pointerEvents = off ? 'none' : '';
        if(label) label.style.opacity = off ? '.5' : '';
        if(hint) hint.style.display = off ? 'block' : 'none';
      }

      function progressLog(line, color){
        const p = modal.querySelector('#ml_batch_progress');
        const div = document.createElement('div');
        div.style.cssText = `font-family:var(--ml-mono);font-size:12px;padding:4px 0;color:${color || 'var(--ml-text-mut)'};`;
        div.innerHTML = line;
        p.appendChild(div);
        p.scrollTop = p.scrollHeight;
      }

      // EXECUTAR
      modal.querySelector('#ml_batch_run').onclick = async () => {
        const targetKeys = [...selected];
        if(!targetKeys.length) { alert('Selecione pelo menos 1 chamado.'); return; }
        // Time efetivo por ticket (override individual ou global)
        const effectiveTeamFor = k => perTicketTeam[k] || chosenTeam;
        const semTime = targetKeys.filter(k => !effectiveTeamFor(k));
        if(semTime.length){ alert('Selecione o time de destino (global ou individualmente por ticket).'); return; }
        const comment = modal.querySelector('#ml_batch_comment').value || DERIVE_COMMENT_DEFAULT;
        const wantIss = modal.querySelector('#ml_batch_iss_chk').checked;
        const issEligible = wantIss && targetKeys.every(k =>
          (ISS_TASK_TRIGGER_TEAMS || []).map(s => String(s).trim()).includes(String(effectiveTeamFor(k)?.value).trim())
        );

        if(wantIss && !issEligible){
          const ineligibleTeams = [...new Set(targetKeys.map(k => effectiveTeamFor(k)?.value).filter(Boolean))];
          if(!confirm(`Algum(s) time(s) (${ineligibleTeams.join(', ')}) NAO esta(o) na lista ISS_TASK_TRIGGER_TEAMS.\nVamos derivar todos, mas SEM criar ISS. Continuar?`)) return;
        }

        // Preview visual antes de executar
        const previewConfirmed = await new Promise(resolve => {
          const pov = document.createElement('div');
          pov.style.cssText = 'position:fixed;inset:0;background:rgba(4,6,12,.72);backdrop-filter:blur(8px);z-index:10000010;display:flex;align-items:center;justify-content:center;';
          const pbox = document.createElement('div');
          pbox.style.cssText = 'background:linear-gradient(145deg,var(--ml-bg-3),var(--ml-bg-2));color:var(--ml-text);border:1px solid var(--ml-border-2);border-radius:20px;padding:24px 28px;max-width:500px;width:92%;box-shadow:0 20px 60px rgba(0,0,0,.6);font:13px var(--ml-font,-apple-system,BlinkMacSystemFont,sans-serif);';
          const mixedTeams = targetKeys.some(k => perTicketTeam[k]);
          const previewRows = targetKeys.slice(0,8).map(k => {
            const t = effectiveTeamFor(k);
            const ovr = perTicketTeam[k];
            return `<div style="padding:5px 10px;border-radius:8px;background:rgba(255,255,255,.04);margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;gap:8px;"><span style="font-family:var(--ml-mono);font-size:12px;color:var(--ml-text-mut);">${esc(k)}</span>${mixedTeams?`<span style="font-size:10.5px;padding:1px 8px;border-radius:5px;white-space:nowrap;background:${ovr?'rgba(79,140,255,.18)':'rgba(255,255,255,.04)'};color:${ovr?'var(--ml-blue)':'var(--ml-text-dim)'};border:1px solid ${ovr?'var(--ml-blue)':'var(--ml-border)'};">${esc(t?.value||'?')}</span>`:''}</div>`;
          }).join('') + (targetKeys.length>8?`<div style="font-size:11px;color:var(--ml-text-dim);padding:4px 10px;">...e mais ${targetKeys.length-8} ticket(s)</div>`:'');
          const teamsDisplay = mixedTeams ? `<span style="color:var(--ml-text-mut);">times variados por ticket</span>` : `<b>${esc(chosenTeam?.value)}</b>`;
          pbox.innerHTML = `
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--ml-blue);margin-bottom:6px;">Confirmar execucao</div>
            <div style="font-size:18px;font-weight:800;margin-bottom:16px;">${targetKeys.length} ticket(s) serao processados</div>
            <div style="background:rgba(255,255,255,.04);border:1px solid var(--ml-border-2);border-radius:12px;padding:14px;margin-bottom:16px;">
              <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:12.5px;">
                <span style="color:var(--ml-text-dim);">Time(s):</span>${teamsDisplay}
                <span style="color:var(--ml-text-dim);">Comentario:</span><span style="color:var(--ml-text-mut);">${esc(comment.slice(0,80))}${comment.length>80?'...':''}</span>
                ${issEligible?'<span style="color:var(--ml-text-dim);">ISS:</span><span style="color:#86efac;font-weight:600;">1 tarefa por ticket</span>':''}
                ${DERIVE_UNASSIGN_AFTER?'<span style="color:var(--ml-text-dim);">Assignee:</span><span style="color:var(--ml-text-mut);">sera removido</span>':''}
              </div>
            </div>
            <div style="font-size:11.5px;color:var(--ml-text-dim);margin-bottom:8px;">Tickets selecionados:</div>
            <div style="max-height:200px;overflow-y:auto;margin-bottom:18px;">${previewRows}</div>
            <div style="display:flex;gap:10px;justify-content:flex-end;">
              <button id="ml_prev_cancel" style="background:transparent;border:1px solid var(--ml-border-2);color:var(--ml-text-mut);padding:9px 18px;border-radius:10px;cursor:pointer;font:600 13px var(--ml-font);">Cancelar</button>
              <button id="ml_prev_ok" style="background:linear-gradient(135deg,#2ecc71,#27ae60);border:0;color:#fff;padding:9px 22px;border-radius:10px;cursor:pointer;font:700 13px var(--ml-font);box-shadow:0 6px 18px rgba(39,174,96,.35);">Executar agora</button>
            </div>`;
          pov.appendChild(pbox);
          document.body.appendChild(pov);
          pbox.querySelector('#ml_prev_cancel').onclick = ()=>{ pov.remove(); resolve(false); };
          pbox.querySelector('#ml_prev_ok').onclick = ()=>{ pov.remove(); resolve(true); };
          pov.addEventListener('click', e=>{ if(e.target===pov){ pov.remove(); resolve(false); }});
        });
        if(!previewConfirmed) return;

        // Desabilita controles durante execucao
        modal.querySelector('#ml_batch_run').disabled = true;
        modal.querySelector('#ml_batch_run').innerHTML = `<span class="mlSpin"></span> Executando...`;

        const p = modal.querySelector('#ml_batch_progress');
        p.innerHTML = `<div style="font-weight:700;color:var(--ml-text);margin-bottom:8px;">Progresso (0/${targetKeys.length})</div>`;
        const counter = (i) => p.firstChild.textContent = `Progresso (${i}/${targetKeys.length})`;

        // Pega me uma vez (pra unwatch em loop)
        let myAccountId = null;
        if(DERIVE_UNWATCH_AFTER){
          try{
            const me = await jiraGetMyself();
            myAccountId = me?.accountId || null;
          }catch(e){
            progressLog(`<b style="color:#fbbf24;">[AVISO]</b> Falha ao obter /myself - unwatch desabilitado neste lote: ${esc(e.message || e)}`);
          }
        }

        let ok = 0, fail = 0, unwatched = 0;
        const issResults = [];

        for(let i = 0; i < targetKeys.length; i++){
          const key = targetKeys[i];
          const ticketTeam = effectiveTeamFor(key);
          counter(i);
          try{
            const tr = await jiraGetTransitions(key);
            const deriveTr = pickDeriveTransition(tr);
            if(!deriveTr) throw new Error(`Transicao "${DERIVE_TRANSITION_NAME}" nao disponivel`);
            const wantMention = modal.querySelector('#ml_batch_mention_chk')?.checked;
            const isFieldService = /fieldservice/i.test(ticketTeam.value || '');
            let adfOverride = null;
            if(wantMention && isFieldService){
              const locAsset = info[key]?.asset;
              const ftsForKey = locAsset ? (ticketFieldTechs[key] || []).filter(f => /ativo/i.test(f.status)) : [];
              if(ftsForKey.length){
                const resolved = await Promise.all(ftsForKey.map(async ft => {
                  const acct = ft.email ? await jiraResolveEmailToAccount(ft.email) : null;
                  return { displayName: acct?.displayName || ft.nome, accountId: acct?.accountId || null, turno: ft.turno, onShift: isOnShiftNow(ft.horario) };
                }));
                adfOverride = buildAdfWithFieldMentions(comment, resolved);
                progressLog(`     &#8627; <span style="color:#93c5fd;">resolving @mentions para ${resolved.length} field tech(s)...</span>`);
              }
            }
            await jiraDoDerive(key, deriveTr.id, ticketTeam.id, comment, adfOverride);
            // marcação de uso (label + campo texto) agora acontece dentro do próprio jiraDoDerive
            progressLog(`<b style="color:#86efac;">[OK]</b> ${esc(key)} derivado para ${esc(ticketTeam.value)}`);
            ok++;

            // Unassign best-effort (libera ticket pra fila do novo time)
            if(DERIVE_UNASSIGN_AFTER){
              try{
                await jiraUnassign(key);
                progressLog(`     &#8627; <b style="color:#86efac;">[UNASSIGN]</b> assignee removido`);
              }catch(eUa){
                progressLog(`     &#8627; <b style="color:#fbbf24;">[UNASSIGN WARN]</b> ${esc(eUa.message || String(eUa))}`);
              }
            }

            // Unwatch best-effort com retry (Jira pode re-adicionar via auto-watch on comment
            // ou workflow post-function). No lote, usamos delays menores pra nao ficar muito
            // lento - alem de ja agendar uma tentativa tardia (20s) que cobre post-functions lentas.
            if(myAccountId){
              try{
                const res = await jiraUnwatchIssueRobust(key, myAccountId, {
                  initialDelayMs: 400,
                  maxAttempts: 3,
                  delayMs: 900
                });
                if(res.ok){
                  unwatched++;
                  if(res.attempts > 1){
                    progressLog(`     &#8627; <b style="color:#86efac;">[UNWATCH]</b> removido (${res.attempts} tentativa(s) - tentativa tardia agendada)`);
                  }
                } else {
                  progressLog(`     &#8627; <b style="color:#fbbf24;">[UNWATCH WARN]</b> ainda watcher - tentativa tardia (20s) agendada em background`);
                }
              }catch(eUw){
                progressLog(`     &#8627; <b style="color:#fca5a5;">[UNWATCH FAIL]</b> ${esc(eUw.message || String(eUw))}`);
              }
            }

            if(issEligible){
              try{
                const r = await createIssTaskFromIssue(key, () => {}, effectiveTeamFor(key)?.value);
                issResults.push({ key, newKey: r.newKey });
                progressLog(`     &#8627; ISS ${esc(r.newKey)} criada e vinculada (link: <a href="${esc(location.origin + '/browse/' + r.newKey)}" target="_blank" rel="noopener">${esc(r.newKey)}</a>)`, 'var(--ml-text)');
                if(r.commentsReport && r.commentsReport.copied > 0){
                  progressLog(`         &#8627; <b style="color:#86efac;">[COMMENTS]</b> ${r.commentsReport.copied} comentario(s) herdado(s) como digest interno`);
                }
                try{ await addInternalComment(key, `Tarefa de troubleshooting criada e vinculada: ${r.newKey} (${location.origin}/browse/${r.newKey}).`); }catch(_){}
              }catch(eIss){
                progressLog(`     &#8627; <b style="color:#fca5a5;">[ISS FAIL]</b> ${esc(eIss.message || String(eIss))}`);
              }
            }
          }catch(e){
            progressLog(`<b style="color:#fca5a5;">[FAIL]</b> ${esc(key)}: ${esc(e.message || String(e))}`);
            fail++;
          }
          // Rate limiting: evita sobrecarregar a API do Jira em filas grandes
          if(i < targetKeys.length - 1) await new Promise(r => setTimeout(r, 600));
        }
        counter(targetKeys.length);

        const summary = document.createElement('div');
        summary.style.cssText = `margin-top:12px;padding:10px 12px;border-radius:8px;font-weight:700;${
          fail === 0
            ? 'background:var(--ml-green-soft);border:1px solid var(--ml-green);color:#bdf0d2;'
            : 'background:var(--ml-amber-soft);border:1px solid var(--ml-amber);color:#ffeec3;'
        }`;
        summary.innerHTML = `Concluido: <b>${ok}</b> derivado(s)${
          DERIVE_UNWATCH_AFTER && myAccountId ? `, <b>${unwatched}</b> unwatch(s)` : ''
        }${issEligible ? `, <b>${issResults.length}</b> ISS(s) criada(s)` : ''}, <b>${fail}</b> falha(s).`;
        p.appendChild(summary);

        modal.querySelector('#ml_batch_run').innerHTML = 'Executar';
        modal.querySelector('#ml_batch_run').disabled = false;

        // Remove os tickets processados com sucesso da lista — mantém apenas os que falharam
        const failedSet = new Set();
        [...p.querySelectorAll('div')].forEach(d => {
          const m = d.textContent.match(/\[FAIL\]\s+([A-Z][A-Z0-9_]+-\d+)/);
          if(m) failedSet.add(m[1]);
        });
        const processedSet = new Set(targetKeys);
        keys = keys.filter(k => !processedSet.has(k) || failedSet.has(k));
        selected = new Set([...selected].filter(k => failedSet.has(k)));
        renderList();
        if(!keys.length){
          showToast(`${ok} ticket(s) processado(s). Lista limpa.`, 'success', 3000);
        } else if(fail > 0){
          showToast(`${fail} ticket(s) com falha permanecem na lista para nova tentativa.`, 'warn', 4000);
        }

        // Fecha o modal automaticamente quando tudo foi derivado sem falhas — assim o
        // auto-reload/refresh assume a atualizacao da fila. Se houve falha, mantem aberto
        // para nova tentativa dos tickets que permaneceram na lista.
        if(fail === 0){
          setTimeout(() => { try{ close(); }catch(_){} }, 1200);
        }
      };

      // Auditoria em lote — roda o mesmo núcleo do "Auditar" (ticket único) pra cada
      // chamado marcado. NÃO deriva, não muda status: só analisa e salva o resultado
      // (fica disponível no card do ticket e no modo auditoria inline). Não some da
      // lista depois — o chamado normalmente ainda precisa de outra ação (derivar etc.).
      modal.querySelector('#ml_batch_prio_run')?.addEventListener('click', async () => {
        const targetKeys = [...selected];
        if(!targetKeys.length){ alert('Selecione pelo menos 1 chamado.'); return; }

        let priorities = [];
        try{ priorities = await getAllPriorities(); }catch(e){
          alert('Falha ao listar prioridades: ' + (e.message || e));
          return;
        }
        if(!priorities.length){ alert('Nenhuma prioridade encontrada.'); return; }

        const choice = await pickPriorityInteractive(priorities, { count: targetKeys.length });
        if(!choice) return;

        const prioBtn = modal.querySelector('#ml_batch_prio_run');
        const runBtn = modal.querySelector('#ml_batch_run');
        const origLabel = prioBtn.innerHTML;
        prioBtn.disabled = true;
        if(runBtn) runBtn.disabled = true;

        const p = modal.querySelector('#ml_batch_progress');
        p.innerHTML = `<div style="font-weight:700;color:var(--ml-text);margin-bottom:8px;">Aplicando prioridade "${esc(choice.name)}" (0/${targetKeys.length})</div>`;
        const counter = (i) => p.firstChild.textContent = `Aplicando prioridade "${choice.name}" (${i}/${targetKeys.length})`;

        let ok = 0, fail = 0;
        for(let i = 0; i < targetKeys.length; i++){
          const key = targetKeys[i];
          counter(i);
          prioBtn.innerHTML = `<span class="mlSpin"></span> ${key}...`;
          try{
            await setIssuePriority(key, choice.id);
            if(info[key]){ info[key].priority = choice.name; info[key].priorityId = choice.id; }
            progressLog(`<b style="color:#86efac;">[OK]</b> ${esc(key)} &mdash; prioridade agora: <b>${esc(choice.name)}</b>`);
            ok++;
          }catch(e){
            progressLog(`<b style="color:#fca5a5;">[FAIL]</b> ${esc(key)}: ${esc(e.message || String(e))}`);
            fail++;
          }
        }
        counter(targetKeys.length);
        p.insertAdjacentHTML('beforeend', `<div style="margin-top:6px;">Concluído: <b style="color:#86efac;">${ok} OK</b>${fail ? `, <b style="color:#fca5a5;">${fail} falhou</b>` : ''}.</div>`);

        prioBtn.disabled = false;
        if(runBtn) runBtn.disabled = false;
        prioBtn.innerHTML = origLabel;
        renderList();
      });

      modal.querySelector('#ml_batch_audit_run')?.addEventListener('click', async () => {
        if(!SETTINGS.AUDIT_WEBHOOK_URL){
          showToast('Configure o Webhook de auditoria em Configuracoes → Avancado → Integracoes', 'warn');
          return;
        }
        const targetKeys = [...selected];
        if(!targetKeys.length){ alert('Selecione pelo menos 1 chamado.'); return; }
        if(!confirm(`Rodar auditoria por IA em ${targetKeys.length} chamado(s)?\n\nIsso NÃO deriva nem altera o chamado — só analisa e salva o resultado.`)) return;

        const auditBtn = modal.querySelector('#ml_batch_audit_run');
        const runBtn = modal.querySelector('#ml_batch_run');
        const origAuditLabel = auditBtn.innerHTML;
        auditBtn.disabled = true;
        if(runBtn) runBtn.disabled = true;
        auditBtn.innerHTML = `<span class="mlSpin"></span> Auditando...`;

        const p = modal.querySelector('#ml_batch_progress');
        p.innerHTML = `<div style="font-weight:700;color:var(--ml-text);margin-bottom:8px;">Progresso (0/${targetKeys.length})</div>`;
        const counter = (i) => p.firstChild.textContent = `Progresso (${i}/${targetKeys.length})`;

        let okA = 0, failA = 0;
        const scores = [];
        for(let i = 0; i < targetKeys.length; i++){
          const key = targetKeys[i];
          counter(i);
          try{
            const result = await _runAuditCore(key);
            const sc = typeof result?.score === 'number' ? result.score : null;
            if(sc != null) scores.push(sc);
            const scColor = sc == null ? 'var(--ml-text-mut)' : (sc >= 80 ? '#34c578' : sc >= 50 ? '#f59e0b' : '#ef4444');
            progressLog(`<b style="color:#86efac;">[OK]</b> ${esc(key)} &mdash; score <b style="color:${scColor};">${sc ?? '?'}</b>`);
            okA++;
          }catch(e){
            progressLog(`<b style="color:#fca5a5;">[FAIL]</b> ${esc(key)}: ${esc(e.message || String(e))}`);
            failA++;
          }
          // Rate limiting: cada chamada já é pesada (webhook + imagens + retry) — respiro entre tickets
          if(i < targetKeys.length - 1) await new Promise(r => setTimeout(r, 600));
        }
        counter(targetKeys.length);

        const avg = scores.length ? Math.round(scores.reduce((a,b) => a+b, 0) / scores.length) : null;
        const summaryA = document.createElement('div');
        summaryA.style.cssText = `margin-top:12px;padding:10px 12px;border-radius:8px;font-weight:700;${
          failA === 0
            ? 'background:var(--ml-green-soft);border:1px solid var(--ml-green);color:#bdf0d2;'
            : 'background:var(--ml-amber-soft);border:1px solid var(--ml-amber);color:#ffeec3;'
        }`;
        summaryA.innerHTML = `Concluído: <b>${okA}</b> auditado(s)${avg != null ? `, score médio <b>${avg}</b>` : ''}, <b>${failA}</b> falha(s).`;
        p.appendChild(summaryA);

        auditBtn.innerHTML = origAuditLabel;
        auditBtn.disabled = !SETTINGS.AUDIT_WEBHOOK_URL;
        if(runBtn) runBtn.disabled = false;
      });
    }

    // =========================
    // MODO AUDITORIA INLINE
    // Em vez de (ou além de) mostrar o modal, destaca os CAMPOS reais do ticket no
    // Jira com contorno colorido + marcador 💡. Clicar abre um popover com o detalhe
    // e a sugestão, com botões Aplicar (via API REST) e Copiar.
    //   - Título   → summary (aplica fields.summary)
    //   - Descrição→ description (aplica fields.description em ADF)
    //   - Reclassificação → priority
    //   - Demais critérios (evidências, escrita, validação, solução) → agrupados num
    //     painel "checklist" fixo ancorado na caixa de comentário, com Inserir/Copiar
    //     por item e progresso (N/total), pra coaching passo a passo antes de comentar.
    // Lê o resultado da auditoria persistido (_loadAuditGM) — precisa ter auditado antes.
    // Desligado por padrão; um botão flutuante (canto inferior esquerdo) liga/desliga.
    // =========================
    const _AI = { active: false, issueKey: null, markers: [], reposHandler: null };
    const _AI_SEV = { warn: '#f5b301', error: '#ef4444' };

    // Encontra um campo pela label visível (fallback quando o testid muda).
    function _aiFindByLabel(labels){
      const wanted = labels.map(l => l.toLowerCase());
      // Restringe à área principal do ticket — evita casar com labels de tabelas de
      // issues relacionadas/sidebar que também aparecem na página.
      const scope = document.querySelector('main') || document.body;
      const heads = scope.querySelectorAll('h2,h3,label,span,div');
      for(const h of heads){
        const t = (h.textContent || '').trim().toLowerCase();
        if(t.length > 40) continue;
        if(wanted.some(w => t === w || t === w + ':')){
          // sobe até um container razoável (o grupo do campo)
          let c = h;
          for(let i = 0; i < 4 && c.parentElement; i++){ c = c.parentElement; if(c.offsetHeight > 24) break; }
          if(c && c.offsetParent !== null) return c;
        }
      }
      return null;
    }
    function _aiFieldFinders(){
      const q = s => { try{ return document.querySelector(s); }catch(_){ return null; } };
      return {
        summary: () => q('[data-testid="issue.views.issue-base.foundation.summary.heading"]')
          || q('h1[data-testid*="summary"]') || q('main h1') || q('h1'),
        description: () => q('[data-testid="issue.views.field.rich-text.description"]')
          || q('[data-testid*="issue.views.field.rich-text.description"]')
          || q('[data-testid*="description"] .ak-renderer-document')
          || _aiFindByLabel(['descrição','description','descripción']),
        priority: () => q('main [data-testid*="priority"]') || q('[data-testid*="priority"]')
          || _aiFindByLabel(['prioridade','priority','prioridad']),
        comment: () => q('[data-testid="comment-add-button"]')
          || q('[data-testid*="comment"]')
          || _aiFindByLabel(['comentar','comentário','add a comment','adicionar comentário']),
      };
    }

    async function _aiApiPut(issueKey, fields){
      const r = await fetch(`${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ fields })
      });
      if(!r.ok && r.status !== 204){
        const b = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status}: ${b.slice(0,120)}`);
      }
      return true;
    }

    // Aplica a sugestão de um item conforme o tipo. Retorna mensagem de sucesso.
    async function _aiApplyItem(item, issueKey){
      const txt = String(item.suggested_text || '').trim();
      // Marca uso já aqui (fire-and-forget) — cobre também o ramo "comentário", que insere
      // via DOM (_openJiraCommentWithText) e não passa pelas funções de API já instrumentadas.
      _markToolkitUsage(issueKey).catch(()=>{});
      if(item.check === 'Titulo'){
        if(!txt) throw new Error('Sem título sugerido.');
        await _aiApiPut(issueKey, { summary: txt.replace(/\s*\n+\s*/g, ' ').slice(0, 250) });
        return 'Título atualizado no Jira.';
      }
      if(item.check === 'Descricao'){
        if(!txt) throw new Error('Sem descrição sugerida.');
        await _aiApiPut(issueKey, { description: textToAdfParagraphs(txt) });
        return 'Descrição atualizada no Jira.';
      }
      // demais → comentário
      if(txt){ try{ navigator.clipboard.writeText(txt); }catch(_){} _openJiraCommentWithText(txt); }
      return 'Abrindo comentário com a sugestão…';
    }

    function _aiClearPopover(){ document.getElementById('ml_ai_popover')?.remove(); }

    function _aiShowPopover(items, anchorEl, issueKey){
      _aiClearPopover();
      const pop = document.createElement('div');
      pop.id = 'ml_ai_popover';
      pop.style.cssText = 'position:fixed;z-index:2147483600;max-width:380px;width:min(380px,92vw);'
        + 'background:var(--ml-bg-3,#1a2030);'
        + 'color:var(--ml-text,#e6ecf6);border:1px solid var(--ml-border-2,#2a3550);border-radius:12px;'
        + 'box-shadow:0 16px 44px rgba(0,0,0,.55);padding:12px 14px;font:13px var(--ml-font,-apple-system,BlinkMacSystemFont,sans-serif);max-height:70vh;overflow:auto;';
      const rows = items.map((it, i) => {
        const sev = _AI_SEV[it.status] || '#f5b301';
        const hasSug = String(it.suggested_text || '').trim().length > 0;
        const isField = it.check === 'Titulo' || it.check === 'Descricao';
        const applyLabel = isField ? (it.check === 'Titulo' ? 'Aplicar título' : 'Substituir descrição') : 'Inserir comentário';
        return `
          <div style="padding:8px 0;${i < items.length-1 ? 'border-bottom:1px solid var(--ml-border,#232a3a);' : ''}">
            <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px;">
              <span style="width:8px;height:8px;border-radius:50%;background:${sev};flex:0 0 auto;"></span>
              <b style="font-size:12.5px;">${esc(it.check)}</b>
              <span style="font-size:10px;text-transform:uppercase;color:${sev};font-weight:700;">${esc(it.status)}</span>
            </div>
            ${it.detail ? `<div style="font-size:12px;color:var(--ml-text-mut,#aeb9cc);line-height:1.4;margin-bottom:6px;">${esc(it.detail)}</div>` : ''}
            ${it.suggestion ? `<div style="font-size:11.5px;color:var(--ml-text-dim,#8b9ab5);margin-bottom:6px;">💡 ${esc(it.suggestion)}</div>` : ''}
            ${hasSug ? `<div style="font-size:12px;background:var(--ml-bg-0,#0b0e15);border:1px solid var(--ml-border,#232a3a);border-radius:7px;padding:7px 9px;white-space:pre-wrap;margin-bottom:7px;max-height:150px;overflow:auto;">${esc(it.suggested_text)}</div>` : ''}
            <div style="display:flex;gap:6px;">
              ${hasSug ? `<button data-ai-apply="${i}" style="font-size:11px;background:#60a5fa;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;color:#04121f;font-weight:700;">${esc(applyLabel)}</button>` : ''}
              ${hasSug ? `<button data-ai-copy="${i}" style="font-size:11px;background:none;border:1px solid var(--ml-border,#2a3550);border-radius:6px;padding:4px 10px;cursor:pointer;color:var(--ml-text-dim,#8b9ab5);">Copiar</button>` : '<span style="font-size:11px;color:var(--ml-text-dim,#8b9ab5);">Sem texto sugerido.</span>'}
            </div>
          </div>`;
      }).join('');
      pop.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ml-blue,#6aa3ff);">Auditoria &mdash; sugestão</span>
          <button id="ml_ai_pop_close" style="background:none;border:none;color:var(--ml-text-dim,#8b9ab5);font-size:16px;cursor:pointer;line-height:1;">×</button>
        </div>${rows}`;
      document.body.appendChild(pop);

      // posiciona perto do anchor
      const ar = anchorEl.getBoundingClientRect();
      let top = ar.bottom + 8, left = Math.min(ar.left, window.innerWidth - pop.offsetWidth - 12);
      if(top + pop.offsetHeight > window.innerHeight - 8) top = Math.max(8, ar.top - pop.offsetHeight - 8);
      pop.style.top = Math.max(8, top) + 'px';
      pop.style.left = Math.max(8, left) + 'px';

      pop.querySelector('#ml_ai_pop_close').onclick = _aiClearPopover;
      pop.querySelectorAll('[data-ai-copy]').forEach(b => b.onclick = () => {
        const it = items[Number(b.dataset.aiCopy)];
        try{ navigator.clipboard.writeText(String(it.suggested_text || '')); }catch(_){}
        b.textContent = '✓ Copiado'; setTimeout(() => { b.textContent = 'Copiar'; }, 1600);
      });
      pop.querySelectorAll('[data-ai-apply]').forEach(b => b.onclick = async () => {
        const it = items[Number(b.dataset.aiApply)];
        b.disabled = true; const orig = b.textContent; b.textContent = 'Aplicando…';
        try{
          const msg = await _aiApplyItem(it, issueKey);
          showToast('✓ ' + msg, 'success', 3000);
          _aiClearPopover();
        }catch(e){
          b.disabled = false; b.textContent = orig;
          showToast('Erro ao aplicar: ' + (e.message || e), 'error', 5000);
        }
      });
      // fecha ao clicar fora
      setTimeout(() => {
        const off = ev => { if(!pop.contains(ev.target)){ _aiClearPopover(); document.removeEventListener('mousedown', off, true); } };
        document.addEventListener('mousedown', off, true);
      }, 0);
    }

    function _aiAddMarker(target, items, issueKey, label){
      const outline = document.createElement('div');
      const worst = items.some(it => it.status === 'error') ? 'error' : 'warn';
      const sev = _AI_SEV[worst];
      outline.style.cssText = `position:fixed;z-index:2147483590;pointer-events:none;border:2px solid ${sev};border-radius:8px;box-shadow:0 0 0 3px ${sev}22;transition:opacity .1s;`;
      // Marcador com RÓTULO: mostra o critério + um resumo do problema, sem precisar clicar.
      const single = items.length === 1 ? items[0] : null;
      const name = label || (single ? single.check : `${items.length} sugestões`);
      const issueTxt = single ? String(single.suggestion || single.detail || '').replace(/\s+/g,' ').trim() : 'clique para ver';
      const short = issueTxt.slice(0, 48);
      const marker = document.createElement('button');
      marker.style.cssText = `position:fixed;z-index:2147483595;max-width:min(360px,60vw);display:flex;align-items:center;gap:6px;`
        + `padding:3px 10px;border-radius:20px;border:none;background:${sev};color:#0b0e15;`
        + `font:600 11px var(--ml-font,-apple-system,BlinkMacSystemFont,sans-serif);cursor:pointer;`
        + `box-shadow:0 2px 8px rgba(0,0,0,.45);white-space:nowrap;overflow:hidden;`;
      marker.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:#0b0e15;flex:0 0 auto;"></span>`
        + `<b style="font-weight:700;flex:0 0 auto;">${esc(name)}</b>`
        + (short ? `<span style="font-weight:500;opacity:.85;overflow:hidden;text-overflow:ellipsis;">— ${esc(short)}${issueTxt.length>48?'…':''}</span>` : '');
      marker.title = items.map(it => `${it.check}: ${it.suggestion || it.detail || ''}`).join('\n');
      marker.onclick = (e) => { e.stopPropagation(); _aiShowPopover(items, marker, issueKey); };
      document.body.appendChild(outline);
      document.body.appendChild(marker);
      _AI.markers.push({ outline, marker, target, items, issueKey });
    }

    // ---- Checklist de coaching, ancorada na caixa de comentário ----
    // Diferente do popover (que fecha ao aplicar), o painel fica aberto e cada item
    // vira "concluído" conforme é inserido — pra encadear várias inserções sem reabrir nada.
    function _aiCoachProgress(items){
      return `${items.filter(it => it._applied).length}/${items.length}`;
    }
    function _aiCoachRowHtml(it, i){
      const sev = _AI_SEV[it.status] || '#f5b301';
      const hasSug = String(it.suggested_text || '').trim().length > 0;
      const done = !!it._applied;
      return `
        <div style="padding:8px 0;${i > 0 ? 'border-top:1px solid var(--ml-border,#232a3a);' : ''}opacity:${done ? .55 : 1};">
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px;">
            <span style="width:15px;height:15px;border-radius:4px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#0b0e15;border:1.5px solid ${done ? '#34c578' : sev};background:${done ? '#34c578' : 'transparent'};">${done ? '✓' : ''}</span>
            <b style="font-size:12.5px;${done ? 'text-decoration:line-through;' : ''}">${esc(it.check)}</b>
            <span style="font-size:10px;text-transform:uppercase;color:${sev};font-weight:700;">${esc(it.status)}</span>
          </div>
          ${it.detail ? `<div style="font-size:11.5px;color:var(--ml-text-mut,#aeb9cc);line-height:1.4;margin:0 0 6px 22px;">${esc(it.detail)}</div>` : ''}
          ${it.suggestion ? `<div style="font-size:11px;color:var(--ml-text-dim,#8b9ab5);margin:0 0 6px 22px;">💡 ${esc(it.suggestion)}</div>` : ''}
          ${hasSug ? `<div style="font-size:11.5px;background:var(--ml-bg-0,#0b0e15);border:1px solid var(--ml-border,#232a3a);border-radius:7px;padding:6px 8px;white-space:pre-wrap;margin:0 0 6px 22px;max-height:110px;overflow:auto;">${esc(it.suggested_text)}</div>` : ''}
          <div style="display:flex;gap:6px;margin-left:22px;">
            ${hasSug ? `<button data-coach-insert="${i}" ${done ? 'disabled' : ''} style="font-size:11px;background:${done ? '#2a3550' : '#60a5fa'};border:none;border-radius:6px;padding:4px 10px;cursor:${done ? 'default' : 'pointer'};color:${done ? '#8b9ab5' : '#04121f'};font-weight:700;">${done ? '✓ Inserido' : 'Inserir'}</button>` : ''}
            ${hasSug ? `<button data-coach-copy="${i}" style="font-size:11px;background:none;border:1px solid var(--ml-border,#2a3550);border-radius:6px;padding:4px 10px;cursor:pointer;color:var(--ml-text-dim,#8b9ab5);">Copiar</button>` : `<span style="font-size:11px;color:var(--ml-text-dim,#8b9ab5);">Sem texto sugerido.</span>`}
          </div>
        </div>`;
    }
    function _aiBuildCoachPanel(items, issueKey){
      const panel = document.createElement('div');
      panel.style.cssText = 'position:fixed;z-index:2147483595;width:340px;max-width:88vw;'
        + 'background:var(--ml-bg-3,#1a2030);color:var(--ml-text,#e6ecf6);'
        + 'border:1px solid var(--ml-border-2,#2a3550);border-radius:12px;'
        + 'box-shadow:0 16px 44px rgba(0,0,0,.55);font:13px var(--ml-font,-apple-system,BlinkMacSystemFont,sans-serif);'
        + 'max-height:min(60vh,520px);overflow:auto;';
      const renderRows = () => items.map((it, i) => _aiCoachRowHtml(it, i)).join('');
      panel.innerHTML = `
        <details open>
          <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;font-weight:700;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--ml-blue,#6aa3ff);border-bottom:1px solid var(--ml-border,#232a3a);">
            <span>💬 Checklist do comentário</span>
            <span id="ml_coach_progress" style="color:#8b9ab5;font-weight:600;text-transform:none;letter-spacing:0;">${_aiCoachProgress(items)}</span>
          </summary>
          <div id="ml_coach_rows" style="padding:2px 12px 10px;">${renderRows()}</div>
        </details>`;
      function wire(){
        const rowsEl = panel.querySelector('#ml_coach_rows');
        rowsEl.querySelectorAll('[data-coach-copy]').forEach(b => b.onclick = () => {
          const it = items[Number(b.dataset.coachCopy)];
          try{ navigator.clipboard.writeText(String(it.suggested_text || '')); }catch(_){}
          b.textContent = '✓ Copiado'; setTimeout(() => { b.textContent = 'Copiar'; }, 1600);
        });
        rowsEl.querySelectorAll('[data-coach-insert]').forEach(b => b.onclick = () => {
          const it = items[Number(b.dataset.coachInsert)];
          if(it._applied) return;
          const txt = String(it.suggested_text || '').trim();
          if(!txt) return;
          try{ navigator.clipboard.writeText(txt); }catch(_){}
          _openJiraCommentWithText(txt);
          _markToolkitUsage(issueKey).catch(()=>{});
          it._applied = true;
          rowsEl.innerHTML = renderRows();
          const prog = panel.querySelector('#ml_coach_progress');
          if(prog) prog.textContent = _aiCoachProgress(items);
          wire();
        });
      }
      wire();
      return panel;
    }
    function _aiAddCommentCoach(target, items, issueKey){
      const outline = document.createElement('div');
      const worst = items.some(it => it.status === 'error') ? 'error' : 'warn';
      const sev = _AI_SEV[worst];
      outline.style.cssText = `position:fixed;z-index:2147483590;pointer-events:none;border:2px solid ${sev};border-radius:8px;box-shadow:0 0 0 3px ${sev}22;transition:opacity .1s;`;
      const panel = _aiBuildCoachPanel(items, issueKey);
      document.body.appendChild(outline);
      document.body.appendChild(panel);
      _AI.markers.push({ outline, marker: panel, target, items, issueKey, isCoach: true });
    }

    // Reabre o painel grande de auditoria a partir do cache (openModal novo + showAuditPanel).
    // Correto mesmo com o modal antigo ja fechado (o modal do openModal nao tem .open()).
    function _auditReopenPanel(){
      if(!_auditCache) return;
      const c = _auditCache;
      try{
        const m = openModal('IS Toolkit', `Ticket atual: ${c.issueKey}`);
        showAuditPanel(m, c.issueKey, {
          score: c.score, items: c.items,
          closing_comment: c.closingComment || '', summary: c.summary || '',
          comment_reviews: c.commentReviews || [], title_review: c.titleReview || null
        });
      }catch(e){ console.warn('[is-toolkit][audit] reabrir painel falhou:', e); }
    }

    // Banner de veredito no topo + navegacao guiada pelas pendencias.
    function _aiEnsureBanner(score, pendingCount){
      document.getElementById('ml_ai_banner')?.remove();
      const sc = (typeof score === 'number') ? score : null;
      const scColor = sc == null ? '#8b9ab5' : (sc >= 80 ? '#34c578' : sc >= 50 ? '#f59e0b' : '#ef4444');
      const bar = document.createElement('div');
      bar.id = 'ml_ai_banner';
      bar.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483596;'
        + 'display:flex;align-items:center;gap:9px;padding:6px 10px;border-radius:22px;'
        + 'background:#141728;border:1px solid #2a3550;box-shadow:0 6px 20px rgba(0,0,0,.5);'
        + 'font:600 12px var(--ml-font,-apple-system,BlinkMacSystemFont,sans-serif);color:#e6ecf6;';
      bar.innerHTML =
        (sc != null ? `<span style="display:inline-flex;align-items:center;gap:5px;"><b style="color:${scColor};font-size:14px;">${sc}</b><span style="color:#8b9ab5;font-weight:500;">score</span></span><span style="color:#2a3550;">|</span>` : '')
        + `<span style="color:#f59e0b;">&#9888; ${pendingCount} pend&ecirc;ncia${pendingCount > 1 ? 's' : ''}</span>`
        + `<span style="display:inline-flex;align-items:center;gap:2px;">`
        +   `<button id="ml_ai_prev" title="Pend&ecirc;ncia anterior" style="background:none;border:none;color:#8b9ab5;cursor:pointer;font-size:14px;padding:0 4px;">&#9664;</button>`
        +   `<span id="ml_ai_pos" style="color:#8b9ab5;font-weight:500;min-width:36px;text-align:center;">&ndash;/${_AI.markers.length}</span>`
        +   `<button id="ml_ai_next" title="Pr&oacute;xima pend&ecirc;ncia" style="background:none;border:none;color:#e6ecf6;cursor:pointer;font-size:14px;padding:0 4px;">&#9654;</button>`
        + `</span>`
        + `<span style="color:#2a3550;">|</span>`
        + `<button id="ml_ai_panel" style="background:#60a5fa;border:none;border-radius:12px;color:#04121f;font-weight:700;font-size:11px;padding:3px 10px;cursor:pointer;">Ver painel</button>`
        + `<button id="ml_ai_close2" title="Sair do modo auditoria" style="background:none;border:none;color:#8b9ab5;cursor:pointer;font-size:14px;padding:0 2px;">&times;</button>`;
      document.body.appendChild(bar);
      bar.querySelector('#ml_ai_prev').onclick = () => _aiGuidedGo(-1);
      bar.querySelector('#ml_ai_next').onclick = () => _aiGuidedGo(1);
      bar.querySelector('#ml_ai_panel').onclick = () => _auditReopenPanel();
      bar.querySelector('#ml_ai_close2').onclick = () => _aiDisable();
    }

    // Navegacao guiada: pula pra proxima/anterior pendencia, rola pra ela e abre o popover.
    function _aiGuidedGo(dir){
      if(!_AI.markers.length) return;
      let idx = (typeof _AI.guideIdx === 'number') ? _AI.guideIdx : -1;
      idx = (idx + dir + _AI.markers.length) % _AI.markers.length;
      _AI.guideIdx = idx;
      const m = _AI.markers[idx];
      try{ m.target && m.target.scrollIntoView && m.target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }catch(_){}
      setTimeout(() => {
        _aiReposition();
        if(m.isCoach){
          // Checklist já fica visível por padrão — só dá um "flash" pra chamar atenção.
          m.marker.style.transition = 'box-shadow .25s ease';
          m.marker.style.boxShadow = '0 0 0 3px #60a5fa88, 0 16px 44px rgba(0,0,0,.55)';
          setTimeout(() => { m.marker.style.boxShadow = '0 16px 44px rgba(0,0,0,.55)'; }, 900);
        } else {
          try{ _aiShowPopover(m.items, m.marker, m.issueKey); }catch(_){}
        }
      }, 360);
      const pos = document.getElementById('ml_ai_pos');
      if(pos) pos.textContent = `${idx + 1}/${_AI.markers.length}`;
    }

    function _aiReposition(){
      _AI.markers.forEach(m => {
        const r = m.target && m.target.getBoundingClientRect ? m.target.getBoundingClientRect() : null;
        const vis = r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
        if(!vis){ m.outline.style.display = 'none'; m.marker.style.display = 'none'; return; }
        m.outline.style.display = ''; m.marker.style.display = m.isCoach ? 'block' : 'flex';
        m.outline.style.top = r.top + 'px'; m.outline.style.left = r.left + 'px';
        m.outline.style.width = r.width + 'px'; m.outline.style.height = r.height + 'px';
        if(m.isCoach){
          // Painel-checklist: ancora ao lado do campo (direita, senão esquerda), nunca sobrepondo.
          const mw = m.marker.offsetWidth || 340;
          const mh = m.marker.offsetHeight || 200;
          let left = r.right + 12;
          if(left + mw > window.innerWidth - 6) left = r.left - mw - 12;
          if(left < 6) left = Math.max(6, window.innerWidth - mw - 6);
          let top = r.top;
          if(top + mh > window.innerHeight - 8) top = Math.max(8, window.innerHeight - mh - 8);
          m.marker.style.top = top + 'px';
          m.marker.style.left = left + 'px';
          return;
        }
        // Pílula ancorada logo acima da borda superior do campo (cai pra dentro se não couber).
        const mh = m.marker.offsetHeight || 22;
        const mw = m.marker.offsetWidth || 140;
        let top = r.top - mh - 2;
        if(top < 4) top = r.top + 2;
        let left = r.left;
        if(left + mw > window.innerWidth - 6) left = Math.max(6, window.innerWidth - mw - 6);
        m.marker.style.top = top + 'px';
        m.marker.style.left = left + 'px';
      });
    }
    function _aiAttachReposition(){
      if(_AI.reposHandler) return;
      _AI.reposHandler = () => _aiReposition();
      window.addEventListener('scroll', _AI.reposHandler, true);
      window.addEventListener('resize', _AI.reposHandler);
    }
    function _aiClear(){
      _aiClearPopover();
      document.getElementById('ml_ai_banner')?.remove();
      _AI.markers.forEach(m => { m.outline.remove(); m.marker.remove(); });
      _AI.markers = [];
      _AI.guideIdx = -1;
      if(_AI.reposHandler){
        window.removeEventListener('scroll', _AI.reposHandler, true);
        window.removeEventListener('resize', _AI.reposHandler);
        _AI.reposHandler = null;
      }
    }
    function _aiDisable(){
      _AI.active = false; _AI.issueKey = null;
      _aiClear();
      _aiUpdateToggle();
    }
    function _aiEnable(issueKey){
      const saved = _loadAuditGM(issueKey);
      const audit = saved || (_auditCache && _auditCache.issueKey === issueKey
        ? { items: _auditCache.items, title_review: _auditCache.titleReview } : null);
      if(!audit){ showToast('Rode a auditoria primeiro (botão "Auditar" no ticket).', 'warn', 4500); return false; }
      const items = Array.isArray(audit.items) ? audit.items.map(x => ({ ...x })) : [];
      const tr = audit.title_review || audit.titleReview;
      if(tr && (tr.status === 'warn' || tr.status === 'error')){
        items.push({ check: 'Titulo', status: tr.status, detail: tr.detail, suggestion: tr.suggestion, suggested_text: tr.suggested_text });
      }
      const flagged = items.filter(it => it.status === 'warn' || it.status === 'error');
      if(!flagged.length){ showToast('Auditoria sem pendências pra destacar.', 'info', 3500); return false; }

      _aiClear();
      _AI.active = true; _AI.issueKey = issueKey;
      const fieldMap = { Titulo: 'summary', Descricao: 'description', Reclassificacao: 'priority' };
      const finders = _aiFieldFinders();
      const commentItems = [];
      flagged.forEach(it => {
        const kind = fieldMap[it.check];
        const target = kind ? finders[kind]() : null;
        if(kind && target) _aiAddMarker(target, [it], issueKey);
        else commentItems.push(it);
      });
      if(commentItems.length){
        const ct = finders.comment() || document.querySelector('main') || document.body;
        _aiAddCommentCoach(ct, commentItems, issueKey);
      }
      _aiAttachReposition();
      _aiReposition();
      _AI.guideIdx = -1;
      const _score = (typeof (saved && saved.score) === 'number') ? saved.score
        : ((_auditCache && _auditCache.issueKey === issueKey && typeof _auditCache.score === 'number') ? _auditCache.score : null);
      _aiEnsureBanner(_score, flagged.length);
      _aiUpdateToggle();
      showToast('Modo auditoria ligado — use ◀ ▶ no topo pra navegar pelas pendências.', 'success', 3500);
      return true;
    }

    function _aiUpdateToggle(){
      const b = document.getElementById('ml_ai_toggle');
      if(!b) return;
      if(_AI.active){
        b.textContent = '✕ Sair do modo auditoria';
        b.style.background = 'linear-gradient(135deg,#b45309,#92400e)';
      } else {
        b.textContent = '🎯 Auditar campos';
        b.style.background = 'linear-gradient(135deg,#7c3aed,#5b21b6)';
      }
    }
    function _aiEnsureToggle(){
      const key = getIssueKey();
      const hasAudit = !!(key && (_loadAuditGM(key) || (_auditCache && _auditCache.issueKey === key)));
      // Se trocou de ticket enquanto ativo, limpa os marcadores do anterior.
      if(_AI.active && _AI.issueKey && _AI.issueKey !== key) _aiDisable();
      let b = document.getElementById('ml_ai_toggle');
      if(!hasAudit){ b?.remove(); return; }
      if(!b){
        b = document.createElement('button');
        b.id = 'ml_ai_toggle';
        b.style.cssText = [
          'position:fixed;left:20px;bottom:20px;z-index:9999996;',
          'min-width:60px;height:34px;padding:0 14px;border:none;border-radius:var(--ml-radius-pill,999px);',
          'color:#fff;font:700 12px var(--ml-font,-apple-system,BlinkMacSystemFont,sans-serif);',
          'cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.4);display:flex;align-items:center;gap:6px;',
          'transition:transform .15s ease,filter .15s ease;',
        ].join('');
        b.onmouseenter = () => { b.style.transform = 'translateY(-2px)'; b.style.filter = 'brightness(1.12)'; };
        b.onmouseleave = () => { b.style.transform = ''; b.style.filter = ''; };
        b.addEventListener('click', () => {
          if(_AI.active) _aiDisable();
          else _aiEnable(getIssueKey());
        });
        document.body.appendChild(b);
      }
      _aiUpdateToggle();
    }

    // ============= HOTKEYS =============
    // Alt+A → atribuir ticket atual para mim
    // Cache do usuário logado (evita chamar /myself toda vez)
    let _cachedMe = null;
    async function _getMe(){
      if(_cachedMe) return _cachedMe;
      const r = await fetch(`${location.origin}/rest/api/3/myself`, {
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
      });
      if(!r.ok) throw new Error(`Falha ao buscar usuário logado: HTTP ${r.status}`);
      _cachedMe = await r.json();
      return _cachedMe;
    }

    async function _assignToMe(issueKey){
      const me = await _getMe();
      const r = await fetch(`${location.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ fields: { assignee: { accountId: me.accountId } } })
      });
      if(!r.ok && r.status !== 204){
        const body = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status}: ${body.slice(0, 120)}`);
      }
      return me;
    }

    async function _transitionToInProgress(issueKey, me){
      const data = await jiraGetTransitions(issueKey);
      const transitions = data.transitions || [];
      const IN_PROGRESS_NAMES = /^(in progress|em andamento|em atendimento|iniciar|start|iniciar atendimento|in_progress)$/i;
      const tr = transitions.find(t => IN_PROGRESS_NAMES.test((t.name || '').trim()))
              || transitions.find(t => /(progress|andamento|atendimento)/i.test(t.name || ''));
      if(!tr) throw new Error(`Transição "In Progress" não encontrada. Disponíveis: ${transitions.map(t=>t.name).join(', ')}`);

      // Monta campos obrigatórios automaticamente
      const requiredFields = tr.fields || {};
      const extraFields = {};
      for(const [key, meta] of Object.entries(requiredFields)){
        if(key === 'comment') continue; // comentário vai no update
        // Só mexe em campos realmente obrigatórios da transição. Campos opcionais
        // (como Prioridade, que costuma aparecer na tela mas não é required) NÃO
        // devem ser tocados, senão o atalho sobrescreve valores já definidos.
        if(meta?.required !== true) continue;
        const type = meta?.schema?.type || '';
        const label = meta?.name || key;
        // Nunca sobrescreve Prioridade / Resolution, mesmo que venham como required
        // na tela de transição — não é o que o atalho "assumir ticket" deve fazer.
        if(key === 'priority' || key === 'resolution' || type === 'priority' || type === 'resolution'){
          continue;
        }
        // Campo de usuário/responsável → preenche com o analista logado
        if(type === 'user' || /respons|assign/i.test(label)){
          extraFields[key] = { accountId: me.accountId };
        }
        // Campo de opção com allowedValues → pega o primeiro
        else if(Array.isArray(meta?.allowedValues) && meta.allowedValues.length){
          const first = meta.allowedValues[0];
          extraFields[key] = { id: String(first.id || first.value || '') };
        }
      }

      const commentText = _applyMyNamePlaceholder((SETTINGS.ASSIGN_COMMENT || DEFAULTS.ASSIGN_COMMENT || 'Iniciando atendimento.').trim(), me);
      await jiraApplyTransitionWithFields(issueKey, tr.id, {
        commentText,
        internal: false,
        fields: extraFields
      });
      return tr.name;
    }

    document.addEventListener('keydown', async (e) => {
      // Ignora se foco estiver em campo de texto
      const tag = document.activeElement?.tagName?.toLowerCase();
      if(tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;

      // Cmd+Shift+A → atribuir pra mim + mover para In Progress
      if(_parsedAssignShortcut && matchesShortcut(e, _parsedAssignShortcut)){
        const issueKey = getIssueKey();
        if(!issueKey){
          showToast('Nenhum ticket aberto.', 'warn', 3000);
          return;
        }
        e.preventDefault();
        showToast('Atribuindo e movendo para In Progress...', 'info', 2500);
        try{
          // Busca usuário logado primeiro (necessário para preencher campo responsável na transição).
          // Atribui e SÓ DEPOIS transiciona (sequencial, não Promise.all) — as duas chamadas
          // escrevem no mesmo issue por endpoints diferentes; em paralelo corre risco de race.
          const me = await _getMe();
          await _assignToMe(issueKey);
          const trName = await _transitionToInProgress(issueKey, me);
          showToast(`✓ Atribuído a ${me.displayName} · ${trName}. Recarregando...`, 'success', 2000);
          setTimeout(() => location.reload(), 2000);
        }catch(err){
          showToast('Erro: ' + (err.message || String(err)), 'error', 6000);
        }
      }
    }, true);

  })();