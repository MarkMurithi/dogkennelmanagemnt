import json
import os
import tempfile
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import server

with tempfile.TemporaryDirectory() as td:
    db_path = os.path.join(td, 'test.db')
    server.DB_PATH = db_path
    server.init_db()
    httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.KennelHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    base = f'http://127.0.0.1:{httpd.server_port}'

    def request_json(path, payload=None, method='POST', token=None):
        data = None if payload is None else json.dumps(payload).encode('utf-8')
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=3) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as exc:
            return json.loads(exc.read().decode('utf-8'))

    admin_login = request_json('/api/auth/login', {'identifier': 'admin@bigpaw.com', 'password': 'admin123'})
    assert admin_login.get('ok'), admin_login
    admin_token = admin_login['token']

    create_staff = request_json('/api/users', {'name': 'Staff User', 'email': 'staff7@example.com', 'password': 'staffpass', 'role': 'staff', 'active': True}, token=admin_token)
    assert create_staff.get('ok'), create_staff

    staff_login = request_json('/api/auth/login', {'identifier': 'staff7@example.com', 'password': 'staffpass'})
    assert staff_login.get('ok'), staff_login
    staff_token = staff_login['token']

    pending_result = request_json('/api/dogs', {'name': 'Rex', 'breed': 'Labrador', 'gender': 'Male'}, token=staff_token)
    assert pending_result.get('pending') is True, pending_result

    dogs_result = request_json('/api/dogs', token=admin_token, method='GET')
    assert dogs_result == [], dogs_result

    approvals_result = request_json('/api/pending-approvals', token=admin_token, method='GET')
    assert approvals_result.get('ok') is True, approvals_result
    approval_id = approvals_result['items'][0]['id']

    approve_result = request_json(f'/api/pending-approvals/{approval_id}/approve', token=admin_token)
    assert approve_result.get('ok') is True, approve_result

    approved_dogs = request_json('/api/dogs', token=admin_token, method='GET')
    assert len(approved_dogs) == 1 and approved_dogs[0]['name'] == 'Rex', approved_dogs

    print('approval flow verified')

    httpd.shutdown()
    httpd.server_close()
    thread.join(timeout=2)
