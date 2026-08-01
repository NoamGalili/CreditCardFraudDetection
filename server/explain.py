"""
Per-model explainability layer for the Selected-Stack fraud ensemble.

For every base model (RandomForest, CatBoost, XGBoost) this module computes
per-transaction feature contributions and turns the strongest fraud-increasing
signals into human-readable business reasons. The methodology mirrors the SHAP
explainability layer prototyped in NoteBooks/6_explainability_layer_shap.ipynb,
but uses each library's *native* contribution API so no extra dependency
(the `shap` package) is required:

    * RandomForest : exact per-instance path contributions (Saabas method)
    * CatBoost     : native ShapValues (get_feature_importance)
    * XGBoost      : native pred_contribs (Booster.predict)

A base model is said to "identify fraud" when its positive-class probability is
at or above MODEL_FRAUD_THRESHOLD. Reasons are only produced for such models.
"""
import numpy as np
import pandas as pd

# A base model flags a transaction as fraud when its probability reaches this.
MODEL_FRAUD_THRESHOLD = 0.5

# How many risk factors to surface per model.
TOP_N_REASONS = 3

# Technical feature name -> readable business reason (from notebook 6).
BUSINESS_REASON_MAP = {
    "amt": "Transaction amount contributed to the fraud-risk score.",
    "category": "Merchant category pattern contributed to the fraud-risk score.",
    "merchant": "Merchant identity pattern contributed to the fraud-risk score.",
    "gender": "Encoded customer profile signal contributed to the model score.",
    "job": "Customer occupation pattern contributed to the model score.",
    "lat": "Customer location signal contributed to the model score.",
    "long": "Customer location signal contributed to the model score.",
    "merch_lat": "Merchant location signal contributed to the model score.",
    "merch_long": "Merchant location signal contributed to the model score.",
    "city_pop": "Customer city population context contributed to the model score.",
    "hour": "Transaction time of day contributed to the fraud-risk score.",
    "day_of_week": "Day-of-week timing pattern contributed to the fraud-risk score.",
    "month": "Monthly timing pattern contributed to the fraud-risk score.",
    "is_weekend": "Weekend transaction pattern contributed to the fraud-risk score.",
    "age": "Customer age signal contributed to the model score.",
    "distance_km": "Distance between customer and merchant contributed to the fraud-risk score.",
}

# Technical feature name -> short label for the dashboard.
FEATURE_LABELS = {
    "amt": "Transaction amount",
    "category": "Merchant category",
    "merchant": "Merchant",
    "gender": "Gender",
    "job": "Occupation",
    "lat": "Customer latitude",
    "long": "Customer longitude",
    "merch_lat": "Merchant latitude",
    "merch_long": "Merchant longitude",
    "city_pop": "City population",
    "hour": "Hour of day",
    "day_of_week": "Day of week",
    "month": "Month",
    "is_weekend": "Weekend",
    "age": "Customer age",
    "distance_km": "Customer–merchant distance",
}

MODEL_DISPLAY_NAMES = {
    "random_forest": "Random Forest",
    "catboost": "CatBoost",
    "xgboost": "XGBoost",
}


def get_business_reason(feature_name: str) -> str:
    return BUSINESS_REASON_MAP.get(
        feature_name, "This feature contributed to the model fraud-risk score."
    )


# ---------------------------------------------------------------------------
# Native per-model contribution helpers (positive value => raised fraud risk)
# ---------------------------------------------------------------------------
def _rf_contributions(rf, X: pd.DataFrame) -> np.ndarray:
    """Exact per-instance contributions to the positive-class probability.

    Implements the Saabas decision-path decomposition: for each tree, walk the
    path taken by the sample and attribute every change in the node's positive
    probability to the feature used at that split, then average across trees.
    base_value + sum(contributions) == rf.predict_proba(x)[1].
    """
    x = X.iloc[0].to_numpy()
    contrib = np.zeros(X.shape[1], dtype=float)
    for est in rf.estimators_:
        t = est.tree_
        node = 0
        cur = t.value[node][0]
        cur_p = cur[1] / cur.sum()
        while t.children_left[node] != -1:  # internal node
            feat = t.feature[node]
            if x[feat] <= t.threshold[node]:
                child = t.children_left[node]
            else:
                child = t.children_right[node]
            ch = t.value[child][0]
            ch_p = ch[1] / ch.sum()
            contrib[feat] += ch_p - cur_p
            node, cur_p = child, ch_p
    contrib /= len(rf.estimators_)
    return contrib


