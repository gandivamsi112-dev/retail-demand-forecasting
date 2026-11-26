"""Optional Streamlit dashboard matching Module 10 of the project specification."""

import matplotlib.pyplot as plt
import pandas as pd
import streamlit as st

st.set_page_config(page_title="Retail Demand Forecasting System", layout="wide")
st.title("Retail Demand Forecasting System")
st.subheader("Product Demand Prediction & Inventory Optimization")

df = pd.read_csv("dataset/retail_sales.csv")
product = st.selectbox("Select Product", df["Product_Name"].unique())
product_data = df[df["Product_Name"] == product].sort_values("Date")

col1, col2, col3 = st.columns(3)
col1.metric("Total Historical Units", int(product_data["Units_Sold"].sum()))
col2.metric("Average Daily Sales", f"{product_data['Units_Sold'].mean():.1f}")
col3.metric("Current Stock", int(product_data["Inventory_Level"].iloc[-1]))

st.write("Historical Sales Data")
st.dataframe(product_data, use_container_width=True)

st.subheader("Sales Trend")
fig, ax = plt.subplots(figsize=(10, 4))
ax.plot(pd.to_datetime(product_data["Date"]), product_data["Units_Sold"], marker="o", linewidth=1.8)
ax.set_xlabel("Date")
ax.set_ylabel("Units Sold")
ax.set_title(f"{product} — Daily Units Sold")
st.pyplot(fig)

st.success("Demand forecasting dashboard loaded successfully")
