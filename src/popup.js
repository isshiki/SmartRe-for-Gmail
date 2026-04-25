"use strict";

const DEFAULT_SETTINGS = {
  adjustQuoteStyleEnabled: true,
  rewriteHeaderEnabled: true
};

const SETTING_IDS = Object.keys(DEFAULT_SETTINGS);

const $ = (selector) => document.querySelector(selector);

function t(key, fallback = key) {
  try {
    return chrome.i18n.getMessage(key) || fallback;
  } catch (error) {
    return fallback;
  }
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.getAttribute("data-i18n");
    element.textContent = t(key, element.textContent);
  });
}

function applyVersion() {
  const versionElement = $("[data-version]");
  if (!versionElement) return;

  const version = chrome.runtime?.getManifest?.().version;
  versionElement.textContent = version ? `v${version}` : "";
}

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
      if (chrome.runtime.lastError) {
        resolve({ ...DEFAULT_SETTINGS });
        return;
      }

      resolve({ ...DEFAULT_SETTINGS, ...(result || {}) });
    });
  });
}

function saveSetting(key, value) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [key]: value }, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

function setStatus(messageKey, ok = true) {
  const status = $("#status");
  if (!status) return;

  status.textContent = t(messageKey);
  status.classList.toggle("is-error", !ok);

  window.clearTimeout(setStatus.timerId);
  setStatus.timerId = window.setTimeout(() => {
    status.textContent = "";
    status.classList.remove("is-error");
  }, 2400);
}

async function init() {
  applyI18n();
  applyVersion();

  const settings = await loadSettings();

  SETTING_IDS.forEach((id) => {
    const input = $(`#${id}`);
    if (!input) return;

    input.checked = Boolean(settings[id]);
    input.addEventListener("change", async () => {
      const saved = await saveSetting(id, input.checked);
      setStatus(saved ? "settingsSaved" : "settingsSaveFailed", saved);
    });
  });
}

document.addEventListener("DOMContentLoaded", init);
