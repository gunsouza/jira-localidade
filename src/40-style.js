  // =========================
  // STYLE — design system v2
  // =========================
  function ensureStyle() {
    if (document.getElementById(IDS.style)) return;
    const st = document.createElement('style');
    st.id = IDS.style;
    st.textContent = `
      /* ============= TOKENS ============= */
      :root {
        --ml-bg-0:      #0c0e12;
        --ml-bg-1:      #121419;
        --ml-bg-2:      #181a20;
        --ml-bg-3:      #1f2229;
        --ml-bg-4:      #262932;

        --ml-border:    #2a2d36;
        --ml-border-2:  #353945;
        --ml-border-hi: #4b5160;

        --ml-text:      #eef0f4;
        --ml-text-mut:  #b6bcc7;
        --ml-text-dim:  #8a90a0;

        --ml-blue:      #5b8def;
        --ml-blue-2:    #4a7ce0;
        --ml-blue-soft: rgba(91,141,239,.14);
        --ml-blue-line: rgba(91,141,239,.45);

        --ml-green:     #34c578;
        --ml-green-soft:rgba(52,197,120,.14);
        --ml-amber:     #f4b942;
        --ml-amber-soft:rgba(244,185,66,.14);
        --ml-red:       #ef5b5b;
        --ml-red-soft:  rgba(239,91,91,.14);

        --ml-radius-sm: 8px;
        --ml-radius:    12px;
        --ml-radius-lg: 16px;
        --ml-radius-xl: 20px;

        --ml-shadow-sm: 0 2px 8px rgba(0,0,0,.30);
        --ml-shadow:    0 10px 28px rgba(0,0,0,.45);
        --ml-shadow-lg: 0 24px 60px rgba(0,0,0,.55);

        --ml-font: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        --ml-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Roboto Mono", monospace;
      }

      /* ============= BOTAO FLUTUANTE ============= */
      #${IDS.btn}{
        position:fixed; right:20px; bottom:20px; z-index:9999997;
        background: linear-gradient(135deg, var(--ml-blue), var(--ml-blue-2));
        color:#fff; border:0; border-radius:999px;
        padding:11px 18px; font-weight:700; cursor:pointer;
        box-shadow: 0 12px 28px rgba(91,141,239,.35), 0 4px 10px rgba(0,0,0,.30);
        font-family: var(--ml-font); font-size: 13px; letter-spacing:.2px;
        transition: transform .15s ease, box-shadow .2s ease, filter .15s ease;
      }
      #${IDS.btn}:hover{ transform: translateY(-1px); filter: brightness(1.08); box-shadow: 0 16px 36px rgba(91,141,239,.45), 0 6px 14px rgba(0,0,0,.35); }
      #${IDS.btn}:active{ transform: translateY(0); }

      /* ============= OVERLAY + MODAL BASE ============= */
      #${IDS.overlay}, #${IDS.dOverlay}, #${IDS.sOverlay}, .mlCapOverlay {
        position:fixed; inset:0;
        background: rgba(6,8,12,.55);
        backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        z-index: 9999998;
      }
      #${IDS.dOverlay}, #${IDS.sOverlay}, .mlCapOverlay { z-index: 10000000; }

      #${IDS.modal}, #${IDS.dModal}, #${IDS.sModal}, .mlCapModal {
        position:fixed; left:50%; transform: translateX(-50%);
        background: var(--ml-bg-1); color: var(--ml-text);
        border: 1px solid var(--ml-border);
        border-radius: var(--ml-radius-xl);
        box-shadow: var(--ml-shadow-lg);
        font-family: var(--ml-font);
        overflow: hidden;
        animation: mlPop .18s cubic-bezier(.16,.84,.44,1);
      }
      @keyframes mlPop { from { opacity: 0; transform: translate(-50%, 4px) scale(.985); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }

      #${IDS.modal}  { top: 5vh; width: min(1120px, 95vw); max-height: 90vh; z-index: 9999999; display:flex; flex-direction:column; }
      #${IDS.dModal} { top:10vh; width: min( 740px, 92vw); max-height: 80vh; z-index:10000001; display:flex; flex-direction:column; }
      #${IDS.sModal} { top: 5vh; width: min( 860px, 95vw); max-height: 90vh; z-index:10000001; display:flex; flex-direction:column; }
      .mlCapModal    { top: 4vh; width: min(1040px, 96vw); max-height: 92vh; z-index:10000001; display:flex; flex-direction:column; }

      /* ============= HEADER COMUM ============= */
      #${IDS.modal} .h, #${IDS.dModal} .dh, #${IDS.sModal} .sh, .mlCapModal .ch {
        display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
        padding: 18px 22px;
        flex-shrink: 0; /* nao encolhe quando o modal fica cheio */
        background: linear-gradient(180deg, var(--ml-bg-2), var(--ml-bg-1) 90%);
        border-bottom: 1px solid var(--ml-border);
        flex-shrink: 0;
      }
      #${IDS.modal} .h .title, #${IDS.dModal} .dh .title, #${IDS.sModal} .sh .title, .mlCapModal .ch .title{
        font-size: 17px; font-weight: 800; letter-spacing:.2px;
        display:flex; align-items:center; gap:10px;
      }
      #${IDS.modal} .h .subtitle, #${IDS.dModal} .dh .subtitle, #${IDS.sModal} .sh .subtitle, .mlCapModal .ch .subtitle{
        color: var(--ml-text-dim); font-size: 12px; margin-top: 4px; line-height:1.4;
      }
      #${IDS.modal} .h .titleDot{
        width:8px; height:8px; border-radius:50%;
        background: var(--ml-blue); box-shadow: 0 0 0 4px var(--ml-blue-soft);
      }

      /* ============= BODY COMUM (rolavel) ============= */
      #${IDS.modal} .b, #${IDS.dModal} .db, #${IDS.sModal} .sb, .mlCapModal .cb {
        padding: 18px 22px 22px;
        overflow-y: auto;
        flex: 1 1 auto;
      }

      /* ============= LINKS / TEXTOS ============= */
      #${IDS.modal} a, #${IDS.dModal} a, #${IDS.sModal} a, .mlCapModal a {
        color: var(--ml-blue); text-decoration: none; transition: color .15s ease;
      }
      #${IDS.modal} a:hover, #${IDS.dModal} a:hover, #${IDS.sModal} a:hover, .mlCapModal a:hover { color: #87aaf7; text-decoration: underline; }
      #${IDS.modal} .meta, #${IDS.dModal} .meta, #${IDS.sModal} .meta, .mlCapModal .meta {
        color: var(--ml-text-dim); font-size: 12px; line-height: 1.5; word-break: break-word;
      }
      #${IDS.modal} code, .mlCapModal code { font-family: var(--ml-mono); white-space: pre-wrap; }

      /* ============= BOTOES (sistema) ============= */
      .mlBtn, #${IDS.modal} button, #${IDS.dModal} button, #${IDS.sModal} button, .mlCapModal button {
        background: var(--ml-bg-3); color: var(--ml-text); border: 1px solid var(--ml-border-2);
        border-radius: var(--ml-radius-sm); padding: 8px 14px; font-weight: 600;
        cursor: pointer; font-family: var(--ml-font); font-size: 13px;
        transition: background .15s ease, border-color .15s ease, transform .1s ease, box-shadow .15s ease;
      }
      .mlBtn:hover, #${IDS.modal} button:hover, #${IDS.dModal} button:hover, #${IDS.sModal} button:hover, .mlCapModal button:hover {
        background: var(--ml-bg-4); border-color: var(--ml-border-hi);
      }
      .mlBtn:active, #${IDS.modal} button:active, #${IDS.dModal} button:active, #${IDS.sModal} button:active, .mlCapModal button:active { transform: translateY(1px); }

      .primary, #${IDS.modal} .primary, #${IDS.dModal} .btnPrimary, #${IDS.sModal} .primary, .mlCapModal .btnPrimary {
        background: var(--ml-blue); border-color: transparent; color: #fff;
        box-shadow: 0 4px 12px rgba(91,141,239,.30);
      }
      .primary:hover, #${IDS.modal} .primary:hover, #${IDS.dModal} .btnPrimary:hover, #${IDS.sModal} .primary:hover, .mlCapModal .btnPrimary:hover {
        background: var(--ml-blue-2); border-color: transparent;
        box-shadow: 0 6px 16px rgba(91,141,239,.42);
      }
      .ghost, #${IDS.modal} .ghost { background: transparent; border-color: var(--ml-border-2); color: var(--ml-text-mut); }
      .ghost:hover, #${IDS.modal} .ghost:hover { background: var(--ml-bg-3); color: var(--ml-text); }
      .danger, #${IDS.modal} .danger, #${IDS.sModal} .danger { background: var(--ml-red); border-color: transparent; color:#fff; }
      .danger:hover, #${IDS.modal} .danger:hover, #${IDS.sModal} .danger:hover { background: #d94a4a; }
      .disabled, #${IDS.modal} .disabled { opacity: .50; cursor: not-allowed; pointer-events: none; }

      /* ============= GEAR BUTTON ============= */
      #${IDS.modal} .headerActions { display:flex; gap:8px; align-items:center; }
      #${IDS.modal} .gear {
        background: transparent; color: var(--ml-text-mut);
        border:1px solid var(--ml-border-2); border-radius: var(--ml-radius-sm);
        width: 36px; height: 36px; padding:0;
        display:inline-flex; align-items:center; justify-content:center;
        font-size: 16px; cursor: pointer; transition: all .15s ease;
      }
      #${IDS.modal} .gear:hover { color: #fff; border-color: var(--ml-blue); background: var(--ml-blue-soft); }

      /* ============= ALERTAS ============= */
      #${IDS.modal} .err, #${IDS.sModal} .err {
        color:#ffd8d8; background: var(--ml-red-soft); border:1px solid var(--ml-red);
        padding:12px 14px; border-radius: var(--ml-radius); font-size: 13px; line-height: 1.5;
      }
      #${IDS.modal} .warn { color:#ffe7b8; background: var(--ml-amber-soft); border:1px solid var(--ml-amber); padding:12px 14px; border-radius: var(--ml-radius); }
      #${IDS.sModal} .err  { display:none; margin-bottom:12px; } #${IDS.sModal} .err.show  { display:block; }
      #${IDS.sModal} .ok   { color:#c7f0d6; background: var(--ml-green-soft); border:1px solid var(--ml-green); padding:10px 12px; border-radius:var(--ml-radius); margin-bottom:12px; display:none; font-size:13px; }
      #${IDS.sModal} .ok.show { display:block; }

      /* ============= HOME ============= */
      #${IDS.modal} .homeWrap { display: flex; flex-direction: column; gap: 18px; }

      /* Health banner */
      #${IDS.modal} .healthBanner {
        padding: 12px 16px;
        border-radius: var(--ml-radius);
        background: var(--ml-bg-2);
        border: 1px solid var(--ml-border);
        display: flex; gap: 12px; align-items: flex-start;
      }
      #${IDS.modal} .healthBanner.ok    { border-color: var(--ml-green); background: var(--ml-green-soft); }
      #${IDS.modal} .healthBanner.warn  { border-color: var(--ml-amber); background: var(--ml-amber-soft); }
      #${IDS.modal} .healthBanner.error { border-color: var(--ml-red);   background: var(--ml-red-soft); }
      #${IDS.modal} .healthBanner .hbIcon { font-size: 18px; line-height:1; padding-top: 2px; }
      #${IDS.modal} .healthBanner .hbBody { flex:1; min-width: 0; }
      #${IDS.modal} .healthBanner .hbTitle { font-weight: 700; font-size: 13px; }
      #${IDS.modal} .healthBanner .hbList  { margin: 6px 0 0 0; padding: 0; list-style: none; font-size: 12px; line-height: 1.55; color: var(--ml-text-mut); }
      #${IDS.modal} .healthBanner .hbList li { margin-top: 4px; }
      #${IDS.modal} .healthBanner .hbList .sev { font-weight: 700; }
      #${IDS.modal} .healthBanner .hbList .sev.warn { color: #ffd791; }
      #${IDS.modal} .healthBanner .hbList .sev.err  { color: #ffadad; }
      #${IDS.modal} .healthBanner .hbActions { margin-top: 8px; display:flex; gap:8px; }
      #${IDS.modal} .searchBox {
        display:flex; gap:10px; align-items:stretch;
        padding: 14px 16px;
        background: linear-gradient(180deg, var(--ml-bg-3), var(--ml-bg-2));
        border: 1px solid var(--ml-border);
        border-radius: var(--ml-radius-lg);
      }
      #${IDS.modal} .searchBox input{
        flex:1; min-width: 0;
        background: var(--ml-bg-1); color: var(--ml-text);
        border:1px solid var(--ml-border-2); border-radius: var(--ml-radius-sm);
        padding: 10px 14px; font-family: var(--ml-mono); font-size: 13px;
        outline: none; transition: border-color .15s, box-shadow .15s;
      }
      #${IDS.modal} .searchBox input::placeholder { color: var(--ml-text-dim); font-family: var(--ml-font); }
      #${IDS.modal} .searchBox input:focus{
        border-color: var(--ml-blue); box-shadow: 0 0 0 3px var(--ml-blue-soft);
      }
      #${IDS.modal} .searchBox .hint { color: var(--ml-text-dim); font-size: 11px; margin-top: 6px; }
      #${IDS.modal} .searchResult {
        background: var(--ml-bg-2);
        border: 1px solid var(--ml-border);
        border-radius: var(--ml-radius);
        padding: 14px 16px;
        animation: mlPop .15s ease-out;
      }
      #${IDS.modal} .searchResult .srHead { display:flex; gap:10px; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; }
      #${IDS.modal} .searchResult .srKey { font-weight: 800; font-size: 14px; color: var(--ml-blue); }
      #${IDS.modal} .searchResult .srSum { font-weight: 700; font-size: 14px; margin-top: 4px; }
      #${IDS.modal} .searchResult .srBadges { display:flex; gap:6px; flex-wrap: wrap; margin-top: 8px; }
      #${IDS.modal} .srBadge { display:inline-flex; align-items:center; gap:4px; padding: 3px 10px; border-radius: 999px; background: var(--ml-bg-3); border:1px solid var(--ml-border-2); font-size: 11px; }
      #${IDS.modal} .srBadge.status { background: var(--ml-blue-soft); border-color: var(--ml-blue-line); color:#cfe1ff; }
      #${IDS.modal} .srBadge.prio   { background: var(--ml-amber-soft); border-color: var(--ml-amber); color:#ffeec3; }
      #${IDS.modal} .srBadge.loc    { background: var(--ml-green-soft); border-color: var(--ml-green); color:#bdf0d2; }
      #${IDS.modal} .searchResult .srDesc {
        margin-top: 10px; color: var(--ml-text-mut);
        font-size: 13px; line-height: 1.55;
        white-space: pre-wrap; word-wrap: break-word;
        padding: 10px 12px; background: var(--ml-bg-0); border:1px solid var(--ml-border);
        border-radius: var(--ml-radius-sm);
      }
      #${IDS.modal} .searchResult .srActions { display:flex; gap:8px; margin-top: 14px; flex-wrap: wrap; }

      #${IDS.modal} .homeGrid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 14px;
      }
      @media (min-width: 760px){ #${IDS.modal} .homeGrid{ grid-template-columns: 1fr 1fr; } }
      @media (min-width:1000px){ #${IDS.modal} .homeGrid{ grid-template-columns: 1fr 1fr 1fr; } }

      #${IDS.modal} .homeCard {
        position: relative;
        border: 1px solid var(--ml-border);
        border-radius: var(--ml-radius-lg);
        padding: 18px;
        background: linear-gradient(180deg, var(--ml-bg-2), var(--ml-bg-1));
        display: flex; flex-direction: column; gap: 8px;
        transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
      }
      #${IDS.modal} .homeCard:hover {
        transform: translateY(-2px);
        border-color: var(--ml-blue-line);
        box-shadow: 0 12px 28px rgba(0,0,0,.30), 0 0 0 1px var(--ml-blue-soft) inset;
      }
      #${IDS.modal} .homeCard .hcIcon {
        width: 36px; height: 36px; border-radius: var(--ml-radius-sm);
        background: var(--ml-blue-soft); border: 1px solid var(--ml-blue-line); color: var(--ml-blue);
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 18px; margin-bottom: 4px;
      }
      #${IDS.modal} .homeCard h3 { margin: 2px 0 0; font-size: 15px; font-weight: 700; letter-spacing: .1px; }
      #${IDS.modal} .homeCard p  { margin: 0; color: var(--ml-text-mut); font-size: 12.5px; line-height: 1.5; flex: 1 1 auto; }
      #${IDS.modal} .homeCard .row { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; }

      /* ============= DUPLICATES ============= */
      #${IDS.modal} .topbar {
        position: sticky; top: 0; z-index: 3;
        background: var(--ml-bg-1);
        border-bottom: 1px solid var(--ml-border);
        padding: 14px 0 12px 0;
        margin: -18px 0 16px 0;
      }
      #${IDS.modal} .toprow { display:flex; gap:12px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
      #${IDS.modal} .counts { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      #${IDS.modal} .countpill {
        background: var(--ml-bg-3); border:1px solid var(--ml-border-2);
        border-radius: 999px; padding: 4px 12px; font-size: 12px; color: var(--ml-text-mut);
      }
      #${IDS.modal} .chips { display:flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
      #${IDS.modal} .chip {
        display:inline-flex; align-items:center; gap:6px;
        padding: 5px 12px; border-radius: 999px;
        background: var(--ml-bg-3); border:1px solid var(--ml-border-2);
        color: var(--ml-text); font-size: 12px; font-weight: 600; cursor: pointer; user-select: none;
        transition: all .15s ease;
      }
      #${IDS.modal} .chip:hover { border-color: var(--ml-blue); color:#fff; }
      #${IDS.modal} .chip.active { background: var(--ml-blue-soft); border-color: var(--ml-blue); color:#cfe1ff; }
      #${IDS.modal} .chip.clear  { background: var(--ml-red-soft); border-color: var(--ml-red); color:#ffcfcf; }

      #${IDS.modal} .list { padding: 0; }
      #${IDS.modal} .card {
        border: 1px solid var(--ml-border); border-radius: var(--ml-radius);
        padding: 12px 14px; margin-bottom: 10px;
        background: var(--ml-bg-2);
        transition: border-color .15s, transform .12s, box-shadow .15s;
      }
      #${IDS.modal} .card:hover { border-color: var(--ml-blue-line); transform: translateY(-1px); }
      #${IDS.modal} .card.sel  { border-color: var(--ml-blue); box-shadow: 0 0 0 2px var(--ml-blue-soft) inset; }

      #${IDS.modal} .line1 { display:flex; gap:10px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
      #${IDS.modal} .kblock { min-width: 240px; }
      #${IDS.modal} .key { font-weight: 800; font-size: 14px; color: var(--ml-blue); }
      #${IDS.modal} .summary { font-size: 14px; font-weight: 600; line-height: 1.4; margin-top: 2px; }

      #${IDS.modal} .badges { display:flex; gap:6px; flex-wrap: wrap; align-items: center; }
      #${IDS.modal} .badge {
        display:inline-block; padding: 3px 10px; border-radius: 999px;
        background: var(--ml-bg-3); border:1px solid var(--ml-border-2);
        font-size: 11px; font-weight: 600; color: var(--ml-text-mut);
      }
      #${IDS.modal} .badge.dup    { background: var(--ml-amber-soft); border-color: var(--ml-amber); color:#ffeec3; }
      #${IDS.modal} .badge.strong { background: var(--ml-green-soft); border-color: var(--ml-green); color:#bdf0d2; }
      #${IDS.modal} .badge.ip     { background: var(--ml-blue-soft);  border-color: var(--ml-blue);  color:#cfe1ff; }

      #${IDS.modal} .line2 { margin-top: 10px; display:flex; gap:10px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
      #${IDS.modal} .desc { color: var(--ml-text-mut); font-size: 13px; line-height: 1.5; max-width: 760px; }
      #${IDS.modal} .ids { display:flex; gap:5px; flex-wrap: wrap; align-items: center; }
      #${IDS.modal} .idpill {
        padding: 2px 9px; border-radius: 999px;
        background: var(--ml-amber-soft); border: 1px solid var(--ml-amber);
        color: #ffeec3; font-size: 11px; font-weight: 600;
      }
      #${IDS.modal} .muted { color: var(--ml-text-dim); font-size: 12px; }
      #${IDS.modal} .detailsBtn { background: transparent; border:1px solid var(--ml-border-2); color: var(--ml-text-mut); }
      #${IDS.modal} .detailsBtn:hover { border-color: var(--ml-blue); color:#fff; }
      #${IDS.modal} .expand {
        margin-top: 12px;
        background: var(--ml-bg-0); border: 1px solid var(--ml-border);
        border-radius: var(--ml-radius); padding: 12px 14px;
      }
      #${IDS.modal} .expand .title { font-weight: 700; font-size: 12px; color: var(--ml-text-dim); margin-bottom: 6px; }
      #${IDS.modal} .fulldesc { white-space: pre-wrap; line-height: 1.5; font-size: 13px; color: var(--ml-text); }

      /* ============= DERIVE MODAL ============= */
      #${IDS.dModal} textarea {
        width: 100%; min-height: 96px; resize: vertical;
        background: var(--ml-bg-0); color: var(--ml-text); border: 1px solid var(--ml-border-2);
        border-radius: var(--ml-radius-sm); padding: 12px 14px; font-family: inherit; font-size: 13px;
        outline: none; transition: border-color .15s, box-shadow .15s;
      }
      #${IDS.dModal} textarea:focus { border-color: var(--ml-blue); box-shadow: 0 0 0 3px var(--ml-blue-soft); }
      #${IDS.dModal} .teamgrid { display:flex; gap:8px; flex-wrap: wrap; margin: 12px 0 14px 0; }
      #${IDS.dModal} .teambtn {
        background: var(--ml-bg-3); color: var(--ml-text);
        border:1px solid var(--ml-border-2); border-radius: 999px;
        padding: 7px 14px; cursor: pointer; font-weight: 600; font-size: 12.5px;
        transition: all .15s ease;
      }
      #${IDS.dModal} .teambtn:hover { border-color: var(--ml-blue); }
      #${IDS.dModal} .teambtn.active { background: var(--ml-blue-soft); border-color: var(--ml-blue); color:#cfe1ff; }
      #${IDS.dModal} .row { display:flex; gap:10px; flex-wrap: wrap; align-items: center; justify-content: flex-end; margin-top: 16px; }
      #${IDS.dModal} .btnPrimary { background: var(--ml-blue); color:#fff; border-color: transparent; }
      #${IDS.dModal} .btnSecondary { background: var(--ml-bg-3); }
      #${IDS.dModal} .issWrap {
        margin-top: 16px; padding: 14px;
        border:1px dashed var(--ml-blue); border-radius: var(--ml-radius);
        background: var(--ml-blue-soft);
      }
      #${IDS.dModal} .issLabel { display:flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 13px; line-height: 1.5; }
      #${IDS.dModal} .issLabel input[type="checkbox"] { margin-top: 3px; transform: scale(1.18); accent-color: var(--ml-blue); }
      #${IDS.dModal} .issHint { color: var(--ml-text-mut); font-size: 12px; margin-top: 4px; }

      /* ============= SETTINGS MODAL ============= */
      #${IDS.sModal} .grid { display:grid; grid-template-columns: 1fr; gap: 12px; }
      @media (min-width: 720px){ #${IDS.sModal} .grid { grid-template-columns: 1fr 1fr; gap: 14px; } }
      #${IDS.sModal} .full { grid-column: 1/-1; }
      #${IDS.sModal} label { display:block; font-size: 12px; font-weight: 700; color: var(--ml-text-mut); margin-bottom: 6px; letter-spacing: .15px; }
      #${IDS.sModal} input[type="text"], #${IDS.sModal} input[type="number"], #${IDS.sModal} textarea {
        width: 100%; box-sizing: border-box;
        background: var(--ml-bg-0); color: var(--ml-text); border: 1px solid var(--ml-border-2);
        border-radius: var(--ml-radius-sm); padding: 9px 12px; font-family: inherit; font-size: 13px;
        outline: none; transition: border-color .15s, box-shadow .15s;
      }
      #${IDS.sModal} input:focus, #${IDS.sModal} textarea:focus { border-color: var(--ml-blue); box-shadow: 0 0 0 3px var(--ml-blue-soft); }
      #${IDS.sModal} textarea { min-height: 84px; resize: vertical; font-family: var(--ml-mono); }
      #${IDS.sModal} .hint { font-size: 11px; color: var(--ml-text-dim); margin-top: 4px; line-height: 1.4; }
      #${IDS.sModal} .group {
        border: 1px solid var(--ml-border); border-radius: var(--ml-radius);
        padding: 14px; background: var(--ml-bg-2);
      }
      #${IDS.sModal} .group h4 { margin: 0 0 12px; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; color: var(--ml-text-dim); font-weight: 800; }
      #${IDS.sModal} .checkbox { display:flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
      #${IDS.sModal} .checkbox input { margin: 0; accent-color: var(--ml-blue); transform: scale(1.1); }
      #${IDS.sModal} .actions { display:flex; gap:10px; flex-wrap: wrap; justify-content: flex-end; margin-top: 18px; }
      #${IDS.sModal} .primary { background: var(--ml-blue); border-color: transparent; }

      /* ============= SETTINGS TABS ============= */
      #${IDS.sModal} .ml-s-tabs {
        display: flex; flex-wrap: wrap; gap: 2px;
        padding: 0 18px;
        flex-shrink: 0; /* nao deixa o flex layout comprimir as abas */
        background: var(--ml-bg-1);
        border-bottom: 1px solid var(--ml-border);
        overflow-x: auto; scrollbar-width: thin;
      }
      #${IDS.sModal} .ml-s-tab {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 11px 14px;
        background: transparent; color: var(--ml-text-mut);
        border: 0; border-bottom: 2px solid transparent;
        font: 600 12.5px var(--ml-font);
        cursor: pointer; white-space: nowrap;
        transition: color .15s ease, background .15s ease, border-color .15s ease;
      }
      #${IDS.sModal} .ml-s-tab:hover { color: var(--ml-text); background: rgba(255,255,255,0.025); }
      #${IDS.sModal} .ml-s-tab.active {
        color: var(--ml-text);
        border-bottom-color: var(--ml-blue);
        background: rgba(79,140,255,0.06);
      }
      #${IDS.sModal} .ml-s-tab-ic { font-size: 14px; line-height: 1; }
      #${IDS.sModal} .group[data-tab]:not([data-active]) { display: none; }
      /* Hint do header da tab atual (mostrado dentro da .sb) */
      #${IDS.sModal} .ml-s-tab-hint {
        background: linear-gradient(180deg, var(--ml-bg-2), var(--ml-bg-1));
        border: 1px solid var(--ml-border); border-left: 3px solid var(--ml-blue);
        border-radius: var(--ml-radius-sm);
        padding: 10px 14px; margin-bottom: 14px;
        font-size: 12.5px; color: var(--ml-text-mut); line-height: 1.5;
      }
      #${IDS.sModal} .ml-s-tab-hint b { color: var(--ml-text); }

      /* ============= DEBUG CAPTURE MODAL ============= */
      .mlCapModal .capStatus { padding: 10px 14px; border-radius: var(--ml-radius-sm); margin-bottom: 12px; font-size: 13px; }
      .mlCapModal .capStatus.on  { background: var(--ml-green-soft); border:1px solid var(--ml-green); }
      .mlCapModal .capStatus.off { background: var(--ml-bg-3); border: 1px solid var(--ml-border-2); }
      .mlCapModal .capActions { display:flex; gap:8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center; }
      .mlCapModal .btnPrimary  { padding: 9px 16px; }
      .mlCapModal .btnSecondary{ padding: 6px 12px; font-size: 12px; }
      .mlCapModal .capHint {
        background: var(--ml-bg-0); border: 1px solid var(--ml-border);
        border-radius: var(--ml-radius-sm); padding: 12px 14px; margin-bottom: 12px;
        font-size: 12.5px; line-height: 1.6; color: var(--ml-text-mut);
      }
      .mlCapModal .capHint code { background: #000; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
      .mlCapModal .capHint ol { margin: 8px 0 0 20px; padding: 0; }
      .mlCapModal .capFilters { display:flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
      .mlCapModal .capFilters input[type="text"], .mlCapModal .capFilters input:not([type]) {
        flex:1; min-width: 220px;
        padding: 8px 12px; background: var(--ml-bg-0); color: var(--ml-text);
        border:1px solid var(--ml-border-2); border-radius: var(--ml-radius-sm); font-size: 12.5px;
        outline: none; transition: border-color .15s;
      }
      .mlCapModal .capFilters input:focus { border-color: var(--ml-blue); box-shadow: 0 0 0 3px var(--ml-blue-soft); }
      .mlCapModal .capRadio { display:flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; color: var(--ml-text-mut); }
      .mlCapModal .capRadio input { accent-color: var(--ml-blue); }
      .mlCapModal .capList { display:flex; flex-direction: column; gap: 6px; }
      .mlCapModal .capEmpty { color: var(--ml-text-dim); text-align: center; padding: 32px; background: var(--ml-bg-0); border-radius: var(--ml-radius-sm); border: 1px dashed var(--ml-border-2); }
      .mlCapModal .capItem  { background: var(--ml-bg-0); border:1px solid var(--ml-border); border-radius: var(--ml-radius-sm); padding: 10px 12px; }
      .mlCapModal .capItemHead { display:flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .mlCapModal .capStat { padding: 3px 10px; border-radius: 6px; font-weight: 800; font-size: 11px; font-family: var(--ml-mono); min-width: 36px; text-align: center; }
      .mlCapModal .capStat.ok   { background: var(--ml-green-soft); color: #94f0b8; }
      .mlCapModal .capStat.warn { background: var(--ml-amber-soft); color: #ffe09e; }
      .mlCapModal .capStat.fail { background: var(--ml-red-soft);   color: #ffadad; }
      .mlCapModal .capSize { font-size: 11px; color: var(--ml-text-dim); font-family: var(--ml-mono); }
      .mlCapModal .capUrl  { flex:1; min-width: 200px; font-family: var(--ml-mono); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ml-text-mut); }
      .mlCapModal .capTime { font-size: 11px; color: var(--ml-text-dim); font-family: var(--ml-mono); }
      .mlCapModal .capBody { margin-top: 10px; background: #000; padding: 10px; border-radius: var(--ml-radius-sm); max-height: 400px; overflow: auto; }
      .mlCapModal .capBody pre { margin: 0; font-size: 11px; color: #cbd5e1; white-space: pre-wrap; word-break: break-all; font-family: var(--ml-mono); }
      .mlCapModal .capLabel { font-size: 11px; font-weight: 700; color: var(--ml-text-dim); margin-bottom: 6px; }

      /* ============= SCROLLBAR ============= */
      #${IDS.modal} *::-webkit-scrollbar, #${IDS.dModal} *::-webkit-scrollbar, #${IDS.sModal} *::-webkit-scrollbar, .mlCapModal *::-webkit-scrollbar { width: 10px; height: 10px; }
      #${IDS.modal} *::-webkit-scrollbar-thumb, #${IDS.dModal} *::-webkit-scrollbar-thumb, #${IDS.sModal} *::-webkit-scrollbar-thumb, .mlCapModal *::-webkit-scrollbar-thumb { background: var(--ml-bg-4); border-radius: 999px; }
      #${IDS.modal} *::-webkit-scrollbar-thumb:hover, #${IDS.dModal} *::-webkit-scrollbar-thumb:hover, #${IDS.sModal} *::-webkit-scrollbar-thumb:hover, .mlCapModal *::-webkit-scrollbar-thumb:hover { background: var(--ml-border-hi); }
      #${IDS.modal} *::-webkit-scrollbar-track, #${IDS.dModal} *::-webkit-scrollbar-track, #${IDS.sModal} *::-webkit-scrollbar-track, .mlCapModal *::-webkit-scrollbar-track { background: transparent; }

      /* ============= LOADING SPINNER ============= */
      .mlSpin {
        display:inline-block; width: 14px; height: 14px;
        border: 2px solid var(--ml-border-hi); border-top-color: var(--ml-blue);
        border-radius: 50%; animation: mlSpin .8s linear infinite; vertical-align: middle;
      }
      @keyframes mlSpin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(st);
  }
