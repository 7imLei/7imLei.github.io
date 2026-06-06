const QUESTIONS = window.QUESTION_BANK || [];
const STORAGE_KEY = "powerTraderQuizProgressV1";
const USERS_KEY = "powerTraderQuizUsersV1";
const ACTIVE_USER_KEY = "powerTraderQuizActiveUserV1";

const els = {
  modeBtns: Array.from(document.querySelectorAll(".mode-btn")),
  startBtn: document.getElementById("startBtn"),
  questionCount: document.getElementById("questionCount"),
  searchInput: document.getElementById("searchInput"),
  topicSelect: document.getElementById("topicSelect"),
  totalCount: document.getElementById("totalCount"),
  seenCount: document.getElementById("seenCount"),
  wrongCount: document.getElementById("wrongCount"),
  accuracyRate: document.getElementById("accuracyRate"),
  sessionLabel: document.getElementById("sessionLabel"),
  sessionTitle: document.getElementById("sessionTitle"),
  timer: document.getElementById("timer"),
  progressText: document.getElementById("progressText"),
  questionPanel: document.getElementById("questionPanel"),
  summaryPanel: document.getElementById("summaryPanel"),
  submitBtn: document.getElementById("submitBtn"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  finishBtn: document.getElementById("finishBtn"),
  reviewWrongBtn: document.getElementById("reviewWrongBtn"),
  resetProgressBtn: document.getElementById("resetProgressBtn"),
  activeUserLabel: document.getElementById("activeUserLabel"),
  loginForm: document.getElementById("loginForm"),
  nicknameInput: document.getElementById("nicknameInput"),
  challengeInput: document.getElementById("challengeInput"),
  answerInput: document.getElementById("answerInput"),
  loginMessage: document.getElementById("loginMessage"),
  accountInfo: document.getElementById("accountInfo"),
  accountName: document.getElementById("accountName"),
  logoutBtn: document.getElementById("logoutBtn"),
};

let activeMode = "practice";
let timerId = null;
let session = {
  mode: "practice",
  queue: [],
  index: 0,
  answers: {},
  submitted: {},
  startedAt: null,
  finished: false,
};

let users = loadUsers();
let activeUserId = loadActiveUserId();
let progress = getActiveProgress();

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function loadUsers() {
  return loadJson(USERS_KEY, {});
}

function saveUsers() {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function loadActiveUserId() {
  const userId = localStorage.getItem(ACTIVE_USER_KEY);
  return userId && users[userId] ? userId : "";
}

function getActiveProgress() {
  return activeUserId && users[activeUserId] ? users[activeUserId].progress || {} : {};
}

function saveProgress() {
  if (!activeUserId || !users[activeUserId]) return;
  users[activeUserId].progress = progress;
  saveUsers();
  renderStats();
}

function normalizeNickname(value) {
  return String(value || "").trim();
}

function userIdFromNickname(value) {
  return normalizeNickname(value).toLowerCase();
}

function normalizeAnswer(value) {
  return String(value || "").trim().toLowerCase();
}

function hashAnswer(value) {
  let hash = 2166136261;
  const text = normalizeAnswer(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0);
}

function getLegacyProgress() {
  return loadJson(STORAGE_KEY, {});
}

function applyActiveUser(userId) {
  activeUserId = userId;
  progress = getActiveProgress();
  if (userId) localStorage.setItem(ACTIVE_USER_KEY, userId);
  else localStorage.removeItem(ACTIVE_USER_KEY);
  stopTimer();
  session = {
    mode: "practice",
    queue: [],
    index: 0,
    answers: {},
    submitted: {},
    startedAt: null,
    finished: false,
  };
  els.summaryPanel.hidden = true;
  renderAccount();
  renderStats();
  renderQuestionShell();
}

function renderAccount() {
  const user = activeUserId ? users[activeUserId] : null;
  const loggedIn = Boolean(user);
  els.activeUserLabel.textContent = loggedIn ? `当前：${user.nickname}` : "未登录";
  els.loginForm.hidden = loggedIn;
  els.accountInfo.hidden = !loggedIn;
  els.accountName.textContent = loggedIn ? user.nickname : "未登录";
  els.startBtn.disabled = !loggedIn;
  els.reviewWrongBtn.disabled = !loggedIn;
  els.resetProgressBtn.disabled = !loggedIn;
  if (loggedIn) {
    els.loginMessage.textContent = "答题记录会保存到这个账户。";
  } else {
    updateLoginPrompt();
  }
}

function updateLoginPrompt() {
  if (activeUserId) return;
  const userId = userIdFromNickname(els.nicknameInput.value);
  const user = users[userId];
  if (user?.question && user?.answerHash) {
    els.challengeInput.value = user.question;
    els.challengeInput.disabled = true;
    els.challengeInput.dataset.lockedFor = userId;
    els.loginMessage.textContent = "回答上面的问题即可登录。";
    return;
  }
  if (els.challengeInput.dataset.lockedFor) {
    els.challengeInput.value = "";
    delete els.challengeInput.dataset.lockedFor;
  }
  els.challengeInput.disabled = false;
  els.loginMessage.textContent = "新账户先设置登录问题和答案；已有账户输入昵称后会显示问题。";
}

function loginAccount(event) {
  event.preventDefault();
  const nickname = normalizeNickname(els.nicknameInput.value);
  const question = String(els.challengeInput.value || "").trim();
  const answer = normalizeAnswer(els.answerInput.value);
  const userId = userIdFromNickname(nickname);

  if (!nickname || !answer) {
    els.loginMessage.textContent = "昵称和答案都要填写。";
    return;
  }
  if (nickname.length > 20 || question.length > 40 || answer.length > 32) {
    els.loginMessage.textContent = "昵称最多 20 个字，问题最多 40 个字，答案最多 32 个字。";
    return;
  }

  const answerHash = hashAnswer(answer);
  if (users[userId]?.answerHash && users[userId].answerHash !== answerHash) {
    els.loginMessage.textContent = "答案不对，请重新输入。";
    return;
  }

  if (!users[userId]) {
    if (!question) {
      els.loginMessage.textContent = "新账户要先设置一个登录问题。";
      return;
    }
    const legacyProgress = getLegacyProgress();
    users[userId] = {
      nickname,
      question,
      answerHash,
      progress: Object.keys(legacyProgress).length ? legacyProgress : {},
      createdAt: Date.now(),
    };
    saveUsers();
  } else if (!users[userId].answerHash) {
    if (!question) {
      els.loginMessage.textContent = "这个账户需要先补一个登录问题。";
      return;
    }
    users[userId].question = question;
    users[userId].answerHash = answerHash;
    saveUsers();
  }

  els.nicknameInput.value = "";
  els.challengeInput.value = "";
  els.challengeInput.disabled = false;
  delete els.challengeInput.dataset.lockedFor;
  els.answerInput.value = "";
  applyActiveUser(userId);
}

function logoutAccount() {
  applyActiveUser("");
}

function selectedValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value);
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function filteredQuestions() {
  const sources = selectedValues("source");
  const types = selectedValues("type");
  const topic = els.topicSelect.value;
  const keyword = normalizeText(els.searchInput.value);

  return QUESTIONS.filter((question) => {
    if (!sources.includes(question.source)) return false;
    if (!types.includes(question.type)) return false;
    if (topic && question.topic !== topic) return false;
    if (!keyword) return true;
    const content = [
      question.question,
      question.source,
      question.typeLabel,
      question.topic,
      ...question.options.map((option) => option.text),
    ].join(" ");
    return normalizeText(content).includes(keyword);
  });
}

function shuffle(items) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function buildQueue(mode) {
  if (mode === "mock") {
    return QUESTIONS.filter((question) => question.source === "样卷").sort((a, b) => {
      const order = { single: 1, multi: 2, judge: 3 };
      return order[a.type] - order[b.type] || a.number - b.number;
    });
  }
  if (mode === "wrong") {
    return QUESTIONS.filter((question) => progress[question.id]?.wrong > 0).sort((a, b) => {
      const aw = progress[a.id]?.wrong || 0;
      const bw = progress[b.id]?.wrong || 0;
      return bw - aw;
    });
  }
  const pool = filteredQuestions();
  if (mode === "full") return pool;
  const count = Math.max(5, Math.min(Number(els.questionCount.value) || 20, pool.length));
  return shuffle(pool).slice(0, count);
}

function startSession(mode = activeMode) {
  if (!activeUserId) {
    renderQuestionShell();
    els.loginMessage.textContent = "先登录账户，再开始刷题。";
    return;
  }
  const queue = buildQueue(mode);
  if (!queue.length) {
    els.questionPanel.className = "question-panel empty";
    els.questionPanel.innerHTML = `<div class="empty-state"><h2>当前筛选没有题目。</h2><p>放宽来源、题型或关键词后再开始。</p></div>`;
    return;
  }
  stopTimer();
  session = {
    mode,
    queue,
    index: 0,
    answers: {},
    submitted: {},
    startedAt: Date.now(),
    finished: false,
  };
  els.summaryPanel.hidden = true;
  startTimer();
  renderQuestion();
  if (window.matchMedia("(max-width: 640px)").matches) {
    requestAnimationFrame(() => {
      els.sessionLabel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

function renderQuestionShell() {
  els.questionPanel.className = "question-panel empty";
  els.questionPanel.innerHTML = activeUserId
    ? `<div class="empty-state"><h2>选择模式后开始。</h2><p>当前账户的答题记录会单独保存。</p></div>`
    : `<div class="empty-state"><h2>先登录账户，再开始刷题。</h2><p>输入昵称并答对自己的登录问题后，每个人会看到自己的题库记录。</p></div>`;
  els.sessionLabel.textContent = activeUserId ? "未开始" : "未登录";
  els.sessionTitle.textContent = activeUserId ? "选择模式后开始" : "登录后开始";
  els.progressText.textContent = "0 / 0";
  els.timer.textContent = "00:00";
  els.prevBtn.disabled = true;
  els.nextBtn.disabled = true;
  els.submitBtn.disabled = true;
  els.finishBtn.style.display = "none";
}

function currentQuestion() {
  return session.queue[session.index];
}

function answerKey(question) {
  return question.answer.slice().sort().join("");
}

function selectedKey(question) {
  return (session.answers[question.id] || []).slice().sort().join("");
}

function isCorrect(question) {
  return selectedKey(question) === answerKey(question);
}

function setSelected(question, key) {
  if (session.finished) return;
  const current = session.answers[question.id] || [];
  if (question.type === "multi") {
    session.answers[question.id] = current.includes(key) ? current.filter((item) => item !== key) : current.concat(key);
  } else {
    session.answers[question.id] = [key];
  }
  renderQuestion();
}

function submitAnswer() {
  const question = currentQuestion();
  if (!question || !(session.answers[question.id] || []).length) return;
  session.submitted[question.id] = true;
  if (session.mode === "mock") {
    renderQuestion();
    return;
  }
  recordAnswer(question, isCorrect(question));
  renderQuestion();
}

function recordAnswer(question, correct) {
  const item = progress[question.id] || { seen: 0, correct: 0, wrong: 0 };
  item.seen += 1;
  if (correct) item.correct += 1;
  else item.wrong += 1;
  item.lastAt = Date.now();
  progress[question.id] = item;
  saveProgress();
}

function optionText(question, key) {
  return question.options.find((option) => option.key === key)?.text || "";
}

function compactOptionText(text) {
  return text.length > 48 ? `${text.slice(0, 48)}...` : text;
}

function buildMemoryHint(question) {
  const correctText = question.answer.map((key) => `${key}、${compactOptionText(optionText(question, key))}`).join("；");
  const content = `${question.question} ${question.options.map((option) => option.text).join(" ")}`;
  const topicHints = {
    "注册准入": {
      point: "注册准入题记住“材料可核验、流程要留痕、变更要同步”。",
      example: "例：售电公司信息变化，不能只内部改资料，要向交易机构申请变更。"
    },
    "交易公告与申报": {
      point: "公告看公开规则，申报看时间、价格边界和授权。",
      example: "例：停复牌申报要按平台要求填日期、原因和附件，不能默认系统自动处理。"
    },
    "中长期交易": {
      point: "中长期交易记“按周期签合同，用合同锁风险”。",
      example: "例：年度、月度、月内交易都按交割周期组织，不要套现货实时出清逻辑。"
    },
    "现货市场": {
      point: "现货市场记“交易机构管市场，调度机构管安全运行”。",
      example: "例：信息披露实施偏交易机构，安全校核和发电计划偏调度机构。"
    },
    "零售与售电": {
      point: "零售与售电题先记三类主体：用户、售电公司、电网企业。",
      example: "例：用户侧看用电和合同，售电公司看代理、信用和披露，电网企业看供电责任。"
    },
    "结算与电价": {
      point: "结算与电价题记“价格来源不同，判断口径不同”。",
      example: "例：市场价格看出清，输配电价看监管，合同价格看双方约定。"
    },
    "调度与安全校核": {
      point: "调度题记“成交不等于能执行，安全校核是底线”。",
      example: "例：交易结果出来后，还要看电网约束、调峰调频和发电计划。"
    },
    "信息披露与监管": {
      point: "信息披露题记“及时、真实、完整、按规定格式”。",
      example: "例：公开信息不能由市场主体随意决定格式和时间，要按监管要求披露。"
    },
    "需求响应与辅助服务": {
      point: "需求响应看可调负荷，辅助服务看调峰、调频、备用能力。",
      example: "例：削峰填谷属于负荷响应，备用和调频属于系统辅助服务。"
    },
    "综合基础": {
      point: "综合题先记主体、动作、限制词。",
      example: "例：看到“无需、所有、自动、任何”这类绝对说法，优先核对规则边界。"
    }
  };

  const clues = [];
  if (/负责|承担|机构|主体/.test(content)) {
    clues.push({
      point: "职责题记住三分工：交易机构管市场，调度机构管运行，电网企业管接入和供电。",
      example: "例：问安全校核多半找调度机构，问信息披露实施多半找交易机构。"
    });
  }
  if (/工作日|提前|期限|周期|每年|月|日|分钟|小时/.test(content)) {
    clues.push({
      point: "时限题不要单背数字，先记它属于哪类动作。",
      example: "例：注册变更、代理购电告知、监管报送分别对应自己的固定办理节点。"
    });
  }
  if (/价格|电价|结算|费用|偏差|均价|峰|谷|出清/.test(content)) {
    clues.push({
      point: "价格题记三来源：市场出清、政府监管、合同约定。",
      example: "例：峰谷和出清看市场供需，输配电价看监管，固定价格看合同。"
    });
  }
  if (/注册|准入|资质|营业执照|信用|承诺|变更/.test(content)) {
    clues.push({
      point: "注册资质题记“可核验、可公示、可追责”。",
      example: "例：营业执照、信用承诺、资质材料都要能审查留痕；“先进入后整改”通常不对。"
    });
  }
  if (/合规|违规|不合规|真实|授权|审核|故障|限价/.test(content)) {
    clues.push({
      point: "合规题记三条线：真实、授权、规则边界。",
      example: "例：越权操作、突破限价、故障时强行申报，基本都要排除。"
    });
  }
  if (question.type === "multi") {
    clues.push({
      point: "多选题记“宁可按规则筛，不靠凑个数”。",
      example: "例：能同时符合主体、流程、边界的留下，越权或无关的划掉。"
    });
  }
  if (question.type === "judge") {
    clues.push({
      point: "判断题记“绝对词先警惕”。",
      example: "例：看到“无需、不必、所有、自动、任何”，先回到规则边界核对。"
    });
  }

  const hint = clues[0] || topicHints[question.topic] || topicHints["综合基础"];
  return {
    point: hint.point,
    example: `${hint.example} 本题记：${correctText}。`
  };
}

function renderHintHtml(question) {
  const hint = buildMemoryHint(question);
  return `
    <div class="memory-hint">
      <strong>记忆提示</strong>
      <p><b>记忆点：</b>${escapeHtml(hint.point)}</p>
      <p><b>例子：</b>${escapeHtml(hint.example)}</p>
    </div>
  `;
}

function renderQuestion() {
  const question = currentQuestion();
  if (!question) return;
  const selected = session.answers[question.id] || [];
  const submitted = Boolean(session.submitted[question.id]);
  const examLike = session.mode === "mock";

  els.questionPanel.className = "question-panel";
  els.sessionLabel.textContent = session.mode === "mock" ? "样卷模拟" : session.mode === "wrong" ? "错题重练" : session.mode === "full" ? "全量刷题" : "随机练习";
  els.sessionTitle.textContent = `${question.typeLabel} ${session.index + 1}`;
  els.progressText.textContent = `${session.index + 1} / ${session.queue.length}`;

  const optionsHtml = question.options.map((option) => {
    const isSelected = selected.includes(option.key);
    const isAnswer = question.answer.includes(option.key);
    const isWrongPick = submitted && isSelected && !isAnswer;
    const classes = ["option"];
    if (isSelected) classes.push("selected");
    if (submitted && isAnswer && !examLike) classes.push("correct");
    if (submitted && isWrongPick && !examLike) classes.push("incorrect");
    return `
      <button class="${classes.join(" ")}" type="button" data-option="${option.key}">
        <span class="option-key">${option.key}</span>
        <span>${escapeHtml(option.text)}</span>
      </button>
    `;
  }).join("");

  const feedback = submitted && !examLike ? `
    <div class="feedback">
      <strong>${isCorrect(question) ? "答对了" : "答错了"}</strong>
      <span> 正确答案：${answerKey(question)}</span>
      ${isCorrect(question) ? "" : renderHintHtml(question, selected)}
    </div>
  ` : "";

  els.questionPanel.innerHTML = `
    <div class="question-head">
      <div class="pill-row">
        <span class="pill">${question.source}</span>
        <span class="pill">${question.typeLabel}</span>
        <span class="pill">${question.topic}</span>
      </div>
      <span class="pill">原题号 ${question.number}</span>
    </div>
    <p class="question-text">${escapeHtml(question.question)}</p>
    <div class="options">${optionsHtml}</div>
    ${feedback}
  `;

  els.questionPanel.querySelectorAll("[data-option]").forEach((button) => {
    button.addEventListener("click", () => setSelected(question, button.dataset.option));
  });

  els.prevBtn.disabled = session.index === 0;
  els.nextBtn.disabled = session.index >= session.queue.length - 1;
  els.submitBtn.disabled = submitted || !(session.answers[question.id] || []).length || session.finished;
  els.submitBtn.textContent = examLike ? "保存答案" : submitted ? "已提交" : "提交答案";
  els.finishBtn.style.display = session.mode === "mock" ? "inline-block" : "none";
}

function nextQuestion() {
  if (session.index < session.queue.length - 1) {
    session.index += 1;
    renderQuestion();
  } else if (session.mode !== "mock") {
    finishSession();
  }
}

function prevQuestion() {
  if (session.index > 0) {
    session.index -= 1;
    renderQuestion();
  }
}

function finishSession() {
  if (!session.queue.length) return;
  session.finished = true;
  stopTimer();
  let correct = 0;
  let answered = 0;
  let score = 0;
  let fullScore = 0;
  const wrongItems = [];

  session.queue.forEach((question) => {
    const picked = session.answers[question.id] || [];
    const didAnswer = picked.length > 0;
    const ok = didAnswer && picked.slice().sort().join("") === answerKey(question);
    const value = question.type === "multi" ? 1 : 0.5;
    fullScore += value;
    if (didAnswer) answered += 1;
    if (ok) {
      correct += 1;
      score += value;
    } else {
      wrongItems.push(question);
    }
    if (session.mode === "mock" && didAnswer) {
      recordAnswer(question, ok);
    }
  });

  els.summaryPanel.hidden = false;
  els.summaryPanel.innerHTML = `
    <h2>本次结果</h2>
    <div class="summary-grid">
      <div class="summary-item"><span>得分</span><strong>${formatScore(score)} / ${formatScore(fullScore)}</strong></div>
      <div class="summary-item"><span>答题</span><strong>${answered} / ${session.queue.length}</strong></div>
      <div class="summary-item"><span>正确</span><strong>${correct}</strong></div>
      <div class="summary-item"><span>正确率</span><strong>${session.queue.length ? Math.round((correct / session.queue.length) * 100) : 0}%</strong></div>
    </div>
    ${wrongItems.length ? `<h3>需要回看</h3><div class="wrong-list">${wrongItems.slice(0, 20).map((question) => `
      <div class="wrong-item">
        <p>${escapeHtml(question.question)}</p>
        <small>${question.source} / ${question.typeLabel} / 正确答案 ${answerKey(question)}</small>
        ${renderHintHtml(question, session.answers[question.id] || [])}
      </div>
    `).join("")}</div>` : `<p>本次没有错题。</p>`}
  `;
  els.summaryPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  renderQuestion();
}

function formatScore(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function renderStats() {
  const entries = Object.values(progress);
  const seen = entries.filter((item) => item.seen > 0).length;
  const wrong = entries.filter((item) => item.wrong > 0).length;
  const attempts = entries.reduce((sum, item) => sum + item.seen, 0);
  const correct = entries.reduce((sum, item) => sum + item.correct, 0);
  els.totalCount.textContent = QUESTIONS.length;
  els.seenCount.textContent = seen;
  els.wrongCount.textContent = wrong;
  els.accuracyRate.textContent = attempts ? `${Math.round((correct / attempts) * 100)}%` : "0%";
}

function populateTopics() {
  const topics = Array.from(new Set(QUESTIONS.map((question) => question.topic))).sort((a, b) => a.localeCompare(b, "zh-CN"));
  topics.forEach((topic) => {
    const option = document.createElement("option");
    option.value = topic;
    option.textContent = topic;
    els.topicSelect.appendChild(option);
  });
}

function startTimer() {
  renderTimer();
  timerId = setInterval(renderTimer, 1000);
}

function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}

function renderTimer() {
  if (!session.startedAt) {
    els.timer.textContent = "00:00";
    return;
  }
  const seconds = Math.floor((Date.now() - session.startedAt) / 1000);
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  els.timer.textContent = `${mins}:${secs}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.modeBtns.forEach((button) => {
  button.addEventListener("click", () => {
    activeMode = button.dataset.mode;
    els.modeBtns.forEach((item) => item.classList.toggle("active", item === button));
  });
});

els.startBtn.addEventListener("click", () => startSession(activeMode));
els.reviewWrongBtn.addEventListener("click", () => startSession("wrong"));
els.loginForm.addEventListener("submit", loginAccount);
els.nicknameInput.addEventListener("input", updateLoginPrompt);
els.logoutBtn.addEventListener("click", logoutAccount);
els.submitBtn.addEventListener("click", submitAnswer);
els.nextBtn.addEventListener("click", nextQuestion);
els.prevBtn.addEventListener("click", prevQuestion);
els.finishBtn.addEventListener("click", finishSession);
els.resetProgressBtn.addEventListener("click", () => {
  if (!activeUserId) return;
  if (!confirm("确定清空当前账户的答题记录吗？")) return;
  Object.keys(progress).forEach((key) => delete progress[key]);
  saveProgress();
});

document.addEventListener("keydown", (event) => {
  const question = currentQuestion();
  if (!question) return;
  const key = event.key.toUpperCase();
  if (/^[A-E]$/.test(key) && question.options.some((option) => option.key === key)) {
    setSelected(question, key);
  }
  if (event.key === "Enter") submitAnswer();
  if (event.key === "ArrowRight") nextQuestion();
  if (event.key === "ArrowLeft") prevQuestion();
});

populateTopics();
renderAccount();
renderStats();
renderQuestionShell();
