/*
Teachable Machine과 Microbit/ESP32 연동을 위한 p5.js 스케치
*/

let modelURL = "";
let classifier;
let video;
let flippedVideo;
let label;
let prevLabel;
let serialOptions = { baudRate: 115200 };
let serial;
let videoReady = false;
let canvasCreated = false;

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
  // 시리얼 포트 초기화
  serial = new Serial();
  serial.on(SerialEvents.CONNECTION_OPENED, onSerialConnectionOpened);
  serial.on(SerialEvents.CONNECTION_CLOSED, onSerialConnectionClosed);
  serial.on(SerialEvents.DATA_RECEIVED, onSerialDataReceived);
  serial.on(SerialEvents.ERROR_OCCURRED, onSerialErrorOccurred);
  
  // 최초 자동 연결 시도
  serial.autoConnectAndOpenPreviouslyApprovedPort(serialOptions);
  
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
  window.updateSerialStatus("연결 안됨", "status-disconnected");
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
    if (label !== prevLabel) {
      
      // HTML 상태 업데이트
      window.updateRecognitionResult(label);
      
      // 마지막으로 보낼 값 업데이트
      lastLabelToSend = label;
      
      // 아직 전송이 예약되지 않았으면 예약
      if (!sendScheduled) {
        sendScheduled = true;
        setTimeout(sendLastLabel, MIN_TIME_BETWEEN_SENDS);
      }
    }
    
    prevLabel = label;
  }
  
  // 다음 프레임 분류 계속
  classifyVideo();
}

// 마지막으로 저장된 라벨을 전송하는 함수
async function sendLastLabel() {
  if (lastLabelToSend === null) {
    sendScheduled = false;
    return;
  }

  const currentTime = millis();
  if (currentTime - lastSentTime < MIN_TIME_BETWEEN_SENDS) {
    setTimeout(sendLastLabel, MIN_TIME_BETWEEN_SENDS - (currentTime - lastSentTime));
    return;
  }

  // 블루투스 우선 전송 (블루투스 모드 + 연결됨)
  try {
    if (window.isBluetoothMode && window.bleManager && typeof window.bleManager.isConnected === 'function' && window.bleManager.isConnected()) {
      await window.bleManager.sendMessage(lastLabelToSend);
      lastSentTime = currentTime;
      if (lastLabelToSend === prevLabel) {
        sendScheduled = false;
      } else {
        setTimeout(sendLastLabel, MIN_TIME_BETWEEN_SENDS);
      }
      return;
    }
  } catch (e) {
    console.warn('BLE send failed:', e);
  }

  // 시리얼 전송 (연결되어 있을 때) - 오직 시리얼 모드에서만
  if (!window.isBluetoothMode && serial && typeof serial.isOpen === 'function' && serial.isOpen()) {
    serial.write(lastLabelToSend);
    if (window.currentDeviceMode === 'esp32') {
      serial.write('\r\n');
    } else {
      serial.write('\n');
    }
    lastSentTime = currentTime;
    if (lastLabelToSend === prevLabel) {
      sendScheduled = false;
    } else {
      setTimeout(sendLastLabel, MIN_TIME_BETWEEN_SENDS);
    }
    return;
  }

  // 전송 경로가 없으면 예약 종료
  sendScheduled = false;
}

// 전역에서 시리얼 포트를 닫기 위한 함수 제공 (BLE 모드 진입 시 사용)
async function closeSerialPort() {
  try {
    if (serial && typeof serial.isOpen === 'function' && serial.isOpen()) {
      await serial.close();
      window.updateSerialStatus("연결 안됨", "status-disconnected");
    }
  } catch (e) {
    console.warn('closeSerialPort error:', e);
  }
}
window.closeSerialPort = closeSerialPort;

// 시리얼 이벤트 핸들러들
function onSerialErrorOccurred(eventSender, error) {
  console.log("시리얼 오류:", error);
  window.updateSerialStatus("연결 오류", "status-disconnected");
}

function onSerialConnectionOpened(eventSender) {
  console.log("시리얼 포트 연결됨");
  window.updateSerialStatus("연결됨", "status-connected");
  try {
    const btn = document.getElementById('serialButton');
    if (btn && !window.isBluetoothMode) btn.textContent = '연결 해제';
  } catch (e) {}
}

function onSerialConnectionClosed(eventSender) {
  console.log("시리얼 포트 연결 종료");
  window.updateSerialStatus("연결 안됨", "status-disconnected");
  try {
    const btn = document.getElementById('serialButton');
    if (btn && !window.isBluetoothMode) btn.textContent = '연결';
  } catch (e) {}
}

function onSerialDataReceived(eventSender, newData) {
  console.log("수신된 데이터:", newData);
  // 필요에 따라 수신된 데이터 처리
}

// 새로운 시리얼 연결 함수
async function newConnect() {
  try {
    // 기존 포트가 열려 있으면 닫기
    if (serial && serial.isOpen()) {
      try {
        await serial.close();
        window.updateSerialStatus("기존 연결 종료", "status-waiting");
        await new Promise(resolve => setTimeout(resolve, 500)); // 짧은 대기
      } catch (e) {
        console.warn("기존 포트 닫기 에러:", e);
      }
    }
    
    // Web Serial API 지원 확인
    if (!navigator.serial) {
      alert('이 브라우저에서는 Web Serial API를 지원하지 않습니다.');
      return;
    }
    
    window.updateSerialStatus("연결 시도중...", "status-waiting");
    
    // 새 포트 선택 및 연결
    if (!serial.isOpen()) {
      await serial.connectAndOpen(null, { baudRate: 115200 });
    } else {
      console.log("시리얼 포트가 이미 열려있습니다.");
    }
    
  } catch (error) {
    console.error("시리얼 연결 실패:", error);
    window.updateSerialStatus("연결 실패", "status-disconnected");
    alert("시리얼 포트 연결에 실패했습니다. 디바이스가 연결되어 있는지 확인하세요.");
  }
}

// 전역 함수로 노출
window.newConnect = newConnect;

// 마우스 클릭 이벤트 (필요시 사용)
function mouseClicked() {
  // 추가 기능이 필요할 때 사용
}