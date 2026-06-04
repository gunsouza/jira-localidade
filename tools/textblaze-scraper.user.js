// ==UserScript==
// @name         Text Blaze -> Jira Localidade (Snippet Scraper)
// @namespace    https://github.com/mlibre-iss/jira-localidade
// @version      1.0.0
// @description  Captura snippets do dashboard do Text Blaze e gera JSON pra importar no plugin Jira Localidade
// @author       Gustavo
// @match        https://dashboard.blaze.today/*
// @match        https://blaze.today/*
// @match        https://app.blaze.today/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * COMO USAR:
 *
 * 1. Instale este script no Tampermonkey (mesma extensao que voce ja usa pro jira-localidade).
 * 2. Acesse https://dashboard.blaze.today (logado).
 * 3. Abra a pasta de snippets que voce quer exportar (clique nela na sidebar).
 *    >>> O scraper SO captura snippets visiveis na lista atual. <<<
 *    Se voce tem varias pastas, exporte uma por vez (ou clique em "Todos os snippets").
 * 4. Va no canto superior direito, clique no botao roxo "📋 Capturar snippets".
 * 5. O scraper vai:
 *    - varrer a lista
 *    - abrir cada snippet pra ler o conteudo (clica e fecha rapido)
 *    - mostrar um painel com o resultado
 *    - copiar o JSON pro clipboard automaticamente
 * 6. Cole esse JSON na tela "Configuracoes > Snippets > Importar do Text Blaze" do plugin Jira Localidade.
 *
 * LIMITACOES:
 * - Snippets com formatacao rica (negrito, links): vira texto puro.
 * - Snippets com variaveis ({date}, {clipboard}, {cursor}): vem como estao, voce ajusta na mao.
 * - Snippets com forms/prompts: capturam o template completo, voce decide o que fazer com cada um.
 *
 * Como o dashboard do TB pode mudar de tempos em tempos, se nao capturar nada, abra o console
 * (F12) e veja as msgs com prefixo [tb-scraper]. Me mande print pra eu ajustar os seletores.
 */

