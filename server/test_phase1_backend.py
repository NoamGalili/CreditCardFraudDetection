"""
Comprehensive Backend QA Test Suite for Phase 1 Dashboard Simulator & Existing Endpoints.
"""
import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, dashboard_simulator
import telegram_notify

def run_qa():
    print("=" * 70)
    print("STARTING PHASE 1 BACKEND QA SUITE")
    print("=" * 70)

    client = app.test_client()

    # 1. Flask starts normally & initial simulator state
    print("\n[TEST 1 & 5] Initial GET /api/dashboard/status...")
    res = client.get("/api/dashboard/status")
    assert res.status_code == 200, f"Status failed: {res.status_code}"
    status = res.get_json()
    print("Status response:", status)
    assert status["running"] is False, "Simulator should initially be stopped"
    assert status["processed_count"] == 0, "Initial processed count should be 0"
    assert status["pool_loaded"] is False, "Pool should NOT be loaded initially (Lazy access test)"
    print("-> PASSED: Lazy initialization confirmed, Flask started with simulator stopped.")

    # 2. Existing GET /api/samples
    print("\n[TEST 2 & 4] GET /api/samples (Protected functionality)...")
    res = client.get("/api/samples")
    assert res.status_code == 200
    samples = res.get_json()
    assert isinstance(samples, list) and len(samples) > 0, "Samples should return list"
    print(f"-> PASSED: /api/samples returned {len(samples)} samples.")

    # 3. Existing GET /api/samples/<filename>
    sample_fn = samples[0]["filename"]
    res = client.get(f"/api/samples/{sample_fn}")
    assert res.status_code == 200
    sample_data = res.get_json()
    print("-> PASSED: /api/samples/<filename> returned sample data.")

    # 4. Existing POST /api/predict
    print("\n[TEST 3 & 4] POST /api/predict (Protected functionality)...")
    res = client.post("/api/predict", json=sample_data)
    assert res.status_code == 200
    predict_res = res.get_json()
    assert "probability" in predict_res and "is_fraud" in predict_res
    print("-> PASSED: /api/predict works as expected.")

    # 5. POST /api/dashboard/next (Triggers lazy pool load)
    print("\n[TEST 6, 7, 8] POST /api/dashboard/next & Lazy Pool Initialization...")
    res = client.post("/api/dashboard/next")
    assert res.status_code == 200, f"Next failed: {res.status_code} {res.get_json()}"
    tx1 = res.get_json()
    print("Processed next transaction #1:", {
        "sequence": tx1["sequence"],
        "dataset_index": tx1["dataset_index"],
        "ground_truth": tx1["ground_truth"],
        "prediction": tx1["prediction"],
        "probability": tx1["probability"],
        "inference_ms": tx1["inference_ms"],
    })
    assert tx1["sequence"] == 1
    assert tx1["dataset_index"] == 0

    # Verify pool state after lazy load
    status = client.get("/api/dashboard/status").get_json()
    print("Status after first /next call:", status)
    assert status["pool_loaded"] is True, "Pool must now be loaded"
    assert status["dataset_size"] == 5000, f"Expected pool size 5000, got {status['dataset_size']}"

    # Verify pool ground truth distribution (4,500 legit, 500 fraud)
    pool = dashboard_simulator.pool.pool
    legit_cnt = sum(1 for row in pool if row["is_fraud"] == 0)
    fraud_cnt = sum(1 for row in pool if row["is_fraud"] == 1)
    print(f"Pool Distribution: Total={len(pool)}, Legit={legit_cnt}, Fraud={fraud_cnt}")
    assert len(pool) == 5000, "Pool size must be 5000"
    assert legit_cnt == 4500, f"Expected 4500 legit, got {legit_cnt}"
    assert fraud_cnt == 500, f"Expected 500 fraud, got {fraud_cnt}"
    print("-> PASSED: Pool initialized lazily with exactly 4,500 legit & 500 fraud rows.")

    # 6. GET /api/dashboard/transactions
    print("\n[TEST 9] GET /api/dashboard/transactions...")
    res = client.get("/api/dashboard/transactions?limit=10")
    assert res.status_code == 200
    txs = res.get_json()
    assert len(txs) == 1
    assert txs[0]["sequence"] == 1
    print("-> PASSED: /api/dashboard/transactions returns processed transaction.")

    # 7. GET /api/dashboard/summary
    print("\n[TEST 10] GET /api/dashboard/summary...")
    res = client.get("/api/dashboard/summary")
    assert res.status_code == 200
    summary = res.get_json()
    print("Summary:", summary)
    assert summary["total_transactions"] == 1
    print("-> PASSED: Dynamic summary computed correctly.")

    # 8. Reset simulator
    print("\n[TEST 11] POST /api/dashboard/reset...")
    res = client.post("/api/dashboard/reset")
    assert res.status_code == 200
    status = client.get("/api/dashboard/status").get_json()
    assert status["processed_count"] == 0
    assert status["current_index"] == 0
    summary = client.get("/api/dashboard/summary").get_json()
    assert summary["total_transactions"] == 0
    print("-> PASSED: Simulator reset cleanly.")

    # 9. Test start simulator with fast interval (e.g. 0.2s for QA test speed, and 3.0s for rate check)
    print("\n[TEST 12, 13, 14] Start simulator with 0.3s interval & observe >10 cycles...")
    client.post("/api/dashboard/start", json={"interval_seconds": 0.3})
    time.sleep(3.5) # Should run ~10 cycles
    status1 = client.get("/api/dashboard/status").get_json()
    cnt1 = status1["processed_count"]
    print(f"Processed count after ~3.5s at 0.3s interval: {cnt1}")
    assert cnt1 >= 8, f"Expected at least 8 cycles, got {cnt1}"

    # 10. Call POST /api/dashboard/start repeatedly while running
    print("\n[TEST 15 & 16] Call /api/dashboard/start repeatedly while running...")
    for _ in range(5):
        client.post("/api/dashboard/start", json={"interval_seconds": 0.3})
    time.sleep(1.0)
    status2 = client.get("/api/dashboard/status").get_json()
    cnt2 = status2["processed_count"]
    print(f"Processed count after repeated start calls: {cnt2}")
    # Rate should remain ~3 cycles per second, not 15 cycles per second!
    delta = cnt2 - cnt1
    print(f"Delta count over 1 sec: {delta}")
    assert delta <= 6, f"Processing speed multiplied! Delta was {delta}"
    print("-> PASSED: Repeated start calls did NOT duplicate worker or multiply speed.")

    # 11. Stop simulator
    print("\n[TEST 17 & 18] Stop simulator and verify processing halts...")
    client.post("/api/dashboard/stop")
    status_stopped = client.get("/api/dashboard/status").get_json()
    assert status_stopped["running"] is False
    cnt_at_stop = status_stopped["processed_count"]
    time.sleep(1.0)
    cnt_after_wait = client.get("/api/dashboard/status").get_json()["processed_count"]
    assert cnt_at_stop == cnt_after_wait, f"Processed count kept changing after stop! {cnt_at_stop} -> {cnt_after_wait}"
    print("-> PASSED: Simulator stopped and processed_count remained fixed.")

    # 12. Resume simulator
    print("\n[TEST 19 & 20] Resume simulator...")
    client.post("/api/dashboard/start", json={"interval_seconds": 0.3})
    time.sleep(0.8)
    cnt_resumed = client.get("/api/dashboard/status").get_json()["processed_count"]
    assert cnt_resumed > cnt_at_stop, "Simulator failed to resume"
    client.post("/api/dashboard/stop")
    print("-> PASSED: Simulator resumed successfully.")

    # 13. Test circular traversal wrap-around (transaction 5000 -> 1)
    print("\n[TEST 21] Circular Traversal wrap-around test...")
    dashboard_simulator.reset()
    # Fast set pool index near 4999
    dashboard_simulator.pool.ensure_loaded()
    dashboard_simulator.pool.current_index = 4998
    
    # Next call #1 -> index 4998
    entry1 = dashboard_simulator.process_next()
    assert entry1["dataset_index"] == 4998
    
    # Next call #2 -> index 4999
    entry2 = dashboard_simulator.process_next()
    assert entry2["dataset_index"] == 4999
    
    # Next call #3 -> index 0 (wraps back to start!)
    entry3 = dashboard_simulator.process_next()
    assert entry3["dataset_index"] == 0, f"Expected wrap to index 0, got {entry3['dataset_index']}"
    print("-> PASSED: Index 4999 wrapped to index 0 (circular pool verified).")

    # 14. Verify zero Telegram notifications fired during simulator predictions
    print("\n[TEST 23] Telegram isolation test...")
    # Check that simulator predictions never invoke telegram_notify
    orig_send = telegram_notify.send_fraud_alert
    telegram_called = False
    def mock_send(*args, **kwargs):
        nonlocal telegram_called
        telegram_called = True
        return {"ok": True}
    
    telegram_notify.send_fraud_alert = mock_send
    
    # Find a known fraud transaction in pool and process it
    dashboard_simulator.reset()
    dashboard_simulator.pool.ensure_loaded()
    # set cursor to first fraud tx
    for i, row in enumerate(dashboard_simulator.pool.pool):
        if row["is_fraud"] == 1:
            dashboard_simulator.pool.current_index = i
            break
            
    res_fraud = dashboard_simulator.process_next()
    print("Processed simulated fraud transaction:", {
        "dataset_index": res_fraud["dataset_index"],
        "ground_truth": res_fraud["ground_truth"],
        "prediction": res_fraud["prediction"],
        "probability": res_fraud["probability"]
    })
    
    assert telegram_called is False, "Simulator process_next MUST NEVER trigger Telegram!"
    telegram_notify.send_fraud_alert = orig_send
    print("-> PASSED: Simulator predictions generate zero Telegram alerts.")

    # 15. Verify error isolation in simulator loop
    print("\n[TEST 24] Single inference failure does not terminate simulator...")
    dashboard_simulator.reset()
    # Mock ensemble.predict to fail on first call
    orig_predict = dashboard_simulator.ensemble.predict
    fail_count = 0
    def faulty_predict(tx):
        nonlocal fail_count
        fail_count += 1
        if fail_count == 1:
            raise RuntimeError("Simulated model failure!")
        return orig_predict(tx)
        
    dashboard_simulator.ensemble.predict = faulty_predict
    
    entry_err = dashboard_simulator.process_next()
    assert entry_err["error"] == "Simulated model failure!"
    
    entry_ok = dashboard_simulator.process_next()
    assert entry_ok["error"] is None
    
    dashboard_simulator.ensemble.predict = orig_predict
    print("-> PASSED: Simulator handles model errors gracefully without terminating.")

    print("\n" + "=" * 70)
    print("ALL BACKEND QA TESTS PASSED SUCCESSFULLY!")
    print("=" * 70)

if __name__ == "__main__":
    run_qa()
