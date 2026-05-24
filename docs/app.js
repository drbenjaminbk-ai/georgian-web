const state = {
  view: "home",
  subject: "language",
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
let bootstrapData = null;

const embedMode = new URLSearchParams(window.location.search).get("embed") === "1";

if (embedMode) {
  document.body.classList.add("embedded");
}

const els = {
  home: document.querySelector("#home-screen"),
  languageApp: document.querySelector("#language-app"),
  languageCard: document.querySelector("#language-card"),
  lawCard: document.querySelector("#law-card"),
  historyCard: document.querySelector("#history-card"),
  languageCount: document.querySelector("#language-count"),
  lawCount: document.querySelector("#law-count"),
  historyCount: document.querySelector("#history-count"),
  subjectTitle: document.querySelector("#subject-title"),
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

const subjects = {
  language: {
    title: "Грузинский язык",
    mark: "ა",
    examTitle: "Экзамен",
    studyTitle: "Режим обучения",
    empty: "Выберите экзамен или режим обучения. В экзамене будет 10 случайных заданий, в обучении можно пройти вопросы по отдельным темам.",
  },
  law: {
    title: "Грузинское право",
    mark: "§",
    examTitle: "Право: экзамен",
    studyTitle: "Право: обучение",
    empty: "Выберите экзамен или раздел для обучения. Экзамен берёт 10 вопросов: по одному из каждой группы по 20.",
  },
  history: {
    title: "Грузинская история",
    mark: "Ⴕ",
    examTitle: "История: экзамен",
    studyTitle: "История: обучение",
    empty: "Выберите прогнозный экзамен или эпоху для обучения. Экзамен собирается по модели history_v1: 10 вопросов из 6 исторических блоков.",
  },
};

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

function notifyFrameHeight() {
  if (window.parent === window) {
    return;
  }
  const height = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.offsetHeight,
  );
  window.parent.postMessage({
    type: "georgian-tests:height",
    height,
  }, "*");
}

function scheduleFrameHeightUpdate() {
  window.requestAnimationFrame(notifyFrameHeight);
}

function setupFrameHeightUpdates() {
  if (window.parent === window) {
    return;
  }
  window.addEventListener("load", scheduleFrameHeightUpdate);
  window.addEventListener("resize", scheduleFrameHeightUpdate);
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(scheduleFrameHeightUpdate);
    observer.observe(document.body);
  }
  scheduleFrameHeightUpdate();
}

function showHome() {
  resetLanguageState();
  state.view = "home";
  els.home.classList.remove("is-hidden");
  els.languageApp.classList.add("is-hidden");
}

function showSubject(subject) {
  state.subject = subject;
  state.view = "language";
  els.home.classList.add("is-hidden");
  els.languageApp.classList.remove("is-hidden");
  resetLanguageState();
  renderSubjectShell();
  render();
}

function showLanguage() {
  showSubject("language");
}

function showLaw() {
  showSubject("law");
}

