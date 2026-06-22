const SAMPLE_RATE = 36000;

let isFullScreen = false;
let isModuleInitialized = false;
let isMenuDisplay = false;
let ac = null;
let gainNode = null;
let noSound = false;
let keyInput = 0;
let keyInput2 = 0;
let softPadInput = 0;
let isVisible = true;
let premuteVolume = 100;
let rightUpBackCloseMenu = true;

const g = new gamepad();

function el(id) {
  return document.getElementById(id);
}

const rootElement = document.documentElement;
rootElement.requestFullscreen = rootElement.requestFullscreen || rootElement.mozRequestFullScreen || rootElement.webkitRequestFullscreen || rootElement.msRequestFullscreen;
document.exitFullscreen = document.exitFullscreen || document.cancelFullScreen || document.mozCancelFullScreen || document.webkitCancelFullScreen || document.msExitFullscreen;

function enableFullScreen() {
  el("fullScreenRoot").style.display = "grid";
  el("fullscreenToggle").innerHTML = "Fullscreen: ON";
  document.body.style.backgroundColor = "#000000";
}

function disableFullScreen() {
  el("fullScreenRoot").style.display = "none";
  el("fullscreenToggle").innerHTML = "Fullscreen: OFF";
  document.body.style.backgroundColor = "#eeeeee";
}

"webkitfullscreenchange mozfullscreenchange MSFullscreenChange fullscreenchange".split(" ").forEach((en) => {
  document.addEventListener(en, (e) => {
    if (document.fullscreenElement) {
      isFullScreen = true;
      enableFullScreen();
    } else {
      isFullScreen = false;
      disableFullScreen();
    }
  });
});

function menuButtonFullScreen() {
  if (!isFullScreen) {
    rootElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

// Key input
// Bit positions: right=8, left=9, down=10, up=11, start=12, select=13, b=15, y=14, a=7, x=6, l=5, r=4

const KEYMAPS = {
  p1: {
    arrowright: [1, 8], arrowleft: [1, 9], arrowdown: [1, 10], arrowup: [1, 11],
    enter:      [1, 12], // START
    "0":        [1, 13], // SELECT
    "3":        [1, 7],  // A
    "2":        [1, 15], // B
    "5":        [1, 6],  // X
    "1":        [1, 14], // Y
    "4":        [1, 5],  // L
    "6":        [1, 4],  // R
  },
  p2: {
    w: [2, 11], s: [2, 10], a: [2, 9], d: [2, 8],
    " ":        [2, 12], // START
    shift:      [2, 13], // SELECT
    j:          [2, 7],  // A
    h:          [2, 15], // B
    y:          [2, 6],  // X
    g:          [2, 14], // Y
    t:          [2, 5],  // L
    u:          [2, 4],  // R
  },
};

const DEFAULT_HOTKEYS = {
  speedup:   "+",
  speeddown: "-",
};

function getHotkey(action) {
  return (customKeymaps.hotkeys && customKeymaps.hotkeys[action]) ?? DEFAULT_HOTKEYS[action];
}

let _hotkeyLookup = null; // key -> action

function rebuildHotkeyLookup() {
  _hotkeyLookup = {};
  for (const action of Object.keys(DEFAULT_HOTKEYS)) {
    _hotkeyLookup[getHotkey(action)] = action;
  }
}

function buildMap(baseName) {
  const computed = {};
  for (const [key, val] of Object.entries(KEYMAPS[baseName])) {
    computed[key] = val;
  }
  const custom = customKeymaps[baseName];
  if (custom) {
    for (const [bit, newKey] of Object.entries(custom)) {
      const player = baseName === "p1" ? 1 : 2;
      for (const [k, [p, b]] of Object.entries(computed)) {
        if (p === player && b === Number(bit)) { delete computed[k]; break; }
      }
      computed[newKey] = [player, Number(bit)];
    }
  }
  return computed;
}

function rebuildKeymapCache() {
  _cachedKeymaps = [buildMap("p1"), buildMap("p2")];
  rebuildHotkeyLookup();
}

function handleKey(key, down) {
  for (const map of _cachedKeymaps) {
    const binding = map[key];
    if (!binding) continue;
    const [player, bit] = binding;
    if (player === 1) {
      if (down) keyInput |= (1 << bit);
      else keyInput &= (0xFFFFFFFF ^ (1 << bit));
    } else {
      if (down) keyInput2 |= (1 << bit);
      else keyInput2 &= (0xFFFFFFFF ^ (1 << bit));
    }
  }
}

document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (e.keyCode == 122) {
    e.keyCode = null;
    e.returnValue = false;
    menuButtonFullScreen();
  }
  const action = _hotkeyLookup && _hotkeyLookup[key];
  if (action === "speedup")   { setSpeed(currentSpeed + parseInt(el("speedSlider").step)); return; }
  if (action === "speeddown") { setSpeed(currentSpeed - parseInt(el("speedSlider").step)); return; }
  handleKey(key, true);
});

