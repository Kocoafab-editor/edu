/*
Teachable Machine과 Microbit/ESP32 연동을 위한 p5.js 스케치
*/
let modelURL = "";
let classifier;
let poseModel;
let video;
let flippedVideo;
let label;
let prevLabel;
let currentPose = null;
let poseSourceCanvas = null;
let poseSourceContext = null;
let videoReady = false;
let canvasCreated = false;
let inferenceToken = 0;
let imageLoopPending = false;
let poseLoopPending = false;

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
  const normalizedUrl = normalizeModelUrl(url);
  if (!normalizedUrl) {
    try { window.showNotification?.("URL이 유효하지 않습니다. 티처블머신 모델 주소를 확인하세요.", "error"); } catch (e) {}
    return false;
  }
  modelURL = normalizedUrl;
  try {
    const input = document.getElementById('modelUrlInput');
    if (input) input.value = normalizedUrl;
  } catch (e) {}
  loadAndStartModel();
  return true;
};

window.SendStats = window.SendStats || { calls: 0, lastSentAt: 0 };

function normalizeModelUrl(url) {
  const raw = (url || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw, window.location.href);
    let pathname = parsed.pathname || "";

    if (/\/(?:model|metadata)\.json$/i.test(pathname)) {
      pathname = pathname.replace(/\/(?:model|metadata)\.json$/i, "/");
    } else if (!pathname.endsWith("/")) {
      pathname += "/";
    }

    parsed.pathname = pathname;
    parsed.search = "";
    parsed.hash = "";
    return parsed.href;
  } catch (e) {
    return "";
  }
}

function showModelLoadError(error, mode = getRecognitionMode()) {
  const messageText = String(error?.message || error || "");
  const isRuntimeError = /tmimage|tmpose|tensorflow|tf is not defined|library is not available/i.test(messageText);
  const isFetchError = /failed to fetch|load failed|404|networkerror|network error/i.test(messageText);

  let notice = "";
  if (isRuntimeError) {
    notice = `${mode === 'pose' ? '포즈' : '이미지'} 런타임을 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.`;
  } else if (isFetchError) {
    notice = "모델을 불러오지 못했습니다. 티처블머신 공유 URL과 공개 상태를 확인하세요.";
  } else {
    notice = "모델을 불러오지 못했습니다. 티처블머신 공유 URL을 확인하세요.";
  }

  try { window.showNotification?.(notice, "error"); } catch (e) {}
}

function getRecognitionMode() {
  return window.currentRecognitionMode === 'pose' ? 'pose' : 'image';
}

function getModeMessages(mode = getRecognitionMode()) {
  if (mode === 'pose') {
    return {
      waiting: "포즈 모델 URL을 입력하세요",
      loading: "포즈 모델 로딩중...",
      loaded: "포즈 모델 로드 완료",
      failed: "포즈 모델 로드 실패",
      live: "실시간 포즈 인식중",
      idle: "포즈 모델 대기중"
    };
  }

  return {
    waiting: "이미지 모델 URL을 입력하세요",
    loading: "이미지 모델 로딩중...",
    loaded: "이미지 모델 로드 완료",
    failed: "이미지 모델 로드 실패",
    live: "실시간 이미지 인식중",
    idle: "이미지 모델 대기중"
  };
}

function clearPredictionState() {
  label = "";
  prevLabel = "";
  currentPose = null;
  window.currentLabel = "";
  prevSentLabel = null;
  if (typeof _pendingTimer !== 'undefined' && _pendingTimer) {
    clearTimeout(_pendingTimer);
    _pendingTimer = null;
  }
  if (typeof _pendingLabel !== 'undefined') {
    _pendingLabel = null;
  }

  try { window.updateRecognitionResult("-"); } catch (e) {}
  try { window.PREDICT_UI.rebuild([]); } catch (e) {}
}

function stopCurrentInference(resetModels = true) {
  inferenceToken += 1;
  imageLoopPending = false;
  poseLoopPending = false;
  currentPose = null;

  if (flippedVideo && typeof flippedVideo.remove === 'function') {
    try { flippedVideo.remove(); } catch (e) {}
  }
  flippedVideo = null;

  if (resetModels) {
    classifier = null;
    poseModel = null;
  }
}

function startInferenceLoop(token = inferenceToken) {
  if (token !== inferenceToken || !videoReady) return;
  if (getRecognitionMode() === 'pose') classifyPose(token);
  else classifyVideo(token);
}

function normalizePredictionResults(results) {
  if (!results || !results.length) return [];

  return results.map((item) => {
    const normalizedLabel = item.label ?? item.className ?? "";
    const normalizedProbability = item.confidence ?? item.probability ?? 0;
    return {
      label: normalizedLabel,
      probability: normalizedProbability,
      raw: {
        ...item,
        label: normalizedLabel,
        className: normalizedLabel,
        confidence: normalizedProbability,
        probability: normalizedProbability
      }
    };
  }).sort((a, b) => b.probability - a.probability);
}

