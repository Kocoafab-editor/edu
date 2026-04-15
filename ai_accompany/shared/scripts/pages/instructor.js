import { attachLogout, ensureSession } from '../auth.js';
import { buildInstructorHomeModel, loadLmsData } from '../data-store.js';
import { buildHref } from '../router.js';
import { loadEvaluationOverrides } from '../storage.js';
import { escapeHtml, renderEmptyState, renderProgressBar, renderTopbar } from '../ui.js';

export async function bootInstructorPage({ rootPath }) {
  const sessionUser = ensureSession(rootPath, ['instructor']);
  if (!sessionUser) return;

  const data = await loadLmsData(rootPath, { overrides: loadEvaluationOverrides() });
  const model = buildInstructorHomeModel(data, sessionUser);
  const header = document.getElementById('appHeader');
  const pageRoot = document.getElementById('pageRoot');

  header.innerHTML = renderTopbar({
    rootPath,
    title: '강사 메인 페이지',
    description: '소속 학교와 동아리 기준으로 팀 현황을 확인하고 학생 평가 흐름으로 진입합니다.',
    user: sessionUser,
  });
  attachLogout(rootPath);

  pageRoot.innerHTML = `
    <section class="page-stack">
      <div class="shell-grid">
        <article class="panel-card">
          <div>
            <p class="eyebrow">INSTRUCTOR</p>
            <h2 class="section-title">${escapeHtml(model.instructor.displayName)} 님의 담당 과정</h2>
            <p class="section-description">강사는 소속 팀만 확인할 수 있으며, 팀 페이지를 통해 학생별 모듈 진척도와 차시 평가 화면으로 이동합니다.</p>
          </div>

          ${
            model.school
              ? `
                <div class="profile-grid profile-grid--compact">
                  <article class="meta-card meta-card--chip">
                    <p class="meta-card__label">학교</p>
                    <p class="meta-card__value">${escapeHtml(model.school.name)}</p>
                  </article>
                  <article class="meta-card meta-card--chip">
                    <p class="meta-card__label">학교급</p>
                    <p class="meta-card__value">${escapeHtml(model.school.schoolLevelLabel)}</p>
                  </article>
                  <article class="meta-card meta-card--chip">
                    <p class="meta-card__label">동아리</p>
                    <p class="meta-card__value">${escapeHtml(model.club?.name || '-')}</p>
                  </article>
                </div>
              `
              : ''
          }
        </article>

        <aside class="overlay-panel">
          <div>
            <p class="eyebrow">TEAM LIST</p>
            <h2 class="section-title">소속 팀</h2>
          </div>
          ${
            model.teams.length === 0
              ? renderEmptyState('연결된 팀이 없습니다.', '더미 계정 연결 정보를 확인해 주세요.')
              : model.teams
                  .map(
                    (team) => `
                      <a class="tree-team tree-team--link" href="${buildHref(rootPath, 'team', { teamId: team.id })}">
                        <div>
                          <h3 class="tree-team__title">${escapeHtml(team.name)}</h3>
                          <p class="tree-team__meta">${escapeHtml(team.theme)} · ${team.studentCount}명</p>
                        </div>
                        ${renderProgressBar(team.totalProgress, '팀 전체 진척도')}
                      </a>
                    `
                  )
                  .join('')
          }
        </aside>
      </div>
    </section>
  `;
}

