import os
import joblib
import pandas as pd
import numpy as np

MODEL_PATH = os.path.join(os.path.dirname(__file__), "isolation_forest.joblib")

class AnomalyDetector:
    def __init__(self):
        self.model = None
        self.load_model()
    
    def load_model(self):
        if os.path.exists(MODEL_PATH):
            self.model = joblib.load(MODEL_PATH)
            print("ML Model loaded successfully.")
        else:
            print(f"Warning: ML Model not found at {MODEL_PATH}. Run train.py first.")
    
    def predict(self, upload_download_ratio: float, packet_size_variance: float, inter_arrival_time: float):
        """
        Returns (is_anomalous: bool, risk_score: float)
        """
        features = np.array([[upload_download_ratio, packet_size_variance, inter_arrival_time]])
        
        if self.model is None:
            # Fallback heuristic if model is not trained yet
            is_anom = upload_download_ratio > 50 or packet_size_variance > 800
            score = 85.0 if is_anom else 15.0
            return is_anom, score
            
        # Isolation Forest prediction: -1 is anomalous, 1 is normal
        pred = self.model.predict(features)[0]
        is_anomalous = bool(pred == -1)
        
        # decision_function gives anomaly score. Lower is more anomalous (negative)
        decision_score = self.model.decision_function(features)[0]
        
        # Map decision score (-0.5 to 0.5) to a 0-100 risk score
        risk_score = 50 - (decision_score * 100)
        risk_score = max(0.0, min(100.0, float(risk_score)))
        
        return is_anomalous, risk_score

# Global instance
detector = AnomalyDetector()
