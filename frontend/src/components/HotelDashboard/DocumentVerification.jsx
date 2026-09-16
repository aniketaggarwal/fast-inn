import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Eye, Loader2, FileImage, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

export default function DocumentVerification() {
  const queryClient = useQueryClient();
  const [selectedKyc, setSelectedKyc] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['kyc-queue'],
    queryFn:  () => api.get('/guests/kyc?status=pending&limit=30').then(r => r.data),
    refetchInterval: 60000,
  });

  const verifyMutation = useMutation({
    mutationFn: (id) => api.patch(`/guests/kyc/${id}/verify`),
    onSuccess: () => {
      toast.success('KYC approved! Guest notified.');
      setSelectedKyc(null);
      queryClient.invalidateQueries({ queryKey: ['kyc-queue'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Approval failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => api.patch(`/guests/kyc/${id}/reject`, { rejection_reason: reason }),
    onSuccess: () => {
      toast.success('KYC rejected. Guest notified to re-upload.');
      setSelectedKyc(null); setShowRejectInput(false); setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['kyc-queue'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Rejection failed'),
  });

  const kycs = data?.data || [];

  return (
    <div className="grid lg:grid-cols-3 gap-6 animate-fade-in">
      {/* Left: KYC queue list */}
      <div className="card lg:col-span-1">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <FileImage size={16} className="text-brand-400" />
          Pending KYC ({data?.meta?.total || 0})
        </h3>
        {isLoading && [...Array(4)].map((_, i) => (
          <div key={i} className="h-14 bg-white/10 rounded-xl mb-2 animate-pulse" />
        ))}
        {!isLoading && kycs.length === 0 && (
          <div className="text-center py-8">
            <CheckCircle size={32} className="mx-auto text-emerald-500 mb-2" />
            <p className="text-white/60 text-sm">All caught up!</p>
          </div>
        )}
        <div className="space-y-2 max-h-[500px] overflow-y-auto no-scrollbar">
          {kycs.map(k => (
            <button
              key={k.id}
              onClick={() => { setSelectedKyc(k); setShowRejectInput(false); }}
              className={`w-full p-3 rounded-xl text-left transition-all flex items-center justify-between ${
                selectedKyc?.id === k.id
                  ? 'bg-brand-500/10 border border-brand-500/20'
                  : 'bg-white/5 hover:bg-white/10 border border-transparent'
              }`}
            >
              <div>
                <p className="font-medium text-sm">{k.full_name}</p>
                <p className="text-white/40 text-xs capitalize">{k.id_type?.replace('_', ' ')} · {Math.round((k.ocr_confidence_score || 0) * 100)}% confidence</p>
              </div>
              <ChevronRight size={14} className="text-white/30" />
            </button>
          ))}
        </div>
      </div>

      {/* Right: Document detail view */}
      <div className="lg:col-span-2">
        {!selectedKyc ? (
          <div className="card h-full flex items-center justify-center">
            <div className="text-center text-white/40">
              <Eye size={40} className="mx-auto mb-3 opacity-30" />
              <p>Select a KYC record to review</p>
            </div>
          </div>
        ) : (
          <div className="card animate-slide-up">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold text-lg">{selectedKyc.full_name}</h3>
                <p className="text-white/60 text-sm">{selectedKyc.email} · {selectedKyc.phone}</p>
              </div>
              <span className="badge badge-pending">Pending Review</span>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-6">
              {/* Document image */}
              <div>
                <p className="input-label mb-2">ID Document</p>
                {selectedKyc.id_document_url ? (
                  <a href={selectedKyc.id_document_url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={selectedKyc.id_document_url}
                      alt="ID Document"
                      className="w-full h-48 object-cover rounded-xl border border-white/10 hover:border-brand-500/50 transition-colors cursor-zoom-in"
                    />
                  </a>
                ) : (
                  <div className="h-48 bg-white/5 rounded-xl flex items-center justify-center text-white/30">
                    <FileImage size={32} />
                  </div>
                )}
              </div>

              {/* Extracted data */}
              <div>
                <p className="input-label mb-2">OCR Extracted Data</p>
                <div className="space-y-2">
                  {[
                    { label: 'ID Type',    value: selectedKyc.id_type?.replace('_', ' ') },
                    { label: 'ID Number',  value: selectedKyc.id_number },
                    { label: 'OCR Name',   value: selectedKyc.extracted_name },
                    { label: 'OCR DOB',    value: selectedKyc.extracted_dob },
                    { label: 'OCR Address', value: selectedKyc.extracted_address },
                    { label: 'Confidence', value: selectedKyc.ocr_confidence_score ? `${Math.round(selectedKyc.ocr_confidence_score * 100)}%` : null },
                  ].map(({ label, value }) => value ? (
                    <div key={label} className="flex items-start gap-2 text-sm">
                      <span className="text-white/40 w-24 flex-shrink-0">{label}:</span>
                      <span className="font-medium capitalize">{value}</span>
                    </div>
                  ) : null)}
                </div>
              </div>
            </div>

            {/* Face photo */}
            {selectedKyc.face_photo_url && (
              <div className="mb-6">
                <p className="input-label mb-2">Selfie / Face Photo</p>
                <img src={selectedKyc.face_photo_url} alt="Face" className="w-24 h-24 rounded-full object-cover border-2 border-brand-500/30" />
              </div>
            )}

            {/* Actions */}
            <div className="divider" />
            {showRejectInput ? (
              <div className="space-y-3">
                <div>
                  <label className="input-label">Rejection Reason</label>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="e.g. Document is blurry, ID number not visible..."
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => rejectMutation.mutate({ id: selectedKyc.id, reason: rejectReason })}
                    disabled={!rejectReason.trim() || rejectMutation.isPending}
                    className="btn-danger flex items-center gap-2 flex-1"
                  >
                    {rejectMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                    Confirm Rejection
                  </button>
                  <button onClick={() => setShowRejectInput(false)} className="btn-secondary">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={() => verifyMutation.mutate(selectedKyc.id)}
                  disabled={verifyMutation.isPending}
                  className="btn-primary flex items-center gap-2 flex-1"
                >
                  {verifyMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  Approve KYC
                </button>
                <button onClick={() => setShowRejectInput(true)} className="btn-danger flex items-center gap-2 flex-1">
                  <XCircle size={16} /> Reject
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
