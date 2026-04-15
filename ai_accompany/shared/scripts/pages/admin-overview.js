import { attachLogout, ensureSession } from '../auth.js';
import { buildAdminOverviewModel, loadLmsData } from '../data-store.js';
import { buildHref } from '../router.js';
import { loadEvaluationOverrides } from '../storage.js';
import { renderModuleGrid, renderPageTabs, renderSummaryCards, renderTopbar } from '../ui.js';

export async function bootAdminOverviewPage({ rootPath }) {
  const sessionUser = ensureSession(rootPath, ['admin']);
  if (!sessionUser) return;

  const data = await loadLmsData(rootPath, { overrides: loadEvaluationOverrides() });
  const model = buildAdminOverviewModel(data);
  const header = document.getElementById('appHeader');
  const pageRoot = document.getElementById('pageRoot');

  header.innerHTML = renderTopbar({
    rootPath,
    title: '어드민 메인 페이지',
    description: '전체 학교급별 운영 현황과 모듈 진척도를 한 번에 확인하는 관리자용 개요 화면입니다.',
    user: sessionUser,
  });
  attachLogout(rootPath);

  pageRoot.innerHTML = `
    <section class="page-stack">
      <section class="admin-body-shell">
        ${renderPageTabs(
          [
            { label: '전체 개요', href: buildHref(rootPath, 'admin-overview'), active: true },
            { label: '학교 구조', href: buildHref(rootPath, 'admin-schools'), active: false },
          ],
          '어드민 화면'
        )}

        <div class="admin-body-content">
          <section class="summary-stage">
            <div class="summary-stage__head">
              <p class="eyebrow">ADMIN OVERVIEW</p>
              <h2 class="section-title">학교급 중심으로 프로그램 진행 현황을 요약합니다.</h2>
              <p class="section-description">지역 평균 대신 학교급별 운영 상태와 4개 모듈 진척도를 우선 배치해 LMS 구조에 맞춘 개요 화면으로 재구성했습니다.</p>
            </div>
            ${renderSummaryCards([
              { label: '운영 학교', value: `${model.kpis.schoolCount}개교`, note: '중학교 · 고등학교 포함' },
              { label: '운영 동아리', value: `${model.kpis.clubCount}개`, note: '학교 내 최대 2개 동아리 구조' },
              { label: '운영 팀', value: `${model.kpis.teamCount}팀`, note: '강사/어드민이 확인하는 팀 단위' },
              { label: '학생 수', value: `${model.kpis.studentCount}명`, note: '더미 데이터 기준 등록 학생' },
            ])}
          </section>

          <article class="panel-card">
            <div class="section-heading">
              <div>
                <p class="eyebrow">GLOBAL MODULES</p>
                <h2 class="section-title">전체 4개 모듈 진척도</h2>
              </div>
            </div>
            ${renderModuleGrid(model.moduleSummaries)}
          </article>

          ${model.schoolLevels
            .map(
              (level) => `
                <article class="panel-card">
                  <div class="section-heading">
                    <div>
                      <p class="eyebrow">${level.label}</p>
                      <h2 class="section-title">${level.label} 대시보드</h2>
                      <p class="section-description">${level.schoolCount}개교 · ${level.teamCount}팀 · ${level.studentCount}명 기준 집계입니다.</p>
                    </div>
                  </div>
                  ${renderModuleGrid(level.moduleProgress)}
                </article>
              `
            )
            .join('')}
        </div>
      </section>
    </section>
  `;
}