document.addEventListener("keyup", (e) => {
  handleKey(e.key.toLowerCase(), false);
});

document.onvisibilitychange = function () {
  isVisible = !document.hidden;
};

class MyFileReader extends FileReader {
  constructor(_buttonElement, filter) {
    super();
    this.inputElement = document.createElement("input");
    this.inputElement.type = "file";
    this.inputElement.accept = filter;
    this.buttonElement = _buttonElement;
    this.buttonElement.addEventListener("click", { handleEvent: this.buttonClickHandler, self: this });
    this.inputElement.addEventListener("change", { handleEvent: this.inputChangeHandler, self: this });
    this.loadHandlerFunc = null;
    this.loadHandlerArgs = null;
    this.addEventListener("load", (e) => {
      e.target.fileData = new Uint8Array(e.target.result);
      if (e.target.loadHandlerFunc !== null) e.target.loadHandlerFunc(e.target.loadHandlerArgs);
    });
  }

  inputChanged(e) {
    const tmp = e.target.files;
    if (tmp) {
      const f = tmp[0];
      this.fileName = f.name;
      this.fileHandle = f;
      this.readAsArrayBuffer(f);
    }
  }

  inputChangeHandler(e) {
    this.self.inputChanged(e);
  }

  buttonClickHandler(e) {
    this.self.inputElement.value = "";
    this.self.inputElement.click();
  }
}

function exitMenu() {
  el("menu").style.display = "none";
  isMenuDisplay = false;
}

const romFr = new MyFileReader(el("loadRomButton"), ".sfc,.smc");
romFr.loadHandlerFunc = () => {
  if (!isModuleInitialized) return;
  if (!ac && (noSound === false)) enableSound();
  const romPtr = setUint8ArrayToCMemory(romFr.fileData);
  Module._startWithRom(romPtr, romFr.fileData.length, SAMPLE_RATE);
  Module._my_free(romPtr);
  el("reloadRomButton").style.display = "";
  el("resetRomButton").style.display = "";
  el("loadSramButton").style.display = "";
  el("saveSramButton").style.display = "";
  el("loadStateButton").style.display = "";
  el("saveStateButton").style.display = "";
  el("canvasLoadRomOverlay").style.display = "none";
  el("menuRomName").innerHTML = " — " + romFr.fileName.replace(/\.[^.]+$/, "");
  exitMenu();
};

el("canvasLoadRomOverlay").addEventListener("click", () => {
  el("loadRomButton").click();
});

const sramFr = new MyFileReader(el("loadSramButton"), ".srm");
sramFr.loadHandlerFunc = () => {
  let fileData = sramFr.fileData;
  if (fileData.length > 0x20000) fileData = fileData.subarray(0, 0x20000); // Prevent overflow when writing to Memory.SRAM
  const sramPtr = setUint8ArrayToCMemory(fileData);
  Module._loadSram(fileData.length, sramPtr);
  Module._my_free(sramPtr);
  exitMenu();
};

const stateFr = new MyFileReader(el("loadStateButton"), ".state");
stateFr.loadHandlerFunc = () => {
  const fileData = stateFr.fileData;
  const statePtr = setUint8ArrayToCMemory(fileData);
  Module._loadState(statePtr, fileData.length);
  Module._my_free(statePtr);
  exitMenu();
};

function scriptNodeProcess(e) {
  if (!isModuleInitialized) return;
  const outputL = e.outputBuffer.getChannelData(0);
  const outputR = e.outputBuffer.getChannelData(1);
  if (isMenuDisplay || !isVisible) {
    outputL.fill(0);
    outputR.fill(0);
  } else {
    const soundBuffer = new Float32Array(Module.HEAPF32.buffer, Module._getSoundBuffer(), 2048 * 2);
    outputL.set(soundBuffer.subarray(0, 2048));
    outputR.set(soundBuffer.subarray(2048));
  }
}

