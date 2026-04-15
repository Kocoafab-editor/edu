import { attachLogout, ensureSession } from '../auth.js';
import { buildStudentPageModel, canAccessStudent, loadLmsData } from '../data-store.js';
import { buildHref, readQueryParam } from '../router.js';
import { loadEvaluationOverrides } from '../storage.js';
import { bindSurfaceLinks, escapeHtml, renderEmptyState, renderTopbar } from '../ui.js';

function buildNavItems(rootPath, sessionUser) {
  if (sessionUser.role === 'admin') {
    return [
      { label: '전체 개요', href: buildHref(rootPath, 'admin-overview'), active: false },
      { label: '학교 구조', href: buildHref(rootPath, 'admin-schools'), active: false },
    ];
  }

  if (sessionUser.role === 'instructor') {
    return [{ label: '강사 메인', href: buildHref(rootPath, 'instructor'), active: false }];
  }

  return [{ label: '학생 메인', href: buildHref(rootPath, 'student-home'), active: false }];
}

export async function bootStudentPage({ rootPath }) {
  const sessionUser = ensureSession(rootPath, ['admin', 'instructor', 'student']);
  if (!sessionUser) return;

  const data = await loadLmsData(rootPath, { overrides: loadEvaluationOverrides() });
  const header = document.getElementById('appHeader');
  const pageRoot = document.getElementById('pageRoot');
  const requestedStudentId = readQueryParam('studentId') || sessionUser.studentId || data.organizations.students[0]?.id;

  if (!requestedStudentId || !canAccessStudent(data, sessionUser, requestedStudentId)) {
    header.innerHTML = renderTopbar({
      rootPath,
      title: '학생 페이지',
      description: '접근 가능한 학생 정보를 찾지 못했습니다.',
      user: sessionUser,
      navItems: buildNavItems(rootPath, sessionUser),
    });
    attachLogout(rootPath);
    pageRoot.innerHTML = renderEmptyState('접근할 수 없는 학생입니다.', '권한이 있는 학생으로 다시 진입해 주세요.');
    return;
  }

  const model = buildStudentPageModel(data, requestedStudentId);

  header.innerHTML = renderTopbar({
    rootPath,
    title: '학생 페이지',
    description: '프로필, 전체 진행도, 모듈별 차시 현황을 한 화면에서 확인합니다.',
    user: sessionUser,
    navItems: buildNavItems(rootPath, sessionUser),
  });
  attachLogout(rootPath);

  pageRoot.innerHTML = `
    <section class="page-stack">
      <article class="hero-panel">
        <p class="eyebrow">STUDENT</p>
        <h2 class="hero-panel__title">${escapeHtml(model.student.name)}</h2>
        <p class="section-description">${escapeHtml(`${model.student.schoolName} · ${model.student.teamName} · ${model.student.gradeLabel} ${model.student.number}번`)}</p>
        <div class="button-row">
          <span class="progress-pill">${model.overallProgress}%</span>
        </div>
      </article>

      <section class="profile-grid">
        <article class="meta-card">
          <p class="meta-card__label">지역</p>
          <p class="meta-card__value">${escapeHtml(model.student.region)}</p>
        </article>
        <article class="meta-card">
          <p class="meta-card__label">학교급</p>
          <p class="meta-card__value">${escapeHtml(model.student.schoolLevelLabel)}</p>
        </article>
        <article class="meta-card">
          <p class="meta-card__label">동아리</p>
          <p class="meta-card__value">${escapeHtml(model.student.clubName)}</p>
        </article>
      </section>

      ${model.modules
        .map(
          (module) => `
            <article class="panel-card">
              <div class="section-heading">
                <div>
                  <p class="eyebrow">MODULE</p>
                  <h2 class="section-title">${escapeHtml(module.title)}</h2>
                </div>
                <span class="progress-pill">${module.progress}%</span>
              </div>
              <div class="lesson-list">
                ${module.lessons
                  .map(
                    (lesson) => {
                      const lessonHref = buildHref(rootPath, 'lesson', { studentId: model.student.id, lessonId: lesson.id });
                      const evaluationHref = buildHref(rootPath, 'evaluation', { studentId: model.student.id, lessonId: lesson.id });

                      return `
                      <article class="lesson-row lesson-row--link" data-surface-link="true" data-href="${lessonHref}" role="link" tabindex="0">
                        <div class="lesson-row__head">
                          <div>
                            <h3 class="lesson-row__title">${escapeHtml(lesson.title)}</h3>
                            <p class="lesson-row__meta">${escapeHtml(lesson.topic)}</p>
                          </div>
                          <div class="button-row">
                            <span class="status-badge status-badge--${lesson.status}">${escapeHtml(lesson.statusLabel)}</span>
                            <span class="progress-pill">${lesson.progress}%</span>
                          </div>
                        </div>
                        ${
                          sessionUser.role === 'instructor'
                            ? `
                              <div class="lesson-row__actions">
                                <a class="secondary-button" href="${evaluationHref}">평가하기</a>
                              </div>
                            `
                            : ''
                        }
                      </article>
                    `;
                    }
                  )
                  .join('')}
              </div>
            </article>
          `
        )
        .join('')}
    </section>
  `;

  bindSurfaceLinks(pageRoot);
}

