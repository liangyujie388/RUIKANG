// ap.js（修复版：语法错误已全部修正，可直接运行）
// 说明：保留顶部导航切换 + 场景模拟 + 风险研判 + 举报 + 知识库 + 右下角 AI 抽屉
// ap.js
// 说明：保留顶部导航切换 + 场景模拟 + 风险研判 + 举报 + 知识库 + 右下角 AI 抽屉

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  // ===== Dify 配置 =====
  const difyConfig = window.DIFY_CONFIG || {};
  const difyBaseUrl = String(
    difyConfig.baseUrl || localStorage.getItem("DIFY_BASE_URL") || "http://localhost"
  )
    .replace(/\/+$/, "")
    .replace(/\/v1$/, "");

  let difyApiKey = String(
    difyConfig.apiKey || localStorage.getItem("DIFY_PRO_API_KEY") || localStorage.getItem("DIFY_API_KEY") || ""
  );

  let difyWorkflow = String(
    difyConfig.workflow || localStorage.getItem("DIFY_WORKFLOW") || ""
  );

  let difyWorkflowYml = String(
    difyConfig.workflow_yaml || localStorage.getItem("DIFY_WORKFLOW_YML") || ""
  );

  const embeddedWorkflowUrl = encodeURI(
    difyConfig.workflow_yaml || "./反诈劝阻助手(pro版) (1).yml"
  );

  function on(id, event, handler) {
    const el = $(id);
    if (!el) {
      console.warn(`[bind skipped] #${id} not found`);
      return;
    }
    el.addEventListener(event, handler);
  }

  // ===== Tabs =====
  const panels = {
    home: $("tab-home"),
    scene: $("tab-scene"),
    judge: $("tab-judge"),
    report: $("tab-report"),
    kb: $("tab-kb"),
  };

  function showPanel(key) {
    if (key === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      document
        .querySelectorAll(".menu__item")
        .forEach((b) => b.classList.remove("is-active"));
      document
        .querySelector('.menu__item[data-tab="home"]')
        ?.classList.add("is-active");
      return;
    }

    document
      .querySelectorAll(".menu__item")
      .forEach((b) => b.classList.remove("is-active"));
    document
      .querySelector(`.menu__item[data-tab="${key}"]`)
      ?.classList.add("is-active");

    document
      .querySelectorAll(".workbench .panel")
      .forEach((p) => p.classList.remove("is-show"));

    panels[key]?.classList.add("is-show");

    document
      .querySelector(".workbench")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.querySelectorAll(".menu__item").forEach((btn) => {
    btn.addEventListener("click", () => showPanel(btn.dataset.tab));
  });

  document.querySelectorAll('[data-tab]:not(.menu__item)').forEach((btn) => {
    btn.addEventListener("click", () => showPanel(btn.dataset.tab));
  });

  // ===== 场景模拟 =====
  const storyTitle = $("storyTitle");
  const storyBody = $("storyBody");

  const stories = {
    刷单返利: `【剧情】你在群里看到“轻松兼职日赚300”，对方先让你做小任务返你20元，随后要求你垫付更大金额才能“解冻返利”。
对方话术：“这是系统流程，不做就会影响信誉分。”
目标：识别“先小利诱导大额投入/解冻费/保证金”等风险点。`,
    游戏交易: `【剧情】你在二手平台看到低价皮肤，对方让你加QQ并发来“担保交易链接”，要求你在外站付款。
对方话术：“平台手续费太高，走链接更安全。”
目标：识别“跳转外部链接/诱导私下交易/仿冒担保平台”等风险点。`,
    冒充公检法: `【剧情】电话自称“公安/检察院”，称你涉嫌洗钱，要求你下载会议软件并屏幕共享，随后让你把钱转入“安全账户”。
对方话术：“这是保密案件，不能告诉家人。”
目标：识别“安全账户/恐吓威胁/要求保密/屏幕共享”等风险点。`,
  };

  document.querySelectorAll(".scenario").forEach((card) => {
    card.addEventListener("click", () => {
      const s = card.dataset.scenario;
      if (storyTitle) storyTitle.textContent = `当前场景：${s}`;
      if (storyBody) storyBody.textContent = stories[s] || "暂无剧情";
    });
  });

  on("copyStoryBtn", "click", async () => {
    await copyText(storyBody?.textContent || "");
    openAi();
  });

  // ===== 风险研判 =====
  const urlInput = $("urlInput");
  const textInput = $("textInput");
  const riskBadge = $("riskBadge");
  const signalsEl = $("signals");
  const adviceEl = $("advice");

  const rules = [
    { score: 35, hit: (u, t) => /安全账户|转入.*账户|涉案|洗钱|保密案件|公检法/.test(t), msg: "疑似“冒充公检法/安全账户”话术" },
    { score: 25, hit: (u, t) => /刷单|返利|垫付|解冻|保证金|任务单/.test(t), msg: "疑似“刷单返利/垫付解冻”话术" },
    { score: 20, hit: (u, t) => /验证码|不要告诉别人|10分钟|立即|否则影响征信|冻结/.test(t), msg: "存在“紧迫威胁/验证码”诱导特征" },
    { score: 20, hit: (u, t) => /屏幕共享|远程协助|会议软件/.test(t), msg: "存在“屏幕共享/远程控制”风险" },
    { score: 15, hit: (u, t) => /(http|https):\/\/\S+/.test(t) || /(http|https):\/\/\S+/.test(u), msg: "包含外部链接，需核验来源与域名" },
    { score: 15, hit: (u) => /t\.cn|bit\.ly|tinyurl|dwz|short/.test(u), msg: "疑似短链，可能隐藏真实跳转" },
    { score: 10, hit: (u) => /verify|login|secure|bank|pay/i.test(u), msg: "URL 含敏感诱导词（verify/login/bank/pay）" },
  ];

  function calcRisk(total) {
    if (total >= 55) return { level: "HIGH", cls: "risk--high" };
    if (total >= 30) return { level: "MID", cls: "risk--mid" };
    return { level: "LOW", cls: "risk--low" };
  }

  function buildAdvice(level) {
    const base =
      "建议：不要点击链接/不要转账/不要透露验证码；通过官方 App 或官方客服电话自行核验；保存证据（截图、链接、账号）并及时举报。";
    if (level === "HIGH")
      return `风险较高。${base}\n如已输入验证码/转账/安装软件：立即联系银行/平台止付，修改密码，关闭免密，必要时报警。`;
    if (level === "MID")
      return `存在明显可疑点。${base}\n建议把完整对话与链接发给 AI 进一步分析诈骗特征与应对步骤。`;
    return `当前未发现强特征，但仍建议谨慎核验来源。${base}`;
  }

  on("runJudgeBtn", "click", () => {
    const u = (urlInput?.value || "").trim();
    const t = (textInput?.value || "").trim();

    let total = 0;
    const hits = [];

    rules.forEach((r) => {
      if (r.hit(u, t)) {
        total += r.score;
        hits.push(r.msg);
      }
    });

    const r = calcRisk(total);

    if (riskBadge) {
      riskBadge.textContent = r.level;
      riskBadge.className = `risk ${r.cls}`;
    }

    if (signalsEl) {
      signalsEl.innerHTML = hits.length
        ? hits.map((x) => `<li>${escapeHtml(x)}</li>`).join("")
        : "<li>未命中明显规则（建议仍进行官方渠道核验）</li>";
    }

    if (adviceEl) adviceEl.textContent = buildAdvice(r.level);
  });

  on("fillDemoBtn", "click", () => {
    if (urlInput) urlInput.value = "http://xxbank-verify.com";
    if (textInput)
      textInput.value =
        "【XX银行】10分钟内核验否则影响征信。请点击链接进行身份验证，并输入短信验证码。";
  });

  on("copyAdviceBtn", "click", async () => {
    const risk = (riskBadge?.textContent || "").trim();
    const signals = Array.from(signalsEl?.querySelectorAll("li") || [])
      .map((li) => li.textContent.trim())
      .filter(Boolean);
    const advice = (adviceEl?.textContent || "").trim();

    const text = [
      risk ? `【风险等级】${risk}` : "",
      signals.length ? `【命中信号】\n${signals.map((s) => `- ${s}`).join("\n")}` : "",
      advice ? `【劝阻建议】\n${advice}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    if (!text) return alert("暂无可复制内容，请先开始研判。");
    await copyText(text);
  });

  on("openAiBtnFromJudge", "click", openAi);

  // ===== 举报 =====
  const reportLog = $("reportLog");

  on("submitReportBtn", "click", () => {
    const type = $("reportType")?.value;
    const evidence = ($("reportEvidence")?.value || "").trim();
    if (!evidence) return alert("请填写证据内容（链接/账号/群号/聊天记录等）");

    const item = { type, evidence, time: new Date().toISOString() };
    const key = "anti_fraud_reports";
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    list.unshift(item);
    localStorage.setItem(key, JSON.stringify(list));
    alert("已提交（本地保存）。后续可对接后端实现真实举报。");
  });

  on("viewReportsBtn", "click", () => {
    const key = "anti_fraud_reports";
    const list = JSON.parse(localStorage.getItem(key) || "[]");

    if (!reportLog) return;
    reportLog.classList.toggle("is-hidden");
    reportLog.textContent = list.length
      ? list.map((x, i) => `#${i + 1} [${x.time}] (${x.type})\n${x.evidence}\n`).join("\n")
      : "暂无本地举报记录。";
  });

  // ===== 知识库 =====
  const kbData = [
    { q: "刷单返利有什么典型特征？", a: "先小额返利获取信任，再诱导大额垫付；常见借口：解冻、保证金、刷流水。" },
    { q: "什么是“安全账户”？", a: "公检法不会要求转入所谓安全账户；这是典型诈骗话术。" },
    { q: "验证码可以给对方吗？", a: "任何验证码都不要透露；验证码=账户操作授权。" },
    { q: "收到可疑链接怎么办？", a: "不点击；通过官方 App/官网手动输入地址核验；保存证据并举报。" },
  ];

  const kbList = $("kbList");
  const kbSearch = $("kbSearch");

  function renderKb(keyword = "") {
    if (!kbList) return;
    const k = keyword.trim();
    const rows = kbData.filter((x) => !k || (x.q + x.a).includes(k));
    kbList.innerHTML = rows
      .map(
        (x) => `
        <div class="kb__item">
          <div class="kb__q">${escapeHtml(x.q)}</div>
          <div class="kb__a">${escapeHtml(x.a)}</div>
        </div>`
      )
      .join("");
  }

  renderKb();
  kbSearch?.addEventListener("input", () => renderKb(kbSearch.value));

  // ===== AI Drawer =====
  const aiFab = $("aiFab");
  const aiDrawer = $("aiDrawer");
  const backdrop = $("backdrop");
  const defaultBotPlaceholder = "请输入您要判别的内容(支持文本, 图片, 视频)";

  function openAi() {
    aiDrawer?.classList.add("is-open");
    backdrop?.classList.add("is-show");
    aiDrawer?.setAttribute("aria-hidden", "false");
    backdrop?.setAttribute("aria-hidden", "false");
  }

  function closeAi() {
    aiDrawer?.classList.remove("is-open");
    backdrop?.classList.remove("is-show");
    aiDrawer?.setAttribute("aria-hidden", "true");
    backdrop?.setAttribute("aria-hidden", "true");
  }

  aiFab?.addEventListener("click", openAi);
  on("closeAiBtn", "click", closeAi);
  backdrop?.addEventListener("click", closeAi);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAi();
  });

  on("copyContextBtn", "click", async () => {
    const ctx = [
      "【当前场景】" + (storyTitle?.textContent || ""),
      storyBody?.textContent || "",
      "【可疑URL】" + (urlInput?.value || ""),
      "【可疑文本】" + (textInput?.value || ""),
      "【我希望你做】请识别诈骗特征，给出风险等级与应对步骤，并生成劝阻话术与举报建议。",
    ].join("\n\n");
    await copyText(ctx);
  });

  // ===== Workflow YML =====
  const loadWorkflowBtn = $("loadWorkflowBtn");
  const workflowFileInput = document.getElementById("workflowFileInput");
  const workflowNameEl = $("workflowName");

  function updateWorkflowNameDisplay(label = "") {
    if (!workflowNameEl) return;
    workflowNameEl.textContent = label || (difyWorkflowYml ? "已加载 YML" : "");
  }
  updateWorkflowNameDisplay();

  async function loadEmbeddedWorkflowYml() {
    try {
      const response = await fetch(embeddedWorkflowUrl, { cache: "no-store" });
      if (!response.ok) return;

      const text = await response.text();
      if (!text.trim()) return;

      difyWorkflowYml = text;
      localStorage.setItem("DIFY_WORKFLOW_YML", text);
      updateWorkflowNameDisplay("已加载内置 YML");
    } catch (error) {
      console.warn("工作流 YML 自动加载失败：", error);
    }
  }

  loadEmbeddedWorkflowYml();

  loadWorkflowBtn?.addEventListener("click", () => workflowFileInput?.click());

  // ===== Dify 配置面板交互 =====
  const openConfigBtn = $("openConfigBtn");
  const difyConfigPanel = $("difyConfigPanel");
  const cfgBaseUrl = $("cfgBaseUrl");
  const cfgProKey = $("cfgProKey");
  const saveDifyConfigBtn = $("saveDifyConfigBtn");
  const cancelDifyConfigBtn = $("cancelDifyConfigBtn");

  function showDifyConfigPanel() {
    if (!difyConfigPanel) return;
    // 填充当前值
    cfgBaseUrl.value = localStorage.getItem("DIFY_BASE_URL") || difyConfig.baseUrl || "https://api.dify.ai";
    cfgProKey.value = localStorage.getItem("DIFY_PRO_API_KEY") || "";
    difyConfigPanel.style.display = "block";
  }

  function hideDifyConfigPanel() {
    if (!difyConfigPanel) return;
    difyConfigPanel.style.display = "none";
  }

  openConfigBtn?.addEventListener("click", () => showDifyConfigPanel());
  cancelDifyConfigBtn?.addEventListener("click", () => hideDifyConfigPanel());

  saveDifyConfigBtn?.addEventListener("click", () => {
    const b = (cfgBaseUrl?.value || "").trim();
    const k = (cfgProKey?.value || "").trim();
    if (b) localStorage.setItem("DIFY_BASE_URL", b);
    if (k) localStorage.setItem("DIFY_PRO_API_KEY", k);
    // keep a fallback key if present
    alert("已保存 DIFY 配置（存入 localStorage），下次请求将优先使用 DIFY_PRO_API_KEY。\n若页面已打开，请刷新后生效。");
    hideDifyConfigPanel();
    if (workflowNameEl) workflowNameEl.textContent = "已加载 YML";
  });

  workflowFileInput?.addEventListener("change", async () => {
    const f = workflowFileInput.files && workflowFileInput.files[0];
    if (!f) return;
    try {
      const txt = await f.text();
      difyWorkflowYml = txt;
      localStorage.setItem("DIFY_WORKFLOW_YML", txt);
      if (workflowNameEl) workflowNameEl.textContent = f.name;
      alert("已加载工作流 YML（保存在 localStorage）。");
    } catch (e) {
      alert("读取 YML 文件失败：" + (e?.message || e));
    } finally {
      workflowFileInput.value = "";
    }
  });

  // ===== Chat Interface =====
  const chatMessages = $("chatMessages");
  const chatInput = $("chatInput");
  const chatSendBtn = $("chatSendBtn");
  const chatAttachBtn = $("chatAttachBtn");
  const chatAttachmentsPreview = $("chatAttachmentsPreview");
  const mediaFileInput = $("mediaFileInput");

  let pendingFiles = [];

  appendAiMsg(
    "欢迎使用 <strong>AI 反诈助手</strong>！👋<br>" +
    "请输入您要判别的内容（文本、链接等），或点击 <strong>📎</strong> 附加图片&nbsp;/&nbsp;视频进行诈骗鉴别。<br>" +
    "<span class=\"chat-hint\">提示：你可以说「请识别诈骗特征，给出风险等级与应对步骤，并生成劝阻话术与举报建议。」</span>"
  );

  chatAttachBtn?.addEventListener("click", () => mediaFileInput?.click());

  mediaFileInput?.addEventListener("change", () => {
    Array.from(mediaFileInput.files || []).forEach((f) => pendingFiles.push(f));
    renderPendingChips();
    mediaFileInput.value = "";
  });

  chatInput?.addEventListener("input", () => {
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + "px";
  });

  chatInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  chatSendBtn?.addEventListener("click", sendChatMessage);

  // ===== Render Helpers =====
  function renderPendingChips() {
    if (!chatAttachmentsPreview) return;
    if (!pendingFiles.length) {
      chatAttachmentsPreview.classList.add("is-hidden");
      chatAttachmentsPreview.innerHTML = "";
      return;
    }
    chatAttachmentsPreview.classList.remove("is-hidden");
    chatAttachmentsPreview.innerHTML = pendingFiles
      .map(
        (f, i) => `
        <div class="chat-attach-chip">
          ${f.type.startsWith("image/") ? "🖼" : "📄"} <span>${escapeHtml(f.name)}</span>
          <button class="chat-attach-chip__remove" data-idx="${i}" type="button" aria-label="移除附件">✕</button>
        </div>
      `
      )
      .join("");

    chatAttachmentsPreview
      .querySelectorAll(".chat-attach-chip__remove")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          pendingFiles.splice(Number(btn.dataset.idx), 1);
          renderPendingChips();
        });
      });
  }

  function appendAiMsg(html) {
    if (!chatMessages) return;
    const el = document.createElement("div");
    el.className = "chat-msg chat-msg--ai";
    el.innerHTML = `<div class="chat-msg__avatar">AI</div><div class="chat-msg__bubble">${html}</div>`;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function appendUserMsg(text, files) {
    if (!chatMessages) return;
    const el = document.createElement("div");
    el.className = "chat-msg chat-msg--user";

    let mediaHtml = "";
    if (files.length) {
      const thumbs = files
        .map((f) => {
          const url = URL.createObjectURL(f);
          if (f.type.startsWith("image/")) {
            return `<img src="${url}" class="chat-media-thumb__img" alt="${escapeHtml(
              f.name
            )}" onload="URL.revokeObjectURL(this.src)">`;
          }
          if (f.type.startsWith("video/")) {
            return `<video src="${url}" class="chat-media-thumb__video" controls preload="metadata"></video>`;
          }
          return `<span class="chat-media-thumb__file">📄 ${escapeHtml(f.name)}</span>`;
        })
        .join("");
      mediaHtml = `<div class="chat-media-thumb">${thumbs}</div>`;
    }

    el.innerHTML = `
      <div class="chat-msg__bubble">
        ${text ? `<div>${escapeHtml(text)}</div>` : ""}
        ${mediaHtml}
      </div>
      <div class="chat-msg__avatar">我</div>
    `;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function appendThinkingMsg() {
    if (!chatMessages) return null;
    const el = document.createElement("div");
    el.className = "chat-msg chat-msg--ai";
    el.innerHTML = `
      <div class="chat-msg__avatar">AI</div>
      <div class="chat-msg__bubble">
        <span class="chat-thinking-dots">
          <span>.</span><span>.</span><span>.</span>
        </span>
      </div>
    `;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return el;
  }

  function inferDifyAttachmentType(mime) {
    const m = String(mime || "").toLowerCase();
    if (m.startsWith("image/")) return "image";
    if (m.startsWith("video/")) return "video";
    if (m.startsWith("audio/")) return "audio";
    return "document";
  }

  async function uploadFileToDify(file, user) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("user", user);

    const res = await fetch(`${difyBaseUrl}/v1/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${difyApiKey}`,
      },
      body: fd,
    });

    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`文件上传失败（HTTP ${res.status}）：${raw || "(empty)"}`);
    }

    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {}

    const id =
      data?.id ||
      data?.data?.id ||
      data?.file_id ||
      data?.data?.file_id;

    if (!id) throw new Error("文件上传接口未返回 file id：" + raw);
    return id;
  }

  function getFileBaseName(filename) {
    const name = String(filename || "media");
    const idx = name.lastIndexOf(".");
    return idx > 0 ? name.slice(0, idx) : name;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  async function createStoryboardImageFromVideo(file) {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    try {
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error(`视频解码失败：${file.name || "未知文件"}`));
      });

      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 8;
      const originW = Math.max(video.videoWidth || 1280, 320);
      const originH = Math.max(video.videoHeight || 720, 180);
      const ratio = originW / originH;

      const tileWidth = 360;
      const tileHeight = Math.max(180, Math.round(tileWidth / ratio));
      const cols = 2;
      const rows = 2;
      const tileCount = cols * rows;

      const canvas = document.createElement("canvas");
      canvas.width = tileWidth * cols;
      canvas.height = tileHeight * rows;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("浏览器不支持 Canvas 上下文");
      }

      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const timestamps = Array.from({ length: tileCount }, (_, i) => {
        const pos = (i + 1) / (tileCount + 1);
        return clamp(duration * pos, 0, Math.max(duration - 0.08, 0));
      });

      const seekTo = (time) =>
        new Promise((resolve, reject) => {
          const onSeeked = () => {
            cleanup();
            resolve();
          };
          const onError = () => {
            cleanup();
            reject(new Error(`视频抽帧失败：${file.name || "未知文件"}`));
          };
          const cleanup = () => {
            video.removeEventListener("seeked", onSeeked);
            video.removeEventListener("error", onError);
          };
          video.addEventListener("seeked", onSeeked, { once: true });
          video.addEventListener("error", onError, { once: true });
          video.currentTime = clamp(time, 0, Math.max(duration - 0.04, 0));
        });

      for (let i = 0; i < timestamps.length; i += 1) {
        const t = timestamps[i];
        await seekTo(t);

        const x = (i % cols) * tileWidth;
        const y = Math.floor(i / cols) * tileHeight;

        ctx.drawImage(video, x, y, tileWidth, tileHeight);

        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(x + 8, y + 8, 86, 24);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px sans-serif";
        ctx.fillText(`T+${Math.round(t)}s`, x + 14, y + 25);
      }

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error("视频关键帧生成失败"));
        }, "image/jpeg", 0.86);
      });

      const fileName = `${getFileBaseName(file.name)}_storyboard.jpg`;
      return new File([blob], fileName, { type: "image/jpeg" });
    } finally {
      URL.revokeObjectURL(objectUrl);
      video.src = "";
    }
  }

  async function prepareWorkflowFiles(files, user) {
    const workflowFiles = [];

    for (const file of files) {
      let uploadTarget = file;

      if (file?.type?.startsWith("video/")) {
        uploadTarget = await createStoryboardImageFromVideo(file);
      } else if (!file?.type?.startsWith("image/")) {
        throw new Error(`仅支持图片或视频上传，当前文件不支持：${file?.name || "未知文件"}`);
      }

      const uploadFileId = await uploadFileToDify(uploadTarget, user);
      workflowFiles.push({
        type: "image",
        transfer_method: "local_file",
        upload_file_id: uploadFileId,
      });
    }

    return workflowFiles;
  }

  function inferMoneyStatus(text) {
    const value = String(text || "");
    if (/(已|已经|刚刚|马上)?(转账|转了|充值|付款|付了|汇款|打款)/.test(value)) {
      return "已转账";
    }
    if (/(未|没|没有|还没|尚未|不用|不需要).{0,4}(转账|转了|充值|付款|汇款|打款)/.test(value)) {
      return "未转账";
    }
    return "未说明";
  }

  function normalizeWorkflowResponse(result) {
    const rawData = result?.data ?? result ?? {};
    const outputs = rawData?.outputs ?? rawData?.answer ?? rawData?.result ?? {};
    const answer =
      (typeof outputs === "string" && outputs) ||
      outputs?.answer ||
      outputs?.text ||
      outputs?.result ||
      rawData?.answer ||
      "";

    const status = rawData?.status || result?.status || "";

    return {
      success: status ? status === "succeeded" || status === "completed" : Boolean(answer),
      answer: String(answer || "").trim(),
      outputs,
      rawOutput: rawData,
    };
  }

  async function callDifyWorkflow({ text = "", money_sent = "未说明", user = "web-user", files = [] } = {}) {
    const difyBaseUrl = String(
      difyConfig.baseUrl || localStorage.getItem("DIFY_BASE_URL") || "https://api.dify.ai"
    )
      .replace(/\/+$/, "")
      .replace(/\/v1$/, "");

    const apiKey = String(
      difyConfig.apiKey || localStorage.getItem("DIFY_PRO_API_KEY") || localStorage.getItem("DIFY_API_KEY") || ""
    ).trim();

    if (!apiKey) {
      throw new Error("请先配置 DIFY_PRO_API_KEY 或 DIFY_API_KEY");
    }

    const workflowFiles = files && files.length > 0 ? await prepareWorkflowFiles(files, user) : [];

    const payload = {
      inputs: {
        text: String(text || ""),
        money_sent: String(money_sent || "未说明"),
        files_user: workflowFiles,
      },
      response_mode: "blocking",
      user: String(user || "web-user"),
    };

    const response = await fetch(`${difyBaseUrl}/v1/workflows/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      mode: "cors",
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    let result = null;

    try {
      result = rawText ? JSON.parse(rawText) : null;
    } catch {
      result = { rawText };
    }

    if (!response.ok) {
      console.error("❌ Dify 请求失败:", result || rawText);
      throw new Error(`HTTP ${response.status}: ${result?.message || result?.msg || rawText || "请求失败"}`);
    }

    console.log("✅ Dify 响应成功:", result);
    return normalizeWorkflowResponse(result);
  }

  async function sendChatMessage() {
    const text = (chatInput?.value || "").trim();
    const files = [...pendingFiles];
    if (!text && !files.length) return;

    chatInput.value = "";
    chatInput.style.height = "auto";
    pendingFiles = [];
    renderPendingChips();

    appendUserMsg(text, files);
    const thinking = appendThinkingMsg();

    try {
      const result = await callDifyWorkflow({
        text,
        money_sent: inferMoneyStatus(text),
        user: "front1-web-user",
        files,
      });
      thinking?.remove();

      if (result?.answer) {
        appendAiMsg(`
          <div class="chat-section-title">🧠 Dify 工作流研判结果</div>
          <div>${escapeHtml(result.answer).replace(/\n/g, "<br>")}</div>
        `);
      } else if (result?.outputs) {
        appendAiMsg(`
          <div class="chat-section-title">ℹ️ 工作流执行完成</div>
          <div>返回数据格式：</div>
          <pre style="background:#f5f5f5;padding:12px;border-radius:6px;overflow:auto;max-height:300px;font-size:12px;">
${escapeHtml(JSON.stringify(result.outputs, null, 2))}
          </pre>
        `);
      } else {
        appendAiMsg("工作流已执行，但未返回可展示的 answer 字段。");
      }
    } catch (err) {
      thinking?.remove();
      const baseMsg = String(err?.message || err || "未知错误");
      let errorHtml = escapeHtml(baseMsg).replace(/\n/g, "<br>");

      if (baseMsg.includes("API Key") || baseMsg.includes("配置")) {
        errorHtml += `<br><br>请先配置 DIFY_PRO_API_KEY（优先）或 DIFY_API_KEY 和 DIFY_BASE_URL。`;
      } else if (baseMsg.includes("CORS") || baseMsg.includes("NetworkError")) {
        errorHtml += `<br><br>请检查：<br>1. Base URL 是否正确<br>2. Dify 是否允许跨域（CORS）<br>3. 是否启用 HTTPS`;
      }

      appendAiMsg(`
        <div class="chat-section-title">❌ 调用失败</div>
        <div style="white-space:normal;word-break:break-word;">${errorHtml}</div>
        <div style="margin-top:12px;padding:12px;background:#fff3cd;border-radius:6px;border:1px solid #ffeaa7;">
          <strong>排查建议：</strong><br>
          1. 去 Dify 控制台查看该次运行的日志<br>
          2. 确认开始节点变量名与类型<br>
          3. Base URL 通常是 https://api.dify.ai
        </div>
      `);
    }
  }

  // ===== Utils =====
  async function copyText(text) {
    const content = String(text || "");
    if (!content.trim()) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
        alert("已复制，可直接粘贴给 AI。");
        return;
      }
    } catch {}

    const ta = document.createElement("textarea");
    ta.value = content;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    alert(ok ? "已复制，可直接粘贴给 AI。" : "复制失败，请手动复制。");
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  window.__openAi = openAi;
});