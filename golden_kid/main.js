

// --- 기존 앱 스크립트 ---

// 페이지 로드 시 초기화 (암호 해제 후 실행되도록 이동)
// document.addEventListener('DOMContentLoaded', function() {
//     loadMemosFromStorage();
// });

// 섹션 전환
function showSection(index) {
    document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    document.getElementById(`section${index}`).classList.add('active');
    document.querySelectorAll('.nav-tab')[index].classList.add('active');
}

// 템플릿 생성기
function generateTemplate() {
    const subject = document.getElementById('genSubject').value;
    const grade = document.getElementById('genGrade').value;
    const scope = document.getElementById('genScope').value;
    const tone = document.getElementById('genTone').value;

    if (!subject || !grade || !scope || !tone) {
        document.getElementById('generatedTemplate').textContent = '모든 필드를 입력해주세요.';
        return;
    }

    let outputText = '';
    if (tone.includes('반말')) {
        outputText = '[Output] 답변은 전체 120자 이내, 최대 2문단으로 구성. 마지막에 "어떻게 생각해?" 또는 "더 궁금한 게 있어?" 질문으로 마무리.';
    } else if (tone.includes('존댓말')) {
        outputText = '[Output] 답변은 전체 120자 이내, 최대 2문단으로 구성. 마지막에 "어떻게 생각하세요?" 또는 "더 궁금한 점 있으신가요?" 질문으로 마무리.';
    } else {
        outputText = '[Output] 답변은 전체 120자 이내, 최대 2문단으로 구성. 마지막에 "어떻게 생각해?" 또는 "더 궁금한 게 있어?" 질문으로 마무리.';
    }

    const template = `[Role] ${grade}이 이해할 수 있는 ${subject} 전문가입니다.

[Context] ${subject} 교육과정 기준, ${scope} 관련 내용, 최신 교육 자료 및 실생활 연계 사례.

[Rules]
1) 질문은 ${scope} 범위에서만 답변합니다.
2) 범위를 벗어난 질문엔 "${scope} 학습에 집중해볼까요? 다른 궁금한 점이 있나요?"라고 답하고 관련 주제를 재제안합니다.
3) 어려운 용어는 쉬운 말로 바꾸고, 구체적인 예시를 포함합니다. ${grade} 수준에 맞는 설명을 제공합니다.

${outputText}

[Style] ${tone}, 80자마다 줄바꿈, 학습자 친화적 톤.

(예시) Q: ${scope}에 대해 알려줘 / A: ${scope}는 ${subject}에서 중요한 개념이에요. (120자 이내로 답변)`;

    document.getElementById('generatedTemplate').textContent = template;
}

function copyTemplate() {
    const template = document.getElementById('generatedTemplate').textContent;
    if (template === '여기에 생성된 템플릿이 표시됩니다.' || template === '모든 필드를 입력해주세요.') {
        alert('먼저 템플릿을 생성해주세요.');
        return;
    }
    navigator.clipboard.writeText(template).then(() => {
        alert('템플릿이 클립보드에 복사되었습니다!');
    });
}

function downloadTemplate() {
    const template = document.getElementById('generatedTemplate').textContent;
    if (template === '여기에 생성된 템플릿이 표시됩니다.' || template === '모든 필드를 입력해주세요.') {
        alert('먼저 템플릿을 생성해주세요.');
        return;
    }
    
    const subject = document.getElementById('genSubject').value || '챗봇';
    const blob = new Blob([template], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${subject}_챗봇_템플릿.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

function clearGenerator() {
    document.getElementById('genSubject').value = '';
    document.getElementById('genGrade').value = '';
    document.getElementById('genScope').value = '';
    document.getElementById('genTone').value = '';
    document.getElementById('generatedTemplate').textContent = '여기에 생성된 템플릿이 표시됩니다.';
}

// FAQ 토글
function toggleFaq(element) {
    const answer = element.nextElementSibling;
    const icon = element.querySelector('.faq-icon');
    
    answer.classList.toggle('open');
    icon.classList.toggle('open');
}

// 메모 게시판 기능
let memos = [];

function toggleMemoForm() {
    const form = document.getElementById('memoForm');
    form.classList.toggle('active');
}

function addMemo() {
    const title = document.getElementById('memoTitle').value;
    const content = document.getElementById('memoContent').value;

    if (!title || !content) {
        alert('제목과 내용을 모두 입력해주세요.');
        return;
    }

    const memo = {
        id: Date.now(),
        title: title,
        content: content,
        date: new Date().toLocaleDateString('ko-KR')
    };

    memos.unshift(memo);
    saveMemoToStorage();
    renderMemos();
    cancelMemo();
}

function cancelMemo() {
    document.getElementById('memoTitle').value = '';
    document.getElementById('memoContent').value = '';
    document.getElementById('memoForm').classList.remove('active');
}

function renderMemos() {
    const memoList = document.getElementById('memoList');
    const defaultMemosHtml = `
        <div class="memo-item">
            <div class="memo-item-title">[환경] 기후변화 챗봇 아이디어</div>
            <div class="memo-item-content">학생들이 실제 탄소발자국을 계산해볼 수 있는 챗봇. 일상 행동을 입력하면 CO2 배출량을 알려주고 개선 방안 제시</div>
        </div>
        <div class="memo-item">
            <div class="memo-item-title">[수학] 개념 시각화 방법</div>
            <div class="memo-item-content">복잡한 도형의 성질을 말로 설명할 때 단계별 안내와 실생활 예시를 활용하여 이해도 향상</div>
        </div>
        <div class="memo-item">
            <div class="memo-item-title">[과학] 실험 안전 가이드</div>
            <div class="memo-item-content">과학 실험 전 안전 수칙을 퀴즈 형태로 확인하고, 실험 순서를 단계별로 안내하는 챗봇</div>
        </div>
        <div class="memo-item">
            <div class="memo-item-title">[국어] 독서 토론 친구</div>
            <div class="memo-item-content">책을 읽고 나서 등장인물 분석, 주제 파악, 비판적 사고를 유도하는 질문들을 제공</div>
        </div>`;
    
    let userMemosHtml = '';
    memos.forEach(memo => {
        userMemosHtml += `
            <div class="memo-item" onclick="deleteMemo(${memo.id})">
                <div class="memo-item-title">[메모] ${memo.title} <small>(${memo.date})</small></div>
                <div class="memo-item-content">${memo.content}</div>
            </div>
        `;
    });

    memoList.innerHTML = userMemosHtml + defaultMemosHtml;
}

function deleteMemo(id) {
    if (confirm('이 메모를 삭제하시겠습니까? (이 작업은 되돌릴 수 없습니다)')) {
        memos = memos.filter(memo => memo.id !== id);
        saveMemoToStorage();
        renderMemos();
    }
}

function saveMemoToStorage() {
    localStorage.setItem('chatbotMemos', JSON.stringify(memos));
}

function loadMemosFromStorage() {
    const saved = localStorage.getItem('chatbotMemos');
    if (saved) {
        memos = JSON.parse(saved);
    }
    renderMemos();
}