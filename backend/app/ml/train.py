import os
import joblib
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest

def generate_synthetic_data(n_samples=1000):
    # Normal traffic: low upload ratio, low variance
    normal_ratio = np.random.uniform(0.01, 0.5, int(n_samples * 0.9))
    normal_var = np.random.uniform(10.0, 50.0, int(n_samples * 0.9))
    normal_iat = np.random.uniform(0.01, 0.5, int(n_samples * 0.9))
    
    # Anomalous traffic (Shadow IT / Exfiltration): high upload ratio, high variance
    anom_ratio = np.random.uniform(5.0, 100.0, int(n_samples * 0.1))
    anom_var = np.random.uniform(500.0, 1500.0, int(n_samples * 0.1))
    anom_iat = np.random.uniform(0.01, 0.5, int(n_samples * 0.1))
    
    ratios = np.concatenate([normal_ratio, anom_ratio])
    variances = np.concatenate([normal_var, anom_var])
    iats = np.concatenate([normal_iat, anom_iat])
    
    df = pd.DataFrame({
        'upload_download_ratio': ratios,
        'packet_size_variance': variances,
        'inter_arrival_time': iats
    })
    return df

def train_model():
    print("Generating synthetic network data...")
    df = generate_synthetic_data(2000)
    
    print("Training Isolation Forest model...")
    # contamination=0.1 means we expect roughly 10% anomalies
    model = IsolationForest(contamination=0.1, random_state=42)
    model.fit(df)
    
    save_path = os.path.join(os.path.dirname(__file__), "isolation_forest.joblib")
    joblib.dump(model, save_path)
    print(f"Model saved successfully to {save_path}")

if __name__ == "__main__":
    train_model()
