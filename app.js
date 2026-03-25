(() => {
  const THUMBNAIL_COUNT = 5;
  const THEME_STORAGE_KEY = "theme";
  const DEFAULT_CURRENCY = "MYR";
  const DEFAULT_THEME = "light";
  const DEFAULT_PAGE_TRANSITION = "pan";

  const els = {
    loadingState: document.getElementById("loadingState"),
    landingScreen: document.getElementById("landingScreen"),
    landingBg: document.getElementById("landingBg"),
    landingLead: document.getElementById("landingLead"),
    landingTitleWrap: document.getElementById("landingTitleImageWrap"),
    landingTitleImage: document.getElementById("landingTitleImage"),
    landingTitle: document.getElementById("landingTitle"),
    landingSubtitle: document.getElementById("landingSubtitle"),
    startBrowsingBtn: document.getElementById("startBrowsingBtn"),
    catalogLayout: document.getElementById("catalogLayout"),
    sidebar: document.getElementById("sidebar"),
    sidebarTitle: document.getElementById("sidebarTitle"),
    themeToggle: document.getElementById("themeToggle"),
    sidebarClose: document.getElementById("sidebarClose"),
    sidebarBackdrop: document.getElementById("sidebarBackdrop"),
    sidebarSearchInput: document.getElementById("sidebarSearchInput"),
    sidebarSearchClear: document.getElementById("sidebarSearchClear"),
    sidebarSearchBlock: document.getElementById("sidebarSearchBlock"),
    sidebarSearchResults: document.getElementById("sidebarSearchResults"),
    sectionList: document.getElementById("sectionList"),
    qrImage: document.getElementById("qrImage"),
    qrUrl: document.getElementById("qrUrl"),
    openSidebarBtn: document.getElementById("openSidebarBtn"),
    pageWrapper: document.getElementById("pageWrapper"),
    pageCarousel: document.getElementById("pageCarousel"),
    pagePlaceholder: document.getElementById("pagePlaceholder"),
    prevPageImage: document.getElementById("prevPageImage"),
    pageImage: document.getElementById("pageImage"),
    nextPageImage: document.getElementById("nextPageImage"),
    viewerCartBar: document.getElementById("viewerCartBar"),
    viewerCartItem: document.getElementById("viewerCartItem"),
    viewerCartPrice: document.getElementById("viewerCartPrice"),
    addToCartBtn: document.getElementById("addToCartBtn"),
    thumbnailScroll: document.getElementById("thumbnailScroll"),
    mobileActiveSection: document.getElementById("mobileActiveSection"),
    prevPageBtn: document.getElementById("prevPageBtn"),
    nextPageBtn: document.getElementById("nextPageBtn"),
    pageDisplayBtn: document.getElementById("pageDisplayBtn"),
    cartToggle: document.getElementById("cartToggle"),
    cartBadge: document.getElementById("cartBadge"),
    whatsappLink: document.getElementById("whatsappLink"),
    toastSnackbar: document.getElementById("toastSnackbar"),
    cartModalOverlay: document.getElementById("cartModalOverlay"),
    cartModalBody: document.getElementById("cartModalBody"),
    cartModalClose: document.getElementById("cartModalClose"),
    cartTotalItems: document.getElementById("cartTotalItems"),
    cartTotalPrice: document.getElementById("cartTotalPrice"),
    submitOrderLink: document.getElementById("submitOrderLink"),
    cartModalHint: document.getElementById("cartModalHint"),
  };

  const state = {
    config: null,
    pages: [],
    sections: [],
    zoneGroups: [],
    currentPage: 1,
    currentZoom: 1,
    showLanding: true,
    sidebarVisible: false,
    searchQuery: "",
    isMobile: window.innerWidth < 992,
    theme: DEFAULT_THEME,
    hasUserSelectedTheme: false,
    loadingCurrentImage: true,
    lastLoadedSrc: null,
    cartItems: {},
    cartStorageKey: `standalone-pdf-catalog:cart:${window.location.pathname || "default"}`,
    isCartOpen: false,
    collapsedZones: new Set(),
    suppressClickUntil: 0,
    toastTimeout: null,
    pageStartAt: 1,
    browseStartAt: 1,
    pan: {
      gesture: null,
      isSettling: false,
      pendingDelta: 0,
    },
    pendingImageAnimation: null,
  };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function padPageNumber(value, minLength = 3) {
    return String(value).padStart(minLength, "0");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeTheme(candidate) {
    const raw = `${candidate ?? ""}`.trim().toLowerCase();
    if (raw === "dark") return "dark";
    if (raw === "light" || raw === "bright") return "light";
    return null;
  }

  function normalizePageTransition(candidate) {
    const raw = `${candidate ?? ""}`.trim().toLowerCase();
    if (raw === "flip") return "flip";
    if (raw === "pan" || raw === "slide") return "pan";
    return null;
  }

  function readStoredTheme() {
    try {
      return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    } catch (error) {
      return null;
    }
  }

  function writeStoredTheme(theme) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      // Ignore storage failures.
    }
  }

  function stripTrailingPunctuation(value) {
    return String(value ?? "").replace(/[.,!?;:\s]+$/u, "");
  }

  function formatCartPrice(currency, amount) {
    const safeCurrency = `${currency ?? DEFAULT_CURRENCY}`.trim() || DEFAULT_CURRENCY;
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) return "Free of charge";
    const formatted = Math.round(numeric) === numeric ? String(numeric) : numeric.toFixed(2);
    return `${safeCurrency} ${formatted}`;
  }

  function toFriendlyItemLabel(value) {
    const raw = `${value ?? ""}`.trim();
    if (!raw) return "";
    return raw
      .split(/[\s_-]+/u)
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(" ");
  }

  function getItemDisplayLabel(value) {
    const explicit = `${value?.label ?? ""}`.trim();
    if (explicit) return explicit;
    const id = `${value?.id ?? ""}`.trim();
    return toFriendlyItemLabel(id) || id;
  }

  function parseItemFromAssetPath(assetPath) {
    const raw = `${assetPath ?? ""}`.trim();
    if (!raw) return null;
    const filename = raw.split(/[/?#]/u).pop() || "";
    const withoutExtension = filename.replace(/\.[^.]+$/u, "");
    const match = withoutExtension.match(/^(.*)_([0-9]+(?:\.[0-9]+)?)$/u);
    if (!match) return null;
    const id = `${match[1] ?? ""}`.trim() || withoutExtension;
    const numeric = Number(match[2]);
    return {
      id,
      unitPrice: Number.isFinite(numeric) ? Math.max(0, numeric) : 0,
      assetPath: raw,
    };
  }

  function buildWhatsAppMessageBody(messageBase, projectName) {
    const base = stripTrailingPunctuation(messageBase || "").trim();
    const project = `${projectName ?? ""}`.trim();
    if (!base) return project;
    if (!project) return base;
    return `${base}, ${project}`;
  }

  function getDisplayedPageNumber(actualPage) {
    const totalPages = state.pages.length;
    const offsetPage = actualPage - (state.pageStartAt - 1);
    if (offsetPage < 1) return 1;
    if (offsetPage > totalPages) return totalPages;
    return offsetPage;
  }

  function getActualPageFromDisplayed(displayedPage) {
    const rounded = Math.round(Number(displayedPage));
    if (!Number.isFinite(rounded)) return null;
    const totalPages = state.pages.length;
    const clampedDisplayed = clamp(rounded, 1, totalPages);
    const actualPage = clampedDisplayed + (state.pageStartAt - 1);
    return clamp(actualPage, 1, totalPages);
  }

  function wrapPage(page) {
    const total = state.pages.length;
    if (total <= 0) return 1;
    if (page < 1) return total;
    if (page > total) return 1;
    return page;
  }

  function getDisplayedPageUrl(displayedPage) {
    const url = new URL(window.location.href);
    url.searchParams.set("page", String(displayedPage));
    return url.toString();
  }

  function readPageQueryParam() {
    return new URLSearchParams(window.location.search).get("page");
  }

  function normalizeCartItems(candidate) {
    if (!candidate || typeof candidate !== "object") return {};
    return Object.entries(candidate).reduce((acc, [key, value]) => {
      const id = `${value?.id ?? key ?? ""}`.trim();
      if (!id) return acc;
      const quantity = Math.max(0, Math.round(Number(value?.quantity)));
      if (!quantity) return acc;
      acc[id] = {
        id,
        quantity,
        label: `${value?.label ?? ""}`.trim() || null,
        unitPrice: Number.isFinite(Number(value?.unitPrice)) ? Math.max(0, Number(value.unitPrice)) : 0,
        assetPath: typeof value?.assetPath === "string" ? value.assetPath : null,
      };
      return acc;
    }, {});
  }

  function readCartStorage() {
    try {
      const raw = window.localStorage.getItem(state.cartStorageKey);
      if (!raw) return {};
      return normalizeCartItems(JSON.parse(raw));
    } catch (error) {
      return {};
    }
  }

  function writeCartStorage() {
    try {
      window.localStorage.setItem(state.cartStorageKey, JSON.stringify(state.cartItems));
    } catch (error) {
      // Ignore storage failures.
    }
  }

  function getSwipeVelocity(samples) {
    if (!Array.isArray(samples) || samples.length < 2) return 0;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const dt = last.t - first.t;
    if (!Number.isFinite(dt) || dt <= 0) return 0;
    return (last.x - first.x) / dt;
  }

  function currentPageEntry() {
    return state.pages[state.currentPage - 1] || null;
  }

  function getCurrentCartCandidate() {
    if (!state.config?.addToCartMode) return null;
    const page = currentPageEntry();
    if (!page) return null;
    const explicitItemId = `${page.itemId ?? ""}`.trim();
    const explicitName = `${page.name ?? ""}`.trim();
    const hasExplicitUnitPrice = page.unitPrice !== null && page.unitPrice !== undefined && `${page.unitPrice}`.trim() !== "";
    const parsedItem = parseItemFromAssetPath(page.src || "");
    if (explicitItemId || hasExplicitUnitPrice) {
      const numericUnitPrice = Number(page.unitPrice);
      return {
        id: explicitItemId || explicitName || parsedItem?.id || `page-${padPageNumber(state.currentPage)}`,
        label: explicitName || null,
        unitPrice: Number.isFinite(numericUnitPrice) ? Math.max(0, numericUnitPrice) : parsedItem?.unitPrice || 0,
        assetPath: page.thumb || page.src || null,
      };
    }
    if (!parsedItem) return null;
    return {
      ...parsedItem,
      label: explicitName || null,
    };
  }

  function getCartEntries() {
    return Object.values(state.cartItems).sort((left, right) =>
      left.id.localeCompare(right.id, "en", { sensitivity: "base" })
    );
  }

  function getCartCount() {
    return getCartEntries().reduce((sum, entry) => sum + entry.quantity, 0);
  }

  function getCartTotal() {
    return getCartEntries().reduce((sum, entry) => sum + entry.quantity * entry.unitPrice, 0);
  }

  function getActiveSection() {
    return state.sections.find((section) => {
      return state.currentPage >= section.page && state.currentPage <= section.endPage;
    }) || null;
  }

  function buildZoneGroups() {
    const groups = [];
    state.sections.forEach((section) => {
      const label = section.zone || null;
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.label !== label) {
        groups.push({ label, sections: [] });
      }
      groups[groups.length - 1].sections.push(section);
    });
    return groups;
  }

  function formatSectionPageBadge(section) {
    const start = padPageNumber(getDisplayedPageNumber(section.page));
    const end = padPageNumber(getDisplayedPageNumber(section.endPage));
    return start === end ? start : `${start} - ${end}`;
  }

  function normalizeConfig(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const landing = input.landing && typeof input.landing === "object" ? input.landing : {};
    const whatsapp = input.whatsapp && typeof input.whatsapp === "object" ? input.whatsapp : {};
    const projectName = `${input.projectName ?? "Catalogue"}`.trim() || "Catalogue";

    const pages = Array.isArray(input.pages)
      ? input.pages.map((entry, index) => {
          const fallbackLabel = `Page ${padPageNumber(index + 1)}`;
          if (typeof entry === "string") {
            return {
              src: entry,
              thumb: entry,
              name: fallbackLabel,
              zone: "Pages",
              itemId: null,
              unitPrice: null,
            };
          }
          return {
            src: `${entry?.src ?? ""}`.trim(),
            thumb: `${entry?.thumb ?? entry?.src ?? ""}`.trim(),
            name: `${entry?.name ?? entry?.section ?? fallbackLabel}`.trim() || fallbackLabel,
            zone: `${entry?.zone ?? "Pages"}`.trim() || "Pages",
            itemId: `${entry?.itemId ?? ""}`.trim() || null,
            unitPrice: entry?.unitPrice ?? null,
          };
        }).filter((page) => page.src)
      : [];

    const sectionsSource = Array.isArray(input.sections) && input.sections.length > 0
      ? input.sections
      : pages.map((page, index) => ({
          name: page.name || `Page ${padPageNumber(index + 1)}`,
          page: index + 1,
          zone: page.zone || "Pages",
        }));

    const sections = sectionsSource
      .map((section, index) => {
        const page = clamp(Math.round(Number(section?.page || index + 1)), 1, Math.max(1, pages.length));
        return {
          name: `${section?.name ?? `Section ${index + 1}`}`.trim() || `Section ${index + 1}`,
          page,
          zone: `${section?.zone ?? ""}`.trim() || null,
          endPage: page,
        };
      })
      .sort((left, right) => left.page - right.page)
      .map((section, index, all) => {
        const next = all[index + 1];
        return {
          ...section,
          endPage: next ? Math.max(section.page, next.page - 1) : pages.length,
        };
      });

    return {
      projectName,
      currency: `${input.currency ?? DEFAULT_CURRENCY}`.trim() || DEFAULT_CURRENCY,
      addToCartMode: Boolean(input.addToCartMode),
      theme: normalizeTheme(input.theme) || DEFAULT_THEME,
      pageTransition: normalizePageTransition(input.pageTransition) || DEFAULT_PAGE_TRANSITION,
      landing: {
        lead: `${landing.lead ?? "Welcome to"}`.trim() || "Welcome to",
        title: `${landing.title ?? projectName}`.trim() || projectName,
        subtitle: `${landing.subtitle ?? ""}`.trim(),
        buttonLabel: `${landing.buttonLabel ?? "Start browsing"}`.trim() || "Start browsing",
        titleImage: `${landing.titleImage ?? "logo.png"}`.trim() || "logo.png",
        bgImage: `${landing.bgImage ?? pages[0]?.src ?? ""}`.trim() || (pages[0]?.src || ""),
      },
      whatsapp: {
        phone: `${whatsapp.phone ?? ""}`.trim(),
        message: `${whatsapp.message ?? "Hi"}`.trim() || "Hi",
      },
      browseStartAt: clamp(Math.round(Number(input.browseStartAt || 1)), 1, Math.max(1, pages.length)),
      pageStartAt: clamp(Math.round(Number(input.pageStartAt || 1)), 1, Math.max(1, pages.length)),
      pages,
      sections,
    };
  }

  function renderThemeToggle() {
    if (state.theme === "dark") {
      els.themeToggle.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M20.83 14.37a8.5 8.5 0 1 1-11.2-11.2.5.5 0 0 1 .64.63 7.5 7.5 0 0 0 9.93 9.93.5.5 0 0 1 .63.64z"></path>
        </svg>
      `;
      els.themeToggle.setAttribute("aria-label", "Dark mode");
      return;
    }
    els.themeToggle.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="5" fill="currentColor"></circle>
        <g stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none">
          <line x1="12" y1="2.5" x2="12" y2="5"></line>
          <line x1="12" y1="19" x2="12" y2="21.5"></line>
          <line x1="4.22" y1="4.22" x2="5.9" y2="5.9"></line>
          <line x1="18.1" y1="18.1" x2="19.78" y2="19.78"></line>
          <line x1="2.5" y1="12" x2="5" y2="12"></line>
          <line x1="19" y1="12" x2="21.5" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.9" y2="18.1"></line>
          <line x1="18.1" y1="5.9" x2="19.78" y2="4.22"></line>
        </g>
      </svg>
    `;
    els.themeToggle.setAttribute("aria-label", "Light mode");
  }

  function applyTheme() {
    document.body.classList.toggle("theme-dark", state.theme === "dark");
    renderThemeToggle();
    if (state.hasUserSelectedTheme) {
      writeStoredTheme(state.theme);
    }
  }

  function applyZoom() {
    [els.pagePlaceholder, els.prevPageImage, els.pageImage, els.nextPageImage].forEach((image) => {
      image.style.setProperty("--page-zoom", String(state.currentZoom));
    });
  }

  function fitHeight() {
    const wrapperHeight = els.pageWrapper.clientHeight;
    const naturalHeight = els.pageImage.naturalHeight || els.pageImage.height;
    if (!wrapperHeight || !naturalHeight) return;
    const ratio = wrapperHeight / naturalHeight;
    state.currentZoom = Math.min(3, Math.max(1, ratio));
    applyZoom();
  }

  function setLoadingState(isLoading) {
    state.loadingCurrentImage = isLoading;
    els.pageImage.classList.toggle("is-loading", isLoading);
    els.pagePlaceholder.classList.toggle("hidden", !isLoading || !state.lastLoadedSrc);
  }

  function updateCarouselSources() {
    const total = state.pages.length;
    const current = currentPageEntry();
    const prev = state.pages[wrapPage(state.currentPage - 1) - 1];
    const next = state.pages[wrapPage(state.currentPage + 1) - 1];
    if (!current || !prev || !next) return;

    els.prevPageImage.src = prev.thumb || prev.src;
    els.nextPageImage.src = next.thumb || next.src;

    if (state.lastLoadedSrc) {
      els.pagePlaceholder.src = state.lastLoadedSrc;
    }

    if (els.pageImage.src !== new URL(current.src, window.location.href).href) {
      setLoadingState(true);
      els.pageImage.src = current.src;
    } else {
      els.pageImage.src = current.src;
    }

    applyZoom();
  }

  function scrollActiveThumbnailIntoView() {
    const active = els.thumbnailScroll.querySelector(".thumbnail-item.active");
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }

  function setPanOffset(value) {
    document.documentElement.style.setProperty("--page-pan-x", `${Number.isFinite(value) ? value : 0}px`);
  }

  function setPanTransitionEnabled(enabled) {
    els.pageCarousel.style.transition = enabled
      ? "transform 260ms cubic-bezier(0.33, 1, 0.68, 1)"
      : "none";
  }

  function triggerCurrentImageAnimation(className) {
    if (!className) return;
    els.pageImage.classList.remove("flip-next", "flip-prev");
    void els.pageImage.offsetWidth;
    els.pageImage.classList.add(className);
  }

  function commitPageDelta(delta) {
    const next = wrapPage(state.currentPage + delta);
    const directionClass = state.config.pageTransition === "flip"
      ? delta > 0 ? "flip-next" : "flip-prev"
      : null;
    if (next === state.currentPage) return;
    state.currentPage = next;
    state.currentZoom = 1;
    state.pendingImageAnimation = directionClass;
    render();
  }

  function startPanSettle(delta, widthHint) {
    if (state.config.pageTransition !== "pan") {
      commitPageDelta(delta);
      return;
    }

    const width = Number.isFinite(widthHint) && widthHint > 0
      ? widthHint
      : els.pageCarousel.clientWidth || els.pageWrapper.clientWidth;

    if (!width) {
      commitPageDelta(delta);
      return;
    }

    state.pan.isSettling = true;
    state.pan.pendingDelta = delta;
    setPanTransitionEnabled(true);
    setPanOffset(delta === 0 ? 0 : delta > 0 ? -width : width);
  }

  function goToPage(pageNumber) {
    const next = clamp(Math.round(Number(pageNumber)), 1, state.pages.length);
    if (!Number.isFinite(next) || next === state.currentPage) return;
    state.currentPage = next;
    state.currentZoom = 1;
    state.pendingImageAnimation = null;
    render();
  }

  function changePage(delta) {
    if (!delta) return;
    if (state.config.pageTransition === "pan" && !state.showLanding) {
      if (state.pan.isSettling || state.pan.gesture) return;
      startPanSettle(delta);
      return;
    }
    commitPageDelta(delta);
  }

  function handlePageImageLoad() {
    state.lastLoadedSrc = els.pageImage.currentSrc || els.pageImage.src;
    setLoadingState(false);
    fitHeight();
    if (state.pendingImageAnimation) {
      triggerCurrentImageAnimation(state.pendingImageAnimation);
      state.pendingImageAnimation = null;
    }
    renderFloatingButtons();
  }

  function showToast(message) {
    const safeMessage = `${message ?? ""}`.trim();
    if (!safeMessage) return;
    els.toastSnackbar.textContent = safeMessage;
    els.toastSnackbar.classList.remove("hidden");
    if (state.toastTimeout) {
      window.clearTimeout(state.toastTimeout);
    }
    state.toastTimeout = window.setTimeout(() => {
      els.toastSnackbar.classList.add("hidden");
      state.toastTimeout = null;
    }, 1600);
  }

  function addCurrentItemToCart() {
    const candidate = getCurrentCartCandidate();
    if (!candidate) return;
    const existing = state.cartItems[candidate.id];
    state.cartItems = {
      ...state.cartItems,
      [candidate.id]: {
        id: candidate.id,
        quantity: existing ? existing.quantity + 1 : 1,
        label: existing?.label || candidate.label || null,
        unitPrice: existing && existing.unitPrice > 0 ? existing.unitPrice : candidate.unitPrice,
        assetPath: existing?.assetPath || candidate.assetPath || null,
      },
    };
    writeCartStorage();
    renderCart();
    renderFloatingButtons();
    showToast(`Added ${getItemDisplayLabel(candidate)} to cart`);
  }

  function updateCartItem(itemId, delta) {
    const existing = state.cartItems[itemId];
    if (!existing) return;
    const nextQuantity = existing.quantity + delta;
    if (nextQuantity <= 0) {
      const nextItems = { ...state.cartItems };
      delete nextItems[itemId];
      state.cartItems = nextItems;
    } else {
      state.cartItems = {
        ...state.cartItems,
        [itemId]: {
          ...existing,
          quantity: nextQuantity,
        },
      };
    }
    writeCartStorage();
    renderCart();
    renderFloatingButtons();
  }

  function buildSidebarSearchResults(query) {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    const tokens = trimmed.split(/\s+/u).filter(Boolean);
    const numericQuery = /^\d+$/u.test(trimmed) ? Number.parseInt(trimmed, 10) : null;
    return state.sections
      .filter((section) => {
        if (numericQuery !== null) {
          const start = getDisplayedPageNumber(section.page);
          const end = getDisplayedPageNumber(section.endPage);
          return numericQuery >= start && numericQuery <= end;
        }
        const haystack = `${section.name || ""} ${section.zone || ""}`.trim().toLowerCase();
        return tokens.every((token) => haystack.includes(token));
      })
      .slice(0, 12);
  }

  function renderSidebar() {
    const activeSection = getActiveSection();
    els.sidebarTitle.textContent = state.config.projectName;

    els.sectionList.innerHTML = state.zoneGroups.map((group, groupIndex) => {
      const zone = group.label;
      const isCollapsed = zone ? state.collapsedZones.has(zone) : false;
      const zoneBodyId = `section-zone-${groupIndex}`;
      const zoneButton = zone
        ? `
          <button
            type="button"
            class="section-zone-divider${isCollapsed ? " is-collapsed" : ""}"
            data-zone-toggle="${escapeHtml(zone)}"
            aria-expanded="${String(!isCollapsed)}"
            aria-controls="${zoneBodyId}"
          >
            <span>${escapeHtml(zone)}</span>
            <span class="section-zone-chevron" aria-hidden="true"></span>
          </button>
        `
        : "";
      const body = `
        <div class="section-zone-body${isCollapsed ? " is-collapsed" : ""}" id="${zoneBodyId}">
          ${group.sections.map((section) => {
            const isActive = activeSection && activeSection.page === section.page;
            return `
              <button
                type="button"
                class="section-link${isActive ? " active" : ""}"
                data-page="${section.page}"
              >
                <span>${escapeHtml(section.name)}</span>
                <span class="section-badge">
                  ${formatSectionPageBadge(section)}
                </span>
              </button>
            `;
          }).join("")}
        </div>
      `;
      return `<div class="section-zone-group">${zoneButton}${body}</div>`;
    }).join("");

    const results = buildSidebarSearchResults(state.searchQuery);
    const trimmed = state.searchQuery.trim();
    els.sidebarSearchClear.classList.toggle("hidden", !trimmed);
    els.sidebarSearchBlock.classList.toggle("hidden", !trimmed);
    if (trimmed) {
      if (results.length > 0) {
        els.sidebarSearchResults.innerHTML = results.map((section) => `
          <button type="button" class="sidebar-search-result" data-page="${section.page}">
            <span class="sidebar-search-result-name">${escapeHtml(section.name)}</span>
            <span class="sidebar-search-result-badge">
              ${formatSectionPageBadge(section)}
            </span>
          </button>
        `).join("");
      } else {
        els.sidebarSearchResults.innerHTML = `<div class="sidebar-search-empty">No matches</div>`;
      }
    }

    const displayedUrl = getDisplayedPageUrl(getDisplayedPageNumber(state.currentPage));
    els.qrUrl.textContent = displayedUrl;
    els.qrUrl.classList.remove("hidden");
    els.qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(displayedUrl)}`;
    els.qrImage.classList.remove("hidden");
  }

  function renderLanding() {
    els.landingLead.textContent = state.config.landing.lead;
    els.landingTitle.textContent = state.config.landing.title;
    els.landingSubtitle.textContent = state.config.landing.subtitle || "";
    els.landingSubtitle.classList.toggle("hidden", !state.config.landing.subtitle);
    els.startBrowsingBtn.textContent = state.config.landing.buttonLabel;

    if (state.config.landing.titleImage) {
      els.landingTitleImage.src = state.config.landing.titleImage;
      els.landingTitleImage.alt = `${state.config.projectName} logo`;
      els.landingTitleWrap.classList.remove("hidden");
      els.landingTitle.classList.add("hidden");
      els.landingTitleWrap.classList.toggle(
        "is-png",
        /\.png(?:$|[?#])/iu.test(state.config.landing.titleImage)
      );
    } else {
      els.landingTitleWrap.classList.add("hidden");
      els.landingTitle.classList.remove("hidden");
    }

    if (state.config.landing.bgImage) {
      els.landingBg.style.backgroundImage = `url("${state.config.landing.bgImage}")`;
      window.setTimeout(() => {
        els.landingBg.classList.add("is-visible");
      }, 150);
    } else {
      els.landingBg.style.backgroundImage = "";
      els.landingBg.classList.remove("is-visible");
    }

    els.landingScreen.classList.toggle("hidden", !state.showLanding);
    els.catalogLayout.classList.toggle("hidden", state.showLanding);
  }

  function renderThumbnails() {
    const total = state.pages.length;
    const half = Math.floor(THUMBNAIL_COUNT / 2);
    let start = Math.max(1, state.currentPage - half);
    let end = Math.min(total, start + THUMBNAIL_COUNT - 1);
    start = Math.max(1, end - THUMBNAIL_COUNT + 1);
    const pages = Array.from({ length: end - start + 1 }, (_, index) => start + index);
    els.thumbnailScroll.innerHTML = pages.map((pageNumber) => {
      const page = state.pages[pageNumber - 1];
      const displayed = getDisplayedPageNumber(pageNumber);
      return `
        <button
          type="button"
          class="thumbnail-item${pageNumber === state.currentPage ? " active" : ""}"
          data-page="${pageNumber}"
          aria-label="Go to page ${displayed}"
        >
          <img src="${escapeHtml(page.thumb || page.src)}" alt="Catalogue preview page ${displayed}" loading="lazy">
          <span class="thumbnail-page-indicator">${padPageNumber(displayed)}</span>
        </button>
      `;
    }).join("");
    scrollActiveThumbnailIntoView();
  }

  function renderPageMeta() {
    const activeSection = getActiveSection();
    const totalPages = state.pages.length;
    const pageText = `Page ${getDisplayedPageNumber(state.currentPage)} / ${totalPages}`;
    els.pageDisplayBtn.textContent = pageText;
    els.mobileActiveSection.textContent = activeSection ? activeSection.name : pageText;
  }

  function renderViewerCartBar() {
    const candidate = getCurrentCartCandidate();
    const shouldShow = state.config.addToCartMode && Boolean(candidate);
    els.viewerCartBar.classList.toggle("hidden", !shouldShow);
    if (!shouldShow) return;
    els.viewerCartItem.textContent = getItemDisplayLabel(candidate);
    els.viewerCartPrice.textContent = formatCartPrice(state.config.currency, candidate.unitPrice);
  }

  function renderFloatingButtons() {
    const cartCount = getCartCount();
    const hideFloating = state.isMobile && state.sidebarVisible;
    const showCartToggle = state.config.addToCartMode && !state.showLanding && !hideFloating;
    const messageBase = buildWhatsAppMessageBody(state.config.whatsapp.message, state.config.projectName);
    const shouldShowWhatsApp = Boolean(state.config.whatsapp.phone && messageBase && !state.showLanding && !hideFloating);

    els.cartToggle.classList.toggle("hidden", !showCartToggle);
    els.cartBadge.textContent = String(cartCount);
    els.cartBadge.classList.toggle("hidden", cartCount <= 0);
    els.cartToggle.setAttribute(
      "aria-label",
      cartCount > 0 ? `View cart (${cartCount} item${cartCount === 1 ? "" : "s"})` : "View cart"
    );

    if (shouldShowWhatsApp) {
      const displayedPage = getDisplayedPageNumber(state.currentPage);
      const refUrl = getDisplayedPageUrl(displayedPage);
      const sectionName = getActiveSection()?.name?.trim();
      const refParts = [sectionName, refUrl ? `(${refUrl})` : null].filter(Boolean).join(" ");
      const message = refParts ? `${messageBase}.\n\nref: ${refParts}` : `${messageBase}.`;
      els.whatsappLink.href = `https://api.whatsapp.com/send?phone=${encodeURIComponent(state.config.whatsapp.phone)}&text=${encodeURIComponent(message)}`;
      els.whatsappLink.classList.remove("hidden");
    } else {
      els.whatsappLink.classList.add("hidden");
    }

    els.openSidebarBtn.classList.toggle("hidden", !state.isMobile || state.sidebarVisible || state.showLanding);
  }

  function renderCart() {
    const cartEntries = getCartEntries();
    const cartCount = getCartCount();
    const cartTotal = getCartTotal();

    if (cartEntries.length === 0) {
      els.cartModalBody.innerHTML = `<p class="empty-cart-text">Your cart is empty.</p>`;
    } else {
      els.cartModalBody.innerHTML = `
        <ul class="cart-item-list">
          ${cartEntries.map((entry) => `
            <li class="cart-item-row">
              <div class="cart-item-main">
                ${entry.assetPath
                  ? `<img src="${escapeHtml(entry.assetPath)}" alt="${escapeHtml(entry.id)}" class="cart-item-thumb" loading="lazy">`
                  : `<div class="cart-item-thumb cart-item-thumb-placeholder" aria-hidden="true"></div>`
                }
                <div class="cart-item-details">
                  <div class="cart-item-id" title="${escapeHtml(entry.id)}">${escapeHtml(getItemDisplayLabel(entry))}</div>
                  <div class="cart-item-unit-price">${escapeHtml(formatCartPrice(state.config.currency, entry.unitPrice))}</div>
                </div>
              </div>
              <div class="cart-item-controls">
                <button type="button" class="btn btn-secondary" data-cart-delta="-1" data-item-id="${escapeHtml(entry.id)}">−</button>
                <span class="cart-qty">${entry.quantity}</span>
                <button type="button" class="btn btn-secondary" data-cart-delta="1" data-item-id="${escapeHtml(entry.id)}">+</button>
              </div>
            </li>
          `).join("")}
        </ul>
      `;
    }

    els.cartTotalItems.textContent = `${cartCount} item${cartCount === 1 ? "" : "s"}`;
    els.cartTotalPrice.textContent = formatCartPrice(state.config.currency, cartTotal);

    const messageBase = buildWhatsAppMessageBody(state.config.whatsapp.message, state.config.projectName);
    if (state.config.whatsapp.phone && cartEntries.length > 0) {
      const greeting = messageBase.endsWith(".") ? messageBase : `${messageBase}.`;
      const lines = [greeting, "", "Order:"];
      cartEntries.forEach((entry) => {
        lines.push(`- ${entry.quantity} x ${getItemDisplayLabel(entry)} (${formatCartPrice(state.config.currency, entry.unitPrice)} each)`);
      });
      lines.push("");
      lines.push(`Total items: ${cartCount}`);
      lines.push(`Total: ${formatCartPrice(state.config.currency, cartTotal)}`);
      els.submitOrderLink.href = `https://api.whatsapp.com/send?phone=${encodeURIComponent(state.config.whatsapp.phone)}&text=${encodeURIComponent(lines.join("\n"))}`;
      els.submitOrderLink.setAttribute("aria-disabled", "false");
      els.submitOrderLink.removeAttribute("tabindex");
    } else {
      els.submitOrderLink.href = "#";
      els.submitOrderLink.setAttribute("aria-disabled", "true");
      els.submitOrderLink.setAttribute("tabindex", "-1");
    }

    if (!state.config.whatsapp.phone) {
      els.cartModalHint.textContent = "WhatsApp ordering is unavailable because whatsapp.phone is empty in the catalogSettingsData block in index.html.";
      els.cartModalHint.classList.remove("hidden");
    } else if (cartEntries.length === 0) {
      els.cartModalHint.textContent = "Add an item first to submit your order.";
      els.cartModalHint.classList.remove("hidden");
    } else {
      els.cartModalHint.classList.add("hidden");
    }

    els.cartModalOverlay.classList.toggle("hidden", !state.isCartOpen);
  }

  function renderSidebarVisibility() {
    els.sidebar.classList.toggle("show", state.sidebarVisible);
    els.sidebarBackdrop.classList.toggle("show", state.sidebarVisible && state.isMobile);
  }

  function render() {
    renderLanding();
    renderSidebarVisibility();
    renderSidebar();
    renderPageMeta();
    renderThumbnails();
    renderViewerCartBar();
    updateCarouselSources();
    renderCart();
    renderFloatingButtons();
  }

  function preloadPages() {
    let index = 0;
    const delayMs = 150;
    const batchSize = 6;

    function preloadBatch() {
      if (index >= state.pages.length) return;
      for (let i = index; i < Math.min(index + batchSize, state.pages.length); i += 1) {
        const page = state.pages[i];
        const image = new Image();
        image.src = page.src;
      }
      index += batchSize;
      window.setTimeout(preloadBatch, delayMs);
    }

    preloadBatch();
  }

  function closeSidebar() {
    state.sidebarVisible = false;
    renderSidebarVisibility();
    renderFloatingButtons();
  }

  function openSidebar() {
    if (!state.isMobile) return;
    state.sidebarVisible = true;
    renderSidebarVisibility();
    renderFloatingButtons();
  }

  function handleSectionSelection(page) {
    goToPage(page);
    closeSidebar();
    state.searchQuery = "";
    els.sidebarSearchInput.value = "";
    renderSidebar();
  }

  function startBrowsing() {
    state.showLanding = false;
    state.currentPage = state.browseStartAt;
    state.currentZoom = 1;
    state.pendingImageAnimation = null;
    render();
  }

  function handlePageImageClick(event) {
    if (Date.now() < state.suppressClickUntil) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    changePage(event.clientX > midpoint ? 1 : -1);
  }

  function handleWheel(event) {
    if (state.showLanding) return;
    if (Math.abs(event.deltaY) < 10) return;
    event.preventDefault();
    changePage(event.deltaY > 0 ? 1 : -1);
  }

  function handlePanPointerDown(event) {
    if (state.config.pageTransition !== "pan" || state.showLanding || state.pan.isSettling) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    setPanTransitionEnabled(false);
    state.pan.gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      width: els.pageCarousel.clientWidth || els.pageWrapper.clientWidth,
      isHorizontal: null,
      samples: [{ x: event.clientX, t: performance.now() }],
    };
  }

  function handlePanPointerMove(event) {
    const gesture = state.pan.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId || state.config.pageTransition !== "pan" || state.showLanding) {
      return;
    }

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (gesture.isHorizontal === null) {
      if (absDx < 8 && absDy < 8) return;
      if (absDx > absDy * 1.2) {
        gesture.isHorizontal = true;
        state.suppressClickUntil = Date.now() + 650;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } else if (absDy > absDx * 1.2) {
        gesture.isHorizontal = false;
        state.pan.gesture = null;
        return;
      } else {
        return;
      }
    }

    if (!gesture.isHorizontal) return;
    event.preventDefault();
    gesture.lastX = event.clientX;
    gesture.samples.push({ x: event.clientX, t: performance.now() });
    if (gesture.samples.length > 6) {
      gesture.samples.shift();
    }
    const width = els.pageCarousel.clientWidth || gesture.width || els.pageWrapper.clientWidth || 0;
    const clampedDx = width ? clamp(dx, -width, width) : dx;
    setPanOffset(clampedDx);
  }

  function finishPanGesture(event, cancelled) {
    const gesture = state.pan.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    state.pan.gesture = null;
    if (state.config.pageTransition !== "pan" || state.showLanding || !gesture.isHorizontal) return;
    state.suppressClickUntil = Date.now() + 650;

    const width = els.pageCarousel.clientWidth || gesture.width || els.pageWrapper.clientWidth || 0;
    if (!width) {
      setPanOffset(0);
      return;
    }

    if (cancelled) {
      startPanSettle(0, width);
      return;
    }

    const dx = gesture.lastX - gesture.startX;
    const commitDistance = Math.max(60, width * 0.22);
    const velocity = getSwipeVelocity(gesture.samples);
    let delta = 0;
    if (dx <= -commitDistance || velocity <= -0.6) {
      delta = 1;
    } else if (dx >= commitDistance || velocity >= 0.6) {
      delta = -1;
    }
    startPanSettle(delta, width);
  }

  function handleCarouselTransitionEnd(event) {
    if (event.target !== els.pageCarousel || event.propertyName !== "transform" || !state.pan.isSettling) return;
    const delta = state.pan.pendingDelta;
    state.pan.pendingDelta = 0;
    state.pan.isSettling = false;

    if (!delta) {
      setPanTransitionEnabled(false);
      setPanOffset(0);
      return;
    }

    const settledImage = delta > 0 ? els.nextPageImage : els.prevPageImage;
    const settledSrc = settledImage.currentSrc || settledImage.src;
    if (settledSrc) {
      els.pageImage.src = settledSrc;
      state.lastLoadedSrc = settledSrc;
      els.pagePlaceholder.src = settledSrc;
      setLoadingState(false);
    }

    state.currentPage = wrapPage(state.currentPage + delta);
    state.currentZoom = 1;
    setPanTransitionEnabled(false);
    setPanOffset(0);
    render();
  }

  function loadEmbeddedConfig() {
    const tag = document.getElementById("catalogSettingsData");
    if (!tag) {
      throw new Error("Missing catalogSettingsData in index.html.");
    }
    const raw = tag.textContent.trim();
    if (!raw) {
      throw new Error("catalogSettingsData in index.html is empty.");
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(`catalogSettingsData in index.html is invalid JSON: ${error.message}`);
    }
  }

  async function loadConfig() {
    return loadEmbeddedConfig();
  }

  function bindEvents() {
    els.startBrowsingBtn.addEventListener("click", startBrowsing);
    els.themeToggle.addEventListener("click", () => {
      state.hasUserSelectedTheme = true;
      state.theme = state.theme === "dark" ? "light" : "dark";
      applyTheme();
    });
    els.sidebarClose.addEventListener("click", closeSidebar);
    els.sidebarBackdrop.addEventListener("click", closeSidebar);
    els.openSidebarBtn.addEventListener("click", openSidebar);
    els.prevPageBtn.addEventListener("click", () => changePage(-1));
    els.nextPageBtn.addEventListener("click", () => changePage(1));
    els.pageDisplayBtn.addEventListener("click", () => {
      const promptValue = window.prompt(
        `Jump to page (1-${state.pages.length})`,
        String(getDisplayedPageNumber(state.currentPage))
      );
      if (promptValue === null) return;
      const actualPage = getActualPageFromDisplayed(promptValue.trim());
      if (actualPage !== null) {
        goToPage(actualPage);
      }
    });
    els.pageImage.addEventListener("click", handlePageImageClick);
    els.pageImage.addEventListener("load", handlePageImageLoad);
    els.pageImage.addEventListener("error", () => setLoadingState(false));
    els.pageWrapper.addEventListener("wheel", handleWheel, { passive: false });
    els.pageWrapper.addEventListener("pointerdown", handlePanPointerDown);
    els.pageWrapper.addEventListener("pointermove", handlePanPointerMove);
    els.pageWrapper.addEventListener("pointerup", (event) => finishPanGesture(event, false));
    els.pageWrapper.addEventListener("pointercancel", (event) => finishPanGesture(event, true));
    els.pageCarousel.addEventListener("transitionend", handleCarouselTransitionEnd);
    els.addToCartBtn.addEventListener("click", addCurrentItemToCart);
    els.cartToggle.addEventListener("click", () => {
      state.isCartOpen = true;
      renderCart();
    });
    els.cartModalClose.addEventListener("click", () => {
      state.isCartOpen = false;
      renderCart();
    });
    els.cartModalOverlay.addEventListener("click", (event) => {
      if (event.target === els.cartModalOverlay) {
        state.isCartOpen = false;
        renderCart();
      }
    });
    els.cartModalBody.addEventListener("click", (event) => {
      const button = event.target.closest("[data-cart-delta]");
      if (!button) return;
      const delta = Number(button.dataset.cartDelta);
      const itemId = button.dataset.itemId;
      if (!itemId || !Number.isFinite(delta)) return;
      updateCartItem(itemId, delta);
    });
    els.sectionList.addEventListener("click", (event) => {
      const zoneToggle = event.target.closest("[data-zone-toggle]");
      if (zoneToggle) {
        const label = zoneToggle.dataset.zoneToggle;
        if (label) {
          if (state.collapsedZones.has(label)) {
            state.collapsedZones.delete(label);
          } else {
            state.collapsedZones.add(label);
          }
          renderSidebar();
        }
        return;
      }
      const pageButton = event.target.closest("[data-page]");
      if (!pageButton) return;
      handleSectionSelection(Number(pageButton.dataset.page));
    });
    els.sidebarSearchResults.addEventListener("click", (event) => {
      const pageButton = event.target.closest("[data-page]");
      if (!pageButton) return;
      handleSectionSelection(Number(pageButton.dataset.page));
    });
    els.thumbnailScroll.addEventListener("click", (event) => {
      const pageButton = event.target.closest("[data-page]");
      if (!pageButton) return;
      goToPage(Number(pageButton.dataset.page));
    });
    els.sidebarSearchInput.addEventListener("input", (event) => {
      state.searchQuery = event.target.value;
      renderSidebar();
    });
    els.sidebarSearchInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        state.searchQuery = "";
        els.sidebarSearchInput.value = "";
        renderSidebar();
        return;
      }
      if (event.key === "Enter") {
        const results = buildSidebarSearchResults(state.searchQuery);
        if (results[0]) {
          event.preventDefault();
          handleSectionSelection(results[0].page);
        }
      }
    });
    els.sidebarSearchClear.addEventListener("click", () => {
      state.searchQuery = "";
      els.sidebarSearchInput.value = "";
      renderSidebar();
      els.sidebarSearchInput.focus();
    });
    window.addEventListener("keydown", (event) => {
      if (event.target && event.target.tagName === "INPUT") return;
      if (event.key === "Escape") {
        if (state.isCartOpen) {
          state.isCartOpen = false;
          renderCart();
          return;
        }
        if (state.sidebarVisible) {
          closeSidebar();
        }
      } else if (event.key === "ArrowRight") {
        changePage(1);
      } else if (event.key === "ArrowLeft") {
        changePage(-1);
      } else if (event.key === "+") {
        state.currentZoom = clamp(state.currentZoom + 0.15, 0.5, 3);
        applyZoom();
      } else if (event.key === "-") {
        state.currentZoom = clamp(state.currentZoom - 0.15, 0.5, 3);
        applyZoom();
      }
    });
    window.addEventListener("resize", () => {
      state.isMobile = window.innerWidth < 992;
      if (!state.isMobile) {
        state.sidebarVisible = false;
      }
      fitHeight();
      renderSidebarVisibility();
      renderFloatingButtons();
    });
    els.pageImage.addEventListener("animationend", () => {
      els.pageImage.classList.remove("flip-next", "flip-prev");
    });
  }

  async function init() {
    try {
      const rawConfig = await loadConfig();
      state.config = normalizeConfig(rawConfig);
      state.pages = state.config.pages;
      state.sections = state.config.sections;
      state.zoneGroups = buildZoneGroups();
      state.pageStartAt = state.config.pageStartAt;
      state.browseStartAt = state.config.browseStartAt;
      state.showLanding = !Boolean(readPageQueryParam());
      state.currentPage = 1;
      state.currentZoom = 1;
      state.lastLoadedSrc = state.pages[0]?.src || null;
      state.cartItems = readCartStorage();
      const storedTheme = readStoredTheme();
      state.hasUserSelectedTheme = Boolean(storedTheme);
      state.theme = storedTheme || state.config.theme || DEFAULT_THEME;
      applyTheme();
      document.title = state.config.projectName;

      const initialDisplayedPage = readPageQueryParam();
      if (initialDisplayedPage) {
        const actualPage = getActualPageFromDisplayed(initialDisplayedPage);
        if (actualPage !== null) {
          state.currentPage = actualPage;
          state.showLanding = false;
        }
      }

      bindEvents();
      render();
      preloadPages();
      els.loadingState.classList.add("hidden");
    } catch (error) {
      els.loadingState.textContent = error?.message || "Failed to load catalogue.";
      console.error(error);
    }
  }

  init();
})();
