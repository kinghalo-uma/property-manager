(function () {
  "use strict";

  // ---------- Config ----------
  var SCOPE = "https://www.googleapis.com/auth/drive.file";
  var ROOT_NAME = "Property Manager";
  var DATA_NAME = "properties.json";
  var FOLDER_MIME = "application/vnd.google-apps.folder";
  var API = "https://www.googleapis.com/drive/v3";
  var UPLOAD = "https://www.googleapis.com/upload/drive/v3";

  var settings = loadLocal("pm.settings", { clientId: "", mapsKey: "" });
  var cfg = window.PM_CONFIG || {};

  // ---------- State ----------
  var token = null;
  var tokenExpiry = 0;
  var rootId = null;
  var dataId = null;
  var properties = [];
  var connected = false;
  var editingId = null;
  var viewingId = null;
  var saveChain = Promise.resolve();

  // ---------- Small helpers ----------
  function loadLocal(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function saveLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
  }
  function $(id) { return document.getElementById(id); }
  function clientId() { return (settings.clientId || cfg.clientId || "").trim(); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function setStatus(text, isError) {
    var s = $("status");
    s.textContent = text || "";
    s.className = "status" + (isError ? " error" : "");
  }
  function report(err) {
    console.error(err);
    setStatus(err && err.message ? err.message : String(err), true);
  }

  // ---------- Google sign-in ----------
  function waitForGoogle() {
    return new Promise(function (resolve, reject) {
      var tries = 0;
      (function check() {
        if (window.google && google.accounts && google.accounts.oauth2) return resolve();
        if (++tries > 100) return reject(new Error("The Google sign-in script didn't load. Check your connection and any ad blocker."));
        setTimeout(check, 100);
      })();
    });
  }

  function requestToken() {
    return waitForGoogle().then(function () {
      return new Promise(function (resolve, reject) {
        if (!clientId()) return reject(new Error("Add your Google client ID in Settings first."));
        var client = google.accounts.oauth2.initTokenClient({
          client_id: clientId(),
          scope: SCOPE,
          callback: function (resp) {
            if (resp.error) return reject(new Error(resp.error_description || resp.error));
            token = resp.access_token;
            tokenExpiry = Date.now() + (Number(resp.expires_in) - 60) * 1000;
            resolve(token);
          },
          error_callback: function (err) {
            reject(new Error("Sign-in didn't finish (" + (err && err.type ? err.type : "cancelled") + "). Click Connect to try again."));
          }
        });
        client.requestAccessToken({ prompt: "" });
      });
    });
  }

  function getToken() {
    if (token && Date.now() < tokenExpiry) return Promise.resolve(token);
    return requestToken();
  }

  // ---------- Drive API ----------
  function drive(path, opts, base) {
    return getToken().then(function (t) {
      opts = opts || {};
      opts.headers = Object.assign({ Authorization: "Bearer " + t }, opts.headers || {});
      return fetch((base || API) + path, opts);
    }).then(function (r) {
      if (r.ok) return r;
      return r.text().then(function (txt) {
        throw new Error("Google Drive error " + r.status + ": " + txt.slice(0, 200));
      });
    });
  }
  function driveJson(path, opts, base) {
    return drive(path, opts, base).then(function (r) { return r.json(); });
  }
  function enc(s) { return encodeURIComponent(s); }

  function findOne(query) {
    return driveJson("/files?q=" + enc(query) + "&fields=" + enc("files(id,name)") + "&pageSize=1&spaces=drive")
      .then(function (d) { return d.files && d.files[0] ? d.files[0] : null; });
  }

  function createFolder(name, parentId) {
    var body = { name: name, mimeType: FOLDER_MIME };
    if (parentId) body.parents = [parentId];
    return driveJson("/files?fields=id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (d) { return d.id; });
  }

  function writeData() {
    var body = JSON.stringify(properties, null, 2);
    if (dataId) {
      return drive("/files/" + dataId + "?uploadType=media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: body
      }, UPLOAD);
    }
    var boundary = "pm" + Date.now();
    var meta = JSON.stringify({ name: DATA_NAME, parents: [rootId], mimeType: "application/json" });
    var multipart =
      "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + meta + "\r\n" +
      "--" + boundary + "\r\nContent-Type: application/json\r\n\r\n" + body + "\r\n" +
      "--" + boundary + "--";
    return drive("/files?uploadType=multipart&fields=id", {
      method: "POST",
      headers: { "Content-Type": "multipart/related; boundary=" + boundary },
      body: multipart
    }, UPLOAD).then(function (r) { return r.json(); }).then(function (d) { dataId = d.id; });
  }

  // Saves are queued so two quick edits can't overwrite each other.
  function persist() {
    setStatus("Saving…");
    saveChain = saveChain.then(writeData).then(function () {
      setStatus("Saved to Google Drive");
    }, function (err) {
      report(err);
      throw err;
    });
    return saveChain.catch(function () { /* already reported; keep the chain usable */ });
  }

  function connect() {
    setStatus("Connecting…");
    return getToken()
      .then(function () {
        return findOne("name='" + ROOT_NAME + "' and mimeType='" + FOLDER_MIME + "' and trashed=false");
      })
      .then(function (f) { return f ? f.id : createFolder(ROOT_NAME); })
      .then(function (id) {
        rootId = id;
        return findOne("name='" + DATA_NAME + "' and '" + rootId + "' in parents and trashed=false");
      })
      .then(function (f) {
        if (!f) {
          properties = [];
          return writeData();
        }
        dataId = f.id;
        return drive("/files/" + dataId + "?alt=media").then(function (r) { return r.json(); }).then(function (d) {
          properties = Array.isArray(d) ? d : [];
        });
      })
      .then(function () {
        connected = true;
        $("connectScreen").hidden = true;
        $("app").hidden = false;
        $("addBtn").hidden = false;
        setStatus("Connected to Google Drive");
        renderList();
      })
      .catch(report);
  }

  function ensurePropFolder(p) {
    if (p.folderId) return Promise.resolve(p.folderId);
    return createFolder(p.address + " (" + p.postcode + ")", rootId).then(function (id) {
      p.folderId = id;
      return persist().then(function () { return id; });
    });
  }

  function listFiles(p) {
    if (!p.folderId) return Promise.resolve([]);
    var q = "'" + p.folderId + "' in parents and trashed=false";
    var fields = "files(id,name,mimeType,size,webViewLink)";
    return driveJson("/files?q=" + enc(q) + "&fields=" + enc(fields) + "&orderBy=name&pageSize=100")
      .then(function (d) { return d.files || []; });
  }

  function uploadFile(p, file) {
    var type = file.type || "application/octet-stream";
    return ensurePropFolder(p).then(function (folderId) {
      return getToken().then(function (t) {
        return fetch(UPLOAD + "/files?uploadType=resumable&fields=id", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + t,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": type,
            "X-Upload-Content-Length": String(file.size)
          },
          body: JSON.stringify({ name: file.name, parents: [folderId] })
        });
      });
    }).then(function (r) {
      if (!r.ok) throw new Error("Couldn't start the upload (Drive error " + r.status + ").");
      var loc = r.headers.get("Location");
      if (!loc) throw new Error("Drive didn't return an upload address.");
      return fetch(loc, { method: "PUT", headers: { "Content-Type": type }, body: file });
    }).then(function (r) {
      if (!r.ok) throw new Error("Upload failed (Drive error " + r.status + ").");
    });
  }

  function trashItem(id) {
    return drive("/files/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true })
    });
  }

  // ---------- Property logic ----------
  function fullAddress(p) { return p.address + ", " + p.postcode; }

  // EPC certificates are valid for 10 years from the certificate date.
  function epcExpiry(p) {
    if (!p.epcDate) return null;
    var d = new Date(p.epcDate + "T00:00:00");
    if (isNaN(d)) return null;
    d.setFullYear(d.getFullYear() + 10);
    return d;
  }
  function epcState(p) {
    var exp = epcExpiry(p);
    if (!exp) return null;
    var days = Math.round((exp - new Date()) / 86400000);
    if (days < 0) return { cls: "bad", text: "EPC expired" };
    if (days <= 90) return { cls: "warn", text: "EPC expires in " + days + " days" };
    return { cls: "", text: "EPC valid" };
  }
  function fmtDate(d) {
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function money(n) {
    return n || n === 0 ? "£" + Number(n).toLocaleString("en-GB") : "–";
  }
  function fmtSize(bytes) {
    var n = Number(bytes);
    if (!n) return "";
    if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }
  function epcBadge(rating) {
    return el("span", { class: "epc " + (rating || "none"), text: rating || "?", title: rating ? "EPC rating " + rating : "EPC unknown" });
  }
  function safeDriveLink(url) {
    return typeof url === "string" && url.indexOf("https://") === 0 ? url : null;
  }

  function filtered() {
    var q = $("search").value.trim().toLowerCase();
    var s = $("statusFilter").value;
    return properties.filter(function (p) {
      if (s && p.status !== s) return false;
      if (!q) return true;
      return [p.address, p.postcode, p.tenant, p.notes].join(" ").toLowerCase().indexOf(q) !== -1;
    });
  }

  // ---------- Rendering ----------
  function renderList() {
    var list = $("list");
    list.textContent = "";
    $("empty").hidden = properties.length > 0;

    filtered().forEach(function (p) {
      var state = epcState(p);
      var card = el("article", { class: "card", tabindex: "0", role: "button" }, [
        el("div", { class: "row" }, [epcBadge(p.epcRating), el("h3", { text: p.address })]),
        el("div", { class: "meta", text: p.postcode + " · " + p.type + (p.bedrooms ? " · " + p.bedrooms + " bed" : "") }),
        el("div", { class: "row" }, [
          el("span", { class: "badge " + p.status, text: p.status }),
          el("span", { class: "meta", text: money(p.rent) + "/month" }),
          state && state.cls ? el("span", { class: "badge " + state.cls, text: state.text }) : null
        ])
      ]);
      card.addEventListener("click", function () { openDetail(p.id); });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(p.id); }
      });
      list.appendChild(card);
    });

    var income = properties.reduce(function (sum, p) {
      return sum + (p.status === "Occupied" ? Number(p.rent) || 0 : 0);
    }, 0);
    var vacant = properties.filter(function (p) { return p.status === "Vacant"; }).length;
    $("summary").textContent = properties.length + " properties · " + vacant + " vacant · " + money(income) + "/month occupied rent";
  }

  function row(dl, label, value) {
    dl.appendChild(el("dt", { text: label }));
    dl.appendChild(el("dd", { text: value || "–" }));
  }

  function renderFiles(p, box) {
    box.textContent = "Loading…";
    listFiles(p).then(function (files) {
      box.textContent = "";
      if (!files.length) {
        box.appendChild(el("p", { class: "hint", text: "No documents yet." }));
        return;
      }
      files.forEach(function (f) {
        var link = safeDriveLink(f.webViewLink);
        var name = link
          ? el("a", { href: link, target: "_blank", rel: "noopener", text: f.name })
          : el("span", { text: f.name });
        var remove = el("button", { type: "button", class: "small", text: "Remove" });
        remove.addEventListener("click", function () {
          if (!confirm("Move \"" + f.name + "\" to the Google Drive bin?")) return;
          trashItem(f.id).then(function () { renderFiles(p, box); }).catch(report);
        });
        box.appendChild(el("div", { class: "file-row" }, [
          name,
          el("span", { class: "meta", text: fmtSize(f.size) }),
          remove
        ]));
      });
    }).catch(function (err) {
      box.textContent = "";
      box.appendChild(el("p", { class: "hint", text: "Couldn't load documents." }));
      report(err);
    });
  }

  function openDetail(id) {
    var p = properties.find(function (x) { return x.id === id; });
    if (!p) return;
    viewingId = id;
    var body = $("detailBody");
    body.textContent = "";
    body.appendChild(el("h2", { text: p.address }));

    var dl = el("dl");
    row(dl, "Postcode", p.postcode);
    row(dl, "Type", p.type + (p.bedrooms ? ", " + p.bedrooms + " bed" : ""));
    row(dl, "Status", p.status);
    row(dl, "Tenant", p.tenant);
    row(dl, "Rent", p.rent || p.rent === 0 ? money(p.rent) + "/month" : "");

    dl.appendChild(el("dt", { text: "EPC" }));
    var epcCell = el("dd", { class: "row" }, [epcBadge(p.epcRating)]);
    if (p.epcScore) epcCell.appendChild(el("span", { text: "Score " + p.epcScore }));
    dl.appendChild(epcCell);

    var exp = epcExpiry(p);
    var state = epcState(p);
    row(dl, "EPC dated", p.epcDate ? fmtDate(new Date(p.epcDate + "T00:00:00")) : "");
    row(dl, "EPC expires", exp ? fmtDate(exp) + (state && state.cls ? " (" + state.text + ")" : "") : "");
    row(dl, "EPC number", p.epcRrn);
    row(dl, "Notes", p.notes);

    var links = el("div", { class: "links" });
    var addr = encodeURIComponent(fullAddress(p));
    if (p.epcRrn) {
      links.appendChild(el("a", {
        href: "https://find-energy-certificate.service.gov.uk/energy-certificate/" + encodeURIComponent(p.epcRrn),
        target: "_blank", rel: "noopener", text: "View EPC certificate"
      }));
    } else {
      links.appendChild(el("a", {
        href: "https://find-energy-certificate.service.gov.uk/find-a-certificate/search-by-postcode?postcode=" + encodeURIComponent(p.postcode),
        target: "_blank", rel: "noopener", text: "Find EPC for this postcode"
      }));
    }
    links.appendChild(el("a", {
      href: "https://www.google.com/maps/search/?api=1&query=" + addr,
      target: "_blank", rel: "noopener", text: "Open in Google Maps"
    }));
    links.appendChild(el("a", {
      href: "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" + addr,
      target: "_blank", rel: "noopener", text: "Street View"
    }));
    if (p.folderId) {
      links.appendChild(el("a", {
        href: "https://drive.google.com/drive/folders/" + encodeURIComponent(p.folderId),
        target: "_blank", rel: "noopener", text: "Open folder in Drive"
      }));
    }

    var map = el("div", { class: "map" });
    if (settings.mapsKey) {
      map.appendChild(el("img", {
        alt: "Street View of " + p.address,
        src: "https://maps.googleapis.com/maps/api/streetview?size=640x300&location=" + addr + "&key=" + encodeURIComponent(settings.mapsKey)
      }));
    }
    map.appendChild(el("iframe", {
      title: "Map of " + p.address,
      loading: "lazy",
      referrerpolicy: "no-referrer-when-downgrade",
      src: "https://maps.google.com/maps?q=" + addr + "&z=16&output=embed"
    }));

    body.appendChild(el("div", { class: "detail-grid" }, [el("div", {}, [dl, links]), map]));

    // Documents section
    var fileBox = el("div", { class: "file-list" });
    var input = el("input", { type: "file", multiple: "multiple", hidden: "hidden" });
    var uploadLabel = el("label", { class: "btn" }, [document.createTextNode("Upload documents or photos"), input]);
    input.addEventListener("change", function () {
      var files = Array.prototype.slice.call(input.files);
      input.value = "";
      if (!files.length) return;
      var chain = Promise.resolve();
      files.forEach(function (file, i) {
        chain = chain.then(function () {
          setStatus("Uploading " + (i + 1) + " of " + files.length + ": " + file.name);
          return uploadFile(p, file);
        });
      });
      chain.then(function () {
        setStatus("Uploaded to Google Drive");
        renderFiles(p, fileBox);
      }).catch(function (err) {
        report(err);
        renderFiles(p, fileBox);
      });
    });
    body.appendChild(el("section", { class: "files" }, [
      el("h3", { text: "Documents & photos" }),
      fileBox,
      uploadLabel
    ]));
    renderFiles(p, fileBox);

    $("detailDialog").showModal();
  }

  function openForm(id) {
    editingId = id || null;
    var form = $("propForm");
    form.reset();
    $("formTitle").textContent = id ? "Edit property" : "Add property";
    if (id) {
      var p = properties.find(function (x) { return x.id === id; });
      if (p) Object.keys(p).forEach(function (k) {
        if (form.elements[k]) form.elements[k].value = p[k] == null ? "" : p[k];
      });
    }
    $("formDialog").showModal();
  }

  function uid() {
    return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------- Events ----------
  $("propForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = $("propForm").elements;
    var existing = editingId ? properties.find(function (x) { return x.id === editingId; }) : null;
    var rec = Object.assign({}, existing || {}, {
      id: editingId || uid(),
      address: f.address.value.trim(),
      postcode: f.postcode.value.trim().toUpperCase(),
      type: f.type.value,
      bedrooms: f.bedrooms.value,
      rent: f.rent.value,
      status: f.status.value,
      tenant: f.tenant.value.trim(),
      epcRating: f.epcRating.value,
      epcScore: f.epcScore.value,
      epcDate: f.epcDate.value,
      epcRrn: f.epcRrn.value.trim(),
      notes: f.notes.value.trim()
    });
    if (editingId) {
      properties = properties.map(function (p) { return p.id === editingId ? rec : p; });
    } else {
      properties.push(rec);
    }
    $("formDialog").close();
    renderList();
    persist();
  });

  $("connectBtn").addEventListener("click", connect);
  $("addBtn").addEventListener("click", function () { openForm(null); });
  $("formCancel").addEventListener("click", function () { $("formDialog").close(); });
  $("detailClose").addEventListener("click", function () { $("detailDialog").close(); });
  $("detailEdit").addEventListener("click", function () {
    var id = viewingId;
    $("detailDialog").close();
    openForm(id);
  });
  $("detailDelete").addEventListener("click", function () {
    var p = properties.find(function (x) { return x.id === viewingId; });
    if (!p) return;
    if (!confirm("Delete this property? Its documents folder will be moved to the Google Drive bin.")) return;
    properties = properties.filter(function (x) { return x.id !== viewingId; });
    $("detailDialog").close();
    renderList();
    persist().then(function () {
      if (p.folderId) return trashItem(p.folderId).catch(report);
    });
  });

  $("search").addEventListener("input", renderList);
  $("statusFilter").addEventListener("change", renderList);

  $("settingsBtn").addEventListener("click", function () {
    var f = $("settingsForm").elements;
    f.clientId.value = settings.clientId || cfg.clientId || "";
    f.mapsKey.value = settings.mapsKey || "";
    $("settingsDialog").showModal();
  });
  $("settingsCancel").addEventListener("click", function () { $("settingsDialog").close(); });
  $("settingsForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = $("settingsForm").elements;
    settings.clientId = f.clientId.value.trim();
    settings.mapsKey = f.mapsKey.value.trim();
    saveLocal("pm.settings", settings);
    $("settingsDialog").close();
    $("needClientId").hidden = !!clientId();
  });

  // ---------- Start ----------
  $("needClientId").hidden = !!clientId();
})();
