"""
Selected-Stack fraud-detection ensemble.

Loads three base models (RandomForest, CatBoost, XGBoost) and a stacking
meta-model that takes the base-model probabilities as input. This mirrors the
inference pipeline verified in NoteBooks/5_selected_models_inference.ipynb.
"""
import os
import time
import warnings

import numpy as np
import pandas as pd
import joblib

warnings.filterwarnings("ignore")

from catboost import CatBoostClassifier
from xgboost import XGBClassifier

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)
STACK_DIR = os.path.join(PROJECT_DIR, "Backend_Package", "Selected_Stack")

# Raw transaction columns the caller is expected to provide.
REQUIRED_FIELDS = [
    "trans_date_trans_time", "merchant", "category", "amt", "gender",
    "lat", "long", "city_pop", "job", "dob", "merch_lat", "merch_long",
]


def _haversine(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 6371 * 2 * np.arcsin(np.sqrt(a))


class FraudEnsemble:
    """Loads the selected stack and exposes a single-transaction predict()."""

    def __init__(self, stack_dir: str = STACK_DIR):
        self.stack_dir = stack_dir
        t0 = time.time()

        self.pre = joblib.load(os.path.join(stack_dir, "preprocessing_artifacts.joblib"))
        self.encoder = self.pre["encoder"]
        self.medians = self.pre["medians"]
        self.feature_columns = list(self.pre["feature_columns"])
        self.categorical_columns = list(self.pre["categorical_columns"])

        self.rf = joblib.load(os.path.join(stack_dir, "random_forest.joblib"))
        self.cat = CatBoostClassifier()
        self.cat.load_model(os.path.join(stack_dir, "catboost.cbm"))
        self.xgb = XGBClassifier()
        self.xgb.load_model(os.path.join(stack_dir, "xgboost.json"))

        psa = joblib.load(os.path.join(stack_dir, "production_stack_artifacts.joblib"))
        self.meta = psa["meta_model"]
        self.threshold = float(psa["threshold"])
        self.feature_set = list(psa["feature_set"])  # ('rf_prob','cat_prob','xgb_prob')
        self.stack_name = psa["stack_name"]

        self.load_time_sec = round(time.time() - t0, 3)

    # -- feature engineering (matches training pipeline) --------------------
    def _add_features(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df = df.drop(columns=[c for c in ["Unnamed: 0"] if c in df.columns], errors="ignore")

        tt = None
        if "trans_date_trans_time" in df.columns:
            tt = pd.to_datetime(df["trans_date_trans_time"], errors="coerce")
            df["hour"] = tt.dt.hour
            df["day_of_week"] = tt.dt.dayofweek
            df["month"] = tt.dt.month
            df["is_weekend"] = df["day_of_week"].isin([5, 6]).astype(int)

        if "dob" in df.columns:
            dob = pd.to_datetime(df["dob"], errors="coerce")
            df["age"] = (tt.dt.year - dob.dt.year) if tt is not None else (2020 - dob.dt.year)
            df["age"] = df["age"].clip(lower=0, upper=100)

        if {"lat", "long", "merch_lat", "merch_long"}.issubset(df.columns):
            df["distance_km"] = _haversine(
                df["lat"], df["long"], df["merch_lat"], df["merch_long"]
            )

        drop_cols = [
            "trans_date_trans_time", "cc_num", "first", "last", "street",
            "city", "state", "zip", "trans_num", "unix_time", "dob",
        ]
        df = df.drop(columns=[c for c in drop_cols if c in df.columns], errors="ignore")
        return df

    def _preprocess(self, raw_df: pd.DataFrame) -> pd.DataFrame:
        df = self._add_features(raw_df)
        if "is_fraud" in df.columns:
            df = df.drop(columns=["is_fraud"])

        for col in [c for c in self.feature_columns if c not in df.columns]:
            df[col] = np.nan

        if self.categorical_columns:
            for col in self.categorical_columns:
                if col not in df.columns:
                    df[col] = "missing"
            df[self.categorical_columns] = self.encoder.transform(
                df[self.categorical_columns].astype(str)
            )

        df = df[self.feature_columns]
        df = df.fillna(self.medians)
        return df

    # -- inference ----------------------------------------------------------
    def predict(self, raw: dict) -> dict:
        """Predict a single transaction dict. Returns a result dict."""
        df = pd.DataFrame([raw])
        t0 = time.time()
        X = self._preprocess(df)

        rf_prob = float(self.rf.predict_proba(X)[:, 1][0])
        cat_prob = float(self.cat.predict_proba(X)[:, 1][0])
        xgb_prob = float(self.xgb.predict_proba(X)[:, 1][0])

        meta_df = pd.DataFrame(
            [{"rf_prob": rf_prob, "cat_prob": cat_prob, "xgb_prob": xgb_prob}]
        )[self.feature_set]
        stacking_prob = float(self.meta.predict_proba(meta_df)[:, 1][0])
        inference_ms = round((time.time() - t0) * 1000, 2)

        is_fraud = int(stacking_prob >= self.threshold)
        return {
            "probability": round(stacking_prob, 6),
            "threshold": self.threshold,
            "is_fraud": is_fraud,
            "label": "FRAUD" if is_fraud else "LEGIT",
            "base_models": {
                "random_forest": round(rf_prob, 6),
                "catboost": round(cat_prob, 6),
                "xgboost": round(xgb_prob, 6),
            },
            "inference_ms": inference_ms,
        }

    def metadata(self) -> dict:
        return {
            "model_name": self.stack_name,
            "framework": "scikit-learn stacking (RF + CatBoost + XGBoost)",
            "threshold": self.threshold,
            "model_load_time_sec": self.load_time_sec,
            "base_models": ["random_forest", "catboost", "xgboost"],
            "meta_features": self.feature_set,
            "feature_columns": self.feature_columns,
            "categorical_features": self.categorical_columns,
        }
