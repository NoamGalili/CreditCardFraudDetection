"""Pick misclassified samples using the model directly (no HTTP)."""
import os, sys, json
import numpy as np
import pandas as pd

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
import tensorflow as tf

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE, "ModelAndNotebookData", "fraud_detection_model.keras")
THRESHOLD_PATH = os.path.join(BASE, "ModelAndNotebookData", "threshold.json")
SAMPLES_DIR = os.path.join(BASE, "DB", "samples")

print("Loading model...", flush=True)
model = tf.keras.models.load_model(MODEL_PATH, compile=False)
with open(THRESHOLD_PATH) as f:
    THRESHOLD = json.load(f)["best_threshold"]
print(f"Model loaded. Threshold={THRESHOLD}", flush=True)

NUMERIC_FEATURES = [
    "amt", "amt_log", "city_pop", "hour", "day", "month", "dayofweek",
    "is_weekend", "age", "distance", "lat_diff", "long_diff",
    "seconds_since_prev", "seconds_since_prev_log",
]
CATEGORICAL_FEATURES = ["category", "merchant", "gender", "state", "job"]

def preprocess(raw):
    df = pd.DataFrame([raw])
    for col in ["amt", "lat", "long", "merch_lat", "merch_long", "city_pop"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["trans_date_trans_time"] = pd.to_datetime(df["trans_date_trans_time"])
    df["dob"] = pd.to_datetime(df["dob"])
    df["hour"] = df["trans_date_trans_time"].dt.hour
    df["day"] = df["trans_date_trans_time"].dt.day
    df["month"] = df["trans_date_trans_time"].dt.month
    df["dayofweek"] = df["trans_date_trans_time"].dt.dayofweek
    df["is_weekend"] = (df["dayofweek"] >= 5).astype(int)
    df["age"] = ((df["trans_date_trans_time"] - df["dob"]).dt.days // 365).clip(lower=18, upper=100)
    df["amt_log"] = np.log1p(df["amt"])
    df["distance"] = np.sqrt((df["lat"] - df["merch_lat"])**2 + (df["long"] - df["merch_long"])**2)
    df["lat_diff"] = np.abs(df["lat"] - df["merch_lat"])
    df["long_diff"] = np.abs(df["long"] - df["merch_long"])
    df["seconds_since_prev"] = -1.0
    df["seconds_since_prev_log"] = 0.0
    input_dict = {}
    for col in NUMERIC_FEATURES:
        input_dict[col] = tf.constant([[float(df[col].iloc[0])]], dtype=tf.float32)
    for col in CATEGORICAL_FEATURES:
        input_dict[col] = tf.constant([[str(df[col].iloc[0])]], dtype=tf.string)
    return input_dict

def predict(raw):
    inp = preprocess(raw)
    prob = float(model(inp, training=False)[0][0])
    return prob

df = pd.read_csv(os.path.join(BASE, "DB", "fraudTest.csv"))

# False positives: legit predicted as fraud
print("Searching for false positives (legit -> fraud)...", flush=True)
legit_df = df[df["is_fraud"] == 0].sample(500, random_state=77)
fp_found = []
for i, (idx, row) in enumerate(legit_df.iterrows()):
    if i % 100 == 0:
        print(f"  Legit row {i}/500", flush=True)
    prob = predict(row.to_dict())
    if prob >= THRESHOLD:
        fp_found.append((row.to_dict(), prob))
        print(f"  FP #{len(fp_found)}: prob={prob:.4f}", flush=True)
        if len(fp_found) == 3:
            break
print(f"Found {len(fp_found)} false positives", flush=True)

# False negatives: fraud predicted as legit - use ALL fraud samples
print("Searching for false negatives (fraud -> legit)...", flush=True)
fraud_df = df[df["is_fraud"] == 1].sample(frac=1, random_state=42)  # shuffle all
fn_found = []
for i, (idx, row) in enumerate(fraud_df.iterrows()):
    if i % 100 == 0:
        print(f"  Fraud row {i}/{len(fraud_df)}", flush=True)
    prob = predict(row.to_dict())
    if prob < THRESHOLD:
        fn_found.append((row.to_dict(), prob))
        print(f"  FN #{len(fn_found)}: prob={prob:.4f}", flush=True)
        if len(fn_found) == 2:
            break
print(f"Found {len(fn_found)} false negatives", flush=True)

# Save
for i, (rd, prob) in enumerate(fp_found, start=21):
    with open(os.path.join(SAMPLES_DIR, f"{i}_wrong_fp.json"), "w") as f:
        json.dump([rd], f, indent=2, default=str)

for i, (rd, prob) in enumerate(fn_found, start=21 + len(fp_found)):
    with open(os.path.join(SAMPLES_DIR, f"{i}_wrong_fn.json"), "w") as f:
        json.dump([rd], f, indent=2, default=str)

total = len(fp_found) + len(fn_found)
print(f"Done! Saved {len(fp_found)} FP + {len(fn_found)} FN = {total} wrong samples", flush=True)
