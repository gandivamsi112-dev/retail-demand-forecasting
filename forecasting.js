// Client-side feature engineering, time-series models (ARIMA, Prophet, LSTM), evaluation (RMSE, MAPE), and inventory optimization

window.FORECAST_ENGINE = (function () {
  function parseDate(dateStr) {
    const parts = dateStr.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function dayShort(date) {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
  }

  // Module 2 & 4: Preprocessing & Feature Engineering for a single product series
  function engineerFeatures(records) {
    const sorted = [...records].sort((a, b) => a.Date.localeCompare(b.Date));
    return sorted.map((row, idx) => {
      const dt = parseDate(row.Date);
      const dow = dt.getDay();
      const isWeekend = dow === 0 || dow === 6 ? 1 : 0;
      const lag1 = idx >= 1 ? sorted[idx - 1].Units_Sold : null;
      const lag7 = idx >= 7 ? sorted[idx - 7].Units_Sold : null;

      let roll7 = null;
      if (idx >= 7) {
        let sum = 0;
        for (let k = idx - 7; k < idx; k++) {
          sum += sorted[k].Units_Sold;
        }
        roll7 = Number((sum / 7).toFixed(2));
      }

      return {
        ...row,
        Day: dt.getDate(),
        Month: dt.getMonth() + 1,
        Day_of_Week: dow,
        Day_Name: dayShort(dt),
        Is_Weekend: isWeekend,
        Is_Holiday: Number(row.Holiday) ? 1 : 0,
        Promotion: Number(row.Promotion) ? 1 : 0,
        Discount: Number(row.Discount) || 0,
        Lag_1: lag1,
        Lag_7: lag7,
        Rolling_Mean_7: roll7
      };
    });
  }

  // Linear regression helper for trend estimation
  function fitLinearTrend(values) {
    const n = values.length;
    if (n < 2) return { slope: 0, intercept: values[0] || 0 };
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumXX += i * i;
    }
    const denom = n * sumXX - sumX * sumX || 1;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
  }

  function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  // Module 7: RMSE and MAPE
  function computeMetrics(actual, predicted) {
    const n = Math.min(actual.length, predicted.length);
    if (n === 0) return { rmse: 0, mape: 0 };
    let sqErr = 0;
    let absPctErr = 0;
    let validPctCount = 0;

    for (let i = 0; i < n; i++) {
      const y = actual[i];
      const yhat = predicted[i];
      const err = y - yhat;
      sqErr += err * err;
      if (y !== 0) {
        absPctErr += Math.abs(err / y);
        validPctCount++;
      }
    }
    const rmse = Math.sqrt(sqErr / n);
    const mape = validPctCount > 0 ? (absPctErr / validPctCount) * 100 : 0;
    return {
      rmse: Number(rmse.toFixed(2)),
      mape: Number(mape.toFixed(2))
    };
  }

  // Algorithm 1: ARIMA(2,1,2)-inspired univariate AR + differenced drift model
  function runArima(series, splitIdx, horizon) {
    const train = series.slice(0, splitIdx);
    const test = series.slice(splitIdx);
    const trainVals = train.map((d) => d.Units_Sold);

    // Estimate first-difference drift + AR(2) smoothing weights
    const diffs = [];
    for (let i = 1; i < trainVals.length; i++) {
      diffs.push(trainVals[i] - trainVals[i - 1]);
    }
    const avgDrift = mean(diffs.slice(-14)) * 0.25;
    const trainMean = mean(trainVals.slice(-14));

    // Predict test points using rolling univariate AR(2)+MA baseline (ignores promo/holiday)
    const testPreds = [];
    const history = [...trainVals];
    for (let i = 0; i < test.length; i++) {
      const len = history.length;
      const y1 = history[len - 1];
      const y2 = len >= 2 ? history[len - 2] : y1;
      const pred = Math.max(1, 0.52 * y1 + 0.28 * y2 + 0.2 * trainMean + avgDrift);
      testPreds.push(Number(pred.toFixed(2)));
      // Univariate multi-step forecast feeds back its own predictions
      history.push(pred);
    }

    // Refit on full series for future horizon
    const fullVals = series.map((d) => d.Units_Sold);
    const fullMean = mean(fullVals.slice(-14));
    const fullHist = [...fullVals];
    const future = [];
    const lastDate = parseDate(series[series.length - 1].Date);

    for (let h = 1; h <= horizon; h++) {
      const fDate = new Date(lastDate);
      fDate.setDate(lastDate.getDate() + h);
      const len = fullHist.length;
      const y1 = fullHist[len - 1];
      const y2 = len >= 2 ? fullHist[len - 2] : y1;
      const yhat = Math.max(1, 0.55 * y1 + 0.25 * y2 + 0.2 * fullMean + avgDrift);
      fullHist.push(yhat);
      const band = 1.6 + h * 0.22;
      future.push({
        Date: formatDateISO(fDate),
        Day_Name: dayShort(fDate),
        yhat: Number(yhat.toFixed(1)),
        yhat_lower: Number(Math.max(0, yhat - band).toFixed(1)),
        yhat_upper: Number((yhat + band).toFixed(1))
      });
    }

    const metrics = computeMetrics(
      test.map((d) => d.Units_Sold),
      testPreds
    );

    return { testPreds, future, metrics };
  }

  // Fit additive effects for Prophet-like decomposition
  function fitProphetParams(train) {
    const yVals = train.map((d) => d.Units_Sold);
    const trend = fitLinearTrend(yVals);

    // Residuals after trend
    const residuals = train.map((d, idx) => d.Units_Sold - (trend.intercept + trend.slope * idx));

    // Day-of-week seasonality
    const dowEffects = Array(7).fill(0);
    const dowCounts = Array(7).fill(0);
    train.forEach((d, idx) => {
      dowEffects[d.Day_of_Week] += residuals[idx];
      dowCounts[d.Day_of_Week]++;
    });
    for (let d = 0; d < 7; d++) {
      dowEffects[d] = dowCounts[d] ? dowEffects[d] / dowCounts[d] : 0;
    }

    // Regressors: Promotion, Holiday, Discount
    const nonPromo = [];
    const promo = [];
    const nonHol = [];
    const hol = [];

    train.forEach((d, idx) => {
      const baseRes = residuals[idx] - dowEffects[d.Day_of_Week];
      if (d.Promotion) promo.push(baseRes);
      else nonPromo.push(baseRes);
      if (d.Is_Holiday) hol.push(baseRes);
      else nonHol.push(baseRes);
    });

    const promoEffect = promo.length ? Math.max(0.8, mean(promo) - mean(nonPromo)) : 2.5;
    const holidayEffect = hol.length ? Math.max(1.2, mean(hol) - mean(nonHol)) : 3.5;

    return { trend, dowEffects, promoEffect, holidayEffect };
  }

  // Algorithm 2: Prophet additive model (Trend + Weekly Seasonality + Holiday + Promo Regressors)
  function runProphet(series, splitIdx, horizon, scenario) {
    const train = series.slice(0, splitIdx);
    const test = series.slice(splitIdx);
    const params = fitProphetParams(train);

    function predictPoint(idx, dow, isPromo, isHoliday, discount) {
      const g = params.trend.intercept + params.trend.slope * idx;
      const s = params.dowEffects[dow] || 0;
      const h =
        (isPromo ? params.promoEffect * 0.65 : -params.promoEffect * 0.15) +
        (isHoliday ? params.holidayEffect * 0.75 : 0) +
        (discount / 10) * 0.9;
      return Math.max(1, g + s + h);
    }

    const testPreds = test.map((d, i) =>
      Number(predictPoint(splitIdx + i, d.Day_of_Week, d.Promotion, d.Is_Holiday, d.Discount).toFixed(2))
    );

    // Refit on full series for future forecast
    const fullParams = fitProphetParams(series);
    const lastDate = parseDate(series[series.length - 1].Date);
    const future = [];

    for (let h = 1; h <= horizon; h++) {
      const fDate = new Date(lastDate);
      fDate.setDate(lastDate.getDate() + h);
      const dow = fDate.getDay();
      const idx = series.length - 1 + h;

      const g = fullParams.trend.intercept + fullParams.trend.slope * idx;
      const s = fullParams.dowEffects[dow] || 0;
      const reg =
        (scenario.promotion ? fullParams.promoEffect * 0.7 : 0) +
        (scenario.holiday ? fullParams.holidayEffect * 0.8 : 0) +
        (scenario.discount / 10) * 1.1;

      const yhat = Math.max(1, g + s + reg);
      const band = 1.2 + h * 0.14;
      future.push({
        Date: formatDateISO(fDate),
        Day_Name: dayShort(fDate),
        yhat: Number(yhat.toFixed(1)),
        yhat_lower: Number(Math.max(0, yhat - band).toFixed(1)),
        yhat_upper: Number((yhat + band).toFixed(1))
      });
    }

    const metrics = computeMetrics(
      test.map((d) => d.Units_Sold),
      testPreds
    );

    return { testPreds, future, metrics };
  }

  // Algorithm 3: LSTM-inspired nonlinear sequence & multi-feature predictor
  function runLstm(series, splitIdx, horizon, scenario) {
    const train = series.slice(0, splitIdx);
    const test = series.slice(splitIdx);

    // MinMax scaling on training set
    const trainUnits = train.map((d) => d.Units_Sold);
    const minU = Math.min(...trainUnits);
    const maxU = Math.max(...trainUnits);
    const span = maxU - minU || 1;
    const scale = (v) => (v - minU) / span;
    const invScale = (s) => s * span + minU;

    // Fit simple gradient-descent weights on scaled sequential features:
    // [bias, scaled_lag1, scaled_lag7, scaled_roll7, is_weekend, promo, holiday, discount_norm]
    const weights = [0.08, 0.32, 0.22, 0.28, 0.08, 0.12, 0.16, 0.08];
    const lr = 0.06;

    for (let epoch = 0; epoch < 60; epoch++) {
      for (let i = 7; i < train.length; i++) {
        const d = train[i];
        const x = [
          1,
          scale(d.Lag_1 ?? d.Units_Sold),
          scale(d.Lag_7 ?? d.Units_Sold),
          scale(d.Rolling_Mean_7 ?? d.Units_Sold),
          d.Is_Weekend,
          d.Promotion,
          d.Is_Holiday,
          d.Discount / 30
        ];
        let z = 0;
        for (let j = 0; j < weights.length; j++) z += weights[j] * x[j];
        // Smooth tanh-like bounded activation mapped back to [0, 1.3]
        const predScaled = 0.5 + 0.65 * Math.tanh(z - 0.5);
        const target = scale(d.Units_Sold);
        const err = predScaled - target;
        const deriv = 0.65 * (1 - Math.pow(Math.tanh(z - 0.5), 2));
        for (let j = 0; j < weights.length; j++) {
          weights[j] -= lr * err * deriv * x[j];
        }
      }
    }

    function predictStep(lag1, lag7, roll7, isWeekend, promo, holiday, discount) {
      const x = [
        1,
        scale(lag1),
        scale(lag7),
        scale(roll7),
        isWeekend,
        promo,
        holiday,
        discount / 30
      ];
      let z = 0;
      for (let j = 0; j < weights.length; j++) z += weights[j] * x[j];
      const predScaled = 0.5 + 0.65 * Math.tanh(z - 0.5);
      return Math.max(1, invScale(predScaled));
    }

    // Sequential test evaluation
    const testPreds = [];
    const seqHist = train.map((d) => d.Units_Sold);
    for (let i = 0; i < test.length; i++) {
      const d = test[i];
      const len = seqHist.length;
      const lag1 = seqHist[len - 1];
      const lag7 = len >= 7 ? seqHist[len - 7] : lag1;
      const roll7 = mean(seqHist.slice(Math.max(0, len - 7)));
      const yhat = predictStep(lag1, lag7, roll7, d.Is_Weekend, d.Promotion, d.Is_Holiday, d.Discount);
      testPreds.push(Number(yhat.toFixed(2)));
      seqHist.push(yhat);
    }

    // Future rollout from full series
    const fullHist = series.map((d) => d.Units_Sold);
    const lastDate = parseDate(series[series.length - 1].Date);
    const future = [];

    for (let h = 1; h <= horizon; h++) {
      const fDate = new Date(lastDate);
      fDate.setDate(lastDate.getDate() + h);
      const dow = fDate.getDay();
      const isWeekend = dow === 0 || dow === 6 ? 1 : 0;
      const len = fullHist.length;
      const lag1 = fullHist[len - 1];
      const lag7 = len >= 7 ? fullHist[len - 7] : lag1;
      const roll7 = mean(fullHist.slice(Math.max(0, len - 7)));

      const yhat = predictStep(
        lag1,
        lag7,
        roll7,
        isWeekend,
        scenario.promotion ? 1 : 0,
        scenario.holiday ? 1 : 0,
        scenario.discount
      );
      fullHist.push(yhat);
      const band = 1.0 + h * 0.12;
      future.push({
        Date: formatDateISO(fDate),
        Day_Name: dayShort(fDate),
        yhat: Number(yhat.toFixed(1)),
        yhat_lower: Number(Math.max(0, yhat - band).toFixed(1)),
        yhat_upper: Number((yhat + band).toFixed(1))
      });
    }

    const metrics = computeMetrics(
      test.map((d) => d.Units_Sold),
      testPreds
    );

    return { testPreds, future, metrics };
  }

  function evaluateProduct(records, productName, horizon, scenario) {
    const productRecords = records.filter((r) => r.Product_Name === productName);
    const series = engineerFeatures(productRecords);
    const splitIdx = Math.max(10, Math.floor(series.length * 0.8));

    const arima = runArima(series, splitIdx, horizon);
    const prophet = runProphet(series, splitIdx, horizon, scenario);
    const lstm = runLstm(series, splitIdx, horizon, scenario);

    return {
      series,
      splitIdx,
      arima,
      prophet,
      lstm
    };
  }

  // Module 9: Inventory optimization calculation
  function computeInventory(currentStock, forecastDemand, safetyStock) {
    const requiredStock = Math.round(forecastDemand + safetyStock);
    const reorderQty = Math.max(0, requiredStock - currentStock);
    return {
      currentStock,
      forecastDemand: Math.round(forecastDemand),
      safetyStock,
      requiredStock,
      reorderQty,
      status: reorderQty > 0 ? `Order ${reorderQty} Units` : "Sufficient Stock",
      needsReorder: reorderQty > 0
    };
  }

  // CSV Parser supporting Date, Product_Name, Units_Sold, Price, Discount, Promotion, Holiday, Inventory_Level
  function parseCSV(text) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      throw new Error("CSV must include a header row and at least one data row.");
    }
    const headers = lines[0].split(",").map((h) => h.trim());
    const idxMap = {};
    headers.forEach((h, i) => {
      idxMap[h.toLowerCase()] = i;
    });

    const dateIdx = idxMap["date"];
    const prodIdx = idxMap["product_name"] ?? idxMap["product"];
    const unitsIdx = idxMap["units_sold"] ?? idxMap["sales"];

    if (dateIdx === undefined || prodIdx === undefined || unitsIdx === undefined) {
      throw new Error("CSV must contain Date, Product_Name (or Product), and Units_Sold (or Sales) columns.");
    }

    const parsed = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim());
      if (cols.length < 3) continue;
      const units = Number(cols[unitsIdx]);
      if (Number.isNaN(units)) continue;

      const rawDiscount = cols[idxMap["discount"]] || "0";
      const discount = Number(rawDiscount.replace("%", "")) || 0;
      const rawPromo = (cols[idxMap["promotion"]] || "0").toLowerCase();
      const rawHol = (cols[idxMap["holiday"]] || "0").toLowerCase();

      parsed.push({
        Date: cols[dateIdx],
        Product_ID: cols[idxMap["product_id"]] || `P${i}`,
        Product_Name: cols[prodIdx],
        Store_ID: cols[idxMap["store_id"]] || "S01",
        Units_Sold: units,
        Price: Number(cols[idxMap["price"]]) || 1000,
        Discount: discount,
        Promotion: rawPromo === "yes" || rawPromo === "1" || rawPromo === "true" ? 1 : 0,
        Holiday: rawHol === "yes" || rawHol === "1" || rawHol === "true" ? 1 : 0,
        Inventory_Level: Number(cols[idxMap["inventory_level"]]) || 50,
        Category: cols[idxMap["category"]] || "Retail"
      });
    }

    if (!parsed.length) {
      throw new Error("No valid sales rows could be parsed from the uploaded CSV.");
    }
    return parsed;
  }

  function toCSV(records) {
    const header = [
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
      "Category"
    ];
    const rows = records.map((r) => header.map((h) => r[h]).join(","));
    return [header.join(","), ...rows].join("\n");
  }

  return {
    evaluateProduct,
    computeInventory,
    parseCSV,
    toCSV
  };
})();
