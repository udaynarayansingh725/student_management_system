import os

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS

from db import get_connection, init_db

load_dotenv()

app = Flask(__name__)
CORS(app)

init_db()


def calculate_grade(marks):
    if marks >= 90:
        return "A"
    elif marks >= 80:
        return "B"
    elif marks >= 70:
        return "C"
    elif marks >= 60:
        return "D"
    else:
        return "F"


# -------------------- HOME PAGE --------------------

@app.route("/")
def home():
    return render_template("index.html")


# -------------------- GET ALL STUDENTS --------------------

@app.route("/api/students", methods=["GET"])
def get_students():
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT roll_number, name, marks, grade FROM students ORDER BY roll_number")
        students = cur.fetchall()
    return jsonify(students)


# -------------------- ADD STUDENT --------------------

@app.route("/api/students", methods=["POST"])
def add_student():
    data = request.get_json()

    if not data:
        return jsonify({"error": "No data received"}), 400

    name = data.get("name", "").strip()
    roll_number = data.get("roll_number", "").strip()
    marks = data.get("marks")

    if not name or not roll_number:
        return jsonify({"error": "Name and Roll Number are required"}), 400

    if not str(marks).lstrip("-").isdigit():
        return jsonify({"error": "Marks must be numeric"}), 400

    marks = int(marks)

    if marks < 0 or marks > 100:
        return jsonify({"error": "Marks should be between 0 and 100"}), 400

    grade = calculate_grade(marks)

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO students (roll_number, name, marks, grade) VALUES (%s, %s, %s, %s)",
                (roll_number, name, marks, grade),
            )
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            return jsonify({"error": "Roll Number already exists"}), 409
        return jsonify({"error": "Database error"}), 500

    return jsonify({
        "name": name,
        "roll_number": roll_number,
        "marks": marks,
        "grade": grade,
    }), 201


# -------------------- SEARCH STUDENT --------------------

@app.route("/api/students/<roll_number>", methods=["GET"])
def search_student(roll_number):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT roll_number, name, marks, grade FROM students WHERE roll_number = %s",
            (roll_number,),
        )
        student = cur.fetchone()

    if student:
        return jsonify(student)

    return jsonify({"error": "Student not found"}), 404


# -------------------- UPDATE MARKS --------------------

@app.route("/api/students/<roll_number>", methods=["PUT"])
def update_marks(roll_number):
    data = request.get_json()

    if not data or not str(data.get("marks", "")).lstrip("-").isdigit():
        return jsonify({"error": "Invalid Marks"}), 400

    marks = int(data.get("marks"))

    if marks < 0 or marks > 100:
        return jsonify({"error": "Marks should be between 0 and 100"}), 400

    grade = calculate_grade(marks)

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE students SET marks = %s, grade = %s WHERE roll_number = %s RETURNING roll_number, name, marks, grade",
            (marks, grade, roll_number),
        )
        student = cur.fetchone()

    if not student:
        return jsonify({"error": "Student not found"}), 404

    return jsonify(student)


# -------------------- DELETE --------------------

@app.route("/api/students/<roll_number>", methods=["DELETE"])
def delete_student(roll_number):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM students WHERE roll_number = %s", (roll_number,))
        deleted = cur.rowcount

    if deleted == 0:
        return jsonify({"error": "Student not found"}), 404

    return jsonify({"message": "Student Deleted Successfully"})


# -------------------- RUN --------------------

if __name__ == "__main__":
    app.run(debug=True)