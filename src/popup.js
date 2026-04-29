"use strict";

const DEFAULT_SETTINGS = {
  removeQuoteEnabled: false,
  adjustQuoteStyleEnabled: true,
  rewriteHeaderEnabled: true
};

const SETTING_IDS = Object.keys(DEFAULT_SETTINGS);
const QUOTE_REMOVAL_DEPENDENTS = ["adjustQuoteStyleEnabled", "rewriteHeaderEnabled"];

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

function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

function renderSettings(settings) {
  SETTING_IDS.forEach((id) => {
    const input = $(`#${id}`);
    if (!input) return;

    input.checked = Boolean(settings[id]);
  });

  const quoteRemovalEnabled = Boolean(settings.removeQuoteEnabled);

  QUOTE_REMOVAL_DEPENDENTS.forEach((id) => {
    const input = $(`#${id}`);
    if (!input) return;

    const row = input.closest(".switch-row");
    input.disabled = quoteRemovalEnabled;
    row?.classList.toggle("is-disabled", quoteRemovalEnabled);
    row?.setAttribute("aria-disabled", quoteRemovalEnabled ? "true" : "false");
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

  let settings = await loadSettings();
  renderSettings(settings);

  SETTING_IDS.forEach((id) => {
    const input = $(`#${id}`);
    if (!input) return;

    input.addEventListener("change", async () => {
      settings = {
        ...settings,
        [id]: input.checked
      };
      const saved = await saveSettings({ [id]: input.checked });

      renderSettings(settings);
      setStatus(saved ? "settingsSaved" : "settingsSaveFailed", saved);
    });
  });
}

document.addEventListener("DOMContentLoaded", init);
