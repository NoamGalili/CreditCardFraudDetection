"""
Fraud Detection Web Server
Serves a Deep Learning model for credit card fraud detection.
"""
import os
import sys
import json
import glob
import time
import logging
from datetime import datetime

import numpy as np
import pandas as pd
import tensorflow as tf
from flask import Flask, jsonify, request, send_from_directory

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)
MODEL_PATH = os.path.join(PROJECT_DIR, "ModelAndNotebookData", "fraud_detection_model.keras")
THRESHOLD_PATH = os.path.join(PROJECT_DIR, "ModelAndNotebookData", "threshold.json")
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
# Feature definitions (must match training pipeline)
# ---------------------------------------------------------------------------
NUMERIC_FEATURES = [
    "amt", "amt_log", "city_pop", "hour", "day", "month", "dayofweek",
    "is_weekend", "age", "distance", "lat_diff", "long_diff",
    "seconds_since_prev", "seconds_since_prev_log",
]

CATEGORICAL_FEATURES = ["category", "merchant", "gender", "state", "job"]

# ---------------------------------------------------------------------------
# Load model & threshold
# ---------------------------------------------------------------------------
logger.info("Loading model from %s", MODEL_PATH)
_t0 = time.time()
model = tf.keras.models.load_model(MODEL_PATH, compile=False)
MODEL_LOAD_TIME = round(time.time() - _t0, 3)
logger.info("Model loaded in %.3f s", MODEL_LOAD_TIME)

with open(THRESHOLD_PATH) as f:
    THRESHOLD = json.load(f)["best_threshold"]
logger.info("Classification threshold: %s", THRESHOLD)

# ---------------------------------------------------------------------------
# Model metadata / metrics (static – computed once at startup)
# ---------------------------------------------------------------------------
MODEL_METADATA = {
    "model_name": "fraud_detection_model",
    "framework": f"TensorFlow {tf.__version__}",
    "threshold": THRESHOLD,
    "model_load_time_sec": MODEL_LOAD_TIME,
    "total_parameters": int(model.count_params()),
    "trainable_parameters": int(sum(
        tf.keras.backend.count_params(w) for w in model.trainable_weights
    )),
    "non_trainable_parameters": int(sum(
        tf.keras.backend.count_params(w) for w in model.non_trainable_weights
    )),
    "numeric_features": NUMERIC_FEATURES,
    "categorical_features": CATEGORICAL_FEATURES,
    "architecture": [],
}

for layer in model.layers:
    layer_info = {
        "name": layer.name,
        "class": layer.__class__.__name__,
        "output_shape": str(layer.output_shape) if hasattr(layer, "output_shape") else "N/A",
        "num_params": int(layer.count_params()),
        "trainable": layer.trainable,
    }
    # Capture config details for key layers
    cfg = layer.get_config()
    if isinstance(layer, tf.keras.layers.Dense):
        layer_info["units"] = cfg.get("units")
        layer_info["activation"] = cfg.get("activation")
    elif isinstance(layer, tf.keras.layers.Dropout):
        layer_info["rate"] = cfg.get("rate")
    elif isinstance(layer, tf.keras.layers.Embedding):
        layer_info["input_dim"] = cfg.get("input_dim")
        layer_info["output_dim"] = cfg.get("output_dim")
    MODEL_METADATA["architecture"].append(layer_info)

# ---------------------------------------------------------------------------
# Inference stats (runtime)
# ---------------------------------------------------------------------------
_inference_log: list[dict] = []

# ---------------------------------------------------------------------------
# Preprocessing helpers
# ---------------------------------------------------------------------------

