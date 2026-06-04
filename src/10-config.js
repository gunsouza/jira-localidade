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
    //     issTemplate?: 'ISS-XXXXX'    // opcional - explicado abaixo
    //   }
    //   - field: nome humano ("Object Type") ou customfield_XXXX
    //   - value: comparacao case-insensitive + ignora acentos/hifens
    //   - mode:  'exact' (default) | 'contains'
    //   - match e AND entre criterios. Multiplas regras podem matchar (mostra varios chips).
    //
    // issTemplate (opcional, novidade da v1.20.2):
    //   Quando o usuario clica em "Criar ISS" (via Derivar ou outro fluxo) a partir
    //   de um chamado que MATCHA esta regra, o plugin usa o ticket aqui referenciado
    //   como TEMPLATE (copia Demanda, Service, Resolution Team).
    //   Ex: regra "Botao de Panico" tem issTemplate=ISS-19469, entao a ISS criada vem
    //   com Service=Control Acceso, Demand=Analisis (que sao os valores de ISS-19469).
    //   Se nenhuma regra com issTemplate casar, usa ISS_TASK_MODEL_ISSUE default.
    //   PRIMEIRA regra que casa vence (ordem importa).
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
      .filter(r => r && typeof r === 'object' && r.url && Array.isArray(r.match) && r.match.length)
      .map(r => {
        const overrideUrl = String(overrides[r.label] || '').trim();
        const out = {
          label: String(r.label || 'Tshoot').trim(),
          icon:  String(r.icon || '').trim(),
          color: String(r.color || '').trim(), // default '' -> dourado padrao
          url:   overrideUrl || String(r.url).trim(),
          match: r.match
            .filter(c => c && c.field && c.value != null)
            .map(c => ({
              field: String(c.field).trim(),
              value: String(c.value).trim(),
              mode:  (c.mode === 'contains' ? 'contains' : 'exact')
            }))
        };
        // Opcional: template ISS-XXXX para criar tarefa com Demanda/Service/ResTeam pre-resolvidos
        if(r.issTemplate && typeof r.issTemplate === 'string'){
          out.issTemplate = r.issTemplate.trim().toUpperCase();
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
