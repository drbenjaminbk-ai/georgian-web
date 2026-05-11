const state = {
  view: "home",
  mode: null,
  studyView: "normal",
  title: "Выберите режим",
  questions: [],
  current: 0,
  score: 0,
  answered: new Map(),
  mistakes: [],
};

let staticSite = null;

const els = {
  home: document.querySelector("#home-screen"),
  languageApp: document.querySelector("#language-app"),
  languageCard: document.querySelector("#language-card"),
  languageCount: document.querySelector("#language-count"),
  count: document.querySelector("#question-count"),
  sections: document.querySelector("#sections"),
  exam: document.querySelector("#exam-button"),
  study: document.querySelector("#study-button"),
  homeButton: document.querySelector("#home-button"),
  title: document.querySelector("#screen-title"),
  mode: document.querySelector("#mode-label"),
  studyTools: document.querySelector("#study-tools"),
  score: document.querySelector("#score"),
  panel: document.querySelector("#question-panel"),
  progress: document.querySelector("#progress-bar"),
  prev: document.querySelector("#prev-button"),
  next: document.querySelector("#next-button"),
};

const letters = ["ა", "ბ", "გ", "დ"];

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

async function getFirstJson(urls) {
  let lastError = null;
  for (const url of urls) {
    try {
      return await getJson(url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showHome() {
  resetLanguageState();
  state.view = "home";
  els.home.classList.remove("is-hidden");
  els.languageApp.classList.add("is-hidden");
}

function showLanguage() {
  state.view = "language";
  els.home.classList.add("is-hidden");
  els.languageApp.classList.remove("is-hidden");
  render();
}

function resetLanguageState() {
  state.mode = null;
  state.studyView = "normal";
  state.title = "Выберите режим";
  state.questions = [];
  state.current = 0;
  state.score = 0;
  state.answered = new Map();
  state.mistakes = [];
  document.querySelectorAll(".section-button").forEach((button) => {
    button.classList.remove("active");
  });
  els.sections.classList.remove("visible");
  els.exam.classList.remove("active");
  els.study.classList.remove("active");
  updateStudyTools();
}

function setActiveMode(mode) {
  els.exam.classList.toggle("active", mode === "exam");
  els.study.classList.toggle("active", mode === "study");
}

async function startExam() {
  resetLanguageState();
  state.mode = "exam";
  setActiveMode("exam");

  if (staticSite) {
    const questions = staticSite.sections
      .filter((section) => section.questions.length)
      .map((section) => {
        const index = Math.floor(Math.random() * section.questions.length);
        return section.questions[index];
      });
    startSession("exam", "Экзамен", questions);
    return;
  }

  const data = await getJson("api/exam");
  startSession("exam", "Экзамен", data.questions);
}

function showStudyMode() {
  resetLanguageState();
  state.mode = "study-select";
  state.studyView = "normal";
  state.title = "Режим обучения";
  setActiveMode("study");
  els.sections.classList.add("visible");
  render();
}

function setStudyView(view) {
  state.studyView = view;
  updateStudyTools();
  render();
}

function updateStudyTools() {
  const visible = state.mode === "study" || state.mode === "study-select";
  els.studyTools.classList.toggle("is-hidden", !visible);
  els.studyTools.querySelectorAll(".tool-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.studyView === state.studyView);
  });
}

async function startSection(section, name, button) {
  let questions = null;
  if (staticSite) {
    questions = staticSite.sections.find((item) => item.id === section)?.questions;
  } else {
    const data = await getJson(`api/section/${encodeURIComponent(section)}`);
    questions = data.questions;
  }

  document.querySelectorAll(".section-button").forEach((item) => {
    item.classList.remove("active");
  });
  button.classList.add("active");
  setActiveMode("study");
  startSession("study", name, questions || []);
}

function startSession(mode, title, questions) {
  state.mode = mode;
  state.title = title;
  state.questions = questions;
  state.current = 0;
  state.score = 0;
  state.answered = new Map();
  state.mistakes = [];
  render();
}

function answerQuestion(choice) {
  const question = state.questions[state.current];
  if (!question || state.answered.has(state.current)) {
    return;
  }

  const correct = choice === question.ans;
  state.answered.set(state.current, { choice, correct });

  if (correct) {
    state.score += 1;
  } else {
    state.mistakes.push({ question, choice });
  }

  render();
}

function move(delta) {
  const next = state.current + delta;
  if (next < 0 || next >= state.questions.length) {
    return;
  }
  state.current = next;
  render();
}

function next() {
  if (state.questions.length && state.current === state.questions.length - 1) {
    renderSummary();
    return;
  }
  move(1);
}

function render() {
  if (state.view === "home") {
    return;
  }

  const total = state.questions.length;
  const answeredCount = state.answered.size;
  updateStudyTools();
  els.title.textContent = state.title;
  els.mode.textContent = modeLabel();
  els.score.textContent = `${state.score} / ${total}`;
  els.progress.style.width = total ? `${(answeredCount / total) * 100}%` : "0%";
  els.prev.disabled = state.current === 0 || total === 0;
  els.next.disabled = total === 0;
  els.next.textContent = total && state.current === total - 1 ? "Итог" : "Дальше";

  if (!total) {
    const emptyText = state.mode === "study-select"
      ? "Выберите тему в левом меню, чтобы пройти все вопросы этого раздела."
      : "Выберите экзамен или режим обучения. В экзамене будет 10 случайных заданий, в обучении можно пройти вопросы по отдельным темам.";
    els.panel.innerHTML = `
      <div class="empty-state">
        <div class="georgian-strip" aria-hidden="true">
          <span>ა</span><span>ბ</span><span>გ</span><span>დ</span>
        </div>
        <p>${emptyText}</p>
      </div>
    `;
    return;
  }

  renderQuestion();
}

function modeLabel() {
  if (state.mode === "exam") {
    return "Экзамен";
  }
  if (state.mode === "study" || state.mode === "study-select") {
    return "Режим обучения";
  }
  return "Грузинский язык";
}

function renderQuestion() {
  const question = state.questions[state.current];
  const answered = state.answered.get(state.current);
  const translation = question.translation || {};
  const hint = renderStudyAid(question, translation);
  const feedback = answered ? renderFeedback(question, answered) : "";

  const answers = question.opts.map((option, index) => {
    let statusClass = "";
    if (answered && index === question.ans) {
      statusClass = " correct";
    } else if (answered && index === answered.choice) {
      statusClass = " wrong";
    }

    const translationText = state.mode === "study" && state.studyView === "translation" && translation.opts_ru?.[index]
      ? `<small class="answer-translation">${escapeHtml(translation.opts_ru[index])}</small>`
      : "";

    return `
      <button class="answer${statusClass}" type="button" data-choice="${index}" ${answered ? "disabled" : ""}>
        <span class="answer-letter">${letters[index]}</span>
        <span>${escapeHtml(option)}${translationText}</span>
      </button>
    `;
  }).join("");

  els.panel.innerHTML = `
    <div class="question-meta">
      <span class="pill">Вопрос ${state.current + 1} / ${state.questions.length}</span>
      <span>${escapeHtml(question.id)}</span>
      <span>${escapeHtml(question.sectionName)}</span>
    </div>
    <div class="question-text">${escapeHtml(question.question)}</div>
    ${hint}
    <div class="answers">${answers}</div>
    ${feedback}
  `;

  els.panel.querySelectorAll(".answer").forEach((button) => {
    button.addEventListener("click", () => answerQuestion(Number(button.dataset.choice)));
  });
}

function renderStudyAid(question, translation) {
  if (state.mode !== "study") {
    return "";
  }

  if (state.studyView === "translation") {
    if (!translation.question_ru) {
      return `<div class="hint">Для этого вопроса полный перевод пока не добавлен.</div>`;
    }
    const bridge = translation.answer_bridge
      ? `<p><b>Связка:</b> ${escapeHtml(translation.answer_bridge)}</p>`
      : "";
    return `
      <div class="translation-box">
        <p><b>Перевод:</b> ${escapeHtml(translation.question_ru)}</p>
        ${translation.key ? `<p><b>Ключ:</b> ${escapeHtml(stripLeadLabel(translation.key, "Ключ"))}</p>` : ""}
        ${bridge}
      </div>
    `;
  }

  if (state.studyView === "keys") {
    const key = translation.key || question.hint;
    const bridge = translation.answer_bridge || question.rule;
    if (!key && !bridge) {
      return `<div class="hint">Для этого вопроса ключ пока не добавлен.</div>`;
    }
    return `
      <div class="key-box">
        ${key ? `<p><b>Ключ:</b> ${escapeHtml(stripLeadLabel(key, "Ключ"))}</p>` : ""}
        ${bridge ? `<p><b>Как выбрать ответ:</b> ${escapeHtml(bridge)}</p>` : ""}
      </div>
    `;
  }

  if (question.hint) {
    return `<div class="hint">${escapeHtml(question.hint)}</div>`;
  }
  return "";
}

function stripLeadLabel(text, label) {
  return String(text).replace(new RegExp(`^${label}:\\s*`, "i"), "");
}

function renderFeedback(question, answered) {
  const correctText = `${letters[question.ans]}) ${question.opts[question.ans]}`;
  if (answered.correct) {
    const rule = state.mode === "study" && question.rule
      ? `<br><br>${escapeHtml(question.rule)}`
      : "";
    return `<div class="feedback correct">Правильно: <b>${escapeHtml(correctText)}</b>${rule}</div>`;
  }

  const chosen = letters[answered.choice];
  const rule = state.mode === "study" && question.rule
    ? `<br><br>${escapeHtml(question.rule)}`
    : "";
  return `<div class="feedback wrong">Неверно, выбран ответ ${chosen}. Правильно: <b>${escapeHtml(correctText)}</b>${rule}</div>`;
}

function renderSummary() {
  const total = state.questions.length;
  const mistakes = state.mistakes.map(({ question, choice }) => `
    <div class="mistake">
      <b>${escapeHtml(question.id)}</b> ${escapeHtml(question.question)}<br>
      Ваш ответ: ${letters[choice]}. Правильно: ${letters[question.ans]}) ${escapeHtml(question.opts[question.ans])}
    </div>
  `).join("");

  els.title.textContent = "Результат";
  els.mode.textContent = state.mode === "exam" ? "Экзамен завершен" : "Раздел завершен";
  els.progress.style.width = "100%";
  els.next.disabled = true;
  els.panel.innerHTML = `
    <div class="summary">
      <div class="summary-score">${state.score} / ${total}</div>
      <p>${state.score === total ? "Все ответы верные." : `Ошибок: ${state.mistakes.length}.`}</p>
      ${mistakes ? `<div class="mistakes">${mistakes}</div>` : ""}
    </div>
  `;
}

async function init() {
  const data = await getFirstJson(["api/bootstrap", "data/site.json"]);
  staticSite = data.sections.some((section) => Array.isArray(section.questions)) ? data : null;
  els.count.textContent = `${data.total} вопросов`;
  els.languageCount.textContent = `${data.total} вопросов`;
  els.sections.innerHTML = data.sections.map((section, index) => `
    <button class="section-button" type="button" data-section="${section.id}" data-name="${escapeHtml(section.name)}">
      <span class="section-number">${index + 1}</span>
      <span class="section-name">${escapeHtml(section.name)}</span>
      <span class="section-count">${section.count}</span>
    </button>
  `).join("");

  els.sections.querySelectorAll(".section-button").forEach((button) => {
    button.addEventListener("click", () => {
      startSection(button.dataset.section, button.dataset.name, button);
    });
  });

  showHome();
}

els.exam.addEventListener("click", startExam);
els.study.addEventListener("click", showStudyMode);
els.homeButton.addEventListener("click", showHome);
els.languageCard.addEventListener("click", showLanguage);
els.studyTools.querySelectorAll(".tool-button").forEach((button) => {
  button.addEventListener("click", () => setStudyView(button.dataset.studyView));
});
els.prev.addEventListener("click", () => move(-1));
els.next.addEventListener("click", next);

init().catch((error) => {
  els.panel.innerHTML = `<div class="feedback wrong">Не получилось загрузить приложение: ${escapeHtml(error.message)}</div>`;
});
