globalThis.chrome = globalThis.browser ? globalThis.browser : globalThis.chrome;

const api = globalThis.chrome;

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

const SETTINGS_DEFAULTS = {
  removeQuoteEnabled: false,
  adjustQuoteStyleEnabled: true,
  rewriteHeaderEnabled: true,
  replyHeaderTemplate: DEFAULT_REPLY_HEADER_TEMPLATE,
  replyHeaderTemplateMigrationVersion: 0
};

const REPLY_HEADER_TEMPLATE_MIGRATION_VERSION = 1;
const TEMPLATE_VARIABLE_PATTERN = /\$(fromName|fromEmail|from|toName|toEmail|to|ccName|ccEmail|cc|date|subject)(?![A-Za-z0-9_])/g;
const CC_TEMPLATE_VARIABLE_PATTERN = /\$(ccName|ccEmail|cc)(?![A-Za-z0-9_])/;
const TO_HEADER_TEMPLATE_LINE_PATTERN = /^\s*(to|宛先)\s*(?:[:：]|\s)\s*.*\$(toName|toEmail|to)(?![A-Za-z0-9_])/i;
const CC_HEADER_TEMPLATE_LINE_PATTERN = /^\s*cc\s*(?:[:：]|\s)/i;
const REPLY_ACTION_TEXT_PATTERN = /\breply\b|\bantworten\b|\bresponder\b|répondre|rispondi|beantwoorden|odpowiedz|yanıtla|yanitla|balas|trả lời|tra loi|ответить|відповісти|odpovědět|odpovedet|odpovedať|odpovedat|返信|回复|回覆|답장|ตอบ|जवाब दें|उत्तर दें|رد/i;
const FORWARD_ACTION_TEXT_PATTERN = /\bforward\b|\breenviar\b|weiterleit|transférer|transferer|encaminhar|inoltra|doorsturen|prześlij|przeslij|przekaż|przekaz|yönlendir|yonlendir|ilet|teruskan|chuyển tiếp|chuyen tiep|переслать|переслати|ส่งต่อ|अग्रेषित|फ़ॉरवर्ड|फॉरवर्ड|फ़ॉरवर्ड|إعادة توجيه|転送|转发|轉發|转寄|轉寄|전달/i;
const NON_REPLY_ACTION_TEXT_PATTERN = /suggested|suggestion|vorgeschlagene|sugerid[ao]s?|suggér|suggerit|sugerowana|voorgesteld|önerilen|onerilen|disarankan|đề xuất|de xuat|gợi ý|goi y|рекоменд|предлож|запропон|แนะนำ|सुझाया|مقترح|候補|おすすめ|建议|建議|추천|제안/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;
const MAILBOX_PATTERN = /(?:"?([^"<,;]+?)"?\s*)?<([^<>@\s]+@[^<>\s]+)>/ig;
const DETAIL_HEADER_LABELS = {
  from: new Set([
    "from", "差出人", "von", "de", "àpartirde", "da", "van", "od", "gönderen",
    "dari", "từ", "от", "від", "发件人", "寄件者", "보낸사람", "จาก", "से", "من"
  ]),
  replyTo: new Set([
    "replyto", "返信先", "antwortan", "respondera", "répondreà", "rispondia",
    "antwoordenop", "odpowiedzdo", "yanıt", "balaske", "trảlời", "ответить",
    "відповісти", "回复", "回覆至", "回覆", "답장", "ตอบกลับถึง", "जवाबदें", "ردعلى"
  ]),
  to: new Set([
    "to", "宛先", "an", "para", "à", "a", "aan", "do", "alıcı", "kepada",
    "tới", "кому", "收件人", "收件者", "받는사람", "ถึง", "इन्हेंभेजें", "إلى"
  ]),
  cc: new Set(["cc"]),
  date: new Set([
    "date", "日付", "datum", "fecha", "data", "ngày", "дата", "日期",
    "날짜", "วันที่", "तारीख", "التاريخ"
  ]),
  subject: new Set([
    "subject", "件名", "betreff", "asunto", "objet", "assunto", "oggetto",
    "onderwerp", "temat", "konu", "subjek", "tiêuđề", "тема", "主题",
    "主旨", "제목", "เรื่อง", "विषय", "الموضوع"
  ])
};

const TIMEOUT_SEC = 5;
const TRIM_CLICK_DELAY_MS = 700;
const DEBUG = isDebugEnabled();
const INITIALIZED_FLAG = "__smartreContentScriptInitialized";
const ACTION_CANDIDATE_SELECTOR = [
  "[role='button']",
  "[role='menuitem']",
  "[role='menuitemradio']",
  "[role='menuitemcheckbox']",
  "button",
  "[aria-label]",
  "[data-tooltip]",
  "[title]",
  ".J-N",
  ".J-N-Jz",
  ".pYTkkf-JX-I",
  "span.ams"
].join(", ");

const SELECTORS = {
  // Gmail返信ボタン。英語UI/日本語UI/内部クラスの候補をまとめて監視する。
  replyButtons: [
    "div[data-tooltip='Reply']",
    "div[data-tooltip*='Reply']",
    "div[data-tooltip*='Antwort']",
    "button[aria-label='Reply']",
    "button[aria-label*='Reply']",
    "button[aria-label*='Antwort']",
    "div[aria-label='Reply']",
    "div[aria-label*='Reply']",
    "div[aria-label*='Antwort']",
    "button[aria-label='返信']",
    "button[aria-label*='返信']",
    "div[data-tooltip*='返信']",
    "div[aria-label*='返信']",
    "span.ams.bkH",
    "span.ams.bkI"
  ],

  // Gmail返信下部の操作領域。直近の返信ドラフトを探す補助に使う。
  draftFooter: "div.gA.gt",

  // Gmailの「...」引用展開ボタン。クリック後に引用DOMが生成される。
  trimButton: "div.ajR",

  // Gmail返信内の引用ブロック。削除せずスタイルだけ整える。
  quote: "blockquote.gmail_quote",

  // Gmail返信内の引用コンテナ。引用削除モードではこの最小単位を優先して削除する。
  quoteContainer: "div.gmail_quote.gmail_quote_container",

  // Gmail返信内の1行ヘッダ。Outlook風の複数行ヘッダへ書き換える。
  header: "div.gmail_attr",

  // Gmailスレッド画面の件名。
  subject: "h2.hP",

  // Gmail返信の本文エディタ。プレーンテキストモードでは引用もここに直接入る。
  messageBody: "div[role='textbox'][contenteditable='true']",

  // Gmailスレッド内の元メール本体。元メールのTo欄を読む補助に使う。
  messageRoot: "div.adn, div[role='listitem']",

  // Gmail返信作成欄のTo/Cc入力エリア。返信先の複数宛先を読む補助に使う。
  composeRecipientContainers: "[name='to'], [name='cc']",

  // Gmail元メールヘッダの詳細表示ボタン。元メールのTo/Ccを正確に読む補助に使う。
  originalDetailButton: [
    "td.ady div.ajy[role='button']",
    "td.ady div.ajy[aria-haspopup='true']",
    "div.ajy[role='button'][aria-haspopup='true']",
    "div.ajy[aria-label='Show details']",
    "div.ajy[aria-label='詳細を表示']",
    "div.ajy[data-tooltip='Show details']",
    "div.ajy[data-tooltip='詳細を表示']"
  ].join(", "),

  // Gmail元メールヘッダの詳細表示テーブル。
  originalDetailTable: "div.ajA table.ajC"
};

function isDebugEnabled() {
  try {
    return localStorage.getItem("smartreDebug") === "true";
  } catch (error) {
    return false;
  }
}

