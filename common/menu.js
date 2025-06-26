// 햄버거(메뉴) 버튼과 오버레이 토글
function toggleNavOverlay() {
    const overlay = document.getElementById('navOverlay');
    const btn = document.getElementById('hamburgerBtn');
    const isOpen = overlay.classList.contains('open');
    if (isOpen) {
        overlay.classList.remove('open');
        btn.classList.remove('open');
        document.body.style.overflow = '';
    } else {
        overlay.classList.add('open');
        btn.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}
function handleOverlayTab(idx) {
    showSection(idx);
    toggleNavOverlay();
}
document.addEventListener('DOMContentLoaded', function () {
    var hamburgerBtn = document.getElementById('hamburgerBtn');
    if (hamburgerBtn) {
        hamburgerBtn.addEventListener('click', toggleNavOverlay);
    }
    // ESC 키로 오버레이 닫기
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('navOverlay');
            const btn = document.getElementById('hamburgerBtn');
            if (overlay.classList.contains('open')) {
                overlay.classList.remove('open');
                btn.classList.remove('open');
                document.body.style.overflow = '';
            }
        }
    });
});