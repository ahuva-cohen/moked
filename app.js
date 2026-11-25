const app = document.getElementById("app");
const STORAGE_KEY = "mokad-support-games-v1";
const CHAT_STORAGE_KEY = "mokad-support-chat-v1";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

const supportLogo = `
  <svg class="support-logo" viewBox="0 0 100 100" role="img" aria-label="לוגו מוקד התמיכה">
    <path class="logo-headset" d="M20 51a30 30 0 0 1 60 0" />
    <path class="logo-bubble" d="M30 35h40a8 8 0 0 1 8 8v21a8 8 0 0 1-8 8H53L42 82V72H30a8 8 0 0 1-8-8V43a8 8 0 0 1 8-8Z" />
    <path class="logo-sound" d="M39 47v12m11-15v18m11-15v12" />
    <rect class="logo-ear" x="11" y="45" width="14" height="25" rx="7" />
    <rect class="logo-ear" x="75" y="45" width="14" height="25" rx="7" />
    <path class="logo-cable" d="M82 68c0 12-7 18-19 18" />
  </svg>`;

const uid = (length = 6) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

const clone = value => JSON.parse(JSON.stringify(value));

function loadGames() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveGames(games) { localStorage.setItem(STORAGE_KEY, JSON.stringify(games)); }
function getGame(code) { return loadGames()[code]; }

function saveGame(game) {
  const games = loadGames();
  game.updatedAt = new Date().toISOString();
  games[game.code] = game;
  saveGames(games);
}

function shell(content, options = {}) {
  app.innerHTML = `
    <div class="shell ${options.className || ""}">
      ${options.hideHeader ? "" : `<header class="topbar">
        <button class="brand link-btn" data-action="home" aria-label="עמוד הבית">
          ${supportLogo}
          <span>מוקד התמיכה</span>
        </button>
        ${options.right || ""}
      </header>`}
      ${content}
    </div>`;
}

function renderHome() {
  shell(`
    <div class="content home-grid">
      <section class="home-intro">
        ${supportLogo}
        <h1>מוקד<br>התמיכה</h1>
        <p class="lead">הופכים את החדר למוקד שירות. מוקדן אחד, פונה אחד שמדבר בקול, וכל הקבוצה צופה.</p>
      </section>
      <section class="home-cards">
        <article class="home-manager-card">
          <div class="eyebrow">למנהלי משחק</div>
          <h2>מכינים משחק חדש לערב</h2>
          <p>שם למשחק, משתתפים ובעיות. אפשר לשמור ולחזור אליו גם אחרי שבועות.</p>
          <button class="btn primary" data-action="create">יצירת משחק חדש</button>
        </article>
        <form class="home-enter-card" id="home-open-form">
          <h2>כניסה למשחק קיים</h2>
          <label for="home-game-code">קוד המשחק</label>
          <div class="code-row">
            <input id="home-game-code" maxlength="8" placeholder="ABCD12" aria-label="קוד המשחק">
            <button class="btn primary small" type="submit">כניסה</button>
          </div>
        </form>
        <button class="link-btn home-chat-link" data-action="chat">שיחה עם מוקדן התמיכה</button>
      </section>
    </div>`, { className: "home-shell", hideHeader: true });
}

function loadChat() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function renderChat() {
  const messages = loadChat();
  shell(`
    <div class="content chat-page">
      <div class="chat-heading">
        <div>
          <div class="eyebrow">מוקד התמיכה</div>
          <h1>איך אפשר לעזור?</h1>
          <p class="lead">כתבו למוקדן את הבעיה, והוא יעזור לכם למצוא דרך להתקדם.</p>
        </div>
        <button class="btn small" data-action="clear-chat">שיחה חדשה</button>
      </div>
      <section class="chat-panel">
        <div class="chat-messages" id="chat-messages">
          ${messages.length ? messages.map(renderChatMessage).join("") : `
            <div class="chat-empty">
              <span class="chat-avatar">מ</span>
              <div><strong>מוקדן התמיכה</strong><p>שלום! ספרו לי מה הבעיה, וננסה לפתור אותה יחד.</p></div>
            </div>`}
        </div>
        <div id="chat-error" class="chat-error" role="alert" hidden></div>
        <form id="chat-form" class="chat-composer">
          <textarea id="chat-input" rows="2" maxlength="4000" placeholder="תארו את הבעיה..." aria-label="הודעה למוקדן" required></textarea>
          <button class="btn primary" id="chat-send" type="submit">שליחה</button>
        </form>
        <p class="notice chat-note">השיחה נשמרת בדפדפן הזה בלבד. אל תשלחו מידע אישי או סודי.</p>
      </section>
    </div>`);
  const messagesElement = document.getElementById("chat-messages");
  messagesElement.scrollTop = messagesElement.scrollHeight;
  document.getElementById("chat-input").focus();
}

