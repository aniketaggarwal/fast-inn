import React, { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, FileImage, Loader2, CheckCircle, AlertCircle, X, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

const ID_TYPES = [
  { value: 'aadhaar',         label: 'Aadhaar Card',     hint: '12-digit number' },
  { value: 'pan',             label: 'PAN Card',         hint: 'e.g. ABCDE1234F' },
  { value: 'passport',        label: 'Passport',         hint: '8-character number' },
  { value: 'driving_license', label: 'Driving License',  hint: 'e.g. DL-012345678912' },
];

function DropZone({ label, file, onFile, accept = 'image/*,.pdf' }) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
        dragging
          ? 'border-brand-400 bg-brand-500/10'
          : file
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10'
      }`}
    >
      <input
        type="file"
        accept={accept}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
      />
      {file ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CheckCircle size={18} className="text-emerald-400 flex-shrink-0" />
            <div className="text-left">
              <p className="text-sm font-medium text-emerald-400">{file.name}</p>
              <p className="text-xs text-white/40">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
          {file.type.startsWith('image/') && (
            <img src={URL.createObjectURL(file)} alt="preview" className="w-12 h-12 rounded-lg object-cover" />
          )}
        </div>
      ) : (
        <>
          <Upload size={24} className="mx-auto text-white/30 mb-2" />
          <p className="text-sm text-white/60">{label}</p>
          <p className="text-xs text-white/30 mt-1">Drag & drop or click. Max 10MB. JPEG, PNG, PDF.</p>
        </>
      )}
    </div>
  );
}

export default function IDUpload() {
  const queryClient = useQueryClient();
  const [idType, setIdType]     = useState('aadhaar');
  const [idNumber, setIdNumber] = useState('');
  const [frontFile, setFrontFile] = useState(null);
  const [backFile, setBackFile]   = useState(null);
  const [faceFile, setFaceFile]   = useState(null);
  const [ocrResult, setOcrResult] = useState(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!frontFile) throw new Error('ID document (front) is required');
      const fd = new FormData();
      fd.append('id_type',    idType);
      fd.append('id_number',  idNumber);
      fd.append('id_document', frontFile);
      if (backFile) fd.append('id_document_back', backFile);
      if (faceFile) fd.append('face_photo', faceFile);
      const { data } = await api.post('/guests/kyc/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: (data) => {
      setOcrResult(data.data?.ocr);
      toast.success('Documents uploaded! Verification in progress.');
      queryClient.invalidateQueries({ queryKey: ['kyc-status'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || err.message || 'Upload failed'),
  });

  const selectedType = ID_TYPES.find(t => t.value === idType);

  return (
    <div className="card animate-fade-in">
      <h2 className="font-semibold text-lg mb-1 flex items-center gap-2">
        <FileImage size={18} className="text-brand-400" /> Upload Identity Document
      </h2>
      <p className="text-white/60 text-sm mb-6">Select your ID type and upload a clear photo. OCR will auto-extract your details.</p>

      {/* ID Type selector */}
      <div className="mb-5">
        <label className="input-label">Document Type</label>
        <div className="grid grid-cols-2 gap-2">
          {ID_TYPES.map(({ value, label, hint }) => (
            <button
              key={value}
              type="button"
              onClick={() => setIdType(value)}
              className={`p-3 rounded-xl border text-left text-sm transition-all ${
                idType === value
                  ? 'border-brand-500 bg-brand-500/10 text-white'
                  : 'border-white/10 text-white/60 hover:border-white/20 hover:text-white'
              }`}
            >
              <span className="font-medium">{label}</span>
              <span className="block text-xs opacity-60 mt-0.5">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ID Number */}
      <div className="mb-5">
        <label className="input-label">{selectedType?.label} Number</label>
        <input
          className="input"
          placeholder={selectedType?.hint}
          value={idNumber}
          onChange={(e) => setIdNumber(e.target.value)}
        />
      </div>

      {/* File uploads */}
      <div className="space-y-3 mb-5">
        <DropZone label={`${selectedType?.label} — Front Side`} file={frontFile} onFile={setFrontFile} />
        {idType === 'aadhaar' && (
          <DropZone label="Aadhaar — Back Side (optional)" file={backFile} onFile={setBackFile} />
        )}
        <DropZone label="Selfie / Face Photo (optional but recommended)" file={faceFile} onFile={setFaceFile} />
      </div>

      {/* OCR result preview */}
      {ocrResult && (
        <div className="mb-5 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm">
          <p className="font-semibold text-emerald-400 mb-2 flex items-center gap-2">
            <CheckCircle size={14} /> OCR Extraction Result
          </p>
          <div className="grid grid-cols-2 gap-2 text-white/70">
            <span>Extracted name: <strong className="text-white">{ocrResult.extractedName || '—'}</strong></span>
            <span>Confidence: <strong className={ocrResult.confidence > 0.6 ? 'text-emerald-400' : 'text-amber-400'}>
              {Math.round((ocrResult.confidence || 0) * 100)}%
            </strong></span>
          </div>
        </div>
      )}

      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !frontFile || !idNumber}
        className="btn-primary w-full flex items-center justify-center gap-2"
        id="kyc-upload-btn"
      >
        {mutation.isPending
          ? <><Loader2 size={18} className="animate-spin" /> Uploading & Processing OCR...</>
          : <><Upload size={18} /> Submit for Verification</>
        }
      </button>

      {!frontFile && (
        <p className="text-white/40 text-xs text-center mt-2">Upload front-side document to continue</p>
      )}
    </div>
  );
}
