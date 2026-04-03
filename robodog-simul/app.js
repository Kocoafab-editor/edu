const ANGLE_KEYS = ["frontShoulder", "frontElbow", "rearShoulder", "rearElbow"];
const LENGTH_KEYS = ["frontHeight", "frontReach", "rearHeight", "rearReach"];

const ELBOW_ZERO_OFFSET = -90;
const LENGTH_HEIGHT_MIN = 20;
const LENGTH_HEIGHT_MAX = 90;
const LENGTH_REACH_MIN = -90;
const LENGTH_REACH_MAX = 90;
const DEFAULT_LENGTH_POSE = Object.freeze({ height: 50, reach: -50 });
const LENGTH_INTERPOLATION_POWER = 3;
const LENGTH_HEIGHT_DISTANCE_SCALE = 18;
const LENGTH_REACH_DISTANCE_SCALE = 32;
const SPECIAL_REACH_CURVES = Object.freeze({
  "-90": [
    { height: 20, shoulder: 90, elbow: -90 },
    { height: 30, shoulder: 80, elbow: -90 },
    { height: 40, shoulder: 70, elbow: -90 },
    { height: 50, shoulder: 60, elbow: -90 },
    { height: 60, shoulder: 70, elbow: -90 },
    { height: 70, shoulder: 50, elbow: -90 },
    { height: 80, shoulder: 45, elbow: -90 },
    { height: 90, shoulder: 45, elbow: -90 },
  ],
  "-70": [
    { height: 20, shoulder: 40, elbow: -20 },
    { height: 30, shoulder: 35, elbow: -15 },
    { height: 40, shoulder: 35, elbow: -20 },
    { height: 50, shoulder: 40, elbow: -40 },
    { height: 60, shoulder: 50, elbow: -75 },
    { height: 70, shoulder: 40, elbow: -90 },
    { height: 80, shoulder: 40, elbow: -90 },
    { height: 90, shoulder: 35, elbow: -90 },
  ],
  "70": [
    { height: 20, shoulder: -90, elbow: -15 },
    { height: 30, shoulder: -90, elbow: -15 },
    { height: 40, shoulder: -90, elbow: -25 },
    { height: 45, shoulder: -85, elbow: -30 },
    { height: 50, shoulder: -80, elbow: -35 },
    { height: 60, shoulder: -60, elbow: -75 },
    { height: 70, shoulder: -40, elbow: -90 },
    { height: 80, shoulder: -40, elbow: -90 },
    { height: 90, shoulder: -35, elbow: -90 },
  ],
  "90": [
    { height: 20, shoulder: -90, elbow: -90 },
    { height: 30, shoulder: -80, elbow: -90 },
    { height: 40, shoulder: -70, elbow: -90 },
    { height: 50, shoulder: -60, elbow: -90 },
    { height: 60, shoulder: -60, elbow: -90 },
    { height: 70, shoulder: -50, elbow: -90 },
    { height: 90, shoulder: -45, elbow: -90 },
  ],
});

