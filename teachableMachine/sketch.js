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
  let videoWidth = video.width;
  let videoHeight = video.height;
  
  // 원본 해상도 로깅 (디버깅용)
  console.log(`카메라 원본 해상도: ${videoWidth}x${videoHeight}`);
  
  // 비디오 크기를 원본 해상도로 설정 (크롭을 위해)
  video.size(videoWidth, videoHeight);
  
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
  let srcAspect = vid.width / vid.height;
  let dstAspect = DISPLAY_WIDTH / DISPLAY_HEIGHT;
  
  // 소스 비디오의 크기 계산 (크롭을 위해)
  let sx, sy, sw, sh;
  
  if (srcAspect > dstAspect) {
    // 비디오가 더 넓은 경우: 좌우를 자름
    sw = vid.height * dstAspect;
    sh = vid.height;
    sx = (vid.width - sw) / 2;
    sy = 0;
  } else {
    // 비디오가 더 높은 경우: 상하를 자름
    sw = vid.width;
    sh = vid.width / dstAspect;
    sx = 0;
    sy = (vid.height - sh) / 2;
  }
  
  // 캔버스에 그리기 (항상 좌우 반전)
  push();
  // 좌우 반전 (거울 모드)
  translate(width, 0);
  scale(-1, 1);
  
  // 크롭된 영역을 캔버스에 맞게 확대/축소하여 그림
  image(vid, 
    (width - DISPLAY_WIDTH) / 2, 
    0, 
    DISPLAY_WIDTH, 
    DISPLAY_HEIGHT,
    sx, sy, sw, sh
  );
  
  pop();
}

function classifyVideo() {
  if (!video || !classifier || !videoReady) return;
  
  // 원본 비디오에서 크롭된 영역만 분류에 사용
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
      console.log("인식 결과:", label);
      
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
function sendLastLabel() {
  if (lastLabelToSend !== null && serial && serial.isOpen()) {
    const currentTime = millis();
    
    // 마지막 전송으로부터 일정 시간이 지났는지 확인
    if (currentTime - lastSentTime >= MIN_TIME_BETWEEN_SENDS) {
      serial.write(lastLabelToSend);
      
      // 디바이스 모드에 따라 다른 종료 문자 사용
      if (window.currentDeviceMode === 'esp32') {
        serial.write('\r\n');  // ESP32/Arduino용
      } else {
        serial.write('\n');    // Microbit용
      }
      
      // 마지막 전송 시간 업데이트
      lastSentTime = currentTime;
      console.log("데이터 전송:", lastLabelToSend);
      
      // 마지막으로 보낸 값과 현재 보낼 값이 같으면 전송 완료로 처리
      // 다르면 다시 예약
      if (lastLabelToSend === prevLabel) {
        sendScheduled = false;
      } else {
        setTimeout(sendLastLabel, MIN_TIME_BETWEEN_SENDS);
      }
    } else {
      // 아직 시간이 지나지 않았으면 다시 시도
      setTimeout(sendLastLabel, MIN_TIME_BETWEEN_SENDS - (currentTime - lastSentTime));
    }
  } else {
    sendScheduled = false;
  }
}

// 시리얼 이벤트 핸들러들
function onSerialErrorOccurred(eventSender, error) {
  console.log("시리얼 오류:", error);
  window.updateSerialStatus("연결 오류", "status-disconnected");
}

function onSerialConnectionOpened(eventSender) {
  console.log("시리얼 포트 연결됨");
  window.updateSerialStatus("연결됨", "status-connected");
}

function onSerialConnectionClosed(eventSender) {
  console.log("시리얼 포트 연결 종료");
  window.updateSerialStatus("연결 안됨", "status-disconnected");
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