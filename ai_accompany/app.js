import { bootLoginPage } from './shared/scripts/pages/login.js';
import { bootAdminOverviewPage } from './shared/scripts/pages/admin-overview.js';
import { bootAdminSchoolsPage } from './shared/scripts/pages/admin-schools.js';
import { bootInstructorPage } from './shared/scripts/pages/instructor.js';
import { bootTeamPage } from './shared/scripts/pages/team.js';
import { bootStudentHomePage } from './shared/scripts/pages/student-home.js';
import { bootStudentPage } from './shared/scripts/pages/student.js';
import { bootLessonPage } from './shared/scripts/pages/lesson.js';
import { bootEvaluationPage } from './shared/scripts/pages/evaluation.js';

const bootMap = {
  'login': bootLoginPage,
  'admin-overview': bootAdminOverviewPage,
  'admin-schools': bootAdminSchoolsPage,
  'instructor': bootInstructorPage,
  'team': bootTeamPage,
  'student-home': bootStudentHomePage,
  'student': bootStudentPage,
  'lesson': bootLessonPage,
  'evaluation': bootEvaluationPage,
};

async function bootstrap() {
  const pageName = document.body.dataset.page;
  const rootPath = document.body.dataset.appRoot || '.';
  const bootPage = bootMap[pageName];

  if (!bootPage) {
    throw new Error(`Unknown page: ${pageName}`);
  }

  await bootPage({ rootPath });
}

function renderFatalError(error) {
  const pageRoot = document.getElementById('pageRoot');
  if (!pageRoot) return;

  pageRoot.innerHTML = `
    <section class="page-stack">
      <article class="panel-card empty-state">
        <p class="eyebrow">LOAD ERROR</p>
        <h1 class="section-title">페이지를 불러오지 못했습니다.</h1>
        <p class="section-description">${error.message}</p>
      </article>
    </section>
  `;
}

bootstrap().catch((error) => {
  console.error(error);
  renderFatalError(error);
});
