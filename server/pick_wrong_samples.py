"""Pick 5 misclassified samples (21-25) from test data."""
import pandas as pd
import json
import os
import urllib.request

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES_DIR = os.path.join(BASE, "DB", "samples")
df = pd.read_csv(os.path.join(BASE, "DB", "fraudTest.csv"))


def predict_row(row_dict):
    body = json.dumps(row_dict, default=str).encode("utf-8")
    req = urllib.request.Request(
        "http://localhost:8080/api/predict",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())


# False positives: actually legit but model says fraud
legit_df = df[df["is_fraud"] == 0].sample(500, random_state=77)
fp_found = []
for idx, row in legit_df.iterrows():
    rd = row.to_dict()
    try:
        r = predict_row(rd)
        if r["is_fraud"] == 1:
            fp_found.append(rd)
            prob = r["probability"]
            print(f"  FP #{len(fp_found)}: prob={prob:.4f} (legit predicted as fraud)")
            if len(fp_found) == 3:
                break
    except Exception as e:
        print(f"  Error: {e}")

print(f"Found {len(fp_found)} false positives")

# False negatives: actually fraud but model says legit
fraud_df = df[df["is_fraud"] == 1].sample(min(2000, len(df[df["is_fraud"] == 1])), random_state=77)
fn_found = []
for i, (idx, row) in enumerate(fraud_df.iterrows()):
    if i % 50 == 0:
        print(f"  Scanning fraud row {i}/{len(fraud_df)}...", flush=True)
    rd = row.to_dict()
    try:
        r = predict_row(rd)
        if r["is_fraud"] == 0:
            fn_found.append(rd)
            prob = r["probability"]
            print(f"  FN #{len(fn_found)}: prob={prob:.4f} (fraud predicted as legit)", flush=True)
            if len(fn_found) == 2:
                break
    except Exception as e:
        print(f"  Error: {e}", flush=True)

print(f"Found {len(fn_found)} false negatives")

# Save: 21-23 = false positive, 24-25 = false negative
for i, rd in enumerate(fp_found, start=21):
    with open(os.path.join(SAMPLES_DIR, f"{i}_wrong_fp.json"), "w") as f:
        json.dump([rd], f, indent=2, default=str)

for i, rd in enumerate(fn_found, start=21 + len(fp_found)):
    with open(os.path.join(SAMPLES_DIR, f"{i}_wrong_fn.json"), "w") as f:
        json.dump([rd], f, indent=2, default=str)

total = len(fp_found) + len(fn_found)
print(f"Done! Saved {len(fp_found)} FP + {len(fn_found)} FN = {total} wrong samples (21-25)")