function enableSound() { // Call on user interaction (e.g. button press)
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    noSound = true;
    return;
  }
  ac = new AudioContext({ sampleRate: SAMPLE_RATE });
  if (!ac) {
    noSound = true;
    return;
  }
  gainNode = ac.createGain();
  gainNode.gain.value = el("volumeSlider").value / 100;
  let scriptNode = null;
  if (ac.createScriptProcessor) {
    scriptNode = ac.createScriptProcessor(2048, 0, 2);
  } else if (ac.createJavaScriptNode) {
    scriptNode = ac.createJavaScriptNode(2048, 0, 2);
  } else {
    ac = null;
    noSound = true;
    return;
  }
  scriptNode.onaudioprocess = scriptNodeProcess;
  scriptNode.connect(gainNode);
  gainNode.connect(ac.destination);
}

function setUint8ArrayToCMemory(src) {
  const buffer = Module._my_malloc(src.length);
  Module.HEAP8.set(src, buffer);
  return buffer;
}

function canvasSetup(can) {
  can.width = 256;
  can.height = 224;
  const canCtx = can.getContext("2d");
  const canImgData = canCtx.getImageData(0, 0, 256, 224);
  return [canCtx, canImgData];
}

function setFsoSize(fso, root) {
  const heightRatio = 0.75;
  const rWidth = root.clientWidth;
  const rHeight = root.clientHeight;
  if ((rHeight / rWidth) > heightRatio) {
    fso.style.width = rWidth + "px";
    fso.style.height = (rWidth * heightRatio) + "px";
  } else {
    fso.style.height = rHeight + "px";
    fso.style.width = (rHeight / heightRatio) + "px";
  }
}

const root = el("root");
const fso = el("fs_output");

const savedVolume = localStorage.getItem("volume");
if (savedVolume !== null) {
  el("volumeSlider").value = savedVolume;
  premuteVolume = savedVolume > 0 ? savedVolume : 100;
  if (savedVolume == 0) el("volumeLabel").style.textDecoration = "line-through";
}

let customKeymaps = JSON.parse(localStorage.getItem("customKeymaps") || "{}");
let listeningFor = null; // { player, bit, btn element }

let kbdDisplayEnabled = localStorage.getItem("kbdDisplay") !== "false"; // default true

function updateKeyboardDisplay() {
  el("kbdDisplayToggle").innerHTML = "Show Controls: " + (kbdDisplayEnabled ? "ON" : "OFF");

  if (!kbdDisplayEnabled) {
    el("keyboardInputRight").innerHTML = "";
    return;
  }

  function keyFor(player, bit) {
    return displayKey(getEffectiveKey(player, bit));
  }

  const p1dpad = keyFor(1, 8) + " " + keyFor(1, 9) + " " + keyFor(1, 10) + " " + keyFor(1, 11);
  const p2dpad = keyFor(2, 8) + " " + keyFor(2, 9) + " " + keyFor(2, 10) + " " + keyFor(2, 11);

  function playerBlock(player, dpad) {
    return "P" + player + ":<br>" +
      "START: " + keyFor(player, 12) + "<br>" +
      "SELECT: " + keyFor(player, 13) + "<br>" +
      '<span style="color:#DA2424">A: ' + keyFor(player, 7) + '</span><br>' +
      '<span style="color:#D5B824">B: ' + keyFor(player, 15) + '</span><br>' +
      '<span style="color:#242DD5">X: ' + keyFor(player, 6) + '</span><br>' +
      '<span style="color:#24D535">Y: ' + keyFor(player, 14) + '</span><br>' +
      "L: " + keyFor(player, 5) + " &nbsp; R: " + keyFor(player, 4) + "<br>" +
      "D-Pad: " + dpad;
  }

  el("keyboardInputRight").innerHTML =
    playerBlock(1, p1dpad) + "<br><br>" + playerBlock(2, p2dpad);
}

el("kbdDisplayToggle").addEventListener("click", () => {
  kbdDisplayEnabled = !kbdDisplayEnabled;
  localStorage.setItem("kbdDisplay", kbdDisplayEnabled);
  updateKeyboardDisplay();
});

