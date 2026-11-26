"""Live Python web server and JSON REST API for Retail Demand Forecasting."""

import json
import mimetypes
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict
from urllib.parse import parse_qs, urlparse

from src.forecasting_engine import (
    compute_inventory,
    compute_store_overview,
    ensure_dataset_csv,
    evaluate_product,
    generate_default_records,
    list_products,
    load_records_csv,
    parse_csv_text,
    save_records_csv,
)

BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR / "dataset" / "retail_sales.csv"

# Ensure dataset exists on startup
ensure_dataset_csv(DATASET_PATH)


class RetailRequestHandler(BaseHTTPRequestHandler):
    """Serve static frontend assets and live JSON API endpoints."""

    def _send_json(self, payload: Any, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> Dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path == "/api/health":
            records = load_records_csv(DATASET_PATH)
            self._send_json({"ok": True, "records": len(records), "backend": "Python 3 REST API"})
            return

        if path == "/api/products":
            records = load_records_csv(DATASET_PATH)
            self._send_json({"products": list_products(records), "rowCount": len(records)})
            return

        if path == "/api/forecast":
            try:
                records = load_records_csv(DATASET_PATH)
                products = list_products(records)
                product_name = qs.get("product", [products[0]["name"]])[0]
                model_mode = qs.get("model", ["prophet"])[0]
                horizon = max(1, min(60, int(qs.get("horizon", ["7"])[0])))
                safety_stock = max(0, int(qs.get("safety", ["10"])[0]))
                promo = qs.get("promo", ["0"])[0] == "1"
                holiday = qs.get("holiday", ["0"])[0] == "1"
                discount = max(0, min(50, int(qs.get("discount", ["5"])[0])))

                prod_meta = next((p for p in products if p["name"] == product_name), products[0])
                current_stock = int(qs.get("stock", [str(prod_meta["currentStock"])])[0])

                scenario = {"promotion": promo, "holiday": holiday, "discount": discount}
                eval_res = evaluate_product(records, product_name, horizon, scenario)

                chosen_key = model_mode
                if chosen_key == "all":
                    chosen_key = min(
                        ["prophet", "lstm", "arima"],
                        key=lambda k: eval_res[k]["metrics"]["rmse"],
                    )

                forecast_sum = sum(f["yhat"] for f in eval_res[chosen_key]["future"])
                inventory = compute_inventory(current_stock, forecast_sum, safety_stock)
                overview = compute_store_overview(
                    records,
                    horizon,
                    safety_stock,
                    scenario,
                    model_mode,
                    override_product=product_name,
                    override_stock=current_stock,
                )

                self._send_json(
                    {
                        "product": product_name,
                        "activeModel": chosen_key,
                        "modelMode": model_mode,
                        "horizon": horizon,
                        "inventory": inventory,
                        "overview": overview,
                        **eval_res,
                    }
                )
            except Exception as exc:
                self._send_json({"error": str(exc)}, status=400)
            return

        if path == "/api/export":
            csv_bytes = DATASET_PATH.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="retail_sales.csv"')
            self.send_header("Content-Length", str(len(csv_bytes)))
            self.end_headers()
            self.wfile.write(csv_bytes)
            return

        # Serve static frontend files
        rel_path = "index.html" if path == "/" else path.lstrip("/")
        target = (BASE_DIR / rel_path).resolve()
        if not str(target).startswith(str(BASE_DIR)) or not target.is_file():
            self.send_error(404, "Not Found")
            return

        mime, _ = mimetypes.guess_type(str(target))
        content = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", f"{mime or 'application/octet-stream'}; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/sales":
            try:
                body = self._read_json_body()
                records = load_records_csv(DATASET_PATH)
                products = list_products(records)
                prod_name = str(body.get("product_name", "")).strip()
                prod_meta = next((p for p in products if p["name"] == prod_name), None)
                if not prod_meta:
                    raise ValueError(f"Unknown product: {prod_name}")

                sale_date = str(body.get("date", "")).strip()
                units_sold = max(0, int(body.get("units_sold", 0)))
                discount = max(0, min(80, int(body.get("discount", 0))))
                promotion = 1 if body.get("promotion") else 0
                holiday = 1 if body.get("holiday") else 0
                stock_level = max(0, int(body.get("inventory_level", prod_meta["currentStock"])))

                # Update inventory level on existing rows for this product too
                for r in records:
                    if r["Product_Name"] == prod_name:
                        r["Inventory_Level"] = stock_level

                new_row = {
                    "Date": sale_date,
                    "Product_ID": prod_meta["id"],
                    "Product_Name": prod_name,
                    "Store_ID": "S01",
                    "Units_Sold": units_sold,
                    "Price": round(prod_meta["price"] * (1 - discount / 100.0)),
                    "Discount": discount,
                    "Promotion": promotion,
                    "Holiday": holiday,
                    "Inventory_Level": stock_level,
                    "Category": prod_meta["category"],
                }

                # Replace if same date & product exists, else append
                replaced = False
                for idx, r in enumerate(records):
                    if r["Date"] == sale_date and r["Product_Name"] == prod_name:
                        records[idx] = new_row
                        replaced = True
                        break
                if not replaced:
                    records.append(new_row)

                records.sort(key=lambda x: (x["Date"], x["Product_ID"]))
                save_records_csv(DATASET_PATH, records)
                self._send_json({"ok": True, "rowCount": len(records), "saved": new_row})
            except Exception as exc:
                self._send_json({"error": str(exc)}, status=400)
            return

        if path == "/api/upload":
            try:
                body = self._read_json_body()
                csv_text = str(body.get("csv", ""))
                parsed_rows = parse_csv_text(csv_text)
                save_records_csv(DATASET_PATH, parsed_rows)
                self._send_json({"ok": True, "rowCount": len(parsed_rows)})
            except Exception as exc:
                self._send_json({"error": str(exc)}, status=400)
            return

        if path == "/api/reset":
            records = generate_default_records()
            save_records_csv(DATASET_PATH, records)
            self._send_json({"ok": True, "rowCount": len(records)})
            return

        self.send_error(404, "Endpoint not found")


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


def _parse_port() -> int:
    if "--port" in sys.argv:
        idx = sys.argv.index("--port")
        if idx + 1 < len(sys.argv):
            return int(sys.argv[idx + 1])
    return int(os.environ.get("PORT", "8765"))


def main() -> None:
    host = "127.0.0.1"
    start_port = _parse_port()
    server = None
    chosen_port = start_port

    for candidate in range(start_port, start_port + 20):
        try:
            server = ReusableThreadingHTTPServer((host, candidate), RetailRequestHandler)
            chosen_port = candidate
            break
        except OSError:
            if candidate == start_port:
                print(
                    f"Port {start_port} is already in use (another server instance may already be running at http://{host}:{start_port}/). Trying next available port...",
                    flush=True,
                )

    if server is None:
        raise RuntimeError(f"Could not bind any port in range {start_port}-{start_port + 19}.")

    print(f"Retail Demand Forecasting live server running at http://{host}:{chosen_port}/", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
