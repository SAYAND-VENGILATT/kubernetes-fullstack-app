import React, { useState, useEffect } from "react";
import "./app.css";

function App() {
  const [progress, setProgress] = useState(60);
  const [steps, setSteps] = useState(100);
  const [calories, setCalories] = useState(100);
  const [water, setWater] = useState(1);
  const [quote, setQuote] = useState("Push harder than yesterday if you want a different tomorrow.");
  
  // Input states
  const [newSteps, setNewSteps] = useState("");
  const [newCalories, setNewCalories] = useState("");
  const [newWater, setNewWater] = useState("");
  
  // History states
  const [history, setHistory] = useState([]);

  // Load data from localStorage on component mount
  useEffect(() => {
    const savedSteps = localStorage.getItem('fitTrackSteps');
    const savedCalories = localStorage.getItem('fitTrackCalories');
    const savedWater = localStorage.getItem('fitTrackWater');
    const savedHistory = localStorage.getItem('fitTrackHistory');
    const savedProgress = localStorage.getItem('fitTrackProgress');

    if (savedSteps) setSteps(parseInt(savedSteps));
    if (savedCalories) setCalories(parseInt(savedCalories));
    if (savedWater) setWater(parseInt(savedWater));
    if (savedProgress) setProgress(parseInt(savedProgress));
    if (savedHistory) setHistory(JSON.parse(savedHistory));
  }, []);

  // Save data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('fitTrackSteps', steps.toString());
    localStorage.setItem('fitTrackCalories', calories.toString());
    localStorage.setItem('fitTrackWater', water.toString());
    localStorage.setItem('fitTrackProgress', progress.toString());
    localStorage.setItem('fitTrackHistory', JSON.stringify(history));
  }, [steps, calories, water, progress, history]);

  const addProgress = () => {
    setProgress((p) => (p >= 100 ? 0 : p + 10));
  };

  const addSteps = () => {
    if (newSteps && !isNaN(newSteps) && parseInt(newSteps) > 0) {
      const stepsToAdd = parseInt(newSteps);
      setSteps(prev => prev + stepsToAdd);
      
      // Add to history
      const newEntry = {
        id: Date.now(),
        type: 'steps',
        value: stepsToAdd,
        date: new Date().toLocaleString(),
        total: steps + stepsToAdd
      };
      setHistory(prev => [newEntry, ...prev.slice(0, 9)]); // Keep only last 10 entries
      setNewSteps("");
    }
  };

  const addCalories = () => {
    if (newCalories && !isNaN(newCalories) && parseInt(newCalories) > 0) {
      const caloriesToAdd = parseInt(newCalories);
      setCalories(prev => prev + caloriesToAdd);
      
      // Add to history
      const newEntry = {
        id: Date.now(),
        type: 'calories',
        value: caloriesToAdd,
        date: new Date().toLocaleString(),
        total: calories + caloriesToAdd
      };
      setHistory(prev => [newEntry, ...prev.slice(0, 9)]);
      setNewCalories("");
    }
  };

  const addWater = () => {
    if (newWater && !isNaN(newWater) && parseInt(newWater) > 0) {
      const waterToAdd = parseInt(newWater);
      setWater(prev => prev + waterToAdd);
      
      // Add to history
      const newEntry = {
        id: Date.now(),
        type: 'water',
        value: waterToAdd,
        date: new Date().toLocaleString(),
        total: water + waterToAdd
      };
      setHistory(prev => [newEntry, ...prev.slice(0, 9)]);
      setNewWater("");
    }
  };

  const resetDay = () => {
    if (window.confirm("Are you sure you want to reset today's data?")) {
      setSteps(0);
      setCalories(0);
      setWater(0);
      setProgress(0);
      setHistory([]);
    }
  };

  const deleteHistoryItem = (id) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const getHistoryIcon = (type) => {
    switch (type) {
      case 'steps': return '👣';
      case 'calories': return '🔥';
      case 'water': return '💧';
      default: return '📝';
    }
  };

  const getHistoryColor = (type) => {
    switch (type) {
      case 'steps': return '#00ff99';
      case 'calories': return '#0099ff';
      case 'water': return '#9966ff';
      default: return '#00ffcc';
    }
  };

  return (
    <div className="dashboard">
      <header className="header">
        <h1>🏋️‍♂️ FitTrack Pro</h1>
        <p>Your daily fitness companion</p>
      </header>

      <section className="stats-section">
        <div className="stat-card neon-green" onClick={() => setNewSteps("1000")}>
          <h2>{steps.toLocaleString()}</h2>
          <p>Steps Today</p>
        </div>
        <div className="stat-card neon-blue" onClick={() => setNewCalories("100")}>
          <h2>{calories}</h2>
          <p>Calories Burned</p>
        </div>
        <div className="stat-card neon-purple" onClick={() => setNewWater("1")}>
          <h2>{water}</h2>
          <p>Water (cups)</p>
        </div>
      </section>

      <section className="progress-section">
        <h3>Weekly Progress</h3>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
        </div>
        <p>{progress}% completed</p>
        <button onClick={addProgress} className="btn">Add Progress +10%</button>
      </section>

      <section className="input-section">
        <h3 style={{ color: '#00ffcc', marginBottom: '20px' }}>Add New Entry</h3>
        
        <div className="input-group">
          <label>Steps</label>
          <input
            type="number"
            placeholder="Enter steps taken..."
            value={newSteps}
            onChange={(e) => setNewSteps(e.target.value)}
          />
          <button onClick={addSteps} className="btn" style={{ marginTop: '10px' }}>
            Add Steps
          </button>
        </div>

        <div className="input-group">
          <label>Calories Burned</label>
          <input
            type="number"
            placeholder="Enter calories burned..."
            value={newCalories}
            onChange={(e) => setNewCalories(e.target.value)}
          />
          <button onClick={addCalories} className="btn btn-secondary" style={{ marginTop: '10px' }}>
            Add Calories
          </button>
        </div>

        <div className="input-group">
          <label>Water Intake (cups)</label>
          <input
            type="number"
            placeholder="Enter cups of water..."
            value={newWater}
            onChange={(e) => setNewWater(e.target.value)}
          />
          <button onClick={addWater} className="btn" style={{ marginTop: '10px' }}>
            Add Water
          </button>
        </div>
      </section>

      {history.length > 0 && (
        <section className="history-section">
          <h3>Recent Activity</h3>
          {history.map((item) => (
            <div 
              key={item.id} 
              className={`history-item ${item.type}`}
              style={{ borderLeftColor: getHistoryColor(item.type) }}
            >
              <div className="history-info">
                <span style={{ marginRight: '8px' }}>{getHistoryIcon(item.type)}</span>
                <span className="history-value">+{item.value} {item.type}</span>
                <div className="history-date">{item.date}</div>
              </div>
              <div className="history-actions">
                <button 
                  className="delete-btn"
                  onClick={() => deleteHistoryItem(item.id)}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <button onClick={resetDay} className="btn btn-danger">
        Reset Day
      </button>

      <section className="quote-section">
        <blockquote>{quote}</blockquote>
      </section>

      <footer className="footer">© 2025 FitTrack Pro | Stay Fit. Stay Strong.</footer>
    </div>
  );
}

export default App;