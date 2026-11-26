"""Pure-Python time series preprocessing, feature engineering, forecasting, and inventory engine."""

import csv
import math
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


DEFAULT_PRODUCTS = [
    {
        "id": "P101",
        "name": "Laptop",
        "category": "Electronics",
        "price": 45000,
        "currentStock": 50,
        "baseDemand": 9.5,
        "trendPerDay": 0.032,
        "weekendBoost": 2.6,
        "promoBoost": 3.4,
        "holidayBoost": 4.5,
    },
    {
        "id": "P102",
        "name": "Mouse",
        "category": "Accessories",
        "price": 850,
        "currentStock": 100,
        "baseDemand": 7.4,
        "trendPerDay": 0.015,
        "weekendBoost": 1.8,
        "promoBoost": 2.5,
        "holidayBoost": 3.0,
    },
    {
        "id": "P103",
        "name": "Keyboard",
        "category": "Accessories",
        "price": 1800,
        "currentStock": 20,
        "baseDemand": 8.2,
        "trendPerDay": 0.024,
        "weekendBoost": 2.2,
        "promoBoost": 3.0,
        "holidayBoost": 3.8,
    },
    {
        "id": "P104",
        "name": "Smartphone",
        "category": "Electronics",
        "price": 28000,
        "currentStock": 35,
        "baseDemand": 12.0,
        "trendPerDay": 0.04,
        "weekendBoost": 3.5,
        "promoBoost": 4.6,
        "holidayBoost": 6.2,
    },
    {
        "id": "P105",
        "name": "Headphones",
        "category": "Audio",
        "price": 3200,
        "currentStock": 85,
        "baseDemand": 10.5,
        "trendPerDay": 0.02,
        "weekendBoost": 2.8,
        "promoBoost": 3.8,
        "holidayBoost": 4.1,
    },
]

CSV_FIELDS = [
    "Date",
    "Product_ID",
    "Product_Name",
    "Store_ID",
    "Units_Sold",
    "Price",
    "Discount",
    "Promotion",
    "Holiday",
    "Inventory_Level",
    "Category",
]

DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _seeded_noise(seed: int) -> float:
    x = math.sin(seed * 12.9898 + 78.233) * 43758.5453
    return x - math.floor(x)


def generate_default_records(total_days: int = 90) -> List[Dict[str, Any]]:
    """Generate a reproducible 90-day multi-product retail sales dataset."""
    end_dt = date(2026, 11, 25)
    holiday_dates = {
        "2026-09-07",
        "2026-09-19",
        "2026-10-02",
        "2026-10-18",
        "2026-10-20",
        "2026-11-01",
        "2026-11-08",
        "2026-11-09",
        "2026-11-15",
        "2026-11-22",
    }

    records: List[Dict[str, Any]] = []
    for i in range(total_days):
        dt = end_dt - timedelta(days=(total_days - 1 - i))
        date_str = dt.isoformat()
        dow = dt.weekday()  # 0=Mon, 6=Sun
        is_weekend = 1 if dow >= 5 else 0
        is_holiday = 1 if date_str in holiday_dates else 0

        for p_idx, prod in enumerate(DEFAULT_PRODUCTS):
            r = _seeded_noise((i + 1) * 31 + (p_idx + 1) * 97)
            has_promo = 1 if (is_holiday or r > 0.74) else 0
            discount = 10 if is_holiday else ((15 if r > 0.87 else 5) if has_promo else 0)
            eff_price = round(prod["price"] * (1 - discount / 100))

            wave = math.sin((2 * math.pi * i) / 7.0) * 1.15
            raw_units = (
                prod["baseDemand"]
                + i * prod["trendPerDay"]
                + wave
                + (prod["weekendBoost"] if is_weekend else 0.0)
                + (prod["promoBoost"] if has_promo else 0.0)
                + (prod["holidayBoost"] if is_holiday else 0.0)
                + (discount / 5.0) * 0.8
                + (r - 0.5) * 2.4
            )
            units_sold = max(2, round(raw_units))
            records.append(
                {
                    "Date": date_str,
                    "Product_ID": prod["id"],
                    "Product_Name": prod["name"],
                    "Store_ID": "S01",
                    "Units_Sold": units_sold,
                    "Price": eff_price,
                    "Discount": discount,
                    "Promotion": has_promo,
                    "Holiday": is_holiday,
                    "Inventory_Level": prod["currentStock"],
                    "Category": prod["category"],
                }
            )
    return records