function showHistory() {
  showSubject("history");
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

function renderSubjectShell() {
  const subject = subjects[state.subject];
  const sections = getCurrentSections();
  const source = staticSite || bootstrapData;
  const total = state.subject === "history"
    ? source?.historyTotal
    : state.subject === "law"
      ? source?.lawTotal
      : source?.total;
  document.querySelector(".brand-mark").textContent = subject.mark;
  els.subjectTitle.textContent = subject.title;
  els.count.textContent = `${total || 0} вопросов`;
  els.exam.textContent = "Экзамен";
  els.study.textContent = state.subject === "history"
    ? "Обучение по эпохам"
    : state.subject === "law"
      ? "Обучение по разделам"
      : "Режим обучения";
  els.sections.innerHTML = sections.map((section, index) => `
    <button class="section-button" type="button" data-section="${section.id}" data-name="${escapeHtml(section.name)}">
      <span class="section-number">${index + 1}</span>
      <span class="section-name">${escapeHtml(section.name)}</span>
      <span class="section-count">${section.count}${section.quota ? ` / ${section.quota}` : ""}</span>
    </button>
  `).join("");

  els.sections.querySelectorAll(".section-button").forEach((button) => {
    button.addEventListener("click", () => {
      startSection(button.dataset.section, button.dataset.name, button);
    });
  });
}

function getCurrentSections() {
  const source = staticSite || bootstrapData;
  if (!source) {
    return [];
  }
  if (state.subject === "history") {
    return source.historySections;
  }
  if (state.subject === "law") {
    return source.lawSections;
  }
  return source.sections;
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
    if (state.subject === "history") {
      const questions = [];
      staticSite.historySections.forEach((section) => {
        const pool = [...section.questions];
        for (let count = 0; count < section.quota && pool.length; count += 1) {
          const index = Math.floor(Math.random() * pool.length);
          questions.push(pool.splice(index, 1)[0]);
        }
      });
      questions.sort(() => Math.random() - 0.5);
      startSession("exam", subjects[state.subject].examTitle, questions);
      return;
    }

    if (state.subject === "law") {
      const questions = staticSite.lawSections
        .filter((section) => section.questions.length)
        .map((section) => {
          const index = Math.floor(Math.random() * section.questions.length);
          return section.questions[index];
        });
      questions.sort(() => Math.random() - 0.5);
      startSession("exam", subjects[state.subject].examTitle, questions);
      return;
    }

    const questions = staticSite.sections
      .filter((section) => section.questions.length)
      .map((section) => {
        const index = Math.floor(Math.random() * section.questions.length);
        return section.questions[index];
      });
    startSession("exam", subjects[state.subject].examTitle, questions);
    return;
  }

  const url = state.subject === "history"
    ? "api/history/exam"
    : state.subject === "law"
      ? "api/law/exam"
      : "api/exam";
  const data = await getJson(url);
  startSession("exam", subjects[state.subject].examTitle, data.questions);
}

function showStudyMode() {
  resetLanguageState();
  state.mode = "study-select";
  state.studyView = "normal";
  state.title = subjects[state.subject].studyTitle;
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
    questions = getCurrentSections().find((item) => item.id === section)?.questions;
  } else {
    const url = state.subject === "history"
      ? `api/history/block/${encodeURIComponent(section)}`
      : state.subject === "law"
        ? `api/law/section/${encodeURIComponent(section)}`
      : `api/section/${encodeURIComponent(section)}`;
    const data = await getJson(url);
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
    scheduleFrameHeightUpdate();
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
      : subjects[state.subject].empty;
    els.panel.innerHTML = `
      <div class="empty-state">
        <div class="georgian-strip" aria-hidden="true">
          <span>ა</span><span>ბ</span><span>გ</span><span>დ</span>
        </div>
        <p>${emptyText}</p>
      </div>
    `;
    scheduleFrameHeightUpdate();
    return;
  }

  renderQuestion();
  scheduleFrameHeightUpdate();
}

function modeLabel() {
  if (state.mode === "exam") {
    if (state.subject === "history") {
      return "Прогнозный экзамен";
    }
    if (state.subject === "law") {
      return "Экзамен по праву";
    }
    return "Экзамен";
  }
  if (state.mode === "study" || state.mode === "study-select") {
    if (state.subject === "history") {
      return "Обучение по эпохам";
    }
    if (state.subject === "law") {
      return "Обучение по праву";
    }
    return "Режим обучения";
  }
  return subjects[state.subject].title;
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
  scheduleFrameHeightUpdate();

  els.panel.querySelectorAll(".answer").forEach((button) => {
    button.addEventListener("click", () => answerQuestion(Number(button.dataset.choice)));
  });
}

