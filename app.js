(function () {
  "use strict";

  var MY_TOPIC_ID = "my-questions";

  // Build the merged topic list; the "My Questions" topic is injected dynamically.
  var TOPICS = (window.QB || []).slice();

  var state = {
    role: "all",
    topic: "all",
    search: "",
    openAnswers: {}
  };

  var STORE = {
    notes: "ip.notes",
    confident: "ip.confident",
    userQuestions: "ip.userQuestions",
    apiKey: "ip.apiKey",
    provider: "ip.provider",
    base: "ip.base",
    model: "ip.model",
    geminiKey: "ip.geminiKey",
    geminiModel: "ip.geminiModel"
  };

  var PROVIDERS = {
    gemini: {
      base: "",
      model: "gemini-2.5-flash",
      models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-flash"]
    },
    openai: {
      base: "https://api.openai.com/v1",
      model: "gpt-5.5",
      models: ["gpt-5.5", "gpt-5", "gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"]
    },
    "openai-compat": {
      base: "/v1",
      model: "big-pickle",
      models: ["big-pickle", "glm-5", "kimi-k2", "deepseek-v4-flash", "qwen3-coder", "minimax-m3", "grok-code"]
    },
    opencode: {
      base: "http://localhost:4096",
      model: "",
      models: ["opencode/big-pickle", "opencode/gpt-5.5", "opencode/glm-5"]
    }
  };

  // Optional per-deployment defaults from config.js.
  var IPCFG = (typeof window !== "undefined" && window.IP_CONFIG) || {};
  if (IPCFG.base) PROVIDERS["openai-compat"].base = IPCFG.base;
  if (IPCFG.model) PROVIDERS["openai-compat"].model = IPCFG.model;

  // User-added questions (persisted in localStorage).
  function loadArray(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  var userQuestions = loadArray(STORE.userQuestions);

  function myTopic() {
    return {
      id: MY_TOPIC_ID,
      name: "My Questions",
      icon: "\u2B50",
      roles: ["ade", "architect"],
      custom: true,
      questions: userQuestions.map(function (u) {
        return { q: u.q, a: u.a || "", type: u.type || "concept", code: u.code || "", uid: u.id, cat: u.category || "", _user: u };
      })
    };
  }

  // Insert / refresh / remove the "My Questions" topic in TOPICS.
  function refreshMyTopic() {
    TOPICS = TOPICS.filter(function (t) { return t.id !== MY_TOPIC_ID; });
    if (userQuestions.length) TOPICS.push(myTopic());
  }
  refreshMyTopic();

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; }
    catch (e) { return {}; }
  }
  function save(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }

  var notes = load(STORE.notes);
  var confident = load(STORE.confident);

  var el = {
    topicNav: document.getElementById("topicNav"),
    questions: document.getElementById("questions"),
    topicTotal: document.getElementById("topicTotal"),
    crumb: document.getElementById("crumb"),
    search: document.getElementById("search"),
    clearSearch: document.getElementById("clearSearch"),
    roleFilter: document.getElementById("roleFilter"),
    resultCount: document.getElementById("resultCount"),
    empty: document.getElementById("empty"),
    progressFill: document.getElementById("progressFill"),
    progressText: document.getElementById("progressText"),
    resetProgress: document.getElementById("resetProgress"),
    expandAll: document.getElementById("expandAll"),
    collapseAll: document.getElementById("collapseAll")
  };

  function eachQuestion(cb) {
    TOPICS.forEach(function (topic) {
      (topic.questions || []).forEach(function (q, idx) {
        cb(topic, q, idx);
      });
    });
  }

  function hashCode(str) {
    var h = 0, i, chr;
    for (i = 0; i < str.length; i++) {
      chr = str.charCodeAt(i);
      h = ((h << 5) - h) + chr;
      h |= 0;
    }
    return Math.abs(h).toString(36);
  }

  function qKey(topic, q, idx) {
    return topic.id + "#" + (q.uid || idx) + "#" + hashCode(q.q);
  }

  function topicTotal(topic) {
    return (topic.questions || []).length;
  }

  function totalQuestions() {
    var n = 0;
    TOPICS.forEach(function (t) { n += topicTotal(t); });
    return n;
  }

  function roleTotalQuestions() {
    var n = 0;
    TOPICS.forEach(function (t) { if (matchesRole(t)) n += topicTotal(t); });
    return n;
  }

  function matchesRole(topic) {
    if (state.role === "all") return true;
    return (topic.roles || []).indexOf(state.role) !== -1;
  }

  function matchesSearch(q) {
    if (!state.search) return true;
    var s = state.search.toLowerCase();
    if (q.q && q.q.toLowerCase().indexOf(s) !== -1) return true;
    if (q.a && q.a.toLowerCase().indexOf(s) !== -1) return true;
    if (q.code && q.code.toLowerCase().indexOf(s) !== -1) return true;
    return false;
  }

  /* ---------------- Sidebar ---------------- */
  function renderSidebar() {
    el.topicTotal.textContent = roleTotalQuestions();
    el.topicNav.innerHTML = "";

    var allBtn = document.createElement("button");
    allBtn.className = "topic-item" + (state.topic === "all" ? " active" : "");
    allBtn.innerHTML = '<span class="t-icon">\uD83D\uDCDA</span><span class="t-name">All topics</span><span class="t-count">' + roleTotalQuestions() + "</span>";
    allBtn.addEventListener("click", function () {
      state.topic = "all";
      renderSidebar();
      renderQuestions();
    });
    el.topicNav.appendChild(allBtn);

    TOPICS.forEach(function (topic) {
      if (!matchesRole(topic)) return;
      var count = topicTotal(topic);
      var done = 0;
      (topic.questions || []).forEach(function (q, idx) {
        if (confident[qKey(topic, q, idx)]) done++;
      });
      var pct = count ? Math.round((done / count) * 100) : 0;

      var btn = document.createElement("button");
      btn.className = "topic-item wrap" + (state.topic === topic.id ? " active" : "");
      btn.innerHTML =
        '<div class="t-row">' +
          '<span class="t-icon">' + (topic.icon || "\u2022") + "</span>" +
          '<span class="t-name">' + escapeHtml(topic.name) + "</span>" +
          '<span class="t-count">' + count + "</span>" +
        "</div>" +
        '<div class="t-prog"><div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#4c8dff,#33c48d);"></div></div>';
      btn.addEventListener("click", function () {
        state.topic = topic.id;
        renderSidebar();
        renderQuestions();
      });
      el.topicNav.appendChild(btn);
    });
  }

  /* ---------------- Questions ---------------- */
  function renderQuestions() {
    el.questions.innerHTML = "";
    var shown = 0;
    var frag = document.createDocumentFragment();

    TOPICS.forEach(function (topic) {
      if (!matchesRole(topic)) return;
      if (state.topic !== "all" && state.topic !== topic.id) return;

      (topic.questions || []).forEach(function (q, idx) {
        if (!matchesSearch(q)) return;
        shown++;
        frag.appendChild(buildCard(topic, q, idx));
      });
    });

    el.questions.appendChild(frag);
    el.empty.hidden = shown !== 0;

    // breadcrumb
    if (state.topic === "all") {
      el.crumb.innerHTML = "Showing <strong>all topics</strong>";
    } else {
      var t = TOPICS.filter(function (x) { return x.id === state.topic; })[0];
      el.crumb.innerHTML = t ? "Topic: <strong>" + escapeHtml(t.name) + "</strong>" : "";
    }

    el.resultCount.textContent = shown + " question" + (shown === 1 ? "" : "s") + " shown";
    updateProgress();
  }

  function buildCard(topic, q, idx) {
    var key = qKey(topic, q, idx);
    var card = document.createElement("div");
    card.className = "card" + (confident[key] ? " confident" : "");
    card.dataset.key = key;

    var typeClass = q.type === "scenario" ? "scenario" : (q.type === "coding" ? "coding" : "");
    var typeLabel = q.type === "scenario" ? "Scenario" : (q.type === "coding" ? "Coding" : "Concept");

    var top = document.createElement("div");
    top.className = "card-top";
    top.innerHTML =
      '<span class="badge topic">' + (topic.icon || "") + " " + escapeHtml(topic.name) + "</span>" +
      (q.cat ? '<span class="badge topic">' + escapeHtml(q.cat) + "</span>" : "") +
      '<span class="badge type ' + typeClass + '">' + typeLabel + "</span>";
    card.appendChild(top);

    var qt = document.createElement("p");
    qt.className = "q-text";
    qt.innerHTML = '<span class="q-num">Q' + (idx + 1) + ".</span>" + escapeHtml(q.q);
    card.appendChild(qt);

    var actions = document.createElement("div");
    actions.className = "card-actions";

    var revealBtn = document.createElement("button");
    revealBtn.className = "btn reveal";
    revealBtn.textContent = state.openAnswers[key] ? "\u25B2 Hide answer" : "\u25BC Show answer";
    revealBtn.addEventListener("click", function () {
      var open = !state.openAnswers[key];
      state.openAnswers[key] = open;
      answer.style.display = open ? "block" : "none";
      revealBtn.textContent = open ? "\u25B2 Hide answer" : "\u25BC Show answer";
    });
    actions.appendChild(revealBtn);

    var speakBtn = document.createElement("button");
    speakBtn.className = "btn icon";
    speakBtn.title = "Read question aloud";
    speakBtn.textContent = "\uD83D\uDD0A";
    speakBtn.addEventListener("click", function () { speak(q.q); });
    actions.appendChild(speakBtn);

    var confBtn = document.createElement("button");
    confBtn.className = "btn icon confident" + (confident[key] ? " on" : "");
    confBtn.title = "Mark as confident";
    confBtn.textContent = "\u2714";
    confBtn.addEventListener("click", function () {
      confident[key] = !confident[key];
      if (!confident[key]) delete confident[key];
      save(STORE.confident, confident);
      confBtn.className = "btn icon confident" + (confident[key] ? " on" : "");
      card.className = "card" + (confident[key] ? " confident" : "");
      renderSidebar();
      updateProgress();
    });
    actions.appendChild(confBtn);

    if (q._user && q._user.sources && q._user.sources.length) {
      var srcBadge = document.createElement("span");
      srcBadge.className = "src-badge";
      srcBadge.textContent = "\uD83C\uDF10 " + q._user.sources.length + " source" + (q._user.sources.length === 1 ? "" : "s");
      actions.appendChild(srcBadge);
    }

    if (topic.custom && q._user) {
      var delBtn = document.createElement("button");
      delBtn.className = "btn icon danger";
      delBtn.title = "Delete this question";
      delBtn.textContent = "\uD83D\uDDD1";
      delBtn.addEventListener("click", function () {
        if (!confirm("Delete this question from My Questions?")) return;
        userQuestions = userQuestions.filter(function (u) { return u.id !== q._user.id; });
        save(STORE.userQuestions, userQuestions);
        refreshMyTopic();
        renderSidebar();
        renderQuestions();
      });
      actions.appendChild(delBtn);
    }

    card.appendChild(actions);

    // answer (hidden by default)
    var answer = document.createElement("div");
    answer.className = "answer";
    answer.style.display = state.openAnswers[key] ? "block" : "none";

    var at = document.createElement("div");
    at.className = "answer-text";
    at.textContent = q.a || "";
    answer.appendChild(at);

    if (q.code) {
      var lbl = document.createElement("div");
      lbl.className = "code-label";
      lbl.textContent = "Code";
      answer.appendChild(lbl);
      var code = document.createElement("pre");
      code.className = "code-block";
      code.textContent = q.code;
      answer.appendChild(code);
    }

    if (q._user && q._user.sources && q._user.sources.length) {
      var srcBox = document.createElement("div");
      srcBox.className = "sources";
      var st = document.createElement("div");
      st.className = "src-title";
      st.textContent = "Sources";
      srcBox.appendChild(st);
      q._user.sources.forEach(function (s) {
        if (!s || !s.url) return;
        var a = document.createElement("a");
        a.href = s.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = s.title || s.url;
        srcBox.appendChild(a);
      });
      answer.appendChild(srcBox);
    }
    card.appendChild(answer);

    // notes + voice input
    var notesWrap = document.createElement("div");
    notesWrap.className = "notes-wrap";

    var notesLabel = document.createElement("div");
    notesLabel.className = "notes-label";
    notesLabel.innerHTML = '<span>Your answer / notes ' +
      '<span class="saved-flag" data-flag>saved \u2713</span></span>';
    notesWrap.appendChild(notesLabel);

    var notesTools = document.createElement("div");
    notesTools.className = "notes-tools";

    var micBtn = document.createElement("button");
    micBtn.className = "btn icon";
    micBtn.title = "Dictate your answer";
    micBtn.textContent = "\uD83C\uDFA4";
    notesTools.appendChild(micBtn);

    var clearNotes = document.createElement("button");
    clearNotes.className = "btn icon";
    clearNotes.title = "Clear notes";
    clearNotes.textContent = "\uD83D\uDDD1";
    notesTools.appendChild(clearNotes);

    notesLabel.appendChild(notesTools);

    var ta = document.createElement("textarea");
    ta.className = "notes";
    ta.placeholder = "Type or dictate your answer here\u2026";
    ta.value = notes[key] || "";
    notesWrap.appendChild(ta);
    card.appendChild(notesWrap);

    var flag = notesLabel.querySelector("[data-flag]");
    var saveTimer = null;
    ta.addEventListener("input", function () {
      notes[key] = ta.value;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        save(STORE.notes, notes);
        flag.classList.add("show");
        setTimeout(function () { flag.classList.remove("show"); }, 900);
      }, 300);
    });

    clearNotes.addEventListener("click", function () {
      ta.value = "";
      delete notes[key];
      save(STORE.notes, notes);
    });

    setupMic(micBtn, ta);

    return card;
  }

  /* ---------------- Progress ---------------- */
  function updateProgress() {
    var total = 0, done = 0;
    eachQuestion(function (topic, q, idx) {
      if (!matchesRole(topic)) return;
      total++;
      if (confident[qKey(topic, q, idx)]) done++;
    });
    var pct = total ? Math.round((done / total) * 100) : 0;
    el.progressFill.style.width = pct + "%";
    el.progressText.textContent = done + " / " + total + " confident (" + pct + "%)";
  }

  /* ---------------- Voice: speech recognition ---------------- */
  var activeRecognition = null;
  function setupMic(btn, textarea) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      btn.disabled = true;
      btn.title = "Speech recognition not supported in this browser";
      btn.style.opacity = ".4";
      return;
    }
    var rec = new SR();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;

    var baseText = "";
    var finalText = "";

    rec.onstart = function () {
      btn.classList.add("listening");
      btn.title = "Listening\u2026 click to stop";
      baseText = textarea.value;
      finalText = "";
    };
    rec.onresult = function (e) {
      var interim = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var txt = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += txt + " ";
        else interim += txt;
      }
      var joined = (baseText ? baseText.replace(/\s*$/, " ") : "") + finalText + interim;
      textarea.value = joined;
      textarea.dispatchEvent(new Event("input"));
    };
    rec.onerror = function () { stop(); };
    rec.onend = function () { stop(); };

    function stop() {
      btn.classList.remove("listening");
      btn.title = "Dictate your answer";
      if (activeRecognition === rec) activeRecognition = null;
      // final save
      textarea.dispatchEvent(new Event("input"));
    }

    btn.addEventListener("click", function () {
      if (activeRecognition === rec) {
        rec.stop();
        return;
      }
      if (activeRecognition) { try { activeRecognition.stop(); } catch (e) {} }
      try {
        rec.start();
        activeRecognition = rec;
      } catch (e) {
        stop();
      }
    });
  }

  /* ---------------- Voice: text to speech ---------------- */
  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 1.0;
    window.speechSynthesis.speak(u);
  }

  /* ---------------- Utils ---------------- */
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---------------- Events ---------------- */
  el.search.addEventListener("input", function () {
    state.search = el.search.value.trim();
    el.clearSearch.classList.toggle("show", state.search.length > 0);
    renderQuestions();
  });
  el.clearSearch.addEventListener("click", function () {
    el.search.value = "";
    state.search = "";
    el.clearSearch.classList.remove("show");
    renderQuestions();
  });

  el.roleFilter.addEventListener("click", function (e) {
    var btn = e.target.closest(".role-btn");
    if (!btn) return;
    state.role = btn.dataset.role;
    Array.prototype.forEach.call(el.roleFilter.querySelectorAll(".role-btn"), function (b) {
      b.classList.toggle("active", b === btn);
    });
    if (state.topic !== "all") {
      var t = TOPICS.filter(function (x) { return x.id === state.topic; })[0];
      if (t && !matchesRole(t)) state.topic = "all";
    }
    renderSidebar();
    renderQuestions();
  });

  el.expandAll.addEventListener("click", function () {
    document.querySelectorAll(".card").forEach(function (card, i) {
      var key = card.dataset.key;
      state.openAnswers[key] = true;
      var ans = card.querySelector(".answer");
      var rb = card.querySelector(".btn.reveal");
      if (ans) ans.style.display = "block";
      if (rb) rb.textContent = "\u25B2 Hide answer";
    });
  });
  el.collapseAll.addEventListener("click", function () {
    document.querySelectorAll(".card").forEach(function (card) {
      var key = card.dataset.key;
      state.openAnswers[key] = false;
      var ans = card.querySelector(".answer");
      var rb = card.querySelector(".btn.reveal");
      if (ans) ans.style.display = "none";
      if (rb) rb.textContent = "\u25BC Show answer";
    });
  });

  el.resetProgress.addEventListener("click", function () {
    if (!confirm("Reset all progress and notes? This cannot be undone.")) return;
    confident = {};
    notes = {};
    save(STORE.confident, confident);
    save(STORE.notes, notes);
    state.openAnswers = {};
    renderSidebar();
    renderQuestions();
  });

  /* ---------------- Add-a-question modal ---------------- */
  var add = {
    overlay: document.getElementById("addModal"),
    open: document.getElementById("addOpen"),
    close: document.getElementById("addClose"),
    q: document.getElementById("addQ"),
    mic: document.getElementById("addMic"),
    topic: document.getElementById("addTopic"),
    type: document.getElementById("addType"),
    context: document.getElementById("addContext"),
    provider: document.getElementById("addProvider"),
    base: document.getElementById("addBase"),
    baseField: document.getElementById("baseField"),
    modelList: document.getElementById("modelList"),
    key: document.getElementById("addKey"),
    model: document.getElementById("addModel"),
    search: document.getElementById("addSearch"),
    manual: document.getElementById("addManual"),
    status: document.getElementById("addStatus"),
    result: document.getElementById("addResult"),
    answer: document.getElementById("addAnswer"),
    sources: document.getElementById("addSources"),
    save: document.getElementById("addSave"),
    regen: document.getElementById("addRegen"),
    exportMine: document.getElementById("exportMine")
  };

  var draft = { q: "", context: "", sources: [], text: "" };
  var busy = false;

  function setStatus(msg, kind) {
    if (!msg) { add.status.hidden = true; add.status.innerHTML = ""; return; }
    add.status.hidden = false;
    add.status.className = "add-status " + (kind || "info");
    add.status.innerHTML = msg;
  }

  function fillModels(provider) {
    var cfg = PROVIDERS[provider] || PROVIDERS.gemini;
    add.modelList.innerHTML = "";
    cfg.models.forEach(function (m) {
      var o = document.createElement("option");
      o.value = m;
      add.modelList.appendChild(o);
    });
  }

  // Show Base URL only for non-Gemini providers; fill sensible defaults.
  function applyProvider(setModel) {
    var p = add.provider.value;
    var cfg = PROVIDERS[p] || PROVIDERS.gemini;
    add.baseField.style.display = (p === "gemini") ? "none" : "";
    if (p !== "gemini" && !(add.base.value || "").trim()) add.base.value = cfg.base;
    fillModels(p);
    if (setModel || !(add.model.value || "").trim()) add.model.value = cfg.model;
  }

  function saveAiSettings() {
    try {
      localStorage.setItem(STORE.apiKey, (add.key.value || "").trim());
      localStorage.setItem(STORE.provider, add.provider.value);
      localStorage.setItem(STORE.base, (add.base.value || "").trim());
      localStorage.setItem(STORE.model, (add.model.value || "").trim());
    } catch (e) {}
  }

  // Restore saved AI settings (migrate legacy Gemini-only keys).
  try {
    var savedProvider = localStorage.getItem(STORE.provider) || IPCFG.provider || "gemini";
    if (PROVIDERS[savedProvider]) add.provider.value = savedProvider;
    var savedBase = localStorage.getItem(STORE.base) || "";
    // Migrate old CORS-blocked Zen URLs / machine-specific localhost URLs to host-relative "/v1".
    if (/opencode\.ai\/zen|https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/v1/.test(savedBase)) {
      savedBase = PROVIDERS["openai-compat"].base;
    }
    if (savedBase) add.base.value = savedBase;
    var savedModel = localStorage.getItem(STORE.model) || localStorage.getItem(STORE.geminiModel);
    if (savedModel) add.model.value = savedModel;
    var savedKey = localStorage.getItem(STORE.apiKey) || localStorage.getItem(STORE.geminiKey);
    if (savedKey) add.key.value = savedKey;
  } catch (e) {}
  applyProvider(false);

  add.provider.addEventListener("change", function () { applyProvider(true); saveAiSettings(); });
  add.base.addEventListener("change", saveAiSettings);
  add.model.addEventListener("change", saveAiSettings);
  add.key.addEventListener("change", saveAiSettings);

  function fillCategorySelect() {
    add.topic.innerHTML = "";
    var none = document.createElement("option");
    none.value = "";
    none.textContent = "\u2B50 My Questions (default)";
    add.topic.appendChild(none);
    TOPICS.forEach(function (t) {
      if (t.id === MY_TOPIC_ID) return;
      var o = document.createElement("option");
      o.value = t.name;
      o.textContent = t.name;
      add.topic.appendChild(o);
    });
  }

  function openModal() {
    fillCategorySelect();
    add.overlay.hidden = false;
    setTimeout(function () { add.q.focus(); }, 30);
  }
  function closeModal() {
    add.overlay.hidden = true;
    setStatus("");
    add.result.hidden = true;
    add.search.disabled = false;
    add.regen.disabled = false;
    busy = false;
  }

  add.open.addEventListener("click", openModal);
  add.close.addEventListener("click", closeModal);
  add.overlay.addEventListener("mousedown", function (e) {
    if (e.target === add.overlay) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !add.overlay.hidden) closeModal();
  });

  setupMic(add.mic, add.q);

  // Build the prompt sent to the model.
  function buildPrompt(question, context, useSearch) {
    return "You are an expert interview coach for Azure Data Engineer and Databricks Architect roles. " +
      "Answer the following interview question for a candidate. " +
      (useSearch
        ? "Use web search to find current, accurate, up-to-date information and cite real sources. "
        : "Rely on accurate, current knowledge. ") +
      "Write a crisp, well-structured answer as short bullet points; start every bullet " +
      "with the '\u2022 ' character (no markdown, no headers, no bold). Keep it concise (about 4-12 bullets), " +
      "concrete and interview-ready. If a short code example genuinely helps, include ONE fenced code block " +
      "(triple backticks) at the very end.\n\n" +
      "Question: " + question +
      (context ? "\n\nExtra context / focus: " + context : "");
  }

  function dedupeSources(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (s) {
      if (s && s.url && !seen[s.url]) { seen[s.url] = 1; out.push(s); }
    });
    return out;
  }

  function readOk(res) {
    return res.text().then(function (t) {
      var data = null;
      try { data = JSON.parse(t); } catch (e) {}
      if (!res.ok) {
        var msg = (data && data.error && (data.error.message || data.error)) || t || ("HTTP " + res.status);
        if (typeof msg !== "string") msg = JSON.stringify(msg);
        var err = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    });
  }

  function httpJson(url, headers, body) {
    return fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body)
    }).then(readOk);
  }

  function parseGemini(data) {
    var text = "";
    var sources = [];
    if (data && data.candidates && data.candidates[0]) {
      var c = data.candidates[0];
      if (c.content && c.content.parts) {
        text = c.content.parts.map(function (p) { return p.text || ""; }).join("");
      }
      var g = c.groundingMetadata;
      if (g && g.groundingChunks) {
        g.groundingChunks.forEach(function (ch) {
          var w = ch.web;
          if (w && w.uri) sources.push({ title: w.title || w.uri, url: w.uri });
        });
      }
    }
    if (!text && data && data.promptFeedback && data.promptFeedback.blockReason) {
      throw new Error("The request was blocked (" + data.promptFeedback.blockReason + ").");
    }
    if (!text) throw new Error("The model returned no text.");
    return { text: text.trim(), sources: dedupeSources(sources) };
  }

  function callGemini(apiKey, model, prompt, useSearch) {
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) + ":generateContent";
    var body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2000 }
    };
    if (useSearch) body.tools = [{ google_search: {} }];
    return httpJson(url, { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body)
      .then(parseGemini);
  }

  function parseResponses(data) {
    var text = "";
    var sources = [];
    var out = data && data.output;
    if (Array.isArray(out)) {
      out.forEach(function (item) {
        if (item && item.type === "message" && Array.isArray(item.content)) {
          item.content.forEach(function (c) {
            if (c && c.type === "output_text") {
              text += (c.text || "");
              (c.annotations || []).forEach(function (an) {
                if (an && an.type === "url_citation" && an.url) {
                  sources.push({ title: an.title || an.url, url: an.url });
                }
              });
            }
          });
        }
      });
    }
    if (!text && data && data.output_text) text = data.output_text;
    if (!text) throw new Error("The model returned no text.");
    return { text: text.trim(), sources: dedupeSources(sources) };
  }

  function callOpenAIResponses(base, apiKey, model, prompt, useSearch) {
    var url = base.replace(/\/+$/, "") + "/responses";
    var body = { model: model, input: prompt };
    if (useSearch) body.tools = [{ type: "web_search" }];
    return httpJson(url, { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey }, body)
      .then(parseResponses);
  }

  function callOpenAIChat(base, apiKey, model, prompt) {
    var url = base.replace(/\/+$/, "") + "/chat/completions";
    var body = {
      model: model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4
    };
    return httpJson(url, { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey }, body)
      .then(function (data) {
        var text = "";
        if (data && data.choices && data.choices[0] && data.choices[0].message) {
          text = data.choices[0].message.content || "";
        }
        if (!text && data && data.output_text) text = data.output_text;
        if (!text) throw new Error("The model returned no text.");
        return { text: String(text).trim(), sources: [] };
      });
  }

  // Join text out of opencode Message parts.
  function joinParts(parts) {
    var text = "";
    (parts || []).forEach(function (p) {
      if (p && p.type === "text" && typeof p.text === "string") text += p.text;
    });
    return text;
  }

  function basicAuth(key) {
    var user = "opencode", pass = key;
    if (key && key.indexOf(":") >= 0) { var i = key.indexOf(":"); user = key.slice(0, i); pass = key.slice(i + 1); }
    return "Basic " + btoa(user + ":" + pass);
  }

  // Talk to a local headless `opencode serve` (REST: POST /session, POST /session/:id/message).
  function callOpenCodeServer(base, key, model, prompt) {
    var root = (base || PROVIDERS.opencode.base).replace(/\/+$/, "");
    var headers = { "Content-Type": "application/json" };
    if (key) headers["Authorization"] = basicAuth(key);
    return fetch(root + "/session", { method: "POST", headers: headers, body: JSON.stringify({}) })
      .then(readOk)
      .then(function (s) {
        var id = s && (s.id || (s.info && s.info.id));
        if (!id) throw new Error("Could not create an opencode session (is `opencode serve` running?).");
        var msg = { parts: [{ type: "text", text: prompt }] };
        if (model && model.indexOf("/") >= 0) {
          var i = model.indexOf("/");
          msg.model = { providerID: model.slice(0, i), modelID: model.slice(i + 1) };
        }
        return fetch(root + "/session/" + encodeURIComponent(id) + "/message", {
          method: "POST", headers: headers, body: JSON.stringify(msg)
        });
      })
      .then(readOk)
      .then(function (data) {
        var text = joinParts(data && (data.parts || (data.info && data.info.parts)));
        if (!text && Array.isArray(data)) {
          data.forEach(function (m) { text += joinParts(m && m.parts); });
        }
        if (!text) throw new Error("The opencode server returned no text.");
        return { text: text.trim(), sources: [] };
      });
  }

  // Route to the selected provider. Returns a Promise of { text, sources }.
  function callProvider(prompt, useSearch) {
    var provider = add.provider.value;
    var apiKey = (add.key.value || "").trim();
    var model = (add.model.value || "").trim();
    var base = (add.base.value || "").trim();
    if (provider === "gemini") return callGemini(apiKey, model, prompt, useSearch);
    if (provider === "openai") {
      return callOpenAIResponses(base || PROVIDERS.openai.base, apiKey, model, prompt, useSearch);
    }
    if (provider === "opencode") return callOpenCodeServer(base, apiKey, model, prompt);
    return callOpenAIChat(base, apiKey, model, prompt);
  }

  // Best-effort description of the URL the current settings will call (for errors).
  function targetUrl() {
    var provider = add.provider.value;
    var base = (add.base.value || "").trim().replace(/\/+$/, "");
    if (provider === "gemini") return "https://generativelanguage.googleapis.com/...:generateContent";
    if (provider === "openai") return (base || PROVIDERS.openai.base) + "/responses";
    if (provider === "opencode") return (base || PROVIDERS.opencode.base) + "/session";
    return base + "/chat/completions";
  }

  function renderSources(sources) {
    add.sources.innerHTML = "";
    if (!sources || !sources.length) return;
    var t = document.createElement("div");
    t.className = "src-title";
    t.textContent = "Sources";
    add.sources.appendChild(t);
    sources.forEach(function (s) {
      var a = document.createElement("a");
      a.href = s.url; a.target = "_blank"; a.rel = "noopener";
      a.textContent = "\uD83D\uDD17 " + (s.title || s.url);
      add.sources.appendChild(a);
    });
  }

  function showResult(text, sources) {
    draft.text = text || "";
    draft.sources = sources || [];
    add.answer.value = draft.text;
    renderSources(draft.sources);
    add.result.hidden = false;
    setStatus("");
  }

  function generate() {
    if (busy) return;
    var question = (add.q.value || "").trim();
    if (!question) {
      setStatus("Please enter your question first.", "error");
      add.q.focus();
      return;
    }
    var provider = add.provider.value;
    var apiKey = (add.key.value || "").trim();
    var model = (add.model.value || "").trim();
    var base = (add.base.value || "").trim();
    if (!model && provider !== "opencode") {
      setStatus("Enter a model name (e.g. <code>gemini-2.5-flash</code>, <code>gpt-5.5</code>, <code>big-pickle</code>).", "error");
      add.model.focus();
      return;
    }
    if (!apiKey && provider !== "opencode") {
      setStatus("No API key set. Choose a provider and paste its API key above, " +
        "or use <strong>Add manually</strong> to paste an answer yourself.", "error");
      return;
    }
    if (provider !== "gemini" && !base) {
      setStatus("Enter the provider's Base URL (e.g. <code>https://api.openai.com/v1</code> or " +
        "<code>https://opencode.ai/zen/v1</code>).", "error");
      add.base.focus();
      return;
    }
    var context = (add.context.value || "").trim();
    saveAiSettings();

    var useSearch = provider === "gemini" || provider === "openai";
    busy = true;
    add.search.disabled = true;
    add.regen.disabled = true;
    add.result.hidden = true;
    setStatus('<span class="spinner"></span>' +
      (useSearch ? "Searching the web and drafting your answer\u2026 (up to ~20s)" : "Drafting your answer\u2026 (up to ~20s)"), "info");

    callProvider(buildPrompt(question, context, useSearch), useSearch)
      .catch(function (err) {
        // Search/tool unsupported or quota -> retry once without web search.
        if (useSearch && (err.status === 429 || err.status === 403 ||
            (err.status === 400 && /tool|ground|search|web/i.test(err.message || "")))) {
          setStatus('<span class="spinner"></span>Web search unavailable \u2014 drafting from model knowledge\u2026', "info");
          return callProvider(buildPrompt(question, context, false), false).then(function (out) {
            out.noSearch = true;
            return out;
          });
        }
        throw err;
      })
      .then(function (out) {
        showResult(out.text, out.sources);
        if (out.noSearch) setStatus("Web search was unavailable, so the answer was drafted from model knowledge (no live sources).", "info");
      })
      .catch(function (err) {
        var origin = (location && location.origin && location.origin !== "null")
          ? location.origin : (location && location.protocol) || "?";
        setStatus("\u26A0 " + escapeHtml(err.message || "Something went wrong.") +
          "<br>Request URL: <code>" + escapeHtml(targetUrl()) + "</code>" +
          "<br>Page origin: <code>" + escapeHtml(origin) + "</code>" +
          "<br>If this is a network/CORS error: check that the URL above points at the running proxy " +
          "(<code>node proxy.js</code>), your API key is valid, and you opened the app at " +
          "<code>http://localhost:8787/</code> (not the file directly).", "error");
      })
      .then(function () {
        busy = false;
        add.search.disabled = false;
        add.regen.disabled = false;
      });
  }

  add.search.addEventListener("click", generate);
  add.regen.addEventListener("click", generate);

  add.manual.addEventListener("click", function () {
    var question = (add.q.value || "").trim();
    if (!question) {
      setStatus("Please enter your question first.", "error");
      add.q.focus();
      return;
    }
    draft.sources = [];
    add.answer.value = "";
    add.result.hidden = false;
    setStatus("Manual mode \u2014 type or paste the answer, then click <strong>Add to my list</strong>.", "info");
    add.answer.focus();
  });

  // Split a trailing fenced code block out of the answer.
  function splitCode(text) {
    if (!text) return { a: "", code: "" };
    var m = text.match(/```[a-zA-Z0-9]*\n([\s\S]*?)```/);
    if (m) {
      return { a: text.replace(m[0], "").trim(), code: m[1].replace(/\s+$/, "") };
    }
    return { a: text.trim(), code: "" };
  }

  add.save.addEventListener("click", function () {
    var question = (add.q.value || "").trim();
    if (!question) { setStatus("Please enter your question first.", "error"); return; }
    var ans = add.answer.value || "";
    if (!ans.trim()) { setStatus("The answer is empty. Draft an answer or type one first.", "error"); return; }

    var parts = splitCode(ans);
    var item = {
      id: "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      q: question,
      a: parts.a,
      code: parts.code,
      type: add.type.value || "concept",
      category: add.topic.value || "",
      sources: draft.sources || [],
      createdAt: Date.now()
    };
    userQuestions.push(item);
    save(STORE.userQuestions, userQuestions);
    refreshMyTopic();

    // reset form and jump to My Questions
    add.q.value = "";
    add.context.value = "";
    add.answer.value = "";
    add.result.hidden = true;
    state.topic = MY_TOPIC_ID;
    state.search = "";
    el.search.value = "";
    el.clearSearch.classList.remove("show");
    renderSidebar();
    renderQuestions();
    closeModal();
    var t = TOPICS.filter(function (x) { return x.id === MY_TOPIC_ID; })[0];
    var toast = document.createElement("div");
    toast.className = "crumb";
    toast.style.color = "var(--green)";
    toast.innerHTML = "\u2705 Added to <strong>My Questions</strong> \u2014 now " +
      (t ? t.questions.length : userQuestions.length) + " question(s).";
    el.crumb.parentNode.insertBefore(toast, el.questions);
    setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3500);
  });

  // Export user questions as a data file they can drop into data/.
  add.exportMine.addEventListener("click", function () {
    if (!userQuestions.length) { alert("You haven't added any questions yet."); return; }
    var clean = userQuestions.map(function (u) {
      var o = { q: u.q, a: u.a };
      if (u.type && u.type !== "concept") o.type = u.type;
      if (u.code) o.code = u.code;
      if (u.sources && u.sources.length) o.sources = u.sources;
      return o;
    });
    var topic = { id: "my-questions", name: "My Questions", icon: "\u2B50", roles: ["ade", "architect"], questions: clean };
    var js = "window.QB = window.QB || [];\nQB.push(" + JSON.stringify(topic, null, 2) + ");\n";
    var blob = new Blob([js], { type: "text/javascript" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "my-questions.js";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  /* ---------------- Boot ---------------- */
  if (!TOPICS.length) {
    el.questions.innerHTML = '<div class="empty">No question data loaded. Ensure the data/*.js files are present.</div>';
  } else {
    renderSidebar();
    renderQuestions();
  }
})();
