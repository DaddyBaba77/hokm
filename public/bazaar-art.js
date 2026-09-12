/* Bazaar — the little picture on every square.
 *
 * All original line-and-silhouette drawings, one per space, in a 24×24 box.
 * Three classes do the work:
 *   .ink   the dark silhouette
 *   .tint  the one accent shape, painted in that square's colour group
 *   .hole  cut back out to the paper, for doors and windows
 *   .line  a drawn stroke
 */
window.BazaarArt = (function () {
  const wrap = (body) => `<svg viewBox="0 0 24 24" class="mo">${body}</svg>`;
  const ground = '<path class="line gr" d="M2.5 20.6h19"/>';

  const ART = {
    // ── coppersmiths ─────────────────────────────────────────────
    pots: `
      <circle class="tint" cx="8.6" cy="16.2" r="4.1"/>
      <path class="ink" d="M6.7 10.9h3.8v2.4H6.7z"/>
      <path class="ink" d="M5.8 10.2h5.6v1.2H5.8z"/>
      <circle class="ink" cx="16.4" cy="17.4" r="2.9"/>
      <path class="ink" d="M15.1 13.4h2.6v1.8h-2.6z"/>
      <path class="ink" d="M18.2 5.6l3.6 1.1-.7 2.3-3.6-1.1z"/>
      <path class="line" d="M18 7.6l-3.4 4.2"/>`,
    hides: `
      <path class="line" d="M4.6 4.4v15.6M19.4 4.4v15.6M3.8 5h16.4"/>
      <path class="tint" d="M8.2 7.4c2-1.3 5.2-1.1 6.9.7 1.6 1.7 1 3.8-.1 5.4-1.1 1.6-.7 3.4-2.4 3.7-1.9.3-2.3-1.6-3.7-2.9-2-1.9-3-5.2-.7-6.9z"/>
      <path class="line" d="M8.6 8.8l2.6 2.4M13.4 9l-1.6 2.6"/>`,

    // ── spice row ────────────────────────────────────────────────
    spice: `${ground}
      <path class="ink" d="M3.4 20.4l2.7-6.6 2.7 6.6z"/>
      <path class="tint" d="M8.7 20.4L12 12l3.3 8.4z"/>
      <path class="ink" d="M15.6 20.4l2.5-5.6 2.5 5.6z"/>
      <path class="line thin" d="M12 12V9.4"/>`,
    lantern: `
      <path class="line" d="M12 2.4v2.6"/>
      <path class="ink" d="M8.4 5h7.2l-1.1 1.9H9.5z"/>
      <path class="tint" d="M9.2 7h5.6l1.5 7.6a4.3 4.3 0 0 1-8.6 0z"/>
      <path class="hole" d="M11 9.2h2v4h-2z"/>
      <circle class="ink" cx="12" cy="19.9" r="1.2"/>
      <path class="line thin" d="M5.6 10.4L3.4 9.2M18.4 10.4l2.2-1.2M5.6 14l-2.2.8M18.4 14l2.2.8"/>`,
    flask: `
      <path class="ink" d="M10.4 2.6h3.2v1.9h-3.2z"/>
      <path class="tint" d="M11 5.1h2v4.3l2.9 3.8a4.9 4.9 0 0 1-3.9 7.8 4.9 4.9 0 0 1-3.9-7.8L11 9.4z"/>
      <path class="hole" d="M10.2 15.4a2.2 2.2 0 0 0 2.6 2.4"/>
      <path class="ink" d="M19.6 5.8c1.1 1.6 1.7 2.5 1.7 3.3a1.7 1.7 0 1 1-3.4 0c0-.8.6-1.7 1.7-3.3z"/>`,

    // ── dyers ────────────────────────────────────────────────────
    loom: `
      <path class="line" d="M4.4 3.6v16.8M19.6 3.6v16.8M3.6 4.4h16.8"/>
      <path class="line thin" d="M7.6 5v14M12 5v14M16.4 5v14"/>
      <path class="tint" d="M6.6 8.4h10.8v6.8c-1.8.9-3.6-.6-5.4.3s-3.6.5-5.4-.5z"/>`,
    vats: `${ground}
      <path class="tint" d="M3.4 11.6h8.2l-1 8a1.1 1.1 0 0 1-1.1 1H5.5a1.1 1.1 0 0 1-1.1-1z"/>
      <path class="ink" d="M13 14.2h7.6l-.9 5.6a1 1 0 0 1-1 .8h-3.8a1 1 0 0 1-1-.8z"/>
      <path class="line" d="M16.8 4.6l-2.1 9.2"/>
      <path class="ink" d="M15.9 3.6l2.9.8-1 3-2.8-.9z"/>
      <path class="line thin" d="M3.8 13.4h7.4"/>`,
    dome: `
      <path class="ink" d="M6.1 20.4v-8.8h11.8v8.8z"/>
      <path class="hole" d="M10.4 20.4v-4.3a1.6 1.6 0 0 1 3.2 0v4.3z"/>
      <path class="tint" d="M12 3.2c4.3 2.5 6.4 5.5 6.4 8.4H5.6c0-2.9 2.1-5.9 6.4-8.4z"/>
      <path class="line thin lt" d="M12 3.6v8M8.6 5.4c-1.2 1.9-1.8 4-1.8 6M15.4 5.4c1.2 1.9 1.8 4 1.8 6"/>
      <circle class="ink" cx="12" cy="2.4" r="1"/>`,

    // ── orchard ──────────────────────────────────────────────────
    awning: `${ground}
      <path class="line" d="M5.2 20.4v-9.2M18.8 20.4v-9.2"/>
      <path class="tint" d="M2.8 11.2l2.2-3.8h14l2.2 3.8z"/>
      <path class="line thin lt" d="M8.4 7.6l-1.2 3.6M12 7.6v3.6M15.6 7.6l1.2 3.6"/>
      <path class="ink" d="M7.4 20.4v-3.2h3.4v3.2zM13.2 20.4v-4.4h3.4v4.4z"/>`,
    tree: `${ground}
      <path class="ink" d="M11.2 20.4v-6.6h1.6v6.6z"/>
      <path class="tint" d="M12 3.6c3.7 0 6.7 2.6 6.7 5.7S15.7 15 12 15s-6.7-2.6-6.7-5.7S8.3 3.6 12 3.6z"/>
      <ellipse class="ink" cx="9.2" cy="8.4" rx="1.5" ry="1.1" transform="rotate(-18 9.2 8.4)"/>
      <ellipse class="ink" cx="14.4" cy="7.6" rx="1.5" ry="1.1" transform="rotate(14 14.4 7.6)"/>
      <ellipse class="ink" cx="12.4" cy="11.4" rx="1.5" ry="1.1" transform="rotate(-6 12.4 11.4)"/>`,
    pomegranate: `
      <circle class="tint" cx="12" cy="13.8" r="6.4"/>
      <path class="ink" d="M10 7.2l.7-2.8 1 2 1-2.3.9 2.4 1.2-1.8-.2 2.8z"/>
      <circle class="ink" cx="10.2" cy="13" r="1"/>
      <circle class="ink" cx="13.4" cy="12.2" r="1"/>
      <circle class="ink" cx="12.2" cy="15.6" r="1"/>
      <circle class="ink" cx="14.8" cy="15.4" r="1"/>`,

    // ── weavers ──────────────────────────────────────────────────
    carpet: `
      <path class="line" d="M2.6 4.2h18.8"/>
      <path class="tint" d="M4.8 5h14.4v12.6H4.8z"/>
      <path class="hole" d="M7 7.2h10v8.2H7z"/>
      <path class="ink" d="M12 8.4l3 3-3 3-3-3z"/>
      <path class="line thin" d="M6 17.6v2.2M8.4 17.6v2.2M10.8 17.6v2.2M13.2 17.6v2.2M15.6 17.6v2.2M18 17.6v2.2"/>`,
    mirror: `
      <path class="ink" d="M4.8 20.4v-9a7.2 7.2 0 0 1 14.4 0v9z"/>
      <path class="tint" d="M7.2 20.4v-8.8a4.8 4.8 0 0 1 9.6 0v8.8z"/>
      <path class="line thin lt" d="M12 7v13.4M9.4 8.4v12M14.6 8.4v12"/>
      <path class="hole" d="M11.4 20.4v-3.6h1.2v3.6z"/>`,
    bird: `
      <path class="line" d="M2.6 18.6c4.2.2 6.6-.8 9.4-1.4"/>
      <path class="tint" d="M13.6 8.4c2.8 0 4.6 2.1 4.6 4.3 0 2.5-2.1 4.2-4.6 4.2-2.1 0-3.8-1-3.8-2.8 0-2.8 1.1-5.7 3.8-5.7z"/>
      <circle class="ink" cx="15.4" cy="9.4" r="2.4"/>
      <path class="ink" d="M17.6 9l3 .9-3 1z"/>
      <path class="ink" d="M17.9 13.6l3.7 1.5-3.5 1.7z"/>
      <circle class="hole" cx="15.8" cy="8.9" r=".6"/>`,

    // ── tilemakers ───────────────────────────────────────────────
    tilepanel: `
      <path class="ink" d="M3.6 3.6h16.8v16.8H3.6z"/>
      <path class="tint" d="M12 5.2l1.9 3.3 3.7.4-2.5 2.8.7 3.7L12 13.8l-3.8 1.6.7-3.7-2.5-2.8 3.7-.4z"/>
      <circle class="hole" cx="6" cy="6" r=".9"/>
      <circle class="hole" cx="18" cy="6" r=".9"/>
      <circle class="hole" cx="6" cy="18" r=".9"/>
      <circle class="hole" cx="18" cy="18" r=".9"/>`,
    minaret: `${ground}
      <path class="tint" d="M9.9 20.4V7.4h4.2v13z"/>
      <path class="ink" d="M8.4 11.4h7.2v1.8H8.4z"/>
      <path class="ink" d="M12 1.8l2.8 4.6H9.2z"/>
      <circle class="ink" cx="12" cy="1.2" r=".9"/>
      <path class="ink" d="M8.6 18.6h6.8v1.8H8.6z"/>
      <path class="hole" d="M11.2 14.6h1.6v3h-1.6z"/>`,
    rosegarden: `
      <path class="ink" d="M3.4 15.4h17.2v5H3.4z"/>
      <path class="hole" d="M5.4 16.8h13.2v2.2H5.4z"/>
      <path class="line" d="M7.4 15v-3.6M12 15V9.8M16.6 15v-3.2"/>
      <circle class="tint" cx="7.4" cy="10" r="2.1"/>
      <circle class="tint" cx="12" cy="8.2" r="2.5"/>
      <circle class="tint" cx="16.6" cy="9.8" r="2.1"/>
      <path class="ink" d="M5.6 13.4l-2 .8 2 .8zM18.4 13.4l2 .8-2 .8z"/>`,

    // ── scholars ─────────────────────────────────────────────────
    astrolabe: `
      <circle class="line thick" cx="12" cy="12.6" r="7.6"/>
      <circle class="tint" cx="12" cy="12.6" r="5.2"/>
      <circle class="hole" cx="12" cy="12.6" r="2.6"/>
      <path class="line" d="M4.4 12.6h15.2M12 5v15.2"/>
      <path class="ink" d="M6.9 7.2l10.5 10.5-1 1L5.9 8.2z"/>
      <path class="ink" d="M10.8 2.2h2.4v2.4h-2.4z"/>
      <circle class="ink" cx="12" cy="12.6" r="1"/>`,
    book: `
      <path class="ink" d="M2.6 7.4c2.8-1.7 5.9-1.7 9.4 0v11c-3.5-1.7-6.6-1.7-9.4 0z"/>
      <path class="tint" d="M21.4 7.4c-2.8-1.7-5.9-1.7-9.4 0v11c3.5-1.7 6.6-1.7 9.4 0z"/>
      <path class="line thin lt" d="M14.2 10.4h5M14.2 12.6h5M14.2 14.8h3.4"/>
      <path class="ink" d="M17.4 2.4l3.8 2.6-7 4.4z"/>`,
    peacock: `
      <path class="tint" d="M12 6.2a9.4 9.4 0 0 1 9.4 9.4h-2.6A6.8 6.8 0 0 0 12 8.8a6.8 6.8 0 0 0-6.8 6.8H2.6A9.4 9.4 0 0 1 12 6.2z"/>
      <circle class="ink" cx="5.6" cy="17.4" r="1.3"/>
      <circle class="ink" cx="12" cy="19.4" r="1.3"/>
      <circle class="ink" cx="18.4" cy="17.4" r="1.3"/>
      <path class="ink" d="M12 10.2c1.8 0 3 1.5 3 3.4 0 2.6-1.4 5-3 6.8-1.6-1.8-3-4.2-3-6.8 0-1.9 1.2-3.4 3-3.4z"/>
      <circle class="hole" cx="12" cy="13.4" r="1.1"/>
      <path class="line thin" d="M10.6 8.2l-.8-2.4M12 8v-2.6M13.4 8.2l.8-2.4"/>`,

    // ── the citadel ──────────────────────────────────────────────
    palace: `${ground}
      <path class="ink" d="M2.6 8.6L12 3.4l9.4 5.2v1.6H2.6z"/>
      <path class="ink" d="M3.6 11.2h2.6v8.4H3.6zM8.4 11.2H11v8.4H8.4zM13 11.2h2.6v8.4H13zM17.8 11.2h2.6v8.4h-2.6z"/>
      <path class="tint" d="M10.2 19.6v-4.4a1.8 1.8 0 0 1 3.6 0v4.4z"/>
      <circle class="tint" cx="12" cy="6.6" r="1.4"/>`,
    gate: `
      <path class="ink" d="M3.4 20.4V9.6a8.6 8.6 0 0 1 17.2 0v10.8z"/>
      <path class="tint" d="M7.4 20.4v-9.6a4.6 4.6 0 0 1 9.2 0v9.6z"/>
      <path class="hole" d="M11.5 20.4v-6.6h1v6.6z"/>
      <circle class="hole" cx="9.6" cy="15.4" r=".8"/>
      <circle class="hole" cx="14.4" cy="15.4" r=".8"/>
      <path class="line thin lt" d="M5.4 8.4a8 8 0 0 1 13.2 0"/>`,

    // ── the caravan roads ────────────────────────────────────────
    caravan: `${ground}
      <path class="ink" d="M2.6 20.4V8.4h3.6v12zM17.8 20.4V8.4h3.6v12z"/>
      <path class="ink" d="M4.4 5.6l2.4 3H2z M19.6 5.6l2.4 3h-4.8z"/>
      <path class="ink" d="M6.2 20.4v-7.8a5.8 5.8 0 0 1 11.6 0v7.8z"/>
      <path class="tint" d="M9.2 20.4v-5.2a2.8 2.8 0 0 1 5.6 0v5.2z"/>
      <path class="line thin lt" d="M7.8 11.6a4.6 4.6 0 0 1 8.4 0"/>`,

    // ── the utilities ────────────────────────────────────────────
    streetlamp: `${ground}
      <path class="ink" d="M11.2 20.4V9.6h1.6v10.8z"/>
      <path class="ink" d="M8.6 20.4h6.8v1.2H8.6z"/>
      <path class="tint" d="M8.2 9.6l1.7-4.8h4.2l1.7 4.8z"/>
      <path class="hole" d="M10.4 8.4l.9-2.4h1.4l.9 2.4z"/>
      <path class="line thin lt" d="M4.6 4.4l1.8 1.6M19.4 4.4l-1.8 1.6M3.6 9.6h2.2M20.4 9.6h-2.2"/>`,
    qanat: `
      <path class="line thick" d="M2 9.4h20"/>
      <path class="ink" d="M5.4 9.4a2.2 2.2 0 0 1 4.4 0zM14.2 9.4a2.2 2.2 0 0 1 4.4 0z"/>
      <path class="line thin" d="M7.6 9.8v5.2M16.4 9.8v3.4"/>
      <path class="tint" d="M2 17.2c3.3 0 3.3-2.6 6.7-2.6s3.3 2.6 6.6 2.6 3.4-2.6 6.7-2.6v4.4c-3.3 0-3.4 2.6-6.7 2.6s-3.3-2.6-6.6-2.6S5.3 21.6 2 21.6z"/>`,

    // ── taxes ────────────────────────────────────────────────────
    tollgate: `${ground}
      <path class="ink" d="M3.4 20.4v-9.8h2.8v9.8zM17.8 20.4v-9.8h2.8v9.8z"/>
      <path class="tint" d="M2 12.4h20v2.8H2z"/>
      <path class="hole" d="M6.4 12.4h2.4v2.8H6.4zM11.4 12.4h2.4v2.8h-2.4zM16.4 12.4h2.4v2.8h-2.4z"/>
      <circle class="ink" cx="12" cy="6.6" r="3.2"/>
      <path class="hole" d="M11.4 4.6h1.2v4h-1.2z"/>`,
    jewel: `
      <path class="ink" d="M7.2 4.4h9.6l4 5.4L12 20.8 3.2 9.8z"/>
      <path class="tint" d="M9.6 9.8h4.8L12 17.2z"/>
      <path class="line thin lt" d="M3.2 9.8h17.6M7.2 4.4l2.4 5.4M16.8 4.4l-2.4 5.4"/>`,

    // ── the two decks ────────────────────────────────────────────
    fortune: `
      <path class="ink" d="M12 1.6a1 1 0 0 1 1 1v1.2h-2V2.6a1 1 0 0 1 1-1z"/>
      <circle class="line thick" cx="12" cy="13" r="8.2"/>
      <circle class="tint" cx="12" cy="13" r="6"/>
      <path class="hole" d="M12 8.6c3.4 0 5.6 3 6.2 4.4-.6 1.4-2.8 4.4-6.2 4.4s-5.6-3-6.2-4.4c.6-1.4 2.8-4.4 6.2-4.4z"/>
      <circle class="ink" cx="12" cy="13" r="2.4"/>
      <circle class="hole" cx="11.2" cy="12.2" r=".8"/>`,
    chest: `
      <path class="ink" d="M2.6 10.2a9.4 9.4 0 0 1 18.8 0z"/>
      <path class="tint" d="M2.6 10.2h18.8v8.8H2.6z"/>
      <path class="ink" d="M2.6 9.6h18.8v1.6H2.6z"/>
      <path class="ink" d="M6.4 4.6h2.2v14.4H6.4zM15.4 4.6h2.2v14.4h-2.2z"/>
      <path class="ink" d="M10.6 11.6h2.8v3.4h-2.8z"/>
      <circle class="hole" cx="12" cy="13" r=".8"/>`,

    // ── the corners ──────────────────────────────────────────────
    go: `
      <path class="ink" d="M3.4 20.4V9a8.6 8.6 0 0 1 17.2 0v11.4h-3.4V9a5.2 5.2 0 0 0-10.4 0v11.4z"/>
      <path class="tint" d="M10.6 6.6h9.8v4.4h-9.8z"/>
      <path class="tint" d="M11.4 4.2l-5 4.6 5 4.6z"/>`,
    cell: `
      <path class="ink" d="M3.4 4.4h17.2v16H3.4z"/>
      <path class="hole" d="M5.6 6.6h12.8v11.6H5.6z"/>
      <path class="ink" d="M8.2 6.6h1.6v11.6H8.2zM14.2 6.6h1.6v11.6h-1.6z"/>
      <path class="ink" d="M5.6 11.4h12.8v1.6H5.6z"/>
      <path class="tint" d="M11.2 13.8h1.6v4.4h-1.6z"/>`,
    teahouse: `
      <path class="line thin lt" d="M8 4.4c1.2-1 .2-2 1.4-3M12 4c1.2-1 .2-2 1.4-3"/>
      <path class="tint" d="M4.6 9.6h10.2v4.6a5.1 5.1 0 0 1-10.2 0z"/>
      <path class="ink" d="M14.6 10.8h2.6a2.9 2.9 0 0 1 0 5.8h-1.2"/>
      <path class="ink" d="M3.6 8.4h12.2v1.8H3.6z"/>
      <path class="ink" d="M3.2 20h17.6v1.6H3.2z"/>
      <path class="ink" d="M17.6 14.6h3.2v5.2h-3.2z"/>`,
    marched: `
      <path class="ink" d="M9.6 3.4h11v17h-11z"/>
      <path class="hole" d="M11.4 5.4h7.4v13h-7.4z"/>
      <path class="ink" d="M13.6 5.4h1.6v13h-1.6z"/>
      <path class="ink" d="M9.6 10.8h11v1.6h-11z"/>
      <path class="tint" d="M1.6 9.6h6.8v4.4H1.6z"/>
      <path class="tint" d="M9.4 11.8l-4.6-4.4v8.8z"/>`,
  };

  /** Which drawing belongs on which square. */
  const BY_SPACE = {
    0: 'go', 1: 'pots', 2: 'chest', 3: 'hides', 4: 'tollgate', 5: 'caravan',
    6: 'spice', 7: 'fortune', 8: 'lantern', 9: 'flask', 10: 'cell',
    11: 'loom', 12: 'streetlamp', 13: 'vats', 14: 'dome', 15: 'caravan',
    16: 'awning', 17: 'chest', 18: 'tree', 19: 'pomegranate', 20: 'teahouse',
    21: 'carpet', 22: 'fortune', 23: 'mirror', 24: 'bird', 25: 'caravan',
    26: 'tilepanel', 27: 'minaret', 28: 'qanat', 29: 'rosegarden', 30: 'marched',
    31: 'astrolabe', 32: 'book', 33: 'chest', 34: 'peacock', 35: 'caravan',
    36: 'fortune', 37: 'palace', 38: 'jewel', 39: 'gate',
  };

  return {
    /** The drawing for a space, ready to drop into the DOM. */
    motif(i) {
      const key = BY_SPACE[i];
      return key && ART[key] ? wrap(ART[key]) : '';
    },
    has(i) { return !!BY_SPACE[i]; },
  };
})();
