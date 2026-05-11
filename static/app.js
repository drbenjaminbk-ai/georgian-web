const state = {
  mode: null,
  title: "Выберите экзамен или раздел",
  questions: [],
  current: 0,
  score: 0,
  answered: new Map(),
  mistakes: [],
};

let staticSite = null;

const els = {
  count: document.querySelector("#question-count"),
  sections: document.querySelector("#sections"),
  exam: document.querySelector("#exam-button"),
  reset: document.querySelector("#reset-button"),
  title: document.querySelector("#screen-title"),
  mode: document.querySelector("#mode-label"),
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

function resetSession() {
  state.mode = null;
  state.title = "Выберите экзамен или раздел";
  state.questions = [];
  state.current = 0;
  state.score = 0;
  state.answered = new Map();
  state.mistakes = [];
  document.querySelectorAll(".section-button").forEach((button) => {
    button.classList.remove("active");
  });
  render();
}

async function startExam() {
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
  const total = state.questions.length;
  const answeredCount = state.answered.size;
  els.title.textContent = state.title;
  els.mode.textContent = state.mode === "exam" ? "Экзаменационный режим" : "Учебный режим";
  els.score.textContent = `${state.score} / ${total}`;
  els.progress.style.width = total ? `${(answeredCount / total) * 100}%` : "0%";
  els.prev.disabled = state.current === 0 || total === 0;
  els.next.disabled = total === 0;
  els.next.textContent = total && state.current === total - 1 ? "Итог" : "Дальше";

  if (!total) {
    els.panel.innerHTML = `
      <div class="empty-state">
        <div class="georgian-strip" aria-hidden="true">
          <span>ა</span><span>ბ</span><span>გ</span><span>დ</span>
        </div>
        <p>Здесь появится вопрос. В экзамене будет 10 случайных заданий, в учебе - все вопросы выбранного раздела.</p>
      </div>
    `;
    return;
  }

  renderQuestion();
}

function renderQuestion() {
  const question = state.questions[state.current];
  const answered = state.answered.get(state.current);
  const hint = state.mode === "study" && question.hint
    ? `<div class="hint">${escapeHtml(question.hint)}</div>`
    : "";
  const feedback = answered ? renderFeedback(question, answered) : "";

  const answers = question.opts.map((option, index) => {
    let statusClass = "";
    if (answered && index === question.ans) {
      statusClass = " correct";
    } else if (answered && index === answered.choice) {
      statusClass = " wrong";
    }

    return `
      <button class="answer${statusClass}" type="button" data-choice="${index}" ${answered ? "disabled" : ""}>
        <span class="answer-letter">${letters[index]}</span>
        <span>${escapeHtml(option)}</span>
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

  render();
}

els.exam.addEventListener("click", startExam);
els.reset.addEventListener("click", resetSession);
els.prev.addEventListener("click", () => move(-1));
els.next.addEventListener("click", next);

init().catch((error) => {
  els.panel.innerHTML = `<div class="feedback wrong">Не получилось загрузить приложение: ${escapeHtml(error.message)}</div>`;
});
