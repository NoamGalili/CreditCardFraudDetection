"""
Re-pick sample transactions so they match the current stacking ensemble.

Scans DB/fraudTest.csv with the live ensemble and writes into DB/samples/:
  - 1..10  _legit    : real legit, predicted legit (correct)
  - 11..20 _fraud    : real fraud, predicted fraud (correct)
  - 21..23 _wrong_fp : real legit, predicted fraud (false positive)
  - 24..25 _wrong_fn : real fraud, predicted legit (false negative)

Run:  python pick_samples.py
"""
import os
import glob
import json
import warnings

warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd

from ensemble import FraudEnsemble

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES_DIR = os.path.join(BASE, "DB", "samples")
CSV = os.path.join(BASE, "DB", "fraudTest.csv")

N_LEGIT = 10
N_FRAUD = 10
N_FP = 3
N_FN = 2
SEED = 123


def _batch_scores(ens, df):
    """Vectorised ensemble scoring for a whole DataFrame."""
    X = ens._preprocess(df.copy())
    rf = ens.rf.predict_proba(X)[:, 1]
    cat = ens.cat.predict_proba(X)[:, 1]
    xgb = ens.xgb.predict_proba(X)[:, 1]
    meta = pd.DataFrame({"rf_prob": rf, "cat_prob": cat, "xgb_prob": xgb})[ens.feature_set]
    return ens.meta.predict_proba(meta)[:, 1]


def _to_native(d):
    out = {}
    for k, v in d.items():
        if isinstance(v, np.integer):
            out[k] = int(v)
        elif isinstance(v, np.floating):
            out[k] = float(v)
        elif isinstance(v, np.bool_):
            out[k] = bool(v)
        else:
            out[k] = v
    return out


def main():
    ens = FraudEnsemble()
    print(f"Ensemble '{ens.stack_name}' loaded, threshold={ens.threshold}", flush=True)

    df = pd.read_csv(CSV)
    print(f"Test rows: {len(df)}  frauds: {int(df['is_fraud'].sum())}", flush=True)

    fraud_df = df[df["is_fraud"] == 1].copy()
    legit_all = df[df["is_fraud"] == 0]
    legit_df = legit_all.sample(min(40000, len(legit_all)), random_state=SEED).copy()

    print("Scoring fraud rows ...", flush=True)
    fraud_df["_prob"] = _batch_scores(ens, fraud_df)
    print("Scoring legit sample ...", flush=True)
    legit_df["_prob"] = _batch_scores(ens, legit_df)

    thr = ens.threshold
    fraud_ok = fraud_df[fraud_df["_prob"] >= thr]
    fn = fraud_df[fraud_df["_prob"] < thr]
    legit_ok = legit_df[legit_df["_prob"] < thr]
    fp = legit_df[legit_df["_prob"] >= thr]

    print(f"  legit correct: {len(legit_ok)} | fraud correct: {len(fraud_ok)} | FP: {len(fp)} | FN: {len(fn)}", flush=True)

    picks = {
        "legit": legit_ok.sample(min(N_LEGIT, len(legit_ok)), random_state=SEED),
        "fraud": fraud_ok.sample(min(N_FRAUD, len(fraud_ok)), random_state=SEED),
        "wrong_fp": fp.sample(min(N_FP, len(fp)), random_state=SEED),
        "wrong_fn": fn.sample(min(N_FN, len(fn)), random_state=SEED),
    }

    for old in glob.glob(os.path.join(SAMPLES_DIR, "*.json")):
        os.remove(old)
    os.makedirs(SAMPLES_DIR, exist_ok=True)

    idx = 1
    order = [("legit", "legit"), ("fraud", "fraud"), ("wrong_fp", "wrong_fp"), ("wrong_fn", "wrong_fn")]
    for key, suffix in order:
        for _, row in picks[key].iterrows():
            prob = float(row["_prob"])
            d = _to_native(row.drop(labels=["_prob"]).to_dict())
            path = os.path.join(SAMPLES_DIR, f"{idx}_{suffix}.json")
            with open(path, "w") as f:
                json.dump([d], f, indent=2)
            print(f"  wrote {idx}_{suffix}.json  prob={prob:.4f}  gt={d.get('is_fraud')}", flush=True)
            idx += 1

    print(f"Done. Wrote {idx - 1} samples.", flush=True)


if __name__ == "__main__":
    main()
