import { attachLogout, ensureSession } from '../auth.js';
import { buildAdminSchoolsModel, loadLmsData } from '../data-store.js';
import { buildHref } from '../router.js';
import { loadEvaluationOverrides } from '../storage.js';
import { escapeHtml, renderEmptyState, renderPageTabs, renderProgressBar, renderTopbar } from '../ui.js';

function summarizeRegion(region) {
  return {
    schoolCount: region.schools.length,
    teamCount: region.schools.reduce((sum, school) => sum + school.teamCount, 0),
    studentCount: region.schools.reduce((sum, school) => sum + school.studentCount, 0),
  };
}

function renderSchoolAccordion(school, state) {
  const isOpen = state.openSchoolId === school.id;

  return `
    <article class="school-accordion${isOpen ? ' is-open' : ''}">
      <button class="school-accordion__toggle" type="button" data-school-toggle="${escapeHtml(school.id)}" aria-expanded="${isOpen ? 'true' : 'false'}">
        <div>
          <p class="eyebrow">${escapeHtml(school.schoolLevelLabel)}</p>
          <h3 class="tree-school__title">${escapeHtml(school.name)}</h3>
          <p class="tree-school__meta">${escapeHtml(`${school.teamCount}팀 · ${school.studentCount}명`)}</p>
        </div>
        <div class="school-accordion__side">
          <span class="progress-pill">${school.progress}%</span>
        </div>
      </button>
      ${
        isOpen
          ? `
            <div class="school-accordion__body">
              <div class="club-selector-list">
                ${school.clubs
                  .map(
                    (club) => `
                      <button class="club-selector${state.selectedClubId === club.id ? ' is-active' : ''}" type="button" data-club="${escapeHtml(club.id)}" data-school-id="${escapeHtml(school.id)}">
                        <span class="club-selector__title">${escapeHtml(club.name)}</span>
                        <span class="club-selector__meta">${escapeHtml(`${club.teamCount}개 팀`)}</span>
                      </button>
                    `
                  )
                  .join('')}
              </div>
            </div>
          `
          : ''
      }
    </article>
  `;
}

function renderRegionSection(region, state) {
  const stats = summarizeRegion(region);

  return `
    <section class="region-section">
      <div class="region-section__head">
        <div>
          <p class="eyebrow">REGION</p>
          <h2 class="section-title">${escapeHtml(region.name)}</h2>
          <p class="section-description">${stats.schoolCount}개교 · ${stats.teamCount}팀 · ${stats.studentCount}명</p>
        </div>
      </div>
      <div class="region-section__body">
        ${region.schools.map((school) => renderSchoolAccordion(school, state)).join('')}
      </div>
    </section>
  `;
}

function renderClubViewer(rootPath, selectedClub) {
  if (!selectedClub) return '';

  return `
    <div class="club-viewer-layer">
      <button class="club-viewer-layer__backdrop" type="button" data-close-viewer aria-label="동아리 팀 목록 닫기"></button>
      <div class="club-viewer-layer__dialog">
        <aside class="overlay-panel club-viewer" role="dialog" aria-modal="true" aria-label="${escapeHtml(selectedClub.name)} 팀 목록">
          <div class="club-viewer__head">
            <div>
              <p class="eyebrow">CLUB TEAMS</p>
              <h2 class="section-title">${escapeHtml(selectedClub.name)}</h2>
              <p class="section-description">${escapeHtml(`${selectedClub.schoolName} · ${selectedClub.region}`)}</p>
            </div>
            <button class="ghost-button club-viewer__close" type="button" data-close-viewer>닫기</button>
          </div>
          <div class="club-viewer__body">
            ${selectedClub.teams
              .map(
                (team) => `
                  <a class="tree-team club-team-card" href="${buildHref(rootPath, 'team', { teamId: team.id })}">
                    <div class="section-heading">
                      <div>
                        <h3 class="tree-team__title">${escapeHtml(team.name)}</h3>
                        <p class="tree-team__meta">${escapeHtml(team.theme)} · ${team.studentCount}명</p>
                      </div>
                      <span class="progress-pill">${team.progress}%</span>
                    </div>
                    ${renderProgressBar(team.progress, '팀 평균 진척도')}
                  </a>
                `
              )
              .join('')}
          </div>
        </aside>
      </div>
    </div>
  `;
}