const LENGTH_SAMPLES = Object.freeze([
  { height: 90, reach: -90, shoulder: 45, elbow: -90 },
  { height: 90, reach: -70, shoulder: 35, elbow: -90 },
  { height: 90, reach: 0, shoulder: 0, elbow: -90 },
  { height: 90, reach: 70, shoulder: -35, elbow: -90 },
  { height: 90, reach: 90, shoulder: -45, elbow: -90 },
  { height: 80, reach: -70, shoulder: 40, elbow: -90 },
  { height: 80, reach: 70, shoulder: -40, elbow: -90 },
  { height: 20, reach: -90, shoulder: 90, elbow: -90 },
  { height: 20, reach: 90, shoulder: -90, elbow: -90 },
  { height: 20, reach: 80, shoulder: -90, elbow: -40 },
  { height: 20, reach: 75, shoulder: -90, elbow: -25 },
  { height: 20, reach: 70, shoulder: -90, elbow: -15 },
  { height: 20, reach: 65, shoulder: -90, elbow: -5 },
  { height: 20, reach: 60, shoulder: -90, elbow: 0 },
  { height: 20, reach: 50, shoulder: -90, elbow: 10 },
  { height: 20, reach: 40, shoulder: -90, elbow: 30 },
  { height: 20, reach: 30, shoulder: -90, elbow: 45 },
  { height: 20, reach: 20, shoulder: -90, elbow: 55 },
  { height: 20, reach: 10, shoulder: -90, elbow: 65 },
  { height: 20, reach: 0, shoulder: -90, elbow: 70 },
  { height: 20, reach: -10, shoulder: -50, elbow: 65 },
  { height: 20, reach: -15, shoulder: -45, elbow: 65 },
  { height: 20, reach: -20, shoulder: -25, elbow: 65 },
  { height: 20, reach: -30, shoulder: -10, elbow: 50 },
  { height: 20, reach: -40, shoulder: 0, elbow: 45 },
  { height: 20, reach: -50, shoulder: 10, elbow: 30 },
  { height: 20, reach: -60, shoulder: 25, elbow: 10 },
  { height: 20, reach: -70, shoulder: 40, elbow: -20 },
  { height: 20, reach: -80, shoulder: 70, elbow: -60 },
  { height: 30, reach: -90, shoulder: 80, elbow: -90 },
  { height: 30, reach: -80, shoulder: 60, elbow: -60 },
  { height: 30, reach: -70, shoulder: 35, elbow: -15 },
  { height: 30, reach: -60, shoulder: 20, elbow: 0 },
  { height: 30, reach: -50, shoulder: 5, elbow: 10 },
  { height: 30, reach: -40, shoulder: -5, elbow: 25 },
  { height: 30, reach: -30, shoulder: -15, elbow: 35 },
  { height: 30, reach: -20, shoulder: -30, elbow: 40 },
  { height: 30, reach: -10, shoulder: -50, elbow: 50 },
  { height: 30, reach: 0, shoulder: -70, elbow: 60 },
  { height: 30, reach: 10, shoulder: -90, elbow: 60 },
  { height: 30, reach: 20, shoulder: -90, elbow: 50 },
  { height: 30, reach: 30, shoulder: -90, elbow: 40 },
  { height: 30, reach: 40, shoulder: -90, elbow: 20 },
  { height: 30, reach: 50, shoulder: -90, elbow: 15 },
  { height: 30, reach: 60, shoulder: -90, elbow: 0 },
  { height: 30, reach: 70, shoulder: -90, elbow: -15 },
  { height: 30, reach: 80, shoulder: -90, elbow: -50 },
  { height: 30, reach: 90, shoulder: -80, elbow: -90 },
  { height: 40, reach: -90, shoulder: 70, elbow: -90 },
  { height: 40, reach: -80, shoulder: 55, elbow: -55 },
  { height: 40, reach: -70, shoulder: 35, elbow: -20 },
  { height: 40, reach: -60, shoulder: 20, elbow: -5 },
  { height: 40, reach: -50, shoulder: 5, elbow: 10 },
  { height: 40, reach: -40, shoulder: -5, elbow: 15 },
  { height: 40, reach: -30, shoulder: -20, elbow: 30 },
  { height: 40, reach: -20, shoulder: -30, elbow: 30 },
  { height: 40, reach: -10, shoulder: -40, elbow: 40 },
  { height: 40, reach: 0, shoulder: -60, elbow: 45 },
  { height: 40, reach: 10, shoulder: -80, elbow: 50 },
  { height: 40, reach: 20, shoulder: -90, elbow: 40 },
  { height: 40, reach: 30, shoulder: -90, elbow: 30 },
  { height: 40, reach: 40, shoulder: -90, elbow: 20 },
  { height: 40, reach: 50, shoulder: -90, elbow: 10 },
  { height: 40, reach: 60, shoulder: -90, elbow: -5 },
  { height: 40, reach: 70, shoulder: -90, elbow: -25 },
  { height: 40, reach: 80, shoulder: -80, elbow: -65 },
  { height: 40, reach: 90, shoulder: -70, elbow: -90 },
  { height: 50, reach: -90, shoulder: 60, elbow: -90 },
  { height: 50, reach: -80, shoulder: 55, elbow: -90 },
  { height: 50, reach: -70, shoulder: 40, elbow: -40 },
  { height: 50, reach: -60, shoulder: 20, elbow: -20 },
  { height: 50, reach: -50, shoulder: 5, elbow: -5 },
  { height: 50, reach: -40, shoulder: -5, elbow: 5 },
  { height: 50, reach: -30, shoulder: -15, elbow: 15 },
  { height: 50, reach: -20, shoulder: -25, elbow: 20 },
  { height: 50, reach: -10, shoulder: -35, elbow: 20 },
  { height: 50, reach: 0, shoulder: -50, elbow: 25 },
  { height: 50, reach: 10, shoulder: -60, elbow: 20 },
  { height: 50, reach: 20, shoulder: -70, elbow: 15 },
  { height: 50, reach: 30, shoulder: -85, elbow: 15 },
  { height: 50, reach: 40, shoulder: -90, elbow: 10 },
  { height: 50, reach: 50, shoulder: -90, elbow: -5 },
  { height: 50, reach: 60, shoulder: -85, elbow: -20 },
  { height: 50, reach: 70, shoulder: -80, elbow: -35 },
  { height: 50, reach: 80, shoulder: -55, elbow: -90 },
  { height: 50, reach: 90, shoulder: -60, elbow: -90 },
  { height: 60, reach: -90, shoulder: 70, elbow: -90 },
  { height: 60, reach: -80, shoulder: 60, elbow: -90 },
  { height: 60, reach: -70, shoulder: 50, elbow: -75 },
  { height: 60, reach: -60, shoulder: 25, elbow: -40 },
  { height: 60, reach: -50, shoulder: 10, elbow: -15 },
  { height: 60, reach: -40, shoulder: -5, elbow: -5 },
  { height: 60, reach: -30, shoulder: -10, elbow: 5 },
  { height: 60, reach: -20, shoulder: -25, elbow: 10 },
  { height: 60, reach: -10, shoulder: -40, elbow: 10 },
  { height: 60, reach: 0, shoulder: -50, elbow: 10 },
  { height: 60, reach: 10, shoulder: -55, elbow: 5 },
  { height: 60, reach: 20, shoulder: -60, elbow: 5 },
  { height: 60, reach: 30, shoulder: -65, elbow: 0 },
  { height: 60, reach: 40, shoulder: -70, elbow: -10 },
  { height: 60, reach: 50, shoulder: -70, elbow: -20 },
  { height: 60, reach: 60, shoulder: -70, elbow: -40 },
  { height: 60, reach: 70, shoulder: -60, elbow: -75 },
  { height: 60, reach: 80, shoulder: -50, elbow: -90 },
  { height: 60, reach: 90, shoulder: -60, elbow: -90 },
  { height: 44, reach: -41, shoulder: -10, elbow: 10 },
  { height: 70, reach: -90, shoulder: 50, elbow: -90 },
  { height: 70, reach: -80, shoulder: 45, elbow: -90 },
  { height: 70, reach: -70, shoulder: 40, elbow: -90 },
  { height: 70, reach: -60, shoulder: 35, elbow: -75 },
  { height: 70, reach: -50, shoulder: 15, elbow: -30 },
  { height: 70, reach: -40, shoulder: 0, elbow: -20 },
  { height: 70, reach: -30, shoulder: -10, elbow: -10 },
  { height: 70, reach: -20, shoulder: -20, elbow: -5 },
  { height: 70, reach: -10, shoulder: -30, elbow: 0 },
  { height: 70, reach: 0, shoulder: -35, elbow: 0 },
  { height: 70, reach: 10, shoulder: -40, elbow: -10 },
  { height: 70, reach: 20, shoulder: -50, elbow: -10 },
  { height: 70, reach: 30, shoulder: -60, elbow: -10 },
  { height: 70, reach: 40, shoulder: -60, elbow: -20 },
  { height: 70, reach: 50, shoulder: -55, elbow: -40 },
  { height: 70, reach: 60, shoulder: -45, elbow: -75 },
  { height: 70, reach: 70, shoulder: -40, elbow: -90 },
  { height: 70, reach: 80, shoulder: -45, elbow: -90 },
  { height: 70, reach: 90, shoulder: -50, elbow: -90 },
]);

