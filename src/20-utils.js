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