function renderChatMessage(message) {
  const isUser = message.role === "user";
  return `<div class="chat-message ${isUser ? "user" : "assistant"}">
    ${isUser ? "" : '<span class="chat-avatar">מ</span>'}
    <div class="chat-bubble">${escapeHtml(message.text).replace(/\n/g, "<br>")}</div>
  </div>`;
}

async function consumeChatStream(response, onText) {
  if (!response.body) throw new Error("הדפדפן לא תומך בקבלת תשובה בזרימה.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const processEvent = eventText => {
    const dataLine = eventText.split(/\r?\n/).find(line => line.startsWith("data:"));
    if (!dataLine) return;
    const data = dataLine.slice(5).trim();
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data);
    if (event.error) throw new Error(event.error);
    if (event.text) onText(event.text);
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || "";
      events.forEach(processEvent);
      if (done) break;
    }
    if (buffer.trim()) processEvent(buffer);
  } finally {
    reader.releaseLock();
  }
}

async function submitChat(event) {
  event.preventDefault();
  const input = document.getElementById("chat-input");
  const send = document.getElementById("chat-send");
  const text = input.value.trim();
  if (!text || send.disabled) return;

  const messages = loadChat();
  messages.push({ role: "user", text });
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  renderChat();

  const chatInput = document.getElementById("chat-input");
  const sendButton = document.getElementById("chat-send");
  const errorBox = document.getElementById("chat-error");
  sendButton.disabled = true;
  sendButton.textContent = "המוקדן מקליד...";
  chatInput.disabled = true;
  const chatMessages = document.getElementById("chat-messages");
  chatMessages.insertAdjacentHTML("beforeend", `
    <div class="chat-message assistant" id="chat-pending">
      <span class="chat-avatar">מ</span><div class="chat-bubble typing" id="chat-pending-text">המוקדן חושב...</div>
    </div>`);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages.slice(-20) })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || `שגיאת שרת (${response.status})`);
    }

    const assistantMessage = { role: "assistant", text: "" };
    const bubble = document.getElementById("chat-pending-text");
    bubble.classList.remove("typing");
    await consumeChatStream(response, chunk => {
      assistantMessage.text += chunk;
      bubble.innerHTML = escapeHtml(assistantMessage.text).replace(/\n/g, "<br>");
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
    if (!assistantMessage.text.trim()) throw new Error("המוקדן לא החזיר תשובה. נסו שוב.");
    messages.push(assistantMessage);
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    renderChat();
  } catch (requestError) {
    document.getElementById("chat-pending")?.remove();
    errorBox.hidden = false;
    errorBox.textContent = `לא ניתן לקבל תשובה מהמוקדן: ${requestError.message}`;
    chatInput.disabled = false;
    sendButton.disabled = false;
    sendButton.textContent = "שליחה";
    chatInput.focus();
  }
}

function renderOpen() {
  shell(`
    <div class="content" style="max-width:520px">
      <button class="link-btn" data-action="home">← חזרה</button>
      <div class="form-card" style="margin-top:18px">
        <h1 style="font-size:42px">פתיחת משחק</h1>
        <div class="field">
          <label for="game-code">קוד משחק</label>
          <div class="code-row"><input id="game-code" maxlength="8" placeholder="ABCD12"><button class="btn primary small" data-action="open-code">פתח</button></div>
        </div>
        <p class="notice">המשחק נשמר בדפדפן זה. כדי להעביר אותו למחשב אחר, שמרו את הקישור המלא של המשחק.</p>
      </div>
    </div>`);
  document.getElementById("game-code").focus();
}

