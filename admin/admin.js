// Samarian Group dashboard: edit site text and people, then publish through /api/save.
(() => {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  let saved = null;   // content as last loaded or saved
  let state = null;   // content being edited
  let version = null; // version of content/site.json the edits are based on
  const previews = {}; // photo path -> image data, for photos not yet live on the site
  let busy = false;

  const PHOTO_W = 596, PHOTO_H = 734;
  const BLANK_BLOCK = () => ({ title: "", text: "" });

  // ---- paths like "about.sections" ----
  const get = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);
  const set = (obj, path, value) => {
    const keys = path.split(".");
    const last = keys.pop();
    keys.reduce((o, k) => o[k], obj)[last] = value;
  };

  // ---- status line and save button ----
  const statusEl = $("#status");
  const saveBtn = $("#save");
  const dirty = () => JSON.stringify(state) !== JSON.stringify(saved);
  function status(msg, kind = "") {
    statusEl.className = `status ${kind}`;
    statusEl.textContent = "";
    if (msg instanceof Node) statusEl.append(msg); else statusEl.textContent = msg;
  }
  function refresh() {
    const changed = dirty();
    saveBtn.disabled = !changed || busy;
    if (changed && !busy) status("Unsaved changes");
    else if (!busy && statusEl.textContent === "Unsaved changes") status("");
  }
  addEventListener("beforeunload", e => { if (state && dirty()) e.preventDefault(); });

  // ---- API ----
  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: options.body ? { "Content-Type": "application/json" } : {},
      ...options,
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
    return data;
  }

  // ---- sign in ----
  const loginView = $("#login"), appView = $("#app");
  function showLogin(msg = "") {
    appView.hidden = true;
    loginView.hidden = false;
    $("#login-error").textContent = msg;
    $("#login-form input").focus();
  }
  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("button", e.target);
    btn.disabled = true;
    $("#login-error").textContent = "";
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify({ password: e.target.password.value }) });
      e.target.reset();
      await load();
    } catch (err) {
      $("#login-error").textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
  $("#sign-out").addEventListener("click", async () => {
    if (dirty() && !confirm("You have unsaved changes. Sign out anyway?")) return;
    await api("/api/login", { method: "DELETE" }).catch(() => {});
    state = saved = null;
    showLogin();
  });

  async function load() {
    try {
      const data = await api("/api/content");
      saved = data.content;
      state = structuredClone(saved);
      version = data.sha;
      loginView.hidden = true;
      appView.hidden = false;
      render();
      status("");
    } catch (err) {
      showLogin(err.status === 401 ? "" : err.message);
    }
  }

  // ---- simple fields ----
  function autosize(t) { t.style.height = "auto"; t.style.height = `${t.scrollHeight + 2}px`; }
  function counter(t) {
    if (!t.hasAttribute("data-count")) return;
    let small = t.parentElement.querySelector("small");
    if (!small) { small = document.createElement("small"); t.after(small); }
    small.textContent = `${t.value.length} characters`;
    small.classList.toggle("over", t.value.length > 165);
  }
  function bindFields() {
    $$("[data-path]").forEach(el => {
      el.value = get(state, el.dataset.path) ?? "";
      el.oninput = () => {
        set(state, el.dataset.path, el.value);
        if (el.tagName === "TEXTAREA") { autosize(el); counter(el); }
        el.closest(".field")?.classList.remove("invalid");
        refresh();
      };
      if (el.tagName === "TEXTAREA") { autosize(el); counter(el); }
    });
  }

  // ---- lists of heading + text blocks (About points, values) ----
  function renderBlocks() {
    $$("[data-list]").forEach(list => {
      const items = get(state, list.dataset.list);
      list.replaceChildren(...items.map((item, i) => {
        const el = $("#block-template").content.firstElementChild.cloneNode(true);
        wireItem(el, items, i, renderBlocks);
        return el;
      }));
    });
  }
  $$("[data-add]").forEach(btn => btn.addEventListener("click", () => {
    get(state, btn.dataset.add).push(BLANK_BLOCK());
    renderBlocks();
    refresh();
    $$(`[data-list="${btn.dataset.add}"] .item`).pop()?.querySelector("input").focus();
  }));

  // Shared wiring for one editable item in an array
  function wireItem(el, items, i, rerender) {
    const item = items[i];
    $$("[data-key]", el).forEach(input => {
      input.value = item[input.dataset.key] ?? "";
      input.addEventListener("input", () => {
        item[input.dataset.key] = input.value;
        if (input.tagName === "TEXTAREA") autosize(input);
        input.closest(".field")?.classList.remove("invalid");
        refresh();
      });
      if (input.tagName === "TEXTAREA") requestAnimationFrame(() => autosize(input));
    });
    $$("[data-move]", el).forEach(btn => {
      const to = i + Number(btn.dataset.move);
      btn.disabled = to < 0 || to >= items.length;
      btn.addEventListener("click", () => {
        [items[i], items[to]] = [items[to], items[i]];
        rerender();
        refresh();
      });
    });
    $("[data-remove]", el).addEventListener("click", () => {
      const label = item.name || item.title || "this item";
      if (!confirm(`Remove ${label}?`)) return;
      items.splice(i, 1);
      rerender();
      refresh();
    });
  }

  // ---- people ----
  const photoSrc = p => p.upload || previews[p.photo] || (p.photo ? `/${p.photo}` : "");
  function renderPeople() {
    const list = $("#people-list");
    list.replaceChildren(...state.people.map((p, i) => {
      const el = $("#person-template").content.firstElementChild.cloneNode(true);
      const img = $(".person-photo img", el);
      img.src = photoSrc(p);
      img.alt = p.name ? `Photo of ${p.name}` : "";
      $("input[type=file]", el).addEventListener("change", async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          p.upload = await cropPhoto(file);
          img.src = p.upload;
          el.classList.remove("missing-photo");
          refresh();
        } catch (err) {
          alert("That image couldn't be opened. Try a JPEG or PNG.");
        }
        e.target.value = "";
      });
      wireItem(el, state.people, i, renderPeople);
      return el;
    }));
  }
  $("#add-person").addEventListener("click", () => {
    state.people.push({ name: "", role: "", photo: "", bio: "" });
    renderPeople();
    refresh();
    const last = $$("#people-list .person").pop();
    last.scrollIntoView({ behavior: "smooth", block: "center" });
    $("input[data-key=name]", last).focus();
  });

  // Fill a 596×734 portrait from the middle of the image, slightly favouring the top (faces)
  async function cropPhoto(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.max(PHOTO_W / bitmap.width, PHOTO_H / bitmap.height);
    const sw = PHOTO_W / scale, sh = PHOTO_H / scale;
    const sx = (bitmap.width - sw) / 2;
    const sy = Math.max(0, (bitmap.height - sh) * 0.3);
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_W;
    canvas.height = PHOTO_H;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, PHOTO_W, PHOTO_H);
    return canvas.toDataURL("image/jpeg", 0.86);
  }

  function render() {
    bindFields();
    renderBlocks();
    renderPeople();
    refresh();
  }

  // ---- checks before sending ----
  function check() {
    const problems = [];
    const flag = (el, msg) => { el?.closest(".field")?.classList.add("invalid"); problems.push({ el, msg }); };
    $$("[data-path]").forEach(el => { if (!el.value.trim()) flag(el, "Fill in every field before saving."); });
    $$("[data-list] .item input[data-key=title]").forEach(el => { if (!el.value.trim()) flag(el, "Every point needs a heading."); });
    $$("#people-list .person").forEach((el, i) => {
      const p = state.people[i];
      if (!p.name.trim()) flag($("input[data-key=name]", el), "Every person needs a name.");
      if (!p.upload && !p.photo) { el.classList.add("missing-photo"); problems.push({ el, msg: `${p.name || "A new person"} needs a photo.` }); }
    });
    if (problems.length) {
      problems[0].el?.scrollIntoView({ behavior: "smooth", block: "center" });
      status(problems[0].msg, "err");
    }
    return !problems.length;
  }

  // ---- save & publish ----
  saveBtn.addEventListener("click", async () => {
    if (!check()) return;
    busy = true;
    refresh();
    status("Publishing…");
    const uploads = state.people.map(p => p.upload);
    try {
      const data = await api("/api/save", { method: "POST", body: JSON.stringify({ sha: version, content: state }) });
      data.content.people.forEach((p, i) => { if (uploads[i]) previews[p.photo] = uploads[i]; });
      saved = data.content;
      state = structuredClone(saved);
      version = data.sha;
      busy = false;
      render();
      const msg = document.createElement("span");
      msg.append("Saved. The site updates in about 30 seconds. ");
      const link = Object.assign(document.createElement("a"), { href: "/", target: "_blank", rel: "noopener", textContent: "View site" });
      msg.append(link);
      status(msg, "ok");
    } catch (err) {
      busy = false;
      refresh();
      if (err.status === 401) return showLogin(err.message);
      status(err.message, "err");
    }
  });

  // Ctrl/Cmd+S saves
  addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s" && state) { e.preventDefault(); if (!saveBtn.disabled) saveBtn.click(); }
  });

  load();
})();