function applyVideoFilter(name) {
  const wrappers = document.querySelectorAll(".canvasWrap");
  for (const w of wrappers) {
    w.classList.remove("smooth", "crt", "scanlines");
    if (name === "smooth" || name === "crt" || name === "scanlines") {
      w.classList.add(name);
    }
  }
}

const savedFilter = localStorage.getItem("videoFilter") || "sharp";
el("videoFilterSelect").value = savedFilter;
applyVideoFilter(savedFilter);

el("videoFilterSelect").addEventListener("change", (e) => {
  localStorage.setItem("videoFilter", e.target.value);
  applyVideoFilter(e.target.value);
});

updateKeyboardDisplay();

// Key remapping
const BUTTON_LABELS = [
  { name: "Up",     bit: 11 },
  { name: "Down",   bit: 10 },
  { name: "Left",   bit: 9  },
  { name: "Right",  bit: 8  },
  { name: "Start",  bit: 12 },
  { name: "Select", bit: 13 },
  { name: "A",      bit: 7  },
  { name: "B",      bit: 15 },
  { name: "X",      bit: 6  },
  { name: "Y",      bit: 14 },
  { name: "L",      bit: 5  },
  { name: "R",      bit: 4  },
];

function getEffectiveKey(player, bit) {
  const mapName = "p" + player;
  const map = buildMap(mapName);
  for (const [key, [p, b]] of Object.entries(map)) {
    if (p === player && b === bit) return key;
  }
  return "—";
}

function displayKey(key) {
  const map = {
    " ": "Space", arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→",
    shift: "Shift", enter: "Enter", escape: "Esc"
  };
  return map[key] || key.toUpperCase();
}

function buildKeyRemapUI() {
  const content = el("keyRemapContent");
  content.innerHTML = "";

  for (const player of [1, 2]) {
    const col = document.createElement("div");
    col.className = "keyRemapPlayer";
    const title = document.createElement("div");
    title.className = "keyRemapPlayerTitle";
    title.innerHTML = "Player " + player;
    col.appendChild(title);

    for (const { name, bit } of BUTTON_LABELS) {
      const row = document.createElement("div");
      row.className = "keyRemapRow";
      const label = document.createElement("div");
      label.className = "keyRemapLabel";
      label.innerHTML = name + ":";
      const btn = document.createElement("button");
      btn.className = "keyRemapBtn";
      btn.innerHTML = displayKey(getEffectiveKey(player, bit));
      btn.addEventListener("click", () => {
        if (listeningFor) {
          listeningFor.btn.classList.remove("listening");
          listeningFor.btn.innerHTML = listeningFor.hotkey
            ? displayKey(getHotkey(listeningFor.hotkey))
            : displayKey(getEffectiveKey(listeningFor.player, listeningFor.bit));
        }
        listeningFor = { player, bit, btn };
        btn.classList.add("listening");
        btn.innerHTML = "...";
      });
      row.appendChild(label);
      row.appendChild(btn);
      col.appendChild(row);
    }

    const resetBtn = document.createElement("button");
    resetBtn.className = "keyRemapBtn";
    resetBtn.style.marginTop = "12px";
    resetBtn.innerHTML = "Reset P" + player;
    resetBtn.addEventListener("click", () => {
      const mapName = "p" + player;
      if (customKeymaps[mapName]) {
        delete customKeymaps[mapName];
        localStorage.setItem("customKeymaps", JSON.stringify(customKeymaps));
        buildKeyRemapUI();
        rebuildKeymapCache();
        updateKeyboardDisplay();
      }
    });
    col.appendChild(resetBtn);
    content.appendChild(col);
  }

  const hotkeyLabels = [
    { name: "Speed Up", action: "speedup" },
    { name: "Speed Down", action: "speeddown" },
  ];
  const hcol = document.createElement("div");
  hcol.className = "keyRemapPlayer";
  const htitle = document.createElement("div");
  htitle.className = "keyRemapPlayerTitle";
  htitle.innerHTML = "Hotkeys";
  hcol.appendChild(htitle);

  for (const { name, action } of hotkeyLabels) {
    const row = document.createElement("div");
    row.className = "keyRemapRow";
    const label = document.createElement("div");
    label.className = "keyRemapLabel";
    label.innerHTML = name + ":";
    const btn = document.createElement("button");
    btn.className = "keyRemapBtn";
    btn.innerHTML = displayKey(getHotkey(action));
    btn.addEventListener("click", () => {
      if (listeningFor) {
        listeningFor.btn.classList.remove("listening");
        listeningFor.btn.innerHTML = listeningFor.hotkey
          ? displayKey(getHotkey(listeningFor.hotkey))
          : displayKey(getEffectiveKey(listeningFor.player, listeningFor.bit));
      }
      listeningFor = { hotkey: action, btn };
      btn.classList.add("listening");
      btn.innerHTML = "...";
    });
    row.appendChild(label);
    row.appendChild(btn);
    hcol.appendChild(row);
  }

  const hResetBtn = document.createElement("button");
  hResetBtn.className = "keyRemapBtn";
  hResetBtn.style.marginTop = "12px";
  hResetBtn.innerHTML = "Reset Hotkeys";
  hResetBtn.addEventListener("click", () => {
    if (customKeymaps.hotkeys) {
      delete customKeymaps.hotkeys;
      localStorage.setItem("customKeymaps", JSON.stringify(customKeymaps));
      buildKeyRemapUI();
      rebuildKeymapCache();
    }
  });
  hcol.appendChild(hResetBtn);
  content.appendChild(hcol);
}

