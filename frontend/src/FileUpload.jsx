import React, { useState } from "react";

function FileUpload() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setPreview(""); // reset preview
  };

  const handleUpload = async () => {
    if (!file) return alert("Please select a file first!");
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://127.0.0.1:8000/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setPreview(data.preview || "No text found in this file.");
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Upload failed!");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#1e1e1e",
        padding: "20px",
        borderRadius: "10px",
        width: "400px",
        textAlign: "center",
        marginBottom: "20px",
        color: "white",
      }}
    >
      <h3>📂 Upload a File</h3>
      <input
        type="file"
        accept=".pdf"
        onChange={handleFileChange}
        style={{ marginBottom: "10px" }}
      />
      <br />
      <button
        onClick={handleUpload}
        disabled={uploading}
        style={{
          backgroundColor: uploading ? "#555" : "#007bff",
          color: "white",
          border: "none",
          borderRadius: "5px",
          padding: "8px 16px",
          cursor: uploading ? "not-allowed" : "pointer",
        }}
      >
        {uploading ? "Uploading..." : "Upload PDF"}
      </button>

      {preview && (
        <div
          style={{
            backgroundColor: "#121212",
            border: "1px solid #333",
            marginTop: "15px",
            padding: "10px",
            borderRadius: "8px",
            textAlign: "left",
            height: "150px",
            overflowY: "auto",
            fontSize: "0.9em",
            color: "#ddd",
          }}
        >
          <strong>📄 Text Preview:</strong>
          <p>{preview}</p>
        </div>
      )}
    </div>
  );
}

export default FileUpload;