import os
import face_recognition
import pickle
import cv2
import numpy as np
import base64


ENCODING_FILE = "encodings.pkl"


def load_encodings():

    if os.path.exists(
        ENCODING_FILE
    ):

        with open(
            ENCODING_FILE,
            "rb"
        ) as f:

            return pickle.load(
                f
            )

    return {}


def save_encodings(
    data
):

    with open(
        ENCODING_FILE,
        "wb"
    ) as f:

        pickle.dump(
            data,
            f
        )


def enroll_student(
    name,
    image_path
):

    image = face_recognition.load_image_file(
        image_path
    )

    faces = face_recognition.face_encodings(
        image,
        num_jitters=20
    )

    if len(
        faces
    ) == 0:

        print(
            "No face:",
            image_path
        )

        return False

    encodings = load_encodings()

    if name not in encodings:

        encodings[
            name
        ] = []

    encodings[
        name
    ].append(
        faces[0]
    )

    save_encodings(
        encodings
    )

    print(
        "Added:",
        name,
        image_path
    )

    return True


def recognize(base64_image):

    db = load_encodings()

    if "," in base64_image:

        base64_image = base64_image.split(
            ","
        )[1]

    image_bytes = base64.b64decode(
        base64_image
    )

    np_array = np.frombuffer(
        image_bytes,
        np.uint8
    )

    image = cv2.imdecode(
        np_array,
        cv2.IMREAD_COLOR
    )

    if image is None:

        return []

    image = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2RGB
    )

    face_locations = face_recognition.face_locations(
        image,
        number_of_times_to_upsample=3,
        model="hog"
    )

    face_encs = face_recognition.face_encodings(
        image,
        face_locations,
        num_jitters=30
    )

    print(
        "Faces found:",
        len(
            face_locations
        )
    )

    detected = []

    unknown_count = 1

    used_students = set()

    for (
        (top,right,bottom,left),
        face
    ) in zip(
        face_locations,
        face_encs
    ):

        all_matches = []

        for student_name, saved_list in db.items():

            distances = face_recognition.face_distance(
                saved_list,
                face
            )

            distance = float(
                np.min(
                    distances
                )
            )

            print(
                student_name,
                distance
            )

            all_matches.append(
                (
                    student_name,
                    distance
                )
            )

        all_matches.sort(
            key=lambda x: x[1]
        )

        print(
            "Sorted Matches:",
            all_matches
        )

        label = ""

        assigned = False

        for student_name, distance in all_matches:

            if (
                distance < 0.52
                and
                student_name not in used_students
            ):

                label = student_name

                detected.append(
                    student_name
                )

                used_students.add(
                    student_name
                )

                assigned = True

                print(
                    "Matched:",
                    student_name
                )

                break

        if not assigned:

            label = (
                "Unknown_"
                +
                str(
                    unknown_count
                )
            )

            detected.append(
                label
            )

            unknown_count += 1

            print(
                "Unknown face"
            )

        cv2.rectangle(
            image,
            (
                left,
                top
            ),
            (
                right,
                bottom
            ),
            (
                0,
                255,
                0
            ),
            2
        )

        cv2.putText(
            image,
            label,
            (
                left,
                top-10
            ),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (
                0,
                255,
                0
            ),
            2
        )

    image = cv2.cvtColor(
        image,
        cv2.COLOR_RGB2BGR
    )

    cv2.imwrite(
        "result.jpg",
        image
    )

    print(
        "Detected final:",
        detected
    )

    return detected