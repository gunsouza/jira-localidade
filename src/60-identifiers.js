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
