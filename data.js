// Structured metadata, deterministic 90-day retail dataset, code snippets, and Viva Q&A

window.RETAIL_DATA = (function () {
  const PRODUCTS = [
    {
      id: "P101",
      name: "Laptop",
      category: "Electronics",
      price: 45000,
      currentStock: 50,
      baseDemand: 9.5,
      trendPerDay: 0.032,
      weekendBoost: 2.6,
      promoBoost: 3.4,
      holidayBoost: 4.5
    },
    {
      id: "P102",
      name: "Mouse",
      category: "Accessories",
      price: 850,
      currentStock: 100,
      baseDemand: 7.4,
      trendPerDay: 0.015,
      weekendBoost: 1.8,
      promoBoost: 2.5,
      holidayBoost: 3.0
    },
    {
      id: "P103",
      name: "Keyboard",
      category: "Accessories",
      price: 1800,
      currentStock: 20,
      baseDemand: 8.2,
      trendPerDay: 0.024,
      weekendBoost: 2.2,
      promoBoost: 3.0,
      holidayBoost: 3.8
    },
    {
      id: "P104",
      name: "Smartphone",
      category: "Electronics",
      price: 28000,
      currentStock: 35,
      baseDemand: 12.0,
      trendPerDay: 0.04,
      weekendBoost: 3.5,
      promoBoost: 4.6,
      holidayBoost: 6.2
    },
    {
      id: "P105",
      name: "Headphones",
      category: "Audio",
      price: 3200,
      currentStock: 85,
      baseDemand: 10.5,
      trendPerDay: 0.02,
      weekendBoost: 2.8,
      promoBoost: 3.8,
      holidayBoost: 4.1
    }
  ];

  // Deterministic pseudo-random helper so results are reproducible
  function seededNoise(seed) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function generateDefaultDataset() {
    const records = [];
    // 90 days ending 2026-11-25
    const endDate = new Date(2026, 10, 25);
    const totalDays = 90;

    // Select holiday indices (festival periods, weekends, month start)
    const holidayDates = new Set([
      "2026-09-07",
      "2026-09-19",
      "2026-10-02",
      "2026-10-18",
      "2026-10-20",
      "2026-11-01",
      "2026-11-08",
      "2026-11-09",
      "2026-11-15",
      "2026-11-22"
    ]);

    for (let i = 0; i < totalDays; i++) {
      const dt = new Date(endDate);
      dt.setDate(endDate.getDate() - (totalDays - 1 - i));
      const dateStr = formatDateISO(dt);
      const dow = dt.getDay(); // 0=Sun, 6=Sat
      const isWeekend = dow === 0 || dow === 6 ? 1 : 0;
      const isHoliday = holidayDates.has(dateStr) ? 1 : 0;

      PRODUCTS.forEach((prod, pIdx) => {
        const seed = (i + 1) * 31 + (pIdx + 1) * 97;
        const r = seededNoise(seed);
        const hasPromo = isHoliday || r > 0.74 ? 1 : 0;
        const discount = isHoliday ? 10 : hasPromo ? (r > 0.87 ? 15 : 5) : 0;
        const effectivePrice = Math.round(prod.price * (1 - discount / 100));

        const seasonalWave = Math.sin((2 * Math.PI * i) / 7) * 1.15;
        const rawUnits =
          prod.baseDemand +
          i * prod.trendPerDay +
          seasonalWave +
          (isWeekend ? prod.weekendBoost : 0) +
          (hasPromo ? prod.promoBoost : 0) +
          (isHoliday ? prod.holidayBoost : 0) +
          (discount / 5) * 0.8 +
          (r - 0.5) * 2.4;

        const unitsSold = Math.max(2, Math.round(rawUnits));

        records.push({
          Date: dateStr,
          Product_ID: prod.id,
          Product_Name: prod.name,
          Store_ID: "S01",
          Units_Sold: unitsSold,
          Price: effectivePrice,
          Discount: discount,
          Promotion: hasPromo,
          Holiday: isHoliday,
          Inventory_Level: prod.currentStock,
          Category: prod.category
        });
      });
    }

    return records;
  }

  const DATASET_COLUMNS = [
    ["Date", "Date of the transaction (YYYY-MM-DD)"],
    ["Product_ID", "Unique product identification"],
    ["Product_Name", "Human-readable product name"],
    ["Store_ID", "Store identification code"],
    ["Units_Sold", "Number of product units sold"],
    ["Price", "Product selling price"],
    ["Discount", "Discount percentage offered"],
    ["Promotion", "Whether a promotional campaign was active (0/1)"],
    ["Holiday", "Whether the date was a public holiday or festival (0/1)"],
    ["Inventory_Level", "Current available stock units"],
    ["Category", "Product category (Electronics, Accessories, Audio)"]
  ];

  const TECH_STACK = [
    ["Python", "Main programming language"],
    ["Pandas", "Data manipulation & time-series grouping"],
    ["NumPy", "Numerical & array calculations"],
    ["Matplotlib", "Data visualization & trend plots"],
    ["Seaborn", "Statistical distribution & correlation charts"],
    ["Scikit-learn", "MinMaxScaler, RMSE & MAPE evaluation"],
    ["Statsmodels", "ARIMA / SARIMAX statistical forecasting"],
    ["Prophet", "Additive trend, seasonality & holiday forecasting"],
    ["TensorFlow / Keras", "LSTM deep learning sequence modeling"],
    ["Streamlit", "Interactive web dashboard UI"],
    ["Jupyter Notebook", "Exploratory prototyping & model testing"]
  ];

  const CODE_SNIPPETS = {
    preprocessing: `import pandas as pd

# 1. Load historical retail sales dataset
df = pd.read_csv("retail_sales.csv")
print(df.isnull().sum())

# 2. Remove duplicate records
df = df.drop_duplicates()

# 3. Convert Date column & sort chronologically
df["Date"] = pd.to_datetime(df["Date"])
df = df.sort_values("Date")

# 4. Aggregate daily sales per product
daily_sales = (
    df.groupby(["Date", "Product_ID"])["Units_Sold"]
    .sum()
    .reset_index()
)`,
    features: `# Create calendar, lag, and rolling features per product
daily_sales["Day"] = daily_sales["Date"].dt.day
daily_sales["Month"] = daily_sales["Date"].dt.month
daily_sales["Day_of_Week"] = daily_sales["Date"].dt.dayofweek
daily_sales["Is_Weekend"] = (daily_sales["Day_of_Week"] >= 5).astype(int)

# Calculate lag & rolling statistics strictly from past values
daily_sales["Lag_1"] = daily_sales.groupby("Product_ID")["Units_Sold"].shift(1)
daily_sales["Lag_7"] = daily_sales.groupby("Product_ID")["Units_Sold"].shift(7)
daily_sales["Rolling_Mean_7"] = (
    daily_sales.groupby("Product_ID")["Units_Sold"]
    .transform(lambda s: s.shift(1).rolling(7).mean())
)`,
    arima: `from statsmodels.tsa.arima.model import ARIMA

# Chronological 80/20 split
split = int(len(daily_sales) * 0.8)
train = daily_sales["Units_Sold"][:split]
test = daily_sales["Units_Sold"][split:]

# Build and fit ARIMA(p=2, d=1, q=2) baseline model
model = ARIMA(train, order=(2, 1, 2))
model_fit = model.fit()

# Forecast test horizon and next 7 future days
test_pred = model_fit.forecast(steps=len(test))
future_7 = model_fit.forecast(steps=7)
print(future_7)`,
    prophet: `from prophet import Prophet

prophet_df = daily_sales[["Date", "Units_Sold", "Promotion"]].rename(
    columns={"Date": "ds", "Units_Sold": "y"}
)

model = Prophet(
    yearly_seasonality=True,
    weekly_seasonality=True,
    daily_seasonality=False
)
model.add_regressor("Promotion")
model.fit(prophet_df)

future = model.make_future_dataframe(periods=30)
future["Promotion"] = 0  # Set planned promotional schedule
forecast = model.predict(future)
print(forecast[["ds", "yhat", "yhat_lower", "yhat_upper"]].tail(7))`,
    lstm: `import numpy as np
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense

scaler = MinMaxScaler()
scaled_sales = scaler.fit_transform(daily_sales["Units_Sold"].values.reshape(-1, 1))

X, y = [], []
for i in range(30, len(scaled_sales)):
    X.append(scaled_sales[i - 30 : i])
    y.append(scaled_sales[i])
X, y = np.array(X), np.array(y)

model = Sequential([
    LSTM(50, activation="tanh", input_shape=(30, 1)),
    Dense(1)
])
model.compile(optimizer="adam", loss="mse")
model.fit(X, y, epochs=30, batch_size=32, verbose=0)

predictions = scaler.inverse_transform(model.predict(X))`,
    evaluation: `import numpy as np
from sklearn.metrics import mean_squared_error, mean_absolute_percentage_error

# Evaluate strictly on chronological test set
rmse = np.sqrt(mean_squared_error(test["Units_Sold"], predictions))
mape = mean_absolute_percentage_error(test["Units_Sold"], predictions) * 100

print(f"RMSE: {rmse:.2f}")
print(f"MAPE: {mape:.2f}%")

# Module 9: Inventory Optimization
required_stock = forecast_demand_sum + safety_stock
reorder_qty = max(0, required_stock - current_stock)`,
    streamlit: `import streamlit as st
import pandas as pd
import matplotlib.pyplot as plt

st.title("Retail Demand Forecasting System")
st.subheader("Product Demand Prediction")

df = pd.read_csv("retail_sales.csv")
product = st.selectbox("Select Product", df["Product_Name"].unique())
product_data = df[df["Product_Name"] == product]

st.write("Historical Sales Data")
st.dataframe(product_data)

fig, ax = plt.subplots()
ax.plot(product_data["Date"], product_data["Units_Sold"])
st.pyplot(fig)
st.success("Demand forecasting dashboard loaded successfully")`
  };

  const VIVA_QA = [
    {
      q: "1. What is your project about?",
      a: "My project is Retail Demand Forecasting using Machine Learning and Time Series Analysis. The main objective is to predict future product demand using historical sales data alongside prices, discounts, promotions, weekends, and holidays so retailers can plan inventory accurately."
    },
    {
      q: "2. Why did you choose this project?",
      a: "Inventory management is critical in retail. Overstocking increases storage costs, damage, and wastage, while understocking causes stockouts, lost revenue, and dissatisfied customers. Automated time series forecasting solves both problems."
    },
    {
      q: "3. Which algorithms are used and why?",
      a: "We compare three models: ARIMA (a statistical baseline using autoregressive and moving average terms), Prophet (an additive model tailored for trends, seasonality, holidays, and promotions), and LSTM (a deep learning RNN that learns nonlinear sequential patterns)."
    },
    {
      q: "4. How do you evaluate and split the dataset?",
      a: "We use a chronological 80/20 train-test split—never random shuffling—to prevent future data leakage. Models are evaluated using RMSE (penalizes larger unit errors) and MAPE (average percentage error), where lower values indicate higher accuracy."
    },
    {
      q: "5. What is the final output of the system?",
      a: "The final output is an interactive dashboard displaying historical sales, future demand forecasts with uncertainty ranges, RMSE/MAPE model comparisons, and automated inventory reorder recommendations (Required Stock = Forecast Demand + Safety Stock)."
    }
  ];

  return {
    PRODUCTS,
    DEFAULT_RECORDS: generateDefaultDataset(),
    DATASET_COLUMNS,
    TECH_STACK,
    CODE_SNIPPETS,
    VIVA_QA
  };
})();
