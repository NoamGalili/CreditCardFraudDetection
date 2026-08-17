# CreditCardFraudDetection

A credit-card fraud detection system with a stacking ensemble model, a Flask API,
a React dashboard, and Telegram fraud alerts.

## Architecture

- **Model** — a stacking ensemble (`Backend_Package/Selected_Stack`): three base
  models (Random Forest, CatBoost, XGBoost) each output a fraud probability, and a
  meta-model combines those three probabilities into the final score. A transaction
  is flagged as fraud when the stacking probability is at or above the tuned
  threshold (`0.69`).
- **Backend** — `server/app.py` (Flask) loads the ensemble and exposes a small JSON
  API. On every fraud verdict it sends a Telegram alert.
- **Frontend** — `frontend/` (React + Vite) is the FraudGuard dashboard. The
  **Live Detection** page scores real transactions against the backend. The built
  output is committed to `server/static/`, so running the server needs only Python.
- **Notifications** — `server/telegram_notify.py` sends a message through the
  Telegram Bot API whenever a fraud is detected.

## Run the server

```powershell
cd server
python run_server.py
```

The launcher creates a local virtual environment, installs
`server/requirements.txt`, and starts the server at http://localhost:8080.

## API

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET  | `/api/samples` | List bundled sample transactions |
| GET  | `/api/samples/<file>` | Get one sample transaction |
| POST | `/api/predict` | Score a transaction (returns base-model + stacking scores) |
| GET  | `/api/metrics` | Model metadata + runtime prediction stats |
| GET  | `/api/logs` | Tail of the server log |
| GET  | `/api/telegram/status` | Whether Telegram is configured |
| POST | `/api/telegram/test` | Send a Telegram test message |

## Telegram alerts (optional)

1. In Telegram, open **@BotFather** -> `/newbot` -> copy the **bot token**.
2. Open a chat with your new bot and press **Start**.
3. Get your numeric **chat id** from **@userinfobot**.
4. Copy `.env.example` to `.env` and fill in:
   ```
   TELEGRAM_BOT_TOKEN=123456789:AA...
   TELEGRAM_CHAT_ID=123456789
   ```

If these are not set the server still runs; alerts are simply disabled.

## Rebuild the frontend (only when changing UI)

```powershell
cd frontend
npm install
npm run build   # outputs to ../server/static
```

## Notes

- Model artifacts under `Backend_Package/` are stored with **Git LFS**.
- The raw Kaggle datasets (`DB/fraudTest.csv`, `DB/fraudTrain.csv`) are not
  committed; download them from the *kartik2112/fraud-detection* dataset.