export async function bootAdminSchoolsPage({ rootPath }) {
  const sessionUser = ensureSession(rootPath, ['admin']);
  if (!sessionUser) return;

  const data = await loadLmsData(rootPath, { overrides: loadEvaluationOverrides() });
  const header = document.getElementById('appHeader');
  const pageRoot = document.getElementById('pageRoot');

  header.innerHTML = renderTopbar({
    rootPath,
    title: '어드민 상세 페이지',
    description: '지역과 학교급 필터로 학교 구조를 탐색하고, 동아리별 팀 목록을 모달로 확인합니다.',
    user: sessionUser,
  });
  attachLogout(rootPath);

  const state = {
    region: 'all',
    schoolLevel: 'all',
    openSchoolId: '',
    selectedClubId: '',
  };

  function render() {
    const model = buildAdminSchoolsModel(data, state);
    const visibleSchoolIds = new Set(model.regions.flatMap((region) => region.schools.map((school) => school.id)));
    const visibleClubIds = new Set(model.clubEntries.map((club) => club.id));

    if (state.openSchoolId && !visibleSchoolIds.has(state.openSchoolId)) {
      state.openSchoolId = '';
    }

    if (state.selectedClubId && !visibleClubIds.has(state.selectedClubId)) {
      state.selectedClubId = '';
    }

    const selectedClub = model.clubEntries.find((club) => club.id === state.selectedClubId) || null;

    pageRoot.innerHTML = `
      <section class="page-stack">
        <section class="admin-body-shell">
          ${renderPageTabs(
            [
              { label: '전체 개요', href: buildHref(rootPath, 'admin-overview'), active: false },
              { label: '학교 구조', href: buildHref(rootPath, 'admin-schools'), active: true },
            ],
            '어드민 화면'
          )}

          <div class="admin-body-content">
            <section class="panel-card admin-filter-panel">
              <div class="section-heading">
                <div>
                  <p class="eyebrow">FILTER</p>
                  <h2 class="section-title">지역 및 학교급 필터</h2>
                </div>
              </div>
              <div class="field-grid">
                <div>
                  <p class="meta-text">지역</p>
                  <div class="filter-row">
                    <button class="filter-chip${state.region === 'all' ? ' is-active' : ''}" type="button" data-region="all">전체</button>
                    ${model.filters.regions
                      .map(
                        (region) => `<button class="filter-chip${state.region === region ? ' is-active' : ''}" type="button" data-region="${escapeHtml(region)}">${escapeHtml(region)}</button>`
                      )
                      .join('')}
                  </div>
                </div>
                <div>
                  <p class="meta-text">학교급</p>
                  <div class="filter-row">
                    <button class="filter-chip${state.schoolLevel === 'all' ? ' is-active' : ''}" type="button" data-level="all">전체</button>
                    ${model.filters.schoolLevels
                      .map(
                        (level) => `<button class="filter-chip${state.schoolLevel === level.id ? ' is-active' : ''}" type="button" data-level="${escapeHtml(level.id)}">${escapeHtml(level.label)}</button>`
                      )
                      .join('')}
                  </div>
                </div>
              </div>
            </section>

            ${
              model.regions.length === 0
                ? renderEmptyState('선택한 조건의 학교가 없습니다.', '다른 지역 또는 학교급을 선택해 구조를 확인해 주세요.')
                : `
                  <div class="admin-structure-layout">
                    <div class="admin-structure-main">
                      ${model.regions.map((region) => renderRegionSection(region, state)).join('')}
                    </div>
                    ${renderClubViewer(rootPath, selectedClub)}
                  </div>
                `
            }
          </div>
        </section>
      </section>
    `;

    pageRoot.querySelectorAll('[data-region]').forEach((button) => {
      button.addEventListener('click', () => {
        state.region = button.dataset.region || 'all';
        render();
      });
    });

    pageRoot.querySelectorAll('[data-level]').forEach((button) => {
      button.addEventListener('click', () => {
        state.schoolLevel = button.dataset.level || 'all';
        render();
      });
    });

    pageRoot.querySelectorAll('[data-school-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextSchoolId = button.dataset.schoolToggle || '';
        state.openSchoolId = state.openSchoolId === nextSchoolId ? '' : nextSchoolId;

        const selectedClub = model.clubEntries.find((club) => club.id === state.selectedClubId);
        if (selectedClub && selectedClub.schoolId !== state.openSchoolId) {
          state.selectedClubId = '';
        }

        render();
      });
    });

    pageRoot.querySelectorAll('[data-club]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextClubId = button.dataset.club || '';
        state.selectedClubId = state.selectedClubId === nextClubId ? '' : nextClubId;
        state.openSchoolId = button.dataset.schoolId || state.openSchoolId;
        render();
      });
    });

    pageRoot.querySelectorAll('[data-close-viewer]').forEach((button) => {
      button.addEventListener('click', () => {
        state.selectedClubId = '';
        render();
      });
    });
  }

  render();
}