def preprocess_transaction(raw: dict) -> dict[str, np.ndarray]:
    """
    Turn a raw transaction dict (matching CSV columns) into the
    {feature_name: np.array} dict the model expects.
    """
    df = pd.DataFrame([raw])

    # Ensure numeric columns are numeric before engineering
    for col in ["amt", "lat", "long", "merch_lat", "merch_long", "city_pop"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Date parsing
    df["trans_date_trans_time"] = pd.to_datetime(df["trans_date_trans_time"])
    df["dob"] = pd.to_datetime(df["dob"])

    # Time features
    df["hour"] = df["trans_date_trans_time"].dt.hour
    df["day"] = df["trans_date_trans_time"].dt.day
    df["month"] = df["trans_date_trans_time"].dt.month
    df["dayofweek"] = df["trans_date_trans_time"].dt.dayofweek
    df["is_weekend"] = (df["dayofweek"] >= 5).astype(int)

    # Age
    df["age"] = ((df["trans_date_trans_time"] - df["dob"]).dt.days // 365).clip(lower=18, upper=100)

    # Log amount
    df["amt_log"] = np.log1p(df["amt"])

    # Distance
    df["distance"] = np.sqrt(
        (df["lat"] - df["merch_lat"]) ** 2 +
        (df["long"] - df["merch_long"]) ** 2
    )
    df["lat_diff"] = np.abs(df["lat"] - df["merch_lat"])
    df["long_diff"] = np.abs(df["long"] - df["merch_long"])

    # Time gap – for a single transaction we set -1 (no previous)
    df["seconds_since_prev"] = -1.0
    df["seconds_since_prev_log"] = 0.0

    # Build model input dict
    input_dict = {}
    for col in NUMERIC_FEATURES:
        val = float(df[col].iloc[0])
        input_dict[col] = tf.constant([[val]], dtype=tf.float32)
    for col in CATEGORICAL_FEATURES:
        val = str(df[col].iloc[0])
        input_dict[col] = tf.constant([[val]], dtype=tf.string)

    return input_dict


# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__, static_folder=STATIC_DIR)


@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/api/samples", methods=["GET"])
def list_samples():
    """Return list of available sample transaction files."""
    import re
    files = glob.glob(os.path.join(SAMPLES_DIR, "*.json"))
    # Sort numerically by leading number in filename
    files.sort(key=lambda f: int(re.match(r'(\d+)', os.path.basename(f)).group(1)))
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
    """Return contents of a sample transaction file."""
    # Sanitize: only allow .json files from the samples directory
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
    """Run fraud prediction on a transaction."""
    try:
        raw = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "Invalid JSON body"}), 400

    # Handle JSON array (sample files are wrapped in [])
    if isinstance(raw, list):
        raw = raw[0]

    # Keep the ground-truth label if present, but don't feed it to the model
    ground_truth = raw.pop("is_fraud", None)

    required_fields = [
        "trans_date_trans_time", "cc_num", "merchant", "category", "amt",
        "gender", "city", "state", "lat", "long", "city_pop", "job",
        "dob", "merch_lat", "merch_long",
    ]
    missing = [f for f in required_fields if f not in raw]
    if missing:
        return jsonify({"error": f"Missing fields: {missing}"}), 400

    try:
        raw["amt"] = float(raw["amt"])
        raw["lat"] = float(raw["lat"])
        raw["long"] = float(raw["long"])
        raw["merch_lat"] = float(raw["merch_lat"])
        raw["merch_long"] = float(raw["merch_long"])
        raw["city_pop"] = int(raw["city_pop"])
    except (ValueError, TypeError) as e:
        return jsonify({"error": f"Invalid numeric value: {e}"}), 400

    t0 = time.time()
    input_dict = preprocess_transaction(raw)
    # Call model directly (no caching) - model(...) is stateless
    prob = float(model(input_dict, training=False).numpy().ravel()[0])
    inference_ms = round((time.time() - t0) * 1000, 2)

    is_fraud = int(prob >= THRESHOLD)

    entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "probability": round(prob, 6),
        "threshold": THRESHOLD,
        "prediction": is_fraud,
        "inference_ms": inference_ms,
        "ground_truth": ground_truth,
    }
    _inference_log.append(entry)
    logger.info("Prediction: prob=%.4f  fraud=%d  time=%.1fms", prob, is_fraud, inference_ms)

    return jsonify({
        "probability": round(prob, 6),
        "threshold": THRESHOLD,
        "is_fraud": is_fraud,
        "label": "FRAUD" if is_fraud else "LEGIT",
        "inference_ms": inference_ms,
        "ground_truth": ground_truth,
    })


@app.route("/api/metrics", methods=["GET"])
def metrics():
    """Return model metadata and runtime inference statistics."""
    total = len(_inference_log)
    if total == 0:
        runtime_stats = {
            "total_predictions": 0,
            "avg_inference_ms": None,
            "fraud_count": 0,
            "legit_count": 0,
            "correct": None,
            "accuracy": None,
        }
    else:
        fraud_count = sum(1 for e in _inference_log if e["prediction"] == 1)
        legit_count = total - fraud_count
        avg_ms = round(sum(e["inference_ms"] for e in _inference_log) / total, 2)

        # Accuracy vs ground truth (when available)
        with_gt = [e for e in _inference_log if e["ground_truth"] is not None]
        if with_gt:
            correct = sum(1 for e in with_gt if e["prediction"] == int(e["ground_truth"]))
            accuracy = round(correct / len(with_gt), 4)
        else:
            correct = None
            accuracy = None

        runtime_stats = {
            "total_predictions": total,
            "avg_inference_ms": avg_ms,
            "fraud_count": fraud_count,
            "legit_count": legit_count,
            "correct": correct,
            "accuracy": accuracy,
        }

    return jsonify({
        "model": MODEL_METADATA,
        "runtime": runtime_stats,
        "prediction_log": _inference_log[-50:],  # last 50
    })


@app.route("/api/logs", methods=["GET"])
def get_logs():
    """Return last N lines of the server log."""
    n = request.args.get("n", 100, type=int)
    n = min(n, 500)
    log_path = os.path.join(LOG_DIR, "server.log")
    if not os.path.isfile(log_path):
        return jsonify({"lines": []})
    with open(log_path) as f:
        lines = f.readlines()
    return jsonify({"lines": lines[-n:]})


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    logger.info("Starting Fraud Detection Server on http://localhost:8080")
    app.run(host="127.0.0.1", port=8080, debug=False)
