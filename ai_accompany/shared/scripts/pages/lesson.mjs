import { attachLogout, ensureSession } from '../auth.mjs';
import { buildLessonPageModel, canAccessStudent, loadLmsData } from '../data-store.mjs';
import { buildHref, readQueryParam } from '../router.mjs';
import { loadEvaluationOverrides } from '../storage.mjs';
import { escapeHtml, renderEmptyState, renderTopbar } from '../ui.mjs';

export async function bootLessonPage({ rootPath }) {
  const sessionUser = ensureSession(rootPath, ['admin', 'instructor', 'student']);
  if (!sessionUser) return;

  const data = await loadLmsData(rootPath, { overrides: loadEvaluationOverrides() });
  const header = document.getElementById('appHeader');
  const pageRoot = document.getElementById('pageRoot');
  const studentId = readQueryParam('studentId') || sessionUser.studentId || data.organizations.students[0]?.id;
  const lessonId = readQueryParam('lessonId') || data.catalog.lessons[0]?.id;
  const saved = readQueryParam('saved');

  if (!studentId || !lessonId || !canAccessStudent(data, sessionUser, studentId)) {
    header.innerHTML = renderTopbar({
      rootPath,
      title: '차시 페이지',
      description: '접근 가능한 차시 정보를 찾지 못했습니다.',
      user: sessionUser,
    });
    attachLogout(rootPath);
    pageRoot.innerHTML = renderEmptyState('접근할 수 없는 차시입니다.', '학생 또는 차시 링크를 다시 확인해 주세요.');
    return;
  }

  const model = buildLessonPageModel(data, studentId, lessonId, sessionUser.role);

  header.innerHTML = renderTopbar({
    rootPath,
    title: '차시 페이지',
    description: '구글 드라이브 제출 링크와 강사 피드백을 확인하는 세부 화면입니다.',
    user: sessionUser,
  });
  attachLogout(rootPath);

  pageRoot.innerHTML = `
    <section class="page-stack">
      <article class="hero-panel">
        <p class="eyebrow">${escapeHtml(model.lesson.moduleTitle)}</p>
        <h2 class="hero-panel__title">${escapeHtml(model.lesson.title)}</h2>
        <p class="section-description">${escapeHtml(model.student.name)} · ${escapeHtml(model.student.teamName)} · ${escapeHtml(model.lesson.topic)}</p>
        <div class="button-row">
          <span class="status-badge status-badge--${model.lesson.status}">${escapeHtml(model.lesson.statusLabel)}</span>
          <span class="progress-pill">${model.lesson.progress}%</span>
        </div>
      </article>

      ${saved ? '<div class="inline-message">평가 내용이 로컬 브라우저에 저장되었습니다.</div>' : ''}

      <article class="panel-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">SUBMISSION</p>
            <h2 class="section-title">과제 제출 링크</h2>
          </div>
        </div>
        <div class="button-row">
          <a class="primary-button" href="${escapeHtml(model.lesson.driveUrl)}" target="_blank" rel="noreferrer">구글 드라이브 열기</a>
          ${
            model.permissions.canEvaluate
              ? `<a class="action-link" href="${buildHref(rootPath, 'evaluation', { studentId: model.student.id, lessonId: model.lesson.id })}">평가하기</a>`
              : ''
          }
        </div>
      </article>

      <article class="panel-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">FEEDBACK</p>
            <h2 class="section-title">강사 피드백</h2>
          </div>
        </div>
        <div class="note-box">${escapeHtml(model.lesson.feedback || '아직 등록된 피드백이 없습니다.')}</div>
      </article>
    </section>
  `;
}
