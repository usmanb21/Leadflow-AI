import os
from PyPDF2 import PdfReader

def extract_text_from_pdf(file_path: str) -> str:
    """Extract all text from a PDF file."""
    text = ""
    with open(file_path, "rb") as f:
        reader = PdfReader(f)
        for page in reader.pages:
            text += page.extract_text() or ""
    return text.strip()

def save_memory(text: str, output_path: str = "memory.txt"):
    """Save extracted text to a memory file."""
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(text)
