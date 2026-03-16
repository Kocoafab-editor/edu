const ANGLE_KEYS = ["frontShoulder", "frontElbow", "rearShoulder", "rearElbow"];

const ELBOW_ZERO_OFFSET = -90;

const defaultAngles = Object.freeze({
  frontShoulder: 0,
  frontElbow: 0,
  rearShoulder: 0,
  rearElbow: 0,
});

const state = {
  left: { ...defaultAngles },
  right: { ...defaultAngles },
};

let activeSide = "left";

const sideButtons = Array.from(document.querySelectorAll(".toggle-btn"));
const stage = document.getElementById("robotStage");

const jointEls = {
  frontShoulder: document.getElementById("frontShoulderJoint"),
  frontElbow: document.getElementById("frontElbowJoint"),
  rearShoulder: document.getElementById("rearShoulderJoint"),
  rearElbow: document.getElementById("rearElbowJoint"),
};

const controls = ANGLE_KEYS.reduce((acc, key) => {
  acc[key] = {
    range: document.querySelector(`input[type="range"][data-key="${key}"]`),
    number: document.querySelector(`input[type="number"][data-key="${key}"]`),
  };
  return acc;
}, {});

function clampAngle(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-90, Math.min(90, Math.round(value)));
}

function applyAnglesToRobot(angles) {
  jointEls.frontShoulder.style.transform = `rotate(${-angles.frontShoulder}deg)`;
  jointEls.frontElbow.style.transform = `rotate(${-angles.frontElbow + ELBOW_ZERO_OFFSET}deg)`;
  jointEls.rearShoulder.style.transform = `rotate(${-angles.rearShoulder}deg)`;
  jointEls.rearElbow.style.transform = `rotate(${-angles.rearElbow + ELBOW_ZERO_OFFSET}deg)`;
}

function syncInputs(angles) {
  for (const key of ANGLE_KEYS) {
    const value = angles[key];
    const { range, number } = controls[key];

    if (document.activeElement !== range) {
      range.value = value;
    }

    if (document.activeElement !== number) {
      number.value = value;
    }
  }
}

function render() {
  const angles = state[activeSide];

  stage.classList.toggle("left", activeSide === "left");
  stage.classList.toggle("right", activeSide === "right");

  sideButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.side === activeSide);
  });

  applyAnglesToRobot(angles);
  syncInputs(angles);
}

function updateAngle(key, rawValue) {
  const parsed = Number(rawValue);
  if (Number.isNaN(parsed)) {
    return;
  }

  const next = clampAngle(parsed);
  state[activeSide][key] = next;
  render();
}

for (const key of ANGLE_KEYS) {
  const { range, number } = controls[key];

  range.addEventListener("input", (event) => {
    const next = clampAngle(Number(event.target.value));
    number.value = next;
    updateAngle(key, next);
  });

  number.addEventListener("input", (event) => {
    const valueText = event.target.value.trim();
    if (valueText === "" || valueText === "-") {
      return;
    }
    updateAngle(key, valueText);
  });

  number.addEventListener("blur", () => {
    number.value = state[activeSide][key];
  });
}

sideButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const side = button.dataset.side;
    if (side === activeSide) {
      return;
    }
    activeSide = side;
    render();
  });
});

render();
