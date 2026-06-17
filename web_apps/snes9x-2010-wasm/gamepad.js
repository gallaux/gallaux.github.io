const DPAD_UP = 0;
const DPAD_DOWN = 1;
const DPAD_LEFT = 2;
const DPAD_RIGHT = 3;

const sortCompFunc = (a, b) => a - b;

function buttonHold(button) {
  if (typeof button == "object") {
    return button.pressed;
  }
  return button == 1.0;
}

function dpad(value) {
  // return [X, Y];
  if (value > 3) return [0, 0];
  if (value < -0.95) return [0, -1];                  // Up
  if (value < -0.7 && value > -0.72) return [1, -1];  // Up-Right
  if (value < -0.4 && value > -0.45) return [1, 0];   // Right
  if (value < -0.1 && value > -0.2) return [1, 1];    // Down-Right
  if (value < 0.2 && value > 0.1) return [0, 1];      // Down
  if (value < 0.43 && value > 0.42) return [-1, 1];   // Down-Left
  if (value < 0.72 && value > 0.70) return [-1, 0];   // Left
  if (value > 0.95) return [-1, -1];                  // Up-Left
  return [0, 0];
}

class gamepad {
  constructor() {
    this.gamepadConnectedHandler = null;
    this.curGamepadIndex = 0; // slot currently being configured in the remap UI
    this.gamepads = [];
    this.buttonRemappers = [];
    this.axisBehaveDpad = []; // Index of d-pads disguised as analog sticks
    this.axesRemappers = [];
    window.addEventListener("gamepadconnected", (e) => {
      this.gamepadConnected(e);
    });
    this.loadSettingsToDictFromLocalStorage();
  }

  gamepadConnected(e) {
    if (e.gamepad.index + 1 > this.gamepads.length) {
      this.gamepads.length = e.gamepad.id + 1;
      this.buttonRemappers.length = e.gamepad.id + 1;
      this.axisBehaveDpad.length = e.gamepad.id + 1;
    }
    this.gamepads[e.gamepad.index] = e.gamepad;
    this.buttonRemappers[e.gamepad.index] = [];
    this.axisBehaveDpad[e.gamepad.index] = [];
    this.axesRemappers[e.gamepad.index] = [];
    for (let i = 0; i < e.gamepad.buttons.length; i++) {
      this.buttonRemappers[e.gamepad.index].push(-1);
    }
    this.checkAxisBehaveDpad(e.gamepad.axes, this.axisBehaveDpad[e.gamepad.index]);
    for (let i = 0; i < (e.gamepad.buttons.length + this.axisBehaveDpad[e.gamepad.index].length) * 2; i++) {
      this.axesRemappers[e.gamepad.index].push(-1);
    }
    this.setSettingsFromDict(e.gamepad.index);
    if (this.gamepadConnectedHandler) this.gamepadConnectedHandler();
  }

  findGamepads() {
    this.gamepads = navigator.getGamepads();
    if (this.curGamepadIndex >= this.gamepads.length || !this.gamepads[0] || !this.gamepads[this.curGamepadIndex] || !this.gamepads[this.curGamepadIndex].connected) return;
    this.checkAxisBehaveDpad(this.gamepads[this.curGamepadIndex].axes, this.axisBehaveDpad[this.curGamepadIndex]);
    if ((this.axisBehaveDpad[this.curGamepadIndex].length + this.gamepads[this.curGamepadIndex].axes.length) * 2 > this.axesRemappers[this.curGamepadIndex].length) {
      while ((this.axisBehaveDpad[this.curGamepadIndex].length + this.gamepads[this.curGamepadIndex].axes.length) * 2 == this.axesRemappers[this.curGamepadIndex].length) {
        this.axesRemappers[this.curGamepadIndex].push(-1);
      }
    }
  }

  findValueForOption(snesButton) {
    if (!this.buttonRemappers[this.curGamepadIndex]) return 0;
    for (let i = 0; i < this.buttonRemappers[this.curGamepadIndex].length; i++) {
      if (this.buttonRemappers[this.curGamepadIndex][i] === snesButton) return 1 + i;
    }
    for (let i = 0; i < this.axesRemappers[this.curGamepadIndex].length; i++) {
      if (this.axesRemappers[this.curGamepadIndex][i] === snesButton) return 1 + i + this.buttonRemappers[this.curGamepadIndex].length;
    }
    return 0;
  }

