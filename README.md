# CreditCardFraudDetection

FraudGuard is an end-to-end credit card fraud detection and real-time response system. It combines a high-precision AI core powered by a Stacking Ensemble model, a fast Flask API for real-time decision-making, an interactive React monitoring dashboard, and an immediate emergency notification mechanism via Telegram.

## Architecture

- **Model** — A high-precision Stacking Ensemble (`Backend_Package/Selected_Stack`) combining three 
  base models (Random Forest, CatBoost, and XGBoost). Each base model generates an independent risk probability, which a meta-model aggregates into a final confidence score. Transactions meeting or exceeding the optimized threshold (`0.69`) are flagged as fraud.
- **Backend** — `server/app.py` (Flask) loads the ensemble and exposes a small JSON
  API. On every fraud verdict it sends a Telegram alert.
- **Frontend** — `frontend/` (React + Vite) is the FraudGuard dashboard. The
  **Live Detection** page scores real transactions against the backend. The built
  output is committed to `server/static/`, so running the server needs only Python.
- **Notifications** — Managed by `server/telegram_notify.py`, which dispatches real-time security alerts via the Telegram Bot API whenever high-risk activity is detected.


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
