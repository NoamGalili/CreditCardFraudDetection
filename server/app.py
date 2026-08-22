"""
Fraud Detection Web Server (stacking ensemble edition).

Serves the Selected-Stack ensemble (RandomForest + CatBoost + XGBoost -> stacking
meta-model) and the FraudGuard dashboard. Sends a Telegram alert whenever a
transaction is classified as fraud.
"""
import os
import sys
import json
import glob
import logging
from datetime import datetime

from flask import Flask, jsonify, request, send_from_directory

# ---------------------------------------------------------------------------
# Load .env (tiny parser, no external dependency)
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)


def _load_dotenv(path: str) -> None:
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key, val = key.strip(), val.strip().strip('"').strip("'")
            # Do not overwrite variables already set in the real environment.
            os.environ.setdefault(key, val)


_load_dotenv(os.path.join(PROJECT_DIR, ".env"))

from ensemble import FraudEnsemble, REQUIRED_FIELDS  # noqa: E402
import telegram_notify  # noqa: E402
from dashboard_simulator import TransactionSimulator  # noqa: E402

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SAMPLES_DIR = os.path.join(PROJECT_DIR, "DB", "samples")
STATIC_DIR = os.path.join(BASE_DIR, "static")
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(os.path.join(LOG_DIR, "server.log")),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Load ensemble & Initialize simulator
# ---------------------------------------------------------------------------
logger.info("Loading Selected-Stack ensemble ...")
ensemble = FraudEnsemble()
logger.info("Ensemble '%s' loaded in %.3fs (threshold=%.4f)",
            ensemble.stack_name, ensemble.load_time_sec, ensemble.threshold)
logger.info("Telegram notifications: %s",
            "ENABLED" if telegram_notify.is_configured() else "disabled (not configured)")

MODEL_METADATA = ensemble.metadata()
_inference_log: list[dict] = []

logger.info("Initializing dashboard transaction simulator (initially stopped) ...")
dashboard_simulator = TransactionSimulator(ensemble=ensemble)

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__, static_folder=STATIC_DIR)



@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/api/samples", methods=["GET"])
def list_samples():
    import re
    files = glob.glob(os.path.join(SAMPLES_DIR, "*.json"))

    def _key(f):
        m = re.match(r"(\d+)", os.path.basename(f))
        return int(m.group(1)) if m else 0

    files.sort(key=_key)
    samples = []
    for fp in files:
        name = os.path.basename(fp)
        if "_wrong_fp" in name:
            label = "wrong_fp"
        elif "_wrong_fn" in name:
            label = "wrong_fn"
        elif "_fraud" in name:
            label = "fraud"
        else:
            label = "legit"
        samples.append({"filename": name, "label": label})
    return jsonify(samples)


@app.route("/api/samples/<filename>", methods=["GET"])
def get_sample(filename):
    safe_name = os.path.basename(filename)
    if not safe_name.endswith(".json"):
        return jsonify({"error": "Invalid file type"}), 400
    filepath = os.path.join(SAMPLES_DIR, safe_name)
    if not os.path.isfile(filepath):
        return jsonify({"error": "Sample not found"}), 404
    with open(filepath) as f:
        data = json.load(f)
    return jsonify(data[0] if isinstance(data, list) else data)


@app.route("/api/predict", methods=["POST"])
def predict():
    try:
        raw = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "Invalid JSON body"}), 400

    if isinstance(raw, list):
        raw = raw[0]
    if not isinstance(raw, dict):
        return jsonify({"error": "Expected a JSON object"}), 400

    ground_truth = raw.get("is_fraud", None)

    missing = [f for f in REQUIRED_FIELDS if f not in raw]
    if missing:
        return jsonify({"error": f"Missing fields: {missing}"}), 400

    try:
        result = ensemble.predict(raw)
    except Exception as exc:
        logger.exception("Prediction failed")
        return jsonify({"error": f"Prediction failed: {exc}"}), 500

    # Fire a Telegram alert on fraud (never let it break the response).
    notified = False
    notify_error = None
    if result["is_fraud"]:
        res = telegram_notify.send_fraud_alert(raw, result)
        notified = bool(res.get("ok"))
        notify_error = res.get("error")

    entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "probability": result["probability"],
        "threshold": result["threshold"],
        "prediction": result["is_fraud"],
        "inference_ms": result["inference_ms"],
        "ground_truth": ground_truth,
        "notified": notified,
    }
    _inference_log.append(entry)
    logger.info(
        "Prediction: prob=%.4f fraud=%d time=%.1fms telegram=%s",
        result["probability"], result["is_fraud"], result["inference_ms"],
        "sent" if notified else ("n/a" if not result["is_fraud"] else f"failed:{notify_error}"),
    )

    result["ground_truth"] = ground_truth
    result["telegram_notified"] = notified
    if notify_error and result["is_fraud"]:
        result["telegram_error"] = notify_error
    return jsonify(result)


