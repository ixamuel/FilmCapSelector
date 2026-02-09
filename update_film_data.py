import pandas as pd
import json
import os
import re

# Configuration
EXCEL_PATH = 'Film All Data PQ.xlsx'
OUTPUT_JS_PATH = 'film_data.js'
HEADER_ROW = 0  # Headers are on the first row in the sample I saw
DATA_START_ROW = 1 

def clean_value(val):
    if pd.isna(val):
        return None
    if isinstance(val, (int, float)):
        if int(val) == val:
            return int(val)
        return float(val)
    return str(val).strip()

def process_data():
    print(f"Reading {EXCEL_PATH}...")
    # Load data from Excel
    df = pd.read_excel(EXCEL_PATH)
    
    # Standardize column names based on the sample we extracted
    headers = df.columns.tolist()
    
    # helper for dimension parsing (handles "31,5" -> 31.5 and "315" -> 31.5)
    def clean_numeric(val, scale=False):
        if pd.isna(val) or val == "" or val == "-": return None
        if isinstance(val, (int, float)): 
            # Typos: 315mm instead of 31.5mm - ONLY if it's a dimension column
            if scale and val > 100:
                return val / 10
            return val
        if isinstance(val, str):
            # Replace comma with dot and remove non-numeric chars except dot/minus
            v = val.replace(',', '.')
            v = "".join(c for c in v if c.isdigit() or c in '.-')
            try:
                num = float(v)
                if scale and num > 100:
                    return num / 10
                return num
            except:
                return val # Return original string if conversion fails
        return val

    # Forward fill columns that typically have merged cells in these Panasonics Excels
    cols_to_ffill = [
        "Type", "Rated \nVoltage (V)", "Voltage type", "Capacitance\n(uF)", 
        "C Tol.\n(%)", "Body length / dia\n(mm)", "Body width\n(mm)", "Height\n(mm)",
        "Lead Space P1\n(mm)", "Category Temperature Range \n(°C)", "Dielectric Material"
    ]
    for col in cols_to_ffill:
        if col in df.columns:
            df[col] = df[col].ffill()
            
    # Apply cleaning to all numeric/dimension columns
    columns_to_clean = ["Rated \nVoltage (V)", "Capacitance\n(uF)", "Body length / dia\n(mm)", 
                        "Body width\n(mm)", "Height\n(mm)", "Lead Space P1\n(mm)", "ESR (mΩ)"]
    for col in columns_to_clean:
        if col in df.columns:
            # ONLY scale dimensions (columns containing "mm")
            should_scale = "(mm)" in col
            df[col] = df[col].apply(lambda x: clean_numeric(x, scale=should_scale))

    print(f"Mapped {len(headers)} columns.")
    
    packed_rows = []
    print(f"Processing {len(df)} rows...")
    
    # Finding PartNumber index (based on sample)
    pn_col = "PartNumber"
    if pn_col not in headers:
        # Try to find something similar
        for h in headers:
            if "PartNumber" in str(h) or "Part Number" in str(h):
                pn_col = h
                break

    for _, row in df.iterrows():
        # Only process if Part Number is not empty
        if pd.isna(row[pn_col]):
            continue
            
        packed_row = [clean_value(val) for val in row]
        packed_rows.append(packed_row)

    packed_data = {
        "h": headers,
        "d": packed_rows
    }
    
    print(f"Generating {OUTPUT_JS_PATH} with {len(headers)} columns...")
    # Use json.dumps with separators to keep it compact but readable for debugging if needed
    js_content = f"const packedData = {json.dumps(packed_data, separators=(',', ':'), ensure_ascii=False)};"
    
    with open(OUTPUT_JS_PATH, 'w', encoding='utf-8') as f:
        f.write(js_content)
        
    print(f"Done! Processed {len(packed_rows)} records.")

if __name__ == "__main__":
    process_data()
