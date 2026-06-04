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
        // Reusa o modal de Lote do queue-batch.js, pre-populando com os duplicados selecionados.
        openBatchModal({
          initialKeys: [...selected],
          sourceLabel: `Selecionados em Duplicados de ${issueKey}`
        });
      });

      refreshButtons();
    }, 0);
  }
