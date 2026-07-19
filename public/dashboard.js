const API = "/admin/api";
let marginChart = null;

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (res.status === 401) {
    window.location.href = "/admin/index.html";
    throw new Error("unauthenticated");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

function usd(n) {
  return "$" + Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------- Nav ----------
document.querySelectorAll(".nav-item").forEach((el) => {
  el.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    el.classList.add("active");
    document.getElementById("view-" + el.dataset.view).classList.add("active");
    if (el.dataset.view === "clients") loadClients();
    if (el.dataset.view === "deployments") loadDeployments();
    if (el.dataset.view === "requests") loadRequests();
    if (el.dataset.view === "exposure") loadOffers();
  });
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await api("/auth/logout", { method: "POST" });
  window.location.href = "/admin/index.html";
});

// ---------- Overview ----------
async function loadOverview() {
  const o = await api("/usage/overview");
  document.getElementById("statGrid").innerHTML = `
    ${stat("Requests (24h)", o.requestsLast24h, "violet")}
    ${stat("Total requests", o.totalRequests, "")}
    ${stat("Active deployments", o.activeDeployments, "green")}
    ${stat("Billed to Podstack", usd(o.billedCostUsd), "amber")}
    ${stat("Spheron raw cost", usd(o.spheronCostUsd), "")}
    ${stat("Margin", usd(o.marginUsd), "green")}
  `;

  const slider = document.getElementById("markupSlider");
  const readout = document.getElementById("markupValue");
  slider.value = o.markupPercent;
  readout.textContent = o.markupPercent;

  await loadMarginChart();
}

function stat(label, value, cls) {
  return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value ${cls}">${value}</div></div>`;
}

const slider = document.getElementById("markupSlider");
slider.addEventListener("input", () => {
  document.getElementById("markupValue").textContent = slider.value;
});
document.getElementById("saveMarkupBtn").addEventListener("click", async () => {
  const statusEl = document.getElementById("markupStatus");
  try {
    await api("/settings/markup", {
      method: "PUT",
      body: JSON.stringify({ markupPercent: Number(slider.value) }),
    });
    statusEl.textContent = `Applied ${slider.value}% - live now.`;
    await loadOverview();
  } catch (e) {
    statusEl.textContent = "Failed: " + e.message;
  }
});

async function loadMarginChart() {
  const byClient = await api("/usage/by-client");
  const ctx = document.getElementById("marginChart");
  if (marginChart) marginChart.destroy();
  marginChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: byClient.map((c) => c.name),
      datasets: [
        { label: "Spheron cost", data: byClient.map((c) => c.spheronCostUsd), backgroundColor: "#7C8CF8" },
        { label: "Margin", data: byClient.map((c) => c.marginUsd), backgroundColor: "#FF8A3D" },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#E6E9ED" } } },
      scales: {
        x: { stacked: true, ticks: { color: "#8A93A3" }, grid: { color: "#232A33" } },
        y: { stacked: true, ticks: { color: "#8A93A3" }, grid: { color: "#232A33" } },
      },
    },
  });
}

// ---------- Clients ----------
async function loadClients() {
  const clients = await api("/clients");
  const tbody = document.querySelector("#clientsTable tbody");
  if (!clients.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">No clients yet. Create one for Podstack to get started.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = clients
    .map(
      (c) => `
    <tr>
      <td>${escapeHtml(c.name)}</td>
      <td class="mono">${c.apiKeyPrefix}&hellip;</td>
      <td><span class="pill ${c.active ? "active" : "revoked"}">${c.active ? "active" : "revoked"}</span></td>
      <td>${c._count.deployments}</td>
      <td>${c._count.requests}</td>
      <td>${c.spendCapUsd != null ? usd(c.spendCapUsd) : "unlimited"}</td>
      <td>
        ${c.active ? `<button class="btn-danger" data-revoke="${c.id}">Revoke</button>` : `<button class="btn-ghost" data-reactivate="${c.id}">Reactivate</button>`}
        <button class="btn-ghost" data-rotate="${c.id}">Rotate key</button>
      </td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-revoke]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/clients/${b.dataset.revoke}/revoke`, { method: "POST" });
      loadClients();
    })
  );
  tbody.querySelectorAll("[data-reactivate]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/clients/${b.dataset.reactivate}/reactivate`, { method: "POST" });
      loadClients();
    })
  );
  tbody.querySelectorAll("[data-rotate]").forEach((b) =>
    b.addEventListener("click", async () => {
      const result = await api(`/clients/${b.dataset.rotate}/rotate`, { method: "POST" });
      alert(`New key (copy now, shown once):\n\n${result.apiKey}`);
      loadClients();
    })
  );
}