function blankGame(code = uid()) {
  return {
    code,
    name: "ערב צוות — מוקד התמיכה",
    status: "DRAFT",
    participants: [
      { id: uid(10), name: "יוסי", active: true },
      { id: uid(10), name: "אבי", active: true }
    ],
    problems: [
      { id: uid(10), title: "התינוק בוכה כל הלילה", description: "אבא צעיר, עייף ומעט לחוץ. הוא ניסה כמה דרכים ומחפש פתרון מעשי.", status: "PENDING" },
      { id: uid(10), title: "השכן עושה רעש", description: "מישהי מתוסכלת מהרעש בשעות הלילה ומחפשת דרך אדיבה לפתור את המצב.", status: "PENDING" }
    ],
    rounds: [],
    participantHistory: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function renderEditor(code) {
  let game = code ? getGame(code) : blankGame();
  if (!game) return renderOpen();

  const participants = game.participants.map((p, i) => `
    <div class="list-item participant-row">
      <input class="participant-name" data-id="${p.id}" value="${escapeHtml(p.name)}" aria-label="שם משתתף">
      <button class="remove" data-remove-participant="${p.id}" title="הסרת משתתף">×</button>
    </div>`).join("");

  const problems = game.problems.map(p => `
    <div class="list-item problem-row" style="grid-template-columns:1fr auto">
      <div>
        <input class="problem-title" data-id="${p.id}" value="${escapeHtml(p.title)}" aria-label="כותרת בעיה" style="font-weight:700">
        <textarea class="problem-description" data-id="${p.id}" aria-label="תיאור הפונה" style="width:100%;border:0;resize:vertical;padding:8px;min-height:64px">${escapeHtml(p.description)}</textarea>
      </div>
      <button class="remove" data-remove-problem="${p.id}" title="הסרת בעיה">×</button>
    </div>`).join("");

  shell(`
    <div class="content">
      <button class="link-btn" data-action="home">← למסך הבית</button>
      <div class="section-title" style="margin-top:18px">
        <h1 style="font-size:44px;margin:0">${code ? "עריכת משחק" : "יצירת משחק חדש"}</h1>
        <div class="eyebrow" dir="ltr">קוד: ${game.code}</div>
      </div>
      <div class="form-card">
        <div class="field">
          <label for="game-name">שם המשחק</label>
          <input id="game-name" value="${escapeHtml(game.name)}">
        </div>
        <div class="form-grid">
          <section>
            <div class="section-title"><h2>משתתפים</h2><button class="btn small" data-action="add-participant">+ הוסף משתתף</button></div>
            <div class="list" id="participants">${participants}</div>
          </section>
          <section>
            <div class="section-title"><h2>בעיות</h2><button class="btn small" data-action="add-problem">+ הוסף בעיה</button></div>
            <div class="list" id="problems">${problems}</div>
          </section>
        </div>
        <div style="display:flex;gap:10px;margin-top:28px">
          <button class="btn primary" data-action="save-editor">שמור משחק</button>
          <button class="btn accent" data-action="start-game">התחל משחק</button>
          ${code ? `<button class="btn small" data-action="copy-link">העתק קישור</button>` : ""}
        </div>
      </div>
    </div>`);

  collectEditor(game);
  window._editingGame = game;
}

function collectEditor(game) {
  game.name = document.getElementById("game-name").value.trim() || game.name;
  game.participants = Array.from(document.querySelectorAll(".participant-row")).map((row, index) => {
    const input = row.querySelector(".participant-name");
    return { id: input.dataset.id, name: input.value.trim() || `משתתף ${index + 1}`, active: true };
  }).filter(p => p.name);
  game.problems = Array.from(document.querySelectorAll(".problem-row")).map(row => {
    const title = row.querySelector(".problem-title");
    const description = row.querySelector(".problem-description");
    const existing = game.problems.find(p => p.id === title.dataset.id);
    return { id: title.dataset.id, title: title.value.trim(), description: description.value.trim(), status: existing?.status || "PENDING" };
  }).filter(p => p.title);
}

function saveEditorGame() {
  const game = window._editingGame;
  collectEditor(game);
  if (game.participants.length < 1 || game.problems.length < 1) {
    alert("נדרש לפחות משתתף אחד ובעיה אחת.");
    return false;
  }
  game.status = "READY";
  saveGame(game);
  return game;
}

let roundTimer = null;

function startRound(code) {
  const game = getGame(code);
  if (!game) return renderOpen();
  const pendingProblems = game.problems.filter(p => p.status === "PENDING");
  if (!pendingProblems.length) {
    game.status = "FINISHED";
    saveGame(game);
    return renderGameSummary(code);
  }

  const eligible = game.participants.filter(p => p.active);
  const completedRounds = game.rounds.filter(r => r.status === "COMPLETED");
  const completedIds = completedRounds.slice(-eligible.length).map(r => r.participantId);
  const unused = eligible.filter(p => !completedIds.includes(p.id));
  const pool = unused.length ? unused : eligible;
  const participant = pool[Math.floor(Math.random() * pool.length)];

  const problem = pendingProblems[Math.floor(Math.random() * pendingProblems.length)];
  const round = {
    id: uid(10), participantId: participant.id, participantName: participant.name,
    problemId: problem.id, problemTitle: problem.title, problemDescription: problem.description,
    startedAt: new Date().toISOString(), secondsLeft: 180, status: "SELECTING_AGENT",
    transcript: []
  };
  game.status = "IN_PROGRESS";
  game.rounds.push(round);
  game.currentRoundId = round.id;
  saveGame(game);
  renderSelecting(code);
}

function getCurrentRound(game) {
  return game.rounds.find(r => r.id === game.currentRoundId);
}

function renderSelecting(code) {
  const game = getGame(code);
  const round = getCurrentRound(game);
  shell(`
    <div class="game-screen">
      <aside class="round-sidebar"><h3>${escapeHtml(game.name)}</h3><p class="notice">${game.rounds.length} סבבים</p></aside>
      <section class="round-main">
        <div class="round-card">
          <div class="eyebrow">🎲 בחירת מוקדן</div>
          <div class="selected-name">${escapeHtml(round.participantName)}</div>
          <button class="btn primary" data-action="show-problem" data-code="${code}">הצגת הבעיה</button>
        </div>
      </section>
    </div>`);
}

function renderProblem(code) {
  const game = getGame(code);
  const round = getCurrentRound(game);
  round.status = "SHOWING_PROBLEM";
  saveGame(game);
  shell(`
    <div class="game-screen">
      <aside class="round-sidebar"><h3>המוקדן שנבחר</h3><strong>${escapeHtml(round.participantName)}</strong><p class="notice">הפונה מחכה לשיחה</p></aside>
      <section class="round-main">
        <div class="round-card">
          <div class="eyebrow">📞 בעיה חדשה התקבלה</div>
          <div class="problem-card">
            <h2>${escapeHtml(round.problemTitle)}</h2>
            <p>${escapeHtml(round.problemDescription)}</p>
          </div>
          <div class="caller-state"><button class="btn accent" data-action="call-active" data-code="${code}">התחלת שיחה</button></div>
        </div>
      </section>
    </div>`);
}

function renderCall(code) {
  const game = getGame(code);
  const round = getCurrentRound(game);
  round.status = "CALL_ACTIVE";
  if (!round.transcript.length) {
    round.transcript.push({
      role: "caller",
      text: `שלום, אני מתקשר בנוגע ל${round.problemTitle}. ${round.problemDescription}`
    });
  }
  saveGame(game);
  shell(`
    <div class="game-screen">
      <aside class="round-sidebar">
        <h3>המוקדן</h3><strong>${escapeHtml(round.participantName)}</strong>
        <hr style="border:0;border-top:1px solid var(--line);margin:24px 0">
        <div class="timer" id="timer">03:00</div>
      </aside>
      <section class="round-main">
        <div class="round-card">
          <div class="problem-card" style="margin-bottom:18px">
            <div class="eyebrow">הבעיה</div><h2>${escapeHtml(round.problemTitle)}</h2>
          </div>
          <div class="caller-state"><span class="pulse"></span><strong id="voice-status">מפעילים את השיחה הקולית...</strong></div>
          <div class="transcript" id="transcript"></div>
          <div style="display:flex;justify-content:center;gap:10px;margin-top:18px">
            <button class="btn danger" data-action="finish-round" data-code="${code}">סיום מוקדם</button>
          </div>
        </div>
      </section>
    </div>`);

  startTimer(code);
  setupVoice(code);
  renderTranscript(round);
  speak(round.transcript[0].text);
}

function startTimer(code) {
  clearInterval(roundTimer);
  roundTimer = setInterval(() => {
    const game = getGame(code);
    const round = getCurrentRound(game);
    if (!round || round.status !== "CALL_ACTIVE") return;
    round.secondsLeft -= 1;
    saveGame(game);
    const timer = document.getElementById("timer");
    if (timer) {
      timer.textContent = `${String(Math.floor(round.secondsLeft / 60)).padStart(2,"0")}:${String(round.secondsLeft % 60).padStart(2,"0")}`;
      timer.classList.toggle("warning", round.secondsLeft <= 30);
    }
    if (round.secondsLeft <= 0) finishRound(code, "timeout");
  }, 1000);
}

function renderTranscript(round) {
  const el = document.getElementById("transcript");
  if (!el) return;
  el.innerHTML = round.transcript.map(m =>
    `<div class="message"><strong>${m.role === "caller" ? "הפונה" : "המוקדן"}:</strong> ${escapeHtml(m.text)}</div>`
  ).join("") || '<div class="notice">השיחה תופיע כאן בזמן אמת.</div>';
  el.scrollTop = el.scrollHeight;
}

function setupVoice(code) {
  const status = document.getElementById("voice-status");
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    status.textContent = "שפת הדיבור לא נתמכת בדפדפן זה";
    const controls = document.querySelector(".round-card");
    controls.insertAdjacentHTML("beforeend", `<div style="display:flex;gap:8px;justify-content:center;margin-top:12px"><input id="fallback-answer" placeholder="כתבו את תשובת המוקדן" style="padding:12px;border:1px solid var(--line);border-radius:12px"><button class="btn small" id="fallback-send">שליחה</button></div>`);
    document.getElementById("fallback-send").onclick = () => {
      const input = document.getElementById("fallback-answer");
      if (input.value.trim()) addSpokenTurn(code, input.value.trim());
      input.value = "";
    };
    return;
  }

  const recognition = new Recognition();
  recognition.lang = "he-IL";
  recognition.continuous = true;
  recognition.interimResults = false;
  let shouldListen = true;
  let listeningStarted = false;
  let restartTimer = null;

  recognition.onstart = () => {
    listeningStarted = true;
    if (!window.speechSynthesis?.speaking) status.textContent = "מקשיבים...";
  };
  recognition.onend = () => {
    listeningStarted = false;
    if (!shouldListen) return;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      if (shouldListen && !window.speechSynthesis?.speaking) {
        try { recognition.start(); } catch {}
      }
    }, 500);
  };
  recognition.onerror = event => {
    listeningStarted = false;
    if (event.error === "no-speech" || event.error === "aborted") {
      status.textContent = "מקשיבים — דברו עכשיו";
      return;
    }
    if (event.error === "not-allowed") {
      shouldListen = false;
      status.textContent = "יש לאשר גישה למיקרופון בדפדפן";
      return;
    }
    status.textContent = "מפעילים מחדש את המיקרופון...";
  };
  recognition.onresult = event => {
    if (window.speechSynthesis?.speaking) return;
    const text = event.results[event.results.length - 1][0].transcript.trim();
    if (text) addSpokenTurn(code, text);
  };
  window._supportRecognition = recognition;
  window._supportStopListening = () => {
    shouldListen = false;
    try { recognition.stop(); } catch {}
  };
  window._supportStartListening = () => {
    if (!shouldListen || listeningStarted || window.speechSynthesis?.speaking) return;
    try { recognition.start(); } catch {}
  };
  window._supportMicStatus = status;
  status.textContent = "מבקשים אישור למיקרופון...";

  if (navigator.mediaDevices?.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        window._supportMicStream = stream;
        status.textContent = window.speechSynthesis?.speaking
          ? "הפונה מדברת..."
          : "מקשיבים — דברו עכשיו";
        setTimeout(() => window._supportStartListening?.(), 100);
      })
      .catch(() => {
        shouldListen = false;
        status.textContent = "יש לאשר גישה למיקרופון בדפדפן";
      });
  } else {
    try { recognition.start(); } catch {}
  }
}

