import requests
try:
    response = requests.post("http://127.0.0.1:8000/api/auth/token", data={"username": "admin@soc.local", "password": "admin123"})
    print("STATUS:", response.status_code)
    print("BODY:", response.text)
except Exception as e:
    print("ERROR:", str(e))
