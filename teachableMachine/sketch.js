/*
Teachable Machine과 Microbit/ESP32 연동을 위한 p5.js 스케치
*/

window.DEBUG_SEND = true; // 필요시 false로 끔
const _now = () => Math.round(performance.now());

window.SendStats = {
  calls: 0,           // sendLastLabel 호출 수(강제 포함)
  forces: 0,          // force 플러시 횟수
  scheduled: 0,       // 후행 예약 횟수
  sent: 0,            // 실제 전송 성공 횟수
  cancelledSame: 0,   // '이미 보낸 값과 동일'로 취소
  cancelledNoConn: 0, // 연결 안됨으로 취소/대기
  errors: 0,          // 전송 실패
  last10: [],         // 최근 10건 {t,label,kind}
  lastSentAt: 0,
  lastSentLabel: null,
};

window.dumpSendStats = function() {
  const s = window.SendStats;
  console.table({
    calls: s.calls, forces: s.forces, scheduled: s.scheduled, sent: s.sent,
    cancelledSame: s.cancelledSame, cancelledNoConn: s.cancelledNoConn, errors: s.errors,
    lastSentLabel: s.lastSentLabel, lastSentAt_ms: s.lastSentAt
  });
  console.log('last10:', s.last10);
};
window.clearSendStats = function() {
  Object.assign(window.SendStats, {calls:0,forces:0,scheduled:0,sent:0,cancelledSame:0,cancelledNoConn:0,errors:0,last10:[],lastSentAt:0,lastSentLabel:null});
  console.log('[SendStats] cleared');
};

function _dbg(...args){ if (window.DEBUG_SEND) console.log(...args); }
function _pushLast(kind, label) {
  const s = window.SendStats;
  s.last10.push({ t: _now(), kind, label });
  if (s.last10.length > 10) s.last10.shift();
}


/* ======= debug용 전역 변수 ======= */

let modelURL = "";
let classifier;
let video;
let flippedVideo;
let label;
let prevLabel;
let videoReady = false;
let canvasCreated = false;

let sendTimerId = null;
let prevSentLabel = null; 

// Rate limiting variables
const MIN_TIME_BETWEEN_SENDS = 2000; // Minimum time between sends in milliseconds (0.5 seconds)

let _lastSentAt     = 0;     // 마지막 "실제 전송 완료" 시각(ms)
let _lastSentLabel  = null;  // 마지막 "실제 전송된" 라벨
let _pendingTimer   = null;  // 예약 타이머
let _pendingLabel   = null;  // 예약 중인 후보(쿨다운 끝에 보낼 값)

// Display dimensions (fixed)
const DISPLAY_WIDTH = 480;
const DISPLAY_HEIGHT = 360;

// HTML에서 호출되는 모델 로드 함수
window.setModelUrl = function(url) {
  if (!url.endsWith('/')) url += '/';
  modelURL = url;
  loadAndStartModel();
};

function _isConnected() {
  try { return !!(window.connectionManager && window.connectionManager.isConnected()); }
  catch { return false; }
}

// 모델 로드 및 시작
async function loadAndStartModel() {
  if (!modelURL) {
    alert("모델 URL이 설정되지 않았습니다.");
    return;
  }
  
  try {
    window.updateModelStatus("모델 로딩중...", "status-waiting");
    classifier = await ml5.imageClassifier(modelURL + 'model.json');
    
    if (video && video.elt && video.elt.readyState >= 2) {
      classifyVideo();
    }
    
    window.updateModelStatus("모델 로드 완료", "status-connected");
  } catch (e) {
    console.error("모델 로드 실패:", e);
    alert("모델 로드에 실패했습니다. URL을 확인하세요.");
    window.updateModelStatus("모델 로드 실패", "status-disconnected");
  }
}

function setup() {
  
  // 캔버스를 특정 컨테이너에 생성 (고정된 크기로 생성)
  let canvas = createCanvas(DISPLAY_WIDTH, DISPLAY_HEIGHT + 20); // +20 for status text
  let canvasContainer = document.getElementById('canvasContainer');
  if (canvasContainer) {
    canvas.parent(canvasContainer);
  }
  canvasCreated = true;
  
  // 비디오 설정 (실제 카메라 해상도로 초기화)
  video = createCapture(VIDEO, videoReady_callback);
  video.hide(); // Hide the raw video element
  
  // 초기 상태 메시지
  window.updateModelStatus("모델 URL을 입력하세요", "status-waiting");
}