function addSpokenTurn(code, text) {
  const game = getGame(code);
  const round = getCurrentRound(game);
  try { window._supportRecognition?.stop(); } catch {}
  round.transcript.push({ role: "agent", text });
  const reply = generateCallerReply(round, text);
  round.transcript.push({ role: "caller", text: reply });
  saveGame(game);
  renderTranscript(round);
  speak(reply);
  if (/נפתר|פתרנו|זה יעזור|זה עוזר|תודה רבה|נראה טוב/.test(`${text} ${reply}`) && round.transcript.length >= 4) {
    setTimeout(() => finishRound(code, "resolved"), 1400);
  }
}

function generateCallerReply(round, userText) {
  const key = localStorage.getItem("mokad-gemini-key");
  if (key) return "מחוברים ל-AI — יש להוסיף בקשת שרת מאובטחת לפני שימוש אמיתי.";
  const lower = userText.toLowerCase();
  if (/מתי|מאיזה|כשהתחל|מתי זה/.test(lower)) return "בערך לפני שבוע זה נהיה כל ערב ומאוחר יותר בלילה.";
  if (/אוכל|אכיל|חלב|בטן|תזונ/.test(lower)) return "כן, הוא אוכל בסדר. זה נראה לי קשור יותר לחוסר שגרה ומסביבת השינה.";
  if (/שגרה|שעות|ישנה|שינה/.test(lower)) return "זה קורה בערך שעה אחרי שהוא נרדם. לנסות שגרה קבועה אולי יכול לעזור.";
  if (/רופא|בדיקת|חום/.test(lower)) return "לא בדקנו רופא; הוא נראה בריא, רק עצבני ועייף.";
  if (/תודה|נראה/.test(lower)) return "אוקיי, נראה לי שזה יכול לעזור לי. תודה רבה!";
  if (/רעש|שכן/.test(lower)) return "השכן משמיע מוזיקה די חזק כל לילה אחרי עשר.";
  if (/מקרר|ספק|טכנ|שב/.test(lower)) return "המקרר לא קירר בכלל מאז הבוקר, והאוכל מתחיל להתחמם.";
  return "אני מבין. ניסיתי דברים רבים כבר, ולכן הייתי רוצה להבין קודם מה הדרך הטובה ביותר להמשיך.";
}