const LEG_CONFIG = {
  front: {
    shoulderKey: "frontShoulder",
    elbowKey: "frontElbow",
    heightKey: "frontHeight",
    reachKey: "frontReach",
  },
  rear: {
    shoulderKey: "rearShoulder",
    elbowKey: "rearElbow",
    heightKey: "rearHeight",
    reachKey: "rearReach",
  },
};

const GROUP_DEFINITIONS = Object.freeze([
  {
    id: "all",
    legs: ["leftFront", "leftBack", "rightFront", "rightBack"],
    blockLabel: "네다리",
    pythonConst: "ALL_LEG",
    priority: 0,
  },
  {
    id: "left",
    legs: ["leftFront", "leftBack"],
    blockLabel: "왼쪽다리",
    pythonConst: "LEFT_LEG",
    priority: 1,
  },
  {
    id: "right",
    legs: ["rightFront", "rightBack"],
    blockLabel: "오른쪽다리",
    pythonConst: "RIGHT_LEG",
    priority: 2,
  },
  {
    id: "front",
    legs: ["leftFront", "rightFront"],
    blockLabel: "앞다리",
    pythonConst: "FRONT_LEG",
    priority: 3,
  },
  {
    id: "back",
    legs: ["leftBack", "rightBack"],
    blockLabel: "뒷다리",
    pythonConst: "BACK_LEG",
    priority: 4,
  },
  {
    id: "leftFront",
    legs: ["leftFront"],
    blockLabel: "왼쪽 위",
    pythonConst: "LEFT_FRONT",
    priority: 5,
  },
  {
    id: "leftBack",
    legs: ["leftBack"],
    blockLabel: "왼쪽 아래",
    pythonConst: "LEFT_BACK",
    priority: 6,
  },
  {
    id: "rightFront",
    legs: ["rightFront"],
    blockLabel: "오른쪽 위",
    pythonConst: "RIGHT_FRONT",
    priority: 7,
  },
  {
    id: "rightBack",
    legs: ["rightBack"],
    blockLabel: "오른쪽 아래",
    pythonConst: "RIGHT_BACK",
    priority: 8,
  },
]);

