import React, { useState } from "react";

function App() {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState("");
  const [file, setFile] = useState(null);

  // Send message to backend
  const sendMessage = async () => {
    if (!userInput.trim()) return;

    setMessages((prev) => [...prev, { sender: "user", text: userInput }]);

    try {
      const response = await fetch("http://127.0.0.1:8000/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: userInput }),
      });

      const data = await response.json();
      setMessages((prev) => [...prev, { sender: "bot", text: data.response }]);
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: "⚠️ Could not connect to backend." },
      ]);
    }

    setUserInput("");
  };

  // Handle Enter key
  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  };

  // Handle file upload
  const handleFileUpload = async () => {
    if (!file) return alert("Please choose a file first!");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://127.0.0.1:8000/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      alert("✅ File uploaded successfully!");
      console.log("Upload response:", data);
    } catch (error) {
      console.error("Upload error:", error);
      alert("⚠️ Upload failed.");
    }
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
      <h1 className="text-2xl font-bold mb-4">NextGen AI Agent 🤖</h1>

      {/* File Upload Section */}
      <div className="mb-4 flex items-center space-x-2">
        <input
          type="file"
          accept=".pdf,.docx"
          onChange={(e) => setFile(e.target.files[0])}
          className="text-white"
        />
        <button
          onClick={handleFileUpload}
          className="bg-blue-500 px-4 py-1 rounded-lg hover:bg-blue-600"
        >
          Upload PDF/DOCX
        </button>
      </div>

      {/* Chat Section */}
      <div className="w-full max-w-md bg-gray-800 rounded-lg p-4 overflow-y-auto mb-4" style={{ height: "400px" }}>
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`my-2 p-2 rounded-lg ${
              msg.sender === "user" ? "bg-blue-600 ml-auto" : "bg-gray-700 mr-auto"
            } w-fit max-w-[75%]`}
          >
            {msg.text}
          </div>
        ))}
      </div>

      {/* Input Section */}
      <div className="flex w-full max-w-md">
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyPress}
          className="flex-grow p-2 rounded-l-lg text-black"
          placeholder="Type your message..."
        />
        <button
          onClick={sendMessage}
          className="bg-blue-500 px-4 rounded-r-lg hover:bg-blue-600"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default App;