document.addEventListener("keydown", (e) => {
  if (listeningFor) {
    e.preventDefault();
    const key = e.key.toLowerCase();
    if (key === "escape") {
      listeningFor.btn.classList.remove("listening");
      listeningFor.btn.innerHTML = listeningFor.hotkey
        ? displayKey(getHotkey(listeningFor.hotkey))
        : displayKey(getEffectiveKey(listeningFor.player, listeningFor.bit));
      listeningFor = null;
      return;
    }
    if (listeningFor.hotkey) {
      if (!customKeymaps.hotkeys) customKeymaps.hotkeys = {};
      customKeymaps.hotkeys[listeningFor.hotkey] = key;
      localStorage.setItem("customKeymaps", JSON.stringify(customKeymaps));
      listeningFor.btn.classList.remove("listening");
      listeningFor.btn.innerHTML = displayKey(key);
      listeningFor = null;
      rebuildKeymapCache();
      return;
    }
    const mapName = "p" + listeningFor.player;
    if (!customKeymaps[mapName]) customKeymaps[mapName] = {};
    customKeymaps[mapName][listeningFor.bit] = key;
    localStorage.setItem("customKeymaps", JSON.stringify(customKeymaps));
    listeningFor.btn.classList.remove("listening");
    listeningFor.btn.innerHTML = displayKey(key);
    listeningFor = null;
    rebuildKeymapCache();
    updateKeyboardDisplay();
    return;
  }
}, true); // capture phase so it fires before the game input handler

rebuildKeymapCache();

el("keyRemapButton").addEventListener("click", () => {
  rightUpBackCloseMenu = false;
  el("menuHeaderLeftMessageChild").innerHTML = "Back";
  el("squareButtonParentParent").style.display = "none";
  el("keyRemapSettings").style.display = "block";
  el("menuHeaderRightMessage").style.display = "block";
  el("menuHeaderLeftMessage").innerHTML = "Remap Inputs";
  buildKeyRemapUI();
});

const [ctx, imgData] = canvasSetup(el("output"));
const [fs_ctx, fs_imgData] = canvasSetup(fso);

Module.onRuntimeInitialized = async _ => {
  isModuleInitialized = true;
};

function requestFrame() {
  run1fr();
  requestAnimationFrame(requestFrame);
}

requestFrame();

let currentSpeed = parseInt(localStorage.getItem("emuSpeed") || "100");
let speedAccumulator = 0;