function applyPredictionResults(normalizedResults) {
  if (!normalizedResults || !normalizedResults.length) return;

  try { window.PREDICT_UI.updateFromMl5(normalizedResults.map((item) => item.raw)); } catch (e) {}

  const top = normalizedResults[0];
  const second = normalizedResults[1] || { probability: 0 };
  const topLbl = top.label;
  const topP = top.probability ?? 0;
  const secP = second.probability ?? 0;

  const thr = window.PREDICT_THRESHOLD ?? 0.94;
  const margin = window.PREDICT_MARGIN ?? 0.05;

  if (topP >= thr && (topP - secP) >= margin) {
    if (topLbl && topLbl !== window.currentLabel) {
      try { window.PREDICT_UI.highlightSelected(topLbl); } catch (e) {}
      window.updateRecognitionResult(topLbl);
      window.currentLabel = topLbl;
      sendLastLabel();
    }
  }

  prevLabel = window.currentLabel;
}

function getVideoLayout(vid) {
  const srcW = (vid && vid.elt && vid.elt.videoWidth) ? vid.elt.videoWidth : vid.width;
  const srcH = (vid && vid.elt && vid.elt.videoHeight) ? vid.elt.videoHeight : vid.height;

  if (!srcW || !srcH) {
    return {
      srcW: DISPLAY_WIDTH,
      srcH: DISPLAY_HEIGHT,
      fitScale: 1,
      drawW: DISPLAY_WIDTH,
      drawH: DISPLAY_HEIGHT,
      dx: 0,
      dy: 0
    };
  }

  const fitScale = Math.min(DISPLAY_WIDTH / srcW, DISPLAY_HEIGHT / srcH);
  const drawW = srcW * fitScale;
  const drawH = srcH * fitScale;
  const dx = (DISPLAY_WIDTH - drawW) / 2;
  const dy = (DISPLAY_HEIGHT - drawH) / 2;

  return { srcW, srcH, fitScale, drawW, drawH, dx, dy };
}

function getMirroredPoseSource() {
  if (!video || !video.elt) return null;

  const srcW = video.elt.videoWidth || video.width;
  const srcH = video.elt.videoHeight || video.height;
  if (!srcW || !srcH) return null;

  if (!poseSourceCanvas) {
    poseSourceCanvas = document.createElement('canvas');
    poseSourceContext = poseSourceCanvas.getContext('2d');
  }

  if (poseSourceCanvas.width !== srcW || poseSourceCanvas.height !== srcH) {
    poseSourceCanvas.width = srcW;
    poseSourceCanvas.height = srcH;
  }

  poseSourceContext.save();
  poseSourceContext.clearRect(0, 0, srcW, srcH);
  poseSourceContext.translate(srcW, 0);
  poseSourceContext.scale(-1, 1);
  poseSourceContext.drawImage(video.elt, 0, 0, srcW, srcH);
  poseSourceContext.restore();

  return poseSourceCanvas;
}

function drawPoseOverlay(pose, vid) {
  if (!pose || !pose.keypoints || !pose.keypoints.length) return;

  const minConfidence = 0.35;
  const { srcW, srcH, drawW, drawH, dx, dy } = getVideoLayout(vid);
  const scaleX = drawW / srcW;
  const scaleY = drawH / srcH;
  const keypointMap = new Map();

  pose.keypoints.forEach((keypoint) => {
    if ((keypoint.score ?? 0) >= minConfidence && keypoint.part) {
      keypointMap.set(keypoint.part, keypoint);
    }
  });

  const adjacentPairs = [
    ['leftShoulder', 'rightShoulder'],
    ['leftShoulder', 'leftElbow'],
    ['leftElbow', 'leftWrist'],
    ['rightShoulder', 'rightElbow'],
    ['rightElbow', 'rightWrist'],
    ['leftShoulder', 'leftHip'],
    ['rightShoulder', 'rightHip'],
    ['leftHip', 'rightHip'],
    ['leftHip', 'leftKnee'],
    ['leftKnee', 'leftAnkle'],
    ['rightHip', 'rightKnee'],
    ['rightKnee', 'rightAnkle']
  ];

  push();
  stroke(56, 189, 248);
  strokeWeight(3);
  adjacentPairs.forEach(([from, to]) => {
    const start = keypointMap.get(from);
    const end = keypointMap.get(to);
    if (!start || !end) return;
    line(
      dx + start.position.x * scaleX,
      dy + start.position.y * scaleY,
      dx + end.position.x * scaleX,
      dy + end.position.y * scaleY
    );
  });

  noStroke();
  fill(248, 250, 252);
  pose.keypoints.forEach((keypoint) => {
    if ((keypoint.score ?? 0) < minConfidence) return;
    circle(
      dx + keypoint.position.x * scaleX,
      dy + keypoint.position.y * scaleY,
      10
    );
  });
  pop();
}

