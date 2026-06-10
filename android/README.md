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
                                                         │ POST /transactions
                                                         ▼
                                              ┌─────────────────────┐
                                              │   Existing Backend   │
                                              │   + ML Fraud Model  │
                                              │   + Dashboard        │
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
  "card_id":    "CARD_DEMO_A3F7C1",
  "user_id":    "USER_DEMO_A3F7C1",
  "card_type":  "demo",
  "nonce":      "550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2026-06-10T12:00:00.000Z"
}
```

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
   - Emulator → `http://10.0.2.2:5000/`
   - Physical device on same Wi-Fi → `http://<your-PC-LAN-IP>:5000/`
4. Build and install on **Device B** (must have NFC).
5. Make sure your existing backend is running.

### Phase 3 — Demo Flow

```
1. Start backend (existing Flask/FastAPI server).
2. Open FakeNfcCard on Device A, generate a card, enable NFC mode.
3. Open NfcTerminal on Device B — screen shows "Hold a demo card near the device".
4. Tap Device A (back) to Device B (back).
5. Terminal reads card → shows card ID.
6. Operator fills in: Merchant, Category, Amount, City, Lat/Lon.
7. Tap "Submit Transaction".
8. Terminal sends POST /transactions to backend.
9. Backend runs fraud detection model.
10. Terminal shows APPROVED or FRAUD ALERT with fraud score.
11. Dashboard updates.
```

---

## Backend Integration

### Endpoint Called

```
POST /transactions
Content-Type: application/json
```

### Request Body

```json
{
  "card_id":   "CARD_DEMO_A3F7C1",
  "merchant":  "Demo Store",
  "category":  "shopping",
  "amount":    250.00,
  "city":      "Tel Aviv",
  "lat":       32.0853,
  "long":      34.7818,
  "timestamp": "2026-06-10T12:00:00.000Z"
}
```

### Expected Response

```json
{
  "status":         "ok",
  "transaction_id": "TXN_0042",
  "fraud_score":    0.0312,
  "is_fraud":       false,
  "message":        "Approved"
}
```

> The `TransactionResponse` data class accepts all fields as nullable so it
> works regardless of which fields your backend actually returns.

---

## Device Requirements

| Requirement | Card App | Terminal App |
|---|---|---|
| NFC hardware | Required | Required |
| HCE support | **Required** (`android.hardware.nfc.hce`) | Not needed |
| Android version | API 26+ (Android 8.0) | API 26+ |
| Screen on during tap | Required (HCE only works with screen on) | Required |
| Internet | Not needed | Required |

---

## Backend URL Quick Reference

| Scenario | BASE_URL |
|---|---|
| Android Emulator | `http://10.0.2.2:5000/` |
| Physical device, same LAN | `http://192.168.x.x:5000/` |
| ngrok tunnel | `https://xxxx.ngrok.io/` |
| Production HTTPS | `https://your-domain.com/api/` |

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

| Topic | This Project | Real Payment System |
|---|---|---|
| AID | Proprietary F0xxxxxx | Registered ISO AID |
| Protocol | Custom 2-command | EMV (complex multi-step) |
| Cryptography | None | Elliptic-curve, session keys |
| Card auth | None | Dynamic CVV, ARQC |
| Replay protection | Nonce (informational only) | Cryptographic counter |
| Network | HTTP (dev only) | TLS 1.3 minimum |
| Data at rest | SharedPreferences (plaintext) | Hardware-backed keystore |

This simulation is intentionally minimal. The nonce in the payload is
generated fresh on each tap as a teaching aid — it is not cryptographically
verified by the terminal in this demo build.

**Do not use this code for any real financial transaction.**

---

## Tech Stack Summary

| Layer | Technology |
|---|---|
| Language | Kotlin |
| UI | Jetpack Compose + Material 3 |
| ViewModel | AndroidX ViewModel + StateFlow |
| NFC (card side) | Android Host Card Emulation (HCE) |
| NFC (reader side) | `NfcAdapter.enableReaderMode` + `IsoDep` |
| HTTP client | Retrofit 2 + OkHttp 4 |
| JSON | Gson |
| Min SDK | API 26 (Android 8.0) |