function run1fr() {
  if (isFullScreen) setFsoSize(fso, root);
  if (!isModuleInitialized) return;
  if (isMenuDisplay) return;

  speedAccumulator += currentSpeed / 100;
  // Cap accumulator to avoid runaway after long pauses (e.g. tab backgrounded)
  if (speedAccumulator > 10) speedAccumulator = currentSpeed / 100;

  let didRunFrame = false;
  while (speedAccumulator >= 1) {
    Module._setJoypadInput(keyInput | softPadInput | g.getHoldButton(0));
    Module._setJoypadInput2(keyInput2 | g.getHoldButton(1));
    Module._mainLoop();
    speedAccumulator -= 1;
    didRunFrame = true;
  }

  if (!didRunFrame) return;

  const frameBufferPtr = Module._getScreenBuffer();
  const frameBufferRawData = new Uint8ClampedArray(Module.HEAP8.buffer, frameBufferPtr, 256 * 224 * 4);
  if (isFullScreen) {
    fs_imgData.data.set(frameBufferRawData);
    fs_ctx.putImageData(fs_imgData, 0, 0);
  } else {
    imgData.data.set(frameBufferRawData);
    ctx.putImageData(imgData, 0, 0);
  }
}

function fileSave(data, fn) {
  let blob;
  if (typeof data == "string") {
    const byteString = atob(data.split(",")[1]);
    const content = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      content[i] = byteString.charCodeAt(i);
    }
    blob = new Blob([content]);
  } else {
    blob = new Blob([data]);
  }
  const link = document.createElement("a");
  link.href = window.URL.createObjectURL(blob);
  link.download = fn;
  link.click();
}

function saveSram() {
  Module._saveSramRequest();
  const sramSize = Module._getSaveSramSize();
  if (sramSize == 0) return;
  const sramPtr = Module._getSaveSram();
  const sram = new Uint8Array(new Uint8Array(Module.HEAP8.buffer, sramPtr, sramSize));
  Module._my_free(sramPtr);
  fileSave(sram, "save.srm");
}

function saveState() {
  const stateSize = Module._getStateSaveSize();
  const statePtr = Module._saveState();
  if (statePtr == 0) return;
  const state = new Uint8Array(new Uint8Array(Module.HEAP8.buffer, statePtr, stateSize));
  Module._my_free(statePtr);
  fileSave(state, romFr.fileName.replace(/\.[^.]+$/, "") + ".state");
}

el("reloadRomButton").addEventListener("click", async () => {
  if (!isModuleInitialized || !romFr.fileHandle) return;
  const buf = await romFr.fileHandle.arrayBuffer();
  romFr.fileData = new Uint8Array(buf);
  const romPtr = setUint8ArrayToCMemory(romFr.fileData);
  Module._startWithRom(romPtr, romFr.fileData.length, SAMPLE_RATE);
  Module._my_free(romPtr);
  exitMenu();
});

el("resetRomButton").addEventListener("click", () => {
  if (!isModuleInitialized || !romFr.fileData) return;
  const romPtr = setUint8ArrayToCMemory(romFr.fileData);
  Module._startWithRom(romPtr, romFr.fileData.length, SAMPLE_RATE);
  Module._my_free(romPtr);
  exitMenu();
});

el("volumeSlider").addEventListener("input", (e) => {
  if (gainNode) gainNode.gain.value = e.target.value / 100;
  localStorage.setItem("volume", e.target.value);
  el("volumeLabel").style.textDecoration = e.target.value == 0 ? "line-through" : "";
});

el("volumeLabel").addEventListener("click", () => {
  if (el("volumeSlider").value > 0) {
    premuteVolume = el("volumeSlider").value;
    el("volumeSlider").value = 0;
    el("volumeLabel").style.textDecoration = "line-through";
  } else {
    el("volumeSlider").value = premuteVolume;
    el("volumeLabel").style.textDecoration = "";
  }
  const vol = el("volumeSlider").value / 100;
  if (gainNode) gainNode.gain.value = vol;
  localStorage.setItem("volume", el("volumeSlider").value);
});

// Initialize speed slider state and wire handler
el("speedSlider").value = currentSpeed;
el("speedLabel").innerHTML = "Speed: " + currentSpeed + "%";

let _speedOsdTimer = null;

function setSpeed(value) {
  const slider = el("speedSlider");
  const min = parseInt(slider.min), max = parseInt(slider.max), step = parseInt(slider.step);
  currentSpeed = Math.max(min, Math.min(max, Math.round(value / step) * step));
  slider.value = currentSpeed;
  el("speedLabel").innerHTML = "Speed: " + currentSpeed + "%";
  localStorage.setItem("emuSpeed", currentSpeed);

  const osd = el("speedOsd");
  osd.innerHTML = currentSpeed + "%";
  osd.classList.add("visible");
  clearTimeout(_speedOsdTimer);
  _speedOsdTimer = setTimeout(() => osd.classList.remove("visible"), 1500);
}