def ensure_dataset_csv(csv_path: Path) -> List[Dict[str, Any]]:
    """Load dataset CSV or create it with default records if missing."""
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    if not csv_path.exists():
        records = generate_default_records()
        save_records_csv(csv_path, records)
        return records
    return load_records_csv(csv_path)


def save_records_csv(csv_path: Path, records: List[Dict[str, Any]]) -> None:
    """Persist retail sales records to CSV."""
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for row in records:
            writer.writerow({k: row.get(k, "") for k in CSV_FIELDS})


def _parse_bool_flag(raw: Any) -> int:
    s = str(raw).strip().lower()
    return 1 if s in {"1", "yes", "true", "y"} else 0


def parse_csv_text(text: str) -> List[Dict[str, Any]]:
    """Parse uploaded CSV text into normalized retail sales records."""
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) < 2:
        raise ValueError("CSV must include a header row and at least one data row.")

    reader = csv.DictReader(lines)
    if not reader.fieldnames:
        raise ValueError("Invalid CSV header.")

    col_lookup = {name.strip().lower(): name for name in reader.fieldnames}
    date_col = col_lookup.get("date")
    prod_col = col_lookup.get("product_name") or col_lookup.get("product")
    units_col = col_lookup.get("units_sold") or col_lookup.get("sales")

    if not (date_col and prod_col and units_col):
        raise ValueError("CSV must contain Date, Product_Name (or Product), and Units_Sold (or Sales) columns.")

    parsed: List[Dict[str, Any]] = []
    for idx, row in enumerate(reader, start=1):
        try:
            units = int(round(float(row[units_col])))
        except (TypeError, ValueError):
            continue

        raw_discount = str(row.get(col_lookup.get("discount", ""), "0") or "0").replace("%", "").strip()
        try:
            discount = int(round(float(raw_discount)))
        except ValueError:
            discount = 0

        try:
            price = int(round(float(row.get(col_lookup.get("price", ""), 1000) or 1000)))
        except ValueError:
            price = 1000

        try:
            inv = int(round(float(row.get(col_lookup.get("inventory_level", ""), 50) or 50)))
        except ValueError:
            inv = 50

        parsed.append(
            {
                "Date": str(row[date_col]).strip(),
                "Product_ID": str(row.get(col_lookup.get("product_id", ""), f"P{idx}") or f"P{idx}").strip(),
                "Product_Name": str(row[prod_col]).strip(),
                "Store_ID": str(row.get(col_lookup.get("store_id", ""), "S01") or "S01").strip(),
                "Units_Sold": max(0, units),
                "Price": max(0, price),
                "Discount": max(0, discount),
                "Promotion": _parse_bool_flag(row.get(col_lookup.get("promotion", ""), 0)),
                "Holiday": _parse_bool_flag(row.get(col_lookup.get("holiday", ""), 0)),
                "Inventory_Level": max(0, inv),
                "Category": str(row.get(col_lookup.get("category", ""), "Retail") or "Retail").strip(),
            }
        )

    if not parsed:
        raise ValueError("No valid sales rows found in uploaded CSV.")
    return parsed


def load_records_csv(csv_path: Path) -> List[Dict[str, Any]]:
    """Read normalized retail sales records from CSV."""
    return parse_csv_text(csv_path.read_text(encoding="utf-8"))