function debugLog(message, data) {
  if (!DEBUG) return;
  if (data === undefined) {
    console.debug(`[SmartRe] ${message}`);
    return;
  }
  console.debug(`[SmartRe] ${message}`, data);
}

function debugWarn(message, data) {
  if (!DEBUG) return;
  if (data === undefined) {
    console.warn(`[SmartRe] ${message}`);
    return;
  }
  console.warn(`[SmartRe] ${message}`, data);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLastElement(selector, targetNode = document) {
  return Array.from(targetNode.querySelectorAll(selector)).pop();
}

function getFirstElement(selector, targetNode = document) {
  return targetNode.querySelector(selector);
}

function snapshotElements(selector, targetNode = document) {
  return new WeakSet(Array.from(targetNode.querySelectorAll(selector)));
}

function getLastNewElement(selector, knownElements, targetNode = document) {
  const elements = Array.from(targetNode.querySelectorAll(selector));

  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (!knownElements?.has(element)) {
      return element;
    }
  }

  return null;
}

function waitForElement(selector, timeoutSec, { targetNode = document, last = true } = {}) {
  return new Promise((resolve) => {
    const getElement = last ? getLastElement : getFirstElement;
    const element = getElement(selector, targetNode);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const found = getElement(selector, targetNode);
      if (!found) return;

      clearTimeout(timeoutId);
      observer.disconnect();
      resolve(found);
    });

    const timeoutId = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutSec * 1000);

    observer.observe(targetNode, { childList: true, subtree: true });
  });
}

function waitForNewElement(selector, timeoutSec, knownElements, { targetNode = document } = {}) {
  return new Promise((resolve) => {
    const element = getLastNewElement(selector, knownElements, targetNode);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const found = getLastNewElement(selector, knownElements, targetNode);
      if (!found) return;

      clearTimeout(timeoutId);
      observer.disconnect();
      resolve(found);
    });

    const timeoutId = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutSec * 1000);

    observer.observe(targetNode, { childList: true, subtree: true });
  });
}

function getFocusedMessageBody() {
  const activeElement = document.activeElement;
  return activeElement instanceof Element && activeElement.matches(SELECTORS.messageBody)
    ? activeElement
    : null;
}

function getExistingFormatTarget(composeRoot) {
  const richTextTarget = composeRoot.querySelector(`${SELECTORS.quoteContainer}, ${SELECTORS.quote}, ${SELECTORS.header}`);
  if (richTextTarget) {
    return richTextTarget;
  }

  return getMessageBodies(composeRoot).find((body) => (
    !body.querySelector(`${SELECTORS.quoteContainer}, ${SELECTORS.header}, ${SELECTORS.quote}`) &&
    findPlainTextReplyHeader(getPlainTextBodyLines(body))
  )) || null;
}

function waitForFormatTarget(composeRoot, timeoutSec) {
  return new Promise((resolve) => {
    const existingTarget = getExistingFormatTarget(composeRoot);
    if (existingTarget) {
      resolve(existingTarget);
      return;
    }

    const observer = new MutationObserver(() => {
      const found = getExistingFormatTarget(composeRoot);
      if (!found) return;

      clearTimeout(timeoutId);
      observer.disconnect();
      resolve(found);
    });

    const timeoutId = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutSec * 1000);

    observer.observe(composeRoot, { childList: true, characterData: true, subtree: true });
  });
}

function clickElement(element) {
  if (!element) return;

  ["mousedown", "mouseup", "click"].forEach((type) => {
    element.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  });
}

function dispatchEscapeKey() {
  const target = document.activeElement instanceof Element ? document.activeElement : document.body;
  const dispatchTo = (receiver, type) => {
    receiver.dispatchEvent(new KeyboardEvent(type, {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true
    }));
  };

  ["keydown", "keyup"].forEach((type) => {
    dispatchTo(target, type);
    dispatchTo(document, type);
  });
}

function storageGet(defaults) {
  if (!api?.storage?.sync) {
    return Promise.resolve({ ...defaults });
  }

  if (globalThis.browser?.storage?.sync) {
    return api.storage.sync.get(defaults)
      .then((result) => ({ ...defaults, ...(result || {}) }))
      .catch(() => ({ ...defaults }));
  }

  return new Promise((resolve) => {
    api.storage.sync.get(defaults, (result) => {
      if (api.runtime?.lastError) {
        resolve({ ...defaults });
        return;
      }

      resolve({ ...defaults, ...(result || {}) });
    });
  });
}

function storageSet(settings) {
  if (!api?.storage?.sync) {
    return Promise.resolve(false);
  }

  if (globalThis.browser?.storage?.sync) {
    return api.storage.sync.set(settings)
      .then(() => true)
      .catch(() => false);
  }

  return new Promise((resolve) => {
    api.storage.sync.set(settings, () => {
      resolve(!api.runtime?.lastError);
    });
  });
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
  const migrationVersion = Number(settings.replyHeaderTemplateMigrationVersion || 0);
  if (migrationVersion >= REPLY_HEADER_TEMPLATE_MIGRATION_VERSION) {
    return { settings, updates: null };
  }

  const migrated = migrateReplyHeaderTemplate(settings.replyHeaderTemplate);
  const updates = {
    replyHeaderTemplateMigrationVersion: REPLY_HEADER_TEMPLATE_MIGRATION_VERSION
  };

  if (migrated.changed) {
    updates.replyHeaderTemplate = migrated.template;
  }

  return {
    settings: {
      ...settings,
      replyHeaderTemplate: migrated.template,
      replyHeaderTemplateMigrationVersion: REPLY_HEADER_TEMPLATE_MIGRATION_VERSION
    },
    updates
  };
}

async function loadSettings() {
  const settings = await storageGet(SETTINGS_DEFAULTS);
  const migrated = migrateSettings(settings);

  if (migrated.updates) {
    storageSet(migrated.updates).then((saved) => {
      debugLog("Settings migration finished.", { saved });
    });
  }

  return migrated.settings;
}

function sendMessage(message) {
  if (!api?.runtime?.sendMessage) {
    return Promise.resolve(null);
  }

  if (globalThis.browser?.runtime?.sendMessage) {
    return api.runtime.sendMessage(message).catch(() => null);
  }

  return new Promise((resolve) => {
    api.runtime.sendMessage(message, (response) => {
      if (api.runtime?.lastError) {
        resolve(null);
        return;
      }

      resolve(response || null);
    });
  });
}

async function getProfileEmail() {
  const response = await sendMessage({ type: "smartre:getProfileUserInfo" });
  debugLog("Profile email lookup finished.", { hasEmail: Boolean(response?.email) });
  return response?.email || "";
}

