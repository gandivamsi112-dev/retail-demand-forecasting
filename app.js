// Main application controller for Retail Demand Forecasting (Live Python REST API + offline fallback)

(function () {
  const DATA = window.RETAIL_DATA;
  const ENGINE = window.FORECAST_ENGINE;
  const CHARTS = window.RETAIL_CHARTS;

  let activeRecords = [...DATA.DEFAULT_RECORDS];
  let productsList = [];
  let usingLiveApi = false;
  let edaMode = "weekday";
  let lastEvalState = null;

  // DOM Elements
  const backendStatusPill = document.getElementById("backendStatusPill");
  const productSelect = document.getElementById("productSelect");
  const modelSelect = document.getElementById("modelSelect");
  const horizonSelect = document.getElementById("horizonSelect");
  const currentStockInput = document.getElementById("currentStockInput");
  const safetyStockInput = document.getElementById("safetyStockInput");
  const promoToggle = document.getElementById("promoToggle");
  const holidayToggle = document.getElementById("holidayToggle");
  const discountRange = document.getElementById("discountRange");
  const discountVal = document.getElementById("discountVal");

  const kpiHorizonLabel = document.getElementById("kpiHorizonLabel");
  const kpiPredictedDemand = document.getElementById("kpiPredictedDemand");
  const kpiAvgDaily = document.getElementById("kpiAvgDaily");
  const kpiRmse = document.getElementById("kpiRmse");
  const kpiMape = document.getElementById("kpiMape");
  const kpiInventoryCard = document.getElementById("kpiInventoryCard");
  const kpiReorderAction = document.getElementById("kpiReorderAction");
  const kpiStockFormula = document.getElementById("kpiStockFormula");

  const forecastCanvas = document.getElementById("forecastChart");
  const chartTooltip = document.getElementById("chartTooltip");
  const mainChartLegend = document.getElementById("mainChartLegend");
  const mainChartTitle = document.getElementById("mainChartTitle");
  const inventoryFormulaBox = document.getElementById("inventoryFormulaBox");
  const forecastTableBody = document.querySelector("#forecastTable tbody");
  const inventoryOverviewBody = document.querySelector("#inventoryOverviewTable tbody");

  const edaCanvas = document.getElementById("edaChart");
  const edaProductName = document.getElementById("edaProductName");
  const edaInsightBox = document.getElementById("edaInsightBox");
  const featureTableBody = document.querySelector("#featureTable tbody");
  const comparisonCanvas = document.getElementById("comparisonChart");

  const csvStatusBanner = document.getElementById("csvStatusBanner");
  const csvUploadInput = document.getElementById("csvUploadInput");
  const downloadCsvBtn = document.getElementById("downloadCsvBtn");
  const resetDatasetBtn = document.getElementById("resetDatasetBtn");

  const recordSaleForm = document.getElementById("recordSaleForm");
  const saleDateInput = document.getElementById("saleDateInput");
  const saleUnitsInput = document.getElementById("saleUnitsInput");
  const saleDiscountInput = document.getElementById("saleDiscountInput");
  const saleStockInput = document.getElementById("saleStockInput");
  const salePromoInput = document.getElementById("salePromoInput");
  const saleHolidayInput = document.getElementById("saleHolidayInput");

  function showBanner(msg, isError = false) {
    csvStatusBanner.hidden = false;
    csvStatusBanner.classList.toggle("error", isError);
    csvStatusBanner.textContent = msg;
  }

  function getOfflineProducts() {
    const map = new Map();
    activeRecords.forEach((r) => {
      map.set(r.Product_Name, {
        id: r.Product_ID,
        name: r.Product_Name,
        category: r.Category,
        price: r.Price,
        currentStock: r.Inventory_Level
      });
    });
    return Array.from(map.values());
  }

  async function detectBackendAndLoadProducts(preserveSelection) {
    if (window.location.protocol.startsWith("http")) {
      try {
        const res = await fetch("/api/products");
        if (res.ok) {
          const payload = await res.json();
          usingLiveApi = true;
          productsList = payload.products;
          backendStatusPill.textContent = "Python API Live";
          backendStatusPill.classList.add("live");
          populateProductDropdown(preserveSelection);
          return;
        }
      } catch {
        // Fall back to client-side engine
      }
    }
    usingLiveApi = false;
    productsList = getOfflineProducts();
    backendStatusPill.textContent = "Browser Mode";
    backendStatusPill.classList.remove("live");
    populateProductDropdown(preserveSelection);
  }

  function populateProductDropdown(preserveSelection) {
    const prev = preserveSelection ? productSelect.value : null;
    productSelect.innerHTML = "";
    productsList.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = `${p.name} (${p.category})`;
      productSelect.appendChild(opt);
    });
    if (prev && productsList.some((p) => p.name === prev)) {
      productSelect.value = prev;
    }
    syncStockInputWithSelectedProduct();
  }

  function syncStockInputWithSelectedProduct() {
    const prod = productsList.find((p) => p.name === productSelect.value);
    if (prod) {
      currentStockInput.value = prod.currentStock;
      saleStockInput.value = Math.max(0, prod.currentStock - Number(saleUnitsInput.value || 0));
    }
  }

  function renderLegend(modelMode) {
    const items = [
      { label: "Actual Sales", color: "#0f172a" },
      { label: "Holiday Peak", color: "#dc2626" },
      { label: "Promotion", color: "#f59e0b" }
    ];
    if (modelMode === "all" || modelMode === "arima") items.push({ label: "ARIMA", color: "#64748b" });
    if (modelMode === "all" || modelMode === "prophet") items.push({ label: "Prophet", color: "#2563eb" });
    if (modelMode === "all" || modelMode === "lstm") items.push({ label: "LSTM", color: "#7c3aed" });

    mainChartLegend.innerHTML = items
      .map(
        (it) =>
          `<span class="legend-item"><span class="legend-swatch" style="background:${it.color}"></span>${it.label}</span>`
      )
      .join("");
  }

  async function updateDashboard() {
    const productName = productSelect.value;
    if (!productName) return;

    const modelMode = modelSelect.value;
    const horizon = Number(horizonSelect.value);
    const currentStock = Math.max(0, Number(currentStockInput.value) || 0);
    const safetyStock = Math.max(0, Number(safetyStockInput.value) || 0);
    const scenario = {
      promotion: promoToggle.checked,
      holiday: holidayToggle.checked,
      discount: Number(discountRange.value)
    };

    let evalRes;
    let activeKey;
    let inv;
    let overview;

    if (usingLiveApi) {
      const qs = new URLSearchParams({
        product: productName,
        model: modelMode,
        horizon: String(horizon),
        stock: String(currentStock),
        safety: String(safetyStock),
        promo: scenario.promotion ? "1" : "0",
        holiday: scenario.holiday ? "1" : "0",
        discount: String(scenario.discount)
      });
      const res = await fetch(`/api/forecast?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        showBanner(data.error || "Forecast API failed.", true);
        return;
      }
      evalRes = data;
      activeKey = data.activeModel;
      inv = data.inventory;
      overview = data.overview;
    } else {
      evalRes = ENGINE.evaluateProduct(activeRecords, productName, horizon, scenario);
      activeKey = modelMode;
      if (modelMode === "all") {
        activeKey = [
          { k: "prophet", rmse: evalRes.prophet.metrics.rmse },
          { k: "lstm", rmse: evalRes.lstm.metrics.rmse },
          { k: "arima", rmse: evalRes.arima.metrics.rmse }
        ].sort((a, b) => a.rmse - b.rmse)[0].k;
      }
      const forecastSum = evalRes[activeKey].future.reduce((sum, f) => sum + f.yhat, 0);
      inv = ENGINE.computeInventory(currentStock, forecastSum, safetyStock);
      overview = productsList.map((p) => {
        const res = ENGINE.evaluateProduct(activeRecords, p.name, horizon, scenario);
        const fSum = res[activeKey].future.reduce((s, f) => s + f.yhat, 0);
        const stockVal = p.name === productName ? currentStock : p.currentStock;
        return {
          id: p.id,
          name: p.name,
          category: p.category,
          price: p.price,
          ...ENGINE.computeInventory(stockVal, fSum, safetyStock)
        };
      });
    }

    lastEvalState = { ...evalRes, modelMode };
    const activeModel = evalRes[activeKey];
    const totalForecast = activeModel.future.reduce((sum, f) => sum + f.yhat, 0);
    const avgDaily = totalForecast / horizon;

    // KPI Cards
    kpiHorizonLabel.textContent = `Predicted Demand (${horizon} Days · ${activeKey.toUpperCase()})`;
    kpiPredictedDemand.textContent = `${Math.round(totalForecast)} units`;
    kpiAvgDaily.textContent = `${avgDaily.toFixed(1)} units/day average`;
    kpiRmse.textContent = activeModel.metrics.rmse.toFixed(2);
    kpiMape.textContent = `${activeModel.metrics.mape.toFixed(2)}%`;

    kpiReorderAction.textContent = inv.status;
    kpiStockFormula.textContent = `Required ${inv.requiredStock} (${inv.forecastDemand} + ${inv.safetyStock} safety) vs ${inv.currentStock} in stock`;
    kpiInventoryCard.classList.remove("status-order", "status-ok");
    kpiInventoryCard.classList.add(inv.needsReorder ? "status-order" : "status-ok");

    inventoryFormulaBox.innerHTML = `
      <strong>Inventory Formula (Module 9):</strong><br/>
      Required Stock = <code>${inv.forecastDemand}</code> (Forecast) + <code>${inv.safetyStock}</code> (Safety) = <strong>${inv.requiredStock}</strong><br/>
      Reorder Qty = <code>${inv.requiredStock}</code> &minus; <code>${inv.currentStock}</code> (Current) = <strong>${inv.reorderQty} units</strong>
    `;

    forecastTableBody.innerHTML = activeModel.future
      .map(
        (f) => `
      <tr>
        <td>${f.Date}</td>
        <td>${f.Day_Name}</td>
        <td><strong>${f.yhat}</strong></td>
        <td>${f.yhat_lower} &ndash; ${f.yhat_upper}</td>
      </tr>`
      )
      .join("");

    mainChartTitle.textContent = `${productName}: Historical Sales & ${horizon}-Day Demand Forecast`;
    renderLegend(modelMode);
    CHARTS.drawForecastChart(forecastCanvas, chartTooltip, lastEvalState);

    CHARTS.drawComparisonChart(comparisonCanvas, {
      arima: evalRes.arima.metrics,
      prophet: evalRes.prophet.metrics,
      lstm: evalRes.lstm.metrics
    });

    updateEdaSection(productName, evalRes.series);
    renderFeatureTable(evalRes.series);
    renderInventoryOverview(overview, productName);
  }

  function renderInventoryOverview(overviewRows, selectedName) {
    inventoryOverviewBody.innerHTML = "";
    overviewRows.forEach((row) => {
      const tr = document.createElement("tr");
      if (row.name === selectedName) tr.classList.add("active-row");
      tr.innerHTML = `
        <td><code>${row.id}</code></td>
        <td><strong>${row.name}</strong></td>
        <td>${row.category}</td>
        <td>${Number(row.price).toLocaleString()}</td>
        <td>${row.currentStock}</td>
        <td>${row.forecastDemand}</td>
        <td>${row.safetyStock}</td>
        <td><strong>${row.requiredStock}</strong></td>
        <td><span class="tag ${row.needsReorder ? "tag-order" : "tag-ok"}">${row.status}</span></td>
      `;
      tr.addEventListener("click", () => {
        productSelect.value = row.name;
        syncStockInputWithSelectedProduct();
        updateDashboard();
      });
      inventoryOverviewBody.appendChild(tr);
    });
  }

  function updateEdaSection(productName, series) {
    edaProductName.textContent = productName;

    function avgUnits(subset) {
      if (!subset.length) return 0;
      return subset.reduce((s, d) => s + d.Units_Sold, 0) / subset.length;
    }

    let bars = [];
    let insight = "";

    if (edaMode === "weekday") {
      const wkday = avgUnits(series.filter((d) => !d.Is_Weekend));
      const wkend = avgUnits(series.filter((d) => d.Is_Weekend));
      const lift = wkday > 0 ? (((wkend - wkday) / wkday) * 100).toFixed(1) : "0.0";
      bars = [
        { label: "Weekdays (Mon-Fri)", value: wkday, color: "#64748b" },
        { label: "Weekends (Sat-Sun)", value: wkend, color: "#2563eb" }
      ];
      insight = `Weekend sales for <strong>${productName}</strong> average <strong>${wkend.toFixed(1)} units/day</strong> vs <strong>${wkday.toFixed(1)}</strong> on weekdays (${lift}% lift).`;
    } else if (edaMode === "promo") {
      const noPromo = avgUnits(series.filter((d) => !d.Promotion));
      const promo = avgUnits(series.filter((d) => d.Promotion));
      const lift = noPromo > 0 ? (((promo - noPromo) / noPromo) * 100).toFixed(1) : "0.0";
      bars = [
        { label: "Regular Price Days", value: noPromo, color: "#64748b" },
        { label: "Promotion Active", value: promo, color: "#f59e0b" }
      ];
      insight = `Active promotions boost <strong>${productName}</strong> demand by <strong>${lift}%</strong> (${promo.toFixed(1)} vs ${noPromo.toFixed(1)} units/day).`;
    } else {
      const normal = avgUnits(series.filter((d) => !d.Is_Holiday));
      const hol = avgUnits(series.filter((d) => d.Is_Holiday));
      const lift = normal > 0 ? (((hol - normal) / normal) * 100).toFixed(1) : "0.0";
      bars = [
        { label: "Normal Days", value: normal, color: "#64748b" },
        { label: "Holidays / Festivals", value: hol, color: "#dc2626" }
      ];
      insight = `Holidays and festivals produce a <strong>${lift}%</strong> demand spike for <strong>${productName}</strong> (${hol.toFixed(1)} vs ${normal.toFixed(1)} units/day).`;
    }

    CHARTS.drawEdaChart(edaCanvas, bars);
    edaInsightBox.innerHTML = insight;
  }

  function renderFeatureTable(series) {
    const recent = series.slice(-10).reverse();
    featureTableBody.innerHTML = recent
      .map(
        (r) => `
      <tr>
        <td>${r.Date}</td>
        <td><strong>${r.Units_Sold}</strong></td>
        <td>${r.Is_Weekend}</td>
        <td>${r.Is_Holiday}</td>
        <td>${r.Promotion}</td>
        <td>${r.Lag_1 ?? "-"}</td>
        <td>${r.Lag_7 ?? "-"}</td>
        <td>${r.Rolling_Mean_7 ?? "-"}</td>
      </tr>`
      )
      .join("");
  }

  function populateStaticContent() {
    document.getElementById("schemaTableBody").innerHTML = DATA.DATASET_COLUMNS.map(
      ([col, desc]) => `<tr><td><code>${col}</code></td><td>${desc}</td></tr>`
    ).join("");

    document.getElementById("techTableBody").innerHTML = DATA.TECH_STACK.map(
      ([tech, purpose]) => `<tr><td><strong>${tech}</strong></td><td>${purpose}</td></tr>`
    ).join("");

    const vivaEl = document.getElementById("vivaAccordion");
    vivaEl.innerHTML = DATA.VIVA_QA.map(
      (item, idx) => `
      <div class="accordion-item">
        <button class="accordion-trigger" type="button" aria-expanded="${idx === 0 ? "true" : "false"}">
          <span>${item.q}</span>
          <span>${idx === 0 ? "−" : "+"}</span>
        </button>
        <div class="accordion-body" ${idx === 0 ? "" : "hidden"}>
          <p>${item.a}</p>
        </div>
      </div>`
    ).join("");

    vivaEl.querySelectorAll(".accordion-trigger").forEach((btn) => {
      btn.addEventListener("click", () => {
        const body = btn.nextElementSibling;
        const expanded = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!expanded));
        btn.lastElementChild.textContent = expanded ? "+" : "−";
        body.hidden = expanded;
      });
    });

    showCodeSnippet("preprocessing");
  }

  function showCodeSnippet(key) {
    document.getElementById("codeDisplay").textContent = DATA.CODE_SNIPPETS[key] || "";
  }

  function bindEvents() {
    productSelect.addEventListener("change", () => {
      syncStockInputWithSelectedProduct();
      updateDashboard();
    });

    [modelSelect, horizonSelect, currentStockInput, safetyStockInput, promoToggle, holidayToggle].forEach(
      (el) => el.addEventListener("change", updateDashboard)
    );

    discountRange.addEventListener("input", () => {
      discountVal.textContent = `${discountRange.value}%`;
      updateDashboard();
    });

    document.getElementById("edaModeButtons").addEventListener("click", (e) => {
      const btn = e.target.closest(".seg-btn");
      if (!btn) return;
      document.querySelectorAll("#edaModeButtons .seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      edaMode = btn.dataset.eda;
      if (lastEvalState) updateEdaSection(productSelect.value, lastEvalState.series);
    });

    document.querySelectorAll("[data-tab-group]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const group = btn.dataset.tabGroup;
        const tab = btn.dataset.tab;
        document.querySelectorAll(`[data-tab-group="${group}"]`).forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        document.querySelectorAll(`[data-panel-group="${group}"]`).forEach((p) => {
          p.classList.toggle("active", p.dataset.panel === tab);
        });
      });
    });

    document.getElementById("codeTabs").addEventListener("click", (e) => {
      const btn = e.target.closest(".tab-btn");
      if (!btn) return;
      document.querySelectorAll("#codeTabs .tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      showCodeSnippet(btn.dataset.code);
    });

    const copyBtn = document.getElementById("copyCodeBtn");
    copyBtn.addEventListener("click", async () => {
      const text = document.getElementById("codeDisplay").textContent;
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = "Copied!";
        setTimeout(() => (copyBtn.textContent = "Copy Code"), 1500);
      } catch {
        copyBtn.textContent = "Copy failed";
      }
    });

    downloadCsvBtn.addEventListener("click", () => {
      if (usingLiveApi) {
        window.location.href = "/api/export";
        return;
      }
      const csv = ENGINE.toCSV(activeRecords);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "retail_sales.csv";
      a.click();
      URL.revokeObjectURL(url);
    });

    csvUploadInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          if (usingLiveApi) {
            const res = await fetch("/api/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ csv: reader.result })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Upload failed");
            await detectBackendAndLoadProducts(false);
            await updateDashboard();
            showBanner(`Uploaded "${file.name}" (${data.rowCount} rows) to Python backend & re-trained models.`);
          } else {
            activeRecords = ENGINE.parseCSV(reader.result);
            productsList = getOfflineProducts();
            populateProductDropdown(false);
            await updateDashboard();
            showBanner(`Loaded ${activeRecords.length} rows from "${file.name}".`);
          }
        } catch (err) {
          showBanner(err.message, true);
        }
      };
      reader.readAsText(file);
    });

    resetDatasetBtn.addEventListener("click", async () => {
      if (usingLiveApi) {
        const res = await fetch("/api/reset", { method: "POST" });
        if (res.ok) {
          await detectBackendAndLoadProducts(false);
          await updateDashboard();
          showBanner("Dataset reset to default 90-day retail_sales.csv on Python backend.");
        }
      } else {
        activeRecords = [...DATA.DEFAULT_RECORDS];
        productsList = getOfflineProducts();
        populateProductDropdown(false);
        await updateDashboard();
        showBanner("Dataset reset to default 90-day records.");
      }
    });

    recordSaleForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const productName = productSelect.value;
      const saleDate = saleDateInput.value;
      const unitsSold = Number(saleUnitsInput.value);
      const discount = Number(saleDiscountInput.value) || 0;
      const stockLevel = Number(saleStockInput.value);
      const promotion = salePromoInput.checked;
      const holiday = saleHolidayInput.checked;

      try {
        if (usingLiveApi) {
          const res = await fetch("/api/sales", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              product_name: productName,
              date: saleDate,
              units_sold: unitsSold,
              discount,
              inventory_level: stockLevel,
              promotion,
              holiday
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to save sale");
          await detectBackendAndLoadProducts(true);
          currentStockInput.value = stockLevel;
          await updateDashboard();
          showBanner(`Saved ${unitsSold} units for ${productName} on ${saleDate} (total rows: ${data.rowCount}). Forecasts updated.`);
        } else {
          const prod = productsList.find((p) => p.name === productName);
          activeRecords.forEach((r) => {
            if (r.Product_Name === productName) r.Inventory_Level = stockLevel;
          });
          activeRecords.push({
            Date: saleDate,
            Product_ID: prod?.id || "P1",
            Product_Name: productName,
            Store_ID: "S01",
            Units_Sold: unitsSold,
            Price: Math.round((prod?.price || 1000) * (1 - discount / 100)),
            Discount: discount,
            Promotion: promotion ? 1 : 0,
            Holiday: holiday ? 1 : 0,
            Inventory_Level: stockLevel,
            Category: prod?.category || "Retail"
          });
          productsList = getOfflineProducts();
          currentStockInput.value = stockLevel;
          await updateDashboard();
          showBanner(`Added ${unitsSold} units for ${productName} on ${saleDate}.`);
        }
      } catch (err) {
        showBanner(err.message, true);
      }
    });

    const mobileMenuBtn = document.getElementById("mobileMenuBtn");
    const mobileNav = document.getElementById("mobileNav");
    mobileMenuBtn.addEventListener("click", () => {
      const isHidden = mobileNav.hidden;
      mobileNav.hidden = !isHidden;
      mobileMenuBtn.setAttribute("aria-expanded", String(isHidden));
    });
    mobileNav.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => {
        mobileNav.hidden = true;
        mobileMenuBtn.setAttribute("aria-expanded", "false");
      });
    });

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (lastEvalState) updateDashboard();
      }, 150);
    });
  }

  async function init() {
    populateStaticContent();
    await detectBackendAndLoadProducts(false);
    bindEvents();
    await updateDashboard();
  }

  init();
})();