function speak(text) {
  if (!("speechSynthesis" in window)) {
    setTimeout(() => window._supportStartListening?.(), 400);
    return;
  }
  try { window._supportRecognition?.stop(); } catch {}
  window.speechSynthesis.cancel();
  const speakNow = () => {
    const availableVoices = window.speechSynthesis.getVoices();
    const hebrewVoice = availableVoices.find(voice => voice.lang.toLowerCase().startsWith("he"));
    const fallbackVoice = availableVoices.find(voice => voice.lang.toLowerCase().startsWith("en"));
    const selectedVoice = hebrewVoice || fallbackVoice;
    const utterance = new SpeechSynthesisUtterance(text);

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    } else {
      utterance.lang = "he-IL";
    }
    utterance.rate = .92;
    utterance.pitch = 1;
    if (document.getElementById("voice-status")) {
      document.getElementById("voice-status").textContent = "הפונה מדברת...";
    }
    utterance.onstart = () => {
      try { window._supportRecognition?.stop(); } catch {}
    };
    utterance.onend = () => {
      if (document.getElementById("voice-status")) {
        document.getElementById("voice-status").textContent = "מקשיבים — דברו עכשיו";
      }
      setTimeout(() => window._supportStartListening?.(), 400);
    };
    utterance.onerror = () => {
      if (document.getElementById("voice-status")) {
        document.getElementById("voice-status").textContent =
          "הקול אינו זמין כרגע — ההקלטה מונחית";
      }
      setTimeout(() => window._supportStartListening?.(), 400);
    };
    window.speechSynthesis.speak(utterance);
  };

  if (window.speechSynthesis.getVoices().length) {
    speakNow();
  } else {
    if (document.getElementById("voice-status")) {
      document.getElementById("voice-status").textContent = "טוענים קול...";
    }
    window.speechSynthesis.addEventListener("voiceschanged", speakNow, { once: true });
  }
}