function parseGoogleAccountName(label, email) {
  if (!label || !email || !label.includes(email)) {
    return "";
  }

  const normalized = label
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const emailIndex = normalized.indexOf(email);
  if (emailIndex <= 0) {
    return "";
  }

  const beforeEmail = normalized
    .slice(0, emailIndex)
    .replace(/^(Google Account|Google アカウント)\s*:\s*/i, "")
    .replace(/^[<（(\[]\s*/, "")
    .replace(/\(\s*$/, "")
    .replace(/[>）)\]]\s*$/, "")
    .replace(/[<（(]\s*$/, "")
    .trim();

  if (!beforeEmail || beforeEmail.includes("@")) {
    return "";
  }

  return beforeEmail;
}

function getProfileNameFromGmailUi(email) {
  const accountElements = Array.from(document.querySelectorAll("[aria-label]"))
    .filter((element) => {
      const label = element.getAttribute("aria-label") || "";
      return label.includes("Google Account") || label.includes("Google アカウント");
    });

  for (const element of accountElements) {
    const name = parseGoogleAccountName(element.getAttribute("aria-label"), email);
    if (name) {
      return name;
    }
  }

  return "";
}

async function getProfileMailbox() {
  const email = await getProfileEmail();
  if (!email) {
    return createMailboxContext([], "profile");
  }

  const name = getProfileNameFromGmailUi(email);
  debugLog("Profile display name lookup finished.", { hasName: Boolean(name) });

  return createMailboxContext([{ name, email }], "profile");
}

function uniqueMailboxes(mailboxes) {
  const seen = new Set();
  const unique = [];

  mailboxes.forEach((mailbox) => {
    const email = (mailbox.email || "").trim();
    const key = email.toLowerCase();
    if (!email || seen.has(key)) return;

    seen.add(key);
    unique.push({
      name: (mailbox.name || "").trim(),
      email
    });
  });

  return unique;
}

function excludeMailboxesByEmail(mailboxes, excludedMailboxes) {
  const excludedEmails = new Set((excludedMailboxes || [])
    .map((mailbox) => (mailbox.email || "").trim().toLowerCase())
    .filter(Boolean));

  return uniqueMailboxes(mailboxes)
    .filter((mailbox) => !excludedEmails.has(mailbox.email.toLowerCase()));
}

function createMailboxContext(mailboxes, source = "") {
  const unique = uniqueMailboxes(mailboxes);

  return {
    mailboxes: unique,
    name: unique.map((mailbox) => mailbox.name).filter(Boolean).join(", "),
    email: unique.map((mailbox) => mailbox.email).join(", "),
    text: unique.map((mailbox) => formatMailbox(mailbox.name, mailbox.email)).join(", "),
    source
  };
}

function parseMailboxesFromText(text) {
  const value = text || "";
  const mailboxes = [];
  const matchedEmails = new Set();

  for (const match of value.matchAll(MAILBOX_PATTERN)) {
    const name = normalizeMailboxName(match[1] || "");
    const email = match[2] || "";
    mailboxes.push({ name, email });
    matchedEmails.add(email.toLowerCase());
  }

  for (const match of value.matchAll(EMAIL_PATTERN)) {
    const email = match[0] || "";
    if (!matchedEmails.has(email.toLowerCase())) {
      mailboxes.push({ name: "", email });
    }
  }

  return uniqueMailboxes(mailboxes);
}

function normalizeMailboxName(name) {
  return (name || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(to|宛先|cc|bcc)\s*[:：]?\s*/i, "")
    .trim();
}

function collectMailboxesFromElementAttributes(element) {
  const email = element.getAttribute("email") || element.getAttribute("data-hovercard-id") || "";
  const explicitName = element.getAttribute("name") || element.getAttribute("data-name") || "";
  const parsedFromText = parseMailboxesFromText(element.textContent || "")
    .find((mailbox) => mailbox.email.toLowerCase() === email.toLowerCase());
  const name = explicitName || parsedFromText?.name || element.textContent || "";

  return email ? [{ name: normalizeMailboxName(name), email }] : [];
}

function collectMailboxesFromNode(node) {
  if (!(node instanceof Element)) {
    return [];
  }

  const mailboxes = [];

  node.querySelectorAll("[email], [data-hovercard-id]").forEach((element) => {
    mailboxes.push(...collectMailboxesFromElementAttributes(element));
  });

  ["title", "aria-label", "data-tooltip", "textContent"].forEach((field) => {
    const value = field === "textContent" ? node.textContent : node.getAttribute(field);
    mailboxes.push(...parseMailboxesFromText(value || ""));
  });

  return uniqueMailboxes(mailboxes);
}

function normalizeHeaderLabel(text) {
  return (text || "")
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, "")
    .replace(/[：:]+$/u, "")
    .toLowerCase();
}

function isDetailHeaderLabel(type, text) {
  const label = normalizeHeaderLabel(text);
  const normalizedLabel = label.replace(/[-_]/g, "");

  return DETAIL_HEADER_LABELS[type].has(label) ||
    DETAIL_HEADER_LABELS[type].has(normalizedLabel);
}

function isToHeaderLabel(text) {
  return isDetailHeaderLabel("to", text);
}

function isCcHeaderLabel(text) {
  return isDetailHeaderLabel("cc", text);
}

function isReplyToHeaderLabel(text) {
  return isDetailHeaderLabel("replyTo", text);
}

function isFromHeaderLabel(text) {
  return isDetailHeaderLabel("from", text);
}

function isDateHeaderLabel(text) {
  return isDetailHeaderLabel("date", text);
}

function isSubjectHeaderLabel(text) {
  return isDetailHeaderLabel("subject", text);
}

function getOriginalMessageRoot(composeRoot) {
  if (!(composeRoot instanceof Element)) {
    return null;
  }

  const closestRoot = composeRoot.closest(SELECTORS.messageRoot);
  if (closestRoot) {
    return closestRoot;
  }

  let current = composeRoot.previousElementSibling;
  while (current) {
    if (current.matches?.(SELECTORS.messageRoot)) {
      return current;
    }

    const nestedRoot = current.querySelector?.(SELECTORS.messageRoot);
    if (nestedRoot) {
      return nestedRoot;
    }

    current = current.previousElementSibling;
  }

  return null;
}

function getOriginalDetailButtons(composeRoot) {
  const buttons = [];
  const messageRoot = getOriginalMessageRoot(composeRoot);

  if (messageRoot) {
    messageRoot.querySelectorAll(SELECTORS.originalDetailButton).forEach((button) => {
      addUniqueElement(buttons, button);
    });
  }

  let current = composeRoot instanceof Element ? composeRoot.previousElementSibling : null;
  while (current && buttons.length === 0) {
    current.querySelectorAll?.(SELECTORS.originalDetailButton).forEach((button) => {
      addUniqueElement(buttons, button);
    });
    current = current.previousElementSibling;
  }

  document.querySelectorAll(SELECTORS.originalDetailButton).forEach((button) => {
    addUniqueElement(buttons, button);
  });

  return buttons;
}

function getDetailCell(row) {
  return row.querySelector("td.gL") || row.querySelector("td:last-child") || row;
}

function getOriginalDetailRows(table) {
  return Array.from(table.querySelectorAll("tr"))
    .map((row, index) => {
      const cell = getDetailCell(row);
      return {
        row,
        index,
        label: row.querySelector("th")?.textContent || "",
        cell,
        mailboxes: collectMailboxesFromNode(cell),
        text: normalizeHeaderText(cell.textContent || "")
      };
    })
    .filter((detailRow) => detailRow.text || detailRow.mailboxes.length > 0);
}

function isLikelyDetailDateText(text) {
  const normalized = normalizeHeaderText(text);
  return /\d{1,2}:\d{2}/.test(normalized) &&
    (/(\d{4}|年|\/|-|\.|,)/.test(normalized) || /\b(?:am|pm)\b/i.test(normalized));
}

function applyOriginalDetailOrderFallback(detail, detailRows) {
  const mailboxRows = detailRows.filter((detailRow) => detailRow.mailboxes.length > 0);
  const firstMailboxRow = mailboxRows[0] || null;
  const hadExplicitTo = detail.to.mailboxes.length > 0;

  if (!detail.from.mailboxes.length && firstMailboxRow) {
    detail.from = createMailboxContext(firstMailboxRow.mailboxes, "detailFrom");
  }

  const firstMailboxIndex = firstMailboxRow?.index ?? -1;
  const recipientRows = mailboxRows
    .filter((detailRow) => (
      detailRow.index > firstMailboxIndex &&
      !isReplyToHeaderLabel(detailRow.label)
    ))
    .map((detailRow) => ({
      ...detailRow,
      mailboxes: excludeMailboxesByEmail(detailRow.mailboxes, detail.from.mailboxes)
    }))
    .filter((detailRow) => detailRow.mailboxes.length > 0);

  if (!detail.to.mailboxes.length && recipientRows[0]) {
    detail.to = createMailboxContext(recipientRows[0].mailboxes, "detailTo");
  }

  if (!detail.cc.mailboxes.length && !hadExplicitTo && recipientRows[1]) {
    detail.cc = createMailboxContext(
      excludeMailboxesByEmail(recipientRows[1].mailboxes, detail.to.mailboxes),
      "detailCc"
    );
  }

  const lastRecipientIndex = recipientRows.length > 0
    ? recipientRows[recipientRows.length - 1].index
    : firstMailboxIndex;
  const rowsAfterRecipients = detailRows.filter((detailRow) => (
    detailRow.index > lastRecipientIndex && detailRow.mailboxes.length === 0
  ));
  const inferredDateRow = rowsAfterRecipients.find((detailRow) => isLikelyDetailDateText(detailRow.text));

  if (!detail.date && inferredDateRow) {
    detail.date = inferredDateRow.text;
  }

  if (!detail.subject && inferredDateRow) {
    detail.subject = rowsAfterRecipients.find((detailRow) => (
      detailRow.index > inferredDateRow.index && detailRow.text && !isLikelyDetailDateText(detailRow.text)
    ))?.text || "";
  }
}

function parseOriginalDetailTable(table) {
  if (!(table instanceof Element)) {
    return null;
  }

  const detail = {
    from: createMailboxContext([], "detailFrom"),
    to: createMailboxContext([], "detailTo"),
    cc: createMailboxContext([], "detailCc"),
    date: "",
    subject: ""
  };

  const detailRows = getOriginalDetailRows(table);

  detailRows.forEach((detailRow) => {
    if (isFromHeaderLabel(detailRow.label) && detailRow.mailboxes.length > 0) {
      detail.from = createMailboxContext(detailRow.mailboxes, "detailFrom");
    } else if (isToHeaderLabel(detailRow.label) && detailRow.mailboxes.length > 0) {
      detail.to = createMailboxContext(detailRow.mailboxes, "detailTo");
    } else if (isCcHeaderLabel(detailRow.label) && detailRow.mailboxes.length > 0) {
      detail.cc = createMailboxContext(detailRow.mailboxes, "detailCc");
    } else if (isDateHeaderLabel(detailRow.label)) {
      detail.date = detailRow.text;
    } else if (isSubjectHeaderLabel(detailRow.label)) {
      detail.subject = detailRow.text;
    }
  });

  applyOriginalDetailOrderFallback(detail, detailRows);

  if (!detail.from.mailboxes.length && !detail.to.mailboxes.length && !detail.date && !detail.subject) {
    return null;
  }

  return detail;
}

function normalizeComparableText(text) {
  return normalizeHeaderText(text).toLowerCase();
}

function normalizeDateParts(text) {
  return (text || "")
    .match(/\d+/g)
    ?.slice(0, 5)
    .map((part) => String(Number(part)))
    .join("-") || "";
}

function scoreOriginalDetail(detail, parsed, subject) {
  if (!detail) {
    return 0;
  }

  let score = 0;
  const parsedEmail = (parsed?.email || "").toLowerCase();
  const parsedName = normalizeComparableText(parsed?.senderName || "");
  const parsedDate = normalizeDateParts(parsed?.date || "");
  const expectedSubject = normalizeComparableText(subject || "");
  const detailSubject = normalizeComparableText(detail.subject || "");

  if (parsedEmail && hasMailboxEmail(detail.from, parsedEmail)) {
    score += 8;
  }

  if (parsedName && normalizeComparableText(detail.from.name).includes(parsedName)) {
    score += 2;
  }

  if (parsedDate && normalizeDateParts(detail.date) === parsedDate) {
    score += 6;
  }

  if (expectedSubject && detailSubject && (
    expectedSubject === detailSubject ||
    expectedSubject.endsWith(detailSubject) ||
    detailSubject.endsWith(expectedSubject)
  )) {
    score += 3;
  }

  return score;
}

function getBestOriginalDetail(tables, parsed, subject) {
  return tables
    .map((table) => ({
      table,
      detail: parseOriginalDetailTable(table)
    }))
    .map((candidate) => ({
      ...candidate,
      score: scoreOriginalDetail(candidate.detail, parsed, subject)
    }))
    .filter((candidate) => candidate.detail && candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.detail || null;
}

async function getOriginalDetailFromPopup(composeRoot, parsed, subject) {
  if (!parsed) {
    return null;
  }

  const existingTables = snapshotElements(SELECTORS.originalDetailTable);
  const buttons = getOriginalDetailButtons(composeRoot);

  for (const button of buttons) {
    clickElement(button);

    const newTable = await waitForNewElement(SELECTORS.originalDetailTable, 1, existingTables);
    const newTables = Array.from(document.querySelectorAll(SELECTORS.originalDetailTable))
      .filter((table) => !existingTables.has(table));
    const candidates = newTable ? [...newTables, newTable] : newTables;
    const matchedNewDetail = getBestOriginalDetail(candidates, parsed, subject);
    dispatchEscapeKey();

    if (matchedNewDetail) {
      debugLog("Original detail popup matched from newly opened table.", {
        toCount: matchedNewDetail.to.mailboxes.length,
        ccCount: matchedNewDetail.cc.mailboxes.length
      });
      return matchedNewDetail;
    }
  }

  const matchedExistingDetail = getBestOriginalDetail(
    Array.from(document.querySelectorAll(SELECTORS.originalDetailTable)),
    parsed,
    subject
  );

  debugLog("Original detail popup lookup finished.", {
    found: Boolean(matchedExistingDetail),
    buttonCount: buttons.length
  });

  return matchedExistingDetail;
}

function getOriginalMailboxesFromRows(messageRoot, isTargetLabel) {
  if (!(messageRoot instanceof Element)) {
    return [];
  }

  const mailboxes = [];

  messageRoot.querySelectorAll("tr").forEach((row) => {
    const cells = Array.from(row.children);
    if (cells.length < 2 || !isTargetLabel(cells[0].textContent)) {
      return;
    }

    cells.slice(1).forEach((cell) => {
      mailboxes.push(...collectMailboxesFromNode(cell));
    });
  });

  return uniqueMailboxes(mailboxes);
}

function getOriginalMailboxesFromHints(messageRoot, headerNames) {
  if (!(messageRoot instanceof Element)) {
    return [];
  }

  const mailboxes = [];
  const headerPattern = new RegExp(`(^|\\s)(${headerNames.join("|")})\\s*[:：]?`, "i");

  messageRoot.querySelectorAll("[title*='@'], [aria-label*='@'], [data-tooltip*='@']").forEach((element) => {
    const hintText = [
      element.textContent || "",
      element.getAttribute("title") || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("data-tooltip") || ""
    ].join(" ");

    const mayBeUnlabeledToElement = headerNames.includes("to") && element.classList.contains("g2");
    if (!headerPattern.test(hintText) && !mayBeUnlabeledToElement) {
      return;
    }

    mailboxes.push(...collectMailboxesFromNode(element));
  });

  return uniqueMailboxes(mailboxes);
}

function getOriginalHeaderMailboxContext(composeRoot, {
  label,
  isTargetLabel,
  hintHeaderNames,
  source
}) {
  const messageRoot = getOriginalMessageRoot(composeRoot);
  const mailboxes = [
    ...getOriginalMailboxesFromRows(messageRoot, isTargetLabel),
    ...getOriginalMailboxesFromHints(messageRoot, hintHeaderNames)
  ];

  const context = createMailboxContext(mailboxes, source);
  debugLog(`Original ${label} lookup finished.`, {
    found: context.mailboxes.length,
    hasRoot: Boolean(messageRoot)
  });

  return context;
}

function getOriginalToMailboxContext(composeRoot) {
  return getOriginalHeaderMailboxContext(composeRoot, {
    label: "To",
    isTargetLabel: isToHeaderLabel,
    hintHeaderNames: ["to", "宛先"],
    source: "originalTo"
  });
}

function getOriginalCcMailboxContext(composeRoot) {
  return getOriginalHeaderMailboxContext(composeRoot, {
    label: "Cc",
    isTargetLabel: isCcHeaderLabel,
    hintHeaderNames: ["cc"],
    source: "originalCc"
  });
}

function addUniqueElement(elements, element) {
  if (element instanceof Element && !elements.includes(element)) {
    elements.push(element);
  }
}

function getComposeRecipientSearchScopes(composeRoot) {
  const scopes = [];

  if (!(composeRoot instanceof Element)) {
    return scopes;
  }

  [
    composeRoot,
    composeRoot.closest("table.IG"),
    composeRoot.closest("div[role='dialog']"),
    composeRoot.closest("div.M9"),
    composeRoot.closest("div.AD")
  ].forEach((element) => addUniqueElement(scopes, element));

  let current = composeRoot.parentElement;
  for (let depth = 0; current && current !== document.body && depth < 12; depth += 1) {
    addUniqueElement(scopes, current);
    if (current.matches?.("table.IG, div[role='dialog'], div.M9, div.AD")) {
      break;
    }
    current = current.parentElement;
  }

  return scopes;
}

function getComposeRecipientMailboxes(composeRoot, recipientName) {
  const mailboxes = [];
  const scopes = getComposeRecipientSearchScopes(composeRoot);

  scopes.forEach((scope) => {
    scope.querySelectorAll(SELECTORS.composeRecipientContainers).forEach((container) => {
      const name = (container.getAttribute("name") || "").toLowerCase();
      if (name !== recipientName) {
        return;
      }

      mailboxes.push(...collectMailboxesFromNode(container));
    });
  });

  return uniqueMailboxes(mailboxes);
}

function getComposeRecipientMailboxContext(composeRoot, recipientName, source) {
  const context = createMailboxContext(getComposeRecipientMailboxes(composeRoot, recipientName), source);

  debugLog(`Compose ${recipientName} recipient lookup finished.`, {
    found: context.mailboxes.length
  });

  return context;
}

async function getReplyMailboxSources(composeRoot) {
  const sources = {
    originalTo: getOriginalToMailboxContext(composeRoot),
    originalCc: getOriginalCcMailboxContext(composeRoot),
    composeTo: getComposeRecipientMailboxContext(composeRoot, "to", "composeTo"),
    composeCc: getComposeRecipientMailboxContext(composeRoot, "cc", "composeCc"),
    profile: await getProfileMailbox()
  };

  debugLog("Reply mailbox source lookup finished.", {
    originalToCount: sources.originalTo.mailboxes.length,
    originalCcCount: sources.originalCc.mailboxes.length,
    composeToCount: sources.composeTo.mailboxes.length,
    composeCcCount: sources.composeCc.mailboxes.length,
    hasProfile: sources.profile.mailboxes.length > 0
  });

  return sources;
}

function findComposeRootFromElement(element) {
  if (!element) return document;

  const scopedCandidates = [
    element.closest("div[role='dialog']"),
    element.closest("div.M9"),
    element.closest("div.AD")
  ].filter(Boolean);

  const parentChain = [];
  let current = element;
  for (let depth = 0; current && current !== document.body && depth < 8; depth += 1) {
    parentChain.push(current);
    current = current.parentElement;
  }

  const candidates = [...scopedCandidates, ...parentChain];

  return candidates.find((node) => (
    node.querySelector(SELECTORS.trimButton) ||
    node.querySelector(SELECTORS.quoteContainer) ||
    node.querySelector(SELECTORS.header) ||
    node.querySelector(SELECTORS.quote) ||
    node.matches?.(SELECTORS.messageBody) ||
    node.querySelector(SELECTORS.messageBody)
  )) || scopedCandidates[0] || parentChain[parentChain.length - 1] || document;
}

async function findActiveComposeRoot(anchorElement) {
  if (anchorElement) {
    return findComposeRootFromElement(anchorElement);
  }

  const footer = await waitForElement(SELECTORS.draftFooter, TIMEOUT_SEC, { last: true });
  debugLog("Draft footer lookup finished.", { found: Boolean(footer) });
  return findComposeRootFromElement(footer);
}

async function formatReplyDraft({ knownMessageBodies } = {}) {
  const settings = await loadSettings();
  debugLog("Formatting requested.", { settings });

  if (!settings.removeQuoteEnabled && !settings.adjustQuoteStyleEnabled && !settings.rewriteHeaderEnabled) {
    debugLog("All formatting features are disabled. Skipping.");
    return;
  }

  await sleep(100);

  const focusedMessageBody = getFocusedMessageBody();
  const newMessageBody = focusedMessageBody || (knownMessageBodies
    ? await waitForNewElement(SELECTORS.messageBody, TIMEOUT_SEC, knownMessageBodies)
    : null);
  const draftTarget = newMessageBody || await waitForElement(
    `${SELECTORS.messageBody}, ${SELECTORS.draftFooter}, ${SELECTORS.trimButton}`,
    TIMEOUT_SEC,
    { last: true }
  );
  let composeRoot = await findActiveComposeRoot(draftTarget);
  let trimButton = composeRoot ? getLastElement(SELECTORS.trimButton, composeRoot) : null;

  if (!trimButton && composeRoot && composeRoot !== document) {
    trimButton = await waitForElement(SELECTORS.trimButton, 1, { targetNode: composeRoot, last: true });
  }

  if (!trimButton && document.querySelectorAll(SELECTORS.trimButton).length === 1) {
    trimButton = getLastElement(SELECTORS.trimButton);
  }

  if (!trimButton && !newMessageBody) {
    trimButton = getLastElement(SELECTORS.trimButton);
    if (!trimButton) {
      trimButton = await waitForElement(SELECTORS.trimButton, 1, { last: true });
    }
  }

  debugLog("Quote expansion button lookup finished.", {
    found: Boolean(trimButton),
    allTrimButtons: document.querySelectorAll(SELECTORS.trimButton).length,
    scopedTrimButtons: composeRoot?.querySelectorAll?.(SELECTORS.trimButton).length || 0,
    hasNewMessageBody: Boolean(newMessageBody),
    hasDraftTarget: Boolean(draftTarget)
  });

  composeRoot = await findActiveComposeRoot(trimButton || draftTarget);
  if (!composeRoot) {
    debugWarn("Compose root was not found.");
    return;
  }

  debugLog("Compose root selected.", {
    tagName: composeRoot.tagName,
    className: composeRoot.className || "",
    id: composeRoot.id || ""
  });

  if (trimButton) {
    await sleep(TRIM_CLICK_DELAY_MS);
    debugLog("Clicking quote expansion button.", {
      className: trimButton.className || "",
      ariaLabel: trimButton.getAttribute("aria-label") || "",
      tooltip: trimButton.getAttribute("data-tooltip") || ""
    });
    clickElement(trimButton);
  } else {
    debugWarn("Quote expansion button was not found.");
  }

  const generatedElement = await waitForFormatTarget(composeRoot, TIMEOUT_SEC);

  debugLog("Quote/header DOM lookup finished.", {
    found: Boolean(generatedElement),
    quoteContainerCount: composeRoot.querySelectorAll(SELECTORS.quoteContainer).length,
    quoteCount: composeRoot.querySelectorAll(SELECTORS.quote).length,
    headerCount: composeRoot.querySelectorAll(SELECTORS.header).length,
    bodyCount: composeRoot.querySelectorAll(SELECTORS.messageBody).length
  });

  await formatComposeRoot(composeRoot, settings);
}

async function formatComposeRoot(composeRoot, settings) {
  if (settings.removeQuoteEnabled) {
    removeQuotedContent(composeRoot);
    return;
  }

  if (settings.adjustQuoteStyleEnabled) {
    adjustQuoteStyles(composeRoot);
  }

  if (settings.rewriteHeaderEnabled) {
    const subject = getSubjectText();
    const mailboxSources = await getReplyMailboxSources(composeRoot);
    const parsedHeader = getParsedReplyHeader(composeRoot);
    const originalDetail = await getOriginalDetailFromPopup(composeRoot, parsedHeader, subject);
    const fallbackToMailbox = selectTemplateToMailbox(null, { mailboxSources });
    const context = {
      subject,
      mailboxSources,
      originalDetail,
      toAddress: fallbackToMailbox.text,
      toName: fallbackToMailbox.name,
      toEmail: fallbackToMailbox.email,
      replyHeaderTemplate: settings.replyHeaderTemplate
    };

    rewriteGmailHeaders(composeRoot, context);
    formatPlainTextBodies(composeRoot, settings, context);
    return;
  }

  formatPlainTextBodies(composeRoot, settings, { subject: "", toAddress: "" });
}

function getElementsIncludingRoot(root, selector) {
  const elements = Array.from(root.querySelectorAll(selector));

  if (root instanceof Element && root.matches(selector)) {
    elements.unshift(root);
  }

  return elements;
}

function dispatchComposeInput(composeRoot) {
  const body = getMessageBodies(composeRoot)[0];
  const target = body || (composeRoot instanceof Element ? composeRoot : null);

  if (target) {
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function removeRichTextQuoteContainers(composeRoot) {
  const containers = getElementsIncludingRoot(composeRoot, SELECTORS.quoteContainer)
    .filter((container, index, list) => (
      list.findIndex((other) => other !== container && other.contains(container)) === -1 &&
      list.indexOf(container) === index
    ));

  containers.forEach((container) => {
    container.remove();
  });

  return containers.length;
}

function findPreviousHeaderForQuote(quote) {
  let node = quote.previousSibling;

  while (node && (isBlankTextNode(node) || isBrElement(node))) {
    node = node.previousSibling;
  }

  return node instanceof Element && node.matches(SELECTORS.header) ? node : null;
}

function removeLooseRichTextQuotes(composeRoot) {
  const quotes = getElementsIncludingRoot(composeRoot, SELECTORS.quote)
    .filter((quote) => !quote.closest(SELECTORS.quoteContainer));
  let removedCount = 0;

  quotes.forEach((quote) => {
    const header = findPreviousHeaderForQuote(quote) ||
      quote.parentElement?.querySelector(SELECTORS.header);

    if (header) {
      header.remove();
      removedCount += 1;
    }

    quote.remove();
    removedCount += 1;
  });

  return removedCount;
}

function trimTrailingBlankLines(lines) {
  let endIndex = lines.length;

  while (endIndex > 0 && !lines[endIndex - 1].trim()) {
    endIndex -= 1;
  }

  return lines.slice(0, endIndex);
}

function removePlainTextQuotedContent(composeRoot) {
  const bodies = getMessageBodies(composeRoot);
  let removedCount = 0;

  bodies.forEach((body) => {
    if (body.dataset.smartreQuoteRemoved === "true") {
      return;
    }

    if (body.querySelector(`${SELECTORS.quoteContainer}, ${SELECTORS.header}, ${SELECTORS.quote}`)) {
      return;
    }

    const lines = getPlainTextBodyLines(body);
    const header = findPlainTextReplyHeader(lines);
    if (!header) {
      return;
    }

    const nextLines = trimTrailingBlankLines(lines.slice(0, header.index));

    replacePlainTextBodyLines(body, nextLines);
    body.dataset.smartreQuoteRemoved = "true";
    removedCount += 1;
  });

  return removedCount;
}

function removeQuotedContent(composeRoot) {
  const containerCount = removeRichTextQuoteContainers(composeRoot);
  const loosePartCount = containerCount > 0 ? 0 : removeLooseRichTextQuotes(composeRoot);
  const plainTextCount = containerCount > 0 || loosePartCount > 0
    ? 0
    : removePlainTextQuotedContent(composeRoot);

  if (containerCount > 0 || loosePartCount > 0) {
    dispatchComposeInput(composeRoot);
  }

  if (composeRoot instanceof Element && (containerCount > 0 || loosePartCount > 0 || plainTextCount > 0)) {
    composeRoot.dataset.smartreQuoteRemoved = "true";
  }

  debugLog("Removing quoted content finished.", {
    containerCount,
    loosePartCount,
    plainTextCount
  });
}

function adjustQuoteStyles(composeRoot) {
  const quotes = composeRoot.querySelectorAll(SELECTORS.quote);
  debugLog("Adjusting quote styles.", { count: quotes.length });

  quotes.forEach((quote) => {
    quote.style.borderLeft = "none";
    quote.style.marginLeft = "0";
    quote.style.paddingLeft = "0";
    quote.dataset.smartreProcessed = "true";
  });
}

function getSubjectText() {
  return document.querySelector(SELECTORS.subject)?.textContent?.trim() || "";
}

function normalizeHeaderText(text) {
  return (text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*:\s*$/, "");
}

function isAlreadyFormattedHeaderText(text) {
  return /Original message|Forwarded message/i.test(normalizeHeaderText(text));
}

function parseGmailHeader(headerText) {
  const text = normalizeHeaderText(headerText)
    .replace(/^On\s+/i, "")
    .replace(/\s*wrote\s*$/i, "");

  if (!text || /Original message|Forwarded message/i.test(text)) {
    return null;
  }

  const angleEmailMatch = text.match(/<([^<>@\s]+@[^<>\s]+)>/);
  const plainEmailMatch = angleEmailMatch ? null : text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const emailMatch = angleEmailMatch || plainEmailMatch;
  const email = angleEmailMatch ? angleEmailMatch[1] : (plainEmailMatch ? plainEmailMatch[0] : "");
  const beforeEmail = emailMatch ? text.slice(0, emailMatch.index).trim() : text;

  let date = "";
  let senderName = "";

  const dateAndName = beforeEmail.match(/^(.+\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)\s+(.+)$/i);
  const dateOnly = beforeEmail.match(/^(.+\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)$/i);
  if (dateOnly) {
    date = dateOnly[1].trim();
  } else if (dateAndName) {
    date = dateAndName[1].trim();
    senderName = dateAndName[2].trim();
  } else if (email) {
    senderName = beforeEmail.trim();
  }

  if (!date && !senderName && !email) {
    return null;
  }

  return { date, senderName, email };
}

function getParsedReplyHeader(composeRoot) {
  const richTextHeaders = composeRoot.querySelectorAll(SELECTORS.header);

  for (const header of richTextHeaders) {
    if (header.dataset.smartreProcessed === "true" || isAlreadyFormattedHeaderText(header.textContent)) {
      continue;
    }

    const parsed = parseGmailHeader(header.textContent);
    if (parsed) {
      return parsed;
    }
  }

  for (const body of getMessageBodies(composeRoot)) {
    const header = findPlainTextReplyHeader(getPlainTextBodyLines(body));
    if (header?.parsed) {
      return header.parsed;
    }
  }

  return null;
}

function appendText(parent, text) {
  parent.appendChild(document.createTextNode(text));
}

function appendBr(parent) {
  parent.appendChild(document.createElement("br"));
}

function getReplyHeaderTemplate(template) {
  return typeof template === "string" ? template : DEFAULT_REPLY_HEADER_TEMPLATE;
}

function normalizeTemplateNewlines(template) {
  return getReplyHeaderTemplate(template)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function hasMailboxEmail(mailboxContext, email) {
  const normalizedEmail = (email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
  }

  return mailboxContext?.mailboxes?.some((mailbox) => (
    mailbox.email.toLowerCase() === normalizedEmail
  )) || false;
}

function getLegacyToMailboxContext({ toAddress, toName, toEmail }) {
  if (toEmail) {
    return createMailboxContext([{ name: toName || "", email: toEmail }], "legacy");
  }

  return createMailboxContext(parseMailboxesFromText(toAddress || ""), "legacy");
}

function selectTemplateToMailbox(parsed, context) {
  const sources = context.mailboxSources || {};
  const fromIsProfile = hasMailboxEmail(sources.profile, parsed?.email);

  if (
    fromIsProfile &&
    sources.composeTo?.mailboxes?.length > 0 &&
    sources.composeTo.mailboxes.length >= (sources.originalTo?.mailboxes?.length || 0)
  ) {
    return sources.composeTo;
  }

  if (sources.originalTo?.mailboxes?.length > 0) {
    return sources.originalTo;
  }

  if (
    fromIsProfile &&
    sources.composeTo?.mailboxes?.length > 0
  ) {
    return sources.composeTo;
  }

  if (sources.profile?.mailboxes?.length > 0) {
    return sources.profile;
  }

  if (sources.composeTo?.mailboxes?.length > 0) {
    return sources.composeTo;
  }

  return getLegacyToMailboxContext(context);
}

function selectTemplateCcMailbox(parsed, context) {
  const sources = context.mailboxSources || {};
  const fromIsProfile = hasMailboxEmail(sources.profile, parsed?.email);

  if (
    fromIsProfile &&
    sources.composeCc?.mailboxes?.length > 0 &&
    sources.composeCc.mailboxes.length >= (sources.originalCc?.mailboxes?.length || 0)
  ) {
    return sources.composeCc;
  }

  if (sources.originalCc?.mailboxes?.length > 0) {
    return sources.originalCc;
  }

  if (sources.composeCc?.mailboxes?.length > 0) {
    return sources.composeCc;
  }

  return createMailboxContext([], "cc");
}

function buildTemplateVariables(parsed, context) {
  const hasOriginalDetail = Boolean(context.originalDetail);
  const originalDetail = context.originalDetail || {};
  const fromMailbox = originalDetail.from?.mailboxes?.[0] || {
    name: parsed.senderName || "",
    email: parsed.email || ""
  };
  const toMailbox = hasOriginalDetail
    ? originalDetail.to || createMailboxContext([], "detailTo")
    : selectTemplateToMailbox(parsed, context);
  const rawCcMailbox = hasOriginalDetail
    ? originalDetail.cc || createMailboxContext([], "detailCc")
    : selectTemplateCcMailbox(parsed, context);
  const ccMailbox = createMailboxContext(
    excludeMailboxesByEmail(rawCcMailbox.mailboxes, toMailbox.mailboxes),
    rawCcMailbox.source
  );

  return {
    from: formatMailbox(fromMailbox.name, fromMailbox.email),
    fromName: fromMailbox.name || "",
    fromEmail: fromMailbox.email || "",
    date: originalDetail.date || parsed.date || "",
    subject: originalDetail.subject || context.subject || "",
    to: toMailbox.text || "",
    toName: toMailbox.name || "",
    toEmail: toMailbox.email || "",
    cc: ccMailbox.text || "",
    ccName: ccMailbox.name || "",
    ccEmail: ccMailbox.email || ""
  };
}

function renderHeaderTemplateLine(line, variables) {
  return line.replace(TEMPLATE_VARIABLE_PATTERN, (matched, key) => variables[key] ?? "");
}

function isEmptyLabeledTemplateLine(line, renderedLine, variables) {
  const variableKeys = Array.from(line.matchAll(TEMPLATE_VARIABLE_PATTERN), (match) => match[1]);

  if (variableKeys.length === 0 || variableKeys.some((key) => Boolean(variables[key]))) {
    return false;
  }

  const labelText = line.replace(TEMPLATE_VARIABLE_PATTERN, "").trim();
  if (!/^(from|date|subject|to|cc|差出人|日時|件名|宛先)\s*[:：]?$/i.test(labelText)) {
    return false;
  }

  return !renderedLine.replace(labelText, "").trim();
}

function buildHeaderTemplateLines(parsed, context) {
  const variables = buildTemplateVariables(parsed, context);

  return normalizeTemplateNewlines(context.replyHeaderTemplate)
    .split("\n")
    .map((line) => ({
      source: line,
      rendered: renderHeaderTemplateLine(line, variables)
    }))
    .filter(({ source, rendered }) => !isEmptyLabeledTemplateLine(source, rendered, variables))
    .map(({ rendered }) => rendered);
}

function appendHeaderTemplate(parent, lines) {
  lines.forEach((line, index) => {
    if (line) {
      appendText(parent, line);
    }

    if (index < lines.length - 1) {
      appendBr(parent);
    }
  });
}

function isBlankTextNode(node) {
  return node?.nodeType === Node.TEXT_NODE && node.textContent.trim() === "";
}

function isBrElement(node) {
  return node?.nodeType === Node.ELEMENT_NODE && node.tagName === "BR";
}

function ensureSpacingAfterHeader(header) {
  const parent = header.parentNode;
  if (!parent) return;

  let referenceNode = header.nextSibling;
  let existingBreaks = 0;

  while (referenceNode && (isBlankTextNode(referenceNode) || isBrElement(referenceNode))) {
    if (isBrElement(referenceNode)) {
      existingBreaks += 1;
    }

    referenceNode = referenceNode.nextSibling;
  }

  for (let i = existingBreaks; i < 2; i += 1) {
    parent.insertBefore(document.createElement("br"), referenceNode);
  }
}

function rewriteHeaderElement(header, parsed, context) {
  header.replaceChildren();
  header.dir = "ltr";

  appendHeaderTemplate(header, buildHeaderTemplateLines(parsed, context));

  header.dataset.smartreProcessed = "true";
  ensureSpacingAfterHeader(header);
}

function rewriteGmailHeaders(composeRoot, context) {
  const headers = composeRoot.querySelectorAll(SELECTORS.header);
  debugLog("Rewriting Gmail headers.", {
    count: headers.length,
    hasSubject: Boolean(context.subject),
    hasToAddress: Boolean(context.toAddress)
  });

  headers.forEach((header) => {
    if (header.dataset.smartreProcessed === "true") {
      ensureSpacingAfterHeader(header);
      return;
    }

    if (isAlreadyFormattedHeaderText(header.textContent)) {
      header.dataset.smartreProcessed = "true";
      ensureSpacingAfterHeader(header);
      debugLog("Header is already formatted. Skipping rewrite.");
      return;
    }

    const parsed = parseGmailHeader(header.textContent);
    if (!parsed) {
      debugWarn("Header text could not be parsed.", { text: header.textContent });
      return;
    }

    debugLog("Header parsed.", parsed);
    rewriteHeaderElement(header, parsed, context);
  });
}

function getPlainTextBodyLines(body) {
  return (body.innerText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
}

function findPlainTextReplyHeader(lines) {
  const maxHeaderSearchLines = Math.min(lines.length, 80);

  for (let index = 0; index < maxHeaderSearchLines; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith(">")) continue;

    const parsed = parseGmailHeader(line);
    if (isPlausibleReplyHeader(parsed) && hasPlainTextQuoteAfterHeader(lines, index)) {
      return { index, parsed };
    }
  }

  return null;
}

function isPlausibleReplyHeader(parsed) {
  return Boolean(parsed?.email || (parsed?.date && parsed.senderName));
}

function hasPlainTextQuoteAfterHeader(lines, headerIndex) {
  const maxLookAhead = Math.min(lines.length, headerIndex + 8);

  for (let index = headerIndex + 1; index < maxLookAhead; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;

    return line.startsWith(">");
  }

  return false;
}

function stripPlainTextQuotePrefix(line) {
  return line.replace(/^>\s?/, "");
}

function dropLeadingBlankLines(lines) {
  let firstContentIndex = 0;
  while (firstContentIndex < lines.length && !lines[firstContentIndex].trim()) {
    firstContentIndex += 1;
  }

  return lines.slice(firstContentIndex);
}

function formatMailbox(name, email) {
  if (name && email) return `${name} <${email}>`;
  if (email) return `<${email}>`;
  return name || "";
}

function buildPlainTextHeaderLines(parsed, context) {
  return buildHeaderTemplateLines(parsed, context);
}

function replacePlainTextBodyLines(body, lines) {
  body.replaceChildren();

  if (lines.length === 0) {
    appendBr(body);
    body.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  lines.forEach((line, index) => {
    if (line) {
      body.appendChild(document.createTextNode(line));
    }

    if (index < lines.length - 1) {
      appendBr(body);
    }
  });

  body.dispatchEvent(new Event("input", { bubbles: true }));
}

function getMessageBodies(composeRoot) {
  const bodies = Array.from(composeRoot.querySelectorAll(SELECTORS.messageBody));

  if (composeRoot instanceof Element && composeRoot.matches(SELECTORS.messageBody)) {
    bodies.unshift(composeRoot);
  }

  return bodies;
}

function formatPlainTextBody(body, settings, context) {
  if (body.dataset.smartrePlainTextProcessed === "true") {
    return false;
  }

  if (body.querySelector(`${SELECTORS.quoteContainer}, ${SELECTORS.header}, ${SELECTORS.quote}`)) {
    return false;
  }

  const lines = getPlainTextBodyLines(body);
  const header = findPlainTextReplyHeader(lines);
  if (!header) {
    return false;
  }

  const beforeHeader = lines.slice(0, header.index);
  const quoteLines = lines.slice(header.index + 1);
  const formattedQuoteLines = settings.adjustQuoteStyleEnabled
    ? quoteLines.map(stripPlainTextQuotePrefix)
    : quoteLines;

  let nextLines = null;

  if (settings.rewriteHeaderEnabled) {
    nextLines = [
      ...beforeHeader,
      ...buildPlainTextHeaderLines(header.parsed, context),
      "",
      "",
      ...dropLeadingBlankLines(formattedQuoteLines)
    ];
  } else if (settings.adjustQuoteStyleEnabled) {
    nextLines = [
      ...beforeHeader,
      lines[header.index],
      ...formattedQuoteLines
    ];
  }

  if (!nextLines || nextLines.join("\n") === lines.join("\n")) {
    return false;
  }

  replacePlainTextBodyLines(body, nextLines);
  body.dataset.smartrePlainTextProcessed = "true";
  return true;
}

function formatPlainTextBodies(composeRoot, settings, context) {
  const bodies = getMessageBodies(composeRoot);
  let formattedCount = 0;

  bodies.forEach((body) => {
    if (formatPlainTextBody(body, settings, context)) {
      formattedCount += 1;
    }
  });

  debugLog("Formatting plain text bodies finished.", {
    bodyCount: bodies.length,
    formattedCount
  });
}

function matchesAnySelector(element, selectors) {
  if (!(element instanceof Element)) return null;

  for (const selector of selectors) {
    const matched = element.closest(selector);
    if (matched) return { selector, element: matched };
  }

  return null;
}

function getElementActionText(element) {
  if (!(element instanceof Element)) {
    return "";
  }

  const parts = [];
  let current = element;

  for (let depth = 0; current instanceof Element && depth < 4; depth += 1) {
    parts.push(
      current.getAttribute("aria-label") || "",
      current.getAttribute("data-tooltip") || "",
      current.getAttribute("title") || ""
    );
    if (depth === 0) {
      parts.push(current.textContent || "");
    }
    current = current.parentElement;
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function isReplyActionText(text) {
  return REPLY_ACTION_TEXT_PATTERN.test(text) &&
    !FORWARD_ACTION_TEXT_PATTERN.test(text) &&
    !NON_REPLY_ACTION_TEXT_PATTERN.test(text);
}

function isReplyActionElement(element) {
  const actionElement = element instanceof Element
    ? element.closest(ACTION_CANDIDATE_SELECTOR)
    : null;

  if (!actionElement) {
    return null;
  }

  return isReplyActionText(getElementActionText(actionElement))
    ? { selector: "reply action text", element: actionElement }
    : null;
}

function isReplyMenuItem(element) {
  const menuItem = element instanceof Element
    ? element.closest("[role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox'], .J-N, .J-N-Jz")
    : null;

  if (!menuItem) {
    return null;
  }

  const actionText = getElementActionText(menuItem);
  const isReplyAction = isReplyActionText(actionText);

  return isReplyAction
    ? { selector: "reply menu item", element: menuItem }
    : null;
}

function describeClickTarget(target) {
  if (!(target instanceof Element)) return {};

  const closestButton = target.closest(ACTION_CANDIDATE_SELECTOR);

  return {
    tagName: target.tagName,
    className: target.className || "",
    text: (target.textContent || "").trim().slice(0, 80),
    closestTagName: closestButton?.tagName || "",
    closestClassName: closestButton?.className || "",
    closestAriaLabel: closestButton?.getAttribute("aria-label") || "",
    closestTooltip: closestButton?.getAttribute("data-tooltip") || "",
    closestTitle: closestButton?.getAttribute("title") || ""
  };
}

function handleDocumentClick(event) {
  const matchedReply = matchesAnySelector(event.target, SELECTORS.replyButtons) ||
    isReplyActionElement(event.target) ||
    isReplyMenuItem(event.target);
  if (!matchedReply) {
    return;
  }

  const knownMessageBodies = snapshotElements(SELECTORS.messageBody);

  debugLog("Reply click detected.", {
    selector: matchedReply.selector,
    target: describeClickTarget(event.target)
  });

  window.setTimeout(() => {
    formatReplyDraft({ knownMessageBodies }).catch((error) => {
      debugWarn("Formatting failed.", error);
    });
  }, 0);
}

function main() {
  if (globalThis[INITIALIZED_FLAG]) {
    debugLog("Content script already initialized in this context. Skipping listener registration.");
    return;
  }

  globalThis[INITIALIZED_FLAG] = true;

  debugLog("Content script initialized.", {
    href: location.href,
    selectors: SELECTORS.replyButtons
  });

  document.removeEventListener("click", handleDocumentClick, true);
  document.addEventListener("click", handleDocumentClick, true);
}

window.addEventListener("hashchange", main);
main();