const defaultAngles = Object.freeze({
  frontShoulder: 0,
  frontElbow: 0,
  rearShoulder: 0,
  rearElbow: 0,
});

const defaultLengths = Object.freeze({
  frontHeight: DEFAULT_LENGTH_POSE.height,
  frontReach: DEFAULT_LENGTH_POSE.reach,
  rearHeight: DEFAULT_LENGTH_POSE.height,
  rearReach: DEFAULT_LENGTH_POSE.reach,
});

const state = {
  left: { ...defaultAngles, ...defaultLengths },
  right: { ...defaultAngles, ...defaultLengths },
};

let activeSide = "left";
let activeControlMode = "angle";
let activeCodeMode = "block";

const sideButtons = Array.from(document.querySelectorAll("[data-side]"));
const modeButtons = Array.from(document.querySelectorAll("[data-control-mode]"));
const codeModeButtons = Array.from(document.querySelectorAll("[data-code-mode]"));
const stage = document.getElementById("robotStage");
const controlPanels = Array.from(document.querySelectorAll("[data-panel]"));
const codePanels = Array.from(document.querySelectorAll("[data-code-panel]"));
const blockCodeOutput = document.getElementById("blockCodeOutput");
const pythonCodeOutput = document.getElementById("pythonCodeOutput");
const copyCodeBtn = document.getElementById("copyCodeBtn");

