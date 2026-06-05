import os
from fastapi import APIRouter, UploadFile, File
from text_utils import extract_text_from_pdf, save_memory

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload a PDF or DOCX file and extract its text."""
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    
    # Save file
    with open(file_path, "wb") as f:
        f.write(await file.read())

    # Extract text
    text = extract_text_from_pdf(file_path)
    save_memory(text, f"{UPLOAD_DIR}/memory.txt")

    return {
        "filename": file.filename,
        "message": f"{file.filename} uploaded and processed successfully.",
        "summary_preview": text[:300] + "..."
    }
