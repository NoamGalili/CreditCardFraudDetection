"""
Dashboard Transaction Simulator module for Credit Card Fraud Detection.

Provides lazy-loaded 5,000 transaction simulation pool from Kaggle's
kartik2112/fraud-detection dataset (fraudTest.csv) with deterministic sampling
(4,500 legitimate, 500 fraudulent, random seed 42) and circular traversal.
"""

import os
import sys
import time
import logging
import threading
from collections import deque
from datetime import datetime
from typing import Optional, Dict, Any, List

import pandas as pd

logger = logging.getLogger(__name__)

# Base directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)


class SimulationPool:
    """
    Manages the 5,000 transaction simulation pool extracted from fraudTest.csv.
    Uses lazy initialization so KaggleHub download and DataFrame loading only
    occur on demand.
    """

    def __init__(self, seed: int = 42):
        self.seed = seed
        self.current_index = 0
        self.pool: List[Dict[str, Any]] = []
        self._loaded = False
        self._load_error: Optional[str] = None
        self._lock = threading.Lock()

    @property
    def is_loaded(self) -> bool:
        with self._lock:
            return self._loaded

    @property
    def size(self) -> int:
        with self._lock:
            return len(self.pool)

    def ensure_loaded(self) -> None:
        """
        Lazily loads dataset and constructs the 5,000 sample pool if not already loaded.
        """
        with self._lock:
            if self._loaded:
                return

            logger.info("Initializing SimulationPool (lazy load) ...")
            try:
                csv_path = self._find_or_download_csv()
                if not csv_path or not os.path.isfile(csv_path):
                    raise FileNotFoundError(f"fraudTest.csv not found at {csv_path}")

                logger.info("Loading dataset from %s ...", csv_path)
                df = pd.read_csv(csv_path)

                if "is_fraud" not in df.columns:
                    raise KeyError("Dataset missing 'is_fraud' column")

                legit_df = df[df["is_fraud"] == 0]
                fraud_df = df[df["is_fraud"] == 1]

                if len(legit_df) < 4500:
                    raise ValueError(f"Insufficient legitimate transactions: {len(legit_df)} < 4500")
                if len(fraud_df) < 500:
                    raise ValueError(f"Insufficient fraudulent transactions: {len(fraud_df)} < 500")

                sampled_legit = legit_df.sample(n=4500, random_state=self.seed)
                sampled_fraud = fraud_df.sample(n=500, random_state=self.seed)

                combined_df = pd.concat([sampled_legit, sampled_fraud]).sample(
                    frac=1, random_state=self.seed
                ).reset_index(drop=True)

                self.pool = combined_df.to_dict(orient="records")
                self._loaded = True
                self._load_error = None
                logger.info(
                    "SimulationPool successfully initialized: 5,000 rows (4,500 legit, 500 fraud, seed=%d)",
                    self.seed,
                )

            except Exception as exc:
                self._load_error = str(exc)
                logger.exception("Failed to load simulation dataset pool")
                raise RuntimeError(f"Simulation pool loading failed: {exc}") from exc

    def _find_or_download_csv(self) -> str:
        """
        Locates fraudTest.csv locally or via kagglehub.
        """
        # 1. Check local paths
        candidates = [
            os.path.join(PROJECT_DIR, "DB", "fraudTest.csv"),
            os.path.join(PROJECT_DIR, "fraudTest.csv"),
            os.path.join(BASE_DIR, "fraudTest.csv"),
        ]
        for path in candidates:
            if os.path.isfile(path):
                logger.info("Found local dataset file at %s", path)
                return path

        # 2. Try kagglehub download
        logger.info("Downloading dataset via kagglehub (kartik2112/fraud-detection) ...")
        try:
            import kagglehub
            download_dir = kagglehub.dataset_download("kartik2112/fraud-detection")
            logger.info("KaggleHub dataset path: %s", download_dir)

            target = os.path.join(download_dir, "fraudTest.csv")
            if os.path.isfile(target):
                return target

            # Recursive search in download_dir if file structure varies
            for root, _, files in os.walk(download_dir):
                if "fraudTest.csv" in files:
                    return os.path.join(root, "fraudTest.csv")

            raise FileNotFoundError(f"fraudTest.csv not found inside KaggleHub download directory {download_dir}")

        except Exception as exc:
            logger.error("KaggleHub download failed: %s", exc)
            raise

    def get_next_transaction(self) -> tuple[int, Dict[str, Any]]:
        """
        Retrieves next transaction using circular index logic:
        current_index = (current_index + 1) % 5000
        Returns (index, transaction_dict).
        """
        self.ensure_loaded()
        with self._lock:
            if not self.pool:
                raise RuntimeError("Simulation pool is empty")

            idx = self.current_index
            tx = dict(self.pool[idx])
            self.current_index = (self.current_index + 1) % len(self.pool)
            return idx, tx

    def reset_cursor(self) -> None:
        with self._lock:
            self.current_index = 0