  // Read a specific gamepad slot's button state (default: P1 slot 0).
  getHoldButton(slot = 0) {
    this.gamepads = navigator.getGamepads();
    if (slot >= this.gamepads.length || !this.gamepads[slot] || !this.gamepads[slot].connected) return 0;
    if (!this.buttonRemappers[slot]) return 0;
    let dest = 0;
    this.checkAxisBehaveDpad(this.gamepads[slot].axes, this.axisBehaveDpad[slot]);
    for (let i = 0; i < this.gamepads[slot].buttons.length; i++) {
      if (this.buttonRemappers[slot][i] < 0) continue;
      if (buttonHold(this.gamepads[slot].buttons[i])) {
        dest |= (1 << this.buttonRemappers[slot][i]);
      }
    }
    const realAxes = [];
    for (let i = 0; i < this.gamepads[slot].axes.length; i++) {
      if (this.axisBehaveDpad[slot].includes(i)) continue;
      realAxes.push(this.gamepads[slot].axes[i]);
    }
    for (let i = 0; i < this.axisBehaveDpad[slot].length; i++) {
      const val = dpad(this.gamepads[slot].axes[this.axisBehaveDpad[slot][i]]);
      realAxes.push(val[0]);
      realAxes.push(val[1]);
    }
    if (realAxes.length * 2 > this.axesRemappers[slot].length) {
      while (realAxes.length * 2 == this.axesRemappers[slot].length) {
        this.axesRemappers[slot].push(-1);
      }
    }
    for (let i = 0; i < realAxes.length; i++) {
      if (this.axesRemappers[slot][i * 2] > -1) {
        if (realAxes[i] > 0.75) dest |= (1 << this.axesRemappers[slot][i * 2]);
      }
      if (this.axesRemappers[slot][i * 2 + 1] > -1) {
        if (realAxes[i] < -0.75) dest |= (1 << this.axesRemappers[slot][i * 2 + 1]);
      }
    }
    return dest;
  }

  checkAxisBehaveDpad(axis, axisBehaveDpad) {
    for (let i = 0; i < axis.length; i++) {
      if (axis[i] < 3) continue; // Not a DPAD
      if (!axisBehaveDpad.includes(i)) axisBehaveDpad.push(i);
    }
    axisBehaveDpad.sort(sortCompFunc);
  }

  loadSettingsToDictFromLocalStorage() {
    this.dict = { version: 0, gamepads: {} };
    const dictBase64 = localStorage.getItem("gamepad_settings");
    if (!dictBase64) return;
    const dictJsonRaw = atob(dictBase64);
    let dictTmp = null;
    try {
      dictTmp = JSON.parse(dictJsonRaw);
    } catch {
      return;
    }
    if (dictTmp.version !== 0 || dictTmp.gamepads === undefined) return;
    this.dict = dictTmp;
  }

  setSettingsFromDict(slot = this.curGamepadIndex) {
    if (this.gamepads.length === 0 || !this.gamepads[slot] || !this.gamepads[slot].id) return;
    const gamepadDict = this.dict.gamepads[this.gamepads[slot].id];
    if (!gamepadDict) return;
    const buttonRemapDict = gamepadDict.button_remappers;
    if (buttonRemapDict !== undefined) {
      for (let i = 0; i < buttonRemapDict.length; i++) {
        if (i >= this.buttonRemappers[slot].length) return;
        this.buttonRemappers[slot][i] = isNaN(buttonRemapDict[i]) ? -1 : buttonRemapDict[i];
      }
    }
    const axesRemapDict = gamepadDict.axes_remappers;
    if (axesRemapDict !== undefined) {
      for (let i = 0; i < axesRemapDict.length; i++) {
        if (i >= this.axesRemappers[slot].length) return;
        this.axesRemappers[slot][i] = isNaN(axesRemapDict[i]) ? -1 : axesRemapDict[i];
      }
    }
  }

  saveSettingsToDict() {
    if (this.gamepads.length === 0 || !this.gamepads[this.curGamepadIndex] || !this.gamepads[this.curGamepadIndex].id) return;
    const gamepadDict = {
      button_remappers: [],
      axes_remappers: []
    };
    for (let i = 0; i < this.buttonRemappers[this.curGamepadIndex].length; i++) {
      gamepadDict.button_remappers.push(this.buttonRemappers[this.curGamepadIndex][i]);
    }
    for (let i = 0; i < this.axesRemappers[this.curGamepadIndex].length; i++) {
      gamepadDict.axes_remappers.push(this.axesRemappers[this.curGamepadIndex][i]);
    }
    this.dict.gamepads[this.gamepads[this.curGamepadIndex].id] = gamepadDict;
  }

  saveDictToLocalStorage() {
    localStorage.setItem("gamepad_settings", btoa(JSON.stringify(this.dict)));
  }
}
