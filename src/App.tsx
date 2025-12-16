import { useState, useEffect } from 'react';

interface RecordingStateResponse {
  isRecording?: boolean;
  success?: boolean;
  error?: string;
}

function App() {
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    // Check initial recording state
    chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' }, (response: RecordingStateResponse) => {
      if (response && response.isRecording) {
        setIsRecording(true);
      }
    });
  }, []);

  const startRecording = async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab?.id) return;

      chrome.runtime.sendMessage({ type: 'START_RECORDING', tabId: tab.id }, (response: RecordingStateResponse) => {
        if (response?.success) {
          setIsRecording(true);
        } else {
          console.error("Failed to start recording", response?.error);
        }
      });
    } catch (error) {
      console.error("Error starting recording:", error);
    }
  };

  const stopRecording = () => {
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, (response: RecordingStateResponse) => {
      if (response?.success) {
        setIsRecording(false);
      }
    });
  };

  return (
    <div className="w-[300px] h-[400px] bg-slate-900 text-white p-4 flex flex-col items-center justify-center font-sans">
      <h1 className="text-2xl font-bold mb-8 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
        Recordo
      </h1>

      {!isRecording ? (
        <button
          onClick={startRecording}
          className="group relative w-24 h-24 rounded-full bg-red-500 hover:bg-red-600 transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-red-500/50"
        >
          <div className="w-8 h-8 bg-white rounded-full group-hover:scale-110 transition-transform" />
        </button>
      ) : (
        <button
          onClick={stopRecording}
          className="group relative w-24 h-24 rounded-full bg-slate-800 border-2 border-red-500 hover:bg-red-900/20 transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-red-500/20"
        >
          <div className="w-8 h-8 bg-red-500 rounded sm group-hover:scale-90 transition-transform" />
        </button>
      )}

      <p className="mt-8 text-slate-400 font-medium">
        {isRecording ? 'Recording...' : 'Click to Record'}
      </p>
    </div>
  );
}

export default App;
