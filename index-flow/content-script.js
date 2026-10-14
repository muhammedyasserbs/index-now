"use strict";
(() => {
  // src/types/state.ts
  var MIN_OPERATION_DELAY_SECONDS = 10;
  var DEFAULT_OPERATION_DELAY_SECONDS = 10;
  var SKIPPED_OPERATION_DELAY_SECONDS = 10;
  var DEFAULT_LIMIT_DELAY_SECONDS = 30 * 60;

  // src/utils/url.ts
  function getDomainKey(rawUrl) {
    try {
      return new URL(rawUrl).hostname.toLowerCase();
    } catch {
      return "";
    }
  }
  function buildGscMainPageUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "https:" || url.hostname !== "search.google.com") return null;
      const searchConsolePath = url.pathname.match(/^(\/(?:u\/[^/]+\/)?search-console)(?:\/|$)/)?.[1];
      const resourceId = url.searchParams.get("resource_id");
      if (!searchConsolePath || !resourceId) return null;
      const mainPage = new URL(searchConsolePath, url.origin);
      mainPage.searchParams.set("resource_id", resourceId);
      return mainPage.toString();
    } catch {
      return null;
    }
  }

  // src/services/queue-service.ts
  function shouldRequestForMode(mode, status) {
    if (mode === "both") return true;
    if (mode === "new_only") return status === "new_page";
    return status === "indexed_page";
  }

  // src/content/content-script.ts
  var INSPECTION_TIMEOUT_MS = 5e4;
  var INPUT_ACQUIRE_TIMEOUT_MS = 15e3;
  var DIALOG_TIMEOUT_MS = 3e5;
  var DIALOG_APPEAR_MS = 3e4;
  var OUTCOME_GRACE_MS = 12e3;
  var POLL_INTERVAL_MS = 500;
  var MAX_SUBMIT_RETRIES = 2;
  var SUBMIT_RETRY_DELAY_SECONDS = 15;
  var POST_SUCCESS_RESUME_KEY = "__gscBulkIndexerPostSuccessResume";
  var CanceledError = class extends Error {
    constructor() {
      super("تم إلغاء العملية.");
      this.name = "CanceledError";
    }
  };
  var activeRun = null;
  var heartbeatTimer = null;
  function sendHeartbeat(runId) {
    void sendMessage({ type: "HEARTBEAT", runId }).catch(() => void 0);
  }
  function startHeartbeat(runId) {
    stopHeartbeat();
    sendHeartbeat(runId);
    heartbeatTimer = window.setInterval(() => sendHeartbeat(runId), 2e4);
  }
  function stopHeartbeat() {
    if (heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }
  function sleep(milliseconds, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new CanceledError());
        return;
      }
      const timeout = window.setTimeout(() => {
        signal?.removeEventListener("abort", cancel);
        resolve();
      }, milliseconds);
      const cancel = () => {
        window.clearTimeout(timeout);
        reject(new CanceledError());
      };
      signal?.addEventListener("abort", cancel, { once: true });
    });
  }
  function waitTick(signal, fallbackMs = POLL_INTERVAL_MS) {
    return new Promise((resolve, reject) => {
      let done = false;
      let observer = null;
      const finish = () => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        if (observer) observer.disconnect();
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = () => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        if (observer) observer.disconnect();
        reject(new CanceledError());
      };
      const timer = window.setTimeout(finish, fallbackMs);
      try {
        observer = new MutationObserver(finish);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      } catch {
      }
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  function assertNotCanceled(signal) {
    if (signal.aborted) throw new CanceledError();
  }
  function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }
  async function sendMessage(message) {
    return chrome.runtime.sendMessage(message);
  }
  function log(level, message, runId) {
    void sendMessage({ type: "LOG", runId, level, message }).catch(() => void 0);
  }
  function readPostSuccessResume() {
    try {
      const rawValue = window.sessionStorage.getItem(POST_SUCCESS_RESUME_KEY);
      if (!rawValue) return null;
      const value = JSON.parse(rawValue);
      return typeof value.runId === "string" && typeof value.startedAt === "number" && typeof value.resumeAt === "number" ? { runId: value.runId, startedAt: value.startedAt, resumeAt: value.resumeAt } : null;
    } catch {
      return null;
    }
  }
  function writePostSuccessResume(runId, startedAt, resumeAt) {
    try {
      window.sessionStorage.setItem(POST_SUCCESS_RESUME_KEY, JSON.stringify({ runId, startedAt, resumeAt }));
      return true;
    } catch {
      return false;
    }
  }
  async function setWaitState(run, wait) {
    try {
      await sendMessage({ type: "SET_WAIT_STATE", runId: run.runId, wait });
    } catch {
    }
  }
  async function waitWithProgress(run, delaySeconds, reason) {
    const startedAt = Date.now();
    const until = startedAt + delaySeconds * 1e3;
    await setWaitState(run, { reason, startedAt, until });
    try {
      await sleep(delaySeconds * 1e3, run.controller.signal);
    } finally {
      await setWaitState(run);
    }
  }
  function clearPostSuccessResume(runId) {
    try {
      const saved = readPostSuccessResume();
      if (!runId || !saved || saved.runId === runId) window.sessionStorage.removeItem(POST_SUCCESS_RESUME_KEY);
    } catch {
    }
  }
  async function waitForPostSuccessResume(run) {
    const saved = readPostSuccessResume();
    if (!saved) return;
    if (saved.runId !== run.runId) {
      clearPostSuccessResume();
      return;
    }
    try {
      await setWaitState(run, { reason: "pacing", startedAt: saved.startedAt, until: saved.resumeAt });
      const remainingMilliseconds = saved.resumeAt - Date.now();
      if (remainingMilliseconds > 0) await sleep(remainingMilliseconds, run.controller.signal);
    } finally {
      clearPostSuccessResume(run.runId);
      await setWaitState(run);
    }
  }
  async function returnToMainPageAfterSuccess(run, delaySeconds, continueRunning) {
    const mainPageUrl = buildGscMainPageUrl(window.location.href);
    if (!mainPageUrl) return false;
    if (continueRunning) {
      const startedAt = Date.now();
      const resumeAt = startedAt + delaySeconds * 1e3;
      await setWaitState(run, { reason: "pacing", startedAt, until: resumeAt });
      if (!writePostSuccessResume(run.runId, startedAt, resumeAt)) {
        try {
          await sleep(delaySeconds * 1e3, run.controller.signal);
        } finally {
          await setWaitState(run);
        }
      }
    } else {
      clearPostSuccessResume(run.runId);
    }
    log("info", "جارٍ العودة إلى الصفحة الرئيسية لـ Search Console.", run.runId);
    window.location.replace(mainPageUrl);
    return true;
  }
  function isVisible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }
  function normalizeText(text) {
    return (text ?? "").replace(/[\u0640\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function includesAny(normalizedHaystack, needles) {
    for (const needle of needles) {
      if (normalizedHaystack.includes(normalizeText(needle))) return true;
    }
    return false;
  }
  function visibleText(root = document) {
    if (root instanceof HTMLElement && !isVisible(root)) return "";
    return normalizeText(root.textContent ?? "");
  }
  function visibleTextDeep(root = document.body) {
    if (!(root instanceof HTMLElement)) return "";
    if (!isVisible(root)) return "";
    let text = "";
    for (const child of root.childNodes) {
      if (child instanceof HTMLElement) text += " " + visibleTextDeep(child);
      else if (child.nodeType === Node.TEXT_NODE) text += " " + (child.textContent ?? "");
    }
    return normalizeText(text);
  }
  var NEW_PAGE_NEEDLES = [
    "url is not on google",
    "not on google",
    "url is not available to google",
    "url is not available on google",
    "not available to google",
    "not available on google",
    "page is not indexed",
    "url is unknown to google",
    "الرابط ليس على google",
    "الرابط غير موجود على google",
    "لم تتم فهرسة عنوان url",
    "لم تتم فهرسة الصفحة",
    "غير متاح على google",
    "غير متوفر على google",
    "عنوان url غير متوفر على محرك بحث google",
    "عنوان url غير متاح على محرك بحث google",
    "عنوان url غير متوفر",
    "عنوان url غير متاح"
  ];
  var INDEXED_PAGE_NEEDLES = [
    "url is on google",
    "url is available to google",
    "url is available on google",
    "available to google",
    "available on google",
    "page is indexed",
    "الرابط متاح على google",
    "الرابط موجود على google",
    "تمت فهرسة عنوان url",
    "تمت فهرسة الصفحة",
    "متاح على google",
    "متوفر على google",
    "عنوان url متوفر على محرك بحث google",
    "عنوان url متاح على محرك بحث google",
    "عنوان url متوفر",
    "عنوان url متاح"
  ];
  function pageStatusFromText(text) {
    if (includesAny(text, NEW_PAGE_NEEDLES)) return "new_page";
    if (includesAny(text, INDEXED_PAGE_NEEDLES)) return "indexed_page";
    return "unknown";
  }
  function pageShowsUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      let bare = (url.hostname + url.pathname).toLowerCase();
      if (bare.endsWith("/")) bare = bare.slice(0, -1);
      if (!bare) return false;
      const text = visibleTextDeep(document.body);
      if (!text) return false;
      let decodedBare = bare;
      try {
        decodedBare = (url.hostname + decodeURIComponent(url.pathname)).toLowerCase();
        if (decodedBare.endsWith("/")) decodedBare = decodedBare.slice(0, -1);
      } catch {
      }
      for (const candidate of [bare, decodedBare]) {
        if (text.includes(candidate)) return true;
        const withoutWww = candidate.replace(/^www\./, "");
        if (withoutWww !== candidate && text.includes(withoutWww)) return true;
      }
      return false;
    } catch {
      return false;
    }
  }
  var INSPECTION_INPUT_SELECTORS = [
    'input[aria-label*="inspect any url" i]',
    'input[placeholder*="inspect any url" i]',
    'input[aria-label*="افحص"]',
    'input[placeholder*="افحص"]',
    'input[aria-label*="عنوان url" i]',
    'input[placeholder*="عنوان url" i]',
    'input[aria-label*="url" i]',
    'input[placeholder*="url" i]'
  ];
  function findInspectionInput(requireVisible = true) {
    for (const selector of INSPECTION_INPUT_SELECTORS) {
      for (const input of Array.from(document.querySelectorAll(selector))) {
        if (!(input instanceof HTMLInputElement) || input.disabled || input.type === "hidden") continue;
        if (!requireVisible || isVisible(input)) return input;
      }
    }
    return null;
  }
  function revealElement(element) {
    let node = element;
    let steps = 0;
    while (node && node !== document.body && steps < 15) {
      const style = window.getComputedStyle(node);
      if (style.display === "none") node.style.setProperty("display", node === element ? "inline-block" : "block", "important");
      else if (style.visibility === "hidden") node.style.setProperty("visibility", "visible", "important");
      else if (isVisible(node)) break;
      node = node.parentElement;
      steps += 1;
    }
    if (element instanceof HTMLInputElement && !isVisible(element)) {
      element.style.setProperty("width", "320px", "important");
      element.style.setProperty("height", "32px", "important");
    }
  }
  function findSearchToggle() {
    const candidates = document.querySelectorAll('button, [role="button"]');
    for (const candidate of candidates) {
      if (!isVisible(candidate)) continue;
      if (candidate.closest('a, nav, [role="navigation"], [role="dialog"]')) continue;
      const label = normalizeText((candidate.getAttribute("aria-label") ?? "") + " " + (candidate.getAttribute("title") ?? ""));
      if (!label) continue;
      if (["search", "open search", "show search", "search bar", "بحث", "افتح البحث", "ابحث", "اظهر البحث", "افحص", "فحص"].includes(label)) return candidate;
      if (label.includes("open search") || label.includes("inspect any url") || label.includes("افحص أي عنوان") || label.includes("فتح البحث")) return candidate;
    }
    return null;
  }
  async function acquireInspectionInput(signal, runId) {
    const deadline = Date.now() + INPUT_ACQUIRE_TIMEOUT_MS;
    let toggleAttempts = 0;
    let lastToggleAt = -Infinity;
    let loggedStruggle = false;
    while (Date.now() < deadline) {
      assertNotCanceled(signal);
      const input = findInspectionInput();
      if (input) {
        if (loggedStruggle) log("info", "تم إظهار حقل فحص الروابط.", runId);
        return input;
      }
      if (!loggedStruggle) {
        loggedStruggle = true;
        log("info", "حقل فحص الروابط غير ظاهر — جارٍ محاولة إظهاره تلقائيًا (كبّر نافذة المتصفح إن استمرت المشكلة).", runId);
      }
      const hiddenInput = findInspectionInput(false);
      if (hiddenInput) {
        revealElement(hiddenInput);
        const revealed = findInspectionInput();
        if (revealed) {
          log("info", "تم إظهار حقل فحص الروابط.", runId);
          return revealed;
        }
      }
      if (toggleAttempts < 4 && Date.now() - lastToggleAt > 2500) {
        const toggle = findSearchToggle();
        if (toggle) {
          toggle.click();
          toggleAttempts += 1;
          lastToggleAt = Date.now();
        }
      }
      await waitTick(signal, 600);
    }
    return null;
  }
  function setInputValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function findRequestButton() {
    const candidates = document.querySelectorAll('button, [role="button"]');
    for (const candidate of candidates) {
      if (!isVisible(candidate)) continue;
      const text = visibleText(candidate);
      if (!includesAny(text, ["request indexing", "request again", "طلب فهرسة", "طلب الفهرسة"])) continue;
      const disabled = candidate.getAttribute("aria-disabled") === "true" || candidate.hasAttribute("disabled") || candidate instanceof HTMLButtonElement && candidate.disabled;
      if (!disabled) return candidate;
    }
    return null;
  }
  async function waitForInspection(signal, itemUrl, preSubmitStatus) {
    const deadline = Date.now() + INSPECTION_TIMEOUT_MS;
    const softDeadline = Date.now() + 25e3;
    let latestStatus = "unknown";
    let latestButton = null;
    let stablePolls = 0;
    await sleep(1200, signal);
    while (Date.now() < deadline) {
      assertNotCanceled(signal);
      latestStatus = pageStatusFromText(visibleTextDeep(document.body));
      latestButton = findRequestButton();
      if (latestStatus !== "unknown") {
        const urlShown = itemUrl ? pageShowsUrl(itemUrl) : true;
        const transitioned = latestStatus !== preSubmitStatus;
        if (urlShown || transitioned) {
          stablePolls += 1;
          if (stablePolls >= 2) return { pageStatus: latestStatus, requestButton: latestButton };
        } else if (Date.now() > softDeadline) {
          return { pageStatus: latestStatus, requestButton: latestButton };
        }
      } else {
        stablePolls = 0;
      }
      await waitTick(signal);
    }
    return { pageStatus: latestStatus, requestButton: latestButton };
  }
  function modeSkipReason(mode, status, url) {
    if (mode === "new_only" && status === "indexed_page") return `تم تخطي رابط مفهرس مسبقًا في وضع "الجديد فقط": ${url}`;
    if (mode === "reindex_only" && status === "new_page") return `تم تخطي رابطًا جديدًا في وضع "إعادة الفهرسة فقط": ${url}`;
    return `تم التخطي حسب وضع الفهرسة: ${url}`;
  }
  function visibleDialogs() {
    return Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).filter(isVisible);
  }
  function isSubmitProblemText(text) {
    return includesAny(text, [
      "problem submitting your indexing request",
      "we had a problem submitting",
      "oops",
      "something went wrong",
      "try again later",
      "عذرا",
      "حدث خطأ",
      "واجهنا مشكلة",
      "مشكلة في إرسال",
      "مشكلة في ارسال",
      "حاول مرة أخرى لاحقًا",
      "إعادة المحاولة لاحقًا"
    ]);
  }
  function dismissDialog(dialog) {
    const buttons = Array.from(dialog.querySelectorAll('button, [role="button"], a')).filter(isVisible);
    const dismiss = buttons.find((button) => {
      const text = visibleText(button);
      if (text === "ok" || text === "close" || text === "done" || text === "حسنا" || text === "موافق" || text === "تم" || text === "اغلاق" || text === "تمام" || text === "dismiss" || text === "تجاهل" || text === "اغلق") return true;
      return text.includes("got it") || text.includes("فهمت");
    });
    dismiss?.click();
  }
  function isTestingText(text) {
    return includesAny(text, [
      "testing if live url can be indexed",
      "this might take a minute or two",
      "جارٍ اختبار",
      "يجري اختبار",
      "اختبار ما إذا كان يمكن فهرسة",
      "اختبار إمكانية فهرسة",
      "قد يستغرق هذا دقيقة أو دقيقتين",
      "دقيقة أو دقيقتين"
    ]);
  }
  var BODY_QUOTA_NEEDLES = [
    "تجاوزت الحد المسموح به يومياً",
    "الحد المسموح به يومياً",
    "تجاوزت حصتك اليومية",
    "استنفدت حصتك اليومية",
    "استنفدت حصة الفهرسة اليومية",
    "quota exceeded",
    "exceeded your daily quota",
    "try submitting this again tomorrow"
  ];
  async function waitForDialog(url, pageStatus, runId) {
    const hardDeadline = Date.now() + DIALOG_TIMEOUT_MS;
    const appearDeadline = Date.now() + DIALOG_APPEAR_MS;
    const startedAt = Date.now();
    let sawActivity = false;
    let testingSeen = false;
    let testingLastSeenAt = 0;
    let lastProgressLogAt = 0;
    while (Date.now() < hardDeadline) {
      for (const dialog of visibleDialogs()) {
        const text = visibleText(dialog);
        if (!text) continue;
        sawActivity = true;
        if (includesAny(text, [
          "quota exceeded",
          "daily quota",
          "exceeded your quota",
          "exceeded your daily quota",
          "quota limit",
          "try submitting this again tomorrow",
          "تم تجاوز الحصة",
          "تجاوزت الحصة",
          "تجاوزت حصتك",
          "استنفدت الحصة",
          "استنفدت حصتك",
          "الحد اليومي",
          "حصتك اليومية",
          "حصة الفهرسة اليومية",
          "المحاولة غدًا",
          "مرة أخرى غدًا",
          "إعادة إرسال هذا غدًا",
          "تجاوزت الحد المسموح به",
          "الحد المسموح به يومياً"
        ])) {
          dismissDialog(dialog);
          return {
            outcome: "quota",
            gscPageStatus: pageStatus,
            reason: `تم بلوغ حد الفهرسة اليومي لنطاق ${getDomainKey(url) || "هذا النطاق"}.`,
            domain: getDomainKey(url)
          };
        }
        if (includesAny(text, [
          "indexing requested",
          "request submitted",
          "successfully submitted",
          "submitted for indexing",
          "تم طلب الفهرسة",
          "تم إرسال الطلب",
          "تم الإرسال بنجاح",
          "تم إرسال عنوان url",
          "أُرسل عنوان url"
        ])) {
          dismissDialog(dialog);
          return {
            outcome: "accepted",
            gscPageStatus: pageStatus,
            reason: `تم قبول طلب الفهرسة: ${url}`
          };
        }
        if (includesAny(text, ["indexing request rejected", "request rejected", "تم رفض طلب الفهرسة", "تم رفض الطلب"])) {
          dismissDialog(dialog);
          return {
            outcome: "error",
            gscPageStatus: pageStatus,
            reason: `رفض Search Console طلب الفهرسة: ${url}`
          };
        }
        if (isSubmitProblemText(text)) {
          dismissDialog(dialog);
          return {
            outcome: "submit_problem",
            gscPageStatus: pageStatus,
            reason: `أبلغ Search Console عن خطأ أثناء إرسال الطلب: ${url}`
          };
        }
      }
      const bodyText = visibleTextDeep(document.body);
      if (includesAny(bodyText, BODY_QUOTA_NEEDLES)) {
        return {
          outcome: "quota",
          gscPageStatus: pageStatus,
          reason: `تم بلوغ حد الفهرسة اليومي لنطاق ${getDomainKey(url) || "هذا النطاق"}.`,
          domain: getDomainKey(url)
        };
      }
      if (isTestingText(bodyText)) {
        sawActivity = true;
        if (!testingSeen) {
          testingSeen = true;
          lastProgressLogAt = Date.now();
          log("info", "جارٍ انتظار نتيجة الاختبار الحي من Search Console — قد يستغرق دقيقة أو دقيقتين أو أكثر.", runId);
        } else if (Date.now() - lastProgressLogAt > 30e3) {
          lastProgressLogAt = Date.now();
          log("info", `لا يزال الاختبار الحي جاريًا (${Math.round((Date.now() - startedAt) / 1e3)} ثانية من الانتظار حتى الآن).`, runId);
        }
        testingLastSeenAt = Date.now();
        await waitTick(void 0, 1e3);
        continue;
      }
      if (!sawActivity && Date.now() > appearDeadline) {
        return {
          outcome: "error",
          gscPageStatus: pageStatus,
          reason: `لم يظهر مربع تأكيد طلب الفهرسة: ${url}`
        };
      }
      if (testingSeen && Date.now() - testingLastSeenAt > OUTCOME_GRACE_MS) {
        return {
          outcome: "error",
          gscPageStatus: pageStatus,
          reason: `انتهى اختبار الفهرسة دون ظهور تأكيد واضح من Search Console: ${url}`
        };
      }
      await waitTick(void 0, 750);
    }
    return {
      outcome: "error",
      gscPageStatus: pageStatus,
      reason: `انتهت المهلة قبل تأكيد Search Console لطلب الفهرسة: ${url}`
    };
  }
  async function processUrl(item, mode, signal, runId, inspectionAlreadyOpen = false) {
    let pageStatus = "unknown";
    try {
      assertNotCanceled(signal);
      const preSubmitStatus = pageStatusFromText(visibleTextDeep(document.body));
      if (!inspectionAlreadyOpen) {
        const input = await acquireInspectionInput(signal, runId);
        if (!input) {
          return {
            outcome: "error",
            gscPageStatus: "unknown",
            reason: "لم يتم العثور على حقل فحص الروابط في Search Console. كبّر نافذة المتصفح أو اضغط أيقونة البحث في الشريط العلوي لإظهار الحقل، ثم أعد المحاولة."
          };
        }
        log("info", `جارٍ فحص ${item.url}`, runId);
        try {
          if (typeof input.scrollIntoView === "function") input.scrollIntoView({ block: "center" });
        } catch {
        }
        input.focus();
        setInputValue(input, item.url);
        await sleep(250, signal);
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      } else {
        log("info", `استئناف الفحص لـ ${item.url}`, runId);
      }
      const inspection = await waitForInspection(signal, item.url, preSubmitStatus);
      pageStatus = inspection.pageStatus;
      if (pageStatus === "unknown" && mode !== "both") {
        return {
          outcome: "error",
          gscPageStatus: pageStatus,
          reason: `تعذر تحديد ما إذا كان الرابط مفهرسًا في جوجل؛ لم يُرسل أي طلب: ${item.url}`
        };
      }
      if (!shouldRequestForMode(mode, pageStatus)) {
        return {
          outcome: "skipped_mode",
          gscPageStatus: pageStatus,
          reason: modeSkipReason(mode, pageStatus, item.url)
        };
      }
      const requestButton = inspection.requestButton ?? findRequestButton();
      if (!requestButton) {
        return {
          outcome: "error",
          gscPageStatus: pageStatus,
          reason: `إجراء "طلب الفهرسة" غير متاح لهذا الرابط: ${item.url}`
        };
      }
      assertNotCanceled(signal);
      requestButton.click();
      log("info", `تم إرسال طلب الفهرسة لـ ${item.url}؛ في انتظار تأكيد Search Console.`, runId);
      let result = await waitForDialog(item.url, pageStatus, runId);
      let submitRetries = 0;
      while (result.outcome === "submit_problem" && submitRetries < MAX_SUBMIT_RETRIES) {
        submitRetries += 1;
        log("warning", `ظهرت رسالة خطأ أثناء إرسال الطلب لـ ${item.url} — تم إغلاقها، وإعادة المحاولة ${submitRetries}/${MAX_SUBMIT_RETRIES} بعد ${SUBMIT_RETRY_DELAY_SECONDS} ثانية.`, runId);
        await sleep(SUBMIT_RETRY_DELAY_SECONDS * 1e3, signal);
        assertNotCanceled(signal);
        const retryButton = findRequestButton();
        if (!retryButton) {
          return {
            outcome: "error",
            gscPageStatus: pageStatus,
            reason: `زر طلب الفهرسة غير متاح بعد رسالة الخطأ: ${item.url}`
          };
        }
        retryButton.click();
        log("info", `إعادة إرسال طلب الفهرسة لنفس الرابط (${submitRetries}/${MAX_SUBMIT_RETRIES}): ${item.url}`, runId);
        result = await waitForDialog(item.url, pageStatus, runId);
      }
      if (result.outcome === "submit_problem") {
        return {
          outcome: "error",
          gscPageStatus: pageStatus,
          reason: `أبلغ Search Console عن خطأ أثناء إرسال الطلب بعد ${MAX_SUBMIT_RETRIES + 1} محاولات: ${item.url}`
        };
      }
      return result;
    } catch (error) {
      if (error instanceof CanceledError || signal.aborted) {
        return { outcome: "canceled", gscPageStatus: pageStatus, reason: `تم الإيقاف قبل الإرسال: ${item.url}` };
      }
      return { outcome: "error", gscPageStatus: pageStatus, reason: `خطأ أتمتة في ${item.url}: ${errorMessage(error)}` };
    }
  }
  async function runQueue(run, resumeWork) {
    try {
      await waitForPostSuccessResume(run);
      while (!run.controller.signal.aborted && activeRun?.runId === run.runId) {
        const resumed = resumeWork;
        resumeWork = void 0;
        let work;
        if (resumed) {
          work = { success: true, item: resumed.item, operationId: resumed.operationId, indexMode: resumed.indexMode };
        } else {
          const response = await sendMessage({ type: "NEXT_ITEM", runId: run.runId });
          work = response.work;
          if (!response.success || !work?.success) throw new Error(response.error ?? work?.error ?? "تعذر جلب الرابط التالي.");
        }
        if (work.done || !work.item || !work.operationId || !work.indexMode) break;
        const result = await processUrl(work.item, work.indexMode, run.controller.signal, run.runId, Boolean(resumed));
        const reported = await sendMessage({
          type: "REPORT_RESULT",
          runId: run.runId,
          operationId: work.operationId,
          itemId: work.item.id,
          result
        });
        const resultResponse = reported.result;
        if (!reported.success || !resultResponse?.success) break;
        const delaySeconds = result.outcome === "skipped_mode" ? Math.max(SKIPPED_OPERATION_DELAY_SECONDS, resultResponse.delaySeconds) : Math.max(MIN_OPERATION_DELAY_SECONDS, resultResponse.delaySeconds);
        if (result.outcome === "accepted") {
          if (resultResponse.continueRunning) {
            log("info", `انتظار ${delaySeconds} ثانية في الصفحة الرئيسية قبل الرابط التالي.`, run.runId);
          }
          if (await returnToMainPageAfterSuccess(run, delaySeconds, resultResponse.continueRunning)) break;
        }
        if (!resultResponse.continueRunning) break;
        log(
          result.outcome === "quota" ? "warning" : "info",
          result.outcome === "quota" ? `تم بلوغ حد الحصة. انتظار ${delaySeconds} ثانية قبل إعادة المحاولة.` : `انتظار ${delaySeconds} ثانية قبل الرابط التالي.`,
          run.runId
        );
        const waitReason = result.outcome === "quota" ? "quota" : result.outcome === "skipped_mode" ? "skipped" : "pacing";
        await waitWithProgress(run, delaySeconds, waitReason);
      }
    } catch (error) {
      if (!(error instanceof CanceledError) && !run.controller.signal.aborted) {
        log("error", `توقف مشغّل الطابور: ${errorMessage(error)}`, run.runId);
      }
    } finally {
      if (activeRun?.runId === run.runId) {
        activeRun = null;
        stopHeartbeat();
      }
    }
  }
  function startRun(runId, resumeWork) {
    if (activeRun?.runId === runId) return;
    activeRun?.controller.abort();
    activeRun = { runId, controller: new AbortController() };
    startHeartbeat(runId);
    void runQueue(activeRun, resumeWork);
  }
  function stopRun(runId) {
    if (!activeRun) return;
    if (runId && activeRun.runId !== runId) return;
    activeRun.controller.abort();
  }
  function installListener() {
    const marker = "__gscBulkIndexerContentLoaded";
    const markedWindow = window;
    if (markedWindow[marker]) return;
    markedWindow[marker] = true;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      switch (message.type) {
        case "PING":
          sendResponse({ success: true, activeRunId: activeRun?.runId });
          return false;
        case "START_RUN":
          startRun(message.runId);
          sendResponse({ success: true });
          return false;
        case "RESUME_RUN":
          startRun(message.runId, { item: message.item, operationId: message.operationId, indexMode: message.indexMode });
          sendResponse({ success: true });
          return false;
        case "STOP_RUN":
          stopRun(message.runId);
          sendResponse({ success: true });
          return false;
      }
    });
  }
  installListener();
})();
