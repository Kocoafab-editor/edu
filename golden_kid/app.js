// app.js - 탭 전환(해시 이동 없음) + JSON 렌더 + 예시 모달 + 생성/복사/지우기
(() => {
  "use strict";

  const qs  = (sel, root=document) => root.querySelector(sel);
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const el  = (tag, cls) => { const n=document.createElement(tag); if(cls) n.className=cls; return n; };
  const on  = (node, ev, fn, opt) => node && node.addEventListener(ev, fn, opt);

  const S = {
    data: null,
    fieldsMap: new Map(),      // key -> textarea
    activeTab: "learn",
    toastTimer: null
  };

  function setDisabled(btn, disabled) {
    if (!btn) return;
    btn.classList.toggle("is-disabled", !!disabled);
    btn.setAttribute("aria-disabled", disabled ? "true" : "false");
    btn.disabled = !!disabled;                  // ← 실제 클릭 자체를 막음
  }
  function isDisabled(btn) {
    return !btn || btn.disabled || btn.classList.contains("is-disabled") ||
          btn.getAttribute("aria-disabled") === "true";
  }
  function isBlank(v) { return !v || !String(v).trim(); }

  /* ---------------- Toast ---------------- */
  function showToast(text) {
    let t = document.querySelector(".toast-top");
    if (!t) {
      t = document.createElement("div");
      t.className = "toast-top";
      t.setAttribute("role", "status");
      t.setAttribute("aria-live", "polite");
      document.body.appendChild(t);
    }
    // 내용 + 진행바 재구성(애니메이션 리스타트 위해 매번 새로 붙임)
    t.innerHTML = `<span class="toast-top__text">${text}</span><div class="toast-top__bar"></div>`;
    t.hidden = false;

    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
  }

  /* --------------- Template --------------- */
  function escapeHTML(s="") { return s.replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c])); }
  function nl2br(s="")     { return s.replace(/\n/g,"<br>"); }

  /* ---------------- Data ---------------- */
  async function loadJSON() {
    const res = await fetch("content.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("content.json 로드 실패");
    S.data = await res.json();
  }

  /* ---------------- Tabs ---------------- */
  function bindTabs() {
    qsa(".tab").forEach(btn => {
      on(btn, "click", e => {
        e.preventDefault(); // 해시 이동 방지(혹시 a로 바뀌더라도)
        const key = btn.dataset.tab;
        if (!key) return;
        S.activeTab = key;
        qsa(".tab").forEach(t => t.classList.toggle("is-active", t === btn));
        qsa(".panel").forEach(p => p.classList.remove("is-active"));
        qs(`#panel-${key}`)?.classList.add("is-active");
      });
    });
  }

  /* ------------- Learn render ------------ */
  function renderGuideFromJSON() {
    const guide = S.data.CO_STAR_GUIDE_CONTENT;
    if (!guide) return;
    const rootCard = qs("#panel-learn .card--peach"); // 첫 번째 가이드 카드

    const h2   = rootCard?.querySelector(".card-title");
    const desc = rootCard?.querySelector(".card-desc");
    if (h2)   h2.textContent   = guide.title;
    if (desc) desc.textContent = guide.description;

    const grid = rootCard?.querySelector(".grid-3");
    if (grid) {
      grid.innerHTML = "";
      guide.sections.forEach(s => {
        const card = el("div","mini-card");
        const h3 = el("h3","mini-title");
        h3.innerHTML = `<span class="mr">${s.emoji}</span>${s.label}`;
        const p1 = el("p","mini-desc"); p1.textContent = s.description;
        const p2 = el("p","mini-example"); p2.textContent = s.detail;
        card.append(h3, p1, p2);
        grid.append(card);
      });
    }
  }

  function renderPromptExamples() {
    const list = S.data.PROMPT_EXAMPLES || [];
    const grid = qs("#panel-learn article:nth-of-type(2) .grid-2");
    if (!grid) return;
    grid.innerHTML = "";

    list.forEach(ex => {
      const card = el("div","card card--peach");
      const h3   = el("h3","ex-title"); h3.textContent = ex.title;

      const bad  = el("div","ex-box ex-box--bad");
      bad.innerHTML = `
        <p class="ex-head-bad">🤔 아쉬운 프롬프트</p>
        <p class="ex-text">${escapeHTML(ex.bad.prompt)}</p>
        <p class="ex-reason">이유: ${escapeHTML(ex.bad.reason)}</p>
      `;

      const good = el("div","ex-box ex-box--good");
      good.innerHTML = `
        <p class="ex-head-good">👍 좋은 프롬프트</p>
        <p class="ex-text">${nl2br(escapeHTML(ex.good.prompt))}</p>
        <p class="ex-reason">이유: ${escapeHTML(ex.good.reason)}</p>
      `;

      card.append(h3, bad, good);
      grid.append(card);
    });
  }

  /* ------------- Maker render ------------ */
  function renderFields() {
    const fields = S.data.CO_STAR_FIELDS || [];
    const grid = qs('#panel-maker [data-slot="fields-grid"]');
    if (!grid) return;
    grid.innerHTML = "";
    S.fieldsMap.clear();

    fields.forEach(f => {
      const card = el("div","card card--componant field");

      const head = el("div","field-head");
      const label = el("label","field-label");
      label.innerHTML = `<span class="mr">${f.emoji}</span>${f.label}`;

      const btnEx = el("button","btn btn--ghost");
      btnEx.type = "button";
      btnEx.dataset.openExample = f.key;
      btnEx.textContent = "💡 예시 보기";

      head.append(label, btnEx);

      const p = el("p","field-desc"); p.textContent = f.description;

      const ta = el("textarea","textarea");
      ta.placeholder = `${f.label}를 입력하세요…`;
      ta.dataset.field = f.key;
      S.fieldsMap.set(f.key, ta);

      card.append(head, p, ta);
      grid.append(card);
    });

    // 예시 모달
    qsa("[data-open-example]").forEach(b => on(b,"click",() => openExampleModal(b.dataset.openExample)));
  }

  function generatePrompt() {
    const preview = qs('[data-slot="prompt-preview"]');
    if (!preview) return;

    const fields = S.data.CO_STAR_FIELDS;
    const parts = [];

    // objective 필수
    const objKey = "objective";
    const obj = (S.fieldsMap.get(objKey)?.value || "").trim();
    if (!obj) {
      // 기존 showToast 대신, 우상단 라벨 표시
      showToast("목표(Objective)를 입력해주세요.");
      // 포커스 유도(선택)
      S.fieldsMap.get(objKey)?.focus();
      return;
    }

    fields.forEach(f => {
      const v = (S.fieldsMap.get(f.key)?.value || "").trim();
      if (v) parts.push(`【${f.label}】\n${v}`);
    });

    preview.value = parts.join("\n\n");
    showToast("프롬프트가 생성되었습니다.");

    bindMakerCopyGuard();
  }

  function copyPrompt() {
    const preview = qs('[data-slot="prompt-preview"]');
    const txt = preview?.value?.trim();
    if (!txt) return showToast("복사할 내용이 없습니다.");
    navigator.clipboard.writeText(txt).then(() => showToast("복사되었습니다."));
  }

  function clearPrompt() {
    S.fieldsMap.forEach(t => (t.value = ""));
    const preview = qs('[data-slot="prompt-preview"]');
    if (preview) preview.value = "";
    showToast("모든 입력을 지웠습니다.");
  }

  function bindMakerActions() {
    on(qs('#panel-maker [data-action="generate"]'), "click", generatePrompt);
    on(qs('#panel-maker [data-action="copy"]'),     "click", copyPrompt);
    on(qs('#panel-maker [data-action="clear"]'),    "click", clearPrompt);
  }

  /* ------------- Example modal ----------- */
  /* a11y용 포커스 기억/복귀 */
  let __lastFocus = null;
  function trapFocus(modal){
    __lastFocus = document.activeElement;
    const x = modal.querySelector(".modal__x");
    x && x.focus();
  }
  function releaseFocus(){
    if (__lastFocus && typeof __lastFocus.focus === "function") {
      __lastFocus.focus();
    }
    __lastFocus = null;
  }

  /* 예시 모달 열기: 제목=이모지+라벨, 설명=CO_STAR_FIELDS.description, 예시=EXAMPLE_SUGGESTIONS */
  function openExampleModal(fieldKey) {
    const modal   = document.querySelector(".modal");
    const titleEl = modal.querySelector("#exampleModalTitle");
    const descEl  = modal.querySelector(".modal__desc");
    const listEl  = modal.querySelector(".modal__examples");

    // 필드 메타
    const fields = (S.data?.CO_STAR_FIELDS || []);
    const field  = fields.find(f => f.key === fieldKey);

    // 예시 목록
    const sugg   = (S.data?.EXAMPLE_SUGGESTIONS || {})[fieldKey] || [];

    // 제목/설명
    titleEl.innerHTML  = field ? `<span class="mr">${field.emoji}</span>${field.label}` : "예시";
    descEl.textContent = field?.description || "";

    // 예시 렌더 (Tailwind 유틸 느낌을 살린 순수 CSS 클래스)
    listEl.innerHTML = "";
    if (sugg.length === 0) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "해당 필드의 예시가 없습니다.";
      listEl.append(p);
    } else {
      sugg.forEach(text => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = [
          "ex-suggestion",   // 기본: border 0
          "border-solid",    // style: solid (폭은 건드리지 않음 → 상/우/하는 여전히 0)
          "border-l-4",      // 왼쪽 두께만 4px
          "border-[#88D8D0]",// 테두리 색(좌측에만 보임)
          "bg-[#88D8D0]/30", // 배경
          "p-3",
          "rounded-r-lg",
          "cursor-pointer",
          "transition-colors"
        ].join(" ");
        b.textContent = text;
        b.addEventListener("click", () => {
          const ta = S.fieldsMap.get(fieldKey);
          if (ta) ta.value = text;
          closeModal();
        });
        listEl.append(b);
      });
    }

    modal.setAttribute("aria-hidden","false");
    trapFocus(modal);
  }

  /* 닫기: X/배경/ESC */
  function closeModal() {
    const modal = document.querySelector(".modal");
    if (!modal) return;
    modal.setAttribute("aria-hidden","true");
    releaseFocus();
  }

  /* 닫기 바인딩(한번만 호출) */
  function bindModal() {
    // X, 배경 클릭 닫기
    document.querySelectorAll("[data-close]").forEach(n => {
      n.addEventListener("click", closeModal);
    });
    // ESC 닫기
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  /* ----------- Chatbot (chips only) ------ */
  function createSystemPrompt({ grade, subject, topic, tone }) {
    return [
      `당신은 최고의 AI 학습 튜터, '${subject} 척척박사'입니다. CO-STAR 프레임워크에 따라 아래 지시사항을 반드시 엄격하게 준수하여 학생과의 대화를 진행하세요.

[C: 맥락 (Context)]
- 당신의 역할: 당신은 '${subject}' 과목의 전문가이자, 초등 3학년 학생들을 가르치는 매우 친절하고 상냥한 선생님입니다.
- 학생의 상황: 학생은 '${topic}'에 대해 배우고 싶어하며, 호기심이 많습니다.
- 대화의 배경: 즐거운 1:1 온라인 학습 시간입니다.

[O: 목표 (Objective)]
- 주요 목표: 학생이 '${topic}'의 핵심 개념을 완벽하게 이해하고 학습에 자신감을 갖도록 돕는 것입니다.
- 세부 목표:
    1. '${topic}'에 대한 학생의 질문에 명확하고 이해하기 쉽게 답변합니다.
    2. 학생이 스스로 생각하고 답을 찾을 수 있도록 유도합니다.
    3. 대화 마지막에 간단한 퀴즈를 통해 학생의 이해도를 확인합니다.
    4. 항상 긍정적인 상호작용을 통해 학습 동기를 부여합니다.

[S: 스타일 (Style)]
- 글쓰기 스타일: 대화체. 딱딱한 설명문이 아닌, 실제 선생님과 대화하는 것처럼 자연스럽게 이야기하세요.
- 언어 사용: 초등 3학년 학생의 눈높이에 맞춰 쉬운 단어와 짧은 문장을 사용하세요.
- 이모지 활용: 대화에 이모지를 사용하지 마세요.

[T: 톤 (Tone)]
- 기본 톤: 친근한 존댓말. 학생의 눈높이에 맞춰 대화하세요.
- 학생이 틀렸을 때: "아쉬워요!"나 "거의 맞았어요!" 와 같이 부정적인 표현 대신, "좋은 시도예요! 다른 방향으로 생각해볼까요?" 와 같이 긍정적으로 격려해주세요.

[A: 독자 (Audience)]
- 주 대상: 초등 3학년 학생입니다. 모든 설명과 질문은 이 학생의 지식 수준과 관심사에 맞춰져야 합니다.

[R: 응답 형식 (Response) & 규칙]
- 절대 규칙 1 (주제 고정): 대화는 반드시 '${topic}' 주제 안에서만 이루어져야 합니다. 주제를 벗어나는 질문에는 "앗, 그건 지금 우리가 배우는 내용과 조금 다른 이야기 같아요! 다시 '${topic}'에 집중해볼까요? 궁금한 점이 있나요?" 라고 답변하며 주제로 복귀시키세요.
- 절대 규칙 2 (안전성): 학생의 개인 정보(이름, 학교, 나이 등)를 절대로 묻지 마세요. 폭력적이거나 유해한 콘텐츠는 절대 생성하지 않습니다.
- 대화 흐름:
    1. 첫인사: "안녕하세요! 저는 '${subject} 척척박사'이에요. 오늘은 '${topic}'에 대해 함께 재미있게 알아볼까요? 무엇이 가장 궁금한가요?" 와 같이 자신을 소개하며 대화를 시작하세요.
    2. 질문과 답변: 학생의 질문에 답변하되, 정답을 바로 알려주기보다는 "좋은 질문이에요! 혹시 ~에 대해서는 들어봤나요?" 와 같이 힌트를 먼저 제공하세요.
    3. 퀴즈 타임: 설명이 어느 정도 진행되면, "좋아요! 그럼 배운 내용을 잘 이해했는지 확인하는 깜짝 퀴즈! (퀴즈 내용)" 와 같이 퀴즈를 1~2개 내주세요.
    4. 마무리: "오늘 정말 잘했어요! '${topic}'에 대해 박사가 다 되었는걸요? 다음에 또 만나요!" 와 같이 칭찬과 격려로 대화를 마무리하세요.`
    ].join("\n");
  }

  function renderChatbotControls() {
    const root    = document.querySelector("#panel-chatbot");
    const gSel    = root.querySelector('[data-slot="grade"]');
    const tSel    = root.querySelector('[data-slot="tone"]');
    const subject = root.querySelector('[data-slot="subject"]');
    const topic   = root.querySelector('[data-slot="topic"]');
    const chips   = root.querySelector('[data-slot="chatbot-examples"]');

    const buildBtn = root.querySelector('[data-action="build-system"]');
    const copyBtn  = root.querySelector('[data-action="copy-system"]');
    const resetBtn = root.querySelector('[data-action="reset-system"]');
    const outArea  = root.querySelector('[data-slot="system-preview"]');

    // 학년/말투 옵션
    const GRADE_LEVELS = [
      "초등 1학년","초등 2학년","초등 3학년","초등 4학년",
      "초등 5학년","초등 6학년","중등 1학년","중등 2학년","중등 3학년"
    ];
    gSel.innerHTML = GRADE_LEVELS.map(v => `<option>${v}</option>`).join("");
    gSel.selectedIndex = 0;

    const TONE_OPTIONS = ["친근한 존댓말","차분하고 전문적인 존댓말","상냥하고 발랄한 말투","유머러스","따뜻하고 격려"];
    tSel.innerHTML = TONE_OPTIONS.map(v => `<option>${v}</option>`).join("");

    // 추천 칩
    chips.innerHTML = "";
    (S.data.CHATBOT_EXAMPLES || []).forEach(ex => {
      const c = document.createElement("button");
      c.type = "button"; c.className = "chip";
      c.textContent = `${ex.subject} · ${ex.topic}`;
      c.addEventListener("click", () => { subject.value = ex.subject; topic.value = ex.topic; updateStates(); });
      chips.append(c);
    });

    // 상태 계산: 4개 필드(과목/학년/단원/말투) 모두 유효해야 만들기 버튼 활성
    function canBuild() {
      const okSubject = !isBlank(subject.value);
      const okTopic   = !isBlank(topic.value);
      const okGrade   = !isBlank(gSel.value);
      const okTone    = !isBlank(tSel.value);
      return okSubject && okTopic && okGrade && okTone;
    }
    function canCopy() {
      return !isBlank(outArea.value);
    }
    function updateStates() {
      setDisabled(buildBtn, !canBuild());
      setDisabled(copyBtn,  !canCopy());
    }

    // 입력 변화 → 즉시 상태 갱신
    ["input","change"].forEach(ev => {
      subject.addEventListener(ev, updateStates);
      topic.addEventListener(ev,   updateStates);
      gSel.addEventListener(ev,    updateStates);
      tSel.addEventListener(ev,    updateStates);
    });
    outArea.addEventListener("input", updateStates);

    // 액션(실제 가드도 한 번 더 확인)
    buildBtn.addEventListener("click", () => {
      if (isDisabled(buildBtn)) return;            // ← 실질 차단
      const sys = createSystemPrompt({
        grade: gSel.value || "",
        subject: subject.value.trim(),
        topic: topic.value.trim(),
        tone: tSel.value || ""
      });
      outArea.value = sys;
      showToast("프롬프트가 생성되었습니다.");
      updateStates(); // 생성 후 복사 버튼 활성 갱신
    });

    copyBtn.addEventListener("click", () => {
      if (isDisabled(copyBtn) || isBlank(outArea.value)) return; // ← 실질 차단
      navigator.clipboard.writeText(outArea.value).then(() => showToast("복사되었습니다"));
    });

    resetBtn.addEventListener("click", () => {
      subject.value = ""; topic.value = "";
      gSel.selectedIndex = 0; tSel.selectedIndex = 0;
      outArea.value = "";
      showToast("초기화했습니다. 다시 만들어보세요!");
      updateStates();
    });

    // 초기 상태 세팅
    updateStates();
  }

  function activateTab(key) {
    // 1) 패널 전환
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("is-active"));
    document.querySelector(`#panel-${key}`)?.classList.add("is-active");

    // 2) 헤더 탭 is-active (nav-tabs 안의 버튼 순서 기준)
    const idx = TAB_KEYS.indexOf(key);
    const tabs = Array.from(document.querySelectorAll(".nav-tabs .tab"));
    tabs.forEach((btn, i) => btn.classList.toggle("is-active", i === idx));

    // 3) 상태
    (window.S ||= {}).activeTab = key;
  }

  function bindHeaderTabs() {
    // 데스크톱
    document.querySelectorAll(".nav-tab[data-tab]").forEach(btn => {
      btn.addEventListener("click", () => activateTab(btn.dataset.tab));
    });
    // 모바일 오버레이
    document.querySelectorAll("[data-overlay-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        activateTab(btn.dataset.overlayTab);
        // menu.js의 toggleNavOverlay() 호출
        if (typeof toggleNavOverlay === "function") toggleNavOverlay();
      });
    });
  }

  function setPrimaryDisabled(btn, disabled) {
    if (!btn) return;
    btn.classList.toggle("is-disabled", !!disabled);
    btn.setAttribute("aria-disabled", disabled ? "true" : "false");
  }

  function bindPrimaryGuards() {
    /* Maker: objective 필수 */
    const genBtn = document.querySelector('#panel-maker [data-action="generate"]');
    function updateMakerState(){
      const obj = S.fieldsMap.get("objective")?.value.trim();
      setPrimaryDisabled(genBtn, !obj);
    }
    // CO-STAR 입력 변화 감지
    S.fieldsMap.forEach((ta, key) => {
      ta.addEventListener("input", updateMakerState);
    });
    updateMakerState();

    /* Chatbot: subject + topic 필수 */
    const buildBtn = document.querySelector('#panel-chatbot [data-action="build-system"]');
    const subject  = document.querySelector('#panel-chatbot [data-slot="subject"]');
    const topic    = document.querySelector('#panel-chatbot [data-slot="topic"]');

    function updateChatbotState(){
      const ok = !!subject.value.trim() && !!topic.value.trim();
      setPrimaryDisabled(buildBtn, !ok);
    }
    subject?.addEventListener("input", updateChatbotState);
    topic?.addEventListener("input", updateChatbotState);
    updateChatbotState();

    // 클릭 가드(비활성일 때 동작/애니메이션 차단)
    genBtn?.addEventListener("click", (e) => {
      if (genBtn.classList.contains("is-disabled")) { e.preventDefault(); return; }
    });
    buildBtn?.addEventListener("click", (e) => {
      if (buildBtn.classList.contains("is-disabled")) { e.preventDefault(); return; }
    });
  }

  function bindChatbotGuards() {
    const $subject = document.querySelector('#panel-chatbot [data-slot="subject"]');
    const $topic   = document.querySelector('#panel-chatbot [data-slot="topic"]');
    const $build   = document.querySelector('#panel-chatbot [data-action="build-system"]');
    const $copy    = document.querySelector('#panel-chatbot [data-action="copy-system"]');
    const $reset   = document.querySelector('#panel-chatbot [data-action="reset-system"]');
    const $out     = document.querySelector('#panel-chatbot [data-slot="system-preview"]');

    // 1) 빌드 버튼: 과목 + 단원/주제 둘 다 채워져야 활성
    function updateBuildState() {
      const ok = !!$subject.value.trim() && !!$topic.value.trim();
      setDisabled($build, !ok);
    }

    // 2) 복사 버튼: 출력 textarea에 내용이 있어야 활성
    function updateCopyState() {
      const has = !!$out.value.trim();
      setDisabled($copy, !has);
    }

    // 입력 변화 감지
    $subject.addEventListener("input", updateBuildState);
    $topic.addEventListener("input", updateBuildState);
    $out.addEventListener("input", updateCopyState);

    // 초기 상태 반영
    updateBuildState();
    updateCopyState();

    // 안전가드: disabled면 동작 차단 (브라우저가 막아도 방어코드 추가)
    $build.addEventListener("click", (e) => {
      if ($build.disabled) { e.preventDefault(); e.stopPropagation(); return; }
    });
    $copy.addEventListener("click", (e) => {
      if ($copy.disabled) { e.preventDefault(); e.stopPropagation(); return; }
    });

    // 리셋 시에도 상태 갱신
    $reset.addEventListener("click", () => {
      // renderChatbotControls에서 값 초기화 후…
      setTimeout(() => { updateBuildState(); updateCopyState(); }, 0);
    });

    // 전역에서 접근할 수 있도록(빌드 완료 후 복사버튼 활성 갱신용)
    window.__updateChatbotCopyState = updateCopyState;
  }

  function bindMakerCopyGuard() {
    const root    = document.querySelector("#panel-maker");
    const copyBtn = root.querySelector('[data-action="copy"]');
    const prev    = root.querySelector('[data-slot="prompt-preview"]');

    function update() { setDisabled(copyBtn, isBlank(prev.value)); }
    prev.addEventListener("input", update);
    update(); // 초기
  }

  /* ===== Maker preview: fixed layout (>=1024px) ===== */
  function layoutMakerPreviewFixed() {
    const desktop = window.innerWidth >= 1024;
    const placeholder = document.querySelector('#panel-maker .maker-preview');
    const card = document.querySelector('#panel-maker .maker-preview-fixed');
    if (!placeholder || !card) return;

    if (!desktop) {
      // 모바일/태블릿: 일반 흐름으로 복귀
      placeholder.style.minHeight = "";
      Object.assign(card.style, { left: "", width: "", top: "" });
      return;
    }

    // 데스크톱: placeholder의 위치/너비를 기준으로 fixed 좌표 계산
    const rect = placeholder.getBoundingClientRect();
    const left = rect.left + window.scrollX;
    const width = rect.width;

    // 헤더 오프셋 읽기(없으면 240px)
    const container = document.querySelector('.app-container');
    let top = 240;
    if (container) {
      const cs = getComputedStyle(container);
      const val = parseFloat(cs.getPropertyValue('--header-offset')) || 240;
      top = val;
    }

    // placeholder가 원래 차지하던 높이를 유지해 레이아웃 점프 방지
    placeholder.style.minHeight = card.offsetHeight + "px";

    // fixed 좌표/너비 세팅
    Object.assign(card.style, {
      left: left + "px",
      width: width + "px",
      top: top + "px"
    });
  }

  const TAB_KEYS = ["learn", "maker", "chatbot"]; // 0,1,2 (예전 4개 구조면 키 추가)

  /** 공용: 패널 전환 */
  function activateTab(key) {
    // 1) 패널 표시
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("is-active"));
    document.querySelector(`#panel-${key}`)?.classList.add("is-active");

    // 2) 헤더 탭 하이라이트(두 클래스 모두 지원)
    const tabs = Array.from(document.querySelectorAll(
      ".nav-tabs .nav-tab, .nav-tabs .tab, .tabbar .nav-tab, .tabbar .tab"
    ));
    const idxByKey = TAB_KEYS.indexOf(key);
    let activeIdx = -1;

    // data-tab로 바로 매칭
    activeIdx = tabs.findIndex(t => t.dataset.tab === key);

    // 매칭 실패 시 순서 매핑으로 폴백
    if (activeIdx < 0 && idxByKey >= 0) activeIdx = idxByKey;

    tabs.forEach((btn, i) => btn.classList.toggle("is-active", i === activeIdx));

    // 상태 저장
    (window.S ||= {}).activeTab = key;
  }


  /** 포커스를 오버레이 밖 목표 요소로 이동(ARIA 경고 방지) */
  function focusPanelHeading(key) {
    const sel = `#panel-${key} .section-title, #panel-${key} h2, #panel-${key}`;
    const target = document.querySelector(sel) || document.querySelector(".app-container") || document.body;
    if (target && target !== document.body) {
      const need = !target.hasAttribute("tabindex");
      if (need) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      const cleanup = () => { if (need) target.removeAttribute("tabindex"); target.removeEventListener("blur", cleanup); };
      target.addEventListener("blur", cleanup, { once: true });
    } else {
      document.activeElement?.blur?.();
    }
  }

  /* 오버레이 핸들러 (menu.js 무관) */
  function getOverlay()  { return document.getElementById("navOverlay") || document.querySelector(".nav-overlay"); }
  function getHamburger(){ return document.getElementById("hamburgerBtn") || document.querySelector(".hamburger-btn"); }

  function openOverlay() {
    const overlay = getOverlay(); const ham = getHamburger(); if (!overlay) return;
    overlay.classList.add("open","is-open");
    overlay.setAttribute("aria-hidden","false");
    overlay.style.display = "block";                 // 확실한 표시
    document.documentElement.style.overflow = "hidden";
    ham?.classList.add("is-active");                 // 햄버거 → X
    // 첫 포커스
    (overlay.querySelector("[onclick^='handleOverlayTab'], [data-overlay-tab], .nav-tab") || overlay).focus?.();
  }

  function closeOverlay(focusToKey) {
    const overlay = getOverlay(); const ham = getHamburger(); if (!overlay) return;

    // 1) aria-hidden 주기 전에 포커스를 밖으로 이동
    if (focusToKey) focusPanelHeading(focusToKey); else document.activeElement?.blur?.();

    // 2) 닫기 (클래스/ARIA/스크롤/인라인표시 모두 정리)
    overlay.classList.remove("open","is-open");
    overlay.setAttribute("aria-hidden","true");
    overlay.style.display = "none";
    document.documentElement.style.overflow = "";
    ham?.classList.remove("is-active");              // X → 햄버거
  }

  

  /** 모바일 햄버거 */
  (function bindOverlay() {
    const overlay   = getOverlay();
    const hamburger = document.getElementById("hamburgerBtn") || document.querySelector(".hamburger-btn");
    if (!overlay || !hamburger) return;

    hamburger.addEventListener("click", (e) => {
      e.preventDefault();
      if (overlay.classList.contains("open") || overlay.classList.contains("is-open")) {
        closeOverlay();
      } else {
        openOverlay();
      }
    });

    // 배경 클릭으로 닫기
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeOverlay(); });

    // ESC로 닫기
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && (overlay.classList.contains("open") || overlay.classList.contains("is-open"))) {
        closeOverlay();
      }
    });
  })();

  /** 오버레이 내 탭(인라인 onclick 대응) */
  window.handleOverlayTab = function (idx) {
    const key = TAB_KEYS[idx] || TAB_KEYS[0];
    activateTab(key);                // 1) 섹션 전환
    focusPanelHeading(key);          // 2) 포커스를 새 섹션 헤딩으로
    // 3) 다음 프레임에 닫기(포커스가 옮겨진 뒤 aria-hidden=true 적용)
    requestAnimationFrame(() => closeOverlay(`#panel-${key}`));
  };

  // 프리뷰 높이가 바뀔 때(타이핑/폰트/리플로우) placeholder 높이를 갱신
  let __makerPreviewRO = null;
  function bindMakerPreviewObserver() {
    const card = document.querySelector('#panel-maker .maker-preview-fixed');
    if (!card) return;
    if (typeof ResizeObserver === "function") {
      __makerPreviewRO?.disconnect?.();
      __makerPreviewRO = new ResizeObserver(() => layoutMakerPreviewFixed());
      __makerPreviewRO.observe(card);
    }
  }

  // 리스너(리사이즈/오리엔테이션)
  function bindMakerPreviewFixedEvents() {
    const relayout = () => layoutMakerPreviewFixed();
    window.addEventListener("resize", relayout);
    window.addEventListener("orientationchange", relayout);
  }

  // menu.js가 기대하는 전역 함수(참고 파일 호환)
  window.showSection = function(idx){
    const order = ["learn","maker","chatbot"];
    activateTab(order[idx] || "learn");

    const overlay = getOverlay();
    if (overlay && (overlay.classList.contains("is-open") || overlay.classList.contains("open"))) {
      // 다음 페인트에 닫아서 aria-hidden 경고 방지
      requestAnimationFrame(() => closeOverlay());
    }
  };


  /* ---------------- Init ----------------- */
  async function init() {
    try {
      await loadJSON();
      bindTabs();
      bindModal();

      renderGuideFromJSON();
      renderPromptExamples();

      renderFields();
      bindMakerActions();

      renderChatbotControls();
      bindChatbotGuards();

      bindHeaderTabs();
      bindPrimaryGuards();

      bindMakerCopyGuard();

      layoutMakerPreviewFixed();
      bindMakerPreviewObserver();
      bindMakerPreviewFixedEvents();


      // 초기 탭
      qs("#panel-learn")?.classList.add("is-active");
    } catch (err) {
      console.error(err);
      showToast("초기화 오류: 콘솔을 확인하세요.");
    }
  }
  document.addEventListener("DOMContentLoaded", init);
})();
