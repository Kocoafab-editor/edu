import { authenticateUser, getLandingHref, loadSession, saveSession } from '../auth.js';
import { loadLmsData } from '../data-store.js';

export async function bootLoginPage({ rootPath }) {
  const existingSession = loadSession();
  if (existingSession) {
    window.location.href = getLandingHref(rootPath, existingSession);
    return;
  }

  const data = await loadLmsData(rootPath);
  const header = document.getElementById('appHeader');
  const pageRoot = document.getElementById('pageRoot');
  if (header) {
    header.innerHTML = '';
  }

  pageRoot.innerHTML = `
    <section class="page-stack">
      <section class="login-shell">
        <h1 class="login-service-title">AI 동행 피지컬AI\nLMS</h1>
        <form id="loginForm" class="field-grid login-form">
          <label class="field-label">
            아이디
            <input id="userIdInput" class="field-control" name="userId" autocomplete="username" placeholder="아이디를 입력하세요">
          </label>
          <label class="field-label">
            비밀번호
            <input id="passwordInput" class="field-control" type="password" name="password" autocomplete="current-password" placeholder="비밀번호를 입력하세요">
          </label>
          <button class="primary-button" type="submit">로그인</button>
          <div id="loginMessage" class="inline-message" hidden></div>
        </form>
      </section>
    </section>
  `;

  const loginForm = document.getElementById('loginForm');
  const message = document.getElementById('loginMessage');
  const userIdInput = document.getElementById('userIdInput');
  const passwordInput = document.getElementById('passwordInput');

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const sessionUser = authenticateUser(data, userIdInput.value.trim(), passwordInput.value.trim());
    if (!sessionUser) {
      message.textContent = '아이디 또는 비밀번호가 일치하지 않습니다.';
      message.hidden = false;
      return;
    }

    saveSession(sessionUser);
    window.location.href = getLandingHref(rootPath, sessionUser);
  });
}

