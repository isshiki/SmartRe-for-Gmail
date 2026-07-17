"use strict";

const OLD_DEFAULT_REPLY_HEADER_TEMPLATE = [
  "---------- Original message ---------",
  "From: $from",
  "Date: $date",
  "Subject: $subject",
  "To: $to"
].join("\n");

const DEFAULT_REPLY_HEADER_TEMPLATE = [
  "---------- Original message ---------",
  "From: $from",
  "Date: $date",
  "Subject: $subject",
  "To: $to",
  "Cc: $cc"
].join("\n");

const DEFAULT_SETTINGS = {
  removeQuoteEnabled: false,
  adjustQuoteStyleEnabled: true,
  rewriteHeaderEnabled: true,
  replyHeaderTemplate: DEFAULT_REPLY_HEADER_TEMPLATE,
  replyHeaderTemplateMigrationVersion: 0
};

const REPLY_HEADER_TEMPLATE_MIGRATION_VERSION = 1;
const SWITCH_SETTING_IDS = ["removeQuoteEnabled", "adjustQuoteStyleEnabled", "rewriteHeaderEnabled"];
const QUOTE_REMOVAL_DEPENDENTS = ["adjustQuoteStyleEnabled", "rewriteHeaderEnabled"];
const CC_TEMPLATE_VARIABLE_PATTERN = /\$(ccName|ccEmail|cc)(?![A-Za-z0-9_])/;
const TO_HEADER_TEMPLATE_LINE_PATTERN = /^\s*(to|宛先)\s*(?:[:：]|\s)\s*.*\$(toName|toEmail|to)(?![A-Za-z0-9_])/i;
const CC_HEADER_TEMPLATE_LINE_PATTERN = /^\s*cc\s*(?:[:：]|\s)/i;

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
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

function migrateReplyHeaderTemplate(template) {
  if (typeof template !== "string") {
    return { template: DEFAULT_REPLY_HEADER_TEMPLATE, changed: true };
  }

  const normalized = template
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  if (normalized === OLD_DEFAULT_REPLY_HEADER_TEMPLATE) {
    return { template: DEFAULT_REPLY_HEADER_TEMPLATE, changed: true };
  }

  if (
    CC_TEMPLATE_VARIABLE_PATTERN.test(normalized) ||
    normalized.split("\n").some((line) => CC_HEADER_TEMPLATE_LINE_PATTERN.test(line))
  ) {
    return { template: normalized, changed: normalized !== template };
  }

  const lines = normalized.split("\n");
  const toLineIndex = lines.findIndex((line) => TO_HEADER_TEMPLATE_LINE_PATTERN.test(line));
  if (toLineIndex === -1) {
    return { template: normalized, changed: normalized !== template };
  }

  lines.splice(toLineIndex + 1, 0, "Cc: $cc");
  return { template: lines.join("\n"), changed: true };
}

function migrateSettings(settings) {
  const normalized = normalizeSettings(settings);
  const migrationVersion = Number(normalized.replyHeaderTemplateMigrationVersion || 0);
  if (migrationVersion >= REPLY_HEADER_TEMPLATE_MIGRATION_VERSION) {
    return { settings: normalized, updates: null };
  }

  const migrated = migrateReplyHeaderTemplate(normalized.replyHeaderTemplate);
  const updates = {
    replyHeaderTemplateMigrationVersion: REPLY_HEADER_TEMPLATE_MIGRATION_VERSION
  };

  if (migrated.changed) {
    updates.replyHeaderTemplate = migrated.template;
  }

  return {
    settings: {
      ...normalized,
      replyHeaderTemplate: migrated.template,
      replyHeaderTemplateMigrationVersion: REPLY_HEADER_TEMPLATE_MIGRATION_VERSION
    },
    updates
  };
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

  const migrated = migrateSettings(await loadSettings());
  let settings = migrated.settings;
  if (migrated.updates) {
    await saveSettings(migrated.updates);
  }

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
      replyHeaderTemplate: templateTextarea.value,
      replyHeaderTemplateMigrationVersion: REPLY_HEADER_TEMPLATE_MIGRATION_VERSION
    };

    const saved = await saveSettings({
      replyHeaderTemplate: templateTextarea.value,
      replyHeaderTemplateMigrationVersion: REPLY_HEADER_TEMPLATE_MIGRATION_VERSION
    });
    setStatus(saved ? "settingsSaved" : "settingsSaveFailed", saved);
  });

  resetButton?.addEventListener("click", async () => {
    settings = {
      ...settings,
      replyHeaderTemplate: DEFAULT_REPLY_HEADER_TEMPLATE,
      replyHeaderTemplateMigrationVersion: REPLY_HEADER_TEMPLATE_MIGRATION_VERSION
    };
    renderSettings(settings);

    const saved = await saveSettings({
      replyHeaderTemplate: DEFAULT_REPLY_HEADER_TEMPLATE,
      replyHeaderTemplateMigrationVersion: REPLY_HEADER_TEMPLATE_MIGRATION_VERSION
    });
    setStatus(saved ? "settingsSaved" : "settingsSaveFailed", saved);
  });
}

document.addEventListener("DOMContentLoaded", init);
