from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles

from face_engine import recognize
from attendance_db import save_attendance

app = FastAPI()
app.mount(
    "/",
    StaticFiles(directory="."),
    name="static"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

class AttendanceRequest(BaseModel):

    image: str

@app.get("/db")
def check_db():

    from face_engine import load_encodings

    return {
        "students":
        list(
            load_encodings().keys()
        )
    }


@app.get("/")
def home():

    return {
        "message":
        "Smart Classroom Backend Running"
    }


@app.post("/recognize")
async def recognize_students(
    request: AttendanceRequest
):

    students = recognize(
        request.image
    )

    return {
        "students":
        students
    }


@app.post("/attendance")
async def attendance(
    request: AttendanceRequest
):

    students = recognize(
        request.image
    )

    save_attendance(
        students
    )

    return {

        "present":
        students,

        "count":
        len(
            students
        )
    }