document.getElementById("newClientBtn").addEventListener("click", () => {
  document.getElementById("newClientKeyOut").innerHTML = "";
  document.getElementById("newClientName").value = "";
  document.getElementById("newClientCap").value = "";
  document.getElementById("newClientModal").classList.add("open");
});
document.getElementById("closeNewClientModal").addEventListener("click", () => {
  document.getElementById("newClientModal").classList.remove("open");
  loadClients();
});
document.getElementById("createClientBtn").addEventListener("click", async () => {
  const name = document.getElementById("newClientName").value.trim();
  const capRaw = document.getElementById("newClientCap").value.trim();
  if (!name) return;
  const result = await api("/clients", {
    method: "POST",
    body: JSON.stringify({ name, spendCapUsd: capRaw ? Number(capRaw) : null }),
  });
  document.getElementById("newClientKeyOut").innerHTML = `
    <div class="hint" style="color:#8A93A3;font-size:12px">Copy this now - it will not be shown again.</div>
    <div class="key-reveal">${result.apiKey}</div>
  `;
});

// ---------- Deployments ----------
async function loadDeployments() {
  const status = document.getElementById("deployStatusFilter").value;
  const rows = await api(`/usage/deployments${status ? `?status=${status}` : ""}`);
  const tbody = document.getElementById("deploymentsBody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">No deployments yet.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map(
      (d) => `
    <tr>
      <td>${escapeHtml(d.clientName)}</td>
      <td class="mono">${d.gpuType}</td>
      <td>${d.provider} / ${d.region}</td>
      <td><span class="pill ${d.status}">${d.status}</span></td>
      <td class="mono">${usd(d.spheronHourlyRate)}</td>
      <td class="mono">${usd(d.billedHourlyRate)}</td>
      <td class="mono">${usd(d.billedTotalCostUsd)}</td>
      <td class="mono" style="color:#4ADE80">${usd(d.marginUsd)}</td>
    </tr>`
    )
    .join("");
}
document.getElementById("deployStatusFilter").addEventListener("change", loadDeployments);

// ---------- Requests ----------
async function loadRequests() {
  const path = document.getElementById("pathFilter").value.trim();
  const rows = await api(`/usage/requests${path ? `?path=${encodeURIComponent(path)}` : ""}`);
  const tbody = document.getElementById("requestsBody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">No requests logged yet.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td class="mono">${new Date(r.createdAt).toLocaleString()}</td>
      <td>${escapeHtml(r.clientName)}</td>
      <td class="mono">${r.method}</td>
      <td class="mono">${r.path}</td>
      <td class="mono">${r.statusCode}</td>
      <td class="mono">${r.durationMs}</td>
    </tr>`
    )
    .join("");
}
document.getElementById("refreshRequestsBtn").addEventListener("click", loadRequests);

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- API & offers exposed ----------
async function loadOffers() {
  const search = document.getElementById("offersSearch").value.trim();
  const data = await api(`/offers${search ? `?search=${encodeURIComponent(search)}` : ""}`);
  const tbody = document.getElementById("offersBody");
  if (!data.offers.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">No matching offers.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.offers
    .map(
      (o) => `
    <tr>
      <td class="mono">${escapeHtml(o.gpuModel)}</td>
      <td>${o.provider}</td>
      <td>${o.region}</td>
      <td><span class="pill running">${o.instanceType}</span></td>
      <td class="mono">${o.vcpus} / ${o.memory}GB / ${o.storage}GB</td>
      <td class="mono">${usd(o.spheronRawPrice)}/hr</td>
      <td class="mono" style="color:#FF8A3D">${usd(o.podstackSeesPrice)}/hr</td>
      <td class="mono" style="color:#4ADE80">${usd(o.marginPerHour)}/hr</td>
      <td>${o.available ? "yes" : "no"}</td>
    </tr>`
    )
    .join("");
}
document.getElementById("refreshOffersBtn").addEventListener("click", loadOffers);
document.getElementById("offersSearch").addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadOffers();
});

// ---------- Boot ----------
(async () => {
  try {
    const me = await api("/auth/me");
    document.getElementById("whoami").textContent = "Signed in as " + me.username;
    await loadOverview();
  } catch {
    // api() already redirects on 401
  }
})();