const jointEls = {
  frontShoulder: document.getElementById("frontShoulderJoint"),
  frontElbow: document.getElementById("frontElbowJoint"),
  rearShoulder: document.getElementById("rearShoulderJoint"),
  rearElbow: document.getElementById("rearElbowJoint"),
};

const controls = [...ANGLE_KEYS, ...LENGTH_KEYS].reduce((acc, key) => {
  acc[key] = {
    range: document.querySelector(`input[type="range"][data-key="${key}"]`),
    number: document.querySelector(`input[type="number"][data-key="${key}"]`),
  };
  return acc;
}, {});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampToControl(key, value) {
  const control = controls[key];
  const min = Number(control.range.min);
  const max = Number(control.range.max);

  if (!Number.isFinite(value)) {
    return min <= 0 && max >= 0 ? 0 : min;
  }

  return clamp(Math.round(value), min, max);
}

function getLegNameFromKey(key) {
  return key.startsWith("front") ? "front" : "rear";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getLegValueMap(controlMode) {
  // The visible "우측/좌측" toggle maps to state.left/state.right respectively.
  const rightSide = state.left;
  const leftSide = state.right;

  if (controlMode === "angle") {
    return {
      leftFront: { first: leftSide.frontShoulder, second: leftSide.frontElbow },
      leftBack: { first: leftSide.rearShoulder, second: leftSide.rearElbow },
      rightFront: { first: rightSide.frontShoulder, second: rightSide.frontElbow },
      rightBack: { first: rightSide.rearShoulder, second: rightSide.rearElbow },
    };
  }

  return {
    leftFront: { first: leftSide.frontHeight, second: leftSide.frontReach },
    leftBack: { first: leftSide.rearHeight, second: leftSide.rearReach },
    rightFront: { first: rightSide.frontHeight, second: rightSide.frontReach },
    rightBack: { first: rightSide.rearHeight, second: rightSide.rearReach },
  };
}

function legsHaveSameValues(legs, valueMap) {
  const firstValues = valueMap[legs[0]];

  return legs.every((leg) => {
    const values = valueMap[leg];
    return values.first === firstValues.first && values.second === firstValues.second;
  });
}

function compareCommandSets(candidate, currentBest) {
  if (candidate.length !== currentBest.length) {
    return candidate.length - currentBest.length;
  }

  const candidatePriority = candidate.reduce((sum, item) => sum + item.group.priority, 0);
  const bestPriority = currentBest.reduce((sum, item) => sum + item.group.priority, 0);

  if (candidatePriority !== bestPriority) {
    return candidatePriority - bestPriority;
  }

  return candidate.map((item) => item.group.id).join("|").localeCompare(
    currentBest.map((item) => item.group.id).join("|")
  );
}

function buildGroupedCommands(controlMode) {
  const valueMap = getLegValueMap(controlMode);
  const memo = new Map();

  function search(remainingLegs) {
    if (remainingLegs.length === 0) {
      return [];
    }

    const memoKey = remainingLegs.join("|");
    if (memo.has(memoKey)) {
      return memo.get(memoKey);
    }

    const anchorLeg = remainingLegs[0];
    let bestCommands = null;

    for (const group of GROUP_DEFINITIONS) {
      if (!group.legs.includes(anchorLeg)) {
        continue;
      }

      if (!group.legs.every((leg) => remainingLegs.includes(leg))) {
        continue;
      }

      if (!legsHaveSameValues(group.legs, valueMap)) {
        continue;
      }

      const nextRemaining = remainingLegs.filter((leg) => !group.legs.includes(leg));
      const candidate = [
        { group, values: valueMap[anchorLeg] },
        ...search(nextRemaining),
      ];

      if (bestCommands === null || compareCommandSets(candidate, bestCommands) < 0) {
        bestCommands = candidate;
      }
    }

    memo.set(memoKey, bestCommands);
    return bestCommands;
  }

  return search(["leftFront", "leftBack", "rightFront", "rightBack"]);
}

function renderBlockExamples(commands, controlMode) {
  blockCodeOutput.innerHTML = "";

  for (const command of commands) {
    const block = document.createElement("div");
    block.className = "block-command";

    if (controlMode === "angle") {
      block.innerHTML = `
        <span class="block-badge">${command.group.blockLabel}</span>
        <span>어깨</span>
        <span class="block-value">${command.values.first}</span>
        <span>도, 무릎</span>
        <span class="block-value">${command.values.second}</span>
        <span>도 설정하기</span>
      `;
    } else {
      block.innerHTML = `
        <span class="block-badge">${command.group.blockLabel}</span>
        <span>다리 높이</span>
        <span class="block-value">${command.values.first}</span>
        <span>, 발끝 앞뒤</span>
        <span class="block-value">${command.values.second}</span>
        <span>로 설정하기</span>
      `;
    }

    blockCodeOutput.appendChild(block);
  }
}

function renderPythonExamples(commands, controlMode) {
  pythonCodeOutput.innerHTML = commands.map((command) => {
    if (controlMode === "angle") {
      return [
        `<span class="token-variable">dog</span>.`,
        `<span class="token-function">motor</span>( `,
        `<span class="token-variable">${escapeHtml(command.group.pythonConst)}</span>, `,
        `<span class="token-number">${command.values.first}</span>, `,
        `<span class="token-number">${command.values.second}</span> )`,
      ].join("");
    }

    return [
      `<span class="token-variable">dog</span>.`,
      `<span class="token-function">leg</span>( `,
      `<span class="token-variable">${escapeHtml(command.group.pythonConst)}</span>, `,
      `<span class="token-number">${command.values.first}</span>, `,
      `<span class="token-number">${command.values.second}</span> )`,
    ].join("");
  }).join("\n");
}

function renderCodeExamples() {
  const commands = buildGroupedCommands(activeControlMode);
  renderBlockExamples(commands, activeControlMode);
  renderPythonExamples(commands, activeControlMode);
}

function formatPythonExamples(commands, controlMode) {
  return commands.map((command) => {
    if (controlMode === "angle") {
      return `dog.motor( ${command.group.pythonConst}, ${command.values.first}, ${command.values.second} )`;
    }

    return `dog.leg( ${command.group.pythonConst}, ${command.values.first}, ${command.values.second} )`;
  }).join("\n");
}

async function copyCodeToClipboard() {
  const commands = buildGroupedCommands(activeControlMode);
  const text = formatPythonExamples(commands, activeControlMode);

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
    } else {
      const temp = document.createElement("textarea");
      temp.value = text;
      temp.setAttribute("readonly", "readonly");
      temp.style.position = "absolute";
      temp.style.left = "-9999px";
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      document.body.removeChild(temp);
    }

    copyCodeBtn.textContent = "✓";
    window.setTimeout(() => {
      copyCodeBtn.textContent = "⧉";
    }, 1200);
  } catch (_error) {
    copyCodeBtn.textContent = "!";
    window.setTimeout(() => {
      copyCodeBtn.textContent = "⧉";
    }, 1200);
  }
}