el("speedSlider").addEventListener("input", (e) => {
  setSpeed(parseInt(e.target.value));
});

el("fullscreenToggle").addEventListener("click", () => {
  menuButtonFullScreen();
});

el("saveSramButton").addEventListener("click", () => {
  if (!isModuleInitialized) return;
  saveSram();
});

el("saveStateButton").addEventListener("click", () => {
  if (!isModuleInitialized) return;
  saveState();
});

el("aboutButton").addEventListener("click", () => {
  rightUpBackCloseMenu = false;
  el("menuHeaderLeftMessageChild").innerHTML = "Back";
  el("squareButtonParentParent").style.display = "none";
  el("aboutParent").style.display = "flex";
  el("menuHeaderRightMessage").style.display = "block";
  el("menuHeaderLeftMessage").innerHTML = "About Snes9x 2010 Wasm";
});

function applySettingsToGamePad() {
  if (g.gamepads[g.curGamepadIndex] === null) return;
  for (let i = 0; i < g.buttonRemappers[g.curGamepadIndex].length; i++) {
    g.buttonRemappers[g.curGamepadIndex][i] = -1;
  }
  for (let i = 0; i < g.axesRemappers[g.curGamepadIndex].length; i++) {
    g.axesRemappers[g.curGamepadIndex][i] = -1;
  }
  const selects = document.getElementsByClassName("buttonRemapSelect");
  for (let i = 0; i < selects.length; i++) {
    if (selects[i].value === 0) continue;
    if (selects[i].value - 1 < g.buttonRemappers[g.curGamepadIndex].length) {
      g.buttonRemappers[g.curGamepadIndex][selects[i].value - 1] = Number(selects[i].getAttribute("data-snes-button"));
    }
    const axisRemapTarget = selects[i].value - (1 + g.buttonRemappers[g.curGamepadIndex].length);
    if (axisRemapTarget > -1 && axisRemapTarget < g.axesRemappers[g.curGamepadIndex].length) {
      g.axesRemappers[g.curGamepadIndex][axisRemapTarget] = Number(selects[i].getAttribute("data-snes-button"));
    }
  }
  g.saveSettingsToDict();
  g.saveDictToLocalStorage();
}

function applyGamepadSettingsToUI() {
  const selects = document.getElementsByClassName("buttonRemapSelect");
  for (let i = 0; i < selects.length; i++) {
    selects[i].value = g.findValueForOption(Number(selects[i].getAttribute("data-snes-button")));
  }
}

function buttonRemapSelect(e) {
  g.findGamepads();
  const selectValue = e.target.value;
  // Check for duplicate values
  const selects = document.getElementsByClassName("buttonRemapSelect");
  for (let i = 0; i < selects.length; i++) {
    if (selects[i].getAttribute("data-snes-button") == e.target.getAttribute("data-snes-button")) continue;
    if (selectValue === selects[i].value) {
      e.target.value = 0;
    }
  }
  applySettingsToGamePad();
  applyGamepadSettingsToUI();
}

function createButtonRemapSelectParentParent() {
  g.findGamepads();
  if (!g.gamepads[g.curGamepadIndex]) {
    el("gamepadNameShow").innerHTML = "No controller connected";
    el("gamepadButtonSettingsButtonName").style.display = "none";
    el("buttonRemapSelectParentParent").style.display = "none";
    return;
  }
  g.setSettingsFromDict();
  el("gamepadButtonSettingsButtonName").style.display = "block";
  el("buttonRemapSelectParentParent").style.display = "block";
  el("gamepadNameShow").innerHTML = g.gamepads[g.curGamepadIndex].id;
  el("buttonRemapSelectParentParent").innerHTML = "";

  const snesButtonIDs = ["12", "13", "7", "15", "6", "14", "5", "4", "8", "9", "10", "11"];
  for (let i = 0; i < snesButtonIDs.length; i++) {
    const template = el("buttonRemapSelectParentTemplate").content.cloneNode(true);
    const select = template.querySelector(".buttonRemapSelect");
    select.setAttribute("data-snes-button", snesButtonIDs[i]);

    let option = document.createElement("option");
    option.setAttribute("value", "0");
    option.innerHTML = "None";
    select.insertBefore(option, null);

    let curValue = 1;
    for (let j = 0; j < g.gamepads[g.curGamepadIndex].buttons.length; j++) {
      option = document.createElement("option");
      option.setAttribute("value", String(curValue));
      option.innerHTML = "Button " + String(j);
      select.insertBefore(option, null);
      curValue++;
    }
    for (let j = 0; j < g.axesRemappers[g.curGamepadIndex].length; j++) {
      const curAxeIndex = Math.floor(j / 2);
      option = document.createElement("option");
      option.setAttribute("value", String(curValue));
      option.innerHTML = (j & 1) == 0
        ? "Axis " + String(curAxeIndex) + " +"
        : "Axis " + String(curAxeIndex) + " -";
      select.insertBefore(option, null);
      curValue++;
    }
    select.value = g.findValueForOption(Number(snesButtonIDs[i]));
    select.addEventListener("change", buttonRemapSelect);
    el("buttonRemapSelectParentParent").insertBefore(template, null);
  }
}

