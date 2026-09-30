import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Header, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import jwt
from db import get_connection, init_db

load_dotenv()

init_db()

app = FastAPI(title="Studently API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = os.getenv("SECRET_KEY", "studently-dev-secret-key-please-change-in-production-1234567890")
ALGORITHM = "HS256"

app.mount("/static", StaticFiles(directory="static"), name="static")


# ============================================================
# HELPERS
# ============================================================

def fetch_all(sql, params=()):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()
    finally:
        conn.close()


def fetch_one(sql, params=()):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone()
    finally:
        conn.close()


def execute(sql, params=()):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.rowcount
    finally:
        conn.close()


def hash_password(password):
    salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()
    return f"{salt}${hashed}"


def verify_password(password, stored):
    salt, hashed = stored.split("$")
    check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()
    return secrets.compare_digest(check, hashed)


def create_token(user_id, role):
    payload = {
        "user_id": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=1),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token):
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None


def get_current_user(authorization: str = Header(default="")):
    token = authorization.replace("Bearer ", "").strip()
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = fetch_one("SELECT id, username, role, full_name FROM users WHERE id = %s", (payload["user_id"],))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_roles(*roles):
    def dependency(user=Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return dependency


def calculate_grade(percentage):
    if percentage >= 90:
        return "A"
    elif percentage >= 80:
        return "B"
    elif percentage >= 70:
        return "C"
    elif percentage >= 60:
        return "D"
    else:
        return "F"


# ============================================================
# HOME
# ============================================================

@app.get("/")
def home():
    return FileResponse("templates/index.html")


# ============================================================
# AUTH
# ============================================================

@app.get("/api/courses/public")
def public_courses():
    return fetch_all("SELECT id, name FROM courses ORDER BY id")


@app.post("/api/auth/register")
def register_student(data: dict):
    """Public self-signup for new students."""
    name = data.get("name", "").strip()
    roll = data.get("roll_number", "").strip()
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not name or not roll:
        raise HTTPException(status_code=400, detail="Name and Roll Number are required")
    if not username:
        raise HTTPException(status_code=400, detail="Choose a login username")
    if len(password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")

    try:
        user_row = fetch_one(
            "INSERT INTO users (username, password_hash, role, full_name) VALUES (%s, %s, 'student', %s) RETURNING id",
            (username, hash_password(password), name),
        )
    except Exception:
        raise HTTPException(status_code=409, detail="Login username already exists")
    try:
        course_id = data.get("course_id")
        course_id = int(course_id) if course_id else None
        semester = data.get("semester")
        semester = int(semester) if semester else 1
        
        row = fetch_one(
            """INSERT INTO students (user_id, roll_number, name, email, phone, course_id, branch, semester)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (user_row["id"], roll, name, data.get("email") or None, data.get("phone") or None,
             course_id, data.get("branch", ""), semester),
        )
    except Exception:
        execute("DELETE FROM users WHERE id = %s", (user_row["id"],))
        raise HTTPException(status_code=409, detail="Roll Number already exists")
    return {"message": "Account created. You can login now.", "username": username, "role": "student"}


@app.post("/api/auth/login")
def login(data: dict):
    username = data.get("username", "").strip()
    password = data.get("password", "")
    user = fetch_one("SELECT * FROM users WHERE username = %s", (username,))
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_token(user["id"], user["role"])
    return {"token": token, "role": user["role"], "full_name": user["full_name"], "username": user["username"]}


@app.get("/api/auth/me")
def me(user=Depends(get_current_user)):
    return user


@app.put("/api/auth/password")
def change_password(data: dict, user=Depends(get_current_user)):
    old = data.get("old_password", "")
    new = data.get("new_password", "")
    stored = fetch_one("SELECT password_hash FROM users WHERE id = %s", (user["id"],))["password_hash"]
    if not verify_password(old, stored):
        raise HTTPException(status_code=400, detail="Old password incorrect")
    if len(new) < 4:
        raise HTTPException(status_code=400, detail="New password too short")
    execute("UPDATE users SET password_hash = %s WHERE id = %s", (hash_password(new), user["id"]))
    return {"message": "Password updated"}


@app.post("/api/auth/forgot")
def forgot_password(data: dict):
    username = data.get("username", "").strip()
    new_password = data.get("new_password", "")
    user = fetch_one("SELECT id FROM users WHERE username = %s", (username,))
    if not user:
        raise HTTPException(status_code=404, detail="Username not found")
    if len(new_password) < 4:
        raise HTTPException(status_code=400, detail="New password too short")
    execute("UPDATE users SET password_hash = %s WHERE id = %s", (hash_password(new_password), user["id"]))
    return {"message": "Password reset. Login with new password."}


# ============================================================
# COURSES
# ============================================================

@app.get("/api/courses")
def list_courses(user=Depends(get_current_user)):
    return fetch_all("SELECT * FROM courses ORDER BY id")


@app.post("/api/courses")
def create_course(data: dict, user=Depends(require_roles("admin"))):
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    code = data.get("code", "").strip() or None
    duration = data.get("duration")
    duration = int(duration) if duration else 6
    row = fetch_one(
        "INSERT INTO courses (name, code, duration_semesters) VALUES (%s, %s, %s) RETURNING id", (name, code, duration)
    )
    return {"id": row["id"], "name": name, "code": code, "duration_semesters": duration}


@app.put("/api/courses/{course_id}")
def update_course(course_id: int, data: dict, user=Depends(require_roles("admin"))):
    duration = data.get("duration")
    duration = int(duration) if duration else 6
    execute(
        "UPDATE courses SET name = %s, code = %s, duration_semesters = %s WHERE id = %s",
        (data.get("name", ""), data.get("code", ""), duration, course_id),
    )
    return {"message": "Course updated"}


@app.delete("/api/courses/{course_id}")
def delete_course(course_id: int, user=Depends(require_roles("admin"))):
    execute("DELETE FROM courses WHERE id = %s", (course_id,))
    return {"message": "Course deleted"}


# ============================================================
# SUBJECTS
# ============================================================

@app.get("/api/subjects")
def list_subjects(user=Depends(get_current_user)):
    return fetch_all(
        """SELECT s.*, c.name AS course_name
           FROM subjects s LEFT JOIN courses c ON s.course_id = c.id
           ORDER BY s.course_id, s.semester, s.id"""
    )


@app.post("/api/subjects")
def create_subject(data: dict, user=Depends(require_roles("admin"))):
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    course_id = data.get("course_id")
    course_id = int(course_id) if course_id else None
    semester = data.get("semester")
    semester = int(semester) if semester else 1
    teacher_id = data.get("teacher_id")
    teacher_id = int(teacher_id) if teacher_id else None
    
    row = fetch_one(
        """INSERT INTO subjects (name, course_id, semester, teacher_id)
           VALUES (%s, %s, %s, %s) RETURNING id""",
        (name, course_id, semester, teacher_id),
    )
    return {"id": row["id"], "name": name}


@app.put("/api/subjects/{subject_id}")
def update_subject(subject_id: int, data: dict, user=Depends(require_roles("admin"))):
    course_id = data.get("course_id")
    course_id = int(course_id) if course_id else None
    semester = data.get("semester")
    semester = int(semester) if semester else 1
    teacher_id = data.get("teacher_id")
    teacher_id = int(teacher_id) if teacher_id else None
    
    execute(
        """UPDATE subjects SET name = %s, course_id = %s, semester = %s, teacher_id = %s WHERE id = %s""",
        (data.get("name", ""), course_id, semester, teacher_id, subject_id),
    )
    return {"message": "Subject updated"}


@app.delete("/api/subjects/{subject_id}")
def delete_subject(subject_id: int, user=Depends(require_roles("admin"))):
    execute("DELETE FROM subjects WHERE id = %s", (subject_id,))
    return {"message": "Subject deleted"}


# ============================================================
# TEACHERS
# ============================================================

@app.get("/api/teachers")
def list_teachers(user=Depends(get_current_user)):
    teachers = fetch_all("SELECT * FROM teachers ORDER BY id")
    for t in teachers:
        t["subjects"] = fetch_all("SELECT id, name FROM subjects WHERE teacher_id = %s", (t["id"],))
    return teachers


@app.post("/api/teachers")
def create_teacher(data: dict, user=Depends(require_roles("admin"))):
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    email = data.get("email", "").strip() or None
    phone = data.get("phone", "").strip() or None
    username = data.get("username", "").strip() or f"teacher{secrets.randbelow(10000)}"
    password = data.get("password", "") or "teacher123"
    try:
        user_row = fetch_one(
            "INSERT INTO users (username, password_hash, role, full_name) VALUES (%s, %s, 'teacher', %s) RETURNING id",
            (username, hash_password(password), name),
        )
    except Exception:
        raise HTTPException(status_code=409, detail="Username already exists")
    row = fetch_one(
        "INSERT INTO teachers (user_id, name, email, phone) VALUES (%s, %s, %s, %s) RETURNING id",
        (user_row["id"], name, email, phone),
    )
    return {"id": row["id"], "name": name, "username": username, "password": password}


@app.put("/api/teachers/{teacher_id}")
def update_teacher(teacher_id: int, data: dict, user=Depends(require_roles("admin"))):
    execute(
        "UPDATE teachers SET name = %s, email = %s, phone = %s WHERE id = %s",
        (data.get("name", ""), data.get("email", ""), data.get("phone", ""), teacher_id),
    )
    return {"message": "Teacher updated"}


@app.delete("/api/teachers/{teacher_id}")
def delete_teacher(teacher_id: int, user=Depends(require_roles("admin"))):
    teacher = fetch_one("SELECT user_id FROM teachers WHERE id = %s", (teacher_id,))
    if teacher and teacher["user_id"]:
        execute("DELETE FROM users WHERE id = %s", (teacher["user_id"],))
    execute("DELETE FROM teachers WHERE id = %s", (teacher_id,))
    return {"message": "Teacher deleted"}


# ============================================================
# STUDENTS
# ============================================================

@app.get("/api/students")
def list_students(user=Depends(get_current_user)):
    return fetch_all(
        """SELECT s.*, c.name AS course_name
           FROM students s LEFT JOIN courses c ON s.course_id = c.id
           ORDER BY s.roll_number"""
    )


@app.get("/api/students/search")
def search_students(q: str = "", branch: str = "", course_id: str = "", semester: str = "", user=Depends(get_current_user)):
    sql = """SELECT s.*, c.name AS course_name FROM students s
             LEFT JOIN courses c ON s.course_id = c.id WHERE 1=1"""
    params = []
    if q.strip():
        sql += " AND (s.name ILIKE %s OR s.roll_number ILIKE %s)"
        params += [f"%{q.strip()}%", f"%{q.strip()}%"]
    if branch.strip():
        sql += " AND s.branch ILIKE %s"
        params.append(f"%{branch.strip()}%")
    if course_id.strip():
        try:
            sql += " AND s.course_id = %s"
            params.append(int(course_id.strip()))
        except ValueError:
            pass
    if semester.strip():
        try:
            sql += " AND s.semester = %s"
            params.append(int(semester.strip()))
        except ValueError:
            pass
    sql += " ORDER BY s.roll_number"
    return fetch_all(sql, params)


@app.post("/api/students")
def create_student(data: dict, user=Depends(require_roles("admin"))):
    name = data.get("name", "").strip()
    roll = data.get("roll_number", "").strip()
    if not name or not roll:
        raise HTTPException(status_code=400, detail="Name and Roll Number required")
    username = data.get("username", "").strip() or roll
    password = data.get("password", "") or "student123"
    try:
        user_row = fetch_one(
            "INSERT INTO users (username, password_hash, role, full_name) VALUES (%s, %s, 'student', %s) RETURNING id",
            (username, hash_password(password), name),
        )
    except Exception:
        raise HTTPException(status_code=409, detail="Login username already exists")
    try:
        course_id = data.get("course_id")
        course_id = int(course_id) if course_id else None
        semester = data.get("semester")
        semester = int(semester) if semester else 1
        
        row = fetch_one(
            """INSERT INTO students (user_id, roll_number, name, email, phone, course_id, branch, semester, profile_photo)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (user_row["id"], roll, name, data.get("email") or None, data.get("phone") or None,
             course_id, data.get("branch", ""), semester, data.get("profile_photo")),
        )
    except Exception:
        execute("DELETE FROM users WHERE id = %s", (user_row["id"],))
        raise HTTPException(status_code=409, detail="Roll Number already exists")
    return {"id": row["id"], "name": name, "roll_number": roll, "username": username, "password": password}


@app.put("/api/students/{student_id}")
def update_student(student_id: int, data: dict, user=Depends(require_roles("admin", "teacher"))):
    course_id = data.get("course_id")
    course_id = int(course_id) if course_id else None
    semester = data.get("semester")
    semester = int(semester) if semester else 1
    
    execute(
        """UPDATE students SET name = %s, email = %s, phone = %s, course_id = %s, branch = %s, semester = %s, profile_photo = %s
           WHERE id = %s""",
        (data.get("name", ""), data.get("email") or None, data.get("phone") or None,
         course_id, data.get("branch", ""), semester, data.get("profile_photo"), student_id),
    )
    return {"message": "Student updated"}


@app.delete("/api/students/{student_id}")
def delete_student(student_id: int, user=Depends(require_roles("admin"))):
    student = fetch_one("SELECT user_id FROM students WHERE id = %s", (student_id,))
    if student and student["user_id"]:
        execute("DELETE FROM users WHERE id = %s", (student["user_id"],))
    execute("DELETE FROM students WHERE id = %s", (student_id,))
    return {"message": "Student deleted"}


# ============================================================
# ATTENDANCE
# ============================================================

@app.get("/api/attendance/students/{student_id}")
def student_attendance(student_id: int, user=Depends(get_current_user)):
    rows = fetch_all(
        """SELECT a.*, s.name AS subject_name FROM attendance a
           JOIN subjects s ON a.subject_id = s.id WHERE a.student_id = %s ORDER BY a.att_date DESC""",
        (student_id,),
    )
    return rows


@app.post("/api/attendance")
def mark_attendance(data: dict, user=Depends(require_roles("admin", "teacher"))):
    try:
        execute(
            """INSERT INTO attendance (student_id, subject_id, att_date, status) VALUES (%s, %s, %s, %s)
               ON CONFLICT (student_id, subject_id, att_date) DO UPDATE SET status = EXCLUDED.status""",
            (data.get("student_id"), data.get("subject_id"), data.get("att_date"), data.get("status")),
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid attendance data")
    return {"message": "Attendance saved"}


@app.get("/api/attendance/report")
def attendance_report(student_id: int = None, subject_id: int = None, user=Depends(get_current_user)):
    where = ["1=1"]
    params = []
    if student_id:
        where.append("a.student_id = %s")
        params.append(student_id)
    if subject_id:
        where.append("a.subject_id = %s")
        params.append(subject_id)
    rows = fetch_all(
        f"""SELECT a.student_id, st.name AS student_name, st.roll_number, a.subject_id, s.name AS subject_name,
                COUNT(*) AS total, COUNT(*) FILTER (WHERE a.status='present') AS present,
                ROUND(100.0 * COUNT(*) FILTER (WHERE a.status='present') / COUNT(*), 1) AS percentage
            FROM attendance a
            JOIN students st ON a.student_id = st.id
            JOIN subjects s ON a.subject_id = s.id
            WHERE {' AND '.join(where)}
            GROUP BY a.student_id, st.name, st.roll_number, a.subject_id, s.name
            ORDER BY st.roll_number""",
        params,
    )
    return rows


# ============================================================
# EXAMS & MARKS
# ============================================================

@app.get("/api/exams")
def list_exams(user=Depends(get_current_user)):
    return fetch_all(
        """SELECT e.*, s.name AS subject_name FROM exams e
           LEFT JOIN subjects s ON e.subject_id = s.id ORDER BY e.exam_date"""
    )


@app.post("/api/exams")
def create_exam(data: dict, user=Depends(require_roles("admin", "teacher"))):
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    subject_id = data.get("subject_id")
    subject_id = int(subject_id) if subject_id else None
    total_marks = data.get("total_marks")
    total_marks = int(total_marks) if total_marks else 100
    exam_date = data.get("exam_date") or None
    
    row = fetch_one(
        """INSERT INTO exams (name, subject_id, exam_date, total_marks) VALUES (%s, %s, %s, %s) RETURNING id""",
        (name, subject_id, exam_date, total_marks),
    )
    return {"id": row["id"], "name": name}


@app.delete("/api/exams/{exam_id}")
def delete_exam(exam_id: int, user=Depends(require_roles("admin"))):
    execute("DELETE FROM exams WHERE id = %s", (exam_id,))
    return {"message": "Exam deleted"}


@app.get("/api/marks/exam/{exam_id}")
def exam_marks(exam_id: int, user=Depends(get_current_user)):
    exam = fetch_one("SELECT * FROM exams WHERE id = %s", (exam_id,))
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    students = fetch_all("SELECT id, roll_number, name FROM students ORDER BY roll_number")
    marks = fetch_all("SELECT * FROM exam_marks WHERE exam_id = %s", (exam_id,))
    mark_map = {m["student_id"]: m for m in marks}
    result = []
    for s in students:
        m = mark_map.get(s["id"])
        internal = m["internal_marks"] if m else 0
        external = m["external_marks"] if m else 0
        result.append({"student_id": s["id"], "roll_number": s["roll_number"], "name": s["name"],
                       "internal": internal, "external": external,
                       "total": internal + external, "recorded": bool(m)})
    return {"exam": exam, "rows": result}


@app.post("/api/marks")
def save_marks(data: dict, user=Depends(require_roles("admin", "teacher"))):
    exam_id = data.get("exam_id")
    rows = data.get("rows", [])
    for r in rows:
        internal = int(r.get("internal", 0) or 0)
        external = int(r.get("external", 0) or 0)
        execute(
            """INSERT INTO exam_marks (exam_id, student_id, internal_marks, external_marks) VALUES (%s, %s, %s, %s)
               ON CONFLICT (exam_id, student_id) DO UPDATE SET internal_marks = EXCLUDED.internal_marks, external_marks = EXCLUDED.external_marks""",
            (exam_id, r.get("student_id"), internal, external),
        )
    return {"message": "Marks saved"}


@app.get("/api/marks/result")
def result_report(user=Depends(get_current_user)):
    rows = fetch_all(
        """SELECT st.id AS student_id, st.roll_number, st.name AS student_name, s.id AS subject_id, s.name AS subject_name,
                COALESCE(SUM(em.internal_marks + em.external_marks), 0) AS subject_total,
                COALESCE(SUM(e.total_marks), 1) AS exam_total
            FROM students st
            CROSS JOIN subjects s
            LEFT JOIN exams e ON e.subject_id = s.id
            LEFT JOIN exam_marks em ON em.exam_id = e.id AND em.student_id = st.id
            GROUP BY st.id, st.roll_number, st.name, s.id, s.name
            ORDER BY st.roll_number, s.id"""
    )
    return rows


# ============================================================
# FEES
# ============================================================

@app.get("/api/fees")
def list_fees(user=Depends(get_current_user)):
    rows = fetch_all(
        """SELECT f.*, st.name AS student_name, st.roll_number, c.name AS course_name
           FROM fees f
           JOIN students st ON f.student_id = st.id
           LEFT JOIN courses c ON st.course_id = c.id
           ORDER BY f.student_id, f.semester"""
    )
    for f in rows:
        f["due_amount"] = f["amount"] if not f["paid"] else 0
    return rows


@app.post("/api/fees")
def create_fee(data: dict, user=Depends(require_roles("admin"))):
    student_id = data.get("student_id")
    student_id = int(student_id) if student_id else None
    semester = data.get("semester")
    semester = int(semester) if semester else 1
    amount = data.get("amount")
    amount = int(amount) if amount else 0
    
    row = fetch_one(
        """INSERT INTO fees (student_id, semester, amount, paid, due_date, paid_on)
           VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
        (student_id, semester, amount,
         data.get("paid", False), data.get("due_date") or None, data.get("paid_on") or None),
    )
    return {"id": row["id"]}


@app.post("/api/fees/pay")
def pay_fee(data: dict, user=Depends(require_roles("admin"))):
    fee_id = data.get("fee_id")
    execute("UPDATE fees SET paid = TRUE, paid_on = CURRENT_DATE WHERE id = %s", (fee_id,))
    return {"message": "Fee marked as paid"}


@app.delete("/api/fees/{fee_id}")
def delete_fee(fee_id: int, user=Depends(require_roles("admin"))):
    execute("DELETE FROM fees WHERE id = %s", (fee_id,))
    return {"message": "Fee deleted"}


# ============================================================
# NOTICES
# ============================================================

@app.get("/api/notices")
def list_notices(user=Depends(get_current_user)):
    return fetch_all("SELECT * FROM notices ORDER BY created_at DESC")


@app.post("/api/notices")
def create_notice(data: dict, user=Depends(require_roles("admin"))):
    title = data.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title required")
    row = fetch_one(
        """INSERT INTO notices (title, body, notice_type, audience) VALUES (%s, %s, %s, %s) RETURNING id""",
        (title, data.get("body", ""), data.get("notice_type", "general"), data.get("audience", "all")),
    )
    return {"id": row["id"], "title": title}


@app.delete("/api/notices/{notice_id}")
def delete_notice(notice_id: int, user=Depends(require_roles("admin"))):
    execute("DELETE FROM notices WHERE id = %s", (notice_id,))
    return {"message": "Notice deleted"}


# ============================================================
# DASHBOARDS
# ============================================================

@app.get("/api/dashboard/admin")
def admin_dashboard(user=Depends(require_roles("admin"))):
    students = fetch_one("SELECT COUNT(*) AS total FROM students")["total"]
    teachers = fetch_one("SELECT COUNT(*) AS total FROM teachers")["total"]
    courses = fetch_one("SELECT COUNT(*) AS total FROM courses")["total"]
    subjects = fetch_one("SELECT COUNT(*) AS total FROM subjects")["total"]
    fees_collected = fetch_one("SELECT COALESCE(SUM(amount),0) AS total FROM fees WHERE paid = TRUE")["total"]
    fees_pending = fetch_one("SELECT COALESCE(SUM(amount),0) AS total FROM fees WHERE paid = FALSE")["total"]
    recent = fetch_all("SELECT id, name, roll_number, created_at FROM students ORDER BY created_at DESC LIMIT 5")
    att_total = fetch_one("SELECT COUNT(*) AS t, COUNT(*) FILTER (WHERE status='present') AS p FROM attendance") or {}
    attendance_rate = round(100.0 * att_total["p"] / att_total["t"], 1) if att_total and att_total["t"] else 0
    return {
        "total_students": students, "total_teachers": teachers,
        "total_courses": courses, "total_subjects": subjects,
        "fees_collected": fees_collected, "fees_pending": fees_pending,
        "attendance_rate": attendance_rate, "recent_students": recent,
    }


@app.get("/api/dashboard/student")
def student_dashboard(user=Depends(require_roles("student"))):
    student = fetch_one("SELECT * FROM students WHERE user_id = %s", (user["id"],))
    if not student:
        raise HTTPException(status_code=404, detail="Profile not found")
    sid = student["id"]
    att = fetch_one(
        "SELECT COUNT(*) AS t, COUNT(*) FILTER (WHERE status='present') AS p FROM attendance WHERE student_id = %s", (sid,)
    )
    attendance_rate = round(100.0 * att["p"] / att["t"], 1) if att["t"] else 0
    total_marks = fetch_one(
        """SELECT COALESCE(SUM(em.internal_marks + em.external_marks),0) AS got, COALESCE(SUM(e.total_marks),1) AS max
           FROM exam_marks em JOIN exams e ON em.exam_id = e.id WHERE em.student_id = %s""", (sid,)
    )
    percentage = round(100.0 * total_marks["got"] / total_marks["max"], 1)
    grade = calculate_grade(percentage)
    fees = fetch_all("SELECT * FROM fees WHERE student_id = %s", (sid,))
    pending_fees = sum(f["amount"] for f in fees if not f["paid"])
    upcoming = fetch_all(
        """SELECT e.*, s.name AS subject_name FROM exams e JOIN subjects s ON e.subject_id = s.id
           WHERE e.exam_date >= CURRENT_DATE ORDER BY e.exam_date LIMIT 5"""
    )
    notices = fetch_all(
        """SELECT * FROM notices WHERE audience IN ('all','student') ORDER BY created_at DESC LIMIT 5"""
    )
    return {
        "student": student,
        "attendance_rate": attendance_rate,
        "percentage": percentage, "grade": grade,
        "pending_fees": pending_fees, "total_fees_due": len(fees),
        "upcoming_exams": upcoming, "notices": notices,
    }


@app.get("/api/dashboard/teacher")
def teacher_dashboard(user=Depends(require_roles("teacher"))):
    teacher = fetch_one("SELECT * FROM teachers WHERE user_id = %s", (user["id"],))
    if not teacher:
        raise HTTPException(status_code=404, detail="Profile not found")
    subjects = fetch_all("SELECT * FROM subjects WHERE teacher_id = %s", (teacher["id"],))
    return {"teacher": teacher, "subjects": subjects}


# ============================================================
# SEED DATA
# ============================================================

def seed():
    admin = fetch_one("SELECT id FROM users WHERE username = 'admin'")
    if not admin:
        fetch_one(
            "INSERT INTO users (username, password_hash, role, full_name) VALUES (%s, %s, 'admin', %s) RETURNING id",
            ("admin", hash_password("admin123"), "Administrator"),
        )
    if fetch_one("SELECT COUNT(*) AS c FROM courses")["c"] == 0:
        fetch_one("INSERT INTO courses (name, code, duration_semesters) VALUES (%s, %s, %s) RETURNING id",
                  ("Bachelor of Technology", "B.TECH", 8))
        course = fetch_one("SELECT id FROM courses ORDER BY id LIMIT 1")
        for i, sub in enumerate(["Mathematics", "Physics", "Chemistry", "Computer Science", "English"], start=1):
            fetch_one("INSERT INTO subjects (name, course_id, semester) VALUES (%s, %s, %s) RETURNING id",
                      (sub, course["id"], ((i - 1) // 3) + 1))


seed()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
