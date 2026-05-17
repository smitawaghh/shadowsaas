# backend/app/ml/risk_scoring.py
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import numpy as np
import logging

logger = logging.getLogger(__name__)

class RiskScoringEngine:
    """
    Production-grade multi-factor risk scoring
    
    Combines:
    - Anomaly detection (35%)
    - Traffic patterns (25%)  
    - Application risk (25%)
    - User behavior (15%)
    """
    
    WEIGHTS = {
        'anomaly': 0.35,
        'traffic': 0.25,
        'app_risk': 0.25,
        'behavioral': 0.15
    }
    
    RISK_LEVELS = {
        'CRITICAL': (70, 100),
        'ELEVATED': (40, 70),
        'NORMAL': (0, 40)
    }
    
    def __init__(self, db=None):
        self.db = db
    
    async def calculate_risk(self, event: Dict, anomaly_score: Dict = None) -> Dict:
        """
        Calculate comprehensive risk score 0-100
        
        Args:
            event: Network event
            anomaly_score: Output from anomaly detection
            
        Returns:
            {
                'score': float (0-100),
                'level': str ('NORMAL' | 'ELEVATED' | 'CRITICAL'),
                'factors': {...},
                'reasons': [str],
                'metadata': {...}
            }
        """
        try:
            # Get individual risk factors
            anomaly = anomaly_score['anomaly_score'] if anomaly_score else 0
            anomaly_risk = min(100, abs(anomaly) * 100) if anomaly_score and anomaly_score['is_anomalous'] else 0
            
            traffic_risk = await self._get_traffic_risk(event)
            app_risk = await self._get_app_risk(event.get('app_name', 'unknown'))
            behavioral_risk = await self._get_behavioral_risk(event.get('source_ip', 'unknown'))
            
            # Weighted combination
            final_score = (
                anomaly_risk * self.WEIGHTS['anomaly'] +
                traffic_risk * self.WEIGHTS['traffic'] +
                app_risk * self.WEIGHTS['app_risk'] +
                behavioral_risk * self.WEIGHTS['behavioral']
            )
            
            # Normalize to 0-100
            final_score = min(100, max(0, final_score))
            
            # Determine risk level
            level = self._get_risk_level(final_score)
            
            # Generate reasons
            reasons = self._generate_reasons(
                anomaly_risk, traffic_risk, app_risk, behavioral_risk,
                event, level
            )
            
            return {
                'score': float(final_score),
                'level': level,
                'factors': {
                    'anomaly': float(anomaly_risk),
                    'traffic': float(traffic_risk),
                    'app': float(app_risk),
                    'behavioral': float(behavioral_risk)
                },
                'reasons': reasons,
                'metadata': {
                    'calculation_time': datetime.utcnow().isoformat(),
                    'weights': self.WEIGHTS
                }
            }
            
        except Exception as e:
            logger.error(f"Error calculating risk: {e}")
            return self._null_risk()
    
    async def _get_traffic_risk(self, event: Dict) -> float:
        """Calculate risk from traffic patterns (0-100)"""
        score = 0.0
        
        try:
            # Upload/download ratio
            bytes_sent = event.get('bytes_sent', 0)
            bytes_received = event.get('bytes_received', 1)
            ratio = bytes_sent / max(bytes_received, 1)
            
            if ratio > 20:
                score += 80
            elif ratio > 10:
                score += 60
            elif ratio > 5:
                score += 40
            elif ratio > 1:
                score += 20
            
            # Data volume
            volume_mb = bytes_sent / (1024 * 1024)
            if volume_mb > 5000:  # 5GB
                score += 50
            elif volume_mb > 1000:  # 1GB
                score += 30
            elif volume_mb > 100:  # 100MB
                score += 15
            
            # Packet count anomaly
            packets = event.get('packet_count', 1)
            if packets > 100000:
                score += 30
            elif packets > 10000:
                score += 15
            
            # Suspicious protocols
            protocol = event.get('protocol', 'tcp').lower()
            if protocol in ['raw', 'gre', 'icmp']:
                score += 25
            
            return min(100, score)
            
        except Exception as e:
            logger.debug(f"Error calculating traffic risk: {e}")
            return 0.0
    
    async def _get_app_risk(self, app_name: str) -> float:
        """Get pre-configured app risk level (0-100)"""
        try:
            if not self.db:
                # Default risk for unknown apps
                return 50.0
            
            app = await self.db.apps.find_one({'name': {'$regex': app_name, '$options': 'i'}})
            
            if not app:
                return 50.0  # Unknown = moderate risk
            
            # Check if shadow IT
            if app.get('is_shadow_it'):
                return 85.0
            
            # Check risk level mapping
            risk_map = {
                'CRITICAL': 90,
                'HIGH': 75,
                'MEDIUM': 45,
                'LOW': 20
            }
            
            return float(risk_map.get(app.get('risk_level', 'MEDIUM'), 45))
            
        except Exception as e:
            logger.debug(f"Error getting app risk: {e}")
            return 50.0
    
    async def _get_behavioral_risk(self, source_ip: str) -> float:
        """Calculate risk from user behavior (0-100)"""
        try:
            if not self.db:
                return 20.0
            
            # Get user activity history
            cutoff = datetime.utcnow() - timedelta(days=30)
            user_events = await self.db.events.find({
                'source_ip': source_ip,
                'timestamp': {'$gte': cutoff.isoformat()}
            }).to_list(length=1000)
            
            score = 0.0
            
            if len(user_events) == 0:
                return 30.0  # New user = higher risk
            
            # Off-hours activity
            off_hours_count = 0
            for event in user_events[-50:]:  # Last 50 events
                try:
                    ts = datetime.fromisoformat(event.get('timestamp'))
                    if not (8 <= ts.hour <= 18) and ts.weekday() < 5:
                        off_hours_count += 1
                except:
                    pass
            
            if off_hours_count > 25:
                score += 40
            elif off_hours_count > 10:
                score += 20
            
            # App diversity spike
            apps_accessed = set(e.get('app_name') for e in user_events)
            if len(apps_accessed) > 20:
                score += 30
            elif len(apps_accessed) > 10:
                score += 15
            
            # Activity velocity
            events_per_day = len(user_events) / max(1, 30)
            if events_per_day > 100:
                score += 25
            elif events_per_day > 50:
                score += 15
            
            # New destination patterns
            recent_apps = set(e.get('app_name') for e in user_events[-10:])
            if len(recent_apps) > 5:
                score += 20
            
            return min(100, score)
            
        except Exception as e:
            logger.debug(f"Error calculating behavioral risk: {e}")
            return 0.0
    
    def _get_risk_level(self, score: float) -> str:
        """Convert numeric score to risk level"""
        for level, (min_val, max_val) in self.RISK_LEVELS.items():
            if min_val <= score <= max_val:
                return level
        return 'NORMAL'
    
    def _generate_reasons(
        self, 
        anomaly: float, 
        traffic: float, 
        app: float, 
        behavioral: float,
        event: Dict,
        level: str
    ) -> List[str]:
        """Generate human-readable risk reasons"""
        reasons = []
        
        if anomaly > 60:
            reasons.append("🔴 Anomalous traffic pattern detected")
        
        if traffic > 60:
            volume_mb = event.get('bytes_sent', 0) / (1024**2)
            reasons.append(f"📤 Large data transfer ({volume_mb:.1f}MB)")
        
        if app > 70:
            reasons.append(f"⚠️ High-risk application: {event.get('app_name', 'unknown')}")
        
        if behavioral > 50:
            reasons.append(f"📊 Unusual behavior for {event.get('source_ip', 'unknown')}")
        
        if level == 'CRITICAL':
            reasons.append("🚨 Multiple risk factors detected")
        
        if not reasons:
            reasons.append("✓ Normal network activity")
        
        return reasons
    
    def _null_risk(self) -> Dict:
        """Return default risk response"""
        return {
            'score': 0.0,
            'level': 'NORMAL',
            'factors': {'anomaly': 0, 'traffic': 0, 'app': 0, 'behavioral': 0},
            'reasons': ['Error calculating risk score'],
            'metadata': {}
        }

# Global instance
_risk_engine: Optional[RiskScoringEngine] = None

def get_risk_engine(db=None) -> RiskScoringEngine:
    """Get or create risk scoring engine"""
    global _risk_engine
    if _risk_engine is None:
        _risk_engine = RiskScoringEngine(db)
    return _risk_engine