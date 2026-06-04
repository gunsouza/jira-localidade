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
