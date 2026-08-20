# NFC Simulation Layer — Android

> **University Final Project — Educational Simulation Only**
> Does NOT use real credit cards, EMV, Visa, Mastercard, or any real payment network.
> Uses a custom proprietary AID and custom APDU protocol.

---

## System Overview

```
┌─────────────────────┐        NFC tap        ┌─────────────────────┐
│   FakeNfcCard App   │ ───────────────────▶  │   NfcTerminal App   │
│   (HCE service)     │     APDU over ISO-DEP │   (NFC reader mode) │
└─────────────────────┘                       └──────────┬──────────┘
                                                         │ POST /api/dashboard/inject
                                                         ▼
                                              ┌─────────────────────┐
                                              │  Flask Server :8080  │
                                              │   + ML Fraud Model  │
                                              │   + Command Center   │
                                              └─────────────────────┘
```

---

## Folder Structure

```
android/
├── FakeNfcCard/                          ← Card App (HCE)
│   ├── build.gradle.kts
│   ├── settings.gradle.kts
│   └── app/
│       ├── build.gradle.kts
│       └── src/main/
│           ├── AndroidManifest.xml
│           ├── res/
│           │   ├── xml/apduservice.xml   ← AID registration
│           │   └── values/
│           │       ├── strings.xml
│           │       └── themes.xml
│           └── java/com/demo/fakenfccard/
│               ├── data/
│               │   ├── CardProfile.kt    ← stored card identity
│               │   ├── CardPayload.kt    ← NFC JSON payload
│               │   └── CardRepository.kt ← SharedPreferences CRUD
│               ├── hce/
│               │   └── CardEmulationService.kt  ← APDU handler
│               └── ui/
│                   ├── MainActivity.kt
│                   ├── CardScreen.kt
│                   ├── CardViewModel.kt
│                   └── CardViewModelFactory.kt
│
└── NfcTerminal/                          ← Terminal App (reader)
    ├── build.gradle.kts
    ├── settings.gradle.kts
    └── app/
        ├── build.gradle.kts
        └── src/main/
            ├── AndroidManifest.xml
            ├── res/values/
            │   ├── strings.xml
            │   └── themes.xml
            └── java/com/demo/nfcterminal/
                ├── data/
                │   ├── CardPayload.kt        ← received from NFC
                │   ├── Transaction.kt        ← body sent to backend
                │   └── TransactionResponse.kt
                ├── network/
                │   ├── ApiService.kt         ← Retrofit interface
                │   └── RetrofitClient.kt     ← OkHttp + Retrofit setup
                ├── nfc/
                │   ├── ApduHelper.kt         ← builds APDU bytes
                │   ├── NfcReader.kt          ← drives ISO-DEP exchange
                │   └── NfcResult.kt          ← sealed Success/Error
                └── ui/
                    ├── MainActivity.kt       ← NFC reader lifecycle
                    ├── TerminalScreen.kt
                    └── TerminalViewModel.kt
```

---

## APDU Protocol Explained

This project uses a **completely custom, non-standard protocol**.
Nothing here resembles EMV, Visa payWave, or Mastercard Contactless.

### Custom AID

```
F0 01 02 03 04 05 06
```

- AIDs starting with `F0` are in the **proprietary/experimental** range defined by ISO 7816-5.
- No conflict with any real payment AID.

### Command 1 — SELECT AID

```
Terminal → Card
  00 A4 04 00 07 F0 01 02 03 04 05 06 00
  │  │  │  │  │  └──────────────────┘  └─ Le (no constraint)
  │  │  │  │  └─ Lc = 7 (AID length)
  │  │  │  └─ P2 = 00 (first occurrence)
  │  │  └─ P1 = 04 (select by name / DF name)
  │  └─ INS = A4 (SELECT FILE)
  └─ CLA = 00 (ISO class)

Card → Terminal
  90 00    (SW: success)
```

### Command 2 — GET_CARD_PAYLOAD

```
Terminal → Card
  80 CA 00 00 00
  │  │  │  │  └─ Le = 00 (accept any length)
  │  │  │  └─ P2 = 00
  │  │  └─ P1 = 00
  │  └─ INS = CA (GET DATA)
  └─ CLA = 80 (proprietary class)

Card → Terminal
  <UTF-8 JSON bytes...> 90 00
```

### Payload JSON