el("gamepadSettingsButton").addEventListener("click", () => {
  rightUpBackCloseMenu = false;
  el("menuHeaderLeftMessageChild").innerHTML = "Back";
  el("squareButtonParentParent").style.display = "none";
  el("gamepadSettings").style.display = "flex";
  el("menuHeaderRightMessage").style.display = "block";
  el("menuHeaderLeftMessage").innerHTML = "Gamepad Settings";
  if (g.gamepads.length === 0) {
    el("gamepadNameShow").innerHTML = "No controller connected";
    el("gamepadButtonSettingsButtonName").style.display = "none";
    el("buttonRemapSelectParentParent").style.display = "none";
    return;
  }
  createButtonRemapSelectParentParent();
});

el("gamepadPlayerToggle").addEventListener("click", () => {
  g.curGamepadIndex = g.curGamepadIndex === 0 ? 1 : 0;
  el("gamepadPlayerToggle").innerHTML = "Configure: Player " + (g.curGamepadIndex + 1);
  g.findGamepads();
  g.setSettingsFromDict();
  createButtonRemapSelectParentParent();
});

el("menuHeaderLeftMessageChild").addEventListener("click", () => {
  if (rightUpBackCloseMenu) {
    exitMenu();
    return;
  }
  el("aboutParent").style.display = "none";
  el("gamepadSettings").style.display = "none";
  el("keyRemapSettings").style.display = "none";
  el("squareButtonParentParent").style.display = "grid";
  el("menuHeaderLeftMessage").innerHTML = "Snes9x 2010 Wasm Menu" + (romFr.fileName ? "<span id=\"menuRomName\"> — " + romFr.fileName.replace(/\.[^.]+$/, "") + "</span>" : "<span id=\"menuRomName\"></span>");
  el("menuHeaderLeftMessageChild").innerHTML = "Close";
  rightUpBackCloseMenu = true;
});

function menuOpen() {
  el("menu").style.display = "flex";
  isMenuDisplay = true;
}

el("menuOpen1").addEventListener("click", menuOpen);
el("menuOpen2").addEventListener("click", menuOpen);
el("menuOpen3").addEventListener("click", menuOpen);

function padButtonMousedown(e) {
  let target = e.target;
  while (!target.getAttribute("data-snes-button")) target = e.target.parentNode;
  softPadInput |= (1 << Number(target.getAttribute("data-snes-button")));
}

function padButtonMouseup(e) {
  let target = e.target;
  while (!target.getAttribute("data-snes-button")) target = e.target.parentNode;
  softPadInput &= (0xFFFFFFFF ^ (1 << Number(target.getAttribute("data-snes-button"))));
}

const buttonIDs = ["AButton", "BButton", "XButton", "YButton", "LButton", "RButton", "STButton", "SEButton", "DRButton", "DLButton", "DDButton", "DUButton"];

buttonIDs.forEach((buttonID) => {
  el(buttonID).addEventListener("mousedown", padButtonMousedown);
  el(buttonID).addEventListener("touchstart", padButtonMousedown);
  el(buttonID).addEventListener("mouseup", padButtonMouseup);
  el(buttonID).addEventListener("mouseleave", padButtonMouseup);
  el(buttonID).addEventListener("touchend", padButtonMouseup);
});