window.handleRecognitionModeChange = function() {
  stopCurrentInference(true);
  clearPredictionState();

  if (modelURL) loadAndStartModel();
  else window.updateModelStatus(getModeMessages().waiting, "status-waiting");
};

function _isConnected() {
  try { return !!(window.connectionManager && window.connectionManager.isConnected()); }
  catch { return false; }
}

// 모델 로드 및 시작
async function loadAndStartModel() {
  if (!modelURL) {
    try { window.showNotification?.("URL이 유효하지 않습니다. 티처블머신 모델 주소를 확인하세요.", "error"); } catch (e) {}
    return;
  }

  const mode = getRecognitionMode();
  const modeMessages = getModeMessages(mode);
  stopCurrentInference(true);
  clearPredictionState();
  const token = inferenceToken;

  try {
    window.updateModelStatus(modeMessages.loading, "status-waiting");

    if (mode === 'pose') {
      if (!window.tmPose || typeof window.tmPose.load !== 'function') {
        throw new Error("tmPose library is not available");
      }
      poseModel = await window.tmPose.load(modelURL + 'model.json', modelURL + 'metadata.json');
    } else {
      if (!window.tmImage || typeof window.tmImage.load !== 'function') {
        throw new Error("tmImage library is not available");
      }
      classifier = await window.tmImage.load(modelURL + 'model.json', modelURL + 'metadata.json');
    }

    if (token !== inferenceToken) return;

    if (video && video.elt && video.elt.readyState >= 2) {
      startInferenceLoop(token);
    }

    window.updateModelStatus(modeMessages.loaded, "status-connected");
  } catch (e) {
    console.error("모델 로드 실패:", e);
    showModelLoadError(e, mode);
    if (token === inferenceToken) {
      window.updateModelStatus(modeMessages.failed, "status-disconnected");
    }
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
  window.updateModelStatus(getModeMessages().waiting, "status-waiting");
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
  if (classifier || poseModel) {
    startInferenceLoop();
  }
}

function draw() {
  background(50, 50, 60);
  
  if (video && videoReady) {
    // 항상 원본 비디오를 사용하되, drawVideo에서 좌우 반전 처리
    drawVideo(video);
    if (getRecognitionMode() === 'pose' && currentPose) {
      drawPoseOverlay(currentPose, video);
    }
  }
  
  // 라벨 표시
  fill(255);
  textSize(16);
  textAlign(CENTER);
  const drawLabel = (window.currentLabel ?? label ?? "").trim();
  if (drawLabel) {
    text(drawLabel, width / 2, height - 4);
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
  } else if (!classifier && !poseModel) {
    statusText = getModeMessages().idle;
  } else {
    statusText = getModeMessages().live;
  }
  
  text(statusText, 10, 20);
}

// 비디오를 그리는 헬퍼 함수 (항상 좌우 반전)
function drawVideo(vid) {
  // 원본 비율 유지하여 DISPLAY 영역에 맞추는 contain 스케일
  const { srcW, srcH, drawW, drawH, dx, dy } = getVideoLayout(vid);

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

async function classifyVideo(token = inferenceToken) {
  if (token !== inferenceToken || imageLoopPending || !video || !classifier || !videoReady) return;

  imageLoopPending = true;

  try {
    const source = getMirroredPoseSource();
    if (!source) return;

    const results = await classifier.predict(source);
    if (token !== inferenceToken) return;
    await gotResult(null, results, token);
  } catch (error) {
    if (token === inferenceToken) {
      console.error("이미지 추론 오류:", error);
    }
  } finally {
    imageLoopPending = false;
    if (token === inferenceToken && classifier && videoReady) {
      window.requestAnimationFrame(() => classifyVideo(token));
    }
  }
}

async function gotResult(error, results, token = inferenceToken) {
  if (token !== inferenceToken) return;
  if (error) {
    console.error("분류 오류:", error);
    return;
  }

  if (results && results.length > 0) {
    applyPredictionResults(normalizePredictionResults(results));
  }
}

async function classifyPose(token = inferenceToken) {
  if (token !== inferenceToken || poseLoopPending || !video || !poseModel || !videoReady) return;

  poseLoopPending = true;

  try {
    const source = getMirroredPoseSource();
    if (!source) return;

    const { pose, posenetOutput } = await poseModel.estimatePose(source);
    if (token !== inferenceToken) return;

    currentPose = pose || null;
    const predictions = await poseModel.predict(posenetOutput);
    if (token !== inferenceToken) return;

    applyPredictionResults(normalizePredictionResults(predictions));
  } catch (error) {
    if (token === inferenceToken) {
      console.error("포즈 추론 오류:", error);
    }
  } finally {
    poseLoopPending = false;
    if (token === inferenceToken && poseModel && videoReady) {
      window.requestAnimationFrame(() => classifyPose(token));
    }
  }
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
  // 보낼 값이 없으면 종료
  if (label == null) return;

  // ★ 싱크 보장 1: 원래 값으로 되돌아온 경우(= 이미 보낸 값) → 예약/전송 모두 취소
  if (!force && label === _lastSentLabel) {
    window.SendStats.cancelledSame++;
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

/* --- Prediction bar UI (DOM) --- */
window.PREDICT_UI = (function(){
  let root = null;
  let labels = [];        // 현재 DOM에 그려진 레이블(정렬 고정)
  let selected = null;    // 최종 선택된(민감도 통과) 라벨

  function getRoot(){
    if (!root) root = document.getElementById('tmBars');
    return root;
  }

  // 안정된 UI를 위해 항상 알파벳 정렬 고정
  function uniqSorted(arr){
    const s = Array.from(new Set(arr));
    return s.sort((a,b)=> a.localeCompare(b));
  }

  function hashStrH(label){ // 0~359
    let h=0; for(let i=0;i<label.length;i++){ h = (h*31 + label.charCodeAt(i)) >>> 0; }
    return h % 360;
  }
  function hslToHex(h,s,l){
    s/=100; l/=100;
    const k=n=> (n+ h/30)%12;
    const a=s*Math.min(l,1-l);
    const f=n=> l - a*Math.max(-1, Math.min(k(n)-3, Math.min(9-k(n),1)));
    const toHex=x=> Math.round(x*255).toString(16).padStart(2,'0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }
  function gradientForLabel(label){
    const h = hashStrH(label);
    const start = hslToHex(h, 72, 56);      // 주 색
    const end   = hslToHex((h+20)%360, 72, 48); // 살짝 다른 톤
    return {start, end};
  }
  function applyRowColor(row, label){
    const {start, end} = gradientForLabel(label);
    row.style.setProperty('--bar-start', start);
    row.style.setProperty('--bar-end', end);
  }

  function eqArr(a,b){
    if (a.length !== b.length) return false;
    for (let i=0;i<a.length;i++) if (a[i]!==b[i]) return false;
    return true;
  }

  function labelOf(r){ return (r.label ?? r.className ?? '') + ''; }
  function deriveLabels(results){
    return uniqSorted(results.map(labelOf));
  }

  function rebuild(newLabels){
    const mount = getRoot();
    if (!mount) return;
    labels = newLabels.slice();
    mount.innerHTML = labels.map(l => `
      <div class="tm-bar" data-label="${l}">
        <span class="tm-bar__label">${l}</span>
        <div class="tm-bar__track"><div class="tm-bar__fill"></div></div>
        <span class="tm-bar__pct">0%</span>
      </div>
    `).join('');
    // 기존 선택 상태 리셋
    mount.querySelectorAll('.tm-bar').forEach(row=>{
      applyRowColor(row, row.getAttribute('data-label'));
    });
    selected = null;
  }

  function reconcileFromResults(results){
    const newLabels = deriveLabels(results);
    if (!eqArr(labels, newLabels)) {
      rebuild(newLabels);                 // ← 모델 교체/레이블 수 변경 자동 대응 (문제 ①)
    }
  }

  function updateFromMl5(results){
    if (!results || !results.length) return;
    reconcileFromResults(results);

    // 상위 확률(1등) 찾기
    const topP = Math.round(((results[0].confidence ?? results[0].probability) || 0) * 100);

    // 이름→확률 맵
    const map = Object.create(null);
    results.forEach(r => { map[labelOf(r)] = ((r.confidence ?? r.probability) || 0); });

    const mount = getRoot(); if (!mount) return;
    mount.querySelectorAll('.tm-bar').forEach(row => {
      const name = row.getAttribute('data-label') || row.querySelector('.tm-bar__label')?.textContent || '';
      const p = Math.round((map[name] || 0) * 100);
      const fill = row.querySelector('.tm-bar__fill');
      const pct  = row.querySelector('.tm-bar__pct');
      if (fill) fill.style.width = p + '%';
      if (pct)  pct.textContent = p + '%';
      row.classList.toggle('is-top', p === topP);
      // 선택 하이라이트 유지 여부
      row.classList.toggle('is-selected', selected === name);
    });
  }

  function highlightSelected(name){
    selected = name || null;
    const mount = getRoot(); if (!mount) return;
    mount.querySelectorAll('.tm-bar').forEach(row => {
      const isSel = (row.getAttribute('data-label') === selected);
      row.classList.toggle('is-selected', isSel);
    });
  }

  return { updateFromMl5, highlightSelected, rebuild };
})();

