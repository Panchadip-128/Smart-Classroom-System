"""
CSTPE Attendance Database - Extended Schema
Tracks Accumulated Active Presence with adaptive gap thresholds,
session IDs, environmental validation, and blockchain audit integration.
"""

import sqlite3
import os
import pandas as pd
from datetime import datetime

from policy_engine import policy
from config import is_feature_enabled

DB_FILE = os.path.join(os.path.dirname(__file__), "attendance.db")


def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # Core attendance tracking table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attendance_tracking (
            student_name TEXT PRIMARY KEY,
            first_seen TEXT,
            last_seen TEXT,
            accumulated_seconds INTEGER,
            status TEXT,
            session_id TEXT,
            adaptive_gap_threshold INTEGER DEFAULT 10,
            env_validated INTEGER DEFAULT 1,
            biometric_score REAL DEFAULT 0.0,
            zk_proof_count INTEGER DEFAULT 0
        )
    """)

    # Embedding store table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS embedding_store (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_name TEXT NOT NULL,
            embedding TEXT NOT NULL,
            timestamp TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()


init_db()


def update_attendance(students, metadata=None):
    """
    Called every frame. Updates the Accumulated Active Presence.
    students: list of recognized names.
    metadata: optional dict with per-student extra data (biometric scores, env status, etc.)

    Returns a list of dicts with current student stats.
    """
    now = datetime.now()
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")
    metadata = metadata or {}

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    stats = []

    for student in students:
        if "Unknown" in student or "Possible" in student:
            continue

        student_meta = metadata.get(student, {})
        adaptive_gap = student_meta.get("adaptive_gap", policy.get_int("gap_seconds", 10))
        env_valid = student_meta.get("env_valid", True)
        bio_score = student_meta.get("biometric_score", 0.0)

        cursor.execute(
            "SELECT first_seen, last_seen, accumulated_seconds, status, session_id, "
            "adaptive_gap_threshold, zk_proof_count FROM attendance_tracking WHERE student_name = ?",
            (student,),
        )
        row = cursor.fetchone()

        if row is None:
            # First time seeing this student
            import uuid
            session_id = str(uuid.uuid4())[:8]

            cursor.execute("""
                INSERT INTO attendance_tracking
                (student_name, first_seen, last_seen, accumulated_seconds, status,
                 session_id, adaptive_gap_threshold, env_validated, biometric_score, zk_proof_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (student, now_str, now_str, 0, "In Progress",
                  session_id, adaptive_gap, int(env_valid), bio_score, 0))

            stat_entry = {
                "student": student,
                "accumulated_seconds": 0,
                "status": "In Progress",
                "session_id": session_id,
                "adaptive_gap": adaptive_gap,
                "env_valid": env_valid,
                "biometric_score": bio_score,
            }
            stats.append(stat_entry)

            # Log to blockchain if enabled
            if is_feature_enabled("blockchain_audit"):
                _log_audit("session_start", student, stat_entry)

        else:
            first_seen, last_seen_str, accumulated_seconds, status, session_id, stored_gap, zk_count = row
            last_seen = datetime.strptime(last_seen_str, "%Y-%m-%d %H:%M:%S")

            time_diff = (now - last_seen).total_seconds()

            # Use the adaptive gap threshold (driven by entropy engine)
            effective_gap = adaptive_gap if is_feature_enabled("adaptive_gap_threshold") else policy.get_int("gap_seconds", 10)

            # Environmental gating: only accumulate if environment is valid
            should_accumulate = env_valid or not is_feature_enabled("environmental_gating")

            if time_diff < effective_gap and should_accumulate:
                accumulated_seconds += int(time_diff)
            elif time_diff >= effective_gap:
                # Gap exceeded - check session recovery
                if is_feature_enabled("session_recovery"):
                    import uuid
                    session_id = str(uuid.uuid4())[:8]

            # Check attendance threshold
            threshold_seconds = policy.get_int("threshold_minutes", 40) * 60
            if accumulated_seconds >= threshold_seconds:
                status = "Present"

            cursor.execute("""
                UPDATE attendance_tracking
                SET last_seen = ?, accumulated_seconds = ?, status = ?,
                    session_id = ?, adaptive_gap_threshold = ?,
                    env_validated = ?, biometric_score = ?
                WHERE student_name = ?
            """, (now_str, accumulated_seconds, status,
                  session_id, effective_gap, int(env_valid), bio_score, student))

            stat_entry = {
                "student": student,
                "accumulated_seconds": accumulated_seconds,
                "status": status,
                "session_id": session_id,
                "adaptive_gap": effective_gap,
                "env_valid": env_valid,
                "biometric_score": bio_score,
            }
            stats.append(stat_entry)

            # Log to blockchain
            if is_feature_enabled("blockchain_audit"):
                _log_audit("attendance_update", student, {
                    "accumulated_seconds": accumulated_seconds,
                    "time_diff": time_diff,
                    "status": status,
                })

            # Generate ZK proof for this window
            if is_feature_enabled("zero_knowledge_proofs"):
                _generate_zk_proof(student, last_seen_str, now_str, True)
                cursor.execute(
                    "UPDATE attendance_tracking SET zk_proof_count = ? WHERE student_name = ?",
                    (zk_count + 1, student),
                )

    conn.commit()
    conn.close()

    return stats


def get_all_stats():
    conn = sqlite3.connect(DB_FILE)
    df = pd.read_sql_query("SELECT * FROM attendance_tracking", conn)
    conn.close()
    return df.to_dict(orient="records")


def export_to_excel():
    conn = sqlite3.connect(DB_FILE)
    df = pd.read_sql_query("SELECT * FROM attendance_tracking", conn)
    conn.close()

    excel_file = os.path.join(os.path.dirname(__file__), "attendance_report.xlsx")
    df.to_excel(excel_file, index=False)
    return excel_file


def reset_db():
    """Reset the attendance database for a new session."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM attendance_tracking")
    cursor.execute("DELETE FROM embedding_store")
    conn.commit()
    conn.close()


def _log_audit(event_type, student, data):
    try:
        from audit_blockchain import audit_chain
        audit_chain.append_event(event_type, student, data)
    except Exception as e:
        print(f"Audit log error: {e}")


def _generate_zk_proof(student, window_start, window_end, was_present):
    try:
        from zk_prover import zk_prover
        zk_prover.generate_proof(student, window_start, window_end, was_present)
    except Exception as e:
        print(f"ZK proof error: {e}")