function interpolateCurveByHeight(points, height) {
  if (height <= points[0].height) {
    return { shoulder: points[0].shoulder, elbow: points[0].elbow };
  }

  const lastPoint = points[points.length - 1];
  if (height >= lastPoint.height) {
    return { shoulder: lastPoint.shoulder, elbow: lastPoint.elbow };
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const currentPoint = points[index];
    const nextPoint = points[index + 1];

    if (height >= currentPoint.height && height <= nextPoint.height) {
      const span = nextPoint.height - currentPoint.height;
      const ratio = span === 0 ? 0 : (height - currentPoint.height) / span;

      return {
        shoulder: currentPoint.shoulder + ((nextPoint.shoulder - currentPoint.shoulder) * ratio),
        elbow: currentPoint.elbow + ((nextPoint.elbow - currentPoint.elbow) * ratio),
      };
    }
  }

  return { shoulder: lastPoint.shoulder, elbow: lastPoint.elbow };
}

function getSpecialReachAngles(height, reach) {
  const curve = SPECIAL_REACH_CURVES[String(reach)];
  if (!curve) {
    return null;
  }

  return interpolateCurveByHeight(curve, height);
}

function interpolateLengthAngle(height, reach, key) {
  for (const sample of LENGTH_SAMPLES) {
    if (sample.height === height && sample.reach === reach) {
      return sample[key];
    }
  }

  let weightedTotal = 0;
  let weightSum = 0;

  for (const sample of LENGTH_SAMPLES) {
    const dh = (height - sample.height) / LENGTH_HEIGHT_DISTANCE_SCALE;
    const dr = (reach - sample.reach) / LENGTH_REACH_DISTANCE_SCALE;
    const distance = Math.hypot(dh, dr);
    const weight = 1 / Math.pow(distance, LENGTH_INTERPOLATION_POWER);

    weightedTotal += sample[key] * weight;
    weightSum += weight;
  }

  return weightedTotal / weightSum;
}

