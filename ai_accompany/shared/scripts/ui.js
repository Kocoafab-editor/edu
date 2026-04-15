import { buildHref } from './router.js';

const ROLE_LABELS = {
  admin: '어드민',
  instructor: '강사',
  student: '학생',
};

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusClass(status) {
  return `status-badge status-badge--${status || 'not-started'}`;
}

export function renderTopbar({ rootPath, title, description, user, navItems = [], showLogout = true }) {
  const logoSrc = rootPath === '.' ? './assets/logo-placeholder.svg' : `${rootPath}/assets/logo-placeholder.svg`;
  const homeHref = buildHref(rootPath, 'login');

  const userHtml = user
    ? `
      <p class="session-text">${escapeHtml(user.displayName)} · ${escapeHtml(ROLE_LABELS[user.role] || user.role)}</p>
      ${showLogout ? '<button id="logoutButton" class="ghost-button" type="button">로그아웃</button>' : ''}
    `
    : '';

  return `
    <div class="topbar">
      <div class="topbar__brand">
        <a class="brand" href="${escapeHtml(homeHref)}">
          <img class="brand__logo" src="${escapeHtml(logoSrc)}" alt="AI 동행 로고">
          <div class="brand__copy">
            <p class="eyebrow">AI 동행</p>
            <h1 class="brand__title">${escapeHtml(title)}</h1>
          </div>
        </a>
        ${description ? `<p class="brand__description">${escapeHtml(description)}</p>` : ''}
      </div>
      <div class="topbar__actions">
        ${userHtml}
      </div>
    </div>
  `;
}

export function renderPageTabs(items, label = '페이지 이동') {
  return `
    <nav class="page-tab-row" aria-label="${escapeHtml(label)}">
      ${items
        .map(
          (item) => `
            <a class="page-tab${item.active ? ' is-active' : ''}" href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>
          `
        )
        .join('')}
    </nav>
  `;
}

export function renderSummaryCards(cards) {
  return `
    <section class="summary-grid">
      ${cards
        .map(
          (card) => `
            <article class="summary-card">
              <p class="summary-card__label">${escapeHtml(card.label)}</p>
              <p class="summary-card__value">${escapeHtml(card.value)}</p>
              <p class="summary-card__note">${escapeHtml(card.note || '')}</p>
            </article>
          `
        )
        .join('')}
    </section>
  `;
}

export function renderProgressBar(progress, label = '', meta = '') {
  return `
    <div class="progress-bar">
      <div class="progress-bar__track">
        <div class="progress-bar__fill" style="width:${Number(progress) || 0}%"></div>
      </div>
      <div class="progress-bar__meta">
        <span>${escapeHtml(label)}</span>
        <span>${escapeHtml(meta || `${Number(progress) || 0}%`)}</span>
      </div>
    </div>
  `;
}

export function renderModuleGrid(items) {
  return `
    <div class="module-grid">
      ${items
        .map(
          (item) => `
            <article class="module-item">
              <p class="module-item__title">${escapeHtml(item.title)}</p>
              <p class="module-item__value">${escapeHtml(`${item.progress}%`)}</p>
              ${renderProgressBar(item.progress, item.metaLabel || '모듈 진행도')}
              <p class="module-item__note">${escapeHtml(item.note || '')}</p>
            </article>
          `
        )
        .join('')}
    </div>
  `;
}

export function renderStatusBadge(status, label) {
  return `<span class="${statusClass(status)}">${escapeHtml(label)}</span>`;
}

export function renderProgressPill(progress) {
  return `<span class="progress-pill">${escapeHtml(`${progress}%`)}</span>`;
}

export function renderEmptyState(title, description) {
  return `
    <article class="panel-card empty-state">
      <p class="eyebrow">EMPTY</p>
      <h2 class="section-title">${escapeHtml(title)}</h2>
      <p class="section-description">${escapeHtml(description)}</p>
    </article>
  `;
}

export function bindSurfaceLinks(scope = document) {
  const surfaces = scope.querySelectorAll('[data-surface-link][data-href]');

  surfaces.forEach((surface) => {
    if (surface.dataset.linkBound === 'true') return;
    surface.dataset.linkBound = 'true';

    surface.addEventListener('click', (event) => {
      if (event.target.closest('a, button, input, select, textarea, summary, label')) return;
      window.location.href = surface.dataset.href;
    });

    surface.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      window.location.href = surface.dataset.href;
    });
  });
}

export { escapeHtml };

