// High-DPI Canvas charting library for Forecast, EDA, and Model Comparison charts

window.RETAIL_CHARTS = (function () {
  function setupCanvas(canvas, height) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.parentElement.clientWidth || 640;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height };
  }

  function drawForecastChart(canvas, tooltipEl, state) {
    const { series, splitIdx, modelMode, arima, prophet, lstm } = state;
    const { ctx, width, height } = setupCanvas(canvas, 340);

    const pad = { top: 24, right: 20, bottom: 42, left: 46 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    // Show last 45 historical days + all future days for readability
    const histStart = Math.max(0, series.length - 45);
    const visibleHist = series.slice(histStart);
    const futureLen = prophet.future.length;
    const totalPoints = visibleHist.length + futureLen;

    const allY = visibleHist.map((d) => d.Units_Sold);
    if (modelMode === "all" || modelMode === "prophet") {
      prophet.future.forEach((f) => allY.push(f.yhat_upper));
    }
    if (modelMode === "all" || modelMode === "arima") {
      arima.future.forEach((f) => allY.push(f.yhat_upper));
    }
    if (modelMode === "all" || modelMode === "lstm") {
      lstm.future.forEach((f) => allY.push(f.yhat_upper));
    }

    const minY = Math.max(0, Math.floor(Math.min(...allY) * 0.8));
    const maxY = Math.ceil(Math.max(...allY) * 1.12) || 20;

    const xAt = (idx) => pad.left + (idx / Math.max(1, totalPoints - 1)) * plotW;
    const yAt = (val) => pad.top + plotH - ((val - minY) / Math.max(1, maxY - minY)) * plotH;

    ctx.clearRect(0, 0, width, height);

    // Shaded forecast region
    const forecastStartX = xAt(visibleHist.length - 1);
    ctx.fillStyle = "rgba(37, 99, 235, 0.05)";
    ctx.fillRect(forecastStartX, pad.top, pad.left + plotW - forecastStartX, plotH);

    // Horizontal grid & Y labels
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#64748b";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    const steps = 5;
    for (let s = 0; s <= steps; s++) {
      const val = minY + ((maxY - minY) * s) / steps;
      const y = yAt(val);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.fillText(Math.round(val).toString(), pad.left - 8, y + 4);
    }

    // Chronological 80/20 test boundary marker (if visible)
    const relSplit = splitIdx - histStart;
    if (relSplit > 0 && relSplit < visibleHist.length) {
      const sx = xAt(relSplit);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#10b981";
      ctx.beginPath();
      ctx.moveTo(sx, pad.top);
      ctx.lineTo(sx, pad.top + plotH);
      ctx.stroke();
      ctx.fillStyle = "#059669";
      ctx.textAlign = "left";
      ctx.fillText("Test Split (20%)", sx + 5, pad.top + 13);
      ctx.restore();
    }

    // Forecast vertical boundary
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "#2563eb";
    ctx.beginPath();
    ctx.moveTo(forecastStartX, pad.top);
    ctx.lineTo(forecastStartX, pad.top + plotH);
    ctx.stroke();
    ctx.fillStyle = "#2563eb";
    ctx.textAlign = "left";
    ctx.fillText("Forecast Horizon", forecastStartX + 6, pad.top + 13);
    ctx.restore();

    // Confidence band for single selected model
    const activeFuture =
      modelMode === "arima" ? arima.future : modelMode === "lstm" ? lstm.future : prophet.future;
    if (modelMode !== "all") {
      ctx.beginPath();
      activeFuture.forEach((f, i) => {
        const x = xAt(visibleHist.length + i);
        const y = yAt(f.yhat_upper);
        if (i === 0) {
          ctx.moveTo(xAt(visibleHist.length - 1), yAt(visibleHist[visibleHist.length - 1].Units_Sold));
          ctx.lineTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      for (let i = activeFuture.length - 1; i >= 0; i--) {
        const x = xAt(visibleHist.length + i);
        const y = yAt(activeFuture[i].yhat_lower);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(37, 99, 235, 0.14)";
      ctx.fill();
    }

    // Helper to draw line
    function drawSeries(points, color, dashed, lineWidth = 2.2) {
      if (!points.length) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      if (dashed) ctx.setLineDash([6, 4]);
      ctx.beginPath();
      points.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
      ctx.restore();
    }

    // Historical line
    const histPts = visibleHist.map((d, i) => ({
      x: xAt(i),
      y: yAt(d.Units_Sold),
      meta: d,
      type: "actual"
    }));
    drawSeries(histPts, "#0f172a", false, 2.3);

    // Highlight holiday/promo points on historical line
    histPts.forEach((pt) => {
      if (pt.meta.Is_Holiday) {
        ctx.fillStyle = "#dc2626";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (pt.meta.Promotion) {
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Test predictions overlay for active model(s)
    const modelConfigs = [
      { key: "arima", label: "ARIMA", color: "#64748b", obj: arima },
      { key: "prophet", label: "Prophet", color: "#2563eb", obj: prophet },
      { key: "lstm", label: "LSTM", color: "#7c3aed", obj: lstm }
    ];

    const hoverPoints = [...histPts];
    const lastHistPt = histPts[histPts.length - 1];

    modelConfigs.forEach((cfg) => {
      if (modelMode !== "all" && modelMode !== cfg.key) return;

      // Test overlay
      const testPts = [];
      cfg.obj.testPreds.forEach((val, idx) => {
        const seriesIdx = splitIdx + idx - histStart;
        if (seriesIdx >= 0 && seriesIdx < visibleHist.length) {
          testPts.push({ x: xAt(seriesIdx), y: yAt(val) });
        }
      });
      drawSeries(testPts, cfg.color, true, 1.8);

      // Future line
      const futPts = [
        { x: lastHistPt.x, y: lastHistPt.y },
        ...cfg.obj.future.map((f, i) => ({
          x: xAt(visibleHist.length + i),
          y: yAt(f.yhat),
          meta: f,
          modelLabel: cfg.label,
          type: "forecast"
        }))
      ];
      drawSeries(futPts, cfg.color, false, 2.5);

      futPts.slice(1).forEach((pt) => {
        ctx.fillStyle = cfg.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        if (modelMode !== "all" || cfg.key === "prophet") {
          hoverPoints.push(pt);
        }
      });
    });

    // X-axis date ticks
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    const allDates = [
      ...visibleHist.map((d) => d.Date),
      ...prophet.future.map((f) => f.Date)
    ];
    const tickStep = Math.max(1, Math.floor(allDates.length / 7));
    for (let i = 0; i < allDates.length; i += tickStep) {
      const label = allDates[i].slice(5);
      ctx.fillText(label, xAt(i), height - 14);
    }

    // Bind hover handler safely
    canvas.onmousemove = (evt) => {
      const rect = canvas.getBoundingClientRect();
      const mx = evt.clientX - rect.left;
      let nearest = null;
      let minDist = 18;
      for (const pt of hoverPoints) {
        const dist = Math.abs(pt.x - mx);
        if (dist < minDist) {
          minDist = dist;
          nearest = pt;
        }
      }
      if (!nearest) {
        tooltipEl.hidden = true;
        return;
      }

      if (nearest.type === "actual") {
        const d = nearest.meta;
        tooltipEl.innerHTML = `
          <strong>${d.Date} (${d.Day_Name})</strong><br/>
          Actual Sales: <strong>${d.Units_Sold} units</strong><br/>
          Discount: ${d.Discount}% &middot; Promo: ${d.Promotion ? "Yes" : "No"} &middot; Holiday: ${d.Is_Holiday ? "Yes" : "No"}
        `;
      } else {
        const f = nearest.meta;
        tooltipEl.innerHTML = `
          <strong>${f.Date} (${f.Day_Name}) &middot; ${nearest.modelLabel}</strong><br/>
          Forecast: <strong>${f.yhat} units</strong><br/>
          Interval: ${f.yhat_lower} &ndash; ${f.yhat_upper} units
        `;
      }
      tooltipEl.hidden = false;
      const leftPos = Math.min(rect.width - 210, Math.max(10, nearest.x + 12));
      const topPos = Math.max(8, nearest.y - 54);
      tooltipEl.style.left = `${leftPos}px`;
      tooltipEl.style.top = `${topPos}px`;
    };

    canvas.onmouseleave = () => {
      tooltipEl.hidden = true;
    };
  }

  function drawComparisonChart(canvas, metricsByModel) {
    const { ctx, width, height } = setupCanvas(canvas, 260);
    ctx.clearRect(0, 0, width, height);

    const pad = { top: 28, right: 24, bottom: 42, left: 46 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const groups = [
      { label: "ARIMA", rmse: metricsByModel.arima.rmse, mape: metricsByModel.arima.mape },
      { label: "Prophet", rmse: metricsByModel.prophet.rmse, mape: metricsByModel.prophet.mape },
      { label: "LSTM", rmse: metricsByModel.lstm.rmse, mape: metricsByModel.lstm.mape }
    ];

    const maxVal = Math.max(
      10,
      ...groups.flatMap((g) => [g.rmse, g.mape])
    ) * 1.18;

    // Grid
    ctx.strokeStyle = "#e2e8f0";
    ctx.fillStyle = "#64748b";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    for (let s = 0; s <= 4; s++) {
      const val = (maxVal * s) / 4;
      const y = pad.top + plotH - (val / maxVal) * plotH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.fillText(val.toFixed(1), pad.left - 8, y + 4);
    }

    const groupW = plotW / groups.length;
    const barW = Math.min(44, groupW * 0.26);

    groups.forEach((g, idx) => {
      const cx = pad.left + groupW * idx + groupW / 2;

      // RMSE bar
      const rmseH = (g.rmse / maxVal) * plotH;
      const rmseX = cx - barW - 5;
      const rmseY = pad.top + plotH - rmseH;
      ctx.fillStyle = "#2563eb";
      ctx.fillRect(rmseX, rmseY, barW, rmseH);

      ctx.fillStyle = "#1e293b";
      ctx.textAlign = "center";
      ctx.font = "bold 11px -apple-system, sans-serif";
      ctx.fillText(g.rmse.toFixed(2), rmseX + barW / 2, rmseY - 6);

      // MAPE bar
      const mapeH = (g.mape / maxVal) * plotH;
      const mapeX = cx + 5;
      const mapeY = pad.top + plotH - mapeH;
      ctx.fillStyle = "#10b981";
      ctx.fillRect(mapeX, mapeY, barW, mapeH);

      ctx.fillStyle = "#1e293b";
      ctx.fillText(`${g.mape.toFixed(1)}%`, mapeX + barW / 2, mapeY - 6);

      // Group label
      ctx.fillStyle = "#334155";
      ctx.font = "bold 12px -apple-system, sans-serif";
      ctx.fillText(g.label, cx, height - 14);
    });

    // Legend top-right
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(width - 148, 8, 10, 10);
    ctx.fillStyle = "#334155";
    ctx.fillText("RMSE", width - 134, 17);

    ctx.fillStyle = "#10b981";
    ctx.fillRect(width - 82, 8, 10, 10);
    ctx.fillStyle = "#334155";
    ctx.fillText("MAPE (%)", width - 68, 17);
  }

  function drawEdaChart(canvas, bars) {
    const { ctx, width, height } = setupCanvas(canvas, 270);
    ctx.clearRect(0, 0, width, height);

    const pad = { top: 26, right: 20, bottom: 42, left: 46 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const maxVal = Math.max(5, ...bars.map((b) => b.value)) * 1.2;

    ctx.strokeStyle = "#e2e8f0";
    ctx.fillStyle = "#64748b";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "right";
    for (let s = 0; s <= 4; s++) {
      const val = (maxVal * s) / 4;
      const y = pad.top + plotH - (val / maxVal) * plotH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.fillText(val.toFixed(1), pad.left - 8, y + 4);
    }

    const slotW = plotW / bars.length;
    const barW = Math.min(68, slotW * 0.48);

    bars.forEach((b, i) => {
      const x = pad.left + slotW * i + (slotW - barW) / 2;
      const barH = (b.value / maxVal) * plotH;
      const y = pad.top + plotH - barH;

      ctx.fillStyle = b.color || "#2563eb";
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, [6, 6, 0, 0]);
      ctx.fill();

      ctx.fillStyle = "#0f172a";
      ctx.textAlign = "center";
      ctx.font = "bold 12px -apple-system, sans-serif";
      ctx.fillText(`${b.value.toFixed(1)} u/day`, x + barW / 2, y - 7);

      ctx.fillStyle = "#475569";
      ctx.font = "12px -apple-system, sans-serif";
      ctx.fillText(b.label, x + barW / 2, height - 14);
    });
  }

  return {
    drawForecastChart,
    drawComparisonChart,
    drawEdaChart
  };
})();
