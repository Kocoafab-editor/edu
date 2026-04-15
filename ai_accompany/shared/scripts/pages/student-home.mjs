import { attachLogout, ensureSession } from '../auth.mjs';
import { buildStudentHomeModel, loadLmsData } from '../data-store.mjs';
import { buildHref } from '../router.mjs';
import { loadEvaluationOverrides } from '../storage.mjs';
import { bindSurfaceLinks, renderModuleGrid, renderTopbar } from '../ui.mjs';

export async function bootStudentHomePage({ rootPath }) {
  const sessionUser = ensureSession(rootPath, ['student']);
  if (!sessionUser) return;

  const data = await loadLmsData(rootPath, { overrides: loadEvaluationOverrides() });
  const model = buildStudentHomeModel(data, sessionUser);
  const header = document.getElementById('appHeader');
  const pageRoot = document.getElementById('pageRoot');
  const studentHref = buildHref(rootPath, 'student', { studentId: model.student.id });

  header.innerHTML = renderTopbar({
    rootPath,
    title: '학생 메인 페이지',
    description: '학생은 자신의 과정과 전체 진행률을 확인한 뒤 세부 학생 페이지로 이동합니다.',
    user: sessionUser,
  });
  attachLogout(rootPath);

  pageRoot.innerHTML = `
    <section class="page-stack">
      <article class="panel-card panel-card--link" data-surface-link="true" data-href="${studentHref}" role="link" tabindex="0">
        <div class="section-heading">
          <div>
            <p class="eyebrow">MY COURSE</p>
            <h2 class="section-title">${model.student.name} 학생의 현재 과정</h2>
            <p class="section-description">${model.student.schoolName} · ${model.student.teamName}</p>
          </div>
          <div class="button-row">
            <span class="progress-pill">${model.overallProgress}%</span>
          </div>
        </div>
        ${renderModuleGrid(model.modules)}
      </article>
    </section>
  `;

  bindSurfaceLinks(pageRoot);
}
