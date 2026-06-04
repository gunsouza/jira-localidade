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