function renderStudyAid(question, translation) {
  if (state.mode !== "study") {
    return "";
  }

  if (state.subject === "history") {
    if (state.studyView === "translation") {
      if (!translation.question_ru) {
        return `<div class="hint">Для этого исторического вопроса перевод пока не добавлен.</div>`;
      }
      return `
        <div class="translation-box">
          <p><b>Перевод:</b> ${escapeHtml(translation.question_ru)}</p>
        </div>
      `;
    }
    if (state.studyView === "keys") {
      if (question.hint || question.rule) {
        return `
          <div class="key-box">
            ${question.hint ? `<p><b>Подсказка:</b> ${escapeHtml(question.hint)}</p>` : ""}
            ${question.rule ? `<p><b>Как выбрать ответ:</b> ${escapeHtml(question.rule)}</p>` : ""}
          </div>
        `;
      }
      return `<div class="key-box">
        <p><b>Ключ:</b> эпоха вопроса — ${escapeHtml(question.sectionName)}. Отмечайте даты, правителей и события внутри этого блока.</p>
      </div>`;
    }
    return "";
  }

  if (state.subject === "law") {
    if (state.studyView === "translation") {
      if (!translation.question_ru) {
        return `<div class="hint">Для этого вопроса по праву перевод пока не добавлен.</div>`;
      }
      return `<div class="translation-box">
        <p><b>Перевод:</b> ${escapeHtml(translation.question_ru)}</p>
      </div>`;
    }
    if (state.studyView === "keys") {
      if (translation.key || question.hint || question.rule) {
        return `<div class="key-box">
          ${translation.key ? `<p><b>Ключ:</b> ${escapeHtml(stripLeadLabel(translation.key, "Ключ"))}</p>` : ""}
          ${question.hint ? `<p><b>Подсказка:</b> ${escapeHtml(question.hint)}</p>` : ""}
          ${question.rule ? `<p><b>Как выбрать ответ:</b> ${escapeHtml(question.rule)}</p>` : ""}
        </div>`;
      }
      return `<div class="key-box">
        <p><b>Ключ:</b> правильный ответ будет подсвечен после выбора. Для подготовки полезно проходить группы по 20 вопросов.</p>
      </div>`;
    }
    return "";
  }

  if (state.studyView === "translation") {
    if (!translation.question_ru) {
      return `<div class="hint">Для этого вопроса полный перевод пока не добавлен.</div>`;
    }
    return `
      <div class="translation-box">
        <p><b>Перевод:</b> ${escapeHtml(translation.question_ru)}</p>
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

  return "";
}

function stripLeadLabel(text, label) {
  return String(text).replace(new RegExp(`^${label}:\\s*`, "i"), "");
}

function renderFeedback(question, answered) {
  const correctText = `${letters[question.ans]}) ${question.opts[question.ans]}`;
  if (answered.correct) {
    const rule = state.mode === "study" && state.studyView === "keys" && question.rule
      ? `<br><br>${escapeHtml(question.rule)}`
      : "";
    return `<div class="feedback correct">Правильно: <b>${escapeHtml(correctText)}</b>${rule}</div>`;
  }

  const chosen = letters[answered.choice];
  const rule = state.mode === "study" && state.studyView === "keys" && question.rule
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
  const modelNote = state.subject === "history" && state.mode === "exam" && staticSite?.historyModel
    ? `<p class="model-note">${escapeHtml(staticSite.historyModel.comment)}</p>`
    : "";
  els.panel.innerHTML = `
    <div class="summary">
      <div class="summary-score">${state.score} / ${total}</div>
      <p>${state.score === total ? "Все ответы верные." : `Ошибок: ${state.mistakes.length}.`}</p>
      ${modelNote}
      ${mistakes ? `<div class="mistakes">${mistakes}</div>` : ""}
    </div>
  `;
  scheduleFrameHeightUpdate();
}

async function init() {
  const data = await getFirstJson(["api/bootstrap", "data/site.json?v=tilda-app-1", "../docs/data/site.json?v=tilda-app-1"]);
  bootstrapData = data;
  staticSite = data.sections.some((section) => Array.isArray(section.questions)) ? data : null;
  els.count.textContent = `${data.total} вопросов`;
  els.languageCount.textContent = `${data.total} вопросов`;
  els.lawCount.textContent = `${data.lawTotal || 0} вопросов`;
  els.historyCount.textContent = `${data.historyTotal || 0} вопросов`;
  renderSubjectShell();

  showHome();
}

els.exam.addEventListener("click", startExam);
els.study.addEventListener("click", showStudyMode);
els.homeButton.addEventListener("click", showHome);
els.languageCard.addEventListener("click", showLanguage);
els.lawCard.addEventListener("click", showLaw);
els.historyCard.addEventListener("click", showHistory);
els.studyTools.querySelectorAll(".tool-button").forEach((button) => {
  button.addEventListener("click", () => setStudyView(button.dataset.studyView));
});
els.prev.addEventListener("click", () => move(-1));
els.next.addEventListener("click", next);

init().catch((error) => {
  els.panel.innerHTML = `<div class="feedback wrong">Не получилось загрузить приложение: ${escapeHtml(error.message)}</div>`;
  scheduleFrameHeightUpdate();
});

setupFrameHeightUpdates();
