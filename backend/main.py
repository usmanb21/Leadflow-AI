from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import routes
from file_routes import router as file_router
from chat_routes import router as chat_router

app = FastAPI(title="NextGen AI Agent 🤖")

# Allow frontend (React/Next.js) to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # you can restrict to ["http://localhost:5173"] if you want
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register route files
app.include_router(file_router)
app.include_router(chat_router)

@app.get("/")
def home():
    return {"message": "Backend is running successfully 🚀"}