```json
{
  "card_id": "CARD_DEMO_A3F7C1",
  "user_id": "USER_DEMO_A3F7C1",
  "card_type": "demo",
  "nonce": "550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2026-06-10T12:00:00.000Z",
  "first": "Alex", "last": "Morgan", "cc_num": "4539821004567890",
  "gender": "M", "dob": "1988-03-11", "job": "Systems analyst",
  "city": "New York", "state": "NY", "zip": "10001",
  "city_pop": 8400000, "lat": 40.7128, "long": -74.0060
}
```

The card now carries the cardholder attributes the fraud model consumes
(gender, dob, job, home lat/long, city population) plus display fields, so the
terminal can assemble a complete transaction from a single tap.

---

## Step-by-Step Implementation Plan

### Phase 1 — Card App

1. Create a new Android project in Android Studio named **FakeNfcCard**.
2. Copy / replace the generated files with the files in `android/FakeNfcCard/`.
3. Make sure `res/xml/apduservice.xml` is present (Android Studio does not create `res/xml/` by default — add it manually).
4. Build and install on **Device A** (must have NFC).
5. Open the app → tap **Generate Demo Card** → enter a name → tap **Generate**.
6. Enable the **NFC Card Mode** toggle.
7. The card is now live. The device will respond to ISO-DEP SELECT commands while the screen is on.

### Phase 2 — Terminal App

1. Create a new Android project in Android Studio named **NfcTerminal**.
2. Copy / replace the generated files with the files in `android/NfcTerminal/`.
3. In `RetrofitClient.kt`, set `BASE_URL`:
   - Emulator → `http://10.0.2.2:8080/`
   - Physical device on same Wi-Fi → `http://<your-PC-LAN-IP>:8080/`
4. Build and install on **Device B** (must have NFC).
5. Make sure your existing backend is running.

### Phase 3 — Demo Flow

```
1. Start the Flask server:  cd server && python run_server.py   (serves :8080)
2. Open FakeNfcCard on Device A, generate a card, enable NFC mode.
3. Open NfcTerminal on Device B.
4. Tap Device A (back) to Device B (back)  — OR tap "Simulate Tap (Demo)".
5. Terminal reads the card → shows the cardholder + last 4 digits.
6. Operator confirms: Merchant, Category, Amount, Merchant lat/long
   (pre-filled with the demo "risky" purchase).
7. Tap "Charge Card".
8. Terminal sends POST /api/dashboard/inject to the server.
9. The real stacking ensemble scores the transaction.
10. Terminal shows the Google-Pay-style ✓ (Payment Approved) AND the bank's
    verdict: FRAUD DETECTED or LEGITIMATE, with the model's fraud score.
11. The transaction appears live in the FraudGuard Command Center feed
    (tagged source: "nfc"), and a Telegram alert fires on fraud.
```

### Making the demo flag fraud (honest, no override)

