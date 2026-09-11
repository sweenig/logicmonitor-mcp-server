"""
Portal Manager web UI - a thin authenticated front-end over the
portal-manager bash scripts (see portal_ops.py). No database of its own;
portal-manager/portals/*/.env.enc + docker-compose.yml remain the source of
truth, exactly as they are for CLI use.
"""

import os
import re
from functools import wraps

from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash

import mcp_probe
import portal_ops

app = Flask(__name__)
app.secret_key = os.environ["FLASK_SECRET_KEY"]
ADMIN_PASSWORD_HASH = os.environ["ADMIN_PASSWORD_HASH"]

NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$|^[a-z0-9]$")


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("logged_in"):
            if request.path.startswith("/api/"):
                return jsonify({"error": "unauthorized"}), 401
            return redirect(url_for("login"))
        return view(*args, **kwargs)

    return wrapped


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template("login.html")

    password = request.form.get("password", "")
    if check_password_hash(ADMIN_PASSWORD_HASH, password):
        session["logged_in"] = True
        return redirect(url_for("dashboard"))
    return render_template("login.html", error="Incorrect password"), 401


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
@login_required
def dashboard():
    return render_template("dashboard.html")


def _validate_name(name: str) -> str | None:
    if not name or not NAME_PATTERN.match(name):
        return "Portal name must be lowercase letters, digits, and hyphens only (2-32 chars)."
    return None


@app.route("/api/portals", methods=["GET"])
@login_required
def api_list_portals():
    try:
        return jsonify(portal_ops.list_portals())
    except portal_ops.PortalOpError as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/portals", methods=["POST"])
@login_required
def api_add_portal():
    body = request.get_json(force=True, silent=True) or {}
    name = (body.get("name") or "").strip()
    token = body.get("token") or ""

    error = _validate_name(name)
    if error:
        return jsonify({"error": error}), 400
    if not token:
        return jsonify({"error": "token is required"}), 400

    try:
        result = portal_ops.add_portal(
            name=name,
            token=token,
            readonly=bool(body.get("readonly", True)),
            port=body.get("port"),
            want_bearer_token=bool(body.get("wantBearerToken", True)),
        )
        return jsonify(result), 201
    except portal_ops.PortalOpError as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/api/portals/<name>", methods=["PATCH"])
@login_required
def api_edit_portal(name):
    body = request.get_json(force=True, silent=True) or {}
    try:
        result = portal_ops.edit_portal(
            name=name,
            readonly=body.get("readonly"),
            port=body.get("port"),
            rotate_token_value=body.get("rotateTokenValue"),
            rotate_bearer_token=bool(body.get("rotateBearerToken", False)),
            rebuild_image=bool(body.get("rebuildImage", False)),
        )
        return jsonify(result)
    except portal_ops.PortalOpError as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/api/portals/<name>", methods=["DELETE"])
@login_required
def api_remove_portal(name):
    try:
        portal_ops.remove_portal(name)
        return jsonify({"removed": name})
    except portal_ops.PortalOpError as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/api/portals/<name>/test-connectivity", methods=["POST"])
@login_required
def api_test_connectivity(name):
    try:
        portals = portal_ops.list_portals()
    except portal_ops.PortalOpError as exc:
        return jsonify({"ok": False, "message": str(exc)}), 500

    portal = next((p for p in portals if p["name"] == name), None)
    if not portal:
        return jsonify({"ok": False, "message": f"Unknown portal: {name}"}), 404

    try:
        mcp_token = (
            portal_ops.get_portal_secret(name, "MCP_BEARER_TOKEN")
            if portal.get("authenticated")
            else None
        )
    except portal_ops.PortalOpError as exc:
        return jsonify({"ok": False, "message": str(exc)}), 400

    result = mcp_probe.test_connectivity(portal["port"], mcp_token)
    return jsonify(result), (200 if result["ok"] else 502)


@app.route("/api/portals/<name>/reveal-token", methods=["POST"])
@login_required
def api_reveal_token(name):
    # Independent re-check of the password, on top of the existing session -
    # a valid session cookie alone is not enough to see a real secret value.
    body = request.get_json(force=True, silent=True) or {}
    password = body.get("password", "")
    if not check_password_hash(ADMIN_PASSWORD_HASH, password):
        return jsonify({"error": "Incorrect password"}), 401

    try:
        token = portal_ops.get_portal_secret(name, "MCP_BEARER_TOKEN")
        return jsonify({"mcpBearerToken": token})
    except portal_ops.PortalOpError as exc:
        return jsonify({"error": str(exc)}), 400


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050)