def _catboost_contributions(cat, X: pd.DataFrame) -> np.ndarray:
    from catboost import Pool

    shap_values = cat.get_feature_importance(Pool(X), type="ShapValues")
    # shape (n_samples, n_features + 1); last column is the expected value.
    return np.asarray(shap_values)[0, :-1]


def _xgboost_contributions(xgb, X: pd.DataFrame) -> np.ndarray:
    import xgboost as xgb_lib

    booster = xgb.get_booster()
    dmatrix = xgb_lib.DMatrix(X, feature_names=list(X.columns))
    contribs = booster.predict(dmatrix, pred_contribs=True)
    # shape (n_samples, n_features + 1); last column is the bias term.
    return np.asarray(contribs)[0, :-1]


_CONTRIB_FUNCS = {
    "random_forest": _rf_contributions,
    "catboost": _catboost_contributions,
    "xgboost": _xgboost_contributions,
}


def _display_value(feature: str, raw: dict, processed_value):
    """Prefer the human-readable raw value; fall back to the processed value."""
    if raw is not None and feature in raw and raw[feature] is not None:
        return raw[feature]
    if isinstance(processed_value, (int, np.integer)):
        return int(processed_value)
    return round(float(processed_value), 4)


def _top_reasons(contrib: np.ndarray, X: pd.DataFrame, raw: dict, top_n: int):
    """Top fraud-increasing features (positive contribution) as reason dicts."""
    reasons = []
    order = np.argsort(-contrib)  # descending, positive first
    for idx in order:
        value = float(contrib[idx])
        if value <= 0:
            break
        feature = X.columns[idx]
        reasons.append({
            "feature": feature,
            "label": FEATURE_LABELS.get(feature, feature),
            "value": _display_value(feature, raw, X.iloc[0, idx]),
            "contribution": round(value, 6),
            "reason": get_business_reason(feature),
        })
        if len(reasons) >= top_n:
            break
    return reasons


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def build_explanations(ensemble, X, raw, base_probs, final_is_fraud,
                       top_n=TOP_N_REASONS):
    """Build per-model and final-decision reasons for one transaction.

    Parameters
    ----------
    ensemble       : the FraudEnsemble instance (holds .rf / .cat / .xgb).
    X              : preprocessed single-row feature frame.
    raw            : original raw transaction dict (for readable values).
    base_probs     : {"random_forest": p, "catboost": p, "xgboost": p}.
    final_is_fraud : final stacking decision (0/1).
    """
    models = {
        "random_forest": ensemble.rf,
        "catboost": ensemble.cat,
        "xgboost": ensemble.xgb,
    }

    per_model = []
    reasons_by_key = {}
    for key in ("random_forest", "catboost", "xgboost"):
        prob = float(base_probs[key])
        flagged = prob >= MODEL_FRAUD_THRESHOLD
        reasons = []
        if flagged:
            # Only spend time computing contributions when the model flags fraud.
            contrib = _CONTRIB_FUNCS[key](models[key], X)
            reasons = _top_reasons(contrib, X, raw, top_n)
            reasons_by_key[key] = reasons
        per_model.append({
            "key": key,
            "name": MODEL_DISPLAY_NAMES[key],
            "probability": round(prob, 6),
            "flagged_fraud": flagged,
            "reasons": reasons,
        })

    # Final decision: only the models that identified fraud contribute reasons.
    flagged_keys = [k for k in ("random_forest", "catboost", "xgboost")
                    if base_probs[k] >= MODEL_FRAUD_THRESHOLD]
    final_reasons = []
    note = None

    if final_is_fraud:
        if flagged_keys:
            for key in flagged_keys:
                final_reasons.append({
                    "model": MODEL_DISPLAY_NAMES[key],
                    "reasons": [r["reason"] for r in reasons_by_key.get(key, [])],
                })
        else:
            # Stacking model combined weak base signals over the threshold while
            # no single base model reached 0.5 -> explain the strongest model.
            strongest = max(base_probs, key=base_probs.get)
            contrib = _CONTRIB_FUNCS[strongest](models[strongest], X)
            reasons = _top_reasons(contrib, X, raw, top_n)
            final_reasons.append({
                "model": MODEL_DISPLAY_NAMES[strongest],
                "reasons": [r["reason"] for r in reasons],
            })
            note = ("No individual base model reached the fraud threshold; the "
                    "stacking model combined weaker signals. Showing the "
                    "strongest contributing model.")

    return {
        "model_fraud_threshold": MODEL_FRAUD_THRESHOLD,
        "models": per_model,
        "final": {
            "is_fraud": int(final_is_fraud),
            "flagged_models": [MODEL_DISPLAY_NAMES[k] for k in flagged_keys],
            "reasons": final_reasons,
            "note": note,
        },
    }
