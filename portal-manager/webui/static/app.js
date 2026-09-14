const portalsBody = document.getElementById("portals-body");
const addModal = document.getElementById("add-modal");
const editModal = document.getElementById("edit-modal");
const jsonModal = document.getElementById("json-modal");

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function renderRow(portal) {
  const tr = document.createElement("tr");
  const modeBadge = portal.readOnly
    ? '<span class="badge ro">read-only</span>'
    : '<span class="badge rw">read-write</span>';
  tr.innerHTML = `
    <td>${portal.name}</td>
    <td>${portal.port}</td>
    <td>${modeBadge}</td>
    <td>${portal.authenticated ? "bearer token" : "none"}</td>
    <td>${portal.status}</td>
    <td>
      <div class="conn-cell">
        <button class="secondary test-btn">Test API</button>
        <span class="conn-result"></span>
      </div>
    </td>
    <td>
      <button class="secondary json-btn">View JSON</button>
      <button class="secondary edit-btn">Edit</button>
      <button class="danger remove-btn">Remove</button>
    </td>
  `;
  tr.querySelector(".json-btn").addEventListener("click", () => openJsonModal(portal));
  tr.querySelector(".edit-btn").addEventListener("click", () => openEditModal(portal));
  tr.querySelector(".remove-btn").addEventListener("click", () => removePortal(portal.name));
  tr.querySelector(".test-btn").addEventListener("click", (e) =>
    testConnectivity(portal.name, tr.querySelector(".conn-result"), e.target)
  );
  return tr;
}

async function refreshPortals() {
  try {
    const portals = await fetchJSON("/api/portals");
    portalsBody.innerHTML = "";
    if (portals.length === 0) {
      portalsBody.innerHTML = '<tr><td colspan="7" class="muted">No portals yet.</td></tr>';
      return;
    }
    portals.forEach((p) => portalsBody.appendChild(renderRow(p)));
  } catch (err) {
    portalsBody.innerHTML = `<tr><td colspan="7" class="error">${err.message}</td></tr>`;
  }
}

document.getElementById("add-portal-btn").addEventListener("click", () => {
  document.getElementById("add-form").reset();
  document.getElementById("add-error").textContent = "";
  addModal.showModal();
});

document.getElementById("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const errorEl = document.getElementById("add-error");
  errorEl.textContent = "";
  try {
    await fetchJSON("/api/portals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.value.trim(),
        token: form.token.value,
        readonly: form.readonly.checked,
      }),
    });
    addModal.close();
    refreshPortals();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

let editingName = null;

function openEditModal(portal) {
  editingName = portal.name;
  document.getElementById("edit-name").textContent = portal.name;
  const form = document.getElementById("edit-form");
  form.reset();
  form.readonly.checked = portal.readOnly;
  document.getElementById("edit-error").textContent = "";
  document.getElementById("edit-new-token").textContent = "";
  editModal.showModal();
}

document.getElementById("rotate-token-check").addEventListener("change", (e) => {
  document.querySelector('#edit-form input[name="rotateTokenValue"]').disabled = !e.target.checked;
});

document.getElementById("edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const errorEl = document.getElementById("edit-error");
  errorEl.textContent = "";

  const body = { readonly: form.readonly.checked };
  if (document.getElementById("rotate-token-check").checked) {
    body.rotateTokenValue = form.rotateTokenValue.value;
  }
  if (form.rotateBearerToken.checked) {
    body.rotateBearerToken = true;
  }

  try {
    const result = await fetchJSON(`/api/portals/${encodeURIComponent(editingName)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (result.mcpBearerToken) {
      document.getElementById("edit-new-token").textContent =
        `New MCP auth token (already written to .mcp.json - save it, it won't be shown again): ${result.mcpBearerToken}`;
      return; // let the operator copy the token before closing
    }
    editModal.close();
    refreshPortals();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

async function testConnectivity(name, resultEl, btnEl) {
  resultEl.textContent = "";
  resultEl.className = "conn-result";
  resultEl.title = "";
  btnEl.disabled = true;
  const originalLabel = btnEl.textContent;
  btnEl.textContent = "Testing...";

  try {
    const res = await fetch(`/api/portals/${encodeURIComponent(name)}/test-connectivity`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (body.ok) {
      resultEl.textContent = "✓ API OK";
      resultEl.className = "conn-result ok";
    } else {
      resultEl.textContent = "✗ API check failed";
      resultEl.className = "conn-result fail";
      resultEl.title = body.message || `Request failed (${res.status})`;
    }
  } catch (err) {
    resultEl.textContent = "✗ API check failed";
    resultEl.className = "conn-result fail";
    resultEl.title = err.message;
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = originalLabel;
  }
}

async function removePortal(name) {
  if (prompt(`Type "${name}" to confirm removal:`) !== name) return;
  try {
    await fetchJSON(`/api/portals/${encodeURIComponent(name)}`, { method: "DELETE" });
    refreshPortals();
  } catch (err) {
    alert(err.message);
  }
}

function buildSnippet(portal, token) {
  const server = { type: "http", url: `http://localhost:${portal.port}/mcp` };
  if (portal.authenticated) {
    server.headers = { Authorization: `Bearer ${token || "*".repeat(20) + " (click Reveal to unmask)"}` };
  }
  const obj = { [`logicmonitor-${portal.name}`]: server };
  return JSON.stringify(obj, null, 2);
}

function openJsonModal(portal) {
  document.getElementById("json-name").textContent = portal.name;
  document.getElementById("json-error").textContent = "";
  document.getElementById("json-reveal-password").value = "";
  document.getElementById("json-snippet").textContent = buildSnippet(portal, null);
  document.getElementById("json-reveal-row").style.display = portal.authenticated ? "flex" : "none";
  document.getElementById("json-reveal-btn").onclick = () => revealToken(portal);
  jsonModal.showModal();
}

async function revealToken(portal) {
  const errorEl = document.getElementById("json-error");
  errorEl.textContent = "";
  const password = document.getElementById("json-reveal-password").value;
  try {
    const result = await fetchJSON(`/api/portals/${encodeURIComponent(portal.name)}/reveal-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    document.getElementById("json-snippet").textContent = buildSnippet(portal, result.mcpBearerToken);
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

document.getElementById("json-copy-btn").addEventListener("click", () => {
  navigator.clipboard.writeText(document.getElementById("json-snippet").textContent);
});

refreshPortals();
setInterval(refreshPortals, 5000);