(function(){
  'use strict';

  if(window.__tbScraperLoaded){ return; }
  window.__tbScraperLoaded = true;

  const LOG = (...a) => console.log('[tb-scraper]', ...a);

  // ---- UI: Botao flutuante ----
  function injectButton(){
    if(document.getElementById('tb_scraper_btn')) return;
    const btn = document.createElement('button');
    btn.id = 'tb_scraper_btn';
    btn.textContent = '\uD83D\uDCCB Capturar snippets';
    btn.style.cssText = [
      'position:fixed','top:14px','right:14px','z-index:2147483647',
      'background:#7c3aed','color:#fff','border:0','border-radius:8px',
      'padding:10px 14px','font:600 13px system-ui,sans-serif','cursor:pointer',
      'box-shadow:0 6px 16px rgba(124,58,237,.4)'
    ].join(';');
    btn.onmouseenter = () => btn.style.background = '#6d28d9';
    btn.onmouseleave = () => btn.style.background = '#7c3aed';
    btn.onclick = startScrape;
    document.body.appendChild(btn);
  }

  // Tenta achar TODOS os elementos que parecem ser linhas de snippet na lista do dashboard.
  // Estrategias (do mais especifico pro mais generico):
  function findSnippetRows(){
    const tries = [
      // Estrategia 1: data-test/data-id especificos do TB
      'a[href*="/snippet/"]',
      '[data-test="snippet-row"]',
      '[data-snippet-id]',
      // Estrategia 2: itens de lista clicaveis com shortcut visivel
      '[role="row"]',
      '[role="listitem"]',
      // Estrategia 3: classes MUI comuns em lista do TB
      '.MuiListItem-root',
      'li[class*="snippet" i]',
      'div[class*="snippet-row" i]',
      'div[class*="snippetItem" i]'
    ];
    for(const sel of tries){
      const found = document.querySelectorAll(sel);
      if(found.length >= 2){
        LOG(`achou ${found.length} linhas usando seletor "${sel}"`);
        return Array.from(found);
      }
    }
    LOG('nenhum seletor padrao casou. Tentando heuristica por shortcut texto...');
    // Heuristica final: procura elementos que tem um filho com texto "/comando"
    const all = document.querySelectorAll('a, [role="button"], li, div');
    const rows = [];
    const seen = new Set();
    all.forEach(el => {
      const txt = (el.textContent || '').trim();
      if(!txt || txt.length > 300) return;
      if(!/\/[a-z][\w-]{0,30}\b/i.test(txt)) return;
      // Evita pegar ancestrais aninhados: prefere o mais especifico (sem filho com /cmd)
      const hasChildShortcut = Array.from(el.children).some(c => /\/[a-z]/i.test((c.textContent || '')));
      if(hasChildShortcut) return;
      if(seen.has(el)) return;
      seen.add(el);
      rows.push(el);
    });
    LOG(`heuristica achou ${rows.length} candidatos`);
    return rows;
  }

  function extractShortcut(row){
    const txt = (row.textContent || '').trim();
    const m = txt.match(/\/[a-z][\w-]{0,40}/i);
    return m ? m[0] : '';
  }

  function extractName(row){
    // Pega o primeiro texto que nao parece ser o shortcut
    const cand = Array.from(row.querySelectorAll('*')).map(n => (n.textContent || '').trim())
      .filter(t => t && t.length > 1 && t.length < 120 && !t.startsWith('/'));
    return cand[0] || '';
  }

  // Tenta achar o editor de conteudo do snippet (ProseMirror, CodeMirror, textarea, contenteditable)
  function findEditor(){
    const sels = [
      '.ProseMirror',
      '[contenteditable="true"][class*="editor" i]',
      '[contenteditable="true"]',
      '.cm-content',
      'textarea[class*="snippet" i]',
      'textarea'
    ];
    for(const sel of sels){
      const el = document.querySelector(sel);
      if(el && (el.offsetWidth > 200 || el.value)){
        return el;
      }
    }
    return null;
  }

  function extractEditorText(editor){
    if(!editor) return '';
    if(editor.tagName === 'TEXTAREA') return editor.value || '';
    // Preserva quebras de linha simulando innerText
    return (editor.innerText || editor.textContent || '').trim();
  }

  async function delay(ms){ return new Promise(r => setTimeout(r, ms)); }

  // Tenta abrir um snippet, ler o conteudo e voltar.
  async function openAndReadSnippet(row){
    // Procura elemento clicavel dentro da linha
    const clickTarget = row.matches('a') ? row : (row.querySelector('a') || row);

    // Snapshot do editor atual (pra detectar mudanca)
    const beforeEditor = findEditor();
    const beforeText = beforeEditor ? extractEditorText(beforeEditor) : null;

    // Clica
    try{
      clickTarget.click();
    }catch(e){ LOG('falha ao clicar', e); return null; }

    // Espera ate o editor aparecer/mudar (max 1500ms)
    let editor = null;
    for(let i = 0; i < 15; i++){
      await delay(100);
      const e = findEditor();
      if(e && extractEditorText(e) !== beforeText){
        editor = e; break;
      }
    }
    if(!editor) editor = findEditor();
    if(!editor){ LOG('nao achou editor apos clicar'); return null; }

    return extractEditorText(editor);
  }

  function showResultPanel(snippets){
    document.getElementById('tb_scraper_panel')?.remove();

    const json = JSON.stringify(snippets, null, 2);

    const panel = document.createElement('div');
    panel.id = 'tb_scraper_panel';
    panel.style.cssText = [
      'position:fixed','top:60px','right:14px','z-index:2147483647',
      'background:#0b1220','color:#e6ecf6','border:1px solid #2a3a55',
      'border-radius:12px','padding:14px','width:min(560px, 90vw)',
      'max-height:80vh','overflow:auto','font:13px system-ui,sans-serif',
      'box-shadow:0 12px 40px rgba(0,0,0,.55)'
    ].join(';');

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-weight:700;font-size:14px;">Capturados: ${snippets.length} snippets</div>
        <button id="tb_scraper_close" style="background:transparent;color:#9ca3af;border:0;font-size:18px;cursor:pointer;">\u00d7</button>
      </div>
      <div style="font-size:12px;color:#9ca3af;margin-bottom:10px;">
        JSON copiado automaticamente pro clipboard. Cole no plugin: <b>Configuracoes &gt; Snippets &gt; Importar do Text Blaze</b>.
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <button id="tb_scraper_copy" style="background:#7c3aed;color:#fff;border:0;border-radius:6px;padding:8px 12px;font-weight:600;cursor:pointer;">\uD83D\uDCCB Copiar JSON</button>
        <button id="tb_scraper_download" style="background:#0ea5e9;color:#fff;border:0;border-radius:6px;padding:8px 12px;font-weight:600;cursor:pointer;">\u2B07 Baixar .json</button>
      </div>
      <details>
        <summary style="cursor:pointer;font-size:12px;color:#9ca3af;margin-bottom:6px;">Preview da lista</summary>
        <table style="width:100%;font-size:11px;border-collapse:collapse;margin-top:6px;">
          <thead>
            <tr style="border-bottom:1px solid #2a3a55;text-align:left;color:#9ca3af;">
              <th style="padding:4px;">Shortcut</th>
              <th style="padding:4px;">Nome</th>
              <th style="padding:4px;">Texto (preview)</th>
            </tr>
          </thead>
          <tbody>
            ${snippets.map(s => `
              <tr style="border-bottom:1px solid #1f2937;">
                <td style="padding:4px;font-family:monospace;color:#a78bfa;">${escapeHtml(s.command || '-')}</td>
                <td style="padding:4px;">${escapeHtml(s.name || '-')}</td>
                <td style="padding:4px;color:#cbd5e1;">${escapeHtml((s.text || '').slice(0, 60))}${s.text && s.text.length > 60 ? '...' : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </details>
      <details style="margin-top:10px;">
        <summary style="cursor:pointer;font-size:12px;color:#9ca3af;">Ver JSON completo</summary>
        <textarea readonly style="width:100%;height:200px;margin-top:6px;background:#0a0e17;color:#e6ecf6;border:1px solid #1f2937;border-radius:6px;padding:8px;font-family:monospace;font-size:11px;">${escapeHtml(json)}</textarea>
      </details>
    `;
    document.body.appendChild(panel);
    panel.querySelector('#tb_scraper_close').onclick = () => panel.remove();
    panel.querySelector('#tb_scraper_copy').onclick = () => copyToClipboard(json);
    panel.querySelector('#tb_scraper_download').onclick = () => downloadJson(json);

    copyToClipboard(json);
  }

  function escapeHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function copyToClipboard(text){
    try{
      navigator.clipboard.writeText(text);
      LOG('JSON copiado pro clipboard');
    }catch(_){
      // Fallback: textarea temporario
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove();
    }
  }

  function downloadJson(text){
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `textblaze-snippets-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function startScrape(){
    const btn = document.getElementById('tb_scraper_btn');
    if(btn){ btn.disabled = true; btn.textContent = '\u23F3 Capturando...'; }

    try{
      const rows = findSnippetRows();
      if(rows.length === 0){
        alert('Nao encontrei nenhum snippet na pagina.\n\nDicas:\n- Abra uma pasta de snippets (sidebar)\n- Confira no console (F12) os logs com prefixo [tb-scraper]\n- Manda print do console que ajusto');
        return;
      }
      LOG(`processando ${rows.length} linhas...`);

      const snippets = [];
      for(let i = 0; i < rows.length; i++){
        const row = rows[i];
        if(btn) btn.textContent = `\u23F3 ${i+1}/${rows.length}...`;
        const command = extractShortcut(row);
        const name = extractName(row);
        const text = await openAndReadSnippet(row);
        if(command || name){
          snippets.push({ command, name, text: text || '' });
        }
        await delay(150);
      }

      LOG('total capturado:', snippets.length, snippets);
      showResultPanel(snippets);
    }catch(e){
      LOG('ERRO:', e);
      alert('Erro durante captura: ' + (e.message || e) + '\nVer console (F12) pra detalhes.');
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = '\uD83D\uDCCB Capturar snippets'; }
    }
  }

  // Observa a SPA - quando rota muda, reinjeta o botao
  injectButton();
  const obs = new MutationObserver(() => injectButton());
  obs.observe(document.body, { childList: true, subtree: true });

  LOG('scraper carregado. Aguardando clique no botao roxo no canto superior direito.');
})();
