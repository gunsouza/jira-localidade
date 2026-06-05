(function () {
  'use strict';
  // =========================
  // SETTINGS storage (localStorage da origem do Jira)
  // Definido antes de 10-config.js para que loadSettings esteja disponivel
  // no momento em que as constantes globais de config sao avaliadas.
  // =========================
  function loadSettings(defaults){
    try{
      const raw = localStorage.getItem('ml_loc_settings_v1');
      const stored = raw ? JSON.parse(raw) : {};
      if(!stored || typeof stored !== 'object') return { ...defaults };
      return { ...defaults, ...stored };
    }catch{
      return { ...defaults };
    }
  }

  function saveSettings(values){
    try{
      localStorage.setItem('ml_loc_settings_v1', JSON.stringify(values || {}));
      return true;
    }catch{
      return false;
    }
  }

  function resetSettings(){
    try{ localStorage.removeItem('ml_loc_settings_v1'); }catch{}
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
      "IS-SHIP-SE-N2"
    ],

    // Atalhos de teclado para abrir/fechar o popup. Aceita varios em paralelo
    // (assim o mesmo build funciona pro Windows e pro Mac sem ajuste).
    // No Mac: Alt = Option (mesma tecla fisica). Cmd = Meta.
    // Defaults sem conflito com Chrome DevTools no Mac.
    SHORTCUTS: ['Alt+L', 'Cmd+Shift+L', 'Ctrl+Shift+L'],
    SHORTCUT: 'Alt+L', // legacy

    // ---- Criar tarefa ISS (checkbox que aparece no Derive quando o time selecionado esta em ISS_TASK_TRIGGER_TEAMS) ----
    // Vazio = checkbox nunca aparece. Configure em Configuracoes -> "Criar tarefa ISS".
    ISS_TASK_TRIGGER_TEAMS: ["IS-SHIP-SE-N2"],
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
          // Tickets de "Botao de Panico" sao identificados pelo Object Type.
          // (Object Origin = Seguridad Electronica e mais generico - cobre toda a familia)
          { field: 'Object Type', value: 'Boton de panico' }
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

    // ---- LEGACY (mantido pra migracao automatica de versoes < 1.16) ----
    // Se STATUS_ACTIONS estiver vazio e existirem essas keys antigas, migramos pra 1 acao.
    ASSIGN_AND_START_TRANSITION: '',
    ASSIGN_AND_START_COMMENT: 'Atendimento iniciado.',
    ASSIGN_AND_START_COMMENT_INTERNAL: false,
    ASSIGN_AND_START_SHORTCUTS: ['Alt+I', 'Cmd+Shift+E', 'Ctrl+Shift+I'],

    // ---- Comentario rapido com snippet (1 click) ----
    // Cmd+Shift+C conflita com inspect element do DevTools no Mac, entao usamos Cmd+Shift+K.
    QUICK_COMMENT_SHORTCUTS: ['Alt+C', 'Cmd+Shift+K', 'Ctrl+Shift+K']
  };

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

  const DESC_PREVIEW_LEN = SETTINGS.DESC_PREVIEW_LEN;
  const DUP_LABEL_MAX_TOKENS = SETTINGS.DUP_LABEL_MAX_TOKENS;

  const CACHE_TTL_MS = SETTINGS.CACHE_TTL_MS;

  const DERIVE_TRANSITION_NAME = SETTINGS.DERIVE_TRANSITION_NAME;
  const DERIVE_COMMENT_DEFAULT = SETTINGS.DERIVE_COMMENT_DEFAULT;
  // Default true. Se nunca setou, undefined -> true; se setou false, respeita.
  const DERIVE_UNWATCH_AFTER = (SETTINGS.DERIVE_UNWATCH_AFTER !== false);
  const DERIVE_UNASSIGN_AFTER = (SETTINGS.DERIVE_UNASSIGN_AFTER !== false);
  const DERIVE_TEAMS_ALLOWLIST = Array.isArray(SETTINGS.DERIVE_TEAMS_ALLOWLIST) && SETTINGS.DERIVE_TEAMS_ALLOWLIST.length
    ? SETTINGS.DERIVE_TEAMS_ALLOWLIST
    : DEFAULTS.DERIVE_TEAMS_ALLOWLIST;

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

  const ISS_TASK_TRIGGER_TEAMS = Array.isArray(SETTINGS.ISS_TASK_TRIGGER_TEAMS) ? SETTINGS.ISS_TASK_TRIGGER_TEAMS : [];
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
  //   - Senao, tenta migracao da config legada (ASSIGN_AND_START_*).
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

    // Migration: se vazia e existem chaves legadas com transicao, cria 1 entry.
    if(!arr.length){
      const legacyTr = String(SETTINGS.ASSIGN_AND_START_TRANSITION || '').trim();
      if(legacyTr){
        arr.push({
          label:      legacyTr,
          transition: legacyTr,
          comment:    String(SETTINGS.ASSIGN_AND_START_COMMENT || 'Atendimento iniciado.'),
          internal:   SETTINGS.ASSIGN_AND_START_COMMENT_INTERNAL === true,
          assignToMe: true
        });
      }
    }
    // Fallback final: usa DEFAULTS.STATUS_ACTIONS (lista padrao do admin)
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
    const arr = SETTINGS.STATUS_MENU_SHORTCUTS || SETTINGS.ASSIGN_AND_START_SHORTCUTS;
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
  function ensureStyle() {
    if (document.getElementById(IDS.style)) return;
    const st = document.createElement('style');
    st.id = IDS.style;
    st.textContent = `
      /* ============= TOKENS ============= */
      :root {
        --ml-bg-0:      #0c0e12;
        --ml-bg-1:      #121419;
        --ml-bg-2:      #181a20;
        --ml-bg-3:      #1f2229;
        --ml-bg-4:      #262932;

        --ml-border:    #2a2d36;
        --ml-border-2:  #353945;
        --ml-border-hi: #4b5160;

        --ml-text:      #eef0f4;
        --ml-text-mut:  #b6bcc7;
        --ml-text-dim:  #8a90a0;

        --ml-blue:      #5b8def;
        --ml-blue-2:    #4a7ce0;
        --ml-blue-soft: rgba(91,141,239,.14);
        --ml-blue-line: rgba(91,141,239,.45);

        --ml-green:     #34c578;
        --ml-green-soft:rgba(52,197,120,.14);
        --ml-amber:     #f4b942;
        --ml-amber-soft:rgba(244,185,66,.14);
        --ml-red:       #ef5b5b;
        --ml-red-soft:  rgba(239,91,91,.14);

        --ml-radius-sm: 8px;
        --ml-radius:    12px;
        --ml-radius-lg: 16px;
        --ml-radius-xl: 20px;

        --ml-shadow-sm: 0 2px 8px rgba(0,0,0,.30);
        --ml-shadow:    0 10px 28px rgba(0,0,0,.45);
        --ml-shadow-lg: 0 24px 60px rgba(0,0,0,.55);

        --ml-font: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        --ml-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Roboto Mono", monospace;
      }

      /* ============= BOTAO FLUTUANTE ============= */
      #${IDS.btn}{
        position:fixed; right:20px; bottom:20px; z-index:9999997;
        background: linear-gradient(135deg, var(--ml-blue), var(--ml-blue-2));
        color:#fff; border:0; border-radius:999px;
        padding:11px 18px; font-weight:700; cursor:pointer;
        box-shadow: 0 12px 28px rgba(91,141,239,.35), 0 4px 10px rgba(0,0,0,.30);
        font-family: var(--ml-font); font-size: 13px; letter-spacing:.2px;
        transition: transform .15s ease, box-shadow .2s ease, filter .15s ease;
      }
      #${IDS.btn}:hover{ transform: translateY(-1px); filter: brightness(1.08); box-shadow: 0 16px 36px rgba(91,141,239,.45), 0 6px 14px rgba(0,0,0,.35); }
      #${IDS.btn}:active{ transform: translateY(0); }

      /* ============= OVERLAY + MODAL BASE ============= */
      #${IDS.overlay}, #${IDS.dOverlay}, #${IDS.sOverlay}, .mlCapOverlay {
        position:fixed; inset:0;
        background: rgba(6,8,12,.55);
        backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        z-index: 9999998;
      }
      #${IDS.dOverlay}, #${IDS.sOverlay}, .mlCapOverlay { z-index: 10000000; }

      #${IDS.modal}, #${IDS.dModal}, #${IDS.sModal}, .mlCapModal {
        position:fixed; left:50%; transform: translateX(-50%);
        background: var(--ml-bg-1); color: var(--ml-text);
        border: 1px solid var(--ml-border);
        border-radius: var(--ml-radius-xl);
        box-shadow: var(--ml-shadow-lg);
        font-family: var(--ml-font);
        overflow: hidden;
        animation: mlPop .18s cubic-bezier(.16,.84,.44,1);
      }
      @keyframes mlPop { from { opacity: 0; transform: translate(-50%, 4px) scale(.985); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }

      #${IDS.modal}  { top: 5vh; width: min(1120px, 95vw); max-height: 90vh; z-index: 9999999; display:flex; flex-direction:column; }
      #${IDS.dModal} { top:10vh; width: min( 740px, 92vw); max-height: 80vh; z-index:10000001; display:flex; flex-direction:column; }
      #${IDS.sModal} { top: 5vh; width: min( 860px, 95vw); max-height: 90vh; z-index:10000001; display:flex; flex-direction:column; }
      .mlCapModal    { top: 4vh; width: min(1040px, 96vw); max-height: 92vh; z-index:10000001; display:flex; flex-direction:column; }

      /* ============= HEADER COMUM ============= */
      #${IDS.modal} .h, #${IDS.dModal} .dh, #${IDS.sModal} .sh, .mlCapModal .ch {
        display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
        padding: 18px 22px;
        flex-shrink: 0; /* nao encolhe quando o modal fica cheio */
        background: linear-gradient(180deg, var(--ml-bg-2), var(--ml-bg-1) 90%);
        border-bottom: 1px solid var(--ml-border);
        flex-shrink: 0;
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
      .mlBtn, #${IDS.modal} button, #${IDS.dModal} button, #${IDS.sModal} button, .mlCapModal button {
        background: var(--ml-bg-3); color: var(--ml-text); border: 1px solid var(--ml-border-2);
        border-radius: var(--ml-radius-sm); padding: 8px 14px; font-weight: 600;
        cursor: pointer; font-family: var(--ml-font); font-size: 13px;
        transition: background .15s ease, border-color .15s ease, transform .1s ease, box-shadow .15s ease;
      }
      .mlBtn:hover, #${IDS.modal} button:hover, #${IDS.dModal} button:hover, #${IDS.sModal} button:hover, .mlCapModal button:hover {
        background: var(--ml-bg-4); border-color: var(--ml-border-hi);
      }
      .mlBtn:active, #${IDS.modal} button:active, #${IDS.dModal} button:active, #${IDS.sModal} button:active, .mlCapModal button:active { transform: translateY(1px); }

      .primary, #${IDS.modal} .primary, #${IDS.dModal} .btnPrimary, #${IDS.sModal} .primary, .mlCapModal .btnPrimary {
        background: var(--ml-blue); border-color: transparent; color: #fff;
        box-shadow: 0 4px 12px rgba(91,141,239,.30);
      }
      .primary:hover, #${IDS.modal} .primary:hover, #${IDS.dModal} .btnPrimary:hover, #${IDS.sModal} .primary:hover, .mlCapModal .btnPrimary:hover {
        background: var(--ml-blue-2); border-color: transparent;
        box-shadow: 0 6px 16px rgba(91,141,239,.42);
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
      @media (min-width: 760px){ #${IDS.modal} .homeGrid{ grid-template-columns: 1fr 1fr; } }
      @media (min-width:1000px){ #${IDS.modal} .homeGrid{ grid-template-columns: 1fr 1fr 1fr; } }

      #${IDS.modal} .homeCard {
        position: relative;
        border: 1px solid var(--ml-border);
        border-radius: var(--ml-radius-lg);
        padding: 18px;
        background: linear-gradient(180deg, var(--ml-bg-2), var(--ml-bg-1));
        display: flex; flex-direction: column; gap: 8px;
        transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
      }
      #${IDS.modal} .homeCard:hover {
        transform: translateY(-2px);
        border-color: var(--ml-blue-line);
        box-shadow: 0 12px 28px rgba(0,0,0,.30), 0 0 0 1px var(--ml-blue-soft) inset;
      }
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
      #${IDS.modal} .chip {
        display:inline-flex; align-items:center; gap:6px;
        padding: 5px 12px; border-radius: 999px;
        background: var(--ml-bg-3); border:1px solid var(--ml-border-2);
        color: var(--ml-text); font-size: 12px; font-weight: 600; cursor: pointer; user-select: none;
        transition: all .15s ease;
      }
      #${IDS.modal} .chip:hover { border-color: var(--ml-blue); color:#fff; }
      #${IDS.modal} .chip.active { background: var(--ml-blue-soft); border-color: var(--ml-blue); color:#cfe1ff; }
      #${IDS.modal} .chip.clear  { background: var(--ml-red-soft); border-color: var(--ml-red); color:#ffcfcf; }

      #${IDS.modal} .list { padding: 0; }
      #${IDS.modal} .card {
        border: 1px solid var(--ml-border); border-radius: var(--ml-radius);
        padding: 12px 14px; margin-bottom: 10px;
        background: var(--ml-bg-2);
        transition: border-color .15s, transform .12s, box-shadow .15s;
      }
      #${IDS.modal} .card:hover { border-color: var(--ml-blue-line); transform: translateY(-1px); }
      #${IDS.modal} .card.sel  { border-color: var(--ml-blue); box-shadow: 0 0 0 2px var(--ml-blue-soft) inset; }

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
        border-radius: 50%; animation: mlSpin .8s linear infinite; vertical-align: middle;
      }
      @keyframes mlSpin { to { transform: rotate(360deg); } }
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
      fields: ["summary","description","assignee","issuetype","project","updated", `customfield_${CF_RES_TEAM}`]
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

    const selbRe = /\bSELB\b/gi;
    if(selbRe.test(t)) found.push({ type:'SELB', value:'SELB', weight: 2 });

    const serialLabelRe = /\b(?:S\/N|SN|N\/S|SERIAL(?:\s*NUMBER)?)[\s:#-]*([A-Z0-9]{6,24})\b/gi;
    for(const m of t.matchAll(serialLabelRe)){
      const s = m[1].toUpperCase();
      if(s.length >= 8) found.push({ type:'serial', value: s, weight: 7 });
    }

    const strongTokenRe = /\b[A-Z0-9]{10,24}\b/g;
    const up = t.toUpperCase();
    for(const m of up.matchAll(strongTokenRe)){
      const tok = m[0];
      if(/^\d+$/.test(tok)) continue;
      if((tok.match(/[A-Z]/g) || []).length < 2) continue;
      if((tok.match(/\d/g) || []).length < 2) continue;
      if(/^[0-9A-F]{12}$/.test(tok)) continue;
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

  function openDeriveModal({ teams, onSubmit, suggestedTeamValue }) {
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
        alert('Selecione um time.');
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
        alert('Erro ao derivar: ' + (e.message || e));
      }
    });

    document.body.appendChild(overlay);
    document.body.appendChild(modal);
  }

  // Toast de sucesso pos-derive. Non-blocking (nao trava UI como alert()).
  // Mensagem pode ser multilinha (\n vira <br>).
  function showDeriveSuccessToast(msg){
    try{
      document.getElementById('ml_derive_toast')?.remove();
      const t = document.createElement('div');
      t.id = 'ml_derive_toast';
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
      document.body.appendChild(t);
    }catch(_){}
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

  async function jiraDoDerive(issueKey, transitionId, teamOptionId, internalCommentText) {
    const url = `${location.origin}/rest/api/3/issue/${issueKey}/transitions`;

    const payload = {
      transition: { id: String(transitionId) },
      fields: {
        [`customfield_${CF_RES_TEAM}`]: { id: String(teamOptionId) }
      },
      update: {
        comment: [{
          add: {
            body: textToAdfParagraphs(internalCommentText),
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
    return true;
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

  async function openDeriveFlow(issueKey) {
    try{
      const tr = await jiraGetTransitions(issueKey);
      const deriveTr = pickDeriveTransition(tr);
      if(!deriveTr){
        alert(`Transição "${DERIVE_TRANSITION_NAME}" não encontrada para este ticket.`);
        return;
      }
      const allowed = getAllowedResolutionTeams(deriveTr);
      const teams = filterTeamsAllowlist(allowed);
      if(!teams.length){
        alert('Nenhum time allowlist disponível nesta transição (verifique nomes).');
        return;
      }

      // Calcula sugestao de time baseada no summary + description (best-effort).
      let suggestedTeamValue = null;
      try{
        const issue = await getIssueFields(issueKey, ['summary', 'description']);
        const summary = String(issue?.fields?.summary || '');
        const descText = descriptionToText(issue?.fields?.description) || '';
        suggestedTeamValue = suggestTeamForText(`${summary}\n${descText}`);
        // Garante que o time sugerido esta na lista filtrada (allowlist)
        if(suggestedTeamValue && !teams.find(t => t.value === suggestedTeamValue)){
          suggestedTeamValue = null;
        }
      }catch(e){ console.warn('[jira-localidade] sugestao de time falhou:', e); }

      openDeriveModal({
        teams,
        suggestedTeamValue,
        onSubmit: async ({ team, comment, createIssTask }) => {
          // 1) Derivar primeiro (fonte da verdade). Se falhar, lanca erro pro
          // handler do botao reabilitar a UI e mostrar mensagem.
          await jiraDoDerive(issueKey, deriveTr.id, team.id, comment || DERIVE_COMMENT_DEFAULT);

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
            const { newKey, linkType, attachmentsReport, commentsReport, descReport, template } = await createIssTaskFromIssue(issueKey);
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

            // Abre ISS em nova aba imediatamente (sem confirm bloqueante)
            window.open(link, '_blank', 'noopener');
            showDeriveSuccessToast(`Derivado + ISS ${newKey} criada${extrasTxt}. Aberta em nova aba.${tmplLine}`);
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
    const url = `${location.origin}/rest/api/3/issue?updateHistory=true&applyDefaultValues=false`;
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
      const headerLine = `[${idx + 1}] ${author} - ${when} [${visibility}]`;

      content.push({
        type: 'heading', attrs: { level: 4 },
        content: [{ type: 'text', text: headerLine }]
      });

      const bodyText = descriptionToText(c?.body) || '(sem conteudo de texto)';
      // textToAdfParagraphs ja retorna { type: 'doc', content: [...] } - extraimos content
      const bodyAdf = textToAdfParagraphs(bodyText);
      const blocks = Array.isArray(bodyAdf?.content) ? bodyAdf.content : [];
      blocks.forEach(b => content.push(b));

      // Anexos referenciados no ADF deste comentario (imagens coladas, arquivos embutidos)
      const refIds = Array.from(_extractAttachmentIdsFromAdf(c?.body));
      if(refIds.length){
        const refNames = refIds.map(id => attMap.get(id) || `(anexo ${id})`);
        content.push({
          type: 'paragraph',
          content: [
            { type: 'text', text: '\u{1F4CE} Anexos referenciados: ', marks: [{ type: 'em' }] },
            { type: 'text', text: refNames.join(', '), marks: [{ type: 'strong' }] },
            { type: 'text', text: ' (veja na aba "Attachments" desta tarefa)' }
          ]
        });
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
  async function _resolveEffectiveIssConfig(sourceIssueKey){
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

  async function createIssTaskFromIssue(sourceIssueKey, onProgress){
    const progress = typeof onProgress === 'function' ? onProgress : () => {};

    // Decide template/overrides baseados em regras Confluence (mapeamento por categoria SE).
    progress('Avaliando qual configuracao ISS usar para este chamado...');
    const tmpl = await _resolveEffectiveIssConfig(sourceIssueKey);
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

  function startCapture(){
    if(_capState.active) return false;
    _capState.originalFetch = window.fetch.bind(window);
    const orig = _capState.originalFetch;

    window.fetch = async function(input, init){
      const url = typeof input === 'string' ? input : (input?.url || '');
      const method = String(init?.method || (typeof input === 'object' ? input?.method : 'GET') || 'GET').toUpperCase();
      const body = (init && init.body !== undefined) ? init.body : (typeof input === 'object' ? input?.body : undefined);

      let item = null;
      if(_capShouldKeep(url, method)){
        let bodyText = '';
        try{ bodyText = await _capBodyToText(body); }catch{}
        item = {
          idx: _capState.items.length,
          url,
          method,
          body: bodyText,
          time: new Date().toLocaleTimeString(),
          size: bodyText.length,
          status: null,
          response: ''
        };
        _capState.items.push(item);
      }

      try{
        const resp = await orig(input, init);
        if(item){
          item.status = resp.status;
          try{
            const t = await resp.clone().text();
            item.response = t.slice(0, 600);
          }catch{}
        }
        return resp;
      }catch(e){
        if(item){ item.status = -1; item.response = String(e.message || e); }
        throw e;
      }
    };
    _capState.active = true;
    return true;
  }

  function stopCapture(){
    if(!_capState.active) return false;
    if(_capState.originalFetch) window.fetch = _capState.originalFetch;
    _capState.originalFetch = null;
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
    const defaultComment = String(opts.comment || action.comment || '').trim();
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
      alert(`${action.label || chosenTransition.name} aplicado em ${issueKey}.${action.assignToMe !== false ? `\nAtribuido a ${me.displayName}` : ''}\nStatus -> ${chosenTransition.name}`);
    }
    return { ok: true, transition: chosenTransition, accountId, displayName: me.displayName };
  }

  // Toast leve (top direito) que some sozinho. Usado apos aplicar status com sucesso.
  function showStatusAppliedToast(msg){
    try{
      document.getElementById('ml_st_toast')?.remove();
      const t = document.createElement('div');
      t.id = 'ml_st_toast';
      t.style.cssText = `
        position: fixed; top: 18px; right: 18px; z-index: 2147483647;
        background: linear-gradient(180deg, #2f8f48, #246a36);
        color: #fff; padding: 10px 16px; border-radius: 8px;
        border: 1px solid #2c7a3e; font: 600 12.5px var(--ml-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
        box-shadow: 0 8px 22px rgba(0,0,0,.4);
        animation: mlToastIn .25s cubic-bezier(.16,.84,.44,1);
      `;
      t.textContent = '\u2713 ' + String(msg || 'OK');
      document.body.appendChild(t);
      setTimeout(() => { t.style.transition = 'opacity .3s ease'; t.style.opacity = '0'; }, 2400);
      setTimeout(() => { t.remove(); }, 2900);
    }catch(_){}
  }

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
      alert('Nao consegui detectar o ticket atual.');
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
          <textarea id="ml_st_comment" placeholder="Mensagem (opcional). Suporta /comandos de snippets." style="width:100%; min-height: 120px; padding:10px; border-radius:8px; border:1px solid var(--ml-border); background:var(--ml-bg-2); color:var(--ml-text); font-family: inherit; font-size: 12.5px; line-height: 1.45;"></textarea>
          <div id="ml_st_slash_hint" style="margin-top:4px;"></div>

          <div style="display:flex; gap:18px; margin-top:12px; flex-wrap:wrap; font-size:12.5px;">
            <label class="checkbox" style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" id="ml_st_internal" />
              <span>Comentario <b>INTERNO</b> (so a equipe ve)</span>
            </label>
            <label class="checkbox" style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" id="ml_st_assign" />
              <span>Atribuir o ticket <b>pra mim</b></span>
            </label>
          </div>
        </div>

        <div style="display:flex; gap:10px; justify-content:flex-end; padding-top:6px; border-top:1px solid var(--ml-border); margin-top:auto;">
          <button id="ml_st_settings" class="ghost">Editar acoes (settings)</button>
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
    $('#ml_st_settings').onclick = () => { close(); try{ openSettingsModal(); }catch(_){} };

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
        subtitle.innerHTML = `Status atual: <b>${esc(statusName)}</b>. Selecione pra qual status mudar e edite a mensagem antes de aplicar.`;
      } else {
        subtitle.textContent = 'Selecione pra qual status mudar e edite a mensagem antes de aplicar.';
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
      const annotated = visible.map(t => ({
        id: String(t.id),
        name: String(t.name || ''),
        toName: String(t.to?.name || ''),
        action: _findActionForTransition(t.name)
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
        const tags = [];
        if(a?.internal) tags.push(`<span style="background:rgba(251,191,36,0.18);color:#fbbf24;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;">INTERNA</span>`);
        if(a && a.assignToMe !== false) tags.push(`<span style="background:rgba(34,197,94,0.18);color:#22c55e;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;">ATRIBUIR</span>`);
        return `
          <button type="button" class="ml-st-opt" data-idx="${i}"
            style="text-align:left; padding:10px 12px; border-radius:8px;
                   background: var(--ml-bg-2); color: var(--ml-text);
                   border:1px solid var(--ml-border); cursor:pointer; font: inherit;
                   transition: background .12s, border-color .12s;
                   display: flex; flex-direction: column; gap: 6px;">
            <div style="font-weight:700; font-size: 12.5px;">${esc(a?.label || t.name)}</div>
            <div style="font-size: 10.5px; color: var(--ml-text-dim); font-family: var(--ml-mono);">
              ${esc(t.name)}${t.toName ? ` &rarr; ${esc(t.toName)}` : ''}
            </div>
            ${msg ? `
              <div style="font-size:11px; color:var(--ml-text-mut); line-height:1.45;
                          background: rgba(96,165,250,0.08); border-left: 2px solid #60a5fa;
                          padding: 5px 8px; border-radius: 4px;
                          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
                          white-space: pre-wrap;">${esc(msg)}</div>
            ` : `
              <div style="font-size:10.5px; color:var(--ml-text-dim); font-style:italic;">
                ${a ? '(sem mensagem padrao - voce escreve na hora)' : '(sem cadastro - voce escreve na hora)'}
              </div>
            `}
            ${tags.length ? `<div style="display:flex; gap:4px; flex-wrap:wrap;">${tags.join('')}</div>` : ''}
          </button>
        `;
      }).join('');

      grid.querySelectorAll('.ml-st-opt').forEach(btn => {
        btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--ml-bg-3, #1f2433)'; btn.style.borderColor = 'var(--ml-blue, #4f8cff)'; });
        btn.addEventListener('mouseleave', () => { if(!btn.classList.contains('active')){ btn.style.background = 'var(--ml-bg-2)'; btn.style.borderColor = 'var(--ml-border)'; } });
        btn.onclick = () => {
          const idx = Number(btn.getAttribute('data-idx'));
          selectedTransition = annotated[idx];
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

  // Botao flutuante "Status" - so em pagina de issue individual.
  // Mantem ID antigo (ml_loc_assign_btn) pra nao acumular botoes em rebuilds.
  function ensureStatusButton(){
    const issueKey = getIssueKey();
    const existing = document.getElementById('ml_loc_assign_btn');
    if(!issueKey){
      existing?.remove();
      return;
    }
    if(existing) return;

    const actions = Array.isArray(STATUS_ACTIONS) ? STATUS_ACTIONS : [];
    const hasAny = actions.length > 0;

    const btn = document.createElement('button');
    btn.id = 'ml_loc_assign_btn';
    btn.type = 'button';
    // Texto: SEMPRE "Mudar status" pra deixar claro qual e a funcao do botao.
    // O nome da acao especifica aparece no menu (ou no title quando ha so 1).
    btn.textContent = '\u21bb Mudar status';
    btn.title = hasAny
      ? (actions.length === 1
        ? `Aplicar "${actions[0].label || actions[0].transition}" neste ticket`
        : `Abrir menu de ${actions.length} acao(oes) de status`)
      : 'Cadastre acoes em Configuracoes -> Acoes de Status';
    btn.style.cssText = `
      position: fixed; right: 18px; bottom: 78px; z-index: 2147483646;
      padding: 9px 16px; border-radius: 999px;
      border: 1px solid #2c7a3e;
      background: linear-gradient(180deg, #2f8f48, #246a36); color: #fff;
      font: 600 12.5px var(--ml-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      letter-spacing: .2px; cursor: pointer;
      box-shadow: 0 6px 16px rgba(0,0,0,.35);
      transition: transform .15s ease, box-shadow .2s ease, filter .15s ease;
    `;
    btn.onmouseenter = () => { btn.style.transform = 'translateY(-1px)'; btn.style.filter = 'brightness(1.05)'; };
    btn.onmouseleave = () => { btn.style.transform = ''; btn.style.filter = ''; };

    btn.onclick = () => openStatusMenu(getIssueKey());

    document.body.appendChild(btn);
  }

  // Aliases pra compat com codigo anterior (95-runtime.js)
  const ensureAssignAndStartButton = ensureStatusButton;
  async function runAssignAndStart(issueKey, opts){
    return openStatusMenu(issueKey);
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
  // =========================
  // HOME view: mini-busca + cards de features
  // =========================
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

        <div class="homeGrid">
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
            <p>Deriva para outro time da allowlist com comentario padrao. Para o time <b>IS-SHIP-SE-N2</b>, oferece criar tarefa ISS automaticamente.</p>
            <div class="row">
              <button id="ml_home_derive" class="primary">Derivar agora</button>
            </div>
          </div>

          <div class="homeCard">
            <div class="hcIcon">&#9881;</div>
            <h3>Criar tarefa ISS livre</h3>
            <p>Em breve: criar tarefa ISS com dropdowns dinamicos e templates salvos (pra casos que nao seguem o mapeamento Demand=Analisis/Service=cctv).</p>
            <div class="row">
              <button id="ml_home_iss_livre" class="ghost disabled" disabled>Em breve</button>
            </div>
          </div>
        </div>
      </div>
    `);

    document.getElementById('ml_home_dups').onclick   = () => renderDuplicates(modal, issueKey);
    document.getElementById('ml_home_derive').onclick = () => openDeriveFlow(issueKey);

    setupHomeSearch(issueKey);
    renderHealthBanner();
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

    const hitVals = hits.map(h => h.value);
    const hitAttr = hitVals.join('|');
    const labelTokens = hitVals.slice(0, DUP_LABEL_MAX_TOKENS).join(', ');
    const dupLabel = score ? `match: ${labelTokens || 'IDs'}` : '';

    const badges = [
      score ? `<span class="badge dup">${esc(dupLabel)}</span>` : '',
      strongMatch ? `<span class="badge strong">forte</span>` : '',
      ipOnlyMatch ? `<span class="badge ip">ip</span>` : '',
      `<span class="badge">${esc(resTeam)}</span>`,
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
           data-hitstext="${esc(hitVals.join('|'))}">
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
      getIssueFields(issueKey, ["summary","description"]),
      getAssetFromIssue(issueKey),
    ]);

    const summaryCurrent = String(issueCurrent?.fields?.summary || '').trim();
    const descCurrent = descriptionToText(issueCurrent?.fields?.description);
    const currentText = `${summaryCurrent}\n${descCurrent}`.trim();

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
            <button id="ml_loc_batch" class="disabled">Derivar selecionados (0)</button>
          </div>
        </div>
        <div class="meta">Clique em um ID para filtrar. Clique no card para selecionar. Use “Detalhes” para ver a descrição completa.</div>
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
      const batchBtn = document.getElementById('ml_loc_batch');
      if(!chipWrap || !list || !commentBtn || !linkBtn || !batchBtn) return;

      let activeFilter = '';
      const selected = new Set();

      const refreshButtons = () => {
        commentBtn.textContent = `Obs interna (${selected.size})`;
        linkBtn.textContent = `Vincular duplicado (${selected.size})`;
        batchBtn.textContent = `Derivar selecionados (${selected.size})`;
        if(selected.size > 0){
          commentBtn.classList.remove('disabled'); commentBtn.classList.add('primary');
          linkBtn.classList.remove('disabled');
          batchBtn.classList.remove('disabled'); batchBtn.classList.add('primary');
        } else {
          commentBtn.classList.add('disabled'); commentBtn.classList.remove('primary');
          linkBtn.classList.add('disabled');
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
          card.insertAdjacentHTML('beforeend', `
            <div class="expand">
              <div class="title">Descrição completa</div>
              <div class="fulldesc">${full || '<span class="muted">Sem descrição.</span>'}</div>
            </div>
          `);
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

  // ============= MODAL DE LOTE =============
  // opts.initialKeys: lista pre-populada (ex: vinda do Duplicados). Quando passada,
  //                   nao tentamos detectar do DOM (a lista ja vem pronta).
  function openBatchModal(opts){
    opts = opts || {};
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
          <div class="subtitle">Derive ou crie tarefas ISS para varios chamados de uma vez.</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button id="ml_batch_settings" class="gear" title="Configuracoes">&#9881;</button>
          <button id="ml_batch_close">Fechar</button>
        </div>
      </div>
      <div class="cb">
        <div class="capHint">
          <b>Como funciona:</b>
          <ol>
            <li>${esc(sourceLabel)}: <b>${detected.length}</b> chamado(s) (todos <b>desmarcados</b> por seguranca).</li>
            <li>Voce pode <b>colar mais keys</b> (uma por linha ou separadas por virgula/espaco) e clicar "Adicionar".</li>
            <li>Use o filtro pra achar e <b>marque</b> os chamados que quer processar (ou "Marcar todos").</li>
            <li>Escolha a acao (Derivar para time X / com ISS) e clique "Executar".</li>
          </ol>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center;">
          <input type="text" id="ml_batch_paste" placeholder="Cole aqui mais keys: IS-123, IS-456..." style="flex:1;min-width:220px;padding:8px 12px;background:var(--ml-bg-0);color:var(--ml-text);border:1px solid var(--ml-border-2);border-radius:var(--ml-radius-sm);font-size:12.5px;outline:none;" />
          <button id="ml_batch_add" class="btnSecondary">Adicionar</button>
          <button id="ml_batch_redetect" class="btnSecondary">Re-detectar do DOM</button>
          <button id="ml_batch_clear" class="btnSecondary">Limpar lista</button>
        </div>

        <div style="background:var(--ml-bg-0);border:1px solid var(--ml-border);border-radius:var(--ml-radius-sm);padding:10px;margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;align-items:center;flex-wrap:wrap;gap:8px;">
            <div style="font-size:12px;font-weight:700;color:var(--ml-text-mut);display:flex;align-items:center;gap:8px;">
              Chamados (<span id="ml_batch_count">0</span>) <span id="ml_batch_sel_count" style="color:var(--ml-text-dim);font-weight:400;"></span>
              <span id="ml_batch_loading" style="color:var(--ml-text-dim);font-weight:400;display:none;"><span class="mlSpin"></span> carregando detalhes...</span>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
              <input type="text" id="ml_batch_filter" placeholder="Filtrar (key, titulo, localidade...)"
                style="padding:4px 10px;background:var(--ml-bg-2);color:var(--ml-text);border:1px solid var(--ml-border-2);border-radius:6px;font-size:11.5px;outline:none;min-width:200px;" />
              <button id="ml_batch_check_all" class="btnSecondary" style="font-size:11px;padding:4px 10px;">Marcar todos</button>
              <button id="ml_batch_uncheck_all" class="btnSecondary" style="font-size:11px;padding:4px 10px;">Desmarcar todos</button>
            </div>
          </div>
          <div id="ml_batch_list" style="max-height:340px;overflow-y:auto;"></div>
        </div>

        <div style="background:var(--ml-bg-2);border:1px solid var(--ml-border);border-radius:var(--ml-radius-sm);padding:14px;margin-bottom:12px;">
          <div style="font-size:12px;font-weight:700;color:var(--ml-text-mut);margin-bottom:10px;">Acao</div>

          <label style="font-size:12px;font-weight:700;color:var(--ml-text-mut);">Time de destino</label>
          <div id="ml_batch_teams" style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 12px;"><span class="muted">Carregando times...</span></div>

          <label style="font-size:12px;font-weight:700;color:var(--ml-text-mut);display:flex;align-items:center;gap:8px;">
            <span>Comentario (observacao interna)</span>
            <span id="ml_batch_comment_btnwrap" style="margin-left:auto;font-weight:400;"></span>
          </label>
          <textarea id="ml_batch_comment" style="width:100%;min-height:70px;background:var(--ml-bg-0);color:var(--ml-text);border:1px solid var(--ml-border-2);border-radius:var(--ml-radius-sm);padding:10px;font-family:inherit;font-size:13px;resize:vertical;outline:none;margin-top:6px;">${esc(DERIVE_COMMENT_DEFAULT)}</textarea>

          <div style="margin-top:14px;padding:10px 12px;border:1px dashed var(--ml-blue);border-radius:var(--ml-radius-sm);background:var(--ml-blue-soft);">
            <label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;font-size:13px;">
              <input type="checkbox" id="ml_batch_iss_chk" style="margin-top:3px;transform:scale(1.18);accent-color:var(--ml-blue);" />
              <span>
                <b>Tambem criar tarefa ISS para cada chamado</b>
                <div class="muted" style="margin-top:4px;">So ativa quando o time selecionado esta em <code>ISS_TASK_TRIGGER_TEAMS</code> (Configuracoes). Pode demorar - cada chamado vira 1 ISS.</div>
              </span>
            </label>
          </div>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
          <button id="ml_batch_cancel" class="btnSecondary">Cancelar</button>
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

    const close = () => { modal.remove(); overlay.remove(); };
    overlay.addEventListener('click', close);
    modal.querySelector('#ml_batch_close').onclick = close;
    modal.querySelector('#ml_batch_cancel').onclick = close;
    modal.querySelector('#ml_batch_settings').onclick = () => openSettingsModal();

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
        const asset = i.asset
          ? `<span style="background:var(--ml-bg-2);padding:1px 8px;border-radius:6px;border:1px solid var(--ml-border);font-size:11px;">${esc(i.asset)}</span>`
          : '<span class="muted" style="font-size:11px;">-</span>';
        const team = i.resTeam
          ? `<span style="font-size:11px;color:var(--ml-text);">${esc(i.resTeam)}</span>`
          : '<span class="muted" style="font-size:11px;">-</span>';

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
            </td>
            <td style="padding:6px 8px;vertical-align:top;font-size:12px;line-height:1.35;">
              ${esc(summary)}
              ${i.assignee ? `<div style="font-size:10.5px;color:var(--ml-text-dim);margin-top:3px;">Atribuido: ${esc(i.assignee)}</div>` : ''}
            </td>
            <td style="padding:6px 8px;vertical-align:top;width:160px;">${asset}</td>
            <td style="padding:6px 8px;vertical-align:top;width:160px;">${team}</td>
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
              <th style="padding:8px;text-align:left;font-size:11px;color:var(--ml-text-mut);border-bottom:1px solid var(--ml-border);">Time resolutor</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="5" class="capEmpty" style="padding:20px;text-align:center;">Nenhum chamado bate com o filtro.</td></tr>`}</tbody>
        </table>
      `;

      listEl.querySelectorAll('input[type="checkbox"][data-key]').forEach(cb => {
        cb.addEventListener('change', () => {
          const k = cb.getAttribute('data-key');
          if(cb.checked) selected.add(k); else selected.delete(k);
          updateSelCount();
        });
      });
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
    }

    renderList();
    if(keys.length) loadDetails(keys);

    // Filtro local
    modal.querySelector('#ml_batch_filter').addEventListener('input', (e) => {
      filterText = String(e.target.value || '').trim();
      renderList();
    });

    modal.querySelector('#ml_batch_add').onclick = () => {
      const txt = modal.querySelector('#ml_batch_paste').value || '';
      const newKeys = extractKeysFromText(txt);
      const addedKeys = [];
      for(const k of newKeys){
        if(!keys.includes(k)){ keys.push(k); addedKeys.push(k); }
      }
      modal.querySelector('#ml_batch_paste').value = '';
      keys.sort();
      renderList();
      if(addedKeys.length){
        progressLog(`+ ${addedKeys.length} chamado(s) adicionado(s).`);
        loadDetails(addedKeys);
        if(!teams.length) loadTeams(); // tenta recarregar se ainda nao tinha
      }
    };
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
      // Ordena: 1) projetos suportados primeiro (IS, ISS, SSHP); 2) demais por ultimo
      const ordered = [...keys].sort((a, b) => {
        const ap = PROJECTS.includes(String(a).split('-')[0]);
        const bp = PROJECTS.includes(String(b).split('-')[0]);
        if(ap && !bp) return -1;
        if(!ap && bp) return 1;
        return 0;
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
          Falha ao carregar times. Verifique se ao menos 1 chamado de IS/ISS/SSHP esta na lista.<br/>
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
        };
      });
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
      if(!chosenTeam){ alert('Selecione o time de destino.'); return; }
      const comment = modal.querySelector('#ml_batch_comment').value || DERIVE_COMMENT_DEFAULT;
      const wantIss = modal.querySelector('#ml_batch_iss_chk').checked;
      const issEligible = wantIss && (ISS_TASK_TRIGGER_TEAMS || []).map(s => String(s).trim()).includes(String(chosenTeam.value).trim());

      if(wantIss && !issEligible){
        if(!confirm(`O time "${chosenTeam.value}" NAO esta na lista ISS_TASK_TRIGGER_TEAMS.\nVamos derivar todos, mas SEM criar ISS. Continuar?`)) return;
      }

      const confirmMsg = `Vai processar ${targetKeys.length} chamado(s):\n  - Derivar para "${chosenTeam.value}"\n  - Comentario: "${comment}"${issEligible ? '\n  - Criar 1 ISS para cada' : ''}\n\nContinuar?`;
      if(!confirm(confirmMsg)) return;

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
        counter(i);
        try{
          const tr = await jiraGetTransitions(key);
          const deriveTr = pickDeriveTransition(tr);
          if(!deriveTr) throw new Error(`Transicao "${DERIVE_TRANSITION_NAME}" nao disponivel`);
          await jiraDoDerive(key, deriveTr.id, chosenTeam.id, comment);
          progressLog(`<b style="color:#86efac;">[OK]</b> ${esc(key)} derivado para ${esc(chosenTeam.value)}`);
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
              const r = await createIssTaskFromIssue(key, () => {});
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
    };
  }
})();