@app.route("/api/metrics", methods=["GET"])
def metrics():
    total = len(_inference_log)
    if total == 0:
        runtime_stats = {
            "total_predictions": 0, "avg_inference_ms": None,
            "fraud_count": 0, "legit_count": 0, "correct": None,
            "accuracy": None, "telegram_alerts": 0,
        }
    else:
        fraud_count = sum(1 for e in _inference_log if e["prediction"] == 1)
        avg_ms = round(sum(e["inference_ms"] for e in _inference_log) / total, 2)
        with_gt = [e for e in _inference_log if e["ground_truth"] is not None]
        if with_gt:
            correct = sum(1 for e in with_gt if e["prediction"] == int(e["ground_truth"]))
            accuracy = round(correct / len(with_gt), 4)
        else:
            correct = accuracy = None
        runtime_stats = {
            "total_predictions": total,
            "avg_inference_ms": avg_ms,
            "fraud_count": fraud_count,
            "legit_count": total - fraud_count,
            "correct": correct,
            "accuracy": accuracy,
            "telegram_alerts": sum(1 for e in _inference_log if e.get("notified")),
        }

    return jsonify({
        "model": MODEL_METADATA,
        "runtime": runtime_stats,
        "telegram_configured": telegram_notify.is_configured(),
        "prediction_log": _inference_log[-50:],
    })


@app.route("/api/logs", methods=["GET"])
def get_logs():
    n = request.args.get("n", 100, type=int)
    n = min(n, 500)
    log_path = os.path.join(LOG_DIR, "server.log")
    if not os.path.isfile(log_path):
        return jsonify({"lines": []})
    with open(log_path) as f:
        lines = f.readlines()
    return jsonify({"lines": lines[-n:]})


@app.route("/api/telegram/status", methods=["GET"])
def telegram_status():
    return jsonify({"configured": telegram_notify.is_configured()})


@app.route("/api/telegram/test", methods=["POST"])
def telegram_test():
    res = telegram_notify.send_message(
        "\u2705 *FraudGuard test message* \u2014 Telegram notifications are working."
    )
    status = 200 if res.get("ok") else 400
    return jsonify(res), status


# ---------------------------------------------------------------------------
# Dashboard Simulator API Endpoints
# ---------------------------------------------------------------------------

@app.route("/api/dashboard/status", methods=["GET"])
def dashboard_status():
    return jsonify(dashboard_simulator.get_status())


@app.route("/api/dashboard/transactions", methods=["GET"])
def dashboard_transactions():
    limit = request.args.get("limit", 50, type=int)
    return jsonify(dashboard_simulator.get_transactions(limit=limit))


@app.route("/api/dashboard/summary", methods=["GET"])
def dashboard_summary():
    return jsonify(dashboard_simulator.get_summary())


@app.route("/api/dashboard/daily", methods=["GET"])
def dashboard_daily():
    return jsonify(dashboard_simulator.get_daily_summary())



@app.route("/api/dashboard/next", methods=["POST"])
def dashboard_next():
    try:
        entry = dashboard_simulator.process_next()
        return jsonify(entry)
    except Exception as exc:
        logger.exception("Error processing next dashboard transaction")
        return jsonify({"error": str(exc)}), 500


@app.route("/api/dashboard/start", methods=["POST"])
def dashboard_start():
    data = request.get_json(silent=True) or {}
    interval = data.get("interval_seconds") or request.args.get("interval", type=float)
    dashboard_simulator.start(interval_seconds=interval)
    return jsonify(dashboard_simulator.get_status())


@app.route("/api/dashboard/stop", methods=["POST"])
def dashboard_stop():
    dashboard_simulator.stop()
    return jsonify(dashboard_simulator.get_status())


@app.route("/api/dashboard/reset", methods=["POST"])
def dashboard_reset():
    dashboard_simulator.reset()
    return jsonify(dashboard_simulator.get_status())


# Serve built SPA assets (Vite emits /assets/*). Fallback to index.html for routes.
@app.route("/<path:path>")
def static_proxy(path):

    full = os.path.join(STATIC_DIR, path)
    if os.path.isfile(full):
        return send_from_directory(STATIC_DIR, path)
    return send_from_directory(STATIC_DIR, "index.html")


if __name__ == "__main__":
    logger.info("Starting Fraud Detection Server on http://localhost:8080")
    app.run(host="127.0.0.1", port=8080, debug=False)
