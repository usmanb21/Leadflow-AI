from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import routes
from file_routes import router as file_router
from chat_routes import router as chat_router
from intelligence_routes import router as intelligence_router

app = FastAPI(title="NextGen AI Agent 🤖")

# Allow frontend (React/Vite) to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5175"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)

# Register route files
app.include_router(file_router)
app.include_router(chat_router)
app.include_router(intelligence_router)


@app.get("/")
def home():
    return {"message": "Backend is running successfully 🚀"}