def list_products(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return unique products with their latest price and inventory stock."""
    by_name: Dict[str, Dict[str, Any]] = {}
    for r in sorted(records, key=lambda x: x["Date"]):
        by_name[r["Product_Name"]] = {
            "id": r["Product_ID"],
            "name": r["Product_Name"],
            "category": r["Category"],
            "price": int(r["Price"]),
            "currentStock": int(r["Inventory_Level"]),
        }
    return list(by_name.values())


def engineer_features(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Aggregate by date and create leak-free calendar, lag, and rolling features."""
    by_date: Dict[str, Dict[str, Any]] = {}
    for r in sorted(records, key=lambda x: x["Date"]):
        dt_str = r["Date"]
        if dt_str not in by_date:
            by_date[dt_str] = dict(r)
        else:
            by_date[dt_str]["Units_Sold"] += int(r["Units_Sold"])
            by_date[dt_str]["Promotion"] = max(int(by_date[dt_str]["Promotion"]), int(r["Promotion"]))
            by_date[dt_str]["Holiday"] = max(int(by_date[dt_str]["Holiday"]), int(r["Holiday"]))
            by_date[dt_str]["Discount"] = max(int(by_date[dt_str]["Discount"]), int(r["Discount"]))
            by_date[dt_str]["Inventory_Level"] = int(r["Inventory_Level"])

    sorted_rows = [by_date[k] for k in sorted(by_date.keys())]
    enriched: List[Dict[str, Any]] = []

    for idx, row in enumerate(sorted_rows):
        dt = datetime.strptime(row["Date"], "%Y-%m-%d").date()
        py_dow = dt.weekday()  # 0=Mon..6=Sun
        # Match JS getDay() convention (0=Sun..6=Sat) for frontend consistency
        js_dow = (py_dow + 1) % 7
        is_weekend = 1 if py_dow >= 5 else 0
        lag1 = sorted_rows[idx - 1]["Units_Sold"] if idx >= 1 else None
        lag7 = sorted_rows[idx - 7]["Units_Sold"] if idx >= 7 else None
        roll7: Optional[float] = None
        if idx >= 7:
            roll7 = round(sum(sorted_rows[k]["Units_Sold"] for k in range(idx - 7, idx)) / 7.0, 2)

        enriched.append(
            {
                **row,
                "Day": dt.day,
                "Month": dt.month,
                "Day_of_Week": js_dow,
                "Day_Name": DAY_NAMES[py_dow],
                "Is_Weekend": is_weekend,
                "Is_Holiday": 1 if int(row["Holiday"]) else 0,
                "Promotion": 1 if int(row["Promotion"]) else 0,
                "Discount": int(row["Discount"]),
                "Lag_1": lag1,
                "Lag_7": lag7,
                "Rolling_Mean_7": roll7,
            }
        )
    return enriched


def _mean(vals: List[float]) -> float:
    return sum(vals) / len(vals) if vals else 0.0


def _fit_linear_trend(values: List[float]) -> Tuple[float, float]:
    n = len(values)
    if n < 2:
        return 0.0, (values[0] if values else 0.0)
    sum_x = n * (n - 1) / 2.0
    sum_y = sum(values)
    sum_xy = sum(i * y for i, y in enumerate(values))
    sum_xx = (n - 1) * n * (2 * n - 1) / 6.0
    denom = (n * sum_xx - sum_x * sum_x) or 1.0
    slope = (n * sum_xy - sum_x * sum_y) / denom
    intercept = (sum_y - slope * sum_x) / n
    return slope, intercept


def compute_metrics(actual: List[float], predicted: List[float]) -> Dict[str, float]:
    """Compute RMSE and MAPE on aligned actual vs predicted test series."""
    n = min(len(actual), len(predicted))
    if n == 0:
        return {"rmse": 0.0, "mape": 0.0}
    sq_err = 0.0
    abs_pct = 0.0
    valid_pct = 0
    for i in range(n):
        y = actual[i]
        yhat = predicted[i]
        err = y - yhat
        sq_err += err * err
        if y != 0:
            abs_pct += abs(err / y)
            valid_pct += 1
    rmse = math.sqrt(sq_err / n)
    mape = (abs_pct / valid_pct) * 100.0 if valid_pct > 0 else 0.0
    return {"rmse": round(rmse, 2), "mape": round(mape, 2)}


def _run_arima(series: List[Dict[str, Any]], split_idx: int, horizon: int) -> Dict[str, Any]:
    train = series[:split_idx]
    test = series[split_idx:]
    train_vals = [float(d["Units_Sold"]) for d in train]

    diffs = [train_vals[i] - train_vals[i - 1] for i in range(1, len(train_vals))]
    avg_drift = _mean(diffs[-14:]) * 0.25
    train_mean = _mean(train_vals[-14:])

    test_preds: List[float] = []
    history = list(train_vals)
    for _ in test:
        y1 = history[-1]
        y2 = history[-2] if len(history) >= 2 else y1
        pred = max(1.0, 0.52 * y1 + 0.28 * y2 + 0.2 * train_mean + avg_drift)
        test_preds.append(round(pred, 2))
        history.append(pred)

    full_vals = [float(d["Units_Sold"]) for d in series]
    full_mean = _mean(full_vals[-14:])
    full_hist = list(full_vals)
    last_dt = datetime.strptime(series[-1]["Date"], "%Y-%m-%d").date()
    future: List[Dict[str, Any]] = []

    for h in range(1, horizon + 1):
        f_dt = last_dt + timedelta(days=h)
        y1 = full_hist[-1]
        y2 = full_hist[-2] if len(full_hist) >= 2 else y1
        yhat = max(1.0, 0.55 * y1 + 0.25 * y2 + 0.2 * full_mean + avg_drift)
        full_hist.append(yhat)
        band = 1.6 + h * 0.22
        future.append(
            {
                "Date": f_dt.isoformat(),
                "Day_Name": DAY_NAMES[f_dt.weekday()],
                "yhat": round(yhat, 1),
                "yhat_lower": round(max(0.0, yhat - band), 1),
                "yhat_upper": round(yhat + band, 1),
            }
        )

    metrics = compute_metrics([float(d["Units_Sold"]) for d in test], test_preds)
    return {"testPreds": test_preds, "future": future, "metrics": metrics}


def _fit_prophet_params(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    y_vals = [float(d["Units_Sold"]) for d in rows]
    slope, intercept = _fit_linear_trend(y_vals)
    residuals = [d["Units_Sold"] - (intercept + slope * idx) for idx, d in enumerate(rows)]

    dow_effects = [0.0] * 7
    dow_counts = [0] * 7
    for idx, d in enumerate(rows):
        dow = int(d["Day_of_Week"])
        dow_effects[dow] += residuals[idx]
        dow_counts[dow] += 1
    for dow in range(7):
        dow_effects[dow] = dow_effects[dow] / dow_counts[dow] if dow_counts[dow] else 0.0

    promo_res, non_promo_res = [], []
    hol_res, non_hol_res = [], []
    for idx, d in enumerate(rows):
        base_res = residuals[idx] - dow_effects[int(d["Day_of_Week"])]
        (promo_res if d["Promotion"] else non_promo_res).append(base_res)
        (hol_res if d["Is_Holiday"] else non_hol_res).append(base_res)

    promo_effect = max(0.8, _mean(promo_res) - _mean(non_promo_res)) if promo_res else 2.5
    holiday_effect = max(1.2, _mean(hol_res) - _mean(non_hol_res)) if hol_res else 3.5

    return {
        "slope": slope,
        "intercept": intercept,
        "dow_effects": dow_effects,
        "promo_effect": promo_effect,
        "holiday_effect": holiday_effect,
    }


def _run_prophet(
    series: List[Dict[str, Any]], split_idx: int, horizon: int, scenario: Dict[str, Any]
) -> Dict[str, Any]:
    train = series[:split_idx]
    test = series[split_idx:]
    params = _fit_prophet_params(train)

    test_preds: List[float] = []
    for i, d in enumerate(test):
        idx = split_idx + i
        g = params["intercept"] + params["slope"] * idx
        s = params["dow_effects"][int(d["Day_of_Week"])]
        h = (
            (params["promo_effect"] * 0.65 if d["Promotion"] else -params["promo_effect"] * 0.15)
            + (params["holiday_effect"] * 0.75 if d["Is_Holiday"] else 0.0)
            + (d["Discount"] / 10.0) * 0.9
        )
        test_preds.append(round(max(1.0, g + s + h), 2))

    full_params = _fit_prophet_params(series)
    last_dt = datetime.strptime(series[-1]["Date"], "%Y-%m-%d").date()
    future: List[Dict[str, Any]] = []

    for h in range(1, horizon + 1):
        f_dt = last_dt + timedelta(days=h)
        js_dow = (f_dt.weekday() + 1) % 7
        idx = len(series) - 1 + h
        g = full_params["intercept"] + full_params["slope"] * idx
        s = full_params["dow_effects"][js_dow]
        reg = (
            (full_params["promo_effect"] * 0.7 if scenario["promotion"] else 0.0)
            + (full_params["holiday_effect"] * 0.8 if scenario["holiday"] else 0.0)
            + (scenario["discount"] / 10.0) * 1.1
        )
        yhat = max(1.0, g + s + reg)
        band = 1.2 + h * 0.14
        future.append(
            {
                "Date": f_dt.isoformat(),
                "Day_Name": DAY_NAMES[f_dt.weekday()],
                "yhat": round(yhat, 1),
                "yhat_lower": round(max(0.0, yhat - band), 1),
                "yhat_upper": round(yhat + band, 1),
            }
        )

    metrics = compute_metrics([float(d["Units_Sold"]) for d in test], test_preds)
    return {"testPreds": test_preds, "future": future, "metrics": metrics}


def _run_lstm(
    series: List[Dict[str, Any]], split_idx: int, horizon: int, scenario: Dict[str, Any]
) -> Dict[str, Any]:
    train = series[:split_idx]
    test = series[split_idx:]

    train_units = [float(d["Units_Sold"]) for d in train]
    min_u = min(train_units)
    max_u = max(train_units)
    span = (max_u - min_u) or 1.0

    def scale(v: float) -> float:
        return (v - min_u) / span

    def inv_scale(s: float) -> float:
        return s * span + min_u

    weights = [0.08, 0.32, 0.22, 0.28, 0.08, 0.12, 0.16, 0.08]
    lr = 0.06

    for _ in range(60):
        for i in range(7, len(train)):
            d = train[i]
            x = [
                1.0,
                scale(float(d["Lag_1"] if d["Lag_1"] is not None else d["Units_Sold"])),
                scale(float(d["Lag_7"] if d["Lag_7"] is not None else d["Units_Sold"])),
                scale(float(d["Rolling_Mean_7"] if d["Rolling_Mean_7"] is not None else d["Units_Sold"])),
                float(d["Is_Weekend"]),
                float(d["Promotion"]),
                float(d["Is_Holiday"]),
                float(d["Discount"]) / 30.0,
            ]
            z = sum(w * xi for w, xi in zip(weights, x))
            th = math.tanh(z - 0.5)
            pred_scaled = 0.5 + 0.65 * th
            err = pred_scaled - scale(float(d["Units_Sold"]))
            deriv = 0.65 * (1.0 - th * th)
            for j in range(len(weights)):
                weights[j] -= lr * err * deriv * x[j]

    def predict_step(lag1: float, lag7: float, roll7: float, is_wknd: int, promo: int, hol: int, disc: float) -> float:
        x = [
            1.0,
            scale(lag1),
            scale(lag7),
            scale(roll7),
            float(is_wknd),
            float(promo),
            float(hol),
            disc / 30.0,
        ]
        z = sum(w * xi for w, xi in zip(weights, x))
        pred_scaled = 0.5 + 0.65 * math.tanh(z - 0.5)
        return max(1.0, inv_scale(pred_scaled))

    test_preds: List[float] = []
    seq_hist = [float(d["Units_Sold"]) for d in train]
    for d in test:
        lag1 = seq_hist[-1]
        lag7 = seq_hist[-7] if len(seq_hist) >= 7 else lag1
        roll7 = _mean(seq_hist[-7:])
        yhat = predict_step(
            lag1,
            lag7,
            roll7,
            int(d["Is_Weekend"]),
            int(d["Promotion"]),
            int(d["Is_Holiday"]),
            float(d["Discount"]),
        )
        test_preds.append(round(yhat, 2))
        seq_hist.append(yhat)

    full_hist = [float(d["Units_Sold"]) for d in series]
    last_dt = datetime.strptime(series[-1]["Date"], "%Y-%m-%d").date()
    future: List[Dict[str, Any]] = []

    for h in range(1, horizon + 1):
        f_dt = last_dt + timedelta(days=h)
        is_wknd = 1 if f_dt.weekday() >= 5 else 0
        lag1 = full_hist[-1]
        lag7 = full_hist[-7] if len(full_hist) >= 7 else lag1
        roll7 = _mean(full_hist[-7:])
        yhat = predict_step(
            lag1,
            lag7,
            roll7,
            is_wknd,
            1 if scenario["promotion"] else 0,
            1 if scenario["holiday"] else 0,
            float(scenario["discount"]),
        )
        full_hist.append(yhat)
        band = 1.0 + h * 0.12
        future.append(
            {
                "Date": f_dt.isoformat(),
                "Day_Name": DAY_NAMES[f_dt.weekday()],
                "yhat": round(yhat, 1),
                "yhat_lower": round(max(0.0, yhat - band), 1),
                "yhat_upper": round(yhat + band, 1),
            }
        )

    metrics = compute_metrics([float(d["Units_Sold"]) for d in test], test_preds)
    return {"testPreds": test_preds, "future": future, "metrics": metrics}


def evaluate_product(
    records: List[Dict[str, Any]],
    product_name: str,
    horizon: int,
    scenario: Dict[str, Any],
) -> Dict[str, Any]:
    """Run chronological 80/20 split and evaluate ARIMA, Prophet, and LSTM for one product."""
    prod_rows = [r for r in records if r["Product_Name"] == product_name]
    if not prod_rows:
        raise ValueError(f"Unknown product: {product_name}")

    series = engineer_features(prod_rows)
    split_idx = max(10, min(len(series) - 2, int(len(series) * 0.8)))

    return {
        "series": series,
        "splitIdx": split_idx,
        "arima": _run_arima(series, split_idx, horizon),
        "prophet": _run_prophet(series, split_idx, horizon, scenario),
        "lstm": _run_lstm(series, split_idx, horizon, scenario),
    }


def compute_inventory(current_stock: int, forecast_demand: float, safety_stock: int) -> Dict[str, Any]:
    """Compute required stock and reorder recommendation."""
    demand_int = round(forecast_demand)
    required = max(0, demand_int + safety_stock)
    reorder_qty = max(0, required - current_stock)
    return {
        "currentStock": current_stock,
        "forecastDemand": demand_int,
        "safetyStock": safety_stock,
        "requiredStock": required,
        "reorderQty": reorder_qty,
        "status": f"Order {reorder_qty} Units" if reorder_qty > 0 else "Sufficient Stock",
        "needsReorder": reorder_qty > 0,
    }


def compute_store_overview(
    records: List[Dict[str, Any]],
    horizon: int,
    safety_stock: int,
    scenario: Dict[str, Any],
    model_key: str,
    override_product: Optional[str] = None,
    override_stock: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Compute inventory recommendations across every product in the dataset."""
    products = list_products(records)
    rows: List[Dict[str, Any]] = []
    for p in products:
        eval_res = evaluate_product(records, p["name"], horizon, scenario)
        chosen_key = model_key
        if chosen_key == "all":
            chosen_key = min(
                ["prophet", "lstm", "arima"],
                key=lambda k: eval_res[k]["metrics"]["rmse"],
            )
        forecast_sum = sum(f["yhat"] for f in eval_res[chosen_key]["future"])
        stock_val = override_stock if (override_product == p["name"] and override_stock is not None) else p["currentStock"]
        inv = compute_inventory(stock_val, forecast_sum, safety_stock)
        rows.append(
            {
                "id": p["id"],
                "name": p["name"],
                "category": p["category"],
                "price": p["price"],
                **inv,
            }
        )
    return rows
