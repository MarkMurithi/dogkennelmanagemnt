import json
import urllib.request
import urllib.error
import sqlite3
import server

conn = sqlite3.connect(server.DB_PATH)
row = conn.execute("SELECT id, name, email, password, role, active FROM users WHERE LOWER(email)=?", ('admin@bigpaw.com',)).fetchone()
conn.close()
print('db_row', row)
print('verify', server.verify_password(row[3], 'admin123'))

body = json.dumps({'identifier':'admin@bigpaw.com','password':'admin123'}).encode()
req = urllib.request.Request('http://127.0.0.1:8001/api/auth/login', data=body, headers={'Content-Type':'application/json'}, method='POST')
try:
    with urllib.request.urlopen(req, timeout=5) as r:
        print('status', r.status)
        print(r.read().decode())
except urllib.error.HTTPError as e:
    print('status', e.code)
    print(e.read().decode())
