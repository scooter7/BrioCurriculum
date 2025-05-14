// File: components/actionitems/ActionItemForm.js
import React, { useState, useEffect } from 'react';

const formStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};
const formGroupStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};
const labelStyle = {
  fontWeight: '500',
  fontSize: '14px',
  color: 'var(--text-headings)',
};
const buttonGroupStyle = {
  marginTop: '10px',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '10px',
};
const errorTextStyle = {
  color: 'red',
  fontSize: '13px',
  marginTop: '2px',
};

const ActionItemForm = ({ onSubmit, onCancel, isLoading, initialData = {} }) => {
  const [title, setTitle] = useState(initialData.title || '');
  const [status, setStatus] = useState(initialData.status || 'Not Started');
  const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toISOString().split('T')[0];
    } catch (e) { return ''; }
  };
  const [startDate, setStartDate] = useState(formatDateForInput(initialData.startDate));
  const [endDate, setEndDate] = useState(formatDateForInput(initialData.endDate));
  const [error, setError] = useState('');

  useEffect(() => {
    console.log("[ActionItemForm] InitialData received:", initialData);
    setTitle(initialData.title || '');
    setStatus(initialData.status || 'Not Started');
    setStartDate(formatDateForInput(initialData.startDate));
    setEndDate(formatDateForInput(initialData.endDate));
    setError('');
  }, [initialData]);

  const handleSubmit = (event) => {
    event.preventDefault();
    console.log("[ActionItemForm] handleSubmit called.");
    if (!title.trim()) {
      setError("Title is required.");
      console.log("[ActionItemForm] Validation failed: Title is required.");
      return;
    }
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      setError("End date cannot be before the start date.");
      console.log("[ActionItemForm] Validation failed: End date before start date.");
      return;
    }
    setError('');

    const formDataToSubmit = {
      title,
      status,
      startDate: startDate || null,
      endDate: endDate || null,
    };
    console.log("[ActionItemForm] Submitting data:", formDataToSubmit);
    onSubmit(formDataToSubmit);
  };

  const statusOptions = ["Not Started", "In Progress", "Completed"];

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      {error && <p style={errorTextStyle}>{error}</p>}
      <div style={formGroupStyle}>
        <label htmlFor="actionItemTitle" style={labelStyle}>Title:</label>
        <input
          type="text"
          id="actionItemTitle"
          className="input-field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Describe the action item"
          required
        />
      </div>
      <div style={formGroupStyle}>
        <label htmlFor="actionItemStatus" style={labelStyle}>Status:</label>
        <select
          id="actionItemStatus"
          className="input-field"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {statusOptions.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
      <div style={{display: 'flex', gap: '16px', flexWrap: 'wrap'}}>
        <div style={{...formGroupStyle, flex: 1, minWidth: '180px'}}>
            <label htmlFor="actionItemStartDate" style={labelStyle}>Start Date (Optional):</label>
            <input
            type="date"
            id="actionItemStartDate"
            className="input-field"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            />
        </div>
        <div style={{...formGroupStyle, flex: 1, minWidth: '180px'}}>
            <label htmlFor="actionItemEndDate" style={labelStyle}>End Date (Optional):</label>
            <input
            type="date"
            id="actionItemEndDate"
            className="input-field"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            />
        </div>
      </div>
      <div style={buttonGroupStyle}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isLoading}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={isLoading}>
          {isLoading ? 'Saving...' : (initialData.id ? 'Save Changes' : 'Add Action Item')}
        </button>
      </div>
    </form>
  );
};
export default ActionItemForm;