function videoReady_callback() {
  // 카메라의 실제 해상도 가져오기 (원본 해상도 유지)
  let videoWidth = (video && video.elt && video.elt.videoWidth) ? video.elt.videoWidth : video.width;
  let videoHeight = (video && video.elt && video.elt.videoHeight) ? video.elt.videoHeight : video.height;
  
  // 원본 해상도 로깅 (디버깅용)
  console.log(`카메라 원본 해상도: ${videoWidth}x${videoHeight}`);
  
  // 비디오 크기를 원본 해상도로 설정 (0 방지)
  if (videoWidth > 0 && videoHeight > 0) {
    video.size(videoWidth, videoHeight);
  }
  
  videoReady = true;
  // 모델이 이미 로드되어 있다면 분류 시작
  if (classifier) {
    classifyVideo();
  }
}

function draw() {
  background(50, 50, 60);
  
  if (video && videoReady) {
    // 항상 원본 비디오를 사용하되, drawVideo에서 좌우 반전 처리
    drawVideo(video);
  }
  
  // 라벨 표시
  fill(255);
  textSize(16);
  textAlign(CENTER);
  if (label) {
    text(label, width / 2, height - 4);
  } else {
    text("인식 대기중...", width / 2, height - 4);
  }
  
  // 상단에 상태 표시
  fill(255, 255, 255, 200);
  textSize(12);
  textAlign(LEFT);
  
  let statusText = "";
  if (!videoReady) {
    statusText = "카메라 초기화중...";
  } else if (!classifier) {
    statusText = "모델 대기중";
  } else {
    statusText = "실시간 인식중";
  }
  
  text(statusText, 10, 20);
}

// 비디오를 그리는 헬퍼 함수 (항상 좌우 반전)
function drawVideo(vid) {
  // 원본 비율 유지하여 DISPLAY 영역에 맞추는 contain 스케일
  const srcW = (vid && vid.elt && vid.elt.videoWidth) ? vid.elt.videoWidth : vid.width;
  const srcH = (vid && vid.elt && vid.elt.videoHeight) ? vid.elt.videoHeight : vid.height;
  const fitScale = Math.min(DISPLAY_WIDTH / srcW, DISPLAY_HEIGHT / srcH);
  const drawW = srcW * fitScale;
  const drawH = srcH * fitScale;
  const dx = (DISPLAY_WIDTH - drawW) / 2; // 좌우 여백(필러박스)
  const dy = (DISPLAY_HEIGHT - drawH) / 2; // 상하 여백(레터박스)

  // 비디오 그리기 (좌우 반전)
  push();
  translate(width, 0);
  scale(-1, 1);
  image(vid, dx, dy, drawW, drawH, 0, 0, srcW, srcH);
  pop();

  // 레터박스/필러박스 영역 채우기 (검정)
  noStroke();
  fill(0);
  const topBarH = Math.max(0, dy);
  const bottomBarH = Math.max(0, DISPLAY_HEIGHT - (dy + drawH));
  const leftBarW = Math.max(0, dx);
  const rightBarW = Math.max(0, DISPLAY_WIDTH - (dx + drawW));

  // 상/하 바
  if (topBarH > 0) rect(0, 0, DISPLAY_WIDTH, topBarH);
  if (bottomBarH > 0) rect(0, dy + drawH, DISPLAY_WIDTH, bottomBarH);
  // 좌/우 바
  if (leftBarW > 0) rect(0, 0, leftBarW, DISPLAY_HEIGHT);
  if (rightBarW > 0) rect(dx + drawW, 0, rightBarW, DISPLAY_HEIGHT);
}

function classifyVideo() {
  if (!video || !classifier || !videoReady) return;
  
  // 원본 비디오 전체 프레임(좌우반전)으로 분류
  flippedVideo = ml5.flipImage(video);
  classifier.classify(flippedVideo, gotResult);
  flippedVideo.remove();
}

async function gotResult(error, results) {
  if (error) {
    console.error("분류 오류:", error);
    return;
  }
  
  if (results && results.length > 0) {
    label = results[0].label;
    
    // 결과가 변경되었을 때만 처리
    if (label && label !== window.currentLabel) {
      window.updateRecognitionResult(label);
      window.currentLabel = label;

      sendLastLabel();
    }
    
    prevLabel = label;
  }
  
  // 다음 프레임 분류 계속
  classifyVideo();
}

