const QUESTIONS = window.QUESTION_BANK || [];
const STORAGE_KEY = "powerTraderQuizProgressV1";

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

const progress = loadProgress();

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  renderStats();
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

function buildMemoryHint(question, picked = []) {
  const pickedKeys = picked.length ? picked.slice().sort().join("") : "未作答";
  const correctKeys = answerKey(question);
  const correctText = question.answer.map((key) => `${key}、${compactOptionText(optionText(question, key))}`).join("；");
  const pickedText = picked.map((key) => `${key}、${compactOptionText(optionText(question, key))}`).join("；") || "没有选择";
  const content = `${question.question} ${question.options.map((option) => option.text).join(" ")}`;
  const topicThinking = {
    "注册准入": "先判断题目在问准入、变更还是材料。准入看资格和边界，变更看谁的信息发生变化，材料看能被平台或机构审查、留痕的内容。",
    "交易公告与申报": "先抓交易动作：公告是公开规则，申报要按公告时间、价格边界和授权范围执行。越权、绕过审核、系统故障还继续操作，通常不是合规答案。",
    "中长期交易": "先看交割周期和合同属性。年度、月度、月内属于按周期组织，中长期更重合同约束和风险锁定，不要把现货实时逻辑套进去。",
    "现货市场": "先分工：交易机构组织市场，调度机构处理安全约束、机组组合和发电计划。现货价格来自供需和网络约束，不是单纯平均或随意报价。",
    "零售与售电": "先分清电力用户、售电公司、电网企业的责任。零售侧常考合同价格模式，售电公司常考注册、信用、代理用户和变更责任。",
    "结算与电价": "先找结算依据和价格形成机制。峰谷电价看供需强弱，输配电价看监管周期和价格主管部门，结算单看可查询、可下载、可作为依据。",
    "调度与安全校核": "先把交易和调度分开。交易能成交不代表一定能执行，安全校核、调峰调频、发电计划通常要回到调度和系统安全。",
    "信息披露与监管": "先问信息给谁看、由谁披露、谁负责实施。公开信息和监管要求强调及时、真实、完整，不是市场主体随意决定。",
    "需求响应与辅助服务": "先看资源提供的服务类型。需求响应是可调负荷参与市场，辅助服务要看调峰、调频、备用等能力，而不是只看电能量报价。",
    "综合基础": "先抓题干里的主体、动作、限制词。不要先背选项，先判断这件事在市场流程里应该由谁负责、按什么规则办理。"
  };

  const clues = [];
  if (/负责|承担|机构|主体/.test(content)) {
    clues.push("这题先抓主语和职责：交易机构偏市场组织、公告和披露；调度机构偏安全校核和运行安排；电网企业偏供电责任、接入和计量。");
  }
  if (/工作日|提前|期限|周期|每年|月|日|分钟|小时/.test(content)) {
    clues.push("遇到时限题，不要孤立背数字，先把动作归类：注册变更、代理购电告知、安全校核、监管报送，各自有固定流程节点。");
  }
  if (/价格|电价|结算|费用|偏差|均价|峰|谷|出清/.test(content)) {
    clues.push("价格和结算题先判断是市场形成、政府监管还是合同约定。市场形成看供需和出清，监管价格看主管部门和周期，合同约定看双方约束。");
  }
  if (/注册|准入|资质|营业执照|信用|承诺|变更/.test(content)) {
    clues.push("注册资质题优先选择可核验、可公示、可追责的材料或流程；“自动获得”“先进入后整改”“只协商即可”这类跳流程表述要谨慎。");
  }
  if (/合规|违规|不合规|真实|授权|审核|故障|限价/.test(content)) {
    clues.push("合规题先看三条线：是否真实、是否授权、是否在规则边界内。越过授权、突破限价、缺少审核或故障时强行操作，通常应排除。");
  }
  if (question.type === "multi") {
    clues.push("多选题不要凑数量。先把明显越权、不可审计、和题干无关的选项划掉，再保留能同时满足主体、流程和边界的选项。");
  }
  if (question.type === "judge") {
    clues.push("判断题看到“无需、不必、所有、自动、唯一、任何”等绝对词先停一下，再核对它是否真的符合市场流程和责任边界。");
  }

  const contrast = picked.length
    ? `你选的是 ${pickedKeys}（${pickedText}），正确是 ${correctKeys}（${correctText}）。先比较两者的“主体/动作/边界”，错题通常就错在把职责主体或流程节点看混。`
    : `正确是 ${correctKeys}（${correctText}）。先补上题干里的主体、动作和限制条件，再回到选项判断。`;
  const thinking = clues.slice(0, 2).join(" ");
  return {
    contrast,
    method: thinking || topicThinking[question.topic] || topicThinking["综合基础"],
    memory: `记忆抓手：${question.topic}题不要先背字母，先问“谁负责、按什么流程、有没有越权或跳步骤”。`
  };
}

function renderHintHtml(question, picked = []) {
  const hint = buildMemoryHint(question, picked);
  return `
    <div class="memory-hint">
      <strong>思路提示</strong>
      <p>${escapeHtml(hint.contrast)}</p>
      <p>${escapeHtml(hint.method)}</p>
      <p>${escapeHtml(hint.memory)}</p>
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
els.submitBtn.addEventListener("click", submitAnswer);
els.nextBtn.addEventListener("click", nextQuestion);
els.prevBtn.addEventListener("click", prevQuestion);
els.finishBtn.addEventListener("click", finishSession);
els.resetProgressBtn.addEventListener("click", () => {
  if (!confirm("确定清空本浏览器的答题记录吗？")) return;
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
renderStats();