The model is real, so the flag is earned by the *inputs*, not forced. The demo
defaults describe a genuinely suspicious purchase — a New York cardholder, a
merchant ~3,900 km away (Los Angeles), a **$1,287 online** purchase — which the
ensemble scores **~0.90–0.99** (threshold 0.69). For a green **LEGITIMATE**
result instead, tap and charge a small local purchase (e.g. `grocery_pos`,
`$24.90`, merchant lat/long near the card's home) → scores ~0.02.

---

## Backend Integration

### Endpoint Called

```
POST /api/dashboard/inject
Content-Type: application/json
```

This endpoint (added in `server/app.py`) scores one externally-supplied
transaction with the real ensemble and pushes it into the same live feed the
Command Center reads. The first 12 fields are the model's `REQUIRED_FIELDS`
(see `server/ensemble.py`); the rest are display-only.

### Request Body

```json
{
  "trans_date_trans_time": "2026-08-17 14:30:00",
  "merchant": "fraud_Kozey-Boehm",
  "category": "shopping_net",
  "amt": 1287.55,
  "gender": "M",
  "lat": 40.7128,
  "long": -74.0060,
  "city_pop": 8400000,
  "job": "Systems analyst",
  "dob": "1988-03-11",
  "merch_lat": 33.9,
  "merch_long": -118.2,
  "first": "Alex", "last": "Morgan", "cc_num": "4539821004567890",
  "city": "New York", "state": "NY", "zip": "10001",
  "trans_num": "NFC_1723900000000"
}
```

### Response (the feed entry)

```json
{
  "sequence": 12,
  "source": "nfc",
  "transaction_id": "NFC_1723900000000",
  "prediction": 1,
  "probability": 0.9175,
  "threshold": 0.69,
  "base_models": { "random_forest": 0.19, "catboost": 0.95, "xgboost": 0.93 },
  "inference_ms": 131.2,
  "ground_truth": 1
}
```

> `prediction` is `1` for fraud, `0` for legitimate. Optional `is_fraud` in the
> request is treated as ground truth; when omitted the server defaults it to the
> prediction so an unlabeled tap never distorts the accuracy metric.

### Test it on your computer (no NFC hardware)

```bash
cd server && python run_server.py          # serves http://localhost:8080
# in another shell, fire a demo tap:
curl -X POST http://localhost:8080/api/dashboard/inject \
     -H "Content-Type: application/json" -d @demo_tap.json
```

Then open the FraudGuard **Command Center** — the tap appears as the top row.
The Android **NfcTerminal** app has a **Simulate Tap (Demo)** button that does
exactly this from the emulator, so the whole flow is demoable without two phones.

---

## Device Requirements

| Requirement          | Card App                                  | Terminal App |
| -------------------- | ----------------------------------------- | ------------ |
| NFC hardware         | Required                                  | Required     |
| HCE support          | **Required** (`android.hardware.nfc.hce`) | Not needed   |
| Android version      | API 26+ (Android 8.0)                     | API 26+      |
| Screen on during tap | Required (HCE only works with screen on)  | Required     |
| Internet             | Not needed                                | Required     |

---

## Backend URL Quick Reference

| Scenario                  | BASE_URL                       |
| ------------------------- | ------------------------------ |
| Android Emulator          | `http://10.0.2.2:8080/`        |
| Physical device, same LAN | `http://192.168.x.x:8080/`     |
| ngrok tunnel              | `https://xxxx.ngrok.io/`       |
| Production HTTPS          | `https://your-domain.com/api/` |

---

## Testing Checklist

### Card App

- [ ] Card generates with a unique `CARD_DEMO_xxxxxx` ID
- [ ] Card profile persists across app restarts
- [ ] NFC toggle ON → `CardEmulationService` responds to APDUs
- [ ] NFC toggle OFF → service returns `SW 69 85` (conditions not satisfied)
- [ ] Delete card → `CardEmulationService` returns `SW 6A 82` (file not found)
- [ ] New card → old card is overwritten in SharedPreferences

### Terminal App

- [ ] App opens → status bar shows "Hold a demo card near the device"
- [ ] Tap card with NFC OFF → error message shown, no crash
- [ ] Tap card with NFC ON → card ID and user ID appear
- [ ] Empty amount field → submit button disabled
- [ ] Non-numeric amount → validation error shown
- [ ] Valid transaction → POST request fires (check Logcat for OkHttp body log)
- [ ] Backend returns `is_fraud: false` → green APPROVED result
- [ ] Backend returns `is_fraud: true` → orange FRAUD ALERT result
- [ ] Network unreachable → error message shown, no crash
- [ ] "New Transaction" resets all fields and returns to scan state

### Integration (two physical devices)

- [ ] SELECT AID APDU reaches `CardEmulationService` and returns `90 00`
- [ ] GET_CARD_PAYLOAD returns valid JSON with correct card ID
- [ ] Full tap-to-result flow completes in < 5 seconds
- [ ] Nonce changes on every tap (not reused)
- [ ] Fraud score visible in Terminal UI after backend response

---

## Security Notes (Simulation Only)

| Topic             | This Project                  | Real Payment System          |
| ----------------- | ----------------------------- | ---------------------------- |
| AID               | Proprietary F0xxxxxx          | Registered ISO AID           |
| Protocol          | Custom 2-command              | EMV (complex multi-step)     |
| Cryptography      | None                          | Elliptic-curve, session keys |
| Card auth         | None                          | Dynamic CVV, ARQC            |
| Replay protection | Nonce (informational only)    | Cryptographic counter        |
| Network           | HTTP (dev only)               | TLS 1.3 minimum              |
| Data at rest      | SharedPreferences (plaintext) | Hardware-backed keystore     |

This simulation is intentionally minimal. The nonce in the payload is
generated fresh on each tap as a teaching aid — it is not cryptographically
verified by the terminal in this demo build.

**Do not use this code for any real financial transaction.**

---

## Tech Stack Summary

| Layer             | Technology                               |
| ----------------- | ---------------------------------------- |
| Language          | Kotlin                                   |
| UI                | Jetpack Compose + Material 3             |
| ViewModel         | AndroidX ViewModel + StateFlow           |
| NFC (card side)   | Android Host Card Emulation (HCE)        |
| NFC (reader side) | `NfcAdapter.enableReaderMode` + `IsoDep` |
| HTTP client       | Retrofit 2 + OkHttp 4                    |
| JSON              | Gson                                     |
| Min SDK           | API 26 (Android 8.0)                     |
