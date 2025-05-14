// File: components/curriculum/UploadCurriculumForm.js
import React, { useState, useEffect } from 'react';

const formStyle = { display: 'flex', flexDirection: 'column', gap: '16px' };
const formGroupStyle = { display: 'flex', flexDirection: 'column', gap: '6px' };
const labelStyle = { fontWeight: '500', fontSize: '14px', color: 'var(--text-headings)' };
const fileInputInfoStyle = { fontSize: '12px', color: 'var(--text-secondary)', marginTop: '5px' };
const errorTextStyle = { color: 'red', fontSize: '13px', marginTop: '5px' };
const buttonGroupStyle = { marginTop: '10px', display: 'flex', justifyContent: 'flex-end', gap: '10px' };

const UploadCurriculumForm = ({ onSubmit, onCancel, isLoading }) => {
  const [name, setName] = useState('');
  const [schoolTag, setSchoolTag] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileNameDisplay, setFileNameDisplay] = useState('');
  const [error, setError] = useState('');

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      console.log("[UploadCurriculumForm] File selected:", file.name, "Type:", file.type, "Size:", file.size, "Is File object:", file instanceof File);
      setSelectedFile(file);
      setFileNameDisplay(file.name);
      setError('');
    } else {
      setSelectedFile(null);
      setFileNameDisplay('');
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Curriculum name is required.");
      return;
    }
    if (!selectedFile) {
      setError("Please select a curriculum file.");
      return;
    }
    setError('');

    const formData = new FormData();
    formData.append('name', name);
    formData.append('schoolTag', schoolTag);
    
    if (selectedFile instanceof File) {
        // The key 'curriculumFile' here MUST match what formidable expects on the backend.
        // The third argument (filename) is optional but good practice.
        formData.append('curriculumFile', selectedFile, selectedFile.name);
    } else {
        console.error("[UploadCurriculumForm] selectedFile is not a valid File object:", selectedFile);
        setError("Invalid file selected. Please try again.");
        return;
    }

    console.log("[UploadCurriculumForm] Submitting FormData. FormData entries:");
    for (let pair of formData.entries()) {
        console.log(`  ${pair[0]}:`, pair[1] instanceof File ? `File - ${pair[1].name}, ${pair[1].size} bytes` : pair[1]);
    }
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      {error && <p style={errorTextStyle}>{error}</p>}
      <div style={formGroupStyle}>
        <label htmlFor="curriculumName" style={labelStyle}>Curriculum Name:</label>
        <input
          type="text"
          id="curriculumName"
          name="name" // Correct for formidable fields
          className="input-field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Oakwood High English 9 Curriculum"
          required
        />
      </div>
      <div style={formGroupStyle}>
        <label htmlFor="schoolTag" style={labelStyle}>School/District Tag (Optional):</label>
        <input
          type="text"
          id="schoolTag"
          name="schoolTag" // Correct for formidable fields
          className="input-field"
          value={schoolTag}
          onChange={(e) => setSchoolTag(e.target.value)}
          placeholder="e.g., Oakwood High School"
        />
      </div>
      <div style={formGroupStyle}>
        <label htmlFor="curriculumFile" style={labelStyle}>Curriculum File:</label>
        <input
          type="file"
          id="curriculumFile"
          name="curriculumFile" // THIS NAME IS CRITICAL for formidable on the backend
          className="input-field"
          onChange={handleFileChange}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
          required
        />
        {fileNameDisplay && <p style={fileInputInfoStyle}>Selected file: {fileNameDisplay}</p>}
      </div>
      <div style={buttonGroupStyle}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isLoading}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={isLoading}>
          {isLoading ? 'Uploading...' : 'Upload Curriculum'}
        </button>
      </div>
    </form>
  );
};
export default UploadCurriculumForm;
