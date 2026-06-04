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