function lengthPoseToAngles(height, reach) {
  const clampedHeight = clampToControl("frontHeight", height);
  const clampedReach = clampToControl("frontReach", reach);
  const specialAngles = getSpecialReachAngles(clampedHeight, clampedReach);

  if (specialAngles) {
    return {
      shoulder: clampToControl("frontShoulder", Math.round(specialAngles.shoulder)),
      elbow: clampToControl("frontElbow", Math.round(specialAngles.elbow)),
    };
  }

  return {
    shoulder: clampToControl(
      "frontShoulder",
      Math.round(interpolateLengthAngle(clampedHeight, clampedReach, "shoulder"))
    ),
    elbow: clampToControl(
      "frontElbow",
      Math.round(interpolateLengthAngle(clampedHeight, clampedReach, "elbow"))
    ),
  };
}

// Angle/length mode use the same sampled pose table so toggling stays stable.
const legLengthLookup = (() => {
  const poses = [];

  for (let height = LENGTH_HEIGHT_MIN; height <= LENGTH_HEIGHT_MAX; height += 1) {
    for (let reach = LENGTH_REACH_MIN; reach <= LENGTH_REACH_MAX; reach += 1) {
      const poseAngles = lengthPoseToAngles(height, reach);
      poses.push({
        height,
        reach,
        shoulder: poseAngles.shoulder,
        elbow: poseAngles.elbow,
      });
    }
  }

  return poses;
})();

function anglesToLengthPose(shoulder, elbow) {
  let bestPose = legLengthLookup[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const pose of legLengthLookup) {
    const angleDistance = Math.abs(pose.shoulder - shoulder) + Math.abs(pose.elbow - elbow);
    const defaultPoseDistance =
      Math.abs(pose.height - DEFAULT_LENGTH_POSE.height) +
      Math.abs(pose.reach - DEFAULT_LENGTH_POSE.reach);
    const score = (angleDistance * 1000) + defaultPoseDistance;

    if (score < bestScore) {
      bestScore = score;
      bestPose = pose;
    }
  }

  return {
    height: bestPose.height,
    reach: bestPose.reach,
  };
}

function getLengthValuesForAngles(angles) {
  const frontPose = anglesToLengthPose(angles.frontShoulder, angles.frontElbow);
  const rearPose = anglesToLengthPose(angles.rearShoulder, angles.rearElbow);

  return {
    frontHeight: frontPose.height,
    frontReach: frontPose.reach,
    rearHeight: rearPose.height,
    rearReach: rearPose.reach,
  };
}