function finishRound(code, reason) {
  clearInterval(roundTimer);
  const game = getGame(code);
  const round = getCurrentRound(game);
  if (round.status === "SHOWING_RESULT" || round.status === "COMPLETED") return;
  round.status = "EVALUATING";
  round.endedAt = new Date().toISOString();
  round.endReason = reason;
  round.qualityScore = reason === "resolved" ? randomScore(82, 96) : randomScore(58, 84);
  round.creativityScore = randomScore(68, 94);
  round.serviceScore = randomScore(78, 98);
  round.speedScore = reason === "resolved" ? randomScore(72, 96) : randomScore(45, 75);
  round.totalScore = Math.round(round.qualityScore * .4 + round.serviceScore * .25 + round.creativityScore * .2 + round.speedScore * .15);
  round.summary = reason === "resolved"
    ? `${round.participantName} היה קשוב, שאל שאלות רלוונטיות והגיע לפתרון מעשי.`
    : `${round.participantName} יצר קשר עם הפונה וניסה להבין את הבעיה, אך הזמן הסתיים לפני שהגיע לפתרון מלא.`;
  const problem = game.problems.find(p => p.id === round.problemId);
  if (problem) problem.status = "PLAYED";
  saveGame(game);
  renderResult(code);
}

function randomScore(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function renderResult(code) {
  const game = getGame(code);
  const round = getCurrentRound(game);
  round.status = "SHOWING_RESULT";
  saveGame(game);
  shell(`
    <div class="game-screen">
      <aside class="round-sidebar"><h3>תוצאות הסבב</h3><strong>${escapeHtml(round.participantName)}</strong></aside>
      <section class="round-main">
        <div class="round-card">
          <div class="eyebrow">🏆 תוצאות הסבב</div>
          <h2 style="font-size:42px;margin:10px 0">${escapeHtml(round.participantName)}</h2>
          <div class="scores">
            ${scoreCard("איכות פתרון", round.qualityScore)}
            ${scoreCard("יצירתיות", round.creativityScore)}
            ${scoreCard("שירותיות", round.serviceScore)}
            ${scoreCard("מהירות", round.speedScore)}
          </div>
          <div class="total"><span>ציון כולל</span><br><strong>${round.totalScore}</strong></div>
          <p style="font-size:18px;line-height:1.6">${escapeHtml(round.summary)}</p>
          <button class="btn primary" data-action="next-round" data-code="${code}">לסבב הבא</button>
        </div>
      </section>
    </div>`);
}

function scoreCard(label, value) { return `<div class="score"><span>${label}</span><strong>${value}</strong></div>`; }

function renderGameSummary(code) {
  clearInterval(roundTimer);
  const game = getGame(code);
  game.status = "FINISHED";
  saveGame(game);
  const totals = game.participants.map(p => {
    const rounds = game.rounds.filter(r => r.participantId === p.id && r.status === "COMPLETED");
    const average = rounds.length ? Math.round(rounds.reduce((sum, r) => sum + r.totalScore, 0) / rounds.length) : 0;
    return { name: p.name, count: rounds.length, average };
  }).sort((a, b) => b.average - a.average);
  shell(`
    <div class="content" style="max-width:900px">
      <div class="panel" style="text-align:center">
        <div class="eyebrow">🎉 המשחק הסתיים</div>
        <h1 style="font-size:58px">${escapeHtml(game.name)}</h1>
        <table class="leaderboard">
          <thead><tr><th>משתתף</th><th>סבבים</th><th>ממוצע</th></tr></thead>
          <tbody>${totals.map(p => `<tr><td>${escapeHtml(p.name)}</td><td>${p.count}</td><td><strong>${p.average}</strong></td></tr>`).join("")}</tbody>
        </table>
        ${totals[0] ? `<p class="eyebrow">המוקדן המצטיין: ${escapeHtml(totals[0].name)}</p>` : ""}
        <div style="display:flex;justify-content:center;gap:10px;margin-top:24px">
          <button class="btn primary" data-action="new-round" data-code="${code}">משחק נוסף על בסיס זה</button>
          <button class="btn" data-action="home">חזרה למסך הבית</button>
        </div>
      </div>
    </div>`);
}

app.addEventListener("click", event => {
  const target = event.target.closest("[data-action]");
  if (!target) {
    if (event.target.matches("[data-remove-participant]")) {
      event.target.closest(".list-item").remove();
    } else if (event.target.matches("[data-remove-problem]")) {
      event.target.closest(".list-item").remove();
    }
    return;
  }
  const action = target.dataset.action;
  if (action === "home") renderHome();
  if (action === "chat") renderChat();
  if (action === "clear-chat") {
    if (confirm("למחוק את היסטוריית השיחה ולהתחיל מחדש?")) {
      localStorage.removeItem(CHAT_STORAGE_KEY);
      renderChat();
    }
  }
  if (action === "open") renderOpen();
  if (action === "create") {
    const game = blankGame();
    saveGame(game);
    history.replaceState(null, "", `?game=${game.code}`);
    renderEditor(game.code);
  }
  if (action === "open-code") {
    const code = document.getElementById("game-code").value.trim().toUpperCase();
    if (!getGame(code)) return alert("לא נמצא משחק עם הקוד הזה בדפדפן זה.");
    history.replaceState(null, "", `?game=${code}`);
    renderEditor(code);
  }
  if (action === "add-participant") {
    document.getElementById("participants").insertAdjacentHTML("beforeend", `
      <div class="list-item participant-row"><input class="participant-name" data-id="${uid(10)}" value="" placeholder="שם המשתתף" aria-label="שם משתתף"><button class="remove" data-remove-participant="1" title="הסרת משתתף">×</button></div>`);
  }
  if (action === "add-problem") {
    document.getElementById("problems").insertAdjacentHTML("beforeend", `
      <div class="list-item problem-row" style="grid-template-columns:1fr auto"><div><input class="problem-title" data-id="${uid(10)}" value="" placeholder="כותרת הבעיה" style="font-weight:700"><textarea class="problem-description" data-id="1" placeholder="תיאור הפונה"></textarea></div><button class="remove" data-remove-problem="1" title="הסרת בעיה">×</button></div>`);
  }
  if (action === "save-editor") {
    const game = saveEditorGame();
    if (game) alert("המשחק נשמר.");
  }
  if (action === "start-game") {
    const game = saveEditorGame();
    if (game) startRound(game.code);
  }
  if (action === "copy-link") {
    const code = new URLSearchParams(location.search).get("game");
    const url = `${location.origin}${location.pathname}?game=${code}`;
    navigator.clipboard?.writeText(url);
    alert("הקישור הועתק.");
  }
  if (action === "show-problem") renderProblem(target.dataset.code);
  if (action === "call-active") renderCall(target.dataset.code);
  if (action === "finish-round") finishRound(target.dataset.code, "timeout");
  if (action === "next-round") {
    const round = getCurrentRound(getGame(target.dataset.code));
    if (round) round.status = "COMPLETED";
    saveGame(getGame(target.dataset.code));
    startRound(target.dataset.code);
  }
  if (action === "new-round") {
    const old = getGame(target.dataset.code);
    const game = clone(old);
    game.code = uid();
    game.status = "DRAFT";
    game.rounds = [];
    game.currentRoundId = null;
    game.problems.forEach(p => p.status = "PENDING");
    saveGame(game);
    history.replaceState(null, "", `?game=${game.code}`);
    renderEditor(game.code);
  }
});

app.addEventListener("submit", event => {
  if (event.target.id === "chat-form") submitChat(event);
  if (event.target.id === "home-open-form") {
    event.preventDefault();
    const code = document.getElementById("home-game-code").value.trim().toUpperCase();
    if (!getGame(code)) return alert("לא נמצא משחק עם הקוד הזה בדפדפן זה.");
    history.replaceState(null, "", `?game=${code}`);
    renderEditor(code);
  }
});

const initialCode = new URLSearchParams(location.search).get("game");
if (new URLSearchParams(location.search).get("chat") === "1") renderChat();
else if (initialCode && getGame(initialCode)) renderEditor(initialCode);
else renderHome();
