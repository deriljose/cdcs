# predict_ticket.py
from hybrid_model import HybridPredictor
import joblib
import sys
import json

# Load the hybrid model
hybrid = joblib.load("../suhail/model.pkl")  # Ensure correct path

# Read ticket description from stdin
desc = sys.stdin.read().strip()

cat, prio = hybrid.predict(desc)

# Output as JSON
output = {"category": cat, "priority": prio}
print(json.dumps(output))

