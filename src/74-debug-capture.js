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
