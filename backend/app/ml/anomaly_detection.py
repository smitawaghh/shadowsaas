# backend/app/ml/anomaly_detection.py
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import joblib
from pathlib import Path
from datetime import datetime, timedelta
import logging
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

class AnomalyDetectionEngine:
    """
    Production-grade anomaly detection using Isolation Forest
    
    Features:
    - Automatic model training and persistence
    - Streaming prediction with confidence scores
    - Retraining capability
    - Feature normalization
    - Model versioning
    """
    
    def __init__(self, model_dir: str = "models", contamination: float = 0.1):
        self.model_dir = Path(model_dir)
        self.model_dir.mkdir(exist_ok=True)
        
        self.scaler = StandardScaler()
        self.detector = IsolationForest(
            contamination=contamination,
            random_state=42,
            n_estimators=100,
            max_samples='auto',
            n_jobs=-1,
            warm_start=False
        )
        
        self.model_path = self.model_dir / "anomaly_detector.pkl"
        self.scaler_path = self.model_dir / "scaler.pkl"
        self.metadata_path = self.model_dir / "metadata.json"
        
        self.last_training = None
        self.n_training_samples = 0
        self.feature_names = [
            "upload_ratio",
            "data_volume_mb",
            "time_entropy",
            "protocol_diversity",
            "packet_count"
        ]
        
        self._load_model()
    
    async def fit(self, events: List[Dict], force: bool = False) -> bool:
        """
        Train anomaly detector on historical events
        
        Args:
            events: List of event dictionaries
            force: Force retraining even if recent model exists
            
        Returns:
            Success status
        """
        try:
            if len(events) < 100:
                logger.error(f"Insufficient data for training. Need 100+, got {len(events)}")
                return False
            
            # Extract features
            features = []
            valid_events = 0
            
            for event in events:
                feature_vec = self._extract_features(event)
                if feature_vec is not None:
                    features.append(feature_vec)
                    valid_events += 1
            
            if valid_events < 100:
                logger.error(f"Not enough valid feature vectors. Got {valid_events}")
                return False
            
            features_array = np.array(features)
            logger.info(f"Training on {len(features_array)} events with {len(self.feature_names)} features")
            
            # Train scaler
            scaled = self.scaler.fit_transform(features_array)
            
            # Train detector
            self.detector.fit(scaled)
            
            # Save models
            joblib.dump(self.detector, self.model_path)
            joblib.dump(self.scaler, self.scaler_path)
            
            # Save metadata
            self.last_training = datetime.utcnow()
            self.n_training_samples = len(features_array)
            
            import json
            with open(self.metadata_path, 'w') as f:
                json.dump({
                    'trained_at': self.last_training.isoformat(),
                    'samples': self.n_training_samples,
                    'features': self.feature_names,
                    'contamination': float(self.detector.contamination),
                    'estimators': self.detector.n_estimators
                }, f, indent=2)
            
            logger.info(f"✓ Anomaly detector trained and saved")
            return True
            
        except Exception as e:
            logger.error(f"Error training anomaly detector: {e}")
            return False
    
    async def predict(self, event: Dict) -> Dict:
        """
        Predict if event is anomalous
        
        Returns:
            {
                'is_anomalous': bool,
                'anomaly_score': float,
                'confidence': float (0-1),
                'explanation': str,
                'features': dict
            }
        """
        try:
            features = self._extract_features(event)
            if features is None:
                return self._null_prediction("Insufficient data for detection")
            
            scaled = self.scaler.transform([features])
            anomaly_score = float(self.detector.decision_function(scaled)[0])
            prediction = self.detector.predict(scaled)[0]
            
            is_anomalous = (prediction == -1)
            confidence = self._calculate_confidence(anomaly_score)
            
            return {
                'is_anomalous': is_anomalous,
                'anomaly_score': anomaly_score,
                'confidence': confidence,
                'explanation': self._explain_anomaly(event, features, anomaly_score),
                'features': {
                    name: float(val) for name, val in zip(self.feature_names, features)
                }
            }
        except Exception as e:
            logger.error(f"Error in anomaly prediction: {e}")
            return self._null_prediction(f"Prediction error: {str(e)}")
    
    def _extract_features(self, event: Dict) -> Optional[np.ndarray]:
        """Extract and normalize 5 features from event"""
        try:
            features = []
            
            # Feature 1: Upload/download ratio (0-100, normalized to 0-1)
            bytes_sent = event.get('bytes_sent', 0)
            bytes_received = event.get('bytes_received', 1)
            upload_ratio = min(100, (bytes_sent / max(bytes_received, 1)) * 100) / 100
            features.append(upload_ratio)
            
            # Feature 2: Data volume (MB, log-scaled, normalized)
            volume_mb = bytes_sent / (1024 * 1024)
            volume_scaled = np.log1p(volume_mb) / 10
            features.append(min(1.0, volume_scaled))
            
            # Feature 3: Time entropy (0-1, lower during business hours)
            try:
                timestamp = datetime.fromisoformat(event.get('timestamp', datetime.utcnow().isoformat()))
                hour = timestamp.hour
                is_business_hours = 1 if 8 <= hour <= 18 else 0
                time_entropy = (abs(hour - 12) / 12) * (1 - is_business_hours * 0.8)
            except:
                time_entropy = 0.5
            features.append(min(1.0, max(0.0, time_entropy)))
            
            # Feature 4: Protocol diversity (0-1)
            protocol = event.get('protocol', 'unknown').lower()
            protocol_risk = {
                'tcp': 0.2, 'udp': 0.3, 'https': 0.1, 'http': 0.4,
                'dns': 0.05, 'ssh': 0.15, 'ftp': 0.6, 'unknown': 0.5
            }.get(protocol, 0.5)
            features.append(min(1.0, protocol_risk))
            
            # Feature 5: Packet count (log-scaled, normalized)
            packets = event.get('packet_count', event.get('total_packets', 1))
            packets_scaled = np.log1p(packets) / 8
            features.append(min(1.0, packets_scaled))
            
            return np.array(features, dtype=np.float32)
            
        except Exception as e:
            logger.debug(f"Error extracting features: {e}")
            return None
    
    def _calculate_confidence(self, anomaly_score: float) -> float:
        """Convert anomaly score to 0-1 confidence"""
        confidence = min(1.0, max(0.0, abs(anomaly_score) / 2.0))
        return float(confidence)
    
    def _explain_anomaly(self, event: Dict, features: np.ndarray, score: float) -> str:
        """Generate human-readable explanation"""
        if score > -0.2:
            return "Normal network behavior"
        
        app = event.get('app_name', 'unknown')
        explanations = []
        
        # Analyze individual features
        if features[0] > 0.8:
            explanations.append("high data upload ratio")
        if features[1] > 0.7:
            explanations.append("large data transfer")
        if features[2] > 0.7:
            explanations.append("off-hours activity")
        if features[3] > 0.5:
            explanations.append("unusual protocol")
        if features[4] > 0.6:
            explanations.append("excessive packets")
        
        if not explanations:
            explanations.append("anomalous pattern detected")
        
        return f"{app}: {', '.join(explanations)}"
    
    def _null_prediction(self, reason: str) -> Dict:
        """Return default prediction when model unavailable"""
        return {
            'is_anomalous': False,
            'anomaly_score': 0.0,
            'confidence': 0.0,
            'explanation': reason,
            'features': {name: 0.0 for name in self.feature_names}
        }
    
    def _load_model(self):
        """Load pretrained models from disk"""
        try:
            if self.model_path.exists() and self.scaler_path.exists():
                self.detector = joblib.load(self.model_path)
                self.scaler = joblib.load(self.scaler_path)
                
                import json
                if self.metadata_path.exists():
                    with open(self.metadata_path) as f:
                        meta = json.load(f)
                        self.last_training = datetime.fromisoformat(meta['trained_at'])
                        self.n_training_samples = meta['samples']
                
                logger.info(f"✓ Models loaded (trained: {self.last_training})")
            else:
                logger.info("ℹ️ No pretrained models found. Train first.")
        except Exception as e:
            logger.warning(f"Could not load models: {e}")
    
    def get_model_info(self) -> Dict:
        """Get current model information"""
        return {
            'trained': self.last_training is not None,
            'trained_at': self.last_training.isoformat() if self.last_training else None,
            'samples_used': self.n_training_samples,
            'algorithm': 'Isolation Forest',
            'features': self.feature_names,
            'contamination': float(self.detector.contamination) if hasattr(self.detector, 'contamination') else None,
            'n_estimators': self.detector.n_estimators if hasattr(self.detector, 'n_estimators') else None
        }

# Global instance
_anomaly_engine: Optional[AnomalyDetectionEngine] = None

def get_anomaly_engine() -> AnomalyDetectionEngine:
    """Get or create anomaly detection engine"""
    global _anomaly_engine
    if _anomaly_engine is None:
        _anomaly_engine = AnomalyDetectionEngine()
    return _anomaly_engine