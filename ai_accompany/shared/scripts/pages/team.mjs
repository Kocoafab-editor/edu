import { attachLogout, ensureSession } from '../auth.mjs';
import { buildTeamPageModel, canAccessTeam, loadLmsData } from '../data-store.mjs';
import { buildHref, readQueryParam } from '../router.mjs';
import { loadEvaluationOverrides } from '../storage.mjs';
import { escapeHtml, renderEmptyState, renderModuleGrid, renderStatusBadge, renderTopbar } from '../ui.mjs';

function renderModulePanel(rootPath, module) {
  return `
    <details class="module-panel">
      <summary class="module-panel__summary">
        <div class="module-panel__meta">
          <p class="eyebrow">MODULE TRACKER</p>
          <h3 class="section-subtitle">${escapeHtml(module.title)}</h3>
          <p class="section-description">${module.lessonCount}개 차시 기준 학생별 제출 및 평가 상태</p>
        </div>
        <div class="module-panel__summary-side">
          <span class="progress-pill">${module.progress}%</span>
          <span class="module-panel__hint">열기</span>
        </div>
      </summary>
      <div class="module-panel__body">
        <div class="lesson-chip-row">
          ${module.lessons
            .map(
              (lesson) => `
                <article class="lesson-chip">
                  <p class="lesson-chip__title">${escapeHtml(lesson.title)}</p>
                  <p class="lesson-chip__topic">${escapeHtml(lesson.topic)}</p>
                </article>
              `
            )
            .join('')}
        </div>
        <div class="table-wrap">
          <table class="data-table team-lesson-table">
            <thead>
              <tr>
                <th>학생</th>
                <th>모듈 진척도</th>
                ${module.lessons.map((lesson) => `<th>${escapeHtml(lesson.title)}</th>`).join('')}
                <th>이동</th>
              </tr>
            </thead>
            <tbody>
              ${module.rows
                .map(
                  (row) => `
                    <tr>
                      <td>${escapeHtml(`${row.name} (${row.gradeLabel} ${row.number}번)`)}</td>
                      <td>${row.moduleProgress}%</td>
                      ${row.lessons
                        .map(
                          (lesson) => `
                            <td>
                              <div class="lesson-status-cell">
                                ${renderStatusBadge(lesson.status, lesson.statusLabel)}
                                <span class="lesson-status-cell__progress">${lesson.progress}%</span>
                              </div>
                            </td>
                          `
                        )
                        .join('')}
                      <td><a class="table-link" href="${buildHref(rootPath, 'student', { studentId: row.studentId })}">학생 보기</a></td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  `;
}

export async function bootTeamPage({ rootPath }) {
  const sessionUser = ensureSession(rootPath, ['admin', 'instructor']);
  if (!sessionUser) return;

  const data = await loadLmsData(rootPath, { overrides: loadEvaluationOverrides() });
  const header = document.getElementById('appHeader');
  const pageRoot = document.getElementById('pageRoot');
  const requestedTeamId = readQueryParam('teamId');
  const fallbackTeamId =
    requestedTeamId ||
    (sessionUser.role === 'instructor' ? sessionUser.teamIds?.[0] || sessionUser.teamId : data.organizations.teams[0]?.id);

  if (!fallbackTeamId || !canAccessTeam(data, sessionUser, fallbackTeamId)) {
    header.innerHTML = renderTopbar({
      rootPath,
      title: '팀 페이지',
      description: '접근 가능한 팀을 찾지 못했습니다.',
      user: sessionUser,
    });
    attachLogout(rootPath);
    pageRoot.innerHTML = renderEmptyState('접근할 수 없는 팀입니다.', '권한이 있는 팀을 다시 선택해 주세요.');
    return;
  }

  const model = buildTeamPageModel(data, fallbackTeamId);

  header.innerHTML = renderTopbar({
    rootPath,
    title: '팀 페이지',
    description: '팀 전체 진척도와 모듈별 차시 트래킹을 함께 확인합니다.',
    user: sessionUser,
  });
  attachLogout(rootPath);

  pageRoot.innerHTML = `
    <section class="page-stack">
      <article class="hero-panel">
        <p class="eyebrow">TEAM</p>
        <h2 class="hero-panel__title">${escapeHtml(model.team.name)}</h2>
        <p class="section-description">${escapeHtml(model.team.schoolName)} · ${escapeHtml(model.team.clubName)} · ${escapeHtml(model.team.theme)}</p>
        <div class="button-row">
          <span class="progress-pill">${model.totalProgress}%</span>
        </div>
      </article>

      <article class="panel-card">
        <div class="team-module-section">
          <div class="section-heading">
            <div>
              <p class="eyebrow">TEAM MODULES</p>
              <h2 class="section-title">팀 모듈 진척도</h2>
              <p class="section-description">상단에는 4개 모듈 평균, 하단에는 모듈별 차시 트래킹을 배치했습니다.</p>
            </div>
          </div>
          ${renderModuleGrid(model.moduleProgress)}
          <div class="module-panel-list">
            ${model.moduleBreakdowns.map((module) => renderModulePanel(rootPath, module)).join('')}
          </div>
        </div>
      </article>

      <article class="panel-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">STUDENTS</p>
            <h2 class="section-title">학생별 모듈 요약</h2>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>학생</th>
                <th>전체</th>
                <th>모듈 1</th>
                <th>모듈 2</th>
                <th>모듈 3</th>
                <th>모듈 4</th>
                <th>이동</th>
              </tr>
            </thead>
            <tbody>
              ${model.students
                .map(
                  (student) => `
                    <tr>
                      <td>${escapeHtml(`${student.name} (${student.gradeLabel} ${student.number}번)`)}</td>
                      <td>${student.overallProgress}%</td>
                      ${student.moduleProgress.map((module) => `<td>${module.progress}%</td>`).join('')}
                      <td><a class="table-link" href="${buildHref(rootPath, 'student', { studentId: student.id })}">학생 보기</a></td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  `;
}
