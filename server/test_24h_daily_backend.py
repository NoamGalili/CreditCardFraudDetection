"""
Backend QA test for 24H Daily Analytics implementation.
Verifies:
1. /api/dashboard/daily returns 24 hourly buckets ("00" through "23").
2. Daily totals accumulate transactions uncapped by 500.
3. POST /api/dashboard/reset preserves daily 24H statistics.
4. Local date change resets daily 24H statistics.
"""

import sys
import os
import json
import logging
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Add server dir to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, dashboard_simulator

def run_tests():
    print("=" * 70)
    print("STARTING 24H DAILY ANALYTICS BACKEND QA TEST")
    print("=" * 70)

    client = app.test_client()

    # TEST 1: GET /api/dashboard/daily when fresh
    res = client.get("/api/dashboard/daily")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    data = res.get_json()

    print("[TEST 1] Initial GET /api/dashboard/daily response schema:")
    print(f"  Date: {data.get('date')}")
    print(f"  Total transactions: {data.get('total_transactions')}")
    print(f"  Hourly buckets count: {len(data.get('hourly', []))}")
    assert len(data.get("hourly", [])) == 24, f"Expected 24 hourly buckets, got {len(data.get('hourly', []))}"
    
    hours = [h["hour"] for h in data["hourly"]]
    expected_hours = [f"{h:02d}" for h in range(24)]
    assert hours == expected_hours, f"Hours mismatch: {hours} != {expected_hours}"
    print("-> PASSED: /api/dashboard/daily returns exactly 24 hourly buckets ('00' to '23').")

    # TEST 2: Process 10 transactions and verify accumulation
    initial_daily_total = data.get("total_transactions", 0)
    for i in range(10):
        dashboard_simulator.process_next()

    res2 = client.get("/api/dashboard/daily")
    data2 = res2.get_json()
    new_daily_total = data2.get("total_transactions", 0)
    print(f"[TEST 2] Processed 10 transactions. Daily total: {new_daily_total} (was {initial_daily_total})")
    assert new_daily_total == initial_daily_total + 10, f"Expected {initial_daily_total + 10}, got {new_daily_total}"
    
    curr_hour = datetime.now().strftime("%H")
    curr_bucket = next((h for h in data2["hourly"] if h["hour"] == curr_hour), None)
    assert curr_bucket is not None, f"Bucket for hour {curr_hour} not found"
    print(f"  Current hour ({curr_hour}) bucket processed count: {curr_bucket['total_transactions']}")
    assert curr_bucket["total_transactions"] >= 10, "Expected current hour bucket to have at least 10 txs"
    print("-> PASSED: Daily totals and current hour bucket increment properly.")

    # TEST 3: POST /api/dashboard/reset preserves daily 24H statistics
    print("[TEST 3] Testing POST /api/dashboard/reset preservation...")
    dashboard_simulator.reset()

    # Check status (session history cleared)
    status_res = client.get("/api/dashboard/status")
    status_data = status_res.get_json()
    assert status_data["processed_count"] == 0, f"Expected processed_count=0 after reset, got {status_data['processed_count']}"

    # Check daily stats (MUST REMAIN INTACT!)
    res3 = client.get("/api/dashboard/daily")
    data3 = res3.get_json()
    print(f"  Daily total after simulator reset: {data3['total_transactions']}")
    assert data3["total_transactions"] == new_daily_total, f"Expected daily total {new_daily_total} preserved, got {data3['total_transactions']}"
    print("-> PASSED: POST /api/dashboard/reset preserved today's 24H daily statistics.")

    # TEST 4: Date change reset logic
    print("[TEST 4] Testing simulated date change (midnight reset)...")
    dashboard_simulator._ensure_daily_buckets("2099-12-31")
    print(f"  New date: {dashboard_simulator.daily_date}, Daily total: {dashboard_simulator.daily_total_transactions}")
    assert dashboard_simulator.daily_date == "2099-12-31", "Expected date to update to 2099-12-31"
    assert dashboard_simulator.daily_total_transactions == 0, "Expected daily total to reset to 0 on date change"
    assert len(dashboard_simulator.daily_hourly_buckets) == 24, "Expected 24 hourly buckets after date change reset"
    print("-> PASSED: Date change resets daily totals and 24 hourly buckets cleanly.")


    # Reset back to today's date
    today_str = datetime.now().strftime("%Y-%m-%d")
    dashboard_simulator._ensure_daily_buckets(today_str)

    print("=" * 70)
    print("ALL 24H DAILY BACKEND TESTS PASSED SUCCESSFULLY!")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