function applyAnglesToRobot(angles) {
  jointEls.frontShoulder.style.transform = `rotate(${-angles.frontShoulder}deg)`;
  jointEls.frontElbow.style.transform = `rotate(${-angles.frontElbow + ELBOW_ZERO_OFFSET}deg)`;
  jointEls.rearShoulder.style.transform = `rotate(${-angles.rearShoulder}deg)`;
  jointEls.rearElbow.style.transform = `rotate(${-angles.rearElbow + ELBOW_ZERO_OFFSET}deg)`;
}

function syncControlValues(keys, values) {
  for (const key of keys) {
    const value = values[key];
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
  const currentState = state[activeSide];
  const angles = {
    frontShoulder: currentState.frontShoulder,
    frontElbow: currentState.frontElbow,
    rearShoulder: currentState.rearShoulder,
    rearElbow: currentState.rearElbow,
  };
  const lengthValues = {
    frontHeight: currentState.frontHeight,
    frontReach: currentState.frontReach,
    rearHeight: currentState.rearHeight,
    rearReach: currentState.rearReach,
  };

  stage.classList.toggle("left", activeSide === "left");
  stage.classList.toggle("right", activeSide === "right");

  sideButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.side === activeSide);
  });

  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.controlMode === activeControlMode);
  });

  codeModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.codeMode === activeCodeMode);
  });

  controlPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === activeControlMode);
  });

  codePanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.codePanel === activeCodeMode);
  });

  applyAnglesToRobot(angles);
  syncControlValues(ANGLE_KEYS, angles);
  syncControlValues(LENGTH_KEYS, lengthValues);
  renderCodeExamples();
}

function updateAngle(key, rawValue) {
  const parsed = Number(rawValue);
  if (Number.isNaN(parsed)) {
    return;
  }

  state[activeSide][key] = clampToControl(key, parsed);
  Object.assign(state[activeSide], getLengthValuesForAngles(state[activeSide]));
  render();
}

function updateLength(key, rawValue) {
  const parsed = Number(rawValue);
  if (Number.isNaN(parsed)) {
    return;
  }

  const legName = getLegNameFromKey(key);
  const legConfig = LEG_CONFIG[legName];
  const nextValue = clampToControl(key, parsed);

  state[activeSide][key] = nextValue;

  const nextHeight = state[activeSide][legConfig.heightKey];
  const nextReach = state[activeSide][legConfig.reachKey];

  const nextAngles = lengthPoseToAngles(nextHeight, nextReach);

  state[activeSide][legConfig.shoulderKey] = nextAngles.shoulder;
  state[activeSide][legConfig.elbowKey] = nextAngles.elbow;
  render();
}

function bindControls(keys, updater) {
  for (const key of keys) {
    const { range, number } = controls[key];

    range.addEventListener("input", (event) => {
      const nextValue = clampToControl(key, Number(event.target.value));
      number.value = nextValue;
      updater(key, nextValue);
    });

    number.addEventListener("input", (event) => {
      const valueText = event.target.value.trim();
      if (valueText === "" || valueText === "-") {
        return;
      }

      updater(key, valueText);
    });

    number.addEventListener("blur", () => {
      render();
    });
  }
}

bindControls(ANGLE_KEYS, updateAngle);
bindControls(LENGTH_KEYS, updateLength);

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

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextMode = button.dataset.controlMode;
    if (nextMode === activeControlMode) {
      return;
    }

    activeControlMode = nextMode;
    render();
  });
});

if (copyCodeBtn) {
  copyCodeBtn.addEventListener("click", () => {
    copyCodeToClipboard();
  });
}

codeModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextMode = button.dataset.codeMode;
    if (nextMode === activeCodeMode) {
      return;
    }

    activeCodeMode = nextMode;
    render();
  });
});

render();
