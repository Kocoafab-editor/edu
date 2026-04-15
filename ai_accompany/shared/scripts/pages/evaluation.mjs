import { attachLogout, ensureSession } from '../auth.mjs';
import { buildLessonPageModel, canAccessStudent, getStatusOptions, loadLmsData } from '../data-store.mjs';
import { buildHref, readQueryParam } from '../router.mjs';
import { loadEvaluationOverrides, saveEvaluationOverride } from '../storage.mjs';
import { escapeHtml, renderEmptyState, renderTopbar } from '../ui.mjs';

export async function bootEvaluationPage({ rootPath }) {
  const sessionUser = ensureSession(rootPath, ['instructor']);
  if (!sessionUser) return;

  const data = await loadLmsData(rootPath, { overrides: loadEvaluationOverrides() });
  const header = document.getElementById('appHeader');
  const pageRoot = document.getElementById('pageRoot');

  const defaultTeam = sessionUser.teamIds?.[0] || sessionUser.teamId || data.organizations.teams[0]?.id;
  const fallbackStudent =
    data.organizations.students.find((student) => student.teamId === defaultTeam)?.id || data.organizations.students[0]?.id;
  const studentId = readQueryParam('studentId') || fallbackStudent;
  const lessonId = readQueryParam('lessonId') || data.catalog.lessons[0]?.id;

  if (!studentId || !lessonId || !canAccessStudent(data, sessionUser, studentId)) {
    header.innerHTML = renderTopbar({
      rootPath,
      title: '평가 페이지',
      description: '접근 가능한 평가 대상을 찾지 못했습니다.',
      user: sessionUser,
      navItems: [{ label: '강사 메인', href: buildHref(rootPath, 'instructor'), active: false }],
    });
    attachLogout(rootPath);
    pageRoot.innerHTML = renderEmptyState('평가할 수 없는 학생입니다.', '강사 권한이 있는 학생만 선택해 주세요.');
    return;
  }

  const model = buildLessonPageModel(data, studentId, lessonId, 'instructor');

  header.innerHTML = renderTopbar({
    rootPath,
    title: '평가 페이지',
    description: '강사는 차시 기준으로 진행 상태와 피드백을 로컬 브라우저에 저장할 수 있습니다.',
    user: sessionUser,
    navItems: [{ label: '강사 메인', href: buildHref(rootPath, 'instructor'), active: false }],
  });
  attachLogout(rootPath);

  pageRoot.innerHTML = `
    <section class="page-stack">
      <article class="hero-panel">
        <p class="eyebrow">EVALUATION</p>
        <h2 class="hero-panel__title">${escapeHtml(model.student.name)} · ${escapeHtml(model.lesson.title)}</h2>
        <p class="section-description">${escapeHtml(model.student.teamName)} · ${escapeHtml(model.lesson.moduleTitle)} · ${escapeHtml(model.lesson.topic)}</p>
      </article>

      <article class="panel-card">
        <form id="evaluationForm" class="evaluation-form">
          <label class="field-label">
            진행 상태
            <select id="statusSelect" class="field-control" name="status">
              ${getStatusOptions()
                .map(
                  (option) => `<option value="${escapeHtml(option.value)}"${option.value === model.lesson.status ? ' selected' : ''}>${escapeHtml(option.label)}</option>`
                )
                .join('')}
            </select>
          </label>

          <label class="field-label">
            피드백
            <textarea id="feedbackInput" class="field-control" name="feedback" rows="6">${escapeHtml(model.lesson.feedback)}</textarea>
          </label>

          <div class="button-row">
            <button class="primary-button" type="submit">로컬 저장</button>
            <a class="secondary-button" href="${buildHref(rootPath, 'lesson', { studentId, lessonId })}">차시 페이지로 이동</a>
          </div>
          <div id="evaluationMessage" class="inline-message" hidden></div>
        </form>
      </article>
    </section>
  `;

  const form = document.getElementById('evaluationForm');
  const message = document.getElementById('evaluationMessage');
  const statusSelect = document.getElementById('statusSelect');
  const feedbackInput = document.getElementById('feedbackInput');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    saveEvaluationOverride({
      studentId,
      lessonId,
      status: statusSelect.value,
      feedback: feedbackInput.value.trim(),
    });

    message.textContent = '로컬 브라우저에 저장했습니다. 차시 페이지와 학생 페이지에서 변경된 상태를 바로 확인할 수 있습니다.';
    message.hidden = false;
  });
}
