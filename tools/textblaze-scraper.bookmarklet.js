/*
 * Text Blaze -> Jira Localidade (Snippet Scraper) — versao BOOKMARKLET
 *
 * Este arquivo eh carregado dinamicamente quando o usuario clica no
 * bookmarklet "📋 Capturar TB" arrastado pros favoritos.
 *
 * O bookmarklet em si eh apenas um 1-liner que faz:
 *   javascript:(function(){var s=document.createElement('script');
 *   s.src='https://raw.githubusercontent.com/gunsouza/jira-localidade/main/tools/textblaze-scraper.bookmarklet.js?v='+Date.now();
 *   document.body.appendChild(s);})();
 *
 * Diferencas pra versao .user.js (Tampermonkey):
 *  - Sem header ==UserScript==
 *  - Auto-executa o scrape ao carregar (sem precisar clicar em botao)
 *  - Se ja foi carregado, apenas re-executa
 */

(function(){
  'use strict';

  const LOG = (...a) => console.log('[tb-scraper]', ...a);

  // Re-executa direto se ja carregou antes (evita duplicar listeners/IDs)
  if(window.__tbScraperStart){
    LOG('ja carregado, re-executando...');
    window.__tbScraperStart();
    return;
  }

  function findSnippetRows(){
    const tries = [
      'a[href*="/snippet/"]',
      '[data-test="snippet-row"]',
      '[data-snippet-id]',
      '[role="row"]',
      '[role="listitem"]',
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
    LOG('nenhum seletor padrao casou. Heuristica por shortcut texto...');
    const all = document.querySelectorAll('a, [role="button"], li, div');
    const rows = [];
    const seen = new Set();
    all.forEach(el => {
      const txt = (el.textContent || '').trim();
      if(!txt || txt.length > 300) return;
      if(!/\/[a-z][\w-]{0,30}\b/i.test(txt)) return;
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
    const cand = Array.from(row.querySelectorAll('*')).map(n => (n.textContent || '').trim())
      .filter(t => t && t.length > 1 && t.length < 120 && !t.startsWith('/'));
    return cand[0] || '';
  }

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
    return (editor.innerText || editor.textContent || '').trim();
  }

  function extractMainContentFallback(){
    const sidebarWidth = 320;
    const rightPanelStart = Math.max(window.innerWidth - 320, 700);
    const candidates = Array.from(document.querySelectorAll('div, article, section, p'));
    let best = null;
    let bestScore = 0;
    for(const el of candidates){
      const rect = el.getBoundingClientRect();
      if(rect.width < 200 || rect.height < 30) continue;
      if(rect.left < sidebarWidth) continue;
      if(rect.right > rightPanelStart + 200) continue;
      const txt = (el.innerText || '').trim();
      if(!txt || txt.length < 20 || txt.length > 8000) continue;
      const hasInnerCandidate = Array.from(el.children).some(c => {
        const t = (c.innerText || '').trim();
        return t && t.length > txt.length * 0.85;
      });
      if(hasInnerCandidate) continue;
      const score = txt.length;
      if(score > bestScore){ bestScore = score; best = el; }
    }
    if(!best) return '';
    const txt = (best.innerText || '').trim();
    LOG(`fallback main content: ${txt.length} chars (score=${bestScore})`);
    return txt;
  }

  async function tryEnterEditMode(){
    const editBtns = Array.from(document.querySelectorAll('button, [role="button"], [role="tab"]'))
      .filter(b => {
        const txt = (b.textContent || '').trim();
        return /^edit$/i.test(txt) && b.offsetWidth > 0 && b.offsetHeight > 0;
      });
    if(editBtns.length){
      try{ editBtns[0].click(); await delay(300); return true; }catch(_){}
    }
    return false;
  }

  async function delay(ms){ return new Promise(r => setTimeout(r, ms)); }

  async function openAndReadSnippet(row){
    const clickTarget = row.matches('a') ? row : (row.querySelector('a') || row);
    const beforeEditor = findEditor();
    const beforeText = beforeEditor ? extractEditorText(beforeEditor) : null;
    try{ clickTarget.click(); }catch(e){ LOG('falha ao clicar', e); return null; }
    let editor = null;
    for(let i = 0; i < 15; i++){
      await delay(100);
      const e = findEditor();
      if(e && extractEditorText(e) !== beforeText){ editor = e; break; }
    }
    if(!editor) editor = findEditor();
    let text = editor ? extractEditorText(editor) : '';
    if(!text || text.length < 5){
      const entered = await tryEnterEditMode();
      if(entered){
        await delay(200);
        editor = findEditor();
        text = editor ? extractEditorText(editor) : '';
      }
    }
    if(!text || text.length < 5){
      text = extractMainContentFallback();
    }
    return text;
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
        JSON <b>copiado automaticamente</b> pro clipboard. Cole no plugin Jira: <b>Configuracoes \u2192 Snippets \u2192 Importar do Text Blaze</b>.
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <button id="tb_scraper_copy" style="background:#7c3aed;color:#fff;border:0;border-radius:6px;padding:8px 12px;font-weight:600;cursor:pointer;">\uD83D\uDCCB Copiar JSON</button>
        <button id="tb_scraper_download" style="background:#0ea5e9;color:#fff;border:0;border-radius:6px;padding:8px 12px;font-weight:600;cursor:pointer;">\u2B07 Baixar .json</button>
      </div>
      <details open>
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

  function showProgressToast(text){
    let t = document.getElementById('tb_scraper_toast');
    if(!t){
      t = document.createElement('div');
      t.id = 'tb_scraper_toast';
      t.style.cssText = [
        'position:fixed','top:14px','right:14px','z-index:2147483646',
        'background:#7c3aed','color:#fff','border-radius:8px',
        'padding:10px 16px','font:600 13px system-ui',
        'box-shadow:0 6px 16px rgba(124,58,237,.4)'
      ].join(';');
      document.body.appendChild(t);
    }
    t.textContent = text;
  }
  function clearProgressToast(){ document.getElementById('tb_scraper_toast')?.remove(); }

  async function startScrape(){
    try{
      const rows = findSnippetRows();
      if(rows.length === 0){
        alert('Nao encontrei nenhum snippet na pagina.\n\nDicas:\n- Confira se voce esta no dashboard do Text Blaze (dashboard.blaze.today)\n- Abra uma pasta de snippets (clique na sidebar)\n- Abra o Console (F12) e veja os logs [tb-scraper]');
        return;
      }
      LOG(`processando ${rows.length} linhas...`);
      const snippets = [];
      for(let i = 0; i < rows.length; i++){
        const row = rows[i];
        showProgressToast(`\u23F3 Capturando ${i+1}/${rows.length}...`);
        const command = extractShortcut(row);
        const name = extractName(row);
        const text = await openAndReadSnippet(row);
        if(command || name){
          snippets.push({ command, name, text: text || '' });
        }
        await delay(150);
      }
      clearProgressToast();
      LOG('total capturado:', snippets.length, snippets);
      showResultPanel(snippets);
    }catch(e){
      clearProgressToast();
      LOG('ERRO:', e);
      alert('Erro durante captura: ' + (e.message || e) + '\nVer console (F12) pra detalhes.');
    }
  }

  // Expoe pra que cliques subsequentes no bookmarklet apenas re-executem
  window.__tbScraperStart = startScrape;

  // Auto-executa na primeira vez
  startScrape();
})();