class TransactionSimulator:
    """
    Background worker and simulation state manager.
    Processes transactions sequentially through FraudEnsemble.predict().
    Maintains bounded processed history (deque maxlen=500).
    """

    def __init__(self, ensemble: Any, pool: Optional[SimulationPool] = None, default_interval: float = 3.0):
        self.ensemble = ensemble
        self.pool = pool or SimulationPool()
        self.interval_seconds = default_interval
        self.sequence = 0
        self.processed_count = 0
        self.processed_history: deque = deque(maxlen=500)

        # Cumulative session accumulators (unbounded by history maxlen=500)
        self.cum_total = 0
        self.cum_fraud_preds = 0
        self.cum_legit_preds = 0
        self.cum_gt_fraud = 0
        self.cum_correct = 0
        self.cum_total_volume = 0.0
        self.cum_flagged_fraud_volume = 0.0
        self.cum_sum_prob = 0.0
        self.cum_sum_inference_ms = 0.0

        # Daily 24-hour accumulators (uncapped, reset ONLY at local calendar date change / midnight)
        self.daily_date: Optional[str] = None
        self.daily_hourly_buckets: Dict[str, Dict[str, Any]] = {}
        self.daily_total_transactions = 0
        self.daily_fraud_predictions = 0
        self.daily_legit_predictions = 0
        self.daily_total_volume = 0.0
        self.daily_flagged_fraud_volume = 0.0
        self.daily_sum_probability = 0.0
        self.daily_sum_inference_ms = 0.0
        self._ensure_daily_buckets(datetime.now().strftime("%Y-%m-%d"))

        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None

    def _ensure_daily_buckets(self, current_date_str: str) -> None:
        """
        Ensures 24 hourly buckets exist for current_date_str.
        Resets ONLY daily statistics if local calendar date changes.
        Does NOT reset session totals, sequence, or processed history.
        """
        if self.daily_date != current_date_str:
            logger.info("Initializing/resetting 24H daily statistics for date: %s", current_date_str)
            self.daily_date = current_date_str
            self.daily_hourly_buckets = {
                f"{h:02d}": {
                    "hour": f"{h:02d}",
                    "total_transactions": 0,
                    "fraud_predictions": 0,
                    "legit_predictions": 0,
                    "total_volume": 0.0,
                    "flagged_fraud_volume": 0.0,
                    "sum_probability": 0.0,
                    "sum_inference_ms": 0.0,
                }
                for h in range(24)
            }
            self.daily_total_transactions = 0
            self.daily_fraud_predictions = 0
            self.daily_legit_predictions = 0
            self.daily_total_volume = 0.0
            self.daily_flagged_fraud_volume = 0.0
            self.daily_sum_probability = 0.0
            self.daily_sum_inference_ms = 0.0

    def is_running(self) -> bool:
        with self._lock:
            return self._worker_thread is not None and self._worker_thread.is_alive()

    def process_next(self) -> Dict[str, Any]:
        """
        Processes exactly one transaction synchronously:
        1. Get next raw transaction from pool
        2. Extract ground truth is_fraud
        3. Predict using ensemble (Direct ensemble call, NO TELEGRAM)
        4. Append to bounded processed history
        5. Return recorded result entry
        """
        dataset_index, tx = self.pool.get_next_transaction()

        ground_truth = int(tx.get("is_fraud", 0))

        err_msg = None
        result = None
        start_t = time.perf_counter()
        now_dt = datetime.now()
        now_date_str = now_dt.strftime("%Y-%m-%d")
        now_hour_str = now_dt.strftime("%H")

        try:
            result = self.ensemble.predict(tx)
        except Exception as exc:
            err_msg = str(exc)
            logger.exception("Simulator prediction failed for transaction at index %d", dataset_index)
            elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)
            result = {
                "probability": 0.0,
                "threshold": getattr(self.ensemble, "threshold", 0.5),
                "is_fraud": 0,
                "base_models": {},
                "inference_ms": elapsed_ms,
            }

        with self._lock:
            self.sequence += 1
            self.processed_count += 1
            seq = self.sequence
            is_fraud_pred = int(result["is_fraud"])
            explanations = result.get("explanations") if is_fraud_pred == 1 else None

            # Update cumulative accumulators
            amt_val = float(tx.get("amt", 0.0))
            prob_val = float(result["probability"])
            inf_ms = float(result.get("inference_ms", 0.0))

            self.cum_total += 1
            if is_fraud_pred == 1:
                self.cum_fraud_preds += 1
                self.cum_flagged_fraud_volume += amt_val
            else:
                self.cum_legit_preds += 1

            if ground_truth == 1:
                self.cum_gt_fraud += 1

            if is_fraud_pred == ground_truth:
                self.cum_correct += 1

            self.cum_total_volume += amt_val
            self.cum_sum_prob += prob_val
            self.cum_sum_inference_ms += inf_ms

            # Update daily accumulators (resets only when calendar date changes)
            self._ensure_daily_buckets(now_date_str)
            self.daily_total_transactions += 1
            self.daily_total_volume += amt_val
            self.daily_sum_probability += prob_val
            self.daily_sum_inference_ms += inf_ms

            if is_fraud_pred == 1:
                self.daily_fraud_predictions += 1
                self.daily_flagged_fraud_volume += amt_val
            else:
                self.daily_legit_predictions += 1

            hour_b = self.daily_hourly_buckets[now_hour_str]
            hour_b["total_transactions"] += 1
            hour_b["total_volume"] += amt_val
            hour_b["sum_probability"] += prob_val
            hour_b["sum_inference_ms"] += inf_ms
            if is_fraud_pred == 1:
                hour_b["fraud_predictions"] += 1
                hour_b["flagged_fraud_volume"] += amt_val
            else:
                hour_b["legit_predictions"] += 1

            entry = {
                "sequence": seq,

                "dataset_index": dataset_index,
                "processed_at": datetime.utcnow().isoformat() + "Z",
                "transaction_id": str(tx.get("trans_num", f"tx_{seq}")),
                "transaction": tx,
                "ground_truth": ground_truth,
                "prediction": is_fraud_pred,
                "probability": float(result["probability"]),
                "threshold": float(result["threshold"]),
                "base_models": result.get("base_models", {}),
                "explanations": explanations,
                "inference_ms": float(result.get("inference_ms", 0.0)),
                "error": err_msg,
            }

            self.processed_history.append(entry)

        return entry

    def inject_transaction(
        self,
        tx: Dict[str, Any],
        ground_truth: Optional[int] = None,
        source: str = "nfc",
    ) -> Dict[str, Any]:
        """
        Scores ONE externally-supplied transaction (e.g. an NFC tap from the
        terminal app) and pushes it into the same live feed the Command Center
        reads, updating all session/daily accumulators exactly like process_next.

        Differs from process_next only in that the transaction comes from the
        caller instead of the Kaggle pool:
          - dataset_index is -1 (not from the pool)
          - entry["source"] = source (so the UI can badge live taps)
          - ground_truth is optional; when None it defaults to the prediction
            so an unlabeled live tap never distorts the accuracy metric.
        """
        err_msg = None
        result = None
        start_t = time.perf_counter()
        now_dt = datetime.now()
        now_date_str = now_dt.strftime("%Y-%m-%d")
        now_hour_str = now_dt.strftime("%H")

        try:
            result = self.ensemble.predict(tx)
        except Exception as exc:
            err_msg = str(exc)
            logger.exception("Injected-transaction prediction failed")
            elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)
            result = {
                "probability": 0.0,
                "threshold": getattr(self.ensemble, "threshold", 0.5),
                "is_fraud": 0,
                "base_models": {},
                "inference_ms": elapsed_ms,
            }

        is_fraud_pred = int(result["is_fraud"])
        gt = is_fraud_pred if ground_truth is None else int(ground_truth)

        with self._lock:
            self.sequence += 1
            self.processed_count += 1
            seq = self.sequence
            explanations = result.get("explanations") if is_fraud_pred == 1 else None

            amt_val = float(tx.get("amt", 0.0))
            prob_val = float(result["probability"])
            inf_ms = float(result.get("inference_ms", 0.0))

            self.cum_total += 1
            if is_fraud_pred == 1:
                self.cum_fraud_preds += 1
                self.cum_flagged_fraud_volume += amt_val
            else:
                self.cum_legit_preds += 1

            if gt == 1:
                self.cum_gt_fraud += 1
            if is_fraud_pred == gt:
                self.cum_correct += 1

            self.cum_total_volume += amt_val
            self.cum_sum_prob += prob_val
            self.cum_sum_inference_ms += inf_ms

            self._ensure_daily_buckets(now_date_str)
            self.daily_total_transactions += 1
            self.daily_total_volume += amt_val
            self.daily_sum_probability += prob_val
            self.daily_sum_inference_ms += inf_ms

            if is_fraud_pred == 1:
                self.daily_fraud_predictions += 1
                self.daily_flagged_fraud_volume += amt_val
            else:
                self.daily_legit_predictions += 1

            hour_b = self.daily_hourly_buckets[now_hour_str]
            hour_b["total_transactions"] += 1
            hour_b["total_volume"] += amt_val
            hour_b["sum_probability"] += prob_val
            hour_b["sum_inference_ms"] += inf_ms
            if is_fraud_pred == 1:
                hour_b["fraud_predictions"] += 1
                hour_b["flagged_fraud_volume"] += amt_val
            else:
                hour_b["legit_predictions"] += 1

            entry = {
                "sequence": seq,
                "dataset_index": -1,
                "source": source,
                "processed_at": datetime.utcnow().isoformat() + "Z",
                "transaction_id": str(tx.get("trans_num", f"nfc_{seq}")),
                "transaction": tx,
                "ground_truth": gt,
                "prediction": is_fraud_pred,
                "probability": float(result["probability"]),
                "threshold": float(result["threshold"]),
                "base_models": result.get("base_models", {}),
                "explanations": explanations,
                "inference_ms": float(result.get("inference_ms", 0.0)),
                "error": err_msg,
            }

            self.processed_history.append(entry)

        return entry

    def start(self, interval_seconds: Optional[float] = None) -> bool:
        """
        Starts automatic transaction simulation worker loop.
        Safe to call repeatedly; won't spawn duplicate threads.
        """
        with self._lock:
            if interval_seconds is not None and interval_seconds > 0:
                self.interval_seconds = float(interval_seconds)

            if self._worker_thread is not None and self._worker_thread.is_alive():
                logger.info("Simulator worker already running.")
                return True

            self._stop_event.clear()
            self._worker_thread = threading.Thread(
                target=self._worker_loop, name="DashboardSimulatorWorker", daemon=True
            )
            self._worker_thread.start()
            logger.info("Started simulator worker thread (interval=%.1fs)", self.interval_seconds)
            return True

    def _worker_loop(self) -> None:
        """
        Background thread body. Runs until _stop_event is set.
        """
        logger.info("Simulator worker loop entered.")
        while not self._stop_event.is_set():
            try:
                self.process_next()
            except Exception as exc:
                logger.exception("Error in simulator worker step (continuing): %s", exc)

            if self._stop_event.wait(timeout=self.interval_seconds):
                break
        logger.info("Simulator worker loop exited.")

    def stop(self) -> bool:
        """
        Stops automatic background simulation cleanly.
        """
        with self._lock:
            if self._worker_thread is None or not self._worker_thread.is_alive():
                self._stop_event.set()
                return False

            self._stop_event.set()
            thread = self._worker_thread

        if thread and threading.current_thread() != thread:
            thread.join(timeout=3.0)

        with self._lock:
            self._worker_thread = None
            logger.info("Stopped simulator worker thread.")
        return True

    def reset(self) -> None:
        """
        Stops simulator, clears processed history, resets cursor to 0 and sequence to 0.
        Leaves simulator stopped.
        NOTE: Daily 24H statistics are NOT cleared by session reset!
        """
        self.stop()
        with self._lock:
            self.processed_history.clear()
            self.sequence = 0
            self.processed_count = 0
            self.cum_total = 0
            self.cum_fraud_preds = 0
            self.cum_legit_preds = 0
            self.cum_gt_fraud = 0
            self.cum_correct = 0
            self.cum_total_volume = 0.0
            self.cum_flagged_fraud_volume = 0.0
            self.cum_sum_prob = 0.0
            self.cum_sum_inference_ms = 0.0
            self.pool.reset_cursor()
        logger.info("Simulator session state reset successfully (Daily 24H stats preserved).")


    def get_status(self) -> Dict[str, Any]:
        """
        Returns simulator status overview.
        """
        running = self.is_running()
        with self._lock:
            return {
                "running": running,
                "interval_seconds": self.interval_seconds,
                "dataset_size": self.pool.size if self.pool.is_loaded else 5000,
                "processed_count": self.processed_count,
                "current_index": self.pool.current_index,
                "pool_loaded": self.pool.is_loaded,
                "load_error": self.pool._load_error,
            }

    def get_transactions(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Returns processed transactions newest-first up to limit (max 500).
        """
        limit = max(1, min(limit, 500))
        with self._lock:
            history_list = list(reversed(self.processed_history))
            return history_list[:limit]

    def get_summary(self) -> Dict[str, Any]:
        """
        Computes dynamic dashboard metrics using cumulative session accumulators.
        """
        with self._lock:
            running = self._worker_thread is not None and self._worker_thread.is_alive()
            interval = self.interval_seconds
            ds_size = self.pool.size if self.pool.is_loaded else 5000
            curr_idx = self.pool.current_index

            total = self.cum_total
            fraud_preds = self.cum_fraud_preds
            legit_preds = self.cum_legit_preds
            gt_fraud = self.cum_gt_fraud
            correct = self.cum_correct
            tot_vol = round(self.cum_total_volume, 2)
            flagged_vol = round(self.cum_flagged_fraud_volume, 2)
            sum_prob = self.cum_sum_prob
            sum_ms = self.cum_sum_inference_ms
            history_len = len(self.processed_history)

        if total == 0:
            return {
                "total_transactions": 0,
                "fraud_predictions": 0,
                "legit_predictions": 0,
                "ground_truth_fraud": 0,
                "correct_predictions": 0,
                "accuracy": 0.0,
                "avg_probability": 0.0,
                "avg_inference_ms": 0.0,
                "total_volume": 0.0,
                "flagged_fraud_volume": 0.0,
                "recent_history_size": 0,
                "simulator_running": running,
                "interval_seconds": interval,
                "dataset_size": ds_size,
                "current_index": curr_idx,
            }

        accuracy = round(correct / total, 4)
        avg_prob = round(sum_prob / total, 4)
        avg_ms = round(sum_ms / total, 2)

        return {
            "total_transactions": total,
            "fraud_predictions": fraud_preds,
            "legit_predictions": legit_preds,
            "ground_truth_fraud": gt_fraud,
            "correct_predictions": correct,
            "accuracy": accuracy,
            "avg_probability": avg_prob,
            "avg_inference_ms": avg_ms,
            "total_volume": tot_vol,
            "flagged_fraud_volume": flagged_vol,
            "recent_history_size": history_len,
            "simulator_running": running,
            "interval_seconds": interval,
            "dataset_size": ds_size,
            "current_index": curr_idx,
        }

    def get_daily_summary(self) -> Dict[str, Any]:
        """
        Returns 24-hour daily aggregated metrics for current calendar date.
        Guarantees all 24 hourly buckets ("00" through "23") in response.
        Daily totals include all transactions processed today, unaffected by reset().
        """
        now_date_str = datetime.now().strftime("%Y-%m-%d")
        with self._lock:
            self._ensure_daily_buckets(now_date_str)

            tot = self.daily_total_transactions
            fraud_p = self.daily_fraud_predictions
            legit_p = self.daily_legit_predictions
            tot_v = round(self.daily_total_volume, 2)
            flag_v = round(self.daily_flagged_fraud_volume, 2)

            avg_prob = round(self.daily_sum_probability / tot, 4) if tot > 0 else None
            avg_ms = round(self.daily_sum_inference_ms / tot, 2) if tot > 0 else None

            hourly_list = []
            for h in range(24):
                h_str = f"{h:02d}"
                b = self.daily_hourly_buckets[h_str]
                b_tot = b["total_transactions"]
                b_prob = round(b["sum_probability"] / b_tot, 4) if b_tot > 0 else None
                b_ms = round(b["sum_inference_ms"] / b_tot, 2) if b_tot > 0 else None

                hourly_list.append({
                    "hour": h_str,
                    "total_transactions": b_tot,
                    "fraud_predictions": b["fraud_predictions"],
                    "legit_predictions": b["legit_predictions"],
                    "total_volume": round(b["total_volume"], 2),
                    "flagged_fraud_volume": round(b["flagged_fraud_volume"], 2),
                    "avg_probability": b_prob,
                    "avg_inference_ms": b_ms,
                })

            return {
                "date": self.daily_date,
                "total_transactions": tot,
                "fraud_predictions": fraud_p,
                "legit_predictions": legit_p,
                "total_volume": tot_v,
                "flagged_fraud_volume": flag_v,
                "avg_probability": avg_prob,
                "avg_inference_ms": avg_ms,
                "hourly": hourly_list,
            }


