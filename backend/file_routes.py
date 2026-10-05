from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

router = APIRouter()
UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


def _safe(name: str) -> Path:
    dest = (UPLOAD_DIR / Path(name).name).resolve()
    if dest.parent != UPLOAD_DIR.resolve():
        raise HTTPException(status_code=400, detail="Invalid name")
    return dest


def _extract_text(path: Path) -> str:
    name = path.name.lower()
    data = path.read_bytes()
    if name.endswith(".txt"):
        return data.decode("utf-8", errors="ignore")
    if name.endswith(".pdf"):
        try:
            import io
            from pypdf import PdfReader
            return "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(data)).pages)
        except Exception:
            return ""
    if name.endswith(".docx"):
        try:
            import docx
            return "\n".join(p.text for p in docx.Document(str(path)).paragraphs)
        except Exception:
            return ""
    return ""


def latest_doc_text() -> str:
    files = [p for p in UPLOAD_DIR.iterdir() if p.is_file() and not p.name.startswith(".")]
    if not files:
        return ""
    newest = max(files, key=lambda p: p.stat().st_mtime)
    text = _extract_text(newest).strip()
    if not text:
        return ""
    return f"UPLOADED FILE ({newest.name}):\n{text[:8000]}"


@router.post("/upload")
async def api_upload(file: UploadFile = File(...)):
    dest = _safe(file.filename or "upload.bin")
    dest.write_bytes(await file.read())
    return {"filename": dest.name, "path": str(dest), "chars": len(_extract_text(dest))}


@router.get("/uploads")
def api_list_uploads():
    rows = []
    for p in sorted(UPLOAD_DIR.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        if p.is_file() and not p.name.startswith("."):
            rows.append({"filename": p.name, "bytes": p.stat().st_size})
    return {"files": rows}


@router.get("/uploads/{filename}")
def api_open_upload(filename: str):
    dest = _safe(filename)
    if not dest.exists():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(dest, filename=dest.name)