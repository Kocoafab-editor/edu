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
  
  // 캔버스를 특정 컨테이너에 생성
  let canvas = createCanvas(480, 380);
  let canvasContainer = document.getElementById('canvasContainer');
  if (canvasContainer) {
    canvas.parent(canvasContainer);
  }
  canvasCreated = true;
  
  // 비디오 설정
  video = createCapture(VIDEO, videoReady_callback);
  video.size(480, 360);
  video.hide();
  
  // 초기 상태 메시지
  window.updateModelStatus("모델 URL을 입력하세요", "status-waiting");
  window.updateSerialStatus("연결 안됨", "status-disconnected");
}

function videoReady_callback() {
  videoReady = true;
  // 모델이 이미 로드되어 있다면 분류 시작
  if (classifier) {
    classifyVideo();
  }
}

function draw() {
  background(50, 50, 60);
  
  if (classifier && flippedVideo && videoReady) {
    image(flippedVideo, 0, 0);
  } else if (video && videoReady) {
    // 비디오가 준비되었지만 모델이 없는 경우
    push();
    translate(width, 0);
    scale(-1, 1);
    image(video, 0, 0, width, height - 20);
    pop();
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

function classifyVideo() {
  if (!video || !classifier || !videoReady) return;
  
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
    
    // 결과가 변경되었을 때만 시리얼로 전송
    if (label != prevLabel) {
      console.log("인식 결과:", label);
      
      // HTML 상태 업데이트
      window.updateRecognitionResult(label);
      
      // 시리얼 포트로 전송
      if (serial && serial.isOpen()) {
        serial.write(label);
        
        // 디바이스 모드에 따라 다른 종료 문자 사용
        if (window.currentDeviceMode === 'esp32') {
          serial.write('\r\n');  // ESP32/Arduino용
        } else {
          serial.write('\n');    // Microbit용
        }
      }
    }
    prevLabel = label;
  }
  
  // 다음 프레임 분류 계속
  classifyVideo();
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