(function () {
  "use strict";

  var KEY_DATA = "pm.properties";
  var KEY_SETTINGS = "pm.settings";

  var properties = load(KEY_DATA, []);
  var settings = load(KEY_SETTINGS, { mapsKey: "" });
  var editingId = null;
  var viewingId = null;

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
  }
  function $(id) { return document.getElementById(id); }

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

  function epcBadge(rating) {
    return el("span", { class: "epc " + (rating || "none"), text: rating || "?", title: rating ? "EPC rating " + rating : "EPC unknown" });
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

  function renderList() {
    var list = $("list");
    list.textContent = "";
    var items = filtered();
    $("empty").hidden = properties.length > 0;

    items.forEach(function (p) {
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

    body.appendChild(el("div", { class: "detail-grid" }, [
      el("div", {}, [dl, links]),
      map
    ]));
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

  $("propForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = $("propForm").elements;
    var rec = {
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
    };
    if (editingId) {
      properties = properties.map(function (p) { return p.id === editingId ? rec : p; });
    } else {
      properties.push(rec);
    }
    save(KEY_DATA, properties);
    $("formDialog").close();
    renderList();
  });

  $("addBtn").addEventListener("click", function () { openForm(null); });
  $("formCancel").addEventListener("click", function () { $("formDialog").close(); });
  $("detailClose").addEventListener("click", function () { $("detailDialog").close(); });
  $("detailEdit").addEventListener("click", function () {
    var id = viewingId;
    $("detailDialog").close();
    openForm(id);
  });
  $("detailDelete").addEventListener("click", function () {
    if (!confirm("Delete this property? This cannot be undone.")) return;
    properties = properties.filter(function (p) { return p.id !== viewingId; });
    save(KEY_DATA, properties);
    $("detailDialog").close();
    renderList();
  });

  $("search").addEventListener("input", renderList);
  $("statusFilter").addEventListener("change", renderList);

  $("exportBtn").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(properties, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "properties.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  });

  $("importFile").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error("not a list");
        data = data.filter(function (p) { return p && p.address && p.postcode; }).map(function (p) {
          p.id = p.id || uid();
          return p;
        });
        if (!confirm("Import " + data.length + " properties? This replaces your current list.")) return;
        properties = data;
        save(KEY_DATA, properties);
        renderList();
      } catch (err) {
        alert("That file isn't a valid properties export.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  $("settingsBtn").addEventListener("click", function () {
    $("settingsForm").elements.mapsKey.value = settings.mapsKey || "";
    $("settingsDialog").showModal();
  });
  $("settingsCancel").addEventListener("click", function () { $("settingsDialog").close(); });
  $("settingsForm").addEventListener("submit", function (e) {
    e.preventDefault();
    settings.mapsKey = $("settingsForm").elements.mapsKey.value.trim();
    save(KEY_SETTINGS, settings);
    $("settingsDialog").close();
  });

  renderList();
})();
