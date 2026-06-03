globalThis.chrome = globalThis.browser ? globalThis.browser : globalThis.chrome;

const api = globalThis.chrome;

const DEFAULT_REPLY_HEADER_TEMPLATE = [
  "---------- Original message ---------",
  "From: $from",
  "Date: $date",
  "Subject: $subject",
  "To: $to"
].join("\n");

const SETTINGS_DEFAULTS = {
  removeQuoteEnabled: false,
  adjustQuoteStyleEnabled: true,
  rewriteHeaderEnabled: true,
  replyHeaderTemplate: DEFAULT_REPLY_HEADER_TEMPLATE
};

const TEMPLATE_VARIABLE_PATTERN = /\$(fromName|fromEmail|from|toName|toEmail|to|date|subject)(?![A-Za-z0-9_])/g;

const TIMEOUT_SEC = 5;
const TRIM_CLICK_DELAY_MS = 700;
const DEBUG = isDebugEnabled();
const INITIALIZED_FLAG = "__smartreContentScriptInitialized";

const SELECTORS = {
  // Gmail返信ボタン。英語UI/日本語UI/内部クラスの候補をまとめて監視する。
  replyButtons: [
    "div[data-tooltip='Reply']",
    "div[data-tooltip*='Reply']",
    "button[aria-label='Reply']",
    "button[aria-label*='Reply']",
    "div[aria-label='Reply']",
    "div[aria-label*='Reply']",
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
  messageBody: "div[role='textbox'][contenteditable='true']"
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

async function loadSettings() {
  return storageGet(SETTINGS_DEFAULTS);
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
    return { name: "", email: "", text: "" };
  }

  const name = getProfileNameFromGmailUi(email);
  debugLog("Profile display name lookup finished.", { hasName: Boolean(name) });

  return {
    name,
    email,
    text: formatMailbox(name, email)
  };
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
    const toMailbox = await getProfileMailbox();
    const context = {
      subject,
      toAddress: toMailbox.text,
      toName: toMailbox.name,
      toEmail: toMailbox.email,
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
  if (dateAndName) {
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

function buildTemplateVariables(parsed, { subject, toAddress, toName, toEmail }) {
  return {
    from: formatMailbox(parsed.senderName, parsed.email),
    fromName: parsed.senderName || "",
    fromEmail: parsed.email || "",
    date: parsed.date || "",
    subject: subject || "",
    to: toAddress || "",
    toName: toName || "",
    toEmail: toEmail || ""
  };
}

function renderHeaderTemplate(parsed, context) {
  const variables = buildTemplateVariables(parsed, context);

  return normalizeTemplateNewlines(context.replyHeaderTemplate)
    .replace(TEMPLATE_VARIABLE_PATTERN, (matched, key) => variables[key] ?? "");
}

function buildHeaderTemplateLines(parsed, context) {
  return renderHeaderTemplate(parsed, context).split("\n");
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
  return Boolean(parsed?.date && (parsed.senderName || parsed.email));
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

function describeClickTarget(target) {
  if (!(target instanceof Element)) return {};

  const closestButton = target.closest("[role='button'], button[data-tooltip], button[aria-label], div[data-tooltip], div[aria-label], span.ams");

  return {
    tagName: target.tagName,
    className: target.className || "",
    text: (target.textContent || "").trim().slice(0, 80),
    closestTagName: closestButton?.tagName || "",
    closestClassName: closestButton?.className || "",
    closestAriaLabel: closestButton?.getAttribute("aria-label") || "",
    closestTooltip: closestButton?.getAttribute("data-tooltip") || ""
  };
}

function handleDocumentClick(event) {
  const matchedReply = matchesAnySelector(event.target, SELECTORS.replyButtons);
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
