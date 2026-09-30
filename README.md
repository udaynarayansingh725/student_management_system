# Student Management System

A robust and comprehensive Student Management System built with **FastAPI** and **PostgreSQL**. It provides a full-featured backend API and frontend interface for managing the entire lifecycle of a student's academic journey, including courses, attendance, exams, marks, and fees.

## Features

* **Role-Based Access Control (RBAC):** Distinct dashboards and permissions for **Admins**, **Teachers**, and **Students**.
* **Academic Management:** Create and manage Courses and Subjects.
* **User Management:** Onboard teachers and students. Students can also self-register.
* **Attendance Tracking:** Mark daily attendance and generate percentage reports.
* **Examinations & Marks:** Schedule exams and record internal/external marks. Calculates overall grades.
* **Fee Management:** Track total fees, paid amounts, and pending dues for students.
* **Notice Board:** Broadcast announcements to specific audiences (All, Students, Teachers).
* **Secure Authentication:** JWT-based authentication with secure password hashing (PBKDF2-HMAC).

## Tech Stack

* **Backend:** Python 3.13+, FastAPI, Uvicorn
* **Database:** PostgreSQL (using `psycopg2` driver)
* **Authentication:** PyJWT
* **Configuration:** `python-dotenv`

## Prerequisites

* Python 3.13 or higher
* PostgreSQL database server

## Installation and Setup

1. **Clone the repository** (if not already downloaded) and navigate to the folder:
   ```bash
   cd "student management system"
   ```

2. **Install dependencies:**
   It is recommended to use a virtual environment.
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables:**
   Rename `.env.example` to `.env` (or copy it):
   ```bash
   cp .env.example .env
   ```
   Edit the `.env` file to include your PostgreSQL connection string and a secure secret key:
   ```env
   DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST/DB_NAME?sslmode=require
   SECRET_KEY=your_secure_random_secret_key
   ```

4. **Run the Application:**
   The application will automatically initialize the database schema (`schema.sql`) on its first run.
   ```bash
   uvicorn app:app --reload
   ```
   *(Alternatively, you can run `python app.py` directly)*

5. **Access the App:**
   Open your browser and navigate to: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)

## Default Admin Credentials

Upon the first startup, a default admin account is automatically seeded into the database:
* **Username:** `admin`
* **Password:** `admin123`

*(Note: Please change this password immediately after your first login from the dashboard.)*

## Project Structure

* `app.py`: The main FastAPI application, containing all API routes and business logic.
* `db.py`: Database connection manager and initialization utilities.
* `schema.sql`: Idempotent PostgreSQL schema definitions.
* `requirements.txt`: Python package dependencies.
* `templates/`: Contains the frontend HTML files (e.g., `index.html`).
* `static/`: Contains frontend static assets (CSS, JavaScript, images).