function _scheduleTrailing(label, elapsedSinceLast) {
  _pendingLabel = label; // 항상 최신 후보로 덮기

  const wait = Math.max(0, MIN_TIME_BETWEEN_SENDS - elapsedSinceLast);
  if (_pendingTimer) clearTimeout(_pendingTimer);
  _pendingTimer = setTimeout(async () => {
    // 최신 인식값(있으면 그 값)을 최종 후보로 사용
    const finalLabel = (window.currentLabel != null) ? String(window.currentLabel) : _pendingLabel;

    // ★ 싱크 보장 2: 쿨다운이 끝났는데도 '이미 보낸 값'이면 보낼 필요 없음
    if (finalLabel == null || finalLabel === _lastSentLabel) {
      _pendingLabel = null;
      _pendingTimer = null;
      return;
    }

    if (!_isConnected()) {
      // 아직 연결 안 되었으면 다음 기회로 넘김(최신 후보 유지)
      // 연결되면 onStatusChange에서 force 전송을 시도
      _pendingTimer = null;
      return;
    }

    try {
      await window.connectionManager.send(finalLabel);
      _lastSentLabel = finalLabel;
      _lastSentAt    = Date.now();
    } catch (e) {
      console.error('[sendLastLabel trailing] failed:', e);
      // 실패 시 다음 호출에서 다시 시도(별도 재예약 없음)
    } finally {
      _pendingLabel = null;
      _pendingTimer = null;
    }
  }, wait);
}

// 전역 공개(레거시 사용처 호환)
window.sendLastLabel = sendLastLabel;

// 내부: 실제 전송 실행(쿨다운 끝 또는 즉시)
async function sendLastLabel(opts = {}) {
  const force = !!opts.force;
  const now   = Date.now();
  const label = (opts.label != null) ? String(opts.label) :
                (window.currentLabel != null ? String(window.currentLabel) : null);

  window.SendStats.calls++;
  _dbg('[sendLastLabel] call',
    { label, force, currentLabel: window.currentLabel, lastSentLabel: _lastSentLabel, dt: (Date.now() - _lastSentAt) });

  // 보낼 값이 없으면 종료
  if (label == null) return;

  // ★ 싱크 보장 1: 원래 값으로 되돌아온 경우(= 이미 보낸 값) → 예약/전송 모두 취소
  if (!force && label === _lastSentLabel) {
    window.SendStats.cancelledSame++;
    _pushLast('cancel-same', label);
    _dbg(' ↳ cancel (same as last sent):', label);
    if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
    _pendingLabel = null;
    return;
  }

  const elapsed = now - _lastSentAt;
  const due = elapsed >= MIN_TIME_BETWEEN_SENDS;

  // ★ 강제 전송(연결 직후 플러시 등)
  if (force && _isConnected()) {
    try {
      await window.connectionManager.send(label);
      _lastSentLabel = label;
      _lastSentAt    = Date.now();


      Object.assign(window.SendStats, { lastSentLabel: _lastSentLabel, lastSentAt: _lastSentAt });
      window.SendStats.sent++;
      _pushLast(force ? 'force-send' : 'send', label);
      _dbg(' ✅ sent immediately:', { label, force, at: _lastSentAt });

      // 예약 클리어
      if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
      _pendingLabel = null;
    } catch (e) {
      console.error('[sendLastLabel(force)] failed:', e);
      // 연결이 순간 끊겼다면 대기 예약(후행 1회)으로 넘김
      _scheduleTrailing(label, elapsed);
    }
    return;
  }

  // 즉시 보낼 수 있으면 지금 전송
  if (_isConnected() && due) {
    try {
      await window.connectionManager.send(label);
      _lastSentLabel = label;
      _lastSentAt    = Date.now();

      // 예약 클리어
      if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
      _pendingLabel = null;
    } catch (e) {
      console.error('[sendLastLabel] failed:', e);
      // 실패 시 후행 예약
      _scheduleTrailing(label, elapsed);
    }
    return;
  }

  // 아직 간격 미달이거나(쿨다운) 연결 안 됨 → 후행 1회 예약 (마지막 값만 보냄)
  _scheduleTrailing(label, elapsed);
}

// 마우스 클릭 이벤트 (필요시 사용)
function mouseClicked() {
  // 추가 기능이 필요할 때 사용
}