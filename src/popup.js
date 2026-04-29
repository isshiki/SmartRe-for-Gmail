"use strict";

const DEFAULT_REPLY_HEADER_TEMPLATE = [
  "---------- Original message ---------",
  "From: $from",
  "Date: $date",
  "Subject: $subject",
  "To: $to"
].join("\n");

const DEFAULT_SETTINGS = {
  removeQuoteEnabled: false,
  adjustQuoteStyleEnabled: true,
  rewriteHeaderEnabled: true,
  replyHeaderTemplate: DEFAULT_REPLY_HEADER_TEMPLATE
};

const SWITCH_SETTING_IDS = ["removeQuoteEnabled", "adjustQuoteStyleEnabled", "rewriteHeaderEnabled"];
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

  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    const key = element.getAttribute("data-i18n-aria-label");
    element.setAttribute("aria-label", t(key, element.getAttribute("aria-label") || ""));
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

function normalizeSettings(settings) {
  const normalized = { ...DEFAULT_SETTINGS, ...(settings || {}) };

  if (typeof normalized.replyHeaderTemplate !== "string") {
    normalized.replyHeaderTemplate = DEFAULT_REPLY_HEADER_TEMPLATE;
  }

  return normalized;
}

function renderSettings(settings) {
  SWITCH_SETTING_IDS.forEach((id) => {
    const input = $(`#${id}`);
    if (!input) return;

    input.checked = Boolean(settings[id]);
  });

  const quoteRemovalEnabled = Boolean(settings.removeQuoteEnabled);
  const templateDisabled = quoteRemovalEnabled || !settings.rewriteHeaderEnabled;
  const templateTextarea = $("#replyHeaderTemplate");
  const resetButton = $("#resetHeaderTemplate");
  const templateSettings = $("[data-template-settings]");

  if (templateTextarea) {
    templateTextarea.value = settings.replyHeaderTemplate;
    templateTextarea.disabled = templateDisabled;
  }

  if (resetButton) {
    resetButton.disabled = templateDisabled;
  }

  templateSettings?.classList.toggle("is-disabled", templateDisabled);
  templateSettings?.setAttribute("aria-disabled", templateDisabled ? "true" : "false");

  QUOTE_REMOVAL_DEPENDENTS.forEach((id) => {
    const input = $(`#${id}`);
    if (!input) return;

    const row = input.closest(".switch-row");
    input.disabled = quoteRemovalEnabled;
    row?.classList.toggle("is-disabled", quoteRemovalEnabled);
    row?.setAttribute("aria-disabled", quoteRemovalEnabled ? "true" : "false");
  });
}

function setupTemplateHelp() {
  const button = $("#templateHelpButton");
  const help = $("#templateHelp");
  if (!button || !help) return;

  button.addEventListener("click", () => {
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", expanded ? "false" : "true");
    help.hidden = expanded;
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
  setupTemplateHelp();

  let settings = normalizeSettings(await loadSettings());
  renderSettings(settings);

  SWITCH_SETTING_IDS.forEach((id) => {
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

  const templateTextarea = $("#replyHeaderTemplate");
  const resetButton = $("#resetHeaderTemplate");

  templateTextarea?.addEventListener("input", async () => {
    settings = {
      ...settings,
      replyHeaderTemplate: templateTextarea.value
    };

    const saved = await saveSettings({ replyHeaderTemplate: templateTextarea.value });
    setStatus(saved ? "settingsSaved" : "settingsSaveFailed", saved);
  });

  resetButton?.addEventListener("click", async () => {
    settings = {
      ...settings,
      replyHeaderTemplate: DEFAULT_REPLY_HEADER_TEMPLATE
    };
    renderSettings(settings);

    const saved = await saveSettings({ replyHeaderTemplate: DEFAULT_REPLY_HEADER_TEMPLATE });
    setStatus(saved ? "settingsSaved" : "settingsSaveFailed", saved);
  });
}

document.addEventListener("DOMContentLoaded", init);
