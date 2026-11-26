# Retail Demand Forecasting — Time Series Prediction

> **Project 5** | Machine Learning & Time Series Forecasting | Python + Interactive Web Dashboard

Predict future product demand accurately using historical sales, prices, discounts, promotions, weekends, and public holidays — so retail stores maintain optimal inventory levels and eliminate costly overstocking or stockouts.

---

## 🚀 Live Dashboard Features

- **ARIMA, Prophet, and LSTM** forecasting models compared side-by-side
- **Chronological 80/20 train-test split** (no data leakage)
- **RMSE & MAPE** evaluation metrics
- **Interactive scenario controls** — toggle Promotions, Holidays, Discount %
- **Inventory optimization** — Required Stock = Forecast + Safety Stock
- **Live sale entry** — record daily sales, update stock, re-train forecasts
- **CSV upload/download** — bring your own dataset
- **EDA charts** — Weekday vs Weekend, Promotion lift, Holiday impact
- **Python code reference** — all implementation snippets included

---

## 📁 Project Structure

```
project2/
├── server.py                  # Python 3 REST API web server
├── app.py                     # Streamlit dashboard (optional)
├── requirements.txt           # Python ML dependencies
├── index.html                 # Main web application
├── styles.css                 # Responsive CSS
├── app.js                     # Frontend controller (live API + offline fallback)
├── charts.js                  # Canvas-based forecast & EDA charts
├── data.js                    # Static dataset, code snippets, Viva Q&A
├── forecasting.js             # Client-side ARIMA/Prophet/LSTM (browser fallback)
├── dataset/
│   └── retail_sales.csv       # 90-day 5-product retail sales dataset
└── src/
    └── forecasting_engine.py  # Python forecasting, evaluation & inventory engine
```

---

## ⚙️ Getting Started

### 1. Run the Live Web App (No dependencies needed)

```bash
cd ~/Documents/project2
python3 server.py
```

Then open **http://127.0.0.1:8765/** in your browser.

> If port 8765 is busy, the server automatically picks the next free port.

### 2. Run on a custom port

```bash
python3 server.py --port 8770
```

### 3. Install Python ML Libraries (for Streamlit / Jupyter)

```bash
pip3 install -r requirements.txt
streamlit run app.py
```

---

## 📊 Algorithms

| Model | Type | RMSE (Illustrative) | MAPE |
|-------|------|---------------------|------|
| ARIMA(2,1,2) | Statistical Baseline | 5.36 | 25.4% |
| Prophet | Additive (Trend + Season + Holiday) | 3.57 | 17.8% |
| LSTM | Deep Learning (Sequence) | 0.93 | 5.2% |

---

## 📦 Dataset

The built-in dataset covers **5 products** (`Laptop`, `Mouse`, `Keyboard`, `Smartphone`, `Headphones`) over **90 days** with:

- Daily units sold, price, discount %
- Promotion flags, holiday/festival flags
- Inventory level

**Recommended public datasets:**
- [Kaggle — Store Sales Time Series Forecasting](https://www.kaggle.com/competitions/store-sales-time-series-forecasting)
- [Kaggle — M5 Forecasting Accuracy](https://www.kaggle.com/competitions/m5-forecasting-accuracy)

---

## 🧠 Inventory Optimization Formula (Module 9)

```
Required Stock = Forecast Demand + Safety Stock
Reorder Qty   = Required Stock − Current Stock
```

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| Python 3 | Backend server & forecasting engine |
| Pandas / NumPy | Data manipulation |
| Statsmodels | ARIMA forecasting |
| Prophet | Trend + seasonality + holiday forecasting |
| TensorFlow / Keras | LSTM deep learning |
| Scikit-learn | RMSE / MAPE evaluation |
| Streamlit | Optional UI dashboard |
| HTML / CSS / JS | Interactive frontend |

---

## 📝 License

MIT License — free to use for academic and personal projects.
