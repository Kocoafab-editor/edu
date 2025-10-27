/*
Teachable Machine과 Microbit/ESP32 연동을 위한 p5.js 스케치
*/

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
let lastSentTime = 0;
const MIN_TIME_BETWEEN_SENDS = 1000; // Minimum time between sends in milliseconds (0.5 seconds)
let lastLabelToSend = null;
let sendScheduled = false;

// Display dimensions (fixed)
const DISPLAY_WIDTH = 480;
const DISPLAY_HEIGHT = 360;

// HTML에서 호출되는 모델 로드 함수
window.setModelUrl = function(url) {
  if (!url.endsWith('/')) url += '/';
  modelURL = url;
  loadAndStartModel();
};

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

      // 마지막 전송 후보 갱신
      lastLabelToSend = label;

      // 이미 예약되어 있으면 새 타이머를 만들지 않음(후행 1회 전송)
      if (!sendScheduled) {
        sendScheduled = true;
        sendTimerId = setTimeout(sendLastLabel, MIN_TIME_BETWEEN_SENDS);
      }
    }
    
    prevLabel = label;
  }
  
  // 다음 프레임 분류 계속
  classifyVideo();
}

// 마지막으로 저장된 라벨을 전송하는 함수
async function sendLastLabel() {
  try {
    if (!window.connectionManager) return;
    if (lastLabelToSend == null) return;

    // (선택) 직전 전송값과 동일하면 굳이 보내지 않음
    if (lastLabelToSend === prevSentLabel) return;

    await window.connectionManager.send(lastLabelToSend);
    prevSentLabel = lastLabelToSend;
  } catch (e) {
    console.error('[sendLastLabel] failed:', e);
  } finally {
    // 타이머/플래그 초기화 (후행 전송)
    sendScheduled = false;
    sendTimerId = null;
    lastLabelToSend = null;
  }
}

// 마우스 클릭 이벤트 (필요시 사용)
function mouseClicked() {
  // 추가 기능이 필요할 때 사용
}