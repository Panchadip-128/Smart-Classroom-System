import csv
import os
from datetime import datetime

FILE = "attendance.csv"

already_marked = set()


def load_existing():

    if not os.path.exists(FILE):

        return

    with open(
        FILE,
        "r"
    ) as f:

        reader = csv.reader(f)

        next(reader, None)

        for row in reader:

            if len(row) >= 1:

                already_marked.add(
                    row[0]
                )


load_existing()


def save_attendance(
    students
):

    exists = os.path.exists(
        FILE
    )

    with open(
        FILE,
        "a",
        newline=""
    ) as f:

        writer = csv.writer(
            f
        )

        if not exists:

            writer.writerow(
                [
                    "Student",
                    "Time"
                ]
            )

        now = datetime.now().strftime(
            "%Y-%m-%d %H:%M:%S"
        )

        for student in students:

            if (
                "Unknown" in student
                or
                "Possible" in student
            ):

                continue

            if student not in already_marked:

                writer.writerow(
                    [
                        student,
                        now
                    ]
                )

                already_marked.add(
                    student
                )

                print(
                    "Attendance saved:",
                    student
                )

            else:

                print(
                    "Already marked:",
                    student
                )