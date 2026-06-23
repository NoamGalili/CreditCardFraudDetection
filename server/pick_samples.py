"""Pick 20 samples from test data that the model classifies correctly."""
import pandas as pd
import numpy as np
import json
import os
import shutil
import urllib.request

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES_DIR = os.path.join(BASE, "DB", "samples")

# Remove old samples
shutil.rmtree(SAMPLES_DIR, ignore_errors=True)
os.makedirs(SAMPLES_DIR, exist_ok=True)

# Load test data
df = pd.read_csv(os.path.join(BASE, "DB", "fraudTest.csv"))
print(f"Test set: {len(df)} rows, {df['is_fraud'].sum()} fraud")


def predict_row(row_dict):
    body = json.dumps(row_dict, default=str).encode("utf-8")
    req = urllib.request.Request(
        "http://localhost:8080/api/predict",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())


# Find 10 legit that model predicts as LEGIT
legit_df = df[df["is_fraud"] == 0].sample(500, random_state=99)
legit_found = []
for idx, row in legit_df.iterrows():
    row_dict = row.to_dict()
    try:
        result = predict_row(row_dict)
        if result["is_fraud"] == 0:
            legit_found.append(row_dict)
            print(f"  Legit #{len(legit_found)}: prob={result['probability']:.4f}")
            if len(legit_found) == 10:
                break
    except Exception as e:
        print(f"  Error: {e}")
        continue

print(f"Found {len(legit_found)} legit samples")

# Find 10 fraud that model predicts as FRAUD
fraud_df = df[df["is_fraud"] == 1].sample(500, random_state=99)
fraud_found = []
for idx, row in fraud_df.iterrows():
    row_dict = row.to_dict()
    try:
        result = predict_row(row_dict)
        if result["is_fraud"] == 1:
            fraud_found.append(row_dict)
            print(f"  Fraud #{len(fraud_found)}: prob={result['probability']:.4f}")
            if len(fraud_found) == 10:
                break
    except Exception as e:
        print(f"  Error: {e}")
        continue

print(f"Found {len(fraud_found)} fraud samples")

# Save them - legit as 1-10, fraud as 11-20
for i, row_dict in enumerate(legit_found, start=1):
    with open(os.path.join(SAMPLES_DIR, f"{i}_legit.json"), "w") as f:
        json.dump([row_dict], f, indent=2, default=str)

for i, row_dict in enumerate(fraud_found, start=11):
    with open(os.path.join(SAMPLES_DIR, f"{i}_fraud.json"), "w") as f:
        json.dump([row_dict], f, indent=2, default=str)

print(f"Done! Saved {len(legit_found)} legit + {len(fraud_found)} fraud = {len(legit_found)+len(fraud_found)} samples")
